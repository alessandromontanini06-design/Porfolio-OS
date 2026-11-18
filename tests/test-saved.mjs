// Prova dell'archivio: salva due portafogli dallo stesso tipo di file (clienti diversi), li ritrova, cerca, rinomina,
// annota, riapre (storia delle revisioni), esporta e reimporta, elimina.
// Uso: node tools/test-saved.mjs   (usa files/PAC_due_fogli_righe_vuote.xlsx creato da test-pac.mjs; prezzi veri)
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const here = path.dirname(fileURLToPath(import.meta.url)), PORT = 5194, wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const t = (name, ok, info = "") => { if (ok) { pass++; console.log("  ok      " + name); } else { fail++; console.log(`  FALLITO ${name} ${info}`); } };
const file = path.join(here, "files", "PAC_due_fogli_righe_vuote.xlsx");
if (!fs.existsSync(file)) { console.error("Manca il file: lancia prima test-pac.mjs"); process.exit(1); }
const srv = spawn(process.execPath, [path.join(here, "serve.mjs")], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const errs = [];
try {
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept());
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" }); await wait(2500);
  await p.evaluate(() => window.__saved.clear());
  const build = async () => {
    await (await p.$("#file")).uploadFile(file);
    await p.waitForFunction(() => window.__pos.state().rebuilt, { timeout: 120000 }).catch(() => {});
    await p.evaluate(() => document.querySelector('.dock [data-go="map"]').click()); await wait(1200);
    await p.waitForFunction(() => !document.getElementById("confirmBtn").disabled, { timeout: 60000 });
    await p.evaluate(() => document.getElementById("confirmBtn").click());
    await p.waitForFunction(() => !document.getElementById("lab").hidden, { timeout: 60000 }); await wait(1500);
  };
  const saveAs = async name => { await p.evaluate(n => { const i = document.getElementById("svName"); i.value = n; document.querySelector('[data-sv="yes"]').click(); }, name); await wait(900); };
  t("all'inizio nessun portafoglio in home", await p.evaluate(() => document.getElementById("svList").hidden));
  await build();
  t("dopo il laboratorio propone di tenerlo nell'archivio, con un nome", await p.evaluate(() => !document.getElementById("svOffer").hidden && /archivio/.test(document.getElementById("svOffer").innerText) && /PAC_due_fogli/.test(document.getElementById("svName").value)));
  await saveAs("Mario Bianchi");
  /* secondo cliente con lo stesso tipo di file: non deve sovrascrivere il primo */
  await p.evaluate(() => document.querySelector('.dock [data-go="home"]').click()); await wait(800);
  await build(); await saveAs("Laura Verdi");
  let L = await p.evaluate(() => window.__saved.list().then(a => a.map(r => ({ name: r.name, n: r.assets.length, v: r.snap && r.snap.value, h: r.history.length }))));
  t("due clienti con lo stesso tipo di file restano separati", L.length === 2 && L.some(r => r.name === "Mario Bianchi") && L.some(r => r.name === "Laura Verdi"), JSON.stringify(L));
  t("ogni portafoglio ha valore e una prima revisione", L.every(r => r.v > 0 && r.h === 1 && r.n === 2), JSON.stringify(L));
  t("il pulsante Archivio in alto mostra 2", await p.evaluate(() => document.getElementById("archN").textContent === "2"));
  /* pagina Archivio */
  await p.evaluate(() => document.getElementById("archBtn").click()); await wait(800);
  t("l'archivio elenca i due portafogli", await p.evaluate(() => document.querySelectorAll("#arList .ar-row").length === 2));
  await p.evaluate(() => { const q = document.getElementById("arQ"); q.value = "laura"; q.dispatchEvent(new Event("input", { bubbles: true })); }); await wait(500);
  t("la ricerca trova solo «Laura Verdi»", await p.evaluate(() => { const r = document.querySelectorAll("#arList .ar-row"); return r.length === 1 && /Laura Verdi/.test(r[0].innerText); }));
  await p.evaluate(() => { const q = document.getElementById("arQ"); q.value = ""; q.dispatchEvent(new Event("input", { bubbles: true })); }); await wait(400);
  await p.evaluate(() => [...document.querySelectorAll("#arList .ar-row")].find(r => /Mario/.test(r.innerText)).querySelector("[data-arx]").click()); await wait(500);
  await p.evaluate(() => { const n = document.querySelector("[data-arnote]"); n.value = "Obiettivo: pensione a 60 anni."; n.dispatchEvent(new Event("input", { bubbles: true })); const m = document.querySelector("[data-arn]"); m.value = "Mario Bianchi (PAC)"; m.dispatchEvent(new Event("input", { bubbles: true })); }); await wait(900);
  L = await p.evaluate(() => window.__saved.list().then(a => a.map(r => ({ name: r.name, note: r.note }))));
  t("nome e note modificati si salvano da soli", L.some(r => r.name === "Mario Bianchi (PAC)" && /pensione a 60/.test(r.note)), JSON.stringify(L));
  /* riapertura dalla pagina dell'archivio */
  await p.evaluate(() => [...document.querySelectorAll("#arList .ar-row")].find(r => /Laura/.test(r.innerText)).querySelector("[data-svo]").click());
  await p.waitForFunction(() => !document.getElementById("lab").hidden && document.getElementById("archive").getAttribute("aria-hidden") === "true", { timeout: 150000 }).catch(() => {}); await wait(3000);
  t("riaprendo, il laboratorio si ricostruisce e la revisione si aggiorna", await p.evaluate(() => /è nell'archivio|Aperto dall'archivio/.test(document.getElementById("svOffer").innerText) && /92 transazioni/.test(document.getElementById("realCard").innerText)));
  L = await p.evaluate(() => window.__saved.list().then(a => a.length));
  t("riaprire non crea copie", L === 2, L);
  /* esporta, svuota, reimporta */
  const json = await p.evaluate(() => window.__saved.json());
  const jf = path.join(here, "files", "archivio-prova.json"); fs.writeFileSync(jf, json);
  await p.evaluate(() => window.__saved.clear()); await p.evaluate(() => window.__saved.archive()); await wait(600);
  t("archivio vuoto dopo averlo svuotato", await p.evaluate(() => /vuoto/.test(document.getElementById("arList").innerText)));
  await (await p.$("#arImport")).uploadFile(jf); await wait(1500);
  L = await p.evaluate(() => window.__saved.list().then(a => a.map(r => ({ name: r.name, isDate: r.sheets[0].aoa.slice(1).some(row => row[0] instanceof Date) }))));
  t("importando il file tornano i due portafogli, con le date come date", L.length === 2 && L.every(r => r.isDate), JSON.stringify(L));
  /* elimina */
  await p.evaluate(() => document.querySelector("#arList [data-arx]").click()); await wait(400);
  await p.evaluate(() => document.querySelector("#arList [data-svd]").click()); await wait(800);
  t("eliminando ne resta uno", await p.evaluate(() => window.__saved.list().then(a => a.length === 1)));
  fs.unlinkSync(jf);
  t("nessun errore JavaScript", !errs.length, errs.join(" | "));
} finally { await b.close(); srv.kill(); }
console.log(`\n${pass} superati, ${fail} falliti`); process.exit(fail ? 1 : 0);
