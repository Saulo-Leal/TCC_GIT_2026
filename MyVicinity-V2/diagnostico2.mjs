// diagnostico2.mjs — compara 3 formas de escrever a consulta na Overpass principal.
// Uso: docker compose run --rm tests node diagnostico2.mjs

const SERVIDOR = process.env.SERVIDOR ?? "https://overpass-api.de/api/interpreter";
const PONTO = { nome: "Centro de Araraquara", lat: -21.7946, lon: -48.1756 };
const RAIO_M = 1000;

const TAGS = {
  amenity: ["bus_station", "parking", "fuel", "kindergarten", "school", "university", "restaurant",
    "pharmacy", "hospital", "clinic", "veterinary", "dentist", "doctors", "police", "townhall",
    "post_office", "library", "place_of_worship"],
  shop: ["supermarket", "convenience", "bakery", "clothes"],
  highway: ["bus_stop"],
  emergency: ["ambulance_station"],
  place: ["square"],
  leisure: ["fitness_centre"],
};

const dLat = RAIO_M / 111320;
const dLon = RAIO_M / (111320 * Math.cos((PONTO.lat * Math.PI) / 180));
const bbox = `${PONTO.lat - dLat},${PONTO.lon - dLon},${PONTO.lat + dLat},${PONTO.lon + dLon}`;
const cab = "[out:json][timeout:60];\n(\n";
const rod = "\n);\nout center qt;";

const regex = Object.entries(TAGS)
  .map(([k, v]) => `  nwr["${k}"~"^(${v.join("|")})$"](${bbox});`).join("\n");
const exato = (tipo) => Object.entries(TAGS)
  .flatMap(([k, v]) => v.map((x) => `  ${tipo}["${k}"="${x}"](${bbox});`)).join("\n");

const VARIANTES = [
  { nome: "A) regex (consulta atual do app)", q: cab + regex + rod },
  { nome: "B) valores exatos, nwr", q: cab + exato("nwr") + rod },
  { nome: "C) valores exatos, só nós e vias (nw)", q: cab + exato("nw") + rod },
];

console.log(`Servidor: ${SERVIDOR}\nPonto: ${PONTO.nome}\n`);
for (const v of VARIANTES) {
  const t0 = performance.now();
  try {
    const res = await fetch(SERVIDOR, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "MyVicinity-diagnostico/1.0 (TCC UNIP)",
      },
      body: "data=" + encodeURIComponent(v.q),
      signal: AbortSignal.timeout(90000),
    });
    const ms = Math.round(performance.now() - t0);
    const texto = await res.text();
    let info;
    try {
      const j = JSON.parse(texto);
      info = `${j.elements?.length ?? "?"} elementos${j.remark ? " | REMARK: " + j.remark : ""}`;
    } catch { info = "corpo não-JSON: " + texto.replace(/\s+/g, " ").slice(0, 100); }
    console.log(`${v.nome.padEnd(42)} HTTP ${res.status}  ${String(ms).padStart(6)} ms  ${info}`);
  } catch (e) {
    console.log(`${v.nome.padEnd(42)} ERRO  ${Math.round(performance.now() - t0)} ms  ${e.name}`);
  }
  await new Promise((r) => setTimeout(r, 15000));
}