// Test del motore quantitativo di Portfolio OS: casi con risultato noto calcolato a mano.
// Uso: node tools/test-engine.mjs   (esce con codice 1 se un test fallisce)
// Lo stesso modulo che gira nel browser.
import { POS as P } from "../js/engine.js";

let pass = 0, fail = 0;
const near = (a, b, tol = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
function t(name, ok, info = "") { if (ok) pass++; else { fail++; console.log(`  FALLITO  ${name} ${info}`); } }
function group(name, fn) { console.log(name); fn(); }
const D = (y, m, d = 1) => new Date(Date.UTC(y, m, d));
const asset = (ret, extra = {}) => ({ name: "A", ret, first: 0, missing: 0, ...extra });
const dates = n => Array.from({ length: n }, (_, k) => D(2000 + Math.floor(k / 12), k % 12, 28));

group("Lettura di numeri e date", () => {
  t("1.234,56", P.parseNum("1.234,56").n === 1234.56);
  t("1,234.56", P.parseNum("1,234.56").n === 1234.56);
  t("-2,5%", near(P.parseNum("-2,5%").n, -0.025) && P.parseNum("-2,5%").pct);
  t("(3,5) negativo", P.parseNum("(3,5)").n === -3.5);
  t("n/d vuoto", P.parseNum("n/d") === null);
  t("31/12/2020", P.parseDate("31/12/2020").getTime() === D(2020, 11, 31).getTime());
  t("2020-02-30 non valida", P.parseDate("2020-02-30") === null);
  t("gen 2021", P.parseDate("gen 2021").getTime() === D(2021, 0, 1).getTime());
  t("seriale Excel 44197 = 1/1/2021", P.parseDate(44197, true).getTime() === D(2021, 0, 1).getTime());
});

group("Rendimenti, CAGR, volatilità", () => {
  const r = Array(24).fill(0.01), s = P.stats(asset(r), 12, dates(24));
  t("CAGR rendimento costante 1%/mese", near(s.cagr, 1.01 ** 12 - 1));
  t("rendimento totale", near(s.total, 1.01 ** 24 - 1));
  t("volatilità zero", near(s.vol, 0));
  t("nessun drawdown", s.mdd === 0);
  const r2 = [0.1, -0.1, 0.1, -0.1], s2 = P.stats(asset(r2), 12, dates(4));
  const m = 0, sd = Math.sqrt((4 * 0.01) / 3);
  t("deviazione standard campionaria", near(s2.sd, sd));
  t("volatilità annualizzata = sd·√12", near(s2.vol, sd * Math.sqrt(12)));
  t("CAGR negativo anche con media zero (1,1·0,9 < 1)", near(s2.total, (1.1 * 0.9) ** 2 - 1) && s2.cagr < m);
  t("drawdown massimo dal picco 1,1 a 0,9801", near(s2.mdd, 0.9801 / 1.1 - 1));
  const sNaN = P.stats(asset([0.02, NaN, 0.03, NaN, -0.01]), 12, dates(5));
  t("valori mancanti esclusi, non stimati", sNaN.n === 3 && near(sNaN.total, 1.02 * 1.03 * 0.99 - 1));
});

group("Covarianza e correlazione", () => {
  const a = asset([0.01, 0.02, 0.03, 0.04]), b = asset([0.02, 0.04, 0.06, 0.08]), c = asset([0.04, 0.03, 0.02, 0.01]);
  t("correlazione +1", near(P.corr(a, b).r, 1));
  t("correlazione -1", near(P.corr(a, c).r, -1));
  const cv = P.covMatrix([a, b]);
  t("covarianza campionaria", near(cv.C[0][1], 2 * cv.C[0][0]) && near(cv.C[0][0], 0.0001 * 5 / 3));
  const g = asset([0.01, NaN, 0.03, 0.04]);
  t("covarianza solo su periodi comuni", P.covMatrix([a, g]).common === 3);
  t("correlazione con meno di 3 coppie = non calcolabile", Number.isNaN(P.corr(asset([0.1, 0.2]), asset([0.1, 0.3])).r));
});

group("Rischio: VaR, CVaR, drawdown e recupero", () => {
  const r = [-0.1, -0.05, 0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11, 0.12, 0.13, 0.14, 0.15, 0.16, 0.17];
  const k = P.riskStats(r, 12, 0), s = [...r].sort((x, y) => x - y), q = P.quantile(s, 0.05);
  t("quantile interpolato (n=20, p=5%)", near(q, -0.1 + (-0.05 + 0.1) * 0.95));
  t("VaR 95 = −quantile", near(k.var95, -q));
  t("CVaR 95 = −media della coda", near(k.cvar95, 0.1));
  t("CVaR ≥ VaR", k.cvar95 >= k.var95);
  const dd = P.riskStats([0.1, -0.2, 0.05, 0.1, 0.1, 0.02], 12, 0);
  t("drawdown massimo -20%", near(dd.mdd, -0.2));
  t("recupero al 5° periodo (0,8·1,05·1,1·1,1 = 1,0164 ≥ 1)", dd.recK === 4);
  t("drawdown più lungo = 4 periodi", dd.longest === 4 && !dd.ongoing);
  const ongoing = P.riskStats([0.1, 0.05, -0.3, 0.01, 0.01, 0.01], 12, 0);
  t("drawdown non recuperato segnalato", ongoing.ongoing && ongoing.recK === null);
  t("troppi pochi dati", P.riskStats([0.1, 0.2], 12, 0).n === 2 && P.riskStats([0.1, 0.2], 12, 0).var95 === undefined);
});

group("Contributo al rischio", () => {
  const a = asset([0.02, -0.01, 0.03, -0.02, 0.01, 0.0]), b = asset([0.01, 0.02, -0.01, 0.0, 0.02, -0.02]);
  const C = P.covMatrix([a, b]).C, w = [0.6, 0.4], rc = P.riskContrib(w, C, 12);
  t("le quote di rischio sommano a 1", near(rc.pct[0] + rc.pct[1], 1));
  const vp = Math.sqrt(w[0] ** 2 * C[0][0] + w[1] ** 2 * C[1][1] + 2 * w[0] * w[1] * C[0][1]) * Math.sqrt(12);
  t("volatilità del portafoglio = √(wᵀΣw)·√f", near(rc.volP, vp));
  t("asset effettivi = 1/Σw²", near(rc.neff, 1 / 0.52));
  t("portafoglio con un solo asset", near(P.riskContrib([1], [[C[0][0]]], 12).pct[0], 1));
});

group("Portafoglio e importazione", () => {
  const a = asset([0.1, 0.2, NaN]), b = asset([0.0, -0.1, 0.05]);
  const pr = P.portfolioReturns([a, b], [0.5, 0.5]);
  t("rendimento ribilanciato = Σ wᵢ rᵢ", near(pr[0], 0.05) && near(pr[1], 0.05));
  t("periodo con un asset mancante escluso", Number.isNaN(pr[2]));
  const aoa = [["Data", "Prezzo X", "Prezzo Y"], ["31/01/2020", 100, 50], ["29/02/2020", 110, null], ["29/02/2020", 999, 999], ["31/03/2020", 121, 55], ["30/04/2020", 133.1, 60.5]];
  const an = P.analyzeSheet("t", aoa), roles = {}; an.cols.forEach(c => { roles[c.idx] = c.suggest || "price"; });
  const ds = P.buildDataset(an, roles);
  t("dataset valido", ds.ok);
  t("data duplicata tenuta una volta e segnalata", ds.nObs === 4 && ds.Q.warnings.some(w => /duplicat/.test(w)));
  t("frequenza mensile riconosciuta", ds.freq.f === 12);
  t("rendimenti dai prezzi", near(ds.assets[0].ret[1], 0.1) && near(ds.assets[0].ret[3], 0.1));
  t("valore mancante non stimato", Number.isNaN(ds.assets[1].ret[1]) && Number.isNaN(ds.assets[1].ret[2]) && ds.assets[1].missing === 1);
});

group("Monte Carlo", () => {
  const flat = Array(36).fill(0.01);
  const fv = (P0, c, r, n) => P0 * (1 + r) ** n + c * (((1 + r) ** n - 1) / r);
  const mc = P.monteCarlo({ ret: flat, f: 12, years: 10, initial: 10000, monthly: 200, n: 200, method: "boot", seed: 7 });
  t("rendimento costante: capitale finale = formula del montante", near(mc.final[0], fv(10000, 200, 0.01, 120), 1e-9) && near(mc.final[199], mc.final[0]));
  t("investito = iniziale + versamenti", near(mc.invested, 10000 + 200 * 120));
  t("tutti i percentili coincidono", mc.pFinal.every(v => near(v, mc.final[0])));
  const blk = P.monteCarlo({ ret: flat, f: 12, years: 10, initial: 10000, monthly: 200, n: 200, method: "block", seed: 7 });
  const nor = P.monteCarlo({ ret: flat, f: 12, years: 10, initial: 10000, monthly: 200, n: 200, method: "normal", seed: 7 });
  t("bootstrap a blocchi coerente", near(blk.final[0], mc.final[0]));
  t("normale con σ=0 coerente", near(nor.final[100], mc.final[0]));
  const real = P.monteCarlo({ ret: flat, f: 12, years: 10, initial: 1000, monthly: 0, n: 100, infl: 0.02, seed: 1 });
  t("capitale reale = nominale / (1+π)^anni", near(real.pFinalReal[3], real.pFinal[3] / 1.02 ** 10));
  const fee = P.monteCarlo({ ret: flat, f: 12, years: 1, initial: 1000, monthly: 0, n: 100, costs: 0.01, seed: 1 });
  t("costi annui 1% applicati", near(fee.final[0], 1000 * 1.01 ** 12 * 0.99, 1e-9));
  const hist = [];const rr = P.makeRng(3);for (let i = 0; i < 240; i++) hist.push(0.006 + 0.04 * (rr() - 0.5));
  const a1 = P.monteCarlo({ ret: hist, f: 12, years: 20, initial: 1000, n: 500, seed: 42 }), a2 = P.monteCarlo({ ret: hist, f: 12, years: 20, initial: 1000, n: 500, seed: 42 });
  t("stesso seme = stesso risultato (riproducibile)", a1.final.every((v, i) => v === a2.final[i]));
  t("percentili ordinati", a1.pFinal.every((v, i) => i === 0 || v >= a1.pFinal[i - 1]));
  const big = P.monteCarlo({ ret: hist, f: 12, years: 20, initial: 1000, n: 4000, seed: 5 });
  const g = hist.reduce((s, x) => s + Math.log1p(x), 0) / hist.length, medExp = 1000 * Math.exp(g * 240);
  t("bootstrap: mediana vicina alla crescita geometrica storica (±5%)", Math.abs(big.pFinal[3] / medExp - 1) < 0.05, `${big.pFinal[3].toFixed(0)} vs ${medExp.toFixed(0)}`);
  const goal = P.monteCarlo({ ret: flat, f: 12, years: 10, initial: 10000, monthly: 200, n: 100, goal: 60000, seed: 1 });
  t("probabilità obiettivo 100% se sempre raggiunto", goal.probGoal === 1 && goal.probLoss === 0);
  const wd = P.monteCarlo({ ret: flat, f: 12, years: 10, initial: 1000, monthly: -500, n: 100, seed: 1 });
  t("prelievi che esauriscono il capitale", wd.depleted === 1 && wd.final[0] === 0);
  t("storia troppo corta rifiutata", !!P.monteCarlo({ ret: [0.01, 0.02], f: 12 }).error);
  const t0 = Date.now();P.monteCarlo({ ret: hist, f: 252, years: 30, initial: 1000, n: 2000, seed: 1 });
  t("dati giornalieri, 30 anni, 2000 percorsi in meno di 3 s", Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
});

group("Stress test: crisi storiche", () => {
  // dati mensili da gen 2019 a dic 2021: COVID (feb-mar 2020) coperto, 2008 no
  const n = 36, ds = Array.from({ length: n }, (_, k) => new Date(Date.UTC(2019, k + 1, 0)));
  const ra = Array(n).fill(0.01), rb = Array(n).fill(0.02);
  const kf = ds.findIndex(d => d.getUTCFullYear() === 2020 && d.getUTCMonth() === 1);
  ra[kf] = -0.1; ra[kf + 1] = -0.2; rb[kf] = 0.02; rb[kf + 1] = 0.01;
  const A = [asset(ra), asset(rb)], w = [0.5, 0.5];
  const covid = P.crisisAnalysis(ds, A, w, 12, P.CRISES.find(c => c.id === "covid"));
  const p1 = 0.5 * -0.1 + 0.5 * 0.02, p2 = 0.5 * -0.2 + 0.5 * 0.01;
  t("COVID nei dati: due mesi", covid.status === "in" && covid.periods === 2);
  t("rendimento del portafoglio nella crisi", near(covid.ret, (1 + p1) * (1 + p2) - 1));
  t("contributi sommano alla perdita del portafoglio", near(covid.contrib[0] + covid.contrib[1], covid.ret));
  t("contributo dell'asset A = Σ w·r·V", near(covid.contrib[0], 0.5 * -0.1 + 0.5 * -0.2 * (1 + p1)));
  t("rendimento degli asset nella crisi", near(covid.assets[0].ret, 0.9 * 0.8 - 1) && near(covid.assets[1].ret, 1.02 * 1.01 - 1));
  t("minimo raggiunto al 2° mese", covid.toTrough === 2);
  let V = (1 + p1) * (1 + p2), k = kf + 2, rec = null; for (; k < n; k++) { V *= 1 + 0.5 * 0.01 + 0.5 * 0.02; if (V >= 1) { rec = k; break; } }
  t("mesi di recupero dal minimo", rec !== null && covid.recK === rec && covid.recPeriods === rec - (kf + 1), `${covid.recK} vs ${rec}`);
  const never = P.crisisAnalysis(ds, [asset(ra), asset(rb.map((x, i) => i > kf + 1 ? 0 : x))], w, 12, P.CRISES.find(c => c.id === "covid"));
  t("non ancora recuperato = nessun tempo di recupero", never.recK === null && never.recPeriods === null);
  const gfc = P.crisisAnalysis(ds, A, w, 12, P.CRISES.find(c => c.id === "gfc"));
  t("2008 fuori dai dati: nessun numero inventato", gfc.status === "out" && gfc.ret === undefined);
  const late = P.crisisAnalysis(ds, [asset(ra.map((x, i) => i <= kf ? NaN : x)), asset(rb.map((x, i) => i <= kf ? NaN : x))], w, 12, P.CRISES.find(c => c.id === "covid"));
  t("crisi coperta a metà segnalata come parziale", late.status === "partial");
  const dd = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2020, 1, 3 + i)));
  const daily = P.crisisAnalysis(dd, [asset(Array(30).fill(-0.01))], [1], 252, P.CRISES.find(c => c.id === "covid"));
  t("dati giornalieri: finestra 20 feb - 23 mar esatta", daily.idx.length === dd.filter(d => d >= new Date(Date.UTC(2020, 1, 20)) && d <= new Date(Date.UTC(2020, 2, 23))).length);
});

