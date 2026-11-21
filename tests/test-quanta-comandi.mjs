// Quanta usa il sito come l'utente (21/11/2026): elenco_comandi legge i comandi dello schermo, usa_comando preme, scrive, sceglie.
// Le azioni che cancellano o salvano dati si fanno solo dopo un «sì» dell'utente. node test-quanta-comandi.mjs files/shots
import { spawn } from "node:child_process"; import path from "node:path"; import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || "files/shots", PORT = 5391, wait = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join(import.meta.dirname, "serve.mjs")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" }); await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.dismiss());
const PM = { v: 1, strumenti: { IE00B4L5Y983: { nome: "iShares Core MSCI World", ticker: "SWDA", isin: "IE00B4L5Y983", simbolo: "IWDA.AMS", valuta: "EUR" } }, operazioni: [{ id: "a1", data: "2024-02-01", tipo: "acquisto", strumento: "IE00B4L5Y983", quantita: 40, prezzo: 85 }] };
await p.evaluateOnNewDocument(pm => { if (!sessionStorage.getItem("s")) { localStorage.clear(); localStorage.setItem("pos-ruolo-v1", "priv"); localStorage.setItem("pos-patrimonio-v1", pm); sessionStorage.setItem("s", "1"); } }, JSON.stringify(PM));
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
const elenco = () => p.evaluate(() => window.__guida.elencoComandi());
const usa = a => p.evaluate(a => window.__guida.usaComando(a), a);
const trova = (L, rx, tipo) => L.comandi.find(c => new RegExp(rx, "i").test(c.nome) && (!tipo || c.tipo === tipo));
const dice = t => p.evaluate(t => { window.__pos && 0; return import("/js/ui/core.js").then(m => { m.S.chat.push({ role: "user", text: t }); }); }, t);
await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await wait(2500);

