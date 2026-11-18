// Prova la lettura su forme di Excel molto diverse (dati inventati, nessun file personale).
// Parte 1 (sempre): il motore esegue le ricette giuste scritte a mano → controlla l'esecutore.
// Parte 2 (con SITE=https://...): ogni file passa nel sito pubblicato e l'IA vera scrive la ricetta.
//          Senza SITE usa l'anteprima locale, dove l'IA non c'è: si vede cosa regge la sola lettura automatica.
// Uso: node tools/test-corpus.mjs     oppure     SITE=https://porfolio-os-xi.vercel.app node tools/test-corpus.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { POS as P } from "../js/engine.js";
import { corpus } from "./corpus.mjs";

let pass = 0, fail = 0;
const t = (name, ok, info = "") => { if (ok) { pass++; console.log("  ok      " + name); } else { fail++; console.log(`  FALLITO ${name} ${info}`); } };
const C = corpus(), byId = Object.fromEntries(C.map(c => [c.id, c]));
const ds = sheet => { const an = P.analyzeSheet(sheet.name, sheet.aoa), roles = {}; an.cols.forEach(c => { roles[c.idx] = sheet.roles ? sheet.roles[c.idx] || c.suggest : c.suggest; }); return P.buildDataset(an, roles); };

console.log("Parte 1 · esecutore delle ricette");
const R = {
  "titoli-sopra": { serieInColonna: [{ foglio: "Portafoglio", rigaIntestazione: 4, colonnaData: "A", primaRiga: null, ultimaRiga: null, serie: [{ colonna: "B", nome: "MSCI World", ruolo: "prezzo" }, { colonna: "C", nome: "Emergenti", ruolo: "prezzo" }, { colonna: "D", nome: "Note", ruolo: "ignora" }] }] },
  "yahoo-un-foglio-per-titolo": { serieInColonna: ["AAPL", "MSFT", "VWCE"].map(f => ({ foglio: f, rigaIntestazione: 1, colonnaData: "A", primaRiga: null, ultimaRiga: null, serie: [{ colonna: "F", nome: f, ruolo: "prezzo" }] })) },
  "tracker-anni": { serieInRiga: [{ fogli: ["2022", "2023", "2024"], rigaDate: 1, colonnaNome: "A", colonnaValuta: "B", colonnaTipo: null, codiciValuta: [{ codice: "€", valuta: "EUR" }, { codice: "$", valuta: "USD" }],
    sezioni: [{ etichetta: "Investimenti", ruolo: "posizioni" }, { etichetta: "Conti", ruolo: "posizioni" }, { etichetta: "Passività", ruolo: "debiti" }, { etichetta: "Cambi", ruolo: "cambi" }], righeSpeciali: [{ etichetta: "Totale patrimonio", ruolo: "totale" }], classiPerTipo: [] }] },
  "movimenti-broker": { movimenti: { foglio: "Movimenti", rigaIntestazione: 1, colonnaData: "A", colonnaTitolo: "D", colonnaQuantita: "E", colonnaPrezzo: "F", colonnaImporto: "G", colonnaOperazione: "B", valuta: "EUR" } },
  "matrice-rendimenti": { matriciRendimenti: [{ foglio: "Performance", nome: "Fondo Bilanciato Prudente", colonnaAnno: "A", colonnaGennaio: "B", primaRiga: 4, ultimaRiga: null, ruolo: "rendimento_percentuale" }] },
  "tabelle-affiancate": { serieInColonna: [{ foglio: "Dati", rigaIntestazione: 2, colonnaData: "A", primaRiga: null, ultimaRiga: null, serie: [{ colonna: "B", nome: "Indice", ruolo: "prezzo" }] }, { foglio: "Dati", rigaIntestazione: 2, colonnaData: "E", primaRiga: null, ultimaRiga: null, serie: [{ colonna: "F", nome: "Oro", ruolo: "prezzo" }] }] }
};
for (const [id, rec] of Object.entries(R)) {
  const A = P.applyRecipe(byId[id].sheets, rec);
  if (id === "movimenti-broker") { t(`${id}: posizioni aperte dai movimenti`, A.tx && A.tx.positions.length === 3 && A.tx.n > 10, JSON.stringify(A.tx && A.tx.positions.map(p => [p.titolo, +p.quantita.toFixed(1)]))); continue; }
  const d = A.sheets.length ? ds(A.sheets[0]) : { ok: false, Q: { errors: A.errors } };
  const E = byId[id].expect;
  t(`${id}: ${d.ok ? d.assets.length : 0} serie, ${d.ok ? d.nObs : 0} date`, d.ok && d.assets.length >= (E.minAssets || 1) && (!E.exactAssets || d.assets.length === E.exactAssets) && (!E.minObs || d.nObs >= E.minObs), (d.Q.errors || []).concat(A.errors).join(" | "));
}
{ const A = P.applyRecipe(byId["tracker-anni"].sheets, R["tracker-anni"]);
  t("tracker-anni: debito e totale non diventano asset, cambi EURUSD usati", A.wide && A.wide.report.debts === 1 && A.wide.report.fx && !A.sheets.find(s => /Posizioni/.test(s.name)).aoa[0].includes("Prestito auto")); }

