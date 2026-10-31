import { haversineDistance } from "@/lib/geo";
import { cacheGet, cacheSet } from "@/lib/cache";
import type { ScoreResponse } from "@/lib/types";
import { getCategory, CATEGORIES, type Category } from "@/lib/categories";

import {
  calculateQuantityScore,
  calculateDistanceScore,
  calculateDistanceAverage,
  calculateCategoryScore,
  calculateOverallScore,
} from "@/lib/scoring";

import {
  buildOverpassQuery,
  OverpassElement,
} from "@/lib/overpass";

import {
  LIMITS,
  getClientIp,
  rateLimit,
  releaseUpstream,
  tooManyRequests,
  tryAcquireUpstream,
} from "@/lib/rate-limit";

// Define por quanto tempo (em segundos) um resultado pode permanecer no cache.
// Pode ser alterado por SCORE_CACHE_TTL_SECONDS (ex.: 86400 nos testes, para
// consultar a Overpass uma vez por local).
const CACHE_TTL_SECONDS =
  Number(process.env.SCORE_CACHE_TTL_SECONDS) > 0
    ? Math.floor(Number(process.env.SCORE_CACHE_TTL_SECONDS))
    : 5 * 60;

// Limites aceitos para o raio de busca (em metros).
const MIN_RADIUS = 100;
const MAX_RADIUS = 2000;

// Lê um parâmetro numérico. Parâmetro ausente ou vazio vira NaN
// (Number(null) seria 0 e aceitaria a coordenada 0,0 sem querer).
function readNumber(
  searchParams: URLSearchParams,
  name: string
): number {
  const value = searchParams.get(name);

  if (value === null || value.trim() === "") {
    return NaN;
  }

  return Number(value);
}

