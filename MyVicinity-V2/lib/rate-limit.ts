// Limitação de frequência de requisições (rate limiting) em memória.
//
// Estratégia em camadas:
// 1. Limite por IP (janela fixa): impede que um único cliente abuse das rotas.
// 2. Limite global das consultas aos serviços externos: protege Overpass e
//    Nominatim mesmo se o limite por IP for contornado (ex.: muitos IPs).
// 3. Limite de consultas simultâneas à Overpass: evita acumular requisições
//    longas que consomem recursos do servidor.
//
// Limitação: os contadores ficam na memória de UMA instância do servidor.
// Em ambientes com várias instâncias ou serverless, use um armazenamento
// compartilhado (ex.: Redis/Upstash) ou o firewall da hospedagem.

type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

const buckets = new Map<string, Bucket>();

// Teto de contadores guardados, para que o próprio limitador não vire
// um vetor de esgotamento de memória.
const MAX_BUCKETS = 10_000;
const CLEANUP_INTERVAL_MS = 60_000;

let lastCleanup = 0;

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

// Limites padrão. Podem ser ajustados por variáveis de ambiente.
export const LIMITS = {
  score: {
    // Consultas por IP a cada janela.
    perIp: envInt("RATE_LIMIT_SCORE_PER_MIN", 10),
    windowMs: 60_000,
    // Consultas à Overpass (cache MISS) somando todos os clientes.
    upstreamGlobalPerMin: envInt("RATE_LIMIT_OVERPASS_GLOBAL_PER_MIN", 30),
    // Consultas à Overpass em andamento ao mesmo tempo.
    maxConcurrent: envInt("RATE_LIMIT_OVERPASS_CONCURRENT", 4),
  },
  geocode: {
    perIp: envInt("RATE_LIMIT_GEOCODE_PER_MIN", 15),
    windowMs: 60_000,
    // A política do Nominatim permite no máximo 1 requisição por segundo.
    upstreamGlobalPerSecond: 1,
    // Tempo máximo que uma busca espera na fila por sua vez de consultar o
    // Nominatim. Acima disso, responde 429 em vez de deixar o usuário esperando.
    upstreamMaxWaitMs: 2000,
  },
};

function cleanup(now: number) {
  if (
    now - lastCleanup < CLEANUP_INTERVAL_MS &&
    buckets.size < MAX_BUCKETS
  ) {
    return;
  }

  lastCleanup = now;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }

  // Se ainda estiver cheio, descarta os mais antigos.
  if (buckets.size >= MAX_BUCKETS) {
    const excess = buckets.size - MAX_BUCKETS + 1;
    let removed = 0;

    for (const key of buckets.keys()) {
      buckets.delete(key);

      if (++removed >= excess) {
        break;
      }
    }
  }
}

// Contabiliza uma requisição para a chave informada (janela fixa).
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();

  cleanup(now);

  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((bucket.resetAt - now) / 1000)
  );

  if (bucket.count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  bucket.count++;

  return {
    allowed: true,
    limit,
    remaining: limit - bucket.count,
    retryAfterSeconds,
  };
}

// Identifica o cliente. Só é confiável quando a aplicação está atrás de um
// proxy/CDN que sobrescreve esses cabeçalhos (Vercel, Cloudflare, Nginx...).
// Se o servidor ficar exposto diretamente, o cliente pode forjá-los; por isso
// existem também os limites globais.
export function getClientIp(request: Request): string {
  const cloudflare = request.headers.get("cf-connecting-ip")?.trim();

  if (cloudflare) {
    return cloudflare;
  }

  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();

  if (forwarded) {
    return forwarded;
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

// Resposta padrão HTTP 429 (Too Many Requests) com Retry-After.
export function tooManyRequests(
  message: string,
  retryAfterSeconds: number,
  limit?: number
): Response {
  const headers: Record<string, string> = {
    "Retry-After": String(retryAfterSeconds),
  };

  if (limit !== undefined) {
    headers["X-RateLimit-Limit"] = String(limit);
    headers["X-RateLimit-Remaining"] = "0";
  }

  return Response.json({ error: message }, { status: 429, headers });
}

// Espaçamento entre chamadas a um serviço externo (ex.: 1 por segundo).
// Em vez de recusar uma chamada que chega logo após outra, coloca-a na fila e
// a libera no próximo horário livre, desde que a espera não passe de maxWaitMs.
// Guarda apenas o próximo horário livre de cada chave (poucas chaves).
const nextSlotAt = new Map<string, number>();

export async function waitForUpstreamSlot(
  key: string,
  intervalMs: number,
  maxWaitMs: number
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const now = Date.now();
  const start = Math.max(now, nextSlotAt.get(key) ?? 0);
  const waitMs = start - now;

  if (waitMs > maxWaitMs) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((waitMs - maxWaitMs) / 1000)),
    };
  }

  nextSlotAt.set(key, start + intervalMs);

  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

// Controle de consultas simultâneas aos serviços externos.
let activeUpstream = 0;

export function tryAcquireUpstream(max: number): boolean {
  if (activeUpstream >= max) {
    return false;
  }

  activeUpstream++;

  return true;
}

export function releaseUpstream() {
  activeUpstream = Math.max(0, activeUpstream - 1);
}