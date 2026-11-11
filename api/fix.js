// Funzione server di Vercel: riceve un estratto del foglio e chiede a Claude
// di proporre correzioni. La chiave resta qui sul server, nella variabile
// d'ambiente ANTHROPIC_API_KEY, e non arriva mai al browser.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const WINDOW_MS = 60 * 60 * 1000;                       // finestra di un'ora
const LIMIT = Number(process.env.AI_HOURLY_LIMIT || 20); // richieste per IP all'ora
const MAX_BODY = 60_000;                                 // caratteri massimi in ingresso
const hits = new Map();

// Modello: si sceglie con la variabile CLAUDE_MODEL su Vercel.
// "claude-haiku-5-5" è il più economico; "claude-opus-5-5" il più capace.
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

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

const client = new Anthropic({ timeout: 45_000, maxRetries: 1 });

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Usa una richiesta POST." }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: "La chiave di Claude non è configurata sul server." }); return; }

  // Solo il tuo sito può usare questa funzione (se ALLOWED_ORIGIN è impostata).
  const allowed = (process.env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
  const origin = req.headers.origin || "";
  if (allowed.length && !allowed.includes(origin)) { res.status(403).json({ error: "Richiesta da un sito non autorizzato." }); return; }

  // Limite di richieste per indirizzo IP.
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "anonimo";
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) { res.status(429).json({ error: "Hai raggiunto il limite di correzioni per quest'ora. Riprova più tardi." }); return; }
  recent.push(now); hits.set(ip, recent);

  let data = req.body;
  if (typeof data === "string") { try { data = JSON.parse(data); } catch { res.status(400).json({ error: "Dati non leggibili." }); return; } }
  if (!data || typeof data !== "object" || !Array.isArray(data.colonne || data.columns)) { res.status(400).json({ error: "Dati mancanti o nel formato sbagliato." }); return; }
  const payload = JSON.stringify(data);
  if (payload.length > MAX_BODY) { res.status(413).json({ error: "L'estratto del foglio è troppo grande." }); return; }

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: "low", format: zodOutputFormat(Proposal) },
      messages: [{ role: "user", content: `DATI DEL FOGLIO:\n${payload}` }]
    });
    if (response.stop_reason === "refusal") { res.status(502).json({ error: "L'IA ha rifiutato di analizzare questo foglio." }); return; }
    const out = response.parsed_output;
    if (!out) { res.status(502).json({ error: "La risposta dell'IA non è valida. Riprova." }); return; }
    res.status(200).json({
      summary: out.summary,
      roles: out.roles.slice(0, 40),
      cells: out.cells.slice(0, 60),
      model: MODEL
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) { res.status(500).json({ error: "La chiave di Claude non è valida." }); return; }
    if (error instanceof Anthropic.PermissionDeniedError) { res.status(500).json({ error: "La chiave di Claude non ha accesso a questo modello." }); return; }
    if (error instanceof Anthropic.RateLimitError) { res.status(503).json({ error: "Troppe richieste a Claude in questo momento. Riprova tra un minuto." }); return; }
    if (error instanceof Anthropic.APIError) {
      const s = error.status;
      if (s === 400 && /credit|balance/i.test(String(error.message))) { res.status(503).json({ error: "Il credito di Claude è esaurito: la correzione IA è sospesa." }); return; }
      if (s >= 500) { res.status(503).json({ error: "Claude è momentaneamente sovraccarico. Riprova tra qualche minuto." }); return; }
      res.status(502).json({ error: `Claude ha risposto con un errore (${s}).` });
      return;
    }
    res.status(502).json({ error: "Non riesco a contattare Claude. Riprova tra poco." });
  }
}
