// Raccoglie tutte le frasi del sito (chiavi di js/ui/lingua.js) girando per le pagine: home, laboratorio con l'esempio e un file,
// strumenti, patrimonio, Studio, pannelli, chat, privacy. Scrive tests/files/i18n-chiavi.json. Uso: node _i18n-raccogli.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import puppeteer from "puppeteer-core";
const here = import.meta.dirname, PORT = 5330, wait = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join(here, "serve.mjs")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const TUTTE = new Map(), errs = [];
const PM = { v: 1, strumenti: { IE00B4L5Y983: { nome: "iShares Core MSCI World", ticker: "SWDA", isin: "IE00B4L5Y983", simbolo: "IWDA.AMS", valuta: "EUR" }, IT0005383309: { nome: "BTP 1,35% 01/04/2030", isin: "IT0005383309", valuta: "EUR", per100: true, classe: "Obbligazioni", cedola: 0.0135, scadenza: "2030-04-01", freq: 2, governativo: true }, "m-liq": { nome: "Conto deposito", manuale: true, classe: "Liquidità", valuta: "EUR" } },
  operazioni: [{ id: "a1", data: "2024-02-01", tipo: "acquisto", strumento: "IE00B4L5Y983", quantita: 40, prezzo: 85 }, { id: "a3", data: "2024-01-15", tipo: "acquisto", strumento: "IT0005383309", quantita: 2000, prezzo: 90.1 }, { id: "m1", data: "2024-01-01", tipo: "acquisto", strumento: "m-liq", quantita: 1, prezzo: 2000 }, { id: "d1", data: "2025-06-01", tipo: "dividendo", strumento: "IE00B4L5Y983", importo: 12 }] };
async function nuova(ruolo, pm) {
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept());
  await p.evaluateOnNewDocument((ruolo, pm) => { if (!sessionStorage.getItem("r")) { localStorage.clear(); localStorage.setItem("pos-i18n-raccogli", "1"); if (ruolo) localStorage.setItem("pos-ruolo-v1", ruolo); if (pm) localStorage.setItem("pos-patrimonio-v1", pm); sessionStorage.setItem("r", "1"); } }, ruolo, pm ? JSON.stringify(PM) : null);
  return p;
}
const prendi = async p => { const a = await p.evaluate(() => window.__i18n ? window.__i18n.raccolte() : []); a.forEach(([k, n]) => TUTTE.set(k, (TUTTE.get(k) || 0) + n)); };
const clic = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (e) e.click(); return !!e; }, sel);
const vai = (p, s) => p.evaluate(s => { const e = document.querySelector(`.dock [data-go="${s}"]`) || document.querySelector(`[data-go="${s}"]`); if (e) e.click(); }, s);
const scorri = p => p.evaluate(async () => { const s = [...document.querySelectorAll(".scene")].find(x => !x.hidden); if (!s) return; for (let y = 0; y < s.scrollHeight; y += 700) { s.scrollTop = y; await new Promise(r => setTimeout(r, 120)); } });

/* 1. privato: home, costruttore, esempio, laboratorio, strumenti */
let p = await nuova("priv");
await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await wait(2500); await scorri(p);
await clic(p, "#builderBtn"); await wait(800); await p.evaluate(() => document.querySelectorAll("#builder [data-bdtab], #builder .bd-tab").forEach((t, i) => setTimeout(() => t.click(), i * 200))); await wait(2500); await p.keyboard.press("Escape"); await wait(300);
await clic(p, "#chatBtn"); await wait(800); await clic(p, "#chatClose, .chat-head .btn"); await wait(300);
await (await p.$("#file")).uploadFile(path.join(here, "files", "PAC_due_fogli_righe_vuote.xlsx"));
await p.waitForFunction(() => window.__pos.state().rebuilt, { timeout: 120000 }).catch(() => {}); await wait(1500);
await vai(p, "scan"); await wait(1200); await scorri(p); await vai(p, "map"); await wait(1500); await scorri(p);
await p.waitForFunction(() => !document.getElementById("confirmBtn").disabled, { timeout: 60000 }).catch(() => {});
await clic(p, "#confirmBtn"); await p.waitForFunction(() => !document.getElementById("lab").hidden, { timeout: 60000 }).catch(() => {}); await wait(2500); await scorri(p);
for (const s of ["strumenti", "risk", "sim", "fire", "stress", "opt", "bench"]) { await vai(p, s); await wait(2500); await scorri(p); }
await vai(p, "lab"); await wait(1000);
await clic(p, "#prStart"); await wait(800); await p.evaluate(() => { const b = document.querySelector('[data-prgo="1"]'); b && b.click(); }); await wait(500); await p.keyboard.press("Escape");
await clic(p, "#reportBtn"); await wait(600); await p.keyboard.press("Escape");
await clic(p, "#archBtn"); await wait(800); await p.keyboard.press("Escape");
await clic(p, "#mnuBtn"); await wait(500); await clic(p, "#setBtn"); await wait(400);
await prendi(p); await p.close();

