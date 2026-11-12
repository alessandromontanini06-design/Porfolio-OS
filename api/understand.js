// Funzione server: l'IA legge un estratto del file e capisce che cosa contiene (Claude, poi Gemini e Groq come riserve).
// Restituisce solo ciò che serve all'analisi (asset, prezzi, pesi) ed elenca ciò che ha scartato.
// I numeri restano quelli del file: Claude classifica e collega, non calcola e non inventa.
import { json, fromOwnSite, rateLimited, readBody, z } from "./_lib/llm.js";


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

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Usa una richiesta POST." }); return; }
  if (!fromOwnSite(req)) { res.status(403).json({ error: "Richiesta da un sito non autorizzato." }); return; }
  if (rateLimited(req, "understand", Number(process.env.AI_HOURLY_LIMIT || 20))) { res.status(429).json({ error: "Hai raggiunto il limite di analisi per quest'ora. Riprova più tardi." }); return; }
  const data = readBody(req);
  if (!data || !Array.isArray(data.fogli) || !data.fogli.length) { res.status(400).json({ error: "Dati mancanti o nel formato sbagliato." }); return; }
  const payload = JSON.stringify(data);
  if (payload.length > 80_000) { res.status(413).json({ error: "L'estratto del file è troppo grande." }); return; }
  try {
    const out = await json({ name: "understand", system: SYSTEM, user: `FILE:\n${payload}`, schema: Understanding });
    res.status(200).json({ ...out.data, posizioni: out.data.posizioni.slice(0, 10), model: out.model, provider: out.provider, cached: !!out.cached });
  } catch (e) {
    res.status(503).json({ error: e.message || "Le IA non sono raggiungibili. Riprova tra poco." });
  }
}