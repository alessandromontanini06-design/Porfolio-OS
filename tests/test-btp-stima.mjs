// BTP a tasso fisso con il prezzo STIMATO dalla curva dei rendimenti della Banca d'Italia (copia salvata in files/bdi-curva.json, dati al 30/10/2026).
// Motore: prezzi calcolati a mano (Python, stesse formule), rendimento a scadenza, allineamento a un prezzo vero, indice con le cedole, tipi di titolo.
// Sito: un file con ETF e BTP arriva al laboratorio con i BTP dentro le analisi (il BTP Italia resta fuori, spiegato);
// il costruttore ha i BTP del MEF nella scheda «Obbligazioni» e riconosce l'ISIN di un BTP scritto a mano.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const [,, OUT] = process.argv, PORT = +(process.env.TEST_PORT || 5181), wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
const near = (a, b, e) => Math.abs(a - b) <= e;

/* ---------- motore ---------- */
const { POS } = await import(new URL("../js/engine.js", import.meta.url));
const C = JSON.parse(fs.readFileSync(import.meta.dirname + "/files/bdi-curva.json", "utf-8"));
t("curva della Banca d'Italia: mesi dal 1994, 3-5-10-30 anni, dati al 30/10/2026", C.mesi.length > 380 && C.scadenze.join() === "3,5,10,30" && C.al === "2026-10-30" && C.fonte === "Banca d'Italia");
const b35 = { cedola: 0.0335, scadenza: "2035-03-01", freq: 2 };
const hand = [["2023-12-29", 97.02], ["2025-06-30", 99.34], ["2026-06-30", 99.18], ["2026-10-30", 92.51]];
t("BTP 3,35% 01/03/2035: stessi prezzi del calcolo a mano (97,02 · 99,34 · 99,18 · 92,51)", hand.every(([d, v]) => near(POS.btpStima(b35, C, d), v, 0.006)), hand.map(([d]) => POS.btpStima(b35, C, d).toFixed(3)).join(" "));
t("a un rendimento uguale alla cedola, il giorno della cedola, il prezzo è 100", near(POS.btpPrezzo(b35, "2027-03-01", 3.35), 100, 0.02), POS.btpPrezzo(b35, "2027-03-01", 3.35));
t("rateo a metà semestre: metà della cedola semestrale (circa 0,84)", near(POS.btpRateo(b35, "2027-06-01"), 1.675 * 92 / 184, 0.01), POS.btpRateo(b35, "2027-06-01"));
t("rendimento a scadenza: inverso del prezzo", near(POS.btpTir(b35, "2026-10-30", POS.btpPrezzo(b35, "2026-10-30", 4.37)), 4.37, 1e-6));
t("rendimento interpolato tra 5 e 10 anni (7,5 anni = metà strada)", near(POS.btpRendimento([3, 5, 10, 30], [3, 4, 5, 6], 7.5), 4.5, 1e-9) && POS.btpRendimento([3, 5, 10, 30], [3, 4, 5, 6], 1) === 3 && POS.btpRendimento([3, 5, 10, 30], [3, 4, 5, 6], 40) === 6);
const sp = POS.btpSpread(b35, C, "2026-10-30", 93);
t("allineamento a un prezzo vero: la stima di quel giorno torna 93,00", Number.isFinite(sp) && near(POS.btpStima(b35, C, "2026-10-30", sp), 93, 0.001), sp);
t("un prezzo assurdo (non su 100) non allinea niente", !Number.isFinite(POS.btpSpread(b35, C, "2026-10-30", 9300)));
const S35 = POS.btpSerie(b35, C, { oggi: "2026-11-18" });
const last = a => a[a.length - 1];
t("serie mensile fino a oggi (novembre con l'ultima curva) e l'indice finisce sul prezzo", last(S35.prezzi).d === "2026-11-18" && last(S35.indice).v === last(S35.prezzi).v && S35.prezzi[0].d >= "2005-03-01", `${S35.prezzi[0].d} → ${last(S35.prezzi).d}`);
const i0 = S35.indice.find(x => x.d >= "2016-01-01"), p0 = S35.prezzi.find(x => x.d >= "2016-01-01");
t("con le cedole reinvestite l'indice rende più del solo prezzo", last(S35.indice).v / i0.v > last(S35.prezzi).v / p0.v + 0.25, `${(last(S35.indice).v / i0.v).toFixed(3)} contro ${(last(S35.prezzi).v / p0.v).toFixed(3)}`);
t("tipi: fisso, indicizzato (BTP Italia, Valore), variabile (CCT), estero (Bund)", POS.btpTipo("BTP 3,35% 01MZ35") === "fisso" && POS.btpTipo("BTP ITALIA GN30") === "indicizzato" && POS.btpTipo("BTP VALORE GN27") === "indicizzato" && POS.btpTipo("CCT EU 15AP29") === "variabile" && POS.btpTipo("BUND 0% 2032", "DE0001102580") === "estero" && POS.btpTipo("", "IT0005383309") === "fisso");
t("simbolo BTP:cedola:scadenza e nome all'italiana", POS.btpSimbolo(b35) === "BTP:3.35:2035-03-01" && POS.btpDaSimbolo("btp:3.35:2035-03-01").cedola === 0.0335 && POS.btpNome(b35) === "BTP 3,35% 01/03/2035");
const L = JSON.parse(fs.readFileSync(import.meta.dirname + "/../js/data/btp.json", "utf-8"));
t("elenco del MEF: oltre 100 BTP a tasso fisso, senza indicizzati né CCT", L.righe.length >= 100 && L.righe.every(r => /^IT\d{10}$/.test(r[0]) && /^BTP( Green| Short)?$/.test(r[1]) && r[4] >= 0 && r[4] < 0.1), L.righe.length);

