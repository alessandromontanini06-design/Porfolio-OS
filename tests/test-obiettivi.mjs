// Simulazioni: più obiettivi nel tempo (casa, studi, auto) con la probabilità di ciascuno sugli stessi futuri simulati.
// Motore: conti fatti a mano con rendimenti costanti (prelievo se basta, altrimenti obiettivo mancato), inflazione, ordine, nessun cambiamento senza obiettivi.
// Sito: esempi da un clic, importi e anni modificabili, probabilità colorate, «Tutti insieme», salvati nel browser, telefono.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const [,, OUT] = process.argv, PORT = +(process.env.TEST_PORT || 5183), wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
const near = (a, b, e) => Math.abs(a - b) <= e;
const { POS } = await import(new URL("../js/engine.js", import.meta.url));

/* ---------- motore: rendimenti costanti, quindi ogni percorso è uguale e i conti si fanno a mano ---------- */
const ret = Array(120).fill(0.005), base = { ret, f: 12, years: 10, initial: 100000, monthly: 0, infl: 0, costs: 0, n: 200, seed: 7 };
const W5 = 100000 * Math.pow(1.005, 60), W10 = (W5 - 50000) * Math.pow(1.005, 60);
let R = POS.monteCarlo({ ...base, obiettivi: [{ nome: "Casa", importo: 50000, anno: 5 }, { nome: "Barca", importo: 200000, anno: 10 }] });
const casa = R.obiettivi.find(g => g.nome === "Casa"), barca = R.obiettivi.find(g => g.nome === "Barca");
t("casa: 50.000 € tra 5 anni con 134.885 € a disposizione → raggiunta in tutti i futuri", casa.prob === 1, JSON.stringify(casa));
t("barca: 200.000 € tra 10 anni, dopo la casa restano 114.537 € → mancata, mancano 85.463 €", barca.prob === 0 && near(barca.mancaMediano, 200000 - W10, 1), JSON.stringify(barca));
t("tutti insieme: 0%", R.probTutti === 0);
t("il patrimonio finale è quello che resta dopo la casa (la barca non si compra)", near(R.final[0], W10, 1), `${R.final[0]} contro ${W10}`);
R = POS.monteCarlo({ ...base, infl: 0.02, obiettivi: [{ nome: "Casa", importo: 50000, anno: 5 }] });
t("con l'inflazione al 2% la casa costa 50.000 × 1,02⁵ = 55.204 € nominali", near(R.final[0], (W5 - 50000 * Math.pow(1.02, 5)) * Math.pow(1.005, 60), 1));
R = POS.monteCarlo({ ...base, initial: 60000, obiettivi: [{ nome: "Prima", importo: 50000, anno: 3 }, { nome: "Seconda", importo: 50000, anno: 3 }] });
t("stesso anno: ha la precedenza il primo scritto", R.obiettivi.find(g => g.nome === "Prima").prob === 1 && R.obiettivi.find(g => g.nome === "Seconda").prob === 0);
R = POS.monteCarlo({ ...base, obiettivi: [{ nome: "Lontano", importo: 1000, anno: 30 }, { nome: "Vuoto", importo: 0, anno: 2 }] });
t("obiettivi oltre gli anni simulati o senza importo: ignorati", R.obiettivi.length === 0 && Number.isNaN(R.probTutti));
const hist = Array.from({ length: 120 }, (_, i) => Math.sin(i * 1.7) * 0.04 + 0.006);
const A = POS.monteCarlo({ ...base, ret: hist, n: 500 }), B = POS.monteCarlo({ ...base, ret: hist, n: 500, obiettivi: [] });
t("senza obiettivi la simulazione non cambia (stessi percorsi, stessi percentili)", JSON.stringify(A.pFinal) === JSON.stringify(B.pFinal));
const Am = POS.monteCarlo({ ...base, years: 5, ret: hist, n: 2000 }), med5 = Am.pFinal[3];
const Rr = POS.monteCarlo({ ...base, ret: hist, n: 2000, obiettivi: [{ nome: "Casa", importo: med5, anno: 5 }] });
t("con rendimenti che oscillano, un obiettivo pari alla mediana a 5 anni riesce in circa metà dei futuri", Rr.obiettivi[0].prob > 0.4 && Rr.obiettivi[0].prob < 0.6, Rr.obiettivi[0].prob);

