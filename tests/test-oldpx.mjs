// Prezzi incompleti: se la fonte restituisce la serie di IWDA ferma a giugno 2025, la scansione lo dice e propone di riprovare.
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
const PORT = 5197, wait = ms => new Promise(r => setTimeout(r, ms)), FILE = import.meta.dirname + "/files/video2/Movimenti_titoli_Bianchi.xlsx";
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
let fails = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; };
try {
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  let cut = true, served = 0;
  await p.setRequestInterception(true);
  p.on("request", async rq => {
    const u = rq.url();
    if (cut && /\/api\/prices\?symbol=IWDA\.AMS/.test(u)) {
      const j = await (await fetch(u)).json(); if (j.points) j.points = j.points.filter(x => x.d < "2025-07"); served++;
      rq.respond({ status: 200, contentType: "application/json", body: JSON.stringify(j) }); return;
    }
    rq.continue();
  });
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" });
  await p.evaluate(() => { localStorage.setItem("pos-save", "0"); try { Object.keys(localStorage).filter(k => /net|cache/i.test(k)).forEach(k => localStorage.removeItem(k)); } catch {} });
  await (await p.$("#file")).uploadFile(FILE);
  await p.waitForFunction(() => window.__pos.state().rebuilt && window.__pos.state().tx > 100, { timeout: 150000 });
  await wait(1500);
  ok(served > 0, "serie di IWDA accorciata dalla prova");
  await p.evaluate(() => document.querySelector('.dock [data-go="map"]').click()); await wait(1500);
  const st = await p.evaluate(() => ({ checks: window.__pos.state().checks, dis: document.getElementById("confirmBtn").disabled, txt: document.body.innerText.match(/Prezzi di IWDA fermi[^\n]*/)?.[0] }));
  ok(JSON.stringify(st.checks).includes("oldpx"), "controllo «prezzi fermi» presente: " + st.txt);
  ok(st.dis, "il laboratorio aspetta una scelta");
  cut = false;
  await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /Riprova a scaricarli/.test(x.textContent)); b.click(); });
  await p.waitForFunction(() => !JSON.stringify(window.__pos.state().checks).includes("oldpx") && window.__pos.state().rebuilt, { timeout: 150000 }).catch(() => {});
  await wait(1500);
  ok(!JSON.stringify(await p.evaluate(() => window.__pos.state().checks)).includes("oldpx"), "riprovando, i prezzi arrivano completi e l'avviso sparisce");
  ok(!errs.length, "nessun errore nella pagina " + errs.join(" | "));
} catch (e) { console.log("FAIL", e.message); fails++; }
await b.close(); srv.kill();
console.log(fails ? `${fails} FALLITI` : "tutto ok"); process.exit(fails ? 1 : 0);
