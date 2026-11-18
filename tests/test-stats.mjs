// Statistiche d'uso: un visitatore simulato fa il percorso, poi la pagina privata deve mostrare ciò che ha fatto.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const [,, OUT] = process.argv, PORT = 5167, wait = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
let pass = 0, fail = 0;const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = []; p.on("pageerror", e => errs.push(e.message));
const sent = [];p.on("request", r => { if (r.url().includes("/api/track")) sent.push(r.postData() || ""); });
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" }); await wait(4000);
await p.click("#sampleBtn");
await p.waitForFunction(() => /ricostruito/.test(document.getElementById("dsName").innerText), { timeout: 150000 });
await p.evaluate(() => document.querySelector('.dock [data-go="map"]').click()); await wait(1200);
// segnalazione con la struttura del file
await p.evaluate(() => { document.getElementById("fbCard").open = true; document.getElementById("fbText").value = "Prova: la colonna Totale non viene usata"; document.getElementById("fbStruct").checked = true; document.getElementById("fbSend").click(); });
await wait(500);
t("segnalazione: conferma all'utente", await p.evaluate(() => /Grazie/.test(document.getElementById("fbMsg").textContent)));
await p.evaluate(() => document.getElementById("confirmBtn").click()); await wait(4000);
await p.evaluate(() => document.querySelector("#metrics [data-rc], #lab [data-rc]").click()); await wait(400); await p.keyboard.press("Escape"); await wait(400);
await p.evaluate(() => document.getElementById("prStart").click()); await wait(300);
await p.click('[data-prgo="1"]'); for (const v of ["7-15", "pens", "3-6"]) { await p.click(`[data-prv="${v}"]`); await wait(150); }
while (await p.$("[data-prc]")) { await p.click('[data-prc][data-prv="stay"]'); await wait(200); await p.click('[data-prgo="1"]'); await wait(200); }
await p.evaluate(() => document.getElementById("closeProfile").click());
await p.evaluate(() => window.dispatchEvent(new Event("pagehide"))); await wait(2500);
t("nessun errore JavaScript nel sito", !errs.length, errs.join(" | "));
// pagina privata
const s = await b.newPage(); await s.setViewport({ width: 1300, height: 1000 });
await s.goto(`http://localhost:${PORT}/stats.html`, { waitUntil: "networkidle2" });
t("senza chiave chiede la chiave", await s.evaluate(() => !document.getElementById("login").hidden));
await s.type("#key", "sbagliata"); await s.click("#go"); await wait(800);
t("chiave sbagliata rifiutata", await s.evaluate(() => /errata/i.test(document.getElementById("err").textContent)));
await s.evaluate(() => { document.getElementById("key").value = "prova-locale"; }); await s.click("#go"); await wait(1200);
const txt = await s.evaluate(() => document.getElementById("out").innerText.replace(/\s+/g, " "));
console.log("   ", txt.slice(0, 420));
t("statistiche: sessione, avvio con l'esempio e arrivo al laboratorio", /SESSIONI 1/i.test(txt) && /Esempio/.test(txt) && /ARRIVATI AL LABORATORIO 1/i.test(txt));
t("statistiche: funzioni, profilo e segnalazione con la struttura", /Ricevute dei calcoli/.test(txt) && /Test del profilo/.test(txt) && /la colonna Totale/.test(txt) && /Movimenti \[/.test(txt));
// i dati salvati davvero: tutti gli eventi del percorso, e nessun valore del file (privacy)
const J = await s.evaluate(async () => (await fetch("/api/stats?days=7", { headers: { "x-stats-key": "prova-locale" } })).json());
const keys = Object.keys(J.count || {}), saved = JSON.stringify(J);
t("salvati: visita, avvio, laboratorio, sezioni, funzioni, profilo, segnalazione", ["visit", "start:esempio", "import_ok", "scene:lab", "feature:ricevuta", "feature:profilo", "profile_done", "feedback"].every(k => keys.includes(k)), keys.join(","));
t("privacy: niente nome del file, ISIN, importi o valori nei dati salvati", !/Portfolio_OS_esempio|IE00B4L5Y983|\d{1,3}\.\d{3},\d{2}|\d+,\d{2} ?€/.test(saved), saved.slice(0, 300));
t("la struttura salvata ha solo nomi di fogli e colonne", /Movimenti \[\d+ righe\]/.test(saved) && /Strumento/.test(saved));
await s.screenshot({ path: `${OUT}/stats.jpg`, type: "jpeg", quality: 70, fullPage: true });
console.log(`\n${pass} superati, ${fail} falliti`);
await b.close(); srv.kill(); process.exit(fail ? 1 : 0);
