/* BLACK SWAN: THE LAST PORTFOLIO · interfaccia
   Si carica solo quando entri nel gioco. Tutti i numeri vengono dal motore (blackswan-engine.js) sui dati storici reali. */
import * as B from "./blackswan-engine.js";

const CRISES = [
  { id: "dotcom", yr: "2000", name: "Bolla dot-com", sub: "2000 – 2002", brief: "Marzo 2000. Internet promette di cambiare tutto e i titoli tecnologici valgono cifre mai viste. Poi gli utili non arrivano, il credito si stringe, arrivano l'11 settembre, Enron e WorldCom. Tre anni di ribassi, con rimbalzi che illudono.", macro: "Tassi Fed dal 6,5% all'1%; euro sotto la parità col dollaro e poi in forte rialzo." },
  { id: "gfc", yr: "2008", name: "Crisi finanziaria globale", sub: "2007 – 2009", brief: "Estate 2007. I mutui subprime americani iniziano a non essere ripagati. Le banche smettono di fidarsi l'una dell'altra. A settembre 2008 Lehman Brothers fallisce e il sistema finanziario rischia di fermarsi.", macro: "Fed a zero, salvataggi bancari, recessione globale. Le obbligazioni governative diventano il rifugio." },
  { id: "euro", yr: "2011", name: "Crisi del debito euro", sub: "2011 – 2012", brief: "2011. Grecia, Irlanda, Portogallo, poi Italia e Spagna: i mercati dubitano che l'euro possa reggere. Lo spread sale, i governi cadono, la BCE prova a tenere insieme l'unione monetaria.", macro: "Declassamento degli USA, spread BTP-Bund oltre 500 punti, aste LTRO, «whatever it takes»." },
  { id: "covid", yr: "2020", name: "Crollo COVID-19", sub: "2020", brief: "Febbraio 2020. Un virus si diffonde dalla Cina all'Italia e poi al mondo. In un mese l'economia globale si ferma: il crollo più veloce della storia. Poi le banche centrali stampano come mai prima.", macro: "Lockdown, petrolio sotto zero, tassi a zero e acquisti illimitati della Fed." },
  { id: "infl", yr: "2022", name: "Shock inflazione", sub: "2022 – 2023", brief: "2022. L'inflazione che sembrava «temporanea» arriva all'8-10%. La guerra in Ucraina fa esplodere l'energia. Le banche centrali alzano i tassi alla velocità più alta da decenni: scendono insieme azioni e obbligazioni.", macro: "Fed e BCE alzano i tassi di centinaia di punti; nel 2023 fallisce Silicon Valley Bank." }
];
const NAMES = { eq_us: "Azioni USA", eq_eu: "Azioni Europa", tech: "Tecnologia", bond: "Treasury 10a", cash: "Liquidità €" };
const SHORT = { eq_us: "USA", eq_eu: "Europa", tech: "Tech", bond: "Treasury", cash: "Cash" };
const COLORS = { eq_us: "#D4FF3A", eq_eu: "#47E5FF", tech: "#FF7AD9", bond: "#A47BFF", cash: "#CFC5EA" };
const SPEEDS = [{ k: "1", l: "×1", ms: 260, d: 1 }, { k: "2", l: "×4", ms: 70, d: 1 }, { k: "3", l: "×16", ms: 50, d: 4 }];
const DATA = new Map();
let ctx = null, R = null; // ctx: { P, go, SFX } dal sito; R: stato della sessione di gioco
const $ = s => document.querySelector(s), esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const eur = v => Number.isFinite(v) ? Math.round(v).toLocaleString("it-IT", { useGrouping: "always" }) + " €" : "—";
const pct = (v, d = 1, s = false) => Number.isFinite(v) ? (s && v > 0 ? "+" : "") + (v * 100).toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%" : "—";
const sfx = (k, ...a) => { const S = ctx && ctx.SFX; if (S && S.on && typeof S[k] === "function") S[k](...a); };
const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const SAVE = "bs-save-v1";

export function open(c) {
  ctx = c;
  if (!document.getElementById("bs-css")) { const l = document.createElement("link"); l.id = "bs-css"; l.rel = "stylesheet"; l.href = "/css/blackswan.css"; document.head.appendChild(l); }
  let root = $("#bs-root");
  if (!root) { root = document.createElement("div"); root.id = "bs-root"; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "BLACK SWAN, il gioco"); document.body.appendChild(root); }
  document.body.classList.add("bs-on"); root.hidden = false;
  menu();
  document.addEventListener("keydown", onKey, true);
}
function close() {
  stop(); saveGame();
  const root = $("#bs-root"); if (root) { root.hidden = true; root.innerHTML = ""; }
  document.body.classList.remove("bs-on"); document.removeEventListener("keydown", onKey, true); window.removeEventListener("resize", onResize);
}