/* 1. home: i comandi della pagina e della barra in alto */
let L = await elenco();
t("elenco_comandi in home: pulsanti della pagina e della barra in alto", L.pagina === "Home" && !!trova(L, "Crea il tuo patrimonio") && !!trova(L, "Impostazioni"), JSON.stringify(L.comandi.slice(0, 8).map(c => c.nome)));
/* 2. impostazioni: apre la rotellina e sceglie il tema scuro */
let r = await usa({ ref: trova(L, "Impostazioni").ref }); await wait(300);
L = await elenco();
t("dopo «Impostazioni» l'elenco mostra solo il pannello aperto", /Impostazioni/.test(L.pannello || "") && !!trova(L, "^Scuro$"), JSON.stringify({ pannello: L.pannello, c: L.comandi.map(c => c.nome) }));
r = await usa({ ref: trova(L, "^Scuro$").ref }); await wait(400);
t("Quanta sceglie il tema scuro", r.fatto && await p.evaluate(() => document.documentElement.dataset.theme === "dark"), JSON.stringify(r));
r = await usa({ ref: trova(await elenco(), "^Chiaro$").ref }); await wait(300);
t("e torna al chiaro (l'anello mostra cosa tocca)", await p.evaluate(() => document.documentElement.dataset.theme !== "dark" && !!document.querySelector(".q-hl")));
await p.keyboard.press("Escape"); await p.mouse.click(700, 500); await wait(300);
/* 3. un campo: costruttore, capitale da analizzare */
await p.evaluate(() => window.__guida.apri({ cosa: "costruttore" })); await wait(600);
L = await elenco();
const cap = L.comandi.find(c => c.tipo === "campo" && /Capitale/i.test(c.nome));
t("nel costruttore: il campo «Capitale da analizzare» con il suo valore", L.pannello && cap && cap.valore !== undefined, JSON.stringify(cap));
r = await usa({ ref: cap.ref, valore: "25000" }); await wait(300);
t("Quanta scrive 25000 nel capitale", r.fatto && await p.evaluate(() => document.getElementById("bdCap").value === "25000"));
/* 4. un menu: scheda Obbligazioni e filtro Emittente → Bund (Germania) */
r = await usa({ ref: trova(L, "^Obbligazioni$").ref }); await wait(900);
L = await elenco(); const em = L.comandi.find(c => c.tipo === "menu" && /Emittente/i.test(c.nome));
t("menu «Emittente» con le sue scelte", em && em.scelte.some(s => /Bund/.test(s)), JSON.stringify({ em, n: L.comandi.length, altri: L.altri, menu: L.comandi.filter(c => c.tipo === "menu").map(c => c.nome), primi: L.comandi.slice(0, 30).map(c => c.nome) }));
r = await usa({ ref: em.ref, valore: "Bund" }); await wait(400);
t("Quanta sceglie «Bund (Germania)» e compaiono i Bund", r.fatto && /Bund \(Germania\)/.test(r.valore) && await p.evaluate(() => [...document.querySelectorAll(".bd-clist .bd-it")].every(x => /Bund|Bobl|Schatz/.test(x.innerText))), JSON.stringify(r));
r = await usa({ ref: em.ref, valore: "inesistente" });
t("una scelta che non c'è: Quanta riceve le scelte possibili", !!r.error && Array.isArray(r.scelte));
/* 5. azioni che cancellano: «Svuota» senza sì viene fermata; con il sì dell'utente si fa */
L = await elenco(); const sv = trova(L, "^Svuota$");
t("«Svuota» è segnato come da confermare", sv && sv.serve_conferma, JSON.stringify(sv));
r = await usa({ ref: sv.ref, confermato: true });
t("senza un sì dell'utente non si fa, anche con confermato", !!r.error && r.serve_conferma, JSON.stringify(r));
await dice("sì, svuotalo");
r = await usa({ ref: sv.ref, confermato: true }); await wait(300);
t("dopo «sì, svuotalo» Quanta lo fa", r.fatto && await p.evaluate(() => [...document.querySelectorAll("#bdRows input[list]")].every(i => !i.value)), JSON.stringify(r));
await p.keyboard.press("Escape"); await p.evaluate(() => { const x = document.querySelector("#builder .x, #closeBuilder"); x && x.click(); }); await wait(400);
/* 6. patrimonio: «Ricomincia da zero» resta bloccato senza sì */
await p.evaluate(() => window.__guida.mostra({ cosa: "patrimonio_grafico" })); await wait(1500);
L = await elenco(); const rz = trova(L, "Ricomincia da zero");
await dice("cosa c'è qui?");
r = rz ? await usa({ ref: rz.ref, confermato: true }) : null;
t("«Ricomincia da zero» del patrimonio: bloccato finché l'utente non dice sì", rz && rz.serve_conferma && r && r.serve_conferma && await p.evaluate(() => !!localStorage.getItem("pos-patrimonio-v1")), JSON.stringify({ rz, r }));
/* 7. un ref vecchio dopo un cambio di pagina */
r = await usa({ ref: "c9999" });
t("un comando che non c'è più: Quanta deve rileggere lo schermo", !!r.error && /elenco_comandi/.test(r.error));
/* 8. una pagina di analisi: Simulazioni, «metti 30 anni» */
await (await p.$("#file")).uploadFile(path.join(import.meta.dirname, "files", "PAC_due_fogli_righe_vuote.xlsx"));
await p.waitForFunction(() => window.__pos.state().rebuilt, { timeout: 120000 }).catch(() => {});
await p.evaluate(() => document.querySelector('.dock [data-go="map"]').click()); await wait(1200);
await p.waitForFunction(() => !document.getElementById("confirmBtn").disabled, { timeout: 60000 }).catch(() => {});
await p.evaluate(() => document.getElementById("confirmBtn").click()); await p.waitForFunction(() => !document.getElementById("lab").hidden, { timeout: 60000 }).catch(() => {});
await p.evaluate(() => document.querySelector('.dock [data-go="sim"]').click()); await wait(2500);
L = await elenco(); const anni = L.comandi.find(c => c.tipo === "campo" && /^Anni$/i.test(c.nome));
r = anni ? await usa({ ref: anni.ref, valore: "30" }) : null; await wait(1500);
t("Simulazioni: Quanta mette 30 anni e il calcolo si aggiorna", anni && r && r.fatto && await p.evaluate(() => /30 (anni|years)/.test(document.getElementById("scene-sim").innerText) && document.getElementById("mcYears").value === "30"), JSON.stringify({ anni, r }));
t("nessun errore JavaScript", !errs.length, errs.join(" | "));
await b.close(); srv.kill();
console.log(`\n${pass} superati, ${fail} falliti`); process.exit(fail ? 1 : 0);
