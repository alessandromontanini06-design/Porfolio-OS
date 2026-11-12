// Centralino delle IA di Portfolio OS.
// - json(): risposte strutturate (correzioni, ricostruzione del file), validate con zod.
// - chat(): conversazione con strumenti (l'Assistente), in un formato neutro tradotto per ogni fornitore.
// Ogni fornitore ha un tempo massimo; se fallisce o è sovraccarico si passa al successivo.
// I file in api/_lib non diventano indirizzi del sito: sono solo codice condiviso.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createHash } from "node:crypto";

const env = process.env;
const has = { claude: !!env.ANTHROPIC_API_KEY, gemini: !!env.GEMINI_API_KEY, groq: !!env.GROQ_API_KEY };
export const available = () => Object.keys(has).filter(k => has[k]);

/* ---------- Memoria delle risposte (stessa domanda = nessuna nuova chiamata) ---------- */
const cache = new Map();
const CACHE_MS = 60 * 60 * 1000;
const keyOf = obj => createHash("sha256").update(JSON.stringify(obj)).digest("hex");
function cacheGet(k) { const h = cache.get(k); if (h && Date.now() - h.t < CACHE_MS) return h.v; cache.delete(k); return null; }
function cacheSet(k, v) { if (cache.size > 300) cache.delete(cache.keys().next().value); cache.set(k, { t: Date.now(), v }); }

/* ---------- Limite di richieste per indirizzo IP ---------- */
const hits = new Map();
export function rateLimited(req, bucket, perHour) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "anonimo";
  const k = bucket + ":" + ip, now = Date.now();
  const recent = (hits.get(k) || []).filter(t => now - t < 3600_000);
  if (recent.length >= perHour) return true;
  recent.push(now); hits.set(k, recent); return false;
}
export function fromOwnSite(req) {
  const allowed = (env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!allowed.length) return true;
  const h = req.headers;
  return allowed.includes(h.origin || "") || h["sec-fetch-site"] === "same-origin" || allowed.some(a => String(h.referer || "").startsWith(a + "/"));
}
export function readBody(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { return null; } }
  return b && typeof b === "object" ? b : null;
}

/* ---------- Errori ---------- */
class ProviderError extends Error { constructor(provider, msg, retry) { super(msg); this.provider = provider; this.retry = retry; } }
const BUSY = new Set([408, 429, 500, 502, 503, 504, 529]);
async function http(provider, url, init, ms) {
  let r;
  try { r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) }); }
  catch (e) { throw new ProviderError(provider, e.name === "TimeoutError" ? "tempo scaduto" : "rete non raggiungibile", true); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = (j && j.error && (j.error.message || j.error)) || `errore ${r.status}`;
    throw new ProviderError(provider, `${r.status} ${String(m).slice(0, 160)}`, BUSY.has(r.status) || r.status === 404);
  }
  return j;
}

/* ---------- Gemini ---------- */
let geminiModel = env.GEMINI_MODEL || null;
async function geminiModels() {
  const j = await http("gemini", "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": env.GEMINI_API_KEY } }, 8000);
  const ver = n => Number((n.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1]);
  return (j.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map(m => String(m.name).replace(/^models\//, ""))
    .filter(n => /flash/.test(n) && !/(image|tts|audio|live|thinking|exp|preview|lite)/.test(n))
    .sort((a, b) => ver(b) - ver(a));
}
async function geminiCall(body, ms) {
  const tryModel = m => http("gemini", `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`,
    { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY }, body: JSON.stringify(body) }, ms);
  // Prima il modello che ha funzionato l'ultima volta; l'elenco dei modelli si chiede solo se serve.
  const first = geminiModel || "gemini-3.6-flash";
  try { const j = await tryModel(first); geminiModel = first; return { j, model: first }; }
  catch (e) {
    if (!e.retry) throw e;
    let others = [];
    try { others = (await geminiModels()).filter(m => m !== first).slice(0, 2); } catch {}
    let last = e;
    for (const m of others) {
      try { const j = await tryModel(m); geminiModel = m; return { j, model: m }; }
      catch (e2) { last = e2; if (!e2.retry) break; }
    }
    throw last;
  }
}
const upperTypes = s => {
  if (Array.isArray(s)) return s.map(upperTypes);
  if (!s || typeof s !== "object") return s;
  const o = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === "additionalProperties" || k === "$schema") continue;
    if (k === "type" && typeof v === "string") o.type = v.toUpperCase();
    else if (k === "type" && Array.isArray(v)) { const t = v.find(x => x !== "null"); o.type = String(t).toUpperCase(); if (v.includes("null")) o.nullable = true; }
    else o[k] = upperTypes(v);
  }
  return o;
};

