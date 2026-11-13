// Funzione server di Vercel: storico mensile dei prezzi.
// Fonte principale: Yahoo Finance (nessuna chiave, quasi tutte le borse, Milano compresa, storici lunghi, chiusure rettificate).
// Riserva: Alpha Vantage, se Yahoo non risponde o non conosce il simbolo.
// Attenzione: l'interfaccia di Yahoo usata qui non è un servizio ufficiale e può cambiare o bloccarsi senza preavviso.
// GET  ?symbol=SWDA.LON                -> prezzi di chiusura mensili rettificati (con cache di Vercel)
// POST { symbols: ["SWDA.LON", ...] }  -> più serie insieme (compatibilità)
// POST { search: "SWDA" }              -> simboli candidati
// La chiave resta sul server (ALPHAVANTAGE_API_KEY). I dati restano in memoria 24 ore,
// per non consumare le poche richieste giornaliere del piano gratuito.

const AV = "https://www.alphavantage.co/query";
const TTL = 24 * 60 * 60 * 1000;
const cache = new Map();
const SYM = /^[A-Z0-9][A-Z0-9.\-]{0,19}$/;
const wait = ms => new Promise(r => setTimeout(r, ms));

async function av(params, key) {
  const url = `${AV}?${new URLSearchParams({ ...params, apikey: key })}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Alpha Vantage ${r.status}`);
  const j = await r.json();
  if (j["Error Message"]) return { error: "simbolo non trovato" };
  if (j.Note || j.Information) return { error: "limite", detail: String(j.Note || j.Information) };
  return { data: j };
}

