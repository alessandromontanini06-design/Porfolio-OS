// Funzione server di Vercel: dati macro ufficiali per il periodo del dataset.
// - BCE (sempre, nessuna chiave): Euribor 3 mesi e indice dei prezzi HICP dell'area euro.
// - FRED (facoltativo, chiave gratuita in FRED_API_KEY): T-bill USA a 3 mesi e indice CPI USA.
// GET /api/rates?from=2010-01&to=2024-12

const ECB = "https://data-api.ecb.europa.eu/service/data";
const SERIES_ECB = {
  rf: { flow: "FM", key: "M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA", name: "Euribor 3 mesi (media mensile)", unit: "% annuo" },
  cpi: { flow: "ICP", key: "M.U2.N.000000.4.INX", name: "HICP area euro, indice generale", unit: "indice 2015 = 100" }
};
const SERIES_FRED = {
  rf: { id: "TB3MS", name: "T-bill USA 3 mesi (media mensile)", unit: "% annuo" },
  cpi: { id: "CPIAUCSL", name: "CPI USA, tutti gli articoli", unit: "indice 1982-84 = 100" }
};
const cache = new Map();
const TTL = 12 * 60 * 60 * 1000;
const YM = /^(19|20)\d{2}-(0[1-9]|1[0-2])$/;

async function ecbSeries(s, from, to) {
  const url = `${ECB}/${s.flow}/${s.key}?format=csvdata&detail=dataonly&startPeriod=${from}&endPeriod=${to}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`BCE ${r.status}`);
  const lines = (await r.text()).trim().split(/\r?\n/);
  const head = lines.shift().split(",");
  const iP = head.indexOf("TIME_PERIOD"), iV = head.indexOf("OBS_VALUE");
  const points = lines.map(l => l.split(",")).map(c => ({ p: c[iP], v: Number(c[iV]) })).filter(x => YM.test(x.p) && Number.isFinite(x.v));
  return { name: s.name, unit: s.unit, source: "BCE · data-api.ecb.europa.eu", series: `${s.flow}.${s.key}`, points };
}

async function fredSeries(s, from, to, key) {
  const end = new Date(Date.UTC(+to.slice(0, 4), +to.slice(5, 7), 0)).toISOString().slice(0, 10);
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}&api_key=${encodeURIComponent(key)}&file_type=json&observation_start=${from}-01&observation_end=${end}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`FRED ${r.status}`);
  const j = await r.json();
  const points = (j.observations || []).map(o => ({ p: String(o.date).slice(0, 7), v: Number(o.value) })).filter(x => YM.test(x.p) && Number.isFinite(x.v));
  return { name: s.name, unit: s.unit, source: "FRED · Federal Reserve Bank of St. Louis", series: s.id, points };
}

export default async function handler(req, res) {
  if (req.method !== "GET") { res.status(405).json({ error: "Usa una richiesta GET." }); return; }
  const from = String(req.query.from || ""), to = String(req.query.to || "");
  if (!YM.test(from) || !YM.test(to) || from > to) { res.status(400).json({ error: "Periodo non valido: usa from=AAAA-MM e to=AAAA-MM." }); return; }

  const id = `${from}_${to}`, hit = cache.get(id);
  if (hit && Date.now() - hit.t < TTL) { res.setHeader("Cache-Control", "s-maxage=43200, stale-while-revalidate=86400"); res.status(200).json(hit.data); return; }

  const out = { from, to, ecb: null, fred: null, errors: [] };
  const fredKey = process.env.FRED_API_KEY;
  const jobs = [
    Promise.all([ecbSeries(SERIES_ECB.rf, from, to), ecbSeries(SERIES_ECB.cpi, from, to)])
      .then(([rf, cpi]) => { out.ecb = { rf, cpi }; })
      .catch(e => { out.errors.push(`Dati BCE non disponibili (${e.message}).`); })
  ];
  if (fredKey) jobs.push(
    Promise.all([fredSeries(SERIES_FRED.rf, from, to, fredKey), fredSeries(SERIES_FRED.cpi, from, to, fredKey)])
      .then(([rf, cpi]) => { out.fred = { rf, cpi }; })
      .catch(e => { out.errors.push(`Dati FRED non disponibili (${e.message}).`); })
  );
  await Promise.all(jobs);
  if (!out.ecb && !out.fred) { res.status(502).json({ error: out.errors.join(" ") || "Dati macro non disponibili." }); return; }
  cache.set(id, { t: Date.now(), data: out });
  res.setHeader("Cache-Control", "s-maxage=43200, stale-while-revalidate=86400");
  res.status(200).json(out);
}
