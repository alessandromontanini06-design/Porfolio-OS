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
  { name: "indipendenza_finanziaria", description: "FIRE / pensione anticipata: quanto si può prelevare al mese senza esaurire il capitale, il capitale necessario (numero FIRE) per una spesa mensile, e tra quanti anni ci si arriva risparmiando. Tutto in euro di oggi, sui rendimenti storici del portafoglio.", parameters: { type: "object", properties: {
    spesa_mensile: { type: "number", description: "Euro al mese da coprire con i prelievi, in euro di oggi." },
    anni: { type: "number", description: "Anni di prelievo (5-60). Predefinito 30." },
    probabilita: { type: "number", description: "Sicurezza richiesta in decimali (0.9 = i soldi bastano nel 90% dei futuri). Predefinito 0.9." },
    capitale: { type: "number", description: "Capitale di partenza in euro; se omesso, quello della simulazione." },
    risparmio_mensile: { type: "number", description: "Euro risparmiati ogni mese finché non si arriva al numero FIRE." },
    eta: { type: "number", description: "Età attuale: se c'è, calcola a che età si può smettere di lavorare (tutta la vita, con pensione)." },
    eta_fine: { type: "number", description: "Fino a che età devono durare i soldi. Predefinito 90." },
    pensione: { type: "number", description: "Pensione mensile netta in euro di oggi." },
    eta_pensione: { type: "number", description: "Età da cui arriva la pensione. Predefinito 67." },
    eta_obiettivo: { type: "number", description: "Se l'utente vuole smettere a un'età precisa: quanto deve risparmiare al mese per riuscirci." },
    pesi: PESI } } },
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
  { name: "portafoglio_utente", description: "Posizioni reali dell'utente se ha caricato un riepilogo: valori, pesi attuali, pesi target e ribilanciamento.", parameters: { type: "object", properties: {} } },
  { name: "rendimento_reale", description: "Rendimento vero dell'utente dalle sue transazioni: TIR, valore oggi, versato, guadagno, rendimento ponderato nel tempo; per ogni strumento acquisti, vendite, dividendi incassati, valore, guadagno in euro, TIR e quota del guadagno; e per classe di attivo. Usalo per 'quanto ho guadagnato', 'quale ETF mi ha reso di più'.", parameters: { type: "object", properties: {} } },
  { name: "composizione", description: "Dove è investito il portafoglio, dalle schede dei fondi: paesi, aree, sviluppati/emergenti, valute, classi di attivo, dimensione e stile, settori, TER medio e costo annuo, aziende principali con peso minimo e massimo sommando tutti gli ETF, sovrapposizione tra ETF. Usalo per 'quanta Apple ho', 'quanto sono esposto al dollaro', 'quanto costa il mio portafoglio'.", parameters: { type: "object", properties: {} } },
  { name: "confronto_allocazioni", description: "I portafogli A, B (e C) della scheda «Confronta allocazioni»: pesi e risultati sugli stessi mesi (rendimento annuo, volatilità, Sharpe, perdita massima, peggiori 12 mesi, crisi).", parameters: { type: "object", properties: {} } },
  { name: "patrimonio", description: "Il patrimonio salvato dall'utente nella pagina Patrimonio (non serve il laboratorio): valore di oggi, versato, guadagno, TIR, rendimento ponderato nel tempo, posizioni con quote, valore, peso e guadagno, posizioni chiuse, tasse (bollo, imposte se vendesse oggi, minusvalenze), proventi in arrivo, piani di accumulo, obiettivi con la probabilità, quanto potrebbe perdere in una crisi.", parameters: { type: "object", properties: {} } },
  { name: "registra_operazione", description: "Propone di registrare nel patrimonio un'operazione detta dall'utente (acquisto, vendita, dividendo o cedola). NON salva niente: mostra all'utente una scheda con «Conferma» e «Annulla». Usalo solo se l'utente dice chiaramente di aver fatto l'operazione e ci sono i dati; se manca qualcosa (quante quote, prezzo, importo) chiedilo prima.", parameters: { type: "object", properties: {
    tipo: { type: "string", enum: ["acquisto", "vendita", "dividendo", "cedola"] },
    strumento: { type: "string", description: "Come l'ha detto l'utente: ticker (SWDA), ISIN o nome." },
    quantita: { type: "number", description: "Quote (o nominale per un BTP); per acquisto e vendita." },
    prezzo: { type: "number", description: "Prezzo per quota in euro; per acquisto e vendita." },
    importo: { type: "number", description: "Importo netto incassato in euro; per dividendo e cedola." },
    data: { type: "string", description: "Sempre nel formato AAAA-MM-GG (per esempio 2026-11-18), calcolata dalla data di oggi del contesto: «ieri» = un giorno prima. Se l'utente non la dice, la data di oggi." },
    spese: { type: "number", description: "Commissioni in euro, se dette." } }, required: ["tipo", "strumento"] } },
  { name: "costi_banca", description: "Compila il calcolatore «Quanto ti costa la tua banca» con i numeri del rendiconto costi e oneri (MiFID), per esempio letti da una foto, e restituisce costo annuo, percentuale, effetto in 10 e 20 anni e confronto con un portafoglio di ETF. Valori come testo: euro («1.250,50») o percentuali («0,9%»).", parameters: { type: "object", properties: {
    patrimonio_medio: { type: "string", description: "Solo il numero, come scritto: «100.000,00» o «0,9%»." }, costi_servizi: { type: "string", description: "Solo il numero." }, costi_prodotti: { type: "string", description: "Solo il numero." },
    incentivi: { type: "string", description: "Solo il numero della riga degli incentivi (nel rendiconto si chiama «pagamenti ricevuti da terzi» o retrocessioni), già compresi nei costi; vuoto se non c'è." } }, required: ["patrimonio_medio"] } },
  { name: "vai_a", description: "Porta l'utente a una pagina del sito quando lo chiede («portami alle simulazioni», «apri il patrimonio»).", parameters: { type: "object", properties: {
    pagina: { type: "string", enum: ["home", "patrimonio", "laboratorio", "strumenti", "rischio", "simulazioni", "indipendenza_finanziaria", "crisi", "frontiera", "benchmark", "costi_banca"] } }, required: ["pagina"] } },
  { name: "profilo_rischio", description: "Risultato del test «La tua allocazione è coerente con te?», se l'utente lo ha fatto: perdita che regge, perdita peggiore del portafoglio, coerenza, quota investibile entro la soglia, risposte su orizzonte e liquidità.", parameters: { type: "object", properties: {} } }
];

