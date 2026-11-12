/* BLACK SWAN · modalità ROGUELIKE: crisi SIMULATE
   Niente qui è storico. Ogni scenario è generato da un modello dichiarato:
   - un fattore di mercato giornaliero che cambia regime con una catena di Markov (calma, stress, crollo, ripresa);
   - salti improvvisi (giorni di panico) con probabilità diverse per regime;
   - gli asset dipendono dal fattore con sensibilità fisse più un rumore proprio;
   - due tipi di crisi: deflazionistica (le obbligazioni fanno da rifugio) o inflazionistica (scendono insieme ad azioni).
   Stesso seme, stessa difficoltà: stesso scenario. Le probabilità sono in DIFFICULTY e vengono mostrate al giocatore. */
import { rng, makeObjectives } from "./blackswan-engine.js";

export const REGIMES = ["calma", "stress", "crollo", "ripresa"];
/* rendimento atteso e volatilità annui del fattore di mercato in ogni regime (il crollo prende la volatilità dalla difficoltà) */
export const REGIME_PARAMS = { calma: { mu: .09, vol: .13 }, stress: { mu: -.15, vol: .25 }, crollo: { mu: -.9, vol: null }, ripresa: { mu: .5, vol: .3 } };

/* Probabilità GIORNALIERE di passaggio tra regimi:
   cs calma→stress · sc stress→crollo · sx stress→calma · xr crollo→ripresa · rc ripresa→calma · rx ripresa→crollo (doppio minimo)
   jump: probabilità giornaliera di un giorno di panico [calma, stress o ripresa, crollo]; jumpSize: perdita media di quel giorno */
export const DIFFICULTY = {
  easy: { id: "easy", name: "EASY", mult: .8, days: [360, 440], dd: .06, P: { cs: .004, sc: .012, sx: .02, xr: .06, rc: .02, rx: 0 }, jump: [.001, .006, .03], jumpSize: .035, crashVol: .5, infl: .2, waves: 3, sub: "Crolli brevi, rimbalzi rapidi, limite di perdita più largo." },
  normal: { id: "normal", name: "NORMAL", mult: 1, days: [400, 480], dd: 0, P: { cs: .006, sc: .016, sx: .015, xr: .045, rc: .015, rx: .002 }, jump: [.002, .01, .05], jumpSize: .045, crashVol: .6, infl: .35, waves: 3, sub: "Crisi tipiche: qualche falso rimbalzo." },
  hard: { id: "hard", name: "HARD", mult: 1.25, days: [440, 520], dd: -.02, P: { cs: .008, sc: .02, sx: .012, xr: .035, rc: .012, rx: .004 }, jump: [.003, .014, .06], jumpSize: .05, crashVol: .65, infl: .5, waves: 3, sub: "Crolli lunghi, doppi minimi frequenti, limite più stretto." },
  nightmare: { id: "nightmare", name: "NIGHTMARE", mult: 1.6, days: [480, 560], dd: -.04, P: { cs: .01, sc: .026, sx: .01, xr: .03, rc: .01, rx: .006 }, jump: [.004, .02, .08], jumpSize: .06, crashVol: .75, infl: .6, waves: 3, sub: "Il cigno nero torna. Spesso. Azioni e obbligazioni insieme giù." }
};
/* probabilità che l'evento accada almeno una volta in un mese di borsa (21 giorni) */
export const monthly = p => 1 - (1 - p) ** 21;

const HEAD = {
  stress: { d: ["Un grande fondo sospende i rimborsi ai clienti", "Gli spread sul credito societario si allargano di colpo", "Una banca di medie dimensioni chiede liquidità d'emergenza", "Utili delle grandi aziende sotto le attese"],
    i: ["Inflazione molto sopra le attese", "La banca centrale alza i tassi di 75 punti base", "Il prezzo dell'energia raddoppia in tre mesi", "I rendimenti dei titoli di Stato salgono ai massimi da anni"] },
  crollo: { d: ["Panico sui mercati: scattano le sospensioni automatiche delle contrattazioni", "Fallisce una banca d'affari globale", "Il mercato interbancario si blocca", "Vendite forzate dei fondi a leva"],
    i: ["Stretta monetaria record: le borse crollano", "Le obbligazioni scendono insieme alle azioni: nessun rifugio", "Crisi energetica: razionamenti in Europa", "Un fondo pensione è costretto a vendere titoli di Stato"] },
  ripresa: { d: ["La banca centrale taglia i tassi d'urgenza", "Approvato un piano di salvataggio pubblico", "Acquisti illimitati di titoli annunciati dalla banca centrale"],
    i: ["L'inflazione rallenta per il terzo mese", "La banca centrale segnala una pausa nei rialzi", "Il prezzo dell'energia torna a scendere"] },
  calma: { d: ["La volatilità torna ai livelli pre-crisi", "Gli indici recuperano i massimi"], i: ["Inflazione vicina all'obiettivo", "I mercati tornano tranquilli"] },
  jump: ["Vendite violente senza una notizia precisa", "Un algoritmo scatena un'ondata di vendite", "Voci di insolvenza su un grande gruppo"]
};

