// Cliente Redis opcional.
//
// O Redis só é usado quando a variável REDIS_URL está definida
// (ex.: REDIS_URL=redis://localhost:6379). Sem ela, a aplicação usa apenas o
// cache em memória (veja lib/cache.ts).
//
// O cliente nunca derruba a aplicação:
// - a conexão é criada sob demanda, não ao importar o módulo;
// - comandos falham na hora quando o Redis está fora do ar (sem fila offline);
// - a reconexão acontece em segundo plano, com espera crescente.

import { createClient } from "redis";

// Cria o cliente com as opções desejadas. O tipo do cliente é inferido daqui.
function buildClient(url: string) {
  return createClient({
    url,
    // Sem fila offline: se não estiver conectado, o comando falha imediatamente
    // em vez de ficar pendurado atrasando a resposta da API.
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 2000,
      // Tenta reconectar para sempre, esperando entre 0,5 s e 30 s.
      reconnectStrategy: (retries) => Math.min((retries + 1) * 500, 30_000),
    },
  });
}

type RedisClient = ReturnType<typeof buildClient>;

type RedisState = {
  client: RedisClient | null;
  // Conexão inicial em andamento (compartilhada entre chamadas simultâneas).
  connecting: Promise<void> | null;
  // A espera pela conexão inicial só acontece uma vez.
  initialWaitDone: boolean;
  // Evita repetir a mesma mensagem de erro enquanto o Redis estiver fora.
  errorLogged: boolean;
};

// Guarda o estado em globalThis para sobreviver ao hot reload do `next dev`.
const globalForRedis = globalThis as unknown as { __redisState?: RedisState };

const state: RedisState = (globalForRedis.__redisState ??= {
  client: null,
  connecting: null,
  initialWaitDone: false,
  errorLogged: false,
});

// Tempo máximo de espera por um comando antes de seguir sem o Redis.
const COMMAND_TIMEOUT_MS = 1000;

// Tempo máximo de espera pela conexão inicial na primeira consulta.
const INITIAL_CONNECT_WAIT_MS = 1500;

function createRedisClient(url: string): RedisClient {
  const client = buildClient(url);

  client.on("error", (error) => {
    if (!state.errorLogged) {
      state.errorLogged = true;
      console.warn(
        "Redis indisponível, usando cache em memória:",
        error instanceof Error ? error.message : error
      );
    }
  });

  client.on("ready", () => {
    if (state.errorLogged) {
      console.log("Redis conectado novamente.");
    }

    state.errorLogged = false;
  });

  // Falhas de conexão já são tratadas pelo evento "error"; a reconexão
  // continua em segundo plano.
  state.connecting = client
    .connect()
    .then(() => undefined)
    .catch(() => undefined);

  return client;
}

// Retorna o cliente pronto para uso ou null se o Redis estiver desativado
// (sem REDIS_URL) ou temporariamente indisponível.
//
// Na primeira chamada, aguarda um curto período pela conexão inicial para que
// a primeira requisição já possa usar o Redis.
export async function getRedis(): Promise<RedisClient | null> {
  const url = process.env.REDIS_URL;

  if (!url) {
    return null;
  }

  if (!state.client) {
    state.client = createRedisClient(url);
  }

  if (!state.client.isReady && state.connecting && !state.initialWaitDone) {
    state.initialWaitDone = true;

    await Promise.race([
      state.connecting,
      new Promise<void>((resolve) =>
        setTimeout(resolve, INITIAL_CONNECT_WAIT_MS)
      ),
    ]);
  }

  return state.client.isReady ? state.client : null;
}

// Aplica um limite de tempo a uma operação do Redis.
export function withRedisTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Tempo esgotado ao consultar o Redis.")),
      COMMAND_TIMEOUT_MS
    );

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}