/* quanto versare: 200.000 € tra 10 anni partendo da 100.000 € al 0,5% al mese → servono (200.000 − 181.940) × 0,005 / 0,8194 = 110,2 € al mese, cioè 120 arrotondando a 10 € per eccesso */
const Vo = { ...base, years: 20, n: 300, obiettivi: [{ id: 0, nome: "Casa", importo: 200000, anno: 10 }] };
t("quanto versare: 110,20 € al mese servono, arrotondati a 120 €", POS.mcVersamentoPer(Vo, 0, 0.8) === 120, POS.mcVersamentoPer(Vo, 0, 0.8));
t("se l'obiettivo riesce già, non serve versare di più", POS.mcVersamentoPer({ ...Vo, obiettivi: [{ id: 0, importo: 50000, anno: 10 }] }, 0, 0.8) === 0);
const Vh = { ...base, ret: hist, years: 15, n: 1000, initial: 20000, monthly: 200, obiettivi: [{ id: 0, importo: 100000, anno: 15 }] }, vh = POS.mcVersamentoPer(Vh, 0, 0.8);
const Rv = POS.monteCarlo({ ...Vh, monthly: 200 + vh });
t("con quel versamento in più l'obiettivo riesce almeno 8 volte su 10", vh > 0 && Rv.obiettivi[0].prob >= 0.79, `${vh} € → ${Rv.obiettivi[0].prob}`);

