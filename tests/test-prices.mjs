// Test della fonte dei prezzi (rete vera): Yahoo Finance, con Alpha Vantage come riserva se c'è la chiave.
// Controlla storici mensili continui, valute corrette, borse diverse e simboli inesistenti.
// Uso: node tools/test-prices.mjs
import prices from "../api/prices.js";

let pass = 0, fail = 0;
const t = (name, ok, info = "") => { if (ok) { pass++; console.log("  ok      " + name); } else { fail++; console.log(`  FALLITO ${name} ${info}`); } };
const get = async symbol => { const r = { status(c) { this.c = c; return this; }, setHeader() {}, json(o) { this.o = o; return this; } }; await prices({ method: "GET", query: { symbol }, headers: {} }, r); return { code: r.c || 200, ...r.o }; };
const gaps = p => { let mx = 0; for (let i = 1; i < p.length - 1; i++) mx = Math.max(mx, (new Date(p[i].d) - new Date(p[i - 1].d)) / 864e5); return mx; };

const cases = [["IWDA.AMS", "EUR", 150], ["XXSC.DEX", "EUR", 150], ["SWDA.LON", "GBX", 150], ["ENI.MIL", "EUR", 200], ["AAPL", "USD", 400], ["MC.PAR", "EUR", 200]];
for (const [s, cur, min] of cases) {
  const o = await get(s);
  t(`${s}: ${o.points ? o.points.length : 0} mesi da ${o.source || "—"}, valuta ${o.currency}`, !o.error && o.points.length >= min && o.currency === cur && gaps(o.points) <= 31, o.error || `salto massimo ${gaps(o.points || [])} giorni`);
}
const bad = await get("NONESISTE.AMS");
t("simbolo inesistente: errore chiaro, nessun dato inventato", bad.code === 404 && /non trovato/i.test(bad.error || ""), JSON.stringify(bad).slice(0, 120));
const inv = await get("../x");
t("simbolo non valido rifiutato", inv.code === 400);
console.log(`\n${pass} superati, ${fail} falliti`);
process.exit(fail ? 1 : 0);
