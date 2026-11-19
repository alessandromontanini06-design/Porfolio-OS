// Anteprima locale del sito come su Vercel.
// /api/rates usa la funzione vera (BCE); /api/fix risponde con una SIMULAZIONE (nessuna chiave, nessun costo).
// Uso: node tools/serve.mjs   poi apri http://localhost:5181
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, "..");
const rates = (await import(pathToFileURL(path.join(site, "api", "rates.js")).href)).default;
const fx = (await import(pathToFileURL(path.join(site, "api", "fx.js")).href)).default;
const isin = (await import(pathToFileURL(path.join(site, "api", "isin.js")).href)).default;
const etfinfo = (await import(pathToFileURL(path.join(site, "api", "etfinfo.js")).href)).default;
// statistiche: le funzioni vere, con un finto Redis in memoria (stesso protocollo REST di Upstash)
if (!process.env.KV_REST_API_URL) { process.env.KV_REST_API_URL = `http://localhost:${process.env.PORT || 5181}/fake-redis`; process.env.KV_REST_API_TOKEN = "locale"; }
if (!process.env.STATS_KEY) process.env.STATS_KEY = "prova-locale";
const track = (await import(pathToFileURL(path.join(site, "api", "track.js")).href)).default;
const stats = (await import(pathToFileURL(path.join(site, "api", "stats.js")).href)).default;
const RD = new Map();
function fakeRedis(cmds) {
  const glob = g => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
  return cmds.map(([c, ...a]) => { switch (c) {
    case "INCR": RD.set(a[0], String(Number(RD.get(a[0]) || 0) + 1)); return { result: Number(RD.get(a[0])) };
    case "SADD": { const s = RD.get(a[0]) instanceof Set ? RD.get(a[0]) : new Set(); a.slice(1).forEach(x => s.add(x)); RD.set(a[0], s); return { result: 1 }; }
    case "SCARD": return { result: RD.get(a[0]) instanceof Set ? RD.get(a[0]).size : 0 };
    case "EXPIRE": return { result: 1 };
    case "LPUSH": { const l = Array.isArray(RD.get(a[0])) ? RD.get(a[0]) : []; l.unshift(...a.slice(1)); RD.set(a[0], l); return { result: l.length }; }
    case "LTRIM": { const l = RD.get(a[0]) || []; RD.set(a[0], l.slice(+a[1], +a[2] + 1)); return { result: "OK" }; }
    case "LRANGE": return { result: (RD.get(a[0]) || []).slice(+a[1], +a[2] + 1) };
    case "MGET": return { result: a.map(k => typeof RD.get(k) === "string" ? RD.get(k) : null) };
    case "SCAN": { const rx = glob(a[2]); return { result: ["0", [...RD.keys()].filter(k => rx.test(k) && typeof RD.get(k) === "string")] }; }
    default: return { result: null }; } });
}
const realPrices = process.env.REAL_PRICES ? (await import(pathToFileURL(path.join(site, "api", "prices.js")).href)).default : null; // REAL_PRICES=1: prezzi veri (Yahoo) invece di quelli simulati
const port = Number(process.env.PORT || 5181);
const BENCH = { SPY: [0.0075, 0.042], QQQ: [0.011, 0.06], URTH: [0.007, 0.04], FEZ: [0.005, 0.05] };

