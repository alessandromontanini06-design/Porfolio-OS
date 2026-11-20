// Quanta assistente: legge il patrimonio senza laboratorio, prepara le operazioni dette a parole (salvate SOLO con «Conferma»,
// col pulsante o a voce), barra unica come nelle app di chat («+» foto, dettatura, pulsante tondo: conversazione a voce / invio / stop),
// foto con permesso, «Ascolta», apre le pagine. L'IA è simulata intercettando /api/assistant; voce e dettatura sono finte
// (in un browser senza schermo non ci sono): __hearQ è la fila delle frasi che il «microfono» sente.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const [,, OUT = import.meta.dirname + "/files/shots"] = process.argv, PORT = +(process.env.TEST_PORT || 5206), wait = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
await wait(1500);
const db = { v: 1, strumenti: { IE00B4L5Y983: { nome: "iShares Core MSCI World", ticker: "SWDA", isin: "IE00B4L5Y983", simbolo: "IWDA.AMS", valuta: "EUR" } },
  operazioni: [{ id: "a1", data: "2024-02-01", tipo: "acquisto", strumento: "IE00B4L5Y983", quantita: 100, prezzo: 85 }] };
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = [];
p.on("pageerror", e => errs.push(e.message));
await p.evaluateOnNewDocument(d => {
  if (!sessionStorage.getItem("seeded")) { localStorage.clear(); localStorage.setItem("pos-patrimonio-v1", d); sessionStorage.setItem("seeded", "1"); }
  window.__spoken = []; window.__hearQ = [];
  window.WebSocket = undefined; /* niente chiamata in tempo reale: qui si prova la conversazione a voce semplice (la riserva); la chiamata ha test-chiamata */
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 20); }, cancel() {}, getVoices: () => [{ name: "Google italiano", lang: "it-IT" }], addEventListener() {} } });
  const Rec = class { start() { const t = window.__hearQ.shift(); setTimeout(() => { if (t) this.onresult && this.onresult({ results: [[{ transcript: t }]] }); else this.onerror && this.onerror({ error: "no-speech" }); setTimeout(() => this.onend && this.onend(), 60); }, 150); }
    stop() { setTimeout(() => this.onend && this.onend(), 10); } abort() { this.onerror && this.onerror({ error: "aborted" }); setTimeout(() => this.onend && this.onend(), 10); } };
  window.SpeechRecognition = Rec; window.webkitSpeechRecognition = Rec;
}, JSON.stringify(db));
/* IA finta: risponde in base all'ultimo messaggio e ricorda le richieste; la voce online finta risponde con 0,3 s di silenzio (voiceDown: ferma) */
const bodies = [], voce = []; let voiceDown = false;
const WAV = (() => { const pcm = Buffer.alloc(14400), h = Buffer.alloc(44); h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40); return Buffer.concat([h, pcm]).toString("base64"); })();
const OP = { acquisto: { tipo: "acquisto", strumento: "SWDA", quantita: 10, prezzo: 98, data: "2026-11-18" }, v5: { tipo: "vendita", strumento: "SWDA", quantita: 5, prezzo: 100 }, v1000: { tipo: "vendita", strumento: "SWDA", quantita: 1000, prezzo: 100 } };
await p.setRequestInterception(true);
p.on("request", r => {
  if (!r.url().includes("/api/assistant")) { r.continue(); return; }
  if (r.url().includes("modo=voce")) { const d = JSON.parse(r.postData() || "{}"); voce.push(d.testo);
    r.respond(voiceDown ? { status: 503, contentType: "application/json", body: JSON.stringify({ error: "Voce online non disponibile." }) } : { status: 200, contentType: "application/json", body: JSON.stringify({ audio: WAV, mime: "audio/wav", modello: "test", voce: "Algieba" }) }); return; }
  const d = JSON.parse(r.postData() || "{}"); bodies.push(d);
  const m = d.messages || [], last = m[m.length - 1] || {}, t = last.text || "";
  const call = (name, args) => ({ text: "", calls: [{ id: "c" + bodies.length, name, args }], provider: "gemini", model: "test" });
  const out = last.role === "tool" ? { text: last.name === "registra_operazione" ? "Ti ho preparato l'operazione: dimmi se la confermo." : `Fatto. ${last.name}: ${JSON.stringify(last.result).slice(0, 120)}`, calls: [], provider: "gemini" }
    : /guadagnato/.test(t) ? call("patrimonio", {})
    : /2 SWDA ieri/.test(t) ? call("registra_operazione", { tipo: "acquisto", strumento: "SWDA", quantita: 2, prezzo: 99, data: "ieri" })
    : /comprato/.test(t) ? call("registra_operazione", OP.acquisto)
    : /venduto 5 /.test(t) ? call("registra_operazione", OP.v5)
    : /venduto 1000/.test(t) ? call("registra_operazione", OP.v1000)
    : /data strana/.test(t) ? call("registra_operazione", { tipo: "acquisto", strumento: "SWDA", quantita: 2, prezzo: 99, data: "il giorno di Natale" })
    : /costa/.test(t) ? call("costi_banca", { patrimonio_medio: "100.000", costi_servizi: "800", costi_prodotti: "700", incentivi: "300" })
    : /portami/.test(t) ? call("vai_a", { pagina: "costi_banca" })
    : /simulazioni/.test(t) ? call("vai_a", { pagina: "simulazioni" })
    : { text: `Ecco la risposta numero ${bodies.length}: il **TIR** è il rendimento annuo vero, −3% o +5%.`, calls: [], provider: "gemini" };
  r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(out) });
});
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
const ops = () => p.evaluate(() => JSON.parse(localStorage.getItem("pos-patrimonio-v1")).operazioni);
const idle = () => p.waitForFunction(() => !document.querySelector("#chatLog .typing") && !document.getElementById("chatForm").classList.contains("talking") && document.getElementById("chatSend").dataset.mode !== "stop", { timeout: 20000 }).catch(() => {});
const ask = async q => { await p.evaluate(q => { const i = document.getElementById("chatIn"); i.value = q; document.getElementById("chatForm").requestSubmit(); }, q); await wait(300); await idle(); await wait(200); };
const lastToolIn = bs => { const x = bs[bs.length - 1].messages.filter(m => m.role === "tool").pop(); return x && x.result; };
const lastTool = name => { for (let k = bodies.length - 1; k >= 0; k--) { const x = bodies[k].messages.filter(m => m.role === "tool" && m.name === name).pop(); if (x) return x.result; } return null; };
const log = () => p.evaluate(() => document.getElementById("chatLog").innerText.replace(/\s+/g, " "));
const mode = () => p.evaluate(() => document.getElementById("chatSend").dataset.mode);
const heard = async () => voce.join(" ") + " " + await p.evaluate(() => window.__spoken.join(" "));
const talk = async (...frasi) => { voce.length = 0; await p.evaluate(f => { window.__hearQ = f; window.__spoken = []; }, frasi); await p.click("#chatSend"); await wait(500); await idle(); await wait(300); };

