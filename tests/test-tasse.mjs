// Patrimonio: riquadro «Le tue tasse» (stima). Patrimonio inventato messo nel browser prima di aprire il sito.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const [,, OUT] = process.argv, PORT = +(process.env.TEST_PORT || 5178), wait = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const db = { v: 1, creato: "2026-01-01T00:00:00Z",
  strumenti: {
    IE00B4L5Y983: { nome: "SWDA", ticker: "SWDA", isin: "IE00B4L5Y983", simbolo: "IWDA.AMS", valuta: "EUR" },        // solo il ticker: è un ETF grazie al catalogo
    IT0003132476: { nome: "Eni", ticker: "ENI", isin: "IT0003132476", simbolo: "ENI.MIL", valuta: "EUR" },
    BTP35: { nome: "BTP 3,35% 01MZ35", isin: "IT0005358806", valuta: "EUR", per100: true, governativo: true, cedola: 0.0335, freq: 2, scadenza: "2035-03-01" },
    casa: { nome: "Appartamento", valuta: "EUR", manuale: true, tipo: "casa" } },
  operazioni: [
    { id: "a1", data: "2023-03-01", tipo: "acquisto", strumento: "IE00B4L5Y983", quantita: 50, prezzo: 70 },
    { id: "a2", data: "2024-02-01", tipo: "acquisto", strumento: "IT0003132476", quantita: 200, prezzo: 15 },
    { id: "a3", data: "2024-09-02", tipo: "vendita", strumento: "IT0003132476", quantita: 100, prezzo: 13 },   // −200 nel 2024: nello zainetto fino al 31/12/2028
    { id: "a4", data: "2025-03-01", tipo: "acquisto", strumento: "BTP35", quantita: 10000, prezzo: 98 },
    { id: "a5", data: "2026-10-01", tipo: "valutazione", strumento: "BTP35", prezzo: 99 },
    { id: "a6", data: "2026-01-01", tipo: "acquisto", strumento: "casa", quantita: 1, prezzo: 250000 }] };
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = [];
p.on("pageerror", e => errs.push(e.message));
await p.evaluateOnNewDocument(d => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("pos-patrimonio-v1", d); sessionStorage.setItem("seeded", "1"); } }, JSON.stringify(db));
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" });
await p.waitForFunction(() => { const b = document.getElementById("pmTaxBox"); return b && !b.hidden && /Bollo/.test(b.innerText); }, { timeout: 60000 }).catch(() => {});
const txt = await p.evaluate(() => document.getElementById("pmTaxBox").innerText.replace(/\s+/g, " "));
t("chi ha un patrimonio vede «Le tue tasse»", /Le tue tasse/.test(txt) && /Bollo stimato/.test(txt), txt.slice(0, 160));
const k = await p.evaluate(() => { const T = document.getElementById("pmTax"), num = s => +String(s).replace(/[^\d,]/g, "").replace(",", "."); const bs = [...T.querySelectorAll(".pm-tax-k b")].map(x => x.textContent), sm = T.querySelector(".pm-tax-k small").textContent; return { bollo: num(bs[0]), base: num(sm.split(" di ")[1]), zain: bs[2] }; });
t("bollo = 0,2% del valore dei titoli (casa esclusa)", k.base > 0 && k.base < 100000 && Math.abs(k.bollo - k.base * 0.002) <= 0.6, JSON.stringify(k));
t("la minusvalenza di Eni del 2024 è nello zainetto (200 €, scade il 31/12/2028)", /200\s?€/.test(k.zain) && /31\/12\/2028/.test(txt), k.zain + " · " + txt.slice(0, 300));
const cat = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-pmfisc]")].map(s => [s.dataset.pmfisc, s.value])));
t("«SWDA» riconosciuto come ETF grazie al catalogo, il BTP come titolo di Stato, Eni come azione", cat.IE00B4L5Y983 === "fondo" && cat.BTP35 === "statale" && cat.IT0003132476 === "diversi", JSON.stringify(cat));
t("la casa non compare nel calcolo", !("casa" in cat));
const all = await p.evaluate(() => document.getElementById("pmTaxBox").textContent.replace(/\s+/g, " "));
t("c'è la spiegazione e l'avviso che è una stima", /Non è una consulenza fiscale/.test(all) && /31 dicembre del quarto anno/.test(all));
/* correzione a mano: Eni come «ETF e fondi» → resta salvata */
await p.evaluate(() => { document.querySelector("#pmTaxBox details").open = true; const s = document.querySelector('[data-pmfisc="IT0003132476"]'); s.value = "fondo"; s.dispatchEvent(new Event("change", { bubbles: true })); }); await wait(400);
t("la categoria scelta a mano si salva nel patrimonio", await p.evaluate(() => JSON.parse(localStorage.getItem("pos-patrimonio-v1")).strumenti.IT0003132476.fiscale === "fondo" && document.querySelector('[data-pmfisc="IT0003132476"]').value === "fondo"));
/* proventi in arrivo: due cedole certe del BTP e i dividendi di Eni stimati dalla loro storia */
await p.waitForFunction(() => { const b = document.getElementById("pmIncBox"); return b && !b.hidden; }, { timeout: 30000 }).catch(() => {});
const inc = await p.evaluate(() => [...document.querySelectorAll("#pmInc tbody tr")].map(tr => [...tr.cells].map(c => c.textContent.trim())));
const ced = inc.filter(r => /Cedola/.test(r[2]));
t("due cedole del BTP nei prossimi 12 mesi: 01/03/2027 e 01/09/2027, 146,56 € nette", ced.length === 2 && ced[0][0] === "01/03/2027" && ced[1][0] === "01/09/2027" && ced.every(r => /146,56/.test(r[4])), JSON.stringify(ced));
const div = inc.filter(r => /Dividendo/.test(r[2]));
t("dividendi di Eni stimati (segnati come stima)", div.length >= 3 && div.every(r => /Eni/.test(r[1]) && /stima/.test(r[2])), JSON.stringify(div));
t("le date sono in ordine e nei prossimi 12 mesi", inc.every((r, i) => { const d = r[0].split("/").reverse().join("-"); return d > "2026-11-18" && d <= "2027-11-18" && (i === 0 || d >= inc[i - 1][0].split("/").reverse().join("-")); }), JSON.stringify(inc.map(r => r[0])));
await p.evaluate(() => document.getElementById("pmTaxBox").scrollIntoView()); await wait(300);
await p.screenshot({ path: `${OUT}/tasse.jpg`, type: "jpeg", quality: 72 });
await p.evaluate(() => document.getElementById("pmIncBox").scrollIntoView()); await wait(300); await p.screenshot({ path: `${OUT}/proventi.jpg`, type: "jpeg", quality: 72 });
t("nessun errore JavaScript", !errs.length, errs.join(" | "));
console.log(`\n${pass} superati, ${fail} falliti`);
await b.close(); srv.kill(); process.exit(fail ? 1 : 0);