const SYSTEM = `Ti chiami Quanta e sei l'analista IA di Portfolio OS, un laboratorio di analisi finanziaria. Rispondi in italiano, in modo chiaro e breve.

Regole:
- Presentati sempre come Quanta. Se ti chiedono che modello sei o chi ti ha creato, rispondi che sei Quanta, l'assistente di Portfolio OS, basato su modelli linguistici di fornitori esterni; non nominare aziende o modelli specifici.
- Ogni numero che scrivi deve venire da uno strumento. Se ti serve un numero, chiama lo strumento giusto; non calcolare a mente e non inventare.
- Prima di rispondere a domande sul rischio, sui rendimenti o su allocazioni diverse, chiama gli strumenti necessari. Per una domanda "e se..." sui pesi usa confronta_pesi; per FIRE, pensione anticipata o «quanto posso prelevare al mese» usa indipendenza_finanziaria; per obiettivi, piani di accumulo, prelievi o "quanto avrò tra N anni" usa monte_carlo e spiega che è una simulazione basata sui rendimenti passati, non una previsione. Per domande su crisi passate (2008, 2020, 2022...) usa crisi_storiche; per "e se un asset crolla del X%" usa stress_shock. Non stimare mai una crisi che non è nei dati. Per "qual è l'allocazione migliore/più efficiente" usa ottimizza e ricorda che i pesi ottimali dipendono molto dai rendimenti passati e sono ottimi solo nel campione. Per "ho battuto il mercato?", beta, alpha o confronti con S&P 500, Nasdaq, MSCI World o Euro Stoxx usa confronta_benchmark; per crisi che il file non copre puoi riportare come si è mosso l'indice, dicendo chiaramente che non è il portafoglio dell'utente.
- I dati sono storici: descrivono il passato e non prevedono il futuro. Dillo quando è rilevante.
- Non dare consigli d'investimento personalizzati (non dire "compra" o "vendi"): spiega cosa mostrano i numeri e quali sono i compromessi.
- Usa i nomi degli asset esattamente come li restituiscono gli strumenti.
- Non nominare gli strumenti interni (per esempio "rendimento_reale" o "composizione"): parla di «i tuoi dati», «la composizione dei fondi».
- Non fare calcoli tu, nemmeno semplici moltiplicazioni: se un valore in euro non è negli strumenti, non scriverlo.
- Per guadagni in euro e rendimento dei singoli strumenti usa rendimento_reale; per paesi, valute, settori, aziende e costi usa composizione; per i portafogli A/B/C usa confronto_allocazioni; per il test del profilo usa profilo_rischio. Le esposizioni da justETF sono parziali: se lo strumento restituisce un intervallo o un minimo, riportalo così.
- Risposte brevi: due-cinque frasi o un elenco puntato corto. Usa **grassetto** per i numeri chiave.
- Se i dati non bastano a rispondere, dillo e spiega cosa servirebbe.
- Il patrimonio salvato dall'utente si legge con lo strumento patrimonio, anche senza laboratorio: usalo per domande su «quanto ho», «quanto ho guadagnato», tasse, cedole, obiettivi.
- Operazioni dette a parole («ho comprato 20 SWDA a 100 euro»): chiama registra_operazione. Non dire mai che è salvata: l'utente la vede in una scheda e la salva lui con «Conferma». Se mancano quote, prezzo o importo, chiedili prima.
- Foto: descrivi solo ciò che vedi davvero, senza inventare numeri illeggibili. Se è un rendiconto costi e oneri della banca, leggi patrimonio medio, costi dei servizi, costi dei prodotti e incentivi e chiama costi_banca. Se è l'elenco delle posizioni di un broker, riassumilo e suggerisci «Carica uno screenshot» nella home per importarlo. Non ripetere dati personali (nomi, numeri di conto) che vedi nella foto.
- Se l'utente parla a voce, la risposta sarà letta ad alta voce: frasi brevi e naturali, niente tabelle, niente elenchi lunghi, al massimo tre numeri importanti.
- Se l'utente chiede di andare in una pagina, usa vai_a.`;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Usa una richiesta POST." }); return; }
  if (!fromOwnSite(req)) { res.status(403).json({ error: "Richiesta da un sito non autorizzato." }); return; }
  if (rateLimited(req, "assistant", Number(process.env.ASSISTANT_HOURLY_LIMIT || 60))) { res.status(429).json({ error: "Hai fatto molte domande in quest'ora. Riprova più tardi." }); return; }
  const body = readBody(req);
  const messages = body && Array.isArray(body.messages) ? body.messages : null;
  if (!messages || !messages.length || messages.length > 40) { res.status(400).json({ error: "Conversazione mancante o troppo lunga: ricomincia la chat." }); return; }
  /* foto: solo nell'ultimo messaggio dell'utente che ne ha, al massimo 2, JPEG/PNG/WebP, 1,5 MB ciascuna (base64) */
  const lastImg = messages.map((m, i) => (m.role === "user" && Array.isArray(m.images) && m.images.length ? i : -1)).filter(i => i >= 0).pop();
  const imgs = m => (Array.isArray(m.images) ? m.images : []).slice(0, 2).filter(x => x && /^image\/(jpeg|png|webp)$/.test(x.mime) && typeof x.data === "string" && x.data.length < 1_600_000 && /^[A-Za-z0-9+/=]+$/.test(x.data.slice(0, 200))).map(x => ({ mime: x.mime, data: x.data }));
  const clean = messages.map((m, i) => m.role === "user" ? { role: "user", text: String(m.text || "").slice(0, 2000), ...(i === lastImg ? { images: imgs(m) } : {}) }
    : m.role === "assistant" ? { role: "assistant", text: String(m.text || "").slice(0, 4000), calls: Array.isArray(m.calls) ? m.calls.slice(0, 6).map(c => ({ id: String(c.id), name: String(c.name), args: c.args && typeof c.args === "object" ? c.args : {}, ...(typeof c.sig === "string" && c.sig.length < 20000 ? { sig: c.sig } : {}) })) : [] }
    : m.role === "tool" ? { role: "tool", id: String(m.id), name: String(m.name), result: m.result } : null).filter(Boolean);
  const withImg = clean.some(m => m.images && m.images.length);
  if (JSON.stringify(clean.map(m => m.images ? { ...m, images: [] } : m)).length > 80_000) { res.status(413).json({ error: "La conversazione è troppo lunga: ricomincia la chat." }); return; }
  const ctx = body.context ? `\n\nContesto attuale dell'app: ${String(body.context).slice(0, 600)}` : "";
  try {
    /* con una foto Gemini e, se non risponde, Claude (Groq non legge le immagini) */
    const order = withImg ? ["gemini", "claude"] : (process.env.ASSISTANT_ORDER || "gemini,groq").split(",").map(s => s.trim());
    const out = await chat({ system: SYSTEM + ctx, messages: clean, tools: TOOLS, order });
    const known = new Set(TOOLS.map(t => t.name));
    res.status(200).json({ text: out.text, calls: out.calls.filter(c => known.has(c.name)).slice(0, 6), provider: out.provider, model: out.model });
  } catch (e) {
    res.status(503).json({ error: e.message || "Le IA non sono raggiungibili. Riprova tra poco." });
  }
}
