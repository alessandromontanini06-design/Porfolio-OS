// Motore del registro delle operazioni (POS.ledger): ogni caso è calcolato a mano.
import { POS as P } from "../js/engine.js";
let pass = 0, fail = 0;
const near = (a, b, tol = 1e-6) => Number.isFinite(a) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const t = (name, ok, info = "") => { if (ok) { pass++; console.log("  ok      " + name); } else { fail++; console.log(`  FALLITO ${name} ${info}`); } };
const E = { nome: "ETF", valuta: "EUR" };

console.log("Acquisto con spese");
{ const R = P.ledger({ a: E }, [{ id: 1, data: "2024-01-02", tipo: "acquisto", strumento: "a", quantita: 10, prezzo: 100, spese: 2 }], { a: [{ d: "2024-12-31", v: 120 }] }, {});
  const p = R.posizioni[0];
  t("valore 10 × 120 = 1.200 €", near(R.totale.valore, 1200), R.totale.valore);
  t("versato 1.002 € (spese comprese)", near(R.totale.versato, 1002), R.totale.versato);
  t("guadagno 198 €", near(R.totale.guadagno, 198), R.totale.guadagno);
  t("prezzo medio di carico 100,2 €", near(p.pmc, 100.2), p.pmc);
  t("TIR = (1200/1002)^(365/364) − 1", near(R.totale.tir, Math.pow(1200 / 1002, 365 / 364) - 1, 1e-6), R.totale.tir);
  t("serie giornaliera dal primo acquisto al 31/12", R.serie.length === 365 && R.serie[0].d === "2024-01-02", R.serie.length); }

console.log("Due acquisti e una vendita parziale (costo medio ponderato)");
{ const R = P.ledger({ a: E }, [
    { id: 1, data: "2024-01-02", tipo: "acquisto", strumento: "a", quantita: 10, prezzo: 100 },
    { id: 2, data: "2024-02-01", tipo: "acquisto", strumento: "a", quantita: 10, prezzo: 120 },
    { id: 3, data: "2024-03-01", tipo: "vendita", strumento: "a", quantita: 5, prezzo: 130 }], {}, {});
  const p = R.posizioni[0];
  t("restano 15 quote", near(p.qta, 15), p.qta);
  t("prezzo medio 110 €", near(p.pmc, 110), p.pmc);
  t("plusvalenza realizzata 5 × (130 − 110) = 100 €", near(p.realizzato, 100), p.realizzato);
  t("valore 15 × 130 = 1.950 € (ultimo prezzo noto: la vendita)", near(R.totale.valore, 1950), R.totale.valore);
  t("versato netto 1.000 + 1.200 − 650 = 1.550 €", near(R.totale.versato, 1550), R.totale.versato);
  t("guadagno 400 € = latente 300 + realizzato 100", near(R.totale.guadagno, 400) && near(R.totale.latente, 300) && near(R.totale.realizzato, 100)); }

console.log("Strumento in dollari");
{ const R = P.ledger({ u: { nome: "SPY", valuta: "USD" } }, [{ id: 1, data: "2024-01-02", tipo: "acquisto", strumento: "u", quantita: 10, prezzo: 100, cambio: 1.10 }],
    { u: [{ d: "2024-06-28", v: 110 }] }, { USD: [{ p: "2024-05", v: 1.08 }, { p: "2024-06", v: 1.0 }] }, { al: "2024-06-30" });
  t("costo 1.000 $ / 1,10 = 909,09 €", near(R.posizioni[0].costo, 1000 / 1.1), R.posizioni[0].costo);
  t("valore 1.100 $ al cambio di fine giugno (1,00) = 1.100 €", near(R.totale.valore, 1100), R.totale.valore);
  t("il 29 giugno vale il cambio di fine maggio", near(R.serie.find(s => s.d === "2024-06-29").valore, 1100 / 1.08));
  const R2 = P.ledger({ u: { nome: "SPY", valuta: "USD" } }, [{ id: 1, data: "2024-01-02", tipo: "acquisto", strumento: "u", quantita: 1, prezzo: 100 }], {}, {});
  t("senza cambio: avviso chiaro, nessun numero inventato", R2.avvisi.some(a => /cambio USD/.test(a)) && R2.totale.valore === 0, R2.avvisi.join(" | ")); }

