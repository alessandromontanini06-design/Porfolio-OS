/* BLACK SWAN: THE LAST PORTFOLIO · motore di gioco
   Puro e deterministico: stessi dati, stesse impostazioni, stesso seme e stesse decisioni producono sempre lo stesso risultato.
   Nessun accesso alla pagina. I prezzi non vengono mai modificati dagli eventi né dalla pressione psicologica:
   eventi e pressione cambiano solo cosa vede il giocatore e quando deve decidere. */

export const ASSETS = ["eq_us", "eq_eu", "tech", "bond", "cash"];
export const RISKY = ["eq_us", "eq_eu", "tech", "bond"];
export const PROFILES = {
  prudente: { eq_us: .20, eq_eu: .10, tech: .05, bond: .45, cash: .20 },
  bilanciato: { eq_us: .35, eq_eu: .15, tech: .10, bond: .30, cash: .10 },
  aggressivo: { eq_us: .45, eq_eu: .15, tech: .25, bond: .10, cash: .05 }
};

/* generatore casuale con seme (mulberry32), lo stesso del motore principale */
export function rng(seed) { let s = seed | 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* Fatti storici reali per giorno di borsa (le date che cadono nel fine settimana sono spostate al giorno di borsa successivo). s = tono: −1 allarmante, +1 rassicurante */
export const NEWS = {
  dotcom: [["2000-03-10", "Il Nasdaq tocca il massimo storico a 5.048 punti", 1], ["2000-04-14", "Il Nasdaq perde il 9,7% in un solo giorno", -1], ["2001-01-03", "La Fed taglia i tassi a sorpresa", 1], ["2001-09-17", "Wall Street riapre dopo gli attentati dell'11 settembre", -1], ["2001-12-03", "Enron dichiara bancarotta", -1], ["2002-07-22", "Fallisce WorldCom, la più grande bancarotta USA fino ad allora", -1], ["2002-10-09", "L'S&P 500 tocca il minimo del ciclo", -1], ["2003-03-20", "Inizia la guerra in Iraq", -1]],
  gfc: [["2007-08-09", "BNP Paribas congela tre fondi legati ai mutui subprime", -1], ["2008-03-17", "Bear Stearns venduta a JPMorgan con l'aiuto della Fed", -1], ["2008-09-15", "Fallisce Lehman Brothers", -1], ["2008-09-16", "La Fed salva AIG", -1], ["2008-09-29", "La Camera USA boccia il piano di salvataggio: l'S&P 500 perde l'8,8%", -1], ["2008-10-03", "Approvato il piano TARP da 700 miliardi", 1], ["2008-10-13", "Rimbalzo record: l'S&P 500 guadagna l'11,6% in un giorno", 1], ["2008-11-24", "Il governo USA salva Citigroup", -1], ["2009-03-09", "L'S&P 500 tocca il minimo a 676 punti", -1], ["2010-05-06", "«Flash crash» a Wall Street", -1], ["2011-08-08", "Dopo il declassamento degli USA l'S&P 500 perde il 6,7%", -1]],
  euro: [["2011-08-08", "S&P declassa gli USA; la BCE annuncia acquisti di titoli italiani e spagnoli", -1], ["2011-11-14", "Dopo le dimissioni di Berlusconi, Mario Monti incaricato di formare il governo", 1], ["2011-12-21", "La BCE presta alle banche con le aste LTRO a tre anni", 1], ["2012-07-26", "Draghi: «faremo tutto il necessario per salvare l'euro»", 1], ["2012-09-06", "La BCE annuncia il programma OMT", 1]],
  covid: [["2020-02-24", "Focolai di COVID-19 in Italia: le borse europee crollano", -1], ["2020-03-09", "Lockdown in Italia e guerra del petrolio: l'S&P 500 perde il 7,6%", -1], ["2020-03-11", "L'OMS dichiara la pandemia", -1], ["2020-03-16", "L'S&P 500 perde il 12% in un giorno", -1], ["2020-03-23", "La Fed annuncia acquisti senza limiti", 1], ["2020-04-20", "Il petrolio WTI scende sotto zero", -1], ["2020-11-09", "Pfizer annuncia un vaccino efficace oltre il 90%", 1], ["2022-02-24", "La Russia invade l'Ucraina", -1]],
  infl: [["2022-02-24", "La Russia invade l'Ucraina", -1], ["2022-03-16", "La Fed alza i tassi per la prima volta dal 2018", -1], ["2022-06-10", "Inflazione USA all'8,6%, massimo dal 1981", -1], ["2022-07-21", "La BCE alza i tassi per la prima volta in 11 anni", -1], ["2022-09-13", "Inflazione più alta del previsto: l'S&P 500 perde il 4,3%", -1], ["2022-10-12", "L'S&P 500 tocca il minimo dell'anno", -1], ["2023-03-10", "Fallisce Silicon Valley Bank", -1], ["2024-08-05", "Vendite globali: il Nikkei perde il 12% in un giorno", -1], ["2025-04-03", "Nuovi dazi USA: l'S&P 500 perde il 4,8%", -1]]
};

/* Obiettivi: uno vincolante (drawdown) più due estratti dal seme, più una missione secondaria */
export function makeObjectives(seed, pool) {
  const R = rng(seed * 7 + 3), pickN = (arr, k) => { const a = [...arr], o = []; while (o.length < k && a.length) o.push(a.splice(Math.floor(R() * a.length), 1)[0]); return o; };
  const dd = Math.round((.2 + R() * .12) * 100) / 100;
  const opts = pool || [
    { id: "cash", t: "Tieni sempre almeno il 5% in liquidità", lim: .05 },
    { id: "recover", t: "Chiudi sopra il capitale iniziale" },
    { id: "conc", t: "Nessun asset oltre il 45% del portafoglio", lim: .45 },
    { id: "sortino", t: "Sortino almeno pari a chi non tocca nulla" },
    { id: "beat", t: "Batti il portafoglio iniziale lasciato fermo" }
  ];
  return [{ id: "maxdd", t: `Non perdere più del ${Math.round(dd * 100)}% dal massimo`, lim: dd, hard: true }, ...pickN(opts, 2), { id: "dip", t: "Missione: aumenta le azioni entro 10 giorni dal minimo del mercato", side: true }];
}

const sum = o => ASSETS.reduce((s, a) => s + (o[a] || 0), 0);
const eqShare = (V, nav) => nav > 0 ? (V.eq_us + V.eq_eu + V.tech) / nav : 0;

export function createGame(data, cfg = {}) {
  const n = data.dates.length, capital = cfg.capital || 1e6, w = { ...(cfg.weights || PROFILES.bilanciato) };
  const tot = sum(w); ASSETS.forEach(a => { w[a] = (w[a] || 0) / (tot || 1); });
  const V = {}, cost = {}, H = {};
  ASSETS.forEach(a => { V[a] = capital * w[a]; cost[a] = V[a]; H[a] = V[a]; });
  return {
    data, cfg: { capital, costRate: cfg.costRate ?? .001, pac: cfg.pac || 0, seed: cfg.seed || 1, crisis: data.crisis || "custom" },
    t: 0, n, V, cost, H, targets: { ...w }, w0: { ...w }, capital, invested: capital,
    nav: capital, hold: capital, peak: capital, holdPeak: capital, mdd: 0, holdMdd: 0, ddStart: 0, recovery: null,
    navHist: [capital], holdHist: [capital], retHist: [], holdRet: [], eqHist: [eqShare(V, capital)], cashHist: [w.cash],
    decisions: [], log: [], fees: 0, turnover: 0, realized: { gainsSold: 0, lossesSold: 0, gainsHeld: 0, lossesHeld: 0 },
    objectives: cfg.objectives || makeObjectives(cfg.seed || 1), breaches: { cash: 0, conc: 0 }, over: false, failed: null,
    news: (data.news || NEWS[data.crisis] || []), events: [], lastEvent: -99
  };
}

/* indicatori di mercato al giorno t (sull'azionario USA, il riferimento del gioco) */
export function marketState(g, t) {
  const r = g.data.assets.eq_us.r, s = Math.max(1, t - 19);
  let lv = 1, pk = 1, dd = 0, down = 0;
  for (let k = 1; k <= t; k++) { lv *= 1 + r[k]; pk = Math.max(pk, lv); dd = lv / pk - 1; }
  for (let k = t; k >= 1 && r[k] < 0; k--) down++;
  const win = r.slice(s, t + 1), m = win.reduce((a, b) => a + b, 0) / (win.length || 1), vol = Math.sqrt(win.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, win.length - 1)) * Math.sqrt(252);
  let r5 = 1; for (let k = Math.max(1, t - 4); k <= t; k++) r5 *= 1 + r[k];
  let r20 = 1; for (let k = s; k <= t; k++) r20 *= 1 + r[k];
  return { dd, down, vol, r1: r[t] || 0, r5: r5 - 1, r20: r20 - 1 };
}
/* Pressione psicologica (0-100): solo esperienza, mai prezzi. Drawdown del giocatore, giorni rossi di fila, volatilità, notizie recenti. */
export function pressure(g) {
  const m = marketState(g, g.t), dd = g.nav / g.peak - 1, recentNews = g.events.some(e => g.t - e.t <= 5 && e.s < 0) ? 1 : 0;
  return Math.round(Math.min(100, 38 * Math.min(1, -dd / .3) + 18 * Math.min(1, m.down / 6) + 24 * Math.min(1, m.vol / .6) + 20 * recentNews));
}

