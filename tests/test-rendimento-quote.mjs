// Rendimento reale con le quote (POS.personalPerformanceQty): valore = quote possedute × prezzo di mercato, come il broker e il patrimonio.
// Conti fatti a mano; senza quote o con quote che non tornano coi prezzi di mercato (frazionamenti, pence) si torna al calcolo con gli euro.
const { POS } = await import(new URL("../js/engine.js", import.meta.url));
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const dates = [0, 1, 2, 3, 4].map(m => new Date(Date.UTC(2024, m + 1, 0)));
const P = [100, 110, 121, 121, 133.1], ret = P.map((v, i) => i ? v / P[i - 1] - 1 : NaN), A = [{ name: "X", ret }];
const D = (m, g) => new Date(Date.UTC(2024, m, g));
const tx = [{ d: D(0, 31), i: 0, amount: 1000, qty: 10, type: "Acquisto" }, { d: D(2, 31), i: 0, amount: -605, qty: 5, type: "Vendita" }, { d: D(3, 15), i: 0, amount: -20, type: "Dividendo" }];
const r = POS.personalPerformanceQty(dates, A, tx, [133.1], [1]);
t("10 quote a 100, vendute 5 a 121, dividendo 20: restano 5 quote × 133,10 = 665,50 €", near(r.value, 665.5), r.value);
t("versato netto: 1.000 − 605 − 20 = 375 €; guadagno 290,50 €", near(r.invested, 375) && near(r.gain, 290.5), `${r.invested} ${r.gain}`);
t("rendimento ponderato nel tempo: 1,1 × 1,1 × (625/605) × 1,1 − 1 = 37,50%", near(r.twr, 1.1 * 1.1 * (625 / 605) * 1.1 - 1, 1e-9), r.twr);
t("serie mese per mese: 1.000 → 1.100 → 605 → 605 → 665,50", JSON.stringify(r.series.map(x => +x.value.toFixed(2))) === "[1000,1100,605,605,665.5]", JSON.stringify(r.series.map(x => x.value)));
t("per strumento: 5 quote rimaste, dividendi 20 €", r.byAsset[0].quote === 5 && near(r.byAsset[0].income, 20));
t("metodo dichiarato: «quote»", r.metodo === "quote");
/* obbligazione: nominale 10.000 a 98 su 100, prezzo di oggi 101 → 10.100 € */
const B = [{ name: "BTP", ret: [NaN, 0.01, 0.01, 0, (101 / (98 * 1.01 * 1.01)) - 1] }];
const rb = POS.personalPerformanceQty(dates, B, [{ d: D(0, 31), i: 0, amount: 9800, qty: 10000, type: "Acquisto" }], [101], [0.01]);
t("BTP: 10.000 di nominale a 98 → oggi 101 su 100 = 10.100 €", rb && near(rb.value, 10100, 1e-6), rb && rb.value);
/* quando si torna al calcolo con gli euro */
t("senza quote in un acquisto: null (calcolo con gli euro)", POS.personalPerformanceQty(dates, A, [{ ...tx[0], qty: null }], [133.1], [1]) === null);
t("frazionamento non registrato (2,5 quote a 400 € quando il mercato dice 100): null", POS.personalPerformanceQty(dates, A, [{ ...tx[0], qty: 2.5 }], [133.1], [1]) === null);
t("prezzo in pence contro sterline (100 volte): null", POS.personalPerformanceQty(dates, A, [{ ...tx[0], qty: 0.1 }], [133.1], [1]) === null);
t("senza l'ultimo prezzo di mercato: null", POS.personalPerformanceQty(dates, A, tx, [NaN], [1]) === null);
/* stessi dati, il vecchio calcolo con gli euro dà un valore diverso quando i prezzi pagati non sono quelli di fine mese */
const tx2 = [{ d: D(0, 5), i: 0, amount: 1000, qty: 10.5, type: "Acquisto" }];
const ex = POS.personalPerformanceQty(dates, A, tx2, [133.1], [1]), ap = POS.personalPerformance(dates, A, tx2);
t("acquisto a 95,24 a inizio mese: con le quote 10,5 × 133,10 = 1.397,55 € (il calcolo con gli euro diceva " + ap.value.toFixed(2) + " €)", near(ex.value, 1397.55, 1e-6) && Math.abs(ap.value - ex.value) > 50, ex.value);
console.log(`\n${pass} superati, ${fail} falliti`); process.exit(fail ? 1 : 0);
