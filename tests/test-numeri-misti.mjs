// Numeri degli export scritti in due modi nello stesso file (es. Degiro: «-1,00» e «-97.93»): un separatore che non può essere
// delle migliaia (non a gruppi di 3 cifre, o dopo uno 0) è il decimale. Le migliaia vere restano migliaia.
const { POS } = await import(new URL("../js/engine.js", import.meta.url));
import fs from "node:fs";
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
const casi = [["-97.93", ",", -97.93], ["1.39", ",", 1.39], ["-1.2108", ",", -1.2108], ["0.039", ",", 0.039], ["9999.99", ",", 9999.99],
  ["1.000", ",", 1000], ["12.345.678", ",", 12345678], ["1.234,56", ",", 1234.56], ["-1,00", ",", -1], ["26,45", ",", 26.45],
  ["26,45", ".", 26.45], ["1,2108", ".", 1.2108], ["0,039", ".", 0.039], ["1,000", ".", 1000], ["1,234.56", ".", 1234.56], ["-63.97", ".", -63.97], ["€ 1.234,50", ",", 1234.5], ["(12,30)", ",", -12.3]];
for (const [v, d, atteso] of casi) { const x = POS.bkNum(v, d); t(`«${v}» con decimali «${d}» → ${atteso}`, Math.abs(x - atteso) < 1e-9, x); }
const csv = fs.readFileSync(new URL("files/web/ghostfolio/degiro-export.csv", import.meta.url), "utf-8");
const n = POS.normalizeExports([{ name: "degiro", aoa: POS.parseCSV(csv) }]), m = (n.sheets || n).find(s => /Movimenti/.test(s.name));
const row = (op, nome, d) => m.aoa.find(r => r[1] === op && String(r[2]).startsWith(nome) && (!d || String(r[0].toISOString ? r[0].toISOString() : r[0]).startsWith(d)));
t("Degiro: acquisto Vanguard del 2023 a 97,93 € (non 9.793)", row("Acquisto", "VANGUARD", "2023")[7] === 97.93);
t("Degiro: dividendo AT&T 1,39 $ (non 139)", row("Dividendo", "AT&T")[7] === 1.39);
t("Degiro: dividendo iShares S&P 500 11,82 $ (non 1.182)", row("Dividendo", "ISHARES CORE S&P")[7] === 11.82);
t("Degiro: dividendi totali sotto i 20 $ (con il segnaposto Toyota a parte)", m.aoa.filter(r => r[1] === "Dividendo" && !/TOYOTA/.test(r[2])).reduce((a, r) => a + r[7], 0) < 20);
console.log(`\n${pass} superati, ${fail} falliti`); process.exit(fail ? 1 : 0);
