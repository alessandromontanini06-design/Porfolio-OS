// Funzione server: trova l'ISIN degli strumenti che nel file hanno solo nome e/o ticker.
// POST /api/findisin  { strumenti: [{ nome, ticker, simbolo }] }   (fino a 20)
// 1. l'IA propone un ISIN per ogni strumento (solo quello: non calcola nulla);
// 2. ogni proposta viene VERIFICATA su OpenFIGI (database pubblico degli identificativi): l'ISIN deve esistere
//    e una delle sue quotazioni deve avere lo stesso ticker del file, oppure un nome compatibile.
// Le proposte non verificate vengono restituite come tali e il sito non le usa: meglio nessun ISIN che uno sbagliato.
import { json, fromOwnSite, rateLimited, readBody, z } from "./_lib/llm.js";

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const Out = z.object({ risultati: z.array(z.object({ indice: z.number().int(), isin: z.string().nullable(), nomeUfficiale: z.string().nullable() })) });
const SYSTEM = `Sei un esperto di strumenti finanziari quotati in Europa e negli Stati Uniti (ETF UCITS, ETC, azioni, obbligazioni).
Per ogni strumento ricevi nome e/o ticker e/o simbolo di borsa così come scritti in un file Excel di un investitore privato.
Restituisci l'ISIN della quotazione più probabile. Regole:
- Per gli ETF scegli la classe giusta: accumulazione (Acc) o distribuzione (Dist), valuta e copertura, se il nome o il ticker lo indicano (es. SWDA/IWDA = IE00B4L5Y983, VWCE = IE00BK5BQT80, VWRL = IE00B3RBWM25).
- Il ticker è il segnale più affidabile: prima il ticker, poi il nome.
- Se non sei sicuro, rispondi isin null. Non inventare: ogni ISIN verrà controllato su un database ufficiale.
- nomeUfficiale: il nome completo dello strumento, se lo conosci.
- indice: lo stesso numero ricevuto.`;

const STOP = new Set(["UCITS", "ETF", "ETC", "ACC", "DIST", "USD", "EUR", "GBP", "THE", "FUND", "PLC", "SICAV", "INC", "CLASS", "SHARE", "SHARES", "DE", "DI", "A", "1C", "1D", "C", "D"]);
const words = s => String(s || "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));
const nameScore = (a, b) => { const A = new Set(words(a)), B = new Set(words(b)); if (!A.size || !B.size) return 0; let k = 0; A.forEach(w => { if (B.has(w)) k++; }); return k / Math.min(A.size, B.size); };
const baseTicker = s => { let t = String(s || "").toUpperCase().trim(); if (t.includes(":")) t = t.split(":").pop(); return t.replace(/\.[A-Z]{1,4}$/, "").replace(/\s+[A-Z]{2}(\s+EQUITY)?$/, "").trim(); };

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Usa una richiesta POST." }); return; }
  if (!fromOwnSite(req)) { res.status(403).json({ error: "Richiesta da un sito non autorizzato." }); return; }
  if (rateLimited(req, "findisin", 30)) { res.status(429).json({ error: "Troppe ricerche in un'ora: riprova più tardi." }); return; }
  const data = readBody(req);
  const list = (data && Array.isArray(data.strumenti) ? data.strumenti : []).slice(0, 20).map((s, i) => ({ indice: i, nome: String(s.nome || "").slice(0, 120), ticker: String(s.ticker || "").slice(0, 30), simbolo: String(s.simbolo || "").slice(0, 30) }));
  if (!list.length) { res.status(400).json({ error: "Nessuno strumento." }); return; }
  let prop;
  try {
    const out = await json({ name: "findisin", system: SYSTEM, user: JSON.stringify(list), schema: Out, maxTokens: 2000 });
    prop = out.data.risultati;
  } catch (e) { res.status(503).json({ error: e.message || "IA non raggiungibile." }); return; }
  const cand = list.map(s => { const p = prop.find(x => x.indice === s.indice); const isin = p && p.isin ? String(p.isin).toUpperCase().replace(/\s+/g, "") : null; return { ...s, isin: isin && ISIN.test(isin) ? isin : null, nomeUfficiale: p && p.nomeUfficiale || null }; });
  const todo = [...new Set(cand.map(c => c.isin).filter(Boolean))];
  const figi = new Map();
  if (todo.length) {
    try {
      for (let i = 0; i < todo.length; i += 10) {
        const part = todo.slice(i, i + 10);
        const r = await fetch("https://api.openfigi.com/v3/mapping", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(part.map(v => ({ idType: "ID_ISIN", idValue: v }))), signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error(`OpenFIGI ${r.status}`);
        const j = await r.json();
        part.forEach((v, k) => figi.set(v, (j[k] && j[k].data) || []));
      }
    } catch (e) { res.status(502).json({ error: `Verifica degli ISIN non disponibile (${e.message}).` }); return; }
  }
  const risultati = cand.map(c => {
    if (!c.isin) return { indice: c.indice, isin: null, verificato: false, motivo: "l'IA non ha trovato un ISIN sicuro" };
    const rows = figi.get(c.isin) || [];
    if (!rows.length) return { indice: c.indice, isin: c.isin, verificato: false, motivo: "ISIN proposto ma inesistente su OpenFIGI" };
    const tk = [baseTicker(c.ticker), baseTicker(c.simbolo)].filter(Boolean);
    const tickers = [...new Set(rows.map(r => String(r.ticker || "").toUpperCase().trim()))];
    const figiName = rows[0].name || "";
    if (tk.some(t => tickers.includes(t))) return { indice: c.indice, isin: c.isin, verificato: true, via: "ticker", nome: c.nomeUfficiale || figiName, motivo: `il ticker ${tk.find(t => tickers.includes(t))} è una quotazione di questo ISIN` };
    const sc = Math.max(nameScore(c.nome, figiName), nameScore(c.nome, c.nomeUfficiale));
    if (c.nome && sc >= .75 && nameScore(c.nomeUfficiale || "", figiName) >= .5) return { indice: c.indice, isin: c.isin, verificato: true, via: "nome", nome: c.nomeUfficiale || figiName, motivo: `nome compatibile con «${figiName}»` };
    return { indice: c.indice, isin: c.isin, verificato: false, nome: figiName, motivo: `l'ISIN esiste (${figiName}) ma ticker e nome non corrispondono` };
  });
  res.status(200).json({ fonte: "IA + verifica OpenFIGI", risultati });
}
