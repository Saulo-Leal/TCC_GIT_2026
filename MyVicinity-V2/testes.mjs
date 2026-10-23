// testes.mjs — Testes do MyVicinity para o Capítulo 4 do TCC.
//
// Requisitos: Node 18+ e o app rodando (npm run dev).
//
// Uso:
//   node testes.mjs              -> cenários em locais reais (gera resultados.csv e tabela.tex)
//   node testes.mjs validacao    -> entradas inválidas, cache e rate limit (gera validacao.csv)
//
// Variáveis opcionais: BASE (padrão http://localhost:3000), RADIUS (padrão 1000).

import { writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs"; // coloque junto do import do writeFileSync

const BASE = process.env.BASE ?? "http://localhost:3000";
const RADIUS = Number(process.env.RADIUS ?? 1000);

// Intervalo entre requisições. O app limita 10 consultas/min por IP
// (e a Overpass pública é compartilhada), então mantenha >= 7 s.
const PAUSE_MS = 7000;

// ===== PREENCHA AS COORDENADAS =====
// Como obter: no Google Maps, clique com o botão direito no ponto e copie
// "lat, lon"; ou clique no ponto no próprio MyVicinity e leia lat/lon na aba
// Rede (Network) do navegador. Entradas com lat/lon nulos são ignoradas.
const LOCAIS = [
  { nome: "Centro de Araraquara", lat: -21.7946, lon: -48.1756 }, // confira no mapa
  { nome: "UNIP Araraquara", lat: null , lon: null }, //lat: -21.7821371, lon: -48.1959471
  { nome: "Bairro residencial-Jardim imperador", lat: null, lon: null }, //lat: -21.753749, lon: -48.161271
  { nome: "Periferia (ex: fundo do selmi dei)", lat: -21.719073, lon: -48.155116 },
  { nome: "Área rural (ex: Varjao - Pirai)", lat: -22.574919, lon: -43.967614 }, // lat: -22.574919, lon: -43.967614 
  { nome: "Outra cidade (ex.:Liberdade - Sao Paulo)", lat: null, lon: null }, //lat: -23.560450, lon: -46.631572
];

// ===== Modelo do TCC (para recalcular a nota de forma independente) =====
const TOTAL_SUBCATEGORIAS = {
  transporte: 4, educacao: 3, comercio: 5, saude: 6,
  administrativo: 4, lazer: 3, religioso: 1,
};
const PESOS = {
  transporte: 28.1, saude: 20.6, comercio: 18.5, educacao: 15.3,
  administrativo: 7.5, lazer: 5.6, religioso: 4.4,
};

function notaDistancia(d, dmax) {
  const dmin = 0.1;
  if (d <= dmin) return 50;
  if (d >= dmax) return 0;
  return 50 * (1 - (d - dmin) / (dmax - dmin));
}

// Recalcula as notas a partir dos estabelecimentos devolvidos pela API,
// usando as equações 3.1 a 3.8 do TCC (sem reutilizar o código do app).
export function recalcular(categories, radiusKm) {
  const notas = {};
  let final = 0;
  for (const [cat, total] of Object.entries(TOTAL_SUBCATEGORIAS)) {
    const porTipo = new Map();
    for (const e of categories[cat] ?? []) {
      const atual = porTipo.get(e.establishmentType);
      if (atual === undefined || e.distance < atual) porTipo.set(e.establishmentType, e.distance);
    }
    const variedade = (porTipo.size / total) * 50;
    const dist = porTipo.size === 0
      ? 0
      : [...porTipo.values()].reduce((s, d) => s + notaDistancia(d, radiusKm), 0) / porTipo.size;
    notas[cat] = variedade + dist;
    final += notas[cat] * (PESOS[cat] / 100);
  }
  return { notas, final };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const csv = (v) => `"${String(v).replace(/"/g, '""')}"`;

async function chamar(path) {
  const t0 = performance.now();
  let res;
  try {
    res = await fetch(BASE + path);
  } catch (e) {
    return { status: 0, ms: 0, erro: String(e.message ?? e), headers: {}, body: null };
  }
  const ms = Math.round(performance.now() - t0);
  let body = null;
  try { body = await res.json(); } catch { /* corpo não é JSON */ }
  return {
    status: res.status,
    ms,
    headers: {
      cache: res.headers.get("x-cache"),
      fonte: res.headers.get("x-cache-source"),
      retry: res.headers.get("retry-after"),
    },
    body,
  };
}

// Chama /api/score; se vier 429, espera o Retry-After e tenta de novo.
async function score(lat, lon) {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const r = await chamar(`/api/score?lat=${lat}&lon=${lon}&radius=${RADIUS}`);
    if (r.status !== 429) return r;
    const espera = (Number(r.headers.retry) || 10) * 1000 + 1000;
    console.log(`  429 recebido; aguardando ${espera / 1000}s...`);
    await sleep(espera);
  }
  return { status: 429, ms: 0, headers: {}, body: null };
}

async function cenarios() {
  const linhas = [["local", "lat", "lon", "nota_api", "nota_recalculada", "confere", "total_pois",
    ...Object.keys(TOTAL_SUBCATEGORIAS).map((c) => `nota_${c}`),
    "tempo_ms_1a_consulta", "x_cache_1a", "tempo_ms_2a_consulta", "x_cache_2a", "data_hora"]];
  const tex = [];

  for (const l of LOCAIS) {
    if (l.lat == null || l.lon == null) {
      console.log(`[pulado] ${l.nome}: preencha lat/lon`);
      continue;
    }
    console.log(`\n== ${l.nome} (${l.lat}, ${l.lon})`);
    const a = await score(l.lat, l.lon);
    await sleep(PAUSE_MS);
    const b = await score(l.lat, l.lon); // mesma consulta: deve vir do cache
    await sleep(PAUSE_MS);

    if (a.status !== 200 || !a.body) {
      console.log(`  FALHOU: status ${a.status}`, a.body?.error ?? "");
      linhas.push([l.nome, l.lat, l.lon, `ERRO ${a.status}`]);
      continue;
    }
    const pois = Object.values(a.body.categories).reduce((s, arr) => s + arr.length, 0);
     
  mkdirSync("respostas", { recursive: true });
  writeFileSync(`respostas/${l.nome.replace(/[^a-z0-9]+/gi, "_")}.json`, JSON.stringify(a.body, null, 2));
    const { notas, final } = recalcular(a.body.categories, RADIUS / 1000);
    const confere =
      Math.abs(final - a.body.overallScore) < 1e-6 &&
      Object.keys(notas).every((c) => Math.abs(notas[c] - a.body.scores[c]) < 1e-6);

    console.log(`  nota ${a.body.overallScore.toFixed(2)} | POIs ${pois} | recálculo ${confere ? "CONFERE" : "DIVERGE"}`);
    console.log(`  1ª: ${a.ms} ms (${a.headers.cache}) | 2ª: ${b.ms} ms (${b.headers.cache}/${b.headers.fonte})`);

    linhas.push([l.nome, l.lat, l.lon, a.body.overallScore.toFixed(2), final.toFixed(2),
      confere ? "sim" : "NAO", pois,
      ...Object.keys(TOTAL_SUBCATEGORIAS).map((c) => a.body.scores[c].toFixed(1)),
      a.ms, a.headers.cache, b.ms, b.headers.cache, new Date().toISOString()]);

    tex.push(`${l.nome} & ${Math.round(a.body.overallScore)} & ${pois} & ${a.ms} & ${b.ms} \\\\`);
  }

  writeFileSync("resultados.csv", linhas.map((r) => r.map(csv).join(",")).join("\n"));
  writeFileSync("tabela.tex", tex.join("\n"));
  console.log("\nGerados: resultados.csv e tabela.tex (linhas para colar na tabular do Cap. 4).");
}

async function validacao() {
  const linhas = [["id", "descricao", "esperado", "obtido", "resultado"]];
  const registrar = (id, desc, esperado, obtido, ok) => {
    console.log(`${ok ? "OK    " : "FALHOU"} ${id} ${desc} (esperado ${esperado}, obtido ${obtido})`);
    linhas.push([id, desc, esperado, obtido, ok ? "aprovado" : "reprovado"]);
  };
  const lat = LOCAIS[0].lat, lon = LOCAIS[0].lon;

  const casos = [
    ["V01", "Consulta válida", `/api/score?lat=${lat}&lon=${lon}&radius=${RADIUS}`, 200],
    ["V02", "Latitude ausente", `/api/score?lon=${lon}&radius=${RADIUS}`, 400],
    ["V03", "Latitude fora da faixa (999)", `/api/score?lat=999&lon=${lon}&radius=${RADIUS}`, 400],
    ["V04", "Longitude fora da faixa (500)", `/api/score?lat=${lat}&lon=500&radius=${RADIUS}`, 400],
    ["V05", "Raio abaixo do mínimo (50 m)", `/api/score?lat=${lat}&lon=${lon}&radius=50`, 400],
    ["V06", "Raio acima do máximo (3000 m)", `/api/score?lat=${lat}&lon=${lon}&radius=3000`, 400],
    ["V07", "Parâmetro não numérico", `/api/score?lat=abc&lon=${lon}&radius=${RADIUS}`, 400],
  ];
  for (const [id, desc, path, esperado] of casos) {
    const r = await chamar(path);
    registrar(id, desc, esperado, r.status, r.status === esperado);
    await sleep(PAUSE_MS);
  }

  // Cache: repetir a consulta válida deve devolver HIT.
  const c = await chamar(`/api/score?lat=${lat}&lon=${lon}&radius=${RADIUS}`);
  registrar("V08", "Repetição da consulta usa cache", "HIT", c.headers.cache, c.headers.cache === "HIT");

  // Geocodificação (apenas registra; o esperado depende do Nominatim).
  await sleep(PAUSE_MS);
  const g = await chamar(`/api/geocode?q=${encodeURIComponent("Araraquara SP")}`);
  registrar("V09", "Busca de endereço retorna resultados", "200 e lista não vazia",
    `${g.status}, ${Array.isArray(g.body) ? g.body.length : "?"} itens`,
    g.status === 200 && Array.isArray(g.body) && g.body.length > 0);

  // Rate limit: espera a janela de 1 min esvaziar e dispara 12 consultas seguidas.
  console.log("\nAguardando 65 s para zerar a janela do rate limit...");
  await sleep(65000);
  const codigos = [];
  let retryAfter = null;
  for (let i = 0; i < 12; i++) {
    const r = await chamar(`/api/score?lat=${lat}&lon=${lon}&radius=${RADIUS}`);
    codigos.push(r.status);
    if (r.status === 429 && retryAfter === null) retryAfter = r.headers.retry;
  }
  console.log("Códigos:", codigos.join(" "));
  const ok200 = codigos.filter((s) => s === 200).length;
  const ok429 = codigos.filter((s) => s === 429).length;
  registrar("V10", "Excesso de consultas por IP retorna 429 (limite padrão: 10/min)",
    "10 x 200 e 2 x 429", `${ok200} x 200 e ${ok429} x 429`, ok200 === 10 && ok429 === 2);
  registrar("V11", "Resposta 429 traz cabeçalho Retry-After", "presente", retryAfter ?? "ausente", retryAfter !== null);

  writeFileSync("validacao.csv", linhas.map((r) => r.map(csv).join(",")).join("\n"));
  console.log("\nGerado: validacao.csv (use como base do Apêndice B).");
}

if (process.argv[2] === "validacao") await validacao();
else await cenarios();