/* un giorno di borsa: rendimenti veri, piano di accumulo, controlli degli obiettivi, eventi */
export function step(g) {
  if (g.over) return [];
  g.t++; const t = g.t, A = g.data.assets, out = [];
  const before = g.nav;
  ASSETS.forEach(a => { const r = A[a].r[t] || 0; g.V[a] *= 1 + r; g.H[a] *= 1 + r; });
  g.nav = sum(g.V); g.hold = sum(g.H);
  g.retHist.push(before > 0 ? g.nav / before - 1 : 0); g.holdRet.push(g.holdHist[g.holdHist.length - 1] > 0 ? g.hold / g.holdHist[g.holdHist.length - 1] - 1 : 0);
  /* piano di accumulo: il primo giorno di borsa di ogni mese, investito secondo i pesi obiettivo */
  if (g.cfg.pac > 0 && g.data.dates[t].slice(0, 7) !== g.data.dates[t - 1].slice(0, 7)) {
    ASSETS.forEach(a => { const x = g.cfg.pac * g.targets[a]; g.V[a] += x; g.cost[a] += x; g.H[a] += g.cfg.pac * g.w0[a]; });
    g.invested += g.cfg.pac; g.nav = sum(g.V); g.hold = sum(g.H);
  }
  if (g.nav > g.peak) { if (g.ddStart && g.recovery == null && g.mdd < -.05) g.recovery = t - g.ddStart; g.peak = g.nav; }
  const dd = g.nav / g.peak - 1; if (dd < g.mdd) { g.mdd = dd; g.ddStart = g.ddStart || t; }
  g.holdPeak = Math.max(g.holdPeak, g.hold); g.holdMdd = Math.min(g.holdMdd, g.hold / g.holdPeak - 1);
  g.navHist.push(g.nav); g.holdHist.push(g.hold); g.eqHist.push(eqShare(g.V, g.nav)); g.cashHist.push(g.nav > 0 ? g.V.cash / g.nav : 0);
  /* vincoli */
  const o = Object.fromEntries(g.objectives.map(x => [x.id, x]));
  if (o.cash && g.V.cash / g.nav < o.cash.lim - 1e-9) g.breaches.cash++;
  if (o.conc && ASSETS.some(a => a !== "cash" && g.V[a] / g.nav > o.conc.lim + 1e-9)) g.breaches.conc++;
  if (o.maxdd && dd < -o.maxdd.lim) { g.failed = { t, reason: `Drawdown oltre il ${Math.round(o.maxdd.lim * 100)}%: il comitato rischi liquida il portafoglio.` }; g.over = true; out.push({ t, kind: "fail", title: "LIQUIDAZIONE", text: g.failed.reason, s: -1 }); }
  /* eventi: notizie storiche del giorno e segnali dei dati */
  const d = g.data.dates[t];
  g.news.filter(x => x[0] === d).forEach(x => out.push({ t, kind: "news", title: "ULTIM'ORA", text: x[1], s: x[2] }));
  const m = marketState(g, t);
  if (t - g.lastEvent > 10) {
    if (m.r1 <= -.05 || m.r5 <= -.12) out.push({ t, kind: "collapse", title: "THE BIG COLLAPSE", text: `L'azionario USA perde il ${Math.abs(((m.r1 <= -.05 ? m.r1 : m.r5) * 100)).toFixed(1).replace(".", ",")}% ${m.r1 <= -.05 ? "in un giorno" : "in una settimana"}. Il portafoglio è sotto pressione.`, s: -1 });
    else if (m.r5 >= .08 && m.dd <= -.2) out.push({ t, kind: "recovery", title: "FALSE RECOVERY?", text: `Rimbalzo del ${(m.r5 * 100).toFixed(1).replace(".", ",")}% in una settimana, ma il mercato è ancora ${(m.dd * 100).toFixed(0)}% sotto il massimo. Durerà?`, s: 1 });
    else if (m.vol >= .45 && g.events.every(e => e.kind !== "vol" || t - e.t > 60)) out.push({ t, kind: "vol", title: "VOLATILITY STORM", text: `Volatilità annua al ${(m.vol * 100).toFixed(0)}%: oscillazioni violente ogni giorno.`, s: -1 });
  }
  if (out.some(e => e.kind !== "news" && e.kind !== "fail")) g.lastEvent = t;
  out.forEach(e => g.events.push(e));
  if (t >= g.n - 1) g.over = true;
  return out;
}

