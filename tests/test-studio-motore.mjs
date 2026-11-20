// Studio del consulente, solo motore: numero di rischio, profilo, adeguatezza, scostamento dal modello, peggiori 12 mesi.
// Ogni valore atteso è calcolato a mano nel commento accanto.
const { POS: P } = await import("file:///" + new URL("../js/engine.js", import.meta.url).pathname.replace(/^\/+/, ""));
let ok = 0, ko = 0;
const t = (nome, cond, info = "") => { if (cond) ok++; else { ko++; console.log("FALLITO:", nome, info); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// 1. numero di rischio: punti della spezzata e interpolazione
t("vol 0 → 1", P.numeroRischio(0) === 1);
t("vol 2% → 10", P.numeroRischio(.02) === 10);
t("vol 10% → 51", P.numeroRischio(.10) === 51, P.numeroRischio(.10)); // tra 8%→42 e 11%→56: 42 + 2/3·14 = 51,33 → 51
t("vol 15% → 70", P.numeroRischio(.15) === 70);
t("vol 25% → 88", P.numeroRischio(.25) === 88, P.numeroRischio(.25)); // tra 20%→82 e 30%→94: 82 + 0,5·12 = 88
t("vol 60% → 100", P.numeroRischio(.6) === 100);
t("vol non valida", Number.isNaN(P.numeroRischio(NaN)));
t("classi", P.classeRischio(30) === "Prudente" && P.classeRischio(31) === "Moderato" && P.classeRischio(70) === "Bilanciato" && P.classeRischio(71) === "Dinamico");

// 2. profilo
const inc = P.profiloPunteggio({ hor: 3 });
t("profilo incompleto", inc.completo === false && inc.mancano.length === 7);
const pb = P.profiloPunteggio({ hor: 3, obj: 2, loss: 2, react: 2, exp: 2, know: 1, res: 2, share: 2 });
// tolleranza 6/9, capacità 7/9 → 5 + 90·(0,6·0,667 + 0,4·0,778) = 5 + 90·0,7111 = 69
t("profilo bilanciato 69", pb.n === 69 && pb.classe === "Bilanciato" && pb.perdita === .2, JSON.stringify(pb));
t("niente complessi senza esperienza", pb.complessi === false);
const breve = P.profiloPunteggio({ hor: 0, obj: 3, loss: 3, react: 3, exp: 3, know: 3, res: 3, share: 3 });
// senza tetti: 5 + 90·(0,6·1 + 0,4·7/9) = 5 + 90·0,9111 = 87 → orizzonte sotto i 2 anni: tetto 30
t("tetto orizzonte breve", breve.n === 30 && breve.tetti[0] === "orizzonte sotto i 2 anni" && breve.complessi === true, JSON.stringify(breve));
const pocaPerdita = P.profiloPunteggio({ hor: 3, obj: 3, loss: 0, react: 3, exp: 1, know: 1, res: 3, share: 3 });
// 5 + 90·(0,6·6/9 + 0,4·1) = 5 + 90·0,8 = 77 → perdita accettata 5%: tetto 30
t("tetto perdita accettata", pocaPerdita.n === 30 && pocaPerdita.perdita === .05, JSON.stringify(pocaPerdita));
const minimo = P.profiloPunteggio({ hor: 0, obj: 0, loss: 0, react: 0, exp: 0, know: 0, res: 0, share: 0 });
t("profilo minimo 5 e riserva bassa", minimo.n === 5 && minimo.riservaBassa === true);

// 3. adeguatezza
const prud = P.profiloPunteggio({ hor: 1, obj: 0, loss: 1, react: 1, exp: 1, know: 1, res: 1, share: 1 });
// tolleranza 2/9, capacità 3/9 → 5 + 90·(0,1333 + 0,1333) = 29
t("profilo prudente 29", prud.n === 29 && prud.perdita === .1, JSON.stringify(prud));
const az = { vol: .15, peggiore12: -.32, pesi: [{ nome: "iShares Core MSCI World UCITS ETF", w: .8 }, { nome: "iShares Core MSCI EM IMI UCITS ETF", w: .2 }] };
const a1 = P.adeguatezza(prud, az);
const k = (a, n) => a.controlli.find(c => c.k === n);
t("azionario per un prudente: rischio ko", k(a1, "rischio").esito === "ko" && a1.numero === 70, JSON.stringify(k(a1, "rischio")));
t("perdita 32% contro 10%: ko", k(a1, "perdita").esito === "ko"); // 0,32 > 1,5·0,10
t("orizzonte 2-5 anni con 100% azioni: ko", k(a1, "orizzonte").esito === "ko"); // limite 50%, +15 = 65% < 100%
t("ETF mondo all'80%: concentrazione warn", k(a1, "concentrazione").esito === "warn"); // fondo ampio: limite 60%
t("esito complessivo ko", a1.esito === "ko");
const bil = { vol: .095, peggiore12: -.18, pesi: [{ nome: "Vanguard FTSE All-World UCITS ETF", w: .55 }, { nome: "Xtrackers II Eurozone Government Bond UCITS ETF", w: .4 }, { nome: "Xtrackers EUR Overnight Rate Swap", w: .05 }] };
const a2 = P.adeguatezza(pb, bil);
// vol 9,5% → 42 + 1,5/3·14 = 49 ≤ 69: ok; perdita 18% ≤ 20%: ok; orizzonte lungo: ok; 55% su un fondo ampio ≤ 60%: ok
t("bilanciato adeguato", a2.esito === "ok" && a2.numero === 49, JSON.stringify(a2.controlli.map(c => c.k + ":" + c.esito)));
const lev = P.adeguatezza(pb, { vol: .12, peggiore12: -.15, pesi: [{ nome: "Amundi Nasdaq-100 Daily (2x) Leveraged", w: .1 }, { nome: "Vanguard FTSE All-World UCITS ETF", w: .9 }] });
t("leva senza esperienza: ko", k(lev, "complessita").esito === "ko");
const lev2 = P.adeguatezza(breve, { vol: .12, peggiore12: -.15, pesi: [{ nome: "Bitcoin", w: .1 }, { nome: "Vanguard FTSE All-World UCITS ETF", w: .9 }] });
t("cripto con esperienza: ok", k(lev2, "complessita").esito === "ok");
const tit = P.adeguatezza(pb, { vol: .2, peggiore12: -.2, pesi: [{ nome: "Eni", w: .5 }, { nome: "Enel", w: .5 }] });
t("singolo titolo al 50%: warn", k(tit, "concentrazione").esito === "warn");
t("riserva bassa segnalata", !!k(P.adeguatezza(minimo, bil), "riserva"));
t("senza profilo: null", P.adeguatezza(inc, bil) === null);

// 4. classi e scostamento
t("classi dal nome", P.classeDaNome("iShares Core Euro Government Bond") === "Obbligazioni" && P.classeDaNome("Xtrackers EUR Overnight Rate Swap") === "Liquidità"
  && P.classeDaNome("Invesco Physical Gold") === "Oro" && P.classeDaNome("BTC-USD") === "Cripto" && P.classeDaNome("Enel") === "Azioni");
const mod = [{ nome: "World", w: 60, classe: "Azioni" }, { nome: "Bond", w: 40, classe: "Obbligazioni" }];
const cli = [{ nome: "World", w: .7, classe: "Azioni" }, { nome: "Bond", w: .25, classe: "Obbligazioni" }, { nome: "Oro", w: .05, classe: "Oro" }];
const sc = P.scostamento(mod, cli, .05);
// azioni 70 contro 60 (+10), obbligazioni 25 contro 40 (−15), oro 5 contro 0 (+5): massimo 15 punti → fuori banda
t("scostamento", near(sc.max, .15) && sc.fuori === true && near(sc.righe.find(r => r.classe === "Azioni").diff, .1), JSON.stringify(sc));
t("dentro la banda", P.scostamento(mod, [{ nome: "World", w: .63, classe: "Azioni" }, { nome: "Bond", w: .37, classe: "Obbligazioni" }], .05).fuori === false);
t("pesi per classe normalizzati", near(P.pesiPerClasse(mod).Azioni, .6));

// 5. peggiori 12 mesi: 12 mesi a −1% poi 12 a +1% → peggiore = 0,99^12 − 1 = −11,36%
const r = Array(12).fill(-.01).concat(Array(12).fill(.01));
t("peggiore 12 mesi", near(P.peggiore12(r, 12), Math.pow(.99, 12) - 1, 1e-12));
t("serie troppo corta", Number.isNaN(P.peggiore12([.01, .02], 12)));

console.log(`${ok} superati, ${ko} falliti`);
process.exit(ko ? 1 : 0);
