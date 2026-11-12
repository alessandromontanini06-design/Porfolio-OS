// Funzione server di Vercel: cambio ufficiale BCE di fine mese (unità di valuta estera per 1 euro).
// GET /api/fx?ccy=USD  ->  { ccy, source, series, points: [{ p: "AAAA-MM", v }] } dal 1999
// Serve a riportare in euro i benchmark quotati in dollari. Nessuna chiave; cache di 24 ore.

const ECB = "https://data-api.ecb.europa.eu/service/data/EXR";
const CCY = /^(USD|GBP|CHF|JPY)$/;
const cache = new Map();
const TTL = 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== "GET") { res.status(405).json({ error: "Usa una richiesta GET." }); return; }
  const ccy = String((req.query && req.query.ccy) || "USD").toUpperCase();
  if (!CCY.test(ccy)) { res.status(400).json({ error: "Valuta non supportata: USD, GBP, CHF o JPY." }); return; }
  const hit = cache.get(ccy);
  if (hit && Date.now() - hit.t < TTL) { res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=172800"); res.status(200).json(hit.v); return; }
  try {
    const key = `M.${ccy}.EUR.SP00.E`;
    const r = await fetch(`${ECB}/${key}?format=csvdata&detail=dataonly&startPeriod=1999-01`, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`BCE ${r.status}`);
    const lines = (await r.text()).trim().split(/\r?\n/), head = lines.shift().split(",");
    const iP = head.indexOf("TIME_PERIOD"), iV = head.indexOf("OBS_VALUE");
    const points = lines.map(l => l.split(",")).map(c => ({ p: c[iP], v: Number(c[iV]) })).filter(x => /^\d{4}-\d{2}$/.test(x.p) && Number.isFinite(x.v) && x.v > 0);
    if (!points.length) throw new Error("serie vuota");
    const v = { ccy, source: "BCE · data-api.ecb.europa.eu", series: `EXR.${key}`, name: `${ccy} per 1 euro, fine mese`, points };
    cache.set(ccy, { t: Date.now(), v });
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=172800");
    res.status(200).json(v);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: `Cambio BCE non disponibile (${e.message}).` });
  }
}
