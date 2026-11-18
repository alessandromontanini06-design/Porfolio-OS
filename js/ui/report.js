/* Portfolio OS · interfaccia · ricevute, spiegazioni in parole semplici, report PDF, presentazione al cliente.
   Parte di app.js divisa in moduli: il codice è lo stesso, cambiano solo import ed export. */
import { $, P, ROLE_SHORT, S, esc, fmtDate, fmtN, fmtPct } from "./core.js";
import { trackOnce } from "./importa.js";
import { CO_Y, cmpCalc, cmpMoves, costCalc } from "./portafoglio.js";
import { chgCalc, svGet, svKeep } from "./archivio.js";
import { macroFor, mktVol } from "./laboratorio.js";
import { PER, bnReceipt, fiReceipt, fmtEur, mcReceipt, opReceipt, renderRisk, riskReceipt, stReceipt, stressList, unitN } from "./analisi.js";
import { realReceipt } from "./rendimento.js";

/* ---------- Ricevute ---------- */
function receipt(key){
  const ds=S.ds,L=S.lab,f=ds.freq.f,parts=key.split("-"),kind=parts[0];
  if(kind==="rk"&&S.risk)return riskReceipt(parts[1],parts[2]);
  if(kind==="mc"&&S.mc)return mcReceipt(parts[1],parts[2]);
  if(kind==="fi"&&S.fi&&S.fi.res)return fiReceipt(parts[1]);
  if(kind==="st"&&S.stress)return stReceipt(parts[1],parts[2],parts[3]);
  if(kind==="op"&&S.opt)return opReceipt(parts[1],parts[2]);
  if(kind==="bn"&&S.bnRes)return bnReceipt(parts[1],parts[2]);
  if(kind==="rl"&&S.real)return realReceipt(parts[1],parts[2]);
  if(kind==="corr"){
    const i=+parts[1],j=+parts[2],a=ds.assets[i],b=ds.assets[j],c=L.C[i][j];
    return {title:`Correlazione · ${a.name} / ${b.name}`,value:fmtN(c.r),formula:"ρ = Σ (xᵢ − x̄)(yᵢ − ȳ) / √[ Σ (xᵢ − x̄)² · Σ (yᵢ − ȳ)² ]\nx, y = rendimenti di periodo dei due asset",
      kv:[["Coppie di rendimenti usate",c.n],["Regola","solo periodi in cui entrambi hanno un valore"],["Lettura",Number.isFinite(c.r)?(Math.abs(c.r)>=.7?"legame forte":Math.abs(c.r)>=.3?"legame moderato":"legame debole")+(c.r<0?", opposto":""):"—"]]};
  }
  const mm=macroFor(S.rfSrc),rf=mm?mm.rf:0;
  if(kind==="macro"&&mm){
    return parts[1]==="rf"
      ?{title:`Tasso privo di rischio medio · ${mm.rfName}`,value:fmtPct(mm.rf,2),formula:"rf = media dei valori mensili del periodo / 100",kv:[["Serie",mm.rfSeries],["Fonte",mm.source],["Mesi usati",mm.n],["Periodo",`${mm.from} – ${mm.to}`]]}
      :{title:`Inflazione media annua · ${mm.cpiName}`,value:fmtPct(mm.infl,2),formula:"π = (Indice finale / Indice iniziale)^(12 / mesi) − 1",kv:[["Serie",mm.cpiSeries],["Fonte",mm.source],["Indice iniziale",`${fmtN(mm.c0.v)} · ${mm.c0.p}`],["Indice finale",`${fmtN(mm.c1.v)} · ${mm.c1.p}`],["Mesi",mm.months]]};
  }
  if(kind==="pf"&&L.pf&&L.pf[+parts[2]]){
    const r=L.pf[+parts[2]],s=r.st,met=parts[1];
    const v={cagr:fmtPct(s.cagr,2,true),real:mm?fmtPct((1+s.cagr)/(1+mm.infl)-1,2,true):"—",vol:fmtPct(s.vol,2),sharpe:fmtN(s.vol>0?(s.mean*f-rf)/s.vol:NaN),mdd:fmtPct(s.mdd,2)}[met];
    const fx={cagr:"CAGR = [ Π (1 + r_p) ]^(f / n) − 1",real:"Reale = (1 + CAGR) / (1 + π) − 1",vol:"σ_p = dev. standard di r_p · √f",sharpe:"Sharpe = (r̄_p · f − rf) / σ_p",mdd:"DD = min ( W_t / max(W) − 1 )"}[met];
    return {title:`${r.label} · ${({cagr:"Rendimento annuo",real:"Rendimento reale",vol:"Volatilità",sharpe:"Sharpe",mdd:"Massimo drawdown"})[met]}`,value:v,
      formula:"r_p = Σ wᵢ · rᵢ   (ribilanciamento mensile ai pesi wᵢ)\n"+fx,
      kv:[...r.w.map((x,j)=>x>0?[`Peso ${ds.assets[j].name}`,fmtPct(x,1)]:null).filter(Boolean),["Mesi usati",s.n],["Tasso privo di rischio",mm?fmtPct(rf,2):"0%"],["Pesi presi da",S.portfolio.from]]};
  }
  const i=+parts[1],a=ds.assets[i],s=L.st[i];
  const base=[["Osservazioni (rendimenti)",s.n],["Periodo",`${fmtDate(s.from,f)} – ${fmtDate(s.to,f)}`],["Frequenza",`${ds.freq.label} · fattore f = ${f}`],["Valori mancanti esclusi",s.skipped],["Origine",`col. ${a.col} · ${ROLE_SHORT[a.role]}`]];
  const src=a.role==="price"?"rᵢ = Pᵢ / Pᵢ₋₁ − 1   (dai prezzi)\n":a.role==="retpct"?"rᵢ = valore / 100   (dai punti %)\n":"rᵢ = valore   (rendimenti decimali)\n";
  const M={
    cagr:{t:"Rendimento annuo composto (CAGR)",v:fmtPct(s.cagr,2,true),fx:src+"CAGR = [ Π (1 + rᵢ) ]^(f / n) − 1",kv:[["Rendimento totale",fmtPct(s.total,1,true)],["n",s.n],["f",f]]},
    vol:{t:"Volatilità annualizzata",v:fmtPct(s.vol,2),fx:src+"σ = √[ Σ (rᵢ − r̄)² / (n − 1) ] · √f",kv:[["Deviazione standard di periodo",fmtPct(s.sd,2)],["Rendimento medio di periodo",fmtPct(s.mean,3)],...(()=>{const v=mktVol(a.name);return v?[["Volatilità di mercato a 1 anno",v.y1!=null?fmtPct(v.y1,2):"storico più corto"],["Volatilità di mercato a 3 anni",v.y3!=null?fmtPct(v.y3,2):"storico più corto"],["Volatilità di mercato a 5 anni",v.y5!=null?fmtPct(v.y5,2):"storico più corto"],["Come",`rendimenti giornalieri di ${v.sym} (Yahoo Finance), annualizzati con √252, in ${v.cur||"valuta di quotazione"}${v.removed?` · ${v.removed} prezzi anomali di un giorno scartati`:""}`],["Perché diversa da quella sopra","quella sopra usa i rendimenti mensili in euro su tutto il periodo comune, crisi passate comprese"]]:[];})()]},
    sharpe:{t:"Indice di Sharpe",v:fmtN(s.vol>0?(s.mean*f-rf)/s.vol:NaN),fx:src+"Sharpe = (r̄ · f − rf) / σ",kv:[["Rendimento medio annualizzato",fmtPct(s.mean*f,2)],["Volatilità annualizzata",fmtPct(s.vol,2)],["Tasso privo di rischio",mm?`${fmtPct(rf,2)} · ${mm.rfName}`:"0% · nessun dato macro"]]},
    real:{t:"Rendimento reale annuo",v:mm?fmtPct((1+s.cagr)/(1+mm.infl)-1,2,true):"—",fx:src+"Reale = (1 + CAGR) / (1 + π) − 1\nπ = inflazione media annua del periodo",kv:[["CAGR nominale",fmtPct(s.cagr,2,true)],["Inflazione media annua",mm?`${fmtPct(mm.infl,2)} · ${mm.cpiName}`:"—"]]},
    mdd:{t:"Massimo drawdown",v:fmtPct(s.mdd,2),fx:src+"Wₜ = Π (1 + rᵢ)   fino a t\nDD = min ( Wₜ / max(W₀…Wₜ) − 1 )",kv:[["Picco",fmtDate(ds.dates[s.mddPeak],f)],["Minimo",fmtDate(ds.dates[s.mddTrough],f)]]},
    worst:{t:"Periodo peggiore",v:fmtPct(s.worst,2),fx:src+"min(rᵢ)",kv:[["Data",fmtDate(ds.dates[s.worstK],f)],["Periodo migliore",`${fmtPct(s.best,2,true)} · ${fmtDate(ds.dates[s.bestK],f)}`]]}
  }[kind];
  return {title:`${M.t} · ${a.name}`,value:M.v,formula:M.fx,kv:[...M.kv,...base]};
}
/* ---------- «In parole semplici»: cosa misura ogni numero e come leggerlo, per chi non è del mestiere ----------
   Si sceglie dal titolo della ricevuta; l'esempio in euro usa il valore calcolato (mai numeri nuovi). */
