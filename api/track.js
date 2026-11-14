// Eventi d'uso anonimi: niente cookie, niente IP salvato, niente valori dei file.
// POST /api/track  { s: id di sessione casuale, e: nome evento, p: proprietà }  (anche più eventi: { s, list:[{e,p}] })
// Contatori per giorno (ev:AAAA-MM-GG:evento[:valore]) e, per errori e segnalazioni, le ultime 500 voci in chiaro.
import { redis, storeOn } from "./_lib/store.js";

function fromOwnSite(req) {
  const allowed = (process.env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!allowed.length) return true;
  const h = req.headers || {};
  return allowed.includes(h.origin || "") || h["sec-fetch-site"] === "same-origin" || allowed.some(a => String(h.referer || "").startsWith(a + "/"));
}
/* solo eventi e valori previsti: ciò che non è in elenco viene scartato */
const EV = {
  visit: ["from", "device"], start: ["how"], scene: ["name"], import_ok: ["kind", "assets", "fixes", "checks", "secs"], import_fail: ["kind", "why"],
  feature: ["name"], profile_done: ["result"], error: ["msg", "where"], feedback: ["text", "structure", "kind"]
};
const DETAIL = new Set(["import_fail", "error", "feedback"]);
const clean = (v, n = 120) => typeof v === "number" ? (Number.isFinite(v) ? Math.round(v * 100) / 100 : null) : typeof v === "boolean" ? v : typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").slice(0, n) : Array.isArray(v) ? v.slice(0, 40).map(x => clean(x, 80)) : null;
const hits = new Map();
function limited(ip) { const now = Date.now(), r = (hits.get(ip) || []).filter(t => now - t < 3600_000); if (r.length > 600) return true; r.push(now); hits.set(ip, r); return false; }

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Usa POST." }); return; }
  if (!fromOwnSite(req)) { res.status(403).json({ error: "Origine non autorizzata." }); return; }
  if (!storeOn()) { res.status(204).end ? res.status(204).end() : res.status(204).json({}); return; }
  const ip = String((req.headers || {})["x-forwarded-for"] || "").split(",")[0].trim() || "?";
  if (limited(ip)) { res.status(429).json({ error: "Troppi eventi." }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== "object") { res.status(400).json({ error: "Dati mancanti." }); return; }
  const sid = String(body.s || "").replace(/[^a-z0-9]/gi, "").slice(0, 16) || "anon";
  const list = (Array.isArray(body.list) ? body.list : [{ e: body.e, p: body.p }]).slice(0, 20);
  const day = new Date().toISOString().slice(0, 10), cmds = [];
  for (const it of list) {
    const e = String(it && it.e || ""); if (!EV[e]) continue;
    const p = {}; for (const k of EV[e]) if (it.p && it.p[k] != null) { const v = clean(it.p[k], e === "feedback" ? 1500 : 120); if (v != null) p[k] = v; }
    cmds.push(["INCR", `ev:${day}:${e}`], ["SADD", `ses:${day}:${e}`, sid], ["EXPIRE", `ses:${day}:${e}`, 60 * 86400]);
    const tag = e === "visit" ? p.from : e === "start" ? p.how : e === "scene" ? p.name : e === "feature" ? p.name : e === "import_ok" || e === "import_fail" ? p.kind : e === "profile_done" ? p.result : null;
    if (tag) cmds.push(["INCR", `ev:${day}:${e}:${String(tag).slice(0, 40)}`]);
    if (e === "visit" && p.device) cmds.push(["INCR", `ev:${day}:device:${String(p.device).slice(0, 10)}`]);
    if (e === "import_fail" && p.why) cmds.push(["INCR", `ev:${day}:why:${String(p.why).slice(0, 40)}`]);
    if (DETAIL.has(e)) cmds.push(["LPUSH", `log:${e}`, JSON.stringify({ t: new Date().toISOString(), s: sid, ...p })], ["LTRIM", `log:${e}`, 0, 499]);
    cmds.push(["SADD", "days", day]);
  }
  try { if (cmds.length) await redis(cmds); res.status(204).end ? res.status(204).end() : res.status(204).json({}); }
  catch (err) { res.status(502).json({ error: String(err.message || err) }); }
}