/* ---------- Menu e briefing ---------- */
function menu() {
  stop();
  const saved = loadSave();
  $("#bs-root").innerHTML = `<div class="bs-menu">
    <div class="bs-brand"><span class="bs-swan" aria-hidden="true"></span><div><h1>BLACK SWAN</h1><p>THE LAST PORTFOLIO · <em>Every decision has a price.</em></p></div><button class="bs-x" data-bs="exit" aria-label="Esci dal gioco">✕</button></div>
    <p class="bs-lead">Gestisci un portafoglio da <b>1.000.000 €</b> dentro una crisi finanziaria vera, giorno per giorno. I prezzi sono quelli storici, le decisioni sono tue, ogni scelta ha un costo. Sopravvivi, proteggi il capitale, rispetta i vincoli.</p>
    ${saved ? `<button class="bs-resume" data-bs="resume"><span>Partita salvata</span><b>${esc(CRISES.find(c => c.id === saved.crisis)?.name || saved.crisis)}</b><small>${esc(saved.date || "")} · riprendi da dove eri</small></button>` : ""}
    <div class="bs-crises">${CRISES.map((c, i) => `<button class="bs-crisis" data-crisis="${c.id}" style="--i:${i}"><span class="yr">${c.yr}</span><b>${esc(c.name)}</b><small>${c.sub}</small></button>`).join("")}</div>
    <p class="bs-src">Dati giornalieri reali convertiti in euro: Kenneth French Data Library (azioni USA e Europa, rendimento totale), FRED (Nasdaq-100, Treasury 10 anni, cambio), BCE (Euribor). Le notizie sono fatti storici. Modalità roguelike con crisi simulate: in arrivo.</p>
  </div>`;
}
async function briefing(id) {
  const C = CRISES.find(c => c.id === id), seed = Math.floor(Math.random() * 1e6) + 1;
  R = { crisis: C, seed, profile: "bilanciato", weights: { ...B.PROFILES.bilanciato }, pac: 0, objectives: B.makeObjectives(seed) };
  $("#bs-root").innerHTML = `<div class="bs-brief">
    <div class="bs-brief-top"><button class="bs-back" data-bs="menu">← Crisi</button><span class="bs-tag">MISSION BRIEFING</span><button class="bs-x" data-bs="exit" aria-label="Esci">✕</button></div>
    <div class="bs-brief-grid">
      <div class="bs-story"><span class="yr">${C.yr}</span><h2>${esc(C.name)}</h2><p>${esc(C.brief)}</p><p class="macro"><b>Contesto:</b> ${esc(C.macro)}</p>
        <div class="bs-load" id="bsLoad"><i></i>Scarico i dati storici giornalieri…</div></div>
      <div class="bs-setup">
        <h3>Obiettivi di questa partita <small>seme ${seed}</small></h3>
        <ul class="bs-obj">${R.objectives.map(o => `<li class="${o.hard ? "hard" : o.side ? "side" : ""}"><b>${o.hard ? "VINCOLO" : o.side ? "MISSIONE" : "OBIETTIVO"}</b>${esc(o.t)}</li>`).join("")}</ul>
        <h3>Allocazione iniziale</h3>
        <div class="bs-prof">${Object.keys(B.PROFILES).map(p => `<button data-prof="${p}" aria-pressed="${p === R.profile}">${p}</button>`).join("")}</div>
        <div class="bs-alloc" id="bsAlloc"></div>
        <label class="bs-pac">Piano di accumulo mensile <input type="number" min="0" step="500" value="0" id="bsPac"> €</label>
        <button class="bs-go" data-bs="start" disabled id="bsStart">ENTRA NELLA CRISI</button>
        <p class="bs-fine">Costi di transazione 0,10% per operazione. La liquidità rende l'Euribor. Le obbligazioni sono Treasury a 10 anni ricostruiti dal rendimento, con cambio coperto.</p>
      </div></div></div>`;
  allocUI();
  try { await loadData(id); $("#bsLoad").innerHTML = `<i class="ok"></i>${DATA.get(id).dates.length} giorni di borsa pronti (${DATA.get(id).from} → ${DATA.get(id).to})`; $("#bsStart").disabled = false; }
  catch (e) { $("#bsLoad").innerHTML = `<i class="err"></i>${esc(e.message)}`; }
}
async function loadData(id) {
  if (DATA.has(id)) return DATA.get(id);
  const r = await fetch(`/api/market?crisis=${id}`, { signal: AbortSignal.timeout(60000) }).catch(() => { throw new Error("I dati si scaricano dal sito pubblicato o dall'anteprima locale."); });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.dates) throw new Error(j.error || `Errore del server (${r.status}).`);
  DATA.set(id, j); return j;
}
function allocUI() {
  const el = $("#bsAlloc"); if (!el) return;
  el.innerHTML = B.ASSETS.map(a => `<label><span><i style="background:${COLORS[a]}"></i>${NAMES[a]}</span><input type="range" min="0" max="100" step="5" value="${Math.round(R.weights[a] * 100)}" data-w="${a}"><b>${Math.round(R.weights[a] * 100 / sumW(R.weights))}%</b></label>`).join("");
}
const sumW = w => B.ASSETS.reduce((s, a) => s + w[a], 0) || 1;

