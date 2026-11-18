// Strumenti diversi dagli ETF: azioni USA e italiane, BTP, fondo non quotato, cripto. Cosa riesce a scaricare il sito e cosa dichiara.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const PORT = 5172, wait = ms => new Promise(r => setTimeout(r, ms));
const H = ["Data", "Operazione", "Strumento", "ISIN", "Ticker", "Quantità", "Prezzo", "Importo"];
const rows = [["15/01/2023", "Acquisto", "Apple Inc.", "US0378331005", "AAPL", 10, 135, 1350], ["15/01/2023", "Acquisto", "Enel SpA", "IT0003128367", "ENEL", 300, 5.5, 1650],
  ["15/02/2023", "Acquisto", "BTP 01/03/2032 0,95%", "IT0005436693", "", 20, 78, 1560], ["15/02/2023", "Acquisto", "Fondo comune bilanciato", "IT0000380649", "", 50, 12, 600],
  ["15/03/2023", "Acquisto", "Bitcoin", "", "BTC", 0.05, 22000, 1100], ["15/03/2023", "Acquisto", "iShares Core MSCI World", "IE00B4L5Y983", "SWDA", 20, 75, 1500]];
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" }); await wait(1500);
await p.evaluate(sh => window.__pos.loadSheets(sh, "strumenti_misti.xlsx"), [{ name: "Movimenti", aoa: [H, ...rows] }]);
const done = await p.waitForFunction(() => /ricostruito/.test(document.getElementById("dsName").innerText) || (window.__pos.state().und === null && false) || /Non riesco|Nessuno strumento|troppo corto/.test((document.getElementById("aiCard") || {}).innerText || ""), { timeout: 180000 }).then(() => true).catch(() => false);
await wait(1500);
const st = await p.evaluate(() => window.__pos.state());
const ai = await p.evaluate(() => (document.getElementById("aiCard") || {}).innerText.replace(/\s+/g, " "));
console.log("ricostruito:", /ricostruito/.test(await p.evaluate(() => document.getElementById("dsName").innerText)), "| asset:", st.assets.join(", "), "| verifiche:", JSON.stringify(st.checks));
console.log("portafoglio:", JSON.stringify(st.portfolio));
console.log("TESTO:", ai.slice(0, 1600));
console.log("errori JS:", errs.join(" | ") || "nessuno");
await b.close(); srv.kill();
