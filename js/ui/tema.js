/* Impostazioni (rotellina in alto a destra) e modalità chiara / scura (19/11/2026).
   - Aspetto: «Automatico» segue il sistema del telefono o del computer, oppure «Chiaro» / «Scuro» fissi;
   - la scelta resta nel browser (pos-tema-v1: "auto" | "chiaro" | "scuro");
   - il tema si applica già nell'<head> (script in index.html) per non far lampeggiare la pagina: qui si cambia e si segue il sistema;
   - la lingua per ora è solo l'italiano: la riga c'è perché le traduzioni arriveranno qui. */
import { $ } from "./core.js";

export const TEMA_KEY = "pos-tema-v1";
const mq = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
export const temaScelto = () => { try { const v = localStorage.getItem(TEMA_KEY); return v === "chiaro" || v === "scuro" ? v : "auto"; } catch { return "auto"; } };
export const temaScuro = () => document.documentElement.dataset.theme === "dark";

function applica() {
  const t = temaScelto(), scuro = t === "scuro" || (t === "auto" && !!(mq && mq.matches));
  const prima = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = scuro ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", scuro ? "#0B0B0A" : "#F7F7F4");
  document.querySelectorAll("#setPop [data-tema]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.tema === t)));
  if (prima !== document.documentElement.dataset.theme) document.dispatchEvent(new CustomEvent("pos-tema", { detail: { scuro } }));
}
export function temaImposta(t) {
  try { t === "auto" ? localStorage.removeItem(TEMA_KEY) : localStorage.setItem(TEMA_KEY, t); } catch {}
  applica();
}
if (mq) (mq.addEventListener ? mq.addEventListener("change", applica) : mq.addListener(applica));

/* icone disegnate (niente emoji) */
const ICO = {
  auto: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 3.5a6.5 6.5 0 0 1 0 13z" fill="currentColor"/></svg>',
  chiaro: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 2v2.2M10 15.8V18M2 10h2.2M15.8 10H18M4.3 4.3l1.6 1.6M14.1 14.1l1.6 1.6M4.3 15.7l1.6-1.6M14.1 5.9l1.6-1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  scuro: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15.6 12.4A6.6 6.6 0 0 1 7.6 4.4a6.6 6.6 0 1 0 8 8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'
};
const GEAR = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4.9a7.5 7.5 0 0 0-2.6-1.5L14 2.4h-4l-.4 2.5a7.5 7.5 0 0 0-2.6 1.5l-2.4-.9-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-.9a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.4.9 2-3.4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';

function monta() {
  const mnu = $("#mnu"); if (!mnu || $("#setBtn")) return;
  const box = document.createElement("div"); box.className = "set"; box.id = "set";
  box.innerHTML = `<button type="button" class="set-btn" id="setBtn" aria-label="Impostazioni" aria-haspopup="dialog" aria-expanded="false" aria-controls="setPop" title="Impostazioni">${GEAR}</button>
    <div class="set-pop" id="setPop" role="dialog" aria-label="Impostazioni" hidden>
      <b class="set-h">Impostazioni</b>
      <div class="set-row"><span class="set-l">Aspetto</span>
        <div class="set-seg" role="radiogroup" aria-label="Aspetto">
          ${["auto", "chiaro", "scuro"].map(t => `<button type="button" role="radio" data-tema="${t}" aria-checked="false">${ICO[t]}<span>${{ auto: "Automatico", chiaro: "Chiaro", scuro: "Scuro" }[t]}</span></button>`).join("")}
        </div>
        <small class="set-n">«Automatico» segue il tuo telefono o computer.</small>
      </div>
      <div class="set-row set-line"><span class="set-l">Lingua</span><span class="set-v">Italiano</span></div>
      <a class="set-link" href="/privacy.html">Privacy e dati salvati in questo browser<span aria-hidden="true">→</span></a>
    </div>`;
  mnu.parentNode.insertBefore(box, mnu);
  const pop = $("#setPop"), btn = $("#setBtn");
  const apri = on => { pop.hidden = !on; btn.setAttribute("aria-expanded", String(on)); document.body.classList.toggle("set-on", !!on); if (on) { const f = pop.querySelector('[aria-checked="true"]') || pop.querySelector("button"); f && f.focus({ preventScroll: true }); } };
  btn.addEventListener("click", e => { e.stopPropagation(); const mp = $("#mnuPop"); if (mp && !mp.hidden) $("#mnuBtn").click(); apri(pop.hidden); });
  pop.addEventListener("click", e => { e.stopPropagation(); const b = e.target.closest("[data-tema]"); if (b) temaImposta(b.dataset.tema); });
  pop.addEventListener("keydown", e => {
    const bs = [...pop.querySelectorAll("[data-tema]")], i = bs.indexOf(document.activeElement);
    if (i >= 0 && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { e.preventDefault(); const n = bs[(i + (e.key === "ArrowRight" ? 1 : bs.length - 1)) % bs.length]; n.focus(); temaImposta(n.dataset.tema); }
  });
  document.addEventListener("click", e => { if (!pop.hidden && !box.contains(e.target)) apri(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !pop.hidden) { apri(false); btn.focus(); } });
  $("#mnuBtn") && $("#mnuBtn").addEventListener("click", () => apri(false));
  applica();
}
monta();
applica();
