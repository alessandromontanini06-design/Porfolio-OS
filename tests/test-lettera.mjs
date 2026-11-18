// Lettera al cliente: bozza con i numeri dell'analisi, tono tu/Lei, nome e firma, riscrittura (simulata) con controllo delle cifre.
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
const PORT = 5208, wait = ms => new Promise(r => setTimeout(r, ms)), SHOT = process.env.SHOT || "", FILE = import.meta.dirname + "/files/video2/Movimenti_titoli_Bianchi.xlsx";
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
let fails = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; };
try {
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = []; p.on("pageerror", e => errs.push(e.message)); let sent = ""; p.on("request", r => { if (/\/api\/letter/.test(r.url())) sent += r.postData() || ""; });
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" });
  await p.evaluate(() => { localStorage.setItem("pos-save", "0"); localStorage.setItem("pos-brand-v1", JSON.stringify({ studio: "Studio Rossi", contact: "info@studiorossi.it" })); localStorage.removeItem("pos-ai-auto"); });
  await (await p.$("#file")).uploadFile(FILE);
  await p.waitForFunction(() => window.__pos.state().rebuilt && window.__pos.state().tx > 100, { timeout: 150000 });
  await p.evaluate(() => document.querySelector('.dock [data-go="map"]').click()); await wait(1200);
  await p.waitForFunction(() => !document.getElementById("confirmBtn").disabled, { timeout: 60000 });
  await p.evaluate(() => document.getElementById("confirmBtn").click());
  await p.waitForFunction(() => !document.getElementById("lab").hidden && !document.getElementById("realCard").hidden, { timeout: 60000 }); await wait(1500);
  for (const [nm, v] of Object.entries({ IWDA: 55, EMIM: 10, "XETRA-GOLD": 10, CNDX: 0, IBGS: 25 })) await p.evaluate((nm, v) => { const inp = [...document.querySelectorAll('#cmpCard input.cmp-w[data-cp="1"]')].find(x => x.closest("tr").querySelector(".an").textContent.trim() === nm); inp.value = v; inp.dispatchEvent(new Event("change", { bubbles: true })); }, nm, v);
  await wait(400);
  await p.evaluate(() => document.getElementById("letterBtn").click()); await wait(500);
  const t1 = await p.evaluate(() => document.getElementById("ltText").value);
  ok(/^Ciao \[NOME\],/.test(t1), "bozza col tu e il segnaposto del nome");
  ok(/80\.953 €/.test(t1) && /156\.194 €/.test(t1) && /\+13,4%/.test(t1), "numeri del rendimento");
  ok(/costano circa il/.test(t1), "costi"); ok(/perso il 17%/.test(t1), "rischio"); ok(/La proposta di cui abbiamo parlato/.test(t1) && /imposte stimate/.test(t1), "proposta e imposte");
  ok(/non garantisce/.test(t1), "avvertenza sui dati storici");
  await p.evaluate(() => document.querySelector('[data-ltt="formale"]').click()); await wait(300);
  const t2 = await p.evaluate(() => document.getElementById("ltText").value);
  ok(/^Gentile \[NOME\],/.test(t2) && /Ha versato|Complessivamente ha/.test(t2) && /Cordiali saluti/.test(t2), "del Lei");
  await p.type("#ltNome", "Marco");
  const fin = await p.evaluate(() => window.__letter.final());
  ok(/^Gentile Marco,/.test(fin) && /Studio Rossi\ninfo@studiorossi.it$/.test(fin), "nome e firma dello studio nel testo finale");
  /* riscrittura simulata: nessuna cifra nuova → nessun avviso */
  await p.evaluate(() => document.getElementById("ltAi").click()); await p.waitForFunction(() => !document.getElementById("ltWarn").hidden, { timeout: 20000 });
  const w1 = await p.evaluate(() => ({ w: document.getElementById("ltWarn").innerText, t: document.getElementById("ltText").value }));
  ok(/cifre sono tutte quelle dell'analisi/.test(w1.w), "riscrittura senza cifre nuove: " + w1.w.slice(0, 60));
  ok(sent.length > 100 && !/Marco/.test(sent) && /\[NOME\]/.test(sent), "il nome non va all'IA (c'è [NOME])");
  /* cifra inventata → avviso */
  await p.evaluate(() => { const t = document.getElementById("ltText"); t.value += " INVENTA"; t.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("ltAi").click(); });
  await wait(1500);
  const w2 = await p.evaluate(() => document.getElementById("ltWarn").innerText);
  ok(/Controlla queste cifre/.test(w2) && /9,9%/.test(w2), "cifra inventata segnalata: " + w2.slice(0, 90));
  if (SHOT) await p.screenshot({ path: SHOT });
  await p.keyboard.press("Escape"); await wait(200);
  ok(await p.evaluate(() => document.getElementById("letter").hidden), "Esc chiude");
  ok(!errs.length, "nessun errore nella pagina " + errs.join(" | "));
} catch (e) { console.log("FAIL", e.message); fails++; }
await b.close(); srv.kill();
console.log(fails ? `${fails} FALLITI` : "tutto ok"); process.exit(fails ? 1 : 0);
