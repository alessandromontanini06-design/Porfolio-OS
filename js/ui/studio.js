/* Studio del consulente (20/11/2026, ramo studio-consulente, NON pubblicato).
   - pagina «Studio» (scena studio, solo con ruolo consulente): chi sentire, clienti, portafogli modello;
   - profilo del cliente: questionario di 8 domande → numero di rischio da 1 a 100 (POS.profiloPunteggio);
   - adeguatezza nei Risultati del laboratorio (#adeCard): profilo contro portafoglio (POS.adeguatezza), dichiarazione in PDF;
   - portafogli modello dello studio (pos-modelli-v1): si creano dal costruttore, dal laboratorio o da un esempio, si aprono nel costruttore,
     si assegnano ai clienti e mostrano lo scostamento per classe.
   Strumento di SUPPORTO: la valutazione di adeguatezza resta del consulente. I dati restano nel browser (archivio e localStorage). */
import { $, P, S, esc, fmtPct } from "./core.js";
import { fmtEur, riskWeights } from "./analisi.js";
import { pfAsset } from "./portafoglio.js";
import { BD, PRESETS, bdCls, bdFind, openBuilder } from "./importa.js";
import { arAgo, svList, svOpen, svPatch } from "./archivio.js";
import { go, current } from "./scene.js";

const MOD_KEY = "pos-modelli-v1";
const ruoloPro = () => document.body.dataset.ruolo === "pro";
const pc = (x, d = 0) => Number.isFinite(x) ? fmtPct(x, d) : "—";

/* ---------- classi degli strumenti ---------- */
function normCls(c) { const s = String(c || ""); return /cript/i.test(s) ? "Cripto" : /oro|materie|gold/i.test(s) ? "Oro" : /liquid/i.test(s) ? "Liquidità" : /obblig/i.test(s) ? "Obbligazioni" : /azion/i.test(s) ? "Azioni" : ""; }
/* nome, classe e «è un fondo?» di uno strumento: dal catalogo, poi dalle colonne ricostruite (nome completo), poi dalle posizioni (ISIN) */
function strumento(code) {
  const f = bdFind(code) || [], c = String(code);
  const col = S.rb && S.rb.cols ? S.rb.cols.find(x => x.name === c) : null;
  const pos = S.portfolio && S.portfolio.positions ? S.portfolio.positions.find(p => p.ticker === c || p.nome === c) : null;
  const nome = f[1] || (col && col.nome && col.nome !== c ? col.nome : "") || (pos && pos.nome) || c;
  const isin = f[2] || (pos && pos.isin) || "";
  const classe = normCls(f[3]) || normCls(bdCls(code) !== "Altro" ? bdCls(code) : "") || P.classeDaNome(nome);
  const fondo = f[7] === "ETF" || f[4] === "ETF" || /^(IE|LU)[A-Z0-9]{10}$/.test(isin) || !!(pos && pos.etf && !pos.stima) || undefined;
  return { code: c, nome, classe, ...(fondo ? { fondo: true } : {}) };
}
const CLS_ORD = ["Azioni", "Obbligazioni", "Liquidità", "Oro", "Cripto"];
const CLS_COL = { Azioni: "var(--st-az,#7A2BEF)", Obbligazioni: "#2E6FD1", "Liquidità": "#1D9A8A", Oro: "#C99A00", Cripto: "#D4572E" };
function barra(by) {
  const parti = CLS_ORD.filter(c => by[c] > 0.001).map(c => `<i style="width:${(by[c] * 100).toFixed(1)}%;background:${CLS_COL[c]}" title="${c} ${pc(by[c])}"></i>`).join("");
  return `<span class="st-bar">${parti}</span>`;
}
const legenda = by => CLS_ORD.filter(c => by[c] > 0.001).map(c => `<span><i style="background:${CLS_COL[c]}"></i>${c} ${pc(by[c])}</span>`).join("");

/* ---------- portafogli modello ---------- */
function modLoad() { try { const a = JSON.parse(localStorage.getItem(MOD_KEY) || "[]"); return Array.isArray(a) ? a.filter(m => m && m.id && Array.isArray(m.righe)) : []; } catch { return []; } }
function modSave(a) { try { localStorage.setItem(MOD_KEY, JSON.stringify(a)); return true; } catch { return false; } }
const modId = () => "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function modPesi(m) { const t = m.righe.reduce((a, r) => a + (+r[1] || 0), 0) || 1; return m.righe.filter(r => String(r[0]).trim() && +r[1] > 0).map(r => ({ ...strumento(r[0]), w: (+r[1] || 0) / t })); }
function modAdd(nome, righe, banda = .05) {
  righe = righe.filter(r => String(r[0]).trim() && +r[1] > 0).map(r => [String(r[0]).trim(), Math.round(+r[1] * 10) / 10]);
  if (!righe.length) return null;
  const a = modLoad(), m = { id: modId(), nome: String(nome || "Modello").slice(0, 60), banda, righe, at: Date.now() };
  a.push(m); return modSave(a) ? m : null;
}
function modNome(base) { const a = modLoad(); let n = base, i = 2; while (a.some(m => m.nome === n)) n = `${base} ${i++}`; return n; }

