import { cacheGet, cacheSet } from "@/lib/cache";
import type { GeocodeResult } from "@/lib/types";
import {
  LIMITS,
  getClientIp,
  rateLimit,
  tooManyRequests,
  waitForUpstreamSlot,
} from "@/lib/rate-limit";

// Tamanho máximo aceito para o texto do endereço.
const MAX_QUERY_LENGTH = 200;

// Por quanto tempo (em segundos) uma busca de endereço permanece no cache.
const CACHE_TTL_SECONDS = 10 * 60;

// Permite que o navegador reaproveite buscas repetidas sem chamar o servidor.
const BROWSER_CACHE_CONTROL = `public, max-age=${CACHE_TTL_SECONDS}`;

// O Nominatim não pode ser consultado agora (fila cheia).
class UpstreamBusyError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Fila do Nominatim cheia.");
  }
}

// Falha ao consultar ou interpretar a resposta do Nominatim.
class UpstreamError extends Error {}

// Buscas idênticas em andamento. Quem chega com a mesma busca aguarda a
// consulta já iniciada, em vez de fazer outra ao Nominatim.
const inflight = new Map<string, Promise<GeocodeResult[]>>();

// Ignora maiúsculas, acentos e espaços repetidos para aumentar o reaproveitamento
// do cache ("São Paulo", "sao  paulo" e "SAO PAULO" são a mesma busca).
function normalizeQuery(query: string): string {
  return query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function jsonResponse(data: GeocodeResult[], headers: Record<string, string>) {
  return Response.json(data, {
    headers: { "Cache-Control": BROWSER_CACHE_CONTROL, ...headers },
  });
}

type NominatimItem = { lat?: unknown; lon?: unknown; display_name?: unknown };

// Consulta o Nominatim respeitando o limite de 1 requisição por segundo.
// Devolve só os campos usados pela interface (resposta e cache bem menores).
async function searchNominatim(query: string): Promise<GeocodeResult[]> {
  const slot = await waitForUpstreamSlot(
    "geocode:nominatim",
    1000 / LIMITS.geocode.upstreamGlobalPerSecond,
    LIMITS.geocode.upstreamMaxWaitMs
  );

  if (!slot.allowed) {
    throw new UpstreamBusyError(slot.retryAfterSeconds);
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");

  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");

  let data: unknown;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "MyVicinity/2.0 (projeto acadêmico)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error("Nominatim respondeu com status:", response.status);
      throw new UpstreamError("Status inesperado do Nominatim.");
    }

    data = await response.json();
  } catch (error) {
    if (!(error instanceof UpstreamError)) {
      console.error("Erro ao consultar o Nominatim:", error);
    }

    throw new UpstreamError("Erro ao consultar o Nominatim.");
  }

  if (!Array.isArray(data)) {
    throw new UpstreamError("Resposta inesperada do Nominatim.");
  }

  return (data as NominatimItem[])
    .filter(
      (item): item is GeocodeResult =>
        typeof item?.lat === "string" &&
        typeof item.lon === "string" &&
        typeof item.display_name === "string"
    )
    .map(({ lat, lon, display_name }) => ({ lat, lon, display_name }));
}

export async function GET(request: Request) {
  // Limite por IP.
  const ipLimit = rateLimit(
    `geocode:ip:${getClientIp(request)}`,
    LIMITS.geocode.perIp,
    LIMITS.geocode.windowMs
  );

  if (!ipLimit.allowed) {
    return tooManyRequests(
      "Muitas buscas em pouco tempo. Aguarde alguns segundos e tente novamente.",
      ipLimit.retryAfterSeconds,
      ipLimit.limit
    );
  }

  const { searchParams } = new URL(request.url);

  const query = searchParams.get("q")?.trim();

  if (!query) {
    return Response.json(
      { error: "Endereço não informado." },
      { status: 400 }
    );
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return Response.json(
      { error: "Endereço muito longo." },
      { status: 400 }
    );
  }

  // Reaproveita resultados já obtidos (Redis, com fallback em memória).
  const cacheKey = `geocode:${normalizeQuery(query)}`;
  const cached = await cacheGet<GeocodeResult[]>(cacheKey);

  if (cached) {
    return jsonResponse(cached.data, {
      "X-Cache": "HIT",
      "X-Cache-Source": cached.source,
    });
  }

  // Junta-se a uma busca idêntica já em andamento ou inicia uma nova.
  let search = inflight.get(cacheKey);

  if (!search) {
    search = searchNominatim(query)
      .then(async (results) => {
        await cacheSet(cacheKey, results, CACHE_TTL_SECONDS);
        return results;
      })
      .finally(() => {
        inflight.delete(cacheKey);
      });

    inflight.set(cacheKey, search);
  }

  try {
    return jsonResponse(await search, { "X-Cache": "MISS" });
  } catch (error) {
    if (error instanceof UpstreamBusyError) {
      return tooManyRequests(
        "O serviço de busca está ocupado. Tente novamente em instantes.",
        error.retryAfterSeconds
      );
    }

    return Response.json(
      { error: "Erro ao consultar o Nominatim." },
      { status: 502 }
    );
  }
}