/* ordini del giocatore: modificano davvero il portafoglio, con costi di transazione */
function trade(g, a, amt) { // amt > 0 compra con la liquidità, < 0 vende verso la liquidità
  if (a === "cash" || !amt) return 0;
  if (amt > 0) amt = Math.min(amt, g.V.cash / (1 + g.cfg.costRate)); else amt = -Math.min(-amt, g.V[a]);
  if (Math.abs(amt) < 1) return 0;
  const fee = Math.abs(amt) * g.cfg.costRate;
  if (amt < 0) { const frac = -amt / g.V[a], gain = -amt - g.cost[a] * frac; if (gain >= 0) g.realized.gainsSold++; else g.realized.lossesSold++; g.cost[a] *= 1 - frac; }
  else g.cost[a] += amt;
  g.V[a] += amt; g.V.cash -= amt + fee; g.fees += fee; g.turnover += Math.abs(amt);
  return amt;
}
function toWeights(g, w) {
  const nav = sum(g.V);
  /* prima le vendite, poi gli acquisti con la liquidità liberata */
  RISKY.forEach(a => { const d = nav * (w[a] || 0) - g.V[a]; if (d < 0) trade(g, a, d); });
  RISKY.forEach(a => { const d = nav * (w[a] || 0) - g.V[a]; if (d > 0) trade(g, a, d); });
}
export function apply(g, dec) {
  if (g.over) return { ok: false, error: "La partita è finita." };
  const m = marketState(g, g.t), eq0 = eqShare(g.V, sum(g.V)), navBefore = sum(g.V);
  /* stato delle posizioni prima dell'ordine, per l'effetto disposizione (vendere i titoli in guadagno e tenere quelli in perdita) */
  RISKY.forEach(a => { if (g.V[a] > 1) { if (g.V[a] >= g.cost[a]) g.realized.gainsHeld++; else g.realized.lossesHeld++; } });
  const clamp01 = x => Math.max(0, Math.min(1, +x || 0));
  switch (dec.type) {
    case "sellPct": if (!RISKY.includes(dec.asset)) return { ok: false, error: "Asset non valido." }; trade(g, dec.asset, -g.V[dec.asset] * clamp01(dec.pct)); break;
    case "buy": if (!RISKY.includes(dec.asset)) return { ok: false, error: "Asset non valido." }; trade(g, dec.asset, g.V.cash * clamp01(dec.pct)); break;
    case "protect": RISKY.filter(a => a !== "bond").forEach(a => trade(g, a, -g.V[a] * clamp01(dec.pct))); break;
    case "target": { const w = {}; let s = 0; ASSETS.forEach(a => { w[a] = Math.max(0, +dec.weights[a] || 0); s += w[a]; }); if (!(s > 0)) return { ok: false, error: "Pesi non validi." }; ASSETS.forEach(a => { w[a] /= s; }); g.targets = w; toWeights(g, w); break; }
    case "rebalance": toWeights(g, g.targets); break;
    case "profile": { const p = PROFILES[dec.profile]; if (!p) return { ok: false, error: "Profilo sconosciuto." }; g.targets = { ...p }; toWeights(g, p); break; }
    case "pac": g.cfg.pac = Math.max(0, +dec.amount || 0); break;
    case "hold": break;
    default: return { ok: false, error: "Decisione sconosciuta." };
  }
  g.nav = sum(g.V);
  const rec = { ...dec, t: g.t, date: g.data.dates[g.t], eqBefore: eq0, eqAfter: eqShare(g.V, g.nav), nav: navBefore, ctx: { r5: m.r5, r20: m.r20, dd: m.dd, pressure: pressure(g), news: g.events.filter(e => g.t - e.t <= 2 && e.kind === "news").map(e => e.s) } };
  g.decisions.push(rec);
  g.eqHist[g.eqHist.length - 1] = rec.eqAfter; g.cashHist[g.cashHist.length - 1] = g.V.cash / g.nav;
  return { ok: true, decision: rec };
}

