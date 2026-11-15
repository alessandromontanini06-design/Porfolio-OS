// Funzione server: riscrive in modo naturale la bozza di lettera al cliente preparata nel browser.
// Riceve solo la bozza e i fatti già calcolati (numeri, senza nome del cliente: c'è il segnaposto [NOME]).
// L'IA non aggiunge numeri né consigli: il browser controlla poi che ogni cifra della lettera sia tra quelle dei fatti.
import { chat, fromOwnSite, rateLimited, readBody } from "./_lib/llm.js";

const SYSTEM = tono => `Sei l'assistente di scrittura di Portfolio OS. Riscrivi in italiano la bozza di lettera di un consulente finanziario al suo cliente, dopo un incontro.
Regole:
- Usa SOLO i numeri, le date e i nomi di titoli presenti nella bozza o nei fatti, scritti allo stesso modo. Non aggiungere cifre, percentuali, previsioni, prodotti, consigli o promesse.
- Non cambiare il senso di nessuna frase: rendila solo più chiara, scorrevole e personale.
- Tono: ${tono === "formale" ? "formale, dando del Lei al cliente" : "cordiale, dando del tu al cliente"}.
- Mantieni i segnaposto [NOME] e [FIRMA] esattamente così.
- Al massimo 260 parole, frasi brevi, niente elenchi puntati, niente markdown, niente oggetto: solo il corpo della lettera.
- Ricorda in una frase che i dati sono storici e non garantiscono risultati futuri, se la bozza lo dice.`;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Usa una richiesta POST." }); return; }
  if (!fromOwnSite(req)) { res.status(403).json({ error: "Richiesta da un sito non autorizzato." }); return; }
  if (rateLimited(req, "letter", Number(process.env.LETTER_HOURLY_LIMIT || 30))) { res.status(429).json({ error: "Hai chiesto molte lettere in quest'ora. Riprova più tardi." }); return; }
  const b = readBody(req) || {};
  const bozza = String(b.bozza || "").slice(0, 6000), fatti = String(b.fatti || "").slice(0, 6000), tono = b.tono === "formale" ? "formale" : "cordiale";
  if (bozza.length < 40) { res.status(400).json({ error: "Bozza mancante." }); return; }
  try {
    const out = await chat({ system: SYSTEM(tono), messages: [{ role: "user", text: `Fatti verificati (le uniche cifre utilizzabili):\n${fatti}\n\nBozza da riscrivere:\n${bozza}` }], tools: [], order: (process.env.ASSISTANT_ORDER || "gemini,groq").split(",").map(s => s.trim()) });
    const testo = String(out.text || "").replace(/\*\*/g, "").trim();
    if (!/\[NOME\]/.test(testo) || testo.length < 80) throw new Error("risposta incompleta");
    res.status(200).json({ testo, provider: out.provider });
  } catch (e) {
    res.status(503).json({ error: "L'IA non ha risposto: resta la bozza, che puoi usare così com'è." });
  }
}
