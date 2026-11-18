/* Home: la vetrina del prodotto con DATI DI ESEMPIO (scritto «esempio» accanto).
   - telefono con l'anello del patrimonio: si tocca una fetta e il centro racconta quella fetta;
   - racconto a scorrimento: il telefono resta fermo e cambia schermata (per strumento, per categoria, scheda del BTP);
   - pulsanti [data-hmgo]: aprono le funzioni vere (patrimonio, file, esempio, costruttore).
   Non usa lo stato del sito: è solo una dimostrazione. */
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
const eur = v => Math.round(v).toLocaleString("it-IT", { useGrouping: "always" }) + " €";
const pct = v => (v * 100).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
/* esempio coerente: BTP 10.000 nominali a 99,12 = 9.912 €; guadagno = somma delle fette */
const DATA = {
  strumenti: [
    { n: "Vanguard All-World", v: 21480, g: 4210, c: "#C9F24A" },
    { n: "iShares EM IMI", v: 5240, g: 610, c: "#B9DC3F" },
    { n: "BTP 3,35% 2035", v: 9912, g: 62, c: "#7A2BEF" },
    { n: "Conto deposito", v: 5798, g: 96, c: "#2E6FD1" },
    { n: "Oro fisico", v: 3866, g: 690, c: "#C99A00" },
    { n: "iShares Nasdaq 100", v: 3238, g: 1020, c: "#1D9A8A" }],
  categorie: [
    { n: "Azioni", v: 29958, g: 5840, c: "#C9F24A" },
    { n: "Obbligazioni", v: 9912, g: 62, c: "#7A2BEF" },
    { n: "Liquidità", v: 5798, g: 96, c: "#2E6FD1" },
    { n: "Oro", v: 3866, g: 690, c: "#C99A00" }]
};
const TOT = 49534, SUB = "+212 € oggi · +0,4%";

function ring(host, opts = {}) {
  if (!host) return null;
  const size = opts.size || 240, w = opts.w || 26, r = size / 2 - w / 2 - 8, cx = size / 2, L = 2 * Math.PI * r, ns = "http://www.w3.org/2000/svg";
  let set = opts.set || "strumenti", sel = null;
  host.classList.add("hm-ring"); host.style.setProperty("--s", size + "px");
  host.innerHTML = `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Composizione del patrimonio (esempio)"><g transform="rotate(-90 ${cx} ${cx})"></g></svg><div class="hm-center"><small></small><b></b><small></small></div>`;
  const g = host.querySelector("g"), [cL, cS] = host.querySelectorAll(".hm-center small"), cV = host.querySelector(".hm-center b"), leg = opts.legend;
  function draw(anim) {
    const list = DATA[set], tot = list.reduce((a, x) => a + x.v, 0); g.innerHTML = ""; let off = 0;
    list.forEach((x, i) => {
      const len = x.v / tot * L, c = document.createElementNS(ns, "circle"), dash = `${Math.max(1, len - 3)} ${L}`;
      for (const [k, v] of Object.entries({ cx, cy: cx, r, fill: "none", stroke: x.c, "stroke-width": w, "stroke-dasharray": dash, "stroke-dashoffset": -off, tabindex: 0, role: "button", "aria-label": `${x.n}: ${eur(x.v)}` })) c.setAttribute(k, v);
      c.classList.add("hm-arc"); c.dataset.i = i;
      if (anim && !REDUCE) { c.style.strokeDasharray = `0 ${L}`; setTimeout(() => { c.style.transition = "stroke-dasharray .9s cubic-bezier(.16,1,.3,1)"; c.style.strokeDasharray = dash; }, 120 + i * 90); }
      g.appendChild(c); off += len;
    });
    sel = null; paint();
  }
  function paint() {
    const list = DATA[set], tot = list.reduce((a, x) => a + x.v, 0);
    g.querySelectorAll(".hm-arc").forEach(a => { const on = sel === +a.dataset.i; a.classList.toggle("dim", sel !== null && !on); a.setAttribute("stroke-width", on ? w + 10 : w); });
    if (sel === null) { cL.textContent = "Patrimonio totale"; cV.textContent = eur(TOT); cS.textContent = SUB; }
    else { const x = list[sel]; cL.textContent = x.n; cV.textContent = eur(x.v); cS.textContent = `${pct(x.v / tot)} del totale · +${eur(x.g)}`; }
    if (leg) leg.innerHTML = list.map((x, i) => `<li><button type="button" data-i="${i}" class="${sel === i ? "on" : sel !== null ? "dim" : ""}"><i style="background:${x.c}"></i><span>${x.n}</span><b>${eur(x.v)}</b><em>${pct(x.v / tot)}</em></button></li>`).join("");
  }
  const pick = i => { sel = sel === i ? null : i; paint(); };
  host.addEventListener("click", e => { const a = e.target.closest(".hm-arc"); if (a) pick(+a.dataset.i); else { sel = null; paint(); } });
  host.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("hm-arc")) { e.preventDefault(); pick(+e.target.dataset.i); } });
  if (leg) leg.addEventListener("click", e => { const b = e.target.closest("[data-i]"); if (b) pick(+b.dataset.i); });
  draw(true);
  return { set: s => { if (s !== set) { set = s; draw(true); } }, pick, get sel() { return sel; } };
}

/* telefono in cima: anello per categoria / per strumento */
const R1 = ring(document.getElementById("hmRing1"), { size: 230, w: 26, set: "categorie", legend: document.getElementById("hmLeg1") });
document.querySelectorAll("[data-hmset]").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll("[data-hmset]").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
  R1 && R1.set(b.dataset.hmset);
}));

/* racconto: tre passi, il telefono cambia schermata */
const story = document.querySelector(".hm-story");
if (story) {
  const R2 = ring(document.getElementById("hmRing2"), { size: 240, w: 26, legend: document.getElementById("hmLeg2") });
  const sg1 = document.getElementById("hmSg1"), sg2 = document.getElementById("hmSg2"); let tSel = null;
  const so = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; const s = e.target.dataset.hmstep;
    clearTimeout(tSel); story.classList.toggle("btp-on", s === "btp");
    if (s !== "btp") { R2.set(s); sg1.classList.toggle("on", s === "strumenti"); sg2.classList.toggle("on", s === "categorie"); }
    if (s === "strumenti") tSel = setTimeout(() => { if (R2.sel === null) R2.pick(0); }, 1100);
  }), { rootMargin: "-45% 0px -45% 0px" });
  document.querySelectorAll("[data-hmstep]").forEach(s => so.observe(s));
}

/* pulsanti della vetrina → funzioni vere */
document.addEventListener("click", e => { const b = e.target.closest("[data-hmgo]"); if (!b) return; const t = document.getElementById(b.dataset.hmgo); if (t) t.click(); });

export { DATA as VETRINA_DATI, ring as vetrinaRing };
