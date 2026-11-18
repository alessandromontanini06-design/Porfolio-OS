// Quotazioni affiancate tipo esercizio universitario: due blocchi Yahoo (Date | Open | … | Adj. Close* | Returns), titolo e statistiche sopra, date americane.
import { POS as P } from "../js/engine.js";
let fail = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fail++; };
const A = [["PREZZI STORICI"], [], ["Eni SpA (ENI.MI) -Milan", "", "", "", "", "", "", "", "", "Recordati (REC.MI) -Milan"], [],
  ["Return atteso:", "", "0.5778%", "", "Tramite la media campionaria", "Frequenza:", "Mensile", "", "", "Return atteso:", "", "2.5219%"],
  ["Varianza:", "", "0.00314", "", "", "Da:", "1/4/10", "", "", "Varianza:"], [],
  ["Date", "Open", "High", "Low", "Close", "Volume", "Adj. Close*", "Returns", "", "Date", "Open", "High", "Low", "Close", "Volume", "Adj. Close*", "Returns"]];
for (let i = 0; i < 12; i++) { const m = 12 - i, d = `${m}/1/16`; A.push([d, 13, 14, 12, 13 + i * .1, 1000, 12.5 + i * .1, .01, "", d, 25, 27, 24, 26 + i * .2, 500, 25.5 + i * .2, .02]); }
const out = P.normalizeExports([{ name: "Prezzi Storici", aoa: A }]);
ok(out.length === 1 && /^★ Prezzi/.test(out[0].name), "un solo foglio di prezzi pulito, l'originale tolto");
ok(out[0].aoa[0].join("|") === "Data|Eni SpA (ENI.MI)|Recordati (REC.MI)", "nomi dal titolo sopra la tabella: " + out[0].aoa[0].join(", "));
ok(out[0].aoa.length === 13 && out[0].aoa[1][0].toISOString().slice(0, 10) === "2016-01-01", "date americane (mese/giorno/anno) lette giuste, in ordine");
ok(out[0].aoa[12][1] === 12.5 && out[0].aoa[12][2] === 25.5, "chiusura rettificata, non la chiusura");
console.log(fail ? `${fail} FALLITI` : "tutto ok"); process.exit(fail ? 1 : 0);
