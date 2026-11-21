// Voce di Quanta: il testo di una risposta diventa audio con Gemini TTS (voci naturali, nella lingua del sito: italiano, inglese, spagnolo, francese).
// Si chiama da api/assistant.js con ?modo=voce (il piano gratuito di Vercel ammette 12 funzioni: questa non è una funzione nuova).
// Prima l'API Interactions (quella documentata per i modelli 3.8), poi generateContent; prima il modello Flash, poi Flash-Lite.
// La risposta è un WAV (24 kHz, mono, 16 bit) in base64. Nel browser, se qui qualcosa non va, resta la voce del dispositivo.
import { createHash } from "node:crypto";
import { fromOwnSite, rateLimited, readBody } from "./llm.js";

const env = process.env;
const MODELS = (env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts").split(",").map(s => s.trim()).filter(Boolean);
export const VOCI = ["Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina",
  "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat"];
const VOCE = VOCI.includes(env.GEMINI_TTS_VOICE) ? env.GEMINI_TTS_VOICE : "Algieba";
/* stile della lettura nella lingua del sito (20/11/2026: italiano, inglese, spagnolo, francese) */
const STILI = {
  it: "Italiano naturale e colloquiale, voce calda e sicura, ritmo scorrevole come una consulente che parla con un amico. Non da annuncio, non da centralino.",
  en: "Natural, conversational English; warm and confident voice; easy flowing pace, like an advisor talking to a friend. Not like an announcement or a call centre.",
  es: "Español natural y coloquial; voz cálida y segura; ritmo fluido, como una asesora que habla con un amigo. Ni de anuncio ni de centralita.",
  fr: "Français naturel et familier ; voix chaleureuse et assurée ; rythme fluide, comme une conseillère qui parle à un ami. Pas comme une annonce ni un standard téléphonique." };
const MAX = 600, BUDGET = 28_000;

/* poche risposte già pronte in memoria: «Ascolta» due volte non rifà la richiesta */
const cache = new Map();
const keyOf = o => createHash("sha256").update(JSON.stringify(o)).digest("hex");

/* cerca l'audio nella risposta, qualunque sia la forma (Interactions: steps[].content[]; generateContent: inlineData) */
function findAudio(o, depth = 0) {
  if (!o || typeof o !== "object" || depth > 8) return null;
  const mime = o.mime_type || o.mimeType || "";
  if (typeof o.data === "string" && o.data.length > 200 && (/audio/i.test(mime) || o.type === "audio")) return { data: o.data, mime };
  for (const v of Array.isArray(o) ? o : Object.values(o)) { const r = findAudio(v, depth + 1); if (r) return r; }
  return null;
}
/* PCM senza intestazione (audio/L16) → WAV */
function toWav(b64, mime) {
  const pcm = Buffer.from(b64, "base64");
  if (pcm.subarray(0, 4).toString("ascii") === "RIFF") return b64;
  const rate = +((String(mime).match(/rate=(\d+)/) || [])[1] || 24000), h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]).toString("base64");
}
async function call(url, body, ms) {
  let r;
  try { r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) }); }
  catch (e) { throw new Error(e.name === "TimeoutError" ? "tempo scaduto" : "rete non raggiungibile"); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${String((j.error && (j.error.message || j.error)) || "").slice(0, 140)}`);
  const a = findAudio(j); if (!a) throw new Error("risposta senza audio");
  return toWav(a.data, a.mime);
}
const viaInteractions = (model, text, voice, ms, lingua) => call("https://generativelanguage.googleapis.com/v1beta/interactions", {
  model, input: [{ type: "user_input", content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style: STILI[lingua] || STILI.it }] }] }],
  response_format: { type: "audio" }, generation_config: { speech_config: [{ voice }] } }, ms);
const viaGenerate = (model, text, voice, ms) => call(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
  contents: [{ role: "user", parts: [{ text }] }],
  generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }, ms);

export async function voce(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Usa una richiesta POST." }); return; }
  if (!fromOwnSite(req)) { res.status(403).json({ error: "Richiesta da un sito non autorizzato." }); return; }
  if (!env.GEMINI_API_KEY) { res.status(503).json({ error: "Voce online non configurata." }); return; }
  if (rateLimited(req, "voce", Number(env.VOICE_HOURLY_LIMIT || 200))) { res.status(429).json({ error: "Troppe letture in quest'ora: uso la voce del dispositivo." }); return; }
  const b = readBody(req) || {}, text = String(b.testo || "").replace(/\s+/g, " ").trim().slice(0, MAX), voice = VOCI.includes(b.voce) ? b.voce : VOCE, lingua = STILI[b.lingua] ? b.lingua : "it";
  if (!text) { res.status(400).json({ error: "Manca il testo." }); return; }
  const models = MODELS.includes(b.modello) ? [b.modello, ...MODELS.filter(m => m !== b.modello)] : MODELS;
  const k = keyOf({ text, voice, m: models[0], lingua }), hit = cache.get(k);
  if (hit) { res.status(200).json({ ...hit, cached: true }); return; }
  const started = Date.now(), errors = [];
  for (const model of models) for (const via of [viaInteractions, viaGenerate]) {
    const left = BUDGET - (Date.now() - started); if (left < 3000) break;
    try {
      const audio = await via(model, text, voice, Math.min(18_000, left), lingua);
      const out = { audio, mime: "audio/wav", modello: model, voce: voice, ms: Date.now() - started };
      if (cache.size > 40) cache.delete(cache.keys().next().value); cache.set(k, out);
      res.status(200).json(out); return;
    } catch (e) {
      errors.push(`${model}/${via === viaInteractions ? "interactions" : "generate"}: ${e.message}`);
      if (/tempo scaduto/.test(e.message)) break; // modello lento: si passa al successivo, non all'altra strada
    }
  }
  res.status(503).json({ error: "Voce online non disponibile.", dettagli: errors });
}
