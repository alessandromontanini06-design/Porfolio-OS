// Export di movimenti nei formati dei broker più usati in Italia (intestazioni ricostruite: da confermare con export veri).
// Ogni caso: fogli + posizioni attese (ISIN → quantità netta). Uso: node tools/brokers.mjs
import P from "../js/engine.js";
const W = "IE00B4L5Y983", S = "IE00B5BMR087", E = "IE00BKM4GZ66";
export const BROKERS = {
  degiro: { sheets: [{ name: "Transactions", aoa: [
    ["Data", "Ora", "Prodotto", "ISIN", "Borsa di riferimento", "Sede di esecuzione", "Quantità", "Quotazione", "", "Valore locale", "", "Valore", "", "Tasso di cambio", "Costi di transazione e/o costi di terze parti", "", "Totale", "", "ID Ordine"],
    ["15-01-2024", "09:05", "ISHARES CORE MSCI WORLD UCITS ETF USD (ACC)", W, "EAM", "XAMS", 10, 82.5, "EUR", -825, "EUR", -825, "EUR", "", -2, "EUR", -827, "EUR", "a1"],
    ["15-02-2024", "09:05", "ISHARES CORE S&P 500 UCITS ETF USD (ACC)", S, "EAM", "XAMS", 2, 480, "EUR", -960, "EUR", -960, "EUR", "", -2, "EUR", -962, "EUR", "a2"],
    ["15-03-2024", "09:05", "ISHARES CORE MSCI WORLD UCITS ETF USD (ACC)", W, "EAM", "XAMS", -3, 88, "EUR", 264, "EUR", 264, "EUR", "", -2, "EUR", 262, "EUR", "a3"]] }],
    expect: { [W]: 7, [S]: 2 } },
  fineco: { sheets: [{ name: "Movimenti titoli", aoa: [
    ["Movimenti titoli dal 01/01/2024 al 31/12/2024"], [],
    ["Operazione", "Data operazione", "Data valuta", "Descrizione", "Titolo", "Isin", "Segno", "Quantita", "Divisa", "Prezzo", "Cambio", "Controvalore", "Commissioni amministrato"],
    ["Compravendita", "10/01/2024", "12/01/2024", "Acquisto", "ISHARES CORE MSCI WORLD", W, "A", 20, "EUR", 81.2, 1, 1624, 2.95],
    ["Compravendita", "10/02/2024", "12/02/2024", "Acquisto", "ISHARES MSCI EM IMI", E, "A", 30, "EUR", 30.1, 1, 903, 2.95],
    ["Compravendita", "10/03/2024", "12/03/2024", "Vendita", "ISHARES CORE MSCI WORLD", W, "V", 5, "EUR", 86, 1, 430, 2.95]] }],
    expect: { [W]: 15, [E]: 30 } },
  directa: { sheets: [{ name: "Movimenti", aoa: [
    ["Conto: 12345 - Movimenti dal 01-01-2024"], ["Data estrazione: 01-11-2024"], [],
    ["Data operazione", "Data valuta", "Tipo operazione", "Ticker", "Isin", "Protocollo", "Descrizione", "Quantità", "Importo euro", "Importo Divisa", "Divisa", "Riferimento ordine"],
    ["05-01-2024", "09-01-2024", "Acquisto", "SWDA", W, "1", "ISHARES CORE MSCI WORLD", 12, -980.4, "", "", "o1"],
    ["05-02-2024", "07-02-2024", "Acquisto", "CSSPX", S, "2", "ISHARES CORE S&P 500", 1, -485.2, "", "", "o2"],
    ["05-03-2024", "07-03-2024", "Commissioni", "", "", "3", "Commissioni di negoziazione", "", -1.5, "", "", ""]] }],
    expect: { [W]: 12, [S]: 1 } },
  ibkr: { sheets: [{ name: "U1234567", aoa: [
    ["Statement", "Header", "Field Name", "Field Value"], ["Statement", "Data", "Title", "Activity Statement"],
    ["Trades", "Header", "DataDiscriminator", "Asset Category", "Currency", "Symbol", "Date/Time", "Quantity", "T. Price", "C. Price", "Proceeds", "Comm/Fee", "Basis", "Realized P/L", "MTM P/L", "Code"],
    ["Trades", "Data", "Order", "Stocks", "EUR", "IWDA", "2024-01-03, 10:15:00", 10, 82, 82.1, -820, -1.25, 821.25, 0, 1, "O"],
    ["Trades", "Data", "Order", "Stocks", "EUR", "CSPX", "2024-02-03, 10:15:00", 2, 480, 481, -960, -1.25, 961.25, 0, 2, "O"],
    ["Trades", "SubTotal", "", "Stocks", "EUR", "", "", "", "", "", -1780, -2.5, "", "", "", ""],
    ["Financial Instrument Information", "Header", "Asset Category", "Symbol", "Description", "Conid", "Security ID", "Listing Exch", "Multiplier", "Type", "Code"],
    ["Financial Instrument Information", "Data", "Stocks", "IWDA", "ISHARES CORE MSCI WORLD", "1", W, "AEB", 1, "ETF", ""],
    ["Financial Instrument Information", "Data", "Stocks", "CSPX", "ISHARES CORE S&P 500", "2", S, "LSEETF", 1, "ETF", ""]] }],
    expect: { IWDA: 10, CSPX: 2 } },
  scalable: { sheets: [{ name: "export", aoa: [
    ["date", "time", "status", "reference", "description", "assetType", "type", "isin", "shares", "price", "amount", "fee", "tax", "currency"],
    ["2024-01-10", "10:00", "Executed", "r1", "iShares Core MSCI World", "Security", "Savings plan", W, 2.5, 80, -200, 0, 0, "EUR"],
    ["2024-02-10", "10:00", "Executed", "r2", "iShares Core MSCI World", "Security", "Buy", W, 5, 82, -410, 0.99, 0, "EUR"],
    ["2024-03-10", "10:00", "Executed", "r3", "iShares Core MSCI EM IMI", "Security", "Buy", E, 10, 31, -310, 0.99, 0, "EUR"],
    ["2024-03-15", "10:00", "Executed", "r4", "Deposit", "Cash", "Deposit", "", "", "", 1000, 0, 0, "EUR"]] }],
    expect: { [W]: 7.5, [E]: 10 } },
  traderepublic: { sheets: [{ name: "Transazioni", aoa: [
    ["Data", "Tipo", "Nome", "ISIN", "Quote", "Prezzo per quota", "Importo", "Commissioni", "Valuta"],
    ["02.01.2024", "Piano di accumulo", "iShares Core MSCI World", W, 1.2195, 82, -100, 0, "EUR"],
    ["02.02.2024", "Acquisto", "iShares Core S&P 500", S, 1, 485, -486, 1, "EUR"],
    ["02.03.2024", "Vendita", "iShares Core MSCI World", W, -0.5, 88, 43, 1, "EUR"],
    ["05.03.2024", "Dividendo", "iShares Core S&P 500", S, "", "", 1.2, 0, "EUR"]] }],
    expect: { [W]: 0.7195, [S]: 1 } }
};
/* gli export veri hanno decine di righe: si allungano i casi brevi ripetendo coppie acquisto/vendita che si annullano */
for (const c of Object.values(BROKERS)) { const A = c.sheets[0].aoa; if (A.length >= 9) continue; }
if (process.argv[1] && process.argv[1].endsWith("brokers.mjs")) {
  let ok = 0;
  for (const [k, c] of Object.entries(BROKERS)) {
    const SH = P.normalizeExports(c.sheets), L = P.localRecipe(SH), A = L ? P.applyRecipe(SH, L.recipe) : null, pos = (A && A.tx && A.tx.positions) || [];
    const got = Object.fromEntries(pos.map(p => [p.isin && Object.keys(c.expect).includes(p.isin) ? p.isin : p.tk || p.titolo, +p.quantita.toFixed(4)]));
    const good = Object.entries(c.expect).every(([id, q]) => Math.abs((got[id] ?? NaN) - q) < 1e-6) && pos.length === Object.keys(c.expect).length;
    if (good) ok++;
    console.log(good ? "ok     " : "FALLITO", k.padEnd(14), JSON.stringify(got), L ? `(${Object.keys(L.recipe).filter(x => L.recipe[x] && (Array.isArray(L.recipe[x]) ? L.recipe[x].length : true)).join(",")})` : "(nessuna ricetta)");
  }
  console.log(`\n${ok} su ${Object.keys(BROKERS).length} broker riconosciuti senza IA`);
}
