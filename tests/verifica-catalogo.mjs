/* Verifica i candidati del catalogo: ISIN su OpenFIGI (funzione vera /api/isin) e prezzi veri (Yahoo, /api/prices).
   Uso: node verifica-catalogo.mjs  → scrive files/catalogo-verificato.json e stampa i dubbi. */
import { CAND } from "./catalogo-candidati.mjs";
import { writeFileSync } from "node:fs";
const isin = (await import("../api/isin.js")).default, prices = (await import("../api/prices.js")).default;
const call = (h, query) => new Promise(ok => { const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, setHeader() {}, json(j) { ok({ code: this.statusCode, j }); }, end() { ok({ code: this.statusCode, j: null }); }, send(x) { ok({ code: this.statusCode, j: x }); } }; h({ method: "GET", query, headers: {} }, res).catch(e => ok({ code: 500, j: { error: e.message } })); });
const words = s => String(s || "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter(w => w.length > 2 && !["ETF", "UCITS", "ACC", "DIST", "THE", "PLC", "USD", "EUR"].includes(w));
const sim = (a, b) => { const A = new Set(words(a)), B = new Set(words(b)); let k = 0; A.forEach(w => B.has(w) && k++); return A.size ? k / A.size : 0; };
const seen = new Set(), out = [], dubbi = [], uniq = CAND.filter(c => !seen.has(c[2]) && seen.add(c[2]));
const found = new Map();
for (let i = 0; i < uniq.length; i += 10) {
  const part = uniq.slice(i, i + 10), r = await call(isin, { isin: part.map(c => c[2]).join(",") });
  ((r.j && r.j.results) || []).forEach(x => x && found.set(x.isin, x));
  if (r.code !== 200) dubbi.push("lotto " + i + ": " + r.code + " " + JSON.stringify(r.j).slice(0, 100));
  await new Promise(r => setTimeout(r, 2500));
}
for (const [tk, nome, id, cls, gr] of uniq) {
  const best = found.get(id);
  if (!best || !best.simbolo) { dubbi.push(`${tk} ${id}: nessuna quotazione`); continue; }
  const p = await call(prices, { symbol: best.simbolo, v: "4" }); const n = p.j && p.j.points ? p.j.points.length : 0;
  const s = Math.max(sim(nome, best.nome), sim(best.nome, nome));
  out.push({ tk, nome, isin: id, cls, gr, simbolo: best.simbolo, figi: best.nome, punti: n, somiglianza: +s.toFixed(2) });
  if (!n) dubbi.push(`${tk} ${id}: ${best.simbolo} senza prezzi`);
  else if (s < .3) dubbi.push(`${tk} ${id}: nome diverso «${best.nome}» (simbolo ${best.simbolo})`);
  await new Promise(r => setTimeout(r, 250));
}
writeFileSync(new URL("./files/catalogo-verificato.json", import.meta.url), JSON.stringify(out, null, 1));
console.log("verificati", out.filter(x => x.punti).length, "su", uniq.length); console.log(dubbi.join("\n"));
