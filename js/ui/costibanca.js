/* Portfolio OS · interfaccia · «Quanto ti costa la tua banca»: il rendiconto annuale costi e oneri (MiFID II) reso chiaro.
   Ogni anno la banca deve mandare il rendiconto dei costi dell'anno prima, in euro e in percentuale. Qui si scrivono i suoi numeri
   (servizi, prodotti, di cui incentivi), anche come percentuale: costo totale, al mese, in 10 e 20 anni, confronto con un portafoglio di ETF.
   Tutto resta nel browser (pos-rendiconto-v1); niente file, niente server. Non è un consiglio di investimento. */
import { $, P, esc, fmtN, fmtPct } from "./core.js";
import { go } from "./scene.js";

const CB_KEY = "pos-rendiconto-v1", CB_R = 0.05, CB_ETF = 0.002;
const eur = v => Number.isFinite(v) ? Math.round(v).toLocaleString("it-IT", { useGrouping: "always" }) + " €" : "—";
const eur2 = v => Number.isFinite(v) ? v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" }) + " €" : "—";
/* «350», «1.250,50», «0,9%» → {v, pct} */
function cbNum(s) {
  const t = String(s || "").trim(); if (!t) return null;
  const pct = /%/.test(t), c = t.replace(/[€%\s]/g, "");
  const n = /,/.test(c) ? +c.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(c) ? +c.replace(/\./g, "") : +c;
  return Number.isFinite(n) && n >= 0 ? { v: n, pct } : null;
}
const FIELDS = [["pat", "Patrimonio medio dell'anno", "es. 80.000", "il «controvalore medio» o il valore del portafoglio"],
  ["serv", "Costi dei servizi", "es. 600 oppure 0,75%", "consulenza, gestione, custodia, commissioni di compravendita"],
  ["prod", "Costi dei prodotti", "es. 1.200 oppure 1,5%", "costi dei fondi e degli altri strumenti (costi correnti, ingresso, uscita)"],
  ["inc", "di cui incentivi a terzi", "es. 500 oppure 0,6%", "«pagamenti ricevuti da terzi» o «retrocessioni»: sono già dentro i costi qui sopra"]];