function gauss(R) { let u = 0; while (!u) u = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()); }
function bizDays(n, start = Date.UTC(2031, 0, 2)) { const out = []; let d = start; while (out.length < n) { const w = new Date(d).getUTCDay(); if (w && w < 6) out.push(new Date(d).toISOString().slice(0, 10)); d += 864e5; } return out; }

export function generateScenario(seed, diffId = "normal", wave = 0) {
  const D = DIFFICULTY[diffId] || DIFFICULTY.normal, R = rng(seed * 101 + wave * 7919 + 17);
  const n = D.days[0] + Math.floor(R() * (D.days[1] - D.days[0])) + 1, infl = R() < D.infl;
  const dates = bizDays(n, Date.UTC(2031 + wave * 3, Math.floor(R() * 12), 2));
  const A = { eq_us: [0], eq_eu: [0], tech: [0], bond: [0], cash: [0] }, regime = ["calma"], news = [];
  const swan = Math.floor(n * (.15 + R() * .3)); // il cigno nero arriva sempre, tra il 15% e il 45% dello scenario
  let reg = "calma", crashT = -1, rate = infl ? .01 : .03;
  const say = (t, kind, s) => { const pool = kind === "jump" ? HEAD.jump : HEAD[kind][infl ? "i" : "d"]; news.push([dates[t], pool[Math.floor(R() * pool.length)], s]); };
  for (let t = 1; t < n; t++) {
    const u = R(), P = D.P, prev = reg;
    if (t === swan && reg === "calma") reg = "stress";
    else if (reg === "calma" && u < P.cs) reg = "stress";
    else if (reg === "stress") { if (u < P.sc) reg = "crollo"; else if (u < P.sc + P.sx) reg = "calma"; }
    else if (reg === "crollo" && u < P.xr) reg = "ripresa";
    else if (reg === "ripresa") { if (u < P.rc) reg = "calma"; else if (u < P.rc + P.rx) reg = "crollo"; }
    if (reg !== prev) { say(t, reg, reg === "ripresa" || reg === "calma" ? 1 : -1); if (reg === "crollo" && crashT < 0) crashT = t; }
    const rp = REGIME_PARAMS[reg], vol = rp.vol ?? D.crashVol, ji = reg === "crollo" ? 2 : reg === "calma" ? 0 : 1;
    let m = rp.mu / 252 + vol / Math.sqrt(252) * gauss(R);
    if (R() < D.jump[ji] || t === swan) { const sz = D.jumpSize * (.6 + .8 * R()), up = reg === "ripresa" && R() < .5; m += up ? sz * .7 : -sz; if (!up && sz > .04) say(t, "jump", -1); }
    m = Math.max(-.25, Math.min(.2, m));
    /* tassi: nella crisi deflazionistica la banca centrale taglia dopo il crollo; in quella inflazionistica alza */
    rate = infl ? Math.min(.05, rate + (reg === "stress" || reg === "crollo" ? .00012 : .00002)) : crashT > 0 ? Math.max(.002, rate - .0001) : rate;
    const stressed = reg !== "calma", bb = infl ? (stressed ? .25 : .05) : (stressed ? -.25 : -.05), bDrift = infl && stressed ? -.08 / 252 : (rate + .005) / 252;
    A.eq_us.push(m + .006 * gauss(R));
    A.eq_eu.push(1.1 * m + .009 * gauss(R));
    A.tech.push(1.35 * m + .012 * gauss(R));
    A.bond.push(bDrift + bb * m + .004 * gauss(R));
    A.cash.push(rate / 252);
    regime.push(reg);
  }
  ["eq_us", "eq_eu", "tech", "bond"].forEach(a => { A[a] = A[a].map(x => Math.max(-.6, x)); });
  const names = { eq_us: "Azioni USA (simulate)", eq_eu: "Azioni Europa (simulate)", tech: "Tecnologia (simulata)", bond: "Obbligazioni 10 anni (simulate)", cash: "Liquidità (tasso simulato)" };
  return { crisis: "sim", sim: true, seed, difficulty: D.id, wave, type: infl ? "inflazionistica" : "deflazionistica", swan, from: dates[0], to: dates[n - 1], dates, regime, news,
    assets: Object.fromEntries(Object.keys(A).map(a => [a, { name: names[a], r: A[a] }])) };
}