/* 2. esempio */
p = await nuova("priv");
await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await wait(2000);
await p.evaluate(() => { const e = [...document.querySelectorAll("button, a")].find(x => /esempio/i.test(x.innerText)); e && e.click(); }); await wait(6000);
await clic(p, "#confirmBtn"); await wait(3000); await scorri(p); await prendi(p); await p.close();

/* 3. patrimonio */
p = await nuova("priv", true);
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" }); await wait(4000); await vai(p, "patrimonio"); await wait(3000); await scorri(p);
for (const t of ["acquisto", "vendita", "dividendo", "bene", "pac"]) { await p.evaluate(t => { const b = document.querySelector(`[data-pmt="${t}"]`); b && b.click(); }, t); await wait(300); }
await p.evaluate(() => document.querySelectorAll("[data-pmper]").forEach((b, i) => setTimeout(() => b.click(), i * 150))); await wait(1200);
await prendi(p); await p.close();

/* 4. consulente: Studio, profilo, adeguatezza */
p = await nuova("pro");
await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await wait(2000);
await clic(p, "#navStudio"); await wait(1500); await scorri(p);
await (await p.$("#file")).uploadFile(path.join(here, "files", "PAC_due_fogli_righe_vuote.xlsx"));
await p.waitForFunction(() => window.__pos.state().rebuilt, { timeout: 120000 }).catch(() => {});
await vai(p, "map"); await wait(1200); await p.waitForFunction(() => !document.getElementById("confirmBtn").disabled, { timeout: 60000 }).catch(() => {});
await clic(p, "#confirmBtn"); await p.waitForFunction(() => !document.getElementById("lab").hidden, { timeout: 60000 }).catch(() => {}); await wait(2500);
await clic(p, '[data-stact="profilo"]'); await wait(600);
for (const [k, v] of Object.entries({ hor: 1, obj: 0, loss: 1, react: 1, exp: 1, know: 1, res: 1, share: 1 })) await p.evaluate((k, v) => { const b = document.querySelector(`[data-stq="${k}"][data-stv="${v}"]`); b && b.click(); }, k, v);
await wait(400); await prendi(p); await clic(p, "#stPrSave"); await wait(800); await scorri(p);
await p.evaluate(() => { const i = document.getElementById("svName"); if (i) { i.value = "Mario Rossi"; document.querySelector('[data-sv="yes"]').click(); } }); await wait(800);
await clic(p, "#navStudio"); await wait(1500); await scorri(p); await prendi(p); await p.close();

/* 5. privacy */
p = await nuova("priv");
await p.goto(`http://localhost:${PORT}/privacy.html`, { waitUntil: "networkidle2" }); await wait(1500); await prendi(p); await p.close();

await b.close(); srv.kill();
const out = [...TUTTE.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
fs.writeFileSync(path.join(here, "files", "i18n-chiavi.json"), JSON.stringify(out, null, 0));
console.log("chiavi:", out.length, "· caratteri:", out.join("").length, "· errori JS:", errs.length, errs.slice(0, 3).join(" | "));
