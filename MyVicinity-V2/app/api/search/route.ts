import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import crypto from 'crypto';

// --- CONFIGURAÇÕES DE RATE LIMIT ---
const RATE_LIMIT_MAX = 10;       // Limite de 10 pesquisas
const RATE_LIMIT_WINDOW = 60;    // Janela de 60 segundos

// --- CONFIGURAÇÃO DE CACHE ---
const CACHE_TTL = 300;           // Cache de 5 minutos (300s)

export async function GET(request) {
  try {
    // 1. Identifica o IP do Cliente
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';
    const rateLimitKey = `rate_limit:search:${ip}`;

    // 2. Aplica o Rate Limiting (Fixed Window)
    const requestsCount = await redis.incr(rateLimitKey);

    if (requestsCount === 1) {
      await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW);
    }

    if (requestsCount > RATE_LIMIT_MAX) {
      const ttl = await redis.ttl(rateLimitKey);
      return NextResponse.json(
        { error: 'Muitas pesquisas. Aguarde um momento antes de tentar novamente.' },
        { 
          status: 429,
          headers: {
            'Retry-After': String(ttl),
            'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
            'X-RateLimit-Remaining': '0',
          }
        }
      );
    }

    // 3. Obtém e normaliza o termo pesquisado
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) {
      return NextResponse.json({ error: 'Parâmetro de busca "q" é obrigatório.' }, { status: 400 });
    }

    const normalizedQuery = query.trim().toLowerCase();
    const queryHash = crypto.createHash('md5').update(normalizedQuery).digest('hex');
    const cacheKey = `search_cache:${queryHash}`;

    // 4. Verifica se o resultado já está no Cache do Redis
    const cachedResult = await redis.get(cacheKey);

    if (cachedResult) {
      return NextResponse.json({
        source: 'cache',
        data: JSON.parse(cachedResult),
      });
    }

    // 5. Se não estiver no cache (Cache Miss), busca do Banco de Dados
    const searchData = await fetchFromDatabase(normalizedQuery);

    // 6. Salva no Redis com expiração
    await redis.set(cacheKey, JSON.stringify(searchData), { EX: CACHE_TTL });

    return NextResponse.json({
      source: 'database',
      data: searchData,
    });

  } catch (error) {
    console.error('Erro na API de busca:', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}

// Função simulada do seu Banco de Dados principal
async function fetchFromDatabase(query) {
    // Substitua pela consulta real no seu ORM / DB (Prisma, TypeORM, MongoDB, etc.)
    return [
      { id: 1, title: `Resultado sobre ${query}` },
      { id: 2, title: `Outro item para ${query}` },
    ];
}