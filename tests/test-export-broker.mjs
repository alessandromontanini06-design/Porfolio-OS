// Export dei broker trovati online (Export-To-Ghostfolio, capital-gains-calculator, Ghostfolio): ognuno deve dare almeno le posizioni attese.
// È il controllo veloce sul motore; la prova completa sul sito (prezzi e laboratorio) è prova-file.mjs.
import { POS as P } from "../js/engine.js";
import fs from "node:fs"; import path from "node:path";
const W = import.meta.dirname + "/files/web";
const ATTESI = { // file: posizioni aperte minime (0 = tutto venduto ma movimenti letti)
  "ghostfolio/avanza-export.csv": 3, "ghostfolio/bitvavo-export.csv": 3, "ghostfolio/bux-export.csv": 3, "ghostfolio/coinbase-export.csv": 1, "ghostfolio/cointracking-export.csv": 1,
  "ghostfolio/degiro-export.csv": 6, "ghostfolio/directa-export.csv": 10, "ghostfolio/disnat-export.csv": 5, "ghostfolio/etoro-export.csv": 3, "ghostfolio/finpension-3a-export.csv": 7,
  "ghostfolio/freetrade-export.csv": 4, "ghostfolio/ibkr-trades-export.csv": 2, "ghostfolio/investengine-export.csv": 0, "ghostfolio/parqet-export.csv": 2, "ghostfolio/rabobank-export.csv": 2,
  "ghostfolio/revolut-crypto-export.csv": 2, "ghostfolio/revolut-invest-export.csv": 3, "ghostfolio/saxo-export.csv": 4, "ghostfolio/schwab-export.csv": 15, "ghostfolio/swissquote-export.csv": 4,
  "ghostfolio/traderepublic-export.csv": 2, "ghostfolio/trading212-export.csv": 3, "ghostfolio/xtb-export.csv": 3,
  "cgtcalc/freetrade.csv": 4, "cgtcalc/ibkr-basic.csv": 1, "cgtcalc/raw.csv": 5, "cgtcalc/revolut.csv": 3, "cgtcalc/schwab.csv": 1, "cgtcalc/sharesight-trades.csv": 3, "cgtcalc/trading212-2024.csv": 0,
  "ghostfolio-app/ghostfolio-sample.csv": 2, "ghostfolio-app/ghostfolio-vti-ibkr.csv": 1 };
let fail = 0;
for (const [f, min] of Object.entries(ATTESI)) {
  const buf = fs.readFileSync(path.join(W, f)); let text = new TextDecoder("utf-8").decode(buf); if (text.includes("\uFFFD")) text = new TextDecoder("windows-1252").decode(buf);
  const sheets = P.normalizeExports([{ name: path.basename(f, ".csv"), aoa: P.parseCSV(text) }]), L = P.localRecipe(sheets);
  const T = L && L.recipe.movimenti ? P.applyRecipe(sheets, { movimenti: L.recipe.movimenti }).tx : null, n = T ? T.positions.length : (L && L.recipe.posizioni.length) || -1;
  const ok = n >= min && (min > 0 || T); if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} ${f.padEnd(42)} posizioni ${n} (attese almeno ${min})`);
}
console.log(fail ? `${fail} FALLITI` : "tutto ok"); process.exit(fail ? 1 : 0);
