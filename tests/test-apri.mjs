// Apertura dall'archivio: subito nel laboratorio, senza passare da scansione e mappa e senza riscaricare i prezzi; «Aggiorna i prezzi» rifà il percorso completo coperto da un avviso.
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
const PORT = 5209, wait = ms => new Promise(r => setTimeout(r, ms)), FILE = import.meta.dirname + "/files/video2/Movimenti_titoli_Bianchi.xlsx";
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
let fails = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; };
try {
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = []; p.on("pageerror", e => errs.push(e.message));
  let prices = 0; p.on("request", r => { if (/\/api\/prices/.test(r.url())) prices++; });
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" });
  await p.evaluate(() => { window.__saved.clear(); localStorage.setItem("pos-save", "1"); });
  await (await p.$("#file")).uploadFile(FILE);
  await p.waitForFunction(() => window.__pos.state().rebuilt && window.__pos.state().tx > 100, { timeout: 150000 });
  await p.evaluate(() => document.querySelector('.dock [data-go="map"]').click()); await wait(1200);
  await p.waitForFunction(() => !document.getElementById("confirmBtn").disabled, { timeout: 60000 });
  await p.evaluate(() => document.getElementById("confirmBtn").click());
  await p.waitForFunction(() => !document.getElementById("lab").hidden && !document.getElementById("realCard").hidden, { timeout: 60000 }); await wait(2000);
  /* una proposta B, che deve tornare uguale riaprendo */
  await p.evaluate(() => { const i = [...document.querySelectorAll('#cmpCard input.cmp-w[data-cp="1"]')].find(x => x.closest("tr").querySelector(".an").textContent.trim() === "IBGS"); i.value = 40; i.dispatchEvent(new Event("change", { bubbles: true })); }); await wait(500);
  await p.evaluate(() => document.querySelector('.dock [data-go="home"]').click()); await wait(800);
  await p.evaluate(() => window.__saved.list().then(L => { /* salva di nuovo con la proposta */ }));
  const L = await p.evaluate(() => window.__saved.list().then(a => a.map(r => ({ id: r.id, fast: !!(r.fast && r.fast.v), n: r.fast && r.fast.rb && r.fast.rb.cols.length, cols: r.fast && r.fast.rb.cols.map(c => c.name).join(","), head: r.fast && r.fast.sheet.aoa[0].join(","), assets: r.assets.join(",") }))));
  ok(L.length === 1 && L[0].fast && L[0].n === 5, "salvato con i dati per riaprirlo subito: " + JSON.stringify(L));
  /* riapertura */
  prices = 0; const scenes = [];
  await p.exposeFunction("__scene", s => scenes.push(s));
  await p.evaluate(() => { const o = new MutationObserver(() => { const a = document.querySelector('.dock [aria-current="true"]'); if (a) window.__scene(a.dataset.go); }); o.observe(document.querySelector(".dock"), { attributes: true, subtree: true }); });
  const t0 = Date.now();
  await p.evaluate(id => window.__saved.open(id), L[0].id);
  await p.waitForFunction(() => !document.getElementById("lab").hidden && !document.getElementById("realCard").hidden, { timeout: 30000 });
  const ms = Date.now() - t0; await wait(1500);
  ok(ms < 6000, `laboratorio pronto in ${(ms / 1000).toFixed(1)} s`);
  ok(!scenes.includes("scan") && !scenes.includes("map"), "nessun passaggio da scansione o mappa: " + [...new Set(scenes)].join(","));
  ok(prices === 0, `nessun prezzo riscaricato (${prices} richieste)`);
  const st = await p.evaluate(() => ({ real: document.getElementById("realCard").innerText.match(/Valore stimato oggi\s*([\d.]+) €/)?.[1], offer: document.getElementById("svOffer").innerText, ibgs: [...document.querySelectorAll('#cmpCard input.cmp-w[data-cp="1"]')].find(x => x.closest("tr").querySelector(".an").textContent.trim() === "IBGS")?.value }));
  ok(/156\.194/.test(st.real || ""), "stessi numeri: " + st.real);
  ok(/Aperto dall'archivio/.test(st.offer) && /Aggiorna i prezzi/.test(st.offer), "avviso con «Aggiorna i prezzi»");
  ok(st.ibgs === "40", "la proposta B è tornata com'era (IBGS 40%)");
  const H1 = await p.evaluate(() => window.__saved.list().then(a => a[0].history.length));
  /* aggiornamento dei prezzi: percorso completo, coperto, finisce nel laboratorio */
  scenes.length = 0;
  await p.evaluate(() => document.querySelector('[data-sv="refresh"]').click()); await wait(500);
  ok(await p.evaluate(() => { const e = document.getElementById("svBusy"); return e && !e.hidden; }), "durante l'aggiornamento c'è l'avviso «Aggiorno i prezzi…»");
  await p.waitForFunction(() => !document.getElementById("lab").hidden && !document.getElementById("realCard").hidden && document.getElementById("svBusy").hidden, { timeout: 150000 }); await wait(1500);
  ok(prices > 0, `prezzi riscaricati (${prices} richieste)`);
  ok(/è nell'archivio/.test(await p.evaluate(() => document.getElementById("svOffer").innerText)), "dopo l'aggiornamento la revisione si salva");
  ok(!errs.length, "nessun errore nella pagina " + errs.join(" | "));
} catch (e) { console.log("FAIL", e.message); fails++; }
await b.close(); srv.kill();
console.log(fails ? `${fails} FALLITI` : "tutto ok"); process.exit(fails ? 1 : 0);