await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" }); await wait(2500);
await p.click("#chatBtn"); await wait(600);
t("con un patrimonio Quanta lo dice nel saluto", /conosco il tuo patrimonio/.test(await log()));
const sug = await p.evaluate(() => [...document.querySelectorAll("#chatSugg button")].map(x => ({ t: x.innerText.trim(), svg: !!x.querySelector("svg"), act: x.dataset.qact || null })));
t("suggerimenti in elenco con le icone: domande sul patrimonio, foto, conversazione a voce", sug.length === 4 && sug.every(x => x.svg) && sug[0].t === "Quanto ho guadagnato in tutto?" && sug.some(x => x.act === "foto") && sug.some(x => x.act === "talk"), JSON.stringify(sug));
t("barra unica: «+», testo «Chiedi a Quanta», microfono, pulsante tondo", await p.evaluate(() => ["chatPhoto", "chatMic", "chatSend"].every(id => document.getElementById(id).getBoundingClientRect().width > 0) && document.getElementById("chatIn").placeholder === "Chiedi a Quanta" && !document.getElementById("chatVoice")));
t("a barra vuota il pulsante tondo è la conversazione a voce", await mode() === "talk");
await p.type("#chatIn", "ciao"); t("appena scrivi diventa la freccia d'invio", await mode() === "send");
await p.evaluate(() => { const i = document.getElementById("chatIn"); i.value = ""; i.dispatchEvent(new Event("input")); });

