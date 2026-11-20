// Funzione server: da ISIN a simbolo di borsa, con OpenFIGI (database pubblico degli identificativi finanziari, senza chiave).
// GET /api/isin?isin=IE00B4L5Y983,IE00BKM4GZ66   (fino a 10)
// GET /api/isin?q=enel   ricerca di qualsiasi titolo per nome o ticker (azioni, ETF, fondi, cripto di tutte le borse) su Yahoo Finance.
//   Sta qui e non in una funzione nuova perché il piano gratuito di Vercel ammette al massimo 12 funzioni.
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

const EXCH = { IM: ".MIL", NA: ".AMS", GY: ".DEX", GR: ".DEX", GF: ".DEX", FP: ".PAR", LN: ".LON", SW: ".SWX", SE: ".SWX", US: "", UN: "", UW: "", UQ: "", UA: "", UP: "" };
const ORDER = ["NA", "GY", "GR", "FP", "IM", "LN", "US", "UN", "UW", "UQ", "UA", "UP", "GF", "SW", "SE"];
const cache = new Map(), TTL = 7 * 24 * 3600 * 1000;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

/* riserva per i fondi comuni (Eurizon, Fonditalia, Amundi…): non sono quotati in borsa, quindi OpenFIGI non dà un simbolo.
   Yahoo Finance, cercando l'ISIN, a volte conosce il fondo con un codice tipo 0P0000ABTK.F (prezzo della quota in euro). */
