// Promemoria del PAC: il giorno del piano il sito propone il modulo già pronto, l'utente scrive le quote vere.
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
const PORT = 5221, wait = ms => new Promise(r => setTimeout(r, ms)), SHOTS = process.argv[2] || "";
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
let pass = 0, fail = 0; const t = (n, ok, info = "") => { if (ok) { pass++; console.log("  ok      " + n); } else { fail++; console.log(`  FALLITO ${n} ${info}`); } };
/* date relative a oggi: il piano parte tre mesi fa, il giorno 1; il primo mese è già nel registro (acquisto il giorno 3, come da un file) */
const iso = d => d.toISOString().slice(0, 10), now = new Date(), m = k => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + k, 1));
const dal = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 15))), g1 = iso(m(-2)), g2 = iso(m(-1)), g3 = iso(m(0));
const db = { v: 1, creato: new Date().toISOString(), strumenti: { "IE00BK5BQT80": { nome: "Vanguard FTSE All-World (Acc)", ticker: "VWCE", isin: "IE00BK5BQT80", simbolo: "VWCE.AMS", valuta: "EUR", classe: "Azioni" } },
  operazioni: [{ id: "a1", data: iso(new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 10))), tipo: "acquisto", strumento: "IE00BK5BQT80", quantita: 10, prezzo: 100 },
    { id: "a2", data: g1.slice(0, 8) + "03", tipo: "acquisto", strumento: "IE00BK5BQT80", quantita: 0.8, prezzo: 125, origine: "file" }],
  pac: [{ id: "p1", strumento: "IE00BK5BQT80", importo: 100, giorno: 1, dal, fatti: {} }] };
try {
  const p = await b.newPage(); await p.setViewport({ width: 1366, height: 900 });
  const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept());
  await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" });
  await p.evaluate(d => localStorage.setItem("pos-patrimonio-v1", JSON.stringify(d)), db);
  await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await wait(800);
  t("in home il pulsante del patrimonio segnala i PAC da registrare", /2 PAC da registrare/.test(await p.$eval("#pmBtn", e => e.innerText)), await p.$eval("#pmBtn", e => e.innerText));
  await p.click("#mnuBtn"); await wait(300);
  t("anche il menu in alto lo segnala", /2 PAC da registrare/.test(await p.$eval("#mnuDash", e => e.innerText)) && !!(await p.$("#mnuLbl .mnu-dot")));
  await p.keyboard.press("Escape");
  await p.click("#pmBtn"); await wait(1500);
  const due = await p.$$eval("#pmPacDue .pac-row", r => r.map(x => x.innerText.replace(/\s+/g, " ")));
  t("il mese già registrato dal file non viene chiesto: restano 2 PAC", due.length === 2 && !due.some(x => x.includes(g1.split("-").reverse().join("/"))), JSON.stringify(due));
  t("importo già scritto, quote da scrivere", await p.$eval("#pmPacDue .pac-row [name=imp]", e => e.value) === "100" && await p.$eval("#pmPacDue .pac-row [name=qta]", e => e.value) === "");
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/pac-promemoria.jpg`, type: "jpeg", quality: 75 });
  await p.$eval("#pmPacDue .pac-row [name=qta]", e => { e.value = "0,8"; });
  await p.$eval("#pmPacDue .pac-row", f => f.requestSubmit()); await wait(800);
  const ops = await p.evaluate(() => JSON.parse(localStorage.getItem("pos-patrimonio-v1")).operazioni.filter(o => o.origine === "pac"));
  t("«Registra» salva l'acquisto: 0,8 quote a 125 €, alla data del PAC", ops.length === 1 && ops[0].quantita === 0.8 && Math.abs(ops[0].prezzo - 125) < 1e-9 && ops[0].data === g2, JSON.stringify(ops));
  t("resta un solo PAC da registrare", await p.$$eval("#pmPacDue .pac-row", r => r.length) === 1);
  await p.click("#pmPacDue [data-pacskip]"); await wait(500);
  t("«Salta» lo toglie senza aggiungere operazioni", await p.$eval("#pmPacDue", e => e.hidden) && await p.evaluate(() => JSON.parse(localStorage.getItem("pos-patrimonio-v1")).operazioni.length) === 3);
  const lista = await p.$eval("#pmPacList", e => e.innerText.replace(/\s+/g, " "));
  t("nella lista dei piani: importo, giorno e prossimo PAC", /100 €/.test(lista) && /giorno 1/.test(lista) && /tra \d+ giorni|domani|oggi/.test(lista), lista.slice(0, 200));
  /* un piano nuovo: il primo promemoria arriva al prossimo giorno del PAC, non chiede i mesi passati */
  t("con un piano la sezione «Piani di accumulo» si vede", await p.$eval("#pmPac", e => !e.hidden));
  await p.click('[data-pmt="pac"]'); await wait(200);
  await p.$eval("#pmForm [name=imp]", e => { e.value = "30"; }); await p.$eval("#pmForm [name=g]", e => { e.value = "5"; });
  await p.$eval("#pmForm", f => f.requestSubmit()); await wait(500);
  t("un piano nuovo si aggiunge e non chiede i mesi passati", await p.evaluate(() => JSON.parse(localStorage.getItem("pos-patrimonio-v1")).pac.length) === 2 && await p.$eval("#pmPacDue", e => e.hidden || !/PAC/.test(e.innerText) || e.querySelectorAll(".pac-row").length <= 1));
  await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await wait(800);
  t("dopo aver registrato e saltato, la home non segnala più PAC del primo piano", !/2 PAC/.test(await p.$eval("#pmBtn", e => e.innerText)));
  t("nessun errore JavaScript", !errs.length, errs.join(" | "));
} catch (e) { t("eccezione", false, e.message); }
await b.close(); srv.kill();
console.log(`\n${pass} superati, ${fail} falliti`);
process.exit(fail ? 1 : 0);