/* 1. il patrimonio senza laboratorio */
await ask("Quanto ho guadagnato in tutto?");
const pm = lastTool("patrimonio");
t("lo strumento patrimonio risponde senza laboratorio (valore, TIR, posizioni)", pm && !pm.error && /€/.test(pm.valore_oggi) && /%/.test(pm.rendimento_annuo_tir) && pm.posizioni.length === 1 && pm.posizioni[0].nome === "iShares Core MSCI World", JSON.stringify(pm).slice(0, 300));
t("nel contesto: data di oggi e patrimonio salvato", /oggi è il \d{4}-\d{2}-\d{2}; l'utente ha un patrimonio salvato/.test(bodies[0].context), bodies[0].context.slice(0, 160));
t("una risposta scritta non viene letta da sola", await p.evaluate(() => window.__spoken.filter(x => x.trim()).length === 0) && voce.length === 0);

/* 2. dettatura: il testo resta nella barra da controllare */
const nb = bodies.length;
await p.evaluate(() => { window.__hearQ = ["quanto vale il mio patrimonio"]; }); await p.click("#chatMic"); await wait(700);
t("il microfono detta nella barra senza inviare", await p.evaluate(() => document.getElementById("chatIn").value) === "quanto vale il mio patrimonio" && bodies.length === nb && await mode() === "send");
await p.evaluate(() => { const i = document.getElementById("chatIn"); i.value = ""; i.dispatchEvent(new Event("input")); });

/* 3. conversazione a voce: l'operazione si prepara e NON si salva da sola */
const n0 = (await ops()).length;
await talk("ho comprato 10 SWDA a 98 euro");
const bVoce = bodies.find(x => x.messages.some(m => m.role === "user" && m.text === "ho comprato 10 SWDA a 98 euro"));
t("in conversazione la frase parte da sola, col contesto «a voce»", bVoce && /parlando a voce/.test(bVoce.context));
t("il messaggio è segnato come vocale", /messaggio vocale/.test(await log()));
const card = await p.evaluate(() => { const c = document.querySelector(".q-op"); return c && c.innerText.replace(/\s+/g, " "); });
t("scheda «Da confermare» con l'operazione", /Da confermare/.test(card || "") && /Acquisto · 10 quote di SWDA a 98,00 € · 18\/11\/2026/.test(card || ""), card);
t("la risposta è letta con la voce online, senza asterischi", /preparato l'operazione/.test(voce.join(" ")) && !/\*/.test(voce.join(" ")) && await p.evaluate(() => window.__spoken.filter(x => x.trim()).length === 0), JSON.stringify(voce));
t("dopo la risposta Quanta si rimette in ascolto e, nel silenzio, chiude la conversazione", /Non ti ho sentito, così ho chiuso la conversazione a voce/.test(await log()) && await mode() === "talk");
t("senza conferma nel patrimonio non c'è niente di nuovo", (await ops()).length === n0);
await p.evaluate(() => [...document.querySelectorAll("[data-opok]")].pop().click()); await wait(1500);
const o1 = (await ops()).slice(-1)[0];
t("«Conferma» salva l'acquisto nel patrimonio (10 a 98, origine quanta)", (await ops()).length === n0 + 1 && o1.tipo === "acquisto" && o1.quantita === 10 && o1.prezzo === 98 && o1.data === "2026-11-18" && o1.origine === "quanta", JSON.stringify(o1));
t("la scheda dice «Salvato nel patrimonio»", /Salvato nel patrimonio/.test(await p.evaluate(() => document.querySelector(".q-op").innerText)));

/* 4. a voce: «annulla» e «sì, conferma» */
await talk("ho venduto 5 quote a 100", "annulla");
t("«annulla» detto a voce non registra niente", (await ops()).length === n0 + 1 && /Annullato/.test(await log()) && /non ho registrato niente/.test(await heard()));
await talk("ho comprato 10 SWDA a 98 euro", "sì, conferma");
t("«sì, conferma» detto a voce salva e Quanta lo dice", (await ops()).length === n0 + 2 && /Salvato nel patrimonio/.test(await heard()), await heard());
/* il quadrato ferma la conversazione mentre ascolta */
await p.evaluate(() => { window.__hearQ = []; }); await p.click("#chatSend"); await wait(60);
const mid = await mode(); await p.click("#chatSend"); await wait(400);
t("il quadrato chiude la conversazione a voce", mid === "stop" && await mode() === "talk" && !(await log()).endsWith("per riprendere. Non ti ho sentito, così ho chiuso la conversazione a voce. Tocca il pulsante tondo per riprendere."));

/* date dette dall'IA a parole: «ieri» diventa la data vera, una data non chiara si chiede */
await ask("ho comprato 2 SWDA ieri a 99");
const ieri = await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 1); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; });
const cIeri = await p.evaluate(() => [...document.querySelectorAll(".q-op")].pop().innerText.replace(/\s+/g, " "));
t(`«ieri» detto dall'IA diventa ${ieri}`, cIeri.includes(ieri), cIeri);
await p.evaluate(() => [...document.querySelectorAll("[data-opno]")].pop().click()); await wait(200);
const nOp = await p.evaluate(() => document.querySelectorAll(".q-op").length);
await ask("data strana");
t("una data non chiara non prepara la scheda e la chiede", await p.evaluate(() => document.querySelectorAll(".q-op").length) === nOp && /data non chiara/.test(JSON.stringify(lastToolIn(bodies))), "");
/* 5. vendere troppo */
await ask("ho venduto 1000 quote a 100");
await p.evaluate(() => [...document.querySelectorAll("[data-opok]")].pop().click()); await wait(1200);
t("vendere più quote di quelle possedute non si salva e lo spiega", (await ops()).length === n0 + 2 && /Non salvato: ne possiedi 120/.test(await log()), (await log()).slice(-300));

