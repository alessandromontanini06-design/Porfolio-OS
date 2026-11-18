// Scheda «Quanto costa il portafoglio»: TER da justETF, TER inserito a mano (fondo della banca), altri costi, confronto.
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
const PORT = 5191, wait = ms => new Promise(r => setTimeout(r, ms));
const FILE = import.meta.dirname + "/files/video2/Movimenti_titoli_Bianchi.xlsx", SHOT = process.env.SHOT || "";
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
let fails = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; };
try {
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" });
  await p.evaluate(() => { localStorage.removeItem("pos-costs-v1"); localStorage.setItem("pos-save", "0"); });
  await (await p.$("#file")).uploadFile(FILE);
  await p.waitForFunction(() => window.__pos.state().rebuilt && window.__pos.state().tx > 100, { timeout: 150000 });
  await p.evaluate(() => document.querySelector('.dock [data-go="map"]').click()); await wait(1200);
  await p.waitForFunction(() => !document.getElementById("confirmBtn").disabled, { timeout: 60000 });
  await p.evaluate(() => document.getElementById("confirmBtn").click());
  await p.waitForFunction(() => !document.getElementById("costCard").hidden, { timeout: 60000 });
  ok(true, "la scheda dei costi compare");
  /* aspetta le schede justETF */
  await p.waitForFunction(() => { const pf = window.__pos.pf(); return pf && pf.etfDone; }, { timeout: 120000 }).catch(() => {});
  await wait(800);
  const r1 = await p.evaluate(() => ({ n: document.querySelectorAll("#costCard [data-cok]").length, filled: [...document.querySelectorAll("#costCard [data-cok]")].filter(x => x.value).length, lead: document.querySelector("#costCard .co-lead").innerText }));
  ok(r1.n === 5, `5 strumenti in tabella (${r1.n})`);
  ok(r1.filled >= 4, `TER letti da justETF: ${r1.filled}/5`);
  ok(/costa .*l'anno/.test(r1.lead), "frase di sintesi: " + r1.lead.slice(0, 140));
  /* un fondo della banca al 2,1% al posto del primo strumento */
  await p.evaluate(() => { const i = document.querySelector("#costCard [data-cok]"); i.value = "2.1"; i.dispatchEvent(new Event("change", { bubbles: true })); });
  await wait(300);
  const r2 = await p.evaluate(() => ({ tu: document.querySelectorAll("#costCard .co-src.tu").length, save: document.querySelector("#costCard .co-alt b").innerText, prefs: JSON.parse(localStorage.getItem("pos-costs-v1") || "{}") }));
  ok(r2.tu === 1, "il valore inserito è segnato come tuo");
  ok(/\+.*€/.test(r2.save), "differenza in 20 anni con strumenti a basso costo: " + r2.save);
  ok(r2.prefs.ter && Object.values(r2.prefs.ter)[0] === 0.021, "salvato nel browser");
  /* altri costi della banca */
  await p.evaluate(() => { const i = document.getElementById("coOther"); i.value = "0.5"; i.dispatchEvent(new Event("change", { bubbles: true })); });
  await wait(300);
  const r3 = await p.evaluate(() => document.querySelector("#costCard .co-k b").innerText);
  ok(/%/.test(r3), "costo annuo con altri costi: " + r3);
  /* calcolo: in 20 anni = Σ V·[(1,05)^20 − (1,05 − c)^20] */
  const chk = await p.evaluate(() => { const items = [...document.querySelectorAll("#costCard tbody tr:not(.pf)")]; return items.length; });
  ok(chk === 5, "righe coerenti");
  /* ripristino justETF */
  await p.evaluate(() => { const b = document.querySelector("[data-cor]"); if (b) b.click(); });
  await wait(300);
  ok(await p.evaluate(() => !document.querySelector("#costCard .co-src.tu")), "«usa justETF» ripristina il valore letto");
  ok(await p.evaluate(() => [...document.querySelectorAll("#labIdx [data-li]")].some(b => b.textContent === "Costi")), "nell'indice del laboratorio");
  if (SHOT) { await p.evaluate(() => document.getElementById("costCard").scrollIntoView()); await wait(500); const el = await p.$("#costCard"); await el.screenshot({ path: SHOT }); }
  ok(!errs.length, "nessun errore nella pagina " + errs.join(" | "));
} catch (e) { console.log("FAIL", e.message); fails++; }
await b.close(); srv.kill();
console.log(fails ? `${fails} FALLITI` : "tutto ok"); process.exit(fails ? 1 : 0);
