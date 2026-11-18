// Raccolta di file di prova: forme di Excel molto diverse, tutte con dati inventati.
// Ogni voce: { id, descr, sheets: [{name, aoa}], expect: { minAssets?, und?, assetsInclude? } }
// Le date sono oggetti Date (come le legge SheetJS con cellDates) oppure testo, come capita nei file veri.

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
const ME = (y, m) => new Date(y, m + 1, 0);
const series = (n, p0, mu, sd) => { let p = p0; return Array.from({ length: n }, () => (p *= 1 + mu + rnd() * sd * 2)); };
const itNum = x => x.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const months = (y0, m0, n) => Array.from({ length: n }, (_, k) => ME(y0 + Math.floor((m0 + k) / 12), (m0 + k) % 12));
const bizDays = (start, n) => { const out = []; let d = new Date(start); while (out.length < n) { const w = d.getDay(); if (w && w < 6) out.push(new Date(d)); d.setDate(d.getDate() + 1); } return out; };

export function corpus() {
  const C = [];

  // 1) serie in colonna con titoli sopra, numeri all'italiana come testo e una colonna di note
  { const M = months(2015, 0, 72), a = series(72, 60, .007, .04), b = series(72, 25, .004, .05);
    C.push({ id: "titoli-sopra", descr: "Titolo e righe vuote sopra, numeri come testo italiano, colonna note",
      sheets: [{ name: "Portafoglio", aoa: [["Il mio portafoglio ETF"], ["aggiornato a mano"], [], ["Mese", "MSCI World (€)", "Emergenti (€)", "Note"],
        ...M.map((d, i) => [d, itNum(a[i]), itNum(b[i]), i % 12 === 0 ? "ribilanciato" : null]), [], ["Media", null, null, null]] }],
      expect: { exactAssets: 2, minObs: 72 } }); }

  // 2) export di Yahoo: un foglio per titolo con Open/High/Low/Close/Adj Close/Volume, giornaliero
  { const D = bizDays("2023-01-02", 300), mk = (p0) => { const c = series(300, p0, .0004, .015); return [["Date", "Open", "High", "Low", "Close", "Adj Close", "Volume"], ...D.map((d, i) => [d, c[i] * .99, c[i] * 1.01, c[i] * .98, c[i], c[i] * .97, Math.round(1e5 + rnd() * 5e4)])]; };
    C.push({ id: "yahoo-un-foglio-per-titolo", descr: "Un foglio per titolo, colonne OHLC, Adj Close e Volume",
      sheets: [{ name: "AAPL", aoa: mk(150) }, { name: "MSFT", aoa: mk(300) }, { name: "VWCE", aoa: mk(100) }],
      expect: { exactAssets: 3, minObs: 250, ai: true } }); }

  // 3) tracker a matrice: un foglio per anno, nomi in colonna A, valuta in simboli, sezioni e totali
  { const yr = (y, carry) => { const cols = [ME(y - 1, 11), ...months(y, 0, 12)], v = (b, g) => cols.map((_, k) => Math.round(b * (1 + g * k + rnd() * .02)));
      return { name: String(y), aoa: [["Voce", "Valuta", ...cols], ["Investimenti"], ["ETF Mondo", "€", ...v(20000 + carry, .01)], ["ETF Bond", "€", ...v(8000, .002)], ["Azioni USA", "$", ...v(5000, .015)],
        ["Conti"], ["Conto corrente", "€", ...v(3000, 0)], ["Passività"], ["Prestito auto", "€", ...cols.map(() => -4000)], ["Totale patrimonio", "€", ...v(32000 + carry, .008)],
        ["Cambi"], ["EURUSD", null, ...cols.map(() => 1.08 + rnd() * .04)]] }; };
    C.push({ id: "tracker-anni", descr: "Tracker con un foglio per anno, date in riga, valute come simboli",
      sheets: [yr(2022, 0), yr(2023, 3000), yr(2024, 6000), { name: "Note", aoa: [["Obiettivi"], ["comprare casa"]] }],
      expect: { minAssets: 2, ai: true } }); }

  // 4) movimenti di un broker
  { const rows = [["Data operazione", "Operazione", "ISIN", "Titolo", "Quantità", "Prezzo", "Controvalore", "Valuta"]];
    const tit = [["IE00B4L5Y983", "iShares Core MSCI World", 80], ["IE00BKM4GZ66", "iShares Core MSCI EM IMI", 30], ["US0378331005", "Apple Inc", 180]];
    months(2024, 0, 14).forEach((d, i) => tit.forEach(([isin, n, p], j) => { if ((i + j) % 2) return; const q = 2 + (i % 3), px = +(p * (1 + i * .01)).toFixed(2); rows.push([d, "Acquisto", isin, n, q, px, -q * px, j === 2 ? "USD" : "EUR"]); }));
    rows.push([ME(2025, 2), "Vendita", "US0378331005", "Apple Inc", 3, 210, 630, "USD"]);
    C.push({ id: "movimenti-broker", descr: "Export di un broker: acquisti e vendite con ISIN", sheets: [{ name: "Movimenti", aoa: rows }], expect: { und: true, ai: true } }); }

  // 5) tabella di rendimenti mensili: anni in riga, mesi in colonna, percentuali come testo
  { const head = ["Anno", "Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic", "Anno"];
    const rows = [["Fondo Bilanciato Prudente – rendimenti mensili"], [], head, ...[2019, 2020, 2021, 2022, 2023, 2024].map(y => [y, ...Array.from({ length: 12 }, () => `${(rnd() * 6).toFixed(2).replace(".", ",")}%`), "—"])];
    C.push({ id: "matrice-rendimenti", descr: "Factsheet: anni in riga, mesi in colonna, percentuali", sheets: [{ name: "Performance", aoa: rows }], expect: { exactAssets: 1, minObs: 72, ai: true } }); }

  // 6) riepilogo di posizioni senza storico
  C.push({ id: "riepilogo-posizioni", descr: "Fotografia del portafoglio: strumenti, valori e pesi, nessuna data",
    sheets: [{ name: "Riepilogo", aoa: [["Strumento", "Ticker", "ISIN", "Valore €", "Peso", "Peso obiettivo"], ["Vanguard FTSE All-World", "VWCE", "IE00BK5BQT80", 12500, "62%", "60%"], ["iShares Euro Govt Bond", "IEGA", "IE00B4WXJJ64", 5000, "25%", "30%"], ["Xtrackers MSCI EM", "XMME", "IE00BTJRMP35", 2600, "13%", "10%"], ["Totale", null, null, 20100, "100%", "100%"], [], ["Fondo emergenza", null, null, 6000, null, null]] }],
    expect: { und: true, ai: true } });

  // 7) due tabelle affiancate nello stesso foglio, con date diverse
  { const A = months(2018, 0, 60), B = months(2020, 6, 40), a = series(60, 100, .006, .04), b = series(40, 50, .003, .03);
    const n = Math.max(A.length, B.length) + 2, aoa = Array.from({ length: n }, () => []);
    aoa[0] = ["Prezzi azioni", null, null, null, "Prezzi oro"]; aoa[1] = ["Data", "Indice", null, null, "Data", "Oro €/g"];
    A.forEach((d, i) => { aoa[i + 2][0] = d; aoa[i + 2][1] = a[i]; }); B.forEach((d, i) => { aoa[i + 2][4] = d; aoa[i + 2][5] = b[i]; });
    C.push({ id: "tabelle-affiancate", descr: "Due tabelle con date diverse nello stesso foglio", sheets: [{ name: "Dati", aoa }], expect: { exactAssets: 2, minObs: 70, ai: true } }); }

  return C;
}
