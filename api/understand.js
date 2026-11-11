// Funzione server di Vercel: Claude legge un estratto del file e capisce che cosa contiene.
// Restituisce solo ciò che serve all'analisi (asset, prezzi, pesi) ed elenca ciò che ha scartato.
// I numeri restano quelli del file: Claude classifica e collega, non calcola e non inventa.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = Number(process.env.AI_HOURLY_LIMIT || 20);
const MAX_BODY = 80_000;
const hits = new Map();
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

const Understanding = z.object({
  tipo: z.enum(["serie_storica", "riepilogo_portafoglio", "movimenti", "altro"]),
  spiegazione: z.string(),
  foglio: z.string(),
  serie: z.object({
    colonnaData: z.string().nullable(),
    asset: z.array(z.object({ col: z.string(), nome: z.string(), tipo: z.enum(["price", "ret", "retpct"]) }))
  }).nullable(),
  posizioni: z.array(z.object({
    nome: z.string(),
    ticker: z.string(),
    simbolo: z.string(),
    valore: z.number().nullable(),
    pesoAttuale: z.number().nullable(),
    pesoTarget: z.number().nullable()
  })),
  scartati: z.array(z.string())
});

const SYSTEM = `Sei un analista finanziario che prepara i dati per un'analisi quantitativa.
Ricevi le prime righe di uno o più fogli di un file (righe e lettere di colonna come in Excel). Capisci che tipo di file è e restituisci SOLO ciò che serve all'analisi degli investimenti.

Tipi:
- "serie_storica": date una sotto l'altra con prezzi o rendimenti di uno o più asset. Compila "serie": la lettera della colonna data e, per ogni asset, la lettera di colonna, il nome e il tipo ("price" = prezzi o valori, "ret" = rendimenti decimali, "retpct" = rendimenti in punti percentuali). Ignora colonne di note, flussi, volumi, totali, commenti.
- "riepilogo_portafoglio": una fotografia delle posizioni (asset con valore, peso, peso target), senza storico. Compila "posizioni" SOLO con strumenti di mercato quotati (ETF, azioni, fondi quotati, obbligazioni quotate). Escludi liquidità, conti, fondi di emergenza, oro fisico, contanti, borse di studio, immobili, totali e indicatori come TIR o guadagni.
- "movimenti": elenco di acquisti e vendite con date.
- "altro": nessuno dei precedenti.

Per ogni posizione:
- "ticker": il codice come appare nel file.
- "simbolo": il simbolo per Alpha Vantage nel formato TICKER.BORSA, scegliendo la borsa dove lo strumento è più probabilmente quotato e scambiato: .LON per Londra, .DEX per Xetra, .PAR per Parigi, .AMS per Amsterdam; nessun suffisso per gli Stati Uniti. Borsa Italiana non è coperta: per gli ETF comprati a Milano usa la quotazione di Londra o di Xetra. Attenzione, il ticker di Milano può essere diverso: gli iShares con prefisso "CS" a Milano a Londra perdono la "S" (CSNDX diventa CNDX.LON, CSSPX diventa CSPX.LON); gli ETF Xtrackers come XXSC sono su Xetra (XXSC.DEX). L'utente confermerà.
- "valore": il valore in euro come numero, se presente, altrimenti null.
- "pesoAttuale" e "pesoTarget": in forma decimale (85,6% = 0.856), se presenti, altrimenti null.

Regole:
- Non inventare numeri: usa solo valori presenti nel file. Se un dato manca, metti null.
- "foglio" è il nome del foglio più utile per l'analisi.
- "scartati" elenca in breve gli elementi che hai escluso (per esempio "Fondo emergenza: liquidità").
- "spiegazione": una o due frasi in italiano su cosa hai capito.`;

const client = new Anthropic({ timeout: 45_000, maxRetries: 1 });

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Usa una richiesta POST." }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: "La chiave di Claude non è configurata sul server." }); return; }
  const allowed = (process.env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
  if (allowed.length && !allowed.includes(req.headers.origin || "")) { res.status(403).json({ error: "Richiesta da un sito non autorizzato." }); return; }

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "anonimo";
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) { res.status(429).json({ error: "Hai raggiunto il limite di analisi per quest'ora. Riprova più tardi." }); return; }
  recent.push(now); hits.set(ip, recent);

  let data = req.body;
  if (typeof data === "string") { try { data = JSON.parse(data); } catch { res.status(400).json({ error: "Dati non leggibili." }); return; } }
  if (!data || !Array.isArray(data.fogli) || !data.fogli.length) { res.status(400).json({ error: "Dati mancanti o nel formato sbagliato." }); return; }
  const payload = JSON.stringify(data);
  if (payload.length > MAX_BODY) { res.status(413).json({ error: "L'estratto del file è troppo grande." }); return; }

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: "low", format: zodOutputFormat(Understanding) },
      messages: [{ role: "user", content: `FILE:\n${payload}` }]
    });
    if (response.stop_reason === "refusal") { res.status(502).json({ error: "L'IA ha rifiutato di analizzare questo file." }); return; }
    const out = response.parsed_output;
    if (!out) { res.status(502).json({ error: "La risposta dell'IA non è valida. Riprova." }); return; }
    out.posizioni = out.posizioni.slice(0, 10);
    out.model = MODEL;
    res.status(200).json(out);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) { res.status(500).json({ error: "La chiave di Claude non è valida." }); return; }
    if (error instanceof Anthropic.RateLimitError) { res.status(503).json({ error: "Troppe richieste a Claude in questo momento. Riprova tra un minuto." }); return; }
    if (error instanceof Anthropic.APIError) {
      if (error.status === 400 && /credit|balance/i.test(String(error.message))) { res.status(503).json({ error: "Il credito di Claude è esaurito: l'analisi IA è sospesa." }); return; }
      if (error.status >= 500) { res.status(503).json({ error: "Claude è momentaneamente sovraccarico. Riprova tra qualche minuto." }); return; }
      res.status(502).json({ error: `Claude ha risposto con un errore (${error.status}).` });
      return;
    }
    res.status(502).json({ error: "Non riesco a contattare Claude. Riprova tra poco." });
  }
}
