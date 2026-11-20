/* Quanta come guida del sito (20/11/2026, ramo quanta-guida).
   Strumenti in più per Quanta, nella chat e in chiamata:
   - mostra_sul_sito: porta alla pagina giusta, fa scorrere fino al punto e lo illumina con un anello lime e una nota;
   - apri_strumento: apre costruttore, profilo del cliente, archivio o report (solo pannelli: non salva niente);
   - cosa_vedo: dice a Quanta in che pagina è l'utente e quali numeri ha davanti.
   In chiamata, mentre guida, la chiamata si riduce a una pillola in basso (callMini in chiamata.js) così l'utente vede il sito. */
import { $, S, esc } from "./core.js";
import { NO_LAB, TOOLS_LOCAL, TOOL_L } from "./quanta.js";
import { go, current, SCENE_L } from "./scene.js";
import { openBuilder } from "./importa.js";
import { openArchive } from "./archivio.js";
import { openReportDlg } from "./report.js";
import { prOpen } from "./studio.js";
import { callOn, callMini } from "./chiamata.js";

/* i punti che Quanta può indicare: pagina, elemento, se serve il laboratorio, cosa dire */
const PUNTI = {
  carica_file: { s: "home", q: "#drop", l: "Carica qui il file della banca o del broker" },
  costruisci_portafoglio: { s: "home", q: "#builderBtn", l: "Da qui costruisci un portafoglio senza Excel" },
  patrimonio_aggiungi: { s: "patrimonio", q: '[data-pmgo="add"]', l: "Aggiungi un acquisto, una vendita o un bene" },
  patrimonio_grafico: { s: "patrimonio", q: "#pmChart", l: "L'andamento del patrimonio" },
  patrimonio_tasse: { s: "patrimonio", q: "#pmTaxBox", l: "Le tasse: bollo, zainetto, imposte se vendessi" },
  patrimonio_obiettivi: { s: "patrimonio", q: "#pmGoalBox", l: "I tuoi obiettivi" },
  rendimento_reale: { s: "lab", q: "#realCard", lab: 1, l: "Il rendimento vero, dai tuoi movimenti" },
  costi: { s: "lab", q: "#costCard", lab: 1, l: "Quanto costa il portafoglio" },
  adeguatezza: { s: "lab", q: "#adeCard", lab: 1, l: "L'adeguatezza al profilo del cliente" },
  confronta_allocazioni: { s: "lab", q: "#cmpCard", lab: 1, l: "Qui confronti due allocazioni" },
  correlazioni: { s: "lab", q: "#corr", lab: 1, l: "Come si muovono insieme gli strumenti" },
  dove_sei_investito: { s: "lab", q: "#lookCard", lab: 1, l: "Paesi, settori e valute dentro i fondi" },
  salva_archivio: { s: "lab", q: "#svOffer", lab: 1, l: "Salva il portafoglio nell'archivio" },
  report_pdf: { s: "lab", q: "#reportBtn", lab: 1, l: "Scarica il report in PDF" },
  rischio: { s: "risk", q: "#scene-risk .kpis", lab: 1, l: "Quanto puoi perdere" },
  simulazioni: { s: "sim", q: "#scene-sim .scene-title", lab: 1, l: "I futuri possibili del portafoglio" },
  costi_banca: { s: "strumenti", q: "#cbBox", l: "Quanto ti costa la banca" },
  studio_avvisi: { s: "studio", q: "#stAvvisi, #stBody .st-empty", pro: 1, l: "Chi sentire questa settimana" },
  studio_clienti: { s: "studio", q: "#stClienti, #stBody .st-empty", pro: 1, l: "I tuoi clienti" },
  studio_modelli: { s: "studio", q: "#stModelli", pro: 1, l: "I portafogli modello dello studio" },
  impostazioni: { s: null, q: "#setBtn", l: "Impostazioni: modalità chiara o scura" }
};
const APRI = { costruttore: 1, profilo_cliente: 1, archivio: 1, report: 1 };

/* ---------- anello che illumina un elemento (segue lo scorrimento per qualche secondo) ---------- */
let HL = null;
function spegni() { if (!HL) return; cancelAnimationFrame(HL.raf); HL.ring.remove(); HL = null; }
function illumina(el, nota) {
  spegni();
  const ring = document.createElement("div"); ring.className = "q-hl"; ring.setAttribute("aria-hidden", "true");
  ring.innerHTML = `<span class="q-hl-n"><i class="q-hl-o"></i>${esc(nota)}</span>`; document.body.appendChild(ring);
  const t0 = performance.now(), dur = 9000;
  const tick = now => {
    if (!HL) return; const r = el.getBoundingClientRect();
    if (!el.isConnected || now - t0 > dur || (r.width === 0 && r.height === 0)) { spegni(); return; }
    Object.assign(ring.style, { left: `${r.left - 8}px`, top: `${r.top - 8}px`, width: `${r.width + 16}px`, height: `${r.height + 16}px` });
    ring.classList.toggle("sotto", r.top < 110);
    HL.raf = requestAnimationFrame(tick);
  };
  HL = { ring, raf: requestAnimationFrame(tick) };
}
document.addEventListener("pointerdown", e => { if (HL && !e.target.closest(".q-call")) setTimeout(spegni, 1200); }, true);

