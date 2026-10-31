// Cache em dois níveis: Redis (compartilhado entre instâncias) com
// fallback em memória (por instância).
//
// - Leitura: tenta o Redis; se não houver resultado ou ele estiver fora do ar,
//   consulta a memória.
// - Escrita: grava sempre na memória e, quando disponível, também no Redis.
//
// Qualquer falha do Redis é tratada como "sem cache nesse nível" e nunca
// impede a resposta da API.

import { getRedis, withRedisTimeout } from "./redis";

export type CacheSource = "redis" | "memory";

export type CacheHit<T> = {
  data: T;
  source: CacheSource;
};

type MemoryEntry = {
  expiresAt: number;
  value: string;
};

const KEY_PREFIX = "myvicinity:";

// Quantidade máxima de entradas guardadas em memória.
const MAX_MEMORY_ENTRIES = 200;

const memoryCache = new Map<string, MemoryEntry>();

function readMemory(key: string): string | null {
  const entry = memoryCache.get(key);

  if (!entry) {
    return null;
  }

  if (Date.now() >= entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }

  return entry.value;
}

function writeMemory(key: string, value: string, ttlSeconds: number) {
  const now = Date.now();

  if (memoryCache.size >= MAX_MEMORY_ENTRIES) {
    for (const [cachedKey, entry] of memoryCache) {
      if (entry.expiresAt <= now) {
        memoryCache.delete(cachedKey);
      }
    }

    while (memoryCache.size >= MAX_MEMORY_ENTRIES) {
      const oldest = memoryCache.keys().next().value;

      if (oldest === undefined) {
        break;
      }

      memoryCache.delete(oldest);
    }
  }

  memoryCache.set(key, {
    value,
    expiresAt: now + ttlSeconds * 1000,
  });
}

function parse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function cacheGet<T>(key: string): Promise<CacheHit<T> | null> {
  const fullKey = KEY_PREFIX + key;
  const redis = await getRedis();

  if (redis) {
    try {
      const value = await withRedisTimeout(redis.get(fullKey));
      const data = value === null ? null : parse<T>(value);

      if (data !== null) {
        return { data, source: "redis" };
      }
    } catch (error) {
      console.warn(
        "Falha ao ler do Redis, usando memória:",
        error instanceof Error ? error.message : error
      );
    }
  }

  const memoryValue = readMemory(fullKey);
  const data = memoryValue === null ? null : parse<T>(memoryValue);

  return data === null ? null : { data, source: "memory" };
}

export async function cacheSet(
  key: string,
  data: unknown,
  ttlSeconds: number
): Promise<void> {
  const fullKey = KEY_PREFIX + key;
  const value = JSON.stringify(data);

  writeMemory(fullKey, value, ttlSeconds);

  const redis = await getRedis();

  if (!redis) {
    return;
  }

  try {
    await withRedisTimeout(redis.set(fullKey, value, { EX: ttlSeconds }));
  } catch (error) {
    console.warn(
      "Falha ao gravar no Redis, mantido apenas em memória:",
      error instanceof Error ? error.message : error
    );
  }
}