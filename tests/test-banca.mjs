// Cliente di banca: ETF, fondo comune (prezzo da Yahoo cercando l'ISIN), BTP in portafoglio e scaduto con cedole, azione venduta con dividendo.
// Crea il file con files/make-misti.mjs se manca.
import { spawn, execFileSync } from "node:child_process";
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const PORT = 5206, wait = ms => new Promise(r => setTimeout(r, ms)), FILE = import.meta.dirname + "/files/Movimenti_cliente_banca.xlsx";
if (!fs.existsSync(FILE)) { fs.copyFileSync("files/make-misti.mjs", "make-misti.tmp.mjs"); execFileSync(process.execPath, ["make-misti.tmp.mjs"]); fs.unlinkSync("make-misti.tmp.mjs"); }
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
let fails = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; };
try {
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" });
  await p.evaluate(() => { localStorage.setItem("pos-save", "0"); localStorage.removeItem("pos-px-v1"); localStorage.removeItem("pos-costs-v1"); });
  await (await p.$("#file")).uploadFile(FILE);
  await p.waitForFunction(() => window.__pos.state().rebuilt, { timeout: 150000 });
  const st = await p.evaluate(() => window.__pos.state());
  ok(st.portfolio.some(x => /EURIZON.*→0P/.test(x)), "fondo Eurizon trovato con l'ISIN, col suo nome: " + st.portfolio.join(", "));
  await p.evaluate(() => document.querySelector('.dock [data-go="map"]').click()); await wait(1500);
  const chk = await p.evaluate(() => document.body.innerText.match(/Manca 1 strumento[^\n]*/)?.[0] || "");
  ok(/BTP|titolo di Stato|3,35/.test(await p.evaluate(() => document.body.innerText)), "il BTP senza prezzi di mercato è segnalato: " + chk);
  await p.evaluate(() => { [...document.querySelectorAll("button")].filter(x => /Procedi senza/.test(x.textContent)).forEach(x => x.click()); }); await wait(800);
  await p.evaluate(() => document.getElementById("confirmBtn").click());
  await p.waitForFunction(() => !document.getElementById("lab").hidden && !document.getElementById("realCard").hidden, { timeout: 60000 }); await wait(2500);
  const t = await p.evaluate(() => document.getElementById("realCard").innerText);
  ok(/Il tuo conto, tutto insieme/.test(t), "conto intero, vendite comprese");
  ok(!/Compravendita titoli|Sottoscrizione fondi|Accredito cedole/.test(t), "i nomi sono i titoli, non i tipi di operazione");
  ok(/dividendi e cedole 1\.481 €/.test(t), "5 + 6 cedole e il dividendo ENI contati (1.481 €)");
  ok(/BTP 3,35% 01MZ35[\s\S]*9\.640 €/.test(t), "BTP su 100 di nominale: 10.000 a 96,40 = 9.640 €");
  ok(/rendimento a scadenza 3,9\d% lordo/.test(t), "rendimento a scadenza del BTP");
  ok(/rimborsato/.test(t), "BTP scaduto: rimborsato");
  /* prezzo di oggi del BTP scritto a mano */
  await p.evaluate(() => { const i = document.querySelector("#realCard [data-axp]"); i.value = "99.5"; i.dispatchEvent(new Event("change", { bubbles: true })); }); await wait(800);
  const t2 = await p.evaluate(() => document.getElementById("realCard").innerText);
  ok(/9\.950 €/.test(t2) && /prezzo inserito da te/.test(t2), "con il prezzo 99,50 il BTP vale 9.950 €");
  const c = await p.evaluate(() => document.getElementById("costCard").innerText);
  ok(/BTP 3,35% 01MZ35/.test(c) && /nessun costo di gestione/.test(c), "il BTP è nei costi, senza costo di gestione");
  ok(/EURIZON/.test(c), "il fondo è nei costi (TER da scrivere)");
  ok(!errs.length, "nessun errore nella pagina " + errs.join(" | "));
} catch (e) { console.log("FAIL", e.message); fails++; }
await b.close(); srv.kill();
console.log(fails ? `${fails} FALLITI` : "tutto ok"); process.exit(fails ? 1 : 0);
