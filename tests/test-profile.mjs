// «Il tuo profilo»: domande, crisi rivissute con il capitale dell'utente, verdetto con soglia e quota investita.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const [,, OUT] = process.argv, PORT = 5169, wait = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = []; p.on("pageerror", e => errs.push(e.message));
let pass = 0, fail = 0;const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
const body = () => p.evaluate(() => document.getElementById("prBody").innerText.replace(/\s+/g, " "));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" });
await p.waitForFunction(() => /ricostruito/.test(document.getElementById("dsName").innerText), { timeout: 150000 });
await p.evaluate(() => document.querySelector('.dock [data-go="map"]').click()); await wait(1200);
await p.evaluate(() => document.getElementById("confirmBtn").click()); await wait(4000);
t("scheda del test nel laboratorio", await p.evaluate(() => !document.getElementById("profCard").hidden && /coerente con te/.test(document.getElementById("profCard").innerText)));
await p.click("#prStart"); await wait(500);
const intro = await body();
t("introduzione con il capitale dell'utente e le crisi trovate", /€/.test(intro) && /crisi/.test(intro), intro.slice(0, 200));
await p.click('[data-prgo="1"]'); await wait(200);
for (const v of ["7-15", "pens", "3-6"]) { await p.click(`[data-prv="${v}"]`); await wait(200); }
let first = true, n = 0;
while (await p.$("[data-prc]")) {
  const txt = await body(); if (first) console.log("    crisi 1:", txt.slice(0, 230));
  t(`crisi ${++n}: capitale e perdita mostrati`, /ora vale/.test(txt) && /perso il/.test(txt));
  await p.click(`[data-prc][data-prv="${first ? "all" : "stay"}"]`); await wait(300);
  const res = await body(); if (first) { console.log("    esito:", res.slice(res.indexOf("Hai scelto"), res.indexOf("Hai scelto") + 220)); t("esito della scelta in euro", /Hai scelto/.test(res) && /€|recuper/.test(res)); }
  if (first) await p.screenshot({ path: `${OUT}/pr-1.jpg`, type: "jpeg", quality: 70 });
  first = false; await p.click('[data-prgo="1"]'); await wait(300);
}
const v = await body();
console.log("    verdetto:", v.slice(0, 420));
t("verdetto con soglia, perdita peggiore e quote investite", /La perdita che reggi/i.test(v) && /Investito come oggi/i.test(v) && /non consulenza/i.test(v));
t("chi vende al -14% regge meno del 14%: portafoglio da -14% non coerente", /meno del \d+%/i.test(v) && /più rischioso di quanto reggi/i.test(v), v.slice(0, 200));
await p.screenshot({ path: `${OUT}/pr-2.jpg`, type: "jpeg", quality: 70 });
await p.click('[data-prgo="cmp"]'); await wait(1200);
t("«Prova un'allocazione diversa» porta al confronto", await p.evaluate(() => !document.getElementById("profile").classList.contains("open")));
t("nessun errore JavaScript", !errs.length, errs.join(" | "));
console.log(`\n${pass} superati, ${fail} falliti`);
await b.close(); srv.kill(); process.exit(fail ? 1 : 0);
