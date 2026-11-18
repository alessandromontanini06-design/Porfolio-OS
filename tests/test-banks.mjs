// File in stile «banca italiana»: movimenti titoli, fondi e rendiconti di posizione con le intestazioni che usano le banche.
// ATTENZIONE: intestazioni RICOSTRUITE (le banche non pubblicano il formato): servono a rendere tollerante il riconoscitore,
// vanno confermate con export veri e anonimi. Uso: node tools/test-banks.mjs
import P from "../js/engine.js";
const W = "IE00B4L5Y983", S = "IE00B5BMR087", E = "IE00BKM4GZ66", B = "IT0005436693", F = "IE00B03HCZ61";
let pass = 0, fail = 0;
const t = (name, ok, info = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${name}${!ok && info ? " · " + info : ""}`); };
const read = sheets => { const SH = P.normalizeExports(sheets), L = P.localRecipe(SH); if (!L) return { kind: null }; const A = P.applyRecipe(SH, L.recipe);
  return { kind: L.recipe.movimenti ? "movimenti" : (L.recipe.posizioni || []).length ? "posizioni" : "altro", tx: (A.tx && A.tx.positions) || [], pos: L.recipe.posizioni || [], R: L.recipe, A }; };
const q = (ps, id) => { const p = (ps || []).find(x => x.isin === id || x.titolo === id); return p ? +p.quantita.toFixed(4) : null; };
const CASES = {
  "Intesa · movimenti dossier titoli": { aoa: [
    ["Movimenti dossier titoli n. 1234567"], ["Periodo: 01/01/2024 - 31/12/2024"], [],
    ["Data contabile", "Data valuta", "Causale", "Descrizione titolo", "Codice ISIN", "Quantità/Valore nominale", "Prezzo", "Divisa", "Controvalore", "Commissioni"],
    ["10/01/2024", "12/01/2024", "ACQUISTO TITOLI", "ISHARES CORE MSCI WORLD UCITS ETF", W, "20", "81,20", "EUR", "1.624,00", "5,00"],
    ["10/02/2024", "12/02/2024", "ACQUISTO TITOLI", "BTP VALORE GN27 EUR", B, "5.000", "100,10", "EUR", "5.005,00", "0"],
    ["10/03/2024", "12/03/2024", "VENDITA TITOLI", "ISHARES CORE MSCI WORLD UCITS ETF", W, "5", "86,00", "EUR", "430,00", "5,00"],
    ["15/06/2024", "15/06/2024", "STACCO CEDOLA", "BTP VALORE GN27 EUR", B, "5.000", "", "EUR", "81,25", ""]],
    expect: { [W]: 15, [B]: 5000 } },
  "UniCredit · operazioni titoli": { aoa: [
    ["Data operazione", "Operazione", "Strumento finanziario", "ISIN", "Q.tà", "Prezzo eseguito", "Importo netto", "Divisa"],
    ["05/01/2024", "Acquisto", "ISHARES CORE S&P 500 UCITS ETF", S, "3", "480,00", "-1.442,50", "EUR"],
    ["05/02/2024", "Acquisto", "ISHARES CORE MSCI EM IMI UCITS ETF", E, "40", "30,50", "-1.222,50", "EUR"],
    ["05/04/2024", "Vendita", "ISHARES CORE S&P 500 UCITS ETF", S, "1", "500,00", "497,50", "EUR"]],
    expect: { [S]: 2, [E]: 40 } },
  "BancoPosta · lista movimenti titoli": { aoa: [
    ["Data", "Tipo movimento", "Denominazione titolo", "Codice titolo", "Quantità", "Prezzo unitario", "Controvalore operazione"],
    ["20/01/2024", "Sottoscrizione", "BTP VALORE GN27 EUR", B, "10000", "100", "10000"],
    ["20/03/2024", "Acquisto", "ISHARES CORE MSCI WORLD UCITS ETF", W, "8", "84,1", "672,8"]],
    expect: { [B]: 10000, [W]: 8 } },
  "Mediolanum · fondi": { aoa: [
    ["Data", "Tipo operazione", "Fondo", "Codice ISIN", "Numero quote", "Valore quota", "Importo"],
    ["01/02/2024", "Versamento PAC", "VANGUARD GLOBAL STOCK INDEX", F, "4,123", "48,50", "200,00"],
    ["01/03/2024", "Versamento PAC", "VANGUARD GLOBAL STOCK INDEX", F, "4,050", "49,38", "200,00"],
    ["15/03/2024", "Rimborso", "VANGUARD GLOBAL STOCK INDEX", F, "1,000", "50,00", "50,00"]],
    expect: { [F]: 7.173 } },
  "Banca Sella · movimenti titoli": { aoa: [
    ["Data", "Segno", "Descrizione", "Codice ISIN", "Quantità", "Prezzo", "Cambio", "Controvalore €"],
    ["11/01/2024", "A", "ISHARES CORE MSCI WORLD", W, "6", "81", "1", "486"],
    ["11/02/2024", "A", "ISHARES CORE S&P 500", S, "1", "482", "1", "482"],
    ["11/05/2024", "V", "ISHARES CORE MSCI WORLD", W, "2", "90", "1", "180"]],
    expect: { [W]: 4, [S]: 1 } },
  "Webank · eseguiti": { aoa: [
    ["Data Operazione", "Segno", "Titolo", "ISIN", "Q.ta", "Prezzo", "Controvalore", "Divisa"],
    ["02/01/2024", "Acquisto", "ISHARES CORE MSCI EM IMI", E, "25", "30,1", "752,5", "EUR"],
    ["02/02/2024", "Acquisto", "ISHARES CORE MSCI WORLD", W, "3", "82", "246", "EUR"]],
    expect: { [E]: 25, [W]: 3 } }
};
console.log("Movimenti in stile banca italiana");
for (const [name, c] of Object.entries(CASES)) {
  const r = read([{ name: "Movimenti", aoa: c.aoa }]), got = Object.fromEntries(Object.keys(c.expect).map(k => [k, q(r.tx, k)]));
  t(`${name}: ${Object.keys(c.expect).length} strumenti, quantità giuste`, r.kind === "movimenti" && Object.entries(c.expect).every(([k, v]) => got[k] != null && Math.abs(got[k] - v) < 1e-3), `tipo ${r.kind} · ${JSON.stringify(got)}`);
}
console.log("Rendiconti di posizione (fotografia del dossier)");
const RENDICONTO = [
  ["Rendiconto deposito titoli al 30/09/2024"], [],
  ["Titolo", "ISIN", "Quantità", "Prezzo medio di carico", "Prezzo di mercato", "Controvalore di mercato", "Peso %"],
  ["ISHARES CORE MSCI WORLD UCITS ETF", W, "15", "82,00", "95,40", "1.431,00", "48%"],
  ["ISHARES CORE S&P 500 UCITS ETF", S, "2", "481,00", "560,00", "1.120,00", "38%"],
  ["BTP VALORE GN27 EUR", B, "400", "100,10", "101,00", "404,00", "14%"],
  ["Totale", "", "", "", "", "2.955,00", "100%"]];
const r = read([{ name: "Rendiconto", aoa: RENDICONTO }]);
const pv = (r.A && r.A.pos ? r.A.pos : r.pos).map ? (r.A.positions || r.pos) : [];
t("rendiconto: riconosciuto come elenco di posizioni con 3 titoli", r.kind === "posizioni" && r.pos.length === 3, JSON.stringify({ kind: r.kind, n: r.pos.length }));
t("rendiconto: valore = controvalore di mercato, non di carico", r.pos.some(p => (p.isin === W || p.ticker === W || /MSCI WORLD/.test(p.nome || "")) && Math.abs((p.valore || 0) - 1431) < 1), JSON.stringify(r.pos.slice(0, 2)));
console.log(`\n${pass} superati, ${fail} falliti`); process.exit(fail ? 1 : 0);
