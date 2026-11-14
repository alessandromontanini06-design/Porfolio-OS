// Archivio degli eventi d'uso: Redis di Upstash via REST (variabili create dall'integrazione Vercel ↔ Upstash).
// Nomi accettati: KV_REST_API_URL/TOKEN, UPSTASH_REDIS_REST_URL/TOKEN, oppure qualsiasi prefisso scelto
// nell'integrazione (es. STORAGE_REST_API_URL/STORAGE_REST_API_TOKEN).
// Se le variabili non ci sono, tutto resta spento: il sito funziona uguale e non salva nulla.
function find() {
  const E = process.env;
  if (E.KV_REST_API_URL && E.KV_REST_API_TOKEN) return [E.KV_REST_API_URL, E.KV_REST_API_TOKEN];
  if (E.UPSTASH_REDIS_REST_URL && E.UPSTASH_REDIS_REST_TOKEN) return [E.UPSTASH_REDIS_REST_URL, E.UPSTASH_REDIS_REST_TOKEN];
  for (const k of Object.keys(E)) {
    const m = k.match(/^(.*)_REST_API_URL$/);
    if (m && E[`${m[1]}_REST_API_TOKEN`]) return [E[k], E[`${m[1]}_REST_API_TOKEN`]];
  }
  return ["", ""];
}
const [URL_, TOKEN] = find();
export const storeOn = () => !!(URL_ && TOKEN);
/* più comandi in una sola richiesta: [["INCR","k"],["LPUSH","l","v"],…] */
export async function redis(cmds) {
  if (!storeOn()) return null;
  const r = await fetch(`${URL_.replace(/\/$/, "")}/pipeline`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(cmds), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`archivio ${r.status}`);
  return (await r.json()).map(x => x.result);
}