const pctOf=v=>{const m=String(v||"").replace(/−/g,"-").match(/([+-]?\d[\d.]*,?\d*)\s*%/);return m?parseFloat(m[1].replace(/\./g,"").replace(",",".")):null;};
const eur10=x=>fmtN(Math.abs(x)/100*10000,0)+" €";
const EXPLAIN=[
  [/^Rendimento annuo \(TIR\)/,v=>["È quanto sono cresciuti in media ogni anno i soldi che hai versato, tenendo conto di quando li hai versati: un euro messo nel 2019 conta più di uno messo il mese scorso.","È il numero da confrontare con un conto deposito o con un'altra persona che investe: è il tuo rendimento, non quello del fondo."]],
  [/^Età in cui puoi smettere/,v=>["È l'età più bassa in cui puoi lasciare il lavoro e vivere dei tuoi investimenti (più la pensione, se l'hai indicata) fino all'età scelta, nella sicurezza scelta.","Lo trovo provando le età una per una su migliaia di futuri possibili, sempre gli stessi: cambia solo quando smetti."]],
  [/^Capitale quando smetti/,v=>["È quanto avrai investito, in euro di oggi, il giorno in cui smetti di lavorare, nello scenario di mezzo.","Lo scenario sfavorevole indica cosa succede se i mercati vanno peggio: 10 futuri su 100 finiscono sotto."]],
  [/^Prelievo mensile sostenibile/,v=>["È quanto potresti prelevare ogni mese, aumentandolo ogni anno con l'inflazione, senza esaurire i soldi per tutti gli anni scelti, nel livello di sicurezza scelto.","Se prelevi di più, la probabilità che i soldi finiscano prima sale in fretta: guarda la curva sotto."]],
  [/^Numero FIRE/,v=>["È il capitale che ti serve per coprire la spesa mensile scelta solo con i prelievi dal portafoglio.","Più è lungo il periodo e più vuoi essere sicuro, più alto è il numero. Pensione e altre entrate lo abbassano, le tasse lo alzano."]],
  [/^Quando arrivi al numero FIRE/,v=>["È tra quanti anni il capitale, con i tuoi risparmi mensili, arriva al numero FIRE, in euro di oggi.","Lo scenario sfavorevole (10 futuri su 100 vanno peggio) è quello da usare per decidere."]],
  [/^Tasso di prelievo sostenibile/,v=>["È la percentuale del capitale iniziale che puoi prelevare ogni anno (poi aggiornata all'inflazione) senza restare senza soldi.","La regola del 4% viene dai dati americani; il tuo numero viene dai rendimenti del tuo portafoglio."]],
  [/^Rendimento al netto delle tasse/,v=>["È il tuo rendimento annuo se oggi vendessi tutto e pagassi le imposte sul guadagno: 26% in generale, 12,5% sugli ETF di titoli di Stato.","È una stima: non considera il bollo annuo né minusvalenze che potresti avere da altri investimenti. Finché non vendi, le imposte non le paghi."]],
  [/^Rendimento ponderato nel tempo/,v=>["È il rendimento degli strumenti che hai scelto, come se avessi investito tutto all'inizio: toglie l'effetto di quando e quanto hai versato.","Se è molto diverso dal TIR, i tempi dei versamenti hanno contato: versare prima di un rialzo alza il TIR, versare prima di un calo lo abbassa."]],
  [/^(Rendimento annuo composto|CAGR|Rendimento annuo$|Rendimento annuo ·)/,v=>{const x=pctOf(v);return ["È la crescita media all'anno, come se il valore fosse salito della stessa percentuale ogni anno.",x!=null?`Con ${x>=0?"+":""}${fmtN(x,1)}% l'anno, 10.000 € diventano circa ${fmtN(10000*Math.pow(1+x/100,10),0)} € in 10 anni, se il futuro fosse come il passato (e non è detto).`:"Non dice nulla degli alti e bassi lungo la strada: per quelli guarda volatilità e drawdown."];}],
  [/^Rendimento reale/,v=>["È il rendimento dopo aver tolto l'inflazione: dice quanto è aumentato davvero quello che puoi comprare con i tuoi soldi.","Se è vicino a zero, hai solo difeso il potere d'acquisto; se è negativo, i prezzi sono saliti più del portafoglio."]],
  [/^Volatilità/,v=>{const x=pctOf(v);return ["Misura quanto il valore oscilla, in su e in giù, nel corso di un anno. Più è alta, più il percorso è movimentato.",x!=null?`Con ${fmtN(x,1)}%, in un anno normale è facile vedere scostamenti di circa ${eur10(x)} su 10.000 € rispetto alla media. Per riferimento: azioni mondiali 14–18%, obbligazioni 4–7%.`:"Non distingue tra oscillazioni verso l'alto e verso il basso."];}],
  [/^Indice di Sharpe|^Sharpe/,v=>["Dice quanto rendimento hai ottenuto per ogni unità di rischio preso, oltre a quello che avresti avuto senza rischi (conto deposito, BOT).","Sotto 0,5 è modesto, tra 0,5 e 1 è buono, sopra 1 è molto buono. Serve a confrontare portafogli con rischi diversi."]],
  [/^Probabilistic Sharpe/,v=>["È la probabilità che lo Sharpe sia davvero positivo e non frutto del caso, visto quanti dati ci sono.","Sopra il 95% il risultato è solido; sotto il 90% i dati non bastano per esserne sicuri."]],
  [/^Massimo drawdown|^Perdita massima/,v=>{const x=pctOf(v);return ["È la caduta più grande dal punto più alto al punto più basso, prima di risalire.",x!=null?`Con ${fmtN(x,1)}%: chi aveva 10.000 € al massimo li ha visti scendere a circa ${fmtN(10000*(1+x/100),0)} €. Chiediti se in quel momento avresti venduto.`:"È il numero più utile per capire se reggeresti i momenti brutti."];}],
  [/^Periodo peggiore/,v=>["È il peggior singolo mese (o periodo) della storia del file.","Dà un'idea del colpo più duro preso in una volta sola."]],
  [/^VaR/,v=>{const x=pctOf(v);return ["Il VaR (valore a rischio) è la perdita che in un periodo viene superata solo raramente: 1 volta su 20.",x!=null?`Con ${fmtN(Math.abs(x),1)}%: su 10.000 €, in un mese brutto ma non eccezionale puoi perdere circa ${eur10(x)}. Nei casi più estremi la perdita può essere maggiore: per quelli c'è il CVaR.`:"Non dice quanto si perde nei casi peggiori in assoluto."];}],
  [/^CVaR/,v=>{const x=pctOf(v);return ["Il CVaR è la perdita media nei periodi peggiori, quelli oltre il VaR: misura quanto fa male quando va davvero male.",x!=null?`Con ${fmtN(Math.abs(x),1)}%: su 10.000 €, nei mesi peggiori la perdita media è di circa ${eur10(x)}.`:""];}],
  [/^Indice di Sortino/,v=>["Come lo Sharpe, ma conta solo le oscillazioni verso il basso: i rialzi improvvisi non vengono considerati un rischio.","Più è alto, meglio è. Sopra 1 è buono; utile quando i rendimenti sono asimmetrici."]],
  [/^Indice di Calmar/,v=>["Rapporta la crescita annua alla caduta peggiore: quanto hai guadagnato per ogni punto di perdita massima sopportata.","Sopra 0,5 è discreto, sopra 1 è molto buono."]],
  [/^Periodi positivi/,v=>["La percentuale di mesi chiusi in guadagno.","Anche portafogli ottimi chiudono in perdita 3–4 mesi su 10: è normale."]],
  [/^Peggiore finestra/,v=>["Il peggior risultato su 12 mesi consecutivi, scegliendo il momento peggiore in cui entrare.","Risponde alla domanda: «se avessi investito nel momento sbagliato, quanto avrei perso dopo un anno?»."]],
  [/^Asimmetria/,v=>["Dice se le sorprese grandi sono più spesso negative o positive.","Un valore negativo vuol dire che i crolli improvvisi sono più frequenti dei balzi improvvisi."]],
  [/^Curtosi/,v=>["Dice quanto sono frequenti i mesi estremi rispetto a una situazione «normale».","Positiva vuol dire che gli eventi estremi capitano più spesso di quanto si penserebbe."]],
  [/^Drawdown più lungo|^Tempo di recupero|^Tempo sott'acqua/,v=>["È il tempo passato sotto il massimo precedente, prima di tornarci.","Conta quanto la profondità: aspettare anni per recuperare mette alla prova la pazienza."]],
  [/^Tempo per toccare il fondo/,v=>["Quanto è durata la discesa, dal massimo al punto più basso della crisi.","Una discesa veloce spaventa di più; una lenta logora."]],
  [/^Rendimento nella crisi/,v=>["Il risultato del portafoglio dall'inizio alla fine della crisi.","Confrontalo con l'indice: se hai perso meno, la diversificazione ha funzionato."]],
  [/^Contributo (al rischio|marginale)/,v=>["Dice quanta parte del rischio totale viene da questo strumento. Non coincide con il peso: uno strumento piccolo ma molto volatile può pesare tanto sul rischio.","Se la quota di rischio è molto più alta del peso, quello strumento è il motore delle oscillazioni."]],
  [/^Asset effettivi/,v=>["Quanti strumenti «veri» hai, tenendo conto di quanto pesano: 5 strumenti con uno al 90% valgono poco più di 1.","Più si avvicina al numero di strumenti, più i pesi sono equilibrati."]],
  [/^Rapporto di diversificazione/,v=>["Misura quanto il fatto di avere più strumenti riduce le oscillazioni rispetto alla somma delle singole.","1 vuol dire nessun beneficio; 1,3 o più è una buona diversificazione."]],
  [/^Backtest del VaR/,v=>["Controlla se il VaR ha funzionato davvero: quante volte la perdita reale ha superato la soglia rispetto alle volte attese.","Se i superamenti sono molti di più di quelli attesi, il VaR sottostima il rischio."]],
  [/^Ulcer/,v=>["Misura il «dolore» dei cali: conta sia quanto sono profondi sia quanto durano.","Più è basso, più il percorso è stato tranquillo."]],
  [/^Omega/,v=>["Confronta tutti i guadagni con tutte le perdite.","Sopra 1 i guadagni superano le perdite; più è alto, meglio è."]],
  [/^Correlazione/,v=>["Dice quanto due strumenti si muovono insieme: 1 sempre insieme, 0 indipendenti, −1 in direzioni opposte.","Strumenti poco correlati si compensano a vicenda: è il cuore della diversificazione."]],
  [/^Tasso privo di rischio/,v=>["È quanto avresti preso senza rischi, con titoli a brevissimo termine (simile a un conto deposito).","Serve da metro: un investimento rischioso dovrebbe rendere di più."]],
  [/^Inflazione/,v=>["È di quanto sono saliti in media i prezzi ogni anno nell'area euro.","Un rendimento sotto l'inflazione vuol dire che il potere d'acquisto è sceso."]],
  [/^Capitale finale/,v=>["Il risultato di migliaia di futuri possibili, costruiti rimescolando i rendimenti passati del portafoglio. Il percentile dice in che posizione si trova questo valore.","Il 50° è lo scenario di mezzo; il 5° è uno scenario sfavorevole (solo 5 futuri su 100 vanno peggio). Non è una previsione."]],
  [/^Probabilità di raggiungere/,v=>["La quota di futuri simulati in cui arrivi all'obiettivo.","È una stima basata sul passato: cambiando versamenti o anni cambia molto."]],
  [/^Probabilità di perdita/,v=>["La quota di futuri simulati in cui alla fine hai meno di quanto hai versato.","Più lungo è l'orizzonte, di solito più scende."]],
  [/^Percorsi che esauriscono/,v=>["La quota di futuri in cui i prelievi consumano tutto il capitale.","Se è sopra il 5–10%, i prelievi sono probabilmente troppo alti."]],
  [/^Beta/,v=>["Quanto il portafoglio segue i movimenti del mercato: 1 come il mercato, 0,5 la metà, sopra 1 amplifica.","Un beta basso vuol dire cali più contenuti quando il mercato scende, ma anche meno slancio quando sale."]],
  [/^Alpha/,v=>["Il rendimento in più (o in meno) rispetto a quello che ci si aspetterebbe dato il rischio di mercato preso.","Positivo e stabile nel tempo è raro: spesso è fortuna, per questo c'è il test statistico."]],
  [/^R²/,v=>["Quanto dei movimenti del portafoglio si spiega con quelli dell'indice.","Vicino a 1 il confronto con quell'indice ha senso; basso vuol dire che il portafoglio è molto diverso."]],
  [/^Tracking error/,v=>["Quanto il portafoglio si discosta dall'indice ogni anno.","Basso: copia l'indice. Alto: fa una strada sua, nel bene e nel male."]],
  [/^Information ratio/,v=>["Il rendimento in più rispetto all'indice, diviso per quanto te ne sei discostato.","Sopra 0,5 è buono; negativo vuol dire che discostarsi dall'indice non ha pagato."]],
  [/^Cattura nei (rialzi|ribassi)/,v=>["Quanta parte dei rialzi (o dei ribassi) dell'indice il portafoglio ha seguito.","L'ideale è prendere molto dei rialzi e poco dei ribassi."]],
  [/^Rendimento annuo in più/,v=>["La differenza di crescita annua tra il tuo portafoglio e l'indice.","Negativa vuol dire che l'indice, con lo stesso periodo, ha fatto meglio."]],
  [/^Rendimento atteso/,v=>["La crescita annua stimata dal passato, resa più prudente per non fidarsi troppo dei periodi fortunati.","È una stima incerta: guarda l'intervallo indicato sotto."]],
  [/^(Guadagno|Valore oggi|Valore stimato|Versato)/,v=>["Somme in euro calcolate dalle tue transazioni e dai prezzi di mercato.","Guadagno = valore di oggi − quanto hai versato + quanto hai già incassato."]]
];
function plainOf(R){const t=String(R.title||"");for(const [rx,fn] of EXPLAIN)if(rx.test(t)){try{const [a,b]=fn(R.value);return {what:a,how:b};}catch{return null;}}return null;}
function openReceipt(key){
  trackOnce("feature","ricevuta",{name:"ricevuta"});
  const R=receipt(key);
  $("#receipt").innerHTML=`<div style="display:flex;flex-direction:column;gap:8px"><span class="eyebrow">Ricevuta del calcolo</span><h3 style="font-size:1.25rem">${esc(R.title)}</h3></div>
    <div class="rc-val">${esc(R.value)}</div>${(()=>{const X=plainOf(R);return X?`<div class="rc-plain"><b>In parole semplici</b><p>${esc(X.what)}</p>${X.how?`<p class="how">${esc(X.how)}</p>`:""}</div>`:"";})()}<details class="rc-math"${plainOf(R)?"":" open"}><summary>Formula e dati usati</summary><div class="formula">${esc(R.formula)}</div>
    <dl class="kv">${R.kv.map(k=>`<dt>${esc(k[0])}</dt><dd>${esc(k[1])}</dd>`).join("")}</dl></details>
    <div class="stamp"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Calcolo deterministico sui dati del file. Nessun valore generato dall'IA.</div>`;
  $("#drawer").classList.add("open");$("#scrim").classList.add("open");$("#drawer").setAttribute("aria-hidden","false");
  $("#closeDrawer").focus();
}
function closeReceipt(){$("#drawer").classList.remove("open");$("#scrim").classList.remove("open");$("#drawer").setAttribute("aria-hidden","true");}
document.addEventListener("click",e=>{const b=e.target.closest("[data-rc]");if(b)openReceipt(b.dataset.rc);});
$("#closeDrawer").addEventListener("click",closeReceipt);
$("#scrim").addEventListener("click",closeReceipt);
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeReceipt();});