/* ripete una partita da zero: base del replay e dell'analisi "che cosa sarebbe successo senza questa decisione" */
export function simulate(data, cfg, decisions, until) {
  const g = createGame(data, cfg), byT = new Map();
  (decisions || []).forEach(d => { if (!byT.has(d.t)) byT.set(d.t, []); byT.get(d.t).push(d); });
  const run = () => { (byT.get(g.t) || []).forEach(d => apply(g, strip(d))); };
  run();
  while (!g.over && g.t < (until ?? g.n - 1)) { step(g); run(); }
  return g;
}
const strip = d => { const { t, date, eqBefore, eqAfter, nav, ctx, ...rest } = d; return rest; };

/* metriche e SURVIVAL SCORE (0-1000), tutto dai numeri della partita */
function stats(r) {
  const n = r.length || 1, m = r.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, n - 1));
  const dd = Math.sqrt(r.reduce((a, b) => a + Math.min(0, b) ** 2, 0) / n);
  return { mean: m, vol: sd * Math.sqrt(252), sharpe: sd > 0 ? m / sd * Math.sqrt(252) : NaN, sortino: dd > 0 ? m / dd * Math.sqrt(252) : NaN };
}
export function finalize(g) {
  const nav = g.nav, ret = nav / g.invested - 1, holdRet = g.hold / (g.invested) - 1;
  const cash = g.data.assets.cash.r.slice(1, g.t + 1), ex = (r) => r.map((x, i) => x - (cash[i] || 0));
  const P = stats(ex(g.retHist)), Hs = stats(ex(g.holdRet));
  /* costo della liquidità in eccesso: Σ (peso cash − peso cash iniziale) · (rendimento azioni USA − rendimento cash) */
  let drag = 0; for (let t = 1; t <= g.t; t++) drag += ((g.cashHist[t - 1] || 0) - g.w0.cash) * ((g.data.assets.eq_us.r[t] || 0) - (g.data.assets.cash.r[t] || 0));
  const obj = g.objectives.map(o => {
    let ok, detail = "";
    if (o.id === "maxdd") { ok = !g.failed && g.mdd >= -o.lim; detail = `calo massimo ${(g.mdd * 100).toFixed(1)}%`; }
    else if (o.id === "cash") { ok = g.breaches.cash === 0; detail = `${g.breaches.cash} giorni sotto il 5%`; }
    else if (o.id === "recover") { ok = nav >= g.invested; detail = `${(ret * 100).toFixed(1)}%`; }
    else if (o.id === "conc") { ok = g.breaches.conc === 0; detail = `${g.breaches.conc} giorni oltre il limite`; }
    else if (o.id === "sortino") { ok = (P.sortino || 0) >= (Hs.sortino || 0); detail = `${(P.sortino || 0).toFixed(2)} contro ${(Hs.sortino || 0).toFixed(2)}`; }
    else if (o.id === "beat") { ok = nav >= g.hold; detail = `${(ret * 100).toFixed(1)}% contro ${(holdRet * 100).toFixed(1)}%`; }
    else if (o.id === "dip") { const r = g.data.assets.eq_us.r; let lv = 1, lo = Infinity, loT = 1; for (let t = 1; t <= g.t; t++) { lv *= 1 + r[t]; if (lv < lo) { lo = lv; loT = t; } } ok = g.decisions.some(d => Math.abs(d.t - loT) <= 10 && d.eqAfter > d.eqBefore + .02); detail = `minimo il ${g.data.dates[loT]}`; }
    return { ...o, ok, detail };
  });
  const behavior = analyzeBehavior(g);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const parts = {
    riskAdj: Math.round(150 + 150 * clamp((P.sortino || 0) - (Hs.sortino || 0), -1, 1)),
    drawdown: Math.round(250 * clamp(1.5 - Math.abs(g.mdd) / Math.max(.02, Math.abs(g.holdMdd)), 0, 1)),
    objectives: Math.round(200 * obj.filter(o => !o.side && o.ok).length / Math.max(1, obj.filter(o => !o.side).length)),
    discipline: Math.round(150 * (1 - behavior.penalty)),
    cashDrag: Math.round(100 * clamp(1 - drag / .05, 0, 1))
  };
  const score = g.failed ? Math.round((parts.riskAdj + parts.drawdown + parts.discipline) * .3) : Object.values(parts).reduce((a, b) => a + b, 0) + (obj.find(o => o.side && o.ok) ? 50 : 0);
  return { nav, ret, hold: g.hold, holdRet, mdd: g.mdd, holdMdd: g.holdMdd, vol: P.vol, sharpe: P.sharpe, sortino: P.sortino, holdSortino: Hs.sortino, holdVol: Hs.vol,
    recovery: g.recovery, cashDrag: drag, fees: g.fees, turnover: g.turnover / g.capital, objectives: obj, behavior, parts, score: Math.min(1050, Math.max(0, score)), failed: g.failed };
}

