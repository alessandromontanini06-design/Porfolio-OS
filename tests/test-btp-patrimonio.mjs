// Patrimonio con BTP a tasso fisso: il prezzo è stimato dalla curva della Banca d'Italia e allineato all'ultimo prezzo scritto dall'utente;
// i BTP indicizzati restano al prezzo scritto; un file con BTP entra nel patrimonio come obbligazioni; «Analizza nel laboratorio» porta anche i BTP.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const [,, OUT] = process.argv, PORT = +(process.env.TEST_PORT || 5182), wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
const { POS } = await import(new URL("../js/engine.js", import.meta.url));
const C = JSON.parse(fs.readFileSync(import.meta.dirname + "/files/bdi-curva.json", "utf-8"));
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const db = { v: 1, creato: "2024-01-01T00:00:00Z",
  strumenti: {
    IT0005383309: { nome: "BTP 1,35% 01/04/2030", isin: "IT0005383309", valuta: "EUR", per100: true, classe: "Obbligazioni", cedola: 0.0135, scadenza: "2030-04-01", freq: 2, governativo: true },
    IT0005497000: { nome: "BTP Italia 1,6% 28/06/2030", isin: "IT0005497000", valuta: "EUR", per100: true, classe: "Obbligazioni", cedola: 0.016, scadenza: "2030-06-28", freq: 2, governativo: true },
    IE00B4L5Y983: { nome: "iShares Core MSCI World", ticker: "SWDA", isin: "IE00B4L5Y983", simbolo: "IWDA.AMS", valuta: "EUR" } },
  operazioni: [
    { id: "a1", data: "2024-01-15", tipo: "acquisto", strumento: "IT0005383309", quantita: 10000, prezzo: 90.10 },
    { id: "a2", data: "2024-06-10", tipo: "acquisto", strumento: "IT0005497000", quantita: 3000, prezzo: 99.50 },
    { id: "a3", data: "2024-01-15", tipo: "acquisto", strumento: "IE00B4L5Y983", quantita: 50, prezzo: 85.20 }] };
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = [];
p.on("pageerror", e => errs.push(e.message));
await p.evaluateOnNewDocument(d => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("pos-patrimonio-v1", d); sessionStorage.setItem("seeded", "1"); } }, JSON.stringify(db));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" });
await p.waitForFunction(() => /su 100/.test((document.getElementById("pmPos") || {}).innerText || "") && /stimato/.test(document.getElementById("pmPos").innerText), { timeout: 60000 }).catch(() => {});
const pos = () => p.evaluate(() => document.getElementById("pmPos").innerText);
const row = (_, nome) => (ROWS.find(l => l.includes(nome)) || "");
let ROWS = [];
const readRows = async () => { ROWS = await p.evaluate(() => [...document.querySelectorAll("#pmPos tbody tr")].map(tr => tr.innerText.replace(/\s+/g, " "))); };
const num = s => +String(s).replace(/\./g, "").replace(",", ".");
let T = await pos(); await readRows();
/* stima attesa: allineata al prezzo d'acquisto 90,10 del 15/01/2024, con i tassi del 30/10/2026 alla data di oggi */
const bb = { cedola: 0.0135, scadenza: "2030-04-01" }, sp = POS.btpSpread(bb, C, "2024-01-15", 90.10), today = new Date().toISOString().slice(0, 10);
const atteso = POS.btpSerie(bb, C, { spread: sp, oggi: today }).prezzi.at(-1).v;
const r1 = row(T, "BTP 1,35%"), px1 = num((r1.match(/([\d.]+,\d{2}) su 100/) || [])[1]);
t("BTP a tasso fisso: prezzo stimato, con i tassi della Banca d'Italia", /stimato con i tassi del 30\/10\/2026 \(Banca d'Italia\)/.test(r1), r1);
t(`il prezzo è la stima allineata all'acquisto (${atteso.toFixed(2)})`, Math.abs(px1 - atteso) < 0.006, `${px1} contro ${atteso}`);
t("il prezzo non è più quello dell'acquisto (90,10): si è mosso con i tassi", Math.abs(px1 - 90.10) > 0.5, px1);
const r2 = row(T, "BTP Italia");
t("il BTP Italia (indicizzato) resta al prezzo scritto: 99,50", /99,50 su 100/.test(r2) && /il tuo prezzo/.test(r2), r2);
const cap = await p.evaluate(() => [...document.querySelectorAll("#pmPos .caption")].map(e => e.innerText).join(" "));
t("didascalia: stima dalla Banca d'Italia e le altre obbligazioni al prezzo scritto", /stimato[^]*Banca d'Italia/.test(cap) && /BTP indicizzati, CCT/.test(cap), cap);
const val = await p.evaluate(() => JSON.parse(localStorage.getItem("pos-patrimonio-v1")).operazioni.length);
/* «Aggiorna prezzo» con il prezzo vero: la stima si riallinea a quello */
await p.evaluate(() => { const x = [...document.querySelectorAll("[data-pmbpx]")].find(b => b.dataset.pmbpx === "IT0005383309"); x.scrollIntoView({ block: "center" }); x.click(); }); await wait(500);
const f = await p.evaluate(() => { const i = document.querySelector('#pmForm input[name="bpx"]'); return !!i; });
if (f) {
  await p.evaluate(() => { const fm = document.getElementById("pmForm"); fm.querySelector('input[name="bpx"]').value = "93,40"; const d = fm.querySelector('input[name="data"]'); if (d) d.value = new Date().toISOString().slice(0, 10); fm.requestSubmit ? fm.requestSubmit() : fm.submit(); });
  await p.waitForFunction(() => /93,40 su 100/.test(document.getElementById("pmPos").innerText), { timeout: 30000 }).catch(() => {});
}
T = await pos(); await readRows();
t("«Aggiorna prezzo» a 93,40 oggi: il BTP vale 93,40", f && /93,40 su 100/.test(row(T, "BTP 1,35%")), row(T, "BTP 1,35%"));
const lab = await p.evaluate(() => !document.getElementById("pmLab").disabled);
t("«Analizza nel laboratorio» è attivo", lab);
await p.screenshot({ path: `${OUT}/btp-patrimonio.jpg`, type: "jpeg", quality: 72 });
await p.click("#pmLab");
await p.waitForFunction(() => window.__pos.state().rebuilt && (window.__pos.state().assets || []).length >= 2, { timeout: 180000 }).catch(() => {});
const st = await p.evaluate(() => window.__pos.state());
t("nel laboratorio arrivano SWDA e il BTP a tasso fisso (non il BTP Italia)", (st.assets || []).some(a => /^BTP 1,35% apr 2030/.test(a)) && (st.assets || []).length === 2, JSON.stringify(st.assets));

/* aggiungere un BTP a mano: il campo propone i BTP del MEF; sceglierne uno compila cedola e scadenza esatte */
const pa = await b.newPage(); await pa.setViewport({ width: 1440, height: 900 }); pa.on("pageerror", e => errs.push(e.message));
await pa.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" });
await pa.waitForFunction(() => document.body.dataset.scene === "patrimonio", { timeout: 30000 }).catch(() => {});
await pa.evaluate(() => document.querySelector('[data-pmt="btp"]').click()); await wait(300);
await pa.evaluate(() => { const s = document.getElementById("pmBtpSel"); if (s && s.value) { s.value = ""; s.dispatchEvent(new Event("change", { bubbles: true })); } }); await wait(300);
await pa.waitForFunction(() => document.querySelectorAll("#pmBtpList option").length > 100, { timeout: 15000 }).catch(() => {});
const nOpt = await pa.evaluate(() => document.querySelectorAll("#pmBtpList option").length);
t("«Nome o ISIN» propone i BTP in circolazione (elenco del MEF)", nOpt >= 100, nOpt);
const opt = await pa.evaluate(() => [...document.querySelectorAll("#pmBtpList option")].map(o => o.value).find(v => /IT0005722845/.test(v)));
const setF = (n, v) => pa.evaluate((n, v) => { const i = document.querySelector(`#pmForm [name=${n}]`); i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); }, n, v);
await setF("bnome", opt); await wait(400);
const f1 = await pa.evaluate(() => ({ c: document.querySelector("#pmForm [name=bcpn]").value, m: document.querySelector("#pmForm [name=bmat]").value, h: document.getElementById("pmBtpHint").textContent }));
t("scelto «BTP 3,35% 15/09/2033 · IT0005722845»: cedola 3,35 e scadenza 15/09/2033", f1.c === "3,35" && f1.m === "2033-09-15" && /prezzo stimato/.test(f1.h), JSON.stringify(f1));
await setF("bnom", "5.000"); await setF("bpx", "99,10"); await setF("data", "2026-09-01");
await pa.evaluate(() => document.getElementById("pmForm").requestSubmit()); await wait(1500);
const Dm = await pa.evaluate(() => JSON.parse(localStorage.getItem("pos-patrimonio-v1")));
const Sm = Dm.strumenti.IT0005722845;
t("salvato con il nome pulito, l'ISIN, cedola e scadenza", !!Sm && Sm.nome === "BTP 3,35% 15/09/2033" && Sm.isin === "IT0005722845" && Math.abs(Sm.cedola - 0.0335) < 1e-9 && Sm.scadenza === "2033-09-15", JSON.stringify(Sm));
await pa.waitForFunction(() => [...document.querySelectorAll("#pmPos tbody tr")].some(tr => /BTP 3,35% 15\/09\/2033/.test(tr.innerText) && /stimato con i tassi/.test(tr.innerText)), { timeout: 30000 }).catch(() => {});
t("e ha subito il prezzo stimato", await pa.evaluate(() => [...document.querySelectorAll("#pmPos tbody tr")].some(tr => /BTP 3,35% 15\/09\/2033/.test(tr.innerText) && /stimato con i tassi/.test(tr.innerText))));
/* solo l'ISIN di un BTP Italia: lo riconosce e avvisa che il prezzo resta quello scritto */
await pa.evaluate(() => document.querySelector('[data-pmt="btp"]').click()); await wait(300);
await pa.evaluate(() => { const s = document.getElementById("pmBtpSel"); if (s && s.value) { s.value = ""; s.dispatchEvent(new Event("change", { bubbles: true })); } }); await wait(300);
await setF("bnome", "IT0005497000");
await pa.waitForFunction(() => /cedole cambiano/.test(document.getElementById("pmBtpHint").textContent), { timeout: 20000 }).catch(() => {});
const f2 = await pa.evaluate(() => ({ v: document.querySelector("#pmForm [name=bnome]").value, h: document.getElementById("pmBtpHint").textContent, m: document.querySelector("#pmForm [name=bmat]").value }));
t("ISIN di un BTP Italia: nome completato, scadenza, e «il prezzo resta quello che scrivi»", /BTP 1,6% 28\/06\/2030/.test(f2.v) && /cedole cambiano/.test(f2.h) && f2.m === "2030-06-28", JSON.stringify(f2));
await pa.close();

/* dal file al patrimonio: i BTP restano obbligazioni con nominale, cedola e scadenza */
const p2 = await b.newPage(); await p2.setViewport({ width: 1440, height: 900 }); p2.on("pageerror", e => errs.push(e.message));
await p2.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await p2.evaluate(() => { localStorage.removeItem("pos-patrimonio-v1"); localStorage.setItem("pos-save", "0"); });
await p2.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" });
await (await p2.$("#file")).uploadFile(import.meta.dirname + "/files/fixture/movimenti-btp.csv");
await p2.waitForFunction(() => window.__pos.state().rebuilt, { timeout: 180000 }).catch(() => {});
await p2.evaluate(() => document.querySelector('.dock [data-go="map"]').click()); await wait(1200);
await p2.evaluate(() => { [...document.querySelectorAll("button")].filter(x => /Procedi senza/i.test(x.textContent)).forEach(x => x.click()); }); await wait(400);
await p2.waitForFunction(() => !document.getElementById("confirmBtn").disabled, { timeout: 60000 }).catch(() => {});
await p2.evaluate(() => document.getElementById("confirmBtn").click());
await p2.waitForFunction(() => !document.getElementById("pmOffer").hidden, { timeout: 60000 }).catch(() => {});
await p2.waitForFunction(() => { const x = document.getElementById("pmOfferBtn"); if (!x) return false; x.scrollIntoView({ block: "center" }); const r = x.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === x; }, { timeout: 30000 }).catch(() => {});
await wait(300); await p2.click("#pmOfferBtn").catch(() => {});
await p2.waitForFunction(() => /operazioni aggiunte/.test(document.getElementById("pmTopMsg").textContent), { timeout: 90000 }).catch(() => {});
const D = await p2.evaluate(() => JSON.parse(localStorage.getItem("pos-patrimonio-v1") || "null"));
const S1 = D && D.strumenti.IT0005383309, S3 = D && Object.values(D.strumenti).find(s => /3,35%/.test(s.nome));
t("dal file: BTP 1,35% registrato come obbligazione (nominale, cedola 1,35%, scadenza 2030)", !!S1 && S1.per100 && Math.abs(S1.cedola - 0.0135) < 1e-9 && S1.scadenza === "2030-04-01", JSON.stringify(S1));
t("dal file: BTP 3,35% (senza ISIN) con cedola e scadenza dal nome", !!S3 && S3.per100 && Math.abs(S3.cedola - 0.0335) < 1e-9 && S3.scadenza === "2035-03-01", JSON.stringify(S3));
t("nessun «prezzo di oggi» finto: l'ultimo prezzo pagato resta nell'acquisto", !!D && !D.operazioni.some(o => o.tipo === "valutazione"), JSON.stringify(D && D.operazioni.filter(o => o.tipo === "valutazione")));
await p2.waitForFunction(() => /stimato con i tassi/.test((document.getElementById("pmPos") || {}).innerText || ""), { timeout: 60000 }).catch(() => {});
t("nel patrimonio i BTP del file hanno il prezzo stimato", /stimato con i tassi/.test(await p2.evaluate(() => document.getElementById("pmPos").innerText)));
await p2.screenshot({ path: `${OUT}/btp-patrimonio-file.jpg`, type: "jpeg", quality: 72 });
t("nessun errore JavaScript", !errs.length, errs.join(" | "));
console.log(`\n${pass} superati, ${fail} falliti`);
await b.close(); srv.kill(); process.exit(fail ? 1 : 0);
