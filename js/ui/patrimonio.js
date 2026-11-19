/* Portfolio OS · interfaccia · Il mio patrimonio: una sezione del sito, il portafoglio che vive nel browser.
   Si salvano solo strumenti e operazioni (localStorage «pos-patrimonio-v1»); tutto il resto lo calcola il motore (POS.ledger).
   Le operazioni non si cancellano: un errore si annulla con un'operazione nuova, così lo storico resta affidabile.
   Si riempie a mano oppure da un file caricato (movimenti o posizioni), e porta al laboratorio con un clic. */
import { $, P, S, esc, fmtN, fmtPct, loadXLSX } from "./core.js";
import { getJSON, fmtEur, obLoad } from "./analisi.js";
import { BD, POPULAR, bdBtpMeta, bdGo, bondInfo, bondYtm, guessSymbol, isBondPos, isExample, trackOnce } from "./importa.js";
import { btpLista, btpNota, btpPrezzi, btpSym, isBtpSym } from "./btp.js";
import { go, current } from "./scene.js";
import { txMatch } from "./rendimento.js";

const PM_KEY = "pos-patrimonio-v1";
const pmToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dIt = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—";
/* sotto mezzo euro (o 0,05%) è zero: niente «-0 €» */
const sEur = v => !Number.isFinite(v) ? "—" : Math.abs(v) < 0.5 ? fmtEur(0) : (v > 0 ? "+" : "") + fmtEur(v);
const sPct = v => !Number.isFinite(v) ? "—" : Math.abs(v) < 0.0005 ? fmtPct(0, 1) : fmtPct(v, 1, true);
const cls = v => v > 0 ? "up" : v < 0 ? "dn" : "";
const clsE = v => Math.abs(v) < 0.5 ? "" : cls(v), clsP = v => Math.abs(v) < 0.0005 ? "" : cls(v);
/* numeri scritti all'italiana: «200.000» = duecentomila, «12,50» = dodici e cinquanta, «1.234,5» e anche «1.5» (decimale) */
const num = v => { const t = String(v ?? "").trim().replace(/\s|€|'/g, ""); if (!t || !/^-?[\d.,]+$/.test(t)) return NaN;
  if (t.includes(",")) return parseFloat(t.replace(/\./g, "").replace(",", "."));
  if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) return parseFloat(t.replace(/\./g, ""));
  return parseFloat(t); };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const TIPO_L = { acquisto: "Acquisto", vendita: "Vendita", dividendo: "Dividendo", cedola: "Cedola", valutazione: "Nuova stima", commissione: "Commissione", tassa: "Tassa", frazionamento: "Frazionamento" };
/* colori dell'anello: quelli del sito, distinti tra loro anche per chi vede male rosso e verde */
const RING = ["#C9F24A", "#8F3BFF", "#2E6FD1", "#D4572E", "#C99A00", "#1D9A8A", "#E0569B", "var(--ink-mark,#161616)", "#8A8F98"];

function pmLoad() { try { const x = JSON.parse(localStorage.getItem(PM_KEY) || "null"); if (x && x.v === 1 && x.strumenti && Array.isArray(x.operazioni)) return x; } catch {} return null; }
const PM = { db: pmLoad(), px: {}, fx: {}, tipo: "acquisto", R: null, res: null, loading: false, beneId: "", group: "strumenti", sel: null, pending: false };
const pmHas = () => !!(PM.db && PM.db.operazioni.some(o => o.tipo !== "annulla"));
/* prezzi ricordati nel browser (pos-pm-px-v1): il patrimonio si apre subito con gli ultimi prezzi noti e si aggiorna in sottofondo.
   Sono prezzi di fine giornata: se sono di meno di 3 ore fa non si richiedono. Se una richiesta fallisce resta l'ultimo prezzo noto. */
const PM_PX_KEY = "pos-pm-px-v1", PM_PX_FRESH = 3 * 3600e3;
function pmPxSave() { try { const px = {}; for (const [id, j] of Object.entries(PM.px)) if (j && !j.error && j.points) px[id] = j; localStorage.setItem(PM_PX_KEY, JSON.stringify({ v: 1, t: PM.pxT || Date.now(), px, fx: PM.fx })); } catch {} }
(() => { try { const c = JSON.parse(localStorage.getItem(PM_PX_KEY) || "null"); if (c && c.v === 1 && c.px) { PM.px = c.px; PM.fx = c.fx || {}; PM.pxT = c.t; } } catch {} })();
function pmSave() {
  PM.db.aggiornato = new Date().toISOString();
  try { localStorage.setItem(PM_KEY, JSON.stringify(PM.db)); return true; }
  catch { pmMsg("Non riesco a salvare in questo browser (forse è in navigazione privata o la memoria è piena).", "err"); return false; }
}
const pmDb = () => PM.db ||= { v: 1, strumenti: {}, operazioni: [], creato: new Date().toISOString() };

/* BTP, BOT e CTZ a tasso fisso nel patrimonio: simbolo della stima dalla curva della Banca d'Italia (o null) */
const pmBtpSym = s => s && s.per100 && !s.manuale && s.governativo !== false && P.btpTipo(s.nome, s.isin) === "fisso" && s.cedola != null && s.scadenza ? btpSym(+s.cedola, s.scadenza) : null;
/* ultimo prezzo vero scritto dall'utente (acquisto, vendita o «Aggiorna prezzo»): la stima si allinea a quello */
function pmAncora(id) {
  const gone = new Set(PM.db.operazioni.filter(o => o.tipo === "annulla").map(o => String(o.rif)));
  const o = PM.db.operazioni.filter(o => o.strumento === id && !gone.has(String(o.id)) && ["acquisto", "vendita", "valutazione"].includes(o.tipo) && +o.prezzo > 0).sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0)).pop();
  return o ? { prezzo: +o.prezzo, data: o.data } : null;
}
/* ---------- prezzi e cambi: una volta per visita, tre strumenti alla volta ---------- */
async function pmPrices(force) {
  const db = pmDb(), ids = Object.keys(db.strumenti).filter(id => (db.strumenti[id].simbolo || pmBtpSym(db.strumenti[id])) && (force || !PM.px[id]));
  const q = ids.slice();
  await Promise.all([0, 1, 2].map(async () => { while (q.length) { const id = q.shift(), s = db.strumenti[id], bs = !s.simbolo && pmBtpSym(s);
    const old = PM.px[id] && PM.px[id].points && PM.px[id].symbol === (s.simbolo || bs) ? PM.px[id] : null;
    if (bs) { const j = await btpPrezzi(bs, pmAncora(id)); PM.px[id] = j && !j.error ? j : old || { error: (j && j.error) || "prezzo stimato non disponibile" }; continue; }
    const j = await getJSON(`/api/prices?symbol=${encodeURIComponent(s.simbolo)}&v=6`);
    PM.px[id] = j && !j.error && j.points ? j : old || { error: (j && j.error) || "prezzi non disponibili" }; } }));
  await pmFx(force);
}
async function pmFx(force) {
  const need = [...new Set([...Object.values(pmDb().strumenti).map(s => s.valuta), ...pmDb().operazioni.map(o => o.valuta)].map(c => c === "GBX" ? "GBP" : c).filter(c => c && c !== "EUR"))];
  for (const c of need) if (!PM.fx[c] || force) { const j = await getJSON(`/api/fx?ccy=${c}`); PM.fx[c] = j && j.points ? j.points : []; }
}
function pmCalc() {
  const db = pmDb(), prezzi = {};
  for (const [id, j] of Object.entries(PM.px)) if (j && j.points) prezzi[id] = (j.prezzi || j.points).concat(j.recent || []);
  PM.R = P.ledger(db.strumenti, db.operazioni, prezzi, PM.fx, { al: pmToday() });
  return PM.R;
}
const lastFx = c => { const a = PM.fx[c]; return a && a.length ? a[a.length - 1].v : NaN; };
/* variazione dell'ultima seduta: quote di oggi × (ultima chiusura − penultima), in euro */
function pmSession(R) {
  let ch = 0, base = 0, d = null, d0 = null, n = 0;
  for (const p of R.posizioni) {
    if (!p.aperta) continue; const j = PM.px[p.id], r = j && j.recent; if (!r || r.length < 2) continue;
    const a = r[r.length - 2], b = r[r.length - 1], s = PM.db.strumenti[p.id], k = (s.valuta === "GBX" ? 100 : 1) * (s.per100 ? 100 : 1), c = s.valuta === "GBX" ? "GBP" : (s.valuta || "EUR"), fx = c === "EUR" ? 1 : lastFx(c);
    if (!(fx > 0)) continue; ch += p.qta * (b.v - a.v) / k / fx; base += p.qta * a.v / k / fx; if (!d || b.d > d) { d = b.d; d0 = a.d; } n++;
  }
  return n ? { euro: ch, pct: base > 0 ? ch / base : NaN, d, d0 } : null;
}
const dayName = d => new Date(d + "T12:00:00Z").toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });

/* ---------- riconoscere uno strumento da ticker, ISIN o nome dell'elenco ---------- */
async function pmResolve(text) {
  const t = String(text || "").trim(); if (!t) return null;
  const T = t.toUpperCase(), isin = (T.match(/\b[A-Z]{2}[A-Z0-9]{9}\d\b/) || [])[0], tk = T.split(/[\s·]+/)[0];
  const pop = POPULAR.find(p => p[2] === isin || p[0] === tk), isinF = isin || (pop && pop[2]) || null;
  const own = Object.entries(pmDb().strumenti).find(([, s]) => !s.manuale && ((isinF && s.isin === isinF) || (!isinF && (s.ticker === tk || s.simbolo === tk))));
  if (own) return { id: own[0], ...own[1], gia: true, px: PM.px[own[0]] };
  let sym = null, nome = pop ? pop[1] : null;
  if (isinF) { const j = await getJSON(`/api/isin?isin=${isinF}`), r = (j.results || [])[0]; if (r && r.simbolo) { sym = r.simbolo; nome = nome || r.nome; } }
  if (!sym && !isin) sym = guessSymbol(tk, "ETF", null) || tk;
  if (!sym) return { error: "ISIN non trovato: controlla di averlo scritto bene" };
  const px = await getJSON(`/api/prices?symbol=${encodeURIComponent(sym)}&v=5`);
  if (!px || px.error || !px.points) return { error: `non trovo i prezzi di ${sym}: prova con l'ISIN` };
  return { id: isinF || sym, nome: nome || (px.info || "").split(" · ")[0] || sym, ticker: pop ? pop[0] : (isin ? null : tk), isin: isinF, simbolo: sym, valuta: px.currency || "EUR", classe: pop ? pop[3] : null, px };
}
const lastPx = j => { if (!j || !j.points) return NaN; const r = (j.recent && j.recent.length ? j.recent : j.points); return r[r.length - 1].v; };
/* categoria per il grafico: quella dell'elenco, altrimenti dal nome; i beni a mano a parte */
function pmClass(s) {
  if (s.manuale) return BENE_CLS[s.tipo] || (s.classe && s.classe !== "Altro" ? s.classe : "Casa e altri beni");
  if (s.per100) return "Obbligazioni";
  if (s.classe) return s.classe === "Oro" ? "Oro e materie prime" : s.classe;
  const n = String(s.nome || "").toLowerCase();
  if (/bond|obblig|govt|treasury|aggregate|btp|bot|corporate|€ gov|income/.test(n)) return "Obbligazioni";
  if (/gold|oro|silver|argento|commodit/.test(n)) return "Oro e materie prime";
  if (/overnight|money market|monetari|liquidit|cash/.test(n)) return "Liquidità";
  if (/bitcoin|ethereum|crypto|btc|eth/.test(n)) return "Cripto";
  return "Azioni";
}

/* ---------- beni senza quotazione: tipo e riconoscimento nei file ---------- */
const BENE_TIPI = [["liquidita", "Liquidità e conti"], ["oro", "Oro e metalli"], ["casa", "Casa e immobili"], ["polizza", "Polizze e pensione"], ["altro", "Altro"]];
const BENE_CLS = { liquidita: "Liquidità", oro: "Oro e materie prime", casa: "Casa e immobili", polizza: "Polizze e pensione", altro: "Altri beni" };
function beneTipo(t) {
  t = String(t || "").toLowerCase();
  if (/liquidit|saldo|conto|deposit|emergenza|contanti|cash|risparmi|borsa di studio/.test(t)) return "liquidita";
  if (/\boro\b|oro fisico|argento|gioiell|lingott|metall|platino/.test(t)) return "oro";
  if (/casa|immobil|appartament|terreno|box auto|villa/.test(t)) return "casa";
  if (/polizza|tfr|pension|previdenz|assicuraz/.test(t)) return "polizza";
  return "altro";
}
/* righe «etichetta … valore» che sembrano beni (liquidità, oro, casa, polizze): da proporre, mai da aggiungere da soli */
const BENE_RX = /liquidit|saldo|\bconto\b|conto deposito|deposit|fondo emergenza|contanti|\bcash\b|\boro\b|oro fisico|argento|gioiell|lingott|immobil|\bcasa\b|appartament|terreno|polizza|\btfr\b|fondo pensione|previdenz|borsa di studio|risparm/i;
const BENE_NO = /di cui|gramm|\(g\)|titolo|quotazione|prezzo|%|tasso|rendiment|interess|totale|portafoglio etf|valore etf|guadagn|versat|mesi|autonomia|data|aggiornament|teoric|grafico|commission|spese|tasse|imposta/i;
function pmFindBeni(sheets) {
  const out = [], seen = new Set();
  for (const sh of sheets || []) for (const row of (sh.aoa || []).slice(0, 400)) {
    if (!Array.isArray(row)) continue;
    const li = row.findIndex(v => typeof v === "string" && v.trim().length > 2 && v.length <= 60 && BENE_RX.test(v) && !BENE_NO.test(v)); if (li < 0) continue;
    let val = NaN; for (let k = li + 1; k < row.length; k++) { const v = row[k]; if (v == null || v === "" || v instanceof Date) continue; if (typeof v === "string" && /%/.test(v)) break; const x = P.parseNum(v); if (x && Number.isFinite(x.n)) { val = x.n; break; } if (typeof v === "string" && /^[-–—]$/.test(v.trim())) break; }
    if (!(val >= 1)) continue;
    const label = row[li].trim().replace(/\s*\((€|eur)\)\s*$/i, "").replace(/\s{2,}/g, " "), r = Math.round(val);
    if (seen.has(r)) continue; seen.add(r);   /* lo stesso importo scritto in due fogli è la stessa cosa */
    out.push({ label, valore: val, tipo: beneTipo(label), key: `bene|${label.toLowerCase()}|${r}` });
    if (out.length >= 8) return out;
  }
  return out;
}
function pmBeniOffer() {
  const el = $("#pmBeni"); if (!el) return; const db = pmDb(), have = new Set(db.operazioni.filter(o => o.imp).map(o => o.imp));
  const list = (PM.beniFile || []).filter(b => !have.has(b.key)); if (!list.length) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<div class="pmb-h"><b>Nel file ci sono anche questi beni</b><span>Spunta quelli da aggiungere al patrimonio: entrano con il valore scritto nel file, e lo aggiorni quando vuoi con «Aggiorna stima».</span></div>
    <ul>${list.map((b, i) => `<li><label><input type="checkbox" data-pmb="${i}" checked><span>${esc(b.label)}</span><select data-pmbt="${i}" aria-label="Tipo di ${esc(b.label)}">${BENE_TIPI.map(([k, l]) => `<option value="${k}"${k === b.tipo ? " selected" : ""}>${l}</option>`).join("")}</select><b>${fmtEur(b.valore)}</b></label></li>`).join("")}</ul>
    <div class="pmb-b"><button type="button" class="btn lime" id="pmBeniOk">Aggiungi al patrimonio</button><button type="button" class="btn" id="pmBeniNo">Non ora</button></div>`;
  PM.beniShown = list;
}
function pmBeniAdd() {
  const db = pmDb(), list = PM.beniShown || [], today = pmToday(); let n = 0;
  list.forEach((b, i) => { const c = document.querySelector(`#pmBeni [data-pmb="${i}"]`); if (!c || !c.checked) return; const t = (document.querySelector(`#pmBeni [data-pmbt="${i}"]`) || {}).value || b.tipo;
    const id = "m-" + newId(); db.strumenti[id] = { nome: b.label, valuta: "EUR", classe: BENE_CLS[t], tipo: t, manuale: true };
    db.operazioni.push({ id: newId(), data: today, tipo: "acquisto", strumento: id, quantita: 1, prezzo: b.valore, origine: "file", imp: b.key }); n++; });
  if (n && !pmSave()) return; PM.beniFile = []; $("#pmBeni").hidden = true;
  pmMsg(n ? `Aggiunti ${n} ${n === 1 ? "bene" : "beni"} al patrimonio.` : "Nessun bene aggiunto.", n ? "ok" : "", "#pmTopMsg"); pmRenderForm(); pmRender();
}

