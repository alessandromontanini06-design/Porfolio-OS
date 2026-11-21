// Quanta compila il costruttore al posto dell'utente (21/11/2026): «mettimi 80% Nasdaq, 15% oro e 5% obbligazioni».
// Strumento compila_portafoglio (js/ui/importa.js bdQuanta, registrato in guida.js), anche durante la chiamata (Google simulato).
// node test-quanta-costruttore.mjs files/shots
import { spawn } from "node:child_process"; import path from "node:path"; import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || "files/shots", PORT = 5381, wait = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join(import.meta.dirname, "serve.mjs")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" }); await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.evaluateOnNewDocument(() => {
  if (!sessionStorage.getItem("seeded")) { localStorage.clear(); localStorage.setItem("pos-ruolo-v1", "priv"); localStorage.setItem("pos-quanta-chiamata-ok", "1"); sessionStorage.setItem("seeded", "1"); }
  window.__toolResp = [];
  window.WebSocket = class { constructor() { this.readyState = 0; window.__ws = this; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 50); }
    send(x) { const m = JSON.parse(x); if (m.setup) setTimeout(() => this.srv({ setupComplete: {} }), 50); if (m.toolResponse) window.__toolResp.push(...m.toolResponse.functionResponses); }
    srv(o) { this.onmessage && this.onmessage({ data: JSON.stringify(o) }); }
    tool(name, args) { this.srv({ toolCall: { functionCalls: [{ id: "fc" + Math.random().toString(36).slice(2), name, args }] } }); }
    close() { this.readyState = 3; } };
});
await p.setRequestInterception(true);
p.on("request", r => { if (r.url().includes("modo=chiamata")) { r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "auth_tokens/prova", setup: { model: "models/prova" }, minuti: 10 }) }); return; } r.continue(); });
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
const righe = () => p.evaluate(() => [...document.querySelectorAll("#bdRows .bd-row")].map(r => [r.querySelector("input[list]").value, +r.querySelector("input[data-bdw]").value]).filter(x => x[0]));
await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await wait(2000);

/* 1. l'esempio dell'utente */
let r = await p.evaluate(() => window.__guida.compila({ strumenti: [{ cerca: "Nasdaq", peso: 80 }, { cerca: "oro", peso: 15 }, { cerca: "obbligazioni", peso: 5 }] }));
await wait(500);
t("«80% Nasdaq, 15% oro, 5% obbligazioni»: costruttore aperto", r.fatto && await p.evaluate(() => document.getElementById("builder").classList.contains("open")), JSON.stringify(r).slice(0, 300));
t("righe: Nasdaq 100 all'80%, oro fisico al 15%, obbligazioni globali al 5%", JSON.stringify(await righe()) === JSON.stringify([["CSNDX", 80], ["SGLD", 15], ["AGGH", 5]]), JSON.stringify(await righe()));
t("Quanta riceve i nomi scelti per dirli all'utente", /Nasdaq/.test(r.aggiunti[0].scelto) && /Gold/.test(r.aggiunti[1].scelto) && /Aggregate/.test(r.aggiunti[2].scelto) && r.totale_pesi === 100);
t("il riepilogo dice 100% e 3 strumenti riconosciuti", await p.evaluate(() => /Totale 100%/.test(document.getElementById("bdSum").textContent) && /3 strumenti riconosciuti/.test(document.getElementById("bdChecks").textContent)));
await p.screenshot({ path: `${OUT}/quanta-costruttore-1.jpg`, type: "jpeg", quality: 70 });
/* 2. cosa vede Quanta */
r = await p.evaluate(() => window.__guida.cosaVedo());
t("cosa_vedo: righe, pesi e totale del costruttore", r.costruttore && r.costruttore.righe.length === 3 && r.costruttore.righe[0].peso === 80 && /Nasdaq/.test(r.costruttore.righe[0].nome) && r.costruttore.totale_pesi === 100, JSON.stringify(r.costruttore).slice(0, 300));
/* 3. aggiungere senza cancellare, nomi di azioni, ISIN, voci sconosciute */
r = await p.evaluate(() => window.__guida.compila({ sostituisci: false, strumenti: [{ cerca: "oro", peso: 10 }, { cerca: "Apple", peso: 5 }, { cerca: "IE00B4L5Y983", peso: 5 }, { cerca: "xqzv inesistente", peso: 3 }] }));
await wait(400);
const rr = await righe();
t("«aggiungi anche…»: tiene le righe, cambia l'oro al 10%, aggiunge Apple e l'ISIN di MSCI World", rr.length === 5 && rr.find(x => x[0] === "SGLD")[1] === 10 && rr.some(x => /^AAPL/.test(x[0])) && rr.some(x => x[0] === "SWDA"), JSON.stringify(rr));
t("una voce che non c'è torna a Quanta per farla precisare", r.non_trovati.length === 1 && /xqzv/.test(r.non_trovati[0]) && Math.abs(r.totale_pesi - 105) < 0.01 && /riportano a 100%/.test(r.nota), JSON.stringify(r).slice(0, 300));
r = await p.evaluate(() => window.__guida.compila({ strumenti: [{ cerca: "Bund 2,6% 2035", peso: 50 }, { cerca: "S&P 500", peso: 50 }] }));
await wait(400);
t("anche un Bund dal nome e l'S&P 500", r.fatto && /^Bund 2,6%/.test(r.aggiunti[0].scelto) && r.aggiunti[1].codice === "CSSPX", JSON.stringify(r.aggiunti));
r = await p.evaluate(() => window.__guida.compila({ strumenti: [] }));
t("senza strumenti: errore chiaro", !!r.error);
await p.keyboard.press("Escape"); await p.evaluate(() => { const x = document.querySelector("#builder .x, #closeBuilder"); x && x.click(); }); await wait(400);

