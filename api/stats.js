// Statistiche d'uso per il proprietario del sito. GET /api/stats?days=30 con intestazione «x-stats-key» = variabile STATS_KEY su Vercel.
// Senza STATS_KEY impostata la funzione è spenta.
import { redis, storeOn } from "./_lib/store.js";
import crypto from "node:crypto";
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const key = process.env.STATS_KEY || "";
  if (!key) { res.status(503).json({ error: "Statistiche spente: imposta STATS_KEY su Vercel." }); return; }
  if (!same((req.headers || {})["x-stats-key"] || "", key)) { res.status(401).json({ error: "Chiave errata." }); return; }
  if (!storeOn()) { res.status(503).json({ error: "Archivio non collegato: crea il database Upstash da Vercel." }); return; }
  const n = Math.max(1, Math.min(90, Number((req.query && req.query.days) || 30)));
  const days = [...Array(n)].map((_, i) => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10)).reverse();
  try {
    // tutte le chiavi dei contatori dei giorni richiesti (SCAN per giorno, pochi giorni → poche chiamate)
    const keys = [];
    for (const d of days) { let cur = "0"; do { const [r] = await redis([["SCAN", cur, "MATCH", `ev:${d}:*`, "COUNT", 500]]); cur = r[0]; keys.push(...r[1]); } while (cur !== "0"); }
    const vals = keys.length ? (await redis([["MGET", ...keys]]))[0] : [];
    const count = {}; keys.forEach((k, i) => { const [, d, ...rest] = k.split(":"); const name = rest.join(":"); (count[name] = count[name] || {})[d] = Number(vals[i] || 0); });
    const sesKeys = days.flatMap(d => ["visit", "start", "import_ok", "import_fail"].map(e => `ses:${d}:${e}`));
    const ses = await redis(sesKeys.map(k => ["SCARD", k]));
    const sessions = {}; sesKeys.forEach((k, i) => { const [, d, e] = k.split(":"); (sessions[e] = sessions[e] || {})[d] = Number(ses[i] || 0); });
    const logs = await redis(["import_fail", "error", "feedback"].map(e => ["LRANGE", `log:${e}`, 0, 99]));
    const parse = a => (a || []).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
    res.status(200).json({ days, count, sessions, recent: { import_fail: parse(logs[0]), error: parse(logs[1]), feedback: parse(logs[2]) } });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
}