group("Stress test: shock con le correlazioni", () => {
  const a = asset([0.01, -0.02, 0.03, -0.01, 0.02, -0.03]), b = asset(a.ret.map(x => 2 * x)), c = asset([0.01, 0.01, -0.01, -0.01, 0.01, -0.01]);
  const C = P.covMatrix([a, b]).C, s = P.conditionalShock(C, [-0.1, NaN]);
  t("asset con beta 2 si muove del doppio", near(s.r[1], -0.2) && s.implied[1] && !s.implied[0]);
  const C3 = P.covMatrix([a, c]).C, s3 = P.conditionalShock(C3, [-0.1, NaN]);
  t("beta = cov/var", near(s3.r[1], -0.1 * C3[0][1] / C3[0][0]));
  const x = asset([0.02, -0.01, 0.015, -0.03, 0.01, 0.005, -0.02, 0.025]), y = asset([0.01, 0.0, 0.02, -0.02, -0.01, 0.01, -0.01, 0.02]), z = asset([0.03, -0.02, 0.01, -0.04, 0.02, 0.0, -0.03, 0.03]);
  const Cz = P.covMatrix([x, y, z]).C, two = P.conditionalShock(Cz, [-0.1, -0.05, NaN]);
  const det = Cz[0][0] * Cz[1][1] - Cz[0][1] * Cz[1][0], inv = [[Cz[1][1] / det, -Cz[0][1] / det], [-Cz[1][0] / det, Cz[0][0] / det]];
  const xx = [inv[0][0] * -0.1 + inv[0][1] * -0.05, inv[1][0] * -0.1 + inv[1][1] * -0.05];
  t("due shock insieme: Σ_UK Σ_KK⁻¹ s", near(two.r[2], Cz[2][0] * xx[0] + Cz[2][1] * xx[1]));
  t("shock imposti restano invariati", two.r[0] === -0.1 && two.r[1] === -0.05);
  t("asset identici: errore chiaro", !!P.conditionalShock(P.covMatrix([a, a, c]).C, [-0.1, -0.1, NaN]).error);
  const im = P.stressImpact([0.6, 0.4], [-0.2, 0.05]);
  t("impatto sul portafoglio = Σ w·shock", near(im.total, 0.6 * -0.2 + 0.4 * 0.05) && near(im.contrib[0], -0.12));
});

