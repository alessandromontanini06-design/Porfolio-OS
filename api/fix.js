// Funzione server: riceve un estratto del foglio e chiede all'IA di proporre correzioni.
// Ordine: Claude (preciso, costo minimo) poi Gemini e Groq (gratuiti) come riserve automatiche.
import { json, fromOwnSite, rateLimited, readBody, z } from "./_lib/llm.js";

const ROLES = ["date", "price", "ret", "retpct", "ignore"];
const Proposal = z.object({
  summary: z.string(),
  roles: z.array(z.object({ col: z.string(), role: z.enum(ROLES), why: z.string() })),
  cells: z.array(z.object({ row: z.number().int(), col: z.string(), value: z.number().nullable(), why: z.string() }))
});

const SYSTEM = `Sei un analista quantitativo che pulisce dati finanziari prima di un'analisi.
Ricevi un estratto di un foglio Excel: le colonne con l'interpretazione proposta da un motore a regole, le prime righe del foglio e alcune righe sospette con il loro contesto.

Ruoli possibili per una colonna:
- "date": date delle osservazioni
- "price": prezzi o valori (sempre positivi)
- "ret": rendimenti in forma decimale (0,012 = 1,2%)
- "retpct": rendimenti in punti percentuali (1,2 = 1,2%)
- "ignore": note, flussi, volumi, codici o qualsiasi cosa che non sia una serie di prezzi o rendimenti

Regole:
1. Proponi un ruolo solo per le colonne con interpretazione "incerto" o confidenza "media", oppure se l'interpretazione proposta è chiaramente sbagliata.
2. Proponi la correzione di una cella solo se è un errore evidente di battitura o di scala (per esempio un prezzo moltiplicato per 10, una virgola spostata, un segno sbagliato) e il valore corretto si deduce con certezza dai valori vicini. Usa il numero di riga e la lettera di colonna esattamente come compaiono nei dati.
3. Non inventare mai dati mancanti. Per celle vuote o con testi come "n/d" non proporre valori.
4. Non correggere valori plausibili anche se estremi: crolli reali come quelli del 2008 o di marzo 2020 sono dati veri.
5. Ogni proposta ha una spiegazione di una frase, in italiano.
6. "summary" riassume in una o due frasi, in italiano, cosa hai trovato.
Se non serve alcuna correzione, restituisci liste vuote.`;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Usa una richiesta POST." }); return; }
  if (!fromOwnSite(req)) { res.status(403).json({ error: "Richiesta da un sito non autorizzato." }); return; }
  if (rateLimited(req, "fix", Number(process.env.AI_HOURLY_LIMIT || 20))) { res.status(429).json({ error: "Hai raggiunto il limite di correzioni per quest'ora. Riprova più tardi." }); return; }
  const data = readBody(req);
  if (!data || !Array.isArray(data.colonne || data.columns)) { res.status(400).json({ error: "Dati mancanti o nel formato sbagliato." }); return; }
  const payload = JSON.stringify(data);
  if (payload.length > 60_000) { res.status(413).json({ error: "L'estratto del foglio è troppo grande." }); return; }
  try {
    const out = await json({ name: "fix", system: SYSTEM, user: `DATI DEL FOGLIO:\n${payload}`, schema: Proposal });
    res.status(200).json({ ...out.data, roles: out.data.roles.slice(0, 40), cells: out.data.cells.slice(0, 60), model: out.model, provider: out.provider, cached: !!out.cached });
  } catch (e) {
    res.status(503).json({ error: e.message || "Le IA non sono raggiungibili. Riprova tra poco." });
  }
}
