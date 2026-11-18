// Prova da capo a fondo del caso di Andrea: Excel con due fogli PAC (S&P 500 e Nasdaq 100), una tabella per anno separata da righe vuote,
// colonne «Data esecuzione · Quote acquistate · Capitale investito · Prezzo esecuzione · Quote cumulate», nessuna colonna col nome del titolo.
// Crea il file (files/PAC_due_fogli_righe_vuote.xlsx), lo carica come farebbe un utente e controlla che il laboratorio veda tutti e due i PAC.
// Uso: node tools/test-pac.mjs   (REAL_PRICES=1 per i prezzi veri di Yahoo)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const here = path.dirname(fileURLToPath(import.meta.url)), PORT = 5193, wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const t = (name, ok, info = "") => { if (ok) { pass++; console.log("  ok      " + name); } else { fail++; console.log(`  FALLITO ${name} ${info}`); } };
const srv = spawn(process.execPath, [path.join(here, "serve.mjs")], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const errs = [];
try {
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); p.on("pageerror", e => errs.push(e.message));
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" }); await wait(3000);
  /* il file, scritto con lo stesso SheetJS del sito */
  const b64 = await p.evaluate(() => {
    const wb = XLSX.utils.book_new();
    const sheet = (title, px0) => {
      const A = [[title], []];
      [[2022, 1], [2023, 1.08], [2024, 1.22], [2025, 1.35]].forEach(([y, mul]) => {
        A.push([y]); A.push(["Data esecuzione", "Quote acquistate", "Capitale investito", "Prezzo esecuzione", "Quote cumulate"]); let cum = 0;
        for (let m = 0; m < 12; m++) { if (y === 2023 && (m === 4 || m === 7)) continue; const px = +(px0 * mul * (1 + .006 * m)).toFixed(2), q = +(250 / px).toFixed(4); cum += q; A.push([new Date(y, m, 5), q, 250, px, +cum.toFixed(4)]); }
        A.push([]); A.push([]);
      });
      return XLSX.utils.aoa_to_sheet(A, { cellDates: true });
    };
    XLSX.utils.book_append_sheet(wb, sheet("PAC iShares Core S&P 500 UCITS ETF (CSPX) - IE00B5BMR087", 420), "PAC S&P 500");
    XLSX.utils.book_append_sheet(wb, sheet("PAC iShares Nasdaq 100 UCITS ETF (CSNDX) - IE00B53SZB19", 780), "PAC Nasdaq 100");
    return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  });
  fs.mkdirSync(path.join(here, "files"), { recursive: true });
  const file = path.join(here, "files", "PAC_due_fogli_righe_vuote.xlsx"); fs.writeFileSync(file, Buffer.from(b64, "base64"));
  const inp = await p.$("#file"); await inp.uploadFile(file);
  await p.waitForFunction(() => window.__pos.state().rebuilt, { timeout: 150000 }).catch(() => {});
  await wait(4000);
  const s = await p.evaluate(() => window.__pos.state());
  console.log("    fogli:", s.sheets.join(" | "), "· serie:", s.assets.join(", "), "· posizioni:", JSON.stringify(s.portfolio));
  t("tutti e due gli strumenti riconosciuti (S&P 500 e Nasdaq 100)", s.portfolio && s.portfolio.length === 2, JSON.stringify(s.portfolio));
  t("ricostruito con i prezzi di mercato", s.rebuilt && s.assets.length === 2, JSON.stringify(s.assets));
  const pf = await p.evaluate(() => { const P = window.__pos.pf(); return P ? P.positions.map(x => ({ t: x.titolo || x.nome, q: x.quantita, isin: x.isin })) : null; });
  console.log("    quote:", JSON.stringify(pf));
  /* tutte e quattro le annate: 46 acquisti per foglio (2023 ne salta due) */
  const n = await p.evaluate(() => { const sh = window.__pos.state().sheets; return sh.length; });
  await p.evaluate(() => document.querySelector('.dock [data-go="map"]').click()); await wait(1500);
  const dis = await p.evaluate(() => document.getElementById("confirmBtn").disabled);
  t("il laboratorio si può costruire", !dis);
  await p.evaluate(() => document.getElementById("confirmBtn").click()); await wait(6000);
  const real = await p.evaluate(() => { const c = document.getElementById("realCard"); return c && !c.hidden ? c.innerText.replace(/\s+/g, " ").slice(0, 600) : null; });
  console.log("    rendimento reale:", real);
  t("i due fogli PAC diventano un unico elenco di movimenti", real && /piani di accumulo \(2 fogli\)/.test(real), real);
  t("rendimento reale dalle transazioni di tutti e due i PAC", real && /92 transazioni|92 movimenti/.test(real) && /TIR/.test(real), real);
  t("versato: 92 acquisti da 250 € = 23.000 €", real && /23\.000/.test(real), real);
  await p.screenshot({ path: path.join(here, "shots-v2", "pac-lab.jpg"), type: "jpeg", quality: 70 });
  t("nessun errore JavaScript", !errs.length, errs.join(" | "));
} finally { await b.close(); srv.kill(); }
console.log(`\n${pass} superati, ${fail} falliti`); process.exit(fail ? 1 : 0);
