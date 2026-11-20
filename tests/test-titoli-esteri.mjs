// Titoli di Stato di Germania (Bund), Francia (OAT) e Spagna (Bonos) a tasso fisso (20/11/2026):
// prezzo stimato dalla curva AAA dell'area euro (BCE) + scarto del paese sul 10 anni; nel costruttore compaiono solo dopo aver scelto il paese.
// Curve: tests/files/stati-curva.json (dati veri della BCE al 19/11/2026) + js/data/curve-euro.json. node test-titoli-esteri.mjs files/shots
import { spawn } from "node:child_process"; import fs from "node:fs"; import path from "node:path"; import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || "files/shots", PORT = 5351, wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
const { POS: P } = await import("file:///" + path.join(import.meta.dirname, "..", "js", "engine.js").replace(/\\/g, "/"));
const H = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "js", "data", "curve-euro.json"), "utf8")), R = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "files", "stati-curva.json"), "utf8"));

/* ---------- motore ---------- */
const bd = P.btpDaSimbolo("BUND:2.6:2035-08-15");
t("simbolo BUND: Germania, cedola annuale", bd && bd.paese === "DE" && bd.freq === 1 && Math.abs(bd.cedola - 0.026) < 1e-12 && P.btpSimbolo(bd) === "BUND:2.6:2035-08-15", JSON.stringify(bd));
t("simboli OAT e BONOS; i BTP restano semestrali", P.btpDaSimbolo("OAT:3:2033-05-25").paese === "FR" && P.btpDaSimbolo("BONOS:3.15:2035-04-30").paese === "ES" && P.btpDaSimbolo("BTP:3.35:2035-03-01").freq === 2);
t("nomi: «Bund 2,6% 15/08/2035», «OAT 3% 25/05/2033»", P.btpNome(bd) === "Bund 2,6% 15/08/2035" && P.btpNome(P.btpDaSimbolo("OAT:3:2033-05-25")) === "OAT 3% 25/05/2033");
/* a mano: cedola annuale 3% e rendimento 3%, nel giorno della cedola, vale 100; con rendimento 4% e 2 anni: 3/1,04 + 103/1,04² = 98,1139.
   Il motore conta gli anni come giorni/365,25 (come per i BTP): con un 29 febbraio in mezzo lo scarto è di qualche millesimo. */
const a3 = { cedola: 0.03, scadenza: "2030-06-15", freq: 1, paese: "DE" };
t("prezzo a mano: cedola 3% al 3% = 100", Math.abs(P.btpPrezzo(a3, "2026-06-15", 3) - 100) < 0.001, P.btpPrezzo(a3, "2026-06-15", 3));
const a2 = { cedola: 0.03, scadenza: "2028-06-15", freq: 1, paese: "FR" }, att = 3 / 1.04 + 103 / 1.04 ** 2;
t("prezzo a mano: 2 anni, cedola 3%, rendimento 4% = 98,11", Math.abs(P.btpPrezzo(a2, "2026-06-15", 4) - att) < 0.01, P.btpPrezzo(a2, "2026-06-15", 4) + " contro " + att);
t("tipi: Bund e OAT fissi, OAT€i e Bonos indicizzati no, Treasury USA estero", P.btpTipo("Bund 2,6% 15/08/2035", "DE0001102614") === "fisso" && P.btpTipo("OAT 3% 25/05/2033", "FR001400H7V7") === "fisso" && P.btpTipo("OAT€i 0,1% 2036", "FR0013519253") === "indicizzato" && P.btpTipo("Bonos indexados SPGBEI 0,65% 2027", "ES00000128S2") === "indicizzato" && P.btpTipo("US TREASURY 4% 2034", "US91282CJZ59") === "estero" && P.btpTipo("BTP 3,35% 01MZ35") === "fisso");
t("paese dall'ISIN: DE, FR, ES, IT", P.btpPaese("", "DE0001102614") === "DE" && P.btpPaese("OAT", "FR001400H7V7") === "FR" && P.btpPaese("", "ES0000012M51") === "ES" && P.btpPaese("", "IT0005383309") === "IT");
/* curva del paese: 10 anni = 10 anni AAA + (IRS del mese − media AAA del mese) */
const cDE = P.tdsCurva(H, R, "DE"), cFR = P.tdsCurva(H, R, "FR"), cES = P.tdsCurva(H, R, "ES");
t("curve di Germania, Francia e Spagna dal 2004 al 19/11/2026", [cDE, cFR, cES].every(c => c && c.mesi[0][0] < "2005-01-01" && c.al === "2026-11-19"), [cDE, cFR, cES].map(c => c && c.al).join());
const m = "2024-06", irsFR = new Map(H.irs.FR).get(m), avg = new Map(H.aaa10).get(m), aaaEom = H.mesi.find(x => x[0].startsWith(m))[1][5], frEom = cFR.mesi.find(x => x[0].startsWith(m))[1][5];
t("a mano: 10 anni Francia giugno 2024 = AAA di fine mese + (IRS − media AAA)", Math.abs(frEom - (aaaEom + irsFR - avg)) < 1e-3, `${frEom} contro ${aaaEom} + ${irsFR} − ${avg}`);
t("scarto di oggi: Germania vicina a zero, Francia e Spagna sopra", Math.abs(cDE.scarto) < 0.3 && cFR.scarto > cDE.scarto && cES.scarto > cDE.scarto, [cDE.scarto, cFR.scarto, cES.scarto].join(" "));
const sB = P.btpSerie(bd, cDE, { oggi: "2026-11-20" }), pB = sB.prezzi[sB.prezzi.length - 1].v, yB = P.btpTir(bd, "2026-11-20", pB);
t("Bund 2,6% 2035: il prezzo stimato ha come rendimento la curva tedesca a 8,7 anni", pB > 80 && pB < 105 && Math.abs(yB - P.btpRendimento(cDE.scadenze, cDE.giorni[cDE.giorni.length - 1][1], P.btpRendimento ? (Date.parse("2035-08-15") - Date.parse("2026-11-20")) / 864e5 / 365.25 : 0)) < 0.02, `prezzo ${pB}, rendimento ${yB}`);
const cSolo = P.tdsCurva(H, null, "FR");
t("se la BCE non risponde: si usa lo storico nel sito (fino al mese scorso)", cSolo && cSolo.al === H.al && P.btpSerie(P.btpDaSimbolo("OAT:3:2033-05-25"), cSolo, {}).prezzi.length > 200, cSolo && cSolo.al);
t("serie mensile con le cedole reinvestite dal 2005", sB.indice.length > 200 && sB.indice[0].d < "2006-01-01");