/* ---------- Partita ---------- */
function startGame(restore) {
  const data = DATA.get(R.crisis.id);
  const cfg = { capital: 1e6, weights: R.weights, pac: R.pac, seed: R.seed, objectives: R.objectives };
  R.cfg = cfg; R.g = restore ? B.simulate(data, cfg, restore.decisions, restore.t) : B.createGame(data, cfg);
  R.playing = false; R.speed = 0; R.untilEvent = false; R.timer = 0; R.event = null; R.marks = [];
  if (restore) R.g.decisions.forEach(d => R.marks.push({ t: d.t, kind: "dec" }));
  cockpit(); render(); intro();
}
function intro() {
  const C = R.crisis, ov = document.createElement("div"); ov.className = "bs-intro";
  ov.innerHTML = `<div class="l1">${C.yr}</div><div class="l2">${esc(C.name)}</div><div class="l3">Capitale: 1.000.000 € · ${R.g.n - 1} giorni di borsa</div><div class="l4" id="bsCd">3</div>`;
  $("#bs-root").appendChild(ov); let n = 3; sfx("beep", false);
  const iv = setInterval(() => { n--; const el = ov.querySelector("#bsCd"); if (n > 0) { el.textContent = n; sfx("beep", false); } else { clearInterval(iv); el.textContent = "LIVE"; sfx("beep", true); setTimeout(() => { ov.remove(); play(0); }, 450); } }, REDUCE ? 250 : 800);
}
function cockpit() {
  $("#bs-root").innerHTML = `<div class="bs-cc" id="bsCC">
    <header class="bs-hd"><div class="bs-logo"><span class="bs-swan sm"></span>BLACK SWAN</div>
      <div class="bs-clock"><span id="bsCrisis">${esc(R.crisis.name)}</span><b id="bsDate"></b><small id="bsDay"></small></div>
      <div class="bs-ctl" role="group" aria-label="Tempo">
        <button data-bs="pause" id="bsPlay" title="Spazio">▶</button>${SPEEDS.map((s, i) => `<button data-speed="${i}" title="Tasto ${s.k}">${s.l}</button>`).join("")}
        <button data-bs="next" title="Tasto N: corre fino al prossimo evento">⏭ evento</button><button data-bs="day" title="→">+1g</button><button data-bs="week" title="Shift+→">+1s</button></div>
      <div class="bs-hd-r"><button data-bs="war" class="bs-war-b" title="Tasto W">WAR ROOM</button><button data-bs="sfx" id="bsSfx">${ctx.SFX && ctx.SFX.on ? "🔊" : "🔇"}</button><button data-bs="save" title="Salva ed esci">💾</button><button class="bs-x" data-bs="exit" aria-label="Esci">✕</button></div></header>
    <div class="bs-prog"><i id="bsProg"></i><div id="bsMarks"></div></div>
    <section class="bs-left">
      <div class="bs-nav"><span>Valore del portafoglio</span><b id="bsNav"></b><small id="bsNavD"></small><small id="bsVsHold"></small></div>
      <div class="bs-meter"><span>Drawdown <em id="bsDDv"></em></span><div class="bar"><i id="bsDD"></i><s id="bsDDlim"></s></div><small id="bsDDtxt"></small></div>
      <div class="bs-meter press"><span>Pressione psicologica <em id="bsPv"></em></span><div class="bar"><i id="bsP"></i></div><small id="bsPtxt"></small></div>
      <div class="bs-objs"><span class="h">Obiettivi</span><ul id="bsObj"></ul></div>
    </section>
    <section class="bs-center">
      <div class="bs-chart"><canvas id="bsCv" aria-label="Valore del portafoglio, chi non tocca nulla e mercato azionario USA"></canvas><div class="bs-legend"><span><i style="background:#D4FF3A"></i>Tu</span><span><i style="background:#FF7AD9"></i>Fermo (buy & hold)</span><span><i style="background:rgba(207,197,234,.6)"></i>Azioni USA</span></div></div>
      <div class="bs-assets" id="bsAssets"></div>
      <div class="bs-quick" role="group" aria-label="Azioni rapide">
        <button data-q="protect25">Proteggi 25%</button><button data-q="protect50">Proteggi 50%</button><button data-q="dip">Compra il ribasso<small>25% della liquidità in azioni USA</small></button><button data-q="rebal">Ribilancia</button><button data-q="hold">Mantieni la rotta</button></div>
    </section>
    <section class="bs-right">
      <div class="bs-vitals" id="bsVitals"></div>
      <div class="bs-feed"><span class="h">Notizie ed eventi</span><ul id="bsFeed" aria-live="polite"></ul></div>
    </section>
    <div class="bs-vign" aria-hidden="true"></div>
  </div>`;
  window.removeEventListener("resize", onResize); window.addEventListener("resize", onResize);
}
function play(i) { if (R.g.over) return finish(); R.speed = i; R.playing = true; R.untilEvent = false; loop(); ui(); }
function stop() { if (R && R.timer) { clearTimeout(R.timer); R.timer = 0; } if (R) R.playing = false; }
function pause() { stop(); ui(); }
function loop() {
  if (!R || !R.playing) return;
  const S = SPEEDS[R.speed], dpt = R.untilEvent ? 6 : S.d;
  R.timer = setTimeout(() => { for (let k = 0; k < dpt && R.playing; k++) tick(); if (R.playing) loop(); }, R.untilEvent ? 30 : S.ms);
}
function tick() {
  const g = R.g; if (R.event) return; if (g.over) { stop(); return finish(); }
  const ev = B.step(g);
  ev.forEach(e => { R.marks.push({ t: e.t, kind: e.kind }); feed(e); });
  const big = ev.find(e => e.kind === "fail") || ev.find(e => e.kind !== "news") || ev.find(e => e.kind === "news" && e.s < 0 && R.untilEvent);
  if (ev.some(e => e.kind === "news")) sfx("alarm");
  if (g.t % 3 === 0 || ev.length || !R.playing || R.speed === 0) render();
  if (ev.some(e => e.kind === "collapse")) shake("crash"); else if (ev.some(e => e.kind === "recovery")) shake("pump");
  if (big) { stop(); render(); return big.kind === "fail" ? setTimeout(finish, 1600) : decision(big); }
  if (ev.length && R.untilEvent) { stop(); render(); }
  if (g.over) { stop(); render(); setTimeout(finish, 900); }
  if (g.t % 25 === 0) saveGame();
}
function shake(k) { const el = $("#bsCC"); if (!el || REDUCE) return; el.classList.remove("fx-crash", "fx-pump"); void el.offsetWidth; el.classList.add("fx-" + k); if (k === "crash") sfx("crash"); else sfx("gain"); }
function feed(e) {
  const ul = $("#bsFeed"); if (!ul) return;
  ul.insertAdjacentHTML("afterbegin", `<li class="k-${e.kind} ${e.s < 0 ? "neg" : "pos"}"><b>${R.g.data.dates[e.t]} · ${esc(e.title)}</b>${esc(e.text)}</li>`);
  while (ul.children.length > 40) ul.lastChild.remove();
}
function ui() {
  const pb = $("#bsPlay"); if (pb) pb.textContent = R.playing ? "❚❚" : "▶";
  document.querySelectorAll("[data-speed]").forEach(b => b.setAttribute("aria-pressed", String(R.playing && !R.untilEvent && +b.dataset.speed === R.speed)));
}