/* 4. durante la chiamata: Google chiede lo strumento, la chiamata si riduce e il costruttore si compila */
await p.click("#chatBtn"); await wait(500); await p.click("#chatSend"); await wait(1500);
await p.evaluate(() => window.__ws.tool("compila_portafoglio", { strumenti: [{ cerca: "MSCI World", peso: 70 }, { cerca: "emergenti", peso: 20 }, { cerca: "liquidità", peso: 10 }], capitale: 20000 }));
await p.waitForFunction(() => window.__toolResp.some(x => x.name === "compila_portafoglio"), { timeout: 10000 }).catch(() => {});
const tr = await p.evaluate(() => window.__toolResp.filter(x => x.name === "compila_portafoglio").pop());
t("in chiamata: risposta a Google con gli strumenti scelti", tr && tr.response.result.fatto && tr.response.result.aggiunti.map(x => x.codice).join() === "SWDA,EIMI,XEON", JSON.stringify(tr && tr.response).slice(0, 300));
t("la chiamata si riduce e si vede il costruttore compilato, con il capitale", await p.evaluate(() => document.body.classList.contains("q-mini") && document.getElementById("builder").classList.contains("open") && document.getElementById("bdCap").value === "20000") && JSON.stringify(await righe()) === JSON.stringify([["SWDA", 70], ["EIMI", 20], ["XEON", 10]]), JSON.stringify(await righe()));
await wait(1500); await p.screenshot({ path: `${OUT}/quanta-costruttore-2.jpg`, type: "jpeg", quality: 70 });
await p.evaluate(() => { const x = document.getElementById("qcEnd") || document.querySelector('[data-qc="close"]'); x && x.click(); }); await wait(500);

/* 5. «e analizzalo»: si arriva al laboratorio */
r = await p.evaluate(() => window.__guida.compila({ strumenti: [{ cerca: "Nasdaq", peso: 80 }, { cerca: "oro", peso: 15 }, { cerca: "obbligazioni", peso: 5 }], analizza: true }));
const lab = await p.waitForFunction(() => document.body.dataset.scene === "lab" && !document.getElementById("lab").hidden, { timeout: 120000 }).then(() => true).catch(() => false);
const st = await p.evaluate(() => window.__pos.state());
t("con «analizza» arriva al laboratorio con i 3 strumenti", r.analisi_avviata && lab && (st.assets || []).length === 3, (st.assets || []).join(","));
t("nessun errore JavaScript", !errs.length, errs.join(" | "));
await b.close(); srv.kill();
console.log(`\n${pass} superati, ${fail} falliti`); process.exit(fail ? 1 : 0);
