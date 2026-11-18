// Prove di robustezza dell'importazione (senza IA): file sporchi, casi limite, file grandi, correttezza del TIR.
// Uso: node tools/test-robust.mjs
import P from "../js/engine.js";
const W = "IE00B4L5Y983", S = "IE00B5BMR087";
let pass = 0, fail = 0;
const t = (name, ok, info = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${name}${!ok && info ? " · " + info : ""}`); };
const pos = sheets => { const SH = P.normalizeExports(sheets), L = P.localRecipe(SH), A = L ? P.applyRecipe(SH, L.recipe) : null; return (A && A.tx && A.tx.positions) || []; };
const q = (ps, id) => { const p = ps.find(x => x.isin === id || x.titolo === id || x.tk === id); return p ? +p.quantita.toFixed(6) : null; };
const H = ["Data", "Operazione", "Strumento", "ISIN", "Quantità", "Prezzo", "Importo"];

console.log("File sporchi");
let ps = pos([{ name: "Mov", aoa: [H, ["15/01/2024", "Acquisto", "World", W, "10", "1.234,56", "12.345,60"], ["15/02/2024", "Acquisto", "World", W, "2,5", "1.250,00", "3.125,00"], ["15/03/2024", "Acquisto", "S&P", S, "1", "500,00", "500,00"]] }]);
t("numeri all'italiana come testo (1.234,56 e 2,5)", q(ps, W) === 12.5 && q(ps, S) === 1, JSON.stringify(ps.map(p => [p.isin, p.quantita])));
ps = pos([{ name: "Mov", aoa: [H, ["15 gen 2024", "Acquisto", "World", W, 10, 80, 800], ["2024-02-15", "Acquisto", "World", W, 5, 82, 410], [45366, "Acquisto", "World", W, 1, 85, 85]] }]);
t("date in formati misti (15 gen 2024, ISO, numero di Excel)", q(ps, W) === 16, JSON.stringify(ps.map(p => [p.isin, p.quantita])));
ps = pos([{ name: "Mov", aoa: [["Il mio portafoglio"], ["Aggiornato al 30/06/2024"], [], H, ["15/01/2024", "Acquisto", "World", W, 10, 80, 800], ["Totale gennaio", "", "", "", 10, "", 800], ["15/02/2024", "Acquisto", "World", W, 5, 82, 410], [], ["TOTALE", "", "", "", 15, "", 1210]] }]);
t("titoli sopra la tabella, righe di totale e righe vuote", q(ps, W) === 15, JSON.stringify(ps.map(p => [p.isin, p.quantita])));
const csv = P.parseCSV("Data;Operazione;Strumento;ISIN;Quantità;Prezzo;Importo\n15/01/2024;Acquisto;World;" + W + ";10;80,5;805\n15/02/2024;Vendita;World;" + W + ";4;82,0;328\n");
ps = pos([{ name: "csv", aoa: csv }]);
t("CSV con punto e virgola e virgola decimale", q(ps, W) === 6, JSON.stringify(csv.slice(0, 2)));
ps = pos([{ name: "Mov", aoa: [["Data", "Operazione", "Strumento", "ISIN", "Quantità", "Prezzo", "Valuta", "Importo"], ["15/01/2024", "Acquisto", "Apple", "US0378331005", 5, 185, "USD", 925], ["15/02/2024", "Acquisto", "World", W, 10, 80, "EUR", 800]] }]);
t("valute miste nella stessa tabella", q(ps, "US0378331005") === 5 && q(ps, W) === 10);
ps = pos([{ name: "Vuoto", aoa: [] }, { name: "Note", aoa: [["Appunti vari"], ["ricordarsi di ribilanciare"]] }, { name: "Mov", aoa: [H, ["15/01/2024", "Acquisto", "World", W, 10, 80, 800], ["15/02/2024", "Acquisto", "World", W, 5, 82, 410]] }]);
t("fogli vuoti o di sole note accanto ai movimenti", q(ps, W) === 15);

console.log("Casi limite");
ps = pos([{ name: "Mov", aoa: [H, ["15/01/2024", "Acquisto", "World", W, 10, 80, 800], ["15/06/2024", "Vendita", "World", W, 10, 90, 900]] }]);
t("tutte le posizioni chiuse: nessuna posizione aperta, nessun errore", ps.length === 0);
ps = pos([{ name: "Mov", aoa: [H, ["15/01/2024", "Dividendo", "World", W, 10, 0.5, 5], ["15/07/2024", "Dividendo", "World", W, 10, 0.5, 5]] }]);
t("solo dividendi: nessuna quota inventata", ps.length === 0, JSON.stringify(ps.map(p => [p.isin, p.quantita])));
ps = pos([{ name: "Mov", aoa: [H, ["15/01/2024", "Acquisto", "World", W, 10, 80, 800]] }]);
t("un solo movimento", q(ps, W) === 10);
ps = pos([{ name: "Mov", aoa: [H, ["15/01/2024", "Acquisto", "World", W, 0.123456, 80, 9.88], ["15/02/2024", "Acquisto", "World", W, 0.000544, 81, 0.04]] }]);
t("quote frazionarie (piani di accumulo)", q(ps, W) === 0.124);

console.log("File grandi");
const big = [H];const d0 = Date.UTC(2010, 0, 15);
for (let i = 0; i < 6000; i++) { const d = new Date(d0 + i * 864e5 * 0.6); big.push([`${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`, i % 10 === 9 ? "Vendita" : "Acquisto", i % 2 ? "World" : "S&P", i % 2 ? W : S, 1, 100 + i / 100, 100 + i / 100]); }
let t0 = performance.now();ps = pos([{ name: "Mov", aoa: big }]);const ms = performance.now() - t0;
t(`6.000 movimenti letti in ${Math.round(ms)} ms (limite 2.000)`, ms < 2000 && ps.length === 2);
t("quantità esatte su 6.000 righe", q(ps, W) === 2400 - 600 && q(ps, S) === 3000, JSON.stringify(ps.map(p => [p.isin, p.quantita])));

console.log("Correttezza");
const xr = P.xirr([[2008, 0, 1, -10000], [2008, 2, 1, 2750], [2008, 9, 30, 4250], [2009, 1, 15, 3250], [2009, 3, 1, 2750]].map(([y, m, d, v]) => ({ t: new Date(Date.UTC(y, m, d)), v })));
t(`TIR uguale a TIR.X di Excel (esempio ufficiale Microsoft: 37,34%) → ${(xr * 100).toFixed(4)}%`, Math.abs(xr - 0.373362535) < 1e-6);
const r = [0.02, -0.01, 0.03, 0.01, -0.02, 0.015], m = r.reduce((a, b) => a + b) / r.length, sd = Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1));
const st = P.stats({ ret: [NaN, ...r] }, 12, Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, i + 1, 0))));
t("volatilità annua = deviazione standard campionaria × √12 (come DEV.ST.C di Excel)", Math.abs(st.vol - sd * Math.sqrt(12)) < 1e-9, `${st.vol} vs ${sd * Math.sqrt(12)}`);
console.log(`\n${pass} superati, ${fail} falliti`);
process.exit(fail ? 1 : 0);