/* statistiche del generatore su molti semi: servono a documentare cosa aspettarsi da ogni difficoltà */
export function difficultyStats(diffId, nSeeds = 40) {
  const dds = [], crashDays = []; let crashes = 0, infl = 0, doubleDip = 0;
  for (let s = 1; s <= nSeeds; s++) {
    const sc = generateScenario(s * 9973, diffId, 0); let lv = 1, pk = 1, md = 0;
    sc.assets.eq_us.r.forEach((r, i) => { if (i) { lv *= 1 + r; pk = Math.max(pk, lv); md = Math.min(md, lv / pk - 1); } }); dds.push(md);
    const cd = sc.regime.filter(x => x === "crollo").length; crashDays.push(cd); if (cd) crashes++; if (sc.type === "inflazionistica") infl++;
    let seenRec = false; for (let i = 1; i < sc.regime.length; i++) { if (sc.regime[i] === "ripresa") seenRec = true; if (seenRec && sc.regime[i] === "crollo" && sc.regime[i - 1] === "ripresa") { doubleDip++; break; } }
  }
  dds.sort((a, b) => a - b); const q = p => dds[Math.min(dds.length - 1, Math.floor(p * dds.length))];
  return { medianDD: q(.5), worstDecileDD: q(.1), pCrash: crashes / nSeeds, pInfl: infl / nSeeds, pDoubleDip: doubleDip / nSeeds, avgCrashDays: crashDays.reduce((a, b) => a + b, 0) / nSeeds };
}

/* vantaggi tra un'ondata e l'altra */
export const PERKS = [
  { id: "broker", t: "Broker a basso costo", d: "Costi di transazione 0,02% invece di 0,10%." },
  { id: "salary", t: "Bonus annuale", d: "Piano di accumulo: +3.000 € al mese investiti secondo i tuoi pesi." },
  { id: "mandate", t: "Mandato più ampio", d: "Il limite di drawdown si allarga di 5 punti." },
  { id: "radar", t: "Radar macro", d: "Vedi in che regime è il mercato: calma, stress, crollo o ripresa." },
  { id: "calm", t: "Sangue freddo", d: "30 secondi per decidere negli eventi invece di 15." }
];
export function perkChoices(seed, wave, owned = []) {
  const R = rng(seed * 31 + wave * 977 + 5), pool = PERKS.filter(p => !owned.includes(p.id)), out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(R() * pool.length), 1)[0]);
  return out;
}

/* una run: tre ondate, il capitale passa da una all'altra, la liquidazione chiude la run */
export function newRun(diffId, seed) { return { diff: diffId, seed, wave: 0, capital: 1e6, perks: [], scores: [], navs: [], over: false, failed: false }; }
export function waveConfig(run) {
  const D = DIFFICULTY[run.diff], obj = makeObjectives(run.seed + run.wave * 13);
  const dd = obj.find(o => o.id === "maxdd"), lim = Math.max(.1, Math.round((dd.lim + D.dd + (run.perks.includes("mandate") ? .05 : 0)) * 100) / 100);
  dd.lim = lim; dd.t = `Non perdere più del ${Math.round(lim * 100)}% dal massimo`;
  return { capital: run.capital, costRate: run.perks.includes("broker") ? .0002 : .001, pacBonus: run.perks.includes("salary") ? 3000 : 0, seed: run.seed + run.wave, objectives: obj };
}
export function endWave(run, final) {
  run.scores.push(final.score); run.navs.push(final.nav);
  if (final.failed) { run.over = true; run.failed = true; }
  else { run.capital = final.nav; run.wave++; if (run.wave >= DIFFICULTY[run.diff].waves) run.over = true; }
  return run;
}
export function runScore(run) { return Math.round(run.scores.reduce((a, b) => a + b, 0) * DIFFICULTY[run.diff].mult); }
