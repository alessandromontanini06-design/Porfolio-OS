/* Il portafoglio da uno o più screenshot (app della banca o del broker).
   1. l'utente sceglie le immagini; il browser le rimpicciolisce (testo ancora leggibile, pochi MB in tutto);
   2. con il suo permesso esplicito le manda a /api/screenshot, che le fa leggere all'IA (Gemini, poi Claude);
   3. le posizioni lette finiscono in una tabella da correggere;
   4. confermate, diventano un «riepilogo posizioni» come quello di un Excel e seguono la strada dei file (prezzi di mercato → laboratorio).
   Le immagini non si salvano da nessuna parte: restano in memoria finché la pagina è aperta. */
import { $, S, esc, fmtN } from "./core.js";
import { POPULAR, isSim, load, spaceSwitch, track, TR } from "./importa.js";

const SH = { imgs: [], rows: [], busy: false, avvisi: [], piattaforma: null };
const MAX = 8, BUDGET = 4_100_000;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

/* rimpicciolisce: larghezza al massimo 1100 px, altezza al massimo 2600 (gli screenshot del telefono sono alti e stretti) */
async function shrink(file, maxW = 1100, maxH = 2600, q = .82) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxW / bmp.width, maxH / bmp.height), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(bmp, 0, 0, w, h); bmp.close && bmp.close();
  const url = c.toDataURL("image/jpeg", q);
  return { url, data: url.split(",")[1], mime: "image/jpeg", w, h };
}
async function addFiles(list) {
  const files = [...list].filter(f => /^image\/(png|jpeg|webp)$/.test(f.type));
  const skipped = list.length - files.length;
  for (const f of files) {
    if (SH.imgs.length >= MAX) { status(`Al massimo ${MAX} immagini per volta.`); break; }
    try { const r = await shrink(f); SH.imgs.push({ name: f.name, ...r }); } catch { status(`Non riesco ad aprire ${f.name}.`); }
  }
  /* se insieme superano il limite, si ricomprimono più piccole */
  let tot = SH.imgs.reduce((a, x) => a + x.data.length, 0);
  if (tot > BUDGET) { status("Immagini grandi: le riduco un po'…"); const again = []; for (const x of SH.imgs) { const b = await (await fetch(x.url)).blob(); again.push({ name: x.name, ...(await shrink(b, 900, 2100, .7)) }); } SH.imgs = again; tot = SH.imgs.reduce((a, x) => a + x.data.length, 0); }
  if (skipped) status(`${skipped} ${skipped > 1 ? "file non sono immagini" : "file non è un'immagine"} JPG, PNG o WEBP: ${skipped > 1 ? "li ho saltati" : "l'ho saltato"}.`);
  else if (tot > BUDGET) status("Troppe immagini grandi insieme: togline qualcuna.");
  else status("");
  render();
}
function status(t) { $("#shStatus").textContent = t; }

const num = v => { if (v == null || v === "") return null; if (typeof v === "number") return v; const t = String(v).replace(/[€\s]/g, ""); const n = /,\d{1,}$/.test(t) || /\.\d{3}(,|$)/.test(t) ? +t.replace(/\./g, "").replace(",", ".") : +t.replace(/,/g, ""); return isFinite(n) ? n : null; };
const okRow = r => (String(r.nome || "").trim() || ISIN.test(r.isin || "") || String(r.ticker || "").trim()) && (r.quantita > 0 || r.valore > 0);

