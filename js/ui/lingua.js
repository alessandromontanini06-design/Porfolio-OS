/* Lingue del sito (20/11/2026): italiano (testo originale), inglese, spagnolo, francese.
   Il sito è scritto in italiano; questo modulo traduce ciò che compare sullo schermo con un dizionario (js/i18n/en.json, es.json, fr.json):
   - ogni testo si riduce a una «chiave»: spazi compattati e numeri sostituiti da {0}, {1}… (così «Hai 6 movimenti» e «Hai 9 movimenti» sono la stessa frase);
   - si traducono i nodi di testo e gli attributi placeholder, aria-label, title, alt, anche quelli che compaiono dopo (MutationObserver);
   - i numeri restano come li scrive il sito; quello che il dizionario non conosce resta in italiano;
   - la scelta resta nel browser (pos-lingua-v1) e si cambia dalla rotellina: la pagina si ricarica.
   Per i test e per aggiornare il dizionario: localStorage «pos-i18n-raccogli» = "1" raccoglie tutte le chiavi viste (window.__i18n.raccolte()). */
export const LINGUE = { it: "Italiano", en: "English", es: "Español", fr: "Français" };
export const LINGUA_KEY = "pos-lingua-v1";
export const lingua = () => { try { const v = localStorage.getItem(LINGUA_KEY); return v === "en" || v === "es" || v === "fr" ? v : "it"; } catch { return "it"; } };
export function linguaImposta(l) { try { l === "it" ? localStorage.removeItem(LINGUA_KEY) : localStorage.setItem(LINGUA_KEY, l); } catch {} location.reload(); }

const NUM = /\d+(?:[.,]\d+)*/g;
export function chiave(s) {
  const nums = []; let i = 0;
  const k = String(s).replace(/\s+/g, " ").trim().replace(NUM, m => { nums.push(m); return `{${i++}}`; });
  return { k, nums };
}
const utile = k => k.length > 1 && /[A-Za-zÀ-ÿ]{2}/.test(k);
const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE", "svg", "SVG"]);
const ATTR = ["placeholder", "aria-label", "title", "alt"];
const L = lingua(), RACCOGLI = (() => { try { return localStorage.getItem("pos-i18n-raccogli") === "1"; } catch { return false; } })();
let DIZ = null; const VISTE = new Map(), ORIG = new WeakMap();

/* frasi che cambiano con il file: il nome tra «» e i mesi («ott 2026») diventano «#» e @ nella chiave e si rimettono uguali (i mesi tradotti) */
const MESI_IT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const MESI = { en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"], fr: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."] };
const RICO = { en: "rebuilt", es: "reconstruido", fr: "reconstitué" };
const riempi = (t, nums) => t.replace(/\{(\d+)\}/g, (m, j) => nums[+j] ?? m);
function traduci(testo) {
  const { k, nums } = chiave(testo); if (!utile(k)) return null;
  if (RACCOGLI) VISTE.set(k, (VISTE.get(k) || 0) + 1);
  if (!DIZ) return null; let t = DIZ[k]; if (t) return riempi(t, nums);
  const q = [], mesi = [];
  const s2 = String(testo).replace(/«[^»]*»/g, m => { q.push(m); return "«#»"; })
    .replace(/\b(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)(?= \d{4}\b)/g, m => { mesi.push(m); return "@"; });
  if (!q.length && !mesi.length) return null;
  const c = chiave(s2); t = DIZ[c.k]; if (!t) return null;
  let i = 0, j = 0;
  return riempi(t, c.nums).replace(/«#»/g, () => (q[i++] || "«»").replace(" · ricostruito", " · " + (RICO[L] || "ricostruito")))
    .replace(/@/g, () => { const m = mesi[j++]; return (MESI[L] || MESI_IT)[MESI_IT.indexOf(m)] || m; });
}
function saltare(el) { for (let e = el; e && e !== document.body; e = e.parentElement) { if (SKIP.has(e.tagName) || e.isContentEditable || e.getAttribute && (e.getAttribute("translate") === "no" || e.hasAttribute("data-noi18n"))) return true; } return false; }
function nodoTesto(n) {
  const v = n.data; if (!v || !v.trim()) return;
  const prima = ORIG.get(n); if (prima && prima.fatto === v) return; /* è la nostra traduzione */
  if (saltare(n.parentElement)) return;
  const t = traduci(v); if (t == null) return;
  const lead = v.match(/^\s*/)[0], trail = v.match(/\s*$/)[0], out = lead + t + trail;
  ORIG.set(n, { it: v, fatto: out }); if (out !== v) n.data = out;
}
function attributi(el) {
  if (saltare(el)) return;
  for (const a of ATTR) { const v = el.getAttribute(a); if (!v) continue; const segno = "data-i18n-" + a; if (el.getAttribute(segno) === v) continue;
    const t = traduci(v); if (t == null) continue; el.setAttribute(a, t); el.setAttribute(segno, t); }
}
function giro(root) {
  if (!root) return;
  if (root.nodeType === 3) { nodoTesto(root); return; }
  if (root.nodeType !== 1 || SKIP.has(root.tagName)) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = root; n; n = w.nextNode()) { if (n.nodeType === 3) nodoTesto(n); else if (n.hasAttribute && ATTR.some(a => n.hasAttribute(a))) attributi(n); }
}
let coda = new Set(), att = false;
function pianifica(n) { coda.add(n); if (att) return; att = true; requestAnimationFrame(() => { att = false; const c = coda; coda = new Set(); c.forEach(giro); titolo(); }); }
function titolo() { const t = traduci(document.title); if (t && document.title !== t) document.title = t; }
/* titoli divisi in parole per le animazioni: si traducono interi, prima di tutto il resto */
const INTERI = { "#heroTitle": { en: "Your <em>investments</em><br>finally clear.", es: "Tus <em>inversiones</em><br>por fin claras.", fr: "Vos <em>investissements</em><br>enfin clairs." } };
function interi() { for (const [sel, t] of Object.entries(INTERI)) { const el = document.querySelector(sel); if (el && t[L] && !el.hasAttribute("data-noi18n")) { el.innerHTML = t[L]; el.setAttribute("data-noi18n", ""); } } }
function avvia() {
  interi(); giro(document.body); titolo();
  new MutationObserver(ms => { for (const m of ms) {
    if (m.type === "characterData") pianifica(m.target);
    else if (m.type === "attributes") { if (!m.attributeName.startsWith("data-i18n-")) pianifica(m.target); }
    else m.addedNodes.forEach(pianifica);
  } }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTR });
  document.documentElement.classList.remove("i18n-wait");
}
window.__i18n = { lingua: L, chiave, raccolte: () => [...VISTE.entries()].sort((a, b) => b[1] - a[1]), traduci };
if (L !== "it") {
  document.documentElement.lang = L;
  fetch(`/js/i18n/${L}.json`).then(r => r.ok ? r.json() : {}).catch(() => ({})).then(d => { DIZ = d || {}; avvia(); });
  setTimeout(() => document.documentElement.classList.remove("i18n-wait"), 2500); /* mai una pagina bianca, anche se il dizionario non arriva */
} else if (RACCOGLI) avvia();
