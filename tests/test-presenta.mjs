// Presentazione al cliente: pagine, navigazione, campi da scrivere, uscita. SHOTS=cartella → una foto per pagina.
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const PORT = 5192, wait = ms => new Promise(r => setTimeout(r, ms));
const FILE = import.meta.dirname + "/files/video2/Movimenti_titoli_Bianchi.xlsx", SHOTS = process.env.SHOTS || "", W = +(process.env.W || 1440), H = +(process.env.H || 900);
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
let fails = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; };
try {
  const p = await b.newPage(); await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" });
  await p.evaluate(() => { localStorage.setItem("pos-save", "0"); localStorage.setItem("pos-brand-v1", JSON.stringify({ studio: "Studio Rossi · Consulenza indipendente", contact: "info@studiorossi.it" })); localStorage.removeItem("pos-costs-v1"); });
  await (await p.$("#file")).uploadFile(FILE);
  await p.waitForFunction(() => window.__pos.state().rebuilt && window.__pos.state().tx > 100, { timeout: 150000 });
  await p.evaluate(() => document.querySelector('.dock [data-go="map"]').click()); await wait(1200);
  await p.waitForFunction(() => !document.getElementById("confirmBtn").disabled, { timeout: 60000 });
  await p.evaluate(() => document.getElementById("confirmBtn").click());
  await p.waitForFunction(() => !document.getElementById("lab").hidden && !document.getElementById("realCard").hidden, { timeout: 60000 });
  await p.waitForFunction(() => { const pf = window.__pos.pf(); return pf && pf.etfDone; }, { timeout: 120000 }).catch(() => {});
  /* una proposta B nel confronto */
  for (const [nm, v] of Object.entries({ IWDA: 55, EMIM: 10, "XETRA-GOLD": 10, CNDX: 0, IBGS: 25 })) {
    await p.evaluate((nm, v) => { const inp = [...document.querySelectorAll('#cmpCard input.cmp-w[data-cp="1"]')].find(x => x.closest("tr").querySelector(".an").textContent.trim() === nm); if (!inp) return; inp.value = v; inp.dispatchEvent(new Event("change", { bubbles: true })); }, nm, v);
  }
  await wait(500);
  await p.evaluate(() => document.getElementById("presentBtn").click()); await wait(700);
  const ids = await p.evaluate(() => window.__present.slides());
  ok(JSON.stringify(ids) === JSON.stringify(["cover", "real", "where", "cost", "risk", "crises", "prop", "next"]), "pagine: " + ids.join(", "));
  ok(await p.evaluate(() => !document.getElementById("present").hidden && document.body.classList.contains("pz-on")), "si apre a tutto schermo");
  /* nome del cliente scritto sulla copertina */
  await p.click('#present [data-pz="client"]'); await p.keyboard.type("Marco Bianchi"); await p.keyboard.press("Escape");
  ok(await p.evaluate(() => !document.getElementById("present").hidden), "Esc dentro il campo non chiude la presentazione");
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  for (let i = 0; i < ids.length; i++) {
    if (i) await p.keyboard.press("ArrowRight");
    await wait(700);
    const cur = await p.evaluate(() => { const s = document.querySelector("#present .pz-s.on"); return { i: +s.dataset.i, h: (s.querySelector("h1,h2") || {}).innerText || "", over: s.scrollHeight > s.clientHeight + 2 }; });
    ok(cur.i === i, `pagina ${i + 1}: ${cur.h.replace(/\n/g, " ").slice(0, 90)}`);
    ok(!cur.over, `pagina ${i + 1} entra nello schermo ${W}×${H}`);
    if (i === ids.length - 1) { await p.click('#present [data-pz="next"]'); await p.keyboard.type("Ribilanciare verso la proposta B entro gennaio. Prossimo incontro a maggio."); await wait(200); }
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/pz-${i + 1}-${ids[i]}.png` });
  }
  const t = await p.evaluate(() => ({ prop: document.querySelector(".pz-prop .pz-t").innerText, cost: document.querySelector(".pz-cost h2").innerText }));
  ok(/Costo all'anno/.test(t.prop), "la proposta confronta anche i costi");
  ok(/€/.test(t.cost), "costi: " + t.cost);
  await p.keyboard.press("Escape"); await p.keyboard.press("ArrowLeft"); await wait(300);
  ok(await p.evaluate(() => +document.querySelector("#present .pz-s.on").dataset.i) === ids.length - 2, "freccia sinistra torna indietro");
  await p.keyboard.press("Escape"); await wait(300);
  ok(await p.evaluate(() => document.getElementById("present").hidden && !document.body.classList.contains("pz-on")), "Esc chiude");
  /* riaprendo, nome e note restano */
  await p.evaluate(() => document.getElementById("presentBtn").click()); await wait(400);
  ok(await p.evaluate(() => document.querySelector('#present [data-pz="client"]').innerText) === "Marco Bianchi", "il nome del cliente resta");
  ok(!errs.length, "nessun errore nella pagina " + errs.join(" | "));
} catch (e) { console.log("FAIL", e.message); fails++; }
await b.close(); srv.kill();
console.log(fails ? `${fails} FALLITI` : "tutto ok"); process.exit(fails ? 1 : 0);
