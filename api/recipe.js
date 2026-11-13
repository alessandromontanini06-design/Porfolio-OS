// Funzione server: l'IA legge un estratto strutturato di TUTTI i fogli di un file e scrive una "ricetta di lettura".
// La ricetta dice dove sono i dati (fogli, righe, colonne, ruoli, valute); il motore del sito la esegue su tutto il file,
// la controlla e fa i conti. L'IA non calcola e non inventa numeri.
import { json, fromOwnSite, rateLimited, readBody, z } from "./_lib/llm.js";

const L = z.string().nullable(); // lettera di colonna Excel, per esempio "B"
const Recipe = z.object({
  spiegazione: z.string(),
  tipoFile: z.enum(["serie_storiche", "tracker_patrimonio", "movimenti", "riepilogo_posizioni", "altro"]),
  serieInColonna: z.array(z.object({
    foglio: z.string(),
    rigaIntestazione: z.number().int().nullable(),
    colonnaData: z.string(),
    primaRiga: z.number().int().nullable(),
    ultimaRiga: z.number().int().nullable(),
    serie: z.array(z.object({
      colonna: z.string(),
      nome: z.string(),
      ruolo: z.enum(["prezzo", "valore", "rendimento_decimale", "rendimento_percentuale", "ignora"]),
      valuta: z.string().nullable()
    }))
  })),
  serieInRiga: z.array(z.object({
    fogli: z.array(z.string()),
    rigaDate: z.number().int(),
    colonnaNome: z.string(),
    colonnaValuta: L,
    colonnaTipo: L,
    codiciValuta: z.array(z.object({ codice: z.string(), valuta: z.string() })),
    sezioni: z.array(z.object({ etichetta: z.string(), ruolo: z.enum(["posizioni", "debiti", "totali", "cambi", "classi", "ignora"]) })),
    righeSpeciali: z.array(z.object({ etichetta: z.string(), ruolo: z.enum(["posizione", "debito", "totale", "cambio", "classe", "ignora"]) })),
    classiPerTipo: z.array(z.object({ tipo: z.string(), classe: z.enum(["Azioni ed ETF", "Previdenza", "Crypto", "Immobili", "Private equity", "Prestiti e obbligazioni", "Liquidità", "Altro"]) }))
  })),
  matriciRendimenti: z.array(z.object({
    foglio: z.string(), nome: z.string(), colonnaAnno: z.string(), colonnaGennaio: z.string(),
    primaRiga: z.number().int().nullable(), ultimaRiga: z.number().int().nullable(),
    ruolo: z.enum(["rendimento_decimale", "rendimento_percentuale"])
  })),
  movimenti: z.object({
    foglio: z.string(),
    rigaIntestazione: z.number().int(),
    colonnaData: L,
    colonnaTitolo: z.string(),
    colonnaQuantita: L,
    colonnaPrezzo: L,
    colonnaImporto: L,
    colonnaOperazione: L,
    valuta: z.string().nullable()
  }).nullable(),
  posizioni: z.array(z.object({
    nome: z.string(), ticker: z.string(), simbolo: z.string(),
    valore: z.number().nullable(), pesoAttuale: z.number().nullable(), pesoTarget: z.number().nullable()
  })),
  simboli: z.array(z.object({ titolo: z.string(), simbolo: z.string() })),
  scartati: z.array(z.string())
});