/* ---------- elenco ---------- */
const L = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "js", "data", "stati.json"), "utf8"));
t("elenco: più di 50 titoli per paese, nessuno scaduto o con anni sbagliati", ["DE", "FR", "ES"].every(p => L.paesi[p].length >= 50 && L.paesi[p].every(r => r[2] > "2026-01-01" && r[2] < "2080-01-01" && r[3] >= 0 && r[3] < 0.1)), Object.entries(L.paesi).map(([k, v]) => k + v.length).join(" "));
t("ISIN veri per Germania e Francia", L.paesi.DE.every(r => /^DE[A-Z0-9]{10}$/.test(r[0])) && L.paesi.FR.every(r => /^FR[A-Z0-9]{10}$/.test(r[0])));

/* ---------- nel sito ---------- */
const srv = spawn(process.execPath, [path.join(import.meta.dirname, "serve.mjs")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" }); await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = []; p.on("pageerror", e => errs.push(e.message));
const count = () => p.evaluate(() => +(document.querySelector(".bd-count").textContent.match(/[\d.]+/) || ["0"])[0].replace(/\./g, ""));
const rows = () => p.evaluate(() => [...document.querySelectorAll(".bd-clist .bd-it")].map(x => x.innerText.replace(/\s+/g, " ")));
const tab = n => p.evaluate(n => [...document.querySelectorAll("[data-bdtab]")].find(x => x.textContent.trim() === n).click(), n);
const pick = (k, v) => p.evaluate((k, v) => { const s = document.querySelector(`[data-bdf="${k}"]`); s.value = v; s.dispatchEvent(new Event("change", { bubbles: true })); }, k, v);
const search = q => p.evaluate(q => { const i = document.querySelector(".bd-cq"); i.value = q; i.dispatchEvent(new Event("input", { bubbles: true })); }, q);
await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await wait(2500);
await p.click("#builderBtn"); await wait(700);
await p.evaluate(() => document.getElementById("bdClear").click()); await wait(200);
await tab("Obbligazioni"); await p.waitForFunction(() => /Bund, OAT e Bonos/.test(document.querySelector(".bd-count").textContent), { timeout: 15000 }).catch(() => {});
const r0 = await rows();
t("Obbligazioni: Bund, OAT e Bonos non sono nell'elenco finché non si sceglie il paese", !r0.some(r => /\b(Bund|OAT|Bonos) \d/.test(r)) && /scegli il paese/.test(await p.evaluate(() => document.querySelector(".bd-count").textContent)), JSON.stringify(r0.slice(0, 3)));
const opts = await p.evaluate(() => [...document.querySelectorAll('[data-bdf="f1"] option')].map(o => o.textContent));
t("in «Emittente» ci sono Germania, Francia e Spagna con il numero dei titoli", ["Bund (Germania)", "OAT (Francia)", "Bonos (Spagna)"].every(v => opts.some(o => o.startsWith(v + " ("))), JSON.stringify(opts));
const scad0 = await p.evaluate(() => [...document.querySelectorAll('[data-bdf="f2"] option')].map(o => o.textContent).join("|"));
await pick("f1", "Bund (Germania)"); await wait(200);
const nDE = await count(), rDE = await rows();
t("scelta la Germania: solo Bund, Bobl e Schatz", nDE >= 50 && rDE.length && rDE.every(r => /^DE (Bund|Bobl|Schatz)/.test(r)), nDE + " " + JSON.stringify(rDE.slice(0, 2)));
t("la riga dice ISIN, paese e anni alla scadenza; la didascalia cita la BCE", /DE[A-Z0-9]{10} · Germania · (.* anni|meno di un anno) alla scadenza · prezzo stimato/.test(rDE[0]) && /curva dei titoli di Stato AAA della BCE/.test(await p.evaluate(() => document.querySelector(".bd-count").textContent)), rDE[0]);
await pick("f2", "Lunga (oltre 10 anni)"); await wait(150);
t("Germania + scadenza lunga: solo titoli oltre 10 anni", (await rows()).length > 3 && (await rows()).every(r => /\b(1\d|[2-9]\d),\d anni/.test(r)), JSON.stringify((await rows()).slice(0, 2)));
t("i conteggi della scadenza senza paese non contano i titoli esteri nascosti", !/\((1[5-9]\d|[2-9]\d\d)\)/.test(scad0), scad0);
const add = async rx => p.evaluate(rx => { const x = [...document.querySelectorAll(".bd-clist .bd-it")].find(b => new RegExp(rx).test(b.innerText)); if (!x) return false; x.click(); return true; }, rx);
const a1 = await add("Bund 2,6% 15/08/2035|Bund");
await pick("f2", ""); await pick("f1", "OAT (Francia)"); await wait(150);
t("Francia: solo OAT", (await rows()).every(r => /^FR OAT/.test(r)) && (await count()) >= 40);
const a2b = await add("OAT 3% 25/05/2033|OAT 3");
await pick("f1", "Bonos (Spagna)"); await wait(150);
t("Spagna: solo Bonos", (await rows()).every(r => /^ES Bonos/.test(r)) && (await count()) >= 40);
const a3b = await add("Bonos 3,15% 30/04/2035|Bonos 3");
await search("Bund 2,5%"); await wait(400);
t("la ricerca trova i Bund anche senza scegliere il paese", (await rows()).some(r => /Bund 2,5%/.test(r)), JSON.stringify((await rows()).slice(0, 3)));
await search("");
t("tre titoli di Stato esteri aggiunti al portafoglio", a1 && a2b && a3b, [a1, a2b, a3b].join());
const codes = await p.evaluate(() => [...document.querySelectorAll("#bdRows input[list]")].map(i => i.value).filter(Boolean));
t("le righe hanno ISIN (Germania, Francia) o il simbolo della stima (Spagna)", codes.some(c => /^DE/.test(c)) && codes.some(c => /^FR/.test(c)) && codes.some(c => /^BONOS:/.test(c)), JSON.stringify(codes));
await p.evaluate(() => document.getElementById("bdEq").click()); await wait(200);
await p.screenshot({ path: `${OUT}/titoli-esteri-1.jpg`, type: "jpeg", quality: 70 });
await p.click("#bdGo");
const inLab = await p.waitForFunction(() => document.body.dataset.scene === "lab" && !document.getElementById("lab").hidden, { timeout: 120000 }).then(() => true).catch(() => false);
const st = await p.evaluate(() => window.__pos.state());
t("arriva al laboratorio con i tre titoli", inLab && (st.assets || []).length === 3, (st.assets || []).join(","));
t("etichette del laboratorio: Bund, OAT, Bonos", (st.assets || []).some(a => /^Bund /.test(a)) && (st.assets || []).some(a => /^OAT /.test(a)) && (st.assets || []).some(a => /^Bonos /.test(a)), (st.assets || []).join(","));
const log = await p.evaluate(() => document.body.textContent);
t("il registro spiega la stima con la curva AAA e lo scarto del paese", /curva dei titoli di Stato AAA dell'area euro più lo scarto della Germania/.test(log) || /scarto della Germania/.test(JSON.stringify(st)), "");
await wait(4000); await p.screenshot({ path: `${OUT}/titoli-esteri-2.jpg`, type: "jpeg", quality: 70 });
/* BCE ferma: si usa lo storico nel sito, niente errori */
t("nessun errore JavaScript", !errs.length, errs.join(" | "));
await b.close(); srv.kill();
console.log(`\n${pass} superati, ${fail} falliti`); process.exit(fail ? 1 : 0);