{ // ricetta vera scritta da Gemini: «ultimaRiga» sbagliata per la seconda tabella (aveva visto solo le prime righe)
  const A = P.applyRecipe(byId["tabelle-affiancate"].sheets, { serieInColonna: [{ foglio: "Dati", rigaIntestazione: 2, colonnaData: "A", primaRiga: 3, ultimaRiga: 62, serie: [{ colonna: "B", nome: "Indice", ruolo: "prezzo" }] }, { foglio: "Dati", rigaIntestazione: 2, colonnaData: "E", primaRiga: 3, ultimaRiga: 14, serie: [{ colonna: "F", nome: "Oro", ruolo: "prezzo" }] }] });
  t("ricetta con l'ultima riga sbagliata: la tabella continua finché continuano le date", A.sheets[0].aoa.length - 1 === 70); }

console.log("\nParte 2 · il sito " + (process.env.SITE ? "pubblicato, con l'IA vera" : "in locale, senza IA"));
const here = path.dirname(fileURLToPath(import.meta.url)), PORT = 5188, LIVE = process.env.SITE, URL0 = LIVE ? LIVE.replace(/\/?$/, "/") : `http://localhost:${PORT}/`;
const CHROME = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", process.env.CHROME_PATH].find(p => p && fs.existsSync(p));
const server = LIVE ? { kill() {} } : spawn(process.execPath, [path.join(here, "serve.mjs")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(LIVE ? 0 : 1200);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const enc = sheets => JSON.stringify(sheets, (k, v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d\d:/.test(v) ? "D" + v : v));
try {
  const page = await browser.newPage(); const errs = [];
  page.on("pageerror", e => errs.push(e.message));
  await page.goto(URL0, { waitUntil: "networkidle2" }); await wait(4500);
  for (const c of C) {
    await page.evaluate((js, name) => { const sh = JSON.parse(js, (k, v) => (typeof v === "string" && v.startsWith("D") ? new Date(v.slice(2)) : v)); window.__pos.loadSheets(sh, name); }, enc(c.sheets), c.id + ".xlsx");
    await page.waitForFunction(() => { const s = window.__pos.state(); return !s.recipe || s.recipe.status !== "loading"; }, { timeout: 90000 }).catch(() => {});
    await wait(1500);
    if (c.expect.und) await page.waitForFunction(() => window.__pos.state().rebuilt, { timeout: 120000 }).catch(() => {});
    const s = await page.evaluate(() => window.__pos.state());
    const E = c.expect, ok = E.und ? !!((s.und && s.und.length) || (s.portfolio && s.portfolio.length)) : s.assets.length >= (E.minAssets || 1) && (!E.exactAssets || s.assets.length === E.exactAssets) && (!E.minObs || s.obs >= E.minObs);
    const via = s.recipe ? `IA ${s.recipe.status}${s.recipe.tipo ? " · " + s.recipe.tipo : ""}${s.recipe.msg ? " (" + s.recipe.msg + ")" : ""}` : "lettura automatica";
    const what = c.expect.und ? (s.portfolio ? `ricostruito con i prezzi di mercato: ${JSON.stringify(s.portfolio)}` : `posizioni ${JSON.stringify(s.und)}`) : `${s.assets.length} serie ${JSON.stringify(s.assets)} · ${s.obs} date · foglio «${s.sheet}»`;
    if (!LIVE && c.expect.ai && !ok) console.log(`  serve l'IA  ${c.id}: ${c.descr} → ${what}`);
    else t(`${c.id} [${via}${s.recipe && s.recipe.raw ? " · " + s.recipe.raw.provider : ""}]: ${what}`, ok, (s.recipe && s.recipe.errors || []).join(" | ") + (s.recipe && s.recipe.raw ? "\n    ricetta: " + JSON.stringify(s.recipe.raw.c) : ""));
  }
  t("nessun errore JavaScript", !errs.length, errs.slice(0, 5).join(" | "));
} finally { await browser.close(); server.kill(); }
console.log(`\n${pass} superati, ${fail} falliti`);
process.exit(fail ? 1 : 0);
