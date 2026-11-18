// Tracker annuale come quello di Mr RIP (dati inventati): mesi senza anno («2024 | Jan … Dec | 2025»), colonna «Cur» con D/E/F,
// sezioni, blocco «Finance» con codici di borsa, cambi, e dopo il totale del patrimonio righe di FIRE e flussi da ignorare.
import { POS as P } from "../js/engine.js";
let fail = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fail++; };
const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], e = () => Array(11).fill("");
const y25 = [["Asset/Liability", "Cur", "2024", ...M, "2025"], ["Net Worth"], ["Stocks / ETF"],
  ["VT", "D", "52,866", "69,885", ...e(), "69,885"], ["INTEL", "D", "20,050", "59,660", ...e(), "59,660"], ["ERUS", "D", "40", "40", ...e(), "40"],
  ["3A-VBA - 99% Stocks"], ["3A - Mr - FinPension - SC", "F", "128,003", "129,088", ...e(), "129,088"],
  ["Bonds"], ["BNDW", "D", "371,636", "361,390", ...e(), "361,390"], ["SEGA (EUNH)", "E", "92,135", "92,135", ...e(), "92,135"], ["IEBB (ISO6)", "E", "29,675", "29,675", ...e(), "29,675"],
  ["Cash - Liquidity"], ["PostFinance - CHF", "F", "31,984", "64,326", ...e(), "64,326"],
  ["Taxes"], ["Exp Tax 2024", "F", "-8,135", "-8,135", ...e(), "-8,135"], [],
  ["NW (CHF)", "F", "2,233,302", "2,312,667", ...e(), "2,312,667"], ["NW Change", "", "-", "79,365"], ["Change %", "", "-", "3.55%"], ["NW (EUR)", "E", "2,375,366", "2,500,811"], ["NW (RIP)", "RIP", "2,303,239", "2,404,900"],
  ["Finance"], ["NYSEARCA:VT", "D", "117.48", "155.30"], ["NASDAQ:INTC", "D", "20.05", "59.66"], ["NASDAQ:BNDW", "D", "68.19", "66.31"], ["BIT:SEGA", "E", "112.36", "112.36"], ["IEBB", "E", "4.905", "4.905"],
  ["EURCHF", "", "0.940", "0.925"], ["EURUSD", "", "1.036", "1.103"], ["USDCHF", "", "0.907", "0.838"],
  ["Simple"], ["Stocks", "F", "1,208,578", "1,349,045"], ["Cash Flow"], ["Spending", "F", "", "1,288"], ["FIRE (CH)"], ["Current Yearly Expenditure", "F", "124,110", "116,707"]];
const dash = [["", "", 1, 2, 3], ["Primary", "Secondary", ...M, "Average", "Total"], ["Housing", "", "0"], ["", "Rent", "0"], ["Health", "", "1088"]];
/* come li legge Excel: numeri veri, non testo */
const num = a => a.map(r => r.map((v, i) => i >= 2 && typeof v === "string" && /^-?[\d,]+(\.\d+)?%?$/.test(v) ? (v.endsWith("%") ? parseFloat(v) / 100 : +v.replace(/,/g, "")) : v));
const W = P.reshapeWide([{ name: "2025", aoa: num(y25) }, { name: "2025 Dashboard", aoa: num(dash) }]);
ok(!!W, "riconosciuto come tracker");
const D = W ? W.detail : [], by = l => D.find(d => d.label === l);
ok(W && W.months.includes("2024-12") && W.months.includes("2025-01"), "mesi: dicembre 2024 dalla colonna «2024», gennaio 2025 dal nome del foglio");
ok(by("VT") && by("VT").cur === "USD" && by("SEGA (EUNH)").cur === "EUR" && by("3A - Mr - FinPension - SC").cur === "CHF", "valute D/E/F");
ok(by("VT") && Math.round(by("VT").eur[W.months.indexOf("2025-01")]) === Math.round(69885 / 1.103), "VT in euro col cambio EURUSD del file");
ok(by("PostFinance - CHF") && Math.abs(by("PostFinance - CHF").eur[W.months.indexOf("2025-01")] - 64326 / 0.838 / 1.103) < 1, "franchi in euro con USDCHF ed EURUSD");
ok(by("VT").sym === "NYSEARCA:VT" && by("INTEL").sym === "NASDAQ:INTC" && by("SEGA (EUNH)").sym === "BIT:SEGA", "simboli dal blocco «Finance» (INTEL → INTC)");
ok(!D.some(d => /^(NYSEARCA|NASDAQ|BIT):|^Stocks$|Spending|Expenditure|^EURCHF/.test(d.label)), "codici di borsa, classi, flussi e FIRE non sono posizioni");
ok(!D.some(d => /Housing|Rent|Health/.test(d.label)), "il cruscotto delle spese (senza colonna valute) è ignorato");
console.log(fail ? `${fail} FALLITI` : "tutto ok"); process.exit(fail ? 1 : 0);