/* ---------- grafico ad anello: il totale al centro, una fetta alla volta ---------- */
function pmSlices(R) {
  const db = PM.db, open = R.posizioni.filter(p => p.aperta && p.valore > 0), tot = open.reduce((a, p) => a + p.valore, 0);
  let list;
  if (PM.group === "classi") { const m = new Map(); open.forEach(p => { const k = pmClass(db.strumenti[p.id]); const x = m.get(k) || { key: "c:" + k, nome: k, valore: 0, guadagno: 0, n: 0 }; x.valore += p.valore; x.guadagno += p.guadagno; x.n++; m.set(k, x); }); list = [...m.values()]; }
  else list = open.map(p => ({ key: p.id, nome: db.strumenti[p.id].nome, valore: p.valore, guadagno: p.guadagno, n: 1, p }));
  list.sort((a, b) => b.valore - a.valore);
  if (list.length > RING.length) { const rest = list.splice(RING.length - 1); list.push({ key: "altro", nome: `Altri ${rest.length}`, valore: rest.reduce((a, x) => a + x.valore, 0), guadagno: rest.reduce((a, x) => a + x.guadagno, 0), n: rest.length }); }
  list.forEach((x, i) => { x.col = RING[i % RING.length]; x.pct = tot > 0 ? x.valore / tot : 0; });
  return { list, tot };
}
const arc = (cx, cy, r, a0, a1) => { const p = a => [cx + r * Math.sin(a), cy - r * Math.cos(a)], [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
function pmRing(R) {
  const { list, tot } = pmSlices(R), cx = 160, cy = 160, r = 124, w = 36, sel = list.find(x => x.key === PM.sel) || null;
  if (sel === null) PM.sel = null;
  const gap = list.length > 1 ? 0.012 : 0;
  let a = 0;
  const paths = list.map(x => { const span = x.pct * 2 * Math.PI, a0 = a + gap, a1 = a + span - gap; a += span;
    const on = sel && sel.key === x.key, dim = sel && !on, label = `${x.nome}: ${fmtEur(x.valore)}, ${fmtPct(x.pct, 1)}`;
    const shape = list.length === 1 ? `<circle cx="${cx}" cy="${cy}" r="${r}"` : `<path d="${arc(cx, cy, r, a0, Math.max(a0 + 0.004, a1))}"`;
    return `${shape} class="pm-sl${on ? " on" : ""}${dim ? " dim" : ""}" data-pmslice="${esc(x.key)}" stroke="${x.col}" stroke-width="${on ? w + 12 : w}" fill="none" tabindex="0" role="button" aria-pressed="${on}" aria-label="${esc(label)}"/>`; }).join("");
  const empty = !list.length;
  const center = empty ? `<span class="pm-c-l">Il tuo patrimonio</span><b class="pm-c-v">0 €</b><span class="pm-c-s">aggiungi il primo investimento</span>`
    : sel ? `<span class="pm-c-l">${esc(sel.nome)}</span><b class="pm-c-v">${fmtEur(sel.valore)}</b><span class="pm-c-s">${fmtPct(sel.pct, 1)} del patrimonio${Number.isFinite(sel.guadagno) ? ` · <i class="${clsE(sel.guadagno)}">${sEur(sel.guadagno)}</i>` : ""}</span><span class="pm-c-x">tocca di nuovo per il totale</span>`
    : `<span class="pm-c-l">Patrimonio totale</span><b class="pm-c-v">${fmtEur(tot)}</b><span class="pm-c-s">${(n => n + (n === 1 ? " investimento" : " investimenti"))(list.reduce((s, x) => s + x.n, 0))}${PM.group === "classi" ? " in " + list.length + (list.length === 1 ? " categoria" : " categorie") : ""}</span>`;
  $("#pmRing").innerHTML = `<svg viewBox="0 0 320 320" role="group" aria-label="Composizione del patrimonio">${empty ? `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="var(--line)" stroke-width="${w}" fill="none"/>` : paths}</svg><div class="pm-center${sel ? " sel" : ""}" data-pmclear>${center}</div>`;
  $("#pmLegend").innerHTML = list.map(x => `<li><button type="button" data-pmslice="${esc(x.key)}" class="${sel && sel.key === x.key ? "on" : sel ? "dim" : ""}" aria-pressed="${!!(sel && sel.key === x.key)}"><i style="background:${x.col}"></i><span>${esc(x.nome)}</span><b>${fmtEur(x.valore)}</b><em>${fmtPct(x.pct, 1)}</em></button></li>`).join("");
  document.querySelectorAll("#pmGroup [data-pmg]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.pmg === PM.group)));
}

/* ---------- piani di accumulo: il promemoria del giorno del PAC ----------
   Il piano dice strumento, importo e giorno del mese. Il sito non inventa le quote (spread e orari del broker le cambiano):
   il giorno del PAC propone il modulo già pronto, l'utente scrive le quote vere e il prezzo si ricava da importo ÷ quote. */
const ymOf = d => d.slice(0, 7);
const dayN = s => Math.round(Date.parse(s + "T00:00:00Z") / 864e5);
function pacDate(ym, giorno) { const [y, m] = ym.split("-").map(Number), last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return `${ym}-${String(Math.min(giorno, last)).padStart(2, "0")}`; }
const nextYm = ym => { let [y, m] = ym.split("-").map(Number); m++; if (m > 12) { m = 1; y++; } return `${y}-${String(m).padStart(2, "0")}`; };
/* un acquisto dello stesso strumento vicino al giorno del PAC (da 3 giorni prima a 10 dopo) vuol dire che è già registrato, per esempio dal file del broker */
function pacFound(db, pl, d) {
  const gone = new Set(db.operazioni.filter(o => o.tipo === "annulla").map(o => String(o.rif))), n = dayN(d);
  return db.operazioni.find(o => o.tipo === "acquisto" && o.strumento === pl.strumento && !gone.has(String(o.id)) && dayN(o.data) >= n - 3 && dayN(o.data) <= n + 10);
}
function pacDue() {
  const db = PM.db; if (!db || !db.pac) return [];
  const today = pmToday(), out = [];
  for (const pl of db.pac) {
    if (!db.strumenti[pl.strumento]) continue;
    for (let ym = ymOf(pl.dal); ym <= ymOf(today); ym = nextYm(ym)) {
      const d = pacDate(ym, pl.giorno); if (d < pl.dal || d > today) continue;
      if ((pl.fatti || {})[ym] || pacFound(db, pl, d)) continue;
      out.push({ pl, ym, d });
    }
  }
  return out.sort((a, b) => a.d < b.d ? -1 : 1).slice(-6);
}
function pacNext(pl) { const today = pmToday(); let ym = ymOf(today), d = pacDate(ym, pl.giorno); if (d <= today) { ym = nextYm(ym); d = pacDate(ym, pl.giorno); } return { d, giorni: dayN(d) - dayN(today) }; }
function pacRenderDue() {
  const el = $("#pmPacDue"); if (!el) return; const due = pacDue(), ced = cedDue(); PM.ced = ced;
  if (!due.length && !ced.length) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  const cedHTML = ced.map((x, i) => { const s = PM.db.strumenti[x.id]; return x.kind === "cedola"
    ? `<form class="pac-row ced" data-ceddue="${i}" autocomplete="off"><div class="pac-t"><b>Cedola · ${esc(s.nome)}</b><small>del ${dIt(x.d)} · ${fmtN(x.lordo, 2)} € lordi, imposta ${fmtPct(x.tax, 1)}</small></div>
      <label class="pac-wide">Importo netto incassato (€)<input name="imp" inputmode="decimal" value="${(Math.round(x.netto * 100) / 100).toFixed(2).replace(".", ",")}" required></label>
      <span class="pac-b"><button type="submit" class="btn lime sm">Registra</button><button type="button" class="btn sm" data-cedskip="${i}">Salta</button></span></form>`
    : `<form class="pac-row ced" data-ceddue="${i}"><div class="pac-t"><b>Rimborso · ${esc(s.nome)}</b><small>scaduto il ${dIt(x.d)}: ti tornano ${fmtEur(x.nom)}</small></div><span class="pac-wide"></span>
      <span class="pac-b"><button type="submit" class="btn lime sm">Registra il rimborso</button><button type="button" class="btn sm" data-cedskip="${i}">Non ora</button></span></form>`; }).join("");
  if (!due.length) { el.innerHTML = `<div class="pac-h"><b>${ced.length === 1 ? (ced[0].kind === "cedola" ? "È arrivata una cedola" : "Un titolo è scaduto") : `Hai ${ced.length} movimenti da registrare`}</b><span>Controlla l'importo nel tuo home banking e registralo.</span></div>` + cedHTML; return; }
  el.innerHTML = `<div class="pac-h"><b>${due.length === 1 ? "È il giorno del tuo PAC" : `Hai ${due.length} PAC da registrare`}</b><span>Scrivi le quote che vedi nell'app del broker: il prezzo lo calcolo io da importo ÷ quote.</span></div>` + cedHTML +
    due.map((x, i) => { const s = PM.db.strumenti[x.pl.strumento]; return `<form class="pac-row" data-pacdue="${i}" autocomplete="off"><div class="pac-t"><b>${esc(s.nome)}</b><small>PAC del ${dIt(x.d)}</small></div>
      <label>Quote comprate<input name="qta" inputmode="decimal" placeholder="es. 0,2315" required></label>
      <label>Importo (€)<input name="imp" inputmode="decimal" value="${String(x.pl.importo).replace(".", ",")}" required></label>
      <label>Spese (€)<input name="spese" inputmode="decimal" placeholder="0"></label>
      <span class="pac-b"><button type="submit" class="btn lime sm">Registra</button><button type="button" class="btn sm" data-pacskip="${i}">Salta</button></span></form>`; }).join("");
  PM.due = due;
}
function pacRenderList() {
  const el = $("#pmPacList"); if (!el) return; const db = pmDb(), plans = db.pac || [];
  const strs = Object.entries(db.strumenti).filter(([id, s]) => !s.manuale && PM.R && PM.R.posizioni.some(p => p.id === id));
  const rows = plans.filter(pl => db.strumenti[pl.strumento]).map(pl => { const n = pacNext(pl), s = db.strumenti[pl.strumento];
    return `<tr><td><b>${esc(s.nome)}</b><small>${esc(s.ticker || s.isin || "")}</small></td><td class="num">${fmtN(pl.importo, pl.importo % 1 ? 2 : 0)} €</td><td class="num">giorno ${pl.giorno}</td>
      <td class="num">${dIt(n.d)}<small>${n.giorni === 0 ? "oggi" : n.giorni === 1 ? "domani" : `tra ${n.giorni} giorni`}</small></td><td class="num"><button type="button" class="btn sm" data-pacdel="${esc(pl.id)}">Togli</button></td></tr>`; }).join("");
  const tot = plans.filter(pl => db.strumenti[pl.strumento]).reduce((a, pl) => a + pl.importo, 0), sec = $("#pmPac");
  /* senza un piano la sezione non c'è: il piano si crea dalla scheda «Piano di accumulo» di «Aggiungi» */
  if (sec) sec.hidden = !rows; if (!rows) { el.innerHTML = ""; return; }
  el.innerHTML = `<div class="tablewrap"><table class="mt pm-pac"><thead><tr><th>Strumento</th><th class="num">Importo</th><th class="num">Quando</th><th class="num">Prossimo</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="caption">In tutto ${fmtN(tot, tot % 1 ? 2 : 0)} € al mese.${strs.length ? ` <button type="button" class="linkbtn" data-pacadd>+ Aggiungi un piano</button>` : ""}</p>`;
}
function pacSubmitNew(f) {
  const v = Object.fromEntries(new FormData(f).entries()), imp = num(v.imp), g = Math.round(+v.g);
  if (!(imp > 0) || !(g >= 1 && g <= 31) || !pmDb().strumenti[v.str]) return pmMsg("Scrivi un importo e un giorno del mese tra 1 e 31.", "err", "#pmTopMsg");
  const db = pmDb(); db.pac ||= [];
  /* il primo promemoria arriva dal prossimo giorno del PAC: i mesi passati non si chiedono */
  db.pac.push({ id: newId(), strumento: v.str, importo: imp, giorno: g, dal: pmToday(), fatti: {} });
  if (!pmSave()) return; pmMsg(`Piano salvato: ${fmtN(imp, imp % 1 ? 2 : 0)} € il giorno ${g} di ogni mese.`, "ok"); pacRenderList(); pacRenderDue(); pmButton();
}
function pacRegister(i, f) {
  const x = (PM.due || [])[i]; if (!x) return; const v = Object.fromEntries(new FormData(f).entries()), q = num(v.qta), imp = num(v.imp), sp = num(v.spese) || 0;
  if (!(q > 0) || !(imp > 0)) return pmMsg("Scrivi le quote comprate e l'importo.", "err", "#pmTopMsg");
  const id = newId(); pmDb().operazioni.push({ id, data: x.d, tipo: "acquisto", strumento: x.pl.strumento, quantita: q, prezzo: imp / q, valuta: "EUR", spese: sp, origine: "pac" });
  (x.pl.fatti ||= {})[x.ym] = id;
  if (!pmSave()) return; pmMsg(`PAC registrato: ${fmtN(q, 4)} quote a ${fmtN(imp / q, 2)} €.`, "ok", "#pmTopMsg"); pmRenderForm(); pmRender(); pmRefresh(false);
}
function pacSkip(i) { const x = (PM.due || [])[i]; if (!x) return; (x.pl.fatti ||= {})[x.ym] = "saltato"; if (!pmSave()) return; pmMsg(`PAC del ${dIt(x.d)} saltato.`, "", "#pmTopMsg"); pacRenderDue(); pmButton(); }

/* ---------- BTP e obbligazioni: nominale, prezzo su 100, cedole e rimborso ----------
   Titoli di Stato italiani ed europei: imposta del 12,5% su cedole; le altre obbligazioni 26%. */
const isGovt = s => /^IT000[0-9]/.test(s.isin || "") || /\b(BTP|BOT|CCT|CTZ|BUND|OAT|BONOS|GOVT|TREASURY|BTP ?ITALIA|BTP ?VALORE)\b/i.test(s.nome || "");
function bondNote(s, px) {
  const mat = s.scadenza ? new Date(s.scadenza + "T00:00:00Z") : null, now = new Date();
  const y = mat && mat > now && s.cedola != null && Number.isFinite(px) ? bondYtm(px, s.cedola, mat, now) : NaN;
  return `${mat ? ` · scade il ${dIt(s.scadenza)}` : ""}${Number.isFinite(y) ? ` · rend. a scadenza ${fmtPct(y, 2)} lordo` : ""}`;
}
function btpSubmit(v) {
  const db = pmDb(), data = v.data;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || "") || data > pmToday()) return pmMsg("Scegli una data valida, non nel futuro.", "err");
  if (PM.btpId && db.strumenti[PM.btpId]) { const px = num(v.bpx); if (!(px > 0 && px < 1000)) return pmMsg("Scrivi il prezzo su 100 (per esempio 101,20).", "err");
    if (!pmAdd({ data, tipo: "valutazione", strumento: PM.btpId, prezzo: px })) return; pmMsg(`Prezzo aggiornato: ${fmtN(px, 2)} su 100.`, "ok");
    /* la stima del BTP si riallinea al prezzo appena scritto */
    delete PM.px[PM.btpId]; PM.btpId = ""; pmRenderForm(); pmRefresh(false); return; }
  const raw = String(v.bnome || "").trim(), mm = raw.match(/^(.*?)\s*·\s*([A-Z]{2}[A-Z0-9]{9}\d)$/i), nome = (mm ? mm[1] : raw).slice(0, 80), nom = num(v.bnom), px = num(v.bpx), cpn = num(v.bcpn), spese = num(v.spese) || 0;
  if (!nome) return pmMsg("Scrivi il nome o l'ISIN del titolo.", "err");
  if (!(nom > 0)) return pmMsg("Scrivi il valore nominale, per esempio 10.000.", "err");
  if (!(px > 0 && px < 1000)) return pmMsg("Scrivi il prezzo su 100, per esempio 98,50.", "err");
  const isin = (raw.toUpperCase().match(/\b[A-Z]{2}[A-Z0-9]{9}\d\b/) || [])[0] || null, b = bondInfo(nome);
  const id = Object.keys(db.strumenti).find(k => db.strumenti[k].per100 && ((isin && db.strumenti[k].isin === isin) || db.strumenti[k].nome.toUpperCase() === nome.toUpperCase())) || (isin || "b-" + newId());
  if (!db.strumenti[id]) db.strumenti[id] = { nome, isin, valuta: "EUR", per100: true, classe: "Obbligazioni",
    cedola: Number.isFinite(cpn) ? cpn / 100 : (b && b.cpn != null ? b.cpn : null), scadenza: v.bmat || (b && b.mat ? b.mat.toISOString().slice(0, 10) : null), freq: +v.bfreq || 2 };
  db.strumenti[id].governativo = isGovt(db.strumenti[id]);
  if (!pmAdd({ data, tipo: "acquisto", strumento: id, quantita: nom, prezzo: px, spese })) return;
  pmMsg(`Salvato: ${fmtEur(nom)} nominali di ${nome} a ${fmtN(px, 2)} (costo ${fmtEur(nom * px / 100 + spese)}).`, "ok"); delete PM.px[id]; pmRenderForm(); pmRefresh(false);
}
/* cedole e rimborsi da registrare: date delle cedole a ritroso dalla scadenza, ogni 12/freq mesi */
function couponDates(s, from, to) {
  if (!s.scadenza || !(s.cedola > 0)) return [];
  const step = 12 / (s.freq || 2), [y, m, d] = s.scadenza.split("-").map(Number), out = [];
  for (let k = 0; k < 400; k++) { const mm = m - 1 - k * step, dt = new Date(Date.UTC(y, mm, 1)), last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
    const iso = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
    if (iso < from) break; if (iso <= to) out.push(iso); }
  return out.reverse();
}
function cedDue() {
  const db = PM.db, R = PM.R; if (!db || !R) return [];
  const today = pmToday(), out = [], done = db.cedole || {}, gone = new Set(db.operazioni.filter(o => o.tipo === "annulla").map(o => String(o.rif)));
  for (const p of R.posizioni) {
    const s = db.strumenti[p.id]; if (!s || !s.per100 || !(p.qta > 0)) continue;
    const buys = db.operazioni.filter(o => o.strumento === p.id && o.tipo === "acquisto" && !gone.has(String(o.id))).map(o => o.data).sort(); if (!buys.length) continue;
    for (const d of couponDates(s, buys[0] > today ? today : buys[0], today)) {
      if (d <= buys[0] || done[`${p.id}|${d}`]) continue;
      const n = dayN(d); if (db.operazioni.some(o => o.strumento === p.id && (o.tipo === "cedola" || o.tipo === "dividendo") && !gone.has(String(o.id)) && Math.abs(dayN(o.data) - n) <= 10)) continue;
      const lordo = p.qta * s.cedola / (s.freq || 2), tax = s.governativo ? 0.125 : 0.26;
      out.push({ kind: "cedola", id: p.id, d, lordo, netto: lordo * (1 - tax), tax });
    }
    if (s.scadenza && s.scadenza <= today && !done[`${p.id}|rimborso`]) out.push({ kind: "rimborso", id: p.id, d: s.scadenza, nom: p.qta });
  }
  return out.sort((a, b) => a.d < b.d ? -1 : 1).slice(-8);
}
function cedRegister(i, f) {
  const x = (PM.ced || [])[i]; if (!x) return; const db = pmDb(); db.cedole ||= {};
  if (x.kind === "cedola") { const imp = num(new FormData(f).get("imp")); if (!(imp > 0)) return pmMsg("Scrivi l'importo netto della cedola.", "err", "#pmTopMsg");
    const id = newId(); db.operazioni.push({ id, data: x.d, tipo: "cedola", strumento: x.id, importo: imp, valuta: "EUR", origine: "promemoria" }); db.cedole[`${x.id}|${x.d}`] = id;
    if (!pmSave()) return; pmMsg(`Cedola registrata: ${fmtN(imp, 2)} €.`, "ok", "#pmTopMsg"); }
  else { const id = newId(); db.operazioni.push({ id, data: x.d, tipo: "vendita", strumento: x.id, quantita: x.nom, prezzo: 100, valuta: "EUR", origine: "rimborso" }); db.cedole[`${x.id}|rimborso`] = id;
    if (!pmSave()) return; pmMsg(`Rimborso registrato: ${fmtEur(x.nom)} a 100.`, "ok", "#pmTopMsg"); }
  pmRenderForm(); pmRender();
}
function cedSkip(i) { const x = (PM.ced || [])[i]; if (!x) return; const db = pmDb(); db.cedole ||= {}; db.cedole[x.kind === "cedola" ? `${x.id}|${x.d}` : `${x.id}|rimborso`] = "saltato"; if (!pmSave()) return; pmRender(); }

/* ---------- disegno della sezione ---------- */
function pmMsg(t, k, where) { const el = $(where || "#pmMsg"); if (!el) return; el.textContent = t || ""; el.className = "caption" + (k ? " " + k : ""); }
function pmKpis(R) {
  const T = R.totale, ses = pmSession(R);
  const sesB = ses ? `<b class="${clsE(ses.euro)}">${sEur(ses.euro)}</b><small><span class="${clsP(ses.pct)}">${sPct(ses.pct)}</span> · ${ses.d === pmToday() ? "oggi" : dayName(ses.d)}, rispetto a ${dayName(ses.d0)}</small>`
    : `<b>—</b><small>${PM.loading ? "aggiorno i prezzi…" : "nessuna quotazione di giornata"}</small>`;
  /* con beni a mano (liquidità, oro, casa) la percentuale si calcola sugli investimenti: il fondo emergenza non è «versato» in borsa */
  const db = PM.db, inv = R.posizioni.filter(p => !db.strumenti[p.id].manuale), man = R.posizioni.some(p => db.strumenti[p.id].manuale);
  const invIn = inv.reduce((a, p) => a + p.acquistato, 0), invG = inv.reduce((a, p) => a + p.guadagno, 0);
  const gainTxt = man && invIn > 0 ? `${sPct(invG / invIn)} sugli investimenti (${fmtEur(invIn)} versati)` : `${sPct(T.guadagnoPct)} su ${fmtEur(T.versato)} versati`;
  return `<div class="pm-k"><span>Ultima seduta</span>${sesB}</div>
    <div class="pm-k"><span>Guadagno</span><b class="${clsE(T.guadagno)}">${sEur(T.guadagno)}</b><small>${gainTxt}</small></div>
    <div class="pm-k"><span>Rendimento (TIR)</span><b class="${clsP(T.tir)}">${sPct(T.tir)}</b><small>${T.anni >= 1 ? "all'anno" : "su meno di un anno: indicativo"} · dal ${dIt(R.dal)}</small></div>
    <div class="pm-k"><span>Dividendi e cedole</span><b>${fmtEur(T.proventi)}</b><small>spese e tasse: ${fmtEur(T.spese)}</small></div>`;
}
/* ---------- grafico del patrimonio, come nelle app dei broker ----------
   una linea sola (il valore, che sale anche quando versi), periodo a scelta, puntini al valore d'inizio periodo,
   in alto la variazione del periodo: euro guadagnati SENZA i versamenti e rendimento (ponderato nel tempo).
   Col dito o col mouse sulla linea: data, valore e variazione fino a quel giorno. */
const PM_PER = [["1S", 7, "nell'ultima settimana"], ["1M", 31, "nell'ultimo mese"], ["6M", 183, "negli ultimi 6 mesi"], ["1A", 366, "nell'ultimo anno"], ["Max", 0, "dall'inizio"]];
function pmPeriod(R, key) {
  const s = R.serie, per = PM_PER.find(x => x[0] === key) || PM_PER[4], last = s[s.length - 1];
  let i0 = 0;
  if (per[1]) { const from = new Date(Date.parse(last.d) - per[1] * 864e5).toISOString().slice(0, 10); i0 = Math.max(0, s.findIndex(x => x.d >= from) - 1); }
  /* «Max»: dal primo giorno in cui c'era qualcosa (prima il valore è zero) */
  if (!per[1]) i0 = Math.max(0, s.findIndex(x => x.valore > 0));
  return { per, i0, pts: s.slice(i0) };
}
function pmPerChange(pts, k) {
  const a = pts[0], b = pts[k], flows = pts.slice(1, k + 1).reduce((t, x) => t + (x.flusso || 0), 0);
  return { euro: b.valore - a.valore - flows, pct: (1 + b.twr) / (1 + a.twr) - 1 };
}
function pmChart(R) {
  const s = R.serie; if (s.length < 3) return "";
  const key = PM.chP || "Max", { per, pts: all } = pmPeriod(R, key);
  if (all.length < 2) return "";
  /* i prezzi storici sono di fine mese: tra un prezzo e l'altro la linea va dritta (niente gradini);
     nei giorni dei versamenti resta il salto, con il giorno prima e il giorno stesso */
  let keep = [0];
  for (let i = 1; i < all.length; i++) {
    if (Math.abs(all[i].flusso || 0) > 0.5) { if (keep[keep.length - 1] !== i - 1) keep.push(i - 1); keep.push(i); }
    else if (Math.abs(all[i].valore - all[i - 1].valore) > 1e-6 || i === all.length - 1) keep.push(i);
  }
  if (keep.length < 2) keep = all.map((_, i) => i);
  const step = Math.max(1, Math.ceil(keep.length / 400)), idx = keep.filter((i, k) => k % step === 0 || k === keep.length - 1 || Math.abs(all[i].flusso || 0) > 0.5 || (keep[k + 1] != null && Math.abs(all[keep[k + 1]].flusso || 0) > 0.5));
  const box = $("#pmChart"), W = Math.round(Math.min(1200, Math.max(300, ((box && box.clientWidth) || 900) - 34))), H = W < 520 ? 190 : 250, P = 10;
  const vals = idx.map(i => all[i].valore), hi = Math.max(...vals), lo = Math.min(...vals, all[0].valore), pad = (hi - lo) * 0.08 || hi * 0.02 || 1;
  const x = k => P + k / (idx.length - 1) * (W - 2 * P), y = v => P + (1 - (v - (lo - pad)) / ((hi + pad) - (lo - pad))) * (H - 2 * P);
  const d = idx.map((i, k) => `${k ? "L" : "M"}${x(k).toFixed(1)} ${y(all[i].valore).toFixed(1)}`).join("");
  const ch = pmPerChange(all, all.length - 1), up = ch.euro >= 0, col = up ? "var(--good)" : "var(--bad)";
  PM.ch = { all, idx, W, H, x, y, per };
  return `<div class="pm-ch2-h"><div class="pm-ch2-v"><span id="pmChWhen">${per[2][0].toUpperCase() + per[2].slice(1)}</span><b id="pmChVal">${fmtEur(all[all.length - 1].valore)}</b>
      <small id="pmChDelta" class="${up ? "up" : "dn"}">${up ? "▲" : "▼"} ${sEur(ch.euro)} · ${sPct(ch.pct)}</small></div>
      <div class="pm-ch2-p" role="group" aria-label="Periodo del grafico">${PM_PER.map(([k]) => `<button type="button" data-pmper="${k}" aria-pressed="${k === key}">${k}</button>`).join("")}</div></div>
    <div class="pm-ch2-svg"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Valore del patrimonio ${per[2]}: da ${fmtEur(all[0].valore)} a ${fmtEur(all[all.length - 1].valore)}" preserveAspectRatio="none">
      <defs><linearGradient id="pmChG" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${up ? "#0B7A3E" : "#C2263F"}" stop-opacity=".14"/><stop offset="1" stop-color="${up ? "#0B7A3E" : "#C2263F"}" stop-opacity="0"/></linearGradient></defs>
      <line x1="${P}" x2="${W - P}" y1="${y(all[0].valore).toFixed(1)}" y2="${y(all[0].valore).toFixed(1)}" stroke="var(--faint)" stroke-width="1.6" stroke-dasharray="1 6" stroke-linecap="round"/>
      <path d="${d} L${x(idx.length - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z" fill="url(#pmChG)"/>
      <path d="${d}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      <line id="pmChCur" x1="0" x2="0" y1="${P}" y2="${H - P}" stroke="var(--fg)" stroke-width="1" opacity="0"/><circle id="pmChDot" r="5" cx="0" cy="0" fill="${col}" stroke="var(--bg)" stroke-width="2" opacity="0"/>
    </svg></div>
    <p class="pm-ch2-f"><span>${dIt(all[0].d)}</span><span>Rendimento ${per[2]} senza contare i soldi versati; la linea sale anche quando investi.</span><span>${dIt(all[all.length - 1].d)}</span></p>`;
}
/* scorrimento sulla linea (mouse, dito, frecce della tastiera) */
function pmChartScrub(ev) {
  const C = PM.ch, svg = ev.currentTarget.querySelector("svg"); if (!C || !svg) return;
  const r = svg.getBoundingClientRect(), cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left, k = Math.max(0, Math.min(C.idx.length - 1, Math.round((cx / r.width * C.W - 10) / (C.W - 20) * (C.idx.length - 1))));
  pmChartAt(k);
}
function pmChartAt(k) {
  const C = PM.ch; if (!C) return; C.k = k;
  const i = C.idx[k], p = C.all[i], ch = pmPerChange(C.all, i), up = ch.euro >= 0;
  const cur = $("#pmChCur"), dot = $("#pmChDot");
  if (cur) { cur.setAttribute("x1", C.x(k)); cur.setAttribute("x2", C.x(k)); cur.setAttribute("opacity", ".35"); }
  if (dot) { dot.setAttribute("cx", C.x(k)); dot.setAttribute("cy", C.y(p.valore)); dot.setAttribute("opacity", "1"); }
  $("#pmChWhen").textContent = dIt(p.d); $("#pmChVal").textContent = fmtEur(p.valore);
  const dl = $("#pmChDelta"); dl.className = up ? "up" : "dn"; dl.textContent = `${up ? "▲" : "▼"} ${sEur(ch.euro)} · ${sPct(ch.pct)}`;
}
function pmChartReset() {
  const C = PM.ch; if (!C) return; C.k = null;
  ["#pmChCur", "#pmChDot"].forEach(s => { const e = $(s); if (e) e.setAttribute("opacity", "0"); });
  const ch = pmPerChange(C.all, C.all.length - 1), up = ch.euro >= 0;
  $("#pmChWhen").textContent = C.per[2][0].toUpperCase() + C.per[2].slice(1); $("#pmChVal").textContent = fmtEur(C.all[C.all.length - 1].valore);
  const dl = $("#pmChDelta"); dl.className = up ? "up" : "dn"; dl.textContent = `${up ? "▲" : "▼"} ${sEur(ch.euro)} · ${sPct(ch.pct)}`;
}
function pmChartBind() {
  const box = $("#pmChart"), area = box && box.querySelector(".pm-ch2-svg"); if (!area || area.dataset.on) return; area.dataset.on = "1";
  area.tabIndex = 0; area.setAttribute("aria-label", "Scorri il grafico con le frecce per vedere i valori giorno per giorno");
  area.addEventListener("pointermove", pmChartScrub); area.addEventListener("pointerdown", pmChartScrub);
  area.addEventListener("touchmove", e => { pmChartScrub(e); e.preventDefault(); }, { passive: false });
  area.addEventListener("pointerleave", pmChartReset); area.addEventListener("blur", pmChartReset);
  area.addEventListener("keydown", e => { const C = PM.ch; if (!C) return; if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); /* le frecce qui scorrono il grafico, non cambiano pagina */ const k = C.k == null ? C.idx.length - 1 : C.k + (e.key === "ArrowRight" ? 1 : -1); pmChartAt(Math.max(0, Math.min(C.idx.length - 1, k))); } if (e.key === "Escape") pmChartReset(); });
}
document.addEventListener("click", e => { const b = e.target.closest("[data-pmper]"); if (!b || !PM.R) return; PM.chP = b.dataset.pmper; try { localStorage.setItem("pos-pm-periodo", PM.chP); } catch {} $("#pmChart").innerHTML = pmChart(PM.R); pmChartBind(); });
function pmPosTable(R) {
  const db = PM.db, rows = R.posizioni;
  if (!rows.length) return `<p class="pm-empty">Ancora niente. Aggiungi qui sotto il primo acquisto (per esempio <b>VWCE</b>, 20 quote a 100 €) oppure <b>importa il file</b> della tua banca o del tuo broker.</p>`;
  const src = p => p.prezzoFonte === "mercato" && PM.px[p.id] && PM.px[p.id].stima ? `stimato con i tassi del ${dIt(PM.px[p.id].stima.curvaAl)} (Banca d'Italia)` : p.prezzoFonte === "mercato" ? `prezzo al ${dIt(p.prezzoData)}` : db.strumenti[p.id].manuale ? `stima del ${dIt(p.prezzoData)}` : `il tuo prezzo del ${dIt(p.prezzoData)}`;
  const tr = p => { const s = db.strumenti[p.id], g = p.guadagno, gp = p.acquistato > 0 ? g / p.acquistato : NaN, ccy = s.valuta && s.valuta !== "EUR" ? " " + s.valuta : " €";
    return `<tr class="${p.aperta ? "" : "closed"}"><td><b>${esc(s.nome)}</b><small>${esc([s.ticker, s.isin].filter(Boolean).join(" · ") || (s.manuale ? "bene senza quotazione" : s.simbolo || ""))}${p.aperta ? "" : " · chiusa"}</small></td>
      <td class="num">${p.aperta ? (s.per100 ? fmtEur(p.qta) + "<small>nominali</small>" : fmtN(p.qta, p.qta % 1 ? 3 : 0)) : "—"}</td>
      <td class="num">${p.aperta && Number.isFinite(p.prezzo) ? (s.per100 ? fmtN(p.prezzo, 2) + " su 100" : fmtN(p.prezzo, 2) + ccy) : "—"}<small>${p.aperta && p.prezzoData ? src(p) : ""}${p.aperta && s.per100 ? bondNote(s, p.prezzo) : ""}</small></td>
      <td class="num"><b>${fmtEur(p.valore)}</b><small>${p.aperta ? fmtPct(p.peso, 1) : ""}</small></td>
      <td class="num"><span class="${clsE(g)}">${sEur(g)}</span><small class="${clsP(gp)}">${sPct(gp)}</small></td>
      <td class="num">${s.manuale && p.aperta ? `<button type="button" class="btn sm" data-pmval="${esc(p.id)}">Aggiorna stima</button>` : s.per100 && p.aperta ? `<button type="button" class="btn sm" data-pmbpx="${esc(p.id)}">Aggiorna prezzo</button>` : ""}</td></tr>`; };
  const bonds = rows.some(p => p.aperta && db.strumenti[p.id].per100), manuali = rows.some(p => p.aperta && db.strumenti[p.id].manuale), err = Object.entries(PM.px).filter(([, j]) => j && j.error).map(([id, j]) => `${db.strumenti[id] ? db.strumenti[id].nome : id}: ${j.error}`);
  return `<div class="tablewrap"><table class="mt pm-pos"><thead><tr><th>Strumento</th><th class="num">Quote</th><th class="num">Prezzo</th><th class="num">Valore · peso</th><th class="num">Guadagno</th><th></th></tr></thead><tbody>${rows.map(tr).join("")}</tbody></table></div>
    ${R.avvisi.length ? `<p class="caption">${R.avvisi.map(esc).join(" · ")}</p>` : ""}${err.length ? `<p class="caption">Prezzi non aggiornati: ${err.map(esc).join(" · ")}. Uso l'ultimo prezzo noto.</p>` : ""}
    ${manuali ? `<p class="caption">I beni senza quotazione valgono l'ultima stima che hai inserito e non entrano nelle analisi del laboratorio.</p>` : ""}
    ${bonds ? (() => { const st = rows.filter(p => p.aperta && db.strumenti[p.id].per100 && PM.px[p.id] && PM.px[p.id].stima), al = st.length ? PM.px[st[0].id].stima.curvaAl : null, other = rows.some(p => p.aperta && db.strumenti[p.id].per100 && !(PM.px[p.id] && PM.px[p.id].stima));
      return `<p class="caption">${st.length ? `BTP a tasso fisso: il prezzo è <b>stimato</b> ogni giorno dai rendimenti dei BTP benchmark pubblicati dalla Banca d'Italia (dati al ${dIt(al)}), allineato all'ultimo prezzo che hai scritto: si muove con i tassi, ma il prezzo vero può scostarsi di qualche decimo. Fonte: Banca d'Italia. ` : ""}${other ? `Le altre obbligazioni (BTP indicizzati, CCT, titoli esteri o societari) valgono l'ultimo prezzo che hai scritto, su 100 di nominale. ` : ""}Con «Aggiorna prezzo» scrivi il prezzo del tuo home banking.</p>`; })() : ""}`;
}
function pmOpsTable() {
  const db = PM.db, ops = db.operazioni, gone = new Set(ops.filter(o => o.tipo === "annulla").map(o => String(o.rif)));
  const list = ops.filter(o => o.tipo !== "annulla").slice().sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0)).slice(0, 200);
  if (!list.length) return `<p class="caption">Le operazioni che aggiungi o importi compaiono qui, dalla più recente.</p>`;
  const det = o => { const s = db.strumenti[o.strumento] || {}, c = o.valuta || s.valuta || "EUR", u = c === "EUR" ? " €" : " " + c;
    if ((o.tipo === "acquisto" || o.tipo === "vendita") && s.per100) return `${fmtN(+o.quantita, 0)} € nominali a ${fmtN(+o.prezzo, 2)}${+o.spese ? ` · spese ${fmtN(+o.spese, 2)} €` : ""}`;
    if (o.tipo === "acquisto" || o.tipo === "vendita") return s.manuale && o.tipo === "acquisto" ? `valore ${fmtN(+o.prezzo, 0)} €` : `${fmtN(+o.quantita, +o.quantita % 1 ? 3 : 0)} × ${fmtN(+o.prezzo, 2)}${u}${+o.spese ? ` · spese ${fmtN(+o.spese, 2)} €` : ""}${o.stima ? " · quote stimate" : ""}`;
    if (o.tipo === "valutazione") return s.per100 ? `${fmtN(+o.prezzo, 2)} su 100` : `stima ${fmtN(+o.prezzo, 0)} €`;
    if (o.tipo === "dividendo" || o.tipo === "cedola" || o.tipo === "commissione" || o.tipo === "tassa") return `${fmtN(+o.importo, 2)}${u}`;
    if (o.tipo === "frazionamento") return `1 quota → ${fmtN(+o.rapporto, 2)}`; return ""; };
  return `<div class="tablewrap"><table class="mt pm-ops"><thead><tr><th>Data</th><th>Operazione</th><th>Strumento</th><th class="num">Dettaglio</th><th></th></tr></thead><tbody>
    ${list.map(o => { const g = gone.has(String(o.id)); return `<tr class="${g ? "gone" : ""}"><td>${dIt(o.data)}</td><td>${esc(o.tipo === "valutazione" && (db.strumenti[o.strumento] || {}).per100 ? "Prezzo aggiornato" : TIPO_L[o.tipo] || o.tipo)}${g ? " <small>annullata</small>" : o.origine === "file" ? " <small>da file</small>" : ""}</td><td>${esc((db.strumenti[o.strumento] || {}).nome || "—")}</td><td class="num">${det(o)}</td><td class="num">${g ? "" : `<button type="button" class="btn sm" data-pmdel="${esc(o.id)}">Annulla</button>`}</td></tr>`; }).join("")}
    </tbody></table></div>${list.length >= 200 ? `<p class="caption">Mostro le 200 più recenti.</p>` : ""}`;
}
function pmForm() {
  const db = pmDb(), R = PM.R, t = PM.tipo, open = R ? R.posizioni.filter(p => p.aperta && !db.strumenti[p.id].manuale && !db.strumenti[p.id].per100) : [], all = Object.entries(db.strumenti).filter(([, s]) => !s.manuale);
  const manual = Object.entries(db.strumenti).filter(([id, s]) => s.manuale && R && R.posizioni.some(p => p.id === id && p.aperta));
  const date = `<label>Data<input type="date" name="data" value="${pmToday()}" max="${pmToday()}" required></label>`;
  const opt = (list, sel) => list.map(([id, s]) => `<option value="${esc(id)}"${id === sel ? " selected" : ""}>${esc(s.nome)}</option>`).join("");
  if (t === "acquisto") return `<label class="wide">Strumento<input name="str" list="pmList" placeholder="Ticker, ISIN o nome: VWCE, IE00BK5BQT80…" spellcheck="false" required><small class="pm-hint" id="pmHint"></small></label>
      <datalist id="pmList">${POPULAR.map(p => `<option value="${p[0]} · ${esc(p[1])}">`).join("")}${all.map(([, s]) => s.ticker && !POPULAR.some(p => p[0] === s.ticker) ? `<option value="${esc(s.ticker)} · ${esc(s.nome)}">` : "").join("")}</datalist>
      <label>Quote<input name="qta" inputmode="decimal" placeholder="20" required></label>
      <label>Prezzo per quota <span id="pmCcy">(€)</span><input name="prezzo" inputmode="decimal" placeholder="100" required></label>
      ${date}<label>Spese (€, facoltative)<input name="spese" inputmode="decimal" placeholder="0"></label>
      <button type="submit" class="btn lime">Salva l'acquisto</button>`;
  if (t === "vendita") return open.length ? `<label class="wide">Strumento<select name="sid" required>${opt(open.map(p => [p.id, db.strumenti[p.id]]))}</select><small class="pm-hint" id="pmHint">${esc(`Possiedi ${fmtN(open[0].qta, open[0].qta % 1 ? 3 : 0)} quote`)}</small></label>
      <label>Quote vendute<input name="qta" inputmode="decimal" required></label><label>Prezzo per quota <span id="pmCcy">(${esc(db.strumenti[open[0].id].valuta || "€")})</span><input name="prezzo" inputmode="decimal" required></label>
      ${date}<label>Spese e tasse (€)<input name="spese" inputmode="decimal" placeholder="0"></label><button type="submit" class="btn lime">Salva la vendita</button>`
    : `<p class="caption">Non hai posizioni aperte da vendere.</p>`;
  if (t === "btp") { const own = Object.entries(db.strumenti).filter(([id, s]) => s.per100 && R && R.posizioni.some(p => p.id === id && p.aperta)), sel = PM.btpId;
    if (sel && db.strumenti[sel]) { const p = R.posizioni.find(x => x.id === sel);
      return `<label class="wide">Titolo<select name="bsel" id="pmBtpSel"><option value="">Nuovo acquisto di un BTP o un'obbligazione</option>${opt(own, sel)}</select></label>
      <label>Nuovo prezzo (su 100)<input name="bpx" inputmode="decimal" placeholder="${p && Number.isFinite(p.prezzo) ? String(p.prezzo).replace(".", ",") : "100"}" required></label>${date}
      <button type="submit" class="btn lime">Salva il prezzo</button><p class="caption wide-c">Lo trovi nel tuo home banking o sul sito di Borsa Italiana: è il prezzo per 100 € di valore nominale.</p>`; }
    return `${own.length ? `<label class="wide">Titolo<select name="bsel" id="pmBtpSel"><option value="">Nuovo acquisto di un BTP o un'obbligazione</option>${opt(own, "")}</select></label>` : ""}
      <label class="wide">Nome o ISIN<input name="bnome" list="pmBtpList" placeholder="BTP 3,35% 01MZ35 oppure IT0005…" spellcheck="false" autocomplete="off" required><datalist id="pmBtpList"></datalist><small class="pm-hint" id="pmBtpHint">scrivi «BTP 2033» per scegliere tra i BTP in circolazione, oppure nome o ISIN</small></label>
      <label>Valore nominale (€)<input name="bnom" inputmode="decimal" placeholder="10.000" required></label>
      <label>Prezzo di acquisto (su 100)<input name="bpx" inputmode="decimal" placeholder="98,50" required></label>${date}
      <label>Cedola annua (%)<input name="bcpn" inputmode="decimal" placeholder="3,35"></label>
      <label>Scadenza<input type="date" name="bmat"></label>
      <label>Cedole<select name="bfreq"><option value="2">ogni 6 mesi (BTP)</option><option value="1">una volta l'anno</option><option value="4">ogni 3 mesi</option></select></label>
      <label>Spese (€)<input name="spese" inputmode="decimal" placeholder="0"></label>
      <button type="submit" class="btn lime">Salva il titolo</button>
      <p class="caption wide-c">Esempio: 10.000 € nominali a 98,50 costano 9.850 €. Con cedola e scadenza ti ricordo le cedole e il rimborso. BOT e titoli senza cedola: lascia la cedola vuota.</p>`; }
  if (t === "pac") { const own = Object.entries(db.strumenti).filter(([id, s]) => !s.manuale && R && R.posizioni.some(p => p.id === id && p.aperta));
    return own.length ? `<label class="wide">Strumento<select name="str">${opt(own)}</select></label>
      <label>Importo al mese (€)<input name="imp" inputmode="decimal" placeholder="100" required></label><label>Giorno del mese<input name="g" type="number" min="1" max="31" value="1" required></label>
      <button type="submit" class="btn lime">Salva il piano</button><p class="caption wide-c">Il giorno del PAC ti ricordo di registrarlo, con l'importo già scritto: tu scrivi solo le quote vere del broker.</p>`
    : `<p class="caption">Aggiungi prima uno strumento con un acquisto: poi puoi impostarne il piano di accumulo.</p>`; }
  if (t === "dividendo") return all.length ? `<label class="wide">Strumento<select name="sid" required>${opt(all)}</select></label>
      <label>Importo netto incassato (€)<input name="importo" inputmode="decimal" required></label>${date}<button type="submit" class="btn lime">Salva il provento</button>`
    : `<p class="caption">Aggiungi prima uno strumento con un acquisto.</p>`;
  return `<label class="wide">Bene<select name="bene" id="pmBene"><option value="">Nuovo bene (casa, polizza, oro fisico, partecipazione…)</option>${opt(manual, PM.beneId)}</select></label>
      ${PM.beneId ? "" : `<label class="wide">Nome<input name="nome" placeholder="Conto deposito, oro fisico, appartamento…" required></label><label>Tipo<select name="btipo"><option value="">Lo capisco dal nome</option>${BENE_TIPI.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>`}
      <label>${PM.beneId ? "Nuovo valore stimato (€)" : "Valore (€)"}<input name="valore" inputmode="decimal" required></label>${date}
      <button type="submit" class="btn lime">${PM.beneId ? "Salva la nuova stima" : "Aggiungi il bene"}</button>`;
}
function pmRenderForm() {
  const f = $("#pmForm"); if (!f) return; f.innerHTML = pmForm(); PM.res = null;
  if (PM.tipo === "btp" && $("#pmBtpList")) btpLista().then(L => { const dl = $("#pmBtpList"); if (dl) dl.innerHTML = L.righe.map(b => `<option value="${esc(b.nome)} · ${b.isin}"></option>`).join(""); });
  document.querySelectorAll("#pmTipo [data-pmt]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.pmt === PM.tipo)));
}
function pmButton() {
  pmMenu();
  const b = $("#pmBtn"); if (!b) return;
  if (!pmHas()) { b.classList.remove("has"); $("#pmBtnT").textContent = "Crea il tuo patrimonio"; $("#pmBtnS").textContent = "aggiungi ciò che possiedi: lo ritrovi qui ogni giorno, aggiornato"; return; }
  const R = PM.R || pmCalc(), ses = pmSession(R);
  b.classList.add("has"); $("#pmBtnT").textContent = `Il mio patrimonio · ${fmtEur(R.totale.valore)}`;
  const nd = pacDue().length;
  $("#pmBtnS").textContent = ses ? `${ses.d === pmToday() ? "oggi" : dayName(ses.d)} ${sEur(ses.euro)} (${sPct(ses.pct)}) · guadagno ${sEur(R.totale.guadagno)}` : `guadagno ${sEur(R.totale.guadagno)}`;
  if (nd) $("#pmBtnS").textContent = `${nd === 1 ? "un PAC" : nd + " PAC"} da registrare · ` + $("#pmBtnS").textContent;
}
/* ---------- Le tue tasse (stima): motore POS.fisco ---------- */
/* categoria fiscale: scelta a mano > catalogo del sito (sa quali sono ETF) > nome */
function pmFiscStrumenti() {
  const out = {};
  for (const [id, s] of Object.entries(PM.db.strumenti)) {
    let f = s.fiscale || null;
    if (!f) { const pop = POPULAR.find(p => (s.isin && p[2] === s.isin) || (s.ticker && p[0] === String(s.ticker).toUpperCase()));
      if (pop) f = pop[7] === "ETF" ? "fondo" : pop[7] === "ETC" || pop[7] === "ETN" || pop[7] === "Azione" ? "diversi" : pop[7] === "Moneta" ? "cripto" : null; }
    out[id] = f ? { ...s, fiscale: f } : s;
  }
  return out;
}
function pmTax(R) {
  const box = $("#pmTaxBox"); if (!box) return;
  const ST = pmFiscStrumenti(), F = P.fisco(R, ST, { oggi: pmToday() }), L = F.latente, y = +pmToday().slice(0, 4); PM.fisc = F;
  const show = L.righe.length || F.vendite.length || F.zainetto.length; box.hidden = !show; if (!show) { $("#pmTax").innerHTML = ""; return; }
  const z = F.zainetto, zTot = z.reduce((a, x) => a + x.residuo, 0), zFirst = z.length ? z.slice().sort((a, b) => a.scadenza < b.scadenza ? -1 : 1)[0] : null, A = F.anni[y];
  const opt = (id, c) => `<select data-pmfisc="${esc(id)}" aria-label="Categoria fiscale di ${esc(ST[id].nome)}">${["fondo", "diversi", "statale", "obbligazione", "cripto"].map(k => `<option value="${k}"${k === c ? " selected" : ""}>${P.FISCO_CAT_L[k]}</option>`).join("")}</select>`;
  const rate = r => r.cat === "fondo" ? "26%, senza compensare" : r.cat === "statale" ? "12,5%" : r.cat === "cripto" ? (y >= 2026 ? "33%" : "26%") : "26%";
  $("#pmTax").innerHTML = `<div class="pm-tax-k">
      <div><span>Bollo stimato, ${y}</span><b>${fmtEur(F.bollo.annuo)}</b><small>0,2% di ${fmtEur(F.bollo.base)} in titoli</small></div>
      <div><span>Se vendessi tutto oggi</span><b class="${L.imposta > 0.5 ? "dn" : ""}">${L.imposta > 0.5 ? "−" + fmtEur(L.imposta) : fmtEur(0)}</b><small>di imposte · incasseresti ${fmtEur(L.netto)}</small></div>
      <div><span>Minusvalenze da recuperare</span><b>${zTot > 0.5 ? fmtEur(zTot) : "nessuna"}</b><small>${zFirst ? `${fmtEur(zFirst.residuo)} scadono il ${dIt(zFirst.scadenza)}` : "lo «zainetto fiscale» è vuoto"}</small></div>
    </div>
    ${A && (A.plus > 0 || A.minus > 0) ? `<p class="pm-tax-y">Vendite del ${y}: guadagni ${fmtEur(A.plus)}${A.compensato > 0.5 ? `, di cui ${fmtEur(A.compensato)} compensati con le minusvalenze` : ""}${A.minus > 0.5 ? ` · perdite ${fmtEur(A.minus)} (nello zainetto)` : ""} · imposte stimate <b>${fmtEur(A.imposta)}</b>.</p>` : ""}
    <details class="pm-tax-d"><summary>Posizione per posizione e come è calcolato</summary>
      <div class="tablewrap"><table class="mt"><thead><tr><th>Strumento</th><th>Categoria fiscale</th><th class="num">Guadagno se vendi oggi</th><th class="num">Imposta</th></tr></thead><tbody>
      ${L.righe.map(r => `<tr><td><b>${esc(r.nome)}</b><small>${rate(r)}</small></td><td>${opt(r.id, r.cat)}</td><td class="num ${clsE(r.lat)}">${sEur(r.lat)}${r.compensato > 0.5 ? `<small>${fmtEur(r.compensato)} compensati</small>` : ""}</td><td class="num">${r.imposta > 0.5 ? "−" + fmtEur(r.imposta) : "—"}</td></tr>`).join("")}
      </tbody></table></div>
      ${z.length ? `<div class="tablewrap"><table class="mt"><thead><tr><th>Minusvalenza da</th><th class="num">Ancora da usare</th><th class="num">Scade il</th></tr></thead><tbody>${z.map(x => `<tr><td>${esc(x.nome)}<small>${x.anno}</small></td><td class="num">${fmtEur(x.residuo)}</td><td class="num">${dIt(x.scadenza)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <ul class="pm-tax-n">
        <li>ETF e fondi: i guadagni pagano il 26% e non si possono compensare con le minusvalenze. Le loro perdite però vanno nello zainetto.</li>
        <li>Azioni, ETC e obbligazioni: 26%, e i guadagni si compensano con le minusvalenze, a partire dalle più vecchie. Titoli di Stato: 12,5%. Cripto: ${y >= 2026 ? "33% dal 2026" : "26%"}.</li>
        <li>Le minusvalenze si usano entro il 31 dicembre del quarto anno dopo quello in cui sono nate.</li>
        ${F.note.map(n => `<li>${esc(n)}</li>`).join("")}
        <li>È una stima con il costo medio ponderato. Le imposte vere le trattiene la banca (regime amministrato) o le calcola il commercialista (dichiarativo). Non è una consulenza fiscale.</li>
      </ul></details>`;
}
/* ---------- Proventi in arrivo nei prossimi 12 mesi ----------
   cedole: certe, da cedola e scadenza del titolo; dividendi: STIMA, ripetendo quelli dei 12 mesi passati (fonte Yahoo Finance) con le quote di oggi. */
function pmIncome(R) {
  const box = $("#pmIncBox"); if (!box) return;
  const db = PM.db, today = pmToday(), to = new Date(Date.parse(today) + 365 * 864e5).toISOString().slice(0, 10), from1 = new Date(Date.parse(today) - 365 * 864e5).toISOString().slice(0, 10), out = [];
  const fxNow = c => { if (!c || c === "EUR") return 1; const k = c === "GBX" ? 100 : 1, pts = PM.fx[c === "GBX" ? "GBP" : c] || []; const last = pts.length ? +pts[pts.length - 1].v : NaN; return last > 0 ? 1 / (k * last) : NaN; };
  for (const p of R.posizioni) {
    const s = db.strumenti[p.id]; if (!s || !p.aperta) continue;
    if (s.per100) { for (const d of couponDates(s, today, to)) { if (d <= today) continue; const lordo = p.qta * s.cedola / (s.freq || 2), tax = s.governativo ? 0.125 : 0.26; out.push({ d, nome: s.nome, tipo: "Cedola", lordo, netto: lordo * (1 - tax), certo: true }); } continue; }
    const j = PM.px[p.id], dv = j && Array.isArray(j.dividendi) ? j.dividendi.filter(x => x.d > from1 && x.d <= today) : [];
    const k = fxNow(String(s.valuta || (j && j.currency) || "EUR").toUpperCase()); if (!dv.length || !(k > 0)) continue;
    for (const x of dv) { const d = new Date(Date.parse(x.d) + 365 * 864e5).toISOString().slice(0, 10); if (d <= today || d > to) continue; const lordo = p.qta * x.v * k; out.push({ d, nome: s.nome, tipo: "Dividendo", lordo, netto: lordo * 0.74, certo: false }); }
  }
  out.sort((a, b) => a.d < b.d ? -1 : 1);
  PM.inc = out.slice().sort((a, b) => (a.d < b.d ? -1 : 1));
  box.hidden = !out.length; if (!out.length) { $("#pmInc").innerHTML = ""; return; }
  const tot = out.reduce((a, x) => a + x.netto, 0), stima = out.some(x => !x.certo), next = out[0];
  $("#pmInc").innerHTML = `<div class="pm-inc-h"><div><span>Prossimi 12 mesi, netti${stima ? " (stima)" : ""}</span><b>${fmtEur(tot)}</b></div><div><span>Il prossimo</span><b>${dIt(next.d)}</b><small>${esc(next.nome)} · ${fmtN(next.netto, 2)} €</small></div></div>
    <div class="tablewrap"><table class="mt pm-inc-t"><thead><tr><th>Data</th><th>Strumento</th><th>Tipo</th><th class="num">Lordo</th><th class="num">Netto</th></tr></thead><tbody>${out.slice(0, 24).map(x => `<tr><td>${dIt(x.d)}</td><td>${esc(x.nome)}</td><td>${x.tipo}${x.certo ? "" : "<small>stima</small>"}</td><td class="num">${fmtN(x.lordo, 2)} €</td><td class="num"><b>${fmtN(x.netto, 2)} €</b></td></tr>`).join("")}</tbody></table></div>
    <p class="caption">${stima ? "I dividendi sono una stima: ripeto quelli degli ultimi 12 mesi (Yahoo Finance) con le quote di oggi; le date sono quelle di stacco, l'accredito arriva qualche giorno dopo. Netto al 26%: per le azioni estere si aggiunge la ritenuta del paese d'origine. " : ""}Le cedole sono calcolate da tasso e scadenza del titolo, nette al ${out.some(x => x.tipo === "Cedola") ? "12,5% per i titoli di Stato e al 26% per le altre obbligazioni" : "26%"}.</p>`;
}
function pmRender() {
  const R = pmCalc(), has = pmHas();
  if (!$("#pmKpis")) return;
  $("#pmAsOf").textContent = PM.loading ? "Aggiorno i prezzi di oggi…" : has ? `Aggiornato al ${dIt(pmToday())} · salvato solo in questo browser` : "Il tuo patrimonio, sempre qui: aggiungi ciò che possiedi o importa un file. Senza account.";
  pmRing(R);
  $("#pmKpis").innerHTML = has ? pmKpis(R) : `<div class="pm-empty"><b>Inizia da qui.</b> Aggiungi quello che possiedi: ETF, azioni, fondi, ma anche casa, polizze e altri beni. Oppure importa l'Excel o l'export del broker. Ogni volta che torni trovi il valore aggiornato, quanto hai guadagnato e com'è andata l'ultima seduta.</div>`;
  if (PM.chP == null) { try { PM.chP = localStorage.getItem("pos-pm-periodo") || "Max"; } catch { PM.chP = "Max"; } }
  $("#pmChart").innerHTML = has ? pmChart(R) : ""; $("#pmChart").hidden = !has || R.serie.length < 3; pmChartBind();
  $("#pmPos").innerHTML = pmPosTable(R); $("#pmOps").innerHTML = pmOpsTable();
  pacRenderDue(); pacRenderList();
  pmTax(R);
  pmIncome(R);
  pmRisk(R);
  pmGoals(R);
  const quoted = R.posizioni.some(p => { const s = PM.db.strumenti[p.id]; return p.aperta && !s.manuale && (!s.per100 || pmBtpSym(s)); });
  $("#pmLab").disabled = !quoted; $("#pmExport").disabled = !has;
  pmButton();
}
async function pmRefresh(force) {
  if (!pmHas()) { pmRender(); return; }
  /* prezzi ricordati di uno strumento che nel frattempo ha cambiato simbolo (o BTP con un prezzo nuovo): si richiedono */
  for (const [id, j] of Object.entries(PM.px)) { const s = PM.db.strumenti[id]; if (!s || (j && j.symbol && j.symbol !== (s.simbolo || pmBtpSym(s)))) delete PM.px[id]; }
  const fresh = PM.pxT && Date.now() - PM.pxT < PM_PX_FRESH, missing = Object.entries(PM.db.strumenti).some(([id, s]) => (s.simbolo || pmBtpSym(s)) && !PM.px[id]);
  if (fresh && !missing && !force) { pmRender(); return; }
  PM.loading = true; pmRender(); /* con i prezzi ricordati la pagina ha già i valori: intanto si aggiornano */
  try { await pmPrices(force || !fresh); } finally { PM.loading = false; }
  if (force || !fresh) PM.pxT = Date.now();
  pmPxSave(); pmRender();
}
/* entrata nella sezione (dal menu, dalla home o all'avvio) */
function pmEnter() { trackOnce("feature", "patrimonio", { name: "patrimonio" }); pmDb(); if (!$("#pmForm").children.length) pmRenderForm(); pmRefresh(false); }

/* ---------- dal file caricato al patrimonio ---------- */
const keyOf = v => String(v || "").trim().toLowerCase();
const isoOf = d => d instanceof Date ? d.toISOString().slice(0, 10) : String(d || "").slice(0, 10);
/* il portafoglio del file è vero (non l'esempio né un portafoglio di prova costruito a mano)? */
const fileBonds = () => { const u = S.lastUnd || S.und; return u && u.posizioni ? u.posizioni.filter(p => isBondPos(p) && !(S.portfolio && S.portfolio.positions.some(q => q.simbolo && !isBtpSym(q.simbolo) && (q.isin && q.isin === p.isin || q.nome === p.nome)))) : []; };
const fileOk = () => !!(S.portfolio && S.portfolio.positions && (S.portfolio.positions.some(p => p.simbolo) || fileBonds().length) && S.source && S.source.kind !== "sample" && !isExample() && !S.source.builder && !(S.rb && S.rb.origSource && S.rb.origSource.builder));
async function pmFromFile() {
  const pos = S.portfolio.positions.filter(p => p.simbolo && !isBtpSym(p.simbolo)), db = pmDb(), fileName = (S.rb && S.rb.origSource && S.rb.origSource.name) || (S.source && S.source.name) || "file";
  /* 1) strumenti, con la valuta vera di quotazione e i prezzi (servono anche a stimare le quote mancanti) */
  const ids = pos.map(p => p.isin || p.simbolo);
  const q = pos.map((p, i) => [p, ids[i]]);
  await Promise.all([0, 1, 2].map(async () => { while (q.length) { const [p, id] = q.shift();
    if (!PM.px[id]) { const j = await getJSON(`/api/prices?symbol=${encodeURIComponent(p.simbolo)}&v=6`); PM.px[id] = j && !j.error && j.points ? j : { error: (j && j.error) || "prezzi non disponibili" }; }
    if (!db.strumenti[id]) db.strumenti[id] = { nome: p.nome || p.ticker || p.simbolo, ticker: p.ticker || null, isin: p.isin || null, simbolo: p.simbolo, valuta: (PM.px[id] && PM.px[id].currency) || p.currency || "EUR", classe: null }; } }));
  await pmFx(false);
  const eurPx = (id, day) => { const j = PM.px[id], s = db.strumenti[id]; if (!j || !j.points) return NaN; const st = P.lgSteps(j.points.concat(j.recent || [])), n = Math.round(Date.parse(day + "T00:00:00Z") / 864e5), r = st.at(n) || (st.n ? st.at(st.first) : null); if (!r) return NaN;
    const c = s.valuta === "GBX" ? "GBP" : s.valuta, k = s.valuta === "GBX" ? 100 : 1; if (!c || c === "EUR") return r[1] / k; const fs = P.lgSteps(PM.fx[c]), f = fs.at(n) || (fs.n ? fs.at(fs.first) : null); return f ? r[1] / k / f[1] : NaN; };
  /* 2) operazioni: dai movimenti se ci sono, altrimenti la situazione di oggi */
  const ops = [], seen = new Map(), have = new Set(db.operazioni.filter(o => o.imp).map(o => o.imp));
  let est = 0, skipped = 0, dup = 0;
  const add = (o, base) => { const n = (seen.get(base) || 0) + 1; seen.set(base, n); const imp = `${base}#${n}`; if (have.has(imp)) { dup++; return; } ops.push({ id: newId(), ...o, origine: "file", file: fileName, imp }); };
  const rows = S.tx && S.tx.rows && S.tx.rows.length ? S.tx.rows : null, bondRows = [];
  /* movimenti in altre valute (export dei broker): l'operazione resta nella sua valuta, il registro la converte con il cambio BCE */
  for (const c of [...new Set((rows || []).map(x => x.ccy === "GBX" ? "GBP" : x.ccy).filter(c => c && c !== "EUR"))]) if (!PM.fx[c] || !PM.fx[c].length) { const j = await getJSON(`/api/fx?ccy=${c}`); PM.fx[c] = j && j.points ? j.points : []; }
  const toEurRow = (x, a) => { if (!x.ccy) return a; const c = x.ccy === "GBX" ? "GBP" : x.ccy, k = x.ccy === "GBX" ? 100 : 1, fs = P.lgSteps(PM.fx[c]), n = Math.round(Date.parse(isoOf(x.d) + "T00:00:00Z") / 864e5), f = fs.at(n) || (fs.n ? fs.at(fs.first) : null); return f ? a / k / f[1] : NaN; };
  if (rows) {
    const akas = pos.map(p => new Set([p.nome, p.ticker, p.isin, p.simbolo, p.simboloHint, ...(p.alt || [])].filter(Boolean).map(keyOf)));
    const names = pos.map(p => p.ticker || p.nome);
    for (const x of rows) {
      let i = -1; for (const v of [x.ticker, ...(x.alias || [])]) { i = akas.findIndex(s => s.has(keyOf(v))); if (i >= 0) break; }
      if (i < 0) i = txMatch(x.ticker, names); if (i < 0) { bondRows.push(x); continue; }
      const id = ids[i], data = isoOf(x.d), amt = Math.abs(x.amount), base = `${data}|${id}|${Math.round(x.amount * 100)}`;
      if (x.amount < 0 && /divid|cedol|coupon|interess/i.test(x.type || "")) { add({ data, tipo: "dividendo", strumento: id, importo: amt, valuta: x.ccy || "EUR" }, base); continue; }
      let qta = x.qty, stima = false; if (!(qta > 0)) { const pe = eurPx(id, data), ae = toEurRow(x, amt); if (!(pe > 0) || !(ae > 0)) { skipped++; continue; } qta = ae / pe; stima = true; est++; }
      add({ data, tipo: x.amount > 0 ? "acquisto" : "vendita", strumento: id, quantita: qta, prezzo: amt / qta, valuta: x.ccy || "EUR", ...(stima ? { stima: true } : {}) }, base);
    }
  } else {
    const today = pmToday();
    pos.forEach((p, i) => { const id = ids[i]; let qta = +p.quantita; const val = +p.valore;
      if (!(qta > 0)) { const pe = eurPx(id, today); if (!(val > 0) || !(pe > 0)) { skipped++; return; } qta = val / pe; est++; }
      const prezzo = val > 0 ? val / qta : eurPx(id, today); if (!(prezzo > 0)) { skipped++; return; }
      add({ data: today, tipo: "acquisto", strumento: id, quantita: qta, prezzo, valuta: "EUR", posizioneDiOggi: true, ...(p.quantita > 0 ? {} : { stima: true }) }, `${today}|${id}|pos`); });
  }
  /* 3) BTP e obbligazioni: nominale e prezzo su 100, cedole tra i proventi, prezzo di oggi dal file */
  const bp = fileBonds(), today = pmToday(), bkey = v => keyOf(v).replace(/\s+/g, " ");
  const bonds = new Map(), others = new Map();
  bp.forEach(p => bonds.set(p.isin || bkey(p.nome), { nome: p.nome, isin: p.isin || null, pos: p, rows: [] }));
  for (const x of bondRows) {
    const isin = (x.alias || []).concat(x.ticker).map(v => (String(v).toUpperCase().match(/\b[A-Z]{2}[A-Z0-9]{9}\d\b/) || [])[0]).find(Boolean) || null;
    /* è un'obbligazione solo se il nome lo dice (BTP, cedola, scadenza) o l'ISIN è da titolo di Stato italiano */
    const isBond = !!bondInfo(x.ticker) || /^IT000[45]/.test(isin || "") || bonds.has(isin || bkey(x.ticker));
    if (!isBond) { const k = isin || bkey(x.ticker); if (!others.has(k)) others.set(k, { nome: x.ticker, isin, rows: [] }); others.get(k).rows.push(x); continue; }
    const k = isin || bkey(x.ticker); if (!bonds.has(k)) bonds.set(k, { nome: x.ticker, isin, pos: null, rows: [] }); bonds.get(k).rows.push(x);
  }
  /* altri titoli dei movimenti senza posizione aperta (azioni comprate e rivendute): entrano chiusi, con il guadagno realizzato */
  for (const [k, O] of others) {
    if (!O.rows.every(x => x.qty > 0 || (x.amount < 0 && /divid|cedol|coupon/i.test(x.type || "")))) { skipped += O.rows.length; continue; }
    const id = O.isin || "x-" + k.replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    if (!db.strumenti[id]) db.strumenti[id] = { nome: O.nome, isin: O.isin, valuta: "EUR", classe: null };
    for (const x of O.rows) { const data = isoOf(x.d), amt = Math.abs(x.amount), base = `${data}|${id}|${Math.round(x.amount * 100)}`;
      if (x.amount < 0 && /divid|cedol|coupon/i.test(x.type || "")) add({ data, tipo: "dividendo", strumento: id, importo: amt, valuta: x.ccy || "EUR" }, base);
      else add({ data, tipo: x.amount > 0 ? "acquisto" : "vendita", strumento: id, quantita: x.qty, prezzo: amt / x.qty, valuta: x.ccy || "EUR" }, base); }
  }
  for (const [k, B] of bonds) {
    /* cedola e scadenza dal nome; se il nome non le dice, dalla stima del laboratorio (OpenFIGI con l'ISIN) */
    const id = B.isin || "b-" + k.replace(/[^a-z0-9]+/g, "-").slice(0, 40), b = bondInfo(B.nome), est = S.portfolio && (S.portfolio.positions || []).find(q => q.stima && ((B.isin && q.isin === B.isin) || q.nome === B.nome)), es = est && est.stima;
    if (!db.strumenti[id]) db.strumenti[id] = { nome: B.nome, isin: B.isin, valuta: "EUR", per100: true, classe: "Obbligazioni", cedola: b && b.cpn != null ? b.cpn : es ? es.cedola : null, scadenza: b && b.mat ? b.mat.toISOString().slice(0, 10) : es ? es.scadenza : null, freq: 2 };
    db.strumenti[id].governativo = isGovt(db.strumenti[id]);
    let held = 0;
    if (B.rows.length) {
      for (const x of B.rows.slice().sort((a, c) => a.d - c.d)) {
        const data = isoOf(x.d), amt = Math.abs(x.amount), base = `${data}|${id}|${Math.round(x.amount * 100)}`;
        if (x.amount < 0 && /divid|cedol|coupon|interess/i.test(x.type || "")) { add({ data, tipo: "cedola", strumento: id, importo: amt, valuta: "EUR" }, base); continue; }
        const q = x.qty > 0 ? x.qty : x.amount < 0 ? held : NaN; if (!(q > 0)) { skipped++; continue; }
        add({ data, tipo: x.amount > 0 ? "acquisto" : "vendita", strumento: id, quantita: q, prezzo: amt / q * 100, valuta: "EUR" }, base);
        held += x.amount > 0 ? q : -q;
      }
    } else if (B.pos) {
      const q = +B.pos.quantita, px = B.pos.per100 ? +B.pos.prezzo : (+B.pos.valore > 0 && q > 0 ? B.pos.valore / q * 100 : NaN);
      if (q > 0 && px > 0) { add({ data: today, tipo: "acquisto", strumento: id, quantita: q, prezzo: px, valuta: "EUR", posizioneDiOggi: true }, `${today}|${id}|pos`); held = q; } else skipped++;
    }
    /* il prezzo di oggi scritto nel file (su 100), da un foglio delle posizioni; se è il prezzo dell'ultimo movimento (ha la sua data) c'è già nell'acquisto */
    if (B.pos && B.pos.per100 && +B.pos.prezzo > 0 && B.rows.length && !B.pos.data) add({ data: today, tipo: "valutazione", strumento: id, prezzo: +B.pos.prezzo }, `${today}|${id}|px|${B.pos.prezzo}`);
  }
  db.operazioni.push(...ops); if (ops.length && !pmSave()) return { error: "salvataggio non riuscito" };
  return { nuove: ops.length, doppie: dup, scartate: skipped, stimate: est, movimenti: !!rows, file: fileName };
}
function pmOfferRender() {
  const el = $("#pmOffer"); if (!el) return;
  if (!fileOk()) { el.hidden = true; return; }
  if (PM.pending) { PM.pending = false; pmImport(); return; }
  el.hidden = false;
  /* si ridisegna solo se cambia: il laboratorio chiama questa funzione più volte, e un ridisegno a metà clic farebbe perdere il clic */
  const html = `<div><b>Tieni questo portafoglio nel tuo patrimonio</b><span>Lo ritrovi ogni giorno aggiornato, senza ricaricare il file${S.tx && S.tx.rows ? `: ${S.tx.rows.length} movimenti` : ""}.</span></div><button type="button" class="btn lime" id="pmOfferBtn">Metti nel mio patrimonio</button>`;
  if (el.dataset.h !== html || !el.querySelector("#pmOfferBtn")) { el.innerHTML = html; el.dataset.h = html; }
}
async function pmImport() {
  const el = $("#pmOffer"); if (el) { el.hidden = false; el.innerHTML = `<div><b>Metto il portafoglio nel tuo patrimonio…</b><span>scarico i prezzi di ogni strumento</span></div>`; el.dataset.h = ""; }
  const r = await pmFromFile();
  if (r.error) { if (el) el.innerHTML = `<div><b>Non ci sono riuscito</b><span>${esc(r.error)}</span></div>`; return; }
  trackOnce("feature", "patrimonio_da_file", { name: "patrimonio_da_file" });
  const parts = [r.nuove ? `${r.nuove} ${r.nuove === 1 ? "operazione aggiunta" : "operazioni aggiunte"} da «${r.file}»` : `Niente di nuovo da «${r.file}»`];
  if (r.doppie) parts.push(`${r.doppie} già presenti, non ripetute`);
  if (r.stimate) parts.push(`${r.stimate} con le quote stimate dal prezzo di mercato del giorno`);
  if (r.scartate) parts.push(`${r.scartate} non abbinate a uno strumento`);
  if (!r.movimenti && r.nuove) parts.push("dal file conosco solo la situazione di oggi: il guadagno parte da adesso");
  if (el) { el.hidden = false; el.dataset.h = ""; el.innerHTML = `<div><b>✓ È nel tuo patrimonio</b><span>Se il file cambia, ricaricalo e riprendi solo le operazioni nuove: quelle già presenti non vengono ripetute.</span></div><span class="pm-offer-b"><button type="button" class="btn" data-go="patrimonio">Apri il patrimonio</button><button type="button" class="btn" id="pmOfferBtn">Riprendi dal file</button></span>`; }
  PM.beniFile = pmFindBeni(S.fileSheets || []);
  PM.sel = null; go("patrimonio"); pmMsg(parts.join(" · ") + ".", r.nuove ? "ok" : "", "#pmTopMsg"); pmBeniOffer();
  pmRefresh(false);
}

function pmDownload() {
  if (!pmHas()) return false;
  const blob = new Blob([JSON.stringify({ ...PM.db, esportato: new Date().toISOString(), app: "Quanta Portfolio" }, null, 1)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `patrimonio-quanta-portfolio-${pmToday()}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); return true;
}
/* ---------- I tuoi obiettivi: quanto ne hai già, che probabilità hai, quanto versare in più ----------
   Gli obiettivi sono gli stessi delle Simulazioni (salvati nel browser, pos-obiettivi-v1). La probabilità si calcola sugli strumenti
   quotati che possiedi oggi: i loro rendimenti mensili passati, in euro, con i pesi di oggi (storia ricostruita), ricampionati
   come nelle Simulazioni. Il versamento mensile parte dai piani di accumulo (o dalla media degli ultimi 12 mesi) e si può cambiare. */
const PM_VERSA_KEY = "pos-pm-versa-v1", PM_OB_KEY = "pos-obiettivi-v1";
const PM_OB_ESEMPI = [["Casa", 40000, 5], ["Studi dei figli", 30000, 12], ["Pensione integrativa", 150000, 25]];
function pmGoalReturns(R) {
  const open = R.posizioni.filter(p => p.aperta && p.valore > 0 && PM.px[p.id] && PM.px[p.id].points && PM.px[p.id].points.length > 2), tot = open.reduce((a, p) => a + p.valore, 0);
  if (!open.length || !(tot > 0)) return null;
  const fxMap = c => { const m = new Map(); (PM.fx[c] || []).forEach(x => m.set(String(x.p || x.d).slice(0, 7), +x.v)); return m; };
  const ser = open.map(p => { const s = PM.db.strumenti[p.id], j = PM.px[p.id], c0 = String(j.currency || s.valuta || "EUR").toUpperCase(), c = c0 === "GBX" ? "GBP" : c0, k = c0 === "GBX" ? 100 : 1, fx = c === "EUR" ? null : fxMap(c), m = new Map();
    j.points.forEach(x => { const ym = String(x.d).slice(0, 7), r = fx ? fx.get(ym) : 1; if (+x.v > 0 && r > 0) m.set(ym, +x.v / k / r); }); return { w: p.valore / tot, m }; });
  const months = [...new Set(ser.flatMap(s => [...s.m.keys()]))].sort(), ret = [], mesi = [];
  for (let i = 1; i < months.length; i++) { const a = months[i - 1], b = months[i]; let sw = 0, sr = 0;
    for (const s of ser) { const pa = s.m.get(a), pb = s.m.get(b); if (pa > 0 && pb > 0) { sw += s.w; sr += s.w * (pb / pa - 1); } }
    if (sw >= 0.6) { ret.push(sr / sw); mesi.push(b); } }
  return { ret: ret.slice(-240), mesi: mesi.slice(-240), base: tot, n: open.length };
}
function pmVersa(R) {
  try { const v = localStorage.getItem(PM_VERSA_KEY); if (v != null && v !== "" && isFinite(+v)) return { v: +v, da: "tu" }; } catch {}
  const pac = (PM.db.pac || []).reduce((a, pl) => a + (+pl.importo || 0), 0); if (pac > 0) return { v: Math.round(pac), da: "pac" };
  const from = new Date(Date.parse(pmToday()) - 365 * 864e5).toISOString().slice(0, 10), gone = new Set(PM.db.operazioni.filter(o => o.tipo === "annulla").map(o => String(o.rif)));
  let net = 0; for (const o of PM.db.operazioni) { if (gone.has(String(o.id)) || o.data < from || o.posizioneDiOggi) continue; const s = PM.db.strumenti[o.strumento] || {}; if (s.manuale) continue;
    const imp = (+o.quantita || 0) * (+o.prezzo || 0) * (s.per100 ? 0.01 : 1); if (o.tipo === "acquisto") net += imp; else if (o.tipo === "vendita") net -= imp; }
  return { v: Math.max(0, Math.round(net / 12 / 10) * 10), da: "media" };
}
const pmObSave = L => { try { localStorage.setItem(PM_OB_KEY, JSON.stringify(L)); } catch {} if (!S.svSaved) S.mcOb = L.map(g => ({ ...g })); };
const pmObValid = g => +g.importo > 0 && Math.round(+g.anno) >= 1 && Math.round(+g.anno) <= 60;
let pmGoalT = null; const PM_NEED = new Map();
function pmGoals(R) {
  const box = $("#pmGoalBox"); if (!box) return;
  const G = pmGoalReturns(R); if (!G || G.ret.length < 24) { box.hidden = true; PM.goal = null; return; }
  box.hidden = false;
  const L = PM.obEdit || obLoad(), V = pmVersa(R), valid = L.map((g, i) => ({ ...g, nome: g.nome || `Obiettivo ${i + 1}`, id: i })).filter(pmObValid);
  const years = Math.max(1, ...valid.map(g => Math.round(+g.anno)));
  const opts = { ret: G.ret, f: 12, years, initial: G.base, monthly: V.v, infl: 0.02, costs: 0, method: "boot", n: 2000, seed: 20261118, obiettivi: valid };
  const MC = valid.length ? P.monteCarlo(opts) : null; PM.goal = { opts, MC, G, V };
  $("#pmGoalSub").textContent = `con ${fmtEur(G.base)} investiti oggi e ${fmtEur(V.v)} al mese${V.da === "pac" ? " (i tuoi PAC)" : V.da === "media" ? " (media degli ultimi 12 mesi)" : ""}`;
  const col = p => p >= .8 ? "good" : p >= .5 ? "warn" : "bad";
  const row = (g, i) => { const o = MC && MC.obiettivi.find(x => x.id === i), have = Math.min(1, G.base / (+g.importo || 1)), nk = JSON.stringify([opts.initial, opts.monthly, opts.ret.length, valid, i]);
    return `<div class="pmg-row" data-pmg="${i}"><div class="pmg-n"><input value="${esc(g.nome || "")}" placeholder="Obiettivo ${i + 1}" maxlength="40" aria-label="Nome dell'obiettivo ${i + 1}" data-pmgf="nome">
        <span><label>€ <input type="number" inputmode="decimal" min="0" step="1000" value="${+g.importo || ""}" aria-label="Importo in euro di oggi" data-pmgf="importo"></label><label>tra <input type="number" min="1" max="60" step="1" value="${+g.anno || ""}" aria-label="Tra quanti anni" data-pmgf="anno"> anni</label></span></div>
      <div class="pmg-have"><span class="pmg-bar"><i style="width:${Math.round(have * 100)}%"></i></span><small>${pmObValid(g) ? (have >= 1 ? "l'importo lo hai già oggi" : have < .01 ? "ne hai meno dell'1%" : `ne hai già il ${fmtPct(have, 0)}`) : "scrivi importo e anni"}</small></div>
      <div class="pmg-p">${o ? `<b class="${col(o.prob)}">${fmtPct(o.prob, 0)}</b><small>${o.prob >= .8 ? "di arrivarci" : `<span data-pmneed="${esc(nk)}" data-id="${i}">${PM_NEED.has(nk) ? pmNeedTxt(PM_NEED.get(nk)) : "calcolo quanto versare…"}</span>`}</small>` : ""}</div>
      <button type="button" class="mcg-x" data-pmgdel="${i}" aria-label="Togli l'obiettivo ${i + 1}">×</button></div>`; };
  $("#pmGoals").innerHTML = `${L.length ? `<div class="pmg-list">${L.map(row).join("")}</div>` : `<p class="mcg-empty">Casa, studi dei figli, pensione: scrivi i tuoi obiettivi e vedi quanto ne hai già, che probabilità hai di arrivarci con quello che versi e quanto mettere da parte in più.</p>`}
    <div class="mcg-foot">${L.length < 8 ? `<button type="button" class="btn sm" data-pmgadd="1">+ Aggiungi un obiettivo</button>` : ""}${L.length ? "" : PM_OB_ESEMPI.map(([n, a, y], k) => `<button type="button" class="chipbtn ghost" data-pmgex="${k}">${esc(n)} · ${fmtEur(a)} tra ${y} anni</button>`).join("")}
      <label class="pmg-versa">Verso al mese <input type="number" inputmode="decimal" min="0" step="50" value="${V.v}" id="pmVersa" aria-label="Quanto versi al mese"> €</label>${MC && valid.length > 1 && Number.isFinite(MC.probTutti) ? `<span class="mcg-all">Tutti insieme: <b>${fmtPct(MC.probTutti, 0)}</b></span>` : ""}</div>
    ${L.length ? `<p class="caption">Probabilità su ${fmtN(opts.n, 0).replace(",00", "")} futuri costruiti con i rendimenti mensili passati ${G.n === 1 ? "del tuo strumento quotato" : `dei tuoi ${G.n} strumenti quotati, con i pesi di oggi`} (${G.ret.length} mesi), inflazione 2% l'anno. Gli importi sono in euro di oggi; quando arriva l'anno, se basta, l'importo esce. Case e beni senza quotazione restano fuori. Stime sul passato, non garanzie.</p>` : ""}`;
  pmNeeds();
}
const pmNeedTxt = v => !Number.isFinite(v) || v <= 0 ? "" : `+${fmtEur(v)} al mese per arrivarci 8 volte su 10`;
function pmNeeds() { clearTimeout(pmGoalT); pmGoalT = setTimeout(async () => {
  for (const el of [...document.querySelectorAll("#pmGoals [data-pmneed]")]) { const k = el.dataset.pmneed, id = +el.dataset.id;
    if (!PM_NEED.has(k)) { await new Promise(r => setTimeout(r, 0)); if (!PM.goal) return; PM_NEED.set(k, P.mcVersamentoPer(PM.goal.opts, id, .8)); }
    const cur = document.querySelector(`#pmGoals [data-pmneed="${CSS.escape(k)}"]`); if (cur) cur.textContent = pmNeedTxt(PM_NEED.get(k)) || "di arrivarci"; } }, 400); }
let pmGoalIn = null;
function pmGoalsFromDom() { const L = [...document.querySelectorAll("#pmGoals .pmg-row")].map(r => ({ nome: r.querySelector('[data-pmgf="nome"]').value.trim().slice(0, 40), importo: parseFloat(r.querySelector('[data-pmgf="importo"]').value) || 0, anno: Math.round(parseFloat(r.querySelector('[data-pmgf="anno"]').value)) || 0 })); pmObSave(L); return L; }
/* mentre si scrive si aggiornano solo i numeri (il cursore resta nel campo); il disegno completo al cambio */
document.addEventListener("input", e => { if (!e.target.closest("#pmGoals")) return; clearTimeout(pmGoalIn); pmGoalIn = setTimeout(() => {
  if (e.target.id === "pmVersa") { const v = e.target.value; try { if (v === "") localStorage.removeItem(PM_VERSA_KEY); else localStorage.setItem(PM_VERSA_KEY, String(Math.max(0, +v))); } catch {} }
  else pmGoalsFromDom();
  const a = document.activeElement, sel = a && a.closest && a.closest("#pmGoals") ? (a.id ? "#" + a.id : `[data-pmg="${a.closest(".pmg-row") ? a.closest(".pmg-row").dataset.pmg : ""}"] [data-pmgf="${a.dataset.pmgf}"]`) : null, pos = a && a.selectionStart;
  pmGoals(PM.R || pmCalc()); if (sel) { const n = document.querySelector("#pmGoals " + sel); if (n) { n.focus(); try { if (pos != null) n.setSelectionRange(pos, pos); } catch {} } } }, 450); });
document.addEventListener("click", e => { const el = e.target.closest("#pmGoals"); if (!el) return;
  if (e.target.closest("[data-pmgadd]")) { const L = pmGoalsFromDom(); L.push({ nome: "", importo: 0, anno: 5 }); pmObSave(L); pmGoals(PM.R || pmCalc()); const ins = document.querySelectorAll('#pmGoals [data-pmgf="nome"]'); if (ins.length) ins[ins.length - 1].focus(); return; }
  const x = e.target.closest("[data-pmgex]"); if (x) { const [n, a, y] = PM_OB_ESEMPI[+x.dataset.pmgex], L = obLoad(); L.push({ nome: n, importo: a, anno: y }); pmObSave(L); pmGoals(PM.R || pmCalc()); return; }
  const d = e.target.closest("[data-pmgdel]"); if (d) { const L = pmGoalsFromDom(); L.splice(+d.dataset.pmgdel, 1); pmObSave(L); pmGoals(PM.R || pmCalc()); } });

/* ---------- Se arriva una crisi: quanto si è mosso in passato il patrimonio di oggi, in euro ----------
   Stessa storia ricostruita degli obiettivi (titoli quotati di oggi, pesi di oggi). Anno peggiore e «1 anno su 20» sui 12 mesi mobili,
   calo massimo e tempo per recuperarlo, crisi vere coperte dai dati (POS.CRISES). Non è una previsione. */
const ymIt = m => { const [y, mo] = m.split("-"); return `${["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"][+mo - 1]} ${y}`; };
function pmRiskCalc(G) {
  const r = G.ret, m = G.mesi, n = r.length; if (n < 36) return null;
  const y12 = []; for (let i = 11; i < n; i++) { let g = 1; for (let k = i - 11; k <= i; k++) g *= 1 + r[k]; y12.push({ v: g - 1, fino: m[i] }); }
  const worst = y12.reduce((a, b) => (b.v < a.v ? b : a)), so = y12.map(x => x.v).sort((a, b) => a - b), p5 = so[Math.floor(so.length * 0.05)];
  let idx = 1, peak = 1, pk = -1, dd = 0, ddPk = -1, ddTr = -1; const I = [];
  for (let i = 0; i < n; i++) { idx *= 1 + r[i]; I.push(idx); if (idx >= peak) { peak = idx; pk = i; } const d = idx / peak - 1; if (d < dd) { dd = d; ddPk = pk; ddTr = i; } }
  let rec = null; if (ddTr >= 0) { const lvl = ddPk >= 0 ? I[ddPk] : 1; for (let i = ddTr + 1; i < n; i++) if (I[i] >= lvl) { rec = i - ddTr; break; } }
  const crisi = P.CRISES.map(c => { const ks = m.map((x, i) => [x, i]).filter(([x]) => x >= c.m0 && x <= c.m1); const want = (+c.m1.slice(0, 4) - +c.m0.slice(0, 4)) * 12 + (+c.m1.slice(5) - +c.m0.slice(5)) + 1;
    if (ks.length < want) return null; const g = ks.reduce((a, [, i]) => a * (1 + r[i]), 1) - 1; return { nome: c.name, v: g, m0: c.m0, m1: c.m1 }; }).filter(Boolean);
  return { worst, p5, dd, ddDa: ddPk >= 0 ? m[ddPk] : m[0], ddA: m[ddTr] || null, rec, crisi, anni: n / 12, da: m[0] };
}
function pmRisk(R) {
  const box = $("#pmRiskBox"); if (!box) return;
  const G = pmGoalReturns(R), C = G && pmRiskCalc(G); if (!C) { box.hidden = true; return; }
  box.hidden = false; const b = G.base, e = v => (v < 0 ? "−" : "+") + fmtEur(Math.abs(v)), pc = v => (v < 0 ? "−" : v > 0 ? "+" : "") + fmtPct(Math.abs(v), 0);
  $("#pmRiskSub").textContent = `sui ${fmtEur(b)} che hai oggi in titoli quotati`;
  $("#pmRisk").innerHTML = `<div class="pm-rk">
      <div><span>In un anno brutto (1 su 20)</span><b class="${C.p5 < 0 ? "dn" : ""}">${e(b * C.p5)}</b><small>${pc(C.p5)} in 12 mesi: capita circa un anno ogni venti</small></div>
      <div><span>L'anno peggiore</span><b class="dn">${e(b * C.worst.v)}</b><small>${pc(C.worst.v)} nei 12 mesi fino a ${ymIt(C.worst.fino)}</small></div>
      <div><span>Il calo più grande</span><b class="dn">${e(b * C.dd)}</b><small>${pc(C.dd)} da ${ymIt(C.ddDa)} a ${C.ddA ? ymIt(C.ddA) : "—"}${C.rec != null ? `, recuperato in ${C.rec} ${C.rec === 1 ? "mese" : "mesi"}` : ", non ancora recuperato"}</small></div>
    </div>
    ${C.crisi.length ? `<ul class="pm-rk-c">${C.crisi.map(c => `<li><span>${esc(c.nome)}<small>${ymIt(c.m0)} – ${ymIt(c.m1)}</small></span><b class="${c.v < 0 ? "dn" : "up"}">${e(b * c.v)}</b><em>${pc(c.v)}</em></li>`).join("")}</ul>` : ""}
    <p class="caption">Come si sarebbero mossi i titoli che hai oggi, con i pesi di oggi, negli ultimi ${fmtN(C.anni, 0)} anni di prezzi (dal ${ymIt(C.da)}). Case e beni senza quotazione non sono inclusi. Non è una previsione: mostra quanto si è mosso in passato, per capire se ti va bene vederlo succedere.</p>`;
}

/* ---------- per Quanta: il patrimonio in breve (numeri già calcolati e scritti, l'IA non fa conti)
   e le operazioni dette a parole, che si salvano SOLO quando l'utente preme «Conferma» ---------- */
function pmQuantaSummary() {
  if (!pmHas()) return { vuoto: true, nota: "Il patrimonio è vuoto: si crea dalla pagina Patrimonio (Aggiungi) o portando i movimenti di un file della banca." };
  const R = PM.R || pmCalc(), T = R.totale, F = PM.fisc || P.fisco(R, pmFiscStrumenti(), { oggi: pmToday() }), inc = PM.inc || [], db = PM.db;
  const G = pmGoalReturns(R), C = G && pmRiskCalc(G), zTot = F.zainetto.reduce((a, z) => a + z.residuo, 0);
  return {
    valore_oggi: fmtEur(T.valore), versato_netto: fmtEur(T.versato), guadagno: sEur(T.guadagno), guadagno_sul_versato: sPct(T.guadagnoPct), rendimento_annuo_tir: sPct(T.tir),
    rendimento_ponderato_nel_tempo: sPct(T.twr), dal: dIt(R.dal), calo_massimo: sPct(T.maxDD), proventi_incassati: fmtEur(T.proventi), prezzi: PM.loading ? "in aggiornamento" : "di fine giornata",
    posizioni: R.posizioni.filter(p => p.aperta).map(p => { const s = db.strumenti[p.id] || {}; return { nome: s.nome, isin: s.isin || null, ticker: s.ticker || null, quantita: s.per100 ? `${fmtEur(p.qta)} nominali` : fmtN(p.qta, p.qta % 1 ? 3 : 0),
      prezzo: Number.isFinite(p.prezzo) ? (s.per100 ? `${fmtN(p.prezzo, 2)} su 100` : fmtN(p.prezzo, 2)) : null, valore: fmtEur(p.valore), peso: fmtPct(p.peso, 1), guadagno: sEur(p.guadagno), tir: sPct(p.tir),
      tipo: s.manuale ? "bene senza quotazione (stima dell'utente)" : s.per100 ? (PM.px[p.id] && PM.px[p.id].stima ? "titolo di Stato, prezzo stimato dalla curva della Banca d'Italia" : "obbligazione") : "titolo quotato" }; }),
    chiuse: R.posizioni.filter(p => !p.aperta).map(p => ({ nome: (db.strumenti[p.id] || {}).nome, guadagno_realizzato: sEur(p.realizzato + p.proventi) })),
    tasse: { bollo_annuo_stimato: fmtEur(F.bollo.annuo), imposte_se_vendessi_tutto_oggi: fmtEur(F.latente.imposta), minusvalenze_da_recuperare: zTot > 0.5 ? fmtEur(zTot) : "nessuna",
      prima_scadenza_minusvalenze: F.zainetto.length ? dIt(F.zainetto.slice().sort((a, b) => a.scadenza < b.scadenza ? -1 : 1)[0].scadenza) : null },
    proventi_prossimi_12_mesi_netti: fmtEur(inc.reduce((a, x) => a + (x.netto || 0), 0)), prossimi_proventi: inc.slice(0, 4).map(x => ({ data: dIt(x.d), strumento: x.nome, tipo: x.tipo, netto: fmtEur(x.netto), certo: !!x.certo })),
    piani_di_accumulo: (db.pac || []).map(pl => ({ strumento: (db.strumenti[pl.strumento] || {}).nome, importo: fmtEur(+pl.importo), giorno_del_mese: pl.giorno })),
    obiettivi: PM.goal && PM.goal.MC ? PM.goal.MC.obiettivi.map(o => ({ nome: o.nome, importo_euro_di_oggi: fmtEur(o.importo), tra_anni: o.anno, probabilita: fmtPct(o.prob, 0) })) : [],
    versamento_mensile_usato_per_gli_obiettivi: PM.goal ? fmtEur(PM.goal.V.v) : null,
    se_arriva_una_crisi: C ? { base: fmtEur(G.base), anno_brutto_1_su_20: sEur(G.base * C.p5), anno_peggiore: sEur(G.base * C.worst.v), calo_massimo: sEur(G.base * C.dd), crisi: C.crisi.map(c => ({ nome: c.nome, effetto: sEur(G.base * c.v) })) } : null
  };
}
/* operazione proposta da Quanta e confermata dall'utente: { tipo, strumento, quantita, prezzo, importo, data, spese } */
async function pmQuantaOp(op) {
  const db = pmDb(), data = /^\d{4}-\d{2}-\d{2}$/.test(op.data || "") ? op.data : pmToday(), q = +op.quantita, px = +op.prezzo, imp = +op.importo, spese = Math.max(0, +op.spese || 0);
  if (data > pmToday()) return { error: "la data è nel futuro" };
  const key = v => String(v || "").trim().toUpperCase();
  const own = () => { const t = key(op.strumento); return Object.entries(db.strumenti).find(([id, s]) => !s.manuale && [s.nome, s.ticker, s.isin, s.simbolo, id].some(x => x && (key(x) === t || (t.length >= 4 && key(x).includes(t))))); };
  if (op.tipo === "acquisto") {
    if (!(q > 0) || !(px > 0)) return { error: "servono quante quote e il prezzo per quota" };
    const o = own(); let id = o && o[0];
    if (!id) { const r = await pmResolve(op.strumento); if (!r || r.error) return { error: r ? `non riconosco «${op.strumento}»: ${r.error}` : "manca lo strumento" };
      id = r.id; if (!db.strumenti[id]) db.strumenti[id] = { nome: r.nome, ticker: r.ticker || null, isin: r.isin || null, simbolo: r.simbolo, valuta: r.valuta || "EUR", classe: r.classe || null }; if (r.px && !PM.px[id]) PM.px[id] = r.px; }
    await pmFx(false);
    if (!pmAdd({ data, tipo: "acquisto", strumento: id, quantita: q, prezzo: px, spese, origine: "quanta" })) return { error: "non riesco a salvare in questo browser" };
    pmRefresh(false); return { ok: true, testo: `Salvato nel patrimonio: ${fmtN(q, q % 1 ? 3 : 0)} quote di ${db.strumenti[id].nome} a ${fmtN(px, 2)} il ${dIt(data)}.` };
  }
  const o = own(); if (!o) return { error: `nel patrimonio non trovo «${op.strumento}»` };
  const [id, s] = o, R = PM.R || pmCalc(), p = R.posizioni.find(x => x.id === id);
  if (op.tipo === "vendita") {
    if (!(q > 0) || !(px > 0)) return { error: "servono quante quote hai venduto e il prezzo" };
    if (!p || q > p.qta + 1e-9) return { error: `ne possiedi ${p ? fmtN(p.qta, p.qta % 1 ? 3 : 0) : 0}: non puoi venderne ${fmtN(q, q % 1 ? 3 : 0)}` };
    if (!pmAdd({ data, tipo: "vendita", strumento: id, quantita: q, prezzo: px, spese, origine: "quanta" })) return { error: "non riesco a salvare in questo browser" };
    pmRefresh(false); return { ok: true, testo: `Salvata la vendita di ${fmtN(q, q % 1 ? 3 : 0)} quote di ${s.nome} a ${fmtN(px, 2)} il ${dIt(data)}.` };
  }
  if (op.tipo === "dividendo" || op.tipo === "cedola") {
    if (!(imp > 0)) return { error: "serve l'importo netto incassato" };
    if (!pmAdd({ data, tipo: op.tipo === "cedola" ? "cedola" : "dividendo", strumento: id, importo: imp, valuta: "EUR", origine: "quanta" })) return { error: "non riesco a salvare in questo browser" };
    pmRefresh(false); return { ok: true, testo: `Salvato un provento di ${fmtN(imp, 2)} € da ${s.nome} il ${dIt(data)}.` };
  }
  return { error: `operazione «${op.tipo}» non prevista` };
}

/* ---------- il patrimonio in Excel: da leggere (o da dare al commercialista), non da reimportare ----------
   Riepilogo, Posizioni, Operazioni, Andamento (fine mese), Proventi in arrivo, Tasse, Leggimi. Numeri veri con i formati € e %. */
async function pmExcel() {
  if (!pmHas()) return false;
  await loadXLSX().catch(() => {});
  if (!window.XLSX) { pmMsg("Il lettore Excel non si è caricato: controlla la connessione e riprova.", "err", "#pmTopMsg"); return false; }
  const db = PM.db, R = PM.R || pmCalc(), T = R.totale, F = PM.fisc || P.fisco(R, pmFiscStrumenti(), { oggi: pmToday() }), inc = PM.inc || [];
  const r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100, pc = v => v == null || !isFinite(v) ? null : Math.round(v * 10000) / 10000, dd = s => s ? new Date(s + "T12:00:00Z") : null;
  const tipoL = { acquisto: "Acquisto", vendita: "Vendita", dividendo: "Dividendo", cedola: "Cedola", valutazione: "Nuovo prezzo o stima", commissione: "Commissione", tassa: "Tassa", frazionamento: "Frazionamento" };
  const gone = new Set(db.operazioni.filter(o => o.tipo === "annulla").map(o => String(o.rif)));
  const cls = s => s.manuale ? (s.classe || "Bene senza quotazione") : s.per100 ? "Obbligazioni" : s.classe || "";
  const st = id => db.strumenti[id] || {};
  const incTot = inc.reduce((a, x) => a + (x.netto || 0), 0), zTot = F.zainetto.reduce((a, z) => a + z.residuo, 0);
  const riep = [["Voce", "Valore", "Nota"],
    ["Valore oggi", r2(T.valore), `al ${dIt(R.al)}`], ["Versato netto", r2(T.versato), "acquisti meno vendite, dividendi e cedole incassati"], ["Guadagno", r2(T.guadagno), "valore oggi meno versato netto"],
    ["Guadagno sul versato", pc(T.guadagnoPct), ""], ["Rendimento annuo (TIR)", pc(T.tir), "tiene conto di quando hai versato ogni euro"],
    ["Rendimento ponderato nel tempo", pc(T.twr), `dal ${dIt(R.dal)}, senza l'effetto dei versamenti`], ["…all'anno", pc(T.twrAnn), T.anni >= 1 ? "" : "meno di un anno: non annualizzato"],
    ["Calo massimo", pc(T.maxDD), "dal punto più alto al più basso, senza i versamenti"], ["Proventi incassati", r2(T.proventi), "dividendi e cedole registrati"], ["Spese e tasse pagate", r2(T.spese), "commissioni e imposte registrate"],
    ["Bollo stimato, anno in corso", r2(F.bollo.annuo), "0,2% del valore dei titoli"], ["Imposte se vendessi tutto oggi", r2(F.latente.imposta), "stima, vedi il foglio Tasse"],
    ["Minusvalenze da recuperare", r2(zTot), "lo «zainetto fiscale»"], ["Proventi in arrivo, prossimi 12 mesi (netti)", r2(incTot), "cedole certe e dividendi stimati"]];
  const pos = [["Strumento", "ISIN", "Ticker", "Classe", "Quote o nominale", "Prezzo", "Data del prezzo", "Fonte del prezzo", "Valore (€)", "Peso", "Costo (€)", "Prezzo medio", "Guadagno latente (€)", "Guadagno realizzato (€)", "Proventi (€)", "Guadagno totale (€)", "Rendimento annuo (TIR)", "Aperta"]];
  for (const p of R.posizioni) { const s = st(p.id), j = PM.px[p.id], fonte = p.prezzoFonte === "mercato" ? (j && j.stima ? "stima Banca d'Italia" : (j && j.source) || "mercato") : p.prezzoFonte === "operazione" ? (s.manuale ? "tua stima" : "tuo prezzo") : "";
    pos.push([s.nome || p.id, s.isin || "", s.ticker || "", cls(s), p.aperta ? (s.per100 ? r2(p.qta) : +p.qta.toFixed(6)) : 0, p.aperta && isFinite(p.prezzo) ? +(+p.prezzo).toFixed(4) : null, p.aperta ? dd(p.prezzoData) : null, p.aperta ? fonte : "",
      r2(p.valore), pc(p.peso), r2(p.costo), p.aperta && isFinite(p.pmc) ? +(s.per100 ? p.pmc * 100 : p.pmc).toFixed(4) : null, p.aperta ? r2(p.latente) : null, r2(p.realizzato), r2(p.proventi), r2(p.guadagno), pc(p.tir), p.aperta ? "sì" : "no"]); }
  const ops = [["Data", "Operazione", "Strumento", "ISIN", "Quantità o nominale", "Prezzo", "Importo", "Spese", "Valuta", "Cambio", "Da dove", "Annullata", "Nota"]];
  for (const o of db.operazioni.filter(o => o.tipo !== "annulla").slice().sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0))) {
    const s = st(o.strumento), q = +o.quantita, px = +o.prezzo, imp = (o.tipo === "acquisto" || o.tipo === "vendita") && q > 0 && px >= 0 ? q * px * (s.per100 ? 0.01 : 1) : +o.importo;
    ops.push([dd(o.data), tipoL[o.tipo] || o.tipo, s.nome || o.strumento || "", s.isin || "", q > 0 ? q : null, px > 0 ? px : null, isFinite(imp) ? r2(imp) : null, +o.spese ? r2(+o.spese) : null, o.valuta || s.valuta || "EUR", +o.cambio || null,
      o.origine === "file" ? "da file" : o.posizioneDiOggi ? "posizione di oggi" : "a mano", gone.has(String(o.id)) ? "sì" : "", o.nota || (o.stima ? "quote stimate" : "")]); }
  const and = [["Data", "Valore (€)", "Versato netto (€)", "Guadagno (€)", "Rendimento ponderato nel tempo"]], byM = new Map();
  R.serie.forEach(x => byM.set(x.d.slice(0, 7), x));
  for (const x of byM.values()) if (x.valore > 0 || x.versato > 0) and.push([dd(x.d), r2(x.valore), r2(x.versato), r2(x.valore - x.versato), pc(x.twr)]);
  const pro = [["Data", "Strumento", "Tipo", "Lordo (€)", "Netto (€)", "Certo o stimato"], ...inc.map(x => [dd(x.d), x.nome, x.tipo, r2(x.lordo), r2(x.netto), x.certo ? "certo" : "stima (ultimi 12 mesi ripetuti)"])];
  const tas = [["Strumento", "Categoria fiscale", "Valore (€)", "Costo (€)", "Guadagno o perdita (€)", "Imposta se vendessi oggi (€)"], ...F.latente.righe.map(r => [r.nome, P.FISCO_CAT_L[r.cat] || r.cat, r2(r.valore), r2(r.costo), r2(r.lat), r2(r.imposta)])];
  if (F.zainetto.length) { tas.push([], ["Minusvalenze da recuperare", "Nata nel", "Importo iniziale (€)", "Ancora da usare (€)", "Scade il"]); F.zainetto.forEach(z => tas.push([z.nome, z.anno, r2(z.iniziale), r2(z.residuo), dd(z.scadenza)])); }
  F.note.forEach(n => tas.push([], [n]));
  const leggi = [["Il mio patrimonio · Quanta Portfolio"], [`Esportato il ${new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}`], [],
    ["Riepilogo", "i numeri principali di oggi"], ["Posizioni", "ogni strumento con quote, prezzo, valore, guadagno e TIR (anche le posizioni chiuse)"], ["Operazioni", "tutte le operazioni, in ordine di data; quelle annullate restano segnate"],
    ["Andamento", "valore e versato a fine mese"], ["Proventi in arrivo", "cedole e dividendi dei prossimi 12 mesi"], ["Tasse", "imposte se vendessi oggi, per strumento, e minusvalenze da recuperare"], [],
    ["Prezzi", "fine giornata, indicativi; per i BTP a tasso fisso il prezzo è stimato dalla curva dei rendimenti della Banca d'Italia"], ["Tasse", "stime: le imposte vere le calcola la banca (regime amministrato) o il commercialista"], [],
    ["Per rimettere il patrimonio in un altro browser usa «Scarica la copia di sicurezza»: questo Excel serve da leggere, non da reimportare."], ["Strumento di analisi: non è un consiglio di investimento."]];
  const E = "#,##0.00 €", P2 = "0.0%", D = "dd/mm/yyyy", N4 = "#,##0.####";
  const wb = XLSX.utils.book_new(), sheet = (aoa, cols, fmt) => { const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }); ws["!cols"] = cols.map(w => ({ wch: w }));
    const rg = XLSX.utils.decode_range(ws["!ref"]); for (let r = 1; r <= rg.e.r; r++) for (const [c, z] of Object.entries(fmt)) { const cell = ws[XLSX.utils.encode_cell({ r, c: +c })]; if (cell && cell.t !== "s") cell.z = typeof z === "function" ? z(r) : z; }
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ r: 0, c: 0 }, { r: 0, c: rg.e.c }) }; return ws; };
  const pctRows = new Set([4, 5, 6, 7, 8]);
  XLSX.utils.book_append_sheet(wb, sheet(riep, [44, 16, 56], { 1: r => pctRows.has(r) ? P2 : E }), "Riepilogo");
  XLSX.utils.book_append_sheet(wb, sheet(pos, [34, 14, 9, 16, 14, 11, 12, 20, 13, 8, 13, 11, 14, 14, 12, 14, 12, 7], { 4: N4, 5: N4, 6: D, 8: E, 9: P2, 10: E, 11: N4, 12: E, 13: E, 14: E, 15: E, 16: P2 }), "Posizioni");
  XLSX.utils.book_append_sheet(wb, sheet(ops, [12, 20, 34, 14, 14, 11, 13, 10, 7, 8, 16, 9, 24], { 0: D, 4: N4, 5: N4, 6: E, 7: E }), "Operazioni");
  if (and.length > 1) XLSX.utils.book_append_sheet(wb, sheet(and, [12, 14, 16, 14, 14], { 0: D, 1: E, 2: E, 3: E, 4: P2 }), "Andamento");
  if (pro.length > 1) XLSX.utils.book_append_sheet(wb, sheet(pro, [12, 34, 11, 12, 12, 30], { 0: D, 3: E, 4: E }), "Proventi in arrivo");
  if (tas.length > 1) XLSX.utils.book_append_sheet(wb, sheet(tas, [34, 22, 14, 14, 18, 18], { 2: E, 3: E, 4: E, 5: E }), "Tasse");
  const wl = XLSX.utils.aoa_to_sheet(leggi); wl["!cols"] = [{ wch: 22 }, { wch: 100 }]; XLSX.utils.book_append_sheet(wb, wl, "Leggimi");
  XLSX.writeFile(wb, `patrimonio-quanta-portfolio-${pmToday()}.xlsx`);
  trackOnce("feature", "patrimonio_excel", { name: "patrimonio_excel" }); return true;
}
/* ricominciare da zero: prima una copia di sicurezza scaricata, poi si cancella (si può rimettere con «Ripristina da una copia») */
function pmReset() {
  if (!pmHas()) { pmMsg("Il patrimonio è già vuoto.", "", "#pmTopMsg"); return; }
  const n = PM.db.operazioni.filter(o => o.tipo !== "annulla").length;
  if (!confirm(`Cancellare tutto il patrimonio salvato in questo browser (${n} operazioni)?

Prima scarico una copia di sicurezza: se cambi idea la rimetti con «Ripristina da una copia».`)) return;
  pmDownload();
  try { localStorage.removeItem(PM_KEY); } catch {}
  PM.db = null; PM.R = null; PM.px = {}; PM.fx = {}; PM.sel = null; PM.beniFile = []; PM.tipo = "acquisto"; PM.beneId = "";
  const bn = $("#pmBeni"); if (bn) bn.hidden = true;
  pmDb(); pmRenderForm(); pmRender();
  $("#scene-patrimonio").scrollTo({ top: 0, behavior: "smooth" });
  pmMsg("Patrimonio cancellato. La copia di sicurezza è nei tuoi download.", "ok", "#pmTopMsg");
}

