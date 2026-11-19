// «Esporta in Excel» dell'archivio: un Excel leggibile (Clienti, Pesi, Revisioni, Leggimi); la copia di sicurezza JSON resta a parte.
// L'archivio di prova si carica con «Importa la copia» da una copia di sicurezza inventata (due clienti finti).
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from "node:fs";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const [,, OUT] = process.argv, PORT = +(process.env.TEST_PORT || 5176), wait = ms => new Promise(r => setTimeout(r, ms));
const DL = import.meta.dirname + "/files/download-archivio"; rmSync(DL, { recursive: true, force: true }); mkdirSync(DL, { recursive: true });
const day = 864e5, now = Date.now();
const rec = (id, name, ago, value, invested, xirr, w, nRev) => ({ id, name, file: name + ".xlsx", note: "nota di prova", createdAt: now - 400 * day, savedAt: now - ago * day, reviewedAt: now - ago * day,
  sheets: [{ name: "Foglio", aoa: [["Data", "Titolo"], ["2024-01-01", "SWDA"]] }], assets: w.map(x => x[0]), period: "gen 2019 – nov 2026",
  snap: { at: now - ago * day, value, invested, xirr, cagr: .071, vol: .148, mdd: -.21, last: "nov 2026", weights: w },
  history: Array.from({ length: nRev }, (_, k) => ({ at: now - (ago + 90 * (nRev - 1 - k)) * day, value: value * (0.9 + k * .05), invested, xirr, vol: .15, mdd: -.2, weights: w })) });
const backup = { formato: "portfolio-os-archivio", versione: 1, esportato: new Date().toISOString(), portafogli: [
  rec("p1", "Cliente Finto Uno", 240, 156194.12, 120000, .134, [["SWDA", .7], ["EIMI", .3]], 3),
  rec("p2", "Cliente Finto Due", 20, 48320.5, 45000, .051, [["VWCE", .6], ["AGGH", .4]], 2)] };
backup.portafogli[0].ob = [{ nome: "Casa", importo: 50000, anno: 5 }, { nome: "Studi", importo: 30000, anno: 12 }];
const BK = DL + "/copia-finta.json"; writeFileSync(BK, JSON.stringify(backup));
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = [];
p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); }); p.on("dialog", d => { console.log("  [finestra] " + d.message()); d.accept(); });
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await wait(3000);
const cdp = await b.target().createCDPSession(); await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL.replace(/\//g, "\\"), eventsEnabled: true });
await p.evaluate(() => document.getElementById("archBtn").click()); await wait(700);
t("nell'archivio: «Esporta in Excel» e «Copia di sicurezza»", await p.evaluate(() => /Excel/.test(document.getElementById("arExport").textContent) && !!document.getElementById("arBackup")));
const inp = await p.$("#arImport"); await inp.uploadFile(BK); await wait(1500);
t("la copia di sicurezza finta entra nell'archivio (2 portafogli)", await p.evaluate(async () => (await (await import("/js/ui/archivio.js")).svList()).length === 2));
const kp = await p.evaluate(() => { const k = document.getElementById("arKpi"); return { vis: !k.hidden, t: k.innerText.replace(/\s+/g, " ") }; });
t("riquadri in alto: valore totale, TIR medio pesato (+11,4%), 1 da rivedere", kp.vis && /204\.515/.test(kp.t) && /\+11,4%/.test(kp.t) && /Da rivedere 1/.test(kp.t), kp.t);
await p.evaluate(() => { document.body.dataset.ruolo = "pro"; }); await p.evaluate(async () => (await import("/js/ui/archivio.js")).renderArchive());
await wait(400); await p.screenshot({ path: `${OUT}/archivio-studio.jpg`, type: "jpeg", quality: 72 });
t("da consulente il titolo diventa «I tuoi clienti»", await p.evaluate(() => /I tuoi clienti/.test(document.getElementById("arTitle").textContent) && /Patrimonio seguito/.test(document.getElementById("arKpi").textContent) && /2<\/b> clienti/.test(document.getElementById("arSub").innerHTML) && /Nuovo cliente/.test(document.getElementById("arNew").textContent)));
if (process.env.DEBUG) console.log(await p.evaluate(() => ({ xlsx: !!window.XLSX, vis: document.getElementById("arExport").offsetParent !== null })));
await p.click("#arExport"); await wait(1500); if (process.env.DEBUG) console.log(await p.evaluate(async () => { try { await (await import("/js/ui/archivio.js")).arExcel(); return "ok"; } catch (e) { return "ERR " + e.message; } }));
let file = null; for (let k = 0; k < 40 && !file; k++) { await wait(250); file = readdirSync(DL).find(f => /\.xlsx$/.test(f)); }
t("scarica un file .xlsx", !!file, readdirSync(DL).join(","));
if (file) {
  const b64 = readFileSync(DL + "/" + file).toString("base64");
  const x = await p.evaluate(b64 => { const wb = XLSX.read(b64, { type: "base64", cellDates: true, cellNF: true }), j = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true });
    return { fogli: wb.SheetNames, cli: j("Clienti"), pesi: j("Pesi"), rev: j("Revisioni"), obi: wb.Sheets.Obiettivi ? j("Obiettivi") : [], fmt: wb.Sheets.Clienti.C2 && wb.Sheets.Clienti.C2.z }; }, b64);
  t("fogli Clienti, Pesi, Revisioni, Obiettivi, Leggimi", x.fogli.join() === "Clienti,Pesi,Revisioni,Obiettivi,Leggimi", x.fogli.join());
  t("Obiettivi: i due del primo cliente, con importo e anno", x.obi.length === 3 && x.obi[1][0] === "Cliente Finto Uno" && x.obi[1][1] === "Casa" && x.obi[1][2] === 50000 && x.obi[1][3] === 5 && x.obi[1][4] === new Date().getFullYear() + 5 && x.obi[2][1] === "Studi", JSON.stringify(x.obi));
  t("Clienti: una riga per cliente, in ordine alfabetico", x.cli.length === 3 && x.cli[1][0] === "Cliente Finto Due" && x.cli[2][0] === "Cliente Finto Uno", JSON.stringify(x.cli.map(r => r[0])));
  const uno = x.cli[2], h = x.cli[0];
  t("valore, investito, guadagno in euro (numeri veri, non testo)", uno[h.indexOf("Valore (€)")] === 156194.12 && uno[h.indexOf("Guadagno (€)")] === 36194.12 && /€/.test(x.fmt || ""), JSON.stringify(uno.slice(0, 6)) + " " + x.fmt);
  t("TIR come percentuale (0,134)", uno[h.indexOf("Rendimento annuo (TIR)")] === .134);
  t("giorni dall'ultima revisione (240) e numero di revisioni (3)", uno[h.indexOf("Giorni dall'ultima revisione")] === 240 && uno[h.indexOf("Revisioni")] === 3, JSON.stringify(uno));
  t("Pesi: 4 righe (2 strumenti per cliente)", x.pesi.length === 5);
  t("Revisioni: 5 righe (3 + 2)", x.rev.length === 6);
}
await p.click("#arBackup");
let js = null; for (let k = 0; k < 40 && !js; k++) { await wait(250); js = readdirSync(DL).find(f => /^quanta-portfolio-archivio.*\.json$/.test(f)); }
t("la copia di sicurezza (JSON) si scarica ancora", !!js);
t("nessun errore JavaScript", !errs.length, errs.join(" | "));
console.log(`\n${pass} superati, ${fail} falliti`);
await b.close(); srv.kill(); process.exit(fail ? 1 : 0);