/* ---------- Aggiornamento del command center ---------- */
function render() {
  const g = R.g; if (!$("#bsCC")) return;
  const d = g.data.dates[g.t], dd = g.nav / g.peak - 1, lim = (g.objectives.find(o => o.id === "maxdd") || {}).lim || .3, P = B.pressure(g), m = B.marketState(g, g.t);
  $("#bsDate").textContent = new Date(d + "T00:00:00Z").toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  $("#bsDay").textContent = `giorno ${g.t} di ${g.n - 1}`;
  $("#bsProg").style.width = (g.t / (g.n - 1) * 100) + "%";
  $("#bsMarks").innerHTML = R.marks.slice(-120).map(x => `<i class="m-${x.kind}" style="left:${x.t / (g.n - 1) * 100}%"></i>`).join("");
  $("#bsNav").textContent = eur(g.nav);
  $("#bsNavD").textContent = `${pct(g.nav / g.invested - 1, 1, true)} dall'inizio`; $("#bsNavD").className = g.nav >= g.invested ? "up" : "dn";
  const gap = g.nav - g.hold; $("#bsVsHold").textContent = `${gap >= 0 ? "avanti" : "indietro"} di ${eur(Math.abs(gap))} rispetto a chi sta fermo`; $("#bsVsHold").className = gap >= 0 ? "up" : "dn";
  $("#bsDDv").textContent = pct(dd, 1); $("#bsDD").style.width = Math.min(100, -dd / lim * 100) + "%"; $("#bsDD").className = -dd > lim * .8 ? "hot" : -dd > lim * .5 ? "warm" : "";
  $("#bsDDlim").title = `limite ${pct(-lim, 0)}`; $("#bsDDtxt").textContent = `limite di liquidazione −${Math.round(lim * 100)}% · massimo calo finora ${pct(g.mdd, 1)}`;
  $("#bsPv").textContent = P; $("#bsP").style.width = P + "%";
  $("#bsPtxt").textContent = P >= 75 ? "Il panico è nell'aria. Respira prima di decidere." : P >= 50 ? "Mercato nervoso: le notizie spingono a reagire." : P >= 25 ? "Tensione moderata." : "Mercato calmo.";
  const cc = $("#bsCC"); cc.style.setProperty("--press", (P / 100).toFixed(2)); cc.classList.toggle("alert", P >= 75); cc.dataset.mood = P >= 75 ? "crisis" : P >= 45 ? "tense" : "calm";
  if (P >= 75 && R.playing && g.t % 8 === 0) sfx("tone", 55, .25, "sine", .12);
  $("#bsObj").innerHTML = g.objectives.map(o => { const st = objState(g, o); return `<li class="${st.c}"><i></i><span>${esc(o.t)}</span><small>${esc(st.txt)}</small></li>`; }).join("");
  $("#bsAssets").innerHTML = B.ASSETS.map(a => { const r = g.data.assets[a].r[g.t] || 0, w = g.V[a] / g.nav; return `<div class="bs-as"><span><i style="background:${COLORS[a]}"></i>${NAMES[a]}</span><b>${eur(g.V[a])}</b><small class="${r >= 0 ? "up" : "dn"}">${pct(r, 2, true)} oggi</small><div class="w"><i style="width:${(w * 100).toFixed(1)}%;background:${COLORS[a]}"></i></div><em>${pct(w, 0)}</em></div>`; }).join("");
  $("#bsVitals").innerHTML = [["Mercato USA dal massimo", pct(m.dd, 1), m.dd < -.2 ? "dn" : ""], ["Ultima settimana", pct(m.r5, 1, true), m.r5 < 0 ? "dn" : "up"], ["Volatilità 20 giorni", pct(m.vol, 0), m.vol > .35 ? "dn" : ""], ["Giorni rossi di fila", m.down, m.down >= 4 ? "dn" : ""], ["Liquidità", pct(g.V.cash / g.nav, 1), ""], ["Costi pagati", eur(g.fees), ""]].map(x => `<div><span>${x[0]}</span><b class="${x[2]}">${x[1]}</b></div>`).join("");
  drawChart(); if ($("#bsWar")) warRender();
}
function objState(g, o) {
  if (o.id === "maxdd") { const dd = g.nav / g.peak - 1; return { c: g.failed ? "ko" : -g.mdd > o.lim * .8 ? "risk" : "ok", txt: `calo massimo ${pct(g.mdd, 1)}` }; }
  if (o.id === "cash") return { c: g.breaches.cash ? "ko" : g.V.cash / g.nav < .07 ? "risk" : "ok", txt: g.breaches.cash ? `${g.breaches.cash} giorni sotto il 5%` : `liquidità ${pct(g.V.cash / g.nav, 1)}` };
  if (o.id === "conc") return { c: g.breaches.conc ? "ko" : "ok", txt: g.breaches.conc ? `${g.breaches.conc} giorni oltre il limite` : "rispettato" };
  if (o.id === "recover") return { c: g.nav >= g.invested ? "ok" : "risk", txt: pct(g.nav / g.invested - 1, 1, true) };
  if (o.id === "beat") return { c: g.nav >= g.hold ? "ok" : "risk", txt: g.nav >= g.hold ? "avanti" : "indietro" };
  if (o.id === "sortino") return { c: "wait", txt: "si valuta alla fine" };
  if (o.id === "dip") return { c: "wait", txt: "si valuta alla fine" };
  return { c: "wait", txt: "" };
}
function onResize() { drawChart(); const r = $("#bsReplay"); if (r && R) drawAut(+r.value); }
function drawChart() {
  const cv = $("#bsCv"); if (!cv || !R) return;
  const g = R.g, W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1); if (!W || !H) return;
  if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
  const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const n = g.n, A = g.navHist, Hh = g.holdHist, eq = [g.capital]; let v = g.capital; for (let t = 1; t <= g.t; t++) { v *= 1 + g.data.assets.eq_us.r[t]; eq.push(v); }
  const all = [...A, ...Hh, ...eq], lo = Math.min(...all) * .97, hi = Math.max(...all) * 1.03, ml = 64, mr = 12, mt = 12, mb = 22;
  const X = i => ml + i / (n - 1) * (W - ml - mr), Y = x => mt + (H - mt - mb) * (1 - (x - lo) / (hi - lo));
  c.font = "11px JetBrains Mono, monospace"; c.fillStyle = "rgba(207,197,234,.55)"; c.strokeStyle = "rgba(176,140,255,.12)"; c.lineWidth = 1;
  for (let k = 0; k <= 4; k++) { const val = lo + (hi - lo) * k / 4, y = Y(val); c.beginPath(); c.moveTo(ml, y); c.lineTo(W - mr, y); c.stroke(); c.fillText((val / 1e6).toLocaleString("it-IT", { maximumFractionDigits: 2 }) + " mln", 4, y + 4); }
  const yr = {}; g.data.dates.forEach((d, i) => { const y = d.slice(0, 4); if (!(y in yr)) yr[y] = i; }); Object.entries(yr).forEach(([y, i]) => { if (i > 0) { c.fillText(y, X(i) - 14, H - 6); c.beginPath(); c.moveTo(X(i), mt); c.lineTo(X(i), H - mb); c.stroke(); } });
  /* il futuro: zona scura */
  c.fillStyle = "rgba(5,2,12,.45)"; c.fillRect(X(g.t), mt, W - mr - X(g.t), H - mt - mb);
  c.fillStyle = "rgba(207,197,234,.35)"; c.font = "12px JetBrains Mono, monospace"; if (g.t < n - 20) c.fillText("FUTURO SCONOSCIUTO", Math.min(W - 170, X(g.t) + 14), mt + 18);
  /* segni degli eventi e delle decisioni */
  R.marks.forEach(x => { c.strokeStyle = x.kind === "dec" ? "rgba(212,255,58,.55)" : x.kind === "news" ? "rgba(255,92,138,.35)" : "rgba(255,194,75,.45)"; c.beginPath(); c.moveTo(X(x.t), mt); c.lineTo(X(x.t), H - mb); c.stroke(); });
  const line = (arr, col, w, dash) => { c.setLineDash(dash || []); c.strokeStyle = col; c.lineWidth = w; c.beginPath(); arr.forEach((y, i) => { const px = X(i), py = Y(y); i ? c.lineTo(px, py) : c.moveTo(px, py); }); c.stroke(); c.setLineDash([]); };
  line(eq, "rgba(207,197,234,.45)", 1.2);
  line(Hh, "#FF7AD9", 1.6, [6, 5]);
  const grd = c.createLinearGradient(0, mt, 0, H - mb); grd.addColorStop(0, "rgba(212,255,58,.22)"); grd.addColorStop(1, "rgba(212,255,58,0)");
  c.fillStyle = grd; c.beginPath(); A.forEach((y, i) => { i ? c.lineTo(X(i), Y(y)) : c.moveTo(X(i), Y(y)); }); c.lineTo(X(A.length - 1), H - mb); c.lineTo(X(0), H - mb); c.fill();
  line(A, "#D4FF3A", 2.4);
  const lx = X(A.length - 1), ly = Y(A[A.length - 1]); c.fillStyle = "#D4FF3A"; c.shadowColor = "#D4FF3A"; c.shadowBlur = 14; c.beginPath(); c.arc(lx, ly, 4.5, 0, 7); c.fill(); c.shadowBlur = 0;
}

