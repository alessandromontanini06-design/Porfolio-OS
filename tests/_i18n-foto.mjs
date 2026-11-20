// Foto del sito in una lingua: node _i18n-foto.mjs <en|es> <cartella> [pagine…]
import { spawn } from "node:child_process"; import path from "node:path"; import fs from "node:fs"; import puppeteer from "puppeteer-core";
const [, , L = "en", OUT = "files/shots/i18n", ...PAG] = process.argv, PORT = 5331, wait = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, [path.join(import.meta.dirname, "serve.mjs")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" }); await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.evaluateOnNewDocument(L => { if (!sessionStorage.getItem("f")) { localStorage.clear(); localStorage.setItem("pos-lingua-v1", L); localStorage.setItem("pos-ruolo-v1", "priv"); localStorage.setItem("pos-i18n-raccogli", "1"); sessionStorage.setItem("f", "1"); } }, L);
await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await wait(2500);
const want = n => !PAG.length || PAG.includes(n);
const shot = async n => { if (want(n)) await p.screenshot({ path: `${OUT}/${L}-${n}.jpg`, type: "jpeg", quality: 70 }); };
await shot("home");
if (want("home2")) { await p.evaluate(() => { const s = document.getElementById("scene-home"); s.scrollTop = 1400; }); await wait(800); await shot("home2"); }
if (PAG.some(x => /lab|risk|sim|stress/.test(x)) || !PAG.length) {
  await (await p.$("#file")).uploadFile(path.join(import.meta.dirname, "files", "PAC_due_fogli_righe_vuote.xlsx"));
  await p.waitForFunction(() => window.__pos.state().rebuilt, { timeout: 120000 }).catch(() => {});
  await p.evaluate(() => document.querySelector('.dock [data-go="map"]').click()); await wait(1200);
  await p.waitForFunction(() => !document.getElementById("confirmBtn").disabled, { timeout: 60000 }).catch(() => {});
  await p.evaluate(() => document.getElementById("confirmBtn").click()); await p.waitForFunction(() => !document.getElementById("lab").hidden, { timeout: 60000 }).catch(() => {}); await wait(2500);
  await shot("lab");
  for (const s of ["risk", "sim", "stress"]) if (want(s)) { await p.evaluate(s => document.querySelector(`.dock [data-go="${s}"]`).click(), s); await wait(2500); await shot(s); }
}
const resto = await p.evaluate(() => { const s = [...document.querySelectorAll(".scene")].find(x => !x.hidden); const w = document.createTreeWalker(s || document.body, NodeFilter.SHOW_TEXT); const it = []; let n; while ((n = w.nextNode())) { const t = n.data.trim(); if (/\b(il|della|per|con|che|non|sono|una|degli)\b/i.test(t) && n.parentElement && n.parentElement.getClientRects().length) it.push(t.slice(0, 70)); } return it.slice(0, 12); });
const manca = await p.evaluate(async L => { const d = await (await fetch(`/js/i18n/${L}.json`)).json(); return window.__i18n.raccolte().map(x => x[0]).filter(k => !d[k] && /[a-zà-ù]{3}/i.test(k) && !/^[A-Z0-9.\-·{} ]+$/.test(k)); }, L);
fs.writeFileSync(`${OUT}/${L}-mancanti.txt`, manca.join("\n")); console.log("frasi senza traduzione:", manca.length, "→", `${OUT}/${L}-mancanti.txt`);
console.log("errori JS:", errs.length, errs.slice(0, 2).join(" | ")); console.log("ancora in italiano (esempi):", JSON.stringify(resto));
await b.close(); srv.kill();