group("Frontiera efficiente e ottimizzatore", () => {
  const sum = w => w.reduce((a, b) => a + b, 0);
  // due asset non correlati: varianza minima con wᵢ ∝ 1/σᵢ²
  const C2 = [[0.04, 0], [0, 0.01]], mu2 = [0.08, 0.04];
  const o2 = P.optimize({ mu: mu2, C: C2, rf: 0 });
  t("varianza minima analitica (w₁ = σ₂² / (σ₁² + σ₂²))", near(o2.minVar.w[0], 0.01 / 0.05, 1e-6) && near(o2.minVar.w[1], 0.04 / 0.05, 1e-6));
  // tangenza senza vincoli attivi: w ∝ Σ⁻¹(μ − rf)
  const rf = 0.01, z = [(0.08 - rf) / 0.04, (0.04 - rf) / 0.01], wt = z.map(x => x / sum(z));
  const o3 = P.optimize({ mu: mu2, C: C2, rf });
  t("massimo Sharpe = portafoglio di tangenza Σ⁻¹(μ − rf)", near(o3.maxSharpe.w[0], wt[0], 1e-4), `${o3.maxSharpe.w[0]} vs ${wt[0]}`);
  // con correlazione
  const C3 = [[0.04, 0.006, 0.002], [0.006, 0.0225, 0.001], [0.002, 0.001, 0.0025]], mu3 = [0.09, 0.07, 0.025];
  const o = P.optimize({ mu: mu3, C: C3, rf: 0.01 });
  t("pesi sommano a 1 e senza vendite allo scoperto", o.frontier.every(p => near(sum(p.w), 1, 1e-9) && p.w.every(x => x >= -1e-12)));
  let mono = true; for (let i = 1; i < o.frontier.length; i++) if (o.frontier[i].ret < o.frontier[i - 1].ret - 1e-9 || o.frontier[i].vol < o.frontier[i - 1].vol - 1e-9) mono = false;
  t("frontiera: rendimento e volatilità crescono insieme", mono);
  t("ultimo punto = asset a rendimento massimo", near(o.frontier[o.frontier.length - 1].w[0], 1, 1e-6));
  const sh = p => (p.ret - 0.01) / p.vol;
  t("massimo Sharpe ≥ ogni punto della frontiera", o.frontier.every(p => sh(o.maxSharpe) >= sh(p) - 1e-9));
  const rnd = P.randomPortfolios(3, 400, [0, 0, 0], [1, 1, 1], 3);
  t("nessun portafoglio casuale sta sopra la frontiera", rnd.every(w => { const p = P.pStats(w, mu3, C3); return sh(p) <= sh(o.maxSharpe) + 1e-9 && p.vol >= o.minVar.vol - 1e-9; }));
  const tv = o.target("vol", 0.1);
  t("volatilità target raggiunta", near(tv.vol, 0.1, 1e-4), tv.vol);
  const tr = o.target("ret", 0.06);
  t("rendimento target raggiunto", near(tr.ret, 0.06, 1e-4), tr.ret);
  t("target sotto il minimo segnalato", o.target("vol", 0.001).clamped === "low");
  const ob = P.optimize({ mu: mu3, C: C3, rf: 0.01, min: 0.1, max: 0.5 });
  t("vincoli di peso minimo e massimo rispettati", [ob.minVar, ob.maxSharpe, ...ob.frontier].every(p => p.w.every(x => x >= 0.1 - 1e-9 && x <= 0.5 + 1e-9) && near(sum(p.w), 1, 1e-9)));
  t("vincoli impossibili rifiutati", !!P.optimize({ mu: mu3, C: C3, max: 0.3 }).error && !!P.optimize({ mu: mu3, C: C3, min: 0.4 }).error);
  const os = P.optimize({ mu: mu3, C: C3, rf: 0.01, min: -0.3, max: 1.3 });
  t("vendite allo scoperto consentite se il minimo è negativo", os.frontier.some(p => p.w.some(x => x < -1e-6)));
  const rp = P.riskParity(C2);
  t("risk parity, asset non correlati: w ∝ 1/σ", near(rp[0], (1 / 0.2) / (1 / 0.2 + 1 / 0.1), 1e-8));
  const rp3 = P.riskParity(C3), rc = P.riskContrib(rp3, C3, 1);
  t("risk parity: contributi al rischio uguali", rc.pct.every(x => near(x, 1 / 3, 1e-6)));
  t("un solo asset: peso 100%", P.optimize({ mu: [0.05], C: [[0.01]] }).maxSharpe.w[0] === 1);
  const pr = P.projBox([0.9, 0.5, -0.2], [0, 0, 0], [0.6, 1, 1]);
  t("proiezione sui vincoli", near(sum(pr), 1, 1e-12) && pr[0] <= 0.6 + 1e-12 && pr[2] >= 0);
});

