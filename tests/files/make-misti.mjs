// File di prova «cliente di banca»: ETF, fondo comune, BTP con cedole, azione comprata e venduta (formato Movimenti titoli tipo Fineco).
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const H = ["Operazione", "Data operazione", "Data valuta", "Descrizione", "Titolo", "Isin", "Segno", "Quantita", "Divisa", "Prezzo", "Cambio", "Controvalore", "Commissioni amministrato"];
const R = [];
const add = (d, desc, tit, isin, s, q, px, ctv, comm = 2.95) => R.push(["", d, d, desc, tit, isin, s, q, "EUR", px, 1, ctv, comm]);
// ETF: tre acquisti
add("15/01/2021", "Compravendita titoli", "ISHARES CORE MSCI WORLD", "IE00B4L5Y983", "A", 150, 66.2, -9930);
add("15/01/2023", "Compravendita titoli", "ISHARES CORE MSCI WORLD", "IE00B4L5Y983", "A", 100, 72.9, -7290);
add("15/06/2024", "Compravendita titoli", "ISHARES CORE MSCI WORLD", "IE00B4L5Y983", "A", 60, 94.1, -5646);
// fondo comune della banca: due sottoscrizioni
add("10/03/2021", "Sottoscrizione fondi", "EURIZON BOND HIGH YIELD Z", "LU0335991534", "A", 40, 245.1, -9804, 0);
add("10/09/2023", "Sottoscrizione fondi", "EURIZON BOND HIGH YIELD Z", "LU0335991534", "A", 20, 262.4, -5248, 0);
// BTP: acquisto e cedole semestrali
add("02/02/2022", "Compravendita titoli", "BTP 1,45% 15MG25", "IT0005327306", "A", 15000, 101.2, -15180);
for (const d of ["15/05/2022", "15/11/2022", "15/05/2023", "15/11/2023", "15/05/2024", "15/11/2024"]) R.push(["", d, d, "Accredito cedole", "BTP 1,45% 15MG25", "IT0005327306", "", "", "EUR", "", 1, 95.16, 0]);
add("15/05/2025", "Rimborso titoli", "BTP 1,45% 15MG25", "IT0005327306", "V", 15000, 100, 15000, 0);
// BTP ancora in portafoglio, comprato sotto la pari, con cedole nette
add("12/03/2024", "Compravendita titoli", "BTP 3,35% 01MZ35", "IT0005358806", "A", 10000, 96.4, -9640);
for (const d of ["01/09/2024", "01/03/2025", "01/09/2025", "01/03/2026", "01/09/2026"]) R.push(["", d, d, "Accredito cedole", "BTP 3,35% 01MZ35", "IT0005358806", "", "", "EUR", "", 1, 146.56, 0]);
// azione: acquisto e vendita
add("05/04/2022", "Compravendita titoli", "ENI", "IT0003132476", "A", 500, 12.8, -6400);
add("20/09/2024", "Compravendita titoli", "ENI", "IT0003132476", "V", 500, 14.9, 7450);
R.push(["", "21/05/2024", "21/05/2024", "Dividendo", "ENI", "IT0003132476", "", "", "EUR", "", 1, 177.5, 0]);
const aoa = [["Movimenti titoli dal 01/01/2021 al 15/11/2026"], [], H, ...R];
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const p = await b.newPage(); await p.goto("about:blank");
await p.addScriptTag({ url: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js" });
const b64 = await p.evaluate(a => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a), "Movimenti titoli"); return XLSX.write(wb, { type: "base64", bookType: "xlsx" }); }, aoa);
fs.writeFileSync(import.meta.dirname + "/Movimenti_cliente_banca.xlsx", Buffer.from(b64, "base64")); await b.close(); console.log("ok", R.length, "righe");
