// Funzione server di Vercel: storico mensile dei prezzi da Alpha Vantage.
// POST { symbols: ["SWDA.LON", ...] }  -> prezzi di chiusura mensili rettificati
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
  const v = { symbol, adjusted, points, info: String(meta["1. Information"] || ""), source: "Alpha Vantage" };
  cache.set("m:" + symbol, { t: Date.now(), v });
  return v;
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

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Usa una richiesta POST." }); return; }
  const key = process.env.ALPHAVANTAGE_API_KEY;
  if (!key) { res.status(500).json({ error: "La chiave di Alpha Vantage non è configurata sul server." }); return; }
  const allowed = (process.env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
  if (allowed.length && !allowed.includes(req.headers.origin || "")) { res.status(403).json({ error: "Richiesta da un sito non autorizzato." }); return; }

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
