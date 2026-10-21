import {
  LIMITS,
  getClientIp,
  rateLimit,
  tooManyRequests,
} from "@/lib/rate-limit";

// Tamanho máximo aceito para o texto do endereço.
const MAX_QUERY_LENGTH = 200;

// Cache em memória das buscas de endereço.
const geocodeCache = new Map<
  string,
  {
    expiresAt: number;
    data: unknown;
  }
>();

const CACHE_DURATION = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 300;

function storeInCache(key: string, data: unknown) {
  const now = Date.now();

  if (geocodeCache.size >= MAX_CACHE_ENTRIES) {
    for (const [cachedKey, value] of geocodeCache) {
      if (value.expiresAt <= now) {
        geocodeCache.delete(cachedKey);
      }
    }

    while (geocodeCache.size >= MAX_CACHE_ENTRIES) {
      const oldest = geocodeCache.keys().next().value;

      if (oldest === undefined) {
        break;
      }

      geocodeCache.delete(oldest);
    }
  }

  geocodeCache.set(key, {
    data,
    expiresAt: now + CACHE_DURATION,
  });
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

  // Reaproveita resultados já obtidos (não consulta o Nominatim).
  const cacheKey = query.toLowerCase().replace(/\s+/g, " ");
  const cached = geocodeCache.get(cacheKey);

  if (cached) {
    if (Date.now() < cached.expiresAt) {
      return Response.json(cached.data, {
        headers: { "X-Cache": "HIT" },
      });
    }

    geocodeCache.delete(cacheKey);
  }

  // Limite global: o Nominatim público aceita no máximo 1 requisição/segundo.
  const upstreamLimit = rateLimit(
    "geocode:upstream:global",
    LIMITS.geocode.upstreamGlobalPerSecond,
    1000
  );

  if (!upstreamLimit.allowed) {
    return tooManyRequests(
      "O serviço de busca está ocupado. Tente novamente em instantes.",
      upstreamLimit.retryAfterSeconds
    );
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");

  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");

  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": "MorarBem/2.0 (projeto acadêmico)",
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    console.error("Erro ao consultar o Nominatim:", error);

    return Response.json(
      { error: "Erro ao consultar o Nominatim." },
      { status: 502 }
    );
  }

  if (!response.ok) {
    console.error(
      "Nominatim respondeu com status:",
      response.status
    );

    return Response.json(
      { error: "Erro ao consultar o Nominatim." },
      { status: 502 }
    );
  }

  const data = await response.json();

  storeInCache(cacheKey, data);

  return Response.json(data, {
    headers: { "X-Cache": "MISS" },
  });
}