function render() {
  $("#shThumbs").innerHTML = SH.imgs.map((x, i) => `<figure class="sh-th"><img src="${x.url}" alt="Screenshot ${i + 1}"><figcaption>${i + 1}</figcaption><button type="button" class="sh-x" data-shx="${i}" aria-label="Togli lo screenshot ${i + 1}">×</button></figure>`).join("");
  $("#shDrop").querySelector("b").textContent = SH.imgs.length ? "Aggiungi altri screenshot" : "Scegli gli screenshot";
  $("#shRead").disabled = SH.busy || !SH.imgs.length || !$("#shAgree").checked;
  $("#shRead").textContent = SH.busy ? "Leggo…" : SH.rows.length ? "Leggi di nuovo" : `Leggi ${SH.imgs.length > 1 ? "gli " + SH.imgs.length + " screenshot" : "lo screenshot"}`;
  $("#shStep3").hidden = !SH.rows.length && !SH.avvisi.length;
  $("#shWarn").innerHTML = SH.avvisi.length ? `<ul>${SH.avvisi.map(a => `<li>${esc(a)}</li>`).join("")}</ul>` : "";
  renderRows(); renderSum();
}
function renderRows() {
  $("#shRows").innerHTML = SH.rows.map((r, i) => `<tr class="${okRow(r) ? "" : "bad"}">
    <td><input data-shr="${i}" data-shk="nome" value="${esc(r.nome || "")}" aria-label="Titolo, riga ${i + 1}"></td>
    <td><input data-shr="${i}" data-shk="isin" value="${esc(r.isin || "")}" placeholder="—" aria-label="ISIN, riga ${i + 1}" spellcheck="false">${r.src ? `<small class="sh-src">${r.src === "catalogo" ? "dal catalogo" : "trovato e verificato"}</small>` : ""}</td>
    <td><input data-shr="${i}" data-shk="ticker" value="${esc(r.ticker || "")}" placeholder="—" aria-label="Ticker, riga ${i + 1}" spellcheck="false"></td>
    <td><input data-shr="${i}" data-shk="quantita" value="${r.quantita == null ? "" : String(r.quantita).replace(".", ",")}" inputmode="decimal" aria-label="Quantità, riga ${i + 1}"></td>
    <td><input data-shr="${i}" data-shk="valore" value="${r.valore == null ? "" : fmtN(r.valore, 2)}" inputmode="decimal" aria-label="Valore in euro, riga ${i + 1}"></td>
    <td><button type="button" class="btn sm bd-del" data-shd="${i}" aria-label="Togli la riga ${i + 1}">×</button></td></tr>`).join("");
}
function renderSum() {
  const ok = SH.rows.filter(okRow), tot = ok.reduce((a, r) => a + (r.valore || 0), 0);
  $("#shSum").innerHTML = SH.rows.length ? `<div class="sh-big"><span>Valore letto</span><b>${fmtN(tot, 0)} €</b><small>${ok.length} ${ok.length === 1 ? "posizione" : "posizioni"}${SH.piattaforma ? " · " + esc(SH.piattaforma) : ""}</small></div>` +
    (SH.rows.length > ok.length ? `<p class="caption dn">${SH.rows.length - ok.length} ${SH.rows.length - ok.length > 1 ? "righe incomplete non verranno usate" : "riga incompleta non verrà usata"}: manca il nome o la quantità/valore.</p>` : "") +
    ok.map(r => `<div class="bd-ci2"><span><b>${esc(r.ticker || r.nome)}</b><small>${esc(r.ticker ? r.nome : r.isin || "")}</small></span><span></span><span class="bd-num">${r.valore ? fmtN(r.valore, 0) + " €" : "—"}<small>${r.valore && tot ? fmtN(r.valore / tot * 100, 1) + "%" : r.quantita ? fmtN(r.quantita, 2) + " pz" : ""}</small></span></div>`).join("")
    : `<p class="caption">Ancora nessuna posizione letta.</p>`;
  $("#shGo").disabled = !ok.length;
}

/* ISIN per chi nello screenshot ha solo il nome (succede quasi sempre: le app mostrano «Eni», «iShares Core MSCI EM IMI»…).
   1. catalogo del sito (ISIN già verificati): ticker uguale, oppure nome con tutte le parole importanti in comune;
   2. per gli altri la ricerca del sito (/api/findisin): l'IA propone, OpenFIGI verifica. Le proposte non verificate non si usano. */
