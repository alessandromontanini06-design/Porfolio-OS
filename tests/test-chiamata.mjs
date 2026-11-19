// Chiamata con Quanta (Gemini Live): il pulsante tondo apre la chiamata a tutto schermo, permesso la prima volta, microfono
// mandato a 16 kHz, voce di Quanta riprodotta, strumenti eseguiti nel browser, operazione salvata SOLO con un «sì» vero
// (o con «Conferma» sullo schermo), muto, fine chiamata con la trascrizione nella chat, ripiego se la chiamata non parte.
// Google e il microfono sono simulati: WebSocket finto (window.__ws) e microfono finto di Chrome.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const [,, OUT = import.meta.dirname + "/files/shots"] = process.argv, PORT = +(process.env.TEST_PORT || 5207), wait = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
await wait(1500);
const db = { v: 1, strumenti: { IE00B4L5Y983: { nome: "iShares Core MSCI World", ticker: "SWDA", isin: "IE00B4L5Y983", simbolo: "IWDA.AMS", valuta: "EUR" } },
  operazioni: [{ id: "a1", data: "2024-02-01", tipo: "acquisto", strumento: "IE00B4L5Y983", quantita: 100, prezzo: 85 }] };
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true,
  args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = [];
p.on("pageerror", e => errs.push(e.message));
await p.evaluateOnNewDocument(d => {
  if (!sessionStorage.getItem("seeded")) { localStorage.clear(); localStorage.setItem("pos-patrimonio-v1", d); sessionStorage.setItem("seeded", "1"); }
  window.__wsLog = []; window.__toolResp = [];
  const pcm = btoa(String.fromCharCode(...new Uint8Array(9600)));
  window.WebSocket = class { constructor(url) { this.url = url; this.readyState = 0; window.__ws = this; window.__wsUrl = url; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 50); }
    send(x) { const m = JSON.parse(x); window.__wsLog.push(m);
      if (m.setup) setTimeout(() => this.srv({ setupComplete: {} }), 50);
      if (m.realtimeInput && /appena iniziata/.test(m.realtimeInput.text || "")) setTimeout(() => this.turn("Ciao, sono **Quanta**. Come posso aiutarti?"), 50);
      if (m.toolResponse) window.__toolResp.push(...m.toolResponse.functionResponses); }
    srv(o) { this.onmessage && this.onmessage({ data: JSON.stringify(o) }); }
    said(t) { this.srv({ serverContent: { inputTranscription: { text: t } } }); }
    turn(t) { this.srv({ serverContent: { outputTranscription: { text: t } } }); this.srv({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: pcm } }] } } }); this.srv({ serverContent: { turnComplete: true } }); }
    tool(name, args) { this.srv({ toolCall: { functionCalls: [{ id: "fc" + Math.random().toString(36).slice(2), name, args }] } }); }
    close() { this.readyState = 3; window.__wsClosed = true; } };
}, JSON.stringify(db));
let tokenFail = false; const tokenReq = [];
await p.setRequestInterception(true);
p.on("request", r => {
  if (r.url().includes("modo=chiamata")) { tokenReq.push(JSON.parse(r.postData() || "{}"));
    r.respond(tokenFail ? { status: 503, contentType: "application/json", body: JSON.stringify({ error: "La chiamata non è disponibile ora." }) }
      : { status: 200, contentType: "application/json", body: JSON.stringify({ token: "auth_tokens/prova", setup: { model: "models/gemini-3.8-live" }, minuti: 10 }) }); return; }
  r.continue();
});
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
const ops = () => p.evaluate(() => JSON.parse(localStorage.getItem("pos-patrimonio-v1")).operazioni);
const ws = (fn, ...a) => p.evaluate((fn, a) => window.__ws[fn](...a), fn, a);
const lastResp = name => p.evaluate(n => { const r = window.__toolResp.filter(x => x.name === n).pop(); return r && r.response.result; }, name);
const st = () => p.evaluate(() => document.getElementById("qCall").dataset.st);

