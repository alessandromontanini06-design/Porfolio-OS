// Portafoglio da screenshot: più immagini, permesso esplicito, lettura (simulata in locale), tabella da correggere, laboratorio con i prezzi veri.
// Le immagini sono inventate: le disegna il test stesso (finta app di un broker) e le salva in files/screenshot/.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const [,, OUT] = process.argv, PORT = +(process.env.TEST_PORT || 5175), wait = ms => new Promise(r => setTimeout(r, ms));
const DIR = import.meta.dirname + "/files/screenshot"; mkdirSync(DIR, { recursive: true });
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
/* due finti screenshot del telefono, sovrapposti (Eni in entrambi) */
const fake = async (name, rows) => { const q = await b.newPage(); await q.setViewport({ width: 390, height: 760, deviceScaleFactor: 2 });
  await q.setContent(`<body style="margin:0;font:15px system-ui;background:#fff;color:#111"><div style="padding:18px"><div style="font-size:13px;color:#888">Portafoglio · esempio inventato</div><div style="font-size:30px;font-weight:700;margin:4px 0 18px">11.423,03 €</div>${rows.map(r => `<div style="display:flex;justify-content:space-between;padding:14px 0;border-bottom:1px solid #eee"><div><b>${r[0]}</b><div style="font-size:12px;color:#888">${r[1]}</div></div><div style="text-align:right"><b>${r[2]} €</b><div style="font-size:12px;color:#888">${r[3]} pz</div></div></div>`).join("")}</div></body>`);
  await q.screenshot({ path: `${DIR}/${name}`, type: "png" }); await q.close(); };
await fake("finta-app-1.png", [["Vanguard FTSE All-World", "IE00BK5BQT80", "5.941,93", "42,5"], ["iShares Core MSCI EM IMI", "ETF", "1.987,20", "60"], ["Eni", "Azione", "1.462,00", "100"]]);
await fake("finta-app-2.png", [["Eni", "Azione", "1.462,00", "100"], ["Apple", "US0378331005", "1.021,40", "5"], ["Bitcoin", "Cripto", "1.010,50", "0,012"]]);
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = [];
p.on("pageerror", e => errs.push(e.message));
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await wait(3500);
t("in home c'è «Carica uno screenshot»", await p.evaluate(() => !!document.getElementById("shotBtn")));
/* nomi come li scrive Trade Republic (senza emittente né ISIN) → strumento del catalogo; elenco + scheda del titolo → una riga sola */
const m = await p.evaluate(async () => { const M = await import("/js/ui/screenshot.js"), c = n => (M.catMatch({ nome: n }) || [null])[0];
  const one = M.mergeRows([{ nome: "Core MSCI World USD (Acc)", valore: 5000 }, { nome: "Core MSCI World USD (Acc)", quantita: 40.5, valore: 5000 }]);
  const cut = M.mergeRows([{ nome: "MSCI Europe Small Cap USD...", valore: 150 }, { nome: "MSCI Europe Small Cap USD (Acc)", quantita: 3 }]);
  return { w: c("Core MSCI World USD (Acc)"), n: c("NASDAQ100 USD (Acc)"), e: c("Core MSCI EM IMI USD (Acc)"), d: c("FTSE All-World USD (Dist)"), a: c("FTSE All-World USD (Acc)"), x: c("Pizzeria da Mario"), one: one.length === 1 && one[0].quantita === 40.5, cut: cut.length === 1 && cut[0].quantita === 3 && cut[0].valore === 150 && !/\.\.\./.test(cut[0].nome) }; });