group("Benchmark", () => {
  const rr = P.makeRng(11), n = 60, bR = Array.from({ length: n }, () => 0.006 + 0.08 * (rr() - 0.5)), pR = bR.map(x => 0.5 * x + 0.001);
  const s = P.benchStats(pR, bR, 12, 0.02), sdB = Math.sqrt(bR.reduce((a, x) => a + (x - bR.reduce((q, y) => q + y, 0) / n) ** 2, 0) / (n - 1));
  t("beta = 0,5 se il portafoglio è metà benchmark", near(s.beta, 0.5, 1e-9));
  t("correlazione 1 e R² 1", near(s.corr, 1, 1e-9) && near(s.r2, 1, 1e-9));
  t("alpha di Jensen = (0,001 − 0,5·rf/f)·f", near(s.alpha, (0.001 - 0.5 * 0.02 / 12) * 12, 1e-9));
  t("tracking error = sd(p − b)·√f = 0,5·sd(b)·√12", near(s.te, 0.5 * sdB * Math.sqrt(12), 1e-9));
  const act = pR.map((x, i) => x - bR[i]), ma = act.reduce((a, x) => a + x, 0) / n;
  t("information ratio = media(p − b)·f / TE", near(s.ir, ma * 12 / s.te, 1e-9));
  t("rendimento attivo = CAGR p − CAGR b", near(s.active, s.cagrP - s.cagrB, 1e-12));
  t("finestre mobili di 12 mesi", s.roll.length === n - 11);
  t("capture ratio coerenti con beta 0,5", s.up < 1 && s.down < 1 && s.down > 0);
  t("meno di 12 periodi in comune rifiutati", !!P.benchStats([0.1], [0.1], 12).error);
  // prezzi in dollari convertiti in euro con il cambio BCE (dollari per 1 euro)
  const px = P.benchPrices([{ d: "2020-01-31", v: 110 }, { d: "2020-02-29", v: 121 }], [{ p: "2020-01", v: 1.1 }, { p: "2020-02", v: 1.0 }]);
  t("conversione in euro: P€ = P$ / cambio", near(px.get("2020-01"), 100) && near(px.get("2020-02"), 121));
  t("mese senza cambio escluso", P.benchPrices([{ d: "2020-03-31", v: 100 }], [{ p: "2020-01", v: 1.1 }]).size === 0);
  // dati mensili: allineamento per mese
  const dm = Array.from({ length: 5 }, (_, k) => new Date(Date.UTC(2020, k + 1, 0))), pm = [NaN, 0.01, 0.02, NaN, 0.04];
  const pxm = new Map([["2020-01", 100], ["2020-02", 102], ["2020-03", 99], ["2020-04", 101], ["2020-05", 103]]);
  const al = P.benchAlign(dm, 12, pm, pxm);
  t("mensile: coppie solo dove entrambi hanno dati", al.keys.join() === "2020-02,2020-03,2020-05" && near(al.b[1], 99 / 102 - 1) && al.fc === 12);
  // dati giornalieri: mesi composti, primo e ultimo esclusi
  const dd = [], pd = []; for (let i = 0; i < 120; i++) { const d = new Date(Date.UTC(2020, 0, 15 + i)); dd.push(d); pd.push(i ? 0.001 : NaN); }
  const ald = P.benchAlign(dd, 252, pd, pxm);
  const febDays = dd.filter((d, i) => i && d.getUTCMonth() === 1).length;
  t("giornaliero: rendimento di febbraio composto e primo/ultimo mese esclusi", ald.fc === 12 && ald.keys[0] === "2020-02" && near(ald.p[0], 1.001 ** febDays - 1) && !ald.keys.includes("2020-01") && !ald.keys.includes(P.fmtDate(dd[119], 12)));
  // il benchmark nelle crisi: COVID con prezzi mensili
  const pxc = new Map([["2019-12", 100], ["2020-01", 100], ["2020-02", 90], ["2020-03", 72], ["2020-04", 80], ["2020-05", 100]]), ba = P.benchAsset(pxc);
  const cv = P.crisisAnalysis(ba.dates, [ba.asset], [1], 12, P.CRISES.find(c => c.id === "covid"));
  t("benchmark nelle crisi fuori dal file: COVID −28%", cv.status === "in" && near(cv.ret, 0.72 - 1) && near(cv.mdd, -0.28) && cv.recK === 5);
});

group("File personali con versamenti (tracker)", () => {
  // storico mensile tipico: versato e quote crescono a scalini, il valore cresce con i soldi aggiunti, i prezzi sono veri
  const aoa = [["Mese", "Versato totale (€)", "Quote ETF", "Prezzo ETF", "Prezzo ETF2", "Valore stimato (€)"]];
  let q = 0, vers = 0, p = 100;
  for (let k = 0; k < 24; k++) { if (k % 3 === 0) { vers += 300; q += 3; } p *= 1 + (k % 2 ? 0.02 : -0.01); aoa.push([`${2024 + Math.floor(k / 12)}-${String(k % 12 + 1).padStart(2, "0")}-28`, vers, q, +p.toFixed(2), k < 6 ? 0 : +(50 + k).toFixed(2), +(q * p).toFixed(2)]); }
  const an = P.analyzeSheet("Storico", aoa), by = n => an.cols.find(c => c.name === n);
  t("versato riconosciuto come flusso, non prezzo", by("Versato totale (€)").suggest === "ignore");
  t("quote riconosciute come quantità, non prezzo", by("Quote ETF").suggest === "ignore");
  t("valore con versamenti nello stesso foglio non usato come prezzo", by("Valore stimato (€)").suggest !== "price");
  t("prezzo vero riconosciuto", by("Prezzo ETF").suggest === "price");
  t("zeri prima dell'acquisto trattati come mancanti", by("Prezzo ETF2").suggest === "price" && by("Prezzo ETF2").leadZeros === 6);
  t("foglio segnalato come tracker", an.tracker === true);
  const cum = P.analyzeSheet("x", [["Data", "Serie"], ...Array.from({ length: 20 }, (_, k) => [`2020-${String(k % 12 + 1).padStart(2, "0")}-28`, 100 + Math.floor(k / 4) * 10])]);
  t("serie che sale solo a scalini senza nome indicativo: non è un prezzo", cum.cols.find(c => c.name === "Serie").suggest === "ignore");
  const real = P.analyzeSheet("y", [["Data", "Prezzo"], ...Array.from({ length: 20 }, (_, k) => [`2020-${String(k % 12 + 1).padStart(2, "0")}-28`, 100 + (k % 3 === 0 ? -1 : 1) * k * 0.5])]);
  t("un prezzo che sale e scende resta un prezzo", real.cols.find(c => c.name === "Prezzo").suggest === "price" && !real.tracker);
});