await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" }); await wait(2000);
await p.click("#chatBtn"); await wait(500);
t("il pulsante tondo e il suggerimento propongono la chiamata", await p.evaluate(() => document.getElementById("chatSend").getAttribute("aria-label") === "Chiama Quanta" && /Chiama Quanta/.test(document.getElementById("chatSugg").innerText)));
/* 1. permesso la prima volta */
await p.click("#chatSend"); await wait(400);
t("la prima volta spiega che la voce va a Google e chiede il permesso", await p.evaluate(() => !document.getElementById("qCall").hidden && !document.getElementById("qcConsent").hidden && /Gemini Live/.test(document.getElementById("qcConsent").innerText)) && tokenReq.length === 0);
await p.click("#qcConsentNo"); await wait(300);
t("«Non ora» chiude senza collegarsi", await p.evaluate(() => document.getElementById("qCall").hidden) && tokenReq.length === 0);
await p.click("#chatSend"); await wait(300); await p.click("#qcConsentOk");
await p.waitForFunction(() => document.getElementById("qCall").dataset.st === "listening" || document.getElementById("qCall").dataset.st === "speaking", { timeout: 8000 }).catch(() => {});
await wait(800);
/* 2. collegamento */
t("biglietto chiesto al server con il contesto (patrimonio)", tokenReq.length === 1 && /patrimonio salvato/.test(tokenReq[0].context || ""), JSON.stringify(tokenReq[0] || {}).slice(0, 160));
t("collegamento a Gemini Live con il biglietto, mai con la chiave", await p.evaluate(() => /BidiGenerateContentConstrained\?access_token=auth_tokens%2Fprova$/.test(window.__wsUrl) && !/key=/.test(window.__wsUrl)));
t("prima il setup, poi il saluto", await p.evaluate(() => !!window.__wsLog[0].setup && window.__wsLog.some(m => m.realtimeInput && /appena iniziata/.test(m.realtimeInput.text || ""))));
await wait(700);
const mic = await p.evaluate(() => window.__wsLog.filter(m => m.realtimeInput && m.realtimeInput.audio));
t(`il microfono parte a 16 kHz (${mic.length} pezzi da 0,1 s)`, mic.length >= 3 && mic.every(m => m.realtimeInput.audio.mimeType === "audio/pcm;rate=16000" && m.realtimeInput.audio.data.length > 4000), mic.length && mic[0].realtimeInput.audio.mimeType);
t("il saluto di Quanta compare nei sottotitoli, senza asterischi", await p.evaluate(() => /Ciao, sono Quanta\. Come posso aiutarti\?/.test(document.getElementById("qcCap").innerText) && !/\*/.test(document.getElementById("qcCap").innerText)));
t("nella chiamata c'è la sfera di Quanta (quella che gira)", await p.evaluate(() => { const s = document.getElementById("qcSfera"); return !!s && s.classList.contains("orb") && /rotate\(/.test(s.querySelector(".o1").style.transform); }));
await p.screenshot({ path: `${OUT}/chiamata.jpg`, type: "jpeg", quality: 72 });
/* scrivere durante la chiamata, sottotitoli on/off */
await p.type("#qcText", "quanto ho guadagnato in tutto?"); await p.keyboard.press("Enter"); await wait(300);
t("si può scrivere a Quanta durante la chiamata", await p.evaluate(() => window.__wsLog.some(m => m.realtimeInput && m.realtimeInput.text === "quanto ho guadagnato in tutto?") && document.getElementById("qcText").value === ""));
await p.click("#qcCC"); await wait(150);
const ccOff = await p.evaluate(() => document.getElementById("qCall").classList.contains("nocap") && localStorage.getItem("pos-quanta-cc") === "0" && document.getElementById("qcCC").getAttribute("aria-pressed") === "false");
await p.click("#qcCC"); await wait(150);
t("i sottotitoli si spengono e si riaccendono", ccOff && await p.evaluate(() => !document.getElementById("qCall").classList.contains("nocap")));
/* 3. operazione detta a voce, conferma solo con un «sì» vero */
const n0 = (await ops()).length;
await ws("said", "ho comprato 10 SWDA a 98 euro ieri"); await ws("tool", "registra_operazione", { tipo: "acquisto", strumento: "SWDA", quantita: 10, prezzo: 98, data: "ieri" }); await wait(500);
const r1 = await lastResp("registra_operazione");
t("registra_operazione prepara la scheda e lo dice a Quanta (non salvata)", r1 && /NON è salvata/.test(r1.stato), JSON.stringify(r1));
t("la scheda «Da confermare» compare sopra la chiamata", await p.evaluate(() => !document.getElementById("qcOp").hidden && /Da confermare/i.test(document.getElementById("qcOp").innerText) && /10 quote di SWDA a 98,00/.test(document.getElementById("qcOp").innerText)));
await ws("turn", "Hai comprato 10 quote di SWDA a 98 euro ieri. Confermi?"); await wait(300);
await ws("tool", "conferma_operazione", { decisione: "conferma" }); await wait(400);
const r2 = await lastResp("conferma_operazione");
t("senza un «sì» detto dall'utente la conferma viene rifiutata", r2 && /non ha detto sì/.test(r2.error || "") && (await ops()).length === n0, JSON.stringify(r2));
await ws("said", "no aspetta, conferma dopo"); await ws("tool", "conferma_operazione", { decisione: "conferma" }); await wait(400);
t("«no aspetta» non vale come sì", /non ha detto sì/.test((await lastResp("conferma_operazione")).error || "") && (await ops()).length === n0);
await ws("turn", "Va bene, dimmi tu."); await ws("said", "sì, confermo"); await ws("tool", "conferma_operazione", { decisione: "conferma" }); await wait(1500);
const r3 = await lastResp("conferma_operazione"), o = (await ops()).slice(-1)[0];
t("dopo «sì, confermo» l'acquisto è salvato (data di ieri, origine quanta)", r3 && r3.stato === "salvata nel patrimonio" && (await ops()).length === n0 + 1 && o.quantita === 10 && o.prezzo === 98 && o.origine === "quanta", JSON.stringify(r3));
t("la scheda dice «Salvato nel patrimonio»", await p.evaluate(() => /Salvato nel patrimonio/i.test(document.getElementById("qcOp").innerText)));
/* 4. strumenti */
await ws("tool", "patrimonio", {}); await wait(500);
const pm = await lastResp("patrimonio");
t("lo strumento patrimonio risponde durante la chiamata", pm && /€/.test(pm.valore_oggi) && pm.posizioni.length === 1, JSON.stringify(pm).slice(0, 160));
await ws("tool", "rischio_asset", {}); await wait(300);
t("gli strumenti del laboratorio senza laboratorio danno un errore spiegato", /Nessun portafoglio nel laboratorio/.test((await lastResp("rischio_asset")).error || ""));
/* 5. interruzione e muto */
await ws("srv", { serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: await p.evaluate(() => btoa(String.fromCharCode(...new Uint8Array(96000)))) } }] }, outputTranscription: { text: "Allora, il tuo portafoglio" } } }); await wait(200);
/* velocità di rotazione del riflesso (gradi al secondo), misurata due volte a 400 ms di distanza */
const ang = () => p.evaluate(() => { const m = (document.querySelector("#qcSfera .o1").style.transform || "").match(/rotate\(([-\d.]+)deg\)/); return m ? +m[1] : NaN; });
const rate = async () => { const a = await ang(); const t0 = Date.now(); await wait(400); const b = await ang(); return ((b - a + 360) % 360) / ((Date.now() - t0) / 1000); };
const w0 = await p.evaluate(() => document.getElementById("qcSfera").getBoundingClientRect().width);
const s1 = await st(); await wait(1200); const vFast = await rate(); const w1 = await p.evaluate(() => document.getElementById("qcSfera").getBoundingClientRect().width);
await ws("srv", { serverContent: { interrupted: true } }); await wait(2600); const vSlow = await rate();
t(`quando Quanta parla la sfera gira veloce, quando tace gira piano (${Math.round(vFast)}°/s → ${Math.round(vSlow)}°/s)`, vFast > 150 && vSlow < 80 && vSlow > 0, `${vFast} ${vSlow}`);
t("la sfera non cambia grandezza", Math.abs(w1 - w0) < 1, `${w0} ${w1}`);
t("se l'utente interrompe, Quanta si ferma e ascolta", s1 === "speaking" && await st() === "listening", `${s1} → ${await st()}`);
const nMic = await p.evaluate(() => window.__wsLog.filter(m => m.realtimeInput && m.realtimeInput.audio).length);
await p.click("#qcMute"); await wait(600);
const nMic2 = await p.evaluate(() => window.__wsLog.filter(m => m.realtimeInput && m.realtimeInput.audio).length);
t("muto: niente audio mandato e stato «Microfono spento»", await p.evaluate(() => window.__wsLog.some(m => m.realtimeInput && m.realtimeInput.audioStreamEnd)) && nMic2 - nMic <= 3 && await st() === "muted" && await p.evaluate(() => document.getElementById("qcState").textContent === "Microfono spento"));
await p.click("#qcMute"); await wait(400);
/* 6. fine chiamata: trascrizione nella chat */
await p.click("#qcEnd"); await wait(600);
const chat = await p.evaluate(() => document.getElementById("chatLog").innerText.replace(/\s+/g, " "));
t("chiusa: niente schermo, collegamento chiuso, microfono spento", await p.evaluate(() => document.getElementById("qCall").hidden && window.__wsClosed === true));
t("nella chat restano le frasi della chiamata e la durata", /quanto ho guadagnato in tutto\?/.test(chat) && /ho comprato 10 SWDA a 98 euro ieri/.test(chat) && /Ciao, sono Quanta/.test(chat) && /Chiamata con Quanta · 0:\d\d/.test(chat), chat.slice(-400));
/* 7. se la chiamata non parte: ripiego */
tokenFail = true; await p.click("#chatNew"); await wait(200); await p.click("#chatSend"); await wait(1500);
t("se la chiamata non è disponibile lo dice e propone la voce semplice", await p.evaluate(() => document.getElementById("qCall").dataset.st === "error" && /non è disponibile/.test(document.getElementById("qcCap").innerText) && /voce semplice/.test(document.getElementById("qcMsg").innerText)));
await p.evaluate(() => document.querySelector('[data-qc="close"]').click()); await wait(300);
t("«Chiudi» torna alla chat", await p.evaluate(() => document.getElementById("qCall").hidden));
/* 8. telefono */
tokenFail = false; await p.setViewport({ width: 390, height: 844 }); await wait(400);
await p.click("#chatSend"); await wait(1500);
await ws("said", "ho comprato 2 SWDA"); await ws("tool", "registra_operazione", { tipo: "acquisto", strumento: "SWDA", quantita: 2, prezzo: 99, data: "oggi" }); await ws("turn", "Hai comprato 2 quote di SWDA a 99 euro oggi. Confermi?"); await wait(500);
const lay = await p.evaluate(() => { const r = id => document.getElementById(id).getBoundingClientRect(); return { end: r("qcEnd").bottom, mute: r("qcMute").bottom, op: r("qcOp").bottom, h: innerHeight, w: document.documentElement.scrollWidth, iw: innerWidth }; });
t("sul telefono scheda e pulsanti stanno nello schermo", lay.end <= lay.h && lay.op <= lay.end && lay.w <= lay.iw, JSON.stringify(lay));
await p.screenshot({ path: `${OUT}/chiamata-tel.jpg`, type: "jpeg", quality: 72 });
await p.click("#qcEnd"); await wait(300);
t("nessun errore JavaScript", !errs.length, errs.join(" | "));
console.log(`\n${pass} superati, ${fail} falliti`);
await b.close(); srv.kill(); process.exit(fail ? 1 : 0);
