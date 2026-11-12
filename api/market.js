// Funzione server di Vercel: dati giornalieri reali per BLACK SWAN, già allineati e convertiti in euro.
// GET /api/market?crisis=gfc  ->  { dates, assets: { eq_us, eq_eu, tech, bond, cash }, meta }
//
// Fonti (gratuite, nessuna chiave):
// - BCE: Euribor 3 mesi per la liquidità in euro e la copertura del cambio delle obbligazioni.
// - Kenneth R. French Data Library, Dartmouth (Fama-French): mercato azionario USA (CRSP, rendimento totale) e Europa
//   (Bloomberg, rendimento totale in dollari), più il T-bill a 1 mese. Rendimenti giornalieri = (Mkt-RF) + RF.
// - FRED, Federal Reserve Bank of St. Louis: Nasdaq-100 (NASDAQ100, solo prezzo), Treasury 10 anni (DGS10, rendimento),
//   cambio dollari per euro (DEXUSEU).
// Tutti i rendimenti in dollari sono convertiti in euro: (1 + r$) · (cambio_ieri / cambio_oggi) − 1.
// Le serie storiche non cambiano: la rete di Vercel le conserva 7 giorni.
import zlib from "node:zlib";

const FF = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/";
const FRED = id => `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`;
/* finestre di gioco: qualche settimana prima del picco, fino a circa tre anni dopo il minimo */
const WINDOWS = {
  dotcom: { from: "2000-01-03", to: "2005-09-30", name: "Bolla dot-com" },
  gfc: { from: "2007-07-02", to: "2012-02-29", name: "Crisi finanziaria 2008" },
  euro: { from: "2011-01-03", to: "2014-09-30", name: "Crisi del debito euro" },
  covid: { from: "2019-11-01", to: "2023-03-31", name: "Crollo COVID-19" },
  infl: { from: "2021-09-01", to: "2025-09-30", name: "Shock inflazione 2022" }
};
const cache = new Map();
const TTL = 24 * 60 * 60 * 1000;

async function get(url, binary) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  const r = await fetch(url, { signal: AbortSignal.timeout(25_000), headers: { "User-Agent": "PortfolioOS/1.0 (dati per un gioco educativo)" } });
  if (!r.ok) throw new Error(`${new URL(url).hostname} ${r.status}`);
  const v = binary ? Buffer.from(await r.arrayBuffer()) : await r.text();
  cache.set(url, { t: Date.now(), v });
  return v;
}
// legge il primo file di un archivio ZIP (formato standard, metodo deflate)
function unzipFirst(buf) {
  const sig = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (sig < 0) throw new Error("archivio ZIP non valido");
  const method = buf.readUInt16LE(sig + 8), size = buf.readUInt32LE(sig + 18), nl = buf.readUInt16LE(sig + 26), el = buf.readUInt16LE(sig + 28);
  const data = buf.subarray(sig + 30 + nl + el, sig + 30 + nl + el + size);
  return (method === 8 ? zlib.inflateRawSync(data) : data).toString("latin1");
}
const iso = d8 => `${d8.slice(0, 4)}-${d8.slice(4, 6)}-${d8.slice(6, 8)}`;
/* Fama-French giornaliero: mappa data → { mkt: Mkt-RF + RF, rf } in decimali; si ferma alla prima tabella */
function parseFF(txt) {
  const out = new Map();
  for (const line of txt.split(/\r?\n/)) {
    const c = line.split(",").map(s => s.trim());
    if (!/^\d{8}$/.test(c[0])) { if (out.size) break; continue; }
    const mkt = Number(c[1]), rf = Number(c[c.length - 1]);
    if (Number.isFinite(mkt) && Number.isFinite(rf) && mkt > -99) out.set(iso(c[0]), { mkt: (mkt + rf) / 100, rf: rf / 100 });
  }
  return out;
}
function parseFred(txt) {
  const out = new Map();
  // attenzione: nei giorni festivi FRED lascia il valore vuoto (o "."), che Number() leggerebbe come 0
  for (const line of txt.trim().split(/\r?\n/).slice(1)) { const [d, v] = line.split(","); const s = String(v || "").trim(); if (!s || s === ".") continue; const x = Number(s); if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(x)) out.set(d, x); }
  return out;
}
/* Euribor 3 mesi mensile (BCE): tasso del mese, maturato giorno per giorno sui giorni di borsa */
async function euribor() {
  const t = await get("https://data-api.ecb.europa.eu/service/data/FM/M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA?format=csvdata&detail=dataonly&startPeriod=1999-01");
  const lines = t.trim().split(/\r?\n/), h = lines.shift().split(","), iP = h.indexOf("TIME_PERIOD"), iV = h.indexOf("OBS_VALUE"), m = new Map();
  for (const l of lines) { const c = l.split(","), v = Number(c[iV]); if (/^\d{4}-\d{2}$/.test(c[iP]) && Number.isFinite(v)) m.set(c[iP], v / 100); }
  return m;
}
/* Treasury a 10 anni ricostruito dal rendimento: interessi del giorno − duration modificata · Δy + ½ · convessità · Δy² */
function bondReturn(y0, y1) {
  const y = y0 / 100, dy = (y1 - y0) / 100, h = y / 2;
  const D = h > 0 ? (1 - Math.pow(1 + h, -20)) / y : 10, C = D * D + D / 2;
  return y / 252 - D * dy + 0.5 * C * dy * dy;
}

