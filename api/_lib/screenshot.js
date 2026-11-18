// Lettura di uno o più screenshot del portafoglio (app della banca o del broker) con l'IA.
// POST /api/screenshot (su Vercel: riscritto in /api/understand?modo=screenshot, vedi vercel.json) { immagini: [{ mime: "image/jpeg", data: "<base64>" }] }   (fino a 8, già rimpicciolite dal browser)
// Restituisce le posizioni lette: { posizioni: [{ nome, isin, ticker, quantita, prezzo, valore, valuta, immagine }], avvisi, piattaforma }.
// L'IA legge solo quello che vede: niente ISIN inventati, niente calcoli. Il sito mostra tutto in una tabella da controllare.
// Le immagini non vengono salvate: passano all'IA e basta.
/* Sta in _lib (non è una funzione a sé) perché il piano gratuito di Vercel ammette al massimo 12 funzioni: la chiama api/understand.js. */
import { json, fromOwnSite, rateLimited, readBody, z } from "./llm.js";

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const MAX_IMG = 8, MAX_TOTAL = 4_300_000; // limite del corpo delle richieste su Vercel: 4,5 MB
const num = z.number().nullable();
const Out = z.object({
  piattaforma: z.string().nullable(),
  posizioni: z.array(z.object({
    nome: z.string(), isin: z.string().nullable(), ticker: z.string().nullable(),
    quantita: num, prezzo: num, valore: num, valuta: z.string().nullable(), immagine: z.number().int().nullable()
  })),
  avvisi: z.array(z.string())
});
const SYSTEM = `Leggi screenshot del portafoglio di un investitore privato italiano (app o sito di una banca o di un broker: Trade Republic, Fineco, Directa, Scalable, Degiro, Revolut, Intesa, Poste e altri).
Estrai SOLO le posizioni possedute oggi (titoli, ETF, fondi, obbligazioni, BTP, cripto). Regole:
- Ignora ordini, watchlist, notizie, grafici, pubblicità, righe di totale e saldo del conto. La liquidità del conto va inclusa solo se è scritta come voce del portafoglio, con nome "Liquidità".
- nome: come scritto nell'immagine. isin e ticker solo se sono SCRITTI nell'immagine: non dedurli dal nome, metti null.
- quantita: numero di quote o pezzi (per i BTP il valore nominale). prezzo: prezzo unitario attuale se visibile. valore: controvalore attuale della posizione.
- I numeri sono spesso in formato italiano (1.234,56 = 1234.56). Le percentuali di guadagno non sono valori: ignorale.
- valuta: codice a tre lettere del valore (EUR se c'è il simbolo €).
- immagine: il numero dell'immagine (da 1) in cui compare la posizione. Se la stessa posizione compare in più immagini (screenshot sovrapposti), scrivila UNA volta sola.
- Nella scheda di una singola posizione (per esempio Trade Republic: «Totale», «Azioni», «Acquisto medio») «Azioni», «Quote» o «Pezzi» sono la quantità e «Totale» è il valore; «Acquisto medio» o «Prezzo medio di carico» NON è il prezzo attuale: ignoralo. Se quella posizione è anche nell'elenco di un'altra immagine, scrivila una volta sola con tutti i dati insieme.
- Riquadri come «Piani di accumulo 100 €», «Preferiti», «Ordini», «Saldo» non sono posizioni.
- Se un nome è tagliato (finisce con «...»), scrivilo come lo vedi, puntini compresi.
- Se un numero è tagliato o illeggibile metti null. Non inventare niente.
- avvisi: brevi frasi in italiano su cosa non si legge bene (per esempio "nell'immagine 2 il valore di ENI è tagliato"). Se un'immagine non è un portafoglio, dillo negli avvisi.
- piattaforma: il nome dell'app se si capisce, altrimenti null.`;

export default async function screenshotHandler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Usa una richiesta POST." }); return; }
  if (!fromOwnSite(req)) { res.status(403).json({ error: "Richiesta da un sito non autorizzato." }); return; }
  if (rateLimited(req, "screenshot", Number(process.env.SCREENSHOT_HOURLY_LIMIT || 20))) { res.status(429).json({ error: "Troppe letture di screenshot in un'ora: riprova più tardi." }); return; }
  const body = readBody(req);
  const imgs = (body && Array.isArray(body.immagini) ? body.immagini : []).slice(0, MAX_IMG)
    .map(x => ({ mime: String(x && x.mime || ""), data: String(x && x.data || "").replace(/^data:[^,]+,/, "") }))
    .filter(x => /^image\/(jpeg|png|webp)$/.test(x.mime) && x.data.length > 100);
  if (!imgs.length) { res.status(400).json({ error: "Nessuna immagine valida (JPG, PNG o WEBP)." }); return; }
  if (imgs.reduce((a, x) => a + x.data.length, 0) > MAX_TOTAL) { res.status(413).json({ error: "Immagini troppo grandi: caricane meno alla volta." }); return; }
  try {
    const out = await json({
      name: "screenshot", system: SYSTEM, schema: Out, maxTokens: 4000, order: ["gemini", "claude"], images: imgs,
      user: `Ci sono ${imgs.length} ${imgs.length > 1 ? "immagini, numerate nell'ordine da 1" : "immagine"}. Estrai le posizioni.`
    });
    const d = out.data, seen = new Map();
    const posizioni = d.posizioni.map(p => {
      const isin = p.isin && ISIN.test(String(p.isin).toUpperCase().replace(/\s+/g, "")) ? String(p.isin).toUpperCase().replace(/\s+/g, "") : null;
      const pos = n => (typeof n === "number" && isFinite(n) && n >= 0 ? n : null);
      return { nome: String(p.nome || "").trim().slice(0, 120), isin, ticker: p.ticker ? String(p.ticker).trim().toUpperCase().slice(0, 20) : null,
        quantita: pos(p.quantita), prezzo: pos(p.prezzo), valore: pos(p.valore), valuta: p.valuta ? String(p.valuta).toUpperCase().slice(0, 3) : null,
        immagine: p.immagine && p.immagine >= 1 && p.immagine <= imgs.length ? p.immagine : null };
    }).filter(p => p.nome && (p.quantita != null || p.valore != null))
      /* doppioni tra screenshot (sovrapposti, oppure elenco + scheda del titolo): stesso ISIN o stesso nome → un'unica riga con i dati di entrambe */
      .reduce((acc, p) => { const k = p.isin || p.nome.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); const o = seen.get(k); if (!o) { seen.set(k, p); acc.push(p); } else for (const f of ["isin", "ticker", "quantita", "prezzo", "valore", "valuta"]) if (o[f] == null && p[f] != null) o[f] = p[f]; return acc; }, []);
    res.status(200).json({ posizioni, avvisi: d.avvisi.slice(0, 12), piattaforma: d.piattaforma, immagini: imgs.length, fonte: out.provider });
  } catch (e) { res.status(503).json({ error: "Non riesco a leggere le immagini adesso: " + (e.message || "IA non raggiungibile.") }); }
}
