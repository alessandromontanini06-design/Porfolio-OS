/* Portfolio OS · interfaccia · Il mio patrimonio: il portafoglio che vive nel browser.
   Si salvano solo strumenti e operazioni (localStorage «pos-patrimonio-v1»); tutto il resto lo calcola il motore (POS.ledger).
   Le operazioni non si cancellano: un errore si annulla con un'operazione nuova, così lo storico resta affidabile. */
import { $, P, esc, fmtN, fmtPct } from "./core.js";
import { getJSON, fmtEur } from "./analisi.js";
import { BD, POPULAR, bdGo, guessSymbol, trackOnce } from "./importa.js";

const PM_KEY = "pos-patrimonio-v1";
const pmToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dIt = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—";
const sEur = v => Number.isFinite(v) ? (v > 0 ? "+" : "") + fmtEur(v) : "—";
const sPct = v => Number.isFinite(v) ? fmtPct(v, 1, true) : "—";
const cls = v => v > 0 ? "up" : v < 0 ? "dn" : "";
/* numeri scritti all'italiana: «200.000» = duecentomila, «12,50» = dodici e cinquanta, «1.234,5» e anche «1.5» (decimale) */
const num = v => { const t = String(v ?? "").trim().replace(/\s|€|'/g, ""); if (!t || !/^-?[\d.,]+$/.test(t)) return NaN;
  if (t.includes(",")) return parseFloat(t.replace(/\./g, "").replace(",", "."));
  if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) return parseFloat(t.replace(/\./g, ""));
  return parseFloat(t); };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const TIPO_L = { acquisto: "Acquisto", vendita: "Vendita", dividendo: "Dividendo", cedola: "Cedola", valutazione: "Nuova stima", commissione: "Commissione", tassa: "Tassa", frazionamento: "Frazionamento" };

function pmLoad() { try { const x = JSON.parse(localStorage.getItem(PM_KEY) || "null"); if (x && x.v === 1 && x.strumenti && Array.isArray(x.operazioni)) return x; } catch {} return null; }
const PM = { db: pmLoad(), px: {}, fx: {}, tipo: "acquisto", R: null, res: null, loading: false, beneId: "" };
const pmHas = () => !!(PM.db && PM.db.operazioni.some(o => o.tipo !== "annulla"));
function pmSave() {
  PM.db.aggiornato = new Date().toISOString();
  try { localStorage.setItem(PM_KEY, JSON.stringify(PM.db)); return true; }
  catch { pmMsg("Non riesco a salvare in questo browser (forse è in navigazione privata o la memoria è piena).", "err"); return false; }
}
const pmDb = () => PM.db ||= { v: 1, strumenti: {}, operazioni: [], creato: new Date().toISOString() };