/* ---------- dati del portafoglio aperto nel laboratorio ---------- */
function pfDati(wIn) {
  if (!S.lab || !S.ds || !S.ds.ok) return null;
  try {
    const ds = S.ds, f = ds.freq.f, w = wIn || riskWeights().w, pa = pfAsset(w, "Portafoglio"), st = P.stats(pa, f, ds.dates), r = P.portfolioReturns(ds.assets, w);
    const pesi = ds.assets.map((a, i) => ({ ...strumento(a.name), w: w[i] })).filter(x => x.w > 0.0005);
    return { vol: st.vol, cagr: st.cagr, mdd: st.mdd, peggiore12: P.peggiore12(r, f), pesi };
  } catch { return null; }
}
const clienteNome = () => { const n = String(S.source && S.source.name || "").replace(/ · ricostruito$/, "").replace(/\.(xlsx|xlsm|xls|ods|csv|txt)$/i, ""); return S.source && S.source.builder ? "" : n; };

/* ---------- profilo del cliente: questionario ---------- */
const PR = { ctx: null, ans: {}, nome: "" };
function prDrawer() {
  let el = $("#stPr"); if (el) return el;
  el = document.createElement("aside"); el.className = "drawer builder st-pr"; el.id = "stPr"; el.setAttribute("aria-label", "Profilo del cliente"); el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<button type="button" class="btn sm x" id="stPrX">Chiudi</button><div id="stPrBody"></div>`;
  document.body.appendChild(el); return el;
}
function prOpen(ctx) {
  PR.ctx = ctx || { lab: true };
  const p = ctx && ctx.profilo ? ctx.profilo : (!ctx || ctx.lab) && S.stProfilo ? S.stProfilo : null;
  PR.ans = p && p.ans ? { ...p.ans } : {}; PR.nome = (p && p.nome) || (ctx && ctx.nome) || clienteNome();
  const el = prDrawer(); prRender(); el.classList.add("open"); el.setAttribute("aria-hidden", "false"); $("#scrim") && $("#scrim").classList.add("open"); el.scrollTop = 0;
  setTimeout(() => { const i = $("#stPrNome"); i && i.focus({ preventScroll: true }); }, 60);
}
function prClose() { const el = $("#stPr"); if (!el || !el.classList.contains("open")) return; el.classList.remove("open"); el.setAttribute("aria-hidden", "true"); if (!document.querySelector(".drawer.open")) $("#scrim") && $("#scrim").classList.remove("open"); }
function prRender() {
  const r = P.profiloPunteggio(PR.ans), done = P.PROFILO_Q.filter(q => Number.isInteger(PR.ans[q.k])).length;
  $("#stPrBody").innerHTML = `<span class="eyebrow">Profilo del cliente · ${done} di ${P.PROFILO_Q.length}</span>
    <h3 class="pr-h">Il profilo di rischio del cliente</h3>
    <p class="caption">Otto domande sul modello del questionario MiFID: conoscenza ed esperienza, obiettivi, tolleranza e capacità di sopportare perdite. Da compilare con il cliente.</p>
    <label class="st-lbl">Cliente<input id="stPrNome" value="${esc(PR.nome)}" placeholder="Nome e cognome" maxlength="80" autocomplete="off"></label>
    ${P.PROFILO_Q.map((q, i) => `<fieldset class="st-q"><legend>${i + 1}. ${esc(q.q)}</legend><div class="st-opts">${q.o.map((o, j) => `<button type="button" class="pr-opt${PR.ans[q.k] === j ? " on" : ""}" data-stq="${q.k}" data-stv="${j}" aria-pressed="${PR.ans[q.k] === j}">${esc(o)}</button>`).join("")}</div></fieldset>`).join("")}
    <div class="st-res" id="stPrRes">${r.completo ? `<div><span class="eyebrow">Numero di rischio del profilo</span><b>${r.n}</b><small>${r.classe} · perdita accettata fino al ${pc(r.perdita)} in un anno · orizzonte ${r.orizzonte}${r.tetti.length ? ` · limitato da: ${r.tetti.join(", ")}` : ""}</small></div>${scala([[r.n, "profilo"]])}` : `<span class="caption">Mancano ${P.PROFILO_Q.length - done} risposte per calcolare il profilo.</span>`}</div>
    <div class="st-acts"><button type="button" class="btn lime" id="stPrSave"${r.completo ? "" : " disabled"}>Salva il profilo</button><button type="button" class="btn" id="stPrNo">Annulla</button></div>
    <p class="caption">Il punteggio pesa per il 60% la tolleranza al rischio (obiettivo, perdita accettata, reazione a un calo) e per il 40% la capacità di sopportarlo (orizzonte, riserva, peso sul patrimonio). Un orizzonte breve o una perdita accettata bassa mettono un tetto. Strumento di supporto: la valutazione resta del consulente.</p>`;
}
async function prSave() {
  const r = P.profiloPunteggio(PR.ans); if (!r.completo) return;
  const prof = { ans: { ...PR.ans }, nome: ($("#stPrNome").value || "").trim().slice(0, 80), at: Date.now() };
  const ctx = PR.ctx || {};
  if (ctx.recId) { await svPatch(ctx.recId, rec => { rec.profilo = prof; }).catch(() => {}); if (S.svSaved === ctx.recId) S.stProfilo = prof; }
  else { S.stProfilo = prof; if (S.svSaved) await svPatch(S.svSaved, rec => { rec.profilo = prof; }).catch(() => {}); }
  prClose(); renderAde(); if (current === "studio") stRender();
}
document.addEventListener("click", e => {
  if (e.target.closest("#stPrX") || e.target.closest("#stPrNo")) { prClose(); return; }
  const b = e.target.closest("[data-stq]");
  if (b) { PR.nome = ($("#stPrNome") || {}).value || PR.nome; PR.ans[b.dataset.stq] = +b.dataset.stv; const y = $("#stPr").scrollTop; prRender(); $("#stPr").scrollTop = y; return; }
  if (e.target.closest("#stPrSave")) prSave();
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#stPr") && $("#stPr").classList.contains("open")) prClose(); });
document.addEventListener("click", e => { if (e.target.id === "scrim") prClose(); });

/* scala da 1 a 100 con i segni (profilo, portafoglio) */
function scala(marks) {
  return `<div class="st-scala" role="img" aria-label="${marks.map(m => `${m[1]} ${m[0]}`).join(", ")} su 100">
    <span class="st-sc-bar"></span>${marks.filter(m => Number.isFinite(m[0])).map((m, i) => `<span class="st-mk ${i ? "b" : "a"}" style="left:${Math.min(100, Math.max(0, m[0]))}%"><span>${esc(m[1])} ${m[0]}</span></span>`).join("")}
    <span class="st-sc-l"><span>1 · prudente</span><span>moderato</span><span>bilanciato</span><span>100 · dinamico</span></span></div>`;
}

/* ---------- adeguatezza nei Risultati ---------- */
const ESITO_L = { ok: "Adeguato", warn: "Da motivare", ko: "Non adeguato" }, ICO = { ok: "✓", warn: "!", ko: "✕" };
function renderAde() {
  const el = $("#adeCard"); if (!el) return;
  const d = pfDati(); if (!d || !(ruoloPro() || S.stProfilo)) { el.hidden = true; return; }
  el.hidden = false;
  const p = S.stProfilo, pr = p ? P.profiloPunteggio(p.ans) : null, n = P.numeroRischio(d.vol), A = pr && pr.completo ? P.adeguatezza(pr, d) : null, by = P.pesiPerClasse(d.pesi);
  el.innerHTML = `<div class="st-ade-h"><div><span class="eyebrow">Per il consulente${p && p.nome ? ` · ${esc(p.nome)}` : ""}</span><h3>Adeguatezza al profilo del cliente</h3></div>
      ${A ? `<span class="st-esito ${A.esito}">${ESITO_L[A.esito]}</span>` : ""}</div>
    ${scala(A ? [[pr.n, "Profilo"], [n, "Portafoglio"]] : [[n, "Portafoglio"]])}
    <div class="st-ade-k"><div><span>Numero di rischio</span><b>${Number.isFinite(n) ? n : "—"}</b><small>${P.classeRischio(n)} · volatilità ${pc(d.vol, 1)} l'anno</small></div>
      <div><span>12 mesi peggiori</span><b class="dn">${pc(d.peggiore12, 0)}</b><small>nei dati storici, con i pesi di oggi</small></div>
      <div><span>Composizione</span>${barra(by)}<small class="st-leg">${legenda(by)}</small></div></div>
    ${A ? `<ul class="st-checks">${A.controlli.map(c => `<li class="${c.esito}"><span class="st-ico" aria-hidden="true">${ICO[c.esito]}</span><div><b>${esc(c.titolo)}</b><p>${esc(c.testo)}</p></div><span class="st-tag ${c.esito}">${c.esito === "ok" ? "ok" : c.esito === "warn" ? "da motivare" : "non adeguato"}</span></li>`).join("")}</ul>`
      : `<p class="st-noprof">Manca il profilo del cliente: con 8 domande controllo rischio, perdita sopportabile, orizzonte, concentrazione e strumenti complessi.</p>`}
    ${A ? proposteHTML(pr) : ""}
    <div class="st-acts"><button type="button" class="btn ${A ? "" : "lime"}" data-stact="profilo">${A ? "Modifica il profilo" : "Compila il profilo del cliente · 8 domande"}</button>
      ${A ? `<button type="button" class="btn lime" data-stact="dich">Dichiarazione di adeguatezza (PDF)</button>` : ""}
      <button type="button" class="btn" data-stact="modello">Salva come portafoglio modello</button></div>
    <p class="caption" id="stAdeMsg" role="status"></p>
    <p class="caption">Strumento di supporto alla valutazione di adeguatezza: rischio dalla volatilità storica dei prezzi mensili, perdite storiche con i pesi di oggi. La valutazione finale spetta al consulente secondo le procedure del suo studio.</p>`;
}
/* le allocazioni del confronto A/B (le proposte al cliente) passano dagli stessi controlli */
function proposte(pr) {
  if (!S.cmp || !S.cmp.ports || !S.ds) return [];
  const cur = riskWeights().w, norm = w => { const t = w.reduce((a, x) => a + (x > 0 ? x : 0), 0); return t > 0 ? w.map(x => (x > 0 ? x : 0) / t) : null; };
  return S.cmp.ports.map(p => ({ name: p.name, w: norm(p.w || []) })).filter(p => p.w && p.w.some((x, i) => Math.abs(x - (cur[i] || 0)) > .005))
    .map(p => { const d = pfDati(p.w), A = d && P.adeguatezza(pr, d); return A ? { name: p.name, A } : null; }).filter(Boolean);
}
function proposteHTML(pr) {
  const L = proposte(pr); if (!L.length) return "";
  return `<div class="st-prop"><b>Le proposte del confronto</b>${L.map(x => `<div class="st-prop-r"><span>Allocazione ${esc(x.name)} · rischio ${x.A.numero}</span><span class="st-tag ${x.A.esito}">${ESITO_L[x.A.esito]}</span><small>${x.A.controlli.filter(c => c.esito !== "ok").map(c => esc(c.testo)).join(" ") || "Tutti i controlli superati."}</small></div>`).join("")}</div>`;
}
let adeT = null;
document.addEventListener("input", e => { if (e.target.closest("#cmpCard")) { clearTimeout(adeT); adeT = setTimeout(renderAde, 400); } });
document.addEventListener("click", e => { if (e.target.closest("#cmpCard")) { clearTimeout(adeT); adeT = setTimeout(renderAde, 400); } });
document.addEventListener("pos-lab", renderAde);
document.addEventListener("click", e => {
  const a = e.target.closest("[data-stact]"); if (!a) return;
  const v = a.dataset.stact;
  if (v === "profilo") prOpen({ lab: true });
  if (v === "dich") dichiarazione();
  if (v === "modello") { const d = pfDati(); if (!d) return; const m = modAdd(modNome(clienteNome() ? `Come ${clienteNome()}` : "Modello dal laboratorio"), d.pesi.map(x => [x.code, Math.round(x.w * 1000) / 10]));
    const msg = $("#stAdeMsg"); if (msg) { msg.textContent = m ? `Salvato tra i portafogli modello come «${m.nome}». Lo trovi nello Studio.` : "Non riesco a salvare il modello in questo browser."; msg.className = "caption " + (m ? "ok" : "err"); } }
});

/* ---------- dichiarazione di adeguatezza (stampa come il report) ---------- */
function brand() { try { return JSON.parse(localStorage.getItem("pos-brand-v1") || "{}") || {}; } catch { return {}; } }
function dichiarazioneHTML() {
  const d = pfDati(), p = S.stProfilo, pr = p && P.profiloPunteggio(p.ans); if (!d || !pr || !pr.completo) return null;
  const A = P.adeguatezza(pr, d), B = brand(), oggi = new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  const risp = P.PROFILO_Q.map(q => `<tr><td>${esc(q.q)}</td><td>${esc(q.o[p.ans[q.k]])}</td></tr>`).join("");
  return `<div class="st-doc">
    <header class="st-doc-h">${B.logo ? `<img src="${B.logo}" alt="">` : ""}<div><b>${esc(B.studio || "Studio di consulenza")}</b>${B.contact ? `<small>${esc(B.contact)}</small>` : ""}</div><span>${oggi}</span></header>
    <h1>Dichiarazione di adeguatezza</h1>
    <p class="st-doc-l">Cliente: <b>${esc(p.nome || "________________________")}</b> · Portafoglio: ${esc(S.source && S.source.name || "—")}</p>
    <h2>Esito: ${ESITO_L[A.esito]}</h2>
    <table><thead><tr><th>Controllo</th><th>Esito</th><th>Dettaglio</th></tr></thead><tbody>${A.controlli.map(c => `<tr><td>${esc(c.titolo)}</td><td><b>${c.esito === "ok" ? "Adeguato" : c.esito === "warn" ? "Da motivare" : "Non adeguato"}</b></td><td>${esc(c.testo)}</td></tr>`).join("")}</tbody></table>
    <h2>Profilo del cliente: ${pr.n} su 100 (${pr.classe.toLowerCase()})</h2>
    <table><tbody>${risp}</tbody></table>
    <h2>Portafoglio: numero di rischio ${A.numero} (${A.classe.toLowerCase()})</h2>
    <table><thead><tr><th>Strumento</th><th>Classe</th><th>Peso</th></tr></thead><tbody>${d.pesi.slice().sort((a, b) => b.w - a.w).map(x => `<tr><td>${esc(x.nome)}</td><td>${x.classe}</td><td>${pc(x.w, 1)}</td></tr>`).join("")}</tbody></table>
    <p>Volatilità storica ${pc(d.vol, 1)} l'anno · rendimento annuo storico ${pc(d.cagr, 1)} · 12 mesi peggiori ${pc(d.peggiore12, 0)} · calo massimo ${pc(d.mdd, 0)}.</p>
    <h2>Motivazione del consulente</h2><div class="st-doc-box"></div>
    <div class="st-doc-firme"><div>Il consulente<span></span></div><div>Il cliente<span></span></div></div>
    <p class="st-doc-n">Documento preparato con Quanta Portfolio come supporto alla valutazione di adeguatezza. Rischio calcolato dalla volatilità storica dei prezzi; le perdite e i rendimenti passati non garantiscono quelli futuri. La valutazione finale spetta al consulente secondo le procedure del proprio studio.</p></div>`;
}
function dichiarazione() {
  const h = dichiarazioneHTML(); if (!h) return;
  let el = $("#report"); if (!el) { el = document.createElement("section"); el.id = "report"; el.setAttribute("aria-hidden", "true"); document.body.appendChild(el); }
  el.innerHTML = h; const old = document.title; document.title = `Dichiarazione di adeguatezza · ${S.stProfilo.nome || "cliente"}`;
  setTimeout(() => { window.print(); document.title = old; }, 80);
}
window.__dichiarazione = dichiarazioneHTML; // per i test
/* nel report «per un cliente» (report.js): rischio, profilo e adeguatezza in apertura, il «secondo parere» in una tabella */
window.__stReport = () => {
  const d = pfDati(); if (!d) return "";
  const p = S.stProfilo, pr = p && P.profiloPunteggio(p.ans), A = pr && pr.completo ? P.adeguatezza(pr, d) : null, n = P.numeroRischio(d.vol), by = P.pesiPerClasse(d.pesi);
  const row = (k, v, x) => `<tr><td>${esc(k)}</td><td class="n">${v}</td><td class="d">${x}</td></tr>`;
  return `<h2>In sintesi</h2><table class="rp-t">
    ${row("Numero di rischio", `${Number.isFinite(n) ? n : "—"} su 100`, `${P.classeRischio(n).toLowerCase()} · volatilità ${pc(d.vol, 1)} l'anno`)}
    ${row("12 mesi peggiori", pc(d.peggiore12, 0), "nei dati storici, con i pesi di oggi")}
    ${row("Composizione", CLS_ORD.filter(c => by[c] > .001).map(c => `${c} ${pc(by[c])}`).join(" · "), "per classe di strumenti")}
    ${A ? row("Profilo del cliente", `${pr.n} su 100`, `${pr.classe.toLowerCase()} · perdita accettata fino al ${pc(pr.perdita)} · orizzonte ${pr.orizzonte}`) + row("Adeguatezza", ESITO_L[A.esito], A.controlli.filter(c => c.esito !== "ok").map(c => c.titolo.toLowerCase()).join(", ") || "tutti i controlli superati") : ""}
  </table>${A ? `<table class="rp-t">${A.controlli.map(c => row(c.titolo, c.esito === "ok" ? "ok" : c.esito === "warn" ? "da motivare" : "non adeguato", esc(c.testo))).join("")}</table>` : ""}`;
};

/* ---------- pagina Studio ---------- */
const ST = { mod: null, conf: null };
const GIORNO = 864e5;
async function stRender() {
  const box = $("#stBody"); if (!box) return;
  const L = (await svList()).sort((a, b) => (b.snap && b.snap.value || 0) - (a.snap && a.snap.value || 0)), M = modLoad(), now = Date.now();
  const rows = L.map(r => {
    const s = r.snap || {}, pr = r.profilo ? P.profiloPunteggio(r.profilo.ans) : null, n = P.numeroRischio(s.vol);
    const pesi = (s.weights || []).map(([nm, w]) => ({ ...strumento(nm), w })), m = M.find(x => x.id === r.modello);
    const sc = m && pesi.length ? P.scostamento(modPesi(m), pesi, m.banda) : null, gg = Math.floor((now - (r.reviewedAt || r.savedAt || now)) / GIORNO);
    return { r, s, pr: pr && pr.completo ? pr : null, n, m, sc, gg, by: P.pesiPerClasse(pesi) };
  });
  /* avvisi: chi sentire */
  const al = [];
  for (const x of rows) {
    const nm = esc(x.r.name);
    if (x.gg > 365) al.push({ l: 0, h: `<b>${nm}</b><span class="st-tag ko">revisione scaduta</span><p>Ultima revisione ${arAgo(x.r.reviewedAt)}: la verifica dell'adeguatezza va rifatta almeno una volta l'anno.</p>`, id: x.r.id, b: "Apri e rivedi" });
    else if (x.gg > 330) al.push({ l: 1, h: `<b>${nm}</b><span class="st-tag warn">revisione in scadenza</span><p>Ultima revisione ${arAgo(x.r.reviewedAt)}: tra ${365 - x.gg} giorni compie un anno.</p>`, id: x.r.id, b: "Apri" });
    if (x.pr && Number.isFinite(x.n) && x.n - x.pr.n > 5) al.push({ l: x.n - x.pr.n > 15 ? 0 : 1, h: `<b>${nm}</b><span class="st-tag ${x.n - x.pr.n > 15 ? "ko" : "warn"}">rischio sopra il profilo</span><p>Numero di rischio ${x.n} contro ${x.pr.n} del profilo ${x.pr.classe.toLowerCase()}.</p>`, id: x.r.id, b: "Apri" });
    if (x.sc && x.sc.fuori) { const r0 = x.sc.righe.slice().sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0];
      al.push({ l: 1, h: `<b>${nm}</b><span class="st-tag warn">fuori dal modello</span><p>${r0.classe} al ${pc(r0.cliente)} contro il ${pc(r0.modello)} del modello «${esc(x.m.nome)}» (banda ±${pc(x.m.banda)}).</p>`, id: x.r.id, b: "Apri" }); }
    if (!x.pr) al.push({ l: 2, h: `<b>${nm}</b><span class="st-tag info">manca il profilo</span><p>Senza profilo non posso controllare l'adeguatezza.</p>`, prof: x.r.id, b: "Compila il profilo" });
  }
  al.sort((a, b) => a.l - b.l);
  const tot = rows.reduce((a, x) => a + (x.s.value || 0), 0), daRiv = rows.filter(x => x.gg > 330).length, fuori = rows.filter(x => (x.pr && x.n - x.pr.n > 5) || (x.sc && x.sc.fuori)).length;
  const modOpts = id => `<option value="">nessun modello</option>` + M.map(m => `<option value="${m.id}"${m.id === id ? " selected" : ""}>${esc(m.nome)}</option>`).join("");
  box.innerHTML = `
    <div class="st-top"><div class="st-acts"><button type="button" class="btn lime" data-stgo="file">Carica il file di un cliente</button><button type="button" class="btn" data-stgo="build">Costruisci un portafoglio</button>${S.lab ? `<button type="button" class="btn" data-stgo="lab">Torna ai risultati aperti</button>` : ""}</div></div>
    <div class="kpis st-kpis">
      <div class="kpi"><span class="eyebrow">Patrimonio seguito</span><div class="v">${tot > 0 ? fmtEur(tot) : "—"}</div><small>all'ultimo salvataggio di ogni cliente</small></div>
      <div class="kpi"><span class="eyebrow">Clienti</span><div class="v">${rows.length}</div><small>${rows.filter(x => x.pr).length} con il profilo compilato</small></div>
      <div class="kpi"><span class="eyebrow">Revisioni da fare</span><div class="v">${daRiv}</div><small>scadute o entro 35 giorni</small></div>
      <div class="kpi"><span class="eyebrow">Fuori profilo o modello</span><div class="v">${fuori}</div><small>da sentire</small></div>
    </div>
    ${!rows.length ? `<section class="card st-empty"><h3>Il tuo studio è vuoto</h3><p>Carica il file della banca di un cliente, oppure costruisci un portafoglio, poi salvalo dai Risultati: comparirà qui con profilo, rischio e revisioni.</p></section>` : `
    <section class="card st-card"><div class="st-h"><h3>Chi sentire</h3><small>${al.length ? `${al.length} ${al.length === 1 ? "cosa da fare" : "cose da fare"}, le più urgenti prima` : "tutto in ordine"}</small></div>
      ${al.length ? `<ul class="st-al">${al.map(a => `<li><i class="st-sev l${a.l}"></i><div>${a.h}</div><button type="button" class="btn sm" ${a.prof ? `data-stprof="${a.prof}"` : `data-stopen="${a.id}"`}>${a.b}</button></li>`).join("")}</ul>` : `<p class="caption">Nessuna revisione scaduta, nessun cliente fuori profilo o fuori modello.</p>`}</section>
    <section class="card st-card"><div class="st-h"><h3>Clienti</h3><small>dal più grande · rischio da 1 a 100</small></div>
      <div class="tablewrap"><table class="mt st-t"><thead><tr><th>Cliente</th><th>Valore</th><th>Rendimento</th><th>Rischio</th><th>Profilo</th><th>Modello</th><th>Revisione</th><th></th></tr></thead><tbody>
      ${rows.map(x => `<tr><td><b>${esc(x.r.name)}</b>${barra(x.by)}</td><td class="mono">${x.s.value > 0 ? fmtEur(x.s.value) : "—"}</td><td class="mono">${Number.isFinite(x.s.xirr) ? fmtPct(x.s.xirr, 1, true) : Number.isFinite(x.s.cagr) ? fmtPct(x.s.cagr, 1, true) : "—"}</td>
        <td class="mono">${Number.isFinite(x.n) ? x.n : "—"}</td><td>${x.pr ? `<span class="st-tag ${x.n - x.pr.n > 15 ? "ko" : x.n - x.pr.n > 5 ? "warn" : "ok"}">${x.pr.n} · ${x.pr.classe.toLowerCase()}</span>` : `<button type="button" class="st-link" data-stprof="${x.r.id}">compila</button>`}</td>
        <td><select class="st-sel" data-stmod="${x.r.id}" aria-label="Modello di ${esc(x.r.name)}">${modOpts(x.r.modello)}</select>${x.sc ? `<small class="${x.sc.fuori ? "dn" : "up"}">scarto max ${pc(x.sc.max)}</small>` : ""}</td>
        <td>${arAgo(x.r.reviewedAt)}</td><td><button type="button" class="btn sm" data-stopen="${x.r.id}">Apri</button></td></tr>`).join("")}
      </tbody></table></div></section>`}
    <section class="card st-card"><div class="st-h"><h3>Portafogli modello</h3><small>i modelli dello studio: si aprono nel costruttore e si assegnano ai clienti</small></div>
      <div class="st-acts"><button type="button" class="btn" data-stgo="fromBuild">Salva il portafoglio del costruttore</button><select class="st-sel" id="stEs" aria-label="Parti da un esempio"><option value="">Parti da un esempio…</option>${PRESETS.map((p, i) => `<option value="${i}">${esc(p[0])}</option>`).join("")}</select></div>
      ${M.length ? `<div class="st-mods">${M.map(m => { const pe = modPesi(m), by = P.pesiPerClasse(pe), n_ = rows.filter(x => x.r.modello === m.id).length;
        return `<article class="st-mod"><div class="st-mod-h"><input class="st-mod-n" data-stren="${m.id}" value="${esc(m.nome)}" aria-label="Nome del modello" maxlength="60"><small>${n_} ${n_ === 1 ? "cliente" : "clienti"}</small></div>${barra(by)}<small class="st-leg">${legenda(by)}</small>
          <ol class="st-mod-r">${pe.slice().sort((a, b) => b.w - a.w).slice(0, 6).map(x => `<li><span>${esc(x.nome)}</span><b>${pc(x.w, 1)}</b></li>`).join("")}${pe.length > 6 ? `<li><span>e altri ${pe.length - 6}</span></li>` : ""}</ol>
          <div class="st-mod-f"><label>Banda <select class="st-sel" data-stbanda="${m.id}">${[.03, .05, .1].map(b => `<option value="${b}"${Math.abs(m.banda - b) < 1e-9 ? " selected" : ""}>±${pc(b)}</option>`).join("")}</select></label>
            <button type="button" class="btn sm" data-stbuild="${m.id}">Apri nel costruttore</button>${ST.conf === m.id ? `<button type="button" class="btn sm st-del" data-stdel="${m.id}">Elimina davvero</button>` : `<button type="button" class="st-link" data-stdelask="${m.id}">elimina</button>`}</div></article>`; }).join("")}</div>`
        : `<p class="caption">Nessun modello: salva quello che hai nel costruttore, parti da un esempio, oppure dai Risultati di un cliente con «Salva come portafoglio modello».</p>`}
      <p class="caption" id="stMsg" role="status"></p></section>
    <p class="caption">Rischio da 1 a 100 dalla volatilità storica; scostamento per classe di strumenti. I clienti sono le analisi salvate in questo browser: fanne una copia di sicurezza dall'archivio.</p>`;
}
function stMsg(t, k) { const m = $("#stMsg"); if (m) { m.textContent = t; m.className = "caption " + (k || ""); } }
document.addEventListener("pos-scena", e => { if (e.detail === "studio") stRender(); });
document.addEventListener("click", async e => {
  const o = e.target.closest("[data-stopen]"); if (o) { svOpen(o.dataset.stopen); return; }
  const pf = e.target.closest("[data-stprof]"); if (pf) { const L = await svList(), r = L.find(x => x.id === pf.dataset.stprof); if (r) prOpen({ recId: r.id, nome: r.name, profilo: r.profilo }); return; }
  const g = e.target.closest("[data-stgo]");
  if (g) { const v = g.dataset.stgo;
    if (v === "file") { const f = $("#file"); f && f.click(); }
    if (v === "build") openBuilder();
    if (v === "lab") go("lab");
    if (v === "fromBuild") { const rows = BD.rows.filter(r => String(r[0]).trim() && +r[1] > 0); if (!rows.length) { stMsg("Il costruttore è vuoto: apri «Costruisci un portafoglio», scegli strumenti e pesi, poi torna qui.", "err"); return; }
      const m = modAdd(modNome("Modello dello studio"), rows); stRender().then(() => stMsg(m ? `Salvato «${m.nome}».` : "Non riesco a salvare il modello.", m ? "ok" : "err")); }
    return; }
  const b = e.target.closest("[data-stbuild]"); if (b) { const m = modLoad().find(x => x.id === b.dataset.stbuild); if (m) { BD.ports[BD.cur] = m.righe.map(r => [...r]); openBuilder(); } return; }
  const da = e.target.closest("[data-stdelask]"); if (da) { ST.conf = da.dataset.stdelask; stRender(); return; }
  const dl = e.target.closest("[data-stdel]"); if (dl) { modSave(modLoad().filter(m => m.id !== dl.dataset.stdel)); ST.conf = null; stRender(); return; }
});
document.addEventListener("change", async e => {
  const s = e.target.closest("[data-stmod]"); if (s) { await svPatch(s.dataset.stmod, r => { r.modello = s.value || null; }).catch(() => {}); stRender(); return; }
  const bn = e.target.closest("[data-stbanda]"); if (bn) { const a = modLoad(), m = a.find(x => x.id === bn.dataset.stbanda); if (m) { m.banda = +bn.value; modSave(a); stRender(); } return; }
  const rn = e.target.closest("[data-stren]"); if (rn) { const a = modLoad(), m = a.find(x => x.id === rn.dataset.stren); if (m && rn.value.trim()) { m.nome = rn.value.trim().slice(0, 60); modSave(a); stRender(); } return; }
  if (e.target.id === "stEs" && e.target.value !== "") { const p = PRESETS[+e.target.value]; if (p) { const m = modAdd(modNome(p[0]), p[1]); stRender().then(() => stMsg(m ? `Aggiunto «${m.nome}».` : "Non riesco a salvare il modello.", m ? "ok" : "err")); } }
});
/* il ruolo cambia: la voce «Studio» compare o sparisce; se si lascia il ruolo consulente mentre si è nello Studio, si torna in home */
new MutationObserver(() => { if (!ruoloPro() && current === "studio") go("home"); renderAde(); }).observe(document.body, { attributes: true, attributeFilter: ["data-ruolo"] });

export { modLoad, modAdd, prOpen, renderAde, stRender, dichiarazioneHTML };