/* ---------- Groq (formato compatibile OpenAI) ---------- */
let groqModel = env.GROQ_MODEL || null;
async function groqModels() {
  const j = await http("groq", "https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` } }, 8000);
  const ids = (j.data || []).map(m => m.id).filter(id => !/(whisper|guard|tts|playai|distil|embed|vision)/i.test(id));
  const score = id => (/(120b|70b|maverick|405b|large)/i.test(id) ? 2 : 0) + (/(llama|gpt-oss|qwen|kimi)/i.test(id) ? 1 : 0);
  return ids.sort((a, b) => score(b) - score(a));
}
async function groqCall(body, ms) {
  const tryModel = m => http("groq", "https://api.groq.com/openai/v1/chat/completions",
    { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.GROQ_API_KEY}` }, body: JSON.stringify({ ...body, model: m }) }, ms);
  const first = groqModel || "llama-3.3-70b-versatile";
  try { const j = await tryModel(first); groqModel = first; return { j, model: first }; }
  catch (e) {
    if (!e.retry) throw e;
    let others = [];
    try { others = (await groqModels()).filter(m => m !== first).slice(0, 2); } catch {}
    let last = e;
    for (const m of others) {
      try { const j = await tryModel(m); groqModel = m; return { j, model: m }; }
      catch (e2) { last = e2; if (!e2.retry) break; }
    }
    throw last;
  }
}

/* ---------- Claude ---------- */
const claude = has.claude ? new Anthropic({ timeout: 40_000, maxRetries: 0 }) : null;
const CLAUDE_MODEL = env.CLAUDE_MODEL || "claude-opus-5-5";

/* ---------- json(): risposta strutturata con riserve ---------- */
// task: { name, system, user, schema (zod), order: ["claude","gemini","groq"] }
export async function json(task) {
  const order = (task.order || ["claude", "gemini", "groq"]).filter(p => has[p]);
  if (!order.length) throw new ProviderError("nessuno", "Nessuna chiave IA configurata sul server.", false);
  const ck = keyOf({ n: task.name, s: task.system, u: task.user });
  const hit = cacheGet(ck); if (hit) return { ...hit, cached: true };
  const schemaText = JSON.stringify(z.toJSONSchema(task.schema));
  const started = Date.now(), BUDGET = 50_000, errors = [];
  for (const p of order) {
    const left = BUDGET - (Date.now() - started);
    if (left < 5000) break;
    const ms = Math.min(p === "claude" ? 40_000 : 25_000, left);
    try {
      let raw, model;
      if (p === "claude") {
        const r = await claude.messages.parse({
          model: CLAUDE_MODEL, max_tokens: 4000, system: task.system,
          output_config: { effort: "low", format: zodOutputFormat(task.schema) },
          messages: [{ role: "user", content: task.user }]
        }, { timeout: ms });
        if (r.stop_reason === "refusal") throw new ProviderError("claude", "richiesta rifiutata", true);
        raw = r.parsed_output; model = CLAUDE_MODEL;
      } else if (p === "gemini") {
        const { j, model: m } = await geminiCall({
          systemInstruction: { parts: [{ text: `${task.system}\n\nRispondi SOLO con un oggetto JSON valido che rispetta questo schema:\n${schemaText}` }] },
          contents: [{ role: "user", parts: [{ text: task.user }] }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
        }, ms);
        raw = JSON.parse((j.candidates?.[0]?.content?.parts || []).map(x => x.text || "").join("") || "null"); model = m;
      } else {
        const { j, model: m } = await groqCall({
          temperature: 0.1, response_format: { type: "json_object" },
          messages: [{ role: "system", content: `${task.system}\n\nRispondi SOLO con un oggetto JSON valido che rispetta questo schema:\n${schemaText}` }, { role: "user", content: task.user }]
        }, ms);
        raw = JSON.parse(j.choices?.[0]?.message?.content || "null"); model = m;
      }
      const ok = task.schema.safeParse(raw);
      if (!ok.success) throw new ProviderError(p, "risposta non valida", true);
      const out = { data: ok.data, provider: p, model };
      cacheSet(ck, out);
      return out;
    } catch (e) {
      const pe = e instanceof ProviderError ? e : new ProviderError(p, e instanceof Anthropic.APIError ? `${e.status} ${String(e.message).slice(0, 120)}` : String(e.message || e), true);
      errors.push(`${p}: ${pe.message}`);
    }
  }
  throw new ProviderError("tutti", `Nessuna IA ha risposto (${errors.join(" · ")}).`, true);
}

/* ---------- chat(): conversazione con strumenti ---------- */
// messages neutri: {role:"user",text} | {role:"assistant",text,calls:[{id,name,args}]} | {role:"tool",id,name,result}
// tools neutri: [{name, description, parameters (JSON Schema)}]
// Restituisce { text, calls:[{id,name,args}], provider, model }
function toGemini(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === "user") out.push({ role: "user", parts: [{ text: m.text }] });
    else if (m.role === "assistant") {
      const parts = [];
      if (m.text) parts.push({ text: m.text });
      // Gemini 3 vuole indietro la firma di ogni sua chiamata; per chiamate nate da Groq si usa il segnaposto documentato.
      (m.calls || []).forEach(c => parts.push({ functionCall: { name: c.name, args: c.args || {} }, thoughtSignature: c.sig || "skip_thought_signature_validator" }));
      if (parts.length) out.push({ role: "model", parts });
    } else if (m.role === "tool") {
      const part = { functionResponse: { name: m.name, response: { result: m.result } } };
      const prev = out[out.length - 1];
      if (prev && prev.role === "user" && prev.parts.every(p => p.functionResponse)) prev.parts.push(part);
      else out.push({ role: "user", parts: [part] });
    }
  }
  return out;
}
function toOpenAI(system, messages) {
  const out = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") out.push({ role: "user", content: m.text });
    else if (m.role === "assistant") out.push({ role: "assistant", content: m.text || "", ...(m.calls && m.calls.length ? { tool_calls: m.calls.map(c => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args || {}) } })) } : {}) });
    else if (m.role === "tool") out.push({ role: "tool", tool_call_id: m.id, content: JSON.stringify(m.result) });
  }
  return out;
}
let callSeq = 0;
const newId = () => `call_${Date.now().toString(36)}_${(callSeq++).toString(36)}`;

export async function chat({ system, messages, tools, order }) {
  const prov = (order || ["gemini", "groq"]).filter(p => has[p] && p !== "claude");
  if (!prov.length) throw new ProviderError("nessuno", "Nessuna chiave IA gratuita configurata (Gemini o Groq).", false);
  const started = Date.now(), BUDGET = 45_000, errors = [];
  for (const p of prov) {
    const left = BUDGET - (Date.now() - started);
    if (left < 5000) break;
    const ms = Math.min(25_000, left);
    try {
      if (p === "gemini") {
        const { j, model } = await geminiCall({
          systemInstruction: { parts: [{ text: system }] },
          contents: toGemini(messages),
          tools: [{ functionDeclarations: tools.map(t => ({ name: t.name, description: t.description, parameters: upperTypes(t.parameters) })) }],
          generationConfig: { temperature: 0.2 }
        }, ms);
        const parts = j.candidates?.[0]?.content?.parts || [];
        const calls = parts.filter(x => x.functionCall).map(x => ({ id: x.functionCall.id || newId(), name: x.functionCall.name, args: x.functionCall.args || {}, ...(x.thoughtSignature ? { sig: x.thoughtSignature } : {}) }));
        const text = parts.filter(x => x.text).map(x => x.text).join("").trim();
        if (!calls.length && !text) throw new ProviderError("gemini", "risposta vuota", true);
        return { text, calls, provider: p, model };
      }
      const { j, model } = await groqCall({
        temperature: 0.2, tool_choice: "auto",
        messages: toOpenAI(system, messages),
        tools: tools.map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }))
      }, ms);
      const msg = j.choices?.[0]?.message || {};
      const calls = (msg.tool_calls || []).map(c => { let args = {}; try { args = JSON.parse(c.function.arguments || "{}"); } catch {} return { id: c.id || newId(), name: c.function.name, args }; });
      const text = String(msg.content || "").trim();
      if (!calls.length && !text) throw new ProviderError("groq", "risposta vuota", true);
      return { text, calls, provider: p, model };
    } catch (e) {
      errors.push(`${p}: ${e instanceof ProviderError ? e.message : String(e.message || e)}`);
    }
  }
  throw new ProviderError("tutti", `Nessuna IA ha risposto (${errors.join(" · ")}).`, true);
}

export { ProviderError, z };
