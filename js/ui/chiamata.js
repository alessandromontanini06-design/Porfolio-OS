/* Chiamata con Quanta: voce in tempo reale con Gemini Live, come la modalità voce delle app di IA.
   - Il server dà un biglietto usa e getta (/api/assistant?modo=chiamata) con la configurazione di Quanta bloccata dentro;
     il browser si collega direttamente a Google: microfono a 16 kHz in uscita, voce di Quanta a 24 kHz in entrata.
   - Si può interrompere Quanta parlando; gli strumenti (patrimonio, operazioni, pagine…) girano qui come nella chat.
   - Un'operazione si salva solo con «Conferma» sullo schermo o con un «sì» detto a voce (controllato sulla trascrizione).
   - Alla fine la trascrizione resta nella chat. Se la chiamata non parte, resta la conversazione a voce semplice. */
import { $, S, esc } from "./core.js";
import { trackOnce } from "./importa.js";
import { NO_LAB, Q, TOOLS_LOCAL, chatContext, closeChat, hush, opDecide, opText, openChat, renderChat, talkStart } from "./quanta.js";

const WSS = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=";
const C = { on: false, ws: null, ctx: null, stream: null, node: null, inAn: null, outAn: null, gain: null, next: 0, play: new Set(), muted: false, t0: 0, timer: 0, raf: 0,
  user: "", ai: "", lastUser: "", max: 10, st: "", ready: false, busy: false, lv: 0, ang: 0, vel: 28, last: 0, warned: false };
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
const consentOk = () => { try { return localStorage.getItem("pos-quanta-chiamata-ok") === "1"; } catch { return false; } };
export const callSupported = () => !!(window.WebSocket && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (window.AudioContext || window.webkitAudioContext));
export const callOn = () => C.on;

/* ---------- audio: microfono → PCM 16 kHz; voce di Quanta PCM 24 kHz → altoparlante ---------- */
const WORKLET = `class QCap extends AudioWorkletProcessor{constructor(o){super();this.r=o.processorOptions.rate/16000;this.a=0;this.s=0;this.c=0;this.b=new Int16Array(1600);this.n=0;}
process(i){const ch=i[0]&&i[0][0];if(!ch)return true;for(let k=0;k<ch.length;k++){this.s+=ch[k];this.c++;this.a+=1;if(this.a>=this.r){this.a-=this.r;const v=Math.max(-1,Math.min(1,this.s/this.c));this.s=0;this.c=0;this.b[this.n++]=v*32767;if(this.n===this.b.length){this.port.postMessage(this.b.slice(0));this.n=0;}}}return true;}}
registerProcessor("q-cap",QCap);`;
const toB64 = i16 => { const u = new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = b => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Int16Array(u.buffer, 0, u.length >> 1); };
function sendMic(i16) { if (!C.ready || C.muted || !C.ws || C.ws.readyState !== 1) return; send({ realtimeInput: { audio: { data: toB64(i16), mimeType: "audio/pcm;rate=16000" } } }); }
async function micStart() {
  C.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  const src = C.ctx.createMediaStreamSource(C.stream); C.inAn = C.ctx.createAnalyser(); C.inAn.fftSize = 512; src.connect(C.inAn);
  try {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    await C.ctx.audioWorklet.addModule(url); URL.revokeObjectURL(url);
    C.node = new AudioWorkletNode(C.ctx, "q-cap", { processorOptions: { rate: C.ctx.sampleRate } }); C.node.port.onmessage = e => sendMic(e.data);
    src.connect(C.node);
  } catch {
    /* browser senza AudioWorklet: lo stesso lavoro con ScriptProcessor (vecchio ma ovunque) */
    const sp = C.ctx.createScriptProcessor(4096, 1, 1), r = C.ctx.sampleRate / 16000; let a = 0, s = 0, c = 0, b = [];
    sp.onaudioprocess = e => { const ch = e.inputBuffer.getChannelData(0); for (let k = 0; k < ch.length; k++) { s += ch[k]; c++; a += 1; if (a >= r) { a -= r; b.push(Math.max(-1, Math.min(1, s / c)) * 32767); s = 0; c = 0; } } if (b.length >= 1600) { sendMic(Int16Array.from(b)); b = []; } };
    const mute = C.ctx.createGain(); mute.gain.value = 0; src.connect(sp); sp.connect(mute); mute.connect(C.ctx.destination); C.node = sp;
  }
}
function playPcm(b64, mime) {
  const i16 = fromB64(b64); if (!i16.length) return;
  const rate = +((String(mime).match(/rate=(\d+)/) || [])[1] || 24000), buf = C.ctx.createBuffer(1, i16.length, rate), ch = buf.getChannelData(0);
  for (let i = 0; i < i16.length; i++) ch[i] = i16[i] / 32768;
  const s = C.ctx.createBufferSource(); s.buffer = buf; s.connect(C.gain);
  const at = Math.max(C.ctx.currentTime + 0.04, C.next); s.start(at); C.next = at + buf.duration; C.play.add(s);
  s.onended = () => { C.play.delete(s); if (!C.play.size && C.on) state(C.busy ? "thinking" : "listening"); };
  state("speaking");
}
function flush() { C.play.forEach(s => { try { s.stop(); } catch {} }); C.play.clear(); C.next = 0; }