/* ---------- Eventi: finestra di decisione a tempo ---------- */
const EVENT_CHOICES = {
  collapse: [["Mantieni la rotta", { type: "hold" }, "Non vendi nel momento peggiore, ma il calo potrebbe continuare."], ["Proteggi il 30%", { type: "protect", pct: .3 }, "Riduci il rischio, ma rischi di perdere il rimbalzo."], ["Compra il ribasso", { type: "buy", asset: "eq_us", pct: .5 }, "Usi metà della liquidità ai prezzi bassi; la liquidità scende."], ["Ribilancia", { type: "rebalance" }, "Torni ai pesi obiettivo: vendi ciò che è salito, compri ciò che è sceso."]],
  recovery: [["Resta prudente", { type: "hold" }, "Se il rimbalzo è vero ne prendi solo una parte."], ["Aumenta il rischio", { type: "profile", profile: "aggressivo" }, "Se il rimbalzo è falso il prossimo calo farà più male."], ["Incassa il 25%", { type: "protect", pct: .25 }, "Metti al sicuro una parte, a costo di uscire presto."]],
  vol: [["Mantieni la rotta", { type: "hold" }, "La volatilità passa, ma il drawdown può avvicinarsi al limite."], ["Profilo prudente", { type: "profile", profile: "prudente" }, "Meno oscillazioni, meno rendimento atteso."], ["Ribilancia", { type: "rebalance" }, "Riporti il rischio ai pesi scelti."]],
  news: [["Mantieni la rotta", { type: "hold" }, "Le notizie fanno rumore: non sempre muovono i prezzi come temi."], ["Proteggi il 20%", { type: "protect", pct: .2 }, "Un po' di protezione, un po' di costo opportunità."], ["Compra il ribasso", { type: "buy", asset: "eq_us", pct: .3 }, "Scommetti che il panico sia esagerato."]]
};
function decision(e) {
  const box = document.createElement("div"); box.className = `bs-event k-${e.kind}`; box.setAttribute("role", "alertdialog"); box.setAttribute("aria-label", e.title);
  const ch = EVENT_CHOICES[e.kind] || EVENT_CHOICES.news, g = R.g, dd = g.nav / g.peak - 1, lim = (g.objectives.find(o => o.id === "maxdd") || {}).lim || .3;
  let left = 15;
  box.innerHTML = `<div class="bs-ev-in"><div class="bs-ev-top"><span>${e.kind === "news" ? "ULTIM'ORA" : "ALLERTA"} · ${g.data.dates[e.t]}</span><b id="bsEvT">${left}</b></div>
    <h3>${esc(e.title)}</h3><p>${esc(e.text)}</p>
    <div class="bs-ev-stats"><div><span>Portafoglio</span><b>${eur(g.nav)}</b></div><div><span>Drawdown</span><b class="dn">${pct(dd, 1)}</b></div><div><span>Margine al limite</span><b>${pct(lim + dd, 1)}</b></div><div><span>Liquidità</span><b>${eur(g.V.cash)}</b></div></div>
    <div class="bs-ev-ch">${ch.map((c, i) => `<button data-ev="${i}"><b>${i + 1} · ${esc(c[0])}</b><small>${esc(c[2])}</small></button>`).join("")}</div>
    <p class="bs-ev-f">Senza una scelta entro il tempo, mantieni la rotta. Il tempo è fermo finché non decidi.</p></div>`;
  $("#bs-root").appendChild(box); R.event = { box, ch };
  setTimeout(() => { const b = box.querySelector("[data-ev]"); if (b) b.focus(); }, 50);
  R.evTimer = setInterval(() => { left--; const t = box.querySelector("#bsEvT"); if (t) { t.textContent = left; t.classList.toggle("hot", left <= 5); } if (left <= 5 && left > 0) sfx("tick"); if (left <= 0) choose(0, true); }, 1000);
}
function choose(i, timeout) {
  if (!R.event) return; clearInterval(R.evTimer);
  const c = R.event.ch[i]; R.event.box.remove(); R.event = null;
  doDecision(c[1], timeout ? "Tempo scaduto: mantieni la rotta" : c[0]);
  play(R.speed);
}
function doDecision(dec, label) {
  const res = B.apply(R.g, dec);
  if (!res.ok) { toast(res.error, true); return; }
  if (dec.type !== "hold") R.marks.push({ t: R.g.t, kind: "dec" });
  feed({ t: R.g.t, kind: "dec", title: "DECISIONE", text: label || dec.type, s: 1 }); sfx("tone", dec.type === "hold" ? 520 : 880, .1, "triangle", .06);
  render(); saveGame();
}
function toast(msg, bad) { const t = document.createElement("div"); t.className = "bs-toast" + (bad ? " bad" : ""); t.textContent = msg; $("#bs-root").appendChild(t); setTimeout(() => t.remove(), 2600); }

