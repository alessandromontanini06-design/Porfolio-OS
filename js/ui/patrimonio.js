/* Portfolio OS · interfaccia · Il mio patrimonio: una sezione del sito, il portafoglio che vive nel browser.
   Si salvano solo strumenti e operazioni (localStorage «pos-patrimonio-v1»); tutto il resto lo calcola il motore (POS.ledger).
   Le operazioni non si cancellano: un errore si annulla con un'operazione nuova, così lo storico resta affidabile.
   Si riempie a mano oppure da un file caricato (movimenti o posizioni), e porta al laboratorio con un clic. */
import { $, P, S, esc, fmtN, fmtPct } from "./core.js";
import { getJSON, fmtEur } from "./analisi.js";
import { BD, POPULAR, bdGo, guessSymbol, isExample, trackOnce } from "./importa.js";
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
const RING = ["#C9F24A", "#8F3BFF", "#2E6FD1", "#D4572E", "#C99A00", "#1D9A8A", "#E0569B", "#161616", "#8A8F98"];

function pmLoad() { try { const x = JSON.parse(localStorage.getItem(PM_KEY) || "null"); if (x && x.v === 1 && x.strumenti && Array.isArray(x.operazioni)) return x; } catch {} return null; }
const PM = { db: pmLoad(), px: {}, fx: {}, tipo: "acquisto", R: null, res: null, loading: false, beneId: "", group: "strumenti", sel: null, pending: false };
const pmHas = () => !!(PM.db && PM.db.operazioni.some(o => o.tipo !== "annulla"));
function pmSave() {
  PM.db.aggiornato = new Date().toISOString();
  try { localStorage.setItem(PM_KEY, JSON.stringify(PM.db)); return true; }
  catch { pmMsg("Non riesco a salvare in questo browser (forse è in navigazione privata o la memoria è piena).", "err"); return false; }
}
const pmDb = () => PM.db ||= { v: 1, strumenti: {}, operazioni: [], creato: new Date().toISOString() };

