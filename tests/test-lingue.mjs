// Lingue del sito (20/11/2026): inglese, spagnolo e francese tradotti con il dizionario, italiano invariato, marchio mai tradotto.
// node test-lingue.mjs files/shots
import { spawn } from "node:child_process"; import path from "node:path"; import fs from "node:fs"; import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || "files/shots", PORT = 5341, wait = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, [path.join(import.meta.dirname, "serve.mjs")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" }); await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
let ok = 0, ko = 0; const check = (c, m) => { c ? ok++ : ko++; console.log((c ? "OK  " : "NO  ") + m); };
async function apri(L) {
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 860 }); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.evaluateOnNewDocument(L => { if (!sessionStorage.getItem("f")) { localStorage.clear(); if (L !== "it") localStorage.setItem("pos-lingua-v1", L); localStorage.setItem("pos-ruolo-v1", "priv"); sessionStorage.setItem("f", "1"); } }, L);
  await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await wait(1500);
  const v = await p.evaluate(() => ({ lang: document.documentElement.lang, wait: document.documentElement.classList.contains("i18n-wait"), hero: document.getElementById("heroTitle").innerText.replace(/\s+/g, " ").trim(), brand: document.querySelector(".brand .bw").textContent.replace(/\s+/g, " ").trim(), nav: [...document.querySelectorAll("nav a, nav button, .nav a, .nav button")].map(x => x.textContent.trim()).filter(Boolean).slice(0, 6).join("|"), title: document.title, body: document.body.innerText }));
  return { p, v, errs };
}
/* italiano: niente dizionario, niente cambi */
{ const { p, v, errs } = await apri("it");
  check(v.lang === "it" && /I tuoi investimenti/.test(v.hero), "italiano: titolo originale («" + v.hero + "»)");
  check(!v.wait, "italiano: la pagina non resta nascosta");
  const req = await p.evaluate(() => performance.getEntriesByType("resource").some(r => /\/js\/i18n\//.test(r.name)));
  check(!req, "italiano: il dizionario non si scarica");
  check(errs.length === 0, "italiano: nessun errore JavaScript " + errs.slice(0, 1).join(""));
  await p.close(); }
for (const [L, hero, parola] of [["en", "Your investments finally clear.", "Create your net worth"], ["es", "Tus inversiones por fin claras.", "Crea tu patrimonio"], ["fr", "Vos investissements enfin clairs.", "Créez votre patrimoine"]]) {
  const { p, v, errs } = await apri(L);
  check(v.lang === L, `${L}: lang="${v.lang}"`);
  check(!v.wait, `${L}: la pagina è visibile`);
  check(v.hero === hero, `${L}: titolo tradotto intero («${v.hero}»)`);
  check(v.brand === "Quanta Portfolio", `${L}: marchio non tradotto («${v.brand}»)`);
  check(v.body.includes(parola), `${L}: pulsante principale tradotto («${parola}»)`);
  check(!/Carica il file della banca|Nessun account/.test(v.body), `${L}: niente italiano nei pulsanti della home`);
  check(/Quanta Portfolio ·/.test(v.title) && !/I tuoi/.test(v.title), `${L}: titolo della scheda tradotto («${v.title}»)`);
  /* testo che compare dopo: si traduce da solo */
  const dopo = await p.evaluate(async () => { const d = document.createElement("p"); d.textContent = "Ultima revisione"; document.body.append(d); await new Promise(r => setTimeout(r, 120)); const t = d.textContent; d.remove(); return t; });
  check(dopo !== "Ultima revisione", `${L}: testo aggiunto dopo tradotto («${dopo}»)`);
  /* frasi con il nome del file e i mesi */
  const f = await p.evaluate(() => window.__i18n.traduci("«Mio_file.xlsx · ricostruito» · foglio «Prezzi» · 3 asset dal mag 2019 al ott 2026."));
  check(f && /Mio_file\.xlsx/.test(f) && ({ en: /May 2019 to Oct 2026/, es: /may 2019 a oct 2026/, fr: /mai 2019 à oct\. 2026/ })[L].test(f), `${L}: nome del file e mesi («${f}»)`);
  /* la rotellina mostra la lingua scelta */
  await p.click("#setBtn"); await wait(300);
  const sel = await p.evaluate(() => { const x = document.querySelector('[data-lingua][aria-checked="true"]'); return x && x.dataset.lingua; });
  check(sel === L, `${L}: nella rotellina è scelta la lingua giusta (${sel})`);
  check(errs.length === 0, `${L}: nessun errore JavaScript ` + errs.slice(0, 1).join(""));
  if (L === "fr") { await p.screenshot({ path: `${OUT}/lingue-fr.jpg`, type: "jpeg", quality: 70 }); }
  /* tornare all'italiano */
  if (L === "en") {
    await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2" }), p.click('[data-lingua="it"]')]); await wait(800);
    const h = await p.evaluate(() => document.getElementById("heroTitle").innerText.replace(/\s+/g, " ").trim());
    check(/I tuoi investimenti/.test(h), "da inglese a italiano con la rotellina («" + h + "»)");
  }
  await p.close();
}
/* i dizionari: stessi segnaposto della frase italiana */
for (const L of ["en", "es", "fr"]) {
  const d = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "js", "i18n", L + ".json"), "utf8"));
  const ph = s => (s.match(/\{\d+\}/g) || []).sort().join(); const male = Object.entries(d).filter(([k, t]) => ph(k) !== ph(t));
  check(Object.keys(d).length > 1900 && male.length === 0, `${L}.json: ${Object.keys(d).length} frasi, segnaposto giusti`);
}
await b.close(); srv.kill();
console.log(`\n${ok} ok, ${ko} da sistemare`); process.exit(ko ? 1 : 0);