/* ---------- menu in alto a destra: con un patrimonio, una piccola dashboard ---------- */
function pmMenu() {
  const lbl = $("#mnuLbl"), dash = $("#mnuDash"); if (!lbl || !dash) return;
  if (!pmHas()) { lbl.textContent = "Menu"; dash.innerHTML = `<button type="button" class="mnu-cta" data-go="patrimonio"><b>Crea il tuo patrimonio</b><small>aggiungi ciò che possiedi: lo ritrovi qui ogni giorno, aggiornato</small></button>`; $("#mnuCopy").hidden = true; return; }
  const R = PM.R || pmCalc(), T = R.totale, ses = pmSession(R), { list } = pmSlices(R);
  lbl.innerHTML = `<b>${fmtEur(T.valore)}</b>${ses ? `<i class="${clsP(ses.pct)}">${sPct(ses.pct)}</i>` : ""}`;
  let a = 0; const ring = list.map(x => { const sp = x.pct * 2 * Math.PI, a0 = a + (list.length > 1 ? 0.02 : 0), a1 = a + sp - (list.length > 1 ? 0.02 : 0); a += sp;
    return list.length === 1 ? `<circle cx="36" cy="36" r="27" stroke="${x.col}" stroke-width="10" fill="none"/>` : `<path d="${arc(36, 36, 27, a0, Math.max(a0 + 0.01, a1))}" stroke="${x.col}" stroke-width="10" fill="none"/>`; }).join("");
  dash.innerHTML = `<button type="button" class="mnu-card" data-go="patrimonio" aria-label="Apri il patrimonio: ${esc(fmtEur(T.valore))}"><svg viewBox="0 0 72 72" width="72" height="72" aria-hidden="true">${ring}</svg>
    <span class="mnu-v"><small>Il mio patrimonio</small><b>${fmtEur(T.valore)}</b><span>${ses ? `<i class="${clsE(ses.euro)}">${sEur(ses.euro)}</i> ${ses.d === pmToday() ? "oggi" : dayName(ses.d)}` : "valori di fine giornata"}</span><span>guadagno <i class="${clsE(T.guadagno)}">${sEur(T.guadagno)}</i> · TIR <i class="${clsP(T.tir)}">${sPct(T.tir)}</i></span></span></button>`;
  $("#mnuCopy").hidden = false;
  const nd = pacDue().length; if (nd) dash.insertAdjacentHTML("beforeend", `<button type="button" class="mnu-pac" data-go="patrimonio">${nd === 1 ? "È il giorno del tuo PAC: registralo" : `${nd} PAC da registrare`} →</button>`);
  if (nd) lbl.insertAdjacentHTML("beforeend", `<i class="mnu-dot" aria-label="PAC da registrare"></i>`);
}
const mnuOpen = on => { const pop = $("#mnuPop"), b = $("#mnuBtn"); if (!pop) return; if (on) pmMenu(); pop.hidden = !on; b.setAttribute("aria-expanded", String(on)); document.body.classList.toggle("mnu-on", !!on); if (on) { const f = pop.querySelector("button,a"); if (f) f.focus({ preventScroll: true }); } };
$("#mnuBtn").addEventListener("click", e => { e.stopPropagation(); mnuOpen($("#mnuPop").hidden); });
document.addEventListener("click", e => {
  const pop = $("#mnuPop"); if (!pop || pop.hidden) return;
  if (e.target.closest("#mnuAdd")) { mnuOpen(false); go("patrimonio"); setTimeout(() => { $("#pmAdd").scrollIntoView({ behavior: "smooth", block: "start" }); }, 600); return; }
  if (e.target.closest("#mnuFile")) { mnuOpen(false); $("#file").click(); return; }
  if (e.target.closest("#mnuCopy")) { mnuOpen(false); pmDownload(); return; }
  if (e.target.closest(".mnu-it,.mnu-card,.mnu-cta") || !e.target.closest("#mnu")) mnuOpen(false);
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#mnuPop").hidden) { mnuOpen(false); $("#mnuBtn").focus(); } });

/* il patrimonio nel laboratorio: le posizioni quotate, con i loro pesi di oggi (i beni a mano restano fuori) */
function pmToLab() {
  const R = PM.R || pmCalc(), open = R.posizioni.filter(p => { const s = PM.db.strumenti[p.id]; return p.aperta && !s.manuale && (!s.per100 || pmBtpSym(s)) && p.valore > 0; }), tot = open.reduce((a, p) => a + p.valore, 0); if (!(tot > 0)) return false;
  BD.ports = [open.map(p => { const s = PM.db.strumenti[p.id], bs = s.per100 && pmBtpSym(s), code = s.isin || (bs ? bs : s.ticker || s.simbolo); if (bs) bdBtpMeta(code, s.nome, bs, s.isin); return [code, Math.round(p.valore / tot * 1000) / 10]; })]; BD.cur = 0;
  $("#bdCap").value = Math.round(tot); bdGo(); return true;
}

/* ---------- salvataggio delle operazioni a mano ---------- */
function pmAdd(op) { const db = pmDb(); db.operazioni.push({ id: newId(), ...op }); return pmSave(); }
async function pmSubmit(f) {
  const v = Object.fromEntries(new FormData(f).entries()), db = pmDb(), data = v.data;
  if (PM.tipo === "pac") { pacSubmitNew(f); return; }
  if (PM.tipo === "btp") { btpSubmit(v); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || "") || data > pmToday()) return pmMsg("Scegli una data valida, non nel futuro.", "err");
  if (PM.tipo === "acquisto") {
    const qta = num(v.qta), prezzo = num(v.prezzo), spese = num(v.spese) || 0;
    if (!(qta > 0) || !(prezzo > 0)) return pmMsg("Scrivi quante quote e il prezzo per quota.", "err");
    let r = PM.res && PM.res.text === v.str ? PM.res.r : null;
    if (!r) { pmMsg("Cerco lo strumento…"); r = await pmResolve(v.str); }
    if (!r || r.error) return pmMsg(r ? `Non riconosco lo strumento: ${r.error}.` : "Scrivi lo strumento.", "err");
    if (!db.strumenti[r.id]) db.strumenti[r.id] = { nome: r.nome, ticker: r.ticker || null, isin: r.isin || null, simbolo: r.simbolo, valuta: r.valuta || "EUR", classe: r.classe || null };
    if (r.px && !PM.px[r.id]) PM.px[r.id] = r.px;
    await pmFx(false);
    if (!pmAdd({ data, tipo: "acquisto", strumento: r.id, quantita: qta, prezzo, spese })) return;
    pmMsg(`Salvato: ${fmtN(qta, qta % 1 ? 3 : 0)} quote di ${db.strumenti[r.id].nome}.`, "ok");
  } else if (PM.tipo === "vendita") {
    const qta = num(v.qta), prezzo = num(v.prezzo), spese = num(v.spese) || 0, p = PM.R.posizioni.find(x => x.id === v.sid);
    if (!(qta > 0) || !(prezzo > 0)) return pmMsg("Scrivi quante quote hai venduto e a che prezzo.", "err");
    if (p && qta > p.qta + 1e-9) return pmMsg(`Ne possiedi ${fmtN(p.qta, p.qta % 1 ? 3 : 0)}: non puoi venderne ${fmtN(qta, qta % 1 ? 3 : 0)}.`, "err");
    if (!pmAdd({ data, tipo: "vendita", strumento: v.sid, quantita: qta, prezzo, spese })) return;
    pmMsg(`Salvata la vendita di ${fmtN(qta, qta % 1 ? 3 : 0)} quote.`, "ok");
  } else if (PM.tipo === "dividendo") {
    const imp = num(v.importo); if (!(imp > 0)) return pmMsg("Scrivi l'importo netto incassato.", "err");
    if (!pmAdd({ data, tipo: "dividendo", strumento: v.sid, importo: imp, valuta: "EUR" })) return;
    pmMsg(`Salvato un provento di ${fmtN(imp, 2)} €.`, "ok");
  } else {
    const val = num(v.valore); if (!(val > 0)) return pmMsg("Scrivi il valore in euro.", "err");
    if (PM.beneId) { if (!pmAdd({ data, tipo: "valutazione", strumento: PM.beneId, prezzo: val })) return; pmMsg(`Nuova stima salvata: ${fmtEur(val)}.`, "ok"); }
    else { const nome = String(v.nome || "").trim().slice(0, 80); if (!nome) return pmMsg("Dai un nome al bene.", "err");
      const t = BENE_CLS[v.btipo] ? v.btipo : beneTipo(nome), id = "m-" + newId(); db.strumenti[id] = { nome, valuta: "EUR", classe: BENE_CLS[t], tipo: t, manuale: true };
      if (!pmAdd({ data, tipo: "acquisto", strumento: id, quantita: 1, prezzo: val })) return; pmMsg(`Aggiunto: ${nome}, ${fmtEur(val)}.`, "ok"); }
  }
  PM.beneId = ""; pmRenderForm(); pmRender(); pmRefresh(false);
}

/* ---------- eventi ---------- */
const sc = () => $("#scene-patrimonio");
sc().addEventListener("click", e => {
  const g = e.target.closest("[data-pmg]"); if (g) { PM.group = g.dataset.pmg; PM.sel = null; pmRing(PM.R || pmCalc()); return; }
  const sl = e.target.closest("[data-pmslice]"); if (sl) { const k = sl.dataset.pmslice; PM.sel = PM.sel === k ? null : k; pmRing(PM.R || pmCalc()); const n = document.querySelector(`#pmRing [data-pmslice="${CSS.escape(k)}"]`); if (n && e.detail === 0 && sl.closest("#pmRing")) n.focus(); return; }
  if (e.target.closest("[data-pmclear]") && PM.sel) { PM.sel = null; pmRing(PM.R || pmCalc()); return; }
  const t = e.target.closest("[data-pmt]"); if (t) { PM.tipo = t.dataset.pmt; PM.beneId = ""; PM.btpId = ""; pmRenderForm(); pmMsg(""); return; }
  if (e.target.closest("[data-pmgo=add]")) { $("#pmAdd").scrollIntoView({ behavior: "smooth", block: "start" }); setTimeout(() => { const i = $("#pmForm input,#pmForm select"); if (i) i.focus({ preventScroll: true }); }, 450); return; }
  const bp = e.target.closest("[data-pmbpx]"); if (bp) { PM.tipo = "btp"; PM.btpId = bp.dataset.pmbpx; pmRenderForm(); pmMsg(""); $("#pmAdd").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  const vb = e.target.closest("[data-pmval]"); if (vb) { PM.tipo = "bene"; PM.beneId = vb.dataset.pmval; pmRenderForm(); pmMsg(""); $("#pmAdd").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  const d = e.target.closest("[data-pmdel]"); if (d) {
    const o = PM.db.operazioni.find(x => String(x.id) === d.dataset.pmdel); if (!o) return;
    const s = PM.db.strumenti[o.strumento] || {};
    if (!confirm(`Annullare ${(TIPO_L[o.tipo] || o.tipo).toLowerCase()} di ${s.nome || "—"} del ${dIt(o.data)}? Resterà nello storico come annullata.`)) return;
    pmAdd({ data: pmToday(), tipo: "annulla", rif: o.id }); if (o.strumento && PM.db.strumenti[o.strumento] && PM.db.strumenti[o.strumento].per100) { delete PM.px[o.strumento]; pmRenderForm(); pmRefresh(false); return; } pmRenderForm(); pmRender(); return; }
  if (e.target.closest("#pmFile")) { PM.pending = true; pmMsg("Scegli il file: dopo la lettura e la mappa, il portafoglio entra da solo nel tuo patrimonio.", "", "#pmTopMsg"); $("#file").click(); return; }
  if (e.target.closest("#pmLab")) { pmToLab(); return; }
  if (e.target.closest("#pmExport")) pmExcel();
  if (e.target.closest("#pmBackup")) pmDownload();
  if (e.target.closest("#pmReset")) pmReset();
  if (e.target.closest("[data-pacadd]")) { PM.tipo = "pac"; PM.beneId = ""; pmRenderForm(); pmMsg(""); $("#pmAdd").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  const cs = e.target.closest("[data-cedskip]"); if (cs) { cedSkip(+cs.dataset.cedskip); return; }
  const ps = e.target.closest("[data-pacskip]"); if (ps) { pacSkip(+ps.dataset.pacskip); return; }
  const pd = e.target.closest("[data-pacdel]"); if (pd) { const db = pmDb(), pl = (db.pac || []).find(x => x.id === pd.dataset.pacdel); if (pl && confirm(`Togliere il piano di accumulo di ${(db.strumenti[pl.strumento] || {}).nome || "—"}? Le operazioni già registrate restano.`)) { db.pac = db.pac.filter(x => x !== pl); if (pmSave()) { pacRenderList(); pacRenderDue(); pmButton(); } } return; }
});
sc().addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("#pmRing [data-pmslice]")) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent("click", { bubbles: true })); }
  if (e.key === "Escape" && PM.sel) { PM.sel = null; pmRing(PM.R || pmCalc()); } });
