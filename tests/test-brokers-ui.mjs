// Prova completa nel sito: ogni export di broker → ricostruzione con i prezzi di mercato → laboratorio → rendimento reale.
// Uso: node tools/test-brokers-ui.mjs   (prezzi veri da Yahoo tramite serve.mjs con REAL_PRICES=1)
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { BROKERS } from "./brokers.mjs";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const PORT = 5173, wait = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
let ok = 0;
for (const [k, c] of Object.entries(BROKERS)) {
  const p = await b.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" }); await wait(1500);
  // come handleFile: prima la normalizzazione degli export a più sezioni, poi la lettura
  await p.evaluate((sheets, k) => window.__pos.loadSheets(window.POS.normalizeExports(sheets), `export_${k}.csv`), c.sheets, k);
  const rebuilt = await p.waitForFunction(() => /ricostruito/.test(document.getElementById("dsName").innerText) && !document.getElementById("confirmBtn").disabled, { timeout: 120000 }).then(() => true).catch(() => false);
  let real = "", st = await p.evaluate(() => window.__pos.state());
  if (rebuilt) { await p.evaluate(() => document.getElementById("confirmBtn").click()); await wait(4000); real = await p.evaluate(() => { const e = document.getElementById("realCard"); return e && !e.hidden ? e.innerText.replace(/\s+/g, " ").slice(0, 160) : ""; }); }
  const good = rebuilt && /Il tuo rendimento reale/.test(real) && !/nessuna corrisponde/.test(real) && !errs.length;
  if (good) ok++;
  console.log(good ? "ok     " : "FALLITO", k.padEnd(14), rebuilt ? "ricostruito" : "NON ricostruito", "|", st.portfolio ? st.portfolio.join(", ") : JSON.stringify(st.checks), "|", real.slice(0, 110), errs.length ? "| errori: " + errs.join("; ") : "");
  await p.close();
}
console.log(`\n${ok} su ${Object.keys(BROKERS).length} broker: dal file al rendimento reale`);
await b.close(); srv.kill(); process.exit(ok === Object.keys(BROKERS).length ? 0 : 1);
