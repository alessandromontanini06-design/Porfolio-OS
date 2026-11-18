// Test dell'interfaccia: Chrome senza finestra attraversa il sito come un utente.
// Avvia l'anteprima locale (serve.mjs) su una porta libera, carica l'esempio, costruisce il laboratorio
// e apre ogni sezione controllando che i numeri compaiano e che non ci siano errori JavaScript.
// Uso: node tools/test-ui.mjs   (esce con codice 1 se qualcosa non va)
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
// SITE=https://... prova il sito pubblicato invece dell'anteprima locale (Quanta risponde con l'IA vera)
const PORT = 5199, LIVE = process.env.SITE, URL0 = LIVE ? LIVE.replace(/\/?$/, "/") : `http://localhost:${PORT}/`;
const CHROME = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", process.env.CHROME_PATH].find(p => p && fs.existsSync(p));
if (!CHROME) { console.error("Chrome non trovato: imposta CHROME_PATH."); process.exit(1); }

let pass = 0, fail = 0;
const t = (name, ok, info = "") => { if (ok) { pass++; console.log("  ok      " + name); } else { fail++; console.log(`  FALLITO ${name} ${info}`); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
// clic come un utente ma senza dipendere dallo scorrimento della pagina
const click = (p, sel) => p.evaluate(s => { const el = document.querySelector(s); if (!el) throw new Error('manca ' + s); el.click(); }, sel);

const server = LIVE ? { kill() {} } : spawn(process.execPath, [path.join(here, "serve.mjs")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
await wait(LIVE ? 0 : 1200);
console.log("Sito: " + URL0);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  page.on("pageerror", e => errors.push("pagina: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  // richieste interrotte (pagina chiusa o cambiata mentre la BCE risponde lenta) non sono errori del sito
  page.on("requestfailed", r => { if (!/fonts\.g|cdnjs/.test(r.url()) && !/ERR_ABORTED/.test((r.failure() || {}).errorText || "")) errors.push("rete: " + r.url() + " " + ((r.failure() || {}).errorText || "")); });

  console.log("Avvio");
  await page.goto(URL0, { waitUntil: "networkidle2" });
  t("motore caricato come modulo", await page.evaluate(() => typeof window.POS === "object" && typeof window.POS.monteCarlo === "function"));
  t("titolo della pagina", (await page.title()).includes("Portfolio OS"));

  console.log("Esempio e laboratorio");
  await wait(3000); // intro
  await click(page, "#sampleBtn");
  // l'esempio è un vero Excel di movimenti: viene ricostruito con i prezzi di mercato dei 7 ETF
  await page.waitForFunction(() => /ricostruito/.test(document.getElementById("dsName").innerText) && !document.getElementById("confirmBtn").disabled, { timeout: 120000 });
  t("esempio: nomi per ticker, non ISIN", await page.evaluate(() => { const a = window.__pos.state().assets.join(); return /EUNL/.test(a) && !/IE00/.test(a); }), await page.evaluate(() => window.__pos.state().assets.join()));
  await page.evaluate(() => document.querySelectorAll("select.need").forEach(x => { x.value = "ignore"; x.dispatchEvent(new Event("change", { bubbles: true })); }));
  t("mappa pronta", await page.evaluate(() => /Pronto: 7 serie/.test(document.getElementById("confirmText").innerText)));
  await click(page, "#confirmBtn");
  await page.waitForFunction(() => !document.getElementById("navLab").classList.contains("off"), { timeout: 20000 });
  await wait(2500);
  t("tabella delle metriche", await page.evaluate(() => document.querySelectorAll("#metrics tbody tr").length === 7));

  const scenes = {
    risk: ["#riskKpis", /VaR 95%/i],
    sim: ["#mcKpis", /Mediana dopo 20 anni[\s\S]*€/i],
    stress: ["#stCrises", /COVID/i],
    opt: ["#opKpis", /Sharpe/i],
    bench: ["#bnKpis", /Beta/i]
  };
  for (const [s, [sel, re]] of Object.entries(scenes)) {
    await click(page, `.dock [data-go="${s}"]`);
    await page.waitForFunction((sel, src) => new RegExp(src, "i").test((document.querySelector(sel) || {}).innerText || ""), { timeout: 20000 }, sel, re.source).catch(() => {});
    t(`sezione ${s}`, await page.evaluate((sel, src) => new RegExp(src, "i").test((document.querySelector(sel) || {}).innerText || ""), sel, re.source));
  }

  await page.waitForFunction(() => { const p = document.querySelector("#scene-bench .pager .pv b"); return p && p.textContent === "Frontiera"; }, { timeout: 8000 }).catch(() => {});
  t("in fondo alla sezione: precedente e successiva", await page.evaluate(() => { const p = document.querySelector("#scene-bench .pager"); return !!p && p.querySelector(".pv b").textContent === "Frontiera" && !p.querySelector(".nx b"); }), await page.evaluate(() => { const p = document.querySelector("#scene-bench .pager"); return p ? p.innerText.replace(/\s+/g, " ") + " | scena " + document.body.dataset.scene : "nessuna barra, scena " + document.body.dataset.scene; }));
  await page.evaluate(() => { for (const s of ["lab", "sim", "opt"]) document.querySelector(`.dock [data-go="${s}"]`).click(); }); await wait(1600);
  t("clic rapidi tra sezioni: resta visibile solo l'ultima", await page.evaluate(() => [...document.querySelectorAll(".scene")].filter(s => !s.hidden).map(s => s.id).join() === "scene-opt" && getComputedStyle(document.querySelector(".xfer")).visibility === "hidden"));
  await click(page, `.dock [data-go="risk"]`); await wait(1500);
  t("scheda di affidabilità statistica (IC Sharpe, VaR a tre metodi, Kupiec)", await page.evaluate(() => { const x = (document.getElementById("riskPro") || {}).innerText || ""; return /IC 95%/i.test(x) && /Cornish-Fisher/i.test(x) && /Kupiec/i.test(x); }));
  await page.evaluate(() => document.querySelector('#riskPro [data-rc="rk-bt-p"]').click()); await wait(700);
  t("ricevuta del backtest Kupiec", await page.evaluate(() => /LR = −2 ln/.test(document.getElementById("drawer").textContent)));
  await page.keyboard.press("Escape"); await wait(400);

  console.log("Ricevute e Quanta");
  await click(page, `.dock [data-go="risk"]`); await wait(1200);
  await click(page, '#riskKpis [data-rc]'); await wait(800);
  t("ricevuta apribile", await page.evaluate(() => document.getElementById("drawer").classList.contains("open") && /RICEVUTA/i.test(document.getElementById("drawer").innerText)));
  await page.keyboard.press("Escape"); await wait(500);
  await click(page, "#chatBtn"); await wait(700);
  t("sfera di Quanta apre la chat", await page.evaluate(() => document.getElementById("chat").classList.contains("open")));
  await page.evaluate(() => document.querySelector("#chatSugg [data-ask]").click());
  await page.waitForFunction(() => /QUANTA · NUMERI DAL MOTORE/i.test(document.getElementById("chatLog").innerText), { timeout: LIVE ? 60000 : 20000 }).catch(() => {});
  const chatTxt = await page.evaluate(() => document.getElementById("chatLog").innerText);
  t("Quanta risponde usando gli strumenti", await page.evaluate(() => /calcolo:/i.test(document.getElementById("chatLog").innerText) && /numeri dal motore/i.test(document.getElementById("chatLog").innerText)), "\n    " + chatTxt.replace(/\s+/g, " ").slice(-400));

  console.log("Telefono");
  const m = await browser.newPage();
  await m.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
  m.on("pageerror", e => errors.push("telefono: " + e.message));
  await m.goto(URL0, { waitUntil: "networkidle2" }); await wait(3500);
  const over = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  t("nessuno scorrimento orizzontale a 375 px", over <= 1, `eccede di ${over}px`);
  await m.close();

  t("giochi rimossi: niente sezione, niente pulsante nel dock", await page.evaluate(() => !document.getElementById("scene-games") && !document.querySelector('.dock [data-go="games"]') && !document.querySelector("[data-game]")));
  await page.evaluate(() => document.querySelector('.dock [data-go="home"]').click()); await wait(1500);
  t("home: 5 laboratori, tutti attivi, nessuno «in arrivo»", await page.evaluate(() => { const t = [...document.querySelectorAll("#labsGrid .lab-tile")]; return t.length === 5 && t.every(x => !x.disabled && !/in arrivo/i.test(x.innerText)); }));
  t("Quanta: fumetto contestuale", await page.evaluate(() => { document.getElementById("chatClose").click(); window.__quanta.say("risk"); const s = document.querySelector(".orb-say"); return s.classList.contains("on") && /VaR/.test(s.innerText); }));
  t("nessun errore JavaScript", errors.length === 0, "\n    " + errors.slice(0, 8).join("\n    "));
} finally {
  await browser.close();
  server.kill();
}
console.log(`\n${pass} superati, ${fail} falliti`);
process.exit(fail ? 1 : 0);