/* ---------- sito ---------- */
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1366, height: 900 }); const errs = [];
p.on("pageerror", e => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await p.evaluate(() => localStorage.removeItem("pos-obiettivi-v1"));
await wait(2500);
await p.evaluate(() => document.getElementById("sampleBtn").click());
await p.waitForFunction(() => /ricostruito/.test(document.getElementById("dsName").innerText) && !document.getElementById("confirmBtn").disabled, { timeout: 150000 });
await p.evaluate(() => document.querySelectorAll("select.need").forEach(x => { x.value = "ignore"; x.dispatchEvent(new Event("change", { bubbles: true })); }));
await p.evaluate(() => document.getElementById("confirmBtn").click());
await p.waitForFunction(() => !document.getElementById("navLab").classList.contains("off"), { timeout: 30000 });
await wait(1500);
await p.evaluate(() => document.querySelector('.dock [data-go="sim"]').click());
await p.waitForFunction(() => /Mediana dopo/.test((document.getElementById("mcKpis") || {}).innerText || ""), { timeout: 30000 }).catch(() => {});
const card = () => p.evaluate(() => (document.getElementById("mcGoals") || {}).innerText || "");
t("riquadro «Obiettivi nel tempo» con esempi da un clic", /Obiettivi nel tempo/.test(await card()) && await p.evaluate(() => document.querySelectorAll("[data-mcgex]").length === 3));
await p.evaluate(() => document.querySelector('[data-mcgex="0"]').click()); await wait(600);
await p.evaluate(() => document.querySelector('[data-mcgex]') ? 0 : document.querySelector("[data-mcgadd]").click()); await wait(300);
let rows = await p.evaluate(() => [...document.querySelectorAll("#mcGoals .mcg-row")].map(r => r.innerText.replace(/\s+/g, " ")));
t("clic su «Casa»: un obiettivo con la sua probabilità", rows.length >= 1 && /\d+%/.test(rows[0]), JSON.stringify(rows));
/* scrivo un secondo obiettivo a mano: studi, 30.000 € tra 12 anni */
const last = () => p.evaluate(() => document.querySelectorAll("#mcGoals .mcg-row").length - 1);
if ((await p.evaluate(() => document.querySelectorAll("#mcGoals .mcg-row").length)) < 2) { await p.evaluate(() => document.querySelector("[data-mcgadd]").click()); await wait(300); }
const k = await last();
await p.evaluate(k => { const r = document.querySelectorAll("#mcGoals .mcg-row")[k]; const set = (sel, v) => { const i = r.querySelector(sel); i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); }; set(".mcg-n", "Studi"); set(".mcg-a input", "30000"); set(".mcg-y input", "12"); }, k);
await wait(1200);
rows = await p.evaluate(() => [...document.querySelectorAll("#mcGoals .mcg-row")].map(r => ({ t: r.innerText.replace(/\s+/g, " "), n: r.querySelector(".mcg-n").value, a: r.querySelector(".mcg-a input").value, y: r.querySelector(".mcg-y input").value })));
t("secondo obiettivo scritto a mano: Studi, 30.000 € tra 12 anni, con la probabilità", rows.length === 2 && rows[1].n === "Studi" && rows[1].a === "30000" && rows[1].y === "12" && /\d+%/.test(rows[1].t), JSON.stringify(rows));
t("mentre si scrive il campo non perde il cursore (niente ridisegno completo)", await p.evaluate(() => document.activeElement && document.activeElement.closest && !!document.activeElement.closest("#mcGoals")));
t("«Tutti insieme» con due obiettivi", /Tutti insieme: \d+%/.test(await card()), await card());
const saved = await p.evaluate(() => JSON.parse(localStorage.getItem("pos-obiettivi-v1") || "[]"));
t("gli obiettivi restano nel browser", saved.length === 2 && saved[1].nome === "Studi" && saved[1].importo === 30000 && saved[1].anno === 12, JSON.stringify(saved));
/* obiettivo enorme: probabilità rossa */
await p.evaluate(() => { const r = document.querySelectorAll("#mcGoals .mcg-row")[1], i = r.querySelector(".mcg-a input"); i.value = "5000000"; i.dispatchEvent(new Event("input", { bubbles: true })); }); await wait(1200);
t("5 milioni tra 12 anni: probabilità bassa, in rosso, con quanto manca", await p.evaluate(() => { const r = document.querySelectorAll("#mcGoals .mcg-row")[1]; return !!r.querySelector(".mcg-p b.bad") && /mancano circa/.test(r.innerText); }));
await p.waitForFunction(() => /in più al mese/.test(document.querySelectorAll("#mcGoals .mcg-row")[1].innerText), { timeout: 20000 }).catch(() => {});
t("…e quanto versare in più al mese per arrivarci 8 volte su 10", await p.evaluate(() => /per arrivarci 8 volte su 10: circa [\d.]+ € in più al mese/.test(document.querySelectorAll("#mcGoals .mcg-row")[1].innerText)), await p.evaluate(() => document.querySelectorAll("#mcGoals .mcg-row")[1].innerText));
await p.evaluate(() => document.getElementById("mcGoals").scrollIntoView({ block: "center" })); await wait(400);
await p.screenshot({ path: `${OUT}/obiettivi-pc.jpg`, type: "jpeg", quality: 72 });
const rep = await p.evaluate(() => window.__report({}) || "");
t("report PDF: sezione «Gli obiettivi» con probabilità e quanto versare", /<h2>Gli obiettivi<\/h2>/.test(rep) && /Casa/.test(rep) && /Studi/.test(rep) && /in più al mese/.test(rep) && /Tutti insieme/.test(rep), rep.slice(rep.indexOf("Gli obiettivi"), rep.indexOf("Gli obiettivi") + 400));
await p.evaluate(() => document.querySelectorAll("[data-mcgdel]")[1].click()); await wait(800);
t("«×» toglie l'obiettivo", await p.evaluate(() => document.querySelectorAll("#mcGoals .mcg-row").length === 1 && JSON.parse(localStorage.getItem("pos-obiettivi-v1")).length === 1));
/* report senza aver aperto le simulazioni: una pagina nuova con gli obiettivi salvati */
const p3 = await b.newPage(); await p3.setViewport({ width: 1366, height: 900 }); p3.on("pageerror", e => errs.push(e.message));
await p3.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await wait(2500);
await p3.evaluate(() => document.getElementById("sampleBtn").click());
await p3.waitForFunction(() => /ricostruito/.test(document.getElementById("dsName").innerText) && !document.getElementById("confirmBtn").disabled, { timeout: 150000 });
await p3.evaluate(() => document.querySelectorAll("select.need").forEach(x => { x.value = "ignore"; x.dispatchEvent(new Event("change", { bubbles: true })); }));
await p3.evaluate(() => document.getElementById("confirmBtn").click());
await p3.waitForFunction(() => !document.getElementById("navLab").classList.contains("off"), { timeout: 30000 }); await wait(1500);
const rep3 = await p3.evaluate(() => window.__report({}) || "");
t("report senza aprire le simulazioni: gli obiettivi salvati ci sono lo stesso", /<h2>Gli obiettivi<\/h2>/.test(rep3) && /Casa/.test(rep3), rep3.length);
await p3.close();
await p.setViewport({ width: 390, height: 844 }); await wait(600);
await p.evaluate(() => document.getElementById("mcGoals").scrollIntoView({ block: "center" })); await wait(300);
await p.screenshot({ path: `${OUT}/obiettivi-tel.jpg`, type: "jpeg", quality: 72 });
t("sul telefono niente esce dallo schermo", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll("#mcGoals .mcg-row *")].every(e => e.getBoundingClientRect().right <= innerWidth + 1)));
t("nessun errore JavaScript", !errs.length, errs.join(" | "));
console.log(`\n${pass} superati, ${fail} falliti`);
await b.close(); srv.kill(); process.exit(fail ? 1 : 0);