sc().addEventListener("submit", e => { if (e.target.matches && e.target.matches("[data-pacdue]")) { e.preventDefault(); pacRegister(+e.target.dataset.pacdue, e.target); }
  if (e.target.matches && e.target.matches("[data-ceddue]")) { e.preventDefault(); cedRegister(+e.target.dataset.ceddue, e.target); } });
sc().addEventListener("submit", e => { if (!e.target.matches || !e.target.matches("#pmForm")) return; e.preventDefault(); const b = e.target.querySelector("[type=submit]"); if (b) b.disabled = true; pmSubmit(e.target).finally(() => { if (b) b.disabled = false; }); });
sc().addEventListener("change", async e => {
  const fz = e.target.closest("[data-pmfisc]"); if (fz) { const st = PM.db.strumenti[fz.dataset.pmfisc]; if (st) { st.fiscale = fz.value; pmSave(); pmRender(); } return; }
  const el = e.target;
  if (el.id === "pmBene") { PM.beneId = el.value; pmRenderForm(); return; }
  if (el.id === "pmBtpSel") { PM.btpId = el.value; pmRenderForm(); return; }
  if (el.name === "bnome") { const v = String(el.value || "").trim(), f = el.form, h = $("#pmBtpHint"), isin = (v.toUpperCase().match(/\b[A-Z]{2}[A-Z0-9]{9}\d\b/) || [])[0];
    const setCM = (c, sc) => { if (c != null) f.bcpn.value = String(+(c * 100).toFixed(3)).replace(".", ","); if (sc) f.bmat.value = sc; };
    if (isin) { const L = await btpLista(), m = L.righe.find(x => x.isin === isin);
      if (m) { setCM(m.c, m.sc); if (!/·/.test(v)) el.value = `${m.nome} · ${m.isin}`; h.textContent = `✓ ${m.nome} · cedola ${fmtPct(m.c, 2)} · prezzo stimato ogni giorno dalla curva della Banca d'Italia`; h.className = "pm-hint ok"; return; }
      if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(v.toUpperCase())) { h.textContent = "verifico l'ISIN…"; h.className = "pm-hint"; const j = await getJSON(`/api/isin?isin=${isin}`), r = j && (j.results || [])[0], st = r && r.stato; if (el.value.trim() !== v) return;
        if (st) { setCM(st.cedola, st.scadenza); el.value = `${st.nome} · ${isin}`; h.textContent = st.tipo === "fisso" ? `✓ ${st.nome} · prezzo stimato dalla curva della Banca d'Italia` : `✓ ${st.nome}: le cedole cambiano, il prezzo resta quello che scrivi tu`; h.className = "pm-hint ok"; }
        else { h.textContent = r && r.simbolo ? "questo ISIN è quotato in borsa: aggiungilo come «Acquisto»" : "ISIN non trovato: scrivi cedola e scadenza qui sotto"; h.className = "pm-hint"; } return; } }
    const b = bondInfo(el.value);
    if (b) { if (b.cpn != null && !f.bcpn.value) f.bcpn.value = String(+(b.cpn * 100).toFixed(3)).replace(".", ","); if (b.mat && !f.bmat.value) f.bmat.value = b.mat.toISOString().slice(0, 10); h.textContent = `✓ ${b.cpn != null ? "cedola " + fmtPct(b.cpn, 2) + " · " : ""}scadenza ${b.mat.toLocaleDateString("it-IT", { timeZone: "UTC" })}`; h.className = "pm-hint ok"; }
    else { h.textContent = "cedola e scadenza: scrivile qui sotto (le trovi nel tuo home banking)"; h.className = "pm-hint"; } return; }
  if (el.name === "sid" && PM.tipo === "vendita") { const p = PM.R.posizioni.find(x => x.id === el.value), s = PM.db.strumenti[el.value]; if (p) $("#pmHint").textContent = `Possiedi ${fmtN(p.qta, p.qta % 1 ? 3 : 0)} quote`; if (s) $("#pmCcy").textContent = `(${s.valuta || "€"})`; return; }
  if (el.name === "str" && PM.tipo === "acquisto") {
    const text = el.value, h = $("#pmHint"); if (!String(text).trim()) { h.textContent = ""; h.className = "pm-hint"; return; }
    h.textContent = "verifico…"; h.className = "pm-hint"; const r = await pmResolve(text); if (el.value !== text) return;
    PM.res = { text, r };
    if (!r || r.error) { h.textContent = "✗ " + (r ? r.error : "non trovato"); h.className = "pm-hint no"; return; }
    const c = r.valuta || "EUR", lp = lastPx(r.px);
    h.textContent = `✓ ${r.nome} · ${r.simbolo} · in ${c === "GBX" ? "pence (GBX)" : c}${Number.isFinite(lp) ? ` · ultimo prezzo ${fmtN(lp, 2)}` : ""}`; h.className = "pm-hint ok";
    $("#pmCcy").textContent = `(${c === "EUR" ? "€" : c})`;
    const pi = $("#pmForm [name=prezzo]"); if (pi && !pi.value && Number.isFinite(lp)) pi.value = String(+lp.toFixed(2)).replace(".", ",");
  }
});
$("#pmImport").addEventListener("change", async e => {
  const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
  try { const x = JSON.parse(await f.text());
    if (!x || x.v !== 1 || !x.strumenti || !Array.isArray(x.operazioni)) throw new Error("non è una copia del patrimonio di Quanta Portfolio");
    if (pmHas() && !confirm(`Sostituire il patrimonio di questo browser con la copia (${x.operazioni.length} operazioni)?`)) return;
    PM.db = { v: 1, strumenti: x.strumenti, operazioni: x.operazioni, creato: x.creato || new Date().toISOString() }; PM.px = {}; PM.fx = {}; PM.sel = null;
    if (!pmSave()) return; pmMsg(`Ripristinato: ${x.operazioni.length} operazioni.`, "ok", "#pmTopMsg"); pmRenderForm(); pmRefresh(true);
  } catch (err) { pmMsg(`Non riesco a leggere la copia: ${err.message}.`, "err", "#pmTopMsg"); }
});
document.addEventListener("click", e => { if (e.target.closest("#pmOfferBtn")) pmImport(); });
document.addEventListener("click", e => { if (e.target.closest("#pmBeniOk")) pmBeniAdd(); if (e.target.closest("#pmBeniNo")) { PM.beniFile = []; $("#pmBeni").hidden = true; } });
/* se il grafico è stato disegnato a un'altra larghezza (rotazione del telefono), si ridisegna */
let pmRz = 0; window.addEventListener("resize", () => { clearTimeout(pmRz); pmRz = setTimeout(() => { if (current === "patrimonio" && PM.R && pmHas()) $("#pmChart").innerHTML = pmChart(PM.R); }, 250); });

export { pmQuantaSummary, pmQuantaOp, pmImport, PM, pmCalc, pmEnter, pmFromFile, pmHas, pmOfferRender, pmRender, pmToLab, pmDownload, pmMenu, pmFindBeni, beneTipo, pmReset, pacDue, pacNext, pacDate, cedDue };
