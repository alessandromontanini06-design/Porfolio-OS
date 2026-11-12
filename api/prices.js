// Funzione server di Vercel: storico mensile dei prezzi da Alpha Vantage.
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

async function monthly(symbol, key) {
  const hit = cache.get("m:" + symbol);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
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
  cache.set("m:" + symbol, { t: Date.now(), v });
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
  try {
    const s = await search(symbol.split(".")[0], key);
    const m = (s.matches || []).find(x => String(x.symbol).toUpperCase() === symbol);
    if (m && m.currency) return { currency: String(m.currency).toUpperCase(), from: "ricerca Alpha Vantage" };
  } catch {}
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
    if (!key) { noStore(); res.status(500).json({ symbol, error: "La chiave di Alpha Vantage non è configurata sul server." }); return; }
    if (!fromOwnSite(req, allowed)) { noStore(); res.status(403).json({ symbol, error: "Richiesta da un sito non autorizzato." }); return; }
    try {
      const s = await monthly(symbol, key);
      if (s.error) { noStore(); res.status(/Limite/.test(s.error) ? 429 : 404).json(s); return; }
      res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=172800");
      res.status(200).json(s);
    } catch {
      noStore(); res.status(502).json({ symbol, error: "Non riesco a contattare Alpha Vantage. Riprova tra poco." });
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
