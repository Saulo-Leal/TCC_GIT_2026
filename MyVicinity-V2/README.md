# MyVicinity

Aplicação web que avalia a qualidade de uma localização com base nos serviços
próximos (transporte, saúde, comércio, educação, administrativo, lazer e locais
religiosos). Os dados vêm do OpenStreetMap (Overpass API e Nominatim).

## Executando

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Cache (Redis opcional)

Os resultados de `/api/score` (5 minutos) e de `/api/geocode` (10 minutos) ficam em cache. O cache funciona em dois níveis:

1. **Redis**, compartilhado entre instâncias, usado quando `REDIS_URL` está definida.
2. **Memória**, por instância, usada como fallback quando o Redis não está configurado ou está fora do ar.

Para usar o Redis localmente:

```bash
docker run --name redis-tcc -p 6379:6379 -d redis:alpine
echo "REDIS_URL=redis://localhost:6379" > .env.local
npm run dev
```

Sem `REDIS_URL`, a aplicação usa apenas a memória. Se o Redis cair com a aplicação em
execução, as requisições continuam funcionando (sem esperar) e a reconexão é automática.

As respostas de `/api/score` e `/api/geocode` trazem os cabeçalhos `X-Cache` (`HIT` ou `MISS`) e, em caso de
`HIT`, `X-Cache-Source` (`redis` ou `memory`).

O rate limit continua em memória, por instância.

## Busca de endereços

`/api/geocode` consulta o Nominatim (limite de 1 requisição por segundo). Para ser rápida:

- Buscas repetidas (ignorando maiúsculas, acentos e espaços extras) vêm do cache.
- Buscas idênticas simultâneas compartilham uma única consulta ao Nominatim.
- Buscas diferentes que chegam juntas entram numa fila (espera máxima de 2 s) em vez de receberem erro 429.
- A resposta contém só `lat`, `lon` e `display_name`, e o navegador guarda buscas repetidas por 10 minutos.

## Scripts

- `npm run dev`: servidor de desenvolvimento
- `npm run build`: build de produção
- `npm start`: executa o build de produção
- `npm run lint`: ESLint

## Variáveis de ambiente (opcionais)

Limites de requisições (em memória, por instância):

- `RATE_LIMIT_SCORE_PER_MIN` (padrão 10)
- `RATE_LIMIT_GEOCODE_PER_MIN` (padrão 15)
- `RATE_LIMIT_OVERPASS_GLOBAL_PER_MIN` (padrão 30)
- `RATE_LIMIT_OVERPASS_CONCURRENT` (padrão 4)