/* ---------- Yahoo Finance ---------- */
// simboli del sito (formato Alpha Vantage) → simboli di Yahoo
const Y_SUFFIX = { LON: "L", DEX: "DE", ETR: "DE", FRK: "F", PAR: "PA", AMS: "AS", MIL: "MI", MI: "MI", SWX: "SW", TRT: "TO", BRU: "BR", LIS: "LS", MCE: "MC", VIE: "VI", HEL: "HE", DUB: "IR" };
function toYahoo(symbol) {
  const m = symbol.match(/^(.+)\.([A-Z]{1,4})$/);
  if (!m) return symbol;
  return Y_SUFFIX[m[2]] ? `${m[1]}.${Y_SUFFIX[m[2]]}` : symbol;
}
async function yahoo(symbol) {
  // con range=max Yahoo dirada a punti trimestrali gli storici lunghi: con un intervallo di date esplicito resta mensile
  const ys = toYahoo(symbol), q = `period1=0&period2=${Math.floor(Date.now() / 1000)}&interval=1mo&includeAdjustedClose=true&events=div%2Csplit`;
  let j = null, last = "";
  for (const host of ["query1", "query2"]) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ys)}?${q}`, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
      if (r.status === 404) return { error: "simbolo non trovato" };
      if (!r.ok) { last = `Yahoo ${r.status}`; continue; }
      j = await r.json(); break;
    } catch (e) { last = e.name === "TimeoutError" ? "Yahoo lento" : "Yahoo non raggiungibile"; }
  }
  if (!j) return { error: last || "Yahoo non disponibile" };
  const res = j.chart && j.chart.result && j.chart.result[0];
  if (!res || !res.timestamp) return { error: "simbolo non trovato" };
  const adj = res.indicators && res.indicators.adjclose && res.indicators.adjclose[0] && res.indicators.adjclose[0].adjclose;
  const close = res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close;
  const vals = adj && adj.some(v => v != null) ? adj : close, off = (res.meta && res.meta.gmtoffset) || 0, today = new Date().toISOString().slice(0, 10);
  const byMonth = new Map();
  res.timestamp.forEach((t, i) => {
    const v = vals && vals[i];
    if (!(Number.isFinite(v) && v > 0)) return;
    // inizio mese in ora locale della borsa: con l'ora legale cadrebbe nel mese prima, mezza giornata di margine lo evita
    const dt = new Date((t + off + 43200) * 1000), y = dt.getUTCFullYear(), mo = dt.getUTCMonth();
    const end = new Date(Date.UTC(y, mo + 1, 0)).toISOString().slice(0, 10);
    byMonth.set(`${y}-${String(mo + 1).padStart(2, "0")}`, { d: end < today ? end : today, v: +v.toFixed(6) }); // l'ultimo valore del mese vince
  });
  const points = [...byMonth.values()].sort((a, b) => (a.d < b.d ? -1 : 1));
  if (points.length < 2) return { error: "storico vuoto" };
  let cur = String((res.meta && res.meta.currency) || "").trim();
  if (cur === "GBp" || cur === "GBX") cur = "GBX"; else cur = cur.toUpperCase();
  return { data: { points, currency: cur || null, adjusted: vals === adj, yahoo: ys, name: (res.meta && (res.meta.longName || res.meta.shortName)) || null, exchange: (res.meta && res.meta.fullExchangeName) || null } };
}

async function monthly(symbol, key) {
  const hit = cache.get("m:" + symbol);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  const y = await yahoo(symbol);
  if (y.data) {
    const v = { symbol, adjusted: y.data.adjusted, points: y.data.points, currency: y.data.currency, currencySource: "Yahoo Finance", info: y.data.name ? `${y.data.name}${y.data.exchange ? " · " + y.data.exchange : ""}` : "", source: "Yahoo Finance", yahoo: y.data.yahoo };
    if (v.currency) cache.set("m:" + symbol, { t: Date.now(), v });
    return v;
  }
  if (!key) return { symbol, error: y.error === "simbolo non trovato" ? `Simbolo ${symbol} non trovato.` : `Prezzi non disponibili per ${symbol} (${y.error}).` };
  let res = await av({ function: "TIME_SERIES_MONTHLY_ADJUSTED", symbol }, key);
  let adjusted = true;
  if (res.error === "limite" && /premium/i.test(res.detail || "")) {
    res = await av({ function: "TIME_SERIES_MONTHLY", symbol }, key);
    adjusted = false;
  }
  if (res.error) return { symbol, error: res.error === "limite" ? "Limite giornaliero di Alpha Vantage raggiunto: riprova domani o tra un minuto." : `Simbolo ${symbol} non trovato.` };
  const ts = res.data["Monthly Adjusted Time Series"] || res.data["Monthly Time Series"] || {};
  const points = Object.entries(ts)
    .map(([d, o]) => ({ d, v: Number(o["5. adjusted close"] || o["4. close"]) }))
    .filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.d) && Number.isFinite(x.v) && x.v > 0)
    .sort((a, b) => (a.d < b.d ? -1 : 1));
  if (!points.length) return { symbol, error: `Nessun prezzo disponibile per ${symbol}.` };
  const meta = res.data["Meta Data"] || {};
  const cur = await currencyOf(symbol, key);
  const v = { symbol, adjusted, points, currency: cur.currency, currencySource: cur.from, info: String(meta["1. Information"] || ""), source: "Alpha Vantage" };
  if (cur.currency) cache.set("m:" + symbol, { t: Date.now(), v }); // senza valuta non si conserva: al prossimo giro si riprova
  return v;
}

// Valuta di quotazione: dalla borsa quando è certa, altrimenti dalla ricerca di Alpha Vantage.
// Londra quota ETF in sterline, pence (GBX) o dollari: lì serve la ricerca.
const EUR_X = /\.(DEX|FRK|ETR|PAR|AMS|MIL|MCE|BRU|LIS|VIE|HEL|DUB)$/;
async function currencyOf(symbol, key) {
  if (EUR_X.test(symbol)) return { currency: "EUR", from: "borsa" };
  if (/\.(SWX|SW)$/.test(symbol)) return { currency: "CHF", from: "borsa" };
  if (/\.TRT$/.test(symbol)) return { currency: "CAD", from: "borsa" };
  if (!symbol.includes(".")) return { currency: "USD", from: "borsa" };
  // la ricerca subito dopo lo storico può cadere nel limite al minuto: un secondo tentativo dopo una pausa
  for (let k = 0; k < 2; k++) {
    try {
      const s = await search(symbol.split(".")[0], key);
      const m = (s.matches || []).find(x => String(x.symbol).toUpperCase() === symbol);
      if (m && m.currency) return { currency: String(m.currency).toUpperCase(), from: "ricerca Alpha Vantage" };
      if (!s.error) break;
    } catch {}
    await wait(1500);
  }
  return { currency: null, from: "sconosciuta" };
}

async function search(q, key) {
  const hit = cache.get("s:" + q);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  const res = await av({ function: "SYMBOL_SEARCH", keywords: q }, key);
  if (res.error) return { error: res.error === "limite" ? "Limite giornaliero di Alpha Vantage raggiunto." : "Nessun risultato." };
  const v = { matches: (res.data.bestMatches || []).slice(0, 8).map(m => ({ symbol: m["1. symbol"], name: m["2. name"], type: m["3. type"], region: m["4. region"], currency: m["8. currency"] })) };
  cache.set("s:" + q, { t: Date.now(), v });
  return v;
}

// La richiesta arriva dal tuo sito? Per i POST il browser manda "Origin"; per i GET dello stesso sito
// manda "Sec-Fetch-Site: same-origin" e il "Referer".
function fromOwnSite(req, allowed) {
  if (!allowed.length) return true;
  const h = req.headers;
  if (allowed.includes(h.origin || "")) return true;
  if (h["sec-fetch-site"] === "same-origin") return true;
  return allowed.some(a => String(h.referer || "").startsWith(a + "/"));
}

export default async function handler(req, res) {
  const key = process.env.ALPHAVANTAGE_API_KEY;
  const allowed = (process.env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
  const noStore = () => res.setHeader("Cache-Control", "no-store");

  // GET /api/prices?symbol=SWDA.LON  ->  una serie, conservata 24 ore dalla rete di Vercel
  // e servita a tutti i visitatori: ogni ETF consuma al massimo una richiesta al giorno.
  if (req.method === "GET") {
    const symbol = String((req.query && req.query.symbol) || "").trim().toUpperCase();
    if (!SYM.test(symbol)) { noStore(); res.status(400).json({ symbol, error: "Simbolo non valido, per esempio SWDA.LON." }); return; }
    if (!fromOwnSite(req, allowed)) { noStore(); res.status(403).json({ symbol, error: "Richiesta da un sito non autorizzato." }); return; }
    try {
      const s = await monthly(symbol, key);
      if (s.error) { noStore(); res.status(/Limite/.test(s.error) ? 429 : 404).json(s); return; }
      res.setHeader("Cache-Control", s.currency ? "public, s-maxage=86400, stale-while-revalidate=172800" : "public, s-maxage=120");
      res.status(200).json(s);
    } catch {
      noStore(); res.status(502).json({ symbol, error: "Non riesco a contattare le fonti dei prezzi. Riprova tra poco." });
    }
    return;
  }

  noStore();
  if (req.method !== "POST") { res.status(405).json({ error: "Usa GET o POST." }); return; }
  if (!key) { res.status(500).json({ error: "La chiave di Alpha Vantage non è configurata sul server." }); return; }
  if (!fromOwnSite(req, allowed)) { res.status(403).json({ error: "Richiesta da un sito non autorizzato." }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    if (typeof body.search === "string") {
      const q = body.search.trim().slice(0, 40);
      if (!q) { res.status(400).json({ error: "Testo di ricerca vuoto." }); return; }
      res.status(200).json(await search(q, key));
      return;
    }
    const symbols = Array.isArray(body.symbols) ? [...new Set(body.symbols.map(s => String(s).trim().toUpperCase()))] : [];
    if (!symbols.length || symbols.length > 10 || !symbols.every(s => SYM.test(s))) { res.status(400).json({ error: "Indica da 1 a 10 simboli validi, per esempio SWDA.LON." }); return; }
    const out = [];
    for (const s of symbols) {
      const fromCache = cache.has("m:" + s);
      out.push(await monthly(s, key));
      if (!fromCache) await wait(1200); // rispetta i limiti al minuto del piano gratuito
    }
    res.status(200).json({ series: out });
  } catch (e) {
    res.status(502).json({ error: "Non riesco a contattare Alpha Vantage. Riprova tra poco." });
  }
}
