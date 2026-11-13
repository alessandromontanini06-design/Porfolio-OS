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
/* errori di un solo punto: il prezzo salta e il punto dopo torna dov'era (tipico dei dati di Yahoo).
   Si scarta il punto se il salto supera la soglia, il successivo va nel verso opposto e il ritorno annulla quasi tutto il salto. */
function dropSpikes(pts, thr) {
  let removed = 0;
  for (let pass = 0; pass < 3; pass++) {
    const keep = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = keep[keep.length - 1].v, a1 = pts[i].v / prev, a2 = pts[i + 1].v / pts[i].v, back = pts[i + 1].v / prev;
      if (Math.abs(Math.log(a1)) > Math.log(1 + thr) && Math.abs(Math.log(a2)) > Math.log(1 + thr) && Math.sign(a1 - 1) !== Math.sign(a2 - 1) && Math.abs(Math.log(back)) < Math.abs(Math.log(a1)) / 3) { removed++; continue; }
      keep.push(pts[i]);
    }
    if (pts.length > 1) keep.push(pts[pts.length - 1]);
    pts = keep;
  }
  return { pts, removed };
}
/* volatilità annualizzata dei rendimenti giornalieri negli ultimi N anni (come i siti di ETF: √252) */
function volWindow(pts, years) {
  const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - years); const from = d.toISOString().slice(0, 10);
  if (!pts.length || pts[0].d > from) return null; // storico più corto della finestra
  const r = []; for (let i = 1; i < pts.length; i++) if (pts[i].d > from) r.push(pts[i].v / pts[i - 1].v - 1);
  if (r.length < 30) return null;
  const m = r.reduce((s, x) => s + x, 0) / r.length;
  return +(Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(252)).toFixed(6);
}
async function yahooRaw(ys, interval) {
  const q = `period1=0&period2=${Math.floor(Date.now() / 1000)}&interval=${interval}&includeAdjustedClose=true&events=div%2Csplit`;
  let last = "";
  for (const host of ["query1", "query2"]) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ys)}?${q}`, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
      if (r.status === 404) return { error: "simbolo non trovato" };
      if (!r.ok) { last = `Yahoo ${r.status}`; continue; }
      const j = await r.json(), res = j.chart && j.chart.result && j.chart.result[0];
      if (!res || !res.timestamp) return { error: "simbolo non trovato" };
      const adj = res.indicators && res.indicators.adjclose && res.indicators.adjclose[0] && res.indicators.adjclose[0].adjclose;
      const close = res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close;
      const vals = adj && adj.some(v => v != null) ? adj : close, off = (res.meta && res.meta.gmtoffset) || 0;
      // l'ora della borsa con l'ora legale può cadere nel giorno (o mese) prima: mezza giornata di margine lo evita
      const pts = res.timestamp.map((t, i) => ({ d: new Date((t + off + 43200) * 1000).toISOString().slice(0, 10), v: vals && vals[i] })).filter(p => Number.isFinite(p.v) && p.v > 0);
      return { res, pts, adjusted: vals === adj };
    } catch (e) { last = e.name === "TimeoutError" ? "Yahoo lento" : "Yahoo non raggiungibile"; }
  }
  return { error: last || "Yahoo non disponibile" };
}
// Prezzi giornalieri ripuliti dagli errori di un giorno → fine mese = ultimo prezzo valido del mese.
// Le barre mensili di Yahoo hanno errori propri (salti finti a fine anno): si usano solo se i giornalieri non ci sono.
async function yahoo(symbol) {
  const ys = toYahoo(symbol), today = new Date().toISOString().slice(0, 10);
  let raw = await yahooRaw(ys, "1d"), daily = true;
  if (raw.error === "simbolo non trovato") return raw;
  if (raw.error || raw.pts.length < 40) { raw = await yahooRaw(ys, "1mo"); daily = false; if (raw.error) return raw; }
  const clean = dropSpikes(raw.pts, daily ? 0.08 : 0.2), byMonth = new Map();
  clean.pts.forEach(p => byMonth.set(p.d.slice(0, 7), p));
  const points = [...byMonth.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([m, p]) => {
    const [y, mo] = m.split("-").map(Number), end = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
    return { d: end < today ? end : today, v: +p.v.toFixed(6) };
  });
  if (points.length < 2) return { error: "storico vuoto" };
  const res = raw.res;
  let cur = String((res.meta && res.meta.currency) || "").trim();
  if (cur === "GBp" || cur === "GBX") cur = "GBX"; else cur = cur.toUpperCase();
  const vol = daily ? { y1: volWindow(clean.pts, 1), y3: volWindow(clean.pts, 3), y5: volWindow(clean.pts, 5), from: "rendimenti giornalieri", removed: clean.removed } : { removed: clean.removed, from: "rendimenti mensili" };
  return { data: { points, currency: cur || null, adjusted: raw.adjusted, yahoo: ys, vol, name: (res.meta && (res.meta.longName || res.meta.shortName)) || null, exchange: (res.meta && res.meta.fullExchangeName) || null } };
}

async function monthly(symbol, key) {
  const hit = cache.get("m:" + symbol);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  const y = await yahoo(symbol);
  if (y.data) {
    const v = { symbol, adjusted: y.data.adjusted, points: y.data.points, currency: y.data.currency, currencySource: "Yahoo Finance", info: y.data.name ? `${y.data.name}${y.data.exchange ? " · " + y.data.exchange : ""}` : "", source: "Yahoo Finance", yahoo: y.data.yahoo, vol: y.data.vol };
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
