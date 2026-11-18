/* Chi usa il sito: «Investo da solo» o «Sono un consulente». Primo passo verso due spazi con lo stesso motore
   (progetto in tools/design/sistemi/DUE-SISTEMI.md).
   - finché non si sceglie, il sito resta com'è (tutto visibile): in home c'è un riquadro con la domanda;
   - la scelta resta nel browser (pos-ruolo-v1) e si cambia dal menu in alto;
   - privato: spariscono le funzioni da studio (presentazione al cliente, report «per un cliente», riquadro per i consulenti);
   - consulente: le parole della home parlano di clienti; l'archivio diventa «I tuoi clienti». */
import { $ } from "./core.js";

const KEY = "pos-ruolo-v1";
const get = () => { try { const v = localStorage.getItem(KEY); return v === "priv" || v === "pro" ? v : ""; } catch { return ""; } };
const set = v => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch {} apply(); };
const TXT = {
  pro: { drop: "Carica il file del cliente", dropS: "l'export della banca o del broker del cliente (Excel o CSV) · oppure trascinalo qui", arch: "I tuoi clienti", archS: "analisi salvate, note, revisioni" },
  priv: { drop: "Carica il tuo Excel", dropS: null, arch: "Archivio", archS: "le analisi salvate e le revisioni" }
};
const orig = {};
function apply() {
  const r = get(); document.body.dataset.ruolo = r || "";
  const dropB = document.querySelector("#drop label b"), dropS = document.querySelector("#drop label small"), archB = document.querySelector("#archBtn b"), archS = document.querySelector("#archBtn small");
  if (dropB && orig.drop == null) { orig.drop = dropB.textContent; orig.dropS = dropS ? dropS.textContent : ""; orig.archS = archS ? archS.textContent : ""; }
  const t = TXT[r] || {};
  if (dropB) dropB.textContent = t.drop || orig.drop;
  if (dropS) dropS.textContent = t.dropS || orig.dropS;
  if (archB && archB.firstChild && archB.firstChild.nodeType === 3) archB.firstChild.textContent = (t.arch || "Archivio") + " ";
  if (archS) archS.textContent = t.archS || orig.archS;
  /* riquadro della domanda in home (solo finché non si è scelto) */
  const start = document.querySelector("#scene-home .start");
  let ask = $("#ruoloAsk");
  if (!r && start && !ask) {
    ask = document.createElement("div"); ask.id = "ruoloAsk"; ask.className = "ruolo-ask";
    ask.innerHTML = `<span>Come usi Portfolio OS?</span><div class="ruolo-b"><button type="button" class="btn sm" data-ruolo="priv">Investo da solo</button><button type="button" class="btn sm" data-ruolo="pro">Sono un consulente</button></div>`;
    start.prepend(ask);
  }
  if (ask) ask.hidden = !!r;
  /* interruttore nel menu in alto */
  const list = document.querySelector("#mnuPop .mnu-list");
  let sw = $("#ruoloSw");
  if (list && !sw) { sw = document.createElement("div"); sw.id = "ruoloSw"; sw.className = "ruolo-sw"; sw.setAttribute("role", "group"); sw.setAttribute("aria-label", "Uso il sito"); list.prepend(sw); }
  if (sw) sw.innerHTML = `<small>Uso il sito</small><button type="button" data-ruolo="priv" aria-pressed="${r === "priv"}">da solo</button><button type="button" data-ruolo="pro" aria-pressed="${r === "pro"}">da consulente</button>`;
}
document.addEventListener("click", e => { const b = e.target.closest("[data-ruolo]"); if (!b || !b.closest("#ruoloAsk,#ruoloSw")) return; set(get() === b.dataset.ruolo && b.closest("#ruoloSw") ? "" : b.dataset.ruolo); });
apply();

export { get as ruolo, set as setRuolo };