const GEN = new Set(["UCITS", "ETF", "ETC", "ETN", "ETP", "ACC", "DIST", "USD", "EUR", "GBP", "THE", "PLC", "SICAV", "INC", "CLASS", "SHARE", "SHARES", "SPA", "S.P.A", "NV", "SA", "AG", "1C", "1D", "C", "D", "A", "B"]);
/* «NASDAQ100» → «NASDAQ 100»; «...» dei nomi troncati via */
const toks = s => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\.{2,}|…/g, " ").replace(/([A-Z])(\d)/g, "$1 $2").replace(/(\d)([A-Z])/g, "$1 $2").replace(/[^A-Z0-9& ]+/g, " ").split(/\s+/).filter(w => w && !GEN.has(w));
/* le app spesso non scrivono l'emittente (Trade Republic: «Core MSCI World USD (Acc)»): se manca nel nome letto, non conta */
const ISSUER = new Set(["ISHARES", "VANGUARD", "XTRACKERS", "AMUNDI", "SPDR", "INVESCO", "VANECK", "WISDOMTREE", "LYXOR", "HSBC", "UBS", "BNP", "PARIBAS", "FRANKLIN", "JPMORGAN", "DWS"]);
const shareClass = s => /\bdist|distrib|\(d\)|\bdis\b/i.test(s) ? "D" : /\bacc|accum|\(c\)|\b1c\b/i.test(s) ? "A" : "";
const truncated = s => /(\.{2,}|…)\s*$/.test(String(s || ""));
function catMatch(r) {
  const tk = String(r.ticker || "").toUpperCase();
  if (tk) { const p = POPULAR.find(x => x[0] === tk); if (p) return p; }
  const A = new Set(toks(r.nome)); if (!A.size) return null;
  const cls = shareClass(r.nome), cut = truncated(r.nome);
  let best = null, bs = 0;
  for (const p of POPULAR) {
    const pc = shareClass(p[1]); if (cls && pc && cls !== pc) continue; // accumulazione e distribuzione sono strumenti diversi
    const B = toks(p[1].replace(/\([^)]*\)/g, " ")).filter(w => A.has(w) || !ISSUER.has(w)); if (!B.length) continue;
    const inB = B.filter(w => A.has(w)).length, inA = [...A].filter(w => B.includes(w)).length;
    /* nome troncato: basta che tutte le parole lette ci siano */
    const sc = cut ? (inA === A.size && A.size >= 2 ? inA / A.size * .9 : 0) : Math.min(inB / B.length, inA / A.size);
    if (sc > bs) { bs = sc; best = p; }
  }
  return bs >= .75 ? best : null;
}
/* la stessa posizione vista in due screenshot (elenco e scheda della posizione): si uniscono i dati, non si sommano */
const keyName = s => toks(s).join(" ");
function mergeRows(rows) {
  const out = [];
  for (const r of rows) {
    const k = keyName(r.nome);
    const same = out.find(o => (r.isin && o.isin === r.isin) || (k && keyName(o.nome) === k) || (k && truncated(o.nome) && k.startsWith(keyName(o.nome))) || (k && truncated(r.nome) && keyName(o.nome).startsWith(k)));
    if (!same) { out.push({ ...r }); continue; }
    for (const f of ["isin", "ticker", "quantita", "valore", "prezzo"]) if ((same[f] == null || same[f] === "") && r[f] != null && r[f] !== "") same[f] = r[f];
    if (truncated(same.nome) && !truncated(r.nome)) same.nome = r.nome;
    same.unite = true;
  }
  return out;
}
async function enrich() {
  SH.rows.forEach(r => { if (ISIN.test(r.isin || "")) return; const p = catMatch(r); if (p) { r.isin = p[2]; if (!r.ticker) r.ticker = p[0]; r.src = "catalogo"; } });
  const todo = SH.rows.filter(r => !ISIN.test(r.isin || "") && (r.nome || r.ticker)).slice(0, 20);
  if (!todo.length) return;
  status(`Cerco l'ISIN di ${todo.length} ${todo.length > 1 ? "titoli" : "titolo"} che nello screenshot ${todo.length > 1 ? "hanno" : "ha"} solo il nome…`);
  try {
    const r = await fetch("/api/findisin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strumenti: todo.map(x => ({ nome: x.nome || "", ticker: x.ticker || "", simbolo: "" })) }), signal: AbortSignal.timeout(45000) });
    const j = await r.json().catch(() => ({}));
    (j.risultati || []).forEach(x => { const row = todo[x.indice]; if (row && x.verificato && x.isin) { row.isin = x.isin; row.src = "verificato"; } });
  } catch { /* senza ricerca si va avanti: nel laboratorio c'è comunque il controllo delle posizioni senza prezzo */ }
}

async function read() {
  if (SH.busy || !SH.imgs.length || !$("#shAgree").checked) return;
  SH.busy = true; render(); status(`Leggo ${SH.imgs.length > 1 ? "le immagini" : "l'immagine"} con l'IA: di solito bastano 10-20 secondi…`);
  track("start", { how: "screenshot", n: SH.imgs.length });
  try {
    const r = await fetch("/api/screenshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ immagini: SH.imgs.map(x => ({ mime: x.mime, data: x.data })) }), signal: AbortSignal.timeout(70000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || `Errore ${r.status}`);
    SH.rows = (j.posizioni || []).map(p => ({ nome: p.nome || "", isin: p.isin || "", ticker: p.ticker || "", quantita: p.quantita, valore: p.valuta && p.valuta !== "EUR" ? null : p.valore, prezzo: p.prezzo, valutaOrig: p.valuta }));
    const n0 = SH.rows.length; SH.rows = mergeRows(SH.rows);
    SH.avvisi = [...(j.avvisi || [])];
    if (SH.rows.length < n0) SH.avvisi.push(`${n0 - SH.rows.length} ${n0 - SH.rows.length > 1 ? "posizioni comparivano" : "posizione compariva"} in più screenshot (per esempio l'elenco e la scheda del titolo): le ho unite.`);
    const fx = (j.posizioni || []).filter(p => p.valuta && p.valuta !== "EUR");
    if (fx.length) SH.avvisi.push(`${fx.length} ${fx.length > 1 ? "posizioni hanno" : "posizione ha"} il valore in un'altra valuta (${[...new Set(fx.map(p => p.valuta))].join(", ")}): ho tenuto la quantità, il valore in euro lo calcolo dai prezzi di mercato.`);
    SH.piattaforma = j.piattaforma || null;
    await enrich();
    status(SH.rows.length ? `Lette ${SH.rows.length} posizioni${j.immagini > 1 ? ` da ${j.immagini} immagini` : ""}. Controllale qui sotto.` : "Non ho trovato posizioni: prova con uno screenshot della pagina del portafoglio.");
    track("screenshot_ok", { n: SH.rows.length });
  } catch (e) { status(/fetch|network|Failed/i.test(e.message) ? "Non riesco a raggiungere il server: controlla la connessione e riprova." : e.name === "TimeoutError" ? "L'IA ci mette troppo: riprova, magari con meno immagini." : e.message); track("import_fail", { kind: "screenshot", why: String(e.message).slice(0, 80) }); }
  SH.busy = false; render();
  if (SH.rows.length) setTimeout(() => $("#shStep3").scrollIntoView({ behavior: "smooth", block: "start" }), 80);
}

function go() {
  const ok = SH.rows.filter(okRow); if (!ok.length) return;
  /* un riepilogo di posizioni come quello di un Excel: il riconoscitore locale lo legge, poi i prezzi di mercato */
  const aoa = [["Strumento", "Ticker", "ISIN", "Quantità", "Valore (€)"], ...ok.map(r => [r.nome || r.ticker || r.isin, r.ticker || "", ISIN.test(r.isin || "") ? r.isin : "", r.quantita ?? "", r.valore ?? ""])];
  close();
  if (isSim()) spaceSwitch("real", { fresh: true, stay: true });
  track("start", { how: "screenshot_conferma" }); TR.t0 = Date.now();
  load([{ name: "Screenshot", aoa }], { name: `Screenshot (${SH.imgs.length} ${SH.imgs.length > 1 ? "immagini" : "immagine"})`, size: 0, kind: "file", screenshot: true }, true);
}

function open() { const p = $("#shotPage"); p.classList.add("open"); p.setAttribute("aria-hidden", "false"); document.body.classList.add("bd-on"); p.scrollTop = 0; render(); setTimeout(() => $("#shDrop").focus(), 300); }
function close() { const p = $("#shotPage"); p.classList.remove("open"); p.setAttribute("aria-hidden", "true"); document.body.classList.remove("bd-on"); }

$("#shotBtn").addEventListener("click", open);
$("#shotClose").addEventListener("click", close);
document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#shotPage").classList.contains("open")) close(); });
$("#shFile").addEventListener("change", e => { addFiles(e.target.files); e.target.value = ""; });
const dz = $("#shDrop");
["dragenter", "dragover"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("over"); }));
dz.addEventListener("drop", e => addFiles(e.dataTransfer.files));
dz.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#shFile").click(); } });
/* incolla con Ctrl+V (comodo dal computer dopo uno screenshot) */
document.addEventListener("paste", e => { if (!$("#shotPage").classList.contains("open")) return; const f = [...(e.clipboardData ? e.clipboardData.files : [])]; if (f.length) addFiles(f); });
$("#shotPage").addEventListener("click", e => {
  const x = e.target.closest("[data-shx]"); if (x) { SH.imgs.splice(+x.dataset.shx, 1); render(); }
  const d = e.target.closest("[data-shd]"); if (d) { SH.rows.splice(+d.dataset.shd, 1); render(); }
  if (e.target.id === "shAdd") { SH.rows.push({ nome: "", isin: "", ticker: "", quantita: null, valore: null }); render(); const ins = document.querySelectorAll("#shRows input[data-shk=nome]"); ins[ins.length - 1].focus(); }
  if (e.target.id === "shRead") read();
  if (e.target.id === "shGo") go();
});
$("#shAgree").addEventListener("change", render);
$("#shotPage").addEventListener("change", e => {
  const i = e.target.dataset.shr, k = e.target.dataset.shk; if (i == null) return;
  const r = SH.rows[+i], v = e.target.value;
  if (k === "isin" || k === "nome") r.src = null;
  r[k] = k === "quantita" || k === "valore" ? num(v) : k === "isin" || k === "ticker" ? String(v).trim().toUpperCase().replace(/\s+/g, "") : String(v).trim();
  renderSum(); e.target.closest("tr").classList.toggle("bad", !okRow(r));
});

export { SH, shrink, catMatch, mergeRows };