function cbLoad() { try { return JSON.parse(localStorage.getItem(CB_KEY) || "{}") || {}; } catch { return {}; } }
function cbSave(v) { try { localStorage.setItem(CB_KEY, JSON.stringify(v)); } catch {} }
/* il calcolo: tutto in euro e in percentuale del patrimonio medio */
function cbCalc(v) {
  const pat = cbNum(v.pat), base = pat && !pat.pct ? pat.v : NaN;
  const toEur = f => { const x = cbNum(v[f]); if (!x) return 0; return x.pct ? (Number.isFinite(base) ? base * x.v / 100 : NaN) : x.v; };
  const serv = toEur("serv"), prod = toEur("prod"), inc = toEur("inc"), tot = serv + prod;
  if (!(base > 0) || !(tot > 0) || !Number.isFinite(tot)) return null;
  const pct = tot / base, etf = base * CB_ETF;
  return { base, serv, prod, inc: Math.min(inc, tot), tot, pct, mese: tot / 12, d10: P.terDrag(base, pct, CB_R, 10), d20: P.terDrag(base, pct, CB_R, 20),
    etf, risp: Math.max(0, tot - etf), risp20: Math.max(0, P.terDrag(base, pct, CB_R, 20) - P.terDrag(base, CB_ETF, CB_R, 20)), lv: pct < 0.006 ? "basso" : pct < 0.015 ? "medio" : "alto" };
}
function cbRender() {
  const box = $("#cbOut"); if (!box) return;
  const v = cbLoad(), R = cbCalc(v);
  if (!R) { box.innerHTML = `<p class="cb-hint">Scrivi il patrimonio medio e almeno un costo: in euro (come «600») o in percentuale (come «0,75%»).</p>`; return; }
  const parts = [["Servizi", R.serv], ["Prodotti", R.prod]].filter(x => x[1] > 0);
  box.innerHTML = `<div class="cb-hero"><span>Ogni anno paghi</span><b>${eur(R.tot)}</b><small>${fmtPct(R.pct, 2)} del patrimonio · circa ${eur(R.mese)} al mese</small><i class="cb-lv ${R.lv}">costo ${R.lv}</i></div>
    <div class="cb-bar" role="img" aria-label="Divisione dei costi">${parts.map(([l, x]) => `<span class="cb-seg ${l === "Servizi" ? "s" : "p"}" style="flex:${x}"><b>${l}</b>${eur(x)}</span>`).join("")}</div>
    <div class="cb-k">
      <div><span>In 10 anni</span><b class="dn">−${eur(R.d10)}</b><small>di capitale in meno, per l'effetto composto (rendimento lordo ipotizzato ${fmtPct(CB_R, 0)} l'anno)</small></div>
      <div><span>In 20 anni</span><b class="dn">−${eur(R.d20)}</b><small>sempre sul patrimonio di oggi, senza nuovi versamenti</small></div>
      <div><span>Con ETF a ${fmtPct(CB_ETF, 2)} l'anno</span><b>${eur(R.etf)}</b><small>${R.risp > 1 ? `${eur(R.risp)} in meno ogni anno, ${eur(R.risp20)} di capitale in più in 20 anni` : "costeresti più o meno lo stesso"}</small></div>
    </div>
    ${R.inc > 0 ? `<p class="cb-inc"><b>${eur(R.inc)}</b> (${fmtPct(R.inc / R.tot, 0)} dei costi) sono incentivi: soldi pagati con il tuo patrimonio che i produttori dei fondi girano a chi te li ha venduti. È legale e va dichiarato nel rendiconto; conviene saperlo quando valuti un prodotto o un consulente.</p>` : ""}
    <p class="cb-note">Per confronto: un portafoglio di ETF costa di solito tra lo 0,1% e lo 0,3% l'anno; con un consulente indipendente si aggiunge la sua parcella. Ogni anno di costi è un anno di rendimento in meno: con ${fmtPct(R.pct, 2)} di costi il portafoglio deve rendere almeno ${fmtPct(R.pct, 2)} solo per restare pari. Calcolo indicativo sui numeri che hai scritto: non è un consiglio di investimento.</p>
    <div class="cb-act"><button type="button" class="btn sm" id="cbCopy">Copia il riepilogo</button><button type="button" class="btn sm" id="cbClear">Svuota</button></div>`;
}
function cbFill() {
  const f = $("#cbForm"); if (!f || f.dataset.on) return; f.dataset.on = "1";
  const v = cbLoad();
  f.innerHTML = FIELDS.map(([k, l, ph, h]) => `<label class="cb-f"><span>${esc(l)}</span><input name="${k}" inputmode="decimal" autocomplete="off" placeholder="${esc(ph)}" value="${esc(v[k] || "")}"><small>${esc(h)}</small></label>`).join("");
  cbRender();
}
document.addEventListener("input", e => { const f = e.target.closest("#cbForm"); if (!f) return; const v = Object.fromEntries(new FormData(f).entries()); cbSave(v); cbRender(); });
document.addEventListener("submit", e => { if (e.target.id === "cbForm") e.preventDefault(); });
document.addEventListener("click", e => {
  if (e.target.closest("#cbClear")) { cbSave({}); const f = $("#cbForm"); if (f) { f.dataset.on = ""; cbFill(); } return; }
  if (e.target.closest("#cbCopy")) { const R = cbCalc(cbLoad()); if (!R) return;
    const t = `Quanto costa il portafoglio (dal rendiconto costi e oneri)\nPatrimonio medio: ${eur(R.base)}\nCosti dell'anno: ${eur2(R.tot)} (${fmtPct(R.pct, 2)}), circa ${eur(R.mese)} al mese\n` +
      `  servizi ${eur2(R.serv)} · prodotti ${eur2(R.prod)}${R.inc > 0 ? ` · di cui incentivi ${eur2(R.inc)}` : ""}\nIn 10 anni: −${eur(R.d10)} · in 20 anni: −${eur(R.d20)} di capitale (rendimento lordo ipotizzato 5%)\n` +
      `Con ETF allo 0,20% l'anno: ${eur(R.etf)} l'anno${R.risp > 1 ? `, ${eur(R.risp)} in meno` : ""}\nCalcolato con Portfolio OS. Indicativo, non è un consiglio di investimento.`;
    const b = e.target.closest("#cbCopy"); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { b.textContent = "Copiato"; setTimeout(() => { b.textContent = "Copia il riepilogo"; }, 1600); }).catch(() => { b.textContent = "Non riesco a copiare"; }); return; }
  const o = e.target.closest("[data-cbopen]"); if (o) { go("strumenti"); setTimeout(() => { cbFill(); const box = $("#cbBox"); if (box) box.scrollIntoView({ behavior: "smooth", block: "start" }); const i = document.querySelector('#cbForm input[name="pat"]'); if (i) i.focus({ preventScroll: true }); }, 450); }
});
/* la sezione si prepara quando si entra negli Strumenti (e subito, se ci si arriva da un link) */
new MutationObserver(() => { if (document.body.dataset.scene === "strumenti") cbFill(); }).observe(document.body, { attributes: true, attributeFilter: ["data-scene"] });

export { cbCalc, cbNum };
