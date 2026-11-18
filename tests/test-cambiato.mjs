// «Cosa è cambiato»: salva il cliente con i movimenti fino a giugno 2025, poi carica il file completo e lo aggiorna dall'archivio.
// Si aspetta: scheda con valore prima/dopo, versato nel frattempo, effetto dei mercati, pesi; pagina nella presentazione.
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const PORT = 5195, wait = ms => new Promise(r => setTimeout(r, ms)), SHOT = process.env.SHOT || "";
const FULL = import.meta.dirname + "/files/video2/Movimenti_titoli_Bianchi.xlsx", OLD = import.meta.dirname + "/files/Movimenti_titoli_Bianchi_2025.xlsx";
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
let fails = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; };
try {
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
  const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept());
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" }); await wait(1500);
  /* il file «vecchio»: stessi movimenti fino al 30/06/2025 */
  const b64 = await p.evaluate(async src => { const wb = XLSX.read(Uint8Array.from(atob(src), c => c.charCodeAt(0)), { type: "array" }), ws = wb.Sheets[wb.SheetNames[0]], aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
    const h = aoa.findIndex(r => r.includes("Data operazione")), c = aoa[h].indexOf("Data operazione");
    const keep = aoa.filter((r, i) => i <= h || !r[c] || (([d, m, y]) => +y * 1e4 + +m * 100 + +d)(String(r[c]).split("/")) <= 20250630);
    const nb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(nb, XLSX.utils.aoa_to_sheet(keep), wb.SheetNames[0]); return XLSX.write(nb, { type: "base64", bookType: "xlsx" }); }, fs.readFileSync(FULL).toString("base64"));
  fs.writeFileSync(OLD, Buffer.from(b64, "base64"));
  await p.evaluate(() => { window.__saved.clear(); localStorage.removeItem("pos-save"); });
  const build = async f => {
    await (await p.$("#file")).uploadFile(f);
    await p.waitForFunction(() => window.__pos.state().rebuilt && window.__pos.state().tx > 50, { timeout: 150000 });
    await p.evaluate(() => document.querySelector('.dock [data-go="map"]').click()); await wait(1200);
    await p.waitForFunction(() => !document.getElementById("confirmBtn").disabled, { timeout: 60000 });
    await p.evaluate(() => document.getElementById("confirmBtn").click());
    await p.waitForFunction(() => !document.getElementById("lab").hidden && !document.getElementById("svOffer").hidden, { timeout: 60000 }); await wait(1500);
  };
  await build(OLD);
  ok(await p.evaluate(() => document.getElementById("chgCard").hidden), "primo caricamento: niente «cosa è cambiato»");
  ok(await p.evaluate(() => !document.getElementById("svUpd")), "archivio vuoto: nessuna proposta di aggiornamento");
  await p.evaluate(() => { document.getElementById("svName").value = "Marco Bianchi"; document.querySelector('[data-sv="yes"]').click(); }); await wait(1000);
  /* la fotografia salvata finge di essere di sei mesi fa */
  await p.evaluate(() => new Promise(ok => { const r = indexedDB.open("portfolio-os", 1); r.onsuccess = () => { const t = r.result.transaction("analisi", "readwrite"), st = t.objectStore("analisi"); st.getAll().onsuccess = e => { const x = e.target.result[0], six = 182 * 864e5; x.history.forEach(h => { h.at -= six; }); if (x.snap !== x.history[x.history.length - 1]) x.snap.at -= six; x.reviewedAt -= six; st.put(x); }; t.oncomplete = ok; }; }));
  await p.evaluate(() => document.querySelector('.dock [data-go="home"]').click()); await wait(800);
  await build(FULL);
  const opt = await p.evaluate(() => { const s = document.getElementById("svUpd"); return s ? s.options[0].text : null; });
  ok(opt && /Marco Bianchi/.test(opt), "propone di aggiornare «Marco Bianchi»: " + opt);
  await p.evaluate(() => document.querySelector('[data-sv="upd"]').click()); await wait(1500);
  const c = await p.evaluate(() => { const e = document.getElementById("chgCard"); return { hidden: e.hidden, txt: e.innerText, offer: document.getElementById("svOffer").innerText }; });
  ok(!c.hidden, "la scheda «Cosa è cambiato» compare");
  ok(/aggiornato/.test(c.offer), "messaggio: " + c.offer.slice(0, 80));
  ok(/Versato nel frattempo/.test(c.txt) && /Effetto dei mercati/.test(c.txt), "versato e mercati separati");
  console.log("     " + c.txt.split("\n").slice(0, 4).join(" | ").slice(0, 300));
  const L = await p.evaluate(() => window.__saved.list().then(a => a.map(r => ({ n: r.name, h: r.history.length }))));
  ok(L.length === 1 && L[0].h === 2, "nessuna copia, due revisioni: " + JSON.stringify(L));
  await p.evaluate(() => document.getElementById("presentBtn").click()); await wait(500);
  ok((await p.evaluate(() => window.__present.slides()))[1] === "change", "nella presentazione, subito dopo la copertina");
  await p.keyboard.press("ArrowRight"); await wait(700);
  if (SHOT) { await p.screenshot({ path: SHOT.replace(".png", "-pz.png") }); }
  await p.evaluate(() => window.__present.close());
  console.log("     scheda nascosta dopo la presentazione?", await p.evaluate(() => document.getElementById("chgCard").hidden));
  if (SHOT) { await p.evaluate(() => document.getElementById("chgCard").scrollIntoView()); await wait(600); await p.screenshot({ path: SHOT }); }
  ok(!errs.length, "nessun errore nella pagina " + errs.join(" | "));
} catch (e) { console.log("FAIL", e.message); fails++; }
await b.close(); srv.kill();
console.log(fails ? `${fails} FALLITI` : "tutto ok"); process.exit(fails ? 1 : 0);