/* ---------- prezzi e cambi: una volta per visita, tre strumenti alla volta ---------- */
async function pmPrices(force) {
  const db = pmDb(), ids = Object.keys(db.strumenti).filter(id => db.strumenti[id].simbolo && (force || !PM.px[id]));
  const q = ids.slice();
  await Promise.all([0, 1, 2].map(async () => { while (q.length) { const id = q.shift(), s = db.strumenti[id];
    const j = await getJSON(`/api/prices?symbol=${encodeURIComponent(s.simbolo)}&v=5`);
    PM.px[id] = j && !j.error && j.points ? j : { error: (j && j.error) || "prezzi non disponibili" }; } }));
  await pmFx(force);
}
async function pmFx(force) {
  const need = [...new Set(Object.values(pmDb().strumenti).map(s => s.valuta === "GBX" ? "GBP" : s.valuta).filter(c => c && c !== "EUR"))];
  for (const c of need) if (!PM.fx[c] || force) { const j = await getJSON(`/api/fx?ccy=${c}`); PM.fx[c] = j && j.points ? j.points : []; }
}
function pmCalc() {
  const db = pmDb(), prezzi = {};
  for (const [id, j] of Object.entries(PM.px)) if (j && j.points) prezzi[id] = j.points.concat(j.recent || []);
  PM.R = P.ledger(db.strumenti, db.operazioni, prezzi, PM.fx, { al: pmToday() });
  return PM.R;
}
const lastFx = c => { const a = PM.fx[c]; return a && a.length ? a[a.length - 1].v : NaN; };
/* variazione dell'ultima seduta: quote di oggi × (ultima chiusura − penultima), in euro */
function pmSession(R) {
  let ch = 0, base = 0, d = null, d0 = null, n = 0;
  for (const p of R.posizioni) {
    if (!p.aperta) continue; const j = PM.px[p.id], r = j && j.recent; if (!r || r.length < 2) continue;
    const a = r[r.length - 2], b = r[r.length - 1], s = PM.db.strumenti[p.id], k = s.valuta === "GBX" ? 100 : 1, c = s.valuta === "GBX" ? "GBP" : (s.valuta || "EUR"), fx = c === "EUR" ? 1 : lastFx(c);
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
  const el = $("#pmPacDue"); if (!el) return; const due = pacDue();
  if (!due.length) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  el.innerHTML = `<div class="pac-h"><b>${due.length === 1 ? "È il giorno del tuo PAC" : `Hai ${due.length} PAC da registrare`}</b><span>Scrivi le quote che vedi nell'app del broker: il prezzo lo calcolo io da importo ÷ quote.</span></div>` +
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
function pmChart(R) {
  const s = R.serie; if (s.length < 3) return "";
  const step = Math.max(1, Math.ceil(s.length / 360)), pts = s.filter((_, i) => i % step === 0 || i === s.length - 1);
  /* disegnato alla larghezza vera del riquadro: le scritte restano di 11 px anche sul telefono */
  const box = $("#pmChart"), W = Math.round(Math.min(1200, Math.max(300, ((box && box.clientWidth) || 900) - 34))), H = W < 520 ? 180 : 220, L = 64, Rr = 12, T0 = 10, B = 26;
  const hi = Math.max(...pts.map(p => Math.max(p.valore, p.versato)), 1), lo0 = Math.min(...pts.map(p => Math.min(p.valore, p.versato)));
  /* l'asse parte da zero solo se i valori ci arrivano vicino: altrimenti le oscillazioni non si vedrebbero */
  const lo = lo0 > hi * 0.5 ? lo0 * 0.97 : 0, max = hi * 1.03, span = max - lo || 1;
  const x = i => L + i / (pts.length - 1) * (W - L - Rr), y = v => T0 + (1 - (Math.max(lo, v) - lo) / span) * (H - T0 - B);
  const line = k => pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join("");
  const ticks = [lo, lo + (hi - lo) / 2, hi].map(v => `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${fmtEur(v)}</text>`).join("");
  const xl = [0, Math.floor((pts.length - 1) / 2), pts.length - 1].map((i, k) => `<text x="${x(i)}" y="${H - 6}" text-anchor="${k === 0 ? "start" : k === 2 ? "end" : "middle"}" font-size="11" fill="var(--muted)">${dIt(pts[i].d)}</text>`).join("");
  return `<div class="pm-ch-h"><b>Come è cambiato</b><p class="pm-leg"><span><i style="background:var(--fg)"></i>Valore</span><span><i class="dash"></i>Soldi versati (netti)</span></p></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Valore del patrimonio e soldi versati dal ${dIt(R.dal)} a oggi">${ticks}<path d="${line("versato")}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 4"/><path d="${line("valore")}" fill="none" stroke="var(--fg)" stroke-width="2"/>${xl}</svg>`;
}
function pmPosTable(R) {
  const db = PM.db, rows = R.posizioni;
  if (!rows.length) return `<p class="pm-empty">Ancora niente. Aggiungi qui sotto il primo acquisto (per esempio <b>VWCE</b>, 20 quote a 100 €) oppure <b>importa il file</b> della tua banca o del tuo broker.</p>`;
  const src = p => p.prezzoFonte === "mercato" ? `prezzo al ${dIt(p.prezzoData)}` : db.strumenti[p.id].manuale ? `stima del ${dIt(p.prezzoData)}` : `il tuo prezzo del ${dIt(p.prezzoData)}`;
  const tr = p => { const s = db.strumenti[p.id], g = p.guadagno, gp = p.acquistato > 0 ? g / p.acquistato : NaN, ccy = s.valuta && s.valuta !== "EUR" ? " " + s.valuta : " €";
    return `<tr class="${p.aperta ? "" : "closed"}"><td><b>${esc(s.nome)}</b><small>${esc([s.ticker, s.isin].filter(Boolean).join(" · ") || (s.manuale ? "bene senza quotazione" : s.simbolo || ""))}${p.aperta ? "" : " · chiusa"}</small></td>
      <td class="num">${p.aperta ? fmtN(p.qta, p.qta % 1 ? 3 : 0) : "—"}</td>
      <td class="num">${p.aperta && Number.isFinite(p.prezzo) ? fmtN(p.prezzo, 2) + ccy : "—"}<small>${p.aperta && p.prezzoData ? src(p) : ""}</small></td>
      <td class="num"><b>${fmtEur(p.valore)}</b><small>${p.aperta ? fmtPct(p.peso, 1) : ""}</small></td>
      <td class="num"><span class="${clsE(g)}">${sEur(g)}</span><small class="${clsP(gp)}">${sPct(gp)}</small></td>
      <td class="num">${s.manuale && p.aperta ? `<button type="button" class="btn sm" data-pmval="${esc(p.id)}">Aggiorna stima</button>` : ""}</td></tr>`; };
  const manuali = rows.some(p => p.aperta && db.strumenti[p.id].manuale), err = Object.entries(PM.px).filter(([, j]) => j && j.error).map(([id, j]) => `${db.strumenti[id] ? db.strumenti[id].nome : id}: ${j.error}`);
  return `<div class="tablewrap"><table class="mt pm-pos"><thead><tr><th>Strumento</th><th class="num">Quote</th><th class="num">Prezzo</th><th class="num">Valore · peso</th><th class="num">Guadagno</th><th></th></tr></thead><tbody>${rows.map(tr).join("")}</tbody></table></div>
    ${R.avvisi.length ? `<p class="caption">${R.avvisi.map(esc).join(" · ")}</p>` : ""}${err.length ? `<p class="caption">Prezzi non aggiornati: ${err.map(esc).join(" · ")}. Uso l'ultimo prezzo noto.</p>` : ""}
    ${manuali ? `<p class="caption">I beni senza quotazione valgono l'ultima stima che hai inserito e non entrano nelle analisi del laboratorio.</p>` : ""}`;
}
function pmOpsTable() {
  const db = PM.db, ops = db.operazioni, gone = new Set(ops.filter(o => o.tipo === "annulla").map(o => String(o.rif)));
  const list = ops.filter(o => o.tipo !== "annulla").slice().sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0)).slice(0, 200);
  if (!list.length) return `<p class="caption">Le operazioni che aggiungi o importi compaiono qui, dalla più recente.</p>`;
  const det = o => { const s = db.strumenti[o.strumento] || {}, c = o.valuta || s.valuta || "EUR", u = c === "EUR" ? " €" : " " + c;
    if (o.tipo === "acquisto" || o.tipo === "vendita") return s.manuale && o.tipo === "acquisto" ? `valore ${fmtN(+o.prezzo, 0)} €` : `${fmtN(+o.quantita, +o.quantita % 1 ? 3 : 0)} × ${fmtN(+o.prezzo, 2)}${u}${+o.spese ? ` · spese ${fmtN(+o.spese, 2)} €` : ""}${o.stima ? " · quote stimate" : ""}`;
    if (o.tipo === "valutazione") return `stima ${fmtN(+o.prezzo, 0)} €`;
    if (o.tipo === "dividendo" || o.tipo === "cedola" || o.tipo === "commissione" || o.tipo === "tassa") return `${fmtN(+o.importo, 2)}${u}`;
    if (o.tipo === "frazionamento") return `1 quota → ${fmtN(+o.rapporto, 2)}`; return ""; };
  return `<div class="tablewrap"><table class="mt pm-ops"><thead><tr><th>Data</th><th>Operazione</th><th>Strumento</th><th class="num">Dettaglio</th><th></th></tr></thead><tbody>
    ${list.map(o => { const g = gone.has(String(o.id)); return `<tr class="${g ? "gone" : ""}"><td>${dIt(o.data)}</td><td>${esc(TIPO_L[o.tipo] || o.tipo)}${g ? " <small>annullata</small>" : o.origine === "file" ? " <small>da file</small>" : ""}</td><td>${esc((db.strumenti[o.strumento] || {}).nome || "—")}</td><td class="num">${det(o)}</td><td class="num">${g ? "" : `<button type="button" class="btn sm" data-pmdel="${esc(o.id)}">Annulla</button>`}</td></tr>`; }).join("")}
    </tbody></table></div>${list.length >= 200 ? `<p class="caption">Mostro le 200 più recenti.</p>` : ""}`;
}
function pmForm() {
  const db = pmDb(), R = PM.R, t = PM.tipo, open = R ? R.posizioni.filter(p => p.aperta && !db.strumenti[p.id].manuale) : [], all = Object.entries(db.strumenti).filter(([, s]) => !s.manuale);
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
function pmRender() {
  const R = pmCalc(), has = pmHas();
  if (!$("#pmKpis")) return;
  $("#pmAsOf").textContent = PM.loading ? "Aggiorno i prezzi di oggi…" : has ? `Aggiornato al ${dIt(pmToday())} · salvato solo in questo browser` : "Il tuo patrimonio, sempre qui: aggiungi ciò che possiedi o importa un file. Senza account.";
  pmRing(R);
  $("#pmKpis").innerHTML = has ? pmKpis(R) : `<div class="pm-empty"><b>Inizia da qui.</b> Aggiungi quello che possiedi: ETF, azioni, fondi, ma anche casa, polizze e altri beni. Oppure importa l'Excel o l'export del broker. Ogni volta che torni trovi il valore aggiornato, quanto hai guadagnato e com'è andata l'ultima seduta.</div>`;
  $("#pmChart").innerHTML = has ? pmChart(R) : ""; $("#pmChart").hidden = !has || R.serie.length < 3;
  $("#pmPos").innerHTML = pmPosTable(R); $("#pmOps").innerHTML = pmOpsTable();
  pacRenderDue(); pacRenderList();
  const quoted = R.posizioni.some(p => p.aperta && !PM.db.strumenti[p.id].manuale);
  $("#pmLab").disabled = !quoted; $("#pmExport").disabled = !has;
  pmButton();
}
async function pmRefresh(force) {
  if (!pmHas()) { pmRender(); return; }
  PM.loading = true; pmRender();
  try { await pmPrices(force); } finally { PM.loading = false; }
  pmRender();
}
/* entrata nella sezione (dal menu, dalla home o all'avvio) */
function pmEnter() { trackOnce("feature", "patrimonio", { name: "patrimonio" }); pmDb(); if (!$("#pmForm").children.length) pmRenderForm(); pmRefresh(false); }

/* ---------- dal file caricato al patrimonio ---------- */
const keyOf = v => String(v || "").trim().toLowerCase();
const isoOf = d => d instanceof Date ? d.toISOString().slice(0, 10) : String(d || "").slice(0, 10);
/* il portafoglio del file è vero (non l'esempio né un portafoglio di prova costruito a mano)? */
const fileOk = () => !!(S.portfolio && S.portfolio.positions && S.portfolio.positions.some(p => p.simbolo) && S.source && S.source.kind !== "sample" && !isExample() && !S.source.builder && !(S.rb && S.rb.origSource && S.rb.origSource.builder));
async function pmFromFile() {
  const pos = S.portfolio.positions.filter(p => p.simbolo), db = pmDb(), fileName = (S.rb && S.rb.origSource && S.rb.origSource.name) || (S.source && S.source.name) || "file";
  /* 1) strumenti, con la valuta vera di quotazione e i prezzi (servono anche a stimare le quote mancanti) */
  const ids = pos.map(p => p.isin || p.simbolo);
  const q = pos.map((p, i) => [p, ids[i]]);
  await Promise.all([0, 1, 2].map(async () => { while (q.length) { const [p, id] = q.shift();
    if (!PM.px[id]) { const j = await getJSON(`/api/prices?symbol=${encodeURIComponent(p.simbolo)}&v=5`); PM.px[id] = j && !j.error && j.points ? j : { error: (j && j.error) || "prezzi non disponibili" }; }
    if (!db.strumenti[id]) db.strumenti[id] = { nome: p.nome || p.ticker || p.simbolo, ticker: p.ticker || null, isin: p.isin || null, simbolo: p.simbolo, valuta: (PM.px[id] && PM.px[id].currency) || p.currency || "EUR", classe: null }; } }));
  await pmFx(false);
  const eurPx = (id, day) => { const j = PM.px[id], s = db.strumenti[id]; if (!j || !j.points) return NaN; const st = P.lgSteps(j.points.concat(j.recent || [])), n = Math.round(Date.parse(day + "T00:00:00Z") / 864e5), r = st.at(n) || (st.n ? st.at(st.first) : null); if (!r) return NaN;
    const c = s.valuta === "GBX" ? "GBP" : s.valuta, k = s.valuta === "GBX" ? 100 : 1; if (!c || c === "EUR") return r[1] / k; const fs = P.lgSteps(PM.fx[c]), f = fs.at(n) || (fs.n ? fs.at(fs.first) : null); return f ? r[1] / k / f[1] : NaN; };
  /* 2) operazioni: dai movimenti se ci sono, altrimenti la situazione di oggi */
  const ops = [], seen = new Map(), have = new Set(db.operazioni.filter(o => o.imp).map(o => o.imp));
  let est = 0, skipped = 0, dup = 0;
  const add = (o, base) => { const n = (seen.get(base) || 0) + 1; seen.set(base, n); const imp = `${base}#${n}`; if (have.has(imp)) { dup++; return; } ops.push({ id: newId(), ...o, origine: "file", file: fileName, imp }); };
  const rows = S.tx && S.tx.rows && S.tx.rows.length ? S.tx.rows : null;
  if (rows) {
    const akas = pos.map(p => new Set([p.nome, p.ticker, p.isin, p.simbolo, p.simboloHint, ...(p.alt || [])].filter(Boolean).map(keyOf)));
    const names = pos.map(p => p.ticker || p.nome);
    for (const x of rows) {
      let i = -1; for (const v of [x.ticker, ...(x.alias || [])]) { i = akas.findIndex(s => s.has(keyOf(v))); if (i >= 0) break; }
      if (i < 0) i = txMatch(x.ticker, names); if (i < 0) { skipped++; continue; }
      const id = ids[i], data = isoOf(x.d), amt = Math.abs(x.amount), base = `${data}|${id}|${Math.round(x.amount * 100)}`;
      if (x.amount < 0 && /divid|cedol|coupon|interess/i.test(x.type || "")) { add({ data, tipo: "dividendo", strumento: id, importo: amt, valuta: "EUR" }, base); continue; }
      let qta = x.qty, stima = false; if (!(qta > 0)) { const pe = eurPx(id, data); if (!(pe > 0)) { skipped++; continue; } qta = amt / pe; stima = true; est++; }
      add({ data, tipo: x.amount > 0 ? "acquisto" : "vendita", strumento: id, quantita: qta, prezzo: amt / qta, valuta: "EUR", ...(stima ? { stima: true } : {}) }, base);
    }
  } else {
    const today = pmToday();
    pos.forEach((p, i) => { const id = ids[i]; let qta = +p.quantita; const val = +p.valore;
      if (!(qta > 0)) { const pe = eurPx(id, today); if (!(val > 0) || !(pe > 0)) { skipped++; return; } qta = val / pe; est++; }
      const prezzo = val > 0 ? val / qta : eurPx(id, today); if (!(prezzo > 0)) { skipped++; return; }
      add({ data: today, tipo: "acquisto", strumento: id, quantita: qta, prezzo, valuta: "EUR", posizioneDiOggi: true, ...(p.quantita > 0 ? {} : { stima: true }) }, `${today}|${id}|pos`); });
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
  const blob = new Blob([JSON.stringify({ ...PM.db, esportato: new Date().toISOString(), app: "Portfolio OS" }, null, 1)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `patrimonio-portfolio-os-${pmToday()}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); return true;
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
  const R = PM.R || pmCalc(), open = R.posizioni.filter(p => p.aperta && !PM.db.strumenti[p.id].manuale && p.valore > 0), tot = open.reduce((a, p) => a + p.valore, 0); if (!(tot > 0)) return false;
  BD.ports = [open.map(p => { const s = PM.db.strumenti[p.id]; return [s.isin || s.ticker || s.simbolo, Math.round(p.valore / tot * 1000) / 10]; })]; BD.cur = 0;
  $("#bdCap").value = Math.round(tot); bdGo(); return true;
}

/* ---------- salvataggio delle operazioni a mano ---------- */
function pmAdd(op) { const db = pmDb(); db.operazioni.push({ id: newId(), ...op }); return pmSave(); }
async function pmSubmit(f) {
  const v = Object.fromEntries(new FormData(f).entries()), db = pmDb(), data = v.data;
  if (PM.tipo === "pac") { pacSubmitNew(f); return; }
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
  const t = e.target.closest("[data-pmt]"); if (t) { PM.tipo = t.dataset.pmt; PM.beneId = ""; pmRenderForm(); pmMsg(""); return; }
  if (e.target.closest("[data-pmgo=add]")) { $("#pmAdd").scrollIntoView({ behavior: "smooth", block: "start" }); setTimeout(() => { const i = $("#pmForm input,#pmForm select"); if (i) i.focus({ preventScroll: true }); }, 450); return; }
  const vb = e.target.closest("[data-pmval]"); if (vb) { PM.tipo = "bene"; PM.beneId = vb.dataset.pmval; pmRenderForm(); pmMsg(""); $("#pmAdd").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  const d = e.target.closest("[data-pmdel]"); if (d) {
    const o = PM.db.operazioni.find(x => String(x.id) === d.dataset.pmdel); if (!o) return;
    const s = PM.db.strumenti[o.strumento] || {};
    if (!confirm(`Annullare ${(TIPO_L[o.tipo] || o.tipo).toLowerCase()} di ${s.nome || "—"} del ${dIt(o.data)}? Resterà nello storico come annullata.`)) return;
    pmAdd({ data: pmToday(), tipo: "annulla", rif: o.id }); pmRenderForm(); pmRender(); return; }
  if (e.target.closest("#pmFile")) { PM.pending = true; pmMsg("Scegli il file: dopo la lettura e la mappa, il portafoglio entra da solo nel tuo patrimonio.", "", "#pmTopMsg"); $("#file").click(); return; }
  if (e.target.closest("#pmLab")) { pmToLab(); return; }
  if (e.target.closest("#pmExport")) pmDownload();
  if (e.target.closest("#pmReset")) pmReset();
  if (e.target.closest("[data-pacadd]")) { PM.tipo = "pac"; PM.beneId = ""; pmRenderForm(); pmMsg(""); $("#pmAdd").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  const ps = e.target.closest("[data-pacskip]"); if (ps) { pacSkip(+ps.dataset.pacskip); return; }
  const pd = e.target.closest("[data-pacdel]"); if (pd) { const db = pmDb(), pl = (db.pac || []).find(x => x.id === pd.dataset.pacdel); if (pl && confirm(`Togliere il piano di accumulo di ${(db.strumenti[pl.strumento] || {}).nome || "—"}? Le operazioni già registrate restano.`)) { db.pac = db.pac.filter(x => x !== pl); if (pmSave()) { pacRenderList(); pacRenderDue(); pmButton(); } } return; }
});
sc().addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("#pmRing [data-pmslice]")) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent("click", { bubbles: true })); }
  if (e.key === "Escape" && PM.sel) { PM.sel = null; pmRing(PM.R || pmCalc()); } });
sc().addEventListener("submit", e => { if (e.target.matches && e.target.matches("[data-pacdue]")) { e.preventDefault(); pacRegister(+e.target.dataset.pacdue, e.target); } });
sc().addEventListener("submit", e => { if (!e.target.matches || !e.target.matches("#pmForm")) return; e.preventDefault(); const b = e.target.querySelector("[type=submit]"); if (b) b.disabled = true; pmSubmit(e.target).finally(() => { if (b) b.disabled = false; }); });
sc().addEventListener("change", async e => {
  const el = e.target;
  if (el.id === "pmBene") { PM.beneId = el.value; pmRenderForm(); return; }
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
    if (!x || x.v !== 1 || !x.strumenti || !Array.isArray(x.operazioni)) throw new Error("non è una copia del patrimonio di Portfolio OS");
    if (pmHas() && !confirm(`Sostituire il patrimonio di questo browser con la copia (${x.operazioni.length} operazioni)?`)) return;
    PM.db = { v: 1, strumenti: x.strumenti, operazioni: x.operazioni, creato: x.creato || new Date().toISOString() }; PM.px = {}; PM.fx = {}; PM.sel = null;
    if (!pmSave()) return; pmMsg(`Ripristinato: ${x.operazioni.length} operazioni.`, "ok", "#pmTopMsg"); pmRenderForm(); pmRefresh(true);
  } catch (err) { pmMsg(`Non riesco a leggere la copia: ${err.message}.`, "err", "#pmTopMsg"); }
});
document.addEventListener("click", e => { if (e.target.closest("#pmOfferBtn")) pmImport(); });
document.addEventListener("click", e => { if (e.target.closest("#pmBeniOk")) pmBeniAdd(); if (e.target.closest("#pmBeniNo")) { PM.beniFile = []; $("#pmBeni").hidden = true; } });
/* se il grafico è stato disegnato a un'altra larghezza (rotazione del telefono), si ridisegna */
let pmRz = 0; window.addEventListener("resize", () => { clearTimeout(pmRz); pmRz = setTimeout(() => { if (current === "patrimonio" && PM.R && pmHas()) $("#pmChart").innerHTML = pmChart(PM.R); }, 250); });

export { PM, pmCalc, pmEnter, pmFromFile, pmHas, pmOfferRender, pmRender, pmToLab, pmDownload, pmMenu, pmFindBeni, beneTipo, pmReset, pacDue, pacNext, pacDate };