/* 6. «Ascolta» */
await ask("Che cos'è il TIR?");
const sayLast = async () => { await p.evaluate(() => { window.__spoken = []; [...document.querySelectorAll("#chatLog [data-say]")].pop().click(); }); await wait(1200); };
voce.length = 0; await sayLast();
const sp = voce.join(" ");
t("«Ascolta» legge con la voce online, con i segni detti a parole", /TIR/.test(sp) && /meno 3 per cento/.test(sp) && /5 per cento/.test(sp) && !/[*%−]/.test(sp) && await p.evaluate(() => window.__spoken.length === 0), sp);
t("mentre legge il pulsante diventa «Ferma» e alla fine torna «Ascolta»", await p.evaluate(() => !document.querySelector("#chatLog .q-say.on")));
voiceDown = true; voce.length = 0; await ask("Che cos'è il TIR?"); await sayLast();
const sp2 = await p.evaluate(() => window.__spoken.join(" "));
t("se la voce online è ferma legge la voce del dispositivo", voce.length === 1 && /TIR/.test(sp2) && /meno 3 per cento/.test(sp2), `${voce.length} · ${sp2}`);
voce.length = 0; await ask("Che cos'è il TIR?"); await sayLast();
t("per qualche minuto non riprova la voce online (niente attese)", voce.length === 0 && /TIR/.test(await p.evaluate(() => window.__spoken.join(" "))));
voiceDown = false;

/* 7. foto: prima il permesso, poi la foto rimpicciolita va all'IA solo con il messaggio */
const img = OUT + "/_rendiconto-finto.png";
const png = await p.evaluate(() => { const c = document.createElement("canvas"); c.width = 2400; c.height = 1600; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 2400, 1600); g.fillStyle = "#000"; g.font = "60px sans-serif";
  ["Rendiconto costi e oneri 2025 (dati inventati)", "Patrimonio medio 100.000,00", "Costi dei servizi 800,00", "Costi dei prodotti 700,00", "Di cui incentivi 300,00"].forEach((s, i) => g.fillText(s, 80, 200 + i * 150)); return c.toDataURL("image/png").split(",")[1]; });
