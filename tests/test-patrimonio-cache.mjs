// Patrimonio veloce: gli ultimi prezzi restano nel browser (pos-pm-px-v1). Riaprendo entro 3 ore niente richieste e valori subito;
// con prezzi più vecchi si aggiornano in sottofondo; se le richieste falliscono restano gli ultimi prezzi buoni (niente errori).
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const [,, OUT] = process.argv, PORT = +(process.env.TEST_PORT || 5190), wait = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const db = { v: 1, strumenti: {
  IE00B4L5Y983: { nome: "iShares Core MSCI World", ticker: "SWDA", isin: "IE00B4L5Y983", simbolo: "IWDA.AMS", valuta: "EUR" },
  IT0005383309: { nome: "BTP 1,35% 01/04/2030", isin: "IT0005383309", valuta: "EUR", per100: true, classe: "Obbligazioni", cedola: 0.0135, scadenza: "2030-04-01", freq: 2, governativo: true } },
  operazioni: [{ id: "a1", data: "2024-02-01", tipo: "acquisto", strumento: "IE00B4L5Y983", quantita: 50, prezzo: 85 }, { id: "a2", data: "2024-01-15", tipo: "acquisto", strumento: "IT0005383309", quantita: 10000, prezzo: 90.1 }] };
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = [];
p.on("pageerror", e => errs.push(e.message));
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
let calls = 0, block = false; const urls = [];
await p.setRequestInterception(true);
p.on("request", r => { if (/\/api\/(prices|rates)/.test(r.url())) { calls++; urls.push(r.url().replace(/^https?:\/\/[^/]+/, "")); if (block) return r.respond({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "servizio fermo (prova)" }) }); } r.continue(); });
await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" });
await p.evaluate(d => { localStorage.clear(); localStorage.setItem("pos-patrimonio-v1", d); }, JSON.stringify(db));
const ready = () => p.waitForFunction(() => /prezzo al/.test((document.getElementById("pmPos") || {}).innerText || "") && /stimato con i tassi/.test(document.getElementById("pmPos").innerText), { timeout: 60000 }).then(() => true).catch(() => false);
const rows = () => p.evaluate(() => [...document.querySelectorAll("#pmPos tbody tr")].map(tr => tr.innerText.replace(/\s+/g, " ")).join(" | "));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "load" }); await ready(); await wait(800);
const c1 = await p.evaluate(() => { const c = JSON.parse(localStorage.getItem("pos-pm-px-v1") || "null"); return c ? { n: Object.keys(c.px).length, t: c.t, pts: Object.values(c.px).every(j => j.points && j.points.length > 10) } : null; });
t("prima apertura: i prezzi dei due strumenti restano nel browser", c1 && c1.n === 2 && c1.pts && Date.now() - c1.t < 60000, JSON.stringify(c1));
const r1 = await rows();
/* seconda apertura entro 3 ore: nessuna richiesta, valori subito */
calls = 0; urls.length = 0; const s2 = Date.now();
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "load" }); const ok2 = await ready(); const t2 = Date.now() - s2; await wait(1500);
t(`seconda apertura: valori in ${t2} ms, senza chiedere i prezzi`, ok2 && calls === 0 && t2 < 4000, `richieste ${calls}: ${urls.join(", ")}`);
t("…e gli stessi valori della prima volta", (await rows()) === r1, `${await rows()}  ≠  ${r1}`);
/* prezzi di 4 ore fa: valori subito dalla memoria, poi si aggiornano */
await p.evaluate(() => { const c = JSON.parse(localStorage.getItem("pos-pm-px-v1")); c.t = Date.now() - 4 * 3600e3; localStorage.setItem("pos-pm-px-v1", JSON.stringify(c)); });
calls = 0; await p.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
const early = await p.evaluate(() => [...document.querySelectorAll("#pmPos tbody tr")].some(tr => /prezzo al/.test(tr.innerText)));
await p.waitForFunction(() => !/Aggiorno/.test(document.getElementById("pmAsOf").textContent), { timeout: 60000 }).catch(() => {}); await wait(500);
const c3 = await p.evaluate(() => JSON.parse(localStorage.getItem("pos-pm-px-v1")).t);
t("prezzi vecchi di 4 ore: valori subito dalla memoria, poi aggiornati", early && Date.now() - c3 < 60000, `subito ${early}, aggiornati ${Math.round((Date.now() - c3) / 1000)} s fa`);
/* servizio dei prezzi fermo: restano gli ultimi prezzi buoni */
await p.evaluate(() => { const c = JSON.parse(localStorage.getItem("pos-pm-px-v1")); c.t = Date.now() - 5 * 3600e3; localStorage.setItem("pos-pm-px-v1", JSON.stringify(c)); localStorage.removeItem("pos-bdi-v1"); });
block = true; calls = 0; await p.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
await p.waitForFunction(() => !/Aggiorno/.test(document.getElementById("pmAsOf").textContent), { timeout: 60000 }).catch(() => {}); await wait(800);
const r4 = await rows(), cap = await p.evaluate(() => document.getElementById("pmPos").innerText);
t("prezzi fermi (503): restano gli ultimi prezzi, senza «prezzi non disponibili»", calls >= 1 && /prezzo al/.test(r4) && /stimato con i tassi/.test(r4) && !/non disponibil/.test(cap), `${calls} · ${r4.slice(0, 200)}`);
block = false;
await p.screenshot({ path: `${OUT}/patrimonio-cache.jpg`, type: "jpeg", quality: 65 });
t("nessun errore JavaScript", !errs.length, errs.join(" | "));
console.log(`\n${pass} superati, ${fail} falliti`);
await b.close(); srv.kill(); process.exit(fail ? 1 : 0);
