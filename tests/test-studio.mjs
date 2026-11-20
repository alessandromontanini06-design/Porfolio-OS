// Studio del consulente nel browser: voce «Studio» solo da consulente, adeguatezza nei Risultati, questionario del profilo,
// dichiarazione di adeguatezza, portafogli modello (dal laboratorio, da un esempio, nel costruttore), clienti e avvisi.
// Uso: node test-studio.mjs   (usa files/PAC_due_fogli_righe_vuote.xlsx creato da test-pac.mjs; prezzi veri)
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const here = path.dirname(fileURLToPath(import.meta.url)), PORT = 5311, wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const t = (name, ok, info = "") => { if (ok) { pass++; console.log("  ok      " + name); } else { fail++; console.log(`  FALLITO ${name} ${info}`); } };
const file = path.join(here, "files", "PAC_due_fogli_righe_vuote.xlsx");
if (!fs.existsSync(file)) { console.error("Manca il file: lancia prima test-pac.mjs"); process.exit(1); }
const shots = process.argv[2]; if (shots) fs.mkdirSync(shots, { recursive: true });
const srv = spawn(process.execPath, [path.join(here, "serve.mjs")], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const errs = [];
try {
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept());
  await p.evaluateOnNewDocument(() => { window.print = () => { window.__stampato = (window.__stampato || 0) + 1; }; if (!sessionStorage.getItem("st")) { localStorage.clear(); localStorage.setItem("pos-ruolo-v1", "pro"); sessionStorage.setItem("st", "1"); } });
  await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await wait(2500);
  await p.evaluate(() => window.__saved.clear());
  const shot = async n => { if (shots) await p.screenshot({ path: path.join(shots, `studio-${n}.png`) }); };
  const vis = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && e.offsetParent !== null && !e.hidden; }, sel);

  /* 1. voce Studio e pagina vuota */
  t("da consulente c'è la voce «Studio» nel menu", await vis("#navStudio"));
  await p.click("#navStudio"); await wait(1200);
  t("lo Studio vuoto spiega cosa fare", await p.evaluate(() => /studio è vuoto/i.test(document.getElementById("stBody").innerText)));

  /* 2. laboratorio e adeguatezza senza profilo */
  await (await p.$("#file")).uploadFile(file);
  await p.waitForFunction(() => window.__pos.state().rebuilt, { timeout: 120000 }).catch(() => {});
  await p.evaluate(() => document.querySelector('.dock [data-go="map"]').click()); await wait(1200);
  await p.waitForFunction(() => !document.getElementById("confirmBtn").disabled, { timeout: 60000 });
  await p.evaluate(() => document.getElementById("confirmBtn").click());
  await p.waitForFunction(() => !document.getElementById("lab").hidden, { timeout: 60000 }); await wait(1800);
  t("nei Risultati c'è il riquadro dell'adeguatezza", await p.evaluate(() => !document.getElementById("adeCard").hidden));
  const n0 = await p.evaluate(() => +(document.querySelector("#adeCard .st-ade-k b") || {}).textContent);
  t("senza profilo mostra il numero di rischio del portafoglio e chiede il profilo", n0 >= 1 && n0 <= 100 && await p.evaluate(() => /Compila il profilo/.test(document.getElementById("adeCard").innerText)), String(n0));
  t("l'indice del laboratorio ha la voce Adeguatezza", await p.evaluate(() => /Adeguatezza/.test((document.getElementById("labIdx") || {}).innerText || "")));

  /* 3. questionario: profilo prudente (29) */
  await p.evaluate(() => document.querySelector('[data-stact="profilo"]').click()); await wait(500);
  t("il questionario si apre con 8 domande", await p.evaluate(() => document.getElementById("stPr").classList.contains("open") && document.querySelectorAll("#stPr .st-q").length === 8));
  t("prima di rispondere a tutto non si può salvare", await p.evaluate(() => document.getElementById("stPrSave").disabled));
  const ans = { hor: 1, obj: 0, loss: 1, react: 1, exp: 1, know: 1, res: 1, share: 1 };
  for (const [k, v] of Object.entries(ans)) { await p.evaluate((k, v) => document.querySelector(`[data-stq="${k}"][data-stv="${v}"]`).click(), k, v); await wait(60); }
  await p.evaluate(() => { document.getElementById("stPrNome").value = "Mario Bianchi"; });
  t("il profilo calcolato è 29, prudente", await p.evaluate(() => /29/.test(document.getElementById("stPrRes").innerText) && /Prudente/.test(document.getElementById("stPrRes").innerText)));
  await shot("questionario");
  await p.evaluate(() => document.getElementById("stPrSave").click()); await wait(800);
  const ade = await p.evaluate(() => ({ esito: (document.querySelector("#adeCard .st-esito") || {}).textContent, n: document.querySelectorAll("#adeCard .st-checks li").length, txt: document.getElementById("adeCard").innerText }));
  t("dopo il profilo: esito e controlli (rischio, perdita, orizzonte, concentrazione, complessi)", !!ade.esito && ade.n >= 5 && /Rischio/.test(ade.txt) && /Perdita sopportabile/.test(ade.txt) && /Orizzonte/.test(ade.txt), JSON.stringify(ade).slice(0, 300));
  t("il riquadro mostra il nome del cliente", /Mario Bianchi/.test(ade.txt));
  await p.evaluate(() => document.getElementById("adeCard").scrollIntoView()); await wait(400); await shot("adeguatezza");

  /* 4. dichiarazione di adeguatezza */
  const dich = await p.evaluate(() => window.__dichiarazione() || "");
  t("dichiarazione: titolo, cliente, risposte, controlli, firme", /Dichiarazione di adeguatezza/.test(dich) && /Mario Bianchi/.test(dich) && /Motivazione del consulente/.test(dich) && /Il cliente/.test(dich) && /Fra quanto tempo/.test(dich));
  await p.evaluate(() => document.querySelector('[data-stact="dich"]').click()); await wait(400);
  t("il pulsante prepara la stampa", await p.evaluate(() => window.__stampato === 1 && /Dichiarazione di adeguatezza/.test(document.getElementById("report").innerText)));

  /* 5. salva il cliente e il portafoglio come modello */
  await p.evaluate(() => { const i = document.getElementById("svName"); if (i) { i.value = "Mario Bianchi"; document.querySelector('[data-sv="yes"]').click(); } }); await wait(900);
  let L = await p.evaluate(() => window.__saved.list().then(a => a.map(r => ({ id: r.id, name: r.name, prof: !!(r.profilo && r.profilo.ans) }))));
  t("il cliente salvato tiene il profilo", L.length === 1 && L[0].prof, JSON.stringify(L));
  await p.evaluate(() => document.querySelector('[data-stact="modello"]').click()); await wait(300);
  let M = await p.evaluate(() => JSON.parse(localStorage.getItem("pos-modelli-v1") || "[]"));
  t("«Salva come portafoglio modello» crea un modello con i pesi del laboratorio", M.length === 1 && Math.abs(M[0].righe.reduce((a, r) => a + r[1], 0) - 100) < 0.6, JSON.stringify(M));

  /* 6. Studio con il cliente */
  await p.click("#navStudio"); await wait(1500);
  const st = await p.evaluate(() => ({ txt: document.getElementById("stBody").innerText, rows: document.querySelectorAll("#stBody .st-t tbody tr").length, kpi: [...document.querySelectorAll("#stBody .st-kpis .v")].map(e => e.textContent) }));
  t("lo Studio elenca il cliente con valore e profilo", st.rows === 1 && /Mario Bianchi/.test(st.txt) && /29 · prudente/.test(st.txt), st.txt.slice(0, 300));
  t("riquadri: patrimonio seguito e 1 cliente", st.kpi[1] === "1" && /€/.test(st.kpi[0]), JSON.stringify(st.kpi));
  t("il modello salvato compare tra i portafogli modello", /Come PAC_due_fogli|Modello dal laboratorio/.test(st.txt));
  await p.select("#stEs", "1"); await wait(800);
  M = await p.evaluate(() => JSON.parse(localStorage.getItem("pos-modelli-v1") || "[]"));
  t("si aggiunge un modello da un esempio (60/40)", M.length === 2 && M[1].nome === "60/40", JSON.stringify(M.map(m => m.nome)));
  const recId = L[0].id;
  await p.select(`[data-stmod="${recId}"]`, M[1].id); await wait(1000);
  const asg = await p.evaluate(id => window.__saved.list().then(a => a.find(r => r.id === id).modello), recId);
  t("il modello si assegna al cliente", asg === M[1].id);
  t("la tabella mostra lo scarto dal modello", await p.evaluate(() => /scarto max/.test(document.getElementById("stBody").innerText)));

  /* 7. avvisi: revisione scaduta */
  await p.evaluate(id => new Promise(ok => { const r = indexedDB.open("portfolio-os", 1); r.onsuccess = () => { const tx = r.result.transaction("analisi", "readwrite"), st = tx.objectStore("analisi"), g = st.get(id); g.onsuccess = () => { const x = g.result; x.reviewedAt = Date.now() - 400 * 864e5; st.put(x); }; tx.oncomplete = ok; }; }), recId);
  await p.click('.dock [data-go="home"]'); await wait(600); await p.click("#navStudio"); await wait(1500);
  const al = await p.evaluate(() => [...document.querySelectorAll("#stBody .st-al li")].map(li => li.innerText.replace(/\s+/g, " ")));
  t("avviso «revisione scaduta» in cima", al.length >= 1 && /revisione scaduta/.test(al[0]), JSON.stringify(al));
  t("avviso sul rischio se il portafoglio supera il profilo", n0 - 29 <= 5 || al.some(a => /rischio sopra il profilo/.test(a)), `${n0} ${JSON.stringify(al)}`);
  await shot("pagina");

  /* 8. modello nel costruttore */
  await p.evaluate(id => document.querySelector(`[data-stbuild="${id}"]`).click(), M[1].id); await wait(800);
  const bd = await p.evaluate(() => [...document.querySelectorAll("#bdRows input[list]")].map(i => i.value));
  t("«Apri nel costruttore» carica gli strumenti del modello", bd.join() === "SWDA,AGGH", JSON.stringify(bd));
  await p.keyboard.press("Escape"); await p.evaluate(() => { const x = document.querySelector("#builder .x, #closeBuilder"); x && x.click(); }); await wait(400);

  /* 9. elimina con conferma */
  await p.evaluate(id => document.querySelector(`[data-stdelask="${id}"]`).click(), M[0].id); await wait(500);
  await p.evaluate(id => document.querySelector(`[data-stdel="${id}"]`).click(), M[0].id); await wait(500);
  t("eliminare un modello chiede conferma e poi lo toglie", (await p.evaluate(() => JSON.parse(localStorage.getItem("pos-modelli-v1")).length)) === 1);

  /* 10. da privato la voce sparisce */
  await p.evaluate(() => { localStorage.setItem("pos-ruolo-v1", "priv"); document.body.dataset.ruolo = "priv"; }); await wait(500);
  t("da privato niente voce «Studio» e si torna alla home", !(await vis("#navStudio")) && await p.evaluate(() => document.body.dataset.scene === "home"));
  t("nessun errore JavaScript", errs.length === 0, errs.join(" | "));
} catch (e) { fail++; console.log("ERRORE", e.message); }
finally { await b.close(); srv.kill(); }
console.log(`\n${pass} superati, ${fail} falliti`);
process.exit(fail ? 1 : 0);