/* ---------- la sfera di Quanta: sempre della stessa grandezza; gira veloce quando Quanta parla, piano quando ascolta (gradi al secondo) ---------- */
/* in ascolto gira come la sfera della home (un giro ogni 3,2 s); quando parla circa tre volte più veloce */
const SPIN = { speaking: 400, thinking: 260, listening: 112, connecting: 90, muted: 24, error: 0 };
function sferaSpin(deg) { const el = $("#qcSfera"); if (!el) return; const a = el.querySelector(".o1"), b = el.querySelector(".o2");
  if (a) a.style.transform = `rotate(${deg.toFixed(1)}deg)`; if (b) b.style.transform = `rotate(${(-deg * 0.6).toFixed(1)}deg)`; }

/* ---------- interfaccia ---------- */
const LAB = { connecting: "Mi collego…", listening: "Ti ascolto", speaking: "Quanta parla", thinking: "Guardo i numeri…", muted: "Microfono spento", error: "Chiamata non riuscita" };
function state(st) { C.st = st; const box = $("#qCall"); if (!box) return; box.dataset.st = C.muted && st === "listening" ? "muted" : st; $("#qcState").textContent = LAB[box.dataset.st] || ""; }
const clean = t => String(t || "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*/g, "").replace(/\s+/g, " ").trim();
function caption() {
  const el = $("#qcCap"); if (!el) return;
  const ai = clean(C.ai), us = clean(C.user), t = C.st === "speaking" || (ai && !us) ? ai : us, last = t.length > 170 ? "…" + t.slice(-170) : t;
  el.innerHTML = last ? `<span class="${t === us && t !== ai ? "u" : ""}">${esc(last)}</span>` : "";
}
function clock() {
  const s = Math.floor((Date.now() - C.t0) / 1000); $("#qcTime").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  if (!C.warned && s >= C.max * 60 - 60) { C.warned = true; $("#qcNote").textContent = "Manca un minuto: poi la chiamata si chiude (puoi richiamare)."; }
  if (s >= C.max * 60) callEnd(`Chiamata chiusa dopo ${C.max} minuti, il massimo per ora.`);
}
function level(now) {
  const an = C.st === "speaking" ? C.outAn : C.muted ? null : C.inAn; let v = 0;
  if (an) { const d = new Uint8Array(an.fftSize); an.getByteTimeDomainData(d); let sum = 0; for (let i = 0; i < d.length; i++) { const x = (d[i] - 128) / 128; sum += x * x; } v = Math.min(1, Math.sqrt(sum / d.length) * 4); }
  C.lv = C.lv * 0.75 + v * 0.25;
  /* la velocità segue lo stato (accelera e rallenta piano, niente scatti); la grandezza non cambia */
  const st = ($("#qCall") || {}).dataset ? $("#qCall").dataset.st : "listening", dt = C.last ? Math.min(0.05, (now - C.last) / 1000) : 0; C.last = now;
  C.vel += ((SPIN[st] ?? 112) - C.vel) * 0.035; C.ang = (C.ang + C.vel * dt) % 360; sferaSpin(C.ang);
  C.raf = requestAnimationFrame(level);
}
function opRender() {
  const box = $("#qcOp"); if (!box) return;
  const v = [...S.chatView].reverse().find(x => x.k === "op" && (x.st === "wait" || x.st === "saving" || Date.now() - (x.when || 0) < 7000));
  box.hidden = !v; if (!v) { box.innerHTML = ""; return; }
  box.className = `qc-op ${v.st}`;
  box.innerHTML = `<span class="qc-op-h">${v.st === "done" ? "Salvato nel patrimonio" : v.st === "wait" ? "Da confermare: di' «sì» o premi Conferma" : v.st === "saving" ? "Salvo…" : "Non salvato"}</span><b>${esc(opText(v.op))}</b>${v.st === "wait" ? `<span class="qc-op-b"><button type="button" class="btn sm lime" data-opok="${v.id}">Conferma</button><button type="button" class="btn sm" data-opno="${v.id}">Annulla</button></span>` : v.msg ? `<small>${esc(v.msg)}</small>` : ""}`;
  if (v.st !== "wait" && v.st !== "saving") setTimeout(opRender, 7200);
}
/* righe della chiamata nella chat: quello che hai detto e quello che ha risposto Quanta */
function commitUser() { const t = clean(C.user); if (t) { S.chatView.push({ k: "user", t, voce: true }); S.chat.push({ role: "user", text: t }); C.lastUser = t; } C.user = ""; }
function commitAi(cut) { const t = clean(C.ai); if (t) { S.chatView.push({ k: "ai", t: cut ? t + "…" : t }); S.chat.push({ role: "assistant", text: t }); } C.ai = ""; }

/* ---------- strumenti: gli stessi della chat, più la conferma a voce ---------- */
/* sì e no nelle quattro lingue del sito (italiano, inglese, spagnolo, francese) */
const YES = /(^|[^a-zà-ÿ])(s[iìí]|conferm\w*|ok|okay|va bene|salva\w*|certo|esatto|giusto|procedi|yes|yeah|yep|sure|confirm\w*|go ahead|correct|that's right|save it|vale|claro|correcto|adelante|guárdala|oui|ouais|d'accord|exact|vas-y|enregistre\w*)(?![a-zà-ÿ])/,
  NO = /(^|[^a-zà-ÿ])(no|non|annulla\w*|aspetta|lascia|nope|not|don't|cancel\w*|wait|cancela\w*|espera|déjalo|annule\w*|attends|laisse)(?![a-zà-ÿ])/;   /* niente «pas»: «oui, pas de souci» è un sì */
async function runTool(name, a) {
  if (name === "conferma_operazione") {
    const v = [...S.chatView].reverse().find(x => x.k === "op" && x.st === "wait"); if (!v) return { error: "nessuna operazione in attesa di conferma" };
    const yes = a.decisione === "conferma", said = (clean(C.user) || C.lastUser).toLowerCase();
    if (yes && (!YES.test(said) || NO.test(said))) return { error: "l'utente non ha detto sì in modo chiaro: rileggi l'operazione e chiediglielo di nuovo" };
    await opDecide(v, yes); opRender();
    return { stato: v.st === "done" ? "salvata nel patrimonio" : v.st === "no" ? "annullata" : "non salvata", messaggio: v.msg || "" };
  }
  if (!S.lab && !NO_LAB.has(name)) return { error: "Nessun portafoglio nel laboratorio: rispondi in generale, usa il patrimonio se c'è e, se servono numeri del file, invita a caricarlo." };
  const f = TOOLS_LOCAL[name]; if (!f) return { error: "strumento sconosciuto" };
  const r = await f(a); opRender(); return r;
}
async function onTool(tc) {
  C.busy = true; if (!C.play.size) state("thinking"); commitUser();
  const out = [];
  for (const c of tc.functionCalls || []) { let result; try { result = await runTool(c.name, c.args || {}); } catch (e) { result = { error: String(e.message || e) }; } out.push({ id: c.id, name: c.name, response: { result } }); }
  C.busy = false; if (C.on) send({ toolResponse: { functionResponses: out } });
}

/* ---------- connessione ---------- */
const send = o => { if (C.ws && C.ws.readyState === 1) C.ws.send(JSON.stringify(o)); };
async function onMsg(ev) {
  let m; try { m = JSON.parse(typeof ev.data === "string" ? ev.data : await ev.data.text()); } catch { return; }
  if (m.setupComplete) { C.ready = true; state("listening"); send({ realtimeInput: { text: "(La chiamata è appena iniziata: saluta in una frase breve e chiedi come puoi aiutare.)" } }); return; }
  if (m.toolCall) { onTool(m.toolCall); return; }
  if (m.goAway) { C.goAway = true; $("#qcNote").textContent = "La chiamata sta per chiudersi."; return; }
  const sc = m.serverContent; if (!sc) return;
  if (sc.inputTranscription && sc.inputTranscription.text) { C.user += sc.inputTranscription.text; caption(); }
  if (sc.interrupted) { flush(); commitAi(true); state("listening"); caption(); }
  const parts = (sc.modelTurn && sc.modelTurn.parts) || [];
  if (parts.length || (sc.outputTranscription && sc.outputTranscription.text)) { if (C.user) commitUser(); }
  for (const p of parts) if (p.inlineData && /audio/.test(p.inlineData.mimeType || "audio/pcm")) playPcm(p.inlineData.data, p.inlineData.mimeType);
  if (sc.outputTranscription && sc.outputTranscription.text) { C.ai += sc.outputTranscription.text; caption(); }
  if (sc.turnComplete) { commitAi(false); if (!C.play.size) state("listening"); }
}
function fail(msg, offerSimple) {
  const box = $("#qCall"); state("error"); $("#qcCap").innerHTML = `<span>${esc(msg)}</span>`;
  $("#qcMsg").hidden = false;
  $("#qcMsg").innerHTML = `${offerSimple && window.speechSynthesis ? `<button type="button" class="btn lime" data-qc="simple">Usa la voce semplice</button>` : ""}<button type="button" class="btn" data-qc="close">Chiudi</button>`;
  cleanup(); box.dataset.st = "error";
}
function cleanup() {
  C.on = false; C.ready = false; clearInterval(C.timer); cancelAnimationFrame(C.raf);
  try { if (C.ws) { C.ws.onclose = null; C.ws.close(1000); } } catch {} C.ws = null;
  try { C.node && C.node.disconnect(); } catch {} C.node = null;
  if (C.stream) C.stream.getTracks().forEach(t => t.stop()); C.stream = null;
  flush(); if (C.ctx) { C.ctx.close().catch(() => {}); C.ctx = null; }
}

/* perché Google ha chiuso la chiamata: il motivo resta nella chat (prima si perdeva) */
function perche(e) {
  const r = String((e && e.reason) || ""), c = e && e.code;
  if (/quota|exhaust|rate.?limit|exceed|429/i.test(r)) return "la quota gratuita di Google per le chiamate è finita per ora: riprova tra qualche minuto, oppure usa la voce semplice";
  if (C.goAway) return "Google ha chiuso la sessione al termine del tempo disponibile";
  if (c === 1006 || !c) return "la connessione si è interrotta (rete instabile, oppure lo schermo si è spento)";
  return `la chiamata si è interrotta (codice ${c}${r ? `: ${r.slice(0, 140)}` : ""})`;
}
export async function callStart() {
  if (C.on) return;
  if (!callSupported()) { talkStart(); return; }
  const box = $("#qCall"); hush(); if (Q.talk) Q.talk = false;
  box.hidden = false; miniBtns(); C.mini = false; box.classList.remove("mini"); document.body.classList.remove("q-mini"); document.body.classList.add("q-calling");
  $("#qcMsg").hidden = true; $("#qcNote").textContent = ""; $("#qcCap").innerHTML = ""; $("#qcOp").hidden = true; $("#qcTime").textContent = "0:00";
  if (!consentOk()) { $("#qcConsent").hidden = false; state("connecting"); $("#qcState").textContent = "Prima di iniziare"; $("#qcConsentOk").focus(); return; }
  $("#qcConsent").hidden = true;
  /* l'audio va creato subito, dentro il tocco (Safari su iPhone) */
  const AC = window.AudioContext || window.webkitAudioContext; C.ctx = new AC(); C.ctx.resume().catch(() => {});
  C.gain = C.ctx.createGain(); C.outAn = C.ctx.createAnalyser(); C.outAn.fftSize = 512; C.gain.connect(C.outAn); C.outAn.connect(C.ctx.destination);
  C.on = true; C.goAway = false; C.muted = false; C.user = ""; C.ai = ""; C.lastUser = ""; C.warned = false; C.ang = 0; C.vel = SPIN.connecting; C.last = 0; ccUi(); muteUi(); state("connecting"); $("#qcEnd").focus();
  trackOnce("feature", "quanta_chiamata", { name: "quanta_chiamata" });
  try { await micStart(); }
  catch (e) { fail(e && e.name === "NotAllowedError" ? "Per chiamare Quanta permetti l'uso del microfono nelle impostazioni del browser." : "Non riesco ad aprire il microfono.", false); return; }
  if (!C.on) return;
  let j;
  /* il biglietto per la chiamata: se la richiesta si interrompe per strada (Safari: «Load failed», Chrome: «Failed to fetch») si riprova una volta */
  const biglietto = () => fetch("/api/assistant?modo=chiamata", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context: chatContext(), lingua: ({ en: "en", es: "es", fr: "fr" })[document.documentElement.lang] || "it" }), signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined });
  try { let r; try { r = await biglietto(); } catch (e) { if (e.name !== "TypeError" || !C.on) throw e; await new Promise(ok => setTimeout(ok, 1200)); if (!C.on) return; r = await biglietto(); }
    j = await r.json().catch(() => ({})); if (!r.ok || !j.token) throw new Error(j.error || "La chiamata non è disponibile ora."); }
  catch (e) { if (C.on) fail(e.name === "TimeoutError" ? "Il server non ha risposto in tempo." : e.name === "TypeError" ? "Non riesco a raggiungere il server: controlla la connessione e riprova tra qualche secondo." : String(e.message || e), true); return; }
  if (!C.on) return;
  C.max = j.minuti || 10;
  const ws = new WebSocket(WSS + encodeURIComponent(j.token)); C.ws = ws;
  ws.onopen = () => send({ setup: j.setup });
  ws.onmessage = onMsg;
  ws.onerror = () => {};
  ws.onclose = e => { if (!C.on) return; if (!C.ready) fail(`La chiamata non si è aperta${e.reason ? ` (${String(e.reason).slice(0, 120)})` : ""}.`, true); else callEnd(perche(e)); };
  C.t0 = Date.now(); C.timer = setInterval(clock, 1000);
  if (!REDUCE) C.raf = requestAnimationFrame(level);
}
/* chiamata ridotta: una pillola in basso, il sito resta usabile e Quanta continua ad ascoltare (20/11/2026) */
function miniBtns() {
  const top = document.querySelector("#qCall .qc-top"), bar = document.querySelector("#qCall .qc-bar");
  if (top && !$("#qcMin")) top.insertAdjacentHTML("beforeend", `<button type="button" class="qc-round qc-min" id="qcMin" aria-label="Riduci la chiamata e usa il sito" title="Riduci: continua a parlare mentre usi il sito"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 14l6 6 6-6M12 4v15"/></svg></button>`);
  if (bar && !$("#qcMax")) bar.insertAdjacentHTML("afterbegin", `<button type="button" class="qc-round qc-max" id="qcMax" aria-label="Ingrandisci la chiamata" title="Ingrandisci"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 10l6-6 6 6M12 20V5"/></svg></button>`);
}
export function callMini(on) {
  const box = $("#qCall"); if (!box || box.hidden) return; miniBtns(); C.mini = !!on;
  if (C.mini && $("#chat") && $("#chat").classList.contains("open")) closeChat(); /* il pannello della chat coprirebbe il sito: la trascrizione torna nella chat alla fine */
  box.classList.toggle("mini", C.mini); box.setAttribute("aria-modal", String(!C.mini));
  document.body.classList.toggle("q-calling", !C.mini); document.body.classList.toggle("q-mini", C.mini);
}
export const callIsMini = () => !!C.mini;
/* durante la chiamata Quanta sa in che pagina è l'utente: una nota di contesto che non chiede risposta */
document.addEventListener("pos-scena", e => {
  if (!C.on || !C.ready) return;
  send({ clientContent: { turns: [{ role: "user", parts: [{ text: `(Nota del sito, non rispondere: ora l'utente è nella pagina «${e.detail}». Se ti chiede cosa vede usa cosa_vedo.)` }] }], turnComplete: false } });
});
export function callEnd(note) {
  const was = C.on, secs = C.t0 ? Math.round((Date.now() - C.t0) / 1000) : 0;
  if (C.user) commitUser(); if (C.ai) commitAi(C.play.size > 0);
  cleanup();
  C.mini = false; $("#qCall").classList.remove("mini"); document.body.classList.remove("q-mini");
  $("#qCall").hidden = true; document.body.classList.remove("q-calling"); $("#qcConsent").hidden = true; $("#qcMsg").hidden = true;
  if (was && secs > 0) S.chatView.push({ k: "sys", t: `Chiamata con Quanta · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}${note ? ` · ${note}` : ""}` });
  renderChat(); if (was) openChat();
}
const ccOn = () => { try { return localStorage.getItem("pos-quanta-cc") !== "0"; } catch { return true; } };
function ccUi() { const on = ccOn(), b = $("#qcCC"); $("#qCall").classList.toggle("nocap", !on); b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-label", on ? "Nascondi i sottotitoli" : "Mostra i sottotitoli"); }
function sendText() {
  const i = $("#qcText"), t = i.value.trim(); if (!t || !C.ready) return;
  i.value = ""; $("#qcForm").classList.remove("has"); if (C.user) commitUser();
  S.chatView.push({ k: "user", t }); S.chat.push({ role: "user", text: t }); C.lastUser = t;
  $("#qcCap").innerHTML = `<span class="u">${esc(t)}</span>`; send({ realtimeInput: { text: t } });
}
function muteUi() { const b = $("#qcMute"); b.setAttribute("aria-pressed", String(C.muted)); b.setAttribute("aria-label", C.muted ? "Riattiva il microfono" : "Spegni il microfono"); b.classList.toggle("off", C.muted); if (C.st === "listening" || C.st === "muted") state("listening"); }

document.addEventListener("click", e => {
  if (e.target.closest("#qcEnd")) { if (C.on) callEnd(); else callEnd(); return; }
  if (e.target.closest("#qcMin")) { callMini(true); return; }
  if (e.target.closest("#qcMax")) { callMini(false); return; }
  if (e.target.closest("#qcMute")) { C.muted = !C.muted; if (C.muted) send({ realtimeInput: { audioStreamEnd: true } }); muteUi(); return; }
  if (e.target.closest("#qcConsentOk")) { try { localStorage.setItem("pos-quanta-chiamata-ok", "1"); } catch {} callStart(); return; }
  if (e.target.closest("#qcConsentNo")) { callEnd(); return; }
  const q = e.target.closest("[data-qc]"); if (q) { const a = q.dataset.qc; callEnd(); if (a === "simple") { openChat(); talkStart(); } return; }
  /* conferma o annulla premuti sullo schermo durante la chiamata: lo diciamo anche a Quanta */
  const op = e.target.closest("#qCall [data-opok], #qCall [data-opno]");
  if (op && C.on) { const ok = !!op.dataset.opok; setTimeout(() => { opRender(); }, 60); setTimeout(() => { opRender(); const v = [...S.chatView].reverse().find(x => x.k === "op" && x.when);
    send({ realtimeInput: { text: `(L'utente ha premuto ${ok ? "Conferma" : "Annulla"} sullo schermo: ${v && v.msg ? v.msg : ok ? "operazione salvata" : "operazione annullata"}. Dillo in una frase.)` } }); }, 1500); }
});
document.addEventListener("submit", e => { if (e.target.id !== "qcForm") return; e.preventDefault(); sendText(); });
document.addEventListener("input", e => { if (e.target.id === "qcText") $("#qcForm").classList.toggle("has", !!e.target.value.trim()); });
document.addEventListener("click", e => { if (!e.target.closest("#qcCC")) return; try { localStorage.setItem("pos-quanta-cc", ccOn() ? "0" : "1"); } catch {} ccUi(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#qCall").hidden && !C.mini && e.target.id !== "qcText") callEnd(); });
