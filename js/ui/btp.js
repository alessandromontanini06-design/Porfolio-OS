/* Portfolio OS · interfaccia · BTP a tasso fisso con il prezzo STIMATO dalla curva dei rendimenti della Banca d'Italia (calcoli: POS.btp* nel motore).
   Un BTP diventa un «simbolo» BTP:cedola:scadenza (es. BTP:3.35:2035-03-01) che segue la stessa strada dei prezzi di borsa:
   btpPrezzi(sym) risponde come /api/prices: points = indice con le cedole lorde reinvestite (per rendimenti e rischio),
   prezzi = prezzi secchi su 100 (per il valore delle posizioni), recent = ultimi giorni della curva.
   Se c'è un prezzo vero (dal file o dal patrimonio) la stima si allinea a quello: lo scarto dalla curva resta fisso nel tempo. */
import { P } from "./core.js";

const BDI_KEY = "pos-bdi-v1";
let CURVA = null, CURVA_P = null;
const saved = () => { try { const j = JSON.parse(localStorage.getItem(BDI_KEY) || "null"); return j && j.mesi && j.mesi.length ? j : null; } catch { return null; } };
/* curva una volta per visita; se la Banca d'Italia non risponde si usa l'ultima copia salvata nel browser */
function btpCurva() {
  if (CURVA) return Promise.resolve(CURVA);
  /* copia di meno di 12 ore fa: la Banca d'Italia pubblica una volta al giorno, non serve richiederla */
  const c0 = saved(); if (c0 && c0._t && Date.now() - c0._t < 12 * 3600e3) { CURVA = c0; return Promise.resolve(c0); }
  return CURVA_P ||= fetch("/api/rates?serie=btp", { signal: AbortSignal.timeout(30000) })
    .then(r => r.json().catch(() => ({ error: `errore ${r.status}` })))
    .then(j => { CURVA_P = null; if (!j || j.error || !j.mesi) throw new Error((j && j.error) || "curva non disponibile");
      CURVA = j; try { localStorage.setItem(BDI_KEY, JSON.stringify({ ...j, _t: Date.now() })); } catch {} return j; })
    .catch(e => { CURVA_P = null; const c = saved(); if (c) { CURVA = { ...c, copia: true }; return CURVA; } throw e; });
}
const isBtpSym = s => /^(BTP|BUND|OAT|BONOS):\d/.test(String(s || "").toUpperCase());
/* titoli di Stato di Germania, Francia e Spagna (dal 20/11/2026): curva AAA della BCE + scarto del paese sul 10 anni (P.tdsCurva).
   Storico nel sito (js/data/curve-euro.json), ultimi mesi da /api/rates?serie=stati; se la BCE non risponde, l'ultima copia salvata o solo lo storico. */
const STATI_KEY = "pos-stati-v1", CURVE_P = {};
let STORICO = null, RECENTI = null;
const savedStati = () => { try { const j = JSON.parse(localStorage.getItem(STATI_KEY) || "null"); return j && j.giorni && j.giorni.length ? j : null; } catch { return null; } };
function recentiStati() {
  if (RECENTI) return RECENTI;
  const c0 = savedStati(); if (c0 && c0._t && Date.now() - c0._t < 12 * 3600e3) return RECENTI = Promise.resolve(c0);
  return RECENTI = fetch("/api/rates?serie=stati", { signal: AbortSignal.timeout(30000) }).then(r => r.json()).then(j => {
    if (!j || j.error || !j.giorni) throw new Error((j && j.error) || "curve non disponibili");
    try { localStorage.setItem(STATI_KEY, JSON.stringify({ ...j, _t: Date.now() })); } catch {} return j; })
    .catch(() => { const c = savedStati(); return c ? { ...c, copia: true } : null; });
}
function curvaPaese(p) {
  if (p === "IT" || !p) return btpCurva();
  return CURVE_P[p] ||= Promise.all([STORICO ||= fetch("/js/data/curve-euro.json").then(r => r.json()), recentiStati()]).then(([h, r]) => {
    const c = P.tdsCurva(h, r, p); if (!c) throw new Error("curva non disponibile");
    if (!r || r.copia) c.copia = true; return c; }).catch(e => { delete CURVE_P[p]; STORICO = null; throw e; });
}
const TDS_SRC = { IT: "Banca d'Italia (prezzo stimato)", DE: "BCE (prezzo stimato)", FR: "BCE (prezzo stimato)", ES: "BCE (prezzo stimato)" };
const DEL = { DE: "della Germania", FR: "della Francia", ES: "della Spagna" };
const dIt = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "";
const BTP_SRC = "Banca d'Italia (prezzo stimato)";
/* titolo di Stato italiano a tasso fisso da cedola (frazione) e scadenza ("AAAA-MM-GG" o Date): il simbolo, oppure null */
function btpSym(cedola, scadenza, paese) {
  const d = scadenza instanceof Date ? scadenza.toISOString().slice(0, 10) : String(scadenza || "").slice(0, 10);
  if (cedola == null || !(cedola >= 0 && cedola < 0.2) || !/^\d{4}-\d{2}-\d{2}$/.test(d) || d <= new Date().toISOString().slice(0, 10)) return null;
  return P.btpSimbolo({ cedola, scadenza: d, paese: P.TDS[paese] ? paese : "IT" });
}
async function btpPrezzi(sym, ancora) {
  const b = P.btpDaSimbolo(sym); if (!b) return { symbol: sym, error: "BTP non riconosciuto" };
  const nome = P.btpNome(b);
  if (b.scadenza <= new Date().toISOString().slice(0, 10)) return { symbol: sym, error: `${nome} è già scaduto.` };
  const it = b.paese === "IT";
  let c; try { c = await curvaPaese(b.paese); } catch (e) { return { symbol: sym, error: it ? `curva dei BTP della Banca d'Italia non disponibile (${e.message})` : `curve della BCE non disponibili (${e.message})` }; }
  let spread = 0, cal = null;
  if (ancora && +ancora.prezzo > 0 && ancora.data) { const s = P.btpSpread(b, c, ancora.data, +ancora.prezzo); if (Number.isFinite(s)) { spread = s; cal = { prezzo: +ancora.prezzo, data: String(ancora.data).slice(0, 10) }; } }
  const r = P.btpSerie(b, c, { spread });
  if (r.indice.length < 2) return { symbol: sym, error: "curva troppo corta per questo titolo" };
  return { symbol: sym, points: r.indice, prezzi: r.prezzi, recent: r.giorni, currency: "EUR", adjusted: true, per100: true, source: TDS_SRC[b.paese] || BTP_SRC,
    stima: { nome, spread, ancora: cal, curvaAl: c.al, copia: !!c.copia, cedola: b.cedola, scadenza: b.scadenza, paese: b.paese },
    info: it ? `${nome} · prezzo stimato dalla curva dei BTP (Fonte: Banca d'Italia, dati al ${dIt(c.al)})` : `${nome} · prezzo stimato dalla curva dei titoli di Stato AAA dell'area euro più lo scarto ${DEL[b.paese]} sul 10 anni (Fonte: BCE, dati al ${dIt(c.al)})` };
}
/* frase per i registri e le didascalie */
function btpNota(j) {
  const s = j && j.stima; if (!s) return "";
  const sp = s.ancora ? `, allineato al prezzo di ${String(s.ancora.prezzo).replace(".", ",")} del ${dIt(s.ancora.data)} (scarto dalla curva ${s.spread >= 0 ? "+" : "−"}${Math.abs(s.spread).toFixed(2).replace(".", ",")} punti)` : "";
  if (s.paese && s.paese !== "IT") return `${s.nome}: prezzi stimati dalla curva dei titoli di Stato AAA dell'area euro più lo scarto ${DEL[s.paese]} sul 10 anni (Fonte: BCE, dati al ${dIt(s.curvaAl)}${s.copia ? ", copia salvata" : ""})${sp}. Lo scarto è quello del 10 anni anche per le altre scadenze: per i titoli brevi la stima è meno precisa. Prima dell'emissione la serie è quella di un titolo con la stessa cedola e scadenza.`;
  return `${s.nome}: prezzi stimati dalla curva dei rendimenti dei BTP della Banca d'Italia (dati al ${dIt(s.curvaAl)}${s.copia ? ", copia salvata" : ""})${sp}. Prima dell'emissione la serie è quella di un titolo con la stessa cedola e scadenza.`;
}

