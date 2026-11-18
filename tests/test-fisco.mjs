// Fisco italiano (stima) del patrimonio: casi calcolati a mano. Solo motore, veloce.
import { POS as P } from "../js/engine.js";
let pass = 0, fail = 0; const t = (n, ok, i = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok     " : "FALLITO"} ${n}${!ok && i ? " · " + i : ""}`); };
const near = (a, b, e = 0.01) => Math.abs(a - b) <= e;
const S = {
  V: { nome: "Vecchia azione", valuta: "EUR" },
  A: { nome: "Eni", valuta: "EUR" },
  E: { nome: "iShares Core MSCI World UCITS ETF", valuta: "EUR" },
  B: { nome: "BTP 3,35% 01MZ35", valuta: "EUR", per100: true, governativo: true },
  C: { nome: "Bitcoin", simbolo: "BTC-EUR", valuta: "EUR" },
  E2: { nome: "Vanguard FTSE All-World", valuta: "EUR" },
  A2: { nome: "Stellantis", valuta: "EUR" },
  K: { nome: "Appartamento", valuta: "EUR", manuale: true, tipo: "casa" }
};
const op = (data, tipo, strumento, quantita, prezzo) => ({ id: data + strumento + tipo, data, tipo, strumento, quantita, prezzo });
const O = [
  op("2020-01-10", "acquisto", "V", 100, 10), op("2021-03-01", "vendita", "V", 100, 5),          // −500 nel 2021, scade il 31/12/2025
  op("2024-01-10", "acquisto", "A", 100, 20), op("2024-06-01", "vendita", "A", 100, 15),         // −500 nel 2024, scade il 31/12/2028
  op("2025-01-10", "acquisto", "A", 100, 10), op("2025-05-01", "vendita", "A", 100, 13),         // +300 nel 2025: compensato con la minus del 2021 (la più vecchia)
  op("2024-02-01", "acquisto", "E", 10, 100), op("2026-02-01", "vendita", "E", 10, 150),         // +500 ETF: 26% sempre, niente compensazione → 130
  op("2025-03-01", "acquisto", "B", 10000, 98), op("2026-03-02", "vendita", "B", 10000, 99),     // +100 BTP: vale 48,08 nella compensazione → assorbito dalla minus del 2024
  op("2026-01-05", "acquisto", "C", 0.1, 50000), op("2026-06-01", "vendita", "C", 0.05, 60000),  // +500 cripto: 451,92 compensati, 48,08 al 33% → 15,87
  op("2025-06-01", "acquisto", "E2", 10, 100), op("2026-01-10", "acquisto", "A2", 100, 15),
  { id: "k1", data: "2026-01-01", tipo: "valutazione", strumento: "K", prezzo: 300000 }, op("2026-01-01", "acquisto", "K", 1, 300000)
];
const prezzi = { C: [{ d: "2026-11-18", v: 70000 }], E2: [{ d: "2026-11-18", v: 120 }], A2: [{ d: "2026-11-18", v: 12 }] };
const R = P.ledger(S, O, prezzi, {}, { al: "2026-11-18" });
t("il registro annota 6 vendite", R.vendite.length === 6, R.vendite.length);
const F = P.fisco(R, S, { oggi: "2026-11-18" });
t("categorie: ETF → fondo, Eni → diversi, BTP → statale, Bitcoin → cripto, casa → fuori",
  P.fiscoCat(S.E) === "fondo" && P.fiscoCat(S.A) === "diversi" && P.fiscoCat(S.B) === "statale" && P.fiscoCat(S.C) === "cripto" && P.fiscoCat(S.K) === "fuori");
t("categoria scelta a mano (fiscale) vince sul nome", P.fiscoCat({ nome: "SWDA", fiscale: "fondo" }) === "fondo" && P.fiscoCat({ nome: "SWDA" }) === "diversi");
t("ETC sull'oro e ETN su bitcoin: redditi diversi, non fondo né cripto", P.fiscoCat({ nome: "iShares Physical Gold ETC" }) === "diversi" && P.fiscoCat({ nome: "VanEck Bitcoin ETN" }) === "diversi");
t("2021: minusvalenza di 500", near(F.anni[2021].minus, 500));
t("2025: +300 compensati per intero, imposta 0", near(F.anni[2025].plus, 300) && near(F.anni[2025].compensato, 300) && near(F.anni[2025].imposta, 0), JSON.stringify(F.anni[2025]));
const v = id => F.vendite.find(x => x.id === id && x.plus > 0);
t("ETF: +500 → 130 € (26%, senza compensazione)", near(v("E").imposta, 130) && v("E").compensato === 0);
t("BTP: +100 vale 48,08 e viene assorbito dallo zainetto → imposta 0", near(v("B").compensato, 48.077, .01) && near(v("B").imposta, 0));
t("cripto 2026: +500, 451,92 compensati, resto al 33% → 15,87 €", near(v("C").compensato, 451.923, .01) && near(v("C").imposta, 15.865, .01), JSON.stringify(v("C")));
t("2026: imposte stimate 145,87 €", near(F.anni[2026].imposta, 145.865, .01), F.anni[2026].imposta);
t("la minus del 2021 avanzata (200) è scaduta a fine 2025 e quella del 2024 è finita: zainetto vuoto", F.zainetto.length === 0, JSON.stringify(F.zainetto));
/* se vendessi oggi: Stellantis −300 entra nello zainetto, il Bitcoin (+1.000) ne usa 300 → 700 al 33% = 231; l'ETF (+200) paga il 26% = 52 */
const L = F.latente;
t("se vendessi oggi: imposte 283 € (231 cripto + 52 ETF)", near(L.imposta, 283), L.imposta);
t("…perdita latente 300 usata contro il Bitcoin, non contro l'ETF", near(L.usaZainetto, 300) && near(L.righe.find(r => r.id === "E2").imposta, 52));
t("la casa resta fuori dal calcolo", !L.righe.some(r => r.id === "K"));
t("bollo: 0,2% di 5.900 € = 11,80 €", near(F.bollo.base, 5900) && near(F.bollo.annuo, 11.8), JSON.stringify(F.bollo));
/* zainetto che resta: una minus del 2026 senza guadagni */
const R2 = P.ledger({ X: { nome: "Telecom", valuta: "EUR" } }, [op("2026-01-02", "acquisto", "X", 1000, .3), op("2026-04-01", "vendita", "X", 1000, .2)], {}, {}, { al: "2026-11-18" });
const F2 = P.fisco(R2, { X: { nome: "Telecom" } }, { oggi: "2026-11-18" });
t("minus del 2026 di 100 € nello zainetto, scade il 31/12/2030", F2.zainetto.length === 1 && near(F2.zainetto[0].residuo, 100) && F2.zainetto[0].scadenza === "2030-12-31", JSON.stringify(F2.zainetto));
/* perdita su titoli di Stato: conta il 48,08% */
const R3 = P.ledger({ T: { nome: "BTP Italia", per100: true, governativo: true, valuta: "EUR" } }, [op("2025-01-02", "acquisto", "T", 10000, 100), op("2025-06-02", "vendita", "T", 10000, 95)], {}, {}, { al: "2026-11-18" });
const F3 = P.fisco(R3, { T: { nome: "BTP Italia", per100: true, governativo: true } }, { oggi: "2026-11-18" });
t("perdita di 500 su un BTP → 240,38 nello zainetto (48,08%)", near(F3.zainetto[0].residuo, 240.385, .01), JSON.stringify(F3.zainetto));
t("registro vuoto: niente errori", P.fisco({ vuoto: true }, {}, {}).zainetto.length === 0);
console.log(`\n${pass} superati, ${fail} falliti`); process.exit(fail ? 1 : 0);
