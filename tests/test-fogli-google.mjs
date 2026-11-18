// Cartella di Google Fogli fatta a mano (dati inventati, stessa struttura di un file vero di un utente):
// foglio «🧾 Transazioni» con una colonna «ETF» (più strumenti), tipi «Acquisto», «PAC», «Saveback»,
// intestazioni «Quote», «Prezzo (€)», «Importo (€)»; foglio «📈 ETF» con nome, ISIN e codice di Google («AMS:IWDA»).
// Prima il riconoscitore dei piani di accumulo la scambiava per il PAC di un solo titolo chiamato «Transazioni».
import { POS as P } from "../js/engine.js";
let pass = 0, fail = 0; const t = (n, ok, info = "") => { if (ok) { pass++; console.log("  ok      " + n); } else { fail++; console.log(`  FALLITO ${n} ${info}`); } };
const d = s => new Date(s + "T00:00:00Z");
const tx = [["🧾 Transazioni ETF"], ["Ogni acquisto, PAC e saveback."], ["REGISTRO MOVIMENTI"], ["Data", "ETF", "Tipo", "Quote", "Prezzo (€)", "Importo (€)", "Flusso per TIR", "Note"],
  [d("2025-03-03"), "SWDA", "Acquisto", 10, 100, 1000, -1000, null],
  [d("2025-04-01"), "SWDA", "PAC", 0.5, 100, 50, -50, null],
  [d("2025-04-01"), "CSNDX", "PAC", 0.01, 1000, 10, -10, null],
  [d("2025-05-02"), "SWDA", "Saveback", 0.1, 100, 10, -10, "regalo"],
  [d("2025-05-02"), "EIMI", "Acquisto", 3, 40, 120, -120, null]];
const etf = [["📈 Portafoglio ETF"], ["Quote e investito vengono dalle Transazioni."], ["POSIZIONI"],
  ["ETF", "Nome", "ISIN", "Ticker Google", "Quote", "Investito (€)", "Prezzo medio (€)", "Prezzo attuale (€)", "Valore (€)", "Peso attuale", "Peso target"],
  ["SWDA", "iShares Core MSCI World", "IE00B4L5Y983", "AMS:IWDA", 10.6, 1060, 100, 110, 1166, 0.85, 0.6],
  ["CSNDX", "iShares NASDAQ 100", "IE00B53SZB19", "AMS:CNDX", 0.01, 10, 1000, 1100, 11, 0.01, 0.2],
  ["EIMI", "iShares Core MSCI EM IMI", "IE00BKM4GZ66", "AMS:EMIM", 3, 120, 40, 42, 126, 0.14, 0.2],
  ["TOTALE", null, null, null, null, 1190, null, null, 1303, 1, 1]];
const dash = [["📊 Il mio patrimonio"], [], [null, "Patrimonio totale", null, null, "Valore ETF"], [null, 4303, null, null, 1303], [], [null, "Componente", null, null, "Valore (€)"], [null, "Fondo emergenza", null, null, 3000]];
const sheets = [{ name: "📊 Dashboard", aoa: dash }, { name: "📈 ETF", aoa: etf }, { name: "🧾 Transazioni", aoa: tx }];
const n = P.normalizeExports(sheets), mv = n.find(s => /Movimenti/.test(s.name));
t("i movimenti vengono tradotti (non un PAC di un solo titolo)", !!mv && !n.some(s => s.aoa.slice(1).some(r => r.includes("🧾 Transazioni"))));
const titoli = mv ? [...new Set(mv.aoa.slice(1).map(r => r[2]))].sort() : [];
t("tre strumenti, presi dalla colonna «ETF»", JSON.stringify(titoli) === '["CSNDX","EIMI","SWDA"]', JSON.stringify(titoli));
t("tutte le righe lette, PAC e Saveback come acquisti", mv && mv.aoa.length - 1 === 5 && mv.aoa.slice(1).every(r => r[1] === "Acquisto"), mv && JSON.stringify(mv.aoa.slice(1).map(r => r[1])));
t("quote, prezzo e importo dalle intestazioni italiane", mv && mv.aoa[1][5] === 10 && Math.abs(mv.aoa[1][6] - 100) < 1e-9 && mv.aoa[1][7] === 1000, mv && JSON.stringify(mv.aoa[1]));
const r = P.localRecipe(n), pos = r.recipe.posizioni;
t("il foglio ETF dà le posizioni con ISIN e codice di borsa", pos.length === 3 && pos.every(p => /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(p.isin)) && pos[0].simbolo === "AMS:IWDA", JSON.stringify(pos.map(p => [p.ticker, p.isin, p.simbolo])));
t("ricetta: movimenti e posizioni insieme", r.parts.some(x => x.kind === "movimenti") && r.parts.some(x => x.kind === "posizioni"));
/* un vero PAC su un solo titolo continua a essere riconosciuto come tale */
const pac = [["PAC iShares Core MSCI World IE00B4L5Y983"], ["Data", "Quote", "Prezzo", "Importo"], [d("2024-01-02"), 1, 80, 80], [d("2024-02-01"), 1, 82, 82], [d("2024-03-01"), 1, 85, 85]];
const n2 = P.normalizeExports([{ name: "PAC SWDA", aoa: pac }]), mv2 = n2.find(s => /Movimenti/.test(s.name));
t("un PAC di un solo titolo resta riconosciuto", !!mv2 && mv2.aoa.length - 1 === 3, n2.map(s => s.name).join(" | "));
console.log(`\n${pass} superati, ${fail} falliti`);
process.exit(fail ? 1 : 0);
