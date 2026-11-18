// Obiettivi del cliente nell'archivio: con un portafoglio dell'archivio aperto, gli obiettivi si salvano lì (non nel browser);
// un file nuovo torna agli obiettivi del browser; riaprendo il cliente dall'archivio tornano i suoi.
// Usa files/PAC_due_fogli_righe_vuote.xlsx (creato da test-pac.mjs).
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const [,, OUT] = process.argv, PORT = +(process.env.TEST_PORT || 5184), wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
const FILE = import.meta.dirname + "/files/PAC_due_fogli_righe_vuote.xlsx";
if (!fs.existsSync(FILE)) { console.error("Manca il file: lancia prima test-pac.mjs"); process.exit(1); }
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = [];
p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept());
await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await wait(2500);
await p.evaluate(() => { window.__saved.clear(); localStorage.setItem("pos-obiettivi-v1", JSON.stringify([{ nome: "Auto", importo: 20000, anno: 3 }])); });
const build = async () => {
  await (await p.$("#file")).uploadFile(FILE);
  await p.waitForFunction(() => window.__pos.state().rebuilt, { timeout: 150000 }).catch(() => {});
  await p.evaluate(() => document.querySelector('.dock [data-go="map"]').click()); await wait(1200);
  await p.waitForFunction(() => !document.getElementById("confirmBtn").disabled, { timeout: 60000 });
  await p.evaluate(() => document.getElementById("confirmBtn").click());
  await p.waitForFunction(() => !document.getElementById("lab").hidden, { timeout: 60000 }); await wait(1500);
};
const toSim = async () => { await p.evaluate(() => document.querySelector('.dock [data-go="sim"]').click()); await p.waitForFunction(() => /Mediana dopo/.test((document.getElementById("mcKpis") || {}).innerText || ""), { timeout: 30000 }).catch(() => {}); await wait(600); };
const goals = () => p.evaluate(() => [...document.querySelectorAll("#mcGoals .mcg-n")].map(i => i.value));
await build();
await p.evaluate(() => { const i = document.getElementById("svName"); i.value = "Cliente A"; document.querySelector('[data-sv="yes"]').click(); }); await wait(1000);
await toSim();
t("cliente appena salvato: parte dagli obiettivi del browser (Auto)", JSON.stringify(await goals()) === '["Auto"]', JSON.stringify(await goals()));
await p.evaluate(() => document.querySelector("[data-mcgadd]").click()); await wait(300);
await p.evaluate(() => { const r = [...document.querySelectorAll("#mcGoals .mcg-row")].pop(), set = (s, v) => { const i = r.querySelector(s); i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); }; set(".mcg-n", "Casa al mare"); set(".mcg-a input", "150000"); set(".mcg-y input", "10"); });
await wait(1500);
const rec = await p.evaluate(() => window.__saved.list().then(a => a.map(r => ({ name: r.name, ob: r.ob }))));
t("gli obiettivi cambiati si salvano nel portafoglio del cliente", rec.length === 1 && Array.isArray(rec[0].ob) && rec[0].ob.map(g => g.nome).join() === "Auto,Casa al mare" && rec[0].ob[1].importo === 150000, JSON.stringify(rec));
t("…e non in quelli del browser", JSON.parse(await p.evaluate(() => localStorage.getItem("pos-obiettivi-v1"))).map(g => g.nome).join() === "Auto");
/* un file nuovo (non dall'archivio): obiettivi del browser */
await p.evaluate(() => document.querySelector('.dock [data-go="home"]').click()); await wait(800);
await build(); await toSim();
t("file nuovo: tornano gli obiettivi del browser (solo Auto)", JSON.stringify(await goals()) === '["Auto"]', JSON.stringify(await goals()));
/* riaperto dall'archivio: tornano i suoi */
await p.evaluate(() => document.getElementById("archBtn").click()); await wait(800);
await p.evaluate(() => [...document.querySelectorAll("#arList .ar-row")].find(r => /Cliente A/.test(r.innerText)).querySelector("[data-svo]").click());
await p.waitForFunction(() => document.body.dataset.scene === "lab" && !document.getElementById("lab").hidden, { timeout: 120000 }).catch(() => {});
await wait(1500); await toSim();
t("riaperto «Cliente A» dall'archivio: i suoi obiettivi (Auto e Casa al mare)", JSON.stringify(await goals()) === '["Auto","Casa al mare"]', JSON.stringify(await goals()));
const rep = await p.evaluate(() => window.__report({}) || "");
t("e il report del cliente li riporta", /Casa al mare/.test(rep));
t("nessun errore JavaScript", !errs.length, errs.join(" | "));
console.log(`\n${pass} superati, ${fail} falliti`);
await b.close(); srv.kill(); process.exit(fail ? 1 : 0);
