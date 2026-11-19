// «Quanto ti costa la tua banca»: il rendiconto costi e oneri (MiFID) scritto a mano, senza file. Dalla home agli Strumenti,
// conti fatti a mano (euro e percentuali), incentivi, confronto con gli ETF, salvato nel browser, riepilogo da copiare, telefono.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const [,, OUT] = process.argv, PORT = +(process.env.TEST_PORT || 5203), wait = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, [import.meta.dirname + "/serve.mjs"], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
await wait(1500);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const ctx = b.defaultBrowserContext(); await ctx.overridePermissions(`http://localhost:${PORT}`, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); const errs = [];
p.on("pageerror", e => errs.push(e.message));
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await p.evaluate(() => localStorage.removeItem("pos-rendiconto-v1"));
await p.goto(`http://localhost:${PORT}/?home`, { waitUntil: "networkidle2" }); await wait(1500);
t("in home, «Da dove parti?»: «Quanto mi costa la banca?»", await p.evaluate(() => /Quanto mi costa la banca/.test(document.querySelector("[data-cbopen]").innerText)));
await p.evaluate(() => document.querySelector("[data-cbopen]").click());
await p.waitForFunction(() => document.body.dataset.scene === "strumenti" && document.querySelectorAll("#cbForm input").length === 4, { timeout: 10000 }).catch(() => {}); await wait(700);
t("si apre negli Strumenti, con 4 campi e il cursore sul patrimonio, anche senza laboratorio", await p.evaluate(() => document.body.dataset.scene === "strumenti" && document.querySelectorAll("#cbForm input").length === 4 && document.activeElement && document.activeElement.name === "pat" && !document.getElementById("toolsLock").hidden));
t("prima dei numeri: spiega cosa scrivere", /patrimonio medio e almeno un costo/.test(await p.evaluate(() => document.getElementById("cbOut").innerText)));
const type = async (name, v) => { await p.click(`#cbForm input[name="${name}"]`); await p.keyboard.type(v); };
await type("pat", "80.000"); await type("serv", "600"); await type("prod", "1,5%"); await type("inc", "500"); await wait(400);
const out = await p.evaluate(() => document.getElementById("cbOut").innerText.replace(/\s+/g, " "));
/* conti a mano: 600 + 1,5% di 80.000 = 600 + 1.200 = 1.800 € = 2,25%; 150 € al mese; ETF allo 0,20% = 160 € */
const drag = (V, c, y) => V * (Math.pow(1.05, y) - Math.pow(1.05 - c, y)), e = v => Math.round(v).toLocaleString("it-IT", { useGrouping: "always" }) + " €";
t("ogni anno paghi 1.800 € = 2,25% del patrimonio, circa 150 € al mese, «costo alto»", /Ogni anno paghi 1\.800 €/.test(out) && /2,25%/.test(out) && /150 € al mese/.test(out) && /costo alto/.test(out), out.slice(0, 200));
t(`in 10 anni −${e(drag(80000, .0225, 10))}, in 20 anni −${e(drag(80000, .0225, 20))}`, out.includes("−" + e(drag(80000, .0225, 10))) && out.includes("−" + e(drag(80000, .0225, 20))), out.slice(200, 600));
t(`con ETF allo 0,20%: 160 € l'anno, 1.640 € in meno, ${e(drag(80000, .0225, 20) - drag(80000, .002, 20))} in più in 20 anni`, /160 €/.test(out) && /1\.640 € in meno/.test(out) && out.includes(e(drag(80000, .0225, 20) - drag(80000, .002, 20)) + " di capitale in più"), out);
t("incentivi: 500 € (28% dei costi), spiegati", /500 € \(28% dei costi\) sono incentivi/.test(out));
t("servizi e prodotti nella barra: 600 € e 1.200 €", await p.evaluate(() => /Servizi\s*600 €/.test(document.querySelector(".cb-bar").innerText) && /Prodotti\s*1\.200 €/.test(document.querySelector(".cb-bar").innerText)));
t("dichiara che non è un consiglio di investimento", /non è un consiglio di investimento/.test(out));
await p.click("#cbCopy"); await wait(400);
const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ""));
t("«Copia il riepilogo»: testo con costi, 20 anni e confronto ETF", /Costi dell'anno: 1\.800,00 € \(2,25%\)/.test(clip) && /in 20 anni/.test(clip) && /ETF/.test(clip), clip.slice(0, 160));
await p.evaluate(() => document.getElementById("cbBox").scrollIntoView({ block: "start" })); await wait(300);
await p.screenshot({ path: `${OUT}/costi-banca.jpg`, type: "jpeg", quality: 72 });
await p.reload({ waitUntil: "networkidle2" }); await p.evaluate(() => document.querySelector('.dock [data-go="strumenti"]') ? document.querySelector('.dock [data-go="strumenti"]').click() : document.querySelector("[data-cbopen]").click()); await wait(1200);
t("i numeri restano nel browser", await p.evaluate(() => document.querySelector('#cbForm input[name="prod"]').value === "1,5%" && /1\.800 €/.test(document.getElementById("cbOut").innerText)));
/* costi tutti in percentuale */
await p.click("#cbClear"); await wait(200); await type("pat", "50000"); await type("serv", "0,5%"); await type("prod", "0,2%"); await wait(300);
t("tutto in percentuale: 0,5% + 0,2% su 50.000 = 350 €, «costo medio»", /350 €/.test(await p.evaluate(() => document.getElementById("cbOut").innerText)) && /costo medio/.test(await p.evaluate(() => document.getElementById("cbOut").innerText)));
await p.setViewport({ width: 390, height: 844 }); await wait(500); await p.evaluate(() => document.getElementById("cbBox").scrollIntoView({ block: "start" })); await wait(300);
await p.screenshot({ path: `${OUT}/costi-banca-tel.jpg`, type: "jpeg", quality: 72 });
t("sul telefono niente esce dallo schermo", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll("#cbBox *")].every(x => x.getBoundingClientRect().right <= innerWidth + 1)));
t("nessun errore JavaScript", !errs.length, errs.join(" | "));
console.log(`\n${pass} superati, ${fail} falliti`);
await b.close(); srv.kill(); process.exit(fail ? 1 : 0);
