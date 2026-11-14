// Archivio degli eventi d'uso: Redis di Upstash via REST (variabili create dall'integrazione Vercel ↔ Upstash).
// Se le variabili non ci sono, tutto resta spento: il sito funziona uguale e non salva nulla.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
export const storeOn = () => !!(URL_ && TOKEN);
/* più comandi in una sola richiesta: [["INCR","k"],["LPUSH","l","v"],…] */
export async function redis(cmds) {
  if (!storeOn()) return null;
  const r = await fetch(`${URL_.replace(/\/$/, "")}/pipeline`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(cmds), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`archivio ${r.status}`);
  return (await r.json()).map(x => x.result);
}