const YUA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" };
async function yahooFund(isin) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${isin}&quotesCount=6&newsCount=0`, { headers: YUA, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const q = ((await r.json()).quotes || []).filter(x => /^(MUTUALFUND|ETF)$/.test(x.quoteType) && x.symbol);
    if (!q.length) return null;
    const pref = x => /\.(F|DE|MI|AS|PA)$/.test(x.symbol) ? 0 : /^0P/.test(x.symbol) ? 1 : 2;
    q.sort((a, b) => pref(a) - pref(b));
    return { isin, simbolo: q[0].symbol, ticker: q[0].symbol, borsa: q[0].exchange || null, nome: q[0].longname || q[0].shortname || null, tipo: q[0].quoteType === "MUTUALFUND" ? "fondo" : "etf", fonte: "Yahoo Finance (ricerca per ISIN)", alternative: q.slice(1, 4).map(x => x.symbol) };
  } catch { return null; }
}

/* ---------- ricerca per nome o ticker (Yahoo Finance) ----------
   I simboli tornano nel formato del sito (ENEL.MIL, VWCE.DEX, IWDA.AMS, AAPL.US, BTC-EUR), che /api/prices sa riconvertire per Yahoo. */
const Y2APP = { L: "LON", DE: "DEX", F: "FRK", PA: "PAR", AS: "AMS", MI: "MIL", SW: "SWX", TO: "TRT", BR: "BRU", LS: "LIS", MC: "MCE", VI: "VIE", HE: "HEL", IR: "DUB" };
const KIND = { EQUITY: "Azione", ETF: "ETF", MUTUALFUND: "Fondo", CRYPTOCURRENCY: "Cripto" };
const searchCache = new Map();
const appSymbol = y => { const t = String(y || "").toUpperCase(); if (/-(EUR|USD|GBP|CHF|USDT)$/.test(t)) return t; const m = t.match(/^(.+)\.([A-Z]{1,3})$/); if (!m) return t + ".US"; return Y2APP[m[2]] ? `${m[1]}.${Y2APP[m[2]]}` : t; };
async function search(q) {
  const k = q.toLowerCase(), h = searchCache.get(k); if (h && Date.now() - h.t < 864e5) return h.v;
  const r = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=20&newsCount=0&listsCount=0&enableFuzzyQuery=true`, { headers: YUA, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Yahoo ${r.status}`);
  const seen = new Set(), v = ((await r.json()).quotes || []).filter(x => x.symbol && KIND[x.quoteType] && x.isYahooFinance !== false)
    .map(x => ({ simbolo: appSymbol(x.symbol), yahoo: x.symbol, nome: x.longname || x.shortname || x.symbol, tipo: KIND[x.quoteType], borsa: x.exchDisp || x.exchange || "", settore: x.sectorDisp || x.sector || null }))
    .filter(x => !seen.has(x.simbolo) && seen.add(x.simbolo)).slice(0, 15);
  if (searchCache.size > 500) searchCache.delete(searchCache.keys().next().value);
  searchCache.set(k, { t: Date.now(), v }); return v;
}

/* titoli di Stato (OpenFIGI, settore «Govt»): cedola, scadenza e tipo dalla descrizione («BTPS 3 1/4 06/13/27», ticker «… VALR»).
   «fisso» = BTP, BOT, CTZ italiani a tasso fisso: il sito ne stima il prezzo con la curva della Banca d'Italia; gli altri no. */
function govtInfo(isin, all) {
  const d = all.find(x => x.marketSector === "Govt" && x.securityDescription); if (!d) return null;
  const tok = String(d.securityDescription).trim().split(/\s+/), dm = tok.length && tok[tok.length - 1].match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (!dm) return null;
  const y = dm[3].length === 2 ? (+dm[3] < 70 ? 2000 : 1900) + +dm[3] : +dm[3], scadenza = `${y}-${dm[1]}-${dm[2]}`;   /* «95» = 1995 */
  let cpn = 0, num = true;
  for (const t of tok.slice(1, -1)) { const f = t.match(/^(\d+)\/(\d+)$/); if (f) cpn += +f[1] / +f[2]; else if (/^\d+(\.\d+)?$/.test(t)) cpn += +t; else num = false; }
  const tk = String(d.ticker || "").trim().split(/\s+/), suf = tk.slice(tk.findIndex(t => /^\d{2}\/\d{2}\/\d{2,4}$/.test(t)) + 1).join(" ");
  const fam = tok[0].toUpperCase(), it = /^IT/.test(isin);
  /* dal 20/11/2026 anche Germania (Bund, Bobl, Schatz), Francia (OAT) e Spagna (Bonos) a tasso fisso: il sito ne stima il prezzo con la curva della BCE.
     Gli indicizzati all'inflazione hanno «I/L», «OATe»/«OATi» nel ticker o le famiglie DBRI, OBLI, SPGBEI. */
  const ESTERI = { DBR: "DE", OBL: "DE", BKO: "DE", FRTR: "FR", SPGB: "ES" }, IL = { DBRI: "DE", OBLI: "DE", SPGBEI: "ES" };
  const paese = it ? "IT" : ESTERI[fam] || IL[fam] || null;
  const tipo = !it ? (ESTERI[fam] && num && !/OAT[EI]|I\/L|FRN|FLOAT/i.test(suf) ? "fisso" : paese ? "indicizzato" : "estero")
    : !num || /F(LOAT)?\b|EU\b/.test(suf) || /^CCT/.test(fam) ? "variabile" : /^(BTPS|BOTS|CTZS?)$/.test(fam) && (!suf || /^\d+Y$/.test(suf)) ? "fisso" : "indicizzato";
  const nm = fam === "BTPS" ? "BTP" : fam === "BOTS" ? "BOT" : /^CTZ/.test(fam) ? "CTZ" : /^CCT/.test(fam) ? "CCT" : paese === "DE" ? "Bund" : paese === "FR" ? "OAT" : paese === "ES" ? "Bonos" : (d.name || fam);
  const it2 = n => String(+n.toFixed(3)).replace(".", ",");
  return { tipo, paese, cedola: num ? +(cpn / 100).toFixed(6) : null, scadenza, nome: `${nm}${num && !/^CCT/.test(fam) ? " " + it2(cpn) + "%" : ""} ${dm[2]}/${dm[1]}/${y}${tipo === "indicizzato" ? (/VALR|PIU/.test(suf) ? " (cedole crescenti)" : " (indicizzato all'inflazione)") : tipo === "variabile" ? " (tasso variabile)" : ""}`, descrizione: d.securityDescription, emittente: d.name || null };
}

export default async function handler(req, res) {
  if (req.method !== "GET") { res.status(405).json({ error: "Usa una richiesta GET." }); return; }
  if (!fromOwnSite(req)) { res.status(403).json({ error: "Richiesta da un sito non autorizzato." }); return; }
  const q = String((req.query && req.query.q) || "").trim().slice(0, 60);
  if (q) {
    if (q.length < 2) { res.status(400).json({ error: "Scrivi almeno due lettere." }); return; }
    if (rateLimited(req, "cerca", 300)) { res.status(429).json({ error: "Troppe ricerche in un'ora: riprova più tardi." }); return; }
    try { const results = await search(q); res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=86400"); res.status(200).json({ source: "Yahoo Finance", results }); }
    catch (e) { res.status(502).json({ error: `Ricerca non disponibile (${e.message}).`, results: [] }); }
    return;
  }
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
        const all = (j[k] && j[k].data) || [], rows = all.filter(d => d.ticker && d.exchCode in EXCH), stato = govtInfo(isin, all);
        // azioni e fondi americani o canadesi: prima la borsa di casa; il resto: prima le borse in euro
        // azioni: prima la borsa del paese dell'emittente (Enel → Milano); gli ETF irlandesi o lussemburghesi seguono l'ordine in euro
        const HOME = { US: ["US", "UN", "UW", "UQ", "UA", "UP"], CA: ["US", "UN", "UW", "UQ", "UA", "UP"], IT: ["IM"], DE: ["GY", "GR"], FR: ["FP"], NL: ["NA"], GB: ["LN"], CH: ["SW", "SE"] };
        const home = HOME[isin.slice(0, 2)] || [], rank = c => (home.includes(c) ? -1 : ORDER.indexOf(c));
        rows.sort((a, b) => rank(a.exchCode) - rank(b.exchCode));
        const fmt = d => String(d.ticker).trim().toUpperCase().replace(/\s+/g, "").replace(/\//g, "-") + EXCH[d.exchCode];
        const v = stato ? { isin, simbolo: null, nome: stato.nome, stato } : rows.length ? { isin, simbolo: fmt(rows[0]), ticker: rows[0].ticker, borsa: rows[0].exchCode, nome: rows[0].name || null, alternative: [...new Set(rows.slice(1, 6).map(fmt))] } : { isin, simbolo: null, error: (j[k] && j[k].warning) || "ISIN non trovato" };
        out.push(v);
      });
      for (const v of out.filter(o => todo.includes(o.isin) && !o.simbolo && !o.stato)) { const y = await yahooFund(v.isin); if (y) Object.assign(v, y, { error: undefined }); }
      out.filter(o => todo.includes(o.isin)).forEach(v => cache.set(v.isin, { t: Date.now(), v }));
    } catch (e) {
      todo.forEach(isin => out.push({ isin, simbolo: null, error: `Ricerca non disponibile (${e.message}).` }));
    }
  }
  res.setHeader("Cache-Control", "public, s-maxage=604800, stale-while-revalidate=86400");
  res.status(200).json({ source: "OpenFIGI · api.openfigi.com", results: list.map(i => out.find(o => o.isin === i)) });
}