group("Rendimento reale con i versamenti (TIR e TWR)", () => {
  const D0 = new Date(Date.UTC(2021, 0, 1)), D1 = new Date(Date.UTC(2022, 0, 1)), D2 = new Date(Date.UTC(2023, 0, 1)); // anni di 365 giorni
  t("TIR: 1000 € che diventano 1100 € in un anno = 10%", near(P.xirr([{ t: D0, v: -1000 }, { t: D1, v: 1100 }]), 0.1, 1e-8));
  const x2 = P.xirr([{ t: D0, v: -1000 }, { t: D1, v: -1000 }, { t: D2, v: 2310 }]);
  t("TIR con due versamenti: 1000·1,1² + 1000·1,1 = 2310 → 10%", near(x2, 0.1, 1e-7));
  t("TIR senza valore finale: non calcolabile", Number.isNaN(P.xirr([{ t: D0, v: -1000 }])));
  // 12 mesi: +1% al mese; versamento di 1000 € a fine gennaio e 1000 € a fine giugno
  const dates = Array.from({ length: 13 }, (_, k) => new Date(Date.UTC(2020, k + 1, 0))), ret = dates.map((_, k) => k ? 0.01 : NaN);
  const tx = [{ d: dates[0], i: 0, amount: 1000 }, { d: new Date(Date.UTC(2020, 5, 15)), i: 0, amount: 1000 }];
  const pp = P.personalPerformance(dates, [{ ret }], tx);
  const k6 = dates.findIndex(d => d >= tx[1].d), expV = 1000 * 1.01 ** 12 + 1000 * 1.01 ** (12 - k6);
  t("valore finale = versamenti fatti crescere dal loro mese", near(pp.value, expV, 1e-9), `${pp.value} vs ${expV}`);
  t("versato e guadagno", pp.invested === 2000 && near(pp.gain, expV - 2000, 1e-9));
  t("TWR = rendimento degli strumenti, indipendente dai versamenti", near(pp.twr, 1.01 ** 12 - 1, 1e-12));
  t("TIR coerente con i flussi", near(pp.xirr, P.xirr([{ t: tx[0].d, v: -1000 }, { t: tx[1].d, v: -1000 }, { t: dates[12], v: expV }]), 1e-12));
  // due asset: il TWR pondera i rendimenti con i soldi realmente investiti in ciascuno
  const r2 = dates.map((_, k) => k ? -0.01 : NaN), pp2 = P.personalPerformance(dates, [{ ret }, { ret: r2 }], [{ d: dates[0], i: 0, amount: 3000 }, { d: dates[0], i: 1, amount: 1000 }]);
  t("TWR pondera per i soldi in ogni asset", near(pp2.series[1].twr - 1, (3000 * 0.01 + 1000 * -0.01) / 4000, 1e-12));
  t("vendita riduce il valore", P.personalPerformance(dates, [{ ret }], [{ d: dates[0], i: 0, amount: 1000 }, { d: dates[12], i: 0, amount: -500 }]).invested === 500);
  t("transazioni di strumenti non presenti segnalate", P.personalPerformance(dates, [{ ret }], [{ d: dates[0], i: -1, amount: 100, ticker: "XYZ" }, { d: dates[0], i: 0, amount: 100 }]).unmatched.length === 1);
  const sf = P.sameFlows(dates, ret, dates.map((_, k) => k === 0 ? 1000 : 0));
  t("stessi versamenti nel benchmark", near(sf.value, 1000 * 1.01 ** 12, 1e-9));
});

group("Statistica professionale", () => {
  // distribuzioni: valori tabulati
  t("Φ(1,96) = 0,9750", near(P.normCdf(1.959964), 0.975, 1e-6));
  t("Φ(0) = 0,5 e simmetria", near(P.normCdf(0), 0.5, 2e-7) && near(P.normCdf(-1.3) + P.normCdf(1.3), 1, 1e-9)); // precisione dell'approssimazione: ~1e-7
  t("t di Student: P(T ≤ 2,228 | 10 gdl) = 0,975", near(P.tCdf(2.228139, 10), 0.975, 1e-5));
  t("quantile t 97,5% con 30 gdl = 2,042", near(P.tInv975(30), 2.042272, 1e-4));
  t("χ²(1): LR 3,841 → p = 0,05", near(P.chi2p1(3.841459), 0.05, 1e-5));
  // Sharpe con incertezza: rendimenti normali simulati → IC che contiene il vero Sharpe e PSR coerente
  const rr = P.makeRng(17), g = () => { let u = 0; while (!u) u = rr(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rr()); };
  const r = Array.from({ length: 600 }, () => 0.008 + 0.04 * g()), k = P.riskStats(r, 12, 0);
  const sp = k.mean / k.sd, seN = Math.sqrt((1 + 0.5 * sp * sp) / (r.length - 1)) * Math.sqrt(12);
  t("errore standard dello Sharpe ≈ formula normale (asimmetria e curtosi ~0)", Math.abs(k.srSE / seN - 1) < 0.05, `${k.srSE} vs ${seN}`);
  t("IC 95% dello Sharpe = ±1,96 errori standard", near(k.srHi - k.srLo, 2 * 1.959964 * k.srSE, 1e-9));
  t("vero Sharpe (0,693) dentro l'IC", k.srLo < 0.008 / 0.04 * Math.sqrt(12) && k.srHi > 0.008 / 0.04 * Math.sqrt(12));
  t("PSR = Φ(Sharpe/errore)", near(k.psr, P.normCdf(sp / (k.srSE / Math.sqrt(12))), 1e-9));
  // VaR parametrico e Cornish-Fisher
  t("VaR parametrico = −(μ − 1,645σ)", near(k.varParam95, -(k.mean - 1.6448536 * k.sd), 1e-6));
  t("Cornish-Fisher ≈ parametrico se la distribuzione è quasi normale", Math.abs(k.varCF95 - k.varParam95) < 0.004);
  const skewed = r.map((x, i) => i % 25 === 0 ? -0.15 : x), ks = P.riskStats(skewed, 12, 0);
  t("con code sinistre Cornish-Fisher > parametrico", ks.skew < 0 && ks.varCF95 > ks.varParam95);
  // drawdown
  const d = P.riskStats([0.1, -0.5, 1, 0.1, 0.1, 0.1], 12, 0);
  t("Ulcer index = √(media dd²)", near(d.ulcer, Math.sqrt(0.25 / 6), 1e-9));
  t("tempo sott'acqua = quota periodi sotto il massimo", near(d.underwater, 1 / 6, 1e-9));
  t("Omega = guadagni / perdite", near(d.omega, (0.1 + 1 + 0.3) / 0.5, 1e-9));
  // backtest del VaR: rendimenti i.i.d. → frequenza di superamenti vicina al 5%, test non rifiutato
  const bt = P.varBacktest(r, 120, 0.05);
  t("backtest VaR: superamenti vicini al 5%", Math.abs(bt.rate - 0.05) < 0.03 && bt.n === 480, `${bt.x}/${bt.n}`);
  t("Kupiec: LR = −2 ln(L0/L1) e p-value", near(bt.p, P.chi2p1(bt.lr), 1e-12) && bt.lr >= 0);
  const bad = P.varBacktest(r.map((x, i) => i >= 300 ? x * 3 : x), 120, 0.05);
  t("volatilità che triplica: il VaR storico fallisce il test", bad.p < 0.05 && !bad.ok, `p=${bad.p}`);
  // regressione sul benchmark: t-test di alpha e beta
  const b = Array.from({ length: 240 }, () => 0.006 + 0.04 * g()), e = b.map(() => 0.01 * g()), p = b.map((x, i) => 0.002 + 0.8 * x + e[i]);
  const s = P.benchStats(p, b, 12, 0);
  t("beta stimato vicino a 0,8 con IC che lo contiene", s.betaLo < 0.8 && s.betaHi > 0.8);
  t("alpha 2,4%/anno vero: significativo (p < 0,05)", s.pAlpha < 0.05 && s.alphaLo > 0, `p=${s.pAlpha}`);
  const s0 = P.benchStats(b.map((x, i) => 0.8 * x + e[i]), b, 12, 0);
  t("alpha nullo: non significativo", s0.pAlpha > 0.05, `p=${s0.pAlpha}`);
  t("volatilità residua ≈ 1% · √12", Math.abs(s.resVol / (0.01 * Math.sqrt(12)) - 1) < 0.12);
  // Monte Carlo: errore standard della probabilità
  const mc = P.monteCarlo({ ret: r.slice(0, 240), f: 12, years: 10, initial: 1000, n: 1000, goal: 2000, seed: 3 });
  t("errore standard della probabilità = √(p(1−p)/n)", near(mc.probGoalSE, Math.sqrt(mc.probGoal * (1 - mc.probGoal) / 1000), 1e-12));
});