export default async function handler(req, res) {
  if (req.method !== "GET") { res.status(405).json({ error: "Usa una richiesta GET." }); return; }
  const id = String((req.query && req.query.crisis) || "");
  const W = WINDOWS[id];
  if (!W) { res.status(400).json({ error: `Crisi sconosciuta. Disponibili: ${Object.keys(WINDOWS).join(", ")}.` }); return; }
  try {
    const [us, eu, ndx, dgs, fx, eur] = await Promise.all([
      get(FF + "F-F_Research_Data_Factors_daily_CSV.zip", true).then(unzipFirst).then(parseFF),
      get(FF + "Europe_3_Factors_Daily_CSV.zip", true).then(unzipFirst).then(parseFF),
      get(FRED("NASDAQ100")).then(parseFred),
      get(FRED("DGS10")).then(parseFred),
      get(FRED("DEXUSEU")).then(parseFred),
      euribor()
    ]);
    /* calendario: i giorni di borsa USA nella finestra (con cambio disponibile) */
    const days = [...us.keys()].filter(d => d >= W.from && d <= W.to).sort();
    if (days.length < 100) throw new Error("dati insufficienti per la finestra richiesta");
    const pick = (map, d, prev) => (map.has(d) ? map.get(d) : prev);
    let fx0 = null, y0 = null, n0 = null;
    // valori del giorno precedente l'inizio, per il primo rendimento
    for (const d of [...fx.keys()].filter(x => x < days[0]).slice(-1)) fx0 = fx.get(d);
    for (const d of [...dgs.keys()].filter(x => x < days[0]).slice(-1)) y0 = dgs.get(d);
    for (const d of [...ndx.keys()].filter(x => x < days[0]).slice(-1)) n0 = ndx.get(d);
    const A = { eq_us: [], eq_eu: [], tech: [], bond: [], cash: [] }, fxs = [], miss = { eq_eu: 0, tech: 0, fx: 0 };
    for (const d of days) {
      const fx1 = pick(fx, d, fx0); if (!fx.has(d)) miss.fx++;
      const conv = fx0 && fx1 ? fx0 / fx1 : 1, toEur = r => (1 + r) * conv - 1;
      const u = us.get(d);
      A.eq_us.push(toEur(u.mkt));
      if (eu.has(d)) A.eq_eu.push(toEur(eu.get(d).mkt)); else { A.eq_eu.push(conv - 1); miss.eq_eu++; } // borsa europea chiusa: solo il cambio
      const n1 = pick(ndx, d, n0); if (!ndx.has(d)) miss.tech++;
      A.tech.push(toEur(n0 && n1 ? n1 / n0 - 1 : 0));
      /* liquidità in euro all'Euribor del mese; Treasury coperto dal cambio: rendimento in $ + (tasso € − tasso $) */
      const eRate = eur.get(d.slice(0, 7)) ?? eur.get([...eur.keys()].filter(k => k <= d.slice(0, 7)).pop()) ?? 0, eDay = eRate / 252;
      const y1 = pick(dgs, d, y0); A.bond.push((y0 != null && y1 != null ? bondReturn(y0, y1) : 0) + eDay - u.rf);
      A.cash.push(eDay);
      fxs.push(fx1); fx0 = fx1; y0 = y1; n0 = n1;
    }
    const r6 = a => a.map(x => Math.round(x * 1e7) / 1e7);
    const out = {
      crisis: id, name: W.name, from: days[0], to: days[days.length - 1], dates: days,
      assets: {
        eq_us: { name: "Azioni USA", r: r6(A.eq_us), source: "Fama-French / CRSP, mercato USA, rendimento totale", note: "" },
        eq_eu: { name: "Azioni Europa", r: r6(A.eq_eu), source: "Fama-French / Bloomberg, mercato europeo, rendimento totale", note: `${miss.eq_eu} giorni di borsa europea chiusa: solo effetto cambio` },
        tech: { name: "Tecnologia USA", r: r6(A.tech), source: "FRED NASDAQ100, Nasdaq-100 (solo prezzo, senza dividendi)", note: `${miss.tech} giorni senza quotazione: rendimento 0` },
        bond: { name: "Treasury USA 10 anni (coperto dal cambio)", r: r6(A.bond), source: "FRED DGS10: prezzo ricostruito dal rendimento (duration e convessità), più differenziale Euribor − T-bill", note: "approssimazione di un titolo a 10 anni a scadenza costante, cambio coperto" },
        cash: { name: "Liquidità in euro", r: r6(A.cash), source: "BCE, Euribor 3 mesi (media mensile) maturato giorno per giorno", note: "" }
      },
      fx: fxs.map(x => (x == null ? null : Math.round(x * 1e4) / 1e4)),
      meta: { currency: "EUR", frequency: "giornaliera (giorni di borsa USA)", fx: "FRED DEXUSEU, dollari per 1 euro", missingFx: miss.fx, generated: new Date().toISOString().slice(0, 10) }
    };
    res.setHeader("Cache-Control", "public, s-maxage=604800, stale-while-revalidate=1209600");
    res.status(200).json(out);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: `Dati storici non disponibili in questo momento (${e.message}). Riprova tra poco.` });
  }
}
