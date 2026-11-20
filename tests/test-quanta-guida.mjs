// Quanta guida del sito: mostra_sul_sito (anello lime + nota, pagina giusta), apri_strumento, cosa_vedo, vai_a allo Studio;
// in chiamata la schermata si riduce a una pillola, il sito resta usabile, Quanta riceve la pagina a ogni cambio, «Ingrandisci» torna a tutto schermo.
// Google e il microfono sono simulati come in test-chiamata (WebSocket finto window.__ws).
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const [,, OUT] = process.argv, PORT = 5314, wait = ms => new Promise(r => setTimeout(r, ms));
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
await wait(1500);
const db = { v: 1, strumenti: { IE00B4L5Y983: { nome: "iShares Core MSCI World", ticker: "SWDA", isin: "IE00B4L5Y983", simbolo: "IWDA.AMS", valuta: "EUR" } },
  operazioni: [{ id: "a1", data: "2024-02-01", tipo: "acquisto", strumento: "IE00B4L5Y983", quantita: 100, prezzo: 85 }] };
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true,
  args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage(); await p.setViewport({ width: +(process.env.W || 1440), height: +(process.env.W || 1440) < 700 ? 844 : 900 }); const errs = [];
p.on("pageerror", e => errs.push(e.message));
await p.evaluateOnNewDocument(d => {
  if (!sessionStorage.getItem("seeded")) { localStorage.clear(); localStorage.setItem("pos-patrimonio-v1", d); localStorage.setItem("pos-ruolo-v1", "pro"); localStorage.setItem("pos-quanta-chiamata-ok", "1"); sessionStorage.setItem("seeded", "1"); }
  window.__wsLog = []; window.__toolResp = [];
  window.WebSocket = class { constructor(url) { this.readyState = 0; window.__ws = this; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 50); }
    send(x) { const m = JSON.parse(x); window.__wsLog.push(m); if (m.setup) setTimeout(() => this.srv({ setupComplete: {} }), 50); if (m.toolResponse) window.__toolResp.push(...m.toolResponse.functionResponses); }
    srv(o) { this.onmessage && this.onmessage({ data: JSON.stringify(o) }); }
    said(t) { this.srv({ serverContent: { inputTranscription: { text: t } } }); }
    turn(t) { this.srv({ serverContent: { outputTranscription: { text: t } } }); this.srv({ serverContent: { turnComplete: true } }); }
    tool(name, args) { this.srv({ toolCall: { functionCalls: [{ id: "fc" + Math.random().toString(36).slice(2), name, args }] } }); }
    close() { this.readyState = 3; } };
}, JSON.stringify(db));
await p.setRequestInterception(true);
p.on("request", r => { if (r.url().includes("modo=chiamata")) { r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "auth_tokens/prova", setup: { model: "models/prova" }, minuti: 10 }) }); return; } r.continue(); });
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
const shot = async n => { if (OUT) await p.screenshot({ path: path.join(OUT, `guida-${n}.png`) }); };
const scene = () => p.evaluate(() => document.body.dataset.scene);
const ring = () => p.evaluate(() => { const r = document.querySelector(".q-hl"); return r ? { nota: r.innerText, box: r.getBoundingClientRect().toJSON() } : null; });
const lastResp = name => p.evaluate(n => { const r = window.__toolResp.filter(x => x.name === n).pop(); return r && r.response.result; }, name);

await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await wait(2000);

/* 1. strumenti diretti */
let r = await p.evaluate(() => window.__guida.mostra({ cosa: "carica_file", nota: "Premi qui e scegli il file della banca" }));
await wait(900);
let rg = await ring();
t("mostra_sul_sito: illumina il punto con la nota scelta da Quanta", r.fatto && rg && /Premi qui e scegli il file/.test(rg.nota), JSON.stringify({ r, rg }));
t("l'anello sta sopra il riquadro del file", await p.evaluate(() => { const a = document.querySelector(".q-hl").getBoundingClientRect(), d = document.getElementById("drop").getBoundingClientRect(); return Math.abs(a.left + 8 - d.left) < 3 && Math.abs(a.width - 16 - d.width) < 3; }));
await shot("anello");
r = await p.evaluate(() => window.__guida.mostra({ cosa: "rendimento_reale" }));
t("senza laboratorio spiega cosa fare prima", !!r.error && /carica_file|costruisci_portafoglio/.test(r.error));
r = await p.evaluate(() => window.__guida.mostra({ cosa: "inventato" }));
t("un punto sconosciuto viene rifiutato con l'elenco", !!r.error && /carica_file/.test(r.error));
r = await p.evaluate(() => window.__guida.mostra({ cosa: "patrimonio_grafico" })); await wait(900);
t("mostra_sul_sito cambia pagina da solo (Patrimonio)", r.fatto && await scene() === "patrimonio" && !!(await ring()), JSON.stringify(r));
r = await p.evaluate(() => window.__guida.cosaVedo());
t("cosa_vedo: pagina, titolo e numeri visibili", r.pagina === "Patrimonio" && /patrimonio/i.test(r.titolo) && r.numeri_visibili.length >= 1 && r.ruolo === "pro", JSON.stringify(r).slice(0, 300));
r = await p.evaluate(() => window.__guida.apri({ cosa: "costruttore" })); await wait(500);
t("apri_strumento apre il costruttore", r.fatto && await p.evaluate(() => document.getElementById("builder").classList.contains("open")));
r = await p.evaluate(() => window.__guida.cosaVedo());
t("cosa_vedo sa che il costruttore è aperto", r.pannelli_aperti.includes("costruttore"));
await p.keyboard.press("Escape"); await p.evaluate(() => { const x = document.querySelector("#builder .x, #closeBuilder"); x && x.click(); }); await wait(400);
r = await p.evaluate(() => window.__guida.apri({ cosa: "profilo_cliente" }));
t("profilo del cliente senza laboratorio: rifiutato", !!r.error);

