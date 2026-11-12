// Funzione server dell'Assistente: Gemini (poi Groq come riserva) capisce la domanda e chiede
// i numeri al motore di Portfolio OS attraverso degli strumenti. Gli strumenti girano nel browser,
// sui dati confermati: l'IA non calcola e non inventa, legge risultati già verificati.
import { chat, fromOwnSite, rateLimited, readBody } from "./_lib/llm.js";

const PESI = {
  type: "array",
  description: "Pesi del portafoglio: un elemento per asset, con il nome come appare nei dati e il peso in decimali (0.6 = 60%).",
  items: { type: "object", properties: { asset: { type: "string" }, peso: { type: "number" } }, required: ["asset", "peso"] }
};
const TOOLS = [
  { name: "panoramica", description: "Elenco degli asset, periodo, frequenza e numero di osservazioni del dataset confermato.", parameters: { type: "object", properties: {} } },
  { name: "metriche", description: "Rendimento annuo (CAGR), rendimento reale, volatilità, Sharpe e massimo drawdown di ogni asset.", parameters: { type: "object", properties: { asset: { type: "string", description: "Nome di un asset; vuoto per tutti." } } } },
  { name: "rischio_portafoglio", description: "Rischio del portafoglio con i pesi indicati (o quelli selezionati nell'app se omessi): VaR e CVaR 95%, Sortino, volatilità, drawdown massimo e più lungo, contributo di ogni asset al rischio, asset effettivi e diversificazione.", parameters: { type: "object", properties: { pesi: PESI } } },
  { name: "confronta_pesi", description: "Confronta due allocazioni sugli stessi dati storici: rendimento, volatilità, Sharpe, VaR, drawdown. Usalo per domande del tipo 'e se...'.", parameters: { type: "object", properties: { pesiA: PESI, pesiB: PESI }, required: ["pesiA", "pesiB"] } },
  { name: "correlazioni", description: "Correlazioni tra i rendimenti di tutti gli asset.", parameters: { type: "object", properties: {} } },
  { name: "macro", description: "Tasso privo di rischio medio (BCE o FRED) e inflazione media annua nel periodo del dataset.", parameters: { type: "object", properties: {} } },
  { name: "monte_carlo", description: "Simula migliaia di futuri del portafoglio ricampionando i rendimenti storici del file: capitale finale per percentili (nominale e al netto dell'inflazione), probabilità di raggiungere un obiettivo, probabilità di perdita, capitale esaurito con i prelievi. Usalo per domande su obiettivi, piani di accumulo, prelievi o orizzonti futuri. I parametri omessi prendono i valori impostati nell'app.", parameters: { type: "object", properties: {
    anni: { type: "number", description: "Orizzonte in anni (1-60)." },
    capitale_iniziale: { type: "number", description: "Euro investiti all'inizio." },
    versamento_mensile: { type: "number", description: "Euro al mese; negativo per un prelievo." },
    obiettivo: { type: "number", description: "Capitale obiettivo in euro." },
    metodo: { type: "string", enum: ["storico", "blocchi", "normale"], description: "storico = bootstrap dei rendimenti, blocchi = sequenze consecutive, normale = distribuzione normale." },
    pesi: PESI } } },
  { name: "crisi_storiche", description: "Come si è comportato il portafoglio nelle crisi storiche presenti nei dati (bolla dot-com, crisi 2008, crisi del debito euro 2011, COVID 2020, inflazione 2022): perdita massima, rendimento, tempo per toccare il fondo e per recuperare, rendimento e contributo alla perdita di ogni asset, correlazioni durante la crisi. Le crisi fuori dai dati sono indicate come non disponibili.", parameters: { type: "object", properties: { pesi: PESI } } },
  { name: "stress_shock", description: "Impatto immediato sul portafoglio di uno shock ipotetico sugli asset (per esempio 'e se l'azionario perde il 30%'). Gli asset senza shock vengono stimati dalla covarianza storica se propaga è vero.", parameters: { type: "object", properties: {
    shock: { type: "array", description: "Shock per asset in decimali (-0.3 = -30%).", items: { type: "object", properties: { asset: { type: "string" }, variazione: { type: "number" } }, required: ["asset", "variazione"] } },
    propaga: { type: "boolean", description: "Se vero (predefinito) stima gli altri asset con le correlazioni storiche." },
    capitale: { type: "number", description: "Euro investiti, per tradurre l'impatto in euro." },
    pesi: PESI }, required: ["shock"] } },
  { name: "ottimizza", description: "Frontiera efficiente di Markowitz sui dati storici: trova i pesi per un obiettivo (massimo Sharpe, minima volatilità, risk parity, pesi uguali, volatilità target, rendimento target) con limiti di peso, e li confronta con i pesi di partenza (rendimento atteso, volatilità, Sharpe, CAGR e drawdown storici).", parameters: { type: "object", properties: {
    obiettivo: { type: "string", enum: ["massimo_sharpe", "minima_volatilita", "risk_parity", "pesi_uguali", "volatilita_target", "rendimento_target"] },
    target: { type: "number", description: "Per volatilita_target o rendimento_target, in decimali (0.08 = 8%)." },
    peso_minimo: { type: "number", description: "In decimali; negativo consente vendite allo scoperto. Predefinito 0." },
    peso_massimo: { type: "number", description: "In decimali. Predefinito 1." } }, required: ["obiettivo"] } },
  { name: "confronta_benchmark", description: "Confronta il portafoglio con un indice di mercato sugli stessi mesi: CAGR, volatilità, drawdown, beta, alpha di Jensen, R², tracking error, information ratio, cattura nei rialzi e nei ribassi. Include come si è comportato l'indice nelle crisi storiche (anche quelle fuori dal file dell'utente) accanto al portafoglio dove disponibile.", parameters: { type: "object", properties: {
    benchmark: { type: "string", enum: ["sp500", "nasdaq100", "msci_world", "eurostoxx50"] },
    valuta: { type: "string", enum: ["eur", "usd"], description: "eur (predefinito) converte l'indice in euro con il cambio BCE." },
    pesi: PESI }, required: ["benchmark"] } },
  { name: "portafoglio_utente", description: "Posizioni reali dell'utente se ha caricato un riepilogo: valori, pesi attuali, pesi target e ribilanciamento.", parameters: { type: "object", properties: {} } }
];