/* i selettori separati da virgola si provano in ordine: il primo che c'è e si vede vince */
const trova = q => { for (const one of q.split(",")) { const e = [...document.querySelectorAll(one.trim())].find(x => x.getClientRects().length && !x.closest("[hidden]")); if (e) return e; } return null; };
const attendi = ms => new Promise(r => setTimeout(r, ms));
async function mostra(a) {
  const k = String(a.cosa || ""), P = PUNTI[k];
  if (!P) return { error: "punto sconosciuto: usa uno di " + Object.keys(PUNTI).join(", ") };
  if (P.lab && !S.lab) return { error: "questo si vede dopo aver costruito il laboratorio: indica prima carica_file o costruisci_portafoglio" };
  if (P.pro && document.body.dataset.ruolo !== "pro") return { error: "lo Studio c'è solo per chi usa il sito da consulente (menu in alto: «Uso il sito da consulente»)" };
  if (callOn()) callMini(true);
  if (P.s && P.s !== current) { go(P.s); await attendi(700); }
  let el = trova(P.q); for (let i = 0; !el && i < 8; i++) { await attendi(250); el = trova(P.q); }
  if (!el) return { error: "in questa pagina ora non lo vedo (forse va prima completato un passaggio)", pagina: SCENE_L[current] };
  el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  const nota = String(a.nota || P.l).slice(0, 80);
  illumina(el, nota);
  return { fatto: true, pagina: SCENE_L[current], indicato: P.l, nota };
}
function apri(a) {
  const k = String(a.cosa || ""); if (!APRI[k]) return { error: "da aprire: costruttore, profilo_cliente, archivio o report" };
  if ((k === "profilo_cliente" || k === "report") && !S.lab) return { error: "serve prima un portafoglio nel laboratorio" };
  if (callOn()) callMini(true);
  if (k === "costruttore") openBuilder();
  if (k === "profilo_cliente") prOpen({ lab: true });
  if (k === "archivio") openArchive();
  if (k === "report") openReportDlg();
  return { fatto: true, aperto: k, nota: "è solo un pannello: l'utente sceglie e salva da sé" };
}
/* cosa ha davanti l'utente: pagina, titolo, pannelli aperti, primi numeri visibili */
function cosaVedo() {
  const sc = $("#scene-" + current), h = sc && sc.querySelector(".scene-title h2, h1");
  const pannelli = [["#builder", "costruttore"], ["#archive", "archivio"], ["#stPr", "profilo del cliente"], ["#profile", "test del profilo"], ["#rpDlg", "report"]]
    .filter(([q]) => { const e = $(q); return e && (e.classList.contains("open") || e.open); }).map(x => x[1]);
  const num = sc ? [...sc.querySelectorAll(".kpi, .pm-k, .st-ade-k > div")].filter(e => e.getClientRects().length).slice(0, 8)
    .map(e => e.innerText.replace(/\s+/g, " ").trim().slice(0, 90)) : [];
  return { pagina: SCENE_L[current] || current, titolo: h ? h.innerText.replace(/\s+/g, " ").trim() : "", pannelli_aperti: pannelli, numeri_visibili: num,
    laboratorio: !!S.lab, ruolo: document.body.dataset.ruolo || "non scelto" };
}

Object.assign(TOOLS_LOCAL, { mostra_sul_sito: mostra, apri_strumento: apri, cosa_vedo: cosaVedo });
/* «portami a…» durante una chiamata: la chiamata si riduce, così l'utente vede la pagina; in più la pagina Studio */
const vaiA = TOOLS_LOCAL.vai_a;
TOOLS_LOCAL.vai_a = a => {
  if (callOn()) callMini(true);
  if (a && a.pagina === "studio") { if (document.body.dataset.ruolo !== "pro") return { error: "lo Studio c'è solo per chi usa il sito da consulente" }; setTimeout(() => go("studio"), 250); return { fatto: true, pagina: "studio" }; }
  return vaiA(a);
};
["mostra_sul_sito", "apri_strumento", "cosa_vedo"].forEach(n => NO_LAB.add(n));
Object.assign(TOOL_L, { mostra_sul_sito: "ti mostro dove", apri_strumento: "apro il pannello", cosa_vedo: "guardo lo schermo" });

window.__guida = { mostra, apri, cosaVedo, spegni, PUNTI }; // per i test
export { PUNTI, mostra, apri, cosaVedo, spegni };
