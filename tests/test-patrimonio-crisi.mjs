// Patrimonio: «Se arriva una crisi». Quanto si è mosso in passato il patrimonio di oggi (titoli quotati, pesi di oggi), in euro:
// anno brutto (1 su 20), anno peggiore, calo più grande con il recupero, crisi vere coperte dai dati. Niente riquadro senza titoli quotati.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const [,, OUT] = process.argv, PORT = +(process.env.TEST_PORT || 5204), wait = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const db = { v: 1, strumenti: {
  IE00B4L5Y983: { nome: "iShares Core MSCI World", ticker: "SWDA", isin: "IE00B4L5Y983", simbolo: "IWDA.AMS", valuta: "EUR" },
  IT0005383309: { nome: "BTP 1,35% 01/04/2030", isin: "IT0005383309", valuta: "EUR", per100: true, classe: "Obbligazioni", cedola: 0.0135, scadenza: "2030-04-01", freq: 2, governativo: true },
  "m-casa": { nome: "Appartamento", manuale: true, classe: "Immobili", valuta: "EUR" } },
  operazioni: [{ id: "a1", data: "2024-02-01", tipo: "acquisto", strumento: "IE00B4L5Y983", quantita: 100, prezzo: 85 }, { id: "a2", data: "2024-01-15", tipo: "acquisto", strumento: "IT0005383309", quantita: 10000, prezzo: 90.1 },
    { id: "m1", data: "2024-01-01", tipo: "acquisto", strumento: "m-casa", quantita: 1, prezzo: 250000 }] };
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = [];
p.on("pageerror", e => errs.push(e.message));
await p.evaluateOnNewDocument(d => { if (!sessionStorage.getItem("seeded")) { localStorage.clear(); localStorage.setItem("pos-patrimonio-v1", d); sessionStorage.setItem("seeded", "1"); } }, JSON.stringify(db));
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" });
await p.waitForFunction(() => !document.getElementById("pmRiskBox").hidden && /stimato con i tassi/.test(document.getElementById("pmPos").innerText), { timeout: 60000 }).catch(() => {});
await wait(800);
const txt = await p.evaluate(() => document.getElementById("pmRiskBox").innerText.replace(/\s+/g, " "));
const sub = await p.evaluate(() => document.getElementById("pmRiskSub").textContent);
const num = s => +String(s).replace(/[^\d,]/g, "").replace(",", ".");
const base = num((sub.match(/([\d.]+) €/) || [])[1]);
t("riquadro «Se arriva una crisi» sui titoli quotati (la casa no)", /Se arriva una crisi/.test(txt) && base > 15000 && base < 40000, `${sub} · ${base}`);
t("tre misure in euro: anno brutto (1 su 20), anno peggiore, calo più grande", /In un anno brutto \(1 su 20\) [−+][\d.]+ €/.test(txt) && /L'anno peggiore −[\d.]+ €/.test(txt) && /Il calo più grande −[\d.]+ €/.test(txt), txt.slice(0, 400));
const worstE = num((txt.match(/L'anno peggiore −([\d.]+) €/) || [])[1]), worstP = num((txt.match(/L'anno peggiore −[\d.]+ € −(\d+)%/) || [])[1]);
t(`l'anno peggiore in euro torna con la percentuale (${worstP}% di ${base} €)`, worstE > 0 && Math.abs(worstE - base * worstP / 100) <= base * 0.006 + 1, `${worstE} contro ${base * worstP / 100}`);
t("il calo più grande dice da quando a quando e il recupero", /Il calo più grande −[\d.]+ € −\d+% da \w{3} \d{4} a \w{3} \d{4}(, recuperato in \d+ mes|, non ancora recuperato)/.test(txt), (txt.match(/Il calo più grande.{0,90}/) || [""])[0]);
t("stesso segno meno per euro e percentuali", !/ -\d+%/.test(txt), txt.slice(0, 200));
const crisi = await p.evaluate(() => [...document.querySelectorAll(".pm-rk-c li")].map(li => li.innerText.replace(/\s+/g, " ")));
t("crisi vere coperte dai dati: debito euro 2011, COVID 2020, inflazione 2022", ["Crisi del debito euro", "Crollo COVID-19", "Shock inflazione 2022"].every(n => crisi.some(c => c.startsWith(n))), JSON.stringify(crisi));
t("il COVID è una perdita in euro", crisi.some(c => /^Crollo COVID-19.*−[\d.]+ €/.test(c)), JSON.stringify(crisi));
t("spiega che non è una previsione", /Non è una previsione/.test(txt));
await p.evaluate(() => document.getElementById("pmRiskBox").scrollIntoView({ block: "start" })); await wait(300);
await p.screenshot({ path: `${OUT}/patrimonio-crisi.jpg`, type: "jpeg", quality: 72 });
await p.setViewport({ width: 390, height: 844 }); await wait(600);
await p.evaluate(() => document.getElementById("pmRiskBox").scrollIntoView({ block: "start" })); await wait(300);
await p.screenshot({ path: `${OUT}/patrimonio-crisi-tel.jpg`, type: "jpeg", quality: 72 });
t("sul telefono niente esce dallo schermo", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll("#pmRiskBox *")].every(x => x.getBoundingClientRect().right <= innerWidth + 1)));
/* solo la casa: niente riquadro */
const p2 = await b.newPage(); p2.on("pageerror", e => errs.push(e.message));
await p2.evaluateOnNewDocument(() => { localStorage.clear(); localStorage.setItem("pos-patrimonio-v1", JSON.stringify({ v: 1, strumenti: { "m-casa": { nome: "Casa", manuale: true, classe: "Immobili", valuta: "EUR" } }, operazioni: [{ id: "m1", data: "2024-01-01", tipo: "acquisto", strumento: "m-casa", quantita: 1, prezzo: 250000 }] })); });
await p2.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" }); await wait(2000);
t("solo beni senza quotazione: il riquadro non compare", await p2.evaluate(() => document.getElementById("pmRiskBox").hidden));
t("nessun errore JavaScript", !errs.length, errs.join(" | "));
console.log(`\n${pass} superati, ${fail} falliti`);
await b.close(); srv.kill(); process.exit(fail ? 1 : 0);
