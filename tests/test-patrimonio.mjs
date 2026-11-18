// «Il mio patrimonio»: si crea senza Excel, resta nel browser e si riapre da solo al ritorno.
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
const PORT = 5214, wait = ms => new Promise(r => setTimeout(r, ms)), SHOTS = process.argv[2] || "";
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
let pass = 0, fail = 0; const t = (n, ok, info = "") => { if (ok) { pass++; console.log("  ok      " + n); } else { fail++; console.log(`  FALLITO ${n} ${info}`); } };
try {
  const p = await b.newPage(); await p.setViewport({ width: 1366, height: 900 });
  const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept());
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" });
  t("senza patrimonio la home resta la home", !(await p.$eval("#patrimonio", e => e.classList.contains("open"))));
  t("in home c'è «Crea il tuo patrimonio»", /Crea il tuo patrimonio/.test(await p.$eval("#pmBtn", e => e.innerText)));
  await p.click("#pmBtn"); await wait(500);
  const W = ms => p.evaluate(m => new Promise(r => setTimeout(r, m)), ms);
  const msg = () => p.$eval("#pmMsg", e => e.textContent);
  const fill = async (vals) => { for (const [k, v] of Object.entries(vals)) await p.$eval(`#pmForm [name=${k}]`, (e, v) => { e.value = v; e.dispatchEvent(new Event("change", { bubbles: true })); }, v); };
  const submit = async () => { await p.$eval("#pmForm", f => f.requestSubmit()); for (let i = 0; i < 40; i++) { await wait(250); const m = await msg(); if (/Salvat|Aggiunt|Non |Ne possiedi|Scrivi|Nuova/.test(m)) return m; } return await msg(); };
  /* acquisto riconosciuto da elenco, prezzo precompilato */
  await fill({ str: "VWCE · Vanguard FTSE All-World (Acc)" });
  await p.waitForFunction(() => !/verifico/.test(document.getElementById("pmHint").textContent) && document.getElementById("pmHint").textContent, { timeout: 30000 });
  t("strumento riconosciuto", /✓ Vanguard/.test(await p.$eval("#pmHint", e => e.textContent)), await p.$eval("#pmHint", e => e.textContent));
  t("prezzo precompilato con l'ultimo prezzo", !!(await p.$eval("#pmForm [name=prezzo]", e => e.value)));
  await fill({ qta: "20", prezzo: "100", data: "2024-11-18", spese: "2,95" });
  t("acquisto salvato", /Salvato: 20 quote/.test(await submit()));
  /* vendita: non si vende più di quanto si possiede */
  await p.click('[data-pmt="vendita"]'); await wait(100);
  await fill({ qta: "30", prezzo: "120", data: "2025-06-02" });
  t("vendita oltre le quote rifiutata", /Ne possiedi 20/.test(await submit()));
  t("la pagina non si ricarica inviando il modulo", (await p.url()) === `http://localhost:${PORT}/`);
  await fill({ qta: "5", prezzo: "120", data: "2025-06-02" });
  t("vendita salvata", /vendita di 5 quote/.test(await submit()));
  /* bene senza quotazione, numeri all'italiana */
  await p.click('[data-pmt="bene"]'); await wait(100);
  await fill({ nome: "Appartamento", valore: "200.000", data: "2020-03-01" });
  t("«200.000» letto come duecentomila", /200\.000 €/.test(await submit()), await msg());
  await W(1500);
  const k1 = await p.$eval("#pmKpis", e => e.innerText);
  t("patrimonio, guadagno e TIR in alto", /Patrimonio oggi/.test(k1) && /Guadagno/.test(k1) && /TIR/.test(k1), k1.replace(/\n/g, " | "));
  const ops = await p.$$eval("#pmOps tbody tr", r => r.length);
  t("storico con 3 operazioni", ops === 3, ops);
  /* annullare senza cancellare */
  await p.$$eval("[data-pmdel]", bs => bs.find(b => /Vendita/.test(b.closest("tr").innerText)).click()); await wait(300);
  t("vendita annullata ma ancora nello storico", await p.$$eval("#pmOps tr.gone", r => r.length) === 1);
  t("di nuovo 20 quote", /\b20\b/.test(await p.$eval("#pmPos", e => e.innerText)));
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem("pos-patrimonio-v1")).operazioni.length);
  t("operazioni salvate nel browser (annullamento compreso)", stored === 4, stored);
  await wait(800); const k2 = await p.$eval("#pmKpis", e => e.innerText);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/pm-desktop.jpg`, type: "jpeg", quality: 70 });
  /* il giorno dopo: si riapre da solo */
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" }); await wait(1200);
  t("al ritorno il patrimonio si apre da solo", await p.$eval("#patrimonio", e => e.classList.contains("open")));
  await wait(800); const k3 = await p.$eval("#pmKpis", e => e.innerText);
  t("…con gli stessi numeri", k3.split("\n")[1] === k2.split("\n")[1], `${k2.split("\n")[1]} / ${k3.split("\n")[1]}`);
  await p.click("#pmClose"); await wait(400);
  t("in home il pulsante mostra il valore", /Il mio patrimonio · /.test(await p.$eval("#pmBtn", e => e.innerText)));
  await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await wait(800);
  t("con ?home si resta in home", !(await p.$eval("#patrimonio", e => e.classList.contains("open"))));
  /* dal patrimonio al laboratorio */
  await p.click("#pmBtn"); await wait(600); await p.click("#pmLab");
  await p.waitForFunction(() => window.__pos.state().rebuilt, { timeout: 120000 });
  const st = await p.evaluate(() => window.__pos.state());
  t("il laboratorio analizza le posizioni quotate (senza la casa)", JSON.stringify(st.portfolio) === JSON.stringify(["VWCE→VWCE.AMS"]), JSON.stringify(st.portfolio));
  /* telefono */
  await p.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" }); await wait(1500);
  const ov = await p.$eval("#patrimonio", e => e.scrollWidth - e.clientWidth);
  t("telefono: nessuno scorrimento orizzontale", ov <= 0, ov);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/pm-telefono.jpg`, type: "jpeg", quality: 70 });
  t("nessun errore JavaScript", !errs.length, errs.join(" | "));
} catch (e) { t("eccezione", false, e.message); }
await b.close(); srv.kill();
console.log(`\n${pass} superati, ${fail} falliti`);
process.exit(fail ? 1 : 0);