group("Tracker a matrice (una riga per voce, un foglio per anno)", () => {
  const L = (y, m) => new Date(y, m + 1, 0); // fine mese, come le date lette da Excel
  // foglio 2024: prima colonna = chiusura del 2023; due TSLA su broker diversi; debiti, totale e cambi in fondo
  const y24 = [
    [null, "Asset 2024", "PCurrency", "Type", L(2023, 11), L(2024, 9), L(2024, 10), L(2024, 11)],
    [null, "Stock - ETF"], [null, "InteractiveBrokers"],
    [10, "LCWD", "U", "ETF:S", 100, 110, 120, 130],
    [5, "TSLA", "U", "Stock", 50, 50, 50, 50],
    [null, "Trading212"],
    [3, "TSLA", "U", "Stock", 20, 20, 20, 20],
    [null, "Immobili"], [null, "Casa", "E", "RE", 200, 200, 200, 200],
    [null, "Debts"], [null, "Mutuo", "E", "PD", -50, -50, -50, -50],
    [null, "NW (EUR)", "E", "Total", 1, 2, 3, 4],
    [null, null, null, null, 0.1, 0.2, "#N/A", 0.3],
    [null, "Exchanges"], [null, "USDEUR", null, null, 0.9, 0.9, "#N/A", 0.8]
  ];
  // foglio 2025: la prima colonna ripete dicembre 2024 con il ticker già rinominato (LCWD → MWRU): non va contata due volte
  const y25 = [
    [null, "Asset 2025", "PCurrency", "Type", L(2024, 11), L(2025, 0), L(2025, 1)],
    [null, "Stock - ETF"], [null, "InteractiveBrokers"],
    [10, "MWRU", "U", "ETF:S", 130, 140, 150],
    [5, "TSLA", "U", "Stock", 50, 60, 60],
    [null, "Trading212"], [3, "TSLA", "U", "Stock", 20, 25, 25],
    [null, "Immobili"], [null, "Casa", "E", "RE", 200, 200, 200],
    [null, "Exchanges"], [null, "USDEUR", null, null, 0.8, 0.5, 0.5]
  ];
  const W = P.reshapeWide([{ name: "2025", aoa: y25 }, { name: "2024", aoa: y24 }, { name: "Note", aoa: [["testo libero", 1]] }]);
  t("riconosce i fogli a matrice e ignora gli altri", !!W && W.report.sheets.join() === "2024,2025");
  t("unisce gli anni in una sola storia mensile", W.report.from === "2023-12" && W.report.to === "2025-02" && W.months.length === 6);
  const sh = re => W.sheets.find(s => re.test(s.name)), cls = sh(/Classi/), pos = sh(/Posizioni/);
  const at = (S, y, m, col) => { const r = S.aoa.find(x => x[0] instanceof Date && x[0].getFullYear() === y && x[0].getMonth() === m); return r ? r[S.aoa[0].indexOf(col)] : undefined; };
  t("classi in euro con i cambi del file: (130+50+20)·0,8 = 160 a dicembre 2024", near(at(cls, 2024, 11, "Azioni ed ETF"), 160), at(cls, 2024, 11, "Azioni ed ETF"));
  t("il mese ripetuto nel foglio dopo non raddoppia l'ETF rinominato", at(pos, 2024, 11, "MWRU") == null && near(at(pos, 2024, 11, "LCWD"), 104));
  t("cambio mancante (#N/A): si usa l'ultimo disponibile", near(at(cls, 2024, 10, "Azioni ed ETF"), (120 + 50 + 20) * 0.9));
  t("gennaio dal foglio 2025: (140+60+25)·0,5", near(at(cls, 2025, 0, "Azioni ed ETF"), 112.5));
  const posH = pos.aoa[0];
  t("stesso titolo su due broker: due posizioni distinte", posH.includes("TSLA · InteractiveBrokers") && posH.includes("TSLA · Trading212"));
  t("debiti, totali e cambi non sono asset", !posH.includes("Mutuo") && !posH.includes("USDEUR") && !posH.includes("NW (EUR)") && W.report.debts === 1);
  t("patrimonio netto dalla riga in euro", near(at(sh(/Patrimonio/), 2024, 11, "Patrimonio netto (EUR)"), 4));
  const an = P.analyzeSheet(cls.name, cls.aoa), roles = {}; an.cols.forEach(c => { roles[c.idx] = c.suggest; });
  t("il foglio unito passa nel motore normale", an.headerRow === 0 && P.buildDataset(an, roles).ok);
  t("un foglio normale (date in colonna) non viene toccato", P.reshapeWide(P.sampleSheets()) === null);
});

group("Parser, sinonimi, anomalie, impronta dei modelli", () => {
  t("trimestri: Q1 2024 e 2023 T3", P.parseDate("Q1 2024").toISOString().slice(0, 10) === "2024-03-31" && P.parseDate("2023 T3").toISOString().slice(0, 10) === "2023-09-30");
  t("numeri con codice valuta e apostrofo svizzero", P.parseNum("EUR 1.234,56").n === 1234.56 && P.parseNum("1'234.50").n === 1234.5 && P.parseNum("1.234,56 USD").n === 1234.56);
  t("sinonimi delle intestazioni in più lingue", P.headerTag("Adj Close") === "adjclose" && P.headerTag("Chiusura") === "close" && P.headerTag("Quantità") === "qty" && P.headerTag("Controvalore") === "amount" && P.headerTag("Schlusskurs") === "close" && P.headerTag("ISIN") === "isin");
  t("valuta dall'intestazione", P.ccyOf("Prezzo (USD)") === "USD" && P.ccyOf("Valore €") === "EUR" && P.ccyOf("Price GBp") === "GBX");
  const L = (y, m) => new Date(y, m + 1, 0), p = [100, 102, 104, 52, 53, 54, 5400, 5500, 56, 57, 58, 59];
  const yahoo = [["Date", "Open", "High", "Low", "Close", "Adj Close", "Volume"], ...p.map((v, i) => [L(2020, i), v, v, v, v, v * .98, 1000 + i])];
  const ay = P.analyzeSheet("SPY", yahoo), ry = {}; ay.cols.forEach(c => { ry[c.idx] = c.suggest; });
  t("export di quotazioni: solo la chiusura rettificata è una serie", ay.cols.filter(c => c.suggest === "price").map(c => c.name).join() === "Adj Close");
  const two = [["Azioni", null, null, "Oro", null], ["Data", "Prezzo", null, "Data", "Prezzo"], [L(2020, 0), 1, null, L(2020, 0), 2], [L(2020, 1), 1.1, null, L(2020, 1), 2.1], [L(2020, 2), 1.2, null, L(2020, 2), 2.2]];
  t("intestazione su due righe: «Gruppo · Nome»", P.analyzeSheet("x", two).cols.some(c => c.name === "Oro · Prezzo"));
  const an = P.analyzeSheet("x", [["Data", "Titolo"], ...p.map((v, i) => [L(2020, i), v]), [L(2031, 0), 60]]), roles = {}; an.cols.forEach(c => { roles[c.idx] = c.suggest; });
  const d0 = P.buildDataset(an, roles), ids = d0.anomalies.map(a => a.id);
  t("anomalie: frazionamento, cambi di unità e date future", ids.includes("future") && ids.includes("split:1:3") && ids.includes("unit:1:6") && ids.includes("unit:1:8"), ids.join());
  const d1 = P.buildDataset(an, roles, { dropFuture: true, adjust: { 1: [{ k: 3, factor: .5 }, { k: 6, factor: 100 }, { k: 8, factor: .01 }] } });
  t("correzioni dell'utente: serie continua, nessuna anomalia bloccante", !d1.anomalies.some(a => a.block) && d1.assets[0].ret.every(x => !Number.isFinite(x) || Math.abs(x) < .05) && d1.nObs === p.length);
  const d2 = P.buildDataset(an, roles, { dropFuture: true, exclude: { 1: [3] } });
  t("escludere un periodo: quel rendimento non entra nei calcoli", Number.isNaN(d2.assets[0].ret[3]) && !d2.anomalies.some(a => a.id === "split:1:3"));
  const s1 = [{ name: "2024", aoa: [["Voce", "Valuta", L(2024, 0)], ["ETF", "€", 1]] }], s2 = [{ name: "2025", aoa: [["Voce", "Valuta", L(2025, 0)], ["ETF", "€", 99]] }], s3 = [{ name: "2025", aoa: [["Nome", "Prezzo", L(2025, 0)]] }];
  t("impronta: stesso modello con anni e valori diversi = stessa impronta; struttura diversa = diversa", P.structureFingerprint(s1) === P.structureFingerprint(s2) && P.structureFingerprint(s1) !== P.structureFingerprint(s3));
});