const SYSTEM = `Sei il lettore di file Excel di un laboratorio di analisi finanziaria. Il file può essere fatto in qualsiasi modo: tabelle con titoli sopra, più tabelle, un foglio per anno, date in colonna o in riga, export di broker, tracker personali di patrimonio.
Ricevi un estratto strutturato di ogni foglio: dimensioni, le prime righe complete e, più sotto, le righe che contengono testo (titoli di sezione, nomi delle voci) con il numero di celle numeriche. Righe e colonne sono come in Excel (righe da 1, colonne A, B, C…). Le celle vuote sono omesse.

Il tuo compito NON è calcolare: è scrivere una RICETTA che dica al motore DOVE sono i dati e che cosa sono. Il motore la eseguirà su tutto il file e farà i conti. Non inventare numeri.

Compila le parti che servono (lascia vuoti gli array e null il resto):

1) "serieInColonna": tabelle con le DATE UNA SOTTO L'ALTRA in una colonna e uno o più asset in colonne accanto. Un blocco per tabella (anche una per foglio: per esempio un foglio per ETF con Data e Chiusura). Per ogni colonna utile: lettera, nome dell'asset, ruolo:
   - "prezzo": prezzi o quotazioni di mercato (chiusura, NAV, adj close). Preferisci la chiusura rettificata se c'è.
   - "valore": valore di una posizione o del patrimonio nel tempo.
   - "rendimento_decimale" (0,012) o "rendimento_percentuale" (1,2 oppure "1,2%").
   - "ignora": volumi, quantità, versamenti, note, totali, massimi e minimi intraday, aperture.
   "rigaIntestazione" è la riga con i nomi delle colonne; "primaRiga"/"ultimaRiga" delimitano i dati se sotto ci sono totali o un'altra tabella (altrimenti null).

2) "serieInRiga": tabelle con le DATE IN ORIZZONTALE su una riga e una VOCE PER RIGA (tipico dei tracker di patrimonio, spesso un foglio per anno). Raggruppa in un solo elemento i fogli con la stessa struttura (stessa riga delle date e stesse colonne) elencandoli in "fogli"; se le colonne cambiano tra fogli fai gruppi diversi.
   - "rigaDate": la riga con le date; "colonnaNome": la colonna con i nomi delle voci; "colonnaValuta" e "colonnaTipo" se esistono.
   - "codiciValuta": come leggere i codici della colonna valuta (per esempio U→USD, E→EUR, G→GBP, AE→AED).
   - "sezioni": le righe-titolo senza numeri che aprono un gruppo, con il ruolo del gruppo: "posizioni" (investimenti e conti), "debiti", "totali" (patrimonio netto, totali), "cambi" (tassi di cambio), "classi" (riepiloghi per classe già calcolati), "ignora". Le sezioni che non elenchi ereditano il ruolo della precedente.
   - "righeSpeciali": singole righe da trattare in modo diverso dalla loro sezione (un totale in mezzo alle posizioni, una riga di cambio come "USDEUR", righe di variazione o percentuali da ignorare).
   - "classiPerTipo": come raggruppare i codici della colonna tipo in classi di attivo.

3) "matriciRendimenti": tabelle di rendimenti mensili con UN ANNO PER RIGA e i dodici mesi in colonna (Gen…Dic, spesso con una colonna Totale/Anno da ignorare): il foglio, il nome dell'asset, la colonna dell'anno, la colonna di gennaio (le altre undici seguono a destra), le righe e se i valori sono decimali o percentuali.

4) "movimenti": se il file è un elenco di acquisti e vendite (export di broker): il foglio, la riga di intestazione e le colonne di data, titolo (ticker o ISIN o nome), quantità, prezzo, importo, tipo di operazione, e la valuta.

5) "posizioni": solo se il file è una fotografia di posizioni SENZA storico (un riepilogo con valori e pesi). Solo strumenti quotati.

6) "simboli": per ogni titolo quotato che compare (nelle posizioni, nei movimenti, nelle voci dei tracker) il simbolo per Alpha Vantage nel formato TICKER.BORSA: .LON Londra, .DEX Xetra, .PAR Parigi, .AMS Amsterdam, nessun suffisso per gli Stati Uniti. Borsa Italiana non è coperta: per gli ETF comprati a Milano usa Londra o Xetra (gli iShares "CS…" di Milano a Londra perdono la S: CSSPX → CSPX.LON). Codici come "EPA:MC" → "MC.PAR". Massimo 40.

Regole:
- Valuta: per ogni serie indica la valuta se si capisce (ISO a tre lettere), altrimenti null.
- Un file può avere più parti: per esempio fogli annuali in riga più un foglio di prezzi in colonna. Compila tutto ciò che serve all'analisi degli investimenti.
- I fogli di note, liste di desideri, collezioni, calcolatori e grafici vanno in "scartati" con un motivo breve.
- "tipoFile": la natura prevalente del file.
- "spiegazione": due o tre frasi in italiano, semplici, su cosa contiene il file e cosa userai.`;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Usa una richiesta POST." }); return; }
  if (!fromOwnSite(req)) { res.status(403).json({ error: "Richiesta da un sito non autorizzato." }); return; }
  if (rateLimited(req, "recipe", Number(process.env.AI_HOURLY_LIMIT || 20))) { res.status(429).json({ error: "Hai raggiunto il limite di letture con l'IA per quest'ora. Riprova più tardi." }); return; }
  const data = readBody(req);
  if (!data || !Array.isArray(data.fogli) || !data.fogli.length) { res.status(400).json({ error: "Dati mancanti o nel formato sbagliato." }); return; }
  const payload = JSON.stringify(data);
  if (payload.length > 120_000) { res.status(413).json({ error: "L'estratto del file è troppo grande." }); return; }
  try {
    const out = await json({ name: "recipe", system: SYSTEM, user: `FILE:\n${payload}`, schema: Recipe, maxTokens: 8000, plainJson: true });
    res.status(200).json({ ...out.data, model: out.model, provider: out.provider, cached: !!out.cached });
  } catch (e) {
    res.status(503).json({ error: e.message || "Le IA non sono raggiungibili. Riprova tra poco." });
  }
}
