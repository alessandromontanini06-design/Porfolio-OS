// Dal patrimonio al laboratorio: «Analizza nel laboratorio», poi stress test, simulazioni e indipendenza devono riempirsi,
// con il capitale di partenza uguale al valore del patrimonio quotato. Il 19/11/2026 restavano vuote (pfNow si richiamava all'infinito).
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const OUT = process.argv[2] || "files/shots", wait = ms => new Promise(r => setTimeout(r, ms));
const SITE = process.env.SITE || "http://localhost:5297";
const srv = process.env.SITE ? null : spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: "5297", REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const db = { v: 1, strumenti: {
  IE00B4L5Y983: { nome: "iShares Core MSCI World", ticker: "SWDA", isin: "IE00B4L5Y983", simbolo: "IWDA.AMS", valuta: "EUR" },
  IE00BKM4GZ66: { nome: "iShares Core MSCI EM IMI", ticker: "EIMI", isin: "IE00BKM4GZ66", simbolo: "EIMI.MI", valuta: "EUR" },
  IT0005383309: { nome: "BTP 1,35% 01/04/2030", isin: "IT0005383309", valuta: "EUR", per100: true, classe: "Obbligazioni", cedola: 0.0135, scadenza: "2030-04-01", freq: 2, governativo: true },
  "m-liq": { nome: "Conto deposito", manuale: true, classe: "Liquidità", valuta: "EUR" } },
  operazioni: [{ id: "a1", data: "2024-02-01", tipo: "acquisto", strumento: "IE00B4L5Y983", quantita: 40, prezzo: 85 }, { id: "a2", data: "2024-03-01", tipo: "acquisto", strumento: "IE00BKM4GZ66", quantita: 60, prezzo: 30 },
    { id: "a3", data: "2024-01-15", tipo: "acquisto", strumento: "IT0005383309", quantita: 2000, prezzo: 90.1 }, { id: "m1", data: "2024-01-01", tipo: "acquisto", strumento: "m-liq", quantita: 1, prezzo: 2000 }] };
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = [];
p.on("pageerror", e => errs.push("pageerror: " + e.message + " " + (e.stack || "").split("\n").slice(0, 3).join(" | ")));
p.on("console", m => { if (m.type() === "error" || m.type() === "warning") errs.push(m.type() + ": " + m.text()); });
await p.evaluateOnNewDocument(d => { if (!sessionStorage.getItem("s")) { localStorage.clear(); localStorage.setItem("pos-patrimonio-v1", d); sessionStorage.setItem("s", "1"); } }, JSON.stringify(db));
await p.goto(SITE + "/", { waitUntil: "networkidle2" }); await wait(3000);
await p.click("#pmLab");
await p.waitForFunction(() => !document.getElementById("scene-lab").hidden, { timeout: 60000 }).catch(() => {});
await wait(2500);
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
const go = async k => { await p.evaluate(k => document.querySelector(`.dock [data-go="${k}"]`).click(), k); await wait(2500); };
await go("stress");
const st = await p.evaluate(() => document.getElementById("scene-stress").innerText.replace(/\s+/g, " "));
t("stress test: le crisi si vedono", /Crollo COVID-19/.test(st) && /perdita massima del portafoglio/.test(st), st.slice(0, 200));
const capS = await p.evaluate(() => { const i = [...document.querySelectorAll("#scene-stress input")].find(x => /cap/i.test(x.id || x.name || "") || x.closest("label") && /Capitale/.test(x.closest("label").innerText)); return i ? +i.value : NaN; });
await go("sim");
const sim = await p.evaluate(() => ({ cap: +(document.querySelector("#scene-sim input") || {}).value, txt: document.getElementById("scene-sim").innerText.replace(/\s+/g, " ") }));
t(`simulazioni: capitale iniziale dal patrimonio (${sim.cap} €)`, sim.cap > 3000 && sim.cap < 20000, String(sim.cap));
t("simulazioni: il ventaglio si disegna", /mediana|Mediana/.test(sim.txt), sim.txt.slice(0, 200));
await go("fire");
const fire = await p.evaluate(() => document.getElementById("scene-fire").innerText.replace(/\s+/g, " "));
t("indipendenza finanziaria: c'è il risultato", /anni|età/i.test(fire) && fire.length > 400, fire.slice(0, 200));
t("nessun errore JavaScript", !errs.some(e => /pageerror/.test(e)), errs.join(" | "));
await p.screenshot({ path: OUT + "/patrimonio-lab-stress.jpg", type: "jpeg", quality: 60 });
console.log(`
${pass} superati, ${fail} falliti`);
await b.close(); if (srv) srv.kill(); process.exit(fail ? 1 : 0);