/* scheda per «Dove sei investito» e per i costi: un BTP è un'obbligazione dello Stato italiano in euro, senza costi annui di gestione */
const AGG = { IT: "italiano", DE: "tedesco", FR: "francese", ES: "spagnolo" };
const btpScheda = (st, isin) => { const pa = P.TDS[st.paese] ? st.paese : "IT"; return { isin: isin || null, nome: st.nome, fonte: `Titolo di Stato ${AGG[pa]}: nessun costo annuo di gestione`, ter: 0, indice: null,
  focus: "Obbligazioni · Titoli di Stato · EUR", valuta: "EUR", copertura: null, paesi: [{ nome: P.TDS[pa].stato, peso: 1 }], settori: null, partecipazioni: null, btp: true }; };
/* etichetta corta per le colonne del laboratorio: «BTP 3,35% mar 2035» */
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
function btpEtichetta(sym) { const b = P.btpDaSimbolo(sym); if (!b) return sym; return `${P.TDS[b.paese].nome} ${String(+(b.cedola * 100).toFixed(3)).replace(".", ",")}% ${MESI[+b.scadenza.slice(5, 7) - 1]} ${b.scadenza.slice(0, 4)}`; }

/* elenco ufficiale dei BTP a tasso fisso in circolazione (MEF, js/data/btp.json), una volta per visita */
let LISTA = null;
function btpLista() {
  return LISTA ||= fetch("/js/data/btp.json").then(r => r.json()).then(j => { const today = new Date().toISOString().slice(0, 10);
    return { al: j.al || null, righe: (j.righe || []).filter(x => x[3] > today).map(([isin, g, em, sc, c]) => ({ isin, g, em, sc, c, nome: `${g} ${String(+(c * 100).toFixed(3)).replace(".", ",")}% ${sc.slice(8, 10)}/${sc.slice(5, 7)}/${sc.slice(0, 4)}` })) }; })
    .catch(() => { LISTA = null; return { al: null, righe: [] }; });
}

/* titoli di Stato esteri a tasso fisso per il costruttore (js/data/stati.json: Germania, Francia, Spagna), una volta per visita */
let STATI = null;
function statiLista() {
  return STATI ||= fetch("/js/data/stati.json").then(r => r.json()).then(j => { const today = new Date().toISOString().slice(0, 10), out = { al: j.al || null, fonti: j.fonti || {}, paesi: {} };
    for (const [p, R] of Object.entries(j.paesi || {})) out.paesi[p] = R.filter(x => x[2] > today).map(([isin, nome, sc, c]) => ({ isin, nome, sc, c, paese: p, sym: btpSym(c, sc, p) })).filter(x => x.sym);
    return out; }).catch(() => { STATI = null; return { al: null, fonti: {}, paesi: {} }; });
}

export { BTP_SRC, curvaPaese, statiLista, btpCurva, btpEtichetta, btpLista, btpNota, btpPrezzi, btpScheda, btpSym, isBtpSym };
