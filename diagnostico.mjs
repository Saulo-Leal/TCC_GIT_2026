// diagnostico.mjs — testa cada servidor Overpass com uma consulta parecida com a do app.
// Uso: docker compose run --rm tests node diagnostico.mjs
// (ou: node diagnostico.mjs)

const PONTOS = [
  { nome: "Centro de Araraquara", lat: -21.7946, lon: -48.1756 },
  { nome: "Periferia", lat: -21.719073, lon: -48.155116 },
  { nome: "UNIP (referência que funcionou)", lat: -21.7821371, lon: -48.1959471 },
];

const SERVIDORES = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

const TIMEOUT_SERVIDOR = 25; // segundos declarados na consulta
const TIMEOUT_CLIENTE = 40000; // ms

function consulta(lat, lon, raioM = 1000) {
  const dLat = raioM / 111320;
  const dLon = raioM / (111320 * Math.cos((lat * Math.PI) / 180));
  const bbox = `${lat - dLat},${lon - dLon},${lat + dLat},${lon + dLon}`;
  const tags = {
    amenity: "bus_station|parking|fuel|kindergarten|school|university|restaurant|pharmacy|hospital|clinic|veterinary|dentist|doctors|police|townhall|post_office|library|place_of_worship",
    shop: "supermarket|convenience|bakery|clothes",
    highway: "bus_stop",
    emergency: "ambulance_station",
    place: "square",
    leisure: "fitness_centre",
  };
  const partes = Object.entries(tags)
    .map(([k, v]) => `nwr["${k}"~"^(${v})$"](${bbox});`)
    .join("\n  ");
  return `[out:json][timeout:${TIMEOUT_SERVIDOR}];\n(\n  ${partes}\n);\nout center qt;`;
}

for (const p of PONTOS) {
  console.log(`\n=== ${p.nome}`);
  const q = consulta(p.lat, p.lon);
  for (const s of SERVIDORES) {
    const host = new URL(s).host;
    const t0 = performance.now();
    try {
      const res = await fetch(s, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "MyVicinity-diagnostico/1.0 (TCC UNIP)",
        },
        body: "data=" + encodeURIComponent(q),
        signal: AbortSignal.timeout(TIMEOUT_CLIENTE),
      });
      const ms = Math.round(performance.now() - t0);
      const texto = await res.text();
      let info = "";
      try {
        const j = JSON.parse(texto);
        info = `${j.elements?.length ?? "?"} elementos${j.remark ? " | REMARK: " + j.remark : ""}`;
      } catch {
        info = "corpo não-JSON: " + texto.replace(/\s+/g, " ").slice(0, 120);
      }
      console.log(`${host.padEnd(28)} HTTP ${res.status}  ${String(ms).padStart(6)} ms  ${info}`);
    } catch (e) {
      const ms = Math.round(performance.now() - t0);
      console.log(`${host.padEnd(28)} ERRO     ${String(ms).padStart(6)} ms  ${e.name}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}