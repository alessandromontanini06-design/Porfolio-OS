// Dall'archivio al patrimonio con un clic: «Nel patrimonio» apre il portafoglio salvato e ne porta i movimenti nel patrimonio.
// Da consulente il pulsante non c'è (l'archivio contiene i clienti). Usa files/PAC_due_fogli_righe_vuote.xlsx (creato da test-pac.mjs).
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const [,, OUT] = process.argv, PORT = +(process.env.TEST_PORT || 5189), wait = ms => new Promise(r => setTimeout(r, ms));
const FILE = import.meta.dirname + "/files/PAC_due_fogli_righe_vuote.xlsx";
if (!fs.existsSync(FILE)) { console.error("Manca il file: lancia prima test-pac.mjs"); process.exit(1); }
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = [];
p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept());
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await wait(2500);
await p.evaluate(() => { window.__saved.clear(); localStorage.removeItem("pos-patrimonio-v1"); });
await (await p.$("#file")).uploadFile(FILE);
await p.waitForFunction(() => window.__pos.state().rebuilt, { timeout: 150000 }).catch(() => {});
await p.evaluate(() => document.querySelector('.dock [data-go="map"]').click()); await wait(1200);
await p.waitForFunction(() => !document.getElementById("confirmBtn").disabled, { timeout: 60000 });
await p.evaluate(() => document.getElementById("confirmBtn").click());
await p.waitForFunction(() => !document.getElementById("lab").hidden, { timeout: 60000 }); await wait(1500);
await p.evaluate(() => { const i = document.getElementById("svName"); i.value = "Il mio conto"; document.querySelector('[data-sv="yes"]').click(); }); await wait(1000);
await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await wait(2000);
await p.evaluate(() => document.getElementById("archBtn").click()); await wait(800);
t("nella riga dell'archivio c'è «Nel patrimonio» accanto ad «Apri»", await p.evaluate(() => { const r = [...document.querySelectorAll("#arList .ar-row")].find(x => /Il mio conto/.test(x.innerText)); const btn = r && r.querySelector("[data-svpm]"); return !!btn && btn.offsetParent !== null && /Nel patrimonio/.test(btn.textContent); }));
await p.screenshot({ path: `${OUT}/archivio-riga.jpg`, type: "jpeg", quality: 70 });
await p.evaluate(() => [...document.querySelectorAll("#arList .ar-row")].find(x => /Il mio conto/.test(x.innerText)).querySelector("[data-svpm]").click());
await p.waitForFunction(() => document.body.dataset.scene === "patrimonio" && /operazioni aggiunte/.test(document.getElementById("pmTopMsg").textContent), { timeout: 150000 }).catch(() => {});
const msg = await p.evaluate(() => document.getElementById("pmTopMsg").textContent), db = await p.evaluate(() => JSON.parse(localStorage.getItem("pos-patrimonio-v1") || "null"));
t("un clic: si apre il portafoglio e i movimenti vanno nel patrimonio", /\d+ operazioni aggiunte da «/.test(msg) && db && db.operazioni.length > 5, msg);
t("e si arriva sulla pagina del patrimonio", await p.evaluate(() => document.body.dataset.scene === "patrimonio"));
await p.screenshot({ path: `${OUT}/archivio-nel-patrimonio.jpg`, type: "jpeg", quality: 70 });
/* da consulente non c'è */
await p.evaluate(() => { document.body.dataset.ruolo = "pro"; document.getElementById("archBtn").click(); }); await wait(800);
t("da consulente il pulsante non c'è", await p.evaluate(() => [...document.querySelectorAll("#arList [data-svpm]")].every(x => x.offsetParent === null)));
await p.setViewport({ width: 390, height: 844 }); await p.evaluate(() => { document.body.dataset.ruolo = ""; document.getElementById("archBtn").click(); }); await wait(900);
await p.screenshot({ path: `${OUT}/archivio-tel.jpg`, type: "jpeg", quality: 70 });
t("sul telefono la riga con i tre pulsanti resta nello schermo", await p.evaluate(() => [...document.querySelectorAll("#arList .ar-row, #arList .ar-row *")].every(e => e.getBoundingClientRect().right <= innerWidth + 1)), await p.evaluate(() => [...document.querySelectorAll("#arList .ar-row *")].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => e.className + ":" + Math.round(e.getBoundingClientRect().right)).slice(0, 5).join(", ")));
t("nessun errore JavaScript", !errs.length, errs.join(" | "));
console.log(`\n${pass} superati, ${fail} falliti`);
await b.close(); srv.kill(); process.exit(fail ? 1 : 0);
