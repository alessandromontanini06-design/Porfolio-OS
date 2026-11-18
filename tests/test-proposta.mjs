// Dalla proposta alle operazioni: compra/vendi per passare da A a B, imposte stimate, costo, Excel scaricabile.
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const PORT = 5196, wait = ms => new Promise(r => setTimeout(r, ms)), SHOT = process.env.SHOT || "";
const FILE = import.meta.dirname + "/files/video2/Movimenti_titoli_Bianchi.xlsx", DL = import.meta.dirname + "/files/download";
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
let fails = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; };
try {
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL, { recursive: true });
  const cdp = await b.target().createCDPSession(); await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL, eventsEnabled: true });
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" });
  await p.evaluate(() => { localStorage.setItem("pos-save", "0"); localStorage.removeItem("pos-costs-v1"); });
  await (await p.$("#file")).uploadFile(FILE);
  await p.waitForFunction(() => window.__pos.state().rebuilt && window.__pos.state().tx > 100, { timeout: 150000 });
  await p.evaluate(() => document.querySelector('.dock [data-go="map"]').click()); await wait(1200);
  await p.waitForFunction(() => !document.getElementById("confirmBtn").disabled, { timeout: 60000 });
  await p.evaluate(() => document.getElementById("confirmBtn").click());
  await p.waitForFunction(() => !document.getElementById("lab").hidden && !document.getElementById("realCard").hidden, { timeout: 60000 });
  await p.waitForFunction(() => { const pf = window.__pos.pf(); return pf && pf.etfDone; }, { timeout: 120000 }).catch(() => {});
  for (const [nm, v] of Object.entries({ IWDA: 55, EMIM: 10, "XETRA-GOLD": 10, CNDX: 0, IBGS: 25 })) {
    await p.evaluate((nm, v) => { const inp = [...document.querySelectorAll('#cmpCard input.cmp-w[data-cp="1"]')].find(x => x.closest("tr").querySelector(".an").textContent.trim() === nm); inp.value = v; inp.dispatchEvent(new Event("change", { bubbles: true })); }, nm, v);
  }
  await wait(500);
  const r = await p.evaluate(() => { const m = document.querySelector("#cmpCard .mv"); if (!m) return null;
    const rows = [...m.querySelectorAll("tbody tr:not(.pf)")].map(tr => ({ n: tr.querySelector(".an").textContent, op: tr.children[3].innerText, tax: tr.children[4].innerText }));
    return { rows, tot: m.querySelector("tr.pf").innerText, cap: m.querySelector(".caption").innerText, cost: [...document.querySelectorAll("#cmpCard .cmp-r tr")].map(t => t.innerText).find(t => /Costo annuo/.test(t)) }; });
  ok(!!r, "tabella delle operazioni presente");
  console.log("     " + r.rows.map(x => `${x.n}: ${x.op}${x.tax !== "—" ? " (imposte " + x.tax.split("\n")[0] + ")" : ""}`).join(" | "));
  ok(r.rows.find(x => x.n === "IWDA").op.startsWith("Vendi"), "IWDA da 81% a 55%: vendita");
  ok(r.rows.find(x => x.n === "IBGS").op.startsWith("Compra"), "IBGS da 3% a 25%: acquisto");
  ok(r.rows.find(x => x.n === "IWDA").tax !== "—", "imposte stimate sulla vendita di IWDA (in guadagno)");
  ok(r.rows.find(x => x.n === "IBGS").tax === "—", "nessuna imposta su un acquisto");
  const nums = r.tot.match(/vendite ([\d.]+) € · acquisti ([\d.]+) €/); ok(nums && Math.abs(+nums[1].replace(/\./g, "") - +nums[2].replace(/\./g, "")) <= 2, "vendite = acquisti: " + (nums ? nums[0] : r.tot));
  ok(/Costo annuo/.test(r.cost || ""), "riga del costo annuo nel confronto: " + (r.cost || "").replace(/\s+/g, " "));
  await p.evaluate(() => { window.__w = "nessuna chiamata"; const o = XLSX.writeFile; XLSX.writeFile = (wb, n) => { window.__w = n; window.__b64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" }); }; });
  await p.evaluate(() => document.getElementById("cmpXls").click()); await wait(2500);
  console.log("     writeFile:", await p.evaluate(() => window.__w));
  const b64x = await p.evaluate(() => window.__b64), f = await p.evaluate(() => window.__w); if (b64x) fs.writeFileSync(`${DL}/${f}`, Buffer.from(b64x, "base64"));
  /* nel browser senza finestra lo scaricamento non arriva su disco: il file si prende dalla stessa chiamata */
  ok(!!b64x && /^Proposta .*\.xlsx$/.test(f), "Excel generato: " + f);
  if (f) {
    const info = await p.evaluate(async b64 => { const wb = XLSX.read(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), { type: "array" }); return { sheets: wb.SheetNames, head: XLSX.utils.sheet_to_json(wb.Sheets.Operazioni, { header: 1 })[0], n: XLSX.utils.sheet_to_json(wb.Sheets.Operazioni, { header: 1 }).length, conf: XLSX.utils.sheet_to_json(wb.Sheets.Confronto, { header: 1 }).map(r => r[0]) }; }, fs.readFileSync(`${DL}/${f}`).toString("base64"));
    ok(info.sheets.join() === "Operazioni,Confronto,Note", "fogli: " + info.sheets.join(", "));
    ok(info.head.includes("ISIN") && info.n === 7, `operazioni: ${info.n - 2} strumenti + intestazione e totale`);
    ok(info.conf.some(x => /Costo annuo/.test(x)), "confronto con i costi");
  }
  if (SHOT) { await p.evaluate(() => document.querySelector("#cmpCard .mv").scrollIntoView({ block: "center" })); await wait(500); await p.screenshot({ path: SHOT }); }
  ok(!errs.length, "nessun errore nella pagina " + errs.join(" | "));
} catch (e) { console.log("FAIL", e.message); fails++; }
await b.close(); srv.kill();
console.log(fails ? `${fails} FALLITI` : "tutto ok"); process.exit(fails ? 1 : 0);
