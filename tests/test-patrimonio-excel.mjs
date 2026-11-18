// «Scarica in Excel» del patrimonio: fogli Riepilogo, Posizioni, Operazioni, Andamento, Proventi in arrivo, Tasse, Leggimi,
// numeri veri (non testo) con i formati € e %; la copia di sicurezza JSON resta in fondo alla pagina.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const [,, OUT] = process.argv, PORT = +(process.env.TEST_PORT || 5185), wait = ms => new Promise(r => setTimeout(r, ms));
const DL = import.meta.dirname + "/files/download-patrimonio"; rmSync(DL, { recursive: true, force: true }); mkdirSync(DL, { recursive: true });
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const db = { v: 1, creato: "2024-01-01T00:00:00Z", strumenti: {
  IE00B4L5Y983: { nome: "iShares Core MSCI World", ticker: "SWDA", isin: "IE00B4L5Y983", simbolo: "IWDA.AMS", valuta: "EUR" },
  IT0005383309: { nome: "BTP 1,35% 01/04/2030", isin: "IT0005383309", valuta: "EUR", per100: true, classe: "Obbligazioni", cedola: 0.0135, scadenza: "2030-04-01", freq: 2, governativo: true },
  "m-casa": { nome: "Appartamento", manuale: true, classe: "Immobili", valuta: "EUR" } },
  operazioni: [
    { id: "a1", data: "2024-01-15", tipo: "acquisto", strumento: "IE00B4L5Y983", quantita: 100, prezzo: 85.20, spese: 2.95 },
    { id: "a2", data: "2024-01-15", tipo: "acquisto", strumento: "IT0005383309", quantita: 10000, prezzo: 90.10 },
    { id: "a3", data: "2025-06-02", tipo: "vendita", strumento: "IE00B4L5Y983", quantita: 20, prezzo: 100 },
    { id: "c1", data: "2025-04-01", tipo: "cedola", strumento: "IT0005383309", importo: 59.06, valuta: "EUR" },
    { id: "m1", data: "2024-01-01", tipo: "acquisto", strumento: "m-casa", quantita: 1, prezzo: 250000 },
    { id: "x1", data: "2024-02-01", tipo: "acquisto", strumento: "IE00B4L5Y983", quantita: 5, prezzo: 86 },
    { id: "u1", data: "2024-02-02", tipo: "annulla", rif: "x1" }] };
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = [];
p.on("pageerror", e => errs.push(e.message));
await p.evaluateOnNewDocument(d => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("pos-patrimonio-v1", d); sessionStorage.setItem("seeded", "1"); } }, JSON.stringify(db));
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" });
await p.waitForFunction(() => /stimato con i tassi/.test((document.getElementById("pmPos") || {}).innerText || ""), { timeout: 60000 }).catch(() => {});
await wait(800);
t("i pulsanti: «Scarica in Excel» in alto, «Scarica la copia di sicurezza» in fondo", await p.evaluate(() => /Scarica in Excel/.test(document.getElementById("pmExport").innerText) && /copia di sicurezza/.test(document.getElementById("pmBackup").innerText)));
const valTxt = await p.evaluate(() => (document.querySelector(".pm-center") || document.getElementById("pmKpis")).innerText);
const cdp = await b.target().createCDPSession(); await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL.replace(/\//g, "\\"), eventsEnabled: true });
await p.evaluate(() => document.getElementById("pmExport").scrollIntoView({ block: "center" })); await wait(300);
await p.click("#pmExport");
let file = null; for (let k = 0; k < 40 && !file; k++) { await wait(250); file = readdirSync(DL).find(f => /\.xlsx$/.test(f)); }
t("scarica un file .xlsx", !!file, readdirSync(DL).join(","));
if (file) {
  const b64 = readFileSync(DL + "/" + file).toString("base64");
  const x = await p.evaluate(b64 => { const wb = XLSX.read(b64, { type: "base64", cellDates: true, cellNF: true }), j = n => wb.Sheets[n] ? XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true }).map(r => r.map(v => v instanceof Date ? v.toISOString().slice(0, 10) : v)) : [];
    return { fogli: wb.SheetNames, riep: j("Riepilogo"), pos: j("Posizioni"), ops: j("Operazioni"), and: j("Andamento"), pro: j("Proventi in arrivo"), tas: j("Tasse"), fmtVal: wb.Sheets.Riepilogo.B2 && wb.Sheets.Riepilogo.B2.z, fmtTir: wb.Sheets.Riepilogo.B6 && wb.Sheets.Riepilogo.B6.z, opDate: wb.Sheets.Operazioni.A2 && wb.Sheets.Operazioni.A2.t }; }, b64);
  t("fogli Riepilogo, Posizioni, Operazioni, Andamento, Proventi in arrivo, Tasse, Leggimi", x.fogli.join() === "Riepilogo,Posizioni,Operazioni,Andamento,Proventi in arrivo,Tasse,Leggimi", x.fogli.join());
  const v = x.riep.find(r => r[0] === "Valore oggi"), eur = Math.round(v[1]).toLocaleString("it-IT", { useGrouping: "always" });
  t("Riepilogo: valore di oggi come nella pagina, numero con il formato €", typeof v[1] === "number" && valTxt.includes(eur) && /€/.test(x.fmtVal || ""), `${v[1]} · ${eur} · ${x.fmtVal}`);
  t("Riepilogo: TIR come percentuale", typeof x.riep[5][1] === "number" && /%/.test(x.fmtTir || ""), `${x.riep[5]} ${x.fmtTir}`);
  const sw = x.pos.find(r => r[0] === "iShares Core MSCI World"), bt = x.pos.find(r => /BTP/.test(r[0])), casa = x.pos.find(r => r[0] === "Appartamento");
  t("Posizioni: SWDA con 80 quote (100 − 20; l'acquisto annullato non conta)", sw && sw[4] === 80, JSON.stringify(sw));
  t("Posizioni: il BTP con 10.000 di nominale e la fonte «stima Banca d'Italia»", bt && bt[4] === 10000 && bt[7] === "stima Banca d'Italia", JSON.stringify(bt));
  t("Posizioni: la casa come bene senza quotazione, con la tua stima", casa && /Immobili/.test(casa[3]) && casa[8] === 250000 && /tua stima/.test(casa[7]), JSON.stringify(casa));
  t("Operazioni: tutte e 6, in ordine di data, con le date vere (non testo)", x.ops.length === 7 && x.opDate === "d" && x.ops.slice(1).every((r, i, a) => /^\d{4}-\d{2}-\d{2}$/.test(r[0]) && (!i || a[i - 1][0] <= r[0])), x.ops.length);
  const ann = x.ops.find(r => r[11] === "sì"), ven = x.ops.find(r => r[1] === "Vendita"), btp = x.ops.find(r => r[1] === "Acquisto" && /BTP/.test(r[2]));
  t("Operazioni: l'acquisto annullato resta, segnato «annullata»", !!ann && ann[4] === 5, JSON.stringify(ann));
  t("Operazioni: importi giusti (vendita 20 × 100 = 2.000; BTP 10.000 × 90,10 / 100 = 9.010)", ven && ven[6] === 2000 && btp && btp[6] === 9010, JSON.stringify([ven, btp]));
  t("Andamento: un punto a fine mese da gennaio 2024 a oggi", x.and.length > 30 && typeof x.and[x.and.length - 1][1] === "number", x.and.length);
  t("Proventi in arrivo: le cedole del BTP", x.pro.length > 1 && x.pro.slice(1).some(r => /BTP/.test(r[1]) && r[2] === "Cedola" && r[5] === "certo"), JSON.stringify(x.pro.slice(0, 3)));
  t("Tasse: una riga per titolo, con la categoria (ETF e fondi, Titoli di Stato)", x.tas.some(r => r[1] === "ETF e fondi") && x.tas.some(r => r[1] === "Titoli di Stato"), JSON.stringify(x.tas.slice(0, 4)));
}
/* la copia di sicurezza JSON c'è ancora, in fondo */
for (const f of readdirSync(DL)) rmSync(DL + "/" + f);
await p.evaluate(() => document.getElementById("pmBackup").scrollIntoView({ block: "center" })); await wait(300); await p.click("#pmBackup");
let js = null; for (let k = 0; k < 40 && !js; k++) { await wait(250); js = readdirSync(DL).find(f => /\.json$/.test(f)); }
t("«Scarica la copia di sicurezza» scarica il JSON da reimportare", !!js && JSON.parse(readFileSync(DL + "/" + js, "utf-8")).operazioni.length === 7, js);
t("nessun errore JavaScript", !errs.length, errs.join(" | "));
console.log(`\n${pass} superati, ${fail} falliti`);
await b.close(); srv.kill(); process.exit(fail ? 1 : 0);