const SYSTEM = `Ti chiami Quanta e sei l'analista IA di Portfolio OS, un laboratorio di analisi finanziaria. Rispondi in italiano, in modo chiaro e breve.

Regole:
- Presentati sempre come Quanta. Se ti chiedono che modello sei o chi ti ha creato, rispondi che sei Quanta, l'assistente di Portfolio OS, basato su modelli linguistici di fornitori esterni; non nominare aziende o modelli specifici.
- Ogni numero che scrivi deve venire da uno strumento. Se ti serve un numero, chiama lo strumento giusto; non calcolare a mente e non inventare.
- Prima di rispondere a domande sul rischio, sui rendimenti o su allocazioni diverse, chiama gli strumenti necessari. Per una domanda "e se..." sui pesi usa confronta_pesi; per obiettivi, piani di accumulo, prelievi o "quanto avrò tra N anni" usa monte_carlo e spiega che è una simulazione basata sui rendimenti passati, non una previsione. Per domande su crisi passate (2008, 2020, 2022...) usa crisi_storiche; per "e se un asset crolla del X%" usa stress_shock. Non stimare mai una crisi che non è nei dati. Per "qual è l'allocazione migliore/più efficiente" usa ottimizza e ricorda che i pesi ottimali dipendono molto dai rendimenti passati e sono ottimi solo nel campione. Per "ho battuto il mercato?", beta, alpha o confronti con S&P 500, Nasdaq, MSCI World o Euro Stoxx usa confronta_benchmark; per crisi che il file non copre puoi riportare come si è mosso l'indice, dicendo chiaramente che non è il portafoglio dell'utente.
- I dati sono storici: descrivono il passato e non prevedono il futuro. Dillo quando è rilevante.
- Non dare consigli d'investimento personalizzati (non dire "compra" o "vendi"): spiega cosa mostrano i numeri e quali sono i compromessi.
- Usa i nomi degli asset esattamente come li restituiscono gli strumenti.
- Risposte brevi: due-cinque frasi o un elenco puntato corto. Usa **grassetto** per i numeri chiave.
- Se i dati non bastano a rispondere, dillo e spiega cosa servirebbe.`;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Usa una richiesta POST." }); return; }
  if (!fromOwnSite(req)) { res.status(403).json({ error: "Richiesta da un sito non autorizzato." }); return; }
  if (rateLimited(req, "assistant", Number(process.env.ASSISTANT_HOURLY_LIMIT || 60))) { res.status(429).json({ error: "Hai fatto molte domande in quest'ora. Riprova più tardi." }); return; }
  const body = readBody(req);
  const messages = body && Array.isArray(body.messages) ? body.messages : null;
  if (!messages || !messages.length || messages.length > 40) { res.status(400).json({ error: "Conversazione mancante o troppo lunga: ricomincia la chat." }); return; }
  const clean = messages.map(m => m.role === "user" ? { role: "user", text: String(m.text || "").slice(0, 2000) }
    : m.role === "assistant" ? { role: "assistant", text: String(m.text || "").slice(0, 4000), calls: Array.isArray(m.calls) ? m.calls.slice(0, 6).map(c => ({ id: String(c.id), name: String(c.name), args: c.args && typeof c.args === "object" ? c.args : {}, ...(typeof c.sig === "string" && c.sig.length < 20000 ? { sig: c.sig } : {}) })) : [] }
    : m.role === "tool" ? { role: "tool", id: String(m.id), name: String(m.name), result: m.result } : null).filter(Boolean);
  if (JSON.stringify(clean).length > 80_000) { res.status(413).json({ error: "La conversazione è troppo lunga: ricomincia la chat." }); return; }
  const ctx = body.context ? `\n\nContesto attuale dell'app: ${String(body.context).slice(0, 600)}` : "";
  try {
    const out = await chat({ system: SYSTEM + ctx, messages: clean, tools: TOOLS, order: (process.env.ASSISTANT_ORDER || "gemini,groq").split(",").map(s => s.trim()) });
    const known = new Set(TOOLS.map(t => t.name));
    res.status(200).json({ text: out.text, calls: out.calls.filter(c => known.has(c.name)).slice(0, 6), provider: out.provider, model: out.model });
  } catch (e) {
    res.status(503).json({ error: e.message || "Le IA non sono raggiungibili. Riprova tra poco." });
  }
}
