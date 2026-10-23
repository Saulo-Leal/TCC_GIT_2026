# MyVicinity

Aplicação web que avalia a qualidade de uma localização com base nos serviços
próximos (transporte, saúde, comércio, educação, administrativo, lazer e locais
religiosos). Os dados vêm do OpenStreetMap (Overpass API e Nominatim).

A pontuação (0 a 100) combina, para cada categoria, a **variedade** de
subcategorias encontradas e a **proximidade** do estabelecimento mais próximo de
cada uma, ponderadas pelo peso da categoria. O raio de análise é de 1 km.

## Estrutura do projeto

- `app/`: página principal e rotas de servidor (`/api/score` e `/api/geocode`).
- `components/`: componentes da interface (busca, mapa, painel de resultados).
- `lib/`: regras de negócio (categorias, consulta Overpass, Haversine, pontuação, cache e rate limit).
- `testes.mjs`: script de testes automatizados da API.
- `diagnostico.mjs` e `diagnostico2.mjs`: scripts de diagnóstico da Overpass API.
- `Dockerfile` e `docker-compose.yml`: execução em contêineres.

## Executando

### Com Docker (recomendado)

Requisitos: [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e **aberto**.
Confira com `docker --version` e `docker compose version`.

O `docker-compose.yml` sobe três serviços:

| Serviço | Função |
|---|---|
| `redis` | Cache compartilhado (Redis 7) |
| `app` | A aplicação, acessível em http://localhost:3000 |
| `tests` | Roda o `testes.mjs` dentro da rede do Docker (só quando chamado) |

Na pasta do projeto:

```bash
docker compose up --build
```

A primeira execução leva alguns minutos (instala as dependências e gera o build
de produção). Quando o log do `app` mostrar `Ready`, abra
[http://localhost:3000](http://localhost:3000).

Comandos úteis:

```bash
docker compose up -d --build     # sobe em segundo plano
docker compose logs -f app       # acompanha o log da aplicação
docker compose ps                # mostra o estado dos serviços
docker compose down              # para tudo e apaga o cache do Redis
```

Depois de **alterar o código**, rode `docker compose up --build` novamente: o
contêiner usa a imagem construída, e não a pasta do projeto.
Alterar apenas as variáveis de ambiente do `docker-compose.yml` exige só
`docker compose up -d`, sem `--build`.

O `docker-compose.yml` já define, para o serviço `app`:

```yaml
REDIS_URL: "redis://redis:6379"
SCORE_CACHE_TTL_SECONDS: "86400"    # cache de 24 h (nos testes, uma consulta à Overpass por local)
OVERPASS_SERVERS: "https://overpass-api.de/api/interpreter"
```

O cache de 24 h é pensado para os testes. Para o uso normal, remova
`SCORE_CACHE_TTL_SECONDS` (o padrão é 5 minutos). Se quiser usar mais de uma
instância da Overpass, separe as URLs por vírgula em `OVERPASS_SERVERS`; quando a
variável não é definida, o app usa quatro instâncias públicas em sequência
(*fallback*).

### Sem Docker

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Requer Node.js 20.9 ou superior
(recomendado Node 22).

## Testes

Os testes têm três partes: automatizados da API (`testes.mjs`), verificação manual
da interface e diagnóstico da Overpass.

### 1. Testes automatizados (`testes.mjs`)

O script chama a API do app e registra os resultados. Ele tem duas fases:

- **Cenários** (`node testes.mjs`): analisa locais reais, consulta cada um duas vezes
  (a 2ª deve vir do cache) e **recalcula a pontuação de forma independente**, a
  partir das Equações do modelo, para conferir se bate com a calculada pelo app.
- **Validação** (`node testes.mjs validacao`): onze casos (V01 a V11): consulta válida,
  entradas inválidas (devem dar HTTP 400), cache (`X-Cache: HIT`), busca de endereço e
  limite de requisições (10 respostas 200 e 2 respostas 429, com `Retry-After`).

#### Preparação

1. Suba o app (`docker compose up --build`, ou `npm run dev` sem Docker).
2. Abra o `testes.mjs` e preencha a lista `LOCAIS` com as coordenadas. No Google
   Maps, clique com o botão direito no ponto e copie `lat, lon`. Locais com `lat` e
   `lon` iguais a `null` são ignorados.

   ```js
   { nome: "Centro de Araraquara", lat: -21.7946, lon: -48.1756 },
   ```

3. Se já existirem `resultados.csv`, `tabela.tex`, `validacao.csv` ou a pasta
   `respostas/`, **mova-os para outra pasta antes**: o script sobrescreve esses arquivos.

#### Executando com Docker

Em outro terminal, na pasta do projeto:

```bash
docker compose run --rm tests                          # cenários
docker compose run --rm tests node testes.mjs validacao   # validação
```

#### Executando sem Docker

Com o app rodando em outro terminal:

```bash
node testes.mjs
node testes.mjs validacao
```

Se o app estiver em outra porta ou endereço, defina `BASE`
(e, opcionalmente, `RADIUS`, em metros):

```bash
BASE=http://localhost:3001 node testes.mjs                  # macOS/Linux/Git Bash
$env:BASE="http://localhost:3001"; node testes.mjs          # PowerShell
```

#### Tempo esperado

Há uma pausa de 7 s entre as requisições para respeitar o limite de 10 consultas por
minuto por IP. A primeira consulta de cada local depende da Overpass e pode levar de
25 a 50 s; as repetidas, atendidas pelo cache, levam poucos milissegundos.
Estime cerca de 1 minuto por local nos cenários e de 2 a 3 minutos na validação.
**Não interrompa** o script: os arquivos só são gravados no final.

#### Arquivos gerados

| Arquivo | Conteúdo |
|---|---|
| `resultados.csv` | Por local: nota da API, nota recalculada, se confere, nº de POIs, nota por categoria, tempos e `X-Cache` |
| `tabela.tex` | Linhas prontas para colar em uma tabela LaTeX |
| `respostas/*.json` | Resposta bruta da API de cada local (para reprodutibilidade) |
| `validacao.csv` | Resultado dos casos V01 a V11 (aprovado ou reprovado) |

No `resultados.csv`, a coluna `confere` deve ser `sim` em todos os locais.

#### Repetindo os testes

O cache de 24 h faz as repetições virem do cache (`HIT`). Para forçar consultas novas
à Overpass, rode `docker compose down` e suba de novo: isso apaga o Redis e a memória
do app. Reiniciar só o Redis não basta, porque o app também guarda cache em memória.

### 2. Testes manuais da interface

Com o app aberto em http://localhost:3000, registre aprovado ou reprovado em cada item:

1. Busca por endereço válido (RF01 e RF02).
2. Busca por texto inexistente (deve mostrar uma mensagem clara).
3. Seleção de ponto por clique no mapa (RF01).
4. Nova análise sem recarregar a página (RF09).
5. Cartões por categoria com nome e distância dos estabelecimentos.
6. Local sem POIs (a pontuação zero deve ser exibida corretamente).
7. Visualização em tela pequena (RNF02), usando F12 e o modo dispositivo.
8. Execução em dois navegadores modernos (RNF07).

Anote o navegador, a versão e o tamanho de tela usados, e faça capturas de tela.

### 3. Diagnóstico da Overpass

As instâncias públicas da Overpass são compartilhadas e podem responder com erro 429
ou 504, ou demorar. Se as consultas falharem (`502` no `testes.mjs`):

```bash
docker compose run --rm tests node diagnostico.mjs     # testa cada servidor com consultas reais
docker compose run --rm tests node diagnostico2.mjs    # compara formulações da consulta
```

O `diagnostico.mjs` mostra, para cada servidor, o código HTTP, o tempo e o número de
elementos. O `diagnostico2.mjs` compara a consulta atual (expressões regulares) com
variantes de valores exatos. Na prática, apenas a instância principal
(`overpass-api.de`) respondeu de forma consistente, e nenhuma variante foi
relevantemente mais rápida.

## Solução de problemas

| Sintoma | Causa provável e solução |
|---|---|
| `docker: command not found` ou erro de conexão com o Docker | O Docker Desktop não está instalado ou aberto |
| Porta 3000 em uso | Pare o `npm run dev` ou outro processo que use a porta |
| Erro `mapping values are not allowed` no `docker-compose.yml` | Erro de indentação ou variáveis na mesma linha; use apenas espaços e uma variável por linha. `docker compose config` valida o arquivo |
| `testes.mjs` mostra `status 0` | O app não está rodando ou `BASE` está errado |
| `FALHOU: status 502` | Todos os servidores da Overpass falharam; espere alguns minutos e rode de novo (falhas não ficam no cache) |
| `429 recebido; aguardando...` | Normal: o script espera o `Retry-After` e tenta de novo |
| Primeira consulta demora 30 s ou mais | Esperado: depende da Overpass pública; as repetidas vêm do cache |
| `REDIS_URL` do `.env.local` ignorada | O arquivo foi salvo em UTF-16 (acontece com `echo > arquivo` no PowerShell). Recrie-o em UTF-8, pelo editor |
| `npm ci` falha no build do Docker | `package-lock.json` fora de sincronia; rode `npm install` e tente de novo |

## Cache (Redis opcional)

Os resultados de `/api/score` (5 minutos por padrão) e de `/api/geocode` (10 minutos) ficam em cache. O cache funciona em dois níveis:

1. **Redis**, compartilhado entre instâncias, usado quando `REDIS_URL` está definida.
2. **Memória**, por instância, usada como fallback quando o Redis não está configurado ou está fora do ar.

No Docker, o Redis já faz parte do `docker-compose.yml`. Para usar o Redis localmente, sem o Docker Compose:

```bash
docker run --name redis-tcc -p 6379:6379 -d redis:alpine
```

e crie o arquivo `.env.local` **em UTF-8** com o conteúdo:

```
REDIS_URL=redis://localhost:6379
```

(Evite `echo "..." > .env.local` no PowerShell, que grava em UTF-16 e impede a leitura da variável.)
Depois, `npm run dev`.

Sem `REDIS_URL`, a aplicação usa apenas a memória. Se o Redis cair com a aplicação em
execução, as requisições continuam funcionando (sem esperar) e a reconexão é automática.

As respostas de `/api/score` e `/api/geocode` trazem os cabeçalhos `X-Cache` (`HIT` ou `MISS`) e, em caso de
`HIT`, `X-Cache-Source` (`redis` ou `memory`).

O rate limit continua em memória, por instância.

## API

- `GET /api/score?lat=<latitude>&lon=<longitude>&radius=<metros>`: devolve os estabelecimentos por categoria, as notas por categoria e a nota final. O raio aceito vai de 100 a 2000 m (a interface usa 1000 m). Parâmetros inválidos retornam HTTP 400.
- `GET /api/geocode?q=<endereço>`: converte um endereço em coordenadas (Nominatim).

## Consulta à Overpass

A consulta declara ao servidor um tempo máximo de 60 s e o app aguarda a resposta por até
75 s por requisição, pois as instâncias públicas costumam levar de 25 a 40 s. Respostas com
erro, sem conteúdo válido ou com aviso de erro de execução (tempo ou memória esgotados) são
descartadas e **não** entram no cache; consultas rejeitadas como inválidas (HTTP 400) não são
repetidas.

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

Aplicação:

- `REDIS_URL`: ativa o cache em Redis (ex.: `redis://localhost:6379`)
- `SCORE_CACHE_TTL_SECONDS`: validade do cache de `/api/score` (padrão 300)
- `OVERPASS_SERVERS`: URLs das instâncias da Overpass, separadas por vírgula

Limites de requisições (em memória, por instância):

- `RATE_LIMIT_SCORE_PER_MIN` (padrão 10)
- `RATE_LIMIT_GEOCODE_PER_MIN` (padrão 15)
- `RATE_LIMIT_OVERPASS_GLOBAL_PER_MIN` (padrão 30)
- `RATE_LIMIT_OVERPASS_CONCURRENT` (padrão 4)

Scripts de teste:

- `BASE`: endereço do app (padrão `http://localhost:3000`)
- `RADIUS`: raio em metros usado nos testes (padrão 1000)