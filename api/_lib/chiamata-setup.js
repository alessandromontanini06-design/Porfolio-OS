// Configurazione della chiamata con Quanta (Gemini Live): istruzioni, lingua, strumenti. Separata da chiamata.js
// perché non usa librerie esterne: i test la caricano anche in locale (test-lingue).
import { upperTypes } from "./schema.js";
const MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live";

const IN_CHIAMATA = `

SEI IN CHIAMATA VOCE CON L'UTENTE (come al telefono):
- Parla sempre in {LINGUA} e dai sempre del tu all'utente (mai del Lei, mai il «vous» o l'«usted» di cortesia), con frasi brevi e naturali.
- Hai una voce maschile: quando parli di te usa il maschile («sono pronto», «ne sono sicuro»). Una cosa alla volta, al massimo due o tre numeri per risposta, niente elenchi e niente simboli.
- Se l'utente ti interrompe, fermati e ascolta. Se una domanda non è chiara, chiedi.
- Prima di dare un numero del patrimonio o del portafoglio, usa lo strumento giusto: non inventare mai cifre.
- Operazioni: se l'utente dice di aver comprato, venduto o incassato qualcosa, chiama registra_operazione con i dati; poi rileggi l'operazione e chiedi «Confermi?». Chiama conferma_operazione solo dopo che l'utente ha detto chiaramente sì (o no, per annullare). Non dire mai che è salvata prima del risultato di conferma_operazione.
- Le date vanno nel formato AAAA-MM-GG, calcolate dalla data di oggi del contesto.
- Niente consigli di investimento personalizzati: spiega i numeri e i concetti, le decisioni sono dell'utente.
- All'inizio saluta in una frase breve ({SALUTO}).`;
/* lingua della chiamata = lingua del sito (20/11/2026) */
export const LINGUE = { it: ["italiano", "«Ciao, sono Quanta: come posso aiutarti?»"], en: ["inglese", "«Hi, I'm Quanta: how can I help?»"], es: ["spagnolo", "«Hola, soy Quanta: ¿en qué te ayudo?»"], fr: ["francese", "«Salut, je suis Quanta : comment je peux t'aider ?»"] };

const CONFERMA = { name: "conferma_operazione", description: "Conferma o annulla l'operazione proposta con registra_operazione e ancora in attesa. Usalo SOLO dopo che l'utente ha risposto a voce: «conferma» se ha detto sì, «annulla» se ha detto no.", parameters: { type: "object", properties: { decisione: { type: "string", enum: ["conferma", "annulla"] } }, required: ["decisione"] } };

export function setupFor({ system, tools, ctx, voice, lingua = "it" }) {
  const [nome, saluto] = LINGUE[lingua] || LINGUE.it;
  return {
    model: `models/${MODEL}`,
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    systemInstruction: { parts: [{ text: system + IN_CHIAMATA.replace("{LINGUA}", nome).replace("{SALUTO}", saluto) + (lingua !== "it" ? `\nIMPORTANTE: l'utente usa il sito in ${nome}: parla sempre in ${nome}, anche se il contesto e gli strumenti sono in italiano.` : "") + (ctx ? `\n\nContesto attuale: ${ctx}` : "") }] },
    tools: [{ functionDeclarations: [...tools, CONFERMA].map(t => ({ name: t.name, description: t.description, parameters: upperTypes(t.parameters), behavior: "BLOCKING" })) }],
    realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: 600 } },
    inputAudioTranscription: { languageCodes: [lingua] }, outputAudioTranscription: {}
  };
}