console.log("Sterline in pence (GBX)");
{ const R = P.ledger({ g: { nome: "VUSA", valuta: "GBX" } }, [{ id: 1, data: "2024-01-02", tipo: "acquisto", strumento: "g", quantita: 100, prezzo: 500, cambio: 0.8 }], {}, {});
  t("100 × 500 pence = 500 £ / 0,80 = 625 €", near(R.posizioni[0].costo, 625), R.posizioni[0].costo); }

console.log("Frazionamento");
{ const R = P.ledger({ a: E }, [
    { id: 1, data: "2024-01-02", tipo: "acquisto", strumento: "a", quantita: 10, prezzo: 400 },
    { id: 2, data: "2024-02-01", tipo: "frazionamento", strumento: "a", rapporto: 4 }], { a: [{ d: "2024-02-01", v: 100 }] }, {});
  const p = R.posizioni[0];
  t("10 quote diventano 40, prezzo medio 100 €", near(p.qta, 40) && near(p.pmc, 100), `${p.qta} ${p.pmc}`);
  t("il frazionamento non è un guadagno né una perdita", near(R.totale.guadagno, 0) && near(R.totale.twr, 0), R.totale.guadagno); }

console.log("Correzione senza cancellare");
{ const R = P.ledger({ a: E }, [
    { id: "x", data: "2024-01-02", tipo: "acquisto", strumento: "a", quantita: 10, prezzo: 100 },
    { id: "y", data: "2024-01-03", tipo: "annulla", rif: "x" },
    { id: "z", data: "2024-01-02", tipo: "acquisto", strumento: "a", quantita: 5, prezzo: 100 }], {}, {});
  t("l'acquisto annullato non conta: restano 5 quote", near(R.posizioni[0].qta, 5), R.posizioni[0].qta); }

console.log("TWR non dipende dai versamenti");
{ const R = P.ledger({ a: E }, [
    { id: 1, data: "2024-01-01", tipo: "acquisto", strumento: "a", quantita: 1, prezzo: 100 },
    { id: 2, data: "2024-01-02", tipo: "acquisto", strumento: "a", quantita: 1, prezzo: 150 }],
    { a: [{ d: "2024-01-01", v: 100 }, { d: "2024-01-02", v: 150 }, { d: "2024-01-03", v: 200 }] }, {});
  t("prezzo da 100 a 200: TWR +100%", near(R.totale.twr, 1), R.totale.twr);
  t("guadagno in euro 400 − 250 = 150 €", near(R.totale.guadagno, 150), R.totale.guadagno);
  t("variazione da ieri: +100 € (+33,3%)", near(R.totale.giorno.euro, 100) && near(R.totale.giorno.pct, 1 / 3), JSON.stringify(R.totale.giorno));
  t("il giorno del secondo acquisto il versamento non conta come guadagno", near(R.serie[1].r, 0.5), R.serie[1].r); }

console.log("Dividendi, bollo, TIR di un anno");
{ const R = P.ledger({ a: E }, [
    { id: 1, data: "2023-01-01", tipo: "acquisto", strumento: "a", quantita: 10, prezzo: 100 },
    { id: 2, data: "2023-07-01", tipo: "dividendo", strumento: "a", importo: 30 },
    { id: 3, data: "2023-12-31", tipo: "tassa", importo: 2 }], { a: [{ d: "2024-01-01", v: 100 }] }, {});
  t("dividendo incassato 30 €", near(R.totale.proventi, 30), R.totale.proventi);
  t("bollo tra le spese: 2 €", near(R.totale.spese, 2), R.totale.spese);
  t("guadagno 30 − 2 = 28 €", near(R.totale.guadagno, 28), R.totale.guadagno);
  const R2 = P.ledger({ a: E }, [{ id: 1, data: "2023-01-01", tipo: "acquisto", strumento: "a", quantita: 10, prezzo: 100 }], { a: [{ d: "2024-01-01", v: 110 }] }, {});
  t("1.000 € che diventano 1.100 € in 365 giorni: TIR 10%", near(R2.totale.tir, 0.10, 1e-6), R2.totale.tir); }

