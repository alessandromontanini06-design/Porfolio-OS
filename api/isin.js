// Funzione server: da ISIN a simbolo di borsa, con OpenFIGI (database pubblico degli identificativi finanziari, senza chiave).
// GET /api/isin?isin=IE00B4L5Y983,IE00BKM4GZ66   (fino a 10)
// Per ogni ISIN restituisce il simbolo nel formato di Alpha Vantage, preferendo le borse in euro (Amsterdam, Xetra, Parigi), poi Londra e Stati Uniti.
// controlli copiati da _lib/llm.js per non caricare gli SDK delle IA in questa funzione
function fromOwnSite(req) {
  const allowed = (process.env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!allowed.length) return true;
  const h = req.headers || {};
  return allowed.includes(h.origin || "") || h["sec-fetch-site"] === "same-origin" || allowed.some(a => String(h.referer || "").startsWith(a + "/"));
}
const hits = new Map();
function rateLimited(req, bucket, perHour) {
  const ip = String((req.headers || {})["x-forwarded-for"] || "").split(",")[0].trim() || "anonimo", k = bucket + ":" + ip, now = Date.now();
  const recent = (hits.get(k) || []).filter(t => now - t < 3600_000);
  if (recent.length >= perHour) return true;
  recent.push(now); hits.set(k, recent); return false;
}

const EXCH = { NA: ".AMS", GY: ".DEX", GR: ".DEX", GF: ".DEX", FP: ".PAR", LN: ".LON", US: "", UN: "", UW: "", UQ: "", UA: "", UP: "" };
const ORDER = ["NA", "GY", "GR", "FP", "LN", "US", "UN", "UW", "UQ", "UA", "UP", "GF"];
const cache = new Map(), TTL = 7 * 24 * 3600 * 1000;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

export default async function handler(req, res) {
  if (req.method !== "GET") { res.status(405).json({ error: "Usa una richiesta GET." }); return; }
  if (!fromOwnSite(req)) { res.status(403).json({ error: "Richiesta da un sito non autorizzato." }); return; }
  if (rateLimited(req, "isin", 60)) { res.status(429).json({ error: "Troppe ricerche in un'ora: riprova più tardi." }); return; }
  const list = [...new Set(String((req.query && req.query.isin) || "").toUpperCase().split(",").map(s => s.trim()).filter(s => ISIN.test(s)))].slice(0, 10);
  if (!list.length) { res.status(400).json({ error: "Nessun ISIN valido." }); return; }
  const out = [], todo = [];
  list.forEach(i => { const h = cache.get(i); if (h && Date.now() - h.t < TTL) out.push(h.v); else todo.push(i); });
  if (todo.length) {
    try {
      const r = await fetch("https://api.openfigi.com/v3/mapping", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(todo.map(i => ({ idType: "ID_ISIN", idValue: i }))), signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`OpenFIGI ${r.status}`);
      const j = await r.json();
      todo.forEach((isin, k) => {
        const rows = ((j[k] && j[k].data) || []).filter(d => d.ticker && d.exchCode in EXCH);
        // azioni e fondi americani o canadesi: prima la borsa di casa; il resto: prima le borse in euro
        const home = /^(US|CA)/.test(isin) ? ["US", "UN", "UW", "UQ", "UA", "UP"] : [], rank = c => (home.includes(c) ? -1 : ORDER.indexOf(c));
        rows.sort((a, b) => rank(a.exchCode) - rank(b.exchCode));
        const fmt = d => String(d.ticker).trim().toUpperCase().replace(/\s+/g, "").replace(/\//g, "-") + EXCH[d.exchCode];
        const v = rows.length ? { isin, simbolo: fmt(rows[0]), ticker: rows[0].ticker, borsa: rows[0].exchCode, nome: rows[0].name || null, alternative: [...new Set(rows.slice(1, 6).map(fmt))] } : { isin, simbolo: null, error: (j[k] && j[k].warning) || "ISIN non trovato" };
        cache.set(isin, { t: Date.now(), v }); out.push(v);
      });
    } catch (e) {
      todo.forEach(isin => out.push({ isin, simbolo: null, error: `Ricerca non disponibile (${e.message}).` }));
    }
  }
  res.setHeader("Cache-Control", "public, s-maxage=604800, stale-while-revalidate=86400");
  res.status(200).json({ source: "OpenFIGI · api.openfigi.com", results: list.map(i => out.find(o => o.isin === i)) });
}