/* ---------- Report del portafoglio: una pagina stampabile (o salvabile in PDF) con i numeri già calcolati ----------
   Nessun numero nuovo: tutto viene dal motore, come nelle sezioni del sito. Le considerazioni sono frasi costruite sui risultati, non dall'IA. */
function buildReport(o={}){
  if(!S.lab||!S.ds||!S.ds.ok)return null;
  if(!S.risk)renderRisk();
  const ds=S.ds,f=ds.freq.f,R=S.risk,PR=R.PR,PS=R.PS,RC=R.RC,w=R.w,real=S.real&&S.real.pp?S.real:null,bn=S.bnRes&&S.bnRes.bs&&!S.bnRes.bs.error?S.bnRes:null;
  const st=stressList(),cr=st.list.filter(c=>c.status!=="out"&&c.used);
  const today=new Date().toLocaleDateString("it-IT",{day:"numeric",month:"long",year:"numeric"});
  const row=(k,v,n="")=>`<tr><td>${esc(k)}</td><td class="n">${v}</td>${n!==null?`<td class="d">${n}</td>`:""}</tr>`;
  const idx=ds.assets.map((a,i)=>i).filter(i=>w[i]>0);
  const topRisk=idx.reduce((a,i)=>RC.pct[i]>RC.pct[a]?i:a,idx[0]);
  const svg=id=>{const e=document.querySelector(id+" svg");if(!e)return "";const c=e.cloneNode(true);c.querySelectorAll(".cz-o").forEach(n=>n.remove());c.querySelectorAll("[class]").forEach(n=>n.classList.remove("draw","area","endpt"));c.removeAttribute("width");c.setAttribute("style","width:100%;height:auto");return c.outerHTML;};
  /* considerazioni: frasi sui risultati, senza consigli */
  const tips=[];
  if(real)tips.push(`Hai versato ${fmtEur(real.pp.invested)} e oggi il portafoglio vale circa ${fmtEur(real.pp.value)}: un rendimento annuo (TIR) del ${fmtPct(real.pp.xirr,1,true)}${real.taxes?`, che diventa ${fmtPct(real.taxes.xirr,1,true)} al netto delle imposte stimate se vendessi tutto oggi`:""}.`);
  if(idx.length>1&&Number.isFinite(RC.pct[topRisk]))tips.push(`${ds.assets[topRisk].name} pesa il ${fmtPct(w[topRisk],0)} del portafoglio ma porta il ${fmtPct(RC.pct[topRisk],0)} del rischio: è lo strumento che più decide le oscillazioni.`);
  if(Number.isFinite(PR.mdd)&&PR.troughK!=null)tips.push(`Il calo peggiore nei dati è stato del ${fmtPct(Math.abs(PR.mdd),1)}, da ${fmtDate(ds.dates[PR.peakAtTrough],f)} a ${fmtDate(ds.dates[PR.troughK],f)}${PR.recK!=null?`, recuperato a ${fmtDate(ds.dates[PR.recK],f)}`:", non ancora recuperato"}. Su 10.000 € vuol dire averne visti circa ${fmtEur(10000*(1+PR.mdd))}.`);
  if(Number.isFinite(PR.var95))tips.push(`In un ${PER[f]?PER[f].replace(/^in un /,""):"periodo"} sfavorevole (1 su 20) la perdita è stata intorno al ${fmtPct(PR.var95,1)}; nei periodi peggiori in media del ${fmtPct(PR.cvar95,1)}.`);
  if(bn)tips.push(`Rispetto a ${bn.src.label}, sugli stessi mesi, il portafoglio ha reso ${fmtPct(Math.abs(bn.bs.active),1)} l'anno ${bn.bs.active>=0?"in più":"in meno"}, con una volatilità del ${fmtPct(bn.bs.volP,1)} contro il ${fmtPct(bn.bs.volB,1)}.`);
  if(cr.length){const wc=cr.reduce((a,b)=>b.mdd<a.mdd?b:a);tips.push(`Delle crisi presenti nei dati, la più dura per questo portafoglio è stata ${wc.name} (${fmtPct(wc.mdd,1)}).`);}
  if(idx.length===1)tips.push("Il portafoglio ha un solo strumento: la diversificazione dipende tutta da quel fondo.");
  const html=`<div class="rp">
  ${o.studio?`<header class="rp-h rp-pro"><div class="rp-who">${o.logo?`<img src="${o.logo}" alt="" class="rp-logo-img">`:""}<div><b class="rp-studio">${esc(o.studio)}</b>${o.contact?`<span>${esc(o.contact)}</span>`:""}</div></div><div class="rp-meta">${o.cliente?`Per <b>${esc(o.cliente)}</b><br>`:""}${today}</div></header>`
    :`<header class="rp-h"><div><b class="rp-brand">Portfolio OS</b><span>Report del portafoglio</span></div><div class="rp-meta">${esc(S.source&&S.source.name||"")}<br>${today}</div></header>`}
  <h1>${o.cliente?`Il portafoglio di ${esc(o.cliente)}`:o.studio?"Analisi del portafoglio":"Il tuo portafoglio in una pagina"}</h1>
  <p class="rp-sub">${ds.assets.length} strumenti · dati ${ds.freq.adj} da ${fmtDate(ds.dates[0],f)} a ${fmtDate(ds.dates[ds.dates.length-1],f)} · pesi: ${esc(R.wLabel)}</p>
  ${real?`<h2>Il tuo rendimento</h2><table class="rp-t">${row("Rendimento annuo (TIR)",fmtPct(real.pp.xirr,1,true),"tiene conto di quando hai versato")}${row("Al netto delle tasse",fmtPct(real.taxes.xirr,1,true),`imposte stimate ${fmtEur(real.taxes.tax)} se vendessi oggi`)}${row("Valore stimato oggi",fmtEur(real.pp.value),"")}${row("Versato",fmtEur(real.pp.invested),"")}${row("Guadagno",(real.pp.gain>=0?"+":"−")+fmtEur(Math.abs(real.pp.gain)),fmtPct(real.pp.gainPct,1,true)+" sul versato")}${real.bm?row(`Stessi versamenti in ${real.bm.label}`,fmtEur(real.bm.value),`TIR ${fmtPct(real.bm.xirr,1,true)}`):""}</table>${svg("#realChart")}`:""}
  <h2>Allocazione e rischio per strumento</h2>
  <table class="rp-t rp-wide"><thead><tr><th>Strumento</th><th class="n">Peso</th><th class="n">Quota del rischio</th><th class="n">Rendimento annuo</th><th class="n">Volatilità</th><th class="n">Calo massimo</th></tr></thead><tbody>
  ${idx.map(i=>{const a=S.lab.st[i];return `<tr><td>${esc(ds.assets[i].name)}</td><td class="n">${fmtPct(w[i],1)}</td><td class="n">${fmtPct(RC.pct[i],1)}</td><td class="n">${fmtPct(a.cagr,1,true)}</td><td class="n">${fmtPct(a.vol,1)}</td><td class="n">${fmtPct(a.mdd,1)}</td></tr>`;}).join("")}</tbody></table>
  <h2>Rischio del portafoglio</h2>
  <table class="rp-t">${row("Rendimento annuo (dati storici)",fmtPct(PS.cagr,1,true),"come se avessi investito tutto all'inizio")}${row("Volatilità",fmtPct(RC.volP,1),"quanto oscilla in un anno")}${row("VaR 95%",fmtPct(-PR.var95,1),`perdita ${PER[f]||"in un periodo"} superata solo 1 volta su 20`)}${row("CVaR 95%",fmtPct(-PR.cvar95,1),"perdita media nei periodi peggiori")}${row("Calo massimo",fmtPct(PR.mdd,1),PR.troughK!=null?`${fmtDate(ds.dates[PR.peakAtTrough],f)} – ${fmtDate(ds.dates[PR.troughK],f)}`:"")}${row("Sortino",fmtN(PR.sortino),"rendimento per unità di rischio al ribasso")}${row("Asset effettivi",fmtN(RC.neff,1)+" su "+idx.length,"quanto sono equilibrati i pesi")}</table>
  ${svg("#riskDD")}
  ${bn?`<h2>Confronto con ${esc(bn.src.label)}</h2><table class="rp-t">${row("Rendimento annuo in più",fmtPct(bn.bs.active,1,true),`${fmtPct(bn.bs.cagrP,1,true)} contro ${fmtPct(bn.bs.cagrB,1,true)}`)}${row("Beta",fmtN(bn.bs.beta),"1 = si muove come l'indice")}${row("Tracking error",fmtPct(bn.bs.te,1),"quanto ti discosti dall'indice")}${row("Information ratio",fmtN(bn.bs.ir),"extra-rendimento per unità di scostamento")}</table>`:`<p class="rp-note">Per includere il confronto con un indice, apri una volta la sezione Benchmark e rigenera il report.</p>`}
  ${cr.length?`<h2>Nelle crisi presenti nei dati</h2><table class="rp-t">${cr.map(c=>row(c.name,fmtPct(c.mdd,1),"perdita massima del portafoglio")).join("")}</table>`:""}
  ${(()=>{const C=costCalc();if(!C||!C.items.some(x=>x.ter!=null))return "";return `<h2>Quanto costa</h2><table class="rp-t">${row("Costo annuo",fmtPct(C.ter+C.other,2),C.other>0?`TER ${fmtPct(C.ter,2)} + altri costi ${fmtPct(C.other,2)}`:"TER medio ponderato")}${row("Costi quest'anno",fmtEur(C.year),"pagati anche quando il mercato scende")}${row(`In ${CO_Y} anni`,fmtEur(C.d20),"capitale in meno con un rendimento lordo del 5%")}${C.save>100?row(`Con strumenti al ${fmtPct(C.cheap,2)}`,"+"+fmtEur(C.save),`in ${CO_Y} anni`):""}</table>${C.missing.length?`<p class="rp-note">Senza costo noto: ${C.missing.map(x=>esc(x.nome)).join(", ")}.</p>`:""}`;})()}
  ${o.prop?reportProposal():""}
  ${o.note?`<h2>Note del consulente</h2><div class="rp-note-box">${esc(o.note).replace(/\n/g,"<br>")}</div>`:""}
  <h2>Considerazioni</h2><ul class="rp-tips">${tips.map(t=>`<li>${esc(t)}</li>`).join("")}</ul>
  <footer class="rp-f">${o.studio?`Preparato da ${esc(o.studio)} con Portfolio OS. `:""}Analisi dei dati storici del file, calcolata in modo deterministico da Portfolio OS: i rendimenti passati non garantiscono quelli futuri. Non è un consiglio di investimento. Le imposte sono una stima (26%, 12,5% sui titoli di Stato) e non includono il bollo.</footer>
  </div>`;
  return html;
}
/* pagina «La proposta»: A (attuale) contro B (proposta) e, se c'è, C, sugli stessi mesi, dal confronto allocazioni */
function cmpReady(){return !!(S.cmp&&S.cmp.ports&&S.cmp.ports.filter(p=>p.w&&p.w.some(x=>x>0)).length>=2);}
function reportProposal(){
  if(!cmpReady())return "";
  const R=cmpCalc(),ds=S.ds,f=ds.freq.f,ok=R.res.filter(r=>!r.empty);if(ok.length<2)return "";
  const lab=i=>["Attuale (A)","Proposta (B)","Alternativa (C)"][i]||R.res[i].name,wTxt=r=>ds.assets.map((a,i)=>r.wn[i]>0.0005?`${esc(a.name)} ${fmtPct(r.wn[i],0)}`:null).filter(Boolean).join(" · ");
  const row=(l,g,fm)=>`<tr><td>${l}</td>${R.res.map(r=>`<td class="n">${r.empty?"—":fm(g(r))}</td>`).join("")}</tr>`;
  const crIds=[...new Set(ok.flatMap(r=>r.cr.map(c=>c.id)))];
  const a=ok[0],b=ok[1],d=(x,y)=>x-y;
  const tips=[];
  if(Number.isFinite(b.st.vol)&&Number.isFinite(a.st.vol))tips.push(`La proposta ${b.st.vol<a.st.vol?"oscilla meno":"oscilla di più"}: volatilità ${fmtPct(b.st.vol,1)} contro ${fmtPct(a.st.vol,1)}.`);
  if(Number.isFinite(b.st.mdd)&&Number.isFinite(a.st.mdd))tips.push(`Nel periodo peggiore avrebbe perso ${fmtPct(Math.abs(b.st.mdd),1)} invece di ${fmtPct(Math.abs(a.st.mdd),1)}.`);
  if(Number.isFinite(b.st.cagr)&&Number.isFinite(a.st.cagr))tips.push(`Rendimento annuo storico ${fmtPct(b.st.cagr,1,true)} contro ${fmtPct(a.st.cagr,1,true)} (${d(b.st.cagr,a.st.cagr)>=0?"+":""}${fmtN(d(b.st.cagr,a.st.cagr)*100,1)} punti).`);
  return `<h2>La proposta</h2>
    <p class="rp-sub">Stessi ${unitN(R.ks.length,f)} di dati per tutti i portafogli, ribilanciati ogni periodo ai pesi indicati.</p>
    <table class="rp-t rp-wide"><thead><tr><th></th>${R.res.map((r,i)=>`<th class="n">${lab(i)}</th>`).join("")}</tr></thead><tbody>
    <tr><td>Composizione</td>${R.res.map(r=>`<td class="d">${r.empty?"—":wTxt(r)}</td>`).join("")}</tr>
    ${row("Rendimento annuo",r=>r.st.cagr,x=>fmtPct(x,1,true))}${row("Volatilità",r=>r.st.vol,x=>fmtPct(x,1))}${row("Sharpe",r=>r.sharpe,x=>fmtN(x))}
    ${row("Calo massimo",r=>r.st.mdd,x=>fmtPct(x,1))}${row("VaR 95% (perdita in un mese brutto)",r=>-r.rk.var95,x=>fmtPct(x,1))}
    ${crIds.map(id=>{const nm=(ok.flatMap(r=>r.cr).find(c=>c.id===id)||{}).name||id;return row(`Crisi: ${esc(nm)}`,r=>{const c=r.cr.find(x=>x.id===id);return c?c.mdd:NaN;},x=>Number.isFinite(x)?fmtPct(x,1):"—");}).join("")}
    </tbody></table>
    ${svgOf("#cmpChart")}
    <p class="rp-leg">${R.res.map((r,i)=>r.empty?"":`<span><i style="background:${i===0?"#161616":["","var(--c2)","var(--c3)"][i]}"></i>${lab(i)}</span>`).join("")} · crescita di 100 € sugli stessi mesi</p>
    <ul class="rp-tips">${tips.map(t=>`<li>${esc(t)}</li>`).join("")}</ul>
    ${(()=>{const M=cmpMoves(R);if(!M||M.sell<1)return "";return `<h2>Per passare alla proposta</h2><table class="rp-t rp-wide"><thead><tr><th>Strumento</th><th class="n">Oggi</th><th class="n">Con la proposta</th><th class="n">Operazione</th><th class="n">Imposte stimate</th></tr></thead><tbody>${M.rows.map(x=>`<tr><td>${esc(x.name)}${x.isin?` <span class="d">${esc(x.isin)}</span>`:""}</td><td class="n">${fmtEur(x.va)}</td><td class="n">${fmtEur(x.vb)}</td><td class="n">${Math.abs(x.d)<1?"—":(x.d>0?"Compra ":"Vendi ")+fmtEur(Math.abs(x.d))}</td><td class="n">${x.tax>0.5?fmtEur(x.tax):"—"}</td></tr>`).join("")}<tr><td><b>Totale</b></td><td class="n">${fmtEur(M.V)}</td><td class="n">${fmtEur(M.V)}</td><td class="n">vendite ${fmtEur(M.sell)}</td><td class="n"><b>${M.tax>0.5?fmtEur(M.tax):"—"}</b></td></tr></tbody></table><p class="rp-note">Importi sul valore di oggi. Imposte stimate sul guadagno latente realizzato con le vendite (26%, 12,5% per i titoli di Stato), senza minusvalenze, commissioni e spread.${Number.isFinite(M.ta)&&Number.isFinite(M.tb)?` Costo annuo: ${fmtPct(M.ta,2)} oggi, ${fmtPct(M.tb,2)} con la proposta.`:""}</p>`;})()}`;
}
function svgOf(id){const e=document.querySelector(id+" svg");if(!e)return "";const c=e.cloneNode(true);c.querySelectorAll(".cz-o").forEach(n=>n.remove());c.removeAttribute("width");c.setAttribute("style","width:100%;height:auto");return c.outerHTML;}
const RP_KEY="pos-brand-v1";
function rpBrand(){try{return JSON.parse(localStorage.getItem(RP_KEY)||"{}")||{};}catch{return {};}}
function openReportDlg(){
  const B=rpBrand(),d=$("#rpDlg");d.hidden=false;document.body.classList.add("rp-on");
  $("#rpStudio").value=B.studio||"";$("#rpContact").value=B.contact||"";$("#rpCliente").value="";$("#rpNote").value="";
  const prev=$("#rpLogoPrev");if(B.logo){prev.src=B.logo;prev.hidden=false;$("#rpLogoDel").hidden=false;}else{prev.hidden=true;$("#rpLogoDel").hidden=true;}
  rpWho(B.who||"me");
  const ok=cmpReady();$("#rpPropWrap").hidden=!ok;$("#rpPropHint").hidden=ok;
  setTimeout(()=>d.querySelector("[aria-pressed=true]").focus(),50);
}
function rpWho(w){document.querySelectorAll("#rpWho [data-rpw]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.rpw===w)));$("#rpClient").hidden=w!=="client";$("#rpDlg").dataset.who=w;}
function closeReportDlg(){$("#rpDlg").hidden=true;document.body.classList.remove("rp-on");}
document.addEventListener("click",e=>{const w=e.target.closest("[data-rpw]");if(w)rpWho(w.dataset.rpw);if(e.target.id==="rpClose"||e.target.id==="rpDlg")closeReportDlg();
  if(e.target.id==="rpLogoDel"){const B=rpBrand();delete B.logo;try{localStorage.setItem(RP_KEY,JSON.stringify(B));}catch{}$("#rpLogoPrev").hidden=true;e.target.hidden=true;}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("#rpDlg").hidden)closeReportDlg();});
document.addEventListener("change",e=>{if(e.target.id!=="rpLogo"||!e.target.files[0])return;const fl=e.target.files[0];
  if(fl.size>600000){alert("Il logo è troppo grande: usa un'immagine sotto i 600 KB.");return;}
  const rd=new FileReader();rd.onload=()=>{const B=rpBrand();B.logo=rd.result;try{localStorage.setItem(RP_KEY,JSON.stringify(B));}catch{alert("Non riesco a salvare il logo in questo browser.");}$("#rpLogoPrev").src=rd.result;$("#rpLogoPrev").hidden=false;$("#rpLogoDel").hidden=false;};rd.readAsDataURL(fl);});
document.addEventListener("submit",e=>{if(e.target.id!=="rpForm")return;e.preventDefault();
  const who=$("#rpDlg").dataset.who||"me",B=rpBrand();let o={};
  if(who==="client"){B.studio=$("#rpStudio").value.trim();B.contact=$("#rpContact").value.trim();B.who="client";try{localStorage.setItem(RP_KEY,JSON.stringify(B));}catch{}
    o={studio:B.studio||"Il tuo consulente",contact:B.contact,logo:B.logo||null,cliente:$("#rpCliente").value.trim(),note:$("#rpNote").value.trim(),prop:cmpReady()&&$("#rpProp").checked};trackOnce("feature","report_cliente",{name:"report_cliente"});}
  else{B.who="me";try{localStorage.setItem(RP_KEY,JSON.stringify(B));}catch{}}
  closeReportDlg();printReport(o);});
function printReport(o={}){
  const h=buildReport(o);if(!h)return;trackOnce("feature","report",{name:"report"});
  let el=$("#report");if(!el){el=document.createElement("section");el.id="report";el.setAttribute("aria-hidden","true");document.body.appendChild(el);}
  el.innerHTML=h;const old=document.title;document.title=`Portfolio OS · report · ${(S.source&&S.source.name||"portafoglio").replace(/\.(xlsx?|csv|ods)$/i,"")}`;
  setTimeout(()=>{window.print();document.title=old;},80);
}
document.addEventListener("click",e=>{if(e.target.closest("#reportBtn"))openReportDlg();});
window.__report=o=>buildReport(o||{}); // per i test

/* ---------- Presentazione al cliente: le stesse analisi in poche pagine a tutto schermo, numeri grandi e frasi semplici ----------
   Pensata per il primo incontro: il consulente gira lo schermo verso il cliente. Frecce o clic per andare avanti, Esc per uscire.
   Ogni pagina c'è solo se ci sono i dati; nome del cliente e prossimi passi si scrivono direttamente sulla pagina. */
const PZ={i:0,slides:[],client:"",next:""};
function pzSlides(){
  if(!S.lab||!S.ds||!S.ds.ok)return [];
  if(!S.risk)renderRisk();
  const ds=S.ds,f=ds.freq.f,R=S.risk,PR=R.PR,w=R.w,real=S.real&&S.real.pp?S.real:null,B=rpBrand(),C=costCalc();
  const value=real?real.pp.value:C?C.tot:null,today=new Date().toLocaleDateString("it-IT",{day:"numeric",month:"long",year:"numeric"});
  const eur=v=>fmtEur(Math.round(v)),big=(v,cls="")=>`<b class="pz-big ${cls}">${v}</b>`;
  const out=[];
  /* 1 · copertina */
  out.push({id:"cover",html:`<div class="pz-cover">
    ${B.logo?`<img class="pz-logo" src="${B.logo}" alt="">`:""}${B.studio?`<span class="pz-studio">${esc(B.studio)}</span>`:""}
    <h1>Il portafoglio di <span class="pz-ed" contenteditable="true" spellcheck="false" data-pz="client" data-ph="nome del cliente">${esc(PZ.client)}</span></h1>
    <p class="pz-sub">${value?`${eur(value)} · `:""}${ds.assets.length} strumenti · ${today}</p>
    <p class="pz-hint">Usa le frecce ← → oppure clicca per andare avanti</p></div>`});
  /* 1b · cosa è cambiato dall'ultimo incontro */
  {const X=chgCalc(),ce=$("#chgCard");if(X&&ce&&!ce.hidden&&Number.isFinite(X.dV)){const when=new Date(X.a.at).toLocaleDateString("it-IT",{day:"numeric",month:"long",year:"numeric"});
    out.push({id:"change",html:`<span class="pz-k">Dall'ultimo incontro · ${when}</span>
      <h2>Il portafoglio è passato da ${eur(X.a.value)} a <em>${eur(X.b.value)}</em>.</h2>
      <div class="pz-row">${Number.isFinite(X.dI)?`<div>${big((X.dI>=0?"+":"−")+eur(Math.abs(X.dI)))}<span>${X.dI>=0?"versati nel frattempo":"ritirati nel frattempo"}</span></div>`:""}${Number.isFinite(X.mkt)?`<div>${big((X.mkt>=0?"+":"−")+eur(Math.abs(X.mkt)),X.mkt>=0?"up":"dn")}<span>dai mercati</span></div>`:""}${X.a.xirr!=null&&X.b.xirr!=null&&Number.isFinite(X.b.xirr)?`<div>${big(fmtPct(X.b.xirr,1,true))}<span>rendimento all'anno oggi, era ${fmtPct(X.a.xirr,1,true)}</span></div>`:""}</div>`});}}
  /* 2 · quanto ha reso */
  if(real){const pp=real.pp,t=real.taxes;out.push({id:"real",html:`<span class="pz-k">Quanto hai guadagnato</span>
    <h2>Hai versato ${eur(pp.invested)}.<br>Oggi valgono <em>${eur(pp.value)}</em>.</h2>
    <div class="pz-row">${[[`${pp.gain>=0?"+":"−"}${eur(Math.abs(pp.gain))}`,"guadagno",pp.gain>=0?"up":"dn"],[fmtPct(pp.xirr,1,true),"rendimento all'anno, tenendo conto di quando hai versato",""],t?[fmtPct(t.xirr,1,true),`al netto delle tasse, se vendessi tutto oggi (circa ${eur(t.tax)} di imposte)`,""]:null].filter(Boolean).map(([v,l,c])=>`<div>${big(v,c)}<span>${l}</span></div>`).join("")}</div>
    ${real.bm?`<p class="pz-foot">Con gli stessi versamenti, nelle stesse date, ${esc(real.bm.label)} varrebbe oggi ${eur(real.bm.value)}.</p>`:""}`});}
  /* 3 · dove sono i soldi */
  {const idx=ds.assets.map((a,i)=>i).filter(i=>w[i]>0.0005).sort((a,b)=>w[b]-w[a]),pos=(S.portfolio&&S.portfolio.positions)||[];
    const cls=i=>{const q=pos.find(x=>(x.ticker||x.nome)===ds.assets[i].name);return q&&q.etf&&!q.etf.error?P.etfClass(q.etf):"";};
    const top=idx[0],mx=w[top];
    out.push({id:"where",html:`<span class="pz-k">Dove sono i tuoi soldi</span>
      <h2>${idx.length===1?`Tutto in un solo strumento: <em>${esc(ds.assets[top].name)}</em>.`:mx>=.5?`Più di metà è in <em>${esc(ds.assets[top].name)}</em>.`:`${idx.length} strumenti, il più grande pesa il ${fmtPct(mx,0)}.`}</h2>
      <ul class="pz-bars">${idx.map(i=>`<li><span><b>${esc(ds.assets[i].name)}</b><small>${esc(cls(i))}</small></span><i><em style="width:${w[i]/mx*100}%"></em></i><strong>${fmtPct(w[i],0)}</strong>${value?`<small class="pz-eur">${eur(w[i]*value)}</small>`:""}</li>`).join("")}</ul>`});}
  /* 4 · quanto costa */
  if(C&&C.items.some(x=>x.ter!=null)){const tc=C.ter+C.other;out.push({id:"cost",html:`<span class="pz-k">Quanto ti costa</span>
    <h2>Ogni anno paghi circa <em>${eur(C.year)}</em> di costi.</h2>
    <div class="pz-row"><div>${big(fmtPct(tc,2))}<span>del patrimonio, ogni anno, anche quando il mercato scende</span></div><div>${big(eur(C.d20),"dn")}<span>di capitale in meno in ${CO_Y} anni, per l'effetto composto</span></div>${C.save>100?`<div>${big("+"+eur(C.save),"up")}<span>in ${CO_Y} anni con strumenti che costano ${fmtPct(C.cheap,2)} l'anno</span></div>`:""}</div>
    <p class="pz-foot">Stima con un rendimento lordo del 5% l'anno e senza nuovi versamenti.${C.coverage<.999?` Costo noto per il ${fmtPct(C.coverage,0)} del portafoglio.`:""}</p>`});}
  /* 5 · quanto rischia */
  if(Number.isFinite(PR.mdd)&&PR.troughK!=null){const v0=value||10000;out.push({id:"risk",html:`<span class="pz-k">Quanto può scendere</span>
    <h2>Nel momento peggiore questo portafoglio ha perso il <em>${fmtPct(Math.abs(PR.mdd),0)}</em>.</h2>
    <div class="pz-row"><div>${big("−"+eur(Math.abs(PR.mdd)*v0),"dn")}<span>su ${eur(v0)} di oggi, ${fmtDate(ds.dates[PR.peakAtTrough],f)} – ${fmtDate(ds.dates[PR.troughK],f)}</span></div>
      <div>${big(PR.recK!=null?unitN(PR.recK-PR.troughK,f):"—")}<span>${PR.recK!=null?"per tornare dove era":"non ancora recuperato"}</span></div>
      ${Number.isFinite(PR.var95)?`<div>${big("−"+eur(PR.var95*v0),"dn")}<span>in un mese brutto, uno ogni venti</span></div>`:""}</div>
    <p class="pz-foot">Dati storici dei suoi strumenti, con i pesi di oggi. Il passato non dice cosa succederà, ma mostra quanto si è mosso.</p>`});}
  /* 6 · le crisi vere */
  {const cr=stressList().list.filter(c=>c.status!=="out"&&c.used&&Number.isFinite(c.mdd));if(cr.length){const v0=value||10000,wc=cr.reduce((a,b)=>b.mdd<a.mdd?b:a);
    out.push({id:"crises",html:`<span class="pz-k">Se arriva la tempesta</span>
      <h2>Nelle crisi vere, la peggiore è stata <em>${esc(wc.name)}</em>.</h2>
      <ul class="pz-cr">${cr.map(c=>`<li><span>${esc(c.name)}</span><b class="dn">${fmtPct(c.mdd,0)}</b><small>${eur(c.mdd*v0)}</small></li>`).join("")}</ul>
      <p class="pz-foot">Perdita massima del portafoglio di oggi durante ogni crisi presente nei dati, sul valore di oggi.</p>`});}}
  /* 7 · la proposta */
  if(cmpReady()){const Rc=cmpCalc(),a=Rc.res[0],b=Rc.res[1];if(a&&b&&!a.empty&&!b.empty){const v0=value||10000;
    const terOf=r=>{if(!C)return NaN;let s=0,k=0;ds.assets.forEach((x,i)=>{const it=C.items.find(q=>q.nome===x.name);if(r.wn[i]>0&&it&&it.ter!=null){s+=r.wn[i]*it.ter;k+=r.wn[i];}});return k>.95?s/k+C.other:NaN;};
    const ta=terOf(a),tb=terOf(b);
    const line=(l,x,y,fm,better)=>`<tr><td>${l}</td><td>${fm(x)}</td><td class="${better(y,x)?"pz-win":""}">${fm(y)}</td></tr>`;
    const lo=(y,x)=>y<x-1e-9,hi=(y,x)=>y>x+1e-9,abs=(y,x)=>Math.abs(y)<Math.abs(x)-1e-9;
    const crIds=[...new Set(b.cr.map(c=>c.id))].filter(id=>a.cr.some(c=>c.id===id)).slice(0,2);
    out.push({id:"prop",html:`<span class="pz-k">La proposta</span>
      <h2>${Math.abs(b.st.mdd)<Math.abs(a.st.mdd)?`Nel momento peggiore avrebbe perso <em>${eur(Math.abs(b.st.mdd)*v0)}</em> invece di ${eur(Math.abs(a.st.mdd)*v0)}.`:`Stessi mesi, stesse crisi: il confronto onesto.`}</h2>
      <table class="pz-t"><thead><tr><th></th><th>Oggi</th><th>Proposta</th></tr></thead><tbody>
      ${line("Rendimento all'anno",a.st.cagr,b.st.cagr,x=>fmtPct(x,1,true),hi)}${line("Quanto oscilla in un anno",a.st.vol,b.st.vol,x=>fmtPct(x,1),lo)}${line("Calo peggiore",a.st.mdd,b.st.mdd,x=>fmtPct(x,1),abs)}
      ${crIds.map(id=>{const ca=a.cr.find(c=>c.id===id),cb=b.cr.find(c=>c.id===id);return line(esc(ca.name),ca.mdd,cb.mdd,x=>fmtPct(x,1),abs);}).join("")}
      ${Number.isFinite(ta)&&Number.isFinite(tb)?line("Costo all'anno",ta,tb,x=>fmtPct(x,2),lo):""}</tbody></table>
      ${(()=>{const M=cmpMoves(Rc);return M&&M.sell>1?`<p class="pz-move">Per passarci: vendite per <b>${eur(M.sell)}</b>, acquisti per <b>${eur(M.buy)}</b>${M.tax>1?`, imposte stimate <b>${eur(M.tax)}</b>`:", nessuna imposta stimata"}.</p>`:"";})()}
      <p class="pz-foot">Stessi ${unitN(Rc.ks.length,f)} di dati per entrambi, ribilanciati ai pesi indicati. Non è una previsione: è come sarebbero andati.</p>`});}}
  /* 8 · prossimi passi */
  out.push({id:"next",html:`<span class="pz-k">Prossimi passi</span>
    <h2>Cosa facciamo adesso</h2>
    <div class="pz-ed pz-notes" contenteditable="true" spellcheck="true" data-pz="next" data-ph="Scrivi qui cosa avete deciso: ribilanciare, il prossimo incontro, i documenti da portare…">${esc(PZ.next).replace(/\n/g,"<br>")}</div>
    ${B.studio?`<p class="pz-contact"><b>${esc(B.studio)}</b>${B.contact?` · ${esc(B.contact)}`:""}</p>`:""}
    <p class="pz-foot">Analisi dei dati storici del file, calcolata da Portfolio OS. I rendimenti passati non garantiscono quelli futuri.</p>`});
  return out;
}
function openPresent(){
  PZ.slides=pzSlides();if(!PZ.slides.length)return;
  if(!PZ.client&&S.svSaved)svGet(S.svSaved).then(r=>{if(r&&!PZ.client){PZ.client=r.name;const e=document.querySelector('#present [data-pz="client"]');if(e&&!e.textContent)e.textContent=r.name;}});
  let el=$("#present");if(!el){el=document.createElement("section");el.id="present";el.setAttribute("role","dialog");el.setAttribute("aria-modal","true");el.setAttribute("aria-label","Presentazione al cliente");document.body.appendChild(el);}
  el.innerHTML=`<div class="pz-stage">${PZ.slides.map((s,i)=>`<article class="pz-s pz-${s.id}" data-i="${i}" aria-hidden="true">${s.html}</article>`).join("")}</div>
    <div class="pz-bar"><span class="pz-brand"><span class="mk" aria-hidden="true"><svg viewBox="0 0 18 18" fill="none"><path d="M2 13.5 6.5 8l3.5 3 6-7.5" stroke="#130A24" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Portfolio OS</span>
      <div class="pz-dots">${PZ.slides.map((s,i)=>`<button type="button" data-pzg="${i}" aria-label="Pagina ${i+1}"></button>`).join("")}</div>
      <div class="pz-nav"><button type="button" class="btn sm" data-pzm="-1" aria-label="Pagina precedente">←</button><button type="button" class="btn sm lime" data-pzm="1" aria-label="Pagina successiva">→</button><button type="button" class="btn sm" id="pzClose">Esci</button></div></div>`;
  el.hidden=false;document.body.classList.add("pz-on");PZ.i=0;pzShow(0);trackOnce("feature","presenta",{name:"presenta"});
  try{if(document.documentElement.requestFullscreen&&!document.fullscreenElement)document.documentElement.requestFullscreen().catch(()=>{});}catch{}
}
function pzShow(i){
  const el=$("#present");if(!el)return;PZ.i=Math.max(0,Math.min(PZ.slides.length-1,i));
  el.querySelectorAll(".pz-s").forEach((s,k)=>{s.classList.toggle("on",k===PZ.i);s.classList.toggle("past",k<PZ.i);s.setAttribute("aria-hidden",String(k!==PZ.i));});
  el.querySelectorAll("[data-pzg]").forEach((b,k)=>b.setAttribute("aria-current",String(k===PZ.i)));
  el.querySelector('[data-pzm="-1"]').disabled=PZ.i===0;el.querySelector('[data-pzm="1"]').disabled=PZ.i===PZ.slides.length-1;
}
function closePresent(){const el=$("#present");if(!el||el.hidden)return;el.hidden=true;document.body.classList.remove("pz-on");try{if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});}catch{}}
document.addEventListener("click",e=>{
  if(e.target.closest("#presentBtn")){openPresent();return;}
  const el=$("#present");if(!el||el.hidden||!el.contains(e.target))return;
  if(e.target.closest("#pzClose")){closePresent();return;}
  const g=e.target.closest("[data-pzg]");if(g){pzShow(+g.dataset.pzg);return;}
  const m=e.target.closest("[data-pzm]");if(m){pzShow(PZ.i+ +m.dataset.pzm);return;}
  /* clic sulla pagina (non sui campi da scrivere né sulla barra): avanti */
  if(!e.target.closest(".pz-ed,.pz-bar,a,button,input"))pzShow(PZ.i+1);
});
/* in fase di cattura: la presentazione si prende i tasti prima del resto del sito (frecce delle sezioni, Esc delle ricevute) */
document.addEventListener("keydown",e=>{const el=$("#present");if(!el||el.hidden)return;e.stopImmediatePropagation();
  if(e.target.closest&&e.target.closest(".pz-ed")){if(e.key==="Escape")e.target.blur();return;}
  if(e.key==="Escape"){closePresent();}else if(e.key==="ArrowRight"||e.key===" "||e.key==="PageDown"){e.preventDefault();pzShow(PZ.i+1);}else if(e.key==="ArrowLeft"||e.key==="PageUp"){e.preventDefault();pzShow(PZ.i-1);}else if(e.key==="Home")pzShow(0);else if(e.key==="End")pzShow(PZ.slides.length-1);},true);
document.addEventListener("input",e=>{const k=e.target.dataset&&e.target.dataset.pz;if(!k)return;PZ[k]=e.target.innerText.trim();svKeep();});
document.addEventListener("fullscreenchange",()=>{if(!document.fullscreenElement){/* uscita dal tutto schermo con Esc: la presentazione resta aperta finché non si preme Esci */}});
window.__present={open:openPresent,close:closePresent,show:i=>pzShow(i),slides:()=>PZ.slides.map(s=>s.id)}; // per i test

export { EXPLAIN, PZ, RP_KEY, buildReport, closePresent, closeReceipt, closeReportDlg, cmpReady, eur10, openPresent, openReceipt, openReportDlg, pctOf, plainOf, printReport, pzShow, pzSlides, receipt, reportProposal, rpBrand, rpWho, svgOf };