/* ---------- prezzi e cambi: una volta per apertura, tre strumenti alla volta ---------- */
async function pmPrices(force) {
  const db = pmDb(), ids = Object.keys(db.strumenti).filter(id => db.strumenti[id].simbolo && (force || !PM.px[id]));
  const q = ids.slice();
  await Promise.all([0, 1, 2].map(async () => { while (q.length) { const id = q.shift(), s = db.strumenti[id];
    const j = await getJSON(`/api/prices?symbol=${encodeURIComponent(s.simbolo)}&v=5`);
    PM.px[id] = j && !j.error && j.points ? j : { error: (j && j.error) || "prezzi non disponibili" }; } }));
  const need = [...new Set(Object.values(db.strumenti).map(s => s.valuta === "GBX" ? "GBP" : s.valuta).filter(c => c && c !== "EUR"))];
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

/* ---------- disegno ---------- */
function pmMsg(t, k) { const el = $("#pmMsg"); if (!el) return; el.textContent = t || ""; el.className = "caption" + (k ? " " + k : ""); }
function pmKpis(R) {
  const T = R.totale, ses = pmSession(R);
  const sesTxt = ses ? `${ses.d === pmToday() ? "Oggi" : dayName(ses.d)}, rispetto a ${dayName(ses.d0)}: <b class="${cls(ses.euro)}">${sEur(ses.euro)}</b> · <span class="${cls(ses.pct)}">${sPct(ses.pct)}</span>` : PM.loading ? "Aggiorno i prezzi di oggi…" : "Variazione di giornata non disponibile";
  const tirTxt = T.anni >= 1 ? "rendimento annuo dei tuoi soldi" : "su meno di un anno: indicativo";
  return `<div class="pm-k pm-main"><span>Patrimonio oggi</span><b>${fmtEur(T.valore)}</b><small>${sesTxt}</small></div>
    <div class="pm-k"><span>Guadagno</span><b class="${cls(T.guadagno)}">${sEur(T.guadagno)}</b><small>${sPct(T.guadagnoPct)} su ${fmtEur(T.versato)} versati</small></div>
    <div class="pm-k"><span>Rendimento (TIR)</span><b class="${cls(T.tir)}">${sPct(T.tir)}</b><small>${tirTxt} · dal ${dIt(R.dal)}</small></div>
    <div class="pm-k"><span>Dividendi e cedole</span><b>${fmtEur(T.proventi)}</b><small>spese e tasse: ${fmtEur(T.spese)}</small></div>`;
}
function pmChart(R) {
  const s = R.serie; if (s.length < 3) return "";
  const step = Math.max(1, Math.ceil(s.length / 360)), pts = s.filter((_, i) => i % step === 0 || i === s.length - 1);
  /* disegnato alla larghezza vera del riquadro: le scritte restano di 11 px anche sul telefono */
  const box = $("#pmChart"), W = Math.round(Math.min(1200, Math.max(300, ((box && box.clientWidth) || 900) - 34))), H = W < 520 ? 180 : 220, L = 64, Rr = 12, T0 = 10, B = 26, max = Math.max(...pts.map(p => Math.max(p.valore, p.versato)), 1) * 1.05;
  const x = i => L + i / (pts.length - 1) * (W - L - Rr), y = v => T0 + (1 - Math.max(0, v) / max) * (H - T0 - B);
  const line = k => pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join("");
  const ticks = [0, max / 2 / 1.05, max / 1.05].map(v => `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${fmtEur(v)}</text>`).join("");
  const xl = [0, Math.floor((pts.length - 1) / 2), pts.length - 1].map((i, k) => `<text x="${x(i)}" y="${H - 6}" text-anchor="${k === 0 ? "start" : k === 2 ? "end" : "middle"}" font-size="11" fill="var(--muted)">${dIt(pts[i].d)}</text>`).join("");
  return `<p class="pm-leg"><span><i style="background:var(--fg)"></i>Valore</span><span><i style="background:var(--muted)"></i>Soldi versati (netti)</span></p>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Valore del patrimonio e soldi versati dal ${dIt(R.dal)} a oggi">${ticks}<path d="${line("versato")}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 4"/><path d="${line("valore")}" fill="none" stroke="var(--fg)" stroke-width="2"/>${xl}</svg>`;
}
function pmPosTable(R) {
  const db = PM.db, rows = R.posizioni;
  if (!rows.length) return `<p class="pm-empty">Ancora niente. Aggiungi qui sotto il primo acquisto: per esempio <b>VWCE</b>, 20 quote a 100 €.</p>`;
  const src = p => p.prezzoFonte === "mercato" ? `prezzo al ${dIt(p.prezzoData)}` : db.strumenti[p.id].manuale ? `stima del ${dIt(p.prezzoData)}` : `il tuo prezzo del ${dIt(p.prezzoData)}`;
  const tr = p => { const s = db.strumenti[p.id], g = p.guadagno, gp = p.acquistato > 0 ? g / p.acquistato : NaN, ccy = s.valuta && s.valuta !== "EUR" ? " " + s.valuta : " €";
    return `<tr class="${p.aperta ? "" : "closed"}"><td><b>${esc(s.nome)}</b><small>${esc([s.ticker, s.isin].filter(Boolean).join(" · ") || (s.manuale ? "bene senza quotazione" : s.simbolo || ""))}${p.aperta ? "" : " · chiusa"}</small></td>
      <td class="num">${p.aperta ? fmtN(p.qta, p.qta % 1 ? 3 : 0) : "—"}</td>
      <td class="num">${p.aperta && Number.isFinite(p.prezzo) ? fmtN(p.prezzo, 2) + ccy : "—"}<small>${p.aperta && p.prezzoData ? src(p) : ""}</small></td>
      <td class="num"><b>${fmtEur(p.valore)}</b><small>${p.aperta ? fmtPct(p.peso, 1) : ""}</small></td>
      <td class="num"><span class="${cls(g)}">${sEur(g)}</span><small class="${cls(gp)}">${sPct(gp)}</small></td>
      <td class="num">${s.manuale && p.aperta ? `<button type="button" class="btn sm" data-pmval="${esc(p.id)}">Aggiorna stima</button>` : ""}</td></tr>`; };
  const manuali = rows.some(p => p.aperta && db.strumenti[p.id].manuale), err = Object.entries(PM.px).filter(([, j]) => j && j.error).map(([id, j]) => `${db.strumenti[id] ? db.strumenti[id].nome : id}: ${j.error}`);
  return `<div class="tablewrap"><table class="mt pm-pos"><thead><tr><th>Strumento</th><th class="num">Quote</th><th class="num">Prezzo</th><th class="num">Valore · peso</th><th class="num">Guadagno</th><th></th></tr></thead><tbody>${rows.map(tr).join("")}</tbody></table></div>
    ${R.avvisi.length ? `<p class="caption">${R.avvisi.map(esc).join(" · ")}</p>` : ""}${err.length ? `<p class="caption">Prezzi non aggiornati: ${err.map(esc).join(" · ")}. Uso l'ultimo prezzo noto.</p>` : ""}
    ${manuali ? `<p class="caption">I beni senza quotazione valgono l'ultima stima che hai inserito e non entrano nelle analisi del laboratorio.</p>` : ""}`;
}
function pmOpsTable() {
  const db = PM.db, ops = db.operazioni, gone = new Set(ops.filter(o => o.tipo === "annulla").map(o => String(o.rif)));
  const list = ops.filter(o => o.tipo !== "annulla").slice().sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0)).slice(0, 200);
  if (!list.length) return `<p class="caption">Le operazioni che aggiungi compaiono qui, dalla più recente.</p>`;
  const det = o => { const s = db.strumenti[o.strumento] || {}, c = o.valuta || s.valuta || "EUR", u = c === "EUR" ? " €" : " " + c;
    if (o.tipo === "acquisto" || o.tipo === "vendita") return s.manuale && o.tipo === "acquisto" ? `valore ${fmtN(+o.prezzo, 0)} €` : `${fmtN(+o.quantita, +o.quantita % 1 ? 3 : 0)} × ${fmtN(+o.prezzo, 2)}${u}${+o.spese ? ` · spese ${fmtN(+o.spese, 2)} €` : ""}`;
    if (o.tipo === "valutazione") return `stima ${fmtN(+o.prezzo, 0)} €`;
    if (o.tipo === "dividendo" || o.tipo === "cedola" || o.tipo === "commissione" || o.tipo === "tassa") return `${fmtN(+o.importo, 2)}${u}`;
    if (o.tipo === "frazionamento") return `1 quota → ${fmtN(+o.rapporto, 2)}`; return ""; };
  return `<div class="tablewrap"><table class="mt pm-ops"><thead><tr><th>Data</th><th>Operazione</th><th>Strumento</th><th class="num">Dettaglio</th><th></th></tr></thead><tbody>
    ${list.map(o => { const g = gone.has(String(o.id)); return `<tr class="${g ? "gone" : ""}"><td>${dIt(o.data)}</td><td>${esc(TIPO_L[o.tipo] || o.tipo)}${g ? " <small>annullata</small>" : ""}</td><td>${esc((db.strumenti[o.strumento] || {}).nome || "—")}</td><td class="num">${det(o)}</td><td class="num">${g ? "" : `<button type="button" class="btn sm" data-pmdel="${esc(o.id)}">Annulla</button>`}</td></tr>`; }).join("")}
    </tbody></table></div>${ops.length > 200 ? `<p class="caption">Mostro le 200 più recenti.</p>` : ""}`;
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
  if (t === "dividendo") return all.length ? `<label class="wide">Strumento<select name="sid" required>${opt(all)}</select></label>
      <label>Importo netto incassato (€)<input name="importo" inputmode="decimal" required></label>${date}<button type="submit" class="btn lime">Salva il provento</button>`
    : `<p class="caption">Aggiungi prima uno strumento con un acquisto.</p>`;
  return `<label class="wide">Bene<select name="bene" id="pmBene"><option value="">Nuovo bene (casa, polizza, oro fisico, partecipazione…)</option>${opt(manual, PM.beneId)}</select></label>
      ${PM.beneId ? "" : `<label class="wide">Nome<input name="nome" placeholder="Appartamento a Milano" required></label>`}
      <label>${PM.beneId ? "Nuovo valore stimato (€)" : "Valore (€)"}<input name="valore" inputmode="decimal" required></label>${date}
      <button type="submit" class="btn lime">${PM.beneId ? "Salva la nuova stima" : "Aggiungi il bene"}</button>`;
}
function pmRenderForm() {
  const f = $("#pmForm"); if (!f) return; f.innerHTML = pmForm(); PM.res = null;
  document.querySelectorAll("#pmTipo [data-pmt]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.pmt === PM.tipo)));
}
function pmButton() {
  const b = $("#pmBtn"); if (!b) return;
  if (!pmHas()) { b.classList.remove("has"); $("#pmBtnT").textContent = "Crea il tuo patrimonio"; $("#pmBtnS").textContent = "aggiungi ciò che possiedi: lo ritrovi qui ogni giorno, aggiornato"; return; }
  const R = PM.R || pmCalc(), ses = pmSession(R);
  b.classList.add("has"); $("#pmBtnT").textContent = `Il mio patrimonio · ${fmtEur(R.totale.valore)}`;
  $("#pmBtnS").textContent = ses ? `${ses.d === pmToday() ? "oggi" : dayName(ses.d)} ${sEur(ses.euro)} (${sPct(ses.pct)}) · guadagno ${sEur(R.totale.guadagno)}` : `guadagno ${sEur(R.totale.guadagno)} · apri per aggiornare i prezzi`;
}
function pmRender() {
  const R = pmCalc(), has = pmHas();
  $("#pmAsOf").textContent = PM.loading ? "Aggiorno i prezzi…" : has ? `Aggiornato al ${dIt(pmToday())} · salvato solo in questo browser` : "Salvato solo in questo browser";
  $("#pmKpis").innerHTML = has ? pmKpis(R) : `<div class="pm-empty" style="grid-column:1/-1"><b>Il tuo patrimonio, sempre qui.</b> Aggiungi quello che possiedi: ETF, azioni, fondi, ma anche casa, polizze e altri beni. Ogni volta che torni trovi il valore aggiornato, quanto hai guadagnato e come è andata l'ultima seduta. Senza Excel e senza account.</div>`;
  $("#pmChart").innerHTML = has ? pmChart(R) : ""; $("#pmChart").hidden = !has || R.serie.length < 3;
  $("#pmPos").innerHTML = pmPosTable(R); $("#pmOps").innerHTML = pmOpsTable();
  $("#pmLab").hidden = !R.posizioni.some(p => p.aperta && !PM.db.strumenti[p.id].manuale);
  pmButton();
}
async function pmRefresh(force) {
  if (!pmHas()) { pmRender(); return; }
  PM.loading = true; pmRender();
  try { await pmPrices(force); } finally { PM.loading = false; }
  pmRender();
}

/* ---------- apertura ---------- */
function pmOpen() {
  trackOnce("feature", "patrimonio", { name: "patrimonio" });
  pmDb(); pmRenderForm(); pmRender();
  const el = $("#patrimonio"); el.classList.add("open"); el.setAttribute("aria-hidden", "false"); el.scrollTop = 0; document.body.classList.add("bd-on");
  pmRefresh(false);
}
function pmClose() { const el = $("#patrimonio"); el.classList.remove("open"); el.setAttribute("aria-hidden", "true"); document.body.classList.remove("bd-on"); pmButton(); }

/* ---------- salvataggio delle operazioni ---------- */
function pmAdd(op) { const db = pmDb(); db.operazioni.push({ id: newId(), ...op }); return pmSave(); }
async function pmSubmit(f) {
  const v = Object.fromEntries(new FormData(f).entries()), db = pmDb(), data = v.data;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || "") || data > pmToday()) return pmMsg("Scegli una data valida, non nel futuro.", "err");
  if (PM.tipo === "acquisto") {
    const qta = num(v.qta), prezzo = num(v.prezzo), spese = num(v.spese) || 0;
    if (!(qta > 0) || !(prezzo > 0)) return pmMsg("Scrivi quante quote e il prezzo per quota.", "err");
    let r = PM.res && PM.res.text === v.str ? PM.res.r : null;
    if (!r) { pmMsg("Cerco lo strumento…"); r = await pmResolve(v.str); }
    if (!r || r.error) return pmMsg(r ? `Non riconosco lo strumento: ${r.error}.` : "Scrivi lo strumento.", "err");
    if (!db.strumenti[r.id]) db.strumenti[r.id] = { nome: r.nome, ticker: r.ticker || null, isin: r.isin || null, simbolo: r.simbolo, valuta: r.valuta || "EUR", classe: r.classe || null };
    if (r.px && !PM.px[r.id]) PM.px[r.id] = r.px;
    const ccy = db.strumenti[r.id].valuta; if (ccy && ccy !== "EUR" && !PM.fx[ccy === "GBX" ? "GBP" : ccy]) await pmPrices(false);
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
      const id = "m-" + newId(); db.strumenti[id] = { nome, valuta: "EUR", classe: "Altro", manuale: true };
      if (!pmAdd({ data, tipo: "acquisto", strumento: id, quantita: 1, prezzo: val })) return; pmMsg(`Aggiunto: ${nome}, ${fmtEur(val)}.`, "ok"); }
  }
  PM.beneId = ""; pmRenderForm(); pmRender(); pmRefresh(false);
}

