// Patrimonio: grafico come nelle app dei broker (periodi 1S 1M 6M 1A Max, linea al valore d'inizio, variazione senza i versamenti, scorrimento).
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const [,, OUT] = process.argv, PORT = +(process.env.TEST_PORT || 5179), wait = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const db = { v: 1, creato: "2024-01-01T00:00:00Z",
  strumenti: { IE00B4L5Y983: { nome: "iShares Core MSCI World", ticker: "SWDA", isin: "IE00B4L5Y983", simbolo: "IWDA.AMS", valuta: "EUR" } },
  operazioni: [
    { id: "a1", data: "2024-02-01", tipo: "acquisto", strumento: "IE00B4L5Y983", quantita: 50, prezzo: 85 },
    { id: "a2", data: "2025-06-02", tipo: "acquisto", strumento: "IE00B4L5Y983", quantita: 30, prezzo: 100 }] };
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = [];
p.on("pageerror", e => errs.push(e.message));
await p.evaluateOnNewDocument(d => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("pos-patrimonio-v1", d); localStorage.removeItem("pos-pm-periodo"); sessionStorage.setItem("seeded", "1"); } }, JSON.stringify(db));
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" });
await p.waitForFunction(() => !!document.querySelector("#pmChart .pm-ch2-svg") && /€/.test(document.getElementById("pmChVal").textContent), { timeout: 60000 }).catch(() => {});
const per = await p.evaluate(() => [...document.querySelectorAll("[data-pmper]")].map(b => b.textContent + (b.getAttribute("aria-pressed") === "true" ? "*" : "")).join(","));
t("periodi 1S 1M 6M 1A Max, «Max» scelto", per === "1S,1M,6M,1A,Max*", per);
const num = s => +String(s).replace(/[^\d,−-]/g, "").replace("−", "-").replace(",", ".");
const head = () => p.evaluate(() => ({ when: document.getElementById("pmChWhen").textContent, val: document.getElementById("pmChVal").textContent, delta: document.getElementById("pmChDelta").textContent }));
const h0 = await head();
t("in alto: «Dall'inizio», valore di oggi e variazione in euro e %", /Dall'inizio/.test(h0.when) && /€/.test(h0.val) && /€ · [+−-]?[\d,]+%/.test(h0.delta), JSON.stringify(h0));
/* con «Max» il guadagno del grafico è il guadagno del patrimonio */
const g = await p.evaluate(() => { const k = [...document.querySelectorAll("#pmKpis div, #pmKpis span, #pmKpis b")].map(e => e.textContent).join(" | "); return k; });
const gEuro = num((h0.delta.match(/[+−-]?[\d.]+(,\d+)?\s?€/) || [""])[0].replace(/\./g, ""));
t("«Max»: guadagno senza versamenti positivo e sensato (meno del valore)", gEuro > 0 && gEuro < num(h0.val.replace(/\./g, "")), `${gEuro} · ${h0.val}`);
await p.evaluate(() => document.querySelector('[data-pmper="1A"]').click()); await wait(300);
const h1 = await head();
t("«1A»: «Nell'ultimo anno» e la variazione cambia", /Nell'ultimo anno/.test(h1.when) && h1.delta !== h0.delta, JSON.stringify(h1));
t("la scelta del periodo resta nel browser", await p.evaluate(() => localStorage.getItem("pos-pm-periodo") === "1A"));
t("c'è la linea a puntini al valore d'inizio periodo", await p.evaluate(() => !!document.querySelector('#pmChart line[stroke-dasharray="1 6"]')));
/* scorrimento col mouse a metà grafico */
if (process.env.DEBUG) console.log(await p.evaluate(() => { const a = document.querySelector("#pmChart .pm-ch2-svg"), r = a.getBoundingClientRect(); return { on: a.dataset.on, tab: a.tabIndex, top: r.top, h: r.height, inner: innerHeight, scene: document.body.dataset.scene }; }));
await p.evaluate(() => document.querySelector("#pmChart .pm-ch2-svg").scrollIntoView({ block: "center" })); await wait(300);
const box = await p.evaluate(() => { const r = document.querySelector("#pmChart .pm-ch2-svg").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await p.mouse.move(box.x, box.y); await wait(150);
const h2 = await head();
t("col mouse sulla linea: data del giorno, valore e variazione fino a lì", /^\d{2}\/\d{2}\/\d{4}$/.test(h2.when) && /€/.test(h2.val) && await p.evaluate(() => document.getElementById("pmChDot").getAttribute("opacity") === "1"), JSON.stringify(h2));
await p.mouse.move(5, 5); await wait(150);
t("uscendo dal grafico torna il riepilogo del periodo", /Nell'ultimo anno/.test((await head()).when));
await p.focus("#pmChart .pm-ch2-svg"); await p.keyboard.press("ArrowLeft"); await p.keyboard.press("ArrowLeft"); await wait(100);
t("con le frecce della tastiera si scorre giorno per giorno", /^\d{2}\/\d{2}\/\d{4}$/.test((await head()).when));
await p.evaluate(() => document.getElementById("pmChart").scrollIntoView({ block: "center" })); await p.mouse.move(box.x + 120, box.y); await wait(200);
await p.screenshot({ path: `${OUT}/grafico-pc.jpg`, type: "jpeg", quality: 72 });
await p.setViewport({ width: 390, height: 844 }); await p.evaluate(() => document.querySelector('[data-pmper="Max"]').click()); await wait(500);
await p.evaluate(() => document.getElementById("pmChart").scrollIntoView({ block: "center" })); await wait(300);
await p.screenshot({ path: `${OUT}/grafico-tel.jpg`, type: "jpeg", quality: 72 });
t("sul telefono niente esce dallo schermo", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
t("nessun errore JavaScript", !errs.length, errs.join(" | "));
console.log(`\n${pass} superati, ${fail} falliti`);
await b.close(); srv.kill(); process.exit(fail ? 1 : 0);
