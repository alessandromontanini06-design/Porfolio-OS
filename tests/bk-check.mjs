// Per ogni CSV d'esempio: cosa ne fa la normalizzazione degli export (broker riconosciuto, movimenti, prime righe)
import { POS as P } from "../js/engine.js";
import fs from "node:fs"; import path from "node:path";
const dirs = process.argv.slice(2);
for (const d of dirs) for (const f of fs.readdirSync(d).filter(x => /\.csv$/i.test(x)).sort()) {
  let buf = fs.readFileSync(path.join(d, f)), text = new TextDecoder("utf-8").decode(buf); if (text.includes("\uFFFD")) text = new TextDecoder("windows-1252").decode(buf);
  const sheets = P.normalizeExports([{ name: f.replace(/\.csv$/, ""), aoa: P.parseCSV(text) }]), s = sheets[0];
  const rows = s.aoa.slice(1), mov = s.name.startsWith("★ Movimenti");
  const L = P.localRecipe(sheets), T = L && L.recipe.movimenti ? P.applyRecipe(sheets, { movimenti: L.recipe.movimenti }).tx : null;
  console.log(`${mov ? "OK " : "-- "} ${f.padEnd(30)} ${mov ? `${(s.how||"altro").padEnd(22)} ${rows.length} righe (${["Acquisto", "Vendita", "Dividendo"].map(k => rows.filter(r => r[1] === k).length).join("/")})` : ""} posizioni=${T ? T.positions.length : "-"}`);
  if (mov && process.env.V) rows.slice(0, 3).forEach(r => console.log("      ", JSON.stringify(r.map(x => x instanceof Date ? x.toISOString().slice(0, 10) : x)).slice(0, 200)));
}
