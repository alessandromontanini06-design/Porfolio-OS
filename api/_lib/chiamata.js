// Chiamata con Quanta: voce in tempo reale con Gemini Live (gemini-3.8-live), come la modalità voce delle app di IA.
// Il browser non vede mai la chiave: qui si crea un «biglietto» usa e getta (token effimero: 1 uso, si apre entro 60 s,
// dura al massimo 30 minuti) legato alla configurazione di Quanta, e il browser si collega direttamente a Google con quello.
// Si chiama da api/assistant.js con ?modo=chiamata (restano 12 funzioni). Gli strumenti girano nel browser come nella chat.
import { fromOwnSite, rateLimited, readBody } from "./llm.js";
import { LINGUE, setupFor } from "./chiamata-setup.js";
import { VOCI } from "./voce.js";

const env = process.env;
const MODEL = env.GEMINI_LIVE_MODEL || "gemini-3.8-live";
const VOCE = VOCI.includes(env.GEMINI_TTS_VOICE) ? env.GEMINI_TTS_VOICE : "Algieba";
export const MINUTI = Math.min(14, Number(env.CALL_MAX_MINUTES || 10));

async function token(body) {
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.name) throw new Error(`${r.status} ${String((j.error && j.error.message) || "").slice(0, 160)}`);
  return j.name;
}

export async function chiamata(req, res, { SYSTEM, TOOLS }) {
  if (req.method !== "POST") { res.status(405).json({ error: "Usa una richiesta POST." }); return; }
  if (!fromOwnSite(req)) { res.status(403).json({ error: "Richiesta da un sito non autorizzato." }); return; }
  if (!env.GEMINI_API_KEY) { res.status(503).json({ error: "Chiamata non configurata." }); return; }
  if (rateLimited(req, "chiamata", Number(env.CALL_HOURLY_LIMIT || 12))) { res.status(429).json({ error: "Hai fatto molte chiamate in quest'ora: riprova più tardi, oppure scrivimi." }); return; }
  const b = readBody(req) || {}, ctx = String(b.context || "").slice(0, 6000), voice = VOCI.includes(b.voce) ? b.voce : VOCE, lingua = LINGUE[b.lingua] ? b.lingua : "it";
  const setup = setupFor({ system: SYSTEM, tools: TOOLS, ctx, voice, lingua });
  const now = Date.now(), base = { uses: 1, expireTime: new Date(now + (MINUTI + 5) * 60_000).toISOString(), newSessionExpireTime: new Date(now + 60_000).toISOString() };
  /* la configurazione resta bloccata nel biglietto (nessuno può usarlo per altro); i nomi dei campi cambiano tra le versioni della documentazione */
  const tries = [["setup", { ...base, bidiGenerateContentSetup: setup }], ["vincoli", { ...base, liveConnectConstraints: { model: setup.model, config: setup } }], ["semplice", base]];
  const errors = [];
  for (const [modo, body] of tries) {
    try { const t = await token(body); res.status(200).json({ token: t, setup, modello: MODEL, voce: voice, minuti: MINUTI, bloccato: modo }); return; }
    catch (e) { errors.push(`${modo}: ${e.message}`); }
  }
  res.status(503).json({ error: "La chiamata non è disponibile ora.", dettagli: errors });
}