/* ---------- sito ---------- */
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const br = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const p = await br.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = [];
p.on("pageerror", e => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await p.evaluate(() => localStorage.setItem("pos-save", "0"));
await (await p.$("#file")).uploadFile(import.meta.dirname + "/files/fixture/movimenti-btp.csv");
await p.waitForFunction(() => { const s = window.__pos.state(); return s.rebuilt; }, { timeout: 180000 }).catch(() => {});
await wait(1500);
let st = await p.evaluate(() => window.__pos.state());
t("file con ETF e BTP: i due BTP a tasso fisso hanno i prezzi (stimati)", (st.assets || []).includes("BTP 1,35% apr 2030:price") && (st.assets || []).includes("BTP 3,35% mar 2035:price"), JSON.stringify(st.assets));
t("il BTP 1,35% (solo ISIN) è riconosciuto da OpenFIGI, il 3,35% dal nome «01MZ35»", (st.portfolio || []).some(x => /BTP:1\.35:2030-04-01/.test(x)) && (st.portfolio || []).some(x => /BTP:3\.35:2035-03-01/.test(x)), JSON.stringify(st.portfolio));
const why = await p.evaluate(() => document.body.textContent);
t("il BTP Italia resta fuori, spiegato: le cedole cambiano", /BTP ITALIA GN30[^]{0,40}cedole che cambiano/.test(why));
const log = await p.evaluate(() => (window.__pos.S ? (window.__pos.S.rbLog || []) : []).join(" | "));
await p.evaluate(() => { [...document.querySelectorAll("button")].filter(x => /Procedi senza/i.test(x.textContent)).forEach(x => x.click()); }); await wait(500);
await p.evaluate(() => document.getElementById("confirmBtn").click());
const inLab = await p.waitForFunction(() => !document.getElementById("lab").hidden, { timeout: 60000 }).then(() => true).catch(() => false);
t("arriva al laboratorio", inLab);
await wait(3000);
const bonds = await p.evaluate(() => { const h = [...document.querySelectorAll("h4.look-h")].find(x => /Obbligazioni e titoli di Stato/.test(x.textContent)); return h ? h.parentElement.innerText : ""; });
t("tabella «Obbligazioni e titoli di Stato»: BTP con prezzo stimato e fonte Banca d'Italia", /BTP 1,35% 01\/04\/2030[^]*stimato/.test(bonds) && /Fonte: Banca d'Italia/.test(bonds) && /BTP ITALIA GN30[^]*fuori dalle analisi/.test(bonds), bonds.slice(0, 600));
const hasRisk = await p.evaluate(() => (document.getElementById("metrics") || document.body).innerText);
t("i BTP stanno nella tabella di rischio e rendimento", /BTP 1,35% apr 2030/.test(hasRisk) && /BTP 3,35% mar 2035/.test(hasRisk));
await p.waitForFunction(() => /Obbligazioni/.test((document.getElementById("lookBody") || {}).innerText || ""), { timeout: 30000 }).catch(() => {});
const look = await p.evaluate(() => (document.getElementById("lookBody") || {}).innerText || "");
t("«Dove sei investito»: i BTP contano come obbligazioni italiane", /Obbligazioni/.test(look), look.slice(0, 300));
const cost = await p.evaluate(() => (document.getElementById("costCard") || {}).innerText || "");
t("costi: i BTP non hanno costi annui di gestione", /BTP 1,35% apr 2030[\s\S]{0,160}titolo di Stato: nessun costo di gestione/.test(cost), cost.slice(cost.indexOf("BTP"), cost.indexOf("BTP") + 300));
await p.evaluate(() => { const h = [...document.querySelectorAll("h4.look-h")].find(x => /Obbligazioni e titoli di Stato/.test(x.textContent)); if (h) h.scrollIntoView({ block: "start" }); }); await wait(500);
await p.screenshot({ path: `${OUT}/btp-lab.jpg`, type: "jpeg", quality: 72 });

/* ---------- costruttore ---------- */
await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await wait(2500);
await p.click("#builderBtn"); await wait(600);
const tab = n => p.evaluate(n => [...document.querySelectorAll("[data-bdtab]")].find(x => x.textContent.trim() === n).click(), n);
const pick = (k, v) => p.evaluate((k, v) => { const s = document.querySelector(`[data-bdf="${k}"]`); s.value = v; s.dispatchEvent(new Event("change", { bubbles: true })); }, k, v);
const count = () => p.evaluate(() => +(document.querySelector(".bd-count").textContent.match(/[\d.]+/) || ["0"])[0].replace(/\./g, ""));
const rows = () => p.evaluate(() => [...document.querySelectorAll(".bd-clist .bd-it")].map(b => b.innerText.replace(/\s+/g, " ")));
await tab("Obbligazioni"); await p.waitForFunction(() => [...document.querySelectorAll('[data-bdf="f1"] option')].some(o => /BTP singoli/.test(o.textContent)), { timeout: 15000 }).catch(() => {});
await pick("f1", "BTP singoli"); await wait(200);
t("Obbligazioni → «BTP singoli»: oltre 100 BTP del MEF, con la fonte", (await count()) >= 100 && /elenco del MEF[^]*Banca d'Italia/.test(await p.evaluate(() => document.querySelector(".bd-count").textContent)), await p.evaluate(() => document.querySelector(".bd-count").textContent));
await pick("f2", "Lunga (oltre 10 anni)"); await wait(200);
const lunghi = await rows();
t("filtro Scadenza «Lunga»: solo BTP oltre i 10 anni", lunghi.length >= 10 && lunghi.every(r => /BTP/.test(r) && /\b(1\d|[2-9]\d),\d anni alla scadenza/.test(r)), JSON.stringify(lunghi.slice(0, 3)));
await p.click("#bdClear"); await wait(150);
const search = q => p.evaluate(q => { const i = document.querySelector(".bd-cq"); i.value = q; i.dispatchEvent(new Event("input", { bubbles: true })); }, q);
const add = async (q, must) => { await search(q); await wait(300); return p.evaluate((q, must) => { const b = [...document.querySelectorAll(".bd-clist .bd-it")].find(x => x.innerText.includes(must || q)); if (b) b.click(); return !!b; }, q, must); };
const ok1 = await add("SWDA"), ok2 = await add("IT0005722845", "BTP 3,35% 15/09/2033");
t("dalla ricerca: SWDA e il BTP 3,35% 15/09/2033 (per ISIN)", ok1 && ok2);
t("la riga del BTP mostra nome e «prezzo stimato»", await p.evaluate(() => /BTP 3,35% 15\/09\/2033[^]*prezzo stimato/.test(document.getElementById("bdRows").innerText)), await p.evaluate(() => document.getElementById("bdRows").innerText));
/* ISIN scritto a mano: un BTP Italia non si può stimare, e lo dice */
await p.click("#bdAdd"); await wait(150);
await p.evaluate(() => { const ins = document.querySelectorAll("#bdRows input[list]"), i = ins[ins.length - 1]; i.value = "IT0005497000"; i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); });
await p.waitForFunction(() => /cedole cambiano/.test(document.getElementById("bdRows").innerText), { timeout: 20000 }).catch(() => {});
t("ISIN di un BTP Italia scritto a mano: «le cedole cambiano nel tempo»", await p.evaluate(() => /cedole cambiano/.test(document.getElementById("bdRows").innerText)), await p.evaluate(() => document.getElementById("bdRows").innerText));
await p.evaluate(() => { const d = document.querySelectorAll("[data-bdd]"); d[d.length - 1].click(); }); await wait(150);
for (const [i, w] of [[0, 60], [1, 40]]) { await p.evaluate((i, w) => { const x = document.querySelectorAll("#bdRows input[data-bdw]")[i]; x.value = String(w); x.dispatchEvent(new Event("change", { bubbles: true })); }, i, w); await wait(120); }
await p.screenshot({ path: `${OUT}/btp-costruttore.jpg`, type: "jpeg", quality: 72 });
await p.click("#bdGo");
const inLab2 = await p.waitForFunction(() => document.body.dataset.scene === "lab" && !document.getElementById("lab").hidden, { timeout: 240000 }).then(() => true).catch(() => false);
st = await p.evaluate(() => window.__pos.state());
t("costruttore: SWDA 60% + BTP 40% arriva al laboratorio con il BTP dentro", inLab2 && (st.assets || []).length === 2 && (st.assets || []).some(a => /^BTP 3,35% set 2033/.test(a)), JSON.stringify(st.assets || st.checks));
t("nessun errore JavaScript", !errs.length, errs.join(" | "));
console.log(`\n${pass} superati, ${fail} falliti`);
await br.close(); srv.kill(); process.exit(fail ? 1 : 0);
