// Catalogo del costruttore: gruppi, ricerca, titoli di ogni tipo (ETF, azioni italiane ed estere, oro, cripto) fino al laboratorio con i prezzi veri.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const [,, OUT] = process.argv, PORT = 5174, wait = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = [];
p.on("pageerror", e => errs.push(e.message));
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await wait(4000);
await p.click("#builderBtn"); await wait(700);
const groups = await p.evaluate(() => [...document.querySelectorAll("[data-bdg]")].map(x => x.textContent.trim()));
t("almeno 10 gruppi nel catalogo", groups.length >= 10, groups.join(" | "));
t("almeno 100 strumenti", await p.evaluate(() => /(\d+) strumenti nel catalogo/.test(document.querySelector(".bd-cnote").textContent) && +document.querySelector(".bd-cnote").textContent.match(/(\d+) strumenti/)[1] >= 100));
await p.evaluate(() => [...document.querySelectorAll("[data-bdg]")].find(x => /Azioni italiane/.test(x.textContent)).click()); await wait(200);
t("gruppo «Azioni italiane»: almeno 15 titoli, c'è Eni", await p.evaluate(() => document.querySelectorAll(".bd-clist .bd-ci").length >= 15 && /Eni/.test(document.querySelector(".bd-clist").innerText)));
await p.focus(".bd-cq"); await p.keyboard.type("oro");
await wait(200);
t("ricerca «oro»: trova l'oro fisico e il cursore resta nella ricerca", await p.evaluate(() => /Physical Gold|Xetra-Gold/.test(document.querySelector(".bd-clist").innerText) && document.activeElement.classList.contains("bd-cq")));
await p.evaluate(() => { const i = document.querySelector(".bd-cq"); i.value = "US0378331005"; i.dispatchEvent(new Event("input", { bubbles: true })); }); await wait(200);
t("ricerca per ISIN: Apple", await p.evaluate(() => document.querySelectorAll(".bd-clist .bd-ci").length === 1 && /Apple/.test(document.querySelector(".bd-clist").innerText)));
await p.evaluate(() => { const i = document.querySelector(".bd-cq"); i.value = "zzzz nessuno"; i.dispatchEvent(new Event("input", { bubbles: true })); }); await wait(200);
t("ricerca senza risultati: spiega cosa fare", await p.evaluate(() => /Puoi scrivere comunque ticker o ISIN/.test(document.querySelector(".bd-clist").innerText)));
/* portafoglio misto dal catalogo: ETF mondo, Eni, Apple, oro, Bitcoin */
await p.click("#bdClear"); await wait(150);
for (const tk of ["VWCE", "ENI", "AAPL", "SGLD", "VBTC"]) {
  await p.evaluate(tk => { const i = document.querySelector(".bd-cq"); i.value = tk; i.dispatchEvent(new Event("input", { bubbles: true })); }, tk); await wait(120);
  await p.evaluate(tk => document.querySelector(`.bd-clist [data-bdc="${tk}"]`).click(), tk); await wait(150);
}
for (const [i, w] of [60, 15, 10, 10, 5].entries()) { await p.evaluate((i, w) => { const x = document.querySelectorAll("#bdRows input[data-bdw]")[i]; x.value = String(w); x.dispatchEvent(new Event("change", { bubbles: true })); }, i, w); await wait(120); }
t("5 strumenti aggiunti dal catalogo, totale 100%", await p.evaluate(() => document.querySelectorAll("#bdRows .bd-row").length === 5 && /^Totale 100%$/.test(document.getElementById("bdSum").textContent.trim())), await p.evaluate(() => document.getElementById("bdSum").textContent));
await p.screenshot({ path: `${OUT}/catalogo-1.jpg`, type: "jpeg", quality: 70 });
await p.click("#bdGo");
const inLab = await p.waitForFunction(() => document.body.dataset.scene === "lab" && !document.getElementById("lab").hidden, { timeout: 180000 }).then(() => true).catch(() => false);
const st = await p.evaluate(() => window.__pos.state());
if (process.env.DEBUG) console.log(JSON.stringify(st).slice(0, 3000));
t("arriva al laboratorio con i prezzi veri", inLab, JSON.stringify(st.checks || st).slice(0, 300));
t("5 strumenti con prezzi (anche azioni, oro e cripto)", (st.assets || []).length === 5, (st.assets || []).join(","));
await wait(1500); await p.screenshot({ path: `${OUT}/catalogo-2.jpg`, type: "jpeg", quality: 70 });
t("nessun errore JavaScript", !errs.length, errs.join(" | "));
console.log(`\n${pass} superati, ${fail} falliti`);
await b.close(); srv.kill(); process.exit(fail ? 1 : 0);
