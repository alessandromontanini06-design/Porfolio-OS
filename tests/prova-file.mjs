// Prova in serie dei file di una cartella sul sito locale (prezzi veri): cosa legge, cosa ricostruisce, se arriva al laboratorio.
// Uso: node prova-file.mjs cartella [solo-questo-file]   → riepilogo in cartella/_risultati.json e a schermo
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
const [, , DIR, ONLY] = process.argv, PORT = 5212, wait = ms => new Promise(r => setTimeout(r, ms));
const files = fs.readdirSync(DIR).filter(f => /\.(xlsx|xls|xlsm|ods|csv|txt)$/i.test(f) && (!ONLY || f === ONLY)).sort();
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const out = [];
for (const f of files) {
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
  const errs = []; p.on("pageerror", e => errs.push(e.message.slice(0, 160)));
  const r = { file: f };
  try {
    await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" });
    await p.evaluate(() => { localStorage.setItem("pos-save", "0"); });
    await (await p.$("#file")).uploadFile(path.join(DIR, f));
    /* si aspetta che il file sia letto e, se c'è da ricostruire coi prezzi, che la ricostruzione finisca */
    const t0 = Date.now();
    await p.waitForFunction(() => { const s = window.__pos.state(), busy = document.querySelector(".thinking"); return (s.rebuilt || s.obs > 0 || !!document.querySelector(".deadend") || /Non riesco|non supportato|vuoto/.test((document.getElementById("fileErr") || {}).innerText || "")) && !busy; }, { timeout: 120000, polling: 1000 }).catch(() => { r.timeout = true; });
    await wait(2500);
    const s = await p.evaluate(() => { const st = window.__pos.state(), pf = window.__pos.pf && window.__pos.pf();
      return { st, err: ((document.getElementById("fileErr") || {}).innerText || "").slice(0, 200), pos: pf ? pf.positions.map(x => `${x.ticker || x.nome}→${x.simbolo || "?"}`).slice(0, 12) : null, miss: pf ? pf.missing.map(m => `${m.nome}: ${String(m.err).slice(0, 60)}`).slice(0, 8) : null }; });
    r.secs = Math.round((Date.now() - t0) / 1000); r.err = s.err || null; r.tx = s.st.tx; r.rebuilt = s.st.rebuilt; r.assets = s.st.assets; r.pos = s.pos; r.miss = s.miss;
    r.checks = (s.st.checks || []).filter(c => c.block && !c.done).map(c => c.id);
    /* scelte bloccanti: si prende quella «neutra» per arrivare al laboratorio */
    await p.evaluate(() => document.querySelector('.dock [data-go="map"]').click()); await wait(1200);
    for (let k = 0; k < 6; k++) { const did = await p.evaluate(() => { const x = [...document.querySelectorAll("button")].find(x => x.offsetParent && /Procedi senza|Procedi comunque|Usa solo i mesi comuni|Le ho controllate|Ho controllato|Converti in euro|Analizza comunque|Escludile/.test(x.textContent)); if (x) { x.click(); return true; } return false; }); if (!did) break; await wait(1500); }
    const can = await p.evaluate(() => !document.getElementById("confirmBtn").disabled);
    r.lab = false;
    if (can) { await p.evaluate(() => document.getElementById("confirmBtn").click()); await p.waitForFunction(() => !document.getElementById("lab").hidden, { timeout: 30000 }).catch(() => {}); await wait(2500);
      const L = await p.evaluate(() => ({ lab: !document.getElementById("lab").hidden, real: (document.getElementById("realCard").innerText || "").replace(/\s+/g, " ").slice(0, 260), sub: (document.querySelector("#scene-lab .lead, #scene-lab .sub, #labSub") || {}).innerText || "" }));
      r.lab = L.lab; r.real = L.real; }
    else r.blocked = await p.evaluate(() => [...document.querySelectorAll(".chk:not(.done) b, .check:not(.done) b")].map(x => x.innerText).slice(0, 4));
  } catch (e) { r.crash = e.message.slice(0, 200); }
  r.errs = errs; out.push(r); await p.close();
  console.log(`${r.lab ? "LAB " : "--- "} ${f.padEnd(34)} tx=${r.tx ?? "-"} asset=${(r.assets || []).length} ${r.rebuilt ? "ricostruito" : ""} ${r.err ? "ERR:" + r.err : ""}${r.checks && r.checks.length ? " blocchi:" + r.checks.join(",") : ""}${r.miss && r.miss.length ? " mancano:" + r.miss.length : ""}${r.errs.length ? " JS:" + r.errs.length : ""}${r.timeout ? " TIMEOUT" : ""}`);
}
fs.writeFileSync(path.join(DIR, "_risultati.json"), JSON.stringify(out, null, 1));
await b.close(); srv.kill();