/* ---------- War Room: decisioni senza fermare il tempo ---------- */
function war() {
  if ($("#bsWar")) { $("#bsWar").remove(); return; }
  const p = document.createElement("aside"); p.id = "bsWar"; p.className = "bs-war"; p.setAttribute("aria-label", "War Room");
  R.warW = Object.fromEntries(B.ASSETS.map(a => [a, Math.round(R.g.V[a] / R.g.nav * 100)]));
  p.innerHTML = `<div class="bs-war-h"><b>WAR ROOM</b><span>il tempo continua a scorrere</span><button data-bs="war" aria-label="Chiudi la War Room">✕</button></div><div id="bsWarB"></div>`;
  $("#bs-root").appendChild(p); warRender(true);
}
function warRender(full) {
  const p = $("#bsWarB"); if (!p) return; const g = R.g, t = g.t, A = g.data.assets;
  /* rischio degli ultimi 60 giorni: volatilità di ogni asset e correlazioni */
  const s = Math.max(1, t - 59), win = a => A[a].r.slice(s, t + 1), mean = x => x.reduce((q, v) => q + v, 0) / (x.length || 1);
  const sd = x => { const m = mean(x); return Math.sqrt(x.reduce((q, v) => q + (v - m) ** 2, 0) / Math.max(1, x.length - 1)); };
  const corr = (a, b) => { const x = win(a), y = win(b), mx = mean(x), my = mean(y); let n = 0, dx = 0, dy = 0; x.forEach((v, i) => { n += (v - mx) * (y[i] - my); dx += (v - mx) ** 2; dy += (y[i] - my) ** 2; }); return dx && dy ? n / Math.sqrt(dx * dy) : NaN; };
  const pr = g.retHist.slice(-60), pvol = sd(pr) * Math.sqrt(252);
  const tot = B.ASSETS.reduce((q, a) => q + R.warW[a], 0) || 1;
  const head = `<div class="bs-war-k"><div><span>Valore</span><b>${eur(g.nav)}</b></div><div><span>Volatilità del portafoglio (60g)</span><b>${pct(pvol, 1)}</b></div><div><span>Drawdown</span><b class="dn">${pct(g.nav / g.peak - 1, 1)}</b></div><div><span>Liquidità</span><b>${pct(g.V.cash / g.nav, 1)}</b></div></div>`;
  const rows = B.ASSETS.map(a => `<div class="bs-war-r"><span><i style="background:${COLORS[a]}"></i>${NAMES[a]}<small>ora ${pct(g.V[a] / g.nav, 0)} · vol ${pct(sd(win(a)) * Math.sqrt(252), 0)}</small></span>
    <input type="range" min="0" max="100" step="5" value="${R.warW[a]}" data-ww="${a}" aria-label="Nuovo peso ${NAMES[a]}"><b>${Math.round(R.warW[a] / tot * 100)}%</b>
    ${a !== "cash" ? `<div class="mini"><button data-wq="sell:${a}:.25">−25%</button><button data-wq="sell:${a}:1">Vendi tutto</button><button data-wq="buy:${a}:.25">Compra 25% liq.</button></div>` : ""}</div>`).join("");
  const keys = ["eq_us", "eq_eu", "tech", "bond"], cm = `<table class="bs-corr"><tr><td></td>${keys.map(k => `<th>${SHORT[k]}</th>`).join("")}</tr>${keys.map(a => `<tr><th>${SHORT[a]}</th>${keys.map(b => { const v = a === b ? 1 : corr(a, b); return `<td style="background:${v > 0 ? `rgba(255,92,138,${Math.abs(v) * .55})` : `rgba(91,240,165,${Math.abs(v) * .55})`}">${Number.isFinite(v) ? v.toFixed(2).replace(".", ",") : "—"}</td>`; }).join("")}</tr>`).join("")}</table>`;
  if (full || !p.querySelector(".bs-war-k")) {
    p.innerHTML = `${head}<h4>Nuova allocazione</h4>${rows}<div class="bs-war-go"><button data-bs="warexec" class="go">Esegui la nuova allocazione</button><button data-bs="rebal">Ribilancia ai pesi obiettivo</button></div>
      <h4>Piano di accumulo</h4><label class="bs-war-pac"><input type="number" min="0" step="500" value="${g.cfg.pac}" id="bsWarPac"> € al mese <button data-bs="pacset">Applica</button></label>
      <h4>Correlazioni (60 giorni)</h4>${cm}<h4>Ultimi eventi</h4><ul class="bs-war-ev">${g.events.slice(-5).reverse().map(e => `<li>${g.data.dates[e.t]} · ${esc(e.title)}</li>`).join("") || "<li>Nessun evento.</li>"}</ul>`;
  } else { p.querySelector(".bs-war-k").outerHTML = head; }
}