/* Indicatori comportamentali didattici, solo dalle decisioni (non sono diagnosi) */
export function analyzeBehavior(g) {
  const D = g.decisions.filter(d => d.type !== "hold" && d.type !== "pac"), ch = D.map(d => d.eqAfter - d.eqBefore);
  const lvl = x => x >= .66 ? "alto" : x >= .33 ? "medio" : "basso";
  const panic = D.filter((d, i) => ch[i] < -.05 && (d.ctx.r5 <= -.05 || d.ctx.pressure >= 70));
  const recency = D.filter((d, i) => (ch[i] > .05 && d.ctx.r20 > .05) || (ch[i] < -.05 && d.ctx.r20 < -.05));
  const timing = D.filter((d, i) => Math.abs(ch[i]) >= .3);
  const herd = D.filter((d, i) => d.ctx.news.length && Math.sign(ch[i]) === Math.sign(d.ctx.news.reduce((a, b) => a + b, 0)) && Math.abs(ch[i]) > .03);
  const years = Math.max(.25, g.t / 252), freq = D.length / years, R = g.realized;
  const pgr = R.gainsSold / Math.max(1, R.gainsSold + R.gainsHeld), plr = R.lossesSold / Math.max(1, R.lossesSold + R.lossesHeld);
  const maxConc = Math.max(...ASSETS.filter(a => a !== "cash").map(a => g.V[a] / Math.max(1, g.nav)));
  const items = [
    { id: "panic", t: "Panic selling", v: panic.length / Math.max(1, D.length), n: panic.length, d: `${panic.length} riduzioni del rischio dopo una settimana ≤ −5% o con pressione ≥ 70.` },
    { id: "loss", t: "Loss aversion", v: R.gainsSold + R.lossesSold < 2 ? 0 : clamp01((pgr - plr) * 2), n: R.gainsSold, d: `Quota di guadagni realizzati ${(pgr * 100).toFixed(0)}% contro perdite realizzate ${(plr * 100).toFixed(0)}% (effetto disposizione).` },
    { id: "recency", t: "Recency bias", v: recency.length / Math.max(1, D.length), n: recency.length, d: `${recency.length} cambi che inseguono l'andamento dell'ultimo mese.` },
    { id: "over", t: "Overconfidence", v: clamp01(Math.max((freq - 6) / 18, (maxConc - .45) / .4)), n: D.length, d: `${D.length} decisioni (${freq.toFixed(1)} l'anno), concentrazione massima ${(maxConc * 100).toFixed(0)}%.` },
    { id: "timing", t: "Market timing", v: clamp01(timing.length / 3), n: timing.length, d: `${timing.length} spostamenti dell'azionario di 30 punti o più.` },
    { id: "herd", t: "Herd behavior", v: herd.length / Math.max(1, D.length), n: herd.length, d: `${herd.length} decisioni prese entro 2 giorni da una notizia, nella sua stessa direzione.` }
  ].map(x => ({ ...x, level: lvl(x.v) }));
  const penalty = clamp01(items.reduce((s, x) => s + x.v, 0) / 4);
  return { items, penalty };
}
function clamp01(x) { return Math.max(0, Math.min(1, x)); }

/* quanto ha pesato ogni decisione: la partita rigiocata senza di essa */
export function decisionImpact(data, cfg, decisions) {
  const base = simulate(data, cfg, decisions);
  return decisions.map((d, i) => { const g = simulate(data, cfg, decisions.filter((_, j) => j !== i)); return { i, t: d.t, date: d.date, type: d.type, delta: base.nav - g.nav }; });
}
