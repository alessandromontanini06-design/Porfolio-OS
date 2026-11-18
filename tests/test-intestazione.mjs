// Riga d'intestazione: un riepilogo di posizioni con celle vuote (titolo senza ISIN) non deve far scambiare una riga di dati per l'intestazione.
import { POS as P } from "../js/engine.js";
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
const H = ["Strumento", "Ticker", "ISIN", "Valore (€)", "Peso"], A = [["Vanguard FTSE All-World (Acc)", "VWCE", "IE00BK5BQT80", 5000, .5], ["Eni", "ENI", "IT0003132476", 1500, .15]];
const pos = rows => { const L = P.localRecipe([{ name: "x", aoa: [H, ...rows] }]); return L ? L.recipe.posizioni : []; };
t("tutte le righe con ISIN: intestazione in riga 1", P.analyzeSheet("x", [H, ...A]).headerRow === 0);
t("una riga senza ISIN: intestazione ancora in riga 1", P.analyzeSheet("x", [H, ...A, ["Toyota", "7203.T", "", 1000, .1]]).headerRow === 0);
const p = pos([...A, ["Toyota", "7203.T", "", 1000, .1], ["Apple", "AAPL.US", null, 900, .1], ["Bitcoin", "BTC-USD", "", 800, .05]]);
t("5 posizioni lette, anche quelle senza ISIN", p.length === 5, JSON.stringify(p.map(x => x.ticker)));
t("simboli con la borsa conservati (7203.T, AAPL.US, BTC-USD)", ["7203.T", "AAPL.US", "BTC-USD"].every(s => p.some(x => x.simbolo === s)), JSON.stringify(p.map(x => x.simbolo)));
t("etichetta senza la borsa: AAPL.US → AAPL", p.some(x => x.ticker === "AAPL"));
/* un titolo sopra la tabella e una riga vuota: l'intestazione resta quella della tabella */
const T = [["Il mio portafoglio"], [], H, ...A, ["Toyota", "7203.T", "", 1000, .1]];
t("titolo e riga vuota sopra la tabella: intestazione in riga 3", P.analyzeSheet("x", T).headerRow === 2, P.analyzeSheet("x", T).headerRow);
console.log(`\n${pass} superati, ${fail} falliti`); process.exit(fail ? 1 : 0);