/* ---------- Fine partita: autopsia e replay ---------- */
function finish() {
  stop(); if (!R || R.done) return; R.done = true; clearSave();
  const g = R.g, F = B.finalize(g), imp = B.decisionImpact(g.data, R.cfg, g.decisions).filter(x => x.type !== "hold");
  const good = [...imp].sort((a, b) => b.delta - a.delta).filter(x => x.delta > 0).slice(0, 3), bad = [...imp].sort((a, b) => a.delta - b.delta).filter(x => x.delta < 0).slice(0, 3);
  const rank = F.failed ? "LIQUIDATO" : F.score >= 850 ? "LEGGENDA" : F.score >= 700 ? "GESTORE D'ÉLITE" : F.score >= 550 ? "SOPRAVVISSUTO" : F.score >= 400 ? "FERITO" : "NAUFRAGO";
  sfx(F.failed || F.score < 500 ? "lose" : "win");
  const dlabel = d => ({ sellPct: `Vendi ${Math.round(d.pct * 100)}% ${NAMES[d.asset] || ""}`, buy: `Compra ${NAMES[d.asset] || ""} con ${Math.round(d.pct * 100)}% della liquidità`, protect: `Proteggi ${Math.round(d.pct * 100)}%`, target: "Nuova allocazione", rebalance: "Ribilancia", profile: `Profilo ${d.profile}`, pac: `PAC ${eur(d.amount)}/mese`, hold: "Mantieni la rotta" }[d.type] || d.type);
  const lessons = [];
  if (F.behavior.items.find(x => x.id === "panic").n) lessons.push(`Hai ridotto il rischio dopo cali violenti ${F.behavior.items.find(x => x.id === "panic").n} volta/e: nelle crisi i giorni migliori arrivano spesso subito dopo i peggiori.`);
  if (F.cashDrag > .01) lessons.push(`La liquidità in eccesso ti è costata circa ${pct(F.cashDrag, 1)} di rendimento rispetto alle azioni.`);
  if (-F.mdd < -F.holdMdd * .7 && F.ret >= F.holdRet - .05) lessons.push("Hai contenuto il calo molto più di chi è rimasto fermo senza sacrificare troppo il rendimento: è gestione del rischio.");
  if (F.failed) lessons.push("Il limite di perdita è stato superato: con più obbligazioni o liquidità all'inizio il portafoglio avrebbe retto.");
  if (!g.decisions.filter(d => d.type !== "hold").length) lessons.push("Non hai toccato nulla: spesso è la strategia più difficile da battere, ma non protegge dai limiti di perdita.");
  if (!lessons.length) lessons.push("Le tue decisioni hanno avuto effetti misti: guarda l'impatto di ciascuna qui sotto.");
  const P = F.parts;
  $("#bs-root").innerHTML = `<div class="bs-aut">
    <div class="bs-aut-h"><div><span class="bs-tag">POST-CRISIS AUTOPSY · ${esc(R.crisis.name)}</span><h2>${rank}</h2></div><button class="bs-x" data-bs="exit" aria-label="Esci">✕</button></div>
    <div class="bs-aut-top">
      <div class="bs-score"><span>SURVIVAL SCORE</span><b id="bsScore">0</b><small>su 1.000 (+50 missione)</small>
        <ul>${[["Rischio-rendimento (Sortino vs fermo)", P.riskAdj, 300], ["Controllo del drawdown", P.drawdown, 250], ["Obiettivi", P.objectives, 200], ["Disciplina", P.discipline, 150], ["Costo della liquidità", P.cashDrag, 100]].map(x => `<li><span>${x[0]}</span><i><em style="width:${x[1] / x[2] * 100}%"></em></i><b>${x[1]}/${x[2]}</b></li>`).join("")}</ul></div>
      <div class="bs-aut-k">${[["Capitale finale", eur(F.nav), F.nav >= g.invested ? "up" : "dn"], ["Rendimento", pct(F.ret, 1, true), F.ret >= 0 ? "up" : "dn"], ["Chi è rimasto fermo", pct(F.holdRet, 1, true), ""], ["Drawdown massimo", pct(F.mdd, 1), "dn"], ["Fermo: drawdown", pct(F.holdMdd, 1), ""], ["Volatilità", pct(F.vol, 1), ""], ["Sharpe (in eccesso sul cash)", Number.isFinite(F.sharpe) ? F.sharpe.toFixed(2).replace(".", ",") : "—", ""], ["Sortino", Number.isFinite(F.sortino) ? F.sortino.toFixed(2).replace(".", ",") : "—", ""], ["Recupero", F.recovery != null ? `${F.recovery} giorni` : "non avvenuto", ""], ["Costi pagati", eur(F.fees), ""]].map(x => `<div><span>${x[0]}</span><b class="${x[2]}">${x[1]}</b></div>`).join("")}</div>
    </div>
    <div class="bs-aut-chart"><canvas id="bsAutCv"></canvas><input type="range" min="0" max="${g.t}" value="${g.t}" id="bsReplay" aria-label="Replay della partita"><div id="bsReplayInfo" class="bs-rep-i"></div></div>
    <div class="bs-aut-grid">
      <div><h3>Obiettivi</h3><ul class="bs-obj end">${F.objectives.map(o => `<li class="${o.ok ? "ok" : "ko"}"><i></i><span>${esc(o.t)}</span><small>${esc(o.detail)}</small></li>`).join("")}</ul></div>
      <div><h3>Decisioni che hanno aiutato</h3>${good.length ? good.map(x => `<p class="dec up"><b>${x.date}</b> ${esc(dlabel(g.decisions[x.i]))} <em>+${eur(x.delta)}</em></p>`).join("") : "<p class='dim'>Nessuna.</p>"}
        <h3>Decisioni che hanno pesato</h3>${bad.length ? bad.map(x => `<p class="dec dn"><b>${x.date}</b> ${esc(dlabel(g.decisions[x.i]))} <em>−${eur(-x.delta)}</em></p>`).join("") : "<p class='dim'>Nessuna.</p>"}<p class="dim">Impatto = valore finale con la decisione − valore finale rigiocando la partita senza di essa.</p></div>
      <div><h3>Analisi comportamentale</h3>${F.behavior.items.map(x => `<div class="bh ${x.level}"><span>${x.t}</span><i><em style="width:${Math.max(4, x.v * 100)}%"></em></i><b>${x.level}</b><small>${esc(x.d)}</small></div>`).join("")}<p class="dim">Indicatori didattici calcolati solo dalle tue decisioni, non diagnosi.</p></div>
    </div>
    <div class="bs-lessons"><h3>Lezioni</h3>${lessons.map(l => `<p>${esc(l)}</p>`).join("")}</div>
    <div class="bs-aut-go"><button data-bs="again" class="go">Rigioca la stessa crisi (stessi obiettivi)</button><button data-bs="menu">Un'altra crisi</button><button data-bs="exit">Esci</button></div>
    <p class="bs-src">Metodologia: SURVIVAL SCORE = Sortino rispetto a chi resta fermo (300) + drawdown rispetto a chi resta fermo (250) + obiettivi (200) + disciplina comportamentale (150) + costo della liquidità in eccesso (100); se il portafoglio è liquidato, 30% delle prime componenti. Dati storici reali, decisioni simulate, costi 0,10%, tasse non modellate.</p>
  </div>`;
  const sc = $("#bsScore"), o = { v: 0 }; if (window.gsap && !REDUCE) window.gsap.to(o, { v: F.score, duration: 1.8, ease: "power3.out", onUpdate: () => { sc.textContent = Math.round(o.v); } }); else sc.textContent = F.score;
  R.final = F; drawAut(g.t); $("#bsReplay").addEventListener("input", e => drawAut(+e.target.value));
}
function drawAut(T) {
  const cv = $("#bsAutCv"); if (!cv) return; const g = R.g, W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr; const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const A = g.navHist, Hh = g.holdHist, n = A.length, all = [...A, ...Hh], lo = Math.min(...all) * .97, hi = Math.max(...all) * 1.03, ml = 64, mr = 12, mt = 12, mb = 70;
  const X = i => ml + i / (n - 1) * (W - ml - mr), Y = x => mt + (H - mt - mb) * (1 - (x - lo) / (hi - lo));
  c.font = "11px JetBrains Mono, monospace"; c.fillStyle = "rgba(207,197,234,.55)"; c.strokeStyle = "rgba(176,140,255,.12)";
  for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4, y = Y(v); c.beginPath(); c.moveTo(ml, y); c.lineTo(W - mr, y); c.stroke(); c.fillText((v / 1e6).toLocaleString("it-IT", { maximumFractionDigits: 2 }) + " mln", 4, y + 4); }
  const line = (arr, col, w, dash) => { c.setLineDash(dash || []); c.strokeStyle = col; c.lineWidth = w; c.beginPath(); arr.forEach((y, i) => { i ? c.lineTo(X(i), Y(y)) : c.moveTo(X(i), Y(y)); }); c.stroke(); c.setLineDash([]); };
  line(Hh, "#FF7AD9", 1.6, [6, 5]); line(A, "#D4FF3A", 2.4);
  /* drawdown in basso */
  let pk = 0; const dd = A.map(v => { pk = Math.max(pk, v); return v / pk - 1; }), md = Math.min(-.01, ...dd), DY = x => H - mb + 14 + (x / md) * (mb - 24);
  c.fillStyle = "rgba(255,92,138,.35)"; c.beginPath(); c.moveTo(X(0), DY(0)); dd.forEach((v, i) => c.lineTo(X(i), DY(v))); c.lineTo(X(n - 1), DY(0)); c.fill(); c.fillStyle = "rgba(207,197,234,.55)"; c.fillText(`drawdown (min ${pct(md, 0)})`, ml, H - mb + 10);
  g.decisions.forEach(d => { c.strokeStyle = "rgba(212,255,58,.6)"; c.beginPath(); c.moveTo(X(d.t), mt); c.lineTo(X(d.t), H - 8); c.stroke(); });
  c.strokeStyle = "#fff"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(X(T), mt); c.lineTo(X(T), H - 8); c.stroke();
  const st = B.simulate(g.data, R.cfg, g.decisions, T), near = g.decisions.filter(d => Math.abs(d.t - T) <= 3), ev = g.events.filter(e => Math.abs(e.t - T) <= 3);
  $("#bsReplayInfo").innerHTML = `<b>${g.data.dates[T]}</b> · valore ${eur(st.nav)} · fermo ${eur(st.hold)} · azioni ${pct((st.V.eq_us + st.V.eq_eu + st.V.tech) / st.nav, 0)} · liquidità ${pct(st.V.cash / st.nav, 0)}${near.length ? ` · <em>decisione: ${near.map(d => esc(d.type)).join(", ")}</em>` : ""}${ev.length ? ` · ${ev.map(e => esc(e.title)).join(", ")}` : ""}`;
}