/* ---------- eventi ---------- */
$("#pmBtn").addEventListener("click", pmOpen);
$("#pmClose").addEventListener("click", pmClose);
document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#patrimonio").classList.contains("open")) pmClose(); });
$("#patrimonio").addEventListener("click", e => {
  const t = e.target.closest("[data-pmt]"); if (t) { PM.tipo = t.dataset.pmt; PM.beneId = ""; pmRenderForm(); pmMsg(""); return; }
  const vb = e.target.closest("[data-pmval]"); if (vb) { PM.tipo = "bene"; PM.beneId = vb.dataset.pmval; pmRenderForm(); pmMsg(""); $("#pmAdd").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  const d = e.target.closest("[data-pmdel]"); if (d) {
    const o = PM.db.operazioni.find(x => String(x.id) === d.dataset.pmdel); if (!o) return;
    const s = PM.db.strumenti[o.strumento] || {};
    if (!confirm(`Annullare ${(TIPO_L[o.tipo] || o.tipo).toLowerCase()} di ${s.nome || "—"} del ${dIt(o.data)}? Resterà nello storico come annullata.`)) return;
    pmAdd({ data: pmToday(), tipo: "annulla", rif: o.id }); pmRenderForm(); pmRender(); return; }
  if (e.target.id === "pmLab") {
    const R = PM.R, open = R.posizioni.filter(p => p.aperta && !PM.db.strumenti[p.id].manuale && p.valore > 0), tot = open.reduce((a, p) => a + p.valore, 0); if (!(tot > 0)) return;
    BD.ports = [open.map(p => { const s = PM.db.strumenti[p.id]; return [s.isin || s.ticker || s.simbolo, Math.round(p.valore / tot * 1000) / 10]; })]; BD.cur = 0;
    $("#bdCap").value = Math.round(tot); pmClose(); bdGo(); return; }
  if (e.target.id === "pmExport") {
    const blob = new Blob([JSON.stringify({ ...PM.db, esportato: new Date().toISOString(), app: "Portfolio OS" }, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `patrimonio-portfolio-os-${pmToday()}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
});
$("#patrimonio").addEventListener("submit", e => { if (!e.target.matches || !e.target.matches("#pmForm")) return; e.preventDefault(); const b = e.target.querySelector("[type=submit]"); if (b) b.disabled = true; pmSubmit(e.target).finally(() => { if (b) b.disabled = false; }); });
$("#patrimonio").addEventListener("change", async e => {
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
    PM.db = { v: 1, strumenti: x.strumenti, operazioni: x.operazioni, creato: x.creato || new Date().toISOString() }; PM.px = {}; PM.fx = {};
    if (!pmSave()) return; pmMsg(`Ripristinato: ${x.operazioni.length} operazioni.`, "ok"); pmRenderForm(); pmRefresh(true);
  } catch (err) { pmMsg(`Non riesco a leggere la copia: ${err.message}.`, "err"); }
});

export { PM, pmCalc, pmClose, pmHas, pmOpen, pmRender };