console.log("Vendita di più quote di quelle possedute");
{ const R = P.ledger({ a: E }, [
    { id: 1, data: "2024-01-02", tipo: "acquisto", strumento: "a", quantita: 5, prezzo: 100 },
    { id: 2, data: "2024-01-03", tipo: "vendita", strumento: "a", quantita: 10, prezzo: 100 }], {}, {});
  t("vende solo le 5 quote che ci sono e lo dice", near(R.posizioni[0].qta, 0) && R.avvisi.some(a => /ne risultano/.test(a)), R.avvisi.join(" | "));
  t("posizione chiusa: storia conservata, valore zero", R.posizioni[0].aperta === false && R.posizioni[0].ops === 2 && R.totale.valore === 0); }

console.log("Bene senza quotazione (valutazione a mano)");
{ const R = P.ledger({ casa: { nome: "Appartamento", valuta: "EUR" } }, [
    { id: 1, data: "2020-01-01", tipo: "acquisto", strumento: "casa", quantita: 1, prezzo: 200000 },
    { id: 2, data: "2023-06-01", tipo: "valutazione", strumento: "casa", prezzo: 250000 }], {}, {}, { al: "2024-01-01" });
  const p = R.posizioni[0];
  t("vale l'ultima stima: 250.000 €", near(R.totale.valore, 250000), R.totale.valore);
  t("si sa che è una stima e di quando", p.prezzoFonte === "operazione" && p.prezzoData === "2023-06-01", `${p.prezzoFonte} ${p.prezzoData}`);
  t("la stima non è un versamento", near(R.totale.versato, 200000), R.totale.versato); }

console.log("BTP: nominale e prezzo su 100");
{ const B = { btp: { nome: "BTP 3,35% 01MZ35", valuta: "EUR", per100: true } };
  const R = P.ledger(B, [{ id: 1, data: "2024-03-01", tipo: "acquisto", strumento: "btp", quantita: 10000, prezzo: 98.5, spese: 5 }], {}, {}, { al: "2024-06-01" });
  const p = R.posizioni[0];
  t("10.000 € nominali a 98,50 costano 9.850 € + 5 di spese", near(p.costo, 9855), p.costo);
  t("il valore è nominale × prezzo / 100, non nominale × prezzo", near(R.totale.valore, 9850), R.totale.valore);
  const R2 = P.ledger(B, [{ id: 1, data: "2024-03-01", tipo: "acquisto", strumento: "btp", quantita: 10000, prezzo: 98.5, spese: 5 },
    { id: 2, data: "2024-09-01", tipo: "cedola", strumento: "btp", importo: 146.56, valuta: "EUR" },
    { id: 3, data: "2025-01-10", tipo: "valutazione", strumento: "btp", prezzo: 101 }], {}, {}, { al: "2025-01-10" });
  t("nuovo prezzo 101: vale 10.100 €", near(R2.totale.valore, 10100), R2.totale.valore);
  t("cedola netta tra i proventi", near(R2.totale.proventi, 146.56), R2.totale.proventi);
  const R3 = P.ledger(B, [{ id: 1, data: "2024-03-01", tipo: "acquisto", strumento: "btp", quantita: 10000, prezzo: 98.5, spese: 5 },
    { id: 2, data: "2024-09-01", tipo: "cedola", strumento: "btp", importo: 146.56, valuta: "EUR" },
    { id: 3, data: "2035-03-01", tipo: "vendita", strumento: "btp", quantita: 10000, prezzo: 100 }], {}, {}, { al: "2035-03-02" });
  t("rimborso a 100: incassa 10.000 €, guadagno 145 € + cedola", near(R3.posizioni[0].realizzato, 145) && near(R3.totale.guadagno, 145 + 146.56) && R3.totale.valore === 0, `${R3.posizioni[0].realizzato} ${R3.totale.guadagno}`); }

console.log("Dati sbagliati");
{ const R = P.ledger({ a: E }, [{ id: 1, data: "ieri", tipo: "acquisto", strumento: "a", quantita: 1, prezzo: 1 }, { id: 2, data: "2024-01-01", tipo: "regalo", strumento: "a" }, { id: 3, data: "2024-01-01", tipo: "acquisto", strumento: "zz", quantita: 1, prezzo: 1 }], {}, {});
  t("data, tipo e strumento sconosciuti: ignorati con avviso", R.vuoto && R.avvisi.length === 3, R.avvisi.join(" | "));
  t("registro vuoto: zero, non errori", P.ledger({}, [], {}, {}).totale.valore === 0); }

console.log(`\n${pass} superati, ${fail} falliti`);
process.exit(fail ? 1 : 0);