// Arredonda para 5 casas decimais (~1 m). Evita chaves de cache
// praticamente iguais e limita a variedade de consultas.
function round5(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

// Consulta a API de pontuação para as coordenadas fornecidas.
export async function GET(request: Request) {
  // Limite por IP: protege a rota contra excesso de requisições.
  const ipLimit = rateLimit(
    `score:ip:${getClientIp(request)}`,
    LIMITS.score.perIp,
    LIMITS.score.windowMs
  );

  if (!ipLimit.allowed) {
    return tooManyRequests(
      "Muitas consultas em pouco tempo. Aguarde alguns segundos e tente novamente.",
      ipLimit.retryAfterSeconds,
      ipLimit.limit
    );
  }

  const { searchParams } = new URL(request.url);

  const rawLatitude = readNumber(searchParams, "lat");
  const rawLongitude = readNumber(searchParams, "lon");

  const radius = searchParams.has("radius")
    ? Math.round(readNumber(searchParams, "radius"))
    : 1000;

  if (
    !Number.isFinite(rawLatitude) ||
    !Number.isFinite(rawLongitude) ||
    !Number.isFinite(radius) ||
    rawLatitude < -90 ||
    rawLatitude > 90 ||
    rawLongitude < -180 ||
    rawLongitude > 180 ||
    radius < MIN_RADIUS ||
    radius > MAX_RADIUS
  ) {
    return Response.json(
      {
        error: "Parâmetros inválidos.",
      },
      { status: 400 }
    );
  }

  const latitude = round5(rawLatitude);
  const longitude = round5(rawLongitude);

  // Cria uma chave usando as coordenadas e o raio da consulta.
  const cacheKey = `${latitude}:${longitude}:${radius}`;

  // Procura um resultado armazenado (Redis, com fallback em memória).
  const cached = await cacheGet<ScoreResponse>(cacheKey);

  if (cached) {
    // Retorna o resultado armazenado sem consultar a Overpass.
    return Response.json(cached.data, {
      headers: {
        "X-Cache": "HIT",
        "X-Cache-Source": cached.source,
      },
    });
  }

  // A Overpass utiliza metros.
  // O cálculo da distância utiliza quilômetros.
  const radiusKm = radius / 1000;

  const query = buildOverpassQuery(
    latitude,
    longitude,
    radius
  );

  // Limite global das consultas à Overpass (somando todos os clientes).
  const upstreamLimit = rateLimit(
    "score:upstream:global",
    LIMITS.score.upstreamGlobalPerMin,
    60_000
  );

  if (!upstreamLimit.allowed) {
    return tooManyRequests(
      "O servidor está com muitas consultas no momento. Tente novamente em instantes.",
      upstreamLimit.retryAfterSeconds
    );
  }

  // Limite de consultas simultâneas à Overpass.
  if (!tryAcquireUpstream(LIMITS.score.maxConcurrent)) {
    return tooManyRequests(
      "O servidor está com muitas consultas no momento. Tente novamente em instantes.",
      5
    );
  }

  // Resultado retornado pela Overpass.
  let elements: OverpassElement[] | null = null;

  try {
        // Servidores Overpass utilizados como fallback.
        // A lista pode ser trocada por OVERPASS_SERVERS (URLs separadas por vírgula).
    const OVERPASS_SERVERS = process.env.OVERPASS_SERVERS
      ? process.env.OVERPASS_SERVERS.split(",")
          .map((server) => server.trim())
          .filter(Boolean)
      : [
          "https://overpass-api.de/api/interpreter",
          "https://overpass.kumi.systems/api/interpreter",
          "https://overpass.private.coffee/api/interpreter",
          "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
        ];

    // Quantas vezes a lista inteira de servidores será percorrida.
    const MAX_ROUNDS = 3;

    let lastError = "";

    // Consulta rejeitada como inválida (HTTP 400): repetir não adianta.
    let queryRejected = false;

    for (
      let round = 1;
      round <= MAX_ROUNDS && elements === null && !queryRejected;
      round++
    ) {
      // A partir da segunda rodada, espera antes de tentar de novo (3s, 6s...).
      if (round > 1) {
        const waitMs = 3000 * 2 ** (round - 2);

        console.log(
          `Aguardando ${waitMs / 1000}s antes da rodada ${round}...`
        );

        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      for (const server of OVERPASS_SERVERS) {
        try {
          console.log(`Consultando Overpass (rodada ${round}): ${server}`);

          const response = await fetch(server, {
            method: "POST",

            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": "MyVicinity/2.0 (projeto acadêmico)",
            },

            body: new URLSearchParams({
              data: query,
            }),

            // Limita o tempo de espera deste servidor a 20 segundos.
            signal: AbortSignal.timeout(75000),
          });

          if (!response.ok) {
            // Registra só o status, sem despejar o HTML de erro no log.
            lastError = `Overpass respondeu com status ${response.status}`;

                        console.error(`${server}: ${lastError}`);

            if (response.status === 400) {
              queryRejected = true;

              break;
            }

            continue;
          }

          const data = await response.json();

          // A Overpass pode responder 200 com um "remark" de erro de execução
          // (tempo ou memória esgotados) e lista vazia ou parcial. Isso não pode
          // virar nota baixa nem ficar no cache: trata como falha do servidor.
          if (
            typeof data.remark === "string" &&
            /runtime error|timed out|out of memory/i.test(data.remark)
          ) {
            lastError = `Overpass sinalizou erro de execução: ${data.remark}`;

            console.error(`${server}: ${lastError}`);

            continue;
          }

          elements = data.elements ?? [];

          console.log(`Overpass respondeu com sucesso: ${server}`);

          break;
        } catch (error) {
          lastError =
            error instanceof Error ? error.message : String(error);

          console.error(`Erro ao consultar ${server}:`, lastError);
        }
      }
    }

    // Nenhum servidor conseguiu responder.
    if (elements === null) {
      throw new Error(
        `Todos os servidores Overpass falharam. Último erro: ${lastError}`
      );
    }
  } catch (error) {
    console.error(
      "ERRO OVERPASS:",
      error
    );

    return Response.json(
      {
        error:
          "Erro ao consultar a Overpass API.",

        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 502 }
    );
  } finally {
    // Libera a vaga de consulta simultânea.
    releaseUpstream();
  }

  // Processa os estabelecimentos encontrados.
  const results = elements
    .map((element) => {
      const latitude2 =
        element.lat ??
        element.center?.lat;

      const longitude2 =
        element.lon ??
        element.center?.lon;

      if (
        latitude2 === undefined ||
        longitude2 === undefined
      ) {
        return null;
      }

      const tags = element.tags ?? {};

      const classification =
        getCategory(tags);

      if (classification === null) {
        return null;
      }

      const distance =
        haversineDistance(
          latitude,
          longitude,
          latitude2,
          longitude2
        );

      return {
        id: element.id,
        type: element.type,
        name:
          tags.name ?? "Sem nome",

        category:
          classification.category,

        establishmentType:
          classification.type,

        latitude: latitude2,
        longitude: longitude2,

        distance,
      };
    })
        .filter(
      (
        result
      ): result is NonNullable<
        typeof result
      > =>
        result !== null &&
        // Descarta os estabelecimentos fora do raio (cantos da bounding box).
        result.distance <= radiusKm
    );
    

  // Agrupa os estabelecimentos
  // pelas categorias.
  const groupedResults = Object.fromEntries(
    (Object.keys(CATEGORIES) as Category[]).map((category) => [
      category,
      results.filter((result) => result.category === category),
    ])
  ) as Record<Category, typeof results>;

  /*
   * Calcula a nota de uma categoria.
   *
   * 1. Quantidade:
   *    Quantidade de subcategorias encontradas
   *    em relação ao total de subcategorias.
   *    Máximo: 50 pontos.
   *
   * 2. Distância:
   *    Para cada subcategoria encontrada,
   *    considera somente o estabelecimento mais próximo.
   *    Máximo: 50 pontos.
   *
   * 3. Nota da categoria:
   *    Quantidade + Distância.
   *    Máximo: 100 pontos.
   */
  function calculateCategory(
    category: keyof typeof CATEGORIES
  ) {
    const establishments =
      groupedResults[category];

    const types = Object.keys(
      CATEGORIES[category]
    );

    const scoresByType: number[] = [];

    let foundTypes = 0;

    for (const type of types) {
      const establishmentsOfType =
        establishments.filter(
          (result) =>
            result.establishmentType === type
        );

      // Subcategoria não encontrada.
      // Não participa da média de distância.
      if (
        establishmentsOfType.length === 0
      ) {
        continue;
      }

      foundTypes++;

      // Encontra somente o estabelecimento
      // mais próximo daquele tipo.
      const nearest =
        establishmentsOfType.reduce(
          (closest, current) =>
            current.distance <
            closest.distance
              ? current
              : closest
        );

      // Pontuação de distância:
      // 0 a 50 pontos.
      const distanceScore =
        calculateDistanceScore(
          nearest.distance,
          radiusKm
        );

      scoresByType.push(
        distanceScore
      );
    }

    // Pontuação pela quantidade de
    // subcategorias encontradas:
    // 0 a 50 pontos.
    const quantityScore =
      calculateQuantityScore(
        foundTypes,
        types.length
      );

    // Média das pontuações de distância
    // das subcategorias encontradas.
    const distanceScore =
      calculateDistanceAverage(
        scoresByType
      );

    // Nota final da categoria:
    // Quantidade + Distância.
    return calculateCategoryScore(
      quantityScore,
      distanceScore
    );
  }

  const categoryScores = Object.fromEntries(
    (Object.keys(CATEGORIES) as Category[]).map((category) => [
      category,
      calculateCategory(category),
    ])
  ) as Record<Category, number>;

  // Calcula a nota final aplicando
  // os pesos de cada categoria.
  const overallScore =
    calculateOverallScore(
      categoryScores
    );

  // Agrupa os resultados que serão armazenados no cache.
  const responseData = {
    categories: groupedResults,
    scores: categoryScores,
    overallScore,
  };

  // Guarda o resultado com tempo de expiração. Falhas do Redis não afetam a resposta.
  await cacheSet(cacheKey, responseData, CACHE_TTL_SECONDS);

  // Retorna o resultado calculado e informa que não veio do cache.
  return Response.json(responseData, {
    headers: {
      "X-Cache": "MISS",
    },
  });
}