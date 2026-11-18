// «Portafoglio di sintesi» (situazione titoli, stile banca italiana): valore di mercato e non di carico, codici Reuters puliti, totali ignorati.
import { POS as P } from "../js/engine.js";
import fs from "node:fs";
let fail = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fail++; };
const sh = P.normalizeExports([{ name: "portafoglio", aoa: P.parseCSV(fs.readFileSync(import.meta.dirname + "/files/fixture/portafoglio-sintesi.csv", "utf8")) }]);
const L = P.localRecipe(sh), pos = L && L.recipe.posizioni || [];
ok(pos.length === 3, `3 posizioni (${pos.map(p => p.ticker).join(", ")})`);
ok(pos.map(p => p.ticker).join() === "BMW,NOVC,AMD", "etichette senza la borsa: 1BMW.MI → BMW, AMD.O → AMD");
ok(pos.map(p => p.valore).join() === "7822,11443.95,6004.99", "valore di mercato, non di carico");
ok(pos.every(p => /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(p.isin)), "ISIN letti");
console.log(fail ? `${fail} FALLITI` : "tutto ok"); process.exit(fail ? 1 : 0);