t("«Core MSCI World USD (Acc)» → SWDA, «NASDAQ100 USD (Acc)» → CSNDX, «Core MSCI EM IMI USD (Acc)» → EIMI", m.w === "SWDA" && m.n === "CSNDX" && m.e === "EIMI", JSON.stringify(m));
t("accumulazione e distribuzione non si confondono (VWCE / VWRL), un nome a caso non trova niente", m.a === "VWCE" && m.d === "VWRL" && m.x === null, JSON.stringify(m));
t("elenco + scheda della posizione: una riga con la quantità", m.one);
t("nome troncato «…USD...» unito al nome intero", m.cut);
await p.click("#shotBtn"); await wait(600);
t("la pagina dello screenshot si apre", await p.evaluate(() => document.getElementById("shotPage").classList.contains("open")));
const inp = await p.$("#shFile"); await inp.uploadFile(`${DIR}/finta-app-1.png`, `${DIR}/finta-app-2.png`); await wait(1500);
t("due miniature", await p.evaluate(() => document.querySelectorAll("#shThumbs .sh-th").length === 2));
t("senza permesso non si può inviare", await p.evaluate(() => document.getElementById("shRead").disabled));
t("le immagini sono rimpicciolite (meno di 1 MB l'una)", await p.evaluate(async () => { const m = await import("/js/ui/screenshot.js"); return m.SH.imgs.every(x => x.data.length < 1_000_000 && x.w <= 1100); }));
await p.click("#shAgree"); await wait(150);
t("con il permesso il pulsante si accende", await p.evaluate(() => !document.getElementById("shRead").disabled));
await p.click("#shRead");
await p.waitForFunction(() => document.querySelectorAll("#shRows tr").length > 0, { timeout: 20000 }).catch(() => {});
t("5 posizioni lette, nella tabella", await p.evaluate(() => document.querySelectorAll("#shRows tr").length === 5));
t("avviso sui doppioni tra immagini", await p.evaluate(() => /una volta/.test(document.getElementById("shWarn").innerText)));
t("riepilogo con il valore letto", await p.evaluate(() => /11\.423 €/.test(document.getElementById("shSum").innerText)), await p.evaluate(() => document.getElementById("shSum").innerText.slice(0, 80)));
/* correzione: il valore di Apple scritto all'italiana */
await p.evaluate(() => { const i = document.querySelector('#shRows input[data-shr="3"][data-shk="valore"]'); i.value = "1.100,00"; i.dispatchEvent(new Event("change", { bubbles: true })); }); await wait(150);
t("correzione all'italiana «1.100,00» letta come 1100", await p.evaluate(async () => (await import("/js/ui/screenshot.js")).SH.rows[3].valore === 1100));
/* una riga vuota aggiunta e lasciata incompleta non blocca */
await p.click("#shAdd"); await wait(150);
t("riga incompleta segnalata, il resto si può analizzare", await p.evaluate(() => /incompleta/.test(document.getElementById("shSum").innerText) && !document.getElementById("shGo").disabled));
await p.screenshot({ path: `${OUT}/shot-1.jpg`, type: "jpeg", quality: 70 });
await p.click("#shGo");
const inLab = await p.waitForFunction(() => (document.body.dataset.scene === "lab" && !document.getElementById("lab").hidden) || document.body.dataset.scene === "map", { timeout: 180000 }).then(() => true).catch(() => false);
const st = await p.evaluate(() => window.__pos.state());
if (process.env.DEBUG) console.log(JSON.stringify(st).slice(0, 1500));
const sc = await p.evaluate(() => document.body.dataset.scene + " lab nascosto:" + document.getElementById("lab").hidden);
t("dalle posizioni al laboratorio", inLab && st.rebuilt, sc);
t("5 strumenti con prezzi di mercato (ETF, azioni, cripto)", (st.assets || []).length === 5, (st.assets || []).join(","));
await wait(2500);
t("nei Risultati c'è «Metti nel mio patrimonio»", await p.evaluate(() => { const b = document.getElementById("pmOfferBtn"); return !!b && b.offsetParent !== null; }));
await p.evaluate(() => document.getElementById("pmOfferBtn").click());
const pm = await p.waitForFunction(() => { try { const d = JSON.parse(localStorage.getItem("pos-patrimonio-v1") || "{}"); return d.operazioni && d.operazioni.length >= 5 ? d.operazioni.length : 0; } catch { return 0; } }, { timeout: 60000 }).then(h => h.jsonValue()).catch(() => 0);
t("lo screenshot diventa il patrimonio (5 posizioni di oggi)", pm >= 5, String(pm));
await wait(1500); await p.screenshot({ path: `${OUT}/shot-2.jpg`, type: "jpeg", quality: 70 });
t("nessun errore JavaScript", !errs.length, errs.join(" | "));
console.log(`\n${pass} superati, ${fail} falliti`);
await b.close(); srv.kill(); process.exit(fail ? 1 : 0);
