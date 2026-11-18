// Test dell'importazione nel sito: verifiche obbligatorie, correzioni delle anomalie, valute, memoria dei modelli.
// Uso: node tools/test-import.mjs   (anteprima locale; l'IA non c'è, si prova la parte deterministica)
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { corpus } from "./corpus.mjs";

let pass = 0, fail = 0;
const t = (name, ok, info = "") => { if (ok) { pass++; console.log("  ok      " + name); } else { fail++; console.log(`  FALLITO ${name} ${info}`); } };
const here = path.dirname(fileURLToPath(import.meta.url)), PORT = 5187, wait = ms => new Promise(r => setTimeout(r, ms));
const CHROME = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", process.env.CHROME_PATH].find(p => p && fs.existsSync(p));
const server = spawn(process.execPath, [path.join(here, "serve.mjs")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
await wait(1200);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const enc = sheets => JSON.stringify(sheets, (k, v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d\d:/.test(v) ? "\u0001D" + v : v));
const L = (y, m) => new Date(y, m + 1, 0);
try {
  const page = await browser.newPage(); const errs = [], ai = [];
  page.on("pageerror", e => errs.push(e.message));
  page.on("request", r => { if (/\/api\/recipe/.test(r.url())) ai.push(r.url()); });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" }); await wait(4500);
  await page.evaluate(() => window.__pos.forgetTemplates());
  const load = async (sheets, name) => { await page.evaluate((js, n) => { const sh = JSON.parse(js, (k, v) => (typeof v === "string" && v.startsWith("\u0001D") ? new Date(v.slice(2)) : v)); window.__pos.loadSheets(sh, n); }, enc(sheets), name); await page.waitForFunction(() => { const s = window.__pos.state(); return !s.recipe || s.recipe.status !== "loading"; }, { timeout: 30000 }).catch(() => {}); await wait(600); return page.evaluate(() => window.__pos.state()); };
  const act = async (id, a) => { await page.evaluate((id, a) => { const b = document.querySelector(`[data-chk="${id}"][data-act="${a}"]`); if (!b) throw new Error(`manca ${id}/${a}`); b.click(); }, id, a); await wait(a === "convert" ? 6000 : 500); return page.evaluate(() => window.__pos.state()); };

  console.log("Anomalie e conferme obbligatorie");
  const p = [100, 102, 104, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62];
  let s = await load([{ name: "Prezzi", aoa: [["Data", "Fondo"], ...p.map((v, i) => [L(2020, i), v]), [L(2031, 0), 70]] }], "anomalie.xlsx");
  t("frazionamento e data futura bloccano il laboratorio", s.confirmDisabled && s.checks.some(c => c.id === "future" && c.block) && s.checks.some(c => /^split:/.test(c.id) && c.block), JSON.stringify(s.checks));
  const sid = s.checks.find(c => /^split:/.test(c.id)).id;
  s = await act(sid, "fix"); s = await act("future", "drop");
  t("dopo le due correzioni il laboratorio si può costruire", !s.confirmDisabled && s.checks.every(c => !c.block || c.done), JSON.stringify(s.checks));
  s = await act(sid, "undo");
  t("annullare una correzione riporta la verifica", s.confirmDisabled);

  console.log("Valute");
  const usd = [["Data", "S&P 500 (USD)", "Bund (€)"], ...Array.from({ length: 24 }, (_, i) => [L(2022, i), 4000 + i * 20, 100 + i])];
  s = await load([{ name: "Mercati", aoa: usd }], "valute.xlsx");
  t("serie in dollari: la conversione è richiesta", s.checks.some(c => c.id === "ccy" && c.block && !c.done) && s.confirmDisabled, JSON.stringify(s.checks));
  s = await act("ccy", "convert");
  t("convertita in euro con il cambio BCE", s.checks.some(c => c.id === "ccy" && c.done) && !s.confirmDisabled, JSON.stringify(s.checks));
  s = await load([{ name: "Mercati", aoa: usd }], "valute.xlsx"); s = await act("ccy", "keep");
  t("oppure lasciata in dollari per scelta esplicita", !s.confirmDisabled);

  console.log("Valori di patrimonio e memoria dei modelli");
  const tr = corpus().find(c => c.id === "tracker-anni").sheets;
  s = await load(tr, "tracker.xlsx");
  t("tracker: richiesta la conferma che sono valori e non prezzi", s.checks.some(c => c.id === "flows" && c.block), JSON.stringify(s.checks));
  for (const c of s.checks.filter(c => c.block && !c.done)) s = await act(c.id, c.id === "unsure" ? "ok" : "ok");
  t("confermato tutto: laboratorio disponibile", !s.confirmDisabled, JSON.stringify(s.checks));
  await page.evaluate(() => document.getElementById("confirmBtn").click()); await wait(2500);
  const before = ai.length;
  s = await load(tr, "tracker-copia.xlsx");
  t("stesso modello ricaricato: riconosciuto, senza chiamare l'IA e senza riconferme", s.tpl && ai.length === before && !s.confirmDisabled, JSON.stringify({ tpl: s.tpl, ai: ai.length - before, checks: s.checks }));
  await page.evaluate(() => document.getElementById("tplForget").click()); await wait(1200);
  s = await page.evaluate(() => window.__pos.state());
  t("«Dimentica questo modello» riporta le conferme", !s.tpl && s.confirmDisabled);

  console.log("Compatibilità");
  await page.evaluate(() => document.getElementById("sampleBtn").click());
  await page.waitForFunction(() => /ricostruito/.test(document.getElementById("dsName").innerText) && !document.getElementById("confirmBtn").disabled, { timeout: 120000 }).catch(() => {});
  s = await page.evaluate(() => window.__pos.state());
  t("l'esempio del sito (7 ETF ricostruiti) è pronto da confermare", s.assets.length === 7 && !s.confirmDisabled, JSON.stringify(s.assets) + JSON.stringify(s.checks));
  t("nessun errore JavaScript", !errs.length, errs.slice(0, 5).join(" | "));
} finally { await browser.close(); server.kill(); }
console.log(`\n${pass} superati, ${fail} falliti`);
process.exit(fail ? 1 : 0);