/* ---------- Salvataggio ---------- */
function saveGame() { try { if (!R || !R.g || R.done) return; localStorage.setItem(SAVE, JSON.stringify({ crisis: R.crisis.id, seed: R.seed, weights: R.weights, pac: R.pac, objectives: R.objectives, t: R.g.t, date: R.g.data.dates[R.g.t], decisions: R.g.decisions.map(({ t, date, eqBefore, eqAfter, nav, ctx, ...d }) => ({ ...d, t })) })); } catch { } }
function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE) || "null"); } catch { return null; } }
function clearSave() { try { localStorage.removeItem(SAVE); } catch { } }
async function resume() {
  const s = loadSave(); if (!s) return menu();
  R = { crisis: CRISES.find(c => c.id === s.crisis), seed: s.seed, weights: s.weights, pac: s.pac, objectives: s.objectives };
  $("#bs-root").innerHTML = `<div class="bs-menu"><div class="bs-load"><i></i>Ricostruisco la partita…</div></div>`;
  try { await loadData(s.crisis); startGame({ decisions: s.decisions, t: s.t }); } catch (e) { $("#bs-root").innerHTML = `<div class="bs-menu"><p>${esc(e.message)}</p><button data-bs="menu">Indietro</button></div>`; }
}

/* ---------- Comandi ---------- */
document.addEventListener("click", e => {
  if (!document.body.classList.contains("bs-on")) return;
  const b = e.target.closest("[data-bs],[data-crisis],[data-prof],[data-speed],[data-q],[data-ev],[data-wq]"); if (!b) return;
  if (b.dataset.crisis) return briefing(b.dataset.crisis);
  if (b.dataset.prof) { R.profile = b.dataset.prof; R.weights = { ...B.PROFILES[R.profile] }; document.querySelectorAll("[data-prof]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); return allocUI(); }
  if (b.dataset.speed) return play(+b.dataset.speed);
  if (b.dataset.ev) return choose(+b.dataset.ev);
  if (b.dataset.q) { const q = b.dataset.q; return doDecision(q === "protect25" ? { type: "protect", pct: .25 } : q === "protect50" ? { type: "protect", pct: .5 } : q === "dip" ? { type: "buy", asset: "eq_us", pct: .25 } : q === "rebal" ? { type: "rebalance" } : { type: "hold" }, b.textContent.trim().split("\n")[0]); }
  if (b.dataset.wq) { const [k, a, p] = b.dataset.wq.split(":"); return doDecision(k === "sell" ? { type: "sellPct", asset: a, pct: +p } : { type: "buy", asset: a, pct: +p }, `${k === "sell" ? "Vendi" : "Compra"} ${NAMES[a]}`); }
  const k = b.dataset.bs;
  if (k === "exit") close(); else if (k === "menu") menu(); else if (k === "resume") resume();
  else if (k === "start") { R.pac = Math.max(0, +($("#bsPac").value) || 0); const s = sumW(R.weights); B.ASSETS.forEach(a => { R.weights[a] /= s; }); startGame(); }
  else if (k === "pause") { R.playing ? pause() : play(R.speed); }
  else if (k === "next") { R.untilEvent = true; R.playing = true; loop(); ui(); }
  else if (k === "day") { stop(); tick(); ui(); }
  else if (k === "week") { stop(); for (let i = 0; i < 5 && !R.event && !R.g.over; i++) tick(); ui(); }
  else if (k === "war") war();
  else if (k === "warexec") { const w = {}; B.ASSETS.forEach(a => { w[a] = R.warW[a] / 100; }); doDecision({ type: "target", weights: w }, "Nuova allocazione dalla War Room"); warRender(true); }
  else if (k === "rebal") doDecision({ type: "rebalance" }, "Ribilancia");
  else if (k === "pacset") doDecision({ type: "pac", amount: +($("#bsWarPac").value) || 0 }, "Nuovo piano di accumulo");
  else if (k === "sfx") { const on = ctx.SFX && ctx.SFX.toggle(); b.textContent = on ? "🔊" : "🔇"; }
  else if (k === "save") { saveGame(); close(); }
  else if (k === "again") { const c = R.crisis.id, o = { ...R }; R = { crisis: o.crisis, seed: o.seed, profile: o.profile, weights: o.weights, pac: o.pac, objectives: o.objectives }; startGame(); }
});
document.addEventListener("input", e => {
  if (!document.body.classList.contains("bs-on") || !R) return;
  const a = e.target.dataset && e.target.dataset.w; if (a) { R.weights[a] = +e.target.value / 100; document.querySelectorAll("#bsAlloc label").forEach((l, i) => { l.querySelector("b").textContent = Math.round(R.weights[B.ASSETS[i]] * 100 / sumW(R.weights)) + "%"; }); return; }
  const ww = e.target.dataset && e.target.dataset.ww; if (ww) { R.warW[ww] = +e.target.value; const tot = B.ASSETS.reduce((q, x) => q + R.warW[x], 0) || 1; document.querySelectorAll(".bs-war-r").forEach((r, i) => { r.querySelector("b").textContent = Math.round(R.warW[B.ASSETS[i]] / tot * 100) + "%"; }); }
});
function onKey(e) {
  if (!R || !R.g || R.done || !$("#bsCC")) { if (e.key === "Escape") close(); return; }
  if (e.target.closest && e.target.closest("input,textarea")) return;
  if (R.event && /^[1-4]$/.test(e.key)) { e.preventDefault(); return choose(+e.key - 1); }
  if (R.event) return;
  if (e.key === " ") { e.preventDefault(); R.playing ? pause() : play(R.speed); }
  else if (/^[1-3]$/.test(e.key)) { e.preventDefault(); play(+e.key - 1); }
  else if (e.key === "n" || e.key === "N") { R.untilEvent = true; R.playing = true; loop(); ui(); }
  else if (e.key === "w" || e.key === "W") war();
  else if (e.key === "ArrowRight") { e.preventDefault(); stop(); if (e.shiftKey) { for (let i = 0; i < 5 && !R.event && !R.g.over; i++) tick(); } else tick(); ui(); }
  else if (e.key === "Escape") { if ($("#bsWar")) $("#bsWar").remove(); else { pause(); } }
  e.stopPropagation();
}
/* per i test automatici */
window.__bs = { state: () => R, tick, choose, finish, play, pause };