group("Rendimenti attesi prudenti (Bayes-Stein, Jorion 1986)", () => {
  const I = P.invSym([[4, 1], [1, 3]]);
  t("inversa 2×2: [[4,1],[1,3]]⁻¹ = [[3,−1],[−1,4]]/11", near(I[0][0], 3 / 11, 1e-8) && near(I[0][1], -1 / 11, 1e-8) && near(I[1][1], 4 / 11, 1e-8));
  const rng = P.makeRng(5), gauss = () => { let u = 0; while (!u) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); };
  const mk = (n, means, sd = .05) => means.map(m => asset(Array.from({ length: n }, () => m + sd * gauss())));
  const short = P.bayesStein(mk(24, [.01, .005, .02, .0]), 12), long = P.bayesStein(mk(600, [.01, .005, .02, .0]), 12);
  t("φ tra 0 e 1", short.phi >= 0 && short.phi <= 1 && long.phi >= 0 && long.phi <= 1, `${short.phi} ${long.phi}`);
  t("più storia → meno prudenza (φ più piccolo)", long.phi < short.phi, `${short.phi.toFixed(3)} vs ${long.phi.toFixed(3)}`);
  t("ogni stima sta tra la media storica e μ₀", short.mu.every((m, i) => (m - short.raw[i]) * (m - short.mu0) <= 1e-12));
  const same = P.bayesStein(mk(60, [.01, .01, .01], .0), 12);
  t("tutti gli asset uguali: nessuna differenza da correggere", same.mu.every(m => near(m, .12, 1e-9)));
  const many = P.bayesStein(mk(5, [.01, .02, .03, .04, .05]), 12);
  t("più asset che periodi: tutte le stime uguali a μ₀", many.phi === 1 && many.mu.every(m => near(m, many.mu0, 1e-9)));
});

group("Dove sei investito: composizione look-through e costi", () => {
  const L = P.lookThrough([{ w: 600, parti: [{ nome: "Stati Uniti", peso: .7 }, { nome: "Giappone", peso: .1 }, { nome: "Altri", peso: .2 }] }, { w: 300, parti: [{ nome: "Stati Uniti", peso: .9 }, { nome: "Altri", peso: .1 }] }, { w: 100, parti: null }]);
  const g = n => (L.rows.find(r => r.nome === n) || {}).peso;
  t("Stati Uniti = 0,6·70% + 0,3·90% = 69%", near(g("Stati Uniti"), .69));
  t("«Altri» resta «Altri, non dettagliati» (0,6·20% + 0,3·10%)", near(g("Altri, non dettagliati"), .15));
  t("strumento senza dati: «Non classificato», non ridistribuito", near(g("Non classificato"), .1) && near(L.coverage, .9));
  t("il totale fa 100%", near(L.total, 1));
  t("scheda che non arriva al 100%: il resto va in «Altri»", near((P.lookThrough([{ w: 1, parti: [{ nome: "Italia", peso: .6 }] }]).rows.find(r => /^Altri/.test(r.nome)) || {}).peso, .4));
  const T = P.weightedTer([{ w: 75, ter: .002 }, { w: 25, ter: .003 }]);
  t("TER ponderato: 75%·0,20% + 25%·0,30% = 0,225%", near(T.ter, .00225) && near(T.coverage, 1));
  const T2 = P.weightedTer([{ w: 50, ter: .002 }, { w: 50, ter: NaN }]);
  t("TER mancante: media sul noto, copertura dichiarata al 50%", near(T2.ter, .002) && near(T2.coverage, .5));
});

group("Concentrazione per azienda", () => {
  const top = (rows, tot) => ({ righe: rows.map(([nome, isin, peso]) => ({ nome, isin, peso })), pesoTop: tot, numero: 500 });
  const W = top([["Apple", "US0378331005", .05], ["Microsoft Corp", "US5949181045", .04], ["Alphabet, Inc. A", "US02079K3059", .02], ["Alphabet, Inc. C", "US02079K1079", .018], ["X", "X1", .01]], .138);
  const S = top([["Apple", "US0378331005", .07], ["Nvidia", "N1", .06], ["Microsoft Corp", "US5949181045", .055], ["Y", "Y1", .02]], .205);
  const K = P.companyExposure([{ nome: "W", w: 60, eq: true, top: W }, { nome: "S", w: 20, eq: true, top: S }, { nome: "Bond", w: 20, eq: false, top: null }]);
  const g = n => K.rows.find(r => r.key === P.coKey(n));
  t("Apple minimo = 0,6·5% + 0,2·7%", near(g("Apple").lo, .6 * .05 + .2 * .07));
  t("Alphabet A e C unite", near(g("Alphabet, Inc. A").lo, .6 * .038) && K.rows.filter(r => /Alphabet/.test(r.nome)).length === 1);
  t("Nvidia: massimo = minimo + peso di W × sua 10ª partecipazione", near(g("Nvidia").hi, .2 * .06 + .6 * .01));
  t("sovrapposizione W↔S = Σ min sulle aziende comuni", near(K.pairs[0].lo, .05 + .04) && K.pairs[0].n === 2);
  t("fondo azionario senza dati: massimo non dichiarato", P.companyExposure([{ nome: "W", w: 1, eq: true, top: W }, { nome: "Z", w: 1, eq: true, top: null }]).rows[0].hi === null);
});

group("Guadagno per strumento dalle transazioni", () => {
  const D = Array.from({ length: 13 }, (_, i) => new Date(Date.UTC(2024, i + 1, 0)));
  const A = [{ name: "A", ret: D.map((d, i) => i ? .02 : NaN) }, { name: "B", ret: D.map((d, i) => i ? -.01 : NaN) }];
  const tx = [{ d: D[0], i: 0, amount: 1000, type: "Acquisto" }, { d: D[0], i: 1, amount: 500, type: "Acquisto" }, { d: D[6], i: 0, amount: -200, type: "Vendita" }, { d: D[8], i: 1, amount: -10, type: "Dividendo" }];
  const R = P.personalPerformance(D, A, tx), g = R.byAsset.reduce((s, b) => s + b.gain, 0);
  t("Σ guadagni per strumento = guadagno totale", near(g, R.gain));
  t("vendite e dividendi separati", near(R.byAsset[0].sold, 200) && near(R.byAsset[1].income, 10) && near(R.byAsset[1].sold, 0));
  t("strumento in calo: guadagno negativo", R.byAsset[1].gain < 0 && R.byAsset[0].gain > 0);
  t("TIR per strumento ≈ 2% al mese per A", Math.abs(Math.pow(1 + R.byAsset[0].xirr, 1 / 12) - 1 - .02) < .002);
});

