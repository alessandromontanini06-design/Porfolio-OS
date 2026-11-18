// «Dove sei investito» quando justETF non risponde: le schede si chiedono tre alla volta
// e, se il server dà errore, si usa l'ultima copia salvata nel browser (con la sua data nella didascalia).
// Il server locale risponde con un errore a /api/etfinfo se ETF_DOWN=1, come quando justETF è fermo.
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
const PORT = 5213, wait = ms => new Promise(r => setTimeout(r, ms));
const FILE = import.meta.dirname + "/files/video2/Movimenti_titoli_Bianchi.xlsx";
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), ETF_DOWN: "1" }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
let fails = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; };
async function openLab(p) {
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" });
  await p.evaluate(() => localStorage.setItem("pos-save", "0"));
  await (await p.$("#file")).uploadFile(FILE);
  await p.waitForFunction(() => window.__pos.state().rebuilt && window.__pos.state().tx > 100, { timeout: 150000 });
  await p.evaluate(() => document.querySelector('.dock [data-go="map"]').click()); await wait(1200);
  await p.waitForFunction(() => !document.getElementById("confirmBtn").disabled, { timeout: 60000 });
  await p.evaluate(() => document.getElementById("confirmBtn").click());
  const t0 = Date.now();
  await p.waitForFunction(() => { const pf = window.__pos.pf(); return pf && pf.etfDone; }, { timeout: 120000 });
  return Date.now() - t0;
}
try {
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  /* 1) nessuna copia salvata: errore chiaro, e in fretta */
  await p.goto(`http://localhost:${PORT}/`); await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("pos-etf-v1:")).forEach(k => localStorage.removeItem(k)));
  const ms1 = await openLab(p);
  const isins = await p.evaluate(() => window.__pos.pf().positions.filter(x => x.isin).map(x => x.isin));
  const e1 = await p.evaluate(() => window.__pos.pf().positions.filter(x => x.etf && x.etf.error).length);
  ok(isins.length >= 3, `ISIN nel portafoglio: ${isins.length}`);
  ok(e1 === isins.length, `senza copia: ${e1} schede in errore, nessun dato inventato`);
  ok(ms1 < 20000, `le schede non bloccano la pagina (${(ms1 / 1000).toFixed(1)} s)`);
  /* 2) con una copia salvata (come dopo una visita in cui justETF funzionava) */
  await p.evaluate(list => list.forEach(isin => localStorage.setItem("pos-etf-v1:" + isin, JSON.stringify({ isin, nome: "ETF " + isin, fonte: "justETF · scheda pubblica del fondo", letto: "2026-11-10", ter: 0.002, focus: "Azioni", valuta: "USD", paesi: [{ nome: "Stati Uniti", peso: 0.6 }, { nome: "Altri", peso: 0.4 }], settori: [{ nome: "Tecnologia", peso: 0.3 }, { nome: "Altri", peso: 0.7 }], partecipazioni: null }))), isins);
  await openLab(p);
  const r = await p.evaluate(() => ({ used: window.__pos.pf().positions.filter(x => x.etf && !x.etf.error).length, cap: ([...document.querySelectorAll("#lookBody .caption")].map(x => x.innerText).find(t => /Fonte: justETF/.test(t)) || ""), ter: [...document.querySelectorAll("#costCard [data-cok]")].filter(x => x.value).length }));
  ok(r.used === isins.length, `copie di riserva usate: ${r.used}/${isins.length}`);
  ok(/10\/11\/2026/.test(r.cap), "la didascalia dice quando erano state lette: " + r.cap.slice(-60));
  ok(r.ter >= 3, `TER dalla copia nella scheda dei costi: ${r.ter}`);
  ok(!errs.length, "nessun errore nella pagina " + errs.join(" | "));
} catch (e) { ok(false, e.message); }
await b.close(); srv.kill();
console.log(fails ? `\n${fails} FALLITI` : "\ntutto ok");
process.exit(fails ? 1 : 0);