writeFileSync(img, Buffer.from(png, "base64"));
await p.click("#chatPhoto"); await wait(200);
t("la prima volta chiede il permesso prima di scegliere la foto", await p.evaluate(() => !document.getElementById("chatConsent").hidden && /Google Gemini/.test(document.getElementById("chatConsent").innerText)));
await p.click("#chatConsentNo"); await wait(150);
t("«No» chiude senza aprire niente", await p.evaluate(() => document.getElementById("chatConsent").hidden && document.getElementById("chatAtt").hidden));
await p.click("#chatPhoto"); await wait(150);
const [fc] = await Promise.all([p.waitForFileChooser({ timeout: 5000 }), p.click("#chatConsentOk")]);
await fc.accept([img]); await wait(1200);
t("la foto compare in anteprima e il pulsante tondo diventa l'invio", await p.evaluate(() => !document.getElementById("chatAtt").hidden && document.querySelectorAll("#chatAtt img").length === 1) && await mode() === "send");
const nB = bodies.length; await ask("Quanto mi costa la banca?");
const bF = bodies[nB], uF = bF && bF.messages.filter(m => m.role === "user").pop();
t("la foto parte con il messaggio, JPEG rimpicciolita", uF && uF.images && uF.images.length === 1 && uF.images[0].mime === "image/jpeg" && uF.images[0].data.length < 1_600_000, uF && uF.images && uF.images[0].data.length);
const dim = await p.evaluate(() => new Promise(r => { const i = new Image(); i.onload = () => r([i.width, i.height]); i.src = document.querySelector("#chatLog .q-imgs img").src; }));
t(`dimensioni ridotte a 1600 px (${dim})`, dim[0] === 1600 && dim[1] === 1067);
t("nelle richieste precedenti nessuna foto", bodies.slice(0, nB).every(x => x.messages.every(m => !m.images)));
const cb = lastTool("costi_banca");
t("costi_banca compila il calcolatore (1.500 € l'anno, 1,50%)", cb && /1\.500/.test(cb.costo_annuo) && cb.percentuale_del_patrimonio === "1,50%", JSON.stringify(cb));
t("il rendiconto è salvato nel calcolatore", await p.evaluate(() => { const r = JSON.parse(localStorage.getItem("pos-rendiconto-v1") || "{}"); return r.pat === "100.000" && r.serv === "800"; }));
await ask("e cosa vuol dire?");
t("la foto resta nell'ultimo messaggio che la ha, una volta sola", bodies[bodies.length - 1].messages.filter(m => m.images && m.images.length).length === 1);

/* 8. aprire una pagina */
await ask("portami ai costi della banca"); await wait(1200);
t("«portami ai costi della banca» apre Strumenti", await p.evaluate(() => !document.getElementById("scene-strumenti").hidden));
await ask("apri le simulazioni");
t("le simulazioni senza laboratorio non si aprono e lo dice all'IA", /laboratorio/.test(JSON.stringify(lastTool("vai_a"))));
await p.click("#chatNew"); await wait(400);
await p.screenshot({ path: `${OUT}/quanta-assistente.jpg`, type: "jpeg", quality: 70 });

/* 9. telefono */
await p.setViewport({ width: 390, height: 844 }); await wait(600);
const ov = await p.evaluate(() => { const f = document.getElementById("chatForm"), r = f.getBoundingClientRect(), h = document.querySelector("#chat .chat-head");
  return { w: innerWidth, right: Math.round(r.right), head: Math.round(Math.max(...[...h.querySelectorAll("button")].map(x => x.getBoundingClientRect().right))), inW: Math.round(document.getElementById("chatIn").getBoundingClientRect().width), sug: document.querySelectorAll("#chatSugg button").length }; });
t("sul telefono barra e intestazione stanno nello schermo e il testo resta largo", ov.right <= ov.w && ov.head <= ov.w && ov.inW >= 180 && ov.sug === 4, JSON.stringify(ov));
await p.screenshot({ path: `${OUT}/quanta-assistente-tel.jpg`, type: "jpeg", quality: 70 });
t("nessun errore JavaScript", !errs.length, errs.join(" | "));
console.log(`\n${pass} superati, ${fail} falliti`);
await b.close(); srv.kill(); process.exit(fail ? 1 : 0);