/* 2. in chiamata: la chiamata si riduce e Quanta guida */
await p.evaluate(() => document.querySelector('.dock [data-go="home"]').click()); await wait(800);
await p.click("#chatBtn"); await wait(400); await p.click("#chatSend");
await p.waitForFunction(() => document.getElementById("qCall").dataset.st === "listening", { timeout: 8000 }).catch(() => {}); await wait(500);
t("la chiamata parte a tutto schermo con il pulsante «Riduci»", await p.evaluate(() => !document.getElementById("qCall").hidden && !document.getElementById("qCall").classList.contains("mini") && !!document.getElementById("qcMin")));
await p.evaluate(() => { window.__ws.said("come carico il file della banca?"); window.__ws.tool("mostra_sul_sito", { cosa: "carica_file", nota: "Premi qui" }); }); await wait(1400);
t("quando Quanta indica un punto la chiamata si riduce a una pillola", await p.evaluate(() => document.getElementById("qCall").classList.contains("mini") && document.body.classList.contains("q-mini") && !document.body.classList.contains("q-calling")));
t("lo strumento risponde a Quanta", (await lastResp("mostra_sul_sito") || {}).fatto === true);
t("la pillola è piccola e in basso, la chat si chiude e il sito resta libero", await p.evaluate(() => { const r = document.getElementById("qCall").getBoundingClientRect(); return r.height < 90 && r.bottom > innerHeight - 60 && r.width <= 470 && !document.getElementById("chat").classList.contains("open"); }));
await shot("pillola");
await p.evaluate(() => { window.__ws.said("portami allo studio"); window.__ws.tool("vai_a", { pagina: "studio" }); }); await wait(1200);
t("vai_a porta allo Studio durante la chiamata", await scene() === "studio" && (await lastResp("vai_a") || {}).fatto === true);
const ctx = await p.evaluate(() => window.__wsLog.filter(m => m.clientContent).map(m => m.clientContent.turns[0].parts[0].text));
t("a ogni cambio di pagina Quanta riceve una nota con la pagina", ctx.some(x => /pagina «studio»/.test(x)) && ctx.every(x => /non rispondere/.test(x)), JSON.stringify(ctx));
await p.evaluate(() => { window.__ws.tool("mostra_sul_sito", { cosa: "studio_modelli" }); }); await wait(1300);
t("Quanta indica proprio la sezione dei portafogli modello", (await lastResp("mostra_sul_sito") || {}).fatto === true && await p.evaluate(() => { const a = document.querySelector(".q-hl").getBoundingClientRect(), m = document.getElementById("stModelli").getBoundingClientRect(); return Math.abs(a.top + 8 - m.top) < 3 && Math.abs(a.height - 16 - m.height) < 3; }));
await shot("studio");
await p.click("#qcMax"); await wait(400);
t("«Ingrandisci» torna a tutto schermo", await p.evaluate(() => !document.getElementById("qCall").classList.contains("mini") && document.body.classList.contains("q-calling")));
await p.click("#qcMin"); await wait(300);
t("«Riduci» a mano", await p.evaluate(() => document.getElementById("qCall").classList.contains("mini")));
await p.keyboard.press("Escape"); await wait(300);
t("Esc non chiude la chiamata ridotta (si sta usando il sito)", await p.evaluate(() => !document.getElementById("qCall").hidden));
await p.click("#qcEnd"); await wait(600);
t("la X chiude la chiamata e toglie la pillola", await p.evaluate(() => document.getElementById("qCall").hidden && !document.body.classList.contains("q-mini") && !document.getElementById("qCall").classList.contains("mini")));
t("nessun errore JavaScript", errs.length === 0, errs.join(" | "));
await b.close(); srv.kill();
console.log(`\n${pass} superati, ${fail} falliti`);
process.exit(fail ? 1 : 0);
