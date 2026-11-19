// Home sul computer: le sezioni che entrano allo scorrimento devono comparire sempre, anche quando il sito si apre
// sul patrimonio (home nascosta all'avvio) e poi si passa alla Home. Il 19/11/2026 restavano vuote: riquadro scuro
// «Una giornata del tuo patrimonio» senza testo, «Le domande che contano» e la chiusura lime vuoti.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const [,, OUT] = process.argv, PORT = +(process.env.TEST_PORT || 5205), wait = ms => new Promise(r => setTimeout(r, ms));
const SITE = process.env.SITE || `http://localhost:${PORT}`;
const srv = process.env.SITE ? null : spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
const errs = [];
const SEZ = [[".hm-start-wrap", "Da dove parti"], [".hm-day", "Una giornata"], [".hm-index", "Le domande che contano"], [".audience", "Per chi è"], [".hm-end", "finalmente chiaro"]];
/* scorre la home fino a ogni sezione, come una persona (rotella), e guarda se i figli sono visibili */
async function check(p, nome) {
  await p.mouse.move(700, 450);
  const H = await p.evaluate(() => document.getElementById("scene-home").scrollHeight);
  for (let y = 0; y < H; y += 300) { await p.mouse.wheel({ deltaY: 300 }); await wait(120); }
  await wait(1500);
  for (const [sel, lab] of SEZ) {
    await p.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: "center" }), sel); await wait(1300);
    const r = await p.evaluate(sel => { const el = document.querySelector(sel), kids = [...(sel === ".audience" ? el.querySelectorAll(".aud-card") : el.children)];
      return { n: kids.length, min: Math.min(...kids.map(k => +getComputedStyle(k).opacity)) }; }, sel);
    t(`${nome}: «${lab}» si vede (opacità ${r.min})`, r.n > 0 && r.min > 0.99, JSON.stringify(r));
  }
}
/* 1. si apre direttamente la home */
{
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); p.on("pageerror", e => errs.push(e.message));
  await p.evaluateOnNewDocument(() => { localStorage.clear(); });
  await p.goto(`${SITE}/?home`, { waitUntil: "networkidle2" }); await wait(2000);
  await check(p, "home all'apertura");
  await p.close();
}
/* 2. chi ha un patrimonio apre il sito sul patrimonio, poi va in Home */
{
  const p = await b.newPage(); await p.setViewport({ width: 1920, height: 1000 }); p.on("pageerror", e => errs.push(e.message));
  await p.evaluateOnNewDocument(() => { if (!sessionStorage.getItem("seeded")) { localStorage.clear(); localStorage.setItem("pos-patrimonio-v1", JSON.stringify({ v: 1, strumenti: { IE00B4L5Y983: { nome: "iShares Core MSCI World", ticker: "SWDA", isin: "IE00B4L5Y983", simbolo: "IWDA.AMS", valuta: "EUR" } }, operazioni: [{ id: "a1", data: "2024-02-01", tipo: "acquisto", strumento: "IE00B4L5Y983", quantita: 100, prezzo: 85 }] })); sessionStorage.setItem("seeded", "1"); } });
  await p.goto(`${SITE}/`, { waitUntil: "networkidle2" }); await wait(2500);
  t("con un patrimonio il sito si apre sul patrimonio", await p.evaluate(() => !document.getElementById("scene-patrimonio").hidden && document.getElementById("scene-home").hidden));
  await p.evaluate(() => document.querySelector('[data-go="home"]').click()); await wait(1500);
  await check(p, "dal patrimonio alla home");
  await p.evaluate(() => document.querySelector(".hm-day").scrollIntoView({ block: "start" })); await wait(800);
  if (OUT) await p.screenshot({ path: `${OUT}/home-entrate.jpg`, type: "jpeg", quality: 65 });
  await p.close();
}
t("nessun errore JavaScript", !errs.length, errs.join(" | "));
console.log(`\n${pass} superati, ${fail} falliti`);
await b.close(); if (srv) srv.kill(); process.exit(fail ? 1 : 0);