group("Scomposizione del rischio e ribilanciamento", () => {
  const C = [[.04, .01, 0], [.01, .09, -.01], [0, -.01, .01]], w = [.5, .3, .2], R = P.riskContrib(w, C, 1);
  t("Σ contributi = volatilità del portafoglio (Euler)", near(R.ccr.reduce((a, b) => a + b, 0), R.volP));
  t("MCR = derivata numerica di σₚ", (() => { const h = 1e-6, w2 = [w[0] + h, w[1], w[2]], s2 = P.riskContrib(w2, C, 1).volP; return Math.abs((s2 - R.volP) / h - R.mcr[0]) < 1e-4; })());
  t("asset che copre: contributo negativo", P.riskContrib([.6, .1, .3], [[.04, 0, -.015], [0, .01, 0], [-.015, 0, .01]], 1).pct[2] < 0);
  const b = P.contributionSplit([600, 300, 100], [.5, .3, .2], 100);
  t("versamento al più sottopesato", near(b[2], 100) && near(b[0] + b[1], 0));
  const b2 = P.contributionSplit([600, 300, 100], [.5, .3, .2], 500), tot = 1500;
  t("versamento grande: arriva esattamente ai target", near(600 + b2[0], .5 * tot) && near(300 + b2[1], .3 * tot) && near(100 + b2[2], .2 * tot));
  t("somma degli acquisti = versamento", near(b2.reduce((a, x) => a + x, 0), 500));
  t("mesi per rientrare nella banda", P.monthsToTarget([600, 300, 100], [.5, .3, .2], 100, .02) === 2 && P.monthsToTarget([500, 300, 200], [.5, .3, .2], 100, .02) === 0);
});

group("Esposizioni: aree, valute, classi e stile", () => {
  const W = { focus: "Azioni, Globale", indice: "MSCI World", copertura: "No", paesi: [{ nome: "Stati Uniti", peso: .7 }, { nome: "Giappone", peso: .1 }, { nome: "Altri", peso: .2 }] };
  const EM = { focus: "Azioni, Mercati emergenti", indice: "MSCI Emerging Markets IMI", copertura: "No", paesi: [{ nome: "Cina", peso: .3 }, { nome: "Altri", peso: .7 }] };
  const BD = { focus: "Obbligazioni, EUR, Globale, Societaria", indice: "Bloomberg Euro Corporate", copertura: "No", paesi: [{ nome: "Francia", peso: .5 }, { nome: "Stati Uniti", peso: .5 }] };
  const GO = { focus: "Metalli preziosi, Gold", indice: "Gold", copertura: "No", paesi: null };
  const SC = { focus: "Azioni, Globale, Bassa capitalizzazione", indice: "MSCI World Small Cap", copertura: "Sì", paesi: [{ nome: "Stati Uniti", peso: 1 }] };
  const X = P.exposures([{ w: 40, etf: W }, { w: 10, etf: EM }, { w: 30, etf: BD }, { w: 10, etf: GO }, { w: 10, etf: SC }]);
  const g = (rows, n) => (rows.find(r => r.nome === n) || { peso: 0 }).peso;
  t("classi: azioni 60%, obbligazioni 30%, materie prime 10%", near(g(X.cls, "Azioni"), .6) && near(g(X.cls, "Obbligazioni"), .3) && near(g(X.cls, "Materie prime"), .1));
  t("«Altri» di un ETF emergenti va negli Emergenti", near(g(X.dev, "Emergenti"), .1));
  t("«Altri» di MSCI World va tra gli altri sviluppati", near(g(X.reg, "Altri paesi sviluppati"), .08));
  t("obbligazioni in EUR restano euro anche se l'emittente è americano", near(g(X.ccy, "EUR"), .3 + .1));
  t("oro esposto al dollaro, fondo coperto in euro", near(g(X.ccy, "USD"), .4 * .7 + .1));
  t("stile: small cap 1/6 della parte azionaria", near(g(X.size, "Small cap"), 1 / 6) && near(g(X.style, "Mercato (nessuno stile)"), 1));
  t("etfClass riconosce l'oro", P.etfClass(GO) === "Materie prime");
  t("costo del TER in 20 anni: 10.000 € allo 0,20% con il 5% ≈ 1.000 €", Math.abs(P.terDrag(10000, .002, .05, 20) - 1004) < 15);
});

group("Indipendenza finanziaria (FIRE)", () => {
  const zero = Array(120).fill(0), r3 = Array(120).fill(Math.pow(1.03, 1 / 12) - 1);
  const a = P.fireRate({ ret: zero, f: 12, years: 30, infl: 0, costs: 0, target: .9, n: 200 });
  t("rendimento reale zero: si preleva 1/30 del capitale l'anno", Math.abs(a.swr - 1 / 30) < 2e-4, a.swr);
  const rm = Math.pow(1.03, 1 / 12) - 1, ann = 12 * rm / (1 - Math.pow(1 + rm, -360));
  const b = P.fireRate({ ret: r3, f: 12, years: 30, infl: 0, costs: 0, target: .9, n: 200 });
  t("rendimento fisso 3%: tasso = rendita mensile esatta", Math.abs(b.swr - ann) < 2e-4, `${b.swr} vs ${ann}`);
  const c = P.fireRate({ ret: r3, f: 12, years: 30, infl: .03, costs: 0, target: .9, n: 200 });
  t("3% nominale con inflazione 3%: in termini reali è come rendimento zero", Math.abs(c.swr - 1 / 30) < 3e-4, c.swr);
  const w = P.fireWhen({ ret: zero, f: 12, initial: 0, monthly: 1000, infl: 0, costs: 0, goal: 120000, n: 100 });
  t("1.000 € al mese a rendimento zero: 120.000 € in 10 anni", w.median === 10, w.median);
  /* tutta la vita a rendimento zero: si smette a R quando 50.000 + (R − 35)·12.000 ≥ (90 − R)·24.000 → R = 71 */
  const L = { ret: zero, age: 35, endAge: 90, initial: 50000, save: 1000, spend: 2000, infl: 0, costs: 0, target: .9, n: 40 };
  t("età FIRE a rendimento zero = conto a mano (71 anni)", P.fireAge(L).age === 71, P.fireAge(L).age);
  t("con 1.000 € di pensione dai 67 anni si smette a 63", P.fireAge({ ...L, pension: 1000, pensionAge: 67 }).age === 63);
  t("risparmiare di più anticipa l'età FIRE", P.fireAge({ ...L, save: 1500 }).age < 71);
  t("capitale già sufficiente: FIRE oggi", P.fireAge({ ...L, initial: 2e6 }).already === true);
  /* per smettere a 60: 50.000 + 25·12·S ≥ 30·24.000 → S = 2.233,3 → arrotondato ai 10 € = 2.240 */
  t("risparmio per smettere a 60 anni = conto a mano (2.240 €)", P.fireSaveFor({ ...L, retireAge: 60 }).save === 2240, JSON.stringify(P.fireSaveFor({ ...L, retireAge: 60 })));
});

console.log(`\n${pass} superati, ${fail} falliti`);
process.exit(fail ? 1 : 0);