const SIM0 = (() => { const n = new Date(); return (n.getUTCFullYear() - 2015) * 12 + n.getUTCMonth() - 9 - 130; })(); // mesi da aggiungere a ott 2015
const wrapRes = res => ({
  status(c) { res.statusCode = c; return this; },
  setHeader(k, v) { res.setHeader(k, v); },
  json(o) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); return this; }
});

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  /* curva dei BTP: copia salvata (dati veri della Banca d'Italia al 30/10/2026), con BDI_REAL=1 quella di oggi; BDI_DOWN=1 simula il servizio fermo */
  if (u.pathname === "/api/rates" && u.searchParams.get("serie") === "btp" && !process.env.BDI_REAL) { if (process.env.BDI_DOWN) { res.writeHead(502, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Curva dei BTP della Banca d'Italia non disponibile (prova)." })); return; } res.writeHead(200, { "Content-Type": "application/json" }); res.end(fs.readFileSync(path.join(import.meta.dirname, "files", "bdi-curva.json"))); return; }
  if (u.pathname === "/api/rates") { await rates({ method: req.method, query: Object.fromEntries(u.searchParams), headers: req.headers }, wrapRes(res)); return; }
  if (u.pathname === "/api/understand") {
    req.resume();
    setTimeout(() => wrapRes(res).json({
      tipo: "riepilogo_portafoglio", foglio: "Dashboard",
      spiegazione: "Simulazione locale: riepilogo con 2 ETF, pesi attuali e target. Su Vercel risponde Claude.",
      serie: null,
      posizioni: [
        { nome: "MSCI World", ticker: "SWDA", simbolo: "SWDA.LON", valore: 5388.41, pesoAttuale: 0.856, pesoTarget: 0.6 },
        { nome: "Emergenti", ticker: "EIMI", simbolo: "EIMI.LON", valore: 110.85, pesoAttuale: 0.018, pesoTarget: 0.13 }
      ],
      scartati: ["Fondo emergenza: liquidità", "Oro fisico: non quotato"], model: "simulazione"
    }), 800);
    return;
  }
  if (u.pathname === "/api/screenshot") {
    // simulazione locale della lettura degli screenshot: su Vercel le immagini le legge Gemini (o Claude)
    let body = ""; req.on("data", c => body += c); await new Promise(r => req.on("end", r));
    let n = 0; try { n = (JSON.parse(body || "{}").immagini || []).length; } catch {}
    if (!n) { res.statusCode = 400; wrapRes(res).json({ error: "Nessuna immagine valida (JPG, PNG o WEBP)." }); return; }
    const P = [
      { nome: "Vanguard FTSE All-World USD Acc", isin: "IE00BK5BQT80", ticker: null, quantita: 42.5, prezzo: 139.81, valore: 5941.93, valuta: "EUR", immagine: 1 },
      { nome: "iShares Core MSCI EM IMI USD (Acc)", isin: null, ticker: null, quantita: 60, prezzo: 33.12, valore: 1987.2, valuta: "EUR", immagine: 1 },
      { nome: "Eni", isin: null, ticker: "ENI", quantita: 100, prezzo: 14.62, valore: 1462, valuta: "EUR", immagine: Math.min(2, n) },
      { nome: "Apple", isin: "US0378331005", ticker: "AAPL", quantita: 5, prezzo: null, valore: 1021.4, valuta: "EUR", immagine: Math.min(2, n) },
      { nome: "Bitcoin", isin: null, ticker: "BTC", quantita: 0.012, prezzo: null, valore: 1010.5, valuta: "EUR", immagine: n }
    ];
    setTimeout(() => wrapRes(res).json({ posizioni: P, avvisi: n > 1 ? ["Simulazione locale: «Eni» compare in due immagini, l'ho contata una volta."] : ["Simulazione locale."], piattaforma: "Trade Republic", immagini: n, fonte: "simulazione" }), 600);
    return;
  }
  if (u.pathname === "/api/findisin") {
    // simulazione locale dell'IA + verifica: su Vercel l'IA propone e OpenFIGI verifica
    let body = ""; req.on("data", c => body += c); await new Promise(r => req.on("end", r));
    const K = { SWDA: "IE00B4L5Y983", IWDA: "IE00B4L5Y983", CSNDX: "IE00B53SZB19", CNDX: "IE00B53SZB19", XXSC: "LU0322253906", EIMI: "IE00BKM4GZ66", EMIM: "IE00BKM4GZ66", VWCE: "IE00BK5BQT80" };
    const L = (JSON.parse(body || "{}").strumenti || []);
    wrapRes(res).json({ fonte: "simulazione locale", risultati: L.map((x, i) => { const t = String(x.ticker || x.simbolo || "").toUpperCase().split(".")[0]; return K[t] ? { indice: i, isin: K[t], verificato: true, via: "ticker", motivo: `il ticker ${t} è una quotazione di questo ISIN` } : { indice: i, isin: null, verificato: false, motivo: "non trovato" }; }) });
    return;
  }
  if (u.pathname === "/fake-redis/pipeline") { let body = ""; req.on("data", c => body += c); await new Promise(r => req.on("end", r)); wrapRes(res).json(fakeRedis(JSON.parse(body || "[]"))); return; }
  if (u.pathname === "/api/track" || u.pathname === "/api/stats") {
    let body = ""; req.on("data", c => body += c); await new Promise(r => req.on("end", r));
    const R = wrapRes(res); R.end = () => { res.end(); return R; };
    await (u.pathname === "/api/track" ? track : stats)({ method: req.method, query: Object.fromEntries(u.searchParams), headers: req.headers, body }, R); return; }
  if (u.pathname === "/api/etfinfo" && process.env.ETF_DOWN) { res.writeHead(502, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Scheda justETF non disponibile (justETF non raggiungibile)." })); return; } // simula justETF fermo
  if (u.pathname === "/api/etfinfo") { await etfinfo({ method: req.method, query: Object.fromEntries(u.searchParams), headers: req.headers }, wrapRes(res)); return; }
  if (u.pathname === "/api/isin") { await isin({ method: req.method, query: Object.fromEntries(u.searchParams), headers: req.headers }, wrapRes(res)); return; }
  if (u.pathname === "/api/fx") { await fx({ method: req.method, query: Object.fromEntries(u.searchParams), headers: req.headers }, wrapRes(res)); return; }
  if (realPrices && u.pathname === "/api/prices" && req.method === "GET") { await realPrices({ method: "GET", query: Object.fromEntries(u.searchParams), headers: req.headers }, wrapRes(res)); return; }
  if (u.pathname === "/api/prices" && req.method === "GET" && BENCH[String(u.searchParams.get("symbol") || "").toUpperCase()]) {
    // benchmark simulati dal 1999 con le crisi vere ricostruite a grandi linee (solo per l'anteprima locale)
    const sym = u.searchParams.get("symbol").toUpperCase(), [mu, sd] = BENCH[sym], start = { URTH: 2012, FEZ: 2002 }[sym] || 1999;
    const crash = { "2000-09": -0.08, "2001-02": -0.1, "2001-09": -0.09, "2002-06": -0.08, "2002-09": -0.11, "2008-01": -0.06, "2008-06": -0.08, "2008-09": -0.09, "2008-10": -0.17, "2008-11": -0.07, "2009-02": -0.1, "2011-08": -0.06, "2011-09": -0.07, "2020-02": -0.08, "2020-03": -0.13, "2020-04": 0.12, "2022-04": -0.09, "2022-06": -0.08, "2022-09": -0.09 };
    let p = 100, s = [...sym].reduce((a, ch) => a + ch.charCodeAt(0), 3); const pts = [];
    const endY = new Date().getUTCFullYear(), endM = new Date().getUTCMonth() - 1;
    for (let y = start; y <= endY; y++) for (let m = 0; m < 12; m++) { if (y === 1999 && m < 11) continue; if (y === endY && m > endM) break;
      s = (s * 16807) % 2147483647; const k = `${y}-${String(m + 1).padStart(2, "0")}`; p *= 1 + (crash[k] != null ? crash[k] * (sym === "QQQ" ? 1.5 : 1) : mu + ((s / 2147483647) - 0.5) * sd * 2);
      pts.push({ d: new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10), v: +p.toFixed(2) }); }
    setTimeout(() => wrapRes(res).json({ symbol: sym, adjusted: true, points: pts, source: "simulazione locale" }), 300);
    return;
  }
  if (u.pathname === "/api/prices" && req.method === "GET") {
    const sym = String(u.searchParams.get("symbol") || "").toUpperCase();
    let p = 100, s = [...sym].reduce((a, ch) => a + ch.charCodeAt(0), 7); const pts = [];
    for (let i = 0; i < 130; i++) { s = (s * 16807) % 2147483647; p *= 1 + 0.007 + ((s / 2147483647) - 0.5) * 0.09; pts.push({ d: new Date(Date.UTC(2015, 9 + SIM0 + i + 1, 0)).toISOString().slice(0, 10), v: +p.toFixed(2) }); }
    setTimeout(() => { res.setHeader("Cache-Control", "public, s-maxage=86400"); wrapRes(res).json(sym === "ERRORE.LON" ? { symbol: sym, error: "Simbolo ERRORE.LON non trovato." } : { symbol: sym, adjusted: true, points: pts, source: "simulazione" }); }, 400);
    return;
  }
  if (u.pathname === "/api/prices") {
    req.resume();
    const mk = (seed, drift) => { let p = 100, s = seed; const pts = []; for (let i = 0; i < 130; i++) { s = (s * 16807) % 2147483647; const r = drift + ((s / 2147483647) - 0.5) * 0.09; p *= 1 + r; const d = new Date(Date.UTC(2015, 9 + SIM0 + i + 1, 0)); pts.push({ d: d.toISOString().slice(0, 10), v: +p.toFixed(2) }); } return pts; };
    setTimeout(() => wrapRes(res).json({ series: [
      { symbol: "SWDA.LON", adjusted: true, points: mk(7, 0.009), source: "simulazione" },
      { symbol: "EIMI.LON", adjusted: true, points: mk(11, 0.005), source: "simulazione" }
    ] }), 900);
    return;
  }
  if (u.pathname === "/api/letter") { // simulazione: «riscrive» la bozza (unisce i paragrafi) e, se richiesto, aggiunge una cifra inventata per provare il controllo
    let body = ""; req.on("data", c => { body += c; }); req.on("end", () => { let d = {}; try { d = JSON.parse(body); } catch {}
      const t = String(d.bozza || "").replace(/\n\n(?!A presto|Cordiali)/g, " ") + (/INVENTA/.test(d.bozza || "") ? " Il rendimento atteso è del 9,9%." : "");
      setTimeout(() => wrapRes(res).json({ testo: t, provider: "simulazione" }), 300); });
    return;
  }
  if (u.pathname === "/api/assistant" && u.searchParams.get("modo") === "voce") { // simulazione della voce online: 0,3 s di silenzio in WAV (VOICE_DOWN=1: servizio fermo)
    let body = ""; req.on("data", c => { body += c; }); req.on("end", () => {
      if (process.env.VOICE_DOWN) { wrapRes(res).status(503).json({ error: "Voce online non disponibile." }); return; }
      const pcm = Buffer.alloc(14400), h = Buffer.alloc(44);
      h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
      setTimeout(() => wrapRes(res).json({ audio: Buffer.concat([h, pcm]).toString("base64"), mime: "audio/wav", modello: "simulazione", voce: "Sulafat" }), 150); });
    return;
  }
  if (u.pathname === "/api/assistant") {
    let body = ""; req.on("data", c => { body += c; });
    req.on("end", () => {
      let d = {}; try { d = JSON.parse(body); } catch {}
      const m = d.messages || [], last = m[m.length - 1] || {};
      if (last.role === "user" && /efficiente|ottim/i.test(last.text || "")) {
        setTimeout(() => wrapRes(res).json({ text: "", calls: [{ id: "o1", name: "ottimizza", args: { obiettivo: "massimo_sharpe", peso_massimo: 0.5 } }], provider: "gemini", model: "simulazione" }), 400);
        return;
      }
      const op = (m.find(x => x.role === "tool" && x.name === "ottimizza") || {}).result;
      if (last.role === "tool" && op) {
        setTimeout(() => wrapRes(res).json({ text: op.error ? `Errore: ${op.error}` : `Simulazione locale di Quanta.\n- Pesi: **${op.pesi_ottimizzati}**\n- Sharpe da **${op.prima.sharpe}** a **${op.dopo.sharpe}**\n- Vincoli: ${op.vincoli}`, calls: [], provider: "gemini", model: "simulazione" }), 400);
        return;
      }
      if (last.role === "user" && /crisi|crolla/i.test(last.text || "")) {
        setTimeout(() => wrapRes(res).json({ text: "", calls: [{ id: "s1", name: "crisi_storiche", args: {} }, { id: "s2", name: "stress_shock", args: { shock: [{ asset: "globale", variazione: -0.3 }] } }], provider: "gemini", model: "simulazione" }), 400);
        return;
      }
      const cr = (m.find(x => x.role === "tool" && x.name === "crisi_storiche") || {}).result, sh = (m.find(x => x.role === "tool" && x.name === "stress_shock") || {}).result;
      if (last.role === "tool" && cr) {
        const inn = (cr.crisi || []).filter(c => c.perdita_massima);
        setTimeout(() => wrapRes(res).json({ text: `Simulazione locale di Quanta.\n${inn.map(c => `- ${c.nome}: perdita massima **${c.perdita_massima}**, recupero ${c.recupero}`).join("\n")}\n- Shock: **${sh && (sh.impatto_sul_portafoglio || sh.error)}** (${sh && sh.impatto_in_euro})`, calls: [], provider: "gemini", model: "simulazione" }), 400);
        return;
      }
      const mc = last.role === "user" && /al mese|anni/i.test(last.text || "");
      const mcRes = (m.find(x => x.role === "tool" && x.name === "monte_carlo") || {}).result;
      const out = mc ? { text: "", calls: [{ id: "m1", name: "monte_carlo", args: { anni: 15, versamento_mensile: 300 } }], provider: "gemini", model: "simulazione" }
        : mcRes ? { text: mcRes.error ? `Errore: ${mcRes.error}` : `Simulazione locale di Quanta.\n- Mediana dopo ${mcRes.anni} anni: **${mcRes.capitale_finale_nominale["50° (mediana)"]}**\n- 5° percentile: **${mcRes.capitale_finale_nominale["5°"]}**\n- Versato: **${mcRes.totale_versato}**`, calls: [], provider: "gemini", model: "simulazione" }
        : last.role === "user"
        ? { text: "", calls: [{ id: "c1", name: "rischio_portafoglio", args: {} }, { id: "c2", name: "metriche", args: {} }], provider: "gemini", model: "simulazione" }
        : (() => { const r = (m.find(x => x.role === "tool" && x.name === "rischio_portafoglio") || {}).result || {};
            return { text: `Simulazione locale di Quanta.\n- Pesi: **${r.pesi}**\n- Volatilità annua **${r.volatilita_annua}**, VaR 95% **${r.VaR95}**\n- Massimo drawdown **${r.max_drawdown}**`, calls: [], provider: "gemini", model: "simulazione" }; })();
      setTimeout(() => wrapRes(res).json(out), 600);
    });
    return;
  }
  if (u.pathname === "/api/fix") {
    let body = ""; req.on("data", c => { body += c; });
    req.on("end", () => {
      let d = {}; try { d = JSON.parse(body); } catch {}
      const roles = (d.colonne || []).filter(c => c.interpretazione === "incerto").map(c => ({ col: c.col, role: "ignore", why: `«${c.name}» contiene flussi o volumi, non prezzi né rendimenti.` }));
      setTimeout(() => wrapRes(res).json({ summary: "Simulazione locale: su Vercel la proposta arriva da Claude.", roles, cells: [], model: "simulazione" }), 900);
    });
    return;
  }
  const file = path.resolve(site, u.pathname === "/" ? "index.html" : "." + u.pathname);
  if (!file.startsWith(site) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end("not found"); return; }
  const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".md": "text/markdown; charset=utf-8" };
  res.setHeader("Content-Type", TYPES[path.extname(file).toLowerCase()] || "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");
  res.end(fs.readFileSync(file));
}).listen(port, () => console.log("anteprima su http://localhost:" + port));
