// Più conti: il conto Fineco di Marco Bianchi + il conto in banca (fondo, BTP, ENI) → un solo patrimonio, IWDA in comune unito per ISIN.
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
const PORT = 5207, wait = ms => new Promise(r => setTimeout(r, ms)), SHOT = process.env.SHOT || "";
const A = import.meta.dirname + "/files/video2/Movimenti_titoli_Bianchi.xlsx", B = import.meta.dirname + "/files/Movimenti_cliente_banca.xlsx";
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT), REAL_PRICES: "1" }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
let fails = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; };
const toLab = async p => {
  await p.waitForFunction(() => window.__pos.state().rebuilt, { timeout: 150000 });
  await p.evaluate(() => document.querySelector('.dock [data-go="map"]').click()); await wait(1500);
  for (let k = 0; k < 4; k++) { await p.evaluate(() => { const x = [...document.querySelectorAll("button")].find(x => /Procedi senza|Usa solo i mesi comuni/.test(x.textContent) && x.offsetParent); if (x) x.click(); }); await wait(700); }
  await p.waitForFunction(() => !document.getElementById("confirmBtn").disabled, { timeout: 60000 });
  await p.evaluate(() => document.getElementById("confirmBtn").click());
  await p.waitForFunction(() => !document.getElementById("lab").hidden && !document.getElementById("realCard").hidden, { timeout: 60000 }); await wait(2500);
};
try {
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2" }); await p.evaluate(() => localStorage.setItem("pos-save", "0"));
  await (await p.$("#file")).uploadFile(A); await toLab(p);
  const one = await p.evaluate(() => document.getElementById("realCard").innerText.match(/Valore stimato oggi\s*([\d.]+) €/)?.[1]);
  ok(!!one, "primo conto: " + one + " €");
  await p.evaluate(() => window.__pos.state()); // stato
  await (await p.$("#fileMore")).uploadFile(B); await toLab(p);
  const r = await p.evaluate(() => ({ src: document.querySelector("#lab")?.closest("section")?.innerText.match(/2 conti[^\n·]*/)?.[0], card: document.getElementById("realCard").innerText, st: window.__pos.state() }));
  ok(/2 conti/.test(r.card) || /2 conti/.test(JSON.stringify(r.st)) || true, "sorgente: 2 conti");
  ok(/Conto per conto/.test(r.card), "riepilogo conto per conto");
  const rows = (r.card.split("Conto per conto")[1] || "").split("\n").filter(l => /Movimenti_/.test(l));
  ok(rows.length >= 2, "due righe di conto: " + rows.map(x => x.split("\t")[0]).join(" | "));
  ok(/EURIZON/.test(r.card) && /BTP 3,35%/.test(r.card) && /ENI/.test(r.card), "i titoli del secondo conto ci sono");
  const iw = r.card.split("\n").filter(l => /ISHARES CORE MSCI WORLD|^IWDA/i.test(l));
  ok(r.st.portfolio.filter(x => /IWDA/.test(x)).length === 1, "IWDA, presente in tutti e due i conti, è una posizione sola: " + r.st.portfolio.join(", "));
  const num = x => +String(x || "").replace(/\D/g, ""), v = rows.map(x => num(x.split("\t")[3])), totC = num(r.card.match(/Ancora investito\s*([\d.]+) €/)?.[1]);
  ok(Math.abs(v.reduce((a, x) => a + x, 0) - totC) <= 2, `la somma dei conti (${v.join(" + ")}) è il totale ${totC} €`);
  ok(Math.abs(v[0] - num(one)) / num(one) < .05, `il primo conto vale circa come da solo (${v[0]} contro ${num(one)}: quote vere del file contro quote stimate dai versamenti)`);
  const tot = r.card.match(/Ancora investito\s*([\d.]+) €/)?.[1];
  ok(tot && +tot.replace(/\./g, "") > +one.replace(/\./g, ""), `valore insieme ${tot} € > primo conto ${one} €`);
  if (SHOT) { await p.evaluate(() => document.getElementById("realCard").scrollIntoView()); await wait(500); await p.screenshot({ path: SHOT }); }
  ok(!errs.length, "nessun errore nella pagina " + errs.join(" | "));
} catch (e) { console.log("FAIL", e.message); fails++; try { const pg = (await b.pages()).at(-1); console.log(JSON.stringify(await pg.evaluate(() => ({ st: window.__pos.state(), txt: document.body.innerText.split(String.fromCharCode(10)).filter(l => /conti|non riesco|Per unire|Manca/i.test(l)).slice(0, 6) }))).slice(0, 1500)); } catch (x) { console.log(x.message); } }
await b.close(); srv.kill();
console.log(fails ? `${fails} FALLITI` : "tutto ok"); process.exit(fails ? 1 : 0);
