/* Portfolio OS · interfaccia · rischio, Monte Carlo, indipendenza finanziaria, stress test e crisi, frontiera, benchmark.
   Parte di app.js divisa in moduli: il codice è lo stesso, cambiano solo import ed export. */
import { $, P, REDUCE, S, color, esc, fmtDate, fmtN, fmtPct } from "./core.js";
import { Morph, current } from "./scene.js";
import { an, trackOnce } from "./importa.js";
import { pfAsset, pfWeights } from "./portafoglio.js";
import { AR } from "./archivio.js";
import { macroFor, niceTicks } from "./laboratorio.js";
import { rebuildHint, renderReal } from "./rendimento.js";
import { chatContext, md } from "./quanta.js";

/* ---------- Analisi del rischio (Modulo 2) ---------- */
const PER={252:"in un giorno",52:"in una settimana",12:"in un mese",4:"in un trimestre",1:"in un anno"};
const UNIT={252:["giorno","giorni"],52:["settimana","settimane"],12:["mese","mesi"],4:["trimestre","trimestri"],1:["anno","anni"]};
const unitN=(n,f)=>`${n} ${(UNIT[f]||["periodo","periodi"])[n===1?0:1]}`;
function wOpts(){return [["equal","Pesi uguali"]].concat(S.portfolio?[["now","Pesi attuali"],["target","Pesi target"]]:[]).concat(S.optW?[["opt","Ottimizzati"]]:[]);}
function riskWeights(){
  const ds=S.ds,k=ds.assets.length;
  if(S.riskW==="opt"&&S.optW&&S.optW.w.length===ds.assets.length)return {w:S.optW.w,label:`pesi ottimizzati (${S.optW.label})`};
  if(S.portfolio&&(S.riskW==="now"||S.riskW==="target")){const w=pfWeights(S.riskW==="target"?"target":"now");if(w)return {w,label:S.riskW==="target"?"pesi target":"pesi attuali"};}
  return {w:ds.assets.map(()=>1/k),label:"pesi uguali"};
}
function renderRisk(){
  const box=$("#riskBox"),empty=$("#riskEmpty");
  if(!S.lab||!S.ds||!S.ds.ok){box.hidden=true;empty.hidden=false;$("#riskW").innerHTML="";return;}
  box.hidden=false;empty.hidden=true;
  if(!S.riskW)S.riskW=S.portfolio?"now":"equal";
  const ds=S.ds,f=ds.freq.f,mm=macroFor(S.rfSrc),rf=mm?mm.rf:0,{w,label}=riskWeights();
  const pa=pfAsset(w,"Portafoglio"),PR=P.riskStats(pa.ret,f,rf),PS=P.stats(pa,f,ds.dates);
  const AR=ds.assets.map(a=>P.riskStats(a.ret,f,rf)),cov=P.covMatrix(ds.assets),RC=P.riskContrib(w,cov.C,f);
  S.risk={w,wLabel:label,pa,PR,PS,AR,cov,RC,rf,mm};
  const opts=wOpts();
  $("#riskW").innerHTML=opts.map(o=>`<button type="button" data-rw="${o[0]}" aria-pressed="${S.riskW===o[0]}">${o[1]}</button>`).join("");
  $("#riskSub").textContent=`Portafoglio con ${label}, ribilanciato ogni periodo, su ${unitN(PR.n||0,f)} di dati confermati.`;
  if(!PR.n||PR.n<6){$("#riskKpis").innerHTML=`<div class="kpi"><span class="eyebrow">Dati insufficienti</span><span class="v txt">Servono almeno 6 periodi comuni a tutti gli asset.</span>${rebuildHint()}</div>`;return;}
  const per=PER[f]||"in un periodo",btn=(key,val)=>`<button type="button" class="v" data-rc="${key}">${val}</button>`;
  $("#riskKpis").innerHTML=[
    ["VaR 95%",btn("rk-var95-p",fmtPct(-PR.var95,1)),`la perdita ${per} superata solo 1 volta su 20`],
    ["CVaR 95%",btn("rk-cvar95-p",fmtPct(-PR.cvar95,1)),`la perdita media in quei casi peggiori`],
    ["Sortino",btn("rk-sortino-p",fmtN(PR.sortino)),`rendimento per unità di rischio al ribasso`],
    ["Drawdown più lungo",btn("rk-ddlen-p",unitN(PR.longest,f)),PR.ongoing?"non ancora recuperato":`sotto il massimo, poi recuperato`]
  ].map(k=>`<div class="kpi"><span class="eyebrow">${k[0]}</span>${k[1]}<span class="sub">${k[2]}</span></div>`).join("");
  drawHist(PR,f);drawContrib();drawUnderwater(PR,f);renderDecomp();renderRiskTable();renderRiskPro();
  if(current==="risk")Morph.shape("risk");
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-rw]");if(!b)return;S.riskW=b.dataset.rw;renderRisk();if(current==="sim")renderSim();if(current==="fire")renderFI();if(current==="stress")renderStress();if(current==="bench")renderBench();});
function drawHist(PR,f){
  const s=PR.sorted,B=28,lo=s[0],hi=s[s.length-1],span=(hi-lo)||1,cnt=new Array(B).fill(0);
  s.forEach(x=>{cnt[Math.min(B-1,Math.floor((x-lo)/span*B))]++;});
  const VW=640,VH=290,ml=34,mr=12,mt=26,mb=30,iw=VW-ml-mr,ih=VH-mt-mb,mx=Math.max(...cnt),X=v=>ml+(v-lo)/span*iw,bw=iw/B;
  let g="";
  for(let t=0;t<=4;t++){const y=mt+ih-ih*t/4;g+=`<line x1="${ml}" x2="${VW-mr}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${ml-6}" y="${y+4}" text-anchor="end">${Math.round(mx*t/4)}</text>`;}
  cnt.forEach((c,b)=>{if(!c)return;const x0=ml+b*bw,top=lo+(b+1)*span/B,h=c/mx*ih,bad=top<=-PR.var95+1e-12;
    g+=`<rect class="grow" style="--k:${b}" x="${(x0+1).toFixed(1)}" y="${(mt+ih-h).toFixed(1)}" width="${(bw-2).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${bad?"var(--bad)":"var(--c2)"}" opacity="${bad?.95:.75}"><title>${c} ${c===1?"periodo":"periodi"} tra ${fmtPct(lo+b*span/B,1)} e ${fmtPct(top,1)}</title></rect>`;});
  const tk=niceTicks(lo,hi,5).filter(v=>v>=lo&&v<=hi);
  tk.forEach(v=>{g+=`<text x="${X(v).toFixed(1)}" y="${VH-8}" text-anchor="middle">${fmtPct(v,0)}</text>`;});
  if(lo<0&&hi>0)g+=`<line x1="${X(0)}" x2="${X(0)}" y1="${mt}" y2="${mt+ih}" stroke="var(--muted)" stroke-dasharray="2 4"/>`;
  const xv=X(-PR.var95),xc=X(-PR.cvar95);
  g+=`<line x1="${xv}" x2="${xv}" y1="${mt-6}" y2="${mt+ih}" stroke="var(--lime)" stroke-width="2" stroke-dasharray="5 4"/><text x="${xv+6}" y="${mt+6}" style="fill:var(--fg);font-weight:600">VaR ${fmtPct(-PR.var95,1)}</text>`;
  g+=`<line x1="${xc}" x2="${xc}" y1="${mt+18}" y2="${mt+ih}" stroke="var(--bad)" stroke-width="2"/><text x="${xc+6}" y="${mt+30}" style="fill:var(--bad);font-weight:600">CVaR ${fmtPct(-PR.cvar95,1)}</text>`;
  $("#riskHist").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Istogramma dei rendimenti di periodo del portafoglio">${g}</svg>`;
  $("#histUnit").textContent=`rendimenti ${S.ds.freq.adj} · ${PR.n} osservazioni`;
  $("#histCap").textContent=`In rosso i ${UNIT[f]?UNIT[f][1]:"periodi"} peggiori: ${PR.tail95}, il 5% del totale. Asimmetria ${fmtN(PR.skew)}, curtosi in eccesso ${fmtN(PR.kurt)}: ${PR.kurt>1?"le perdite estreme sono più frequenti che in una distribuzione normale.":"code vicine a quelle di una distribuzione normale."}`;
}
/* Qualità statistica: quanto sono affidabili i numeri del rischio */
function renderRiskPro(){
  const R=S.risk,PR=R.PR,f=S.ds.freq.f,el=$("#riskPro");if(!el||!PR.n||PR.n<6)return;
  const win={252:250,52:104,12:60,4:20,1:10}[f]||60;R.BT=P.varBacktest(R.pa.ret,win,.05);
  const c=(k,v,cl="")=>`<button type="button" class="cellbtn ${cl}" data-rc="rk-${k}-p">${v}</button>`,bt=R.BT;
  const sig=PR.srLo>0?"positivo con il 95% di confidenza":PR.srHi<0?"negativo con il 95% di confidenza":"non distinguibile da zero con questi dati";
  el.innerHTML=`<div class="head"><div><span class="eyebrow">Portafoglio · ${R.wLabel}</span><h3 style="margin-top:4px">Quanto sono affidabili questi numeri</h3></div><span class="chip hist"><i></i>statistica</span></div>
    <div class="pro-grid">
      <div class="pro"><span class="eyebrow">Sharpe e incertezza</span>
        <div class="pro-v">${c("sr",fmtN(PR.srAnn))}<small>IC 95%: ${fmtN(PR.srLo)} – ${fmtN(PR.srHi)}</small></div>
        <div class="pro-bar" title="Scala da −1 a 3: la riga sottile è lo zero, la barra viola l'intervallo di confidenza, il segno lime lo Sharpe stimato"><i style="left:${Math.max(0,Math.min(100,(PR.srLo+1)/4*100))}%;width:${Math.max(1,Math.min(100,(PR.srHi-PR.srLo)/4*100))}%"></i><b style="left:${Math.max(0,Math.min(100,(PR.srAnn+1)/4*100))}%"></b><em style="left:25%"></em></div>
        <p>Su ${unitN(PR.n,f)} lo Sharpe è <b>${sig}</b>. Probabilità che sia davvero sopra zero: ${c("psr",PR.psr>.999?"> 99,9%":fmtPct(PR.psr,1))}.</p></div>
      <div class="pro"><span class="eyebrow">VaR 95% · tre metodi</span>
        <table class="mt mc-t pro-t"><tbody><tr><td>Storico</td><td>${c("var95",fmtPct(-PR.var95,1),"neg")}</td></tr><tr><td>Normale</td><td>${c("vpar",fmtPct(-PR.varParam95,1),"neg")}</td></tr><tr><td>Cornish-Fisher</td><td>${c("vcf",fmtPct(-PR.varCF95,1),"neg")}</td></tr></tbody></table>
        <p>${PR.varCF95>PR.varParam95*1.1?"Le code sono più spesse di una normale: il metodo normale sottostima la perdita.":"Le tre stime sono vicine: la distribuzione è poco lontana da una normale."}</p></div>
      <div class="pro"><span class="eyebrow">Il VaR ha funzionato? · Kupiec</span>
        ${bt.error?`<p>${esc(bt.error)}</p>`:`<div class="pro-v">${c("bt",`${bt.x} / ${bt.n}`)}<small>superamenti, attesi ${fmtN(bt.expected,1)}</small></div>
        <p class="${bt.ok?"up":"dn"}" style="font-weight:700">${bt.ok?"✓ Modello non rifiutato":"✗ Modello rifiutato"} (p = ${fmtN(bt.p,2)})</p>
        <p>VaR stimato ogni ${UNIT[f]?UNIT[f][0]:"periodo"} sui ${unitN(win,f)} precedenti e confrontato con la perdita successiva, fuori campione.</p>`}</div>
      <div class="pro"><span class="eyebrow">Drawdown in profondità</span>
        <table class="mt mc-t pro-t"><tbody><tr><td>Ulcer index</td><td>${c("ulcer",fmtPct(PR.ulcer,1))}</td></tr><tr><td>Tempo sott'acqua</td><td>${c("uw",fmtPct(PR.underwater,0))}</td></tr><tr><td>Calo medio</td><td>${c("uw",fmtPct(PR.avgDD,1),"neg")}</td></tr><tr><td>Omega</td><td>${c("omega",fmtN(PR.omega))}</td></tr></tbody></table></div>
    </div>`;
}
function drawContrib(){
  const R=S.risk,ds=S.ds,maxv=Math.max(...R.w,...R.RC.pct.map(x=>Math.abs(x)),.01);
  const rows=ds.assets.map((a,i)=>R.w[i]>0?`<div class="cbar"><span class="nm">${esc(a.name)}</span><div class="bars">
    <div class="b w"><i data-w="${(R.w[i]/maxv*100).toFixed(1)}"></i><button type="button" data-rc="rk-rc-${i}" tabindex="-1">${fmtPct(R.w[i],0)}</button></div>
    <div class="b r${R.RC.pct[i]<0?" neg":""}"><i data-w="${(Math.abs(R.RC.pct[i])/maxv*100).toFixed(1)}"></i><button type="button" data-rc="rk-rc-${i}">${fmtPct(R.RC.pct[i],0)}</button></div></div></div>`:"").join("");
  $("#riskContrib").innerHTML=`<div class="leg2"><span><i style="background:var(--c2)"></i>peso nel portafoglio</span><span><i style="background:var(--lime)"></i>quota del rischio</span></div>${rows}`;
  requestAnimationFrame(()=>requestAnimationFrame(()=>document.querySelectorAll("#riskContrib i[data-w]").forEach(el=>{el.style.width=el.dataset.w+"%";})));
  $("#riskConc").innerHTML=`<div class="conc">
    <button type="button" data-rc="rk-volp-p"><b>${fmtPct(R.RC.volP,1)}</b><span>volatilità del portafoglio</span></button>
    <button type="button" data-rc="rk-neff-p"><b>${fmtN(R.RC.neff,1)}</b><span>asset effettivi su ${ds.assets.length}</span></button>
    <button type="button" data-rc="rk-div-p"><b>${fmtN(R.RC.divRatio)}×</b><span>rapporto di diversificazione</span></button></div>`;
}
function drawUnderwater(PR,f){
  const ds=S.ds,n=ds.dates.length,dd=PR.dd,VW=900,VH=230,ml=50,mr=14,mt=14,mb=28,iw=VW-ml-mr,ih=VH-mt-mb;
  const lo=Math.min(-.01,PR.mdd*1.12),X=i=>ml+(n>1?i/(n-1):0)*iw,Y=v=>mt+(v/lo)*ih;
  let g="";niceTicks(lo,0,4).filter(v=>v>=lo&&v<=0).forEach(v=>{g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)"/><text x="${ml-8}" y="${(Y(v)+4).toFixed(1)}" text-anchor="end">${fmtPct(v,0)}</text>`;});
  const stepY=ds.years>24?5:ds.years>12?3:ds.years>6?2:1;
  ds.dates.forEach((d,i)=>{const y=d.getUTCFullYear();if(y%stepY===0&&(i===0||ds.dates[i-1].getUTCFullYear()!==y)){const x=X(i);if(x>ml+12&&x<VW-mr-12)g+=`<text x="${x.toFixed(1)}" y="${VH-8}" text-anchor="middle">${y}</text>`;}});
  let line="",fi=-1,li=-1;dd.forEach((v,i)=>{if(Number.isFinite(v)){line+=(fi<0?"M":"L")+X(i).toFixed(1)+","+Y(v).toFixed(1);if(fi<0)fi=i;li=i;}});
  if(fi>=0){
    g+=`<path d="${line}L${X(li).toFixed(1)},${Y(0).toFixed(1)}L${X(fi).toFixed(1)},${Y(0).toFixed(1)}Z" fill="var(--bad)" opacity=".22" class="area"/>`;
    g+=`<path d="${line}" fill="none" stroke="var(--bad)" stroke-width="1.8" pathLength="1" class="draw" style="--k:0"/>`;
    if(PR.troughK!=null){const x=X(PR.troughK),y=Y(PR.mdd);g+=`<circle cx="${x}" cy="${y}" r="5" fill="var(--bad)"/><text x="${x+8}" y="${y+4}" style="fill:var(--fg);font-weight:600">${fmtPct(PR.mdd,1)} · ${fmtDate(ds.dates[PR.troughK],f)}</text>`;}
  }
  g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--muted)"/>`;
  $("#riskDD").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Drawdown del portafoglio nel tempo">${g}</svg>`;
  $("#ddCap").textContent=PR.troughK!=null?`Calo peggiore: inizio ${fmtDate(ds.dates[PR.peakAtTrough],f)}, punto più basso ${fmtDate(ds.dates[PR.troughK],f)}, ${PR.recK!=null?`recuperato ${fmtDate(ds.dates[PR.recK],f)}.`:"non ancora recuperato."}`:"Nessun calo dal massimo nel periodo.";
  ddWhyBox(PR,f);
}
/* Il calo peggiore raccontato dall'IA: il contesto di mercato di quel periodo, senza numeri inventati
   e senza attribuire il calo a una sola causa. Il testo resta in memoria per lo stesso periodo. */
function ddWhyBox(PR,f){
  const el=$("#ddWhy");if(!el)return;const ds=S.ds;
  if(PR.troughK==null||PR.mdd>-.03){el.innerHTML="";return;}
  const from=fmtDate(ds.dates[PR.peakAtTrough],f),to=fmtDate(ds.dates[PR.troughK],f),key=from+"|"+to+"|"+ds.assets.map(a=>a.name).join(",");
  const c=(S.ddWhy=S.ddWhy||{})[key];
  el.innerHTML=c&&c.text?`<div class="dd-ai"><span class="eyebrow">Cosa stava succedendo · ${esc(from)} – ${esc(to)}</span>${md(c.text)}<small>Contesto scritto dall'IA di Quanta: non è un calcolo e non dice che il calo sia dovuto a una sola causa. Verifica sempre le fonti.</small></div>`
    :c&&c.busy?`<div class="dd-ai"><span class="eyebrow">Cosa stava succedendo · ${esc(from)} – ${esc(to)}</span><p class="typing" aria-label="Quanta sta scrivendo"><i></i><i></i><i></i></p></div>`
    :`<button type="button" class="btn sm" id="ddWhyBtn" data-k="${esc(key)}">Cosa stava succedendo sui mercati? <span class="ai-tag">IA</span></button>${c&&c.err?`<span class="caption" style="margin-left:10px">${esc(c.err)}</span>`:""}`;
}
document.addEventListener("click",async e=>{const b=e.target.closest("#ddWhyBtn");if(!b||!S.risk)return;
  const PR=S.risk.PR,ds=S.ds,f=ds.freq.f,key=b.dataset.k,from=fmtDate(ds.dates[PR.peakAtTrough],f),to=fmtDate(ds.dates[PR.troughK],f);
  trackOnce("feature","calo_ia",{name:"calo_ia"});S.ddWhy[key]={busy:true};ddWhyBox(PR,f);
  const q=`Il mio portafoglio (${ds.assets.map(a=>a.name).join(", ")}) ha avuto il calo peggiore da ${from} a ${to}, con una perdita massima di ${fmtPct(PR.mdd,1)}. In 3-5 frasi, senza chiamare strumenti e senza scrivere altri numeri, descrivi il contesto di mercato e macroeconomico di quel periodo (eventi, politiche monetarie, tensioni commerciali o geopolitiche) che può aver influito su questi strumenti. Non attribuire il calo a un solo evento e non dare consigli. Se il periodo è recente e non sei sicuro dei fatti, dillo.`;
  try{const r=await fetch("/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:[{role:"user",text:q}],context:chatContext()}),signal:AbortSignal.timeout(55000)});
    const j=await r.json().catch(()=>({}));if(!r.ok||!j.text)throw new Error(j.error||"risposta vuota");S.ddWhy[key]={text:j.text};}
  catch(err){S.ddWhy[key]={err:err instanceof TypeError?"Il commento dell'IA funziona nel sito pubblicato.":"L'IA non ha risposto: riprova tra poco."};}
  if(S.risk)ddWhyBox(S.risk.PR,S.ds.freq.f);});
/* scomposizione del rischio: quanto pesa, quanto rischia da solo, quanto aggiunge al portafoglio */
function renderDecomp(){
  const R=S.risk,ds=S.ds,RC=R.RC,el=$("#riskDecomp");if(!el)return;
  const idx=ds.assets.map((a,i)=>i).filter(i=>R.w[i]>0);
  const c=(k,i,v,cl="")=>`<button type="button" class="cellbtn ${cl}" data-rc="rk-${k}-${i}">${v}</button>`;
  const ratio=i=>R.w[i]>0?RC.pct[i]/R.w[i]:NaN,sumWS=idx.reduce((s,i)=>s+R.w[i]*RC.sig[i],0),save=sumWS-RC.volP;
  el.innerHTML=`<thead><tr><th>Asset</th><th>Peso</th><th>Volatilità da solo</th><th>Contributo marginale</th><th>Contributo al rischio</th><th>Quota del rischio</th><th>Rischio / peso</th></tr></thead><tbody>
    ${idx.map(i=>{const r=ratio(i);return `<tr><td><span class="an"><i style="background:${color(i)}"></i>${esc(ds.assets[i].name)}</span></td><td class="mono">${fmtPct(R.w[i],1)}</td><td>${c("rc",i,fmtPct(RC.sig[i],1))}</td><td>${c("mcr",i,fmtPct(RC.mcr[i],1),RC.mcr[i]<0?"neg":"")}</td><td>${c("ccr",i,fmtN(RC.ccr[i]*100,2)+" pt",RC.ccr[i]<0?"neg":"")}</td><td>${c("rc",i,fmtPct(RC.pct[i],1),RC.pct[i]<0?"neg":"")}</td><td class="mono ${r>1.15?"neg":r<.85?"up":""}">${Number.isFinite(r)?fmtN(r,2)+"×":"—"}</td></tr>`;}).join("")}
    <tr class="pf"><td><b>Portafoglio</b></td><td class="mono">100%</td><td class="mono">${fmtPct(sumWS,1)}<span class="cl" style="display:block">media ponderata</span></td><td class="mono">—</td><td>${c("volp","p",fmtN(RC.volP*100,2)+" pt")}</td><td class="mono">100%</td><td class="mono">1,00×</td></tr></tbody>`;
  const hi=idx.filter(i=>ratio(i)>1.15).sort((a,b)=>ratio(b)-ratio(a)),neg=idx.filter(i=>RC.pct[i]<0);
  $("#riskDecompCap").innerHTML=`La somma dei contributi è la volatilità del portafoglio (${fmtPct(RC.volP,1)}). Se ogni asset si muovesse sempre insieme agli altri sarebbe ${fmtPct(sumWS,1)}: la diversificazione toglie <b>${fmtN(save*100,1)} punti</b> di volatilità.`+
    (hi.length?` ${hi.map(i=>`<b>${esc(ds.assets[i].name)}</b>`).join(", ")} ${hi.length===1?"porta":"portano"} più rischio di quanto ${hi.length===1?"pesa":"pesano"} (rischio / peso sopra 1).`:"")+
    (neg.length?` ${neg.map(i=>`<b>${esc(ds.assets[i].name)}</b>`).join(", ")} ${neg.length===1?"riduce":"riducono"} il rischio totale: contributo negativo, perché ${neg.length===1?"tende":"tendono"} a muoversi in senso opposto al resto.`:"")+
    ` Il contributo marginale è la sensibilità della volatilità al peso dell'asset; nella ricevuta trovi l'effetto di spostare 1 punto su quell'asset togliendolo dagli altri in proporzione.`;
}
function renderRiskTable(){
  const R=S.risk,ds=S.ds,f=ds.freq.f,cell=(k,v,c="")=>`<button type="button" class="cellbtn ${c}" data-rc="${k}">${v}</button>`;
  const row=(name,st,base,id,cls,sw,sub)=>{if(!st.n||st.n<6)return `<tr><td>${name}</td><td colspan="9" style="text-align:left;color:var(--muted)">Dati insufficienti</td></tr>`;
    const cal=base.cagr/Math.abs(base.mdd);
    return `<tr class="${cls}"><td><span class="an">${sw}${name}</span>${sub||""}</td><td>${cell(`rk-var95-${id}`,fmtPct(-st.var95,1),"neg")}</td><td>${cell(`rk-cvar95-${id}`,fmtPct(-st.cvar95,1),"neg")}</td><td>${cell(`rk-sortino-${id}`,fmtN(st.sortino))}</td><td>${cell(`rk-calmar-${id}`,fmtN(cal))}</td><td>${cell(`rk-pos-${id}`,fmtPct(st.pctPos,0))}</td><td>${cell(`rk-w12-${id}`,fmtPct(st.worst12,1),st.worst12<0?"neg":"")}</td><td>${cell(`rk-skew-${id}`,fmtN(st.skew))}</td><td>${cell(`rk-kurt-${id}`,fmtN(st.kurt))}</td><td>${cell(`rk-ddlen-${id}`,unitN(st.longest,f))}</td></tr>`;};
  const w12=UNIT[f]?`Peggiori ${unitN(Math.round(f),f)}`:"Peggiore anno";
  $("#riskTable").innerHTML=`<thead><tr><th>Asset</th><th>VaR 95%</th><th>CVaR 95%</th><th>Sortino</th><th>Calmar</th><th>Periodi positivi</th><th>${w12}</th><th>Asimmetria</th><th>Curtosi</th><th>Drawdown più lungo</th></tr></thead><tbody>
    ${row("Portafoglio",R.PR,R.PS,"p","pf",`<i style="background:var(--lime)"></i>`)}
    ${ds.assets.map((a,i)=>{const k0=a.ret.findIndex(Number.isFinite),st=R.AR[i];/* ogni asset usa tutto il suo storico: lo dico quando è diverso da quello del portafoglio */
      const sub=st.n&&st.n!==R.PR.n&&k0>=0?`<span class="cl" style="display:block">${unitN(st.n,f)}, da ${fmtDate(ds.dates[k0],f)}</span>`:"";
      return row(esc(a.name),st,S.lab.st[i],i,"",`<i style="background:${color(i)}"></i>`,sub);}).join("")}</tbody>`;
  const cap=$("#riskTableCap");if(cap)cap.textContent=`Misure storiche: descrivono il passato e non prevedono le perdite future. VaR e CVaR al 95% sui rendimenti di periodo, senza ipotesi di distribuzione normale. Il portafoglio usa i ${unitN(R.PR.n,f)} in cui ci sono tutti gli asset; ogni asset usa tutto il suo storico${ds.assets.some((a,i)=>R.AR[i].n&&R.AR[i].n!==R.PR.n)?", indicato sotto il nome: le crisi più vecchie (per esempio il 2008) pesano solo sugli asset che le hanno vissute":""}.`;
}
function riskReceipt(m,who){
  const R=S.risk,ds=S.ds,f=ds.freq.f,isP=who==="p",i=+who,st=isP?R.PR:R.AR[i],base=isP?R.PS:S.lab.st[i],name=isP?"Portafoglio":ds.assets[i].name,per=PER[f]||"in un periodo";
  const src=isP?"rₚ = Σ wᵢ · rᵢ   (ribilanciamento a ogni periodo)\n":"";
  const M={
    var95:{t:"VaR storico 95%",v:fmtPct(-st.var95,2),fx:"VaR₉₅ = − quantile al 5% dei rendimenti di periodo\n(interpolazione lineare tra i valori ordinati, nessuna ipotesi di normalità)",kv:[["Significato",`perdita ${per} superata solo nel 5% dei casi`],["Periodi oltre la soglia",st.tail95]]},
    cvar95:{t:"CVaR storico 95% (Expected Shortfall)",v:fmtPct(-st.cvar95,2),fx:"CVaR₉₅ = − media dei rendimenti ≤ quantile al 5%",kv:[["Significato","perdita media nei periodi peggiori"],["Periodi nella coda",st.tail95],["Soglia VaR",fmtPct(-st.var95,2)]]},
    sortino:{t:"Indice di Sortino",v:fmtN(st.sortino),fx:"Sortino = (r̄ · f − rf) / DD\nDD = √( Σ min(0, rᵢ − rf/f)² / n ) · √f",kv:[["Rendimento medio annualizzato",fmtPct(st.mean*f,2)],["Deviazione al ribasso",fmtPct(st.downDev,2)],["Tasso privo di rischio",R.mm?`${fmtPct(R.rf,2)} · ${R.mm.rfName}`:"0%"]]},
    calmar:{t:"Indice di Calmar",v:fmtN(base.cagr/Math.abs(base.mdd)),fx:"Calmar = CAGR / |Max drawdown|",kv:[["CAGR",fmtPct(base.cagr,2,true)],["Max drawdown",fmtPct(base.mdd,2)]]},
    pos:{t:"Periodi positivi",v:fmtPct(st.pctPos,1),fx:"quota dei periodi con rendimento maggiore di zero",kv:[]},
    w12:{t:"Peggiore finestra di un anno",v:fmtPct(st.worst12,2),fx:`Π (1 + rᵢ) − 1 su finestre mobili di ${unitN(st.win,f)}`,kv:[["Finestra che termina",st.worst12K!=null?fmtDate(ds.dates[st.worst12K],f):"—"],["Migliore finestra",st.best12K!=null?`${fmtPct(st.best12,2,true)} · ${fmtDate(ds.dates[st.best12K],f)}`:"—"]]},
    skew:{t:"Asimmetria",v:fmtN(st.skew),fx:"γ = m₃ / m₂^1,5   (momenti centrali dei rendimenti)\nnegativa = cadute estreme più frequenti dei rialzi estremi",kv:[]},
    kurt:{t:"Curtosi in eccesso",v:fmtN(st.kurt),fx:"κ = m₄ / m₂² − 3\npositiva = code più spesse di una distribuzione normale",kv:[]},
    ddlen:{t:"Drawdown più lungo",v:unitN(st.longest,f),fx:"periodi tra un massimo e il ritorno a quel livello",kv:[["Inizio",st.lStart!=null?fmtDate(ds.dates[st.lStart],f):"—"],["Fine",st.ongoing?"non ancora recuperato":st.lEnd!=null?fmtDate(ds.dates[st.lEnd],f):"—"]]},
    rc:{t:"Contributo al rischio",v:fmtPct(R.RC.pct[i],1),fx:"RCᵢ = wᵢ · (Σw)ᵢ / σₚ   (la somma dei contributi è σₚ)\nquota = RCᵢ / σₚ",kv:[["Peso nel portafoglio",fmtPct(R.w[i],1)],["Volatilità dell'asset",fmtPct(R.RC.sig[i],2)],["Volatilità del portafoglio",fmtPct(R.RC.volP,2)],["Periodi comuni usati",R.cov.common]]},
    mcr:{t:"Contributo marginale al rischio",v:fmtPct(R.RC.mcr[i],2),fx:"MCRᵢ = ∂σₚ / ∂wᵢ = (Σw)ᵢ / σₚ = ρᵢ,ₚ · σᵢ   (annualizzato con √f)\nspostamento di 1 punto dagli altri asset in proporzione: Δσₚ ≈ (MCRᵢ − σₚ) / (1 − wᵢ) × 0,01",kv:[["Peso",fmtPct(R.w[i],1)],["Volatilità dell'asset",fmtPct(R.RC.sig[i],2)],["Volatilità del portafoglio",fmtPct(R.RC.volP,2)],["Correlazione con il portafoglio (MCR / σᵢ)",fmtN(R.RC.sig[i]>0&&R.RC.volP>0?R.RC.mcr[i]/R.RC.sig[i]:NaN,2)],["Spostando +1 punto su questo asset dagli altri in proporzione",R.w[i]<1?`${R.RC.mcr[i]>=R.RC.volP?"+":"−"}${fmtN(Math.abs((R.RC.mcr[i]-R.RC.volP)/(1-R.w[i])),3)} pt di volatilità`:"—"],["Periodi comuni usati",R.cov.common]]},
    ccr:{t:"Contributo al rischio (punti di volatilità)",v:fmtN(R.RC.ccr[i]*100,2)+" pt",fx:"CCRᵢ = wᵢ · MCRᵢ\nΣ CCRᵢ = σₚ   (scomposizione di Euler: i contributi si sommano esattamente)",kv:[["Peso",fmtPct(R.w[i],1)],["Contributo marginale",fmtPct(R.RC.mcr[i],2)],["Quota del rischio",fmtPct(R.RC.pct[i],1)],["Volatilità del portafoglio",fmtPct(R.RC.volP,2)]]},
    volp:{t:"Volatilità del portafoglio",v:fmtPct(R.RC.volP,2),fx:"σₚ = √( wᵀ Σ w ) · √f\nΣ = matrice di covarianza sui periodi comuni",kv:[["Periodi comuni usati",R.cov.common]]},
    neff:{t:"Asset effettivi",v:fmtN(R.RC.neff,2),fx:"N_eff = 1 / Σ wᵢ²   (inverso dell'indice di Herfindahl)",kv:[["Indice di Herfindahl",fmtN(R.RC.hhi,3)],["Asset nel file",ds.assets.length]]},
    div:{t:"Rapporto di diversificazione",v:fmtN(R.RC.divRatio),fx:"DR = Σ wᵢ σᵢ / σₚ\n1 = nessun beneficio; più è alto, più la diversificazione riduce il rischio",kv:[["Volatilità del portafoglio",fmtPct(R.RC.volP,2)]]},
    sr:{t:"Sharpe con intervallo di confidenza",v:`${fmtN(st.srAnn)} (${fmtN(st.srLo)} – ${fmtN(st.srHi)})`,fx:"SR = (r̄ − rf/f) / s · √f\nVar(SR) = [1 + SR²/2 − γ₃·SR + (γ₄/4)·SR²] / (n − 1)   (Mertens 2002, SR di periodo)\nIC 95% = SR ± 1,96 · √Var · √f",kv:[["Errore standard (annuo)",fmtN(st.srSE,3)],["Asimmetria γ₃",fmtN(st.skew)],["Curtosi in eccesso γ₄",fmtN(st.kurt)],["Osservazioni",st.n]]},
    psr:{t:"Probabilistic Sharpe Ratio",v:fmtPct(st.psr,1),fx:"PSR = Φ( SR / σ(SR) )   (Bailey e López de Prado 2012)\nprobabilità che lo Sharpe vero sia maggiore di zero, tenendo conto di campione, asimmetria e code",kv:[["Sharpe annuo",fmtN(st.srAnn)],["Errore standard",fmtN(st.srSE,3)]]},
    vpar:{t:"VaR 95% parametrico (normale)",v:fmtPct(-st.varParam95,2),fx:"VaR = −(μ − 1,645 · σ)\nipotizza rendimenti a campana",kv:[["Media di periodo",fmtPct(st.mean,3)],["Deviazione standard",fmtPct(st.sd,3)]]},
    vcf:{t:"VaR 95% Cornish-Fisher",v:fmtPct(-st.varCF95,2),fx:"z_CF = z + (z² − 1)γ₃/6 + (z³ − 3z)γ₄/24 − (2z³ − 5z)γ₃²/36,  z = −1,645\nVaR = −(μ + z_CF · σ)   corregge la normale per asimmetria e code spesse",kv:[["z corretto",fmtN(st.zcf,3)],["Asimmetria γ₃",fmtN(st.skew)],["Curtosi in eccesso γ₄",fmtN(st.kurt)]]},
    bt:{t:"Backtest del VaR (test di Kupiec)",v:R.BT&&!R.BT.error?`${R.BT.x} superamenti su ${R.BT.n}`:"—",fx:"ogni periodo: VaR storico 95% stimato sui periodi precedenti (finestra mobile), poi confronto con la perdita reale\nLR = −2 ln[ (1−p)^(n−x) p^x ] + 2 ln[ (1−x/n)^(n−x) (x/n)^x ] ~ χ²(1)",kv:R.BT&&!R.BT.error?[["Attesi (5%)",fmtN(R.BT.expected,1)],["Frequenza osservata",fmtPct(R.BT.rate,1)],["Finestra di stima",unitN(R.BT.win,f)],["LR",fmtN(R.BT.lr,3)],["p-value",fmtN(R.BT.p,3)],["Esito",R.BT.ok?"il modello non è rifiutato al 5%":"rifiutato: il VaR storico sbaglia la frequenza delle perdite"]]:[["Nota",R.BT?R.BT.error:"—"]]},
    ulcer:{t:"Ulcer index",v:fmtPct(st.ulcer,2),fx:"UI = √( media(DDₜ²) )   (Martin 1987)\npesa di più i cali profondi e lunghi",kv:[["Pain index (calo medio, tutti i periodi)",fmtPct(st.pain,2)]]},
    uw:{t:"Tempo sott'acqua",v:fmtPct(st.underwater,0),fx:"quota dei periodi sotto il massimo precedente",kv:[["Calo medio quando sott'acqua",fmtPct(st.avgDD,2)],["Drawdown più lungo",unitN(st.longest,f)]]},
    omega:{t:"Omega ratio",v:fmtN(st.omega),fx:"Ω = Σ max(rᵢ − τ, 0) / Σ max(τ − rᵢ, 0),   τ = rf / f\nconfronta tutti i guadagni con tutte le perdite, senza ipotesi di normalità",kv:[["Soglia τ di periodo",fmtPct(st.mar,3)]]}
  }[m]||{t:m,v:"—",fx:"",kv:[]};
  const who2=m==="rc"?ds.assets[i].name:name;
  return {title:`${M.t} · ${who2}`,value:M.v,formula:src+M.fx,kv:[...M.kv,["Osservazioni",st.n],["Frequenza",`${ds.freq.label} · f = ${f}`],["Pesi del portafoglio",R.wLabel]]};
}

/* ---------- Simulazioni Monte Carlo (Modulo 3) ---------- */
const fmtEur=v=>Number.isFinite(v)?Math.round(v).toLocaleString("it-IT",{useGrouping:"always"})+" €":"—";
const fmtK=v=>!Number.isFinite(v)?"—":Math.abs(v)>=1e6?fmtN(v/1e6,1)+" mln":Math.abs(v)>=1e4?fmtN(v/1e3,0)+"k":fmtN(v,0);
const MC_M={boot:"Storico",block:"A blocchi",normal:"Normale"};
function simDefaults(){
  const mm=macroFor(S.rfSrc),pfv=S.portfolio?S.portfolio.positions.reduce((s,p)=>s+(p.valore||0),0):0,init=pfv>0?Math.round(pfv):10000,monthly=200,years=20;
  return {init,monthly,years,goal:Math.max(1000,Math.round((init+monthly*12*years)*1.5/10000)*10000),infl:mm?+(mm.infl*100).toFixed(2):2,inflSrc:mm?`media ${mm.cpiName}`:"ipotesi: nessun dato macro",costs:.2,method:"boot",n:2000,real:false};
}
function simInputs(){
  const I=S.mcIn,num=(id,d)=>{const v=parseFloat($(id).value);return Number.isFinite(v)?v:d;};
  I.init=Math.max(0,num("#mcInit",I.init));I.monthly=num("#mcMonthly",I.monthly);I.years=Math.max(1,Math.min(60,Math.round(num("#mcYears",I.years))));
  I.goal=Math.max(0,num("#mcGoal",I.goal));I.infl=Math.max(-5,Math.min(30,num("#mcInfl",I.infl)));I.costs=Math.max(0,Math.min(20,num("#mcCosts",I.costs)));
  const rv=parseFloat(String($("#mcRate").value).replace(",","."));I.rate=Number.isFinite(rv)?Math.max(-20,Math.min(30,rv)):null; // null = rendimento storico
}
function fillSimForm(){
  const I=S.mcIn;$("#mcInit").value=I.init;$("#mcMonthly").value=I.monthly;$("#mcYears").value=I.years;$("#mcGoal").value=I.goal;$("#mcInfl").value=I.infl;$("#mcCosts").value=I.costs;$("#mcInflSrc").textContent=I.inflSrc;$("#mcRate").value=I.rate!=null?I.rate:"";
}
function runSim(){
  const ds=S.ds,f=ds.freq.f,I=S.mcIn,{w,label}=riskWeights(),pa=pfAsset(w,"Portafoglio"),steps=I.years*f;
  const n=Math.max(200,Math.min(I.n,Math.floor(8e6/steps)));
  /* rendimento usato: quello storico del portafoglio, oppure quello scritto dall'utente.
     Nel secondo caso ogni rendimento storico è scalato, (1 + r)·k − 1, così la media composta diventa quella scelta e le oscillazioni restano quelle vere. */
  const fin=pa.ret.filter(Number.isFinite),gH=fin.length?Math.exp(fin.reduce((a,x)=>a+Math.log(1+x),0)/fin.length):1,histAnn=Math.pow(gH,f)-1;
  let ret=pa.ret;if(I.rate!=null&&fin.length){const k=Math.pow(1+I.rate/100,1/f)/gH;ret=pa.ret.map(x=>Number.isFinite(x)?(1+x)*k-1:x);}
  $("#mcRateSrc").textContent=I.rate!=null?`storico: ${fmtPct(histAnn,1,true)} l'anno · uso il tuo ${fmtPct(I.rate/100,1,true)}`:`uso lo storico: ${fmtPct(histAnn,1,true)} l'anno (${fin.length} ${ds.freq.adj==="mensili"?"mesi":"periodi"})`;
  const R=P.monteCarlo({ret,f,years:I.years,initial:I.init,monthly:I.monthly,goal:I.goal,infl:I.infl/100,costs:I.costs/100,method:I.method,n,block:f,seed:20260101});
  R.wLabel=label;R.w=w;R.nAsked=I.n;R.histAnn=histAnn;R.rate=I.rate;R.nHist=fin.length;R.histFrom=pa.ret.findIndex(Number.isFinite);
  S.mc=R;return R;
}
/* ================= Indipendenza finanziaria (FIRE) =================
   Un calcolatore: i dati a sinistra (cursori), le risposte a destra, aggiornate mentre si muovono i valori.
   Tutta la vita mese per mese, in euro di oggi, sugli stessi futuri ricampionati dai rendimenti del portafoglio (P.firePaths). */
const FI_KEY="pos-fire-v1",FI_F=["fiAge","fiEnd","fiCap","fiSave","fiSpend","fiPen","fiPenAge","fiGoalAge"],FI_K={fiAge:"age",fiEnd:"end",fiCap:"cap",fiSave:"save",fiSpend:"spend",fiPen:"pen",fiPenAge:"penAge",fiGoalAge:"goal"};
function fiDefaults(){
  const pfv=S.portfolio?S.portfolio.positions.reduce((a,p)=>a+(p.valore||0),0):0,I=S.mcIn||simDefaults();
  let saved={};try{saved=JSON.parse(localStorage.getItem(FI_KEY)||"{}")||{};}catch{}
  const d={age:35,end:90,save:500,spend:2000,pen:0,penAge:67,target:.9,goal:55,...saved,cap:pfv>0?Math.round(pfv):(I.init||10000)};
  d.goal=Math.max(d.age+1,Math.min(d.end-1,d.goal));return d;
}
function fiFill(){const F=S.fi.in;FI_F.forEach(id=>{const v=F[FI_K[id]],r=$("#"+id),nn=$("#"+id+"N");if(r)r.value=v;if(nn)nn.value=Math.round(v);});
  const g=$("#fiGoalAge");if(g){g.min=F.age+1;g.max=F.end-1;}
  document.querySelectorAll("#fiTarget [data-fit]").forEach(b=>b.setAttribute("aria-pressed",String(Math.abs(+b.dataset.fit-F.target)<1e-9)));
  /* riempimento colorato dei cursori fino al valore */
  document.querySelectorAll("#fiBox input[type=range]").forEach(r=>r.style.setProperty("--p",((r.value-r.min)/((r.max-r.min)||1)*100).toFixed(1)+"%"));}
function fiSet(id,v){
  const F=S.fi.in,k=FI_K[id];if(!k||!Number.isFinite(v))return;
  const lim={age:[18,75],end:[70,105],cap:[0,1e9],save:[0,1e6],spend:[100,1e6],pen:[0,1e5],penAge:[57,72],goal:[19,104]}[k];
  F[k]=Math.max(lim[0],Math.min(lim[1],k==="age"||k==="end"||k==="penAge"||k==="goal"?Math.round(v):v));
  if(F.end<F.age+6)F.end=F.age+6;F.goal=Math.max(F.age+1,Math.min(F.end-1,F.goal));
  try{const {cap,...keep}=F;localStorage.setItem(FI_KEY,JSON.stringify(keep));}catch{}
}
let fiT=0;
function renderFI(){
  const box=$("#fiBox"),empty=$("#fiEmpty");
  if(!S.lab||!S.ds||!S.ds.ok){box.hidden=true;empty.hidden=false;$("#fiW").innerHTML="";return;}
  box.hidden=false;empty.hidden=true;if(!S.riskW)S.riskW=S.portfolio?"now":"equal";
  if(!S.mcIn)S.mcIn=simDefaults();
  if(!S.fi)S.fi={in:fiDefaults()};
  fiFill();
  $("#fiW").innerHTML=wOpts().map(o=>`<button type="button" data-rw="${o[0]}" aria-pressed="${S.riskW===o[0]}">${o[1]}</button>`).join("");
  fiCompute();
}
function fiBase(){
  const F=S.fi.in,I=S.mcIn,{w,label}=riskWeights(),key=w.map(x=>x.toFixed(4)).join();
  if(!S.fi.ret||S.fi.retKey!==key){S.fi.ret=pfAsset(w,"Portafoglio").ret;S.fi.retKey=key;} // stesso array = stessi futuri in memoria
  return {label,base:{ret:S.fi.ret,age:F.age,endAge:F.end,initial:F.cap,save:F.save,spend:F.spend,pension:F.pen,pensionAge:F.penAge,infl:I.infl/100,costs:I.costs/100,target:F.target,method:I.method,block:12,n:600}};
}
function fiCompute(){
  const F={...S.fi.in},I=S.mcIn,{label,base}=fiBase();
  const A=P.fireAge(base);if(A.error){$("#fiHero").innerHTML=`<div class="fi-wait">${esc(A.error)}</div>`;return;}
  const R=A.age!=null?A.age:F.end-1,life=P.fireLife({...base,retireAge:R,keepPaths:true});
  const years=Math.max(5,F.end-Math.max(R,F.age)),sw=P.fireSwr({...base,years});
  const goal=P.fireSaveFor({...base,retireAge:F.goal}),goalNow=P.fireLife({...base,retireAge:F.goal});
  S.fi.res={A,life,sw,goal,goalNow,F,label,nHist:base.ret.filter(Number.isFinite).length,infl:I.infl,costs:I.costs};
  fiHero();fiKpis();fiGoal();fiLifeChart();fiCurve();fiNotes();
  {const m=$("#fiMini");if(m)m.innerHTML=A.already?"Sei già indipendente":A.age==null?`Non prima dei ${F.end} anni`:`Smetti a <b>${A.age} anni</b> · nel ${fiYearOf(A.age)}`;}
  /* leve e tipi di FIRE: altre 11 vite simulate, dopo aver mostrato la risposta */
  clearTimeout(fiT);fiT=setTimeout(()=>{
    const lev=[["Risparmi 200 € in più al mese",{save:F.save+200}],["Risparmi 500 € in più al mese",{save:F.save+500}],["Spendi 200 € in meno al mese",{spend:Math.max(100,F.spend-200)}],[`Pensione più alta di 300 € al mese (dai ${F.penAge} anni)`,{pension:F.pen+300}],["Fondi con costi più bassi (−0,2% l'anno)",{costs:Math.max(0,I.costs-.2)/100}],["I soldi devono durare 5 anni in meno",{endAge:Math.max(F.age+6,F.end-5)}]];
    fiLevers(lev.map(([t,o])=>{const r=P.fireAge({...base,...o});return {t,age:r.age,already:r.already};}));
    const vars=[["Lean FIRE","vivere con il 30% in meno",{spend:F.spend*.7}],["FIRE classico","la tua spesa di oggi",{}],["Fat FIRE","50% di spesa in più",{spend:F.spend*1.5}],["Coast FIRE","smetti di risparmiare da oggi",{save:0}],["Barista FIRE","part-time da 800 € al mese fino alla pensione",{side:800,sideUntil:F.penAge}]];
    fiVars(vars.map(([t,d,o])=>{const r=Object.keys(o).length?P.fireAge({...base,...o}):A;return {t,d,age:r.age,already:r.already};}));
  },60);
}
const fiYearOf=age=>new Date().getFullYear()+(age-S.fi.res.F.age);
const fiAgeTxt=(x,F)=>x.already?"già oggi":x.age==null?`oltre i ${F.end-1}`:`${x.age} anni`;
function fiHero(){
  const {A,life,F}=S.fi.res,c=(k,v)=>`<button type="button" class="cellbtn" data-rc="fi-${k}">${v}</button>`;
  const share=life.capAtRetire>0?Math.min(1,F.cap/life.capAtRetire):1,d=A.dist||{};
  let big,sub;
  if(A.already){big=`Sei già <em>indipendente</em>.`;sub=`Con ${fmtEur(F.cap)} copri ${fmtEur(F.spend)} al mese fino a ${F.end} anni nel ${fmtPct(A.res.success,0)} dei futuri simulati${F.pen?`, contando ${fmtEur(F.pen)} di pensione dai ${F.penAge}`:""}.`;}
  else if(A.age==null){big=`Con questi numeri non ci arrivi prima dei <em>${F.end} anni</em>.`;sub=`Prova ad aumentare il risparmio o a ridurre la spesa: a destra e sotto vedi cosa ti avvicina di più.`;}
  else{big=`Puoi smettere di lavorare a ${c("age",`<em>${A.age} anni</em>`)}`;sub=`nel ${fiYearOf(A.age)}, tra ${A.age-F.age} ${A.age-F.age===1?"anno":"anni"}: con ${fmtEur(F.spend)} al mese fino a ${F.end} anni${F.pen?` e ${fmtEur(F.pen)} di pensione dai ${F.penAge}`:""}, i soldi bastano nel ${fmtPct(A.res.success,0)} dei futuri simulati.`;}
  const spread=!A.already&&d.p25!=null&&d.p50!=null?`<p class="fi-d">Con un po' di fortuna sui mercati anche prima: in 1 futuro su 4 a <b>${d.p25} anni</b>, in metà dei futuri a <b>${d.p50}</b>.</p>`:"";
  $("#fiHero").innerHTML=`<p class="fi-q">Con il tuo portafoglio e i tuoi numeri</p><h3 class="fi-a">${big}</h3><p class="fi-s">${sub}</p>${spread}
    ${A.age!=null&&!A.already?`<div class="fi-prog"><div class="fi-bar"><i style="width:${(share*100).toFixed(1)}%"></i></div><div class="fi-pl"><span>Oggi hai il <b>${fmtPct(share,0)}</b> del capitale che avrai quando smetti</span><span>${F.age} → ${A.age} anni</span></div></div>`:""}`;
}
function fiKpis(){
  const {A,life,sw,F}=S.fi.res,c=(k,v)=>`<button type="button" class="v" data-rc="fi-${k}">${v}</button>`,need=F.spend*12/sw.swr;
  $("#fiKpis").innerHTML=[
    ["Il tuo numero FIRE",c("need",fmtEur(need)),`${fmtN(1/sw.swr,0)} volte la spesa di un anno · senza contare la pensione`],
    ["Capitale quando smetti",c("cap",fmtEur(life.capAtRetire)),`a ${A.age!=null?A.age:F.end-1} anni, scenario mediano · sfavorevole ${fmtEur(life.capAtRetireBad)}`],
    ["Prelievo sostenibile",c("swr",fmtPct(sw.swr,1)+" l'anno"),`per ${sw.years} anni · la regola del 4% qui riesce nel ${fmtPct(sw.at4,0)} dei casi`],
    ["Se smettessi oggi",c("draw",fmtEur(F.cap*sw.swr/12)+"/mese"),`quanto potresti prelevare dal capitale di oggi`]
  ].map(([l,v,s])=>`<div class="kpi"><span class="eyebrow">${l}</span>${v}<span class="s">${s}</span></div>`).join("");
}
function fiGoal(){
  const {goal,goalNow,F,A}=S.fi.res,el=$("#fiGoalRes");
  if(A.age!=null&&F.goal>=A.age&&!A.already){el.innerHTML=`<p>Con i tuoi numeri di oggi a <b>${F.goal} anni</b> sei già a posto: i soldi bastano nel <b>${fmtPct(goalNow.success,0)}</b> dei futuri. Sposta il cursore su un'età più bassa.</p>`;return;}
  if(A.already){el.innerHTML=`<p>Sei già indipendente oggi: non serve altro risparmio.</p>`;return;}
  const extra=goal.save!=null?goal.save-F.save:null;
  el.innerHTML=`<div class="fi-goal-big">${goal.save==null?`<b>Non basta nessun risparmio ragionevole</b><span>per smettere a ${F.goal} anni con questa spesa: riduci la spesa o sposta l'età.</span>`
    :`<span>Per smettere a <b>${F.goal} anni</b> devi risparmiare</span>${`<button type="button" class="cellbtn" data-rc="fi-goal"><b>${fmtEur(goal.save)} al mese</b></button>`}<span>${extra>0?`cioè <b>${fmtEur(extra)}</b> in più di oggi`:`meno di quanto risparmi oggi`}</span>`}</div>
    <p class="fi-goal-now">Con il risparmio di oggi (${fmtEur(F.save)} al mese), smettendo a ${F.goal} anni i soldi basterebbero nel <b>${fmtPct(goalNow.success,0)}</b> dei futuri${goalNow.depMedianAge!=null&&goalNow.success<1?` e, quando non bastano, finiscono verso i ${Math.round(goalNow.depMedianAge)} anni`:""}.</p>`;
}
function fiLifeChart(){
  const {life,F,A}=S.fi.res,fan=life.fan;if(!fan)return;
  const VW=900,VH=300,ml=62,mr=16,mt=16,mb=34,iw=VW-ml-mr,ih=VH-mt-mb,n=fan.length,R=A.age!=null?A.age:null;
  const hi=Math.max(...fan.map(x=>x.p90))*1.05||1,X=a=>ml+(a-fan[0].age)/((fan.at(-1).age-fan[0].age)||1)*iw,Y=v=>mt+ih-v/hi*ih;let g="";
  if(R!=null&&!A.already)g+=`<rect x="${X(fan[0].age)}" y="${mt}" width="${X(R)-X(fan[0].age)}" height="${ih}" fill="var(--raise)"/><text x="${X(fan[0].age)+8}" y="${mt+16}" style="fill:var(--muted)">lavori e risparmi</text><text x="${X(R)+8}" y="${mt+16}" style="fill:var(--muted)">vivi dei tuoi investimenti</text>`;
  niceTicks(0,hi,4).filter(v=>v>=0&&v<=hi).forEach(v=>{g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${ml-8}" y="${Y(v)+4}" text-anchor="end">${fmtK(v)}</text>`;});
  fan.forEach(x=>{if(x.age%5===0)g+=`<text x="${X(x.age)}" y="${VH-10}" text-anchor="middle">${x.age}</text>`;});
  const band=(a,b,op)=>{let d="";fan.forEach((x,i)=>{d+=(i?"L":"M")+X(x.age).toFixed(1)+","+Y(x[a]).toFixed(1);});for(let i=n-1;i>=0;i--)d+="L"+X(fan[i].age).toFixed(1)+","+Y(fan[i][b]).toFixed(1);return `<path d="${d}Z" fill="#C9F24A" opacity="${op}"/>`;};
  g+=band("p90","p10",.3)+band("p75","p25",.6);
  let d="";fan.forEach((x,i)=>{d+=(i?"L":"M")+X(x.age).toFixed(1)+","+Y(x.p50).toFixed(1);});g+=`<path d="${d}" fill="none" stroke="var(--fg)" stroke-width="2.6"/>`;
  let d2="";fan.forEach((x,i)=>{d2+=(i?"L":"M")+X(x.age).toFixed(1)+","+Y(x.p10).toFixed(1);});g+=`<path d="${d2}" fill="none" stroke="var(--c2)" stroke-width="1.6" stroke-dasharray="5 4"/>`;
  if(R!=null&&!A.already)g+=`<line x1="${X(R)}" x2="${X(R)}" y1="${mt}" y2="${mt+ih}" stroke="var(--fg)" stroke-width="1.5"/><circle cx="${X(R)}" cy="${Y(life.capAtRetire)}" r="6" fill="#C9F24A" stroke="var(--fg)" stroke-width="1.5"/><text x="${X(R)-8}" y="${Y(life.capAtRetire)-12}" text-anchor="end" style="fill:var(--fg);font-weight:600">smetti a ${R} anni · ${fmtK(life.capAtRetire)}</text>`;
  if(F.pen>0&&F.penAge<F.end)g+=`<line x1="${X(F.penAge)}" x2="${X(F.penAge)}" y1="${mt+24}" y2="${mt+ih}" stroke="var(--muted)" stroke-dasharray="2 4"/><text x="${X(F.penAge)+6}" y="${mt+ih-8}" style="fill:var(--muted)">pensione</text>`;
  $("#fiLife").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Capitale per età, dai futuri più sfavorevoli ai più favorevoli">${g}</svg>`;
  $("#fiLifeLeg").innerHTML=`<span><i style="background:var(--fg);height:3px"></i>scenario mediano</span><span><i style="background:var(--c2);height:2px"></i>scenario sfavorevole (10 futuri su 100 vanno peggio)</span><span><i style="background:#C9F24A;opacity:.8"></i>metà centrale dei futuri</span><span><i style="background:#C9F24A;opacity:.4"></i>8 futuri su 10</span>`;
  $("#fiLifeCap").textContent=life.depMedianAge!=null&&life.success<1?`Nei futuri in cui i soldi finiscono prima dei ${F.end} anni, succede in media verso i ${Math.round(life.depMedianAge)} anni.`:`In nessuno dei futuri simulati i soldi finiscono prima dei ${F.end} anni.`;
}
function fiLevers(L){
  const {A,F}=S.fi.res,base=A.already?F.age:A.age==null?F.end:A.age;
  $("#fiLevers").innerHTML=L.map(x=>{const a=x.already?F.age:x.age==null?F.end:x.age,d=a-base;
    return `<div class="fi-lv"><span>${esc(x.t)}</span><b>${fiAgeTxt(x,F)}</b><em class="${d<0?"good":d>0?"bad":""}">${d===0?"=":d<0?`${d} ${d===-1?"anno":"anni"}`:`+${d}`}</em><i style="--w:${Math.min(100,Math.abs(d)*8)}%"></i></div>`;}).join("")+`<p class="caption" style="margin-top:8px">Ogni riga cambia una sola cosa rispetto ai tuoi numeri, sugli stessi futuri simulati.</p>`;
}
function fiVars(V){const F=S.fi.res.F;$("#fiVars").innerHTML=V.map(x=>`<div class="fi-var"><div><b>${esc(x.t)}</b><small>${esc(x.d)}</small></div><span>${fiAgeTxt(x,F)}</span></div>`).join("");}
function fiCurve(){
  const {sw,F}=S.fi.res;if(!sw.curve||!sw.curve.length)return;
  const VW=640,VH=250,ml=46,mr=16,mt=16,mb=34,iw=VW-ml-mr,ih=VH-mt-mb,pts=sw.curve,x0=pts[0].rate,x1=pts.at(-1).rate,X=v=>ml+(v-x0)/(x1-x0)*iw,Y=v=>mt+ih-v*ih;let g="";
  [0,.25,.5,.75,1].forEach(v=>{g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${ml-8}" y="${Y(v)+4}" text-anchor="end">${fmtPct(v,0)}</text>`;});
  pts.forEach(p=>{g+=`<text x="${X(p.rate)}" y="${VH-12}" text-anchor="middle">${fmtPct(p.rate,1).replace(",0","")}</text>`;});
  g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Y(F.target)}" y2="${Y(F.target)}" stroke="var(--c2)" stroke-dasharray="4 4"/><text x="${VW-mr}" y="${Y(F.target)-6}" text-anchor="end" style="fill:var(--c2)">sicurezza ${fmtPct(F.target,0)}</text>`;
  g+=`<line x1="${X(.04)}" x2="${X(.04)}" y1="${mt}" y2="${mt+ih}" stroke="var(--muted)" stroke-dasharray="2 4"/><text x="${X(.04)-6}" y="${mt+ih-8}" text-anchor="end" style="fill:var(--muted)">regola del 4%</text>`;
  let d="";pts.forEach((p,i)=>{d+=(i?"L":"M")+X(p.rate).toFixed(1)+","+Y(p.success).toFixed(1);});g+=`<path d="${d}" fill="none" stroke="var(--fg)" stroke-width="2.6" stroke-linejoin="round"/>`;
  pts.forEach(p=>{g+=`<circle cx="${X(p.rate)}" cy="${Y(p.success)}" r="3" fill="var(--fg)"/>`;});
  if(sw.swr>=x0&&sw.swr<=x1)g+=`<circle cx="${X(sw.swr)}" cy="${Y(F.target)}" r="6" fill="#C9F24A" stroke="var(--fg)" stroke-width="1.5"/><text x="${X(sw.swr)-10}" y="${Y(F.target)+20}" text-anchor="end" style="fill:var(--fg);font-weight:600">${fmtPct(sw.swr,1)}</text>`;
  $("#fiCurve").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Probabilità che i soldi bastino al variare del prelievo annuo">${g}</svg>`;
  $("#fiCurveTxt").innerHTML=`<p><b>FIRE</b> (Financial Independence, Retire Early) vuol dire mettere da parte abbastanza da vivere dei propri investimenti, senza dipendere dallo stipendio.</p>
    <p>La <b>regola del 4%</b> (Bengen, 1994) dice che prelevando ogni anno il 4% del capitale iniziale, aggiornato all'inflazione, i soldi sono durati 30 anni in quasi tutti i periodi storici americani: da qui l'idea di mettere da parte <b>25 volte</b> la spesa di un anno. Sul tuo portafoglio, per ${sw.years} anni, il prelievo più alto che regge nel ${fmtPct(F.target,0)} dei futuri è il <b>${fmtPct(sw.swr,1)}</b>: ti servono <b>${fmtN(1/sw.swr,0)} volte</b> la spesa annua.</p>
    <p class="caption">Asse orizzontale: prelievo annuo in % del capitale al momento dello stop. Asse verticale: quota di futuri in cui i soldi bastano.</p>`;
}
function fiNotes(){
  const R=S.fi.res;
  $("#fiNotes").innerHTML=[`Tutto è in <b>euro di oggi</b>: spesa, pensione e prelievi crescono con l'inflazione (${fmtPct(R.infl/100,1)} l'anno, dalla sezione Simulazioni).`,
    `I rendimenti sono quelli storici del portafoglio (${esc(R.label)}, ${R.nHist} mesi), ricampionati in ${R.A.n} futuri e al netto dei costi (${fmtPct(R.costs/100,2)} l'anno). Il futuro può essere diverso dal passato.`,
    "Non ci sono le tasse: sui prelievi si paga il 26% (12,5% sui titoli di Stato) solo sulla parte di guadagno. Alzano un po' la spesa da coprire.",
    "La pensione è quella che scrivi tu: il sito non la stima. Per una stima puoi usare il simulatore dell'INPS.",
    "Il portafoglio resta lo stesso per tutta la vita. Molti riducono le azioni avvicinandosi allo stop: cambia rischio e risultati.",
    "Non è una previsione né un consiglio: serve a capire quali scelte contano di più."].map(t=>`<li>${t}</li>`).join("");
}
function fiReceipt(m){
  const R=S.fi.res,F=R.F,A=R.A,base=[["Età oggi",F.age],["I soldi devono durare fino a",`${F.end} anni`],["Capitale oggi",fmtEur(F.cap)],["Risparmio mensile",fmtEur(F.save)],["Spesa mensile",fmtEur(F.spend)],["Pensione",F.pen?`${fmtEur(F.pen)} al mese dai ${F.penAge} anni`:"non contata"],["Sicurezza richiesta",fmtPct(F.target,0)],["Rendimenti",`${R.nHist} mesi storici (${R.label}), al netto dell'inflazione ${fmtPct(R.infl/100,2)} e dei costi ${fmtPct(R.costs/100,2)}`],["Futuri simulati",`${A.res.n} per ogni età provata, sempre gli stessi`]];
  const fx="r̃ = (1 + r) / (1 + π)^(1/12) − 1   (rendimento del mese in euro di oggi)\nprima dello stop: Wₜ = Wₜ₋₁ · (1 + r̃ₜ) · (1 − c)^(1/12) + risparmio\ndopo lo stop:    Wₜ = Wₜ₋₁ · (1 + r̃ₜ) · (1 − c)^(1/12) − (spesa − pensione)\nsuccesso = quota di futuri con W > 0 fino all'età finale";
  if(m==="age")return {title:"Età in cui puoi smettere di lavorare",value:A.already?"già oggi":A.age==null?`oltre ${F.end-1} anni`:`${A.age} anni`,formula:fx+"\nEtà FIRE = età di stop più bassa con successo ≥ sicurezza   (ricerca binaria)",kv:[["Successo a quell'età",fmtPct(A.res.success,1)],...base]};
  if(m==="cap")return {title:"Capitale quando smetti",value:fmtEur(R.life.capAtRetire),formula:fx+"\nvalore = mediana dei capitali all'età di stop (sfavorevole = 10° percentile)",kv:[["Scenario sfavorevole",fmtEur(R.life.capAtRetireBad)],...base]};
  if(m==="need")return {title:"Numero FIRE",value:fmtEur(F.spend*12/R.sw.swr),formula:"numero FIRE = spesa mensile × 12 / SWR\nSWR = tasso annuo più alto con successo ≥ sicurezza per "+R.sw.years+" anni",kv:[["Spesa mensile",fmtEur(F.spend)],["SWR",fmtPct(R.sw.swr,2)],["Volte la spesa annua",fmtN(1/R.sw.swr,1)],...base]};
  if(m==="goal")return {title:"Risparmio per smettere all'età scelta",value:R.goal.save!=null?fmtEur(R.goal.save)+" al mese":"non raggiungibile",formula:fx+"\nrisparmio = il più basso con successo ≥ sicurezza smettendo a "+F.goal+" anni   (bisezione)",kv:[["Età scelta",`${F.goal} anni`],["Successo con il risparmio di oggi",fmtPct(R.goalNow.success,1)],...base]};
  if(m==="draw")return {title:"Prelievo mensile sostenibile",value:fmtEur(F.cap*R.sw.swr/12)+"/mese",formula:"prelievo = capitale × SWR / 12\nSWR = tasso annuo più alto con successo ≥ sicurezza per "+R.sw.years+" anni",kv:[["SWR",fmtPct(R.sw.swr,2)],...base]};
  return {title:"Tasso di prelievo sostenibile",value:fmtPct(R.sw.swr,2)+" l'anno",formula:"Wₜ = Wₜ₋₁ · (1 + r̃ₜ) · (1 − c)^(1/12) − prelievo\nSWR = tasso più alto con P(W > 0 per "+R.sw.years+" anni) ≥ sicurezza   (bisezione)",kv:[["Successo della regola del 4%",fmtPct(R.sw.at4,1)],...R.sw.curve.map(p=>[`Prelievo ${fmtPct(p.rate,1)}`,`riesce nel ${fmtPct(p.success,0)} dei futuri`]),...base]};
}
let fiRaf=0;
document.addEventListener("input",e=>{const id=e.target.dataset&&e.target.dataset.fi;if(!id||!S.fi)return;
  fiSet(id,parseFloat(String(e.target.value).replace(",",".")));
  /* aggiorna l'altro controllo (cursore ↔ numero) e ricalcola al prossimo fotogramma: il calcolo è veloce, si vede mentre trascini */
  const F=S.fi.in,v=F[FI_K[id]];if(e.target.type==="range"){const nn=$("#"+id+"N");if(nn)nn.value=Math.round(v);}else{const r=$("#"+id);if(r)r.value=v;}
  cancelAnimationFrame(fiRaf);fiRaf=requestAnimationFrame(()=>{fiFill();fiCompute();});});
document.addEventListener("click",e=>{const b=e.target.closest("[data-fit]");if(!b||!S.fi)return;S.fi.in.target=+b.dataset.fit;fiFill();fiCompute();});
function renderSim(){
  const box=$("#simBox"),empty=$("#simEmpty");
  if(!S.lab||!S.ds||!S.ds.ok){box.hidden=true;empty.hidden=false;$("#simW").innerHTML="";return;}
  box.hidden=false;empty.hidden=true;
  if(!S.riskW)S.riskW=S.portfolio?"now":"equal";
  if(!S.mcIn){S.mcIn=simDefaults();fillSimForm();}
  const opts=wOpts();
  $("#simW").innerHTML=opts.map(o=>`<button type="button" data-rw="${o[0]}" aria-pressed="${S.riskW===o[0]}">${o[1]}</button>`).join("");
  document.querySelectorAll("#mcMethod [data-mcm]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mcm===S.mcIn.method)));
  document.querySelectorAll("#mcN [data-mcn]").forEach(b=>b.setAttribute("aria-pressed",String(+b.dataset.mcn===S.mcIn.n)));
  document.querySelectorAll("#mcReal [data-mcr]").forEach(b=>b.setAttribute("aria-pressed",String((b.dataset.mcr==="1")===S.mcIn.real)));
  const R=runSim();
  if(R.error){$("#mcKpis").innerHTML=`<div class="kpi"><span class="eyebrow">Dati insufficienti</span><span class="v txt">${esc(R.error)}</span>${rebuildHint()}</div>`;["#mcFan","#mcDist","#mcTable","#mcNotes","#mcLegend"].forEach(id=>$(id).innerHTML="");return;}
  const real=S.mcIn.real,pf=real?R.pFinalReal:R.pFinal,yrs=unitN(R.years,1),btn=(k,v)=>`<button type="button" class="v" data-rc="mc-${k}">${v}</button>`;
  $("#simSub").textContent=`${fmtN(R.n,0).replace(",00","")} percorsi di ${yrs} con ${R.wLabel}, ricampionando ${R.hist.m} rendimenti ${S.ds.freq.adj} del file.`;
  const k3=R.monthly<0&&R.depleted>0?["Capitale esaurito",btn("dep",fmtPct(R.depleted,0)),"dei percorsi finisce i soldi prima della fine"]:["Probabilità di perdita",btn("loss",fmtPct(R.probLoss,0)),`di finire sotto i ${fmtEur(R.invested)} versati`];
  $("#mcKpis").innerHTML=[
    [`Mediana dopo ${yrs}`,btn("med",fmtEur(pf[3])),real?"in euro di oggi, al netto dell'inflazione":"metà dei percorsi finisce sopra"],
    ["Che probabilità hai?",btn("goal",R.goal>0?fmtPct(real?R.probGoalReal:R.probGoal,0):"—"),R.goal>0?`di arrivare a ${fmtEur(R.goal)}${real?" in euro di oggi":""} · ±${fmtN(1.96*Math.sqrt((real?R.probGoalReal:R.probGoal)*(1-(real?R.probGoalReal:R.probGoal))/R.n)*100,1)} punti di errore di simulazione`:"imposta un obiettivo"],
    k3,
    ["Scenario sfavorevole",btn("p-0",fmtEur(pf[0])),"5 percorsi su 100 finiscono più in basso"]
  ].map(k=>`<div class="kpi"><span class="eyebrow">${k[0]}</span>${k[1]}<span class="sub">${k[2]}</span></div>`).join("");
  drawFan(R,real);drawDist(R,real);renderMcTable(R);renderMcNotes(R);
  if(current==="sim")Morph.shape("sim");
}
function drawFan(R,real){
  const F=R.fan,Y=F.length-1,key=real?"real":"nom",VW=900,VH=330,ml=62,mr=16,mt=16,mb=30,iw=VW-ml-mr,ih=VH-mt-mb;
  const inv=F.map(r=>real?r.invested/Math.pow(1+R.infl,r.y):r.invested);
  let hi=Math.max(...F.map(r=>r[key][6]),...inv,R.goal&&R.goal<Math.max(...F.map(r=>r[key][6]))*1.3?R.goal:0)*1.06;if(!(hi>0))hi=1;
  const X=y=>ml+(Y?y/Y:0)*iw,Yv=v=>mt+ih-Math.max(0,Math.min(1,v/hi))*ih;
  let g="";niceTicks(0,hi,5).filter(v=>v>=0&&v<=hi).forEach(v=>{g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Yv(v).toFixed(1)}" y2="${Yv(v).toFixed(1)}" stroke="var(--line)"/><text x="${ml-8}" y="${(Yv(v)+4).toFixed(1)}" text-anchor="end">${fmtK(v)}</text>`;});
  const step=Y>30?10:Y>12?5:Y>6?2:1;for(let y=0;y<=Y;y+=step)g+=`<text x="${X(y).toFixed(1)}" y="${VH-8}" text-anchor="middle">${y===0?"oggi":"+"+y+"a"}</text>`;
  const band=(a,b,op,k)=>{let d="";F.forEach((r,i)=>{d+=(i?"L":"M")+X(r.y).toFixed(1)+","+Yv(r[key][b]).toFixed(1);});for(let i=Y;i>=0;i--)d+="L"+X(F[i].y).toFixed(1)+","+Yv(F[i][key][a]).toFixed(1);return `<path d="${d}Z" fill="var(--c2)" opacity="${op}" class="area" style="animation-delay:${k}s"/>`;};
  const line=(arr,st)=>{let d="";arr.forEach((v,i)=>{d+=(i?"L":"M")+X(i).toFixed(1)+","+Yv(v).toFixed(1);});return `<path d="${d}" fill="none" ${st}/>`;};
  g+=band(0,6,.16,.2)+band(1,5,.18,.35)+band(2,4,.3,.5);
  g+=line(inv,`stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 5"`);
  if(R.goal>0&&R.goal<=hi)g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Yv(R.goal).toFixed(1)}" y2="${Yv(R.goal).toFixed(1)}" stroke="var(--warn)" stroke-width="1.5" stroke-dasharray="8 6"/><text x="${VW-mr-4}" y="${(Yv(R.goal)-7).toFixed(1)}" text-anchor="end" style="fill:var(--warn);font-weight:600">obiettivo ${fmtK(R.goal)}</text>`;
  g+=line(F.map(r=>r[key][3]),`stroke="var(--lime)" stroke-width="3" pathLength="1" class="draw" style="--k:0"`);
  const last=F[Y][key];g+=`<circle cx="${X(Y)}" cy="${Yv(last[3])}" r="5" fill="var(--lime)" class="endpt" style="--k:0"/>`;
  g+=`<line id="mcCursor" x1="0" x2="0" y1="${mt}" y2="${mt+ih}" stroke="var(--fg)" stroke-opacity=".35" visibility="hidden"/><rect x="${ml}" y="${mt}" width="${iw}" height="${ih}" fill="transparent" id="mcHit"/>`;
  $("#mcFan").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Ventaglio dei percorsi simulati: percentili del capitale anno per anno">${g}</svg><div class="tip" id="mcTip" hidden></div>`;
  $("#mcLegend").innerHTML=`<span><i style="background:var(--lime);height:3px"></i>mediana</span><span><i style="background:var(--c2);opacity:.6;height:10px"></i>metà centrale (25–75)</span><span><i style="background:var(--c2);opacity:.3;height:10px"></i>10–90 e 5–95</span><span><i style="background:var(--muted)"></i>soldi versati</span>${R.goal>0?`<span><i style="background:var(--warn)"></i>obiettivo</span>`:""}`;
  $("#mcFanCap").textContent=`Dopo ${unitN(R.years,1)}, 9 percorsi su 10 finiscono tra ${fmtEur(last[0])} e ${fmtEur(last[6])}${real?" (euro di oggi)":""}. La forma del ventaglio dipende dai rendimenti del file: un passato diverso darebbe un ventaglio diverso.`;
  const svg=$("#mcFan svg"),tip=$("#mcTip"),cur=$("#mcCursor");
  $("#mcHit").addEventListener("pointermove",e=>{
    const r=svg.getBoundingClientRect(),sx=(e.clientX-r.left)/r.width*VW,y=Math.max(0,Math.min(Y,Math.round((sx-ml)/iw*Y))),row=F[y][key],x=X(y);
    cur.setAttribute("x1",x);cur.setAttribute("x2",x);cur.setAttribute("visibility","visible");
    tip.hidden=false;tip.innerHTML=`<b>${y===0?"Oggi":`Dopo ${unitN(y,1)}`}</b>${[[6,"95°"],[5,"90°"],[3,"mediana"],[1,"10°"],[0,"5°"]].map(([q,l])=>`<div class="r"><span>${l}</span><b>${fmtEur(row[q])}</b></div>`).join("")}<div class="r"><span>versato</span><span>${fmtEur(inv[y])}</span></div>`;
    const px=x/VW*r.width;tip.style.left=Math.min(r.width-200,Math.max(0,px+14))+"px";tip.style.top="10px";
  });
  $("#mcHit").addEventListener("pointerleave",()=>{tip.hidden=true;cur.setAttribute("visibility","hidden");});
}
function drawDist(R,real){
  const vals=real?R.finalReal:R.final,goal=R.goal,cap=quantileArr(vals,.99),lo=vals[0],span=(cap-lo)||1,B=32,cnt=new Array(B).fill(0);
  vals.forEach(v=>{cnt[Math.max(0,Math.min(B-1,Math.floor((Math.min(v,cap)-lo)/span*B)))]++;});
  const VW=640,VH=270,ml=34,mr=12,mt=24,mb=30,iw=VW-ml-mr,ih=VH-mt-mb,mx=Math.max(...cnt),bw=iw/B,X=v=>ml+(v-lo)/span*iw;
  let g="";
  cnt.forEach((c,b)=>{if(!c)return;const x0=ml+b*bw,top=lo+(b+1)*span/B,h=c/mx*ih,ok=goal>0&&lo+b*span/B>=goal;
    g+=`<rect class="grow" style="--k:${b}" x="${(x0+1).toFixed(1)}" y="${(mt+ih-h).toFixed(1)}" width="${Math.max(1,bw-2).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${ok?"var(--lime)":"var(--c2)"}" opacity="${ok?.9:.7}"><title>${c} percorsi tra ${fmtEur(lo+b*span/B)} e ${fmtEur(top)}${b===B-1?" o più":""}</title></rect>`;});
  niceTicks(lo,cap,5).filter(v=>v>=lo&&v<=cap).forEach(v=>{g+=`<text x="${X(v).toFixed(1)}" y="${VH-8}" text-anchor="middle">${fmtK(v)}</text>`;});
  const med=(real?R.pFinalReal:R.pFinal)[3];g+=`<line x1="${X(med)}" x2="${X(med)}" y1="${mt-8}" y2="${mt+ih}" stroke="var(--fg)" stroke-width="1.5" stroke-dasharray="3 4"/><text x="${X(med)+6}" y="${mt}" style="fill:var(--fg);font-weight:600">mediana</text>`;
  if(goal>0&&goal>=lo&&goal<=cap)g+=`<line x1="${X(goal)}" x2="${X(goal)}" y1="${mt+12}" y2="${mt+ih}" stroke="var(--warn)" stroke-width="2"/><text x="${X(goal)+6}" y="${mt+24}" style="fill:var(--warn);font-weight:600">obiettivo</text>`;
  $("#mcDist").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Distribuzione del capitale finale nei percorsi simulati">${g}</svg>`;
  $("#mcDistUnit").textContent=`capitale finale · ${real?"euro di oggi":"nominale"}`;
  const pg=real?R.probGoalReal:R.probGoal;
  $("#mcDistCap").textContent=goal>0?`In lime i percorsi che arrivano all'obiettivo: ${fmtPct(pg,0)}, cioè circa ${Math.round(pg*100)} su 100. L'1% di percorsi più alti è raccolto nell'ultima barra.`:"L'1% di percorsi più alti è raccolto nell'ultima barra.";
}
function quantileArr(sorted,p){return P.quantile(sorted,p);}
function renderMcTable(R){
  const L=["5°","10°","25°","50° · mediana","75°","90°","95°"],cell=(k,v)=>`<button type="button" class="cellbtn" data-rc="mc-${k}">${v}</button>`;
  $("#mcTable").innerHTML=`<thead><tr><th>Percentile</th><th>Nominale</th><th>Euro di oggi</th></tr></thead><tbody>${R.pcts.map((p,i)=>`<tr${i===3?' class="pf"':""}><td>${L[i]}</td><td>${cell("p-"+i,fmtEur(R.pFinal[i]))}</td><td>${cell("p-"+i,fmtEur(R.pFinalReal[i]))}</td></tr>`).join("")}</tbody>`;
}
function renderMcNotes(R){
  const ds=S.ds,f=ds.freq.f,from=fmtDate(ds.dates[Math.max(0,R.histFrom)],f),to=fmtDate(ds.dates[ds.dates.length-1],f),kurt=P.riskStats(pfAsset(R.w,"p").ret,f,0).kurt;
  const M={boot:`<b>Storico (bootstrap)</b>: ogni ${UNIT[f]?UNIT[f][0]:"periodo"} futuro pesca a caso uno dei ${R.hist.m} rendimenti reali del portafoglio, dal ${from} al ${to}. Conserva code e asimmetrie vere, ma tratta ogni periodo come indipendente dagli altri.`,
    block:`<b>A blocchi</b>: pesca sequenze consecutive di ${unitN(R.block,f)} dalla storia, così conserva parte delle fasi di mercato (cali e rimbalzi ravvicinati).`,
    normal:`<b>Normale</b>: rendimenti con la stessa media (${fmtPct(R.hist.mean,2)}) e deviazione standard (${fmtPct(R.hist.sd,2)}) della storia, ma a campana. ${kurt>1?`Il tuo file ha code più spesse (curtosi in eccesso ${fmtN(kurt)}): questo metodo sottostima i crolli.`:"Il tuo file ha code vicine a quelle normali."}`}[R.method];
  const n=[M,
    `<b>Il passato si ripete</b>: tutti i metodi assumono che il futuro somigli al periodo nel file. Con ${fmtN(ds.years,1)} anni di storia, ${ds.years<10?"il campione è corto e può non contenere cicli completi di mercato.":"il campione contiene più fasi di mercato, ma non tutte quelle possibili."}`,
    `<b>Portafoglio</b>: ${R.wLabel}, ${R.w.map((x,i)=>x>0?`${esc(ds.assets[i].name)} ${fmtPct(x,0)}`:null).filter(Boolean).join(", ")}, ribilanciato a ogni periodo.`,
    `<b>Flussi</b>: ${R.monthly>=0?`versamento di ${fmtEur(R.monthly)} al mese`:`prelievo di ${fmtEur(-R.monthly)} al mese`}, applicato a fine periodo (${fmtEur(Math.abs(R.perStep))} ${PER[f]||"a periodo"}). Costi del ${fmtN(R.costs*100,2)}% l'anno tolti ogni periodo.`,
    `<b>Inflazione</b>: costante al ${fmtN(R.infl*100,2)}% l'anno, usata solo per riportare i valori in euro di oggi. Le tasse non sono modellate.`,
    `<b>Riproducibile</b>: ${fmtN(R.n,0).replace(",00","")} percorsi con seme fisso ${R.seed}: con gli stessi dati e parametri ottieni sempre gli stessi numeri.${R.n<R.nAsked?` Ridotti da ${R.nAsked} per tenere veloce il calcolo sui dati ${ds.freq.adj}.`:""}`,
    `<b>Drawdown simulato</b>: nel percorso mediano il portafoglio perde fino al ${fmtPct(-R.mddMedian,0)} dal massimo; in 1 percorso su 20 oltre il ${fmtPct(-R.mddP5,0)}.`,
    `<b>Non è una previsione</b>: è una mappa di possibilità coerenti con i dati storici, non una promessa di rendimento né un consiglio d'investimento.`];
  $("#mcNotes").innerHTML=n.map(x=>`<li>${x}</li>`).join("");
}
function mcReceipt(m,arg){
  const R=S.mc,ds=S.ds,f=ds.freq.f,real=S.mcIn.real;
  const base=[["Metodo",MC_M[R.method]+(R.method==="block"?` · blocchi di ${unitN(R.block,f)}`:"")],["Percorsi",R.n],["Orizzonte",`${unitN(R.years,1)} = ${R.steps} passi ${ds.freq.adj}`],["Capitale iniziale",fmtEur(R.initial)],["Flusso per periodo",fmtEur(R.perStep)],["Costi annui",fmtPct(R.costs,2)],["Rendimenti storici usati",R.hist.m],["Seme",R.seed],["Rendimento annuo usato",R.rate!=null?`${fmtPct(R.rate/100,1,true)} scelto da te (storico ${fmtPct(R.histAnn,1,true)})`:`${fmtPct(R.histAnn,1,true)} · media composta dei ${R.nHist} rendimenti storici del portafoglio`]];
  const fx="Wₜ = Wₜ₋₁ · (1 + r̃ₜ) · (1 − c)^(1/f) + v · 12/f\nr̃ₜ = rendimento estratto dalla storia del portafoglio";
  if(m==="p"){const i=+arg,L=["5°","10°","25°","50°","75°","90°","95°"][i];return {title:`Capitale finale · ${L} percentile`,value:fmtEur(R.pFinal[i]),formula:fx+`\nP${L} = quantile dei ${R.n} capitali finali (interpolazione lineare)`,kv:[["In euro di oggi",fmtEur(R.pFinalReal[i])],["Inflazione",fmtPct(R.infl,2)],...base]};}
  if(m==="med")return mcReceipt("p","3");
  if(m==="goal")return {title:"Probabilità di raggiungere l'obiettivo",value:fmtPct(real?R.probGoalReal:R.probGoal,1),formula:fx+"\nProb = (percorsi con W_T ≥ obiettivo) / percorsi totali\nerrore di simulazione = √(p(1 − p) / n);  IC 95% = p ± 1,96 · errore",kv:[["Obiettivo",fmtEur(R.goal)+(real?" in euro di oggi":"")],["Errore standard (nominale)",`${fmtN(R.probGoalSE*100,2)} punti`],["Probabilità nominale",fmtPct(R.probGoal,1)],["Probabilità in euro di oggi",fmtPct(R.probGoalReal,1)],...base]};
  if(m==="loss")return {title:"Probabilità di perdita",value:fmtPct(R.probLoss,1),formula:fx+"\nProb = (percorsi con W_T < capitale versato) / percorsi totali",kv:[["Capitale versato",fmtEur(R.invested)],...base]};
  if(m==="dep")return {title:"Percorsi che esauriscono il capitale",value:fmtPct(R.depleted,1),formula:fx+"\nesaurito se Wₜ ≤ 0 con prelievi attivi; da lì i prelievi si fermano",kv:base};
  return {title:"Simulazione",value:"—",formula:fx,kv:base};
}
let simT=0;
$("#mcForm").addEventListener("input",()=>{clearTimeout(simT);simT=setTimeout(()=>{simInputs();renderSim();},280);});
$("#mcForm").addEventListener("submit",e=>e.preventDefault());
document.addEventListener("click",e=>{
  const m=e.target.closest("[data-mcm]"),n=e.target.closest("[data-mcn]"),r=e.target.closest("[data-mcr]");
  if(!(m||n||r)||!S.mcIn)return;
  if(m)S.mcIn.method=m.dataset.mcm;if(n)S.mcIn.n=+n.dataset.mcn;if(r)S.mcIn.real=r.dataset.mcr==="1";
  simInputs();renderSim();
});

/* ---------- Stress test e crisi storiche (Modulo 4) ---------- */
const yr=d=>d.getUTCFullYear(),stPer=(n,f)=>n==null?"—":unitN(n,f);
function stressList(){
  const ds=S.ds,f=ds.freq.f,{w,label}=riskWeights();
  const list=P.CRISES.map(c=>P.crisisAnalysis(ds.dates,ds.assets,w,f,c));
  return {w,label,list,avgAll:P.avgCorr(ds.assets,w),C:P.covMatrix(ds.assets).C};
}
function renderStress(){
  const box=$("#stBox"),empty=$("#stEmpty");
  if(!S.lab||!S.ds||!S.ds.ok){box.hidden=true;empty.hidden=false;$("#stW").innerHTML="";return;}
  box.hidden=false;empty.hidden=true;
  if(!S.riskW)S.riskW=S.portfolio?"now":"equal";
  const ds=S.ds,f=ds.freq.f,R=stressList();S.stress=R;ensureBnCr();
  if(!S.st){const pfv=S.portfolio?S.portfolio.positions.reduce((s,p)=>s+(p.valore||0),0):0;S.st={sel:null,shock:ds.assets.map(()=>""),prop:true,cap:S.mcIn?S.mcIn.init:(pfv>0?Math.round(pfv):10000)};}
  const opts=wOpts();
  $("#stW").innerHTML=opts.map(o=>`<button type="button" data-rw="${o[0]}" aria-pressed="${S.riskW===o[0]}">${o[1]}</button>`).join("");
  const usable=R.list.filter(c=>c.status!=="out"&&c.used);
  if(!S.st.sel||!(usable.some(c=>c.id===S.st.sel)||bnCovers(S.st.sel))){const bu=S.bnCr?S.bnCr.list.filter(c=>bnCovers(c.id)):[];S.st.sel=usable.length?usable.reduce((a,b)=>b.mdd<a.mdd?b:a).id:bu.length?bu.reduce((a,b)=>b.mdd<a.mdd?b:a).id:null;}
  $("#stSub").textContent=`${usable.length} ${usable.length===1?"crisi su 5 è":"crisi su 5 sono"} nei dati del file (${fmtDate(ds.dates[0],f)} – ${fmtDate(ds.dates[ds.dates.length-1],f)}). Portafoglio con ${R.label}.`;
  $("#stCrises").innerHTML=R.list.map(c=>{
    const st=c.status,lab=st==="in"?"Nei dati":st==="partial"?"Dati parziali":"Fuori dai dati";
    const range=`${yr(c.from)}${yr(c.to)!==yr(c.from)?"–"+yr(c.to):""}`;
    return `<button type="button" class="crisis" role="listitem" data-crisis="${c.id}" aria-pressed="${S.st.sel===c.id}" ${(st==="out"||!c.used)&&!bnCovers(c.id)?"disabled":""}>
      <span class="yr">${range}</span><b class="nm">${esc(c.name)}</b>
      ${st!=="out"&&c.used?`<span class="big ${c.mdd>=0?"ok":""}">${fmtPct(c.mdd,1)}</span><small>perdita massima del portafoglio</small>`:`<small>Il file non copre ${fmtDate(c.from,f)} – ${fmtDate(c.to,f)}: nessuna stima inventata${bnCovers(c.id)?`. Clicca per vedere ${esc(S.bnCr.label)}.`:"."}</small>`}
      <span class="st ${st}">${lab}</span>${benchCardLine(c.id)}</button>`;}).join("");
  renderCrisisDetail();drawCrisisCompare();renderSwans();renderShock(true);renderStNotes();
  if(current==="stress")Morph.shape("stress");
}
function benchCrisisDetail(id){
  const C=S.bnCr,b=bnCovers(id),ba=C.ba,el=$("#stDetail");
  const k0=b.idx[0],endK=Math.min(ba.dates.length-1,Math.max(b.idx[b.idx.length-1]+Math.max(3,Math.round(b.periods*.6)),b.recK!=null?b.recK:0)),ks=[];for(let k=k0-1;k<=endK;k++)ks.push(k);
  let v=1;const ser=ks.map((k,j)=>{if(j&&Number.isFinite(ba.asset.ret[k]))v*=1+ba.asset.ret[k];return v;});S.stress.series=ser;
  const rec=b.recK!=null?unitN(b.recPeriods,12):"non ancora";
  el.innerHTML=`<div class="head"><div><span class="eyebrow">${fmtDate(b.from,12)} – ${fmtDate(b.to,12)} · ${unitN(b.periods,12)} · solo benchmark</span><h3 style="margin-top:4px">${esc(b.name)} · ${esc(C.label)}</h3></div></div>
    <p style="color:var(--muted);margin:4px 0 10px">${esc(b.what)} Il tuo file non copre questo periodo: qui vedi come si è mosso <b>${esc(C.label)}</b>, non il tuo portafoglio.</p>
    <div class="st-kpis"><div class="k"><span>Perdita massima</span><b class="neg" style="font-family:var(--f-display);font-size:1.5rem">${fmtPct(b.mdd,1)}</b></div><div class="k"><span>Rendimento nella crisi</span><b style="font-family:var(--f-display);font-size:1.5rem">${fmtPct(b.ret,1,true)}</b></div><div class="k"><span>Tempo per toccare il fondo</span><b style="font-family:var(--f-display);font-size:1.5rem">${unitN(b.toTrough,12)}</b></div><div class="k"><span>Recupero dal minimo</span><b style="font-family:var(--f-display);font-size:1.5rem">${rec}</b></div></div>
    <div class="chartbox" id="stPath"></div><p class="caption">Dati mensili dell'ETF ${esc(S.bn&&S.bn.pick!=="custom"?S.bn.pick:C.label)}${S.bn&&S.bn.ccy==="EUR"?", convertiti in euro con il cambio BCE":""}. Per vedere il tuo portafoglio in questa crisi serve un file con una storia che la includa.</p>`;
  const VW=900,VH=260,ml=46,mr=12,mt=14,mb=28,iw=VW-ml-mr,ih=VH-mt-mb,n=ser.length,lo=Math.min(...ser,1)*.97,hi=Math.max(...ser,1)*1.03,X=j=>ml+(n>1?j/(n-1):0)*iw,Y=x=>mt+ih-(x-lo)/((hi-lo)||1)*ih,j1=ks.indexOf(b.idx[b.idx.length-1]);
  let g=`<rect x="${X(0)}" y="${mt}" width="${X(j1)-X(0)}" height="${ih}" fill="var(--bad)" opacity=".08"/>`;
  niceTicks(lo-1,hi-1,4).forEach(t=>{const y=Y(1+t);if(y>=mt&&y<=mt+ih)g+=`<line x1="${ml}" x2="${VW-mr}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)"/><text x="${ml-6}" y="${(y+4).toFixed(1)}" text-anchor="end">${fmtPct(Math.abs(t)<1e-9?0:t,0,true)}</text>`;});
  [0,Math.floor((n-1)/2),n-1].forEach(j=>{g+=`<text x="${X(j).toFixed(1)}" y="${VH-8}" text-anchor="${j===0?"start":j===n-1?"end":"middle"}">${fmtDate(ba.dates[ks[j]],12)}</text>`;});
  let d="";ser.forEach((x,j)=>{d+=(j?"L":"M")+X(j).toFixed(1)+","+Y(x).toFixed(1);});
  g+=`<path d="${d}" fill="none" stroke="var(--c3)" stroke-width="3" pathLength="1" class="draw" style="--k:0"/>`;
  if(b.troughK!=null){const j=ks.indexOf(b.troughK);g+=`<circle cx="${X(j)}" cy="${Y(ser[j])}" r="5" fill="var(--bad)"/><text x="${X(j)+8}" y="${Y(ser[j])+16}" style="fill:var(--fg);font-weight:600">${fmtPct(b.mdd,1)}</text>`;}
  $("#stPath").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="${esc(C.label)} durante ${esc(b.name)}">${g}</svg>`;
}
function crisisSeries(c,extra){
  const ds=S.ds,R=S.stress,pr=P.portfolioReturns(ds.assets,R.w),k0=c.idx[0],endK=Math.min(ds.dates.length-1,Math.max(c.idx[c.idx.length-1]+extra,c.recK||0));
  const ks=[k0-1];for(let k=k0;k<=endK;k++)ks.push(k);
  const run=ret=>{let v=1;return ks.map((k,j)=>{if(j===0)return 1;if(Number.isFinite(ret[k]))v*=1+ret[k];return v;});};
  return {ks,pf:run(pr),assets:ds.assets.map((a,i)=>R.w[i]>0?run(a.ret):null),endK};
}
function renderCrisisDetail(){
  const R=S.stress,ds=S.ds,f=ds.freq.f,el=$("#stDetail"),c=R.list.find(x=>x.id===S.st.sel);
  if(c&&(c.status==="out"||!c.used)&&bnCovers(c.id)){benchCrisisDetail(c.id);return;}
  if(!c){el.innerHTML=`<div class="head"><h3>Nessuna crisi nei dati</h3></div><p style="color:var(--muted)">Il file va dal ${fmtDate(ds.dates[0],f)} al ${fmtDate(ds.dates[ds.dates.length-1],f)} e non contiene nessuna delle cinque crisi della libreria. Non le ricostruisco con shock inventati: puoi usare <b>Il tuo shock</b> qui sotto, oppure caricare un file con una storia più lunga.</p>`;S.stress.series=null;return;}
  const S2=crisisSeries(c,Math.max(3,Math.round(c.periods*.6)));S.stress.series=S2.pf;
  const live=ds.assets.map((a,i)=>i).filter(i=>R.w[i]>0&&c.assets[i].n),byRet=[...live].sort((a,b)=>c.assets[a].ret-c.assets[b].ret);
  const worst=byRet[0],best=byRet[byRet.length-1],cell=(k,v,cl="")=>`<button type="button" class="cellbtn ${cl}" data-rc="st-${k}-${c.id}">${v}</button>`;
  const rec=c.recK!=null?stPer(c.recPeriods,f):c.troughK==null?"nessun calo":"non ancora";
  const corrTxt=Number.isFinite(c.corrIn)?`Durante la crisi la correlazione media tra i tuoi asset è stata <b>${fmtN(c.corrIn)}</b>, contro <b>${fmtN(R.avgAll)}</b> sull'intero periodo${c.corrIn>R.avgAll+.1?": nei momenti peggiori gli asset si sono mossi più insieme e la diversificazione ha protetto meno.":c.corrIn<R.avgAll-.1?": in questa crisi gli asset si sono mossi meno insieme del solito.":"."}`:`Correlazioni durante la crisi non calcolabili: servono almeno 6 periodi, qui ce ne sono ${c.used}.`;
  el.innerHTML=`<div class="head"><div><span class="eyebrow">${fmtDate(c.from,f)} – ${fmtDate(c.to,f)} · ${unitN(c.periods,f)}${c.status==="partial"?" · dati parziali":""}</span><h3 style="margin-top:4px">${esc(c.name)}</h3></div></div>
    <p style="color:var(--muted);margin:4px 0 10px">${esc(c.what)}</p>
    <div class="st-kpis">
      <div class="k"><span>Perdita massima</span>${cell("mdd",fmtPct(c.mdd,1),"neg")}</div>
      <div class="k"><span>Rendimento nella crisi</span>${cell("ret",fmtPct(c.ret,1,true),c.ret<0?"neg":"")}</div>
      <div class="k"><span>Tempo per toccare il fondo</span>${cell("trough",c.troughK==null?"—":stPer(c.toTrough,f))}</div>
      <div class="k"><span>Recupero dal minimo</span>${cell("rec",rec)}</div>
    </div>
    <div class="st-two"><div><div class="chartbox" id="stPath"></div><div class="legend" id="stPathLeg" style="margin-top:8px"></div></div>
      <div><div class="tablewrap"><table class="mt mc-t"><thead><tr><th>Asset</th><th>Nella crisi</th><th>Max drawdown</th><th>Contributo</th></tr></thead><tbody>
      <tr class="pf"><td><span class="an"><i style="background:var(--lime)"></i>Portafoglio</span></td><td>${cell("ret",fmtPct(c.ret,1,true),c.ret<0?"neg":"")}</td><td>${cell("mdd",fmtPct(c.mdd,1),"neg")}</td><td>${cell("ret",fmtPct(c.ret,1,true))}</td></tr>
      ${live.map(i=>`<tr><td><span class="an"><i style="background:${color(i)}"></i>${esc(ds.assets[i].name)}</span></td><td>${cell("aret-"+i,fmtPct(c.assets[i].ret,1,true),c.assets[i].ret<0?"neg":"")}</td><td>${cell("amdd-"+i,fmtPct(c.assets[i].mdd,1),c.assets[i].mdd<0?"neg":"")}</td><td>${cell("ctr-"+i,fmtPct(c.contrib[i],1,true),c.contrib[i]<0?"neg":"")}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="caption" style="margin-top:10px">${live.length>1?`Il più colpito è stato <b>${esc(ds.assets[worst].name)}</b> (${fmtPct(c.assets[worst].ret,1,true)}), il più resistente <b>${esc(ds.assets[best].name)}</b> (${fmtPct(c.assets[best].ret,1,true)}). `:""}Il contributo è la parte della perdita del portafoglio dovuta a ogni asset: la somma dà il rendimento nella crisi.</p>
      <p class="caption">${corrTxt}</p></div></div>`;
  drawCrisisPath(c,S2);
}
function drawCrisisPath(c,S2){
  const ds=S.ds,f=ds.freq.f,ks=S2.ks,n=ks.length,VW=640,VH=280,ml=46,mr=12,mt=14,mb=28,iw=VW-ml-mr,ih=VH-mt-mb;
  const all=[S2.pf,...S2.assets.filter(Boolean)].flat().filter(Number.isFinite),lo=Math.min(...all,1)*.98,hi=Math.max(...all,1)*1.02;
  const X=j=>ml+(n>1?j/(n-1):0)*iw,Y=v=>mt+ih-(v-lo)/((hi-lo)||1)*ih,j0=1,j1=ks.indexOf(c.idx[c.idx.length-1]);
  let g=`<rect x="${X(j0-1)}" y="${mt}" width="${X(j1)-X(j0-1)}" height="${ih}" fill="var(--bad)" opacity=".08"/><text x="${X(j0-1)+6}" y="${mt+14}" style="fill:var(--bad)">crisi</text>`;
  niceTicks(lo-1,hi-1,4).forEach(v=>{const y=Y(1+v);if(y>=mt&&y<=mt+ih)g+=`<line x1="${ml}" x2="${VW-mr}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)"/><text x="${ml-6}" y="${(y+4).toFixed(1)}" text-anchor="end">${fmtPct(Math.abs(v)<1e-9?0:v,0,true)}</text>`;});
  g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Y(1)}" y2="${Y(1)}" stroke="var(--muted)" stroke-dasharray="3 4"/>`;
  [0,Math.floor((n-1)/2),n-1].forEach(j=>{g+=`<text x="${X(j).toFixed(1)}" y="${VH-8}" text-anchor="${j===0?"start":j===n-1?"end":"middle"}">${fmtDate(ds.dates[ks[j]],f)}</text>`;});
  const line=(arr,st,k)=>{let d="";arr.forEach((v,j)=>{d+=(j?"L":"M")+X(j).toFixed(1)+","+Y(v).toFixed(1);});return `<path d="${d}" fill="none" ${st} pathLength="1" class="draw" style="--k:${k}"/>`;};
  S2.assets.forEach((s,i)=>{if(s)g+=line(s,`stroke="${color(i)}" stroke-width="1.6" opacity=".85"`,i+1);});
  g+=line(S2.pf,`stroke="var(--lime)" stroke-width="3.2"`,0);
  if(c.troughK!=null){const j=ks.indexOf(c.troughK),v=S2.pf[j];g+=`<circle cx="${X(j)}" cy="${Y(v)}" r="5" fill="var(--bad)" class="endpt" style="--k:0"/><text x="${X(j)+8}" y="${Y(v)+16}" style="fill:var(--fg);font-weight:600">${fmtPct(c.mdd,1)}</text>`;}
  if(c.recK!=null&&ks.includes(c.recK)){const j=ks.indexOf(c.recK);g+=`<circle cx="${X(j)}" cy="${Y(S2.pf[j])}" r="5" fill="var(--good)" class="endpt" style="--k:1"/><text x="${X(j)-8}" y="${Y(S2.pf[j])-10}" text-anchor="end" style="fill:var(--good);font-weight:600">recuperato</text>`;}
  $("#stPath").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Valore del portafoglio e degli asset durante ${esc(c.name)}, base 100 all'inizio">${g}</svg>`;
  $("#stPathLeg").innerHTML=`<span><i style="background:var(--lime)"></i>Portafoglio</span>`+S2.assets.map((s,i)=>s?`<span><i style="background:${color(i)}"></i>${esc(ds.assets[i].name)}</span>`:"").join("");
}
function drawCrisisCompare(){
  const R=S.stress,ds=S.ds,rows=R.list.filter(c=>c.status!=="out"&&c.used);
  if(!rows.length){$("#stCompare").innerHTML=`<p style="color:var(--muted)">Nessuna crisi della libreria è nei dati del file.</p>`;$("#stCompareCap").textContent="";return;}
  const VW=900,rh=46,mt=10,VH=mt+rows.length*rh+30,ml=190,mr=20,iw=VW-ml-mr;
  const vals=rows.flatMap(c=>[c.mdd,c.ret,...c.assets.filter((a,i)=>R.w[i]>0).map(a=>a.ret)]).filter(Number.isFinite);
  const lo=Math.min(-.05,...vals)*1.08,hi=Math.max(.02,...vals)*1.08,X=v=>ml+(v-lo)/(hi-lo)*iw;
  let g="";niceTicks(lo,hi,6).filter(v=>v>=lo&&v<=hi).forEach(v=>{g+=`<line x1="${X(v)}" x2="${X(v)}" y1="${mt}" y2="${VH-24}" stroke="var(--line)"/><text x="${X(v)}" y="${VH-8}" text-anchor="middle">${fmtPct(v,0)}</text>`;});
  g+=`<line x1="${X(0)}" x2="${X(0)}" y1="${mt}" y2="${VH-24}" stroke="var(--muted)"/>`;
  rows.forEach((c,r)=>{const y=mt+r*rh+rh/2;
    g+=`<text x="${ml-12}" y="${y+4}" text-anchor="end" style="fill:var(--fg);font-family:var(--f-body);font-size:13px;font-weight:700">${esc(c.name)}</text>`;
    g+=`<rect class="grow" style="--k:${r}" x="${Math.min(X(0),X(c.mdd))}" y="${y-11}" width="${Math.abs(X(c.mdd)-X(0))}" height="22" rx="6" fill="var(--bad)" opacity=".8"><title>Perdita massima del portafoglio ${fmtPct(c.mdd,1)}</title></rect>`;
    g+=`<line x1="${X(c.ret)}" x2="${X(c.ret)}" y1="${y-15}" y2="${y+15}" stroke="var(--lime)" stroke-width="3"><title>Rendimento nella crisi ${fmtPct(c.ret,1,true)}</title></line>`;
    c.assets.forEach((a,i)=>{if(R.w[i]>0&&Number.isFinite(a.ret))g+=`<circle cx="${X(a.ret)}" cy="${y}" r="5" fill="${color(i)}" stroke="var(--solid)" stroke-width="1.5"><title>${esc(ds.assets[i].name)}: ${fmtPct(a.ret,1,true)}</title></circle>`;});});
  $("#stCompare").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Confronto tra le crisi: perdita massima del portafoglio e rendimento di ogni asset">${g}</svg>`;
  const worst=rows.reduce((a,b)=>b.mdd<a.mdd?b:a);
  $("#stCompareCap").innerHTML=`Barra rossa: perdita massima del portafoglio. Linea lime: rendimento a fine crisi. Pallini: rendimento di ogni asset nella stessa finestra. La crisi peggiore per questo portafoglio è <b>${esc(worst.name)}</b> (${fmtPct(worst.mdd,1)}).`;
}
/* Cigni neri: scenari estremi IPOTETICI, scelti apposta più duri della storia del file. Non sono previsioni.
   Ogni scenario dà uno shock istantaneo per classe di attivo; la classe di ogni asset viene dalla scheda del fondo o dal nome. */
const SWANS=[
  {id:"crash",n:"Crollo azionario profondo",d:"Le borse perdono quanto nel 1929–32, ma tutto insieme. I titoli di Stato fanno da rifugio.",sh:{eq:-.60,tech:-.70,bond:.04,gov:.08,gold:.12,cash:0}},
  {id:"stag",n:"Stagflazione",d:"Inflazione alta e economia ferma, come negli anni '70: scendono sia azioni sia obbligazioni, sale l'oro.",sh:{eq:-.35,tech:-.45,bond:-.20,gov:-.18,gold:.35,cash:0}},
  {id:"liq",n:"Tutto giù insieme",d:"Panico e corsa alla liquidità: per qualche settimana si vende tutto, anche i rifugi (marzo 2020, ma peggio).",sh:{eq:-.38,tech:-.42,bond:-.12,gov:-.06,gold:-.12,cash:0}},
  {id:"debt",n:"Crisi del debito pubblico",d:"Gli investitori smettono di fidarsi degli Stati: crollano i titoli di Stato e con loro le banche e le borse.",sh:{eq:-.30,tech:-.30,bond:-.20,gov:-.28,gold:.20,cash:-.02}},
  {id:"tech",n:"Scoppia la bolla tecnologica",d:"Come nel 2000–2002 ma più concentrato: le grandi aziende tecnologiche USA perdono tre quarti del valore.",sh:{eq:-.40,tech:-.75,bond:.03,gov:.06,gold:.05,cash:0}}
];
const SW_L={eq:"Azioni",tech:"Azioni tecnologiche",bond:"Obbligazioni",gov:"Titoli di Stato",gold:"Oro e materie prime",cash:"Liquidità"};
function swanClass(i){
  const ds=S.ds,a=ds.assets[i],pos=S.portfolio?S.portfolio.positions:[],q=pos.find(p=>(p.ticker||p.nome)===a.name);
  const e=q&&q.etf&&!q.etf.error?q.etf:null,c=e?P.etfClass(e):null,t=[a.name,q&&q.nome,e&&e.nome,e&&e.indice,e&&e.focus].filter(Boolean).join(" ").toLowerCase();
  if(c==="Monetario"||/overnight|money market|monetari|liquidit|xeon|\bcash\b/.test(t))return "cash";
  if(c==="Materie prime"||/\bgold\b|\boro\b|4gld|sgln|commodit|silver|argento/.test(t))return "gold";
  if(c==="Obbligazioni"||/bond|obblig|aggregate|treasury|govt|government|ieag|ibgs|aggh|btp|bund/.test(t))return /govt|government|treasury|titoli di stato|btp|bund|sovereign|ibgs/.test(t)&&!/aggregate|corporate/.test(t)?"gov":"bond";
  if(/nasdaq|technolog|tecnolog|\btech\b|semiconductor|cndx|csndx|eqqq/.test(t))return "tech";
  return "eq";
}
function renderSwans(){
  const el=$("#stSwan");if(!el||!S.stress)return;
  const ds=S.ds,R=S.stress,cap=+S.st.cap||0,cls=ds.assets.map((a,i)=>swanClass(i));
  const rows=SWANS.map(sw=>{const r=cls.map(c=>sw.sh[c]),imp=P.stressImpact(R.w,r);return {sw,r,tot:imp.total};});
  const worst=rows.reduce((a,b)=>b.tot<a.tot?b:a);
  el.innerHTML=`<div class="head"><div><span class="eyebrow">Scenari estremi ipotetici</span><h3 style="margin-top:4px">E se arrivasse un cigno nero?</h3></div></div>
    <p class="sw-intro">Un <b>cigno nero</b>, nel senso di Nassim Taleb, è un evento raro, quasi impossibile da prevedere e con conseguenze enormi: per definizione non è nei dati del passato. Questi cinque scenari sono <b>inventati apposta</b>, più duri delle crisi vere, per chiederti: «se succedesse domani, quanto perderei, e lo reggerei?».</p>
    <div class="sw-grid">${rows.map(({sw,r,tot})=>`<div class="sw ${sw===worst.sw?"worst":""}"><div class="sw-h"><b>${esc(sw.n)}</b><span class="${tot<0?"dn":"up"}">${fmtPct(tot,1,true)}</span></div>
      <p>${esc(sw.d)}</p>
      <div class="sw-eur">${cap>0?`su ${fmtEur(cap)}: <b class="${tot<0?"dn":"up"}">${tot<0?"−":"+"}${fmtEur(Math.abs(cap*tot))}</b>`:""}</div>
      <ul>${[...new Set(cls)].map(c=>`<li><span>${SW_L[c]}</span><b>${fmtPct(sw.sh[c],0,true)}</b></li>`).join("")}</ul>
      <button type="button" class="btn sm" data-swan="${sw.id}">Prova nel tuo shock ↓</button></div>`).join("")}</div>
    <p class="caption">Classe di ogni strumento: ${ds.assets.map((a,i)=>`${esc(a.name)} = ${SW_L[cls[i]].toLowerCase()}`).join(" · ")}. Shock istantanei, senza recupero e senza ribilanciamento: è il colpo del primo momento. Il peggiore per questo portafoglio è <b>${esc(worst.sw.n.toLowerCase())}</b>.</p>`;
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-swan]");if(!b||!S.st)return;const sw=SWANS.find(x=>x.id===b.dataset.swan);if(!sw)return;
  S.st.shock=S.ds.assets.map((a,i)=>String(Math.round(sw.sh[swanClass(i)]*1000)/10));S.st.prop=false;const pc=$("#stProp");if(pc)pc.checked=false;renderShock(true);
  $("#stCustom").scrollIntoView({behavior:REDUCE?"auto":"smooth",block:"start"});});
/* Shock ipotetico */
function shockValues(){
  const st=S.st,R=S.stress,v=st.shock.map(x=>{const n=parseFloat(String(x).replace(",","."));return Number.isFinite(n)?n/100:NaN;});
  if(!v.some(Number.isFinite))return {r:v.map(()=>0),implied:v.map(()=>false),none:true};
  return st.prop?P.conditionalShock(R.C,v):{r:v.map(x=>Number.isFinite(x)?x:0),implied:v.map(()=>false)};
}
function renderShock(rebuild){
  if(!rebuild)renderSwans(); // il controvalore in euro dei cigni neri segue il capitale scritto qui
  const ds=S.ds,R=S.stress,st=S.st;
  if(rebuild){
    $("#stShocks").innerHTML=ds.assets.map((a,i)=>R.w[i]>0?`<div class="st-row"><label class="nm" for="sh${i}"><i style="background:${color(i)}"></i>${esc(a.name)}</label><input id="sh${i}" data-sh="${i}" type="text" inputmode="decimal" placeholder="—" value="${esc(st.shock[i])}" aria-label="Shock su ${esc(a.name)} in percentuale"><span class="imp" id="shi${i}"></span></div>`:"").join("");
    $("#stProp").checked=st.prop;$("#stCap").value=st.cap;
  }
  const s=shockValues(),imp=P.stressImpact(R.w,s.r),cap=st.cap;
  ds.assets.forEach((a,i)=>{const el=$("#shi"+i),inp=$("#sh"+i);if(!el)return;el.className="imp"+(s.implied[i]&&!s.none?" auto":"");el.textContent=s.none?"":`${s.implied[i]?"≈ ":""}${fmtPct(s.r[i],1,true)}`;if(inp)inp.placeholder=s.implied[i]&&!s.none?fmtN(s.r[i]*100,1):"—";});
  const live=ds.assets.map((a,i)=>i).filter(i=>R.w[i]>0),mx=Math.max(...live.map(i=>Math.abs(imp.contrib[i])),1e-9);
  $("#stRes").innerHTML=s.error?`<div class="msg err">${esc(s.error)}</div>`:s.none?`<span class="eyebrow">Impatto sul portafoglio</span><p style="color:var(--muted);margin-top:10px">Scrivi uno shock, per esempio <b>-30</b> accanto a un asset azionario, oppure scegli uno scenario pronto.</p>`
    :`<span class="eyebrow">Impatto sul portafoglio</span><button type="button" class="cellbtn hit ${imp.total<0?"neg":"pos"}" data-rc="st-shock-p-x" style="border:0;margin:6px 0 0;padding:0">${fmtPct(imp.total,1,true)}</button>
      <div class="eur">${imp.total<0?"−":"+"}${fmtEur(Math.abs(imp.total*cap))} su ${fmtEur(cap)}</div>
      ${live.map(i=>`<div class="cbar"><span class="nm">${esc(ds.assets[i].name)}</span><div class="bars"><div class="b r"><i style="width:${(Math.abs(imp.contrib[i])/mx*100).toFixed(1)}%;background:${imp.contrib[i]<0?"var(--bad)":"var(--good)"}"></i><button type="button" data-rc="st-shock-${i}-x">${fmtPct(imp.contrib[i],1,true)}</button></div></div></div>`).join("")}
      <p class="caption" style="margin-top:10px">Contributo = peso × shock. ${s.implied.some((x,i)=>x&&R.w[i]>0)?"I valori con ≈ sono stimati dalla covarianza storica: è come si sono mossi in media insieme agli asset colpiti, non una certezza.":"Nessun asset stimato: ogni shock è scritto da te."}</p>`;
}
document.addEventListener("input",e=>{
  const i=e.target.dataset&&e.target.dataset.sh;if(i!==undefined&&S.st){S.st.shock[+i]=e.target.value;renderShock(false);return;}
  if(e.target.id==="stCap"&&S.st){const v=parseFloat(e.target.value);S.st.cap=Number.isFinite(v)&&v>=0?v:0;renderShock(false);}
});
document.addEventListener("change",e=>{if(e.target.id==="stProp"&&S.st){S.st.prop=e.target.checked;renderShock(false);}});
document.addEventListener("click",e=>{
  const c=e.target.closest("[data-crisis]");if(c&&!c.disabled&&S.st&&!c.closest("#bs-root")){S.st.sel=c.dataset.crisis;document.querySelectorAll("[data-crisis]").forEach(b=>b.setAttribute("aria-pressed",String(b===c)));renderCrisisDetail();Morph.shape("stress");return;}
  const p=e.target.closest("[data-stp]");if(!p||!S.st)return;
  const ds=S.ds,R=S.stress,k=p.dataset.stp;
  if(k==="all20")S.st.shock=ds.assets.map(()=>"-20");
  else if(k==="vol2")S.st.shock=ds.assets.map((a,i)=>Number.isFinite(S.lab.st[i].vol)?fmtN(-2*S.lab.st[i].vol*100,1):"");
  else if(k==="worst"){const u=R.list.filter(x=>x.status!=="out"&&x.used);if(!u.length){$("#stRes").innerHTML=`<div class="msg err">Nessuna crisi della libreria è nei dati: non posso ripeterla.</div>`;return;}
    const w=u.reduce((a,b)=>b.mdd<a.mdd?b:a);S.st.shock=ds.assets.map((a,i)=>Number.isFinite(w.assets[i].ret)?fmtN(w.assets[i].ret*100,1):"");S.st.preset=w.name;}
  else S.st.shock=ds.assets.map(()=>"");
  renderShock(true);
});
function renderStNotes(){
  const ds=S.ds,f=ds.freq.f;
  $("#stNotes").innerHTML=[
    `<b>Crisi storiche</b>: finestre dal massimo al minimo dell'azionario globale (date indicative). I numeri usano solo i rendimenti del tuo file in quelle date; le crisi fuori dai dati non vengono stimate.`,
    `<b>Crisi fuori dal file</b>: ${S.bnCr?`le schede mostrano anche ${esc(S.bnCr.label)} su tutta la sua storia (cambia indice nella sezione Benchmark). Cliccando una crisi che il file non copre vedi solo il mercato, mai un portafoglio ricostruito.`:"se scegli un benchmark nella sezione Benchmark, le schede mostrano anche come si è mosso il mercato."}`,
    `<b>Frequenza</b>: con dati ${ds.freq.adj} ${f<=12?"la finestra comprende mesi interi, quindi il minimo può differire da quello giornaliero.":"la finestra segue le date esatte di massimo e minimo."}`,
    `<b>Pesi di oggi applicati al passato</b>: il portafoglio è ribilanciato a ogni periodo con i pesi scelti. Nella realtà allora avresti potuto avere altri asset o altri pesi.`,
    `<b>Contributo alla perdita</b>: cᵢ = Σ wᵢ · rᵢ,ₜ · Vₜ₋₁; la somma dei contributi è il rendimento del portafoglio nella crisi.`,
    `<b>Shock ipotetico istantaneo</b>: applicato tutto in un colpo, senza ribilanciamento né recupero.`,
    `<b>Propagazione</b>: gli asset senza shock si muovono di r = Σ_UK · Σ_KK⁻¹ · s (attesa condizionata con la covarianza dell'intero periodo). Nelle crisi le correlazioni di solito salgono: la stima può essere ottimista.`,
    `<b>Tassi, inflazione, cambio</b>: servono sensibilità che il file non contiene (duration, esposizione valutaria). Puoi tradurli tu in shock per asset: per esempio obbligazioni con duration 7 e tassi +2% ≈ −14%.`,
    `<b>Non è una previsione</b>: mostra come il portafoglio ha reagito o reagirebbe a eventi estremi, non cosa succederà.`
  ].map(x=>`<li>${x}</li>`).join("");
}
function stReceipt(m,a,b){
  const R=S.stress,ds=S.ds,f=ds.freq.f;
  if(m==="shock"){const s=shockValues(),imp=P.stressImpact(R.w,s.r);
    if(a==="p")return {title:"Impatto dello shock sul portafoglio",value:fmtPct(imp.total,2,true),formula:"Δₚ = Σ wᵢ · sᵢ\n"+(S.st.prop?"sᵢ stimato (≈) = Σ_iK · Σ_KK⁻¹ · s_K   (covarianza storica)":"sᵢ = shock scritto (0 se vuoto)"),kv:[...ds.assets.map((x,i)=>R.w[i]>0?[x.name,`peso ${fmtPct(R.w[i],1)} × shock ${fmtPct(s.r[i],1,true)}${s.implied[i]?" (stimato)":""}`]:null).filter(Boolean),["Impatto in euro",fmtEur(imp.total*S.st.cap)]]};
    const i=+a;return {title:`Contributo allo shock · ${ds.assets[i].name}`,value:fmtPct(imp.contrib[i],2,true),formula:"cᵢ = wᵢ · sᵢ",kv:[["Peso",fmtPct(R.w[i],1)],["Shock",fmtPct(s.r[i],2,true)+(s.implied[i]?" · stimato dalla covarianza":" · scritto da te")]]};}
  const c=R.list.find(x=>x.id===(b&&R.list.some(y=>y.id===b)?b:a));const id=c.id,i=+a;
  const base=[["Finestra",`${fmtDate(c.from,f)} – ${fmtDate(c.to,f)}`],["Periodi nella finestra",c.periods],["Periodi con dati",c.used],["Pesi",R.label]];
  const M={
    mdd:{t:"Perdita massima nella crisi",v:fmtPct(c.mdd,2),fx:"Vₜ = Π (1 + rₚ) dall'inizio della finestra\nDD = min ( Vₜ / max(V) − 1 )",kv:[["Minimo",c.troughK!=null?fmtDate(ds.dates[c.troughK],f):"—"]]},
    ret:{t:"Rendimento nella crisi",v:fmtPct(c.ret,2,true),fx:"R = Π (1 + rₚ,ₜ) − 1   sui periodi della finestra\nrₚ = Σ wᵢ · rᵢ",kv:[]},
    trough:{t:"Tempo per toccare il fondo",v:stPer(c.toTrough,f),fx:"periodi dall'inizio della finestra al minimo",kv:[["Minimo",c.troughK!=null?fmtDate(ds.dates[c.troughK],f):"—"]]},
    rec:{t:"Tempo di recupero",v:c.recK!=null?stPer(c.recPeriods,f):"non recuperato",fx:"periodi dal minimo al ritorno sul massimo precedente\ncercato anche dopo la fine della finestra, fino alla fine dei dati",kv:[["Recuperato a",c.recK!=null?fmtDate(ds.dates[c.recK],f):"non nei dati"]]},
    aret:{t:`Rendimento nella crisi · ${ds.assets[i]&&ds.assets[i].name}`,v:c.assets[i]?fmtPct(c.assets[i].ret,2,true):"—",fx:"R = Π (1 + rᵢ,ₜ) − 1",kv:[["Periodi con dati",c.assets[i]?c.assets[i].n:"—"]]},
    amdd:{t:`Max drawdown nella crisi · ${ds.assets[i]&&ds.assets[i].name}`,v:c.assets[i]?fmtPct(c.assets[i].mdd,2):"—",fx:"DD = min ( Vₜ / max(V) − 1 )",kv:[]},
    ctr:{t:`Contributo alla perdita · ${ds.assets[i]&&ds.assets[i].name}`,v:fmtPct(c.contrib[i],2,true),fx:"cᵢ = Σₜ wᵢ · rᵢ,ₜ · Vₜ₋₁\nΣ cᵢ = rendimento del portafoglio nella crisi",kv:[["Peso",fmtPct(R.w[i],1)],["Rendimento dell'asset",fmtPct(c.assets[i].ret,2,true)],["Rendimento del portafoglio",fmtPct(c.ret,2,true)]]}
  }[m]||{t:m,v:"—",fx:"",kv:[]};
  return {title:`${M.t} · ${c.name}`,value:M.v,formula:M.fx,kv:[...M.kv,...base]};
}

/* ---------- Frontiera efficiente e ottimizzatore (Modulo 5) ---------- */
const OP_L={sharpe:"massimo Sharpe",minvar:"minima volatilità",rp:"risk parity",eq:"pesi uguali",tvol:"volatilità target",tret:"rendimento target"};
function opBase(){
  const ds=S.ds,k=ds.assets.length,w=S.portfolio?pfWeights("now"):null;
  return w?{w,label:"pesi attuali"}:{w:ds.assets.map(()=>1/k),label:"pesi uguali"};
}
function opEval(w,inp,rf){
  const ds=S.ds,f=ds.freq.f,p=P.pStats(w,inp.mu,inp.C),pa=pfAsset(w,"p"),st=P.stats(pa,f,ds.dates),rk=P.riskStats(pa.ret,f,rf);
  return {w,ret:p.ret,vol:p.vol,sharpe:p.vol>0?(p.ret-rf)/p.vol:NaN,cagr:st.cagr,mdd:st.mdd,var95:rk.var95,n:st.n};
}
function opSolve(a){
  /* a = {mode,target(decimale),min,max} → {O,chosen,note} ; usato dalla sezione e da Quanta */
  const ds=S.ds,f=ds.freq.f,mm=macroFor(S.rfSrc),rf=mm?mm.rf:0,inp=P.annualInputs(ds.assets,f),k=ds.assets.length;
  /* rendimenti attesi prudenti (Bayes-Stein) salvo scelta diversa: le medie storiche da sole premiano chi è andato meglio per caso */
  const prudent=a.prudent!==undefined?a.prudent:!(S.opIn&&S.opIn.prudent===false);
  inp.rawMu=inp.mu.slice();inp.bs=P.bayesStein(ds.assets,f);if(prudent)inp.mu=inp.bs.mu;inp.prudent=prudent;
  if(inp.common<12)return {error:`Servono almeno 12 periodi in cui tutti gli asset hanno un valore: qui ce ne sono ${inp.common}.`};
  const O=P.optimize({mu:inp.mu,C:inp.C,rf,min:a.min,max:a.max});if(O.error)return {error:O.error};
  let ch,note="";
  if(a.mode==="minvar")ch=O.minVar;
  else if(a.mode==="rp"){ch={w:P.riskParity(inp.C)};if(ch.w.some((x,i)=>x<O.lo[i]-1e-6||x>O.hi[i]+1e-6))note="La risk parity non rispetta i limiti di peso: per definizione i pesi dipendono solo dai rischi.";}
  else if(a.mode==="eq"){ch={w:ds.assets.map(()=>1/k)};if(ch.w.some((x,i)=>x<O.lo[i]-1e-6||x>O.hi[i]+1e-6))note="Pesi uguali fuori dai limiti impostati.";}
  else if(a.mode==="tvol"||a.mode==="tret"){const key=a.mode==="tvol"?"vol":"ret";ch=O.target(key,a.target);
    if(ch.clamped)note=`Il target ${fmtPct(a.target,1)} è ${ch.clamped==="low"?"sotto il minimo":"sopra il massimo"} raggiungibile con questi vincoli: uso ${ch.clamped==="low"?"il portafoglio di minima volatilità":"il portafoglio a rendimento massimo"}.`;}
  else ch=O.maxSharpe;
  return {O,inp,rf,mm,chosen:ch.w,note};
}
function renderOpt(){
  const box=$("#opBox"),empty=$("#opEmpty");
  if(!S.lab||!S.ds||!S.ds.ok||S.ds.assets.length<2){box.hidden=true;empty.hidden=false;if(S.lab&&S.ds&&S.ds.assets.length<2)empty.querySelector("p").textContent="Con un solo asset non c'è niente da combinare: la frontiera serve almeno due asset.";return;}
  box.hidden=false;empty.hidden=true;
  const ds=S.ds,f=ds.freq.f;
  if(!S.opIn){S.opIn={mode:"sharpe",target:null,min:0,max:100,short:false,prudent:true};$("#opMin").value=0;$("#opMax").value=100;$("#opShort").checked=false;$("#opPrudent").checked=true;}
  const I=S.opIn,base=opBase();
  document.querySelectorAll("#opMode [data-opm]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.opm===I.mode)));
  const tgt=I.mode==="tvol"||I.mode==="tret";$("#opTargetL").style.display=tgt?"":"none";
  const R=opSolve({mode:I.mode,target:I.target==null?NaN:I.target/100,min:I.short?I.min/100:Math.max(0,I.min/100),max:I.max/100});
  if(!R.error&&tgt&&I.target==null){const b=opEval(base.w,R.inp,R.rf);I.target=+((I.mode==="tvol"?b.vol:b.ret)*100).toFixed(1);$("#opTarget").value=I.target;return renderOpt();}
  if(tgt){$("#opTargetLbl").textContent=I.mode==="tvol"?"Volatilità target (%)":"Rendimento target (%)";if(document.activeElement!==$("#opTarget"))$("#opTarget").value=I.target;}
  if(R.error){$("#opKpis").innerHTML=`<div class="kpi"><span class="eyebrow">Impossibile ottimizzare</span><span class="v txt">${esc(R.error)}</span>${rebuildHint()}</div>`;["#opChart","#opCmp","#opWeights","#opLegend"].forEach(id=>$(id).innerHTML="");$("#opCap").textContent="";S.opt=null;return;}
  const A=opEval(base.w,R.inp,R.rf),B=opEval(R.chosen,R.inp,R.rf);
  S.opt={...R,A,B,base,modeLabel:OP_L[I.mode],lo:R.O.lo,hi:R.O.hi};
  const yrs=R.inp.common/f,ci=Number.isFinite(B.vol)?1.96*B.vol/Math.sqrt(Math.max(yrs,1e-9)):NaN;S.opCI={yrs,ci};
  $("#opSub").textContent=`${ds.assets.length} asset, ${R.inp.common} periodi comuni${yrs<5?` (solo ${fmtN(yrs,1)} anni: stime molto incerte)`:""}. Rendimenti attesi ${R.inp.prudent?`prudenti (Bayes-Stein, avvicinati del ${fmtPct(R.inp.bs.phi,0)} alla media ${fmtPct(R.inp.bs.mu0,1)})`:"storici"}. Obiettivo: ${OP_L[I.mode]}${tgt?` ${fmtPct(I.target/100,1)}`:""}, pesi tra ${fmtPct(R.O.lo[0],0)} e ${fmtPct(R.O.hi[0],0)}${R.rf?`, tasso privo di rischio ${fmtPct(R.rf,2)}`:""}.`;
  const d=(x,y,inv,pp)=>{const v=y-x;if(!Number.isFinite(v)||Math.abs(v)<(pp?.0005:.005))return "uguale a prima";const good=inv?v<0:v>0;return `<span class="${good?"up":"dn"}">${v>0?"+":"−"}${pp?fmtN(Math.abs(v)*100,1)+" punti":fmtN(Math.abs(v))}</span> rispetto a prima`;};
  const btn=(k,v)=>`<button type="button" class="v" data-rc="op-${k}-o">${v}</button>`;
  $("#opKpis").innerHTML=[["Rendimento atteso",btn("ret",fmtPct(B.ret,1)),d(A.ret,B.ret,false,true)+(S.opCI&&Number.isFinite(S.opCI.ci)?`<br><span class="${S.opCI.ci>.15?"dn":""}">incertezza ±${fmtN(S.opCI.ci*100,0)} punti al 95% (${fmtN(S.opCI.yrs,1)} anni di dati)</span>`:"")],["Volatilità",btn("vol",fmtPct(B.vol,1)),d(A.vol,B.vol,true,true)],["Sharpe",btn("sharpe",fmtN(B.sharpe)),d(A.sharpe,B.sharpe,false,false)],["Max drawdown storico",btn("mdd",fmtPct(B.mdd,1)),d(A.mdd,B.mdd,false,true)]]
    .map(k=>`<div class="kpi"><span class="eyebrow">${k[0]}</span>${k[1]}<span class="sub">${k[2]}</span></div>`).join("");
  drawFrontier();renderOpCmp();renderOpWeights();renderOpNotes();
  $("#opUse").textContent=S.optW&&S.riskW==="opt"&&S.optW.w.every((x,i)=>Math.abs(x-B.w[i])<1e-9)?"Pesi in uso nelle altre analisi ✓":"Usa questi pesi nelle altre analisi";
  if(current==="opt")Morph.shape("opt");
}
function drawFrontier(){
  const O=S.opt,ds=S.ds,inp=O.inp,n=ds.assets.length,VW=900,VH=440,ml=58,mr=24,mt=18,mb=40,iw=VW-ml-mr,ih=VH-mt-mb;
  const cloud=S.opIn.short?[]:P.randomPortfolios(n,700,O.lo,O.hi,7).map(w=>P.pStats(w,inp.mu,inp.C));O.cloud=cloud;
  const F=O.O.frontier,assetsP=ds.assets.map((a,i)=>({vol:Math.sqrt(inp.C[i][i]),ret:inp.mu[i]}));
  /* assi zoomati sui dati: partire da 0% schiacciava tutto in un angolo */
  const pts=[...F,...assetsP,O.A,O.B,...cloud],vs=pts.map(p=>p.vol),rs=pts.map(p=>p.ret);let x0=Math.min(...vs),x1=Math.max(...vs),y0=Math.min(...rs),y1=Math.max(...rs);
  const xp=Math.max((x1-x0)*.1,.005),yp=Math.max((y1-y0)*.1,.005);x0=Math.max(0,x0-xp);x1+=xp;y0-=yp;y1+=yp;
  const X=v=>ml+(v-x0)/((x1-x0)||1)*iw,Y=v=>mt+ih-(v-y0)/((y1-y0)||1)*ih;
  const xd=x1-x0<.05?1:0,yd=y1-y0<.05?1:0;
  let g="";niceTicks(x0,x1,6).filter(v=>v>=x0&&v<=x1).forEach(v=>{g+=`<line x1="${X(v)}" x2="${X(v)}" y1="${mt}" y2="${mt+ih}" stroke="var(--line)"/><text x="${X(v)}" y="${VH-20}" text-anchor="middle">${fmtPct(v,xd)}</text>`;});
  niceTicks(y0,y1,5).filter(v=>v>=y0&&v<=y1).forEach(v=>{g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${ml-8}" y="${Y(v)+4}" text-anchor="end">${fmtPct(Math.abs(v)<1e-9?0:v,yd)}</text>`;});
  g+=`<text x="${ml+iw/2}" y="${VH-4}" text-anchor="middle">volatilità annua →</text><text transform="translate(14 ${mt+ih/2}) rotate(-90)" text-anchor="middle">rendimento atteso annuo →</text>`;
  cloud.forEach(p=>{g+=`<circle cx="${X(p.vol).toFixed(1)}" cy="${Y(p.ret).toFixed(1)}" r="2.2" fill="var(--c2)" opacity=".28"/>`;});
  const ms=O.O.maxSharpe,shp=ms.vol>0?(ms.ret-O.rf)/ms.vol:0;
  if(shp>0){let xs=x0,ys=O.rf+shp*xs;if(ys<y0){xs=(y0-O.rf)/shp;ys=y0;}let xe=x1,ye=O.rf+shp*xe;if(ye>y1){xe=(y1-O.rf)/shp;ye=y1;}
    if(xe>xs)g+=`<line x1="${X(xs).toFixed(1)}" y1="${Y(ys).toFixed(1)}" x2="${X(xe).toFixed(1)}" y2="${Y(ye).toFixed(1)}" stroke="var(--warn)" stroke-width="1.5" stroke-dasharray="6 5" opacity=".9"/>`;}
  let dF="";F.forEach((p,i)=>{dF+=(i?"L":"M")+X(p.vol).toFixed(1)+","+Y(p.ret).toFixed(1);});
  g+=`<path d="${dF}" fill="none" stroke="var(--lime)" stroke-width="3.5" stroke-linecap="round" pathLength="1" class="draw" style="--k:0"/>`;
  const LB=[];/* etichette da piazzare dopo, senza sovrapposizioni */
  assetsP.forEach((p,i)=>{g+=`<g class="pt"><circle cx="${X(p.vol)}" cy="${Y(p.ret)}" r="7" fill="${color(i)}" stroke="var(--solid)" stroke-width="2"/><title>${esc(ds.assets[i].name)}: rendimento ${fmtPct(p.ret,1)}, volatilità ${fmtPct(p.vol,1)}</title></g>`;
    LB.push({x:X(p.vol),y:Y(p.ret),r:8,t:ds.assets[i].name.length>22?ds.assets[i].name.slice(0,21)+"…":ds.assets[i].name,w:600});});
  const mv=O.O.minVar;g+=`<g class="pt"><circle cx="${X(mv.vol)}" cy="${Y(mv.ret)}" r="5" fill="var(--solid)" stroke="var(--lime)" stroke-width="2.5"/><title>Minima volatilità: ${fmtPct(mv.ret,1)} · ${fmtPct(mv.vol,1)}</title></g>`;
  if(shp>0)g+=`<g class="pt"><path d="${star(X(ms.vol),Y(ms.ret),9,4)}" fill="var(--warn)"/><title>Massimo Sharpe ${fmtN(shp)}: ${fmtPct(ms.ret,1)} · ${fmtPct(ms.vol,1)}</title></g>`;
  const a=O.A,b=O.B;
  g+=`<line x1="${X(a.vol)}" y1="${Y(a.ret)}" x2="${X(b.vol)}" y2="${Y(b.ret)}" stroke="var(--fg)" stroke-opacity=".5" stroke-width="1.5" stroke-dasharray="2 4"/>`;
  g+=`<g class="pt"><rect x="${X(a.vol)-7}" y="${Y(a.ret)-7}" width="14" height="14" transform="rotate(45 ${X(a.vol)} ${Y(a.ret)})" fill="var(--fg)" stroke="var(--solid)" stroke-width="2"/><title>Prima (${O.base.label}): ${fmtPct(a.ret,1)} · ${fmtPct(a.vol,1)}</title></g>`;
  g+=`<g class="pt"><circle cx="${X(b.vol)}" cy="${Y(b.ret)}" r="16" fill="var(--lime)" opacity=".22" class="endpt" style="--k:1"/><circle cx="${X(b.vol)}" cy="${Y(b.ret)}" r="8" fill="var(--lime)" stroke="var(--lime-ink)" stroke-width="2"/><title>Ottimizzato (${O.modeLabel}): ${fmtPct(b.ret,1)} · ${fmtPct(b.vol,1)}</title></g>`;
  LB.unshift({x:X(b.vol),y:Y(b.ret),r:12,t:O.modeLabel,w:700},{x:X(a.vol),y:Y(a.ret),r:10,t:O.base.label,w:400});
  const obst=[...LB.map(l=>({x:l.x-l.r,y:l.y-l.r,w:2*l.r,h:2*l.r})),{x:X(mv.vol)-6,y:Y(mv.ret)-6,w:12,h:12},...(shp>0?[{x:X(ms.vol)-9,y:Y(ms.ret)-9,w:18,h:18}]:[])];
  g+=placeLabels(LB,obst,{x:ml,y:mt,w:iw,h:ih});
  $("#opChart").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Frontiera efficiente: volatilità sull'asse orizzontale, rendimento atteso su quello verticale">${g}</svg>`;
  $("#opLegend").innerHTML=`<span><i style="background:var(--lime);height:4px"></i>frontiera efficiente</span>${cloud.length?`<span><i style="background:var(--c2);opacity:.5;height:8px;width:8px;border-radius:50%"></i>portafogli casuali</span>`:""}${shp>0?`<span><i style="background:var(--warn)"></i>linea di allocazione del capitale</span>`:""}<span><i style="background:var(--fg);height:8px;width:8px"></i>prima</span><span><i style="background:var(--lime);height:10px;width:10px;border-radius:50%"></i>ottimizzato</span>`;
  $("#opCap").textContent=`Ogni punto della linea continua è il massimo rendimento storico ottenibile per quel livello di volatilità, con i vincoli scelti. I puntini sono ${cloud.length?cloud.length+" portafogli casuali: nessuno sta sopra la frontiera.":"nascosti con le vendite allo scoperto."} ${shp>0?`La linea tratteggiata parte dal tasso privo di rischio (${fmtPct(O.rf,2)}${x0>0?", a volatilità zero, fuori dal riquadro ingrandito":""}) e tocca la frontiera nel portafoglio a massimo Sharpe (stella).`:""}`;
}
/* piazza ogni etichetta nella prima posizione libera intorno al suo punto (destra, sinistra, sopra, sotto, diagonali) */
function placeLabels(items,obst,B){
  const hit=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
  const placed=[],H=13;let out="";
  items.forEach(l=>{const w=l.t.length*6.9+4,g=l.r+4;
    const C=[[g,-H/2,"start"],[-g,-H/2,"end"],[0,-g-H,"middle"],[0,g,"middle"],[g,-g-H+2,"start"],[-g,-g-H+2,"end"],[g,g-2,"start"],[-g,g-2,"end"]];
    let best=null;
    for(const [dx,dy,an] of C){const bx=an==="start"?l.x+dx:an==="end"?l.x+dx-w:l.x-w/2,box={x:bx,y:l.y+dy,w,h:H};
      const out_=(box.x<B.x?B.x-box.x:0)+(box.x+w>B.x+B.w?box.x+w-B.x-B.w:0)+(box.y<B.y-6?B.y-6-box.y:0)+(box.y+H>B.y+B.h?box.y+H-B.y-B.h:0);
      const cost=out_*40+[...obst,...placed].reduce((s,o)=>s+hit(box,o),0);
      if(!best||cost<best.cost)best={cost,box,an,tx:an==="middle"?l.x:l.x+dx};if(cost===0)break;}
    placed.push(best.box);
    out+=`<text x="${best.tx.toFixed(1)}" y="${(best.box.y+H-3).toFixed(1)}" text-anchor="${best.an}" style="fill:var(--fg);font-weight:${l.w};paint-order:stroke;stroke:var(--solid);stroke-width:3px;stroke-linejoin:round">${esc(l.t)}</text>`;});
  return out;
}
function star(cx,cy,R,r){let d="";for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r:R;d+=(i?"L":"M")+(cx+rr*Math.cos(a)).toFixed(1)+","+(cy+rr*Math.sin(a)).toFixed(1);}return d+"Z";}
function renderOpCmp(){
  const O=S.opt,A=O.A,B=O.B,f=S.ds.freq.f,cell=(k,w,v,cl="")=>`<button type="button" class="cellbtn ${cl}" data-rc="op-${k}-${w}">${v}</button>`;
  const rows=[["ret","Rendimento atteso",x=>fmtPct(x,1),false,true],["vol","Volatilità",x=>fmtPct(x,1),true,true],["sharpe","Sharpe",x=>fmtN(x),false,false],["cagr","CAGR storico",x=>fmtPct(x,1,true),false,true],["mdd","Max drawdown storico",x=>fmtPct(x,1),false,true],["var95",`VaR 95% ${PER[f]||""}`,x=>fmtPct(-x,1),false,true]];
  $("#opCmp").innerHTML=`<thead><tr><th>Misura</th><th>Prima</th><th>Ottimizzato</th><th>Differenza</th></tr></thead><tbody>${rows.map(([k,l,fm,inv,pp])=>{const v=k==="var95"?A[k]-B[k]:B[k]-A[k],good=inv?v<0:v>0;
    return `<tr><td>${l}</td><td>${cell(k,"c",fm(A[k]))}</td><td>${cell(k,"o",fm(B[k]))}</td><td class="mono ${Math.abs(v)<1e-9?"":good?"up":"dn"}">${Math.abs(v)<1e-9?"=":(v>0?"+":"−")+(pp?fmtN(Math.abs(v)*100,1)+" pt":fmtN(Math.abs(v)))}</td></tr>`;}).join("")}</tbody>`;
}
function renderOpWeights(){
  const O=S.opt,ds=S.ds,mx=Math.max(...O.A.w.map(Math.abs),...O.B.w.map(Math.abs),.01);
  $("#opWLab").textContent=`${O.base.label} → ${O.modeLabel}`;
  $("#opWeights").innerHTML=`<div class="leg2"><span><i style="background:var(--c2)"></i>prima</span><span><i style="background:var(--lime)"></i>ottimizzato</span></div>`+ds.assets.map((a,i)=>`<div class="wcmp"><span class="nm">${esc(a.name)}</span><div class="bars">
    <div class="b"><i style="width:${(Math.abs(O.A.w[i])/mx*100).toFixed(1)}%;background:var(--c2)"></i><span>${fmtPct(O.A.w[i],0)}</span></div>
    <div class="b"><i style="width:${(Math.abs(O.B.w[i])/mx*100).toFixed(1)}%;background:${O.B.w[i]<0?"var(--bad)":"var(--lime)"}"></i><span>${fmtPct(O.B.w[i],0)}</span></div></div></div>`).join("")+(O.note?`<p class="caption" style="color:var(--warn)">${esc(O.note)}</p>`:"");
}
function renderOpNotes(){
  const O=S.opt,ds=S.ds,f=ds.freq.f;
  $("#opNotes").innerHTML=[
    O.inp.prudent?`<b>Rendimenti attesi prudenti (Bayes-Stein, Jorion 1986)</b>: ogni media storica dei ${O.inp.common} periodi comuni viene avvicinata del ${fmtPct(O.inp.bs.phi,0)} alla media del portafoglio a minima varianza (${fmtPct(O.inp.bs.mu0,1)} l'anno). Quanto avvicinarla lo decidono i dati: pochi anni o differenze piccole rispetto al rumore → più prudenza. Così l'ottimizzatore non si concentra su chi è andato meglio per caso. Puoi tornare alle medie storiche con l'interruttore.`:`<b>Rendimenti attesi = medie storiche</b>: μ è la media dei rendimenti ${ds.freq.adj} sui ${O.inp.common} periodi comuni × ${f}. È la parte più incerta: piccoli cambi nelle medie spostano molto i pesi ottimali. Per questo l'ottimizzatore tende a concentrarsi sugli asset andati meglio in passato.`,
    `<b>Rischio</b>: covarianza campionaria sugli stessi periodi, annualizzata (Σ × ${f}).`,
    `<b>Problema risolto</b>: min wᵀΣw − λ·μᵀw con Σw = 1 e limiti di peso, per 57 valori di λ (gradiente proiettato accelerato). Massimo Sharpe: ricerca a sezione aurea lungo la frontiera. Target: bisezione su λ.`,
    `<b>Minima volatilità e minima varianza</b> coincidono: minimizzare σ o σ² dà gli stessi pesi.`,
    `<b>Risk parity</b>: ogni asset porta la stessa quota di rischio (contributi uguali). Non usa i rendimenti attesi.`,
    `<b>Vincoli</b>: peso minimo, peso massimo e vendite allo scoperto. Limiti per categoria (azioni, obbligazioni, aree) richiedono una classificazione degli asset che il file non contiene.`,
    `<b>Confronto con prima</b>: rendimento, volatilità e Sharpe sono quelli del modello; CAGR, drawdown e VaR vengono dal portafoglio ottimizzato applicato agli stessi dati storici. È un confronto nel campione: l'ottimizzatore ha già "visto" questi dati, quindi il miglioramento è sovrastimato.`,
    `<b>Non è una previsione né un consiglio</b>: mostra l'allocazione che sarebbe stata efficiente nel passato del file, senza costi né tasse.`
  ].map(x=>`<li>${x}</li>`).join("");
}
function opReceipt(m,who){
  const O=S.opt,ds=S.ds,f=ds.freq.f,P0=who==="c"?O.A:O.B,lab=who==="c"?`Prima · ${O.base.label}`:`Ottimizzato · ${O.modeLabel}`;
  const fx={ret:"μₚ = Σ wᵢ · μᵢ    μᵢ = media dei rendimenti di periodo × f",vol:"σₚ = √( wᵀ Σ w )    Σ = covarianza di periodo × f",sharpe:"Sharpe = (μₚ − rf) / σₚ",cagr:"CAGR = [ Π (1 + rₚ) ]^(f / n) − 1   sui dati storici",mdd:"DD = min ( Wₜ / max(W) − 1 )   sui dati storici",var95:"VaR₉₅ = − quantile al 5% dei rendimenti di periodo storici"}[m];
  const val={ret:fmtPct(P0.ret,2),vol:fmtPct(P0.vol,2),sharpe:fmtN(P0.sharpe),cagr:fmtPct(P0.cagr,2,true),mdd:fmtPct(P0.mdd,2),var95:fmtPct(-P0.var95,2)}[m];
  const name={ret:"Rendimento atteso",vol:"Volatilità",sharpe:"Sharpe",cagr:"CAGR storico",mdd:"Max drawdown storico",var95:"VaR 95%"}[m];
  return {title:`${name} · ${lab}`,value:val,formula:fx+(who==="o"?`\nw = soluzione "${O.modeLabel}" con ${fmtPct(O.lo[0],0)} ≤ wᵢ ≤ ${fmtPct(O.hi[0],0)}`:""),
    kv:[...(m==="ret"&&O.inp.prudent?[["Metodo dei rendimenti attesi","Bayes-Stein (Jorion, 1986): μ̂ = (1 − φ)·μ + φ·μ₀"],["φ (quanto si avvicina alla media)",fmtPct(O.inp.bs.phi,1)],["μ₀ (portafoglio a minima varianza)",fmtPct(O.inp.bs.mu0,2)]]:[]),...ds.assets.map((a,i)=>[`${a.name}`,`peso ${fmtPct(P0.w[i],1)} · μ ${fmtPct(O.inp.mu[i],1)}${O.inp.prudent?` (storica ${fmtPct(O.inp.rawMu[i],1)})`:""} · σ ${fmtPct(Math.sqrt(O.inp.C[i][i]),1)}`]),["Periodi comuni",O.inp.common],["Tasso privo di rischio",O.mm?`${fmtPct(O.rf,2)} · ${O.mm.rfName}`:"0%"]]};
}
let opT=0;
$("#opForm").addEventListener("input",e=>{if(e.target.id==="opShort"||e.target.id==="opPrudent")return;clearTimeout(opT);opT=setTimeout(()=>{const I=S.opIn;if(!I)return;const v=id=>parseFloat($(id).value);
  if(Number.isFinite(v("#opTarget")))I.target=v("#opTarget");if(Number.isFinite(v("#opMin")))I.min=Math.max(-100,Math.min(100,v("#opMin")));if(Number.isFinite(v("#opMax")))I.max=Math.max(0,Math.min(300,v("#opMax")));renderOpt();},300);});
$("#opForm").addEventListener("submit",e=>e.preventDefault());
$("#opPrudent").addEventListener("change",e=>{const I=S.opIn;if(!I)return;I.prudent=e.target.checked;renderOpt();});
$("#opShort").addEventListener("change",e=>{const I=S.opIn;if(!I)return;I.short=e.target.checked;if(I.short&&I.min>=0){I.min=-30;I.max=Math.max(I.max,130);}if(!I.short){I.min=Math.max(0,I.min);I.max=Math.min(100,I.max);}$("#opMin").value=I.min;$("#opMax").value=I.max;renderOpt();});
document.addEventListener("click",e=>{
  const m=e.target.closest("[data-opm]");if(m&&S.opIn){if(S.opIn.mode!==m.dataset.opm){S.opIn.mode=m.dataset.opm;if(m.dataset.opm==="tvol"||m.dataset.opm==="tret")S.opIn.target=null;}renderOpt();return;}
  if(e.target.closest("#opUse")&&S.opt){S.optW={w:S.opt.B.w.slice(),label:S.opt.modeLabel};S.riskW="opt";$("#opUse").textContent="Pesi in uso nelle altre analisi ✓";$("#opUseCap").textContent="Rischio, Simulazioni e Stress test ora usano questi pesi.";}
});

/* ---------- Benchmark (Modulo 6) ---------- */
const BENCHES=[
  {id:"SPY",name:"S&P 500",desc:"ETF SPDR S&P 500 (SPY): 500 grandi aziende USA"},
  {id:"QQQ",name:"Nasdaq-100",desc:"ETF Invesco QQQ: 100 grandi aziende non finanziarie del Nasdaq"},
  {id:"URTH",name:"MSCI World",desc:"ETF iShares MSCI World (URTH): azioni dei paesi sviluppati, quotato dal 2012"},
  {id:"FEZ",name:"Euro Stoxx 50",desc:"ETF SPDR Euro Stoxx 50 (FEZ): 50 grandi aziende dell'area euro, quotato in dollari"},
  {id:"custom",name:"Personalizzato",desc:""}];
S.bnData={};S.fx=null;
/* risposte già scaricate (prezzi, ISIN, cambi, schede dei fondi): tenute per la sessione, in memoria e nel browser.
   Rifare un'analisi o cambiare spazio non riscarica nulla; solo risposte riuscite, mai errori. */
const NETC=new Map();
function netClear(rx){[...NETC.keys()].filter(k=>rx.test(k)).forEach(k=>NETC.delete(k));try{Object.keys(sessionStorage).filter(k=>k.startsWith("pos-net:")&&rx.test(k.slice(8))).forEach(k=>sessionStorage.removeItem(k));}catch{}}
function netGet(url){if(NETC.has(url))return NETC.get(url);try{const x=sessionStorage.getItem("pos-net:"+url);if(x){const j=JSON.parse(x);NETC.set(url,j);return j;}}catch{}return null;}
function netPut(url,j){if(!/^\/api\/(prices|isin|fx|etfinfo)\b/.test(url)||!j||j.error)return;NETC.set(url,j);try{sessionStorage.setItem("pos-net:"+url,JSON.stringify(j));}catch{}}
async function getJSON(url){
  const c=netGet(url);if(c)return c;
  try{const r=await fetch(url,{signal:AbortSignal.timeout(40000)}),j=await r.json().catch(()=>({}));if(r.ok)netPut(url,j);return r.ok?j:{error:j.error||`Errore del server (${r.status}).`};}
  catch(e){return {error:e instanceof TypeError?"I benchmark si scaricano dal sito pubblicato su Vercel.":"Il server non ha risposto in tempo. Riprova."};}
}
function bnLoad(sym){
  const cur=S.bnData[sym];if(cur)return cur.loading?cur.pr:Promise.resolve();
  const pr=Promise.all([getJSON(`/api/prices?symbol=${encodeURIComponent(sym)}&v=4`),S.fx?Promise.resolve(S.fx):getJSON("/api/fx?ccy=USD")]).then(([d,fx])=>{
    S.bnData[sym]=d;if(!fx.error){S.fx=fx;S.fxErr=null;}else if(!S.fx)S.fxErr=fx.error;
    if(current==="bench")renderBench();if(current==="stress"&&S.stress)renderStress();if(current==="lab"&&S.lab)renderReal();
  });
  S.bnData[sym]={loading:true,pr};return pr;
}
function bnSource(){
  /* → {label,px,kind,meta} oppure {loading} / {error} */
  const B=S.bn,ds=S.ds;
  if(B.pick==="custom"&&B.col!=null&&ds.assets[B.col]){
    const a=ds.assets[B.col],px=new Map();let v=100;ds.dates.forEach((d,k)=>{if(k&&Number.isFinite(a.ret[k]))v*=1+a.ret[k];if(k>=a.first-1)px.set(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`,v);});
    return {label:a.name,px,kind:"col",meta:{desc:`colonna ${a.col} del tuo file`,adjusted:a.role!=="price"?true:null,source:"il tuo file"}};
  }
  const sym=B.pick==="custom"?B.sym:B.pick;if(!sym)return {empty:true};
  const d=S.bnData[sym];if(!d){bnLoad(sym);return {loading:true,sym};}if(d.loading)return {loading:true,sym};if(d.error)return {error:d.error,sym};
  const preset=BENCHES.find(b=>b.id===sym),eur=B.ccy==="EUR";
  if(eur&&!S.fx)return S.fxErr?{error:`Cambio BCE non disponibile: ${S.fxErr}`}:{loading:true,sym};
  return {label:preset?preset.name:sym,sym,px:P.benchPrices(d.points,eur?S.fx.points:null),kind:preset?"preset":"sym",meta:{desc:preset?preset.desc:`simbolo ${sym}`,adjusted:d.adjusted,source:d.source||"Alpha Vantage",first:d.points[0].d,last:d.points[d.points.length-1].d,eur}};
}
/* lo Stress test usa il benchmark scelto (S&P 500 se non ne hai scelto uno) per le crisi fuori dal file */
function ensureBnCr(){
  if(!S.bn)S.bn={pick:"SPY",ccy:"EUR",col:null,sym:""};
  const src=bnSource();if(!src.px)return;
  const key=`${src.sym||src.label}|${S.bn.ccy}`;if(S.bnCr&&S.bnCr.key===key)return;
  const ba=P.benchAsset(src.px);S.bnCr={label:src.label,list:P.CRISES.map(c=>P.crisisAnalysis(ba.dates,[ba.asset],[1],12,c)),ba,key};
}
const bnCovers=id=>{const C=S.bnCr;if(!C)return null;const c=C.list.find(x=>x.id===id);return c&&c.status!=="out"&&c.used?c:null;};
function benchCardLine(id){
  const C=S.bnCr;if(!C)return "";const c=C.list.find(x=>x.id===id);
  return c&&c.status!=="out"&&c.used?`<span class="bm">${esc(C.label)}: <b>${fmtPct(c.mdd,1)}</b>${c.status==="partial"?" (parziale)":""}</span>`:`<span class="bm">${esc(C.label)}: non disponibile</span>`;
}
function renderBench(){
  const box=$("#bnBox"),empty=$("#bnEmpty");
  if(!S.lab||!S.ds||!S.ds.ok){box.hidden=true;empty.hidden=false;$("#bnW").innerHTML="";return;}
  box.hidden=false;empty.hidden=true;
  const ds=S.ds,f=ds.freq.f;
  if(!S.bn)S.bn={pick:"SPY",ccy:"EUR",col:null,sym:""};
  if(!S.riskW)S.riskW=S.portfolio?"now":"equal";
  const B=S.bn,{w,label}=riskWeights();
  $("#bnW").innerHTML=wOpts().map(o=>`<button type="button" data-rw="${o[0]}" aria-pressed="${S.riskW===o[0]}">${o[1]}</button>`).join("");
  $("#bnPick").innerHTML=BENCHES.map(b=>`<button type="button" data-bnp="${b.id}" aria-pressed="${B.pick===b.id}">${b.name}${b.id!=="custom"?`<span class="bn-sym">${b.id}</span>`:""}</button>`).join("");
  document.querySelectorAll("#bnCcy [data-bcc]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.bcc===B.ccy)));
  $("#bnCustomBox").hidden=B.pick!=="custom";
  if(B.pick==="custom"&&!$("#bnCol").options.length||$("#bnCol").dataset.n!==String(ds.assets.length)){$("#bnCol").innerHTML=`<option value="">— scegli —</option>`+ds.assets.map((a,i)=>`<option value="${i}">${esc(a.name)}</option>`).join("");$("#bnCol").dataset.n=ds.assets.length;}
  if(B.col!=null)$("#bnCol").value=String(B.col);
  $("#bnCcy").parentElement.hidden=B.pick==="custom"&&B.col!=null;
  const src=bnSource(),st=$("#bnStatus"),clear=()=>{["#bnKpis","#bnGrow","#bnRoll","#bnTable","#bnCrises","#bnLegend","#bnNotes"].forEach(id=>$(id).innerHTML="");["#bnRollCap","#bnCrCap"].forEach(id=>$(id).textContent="");};
  st.classList.remove("err");
  if(src.empty){st.textContent="Scegli una colonna del tuo file o scrivi un simbolo.";clear();S.bnRes=null;return;}
  if(src.loading){st.textContent=`Scarico lo storico di ${src.sym}${B.ccy==="EUR"?" e il cambio euro/dollaro della BCE":""}…`;clear();return;}
  if(src.error){st.classList.add("err");st.textContent=src.error+(/Limite/i.test(src.error)?" Intanto puoi usare come benchmark una colonna del tuo file (Personalizzato).":"");clear();S.bnRes=null;return;}
  const mm=macroFor(S.rfSrc),rf=mm?mm.rf:0,pret=pfAsset(w,"p").ret,al=P.benchAlign(ds.dates,f,pret,src.px),bs=P.benchStats(al.p,al.b,al.fc,rf);
  st.textContent=`${src.meta.desc}${src.meta.first?` · dati ${src.meta.first.slice(0,7)} – ${src.meta.last.slice(0,7)}`:""}${src.kind!=="col"?` · ${src.meta.eur?"convertito in euro con il cambio BCE di fine mese":"nella valuta di quotazione"} · fonte ${src.meta.source}`:""}.`;
  /* crisi: il benchmark su tutta la sua storia, il portafoglio solo dove il file le copre */
  const ba=P.benchAsset(src.px);
  const crList=P.CRISES.map(c=>({c,b:P.crisisAnalysis(ba.dates,[ba.asset],[1],12,c),p:P.crisisAnalysis(ds.dates,ds.assets,w,f,c)}));
  S.bnCr={label:src.label,list:crList.map(x=>x.b),ba,key:`${src.sym||src.label}|${B.ccy}`};
  S.bnRes={src,al,bs,w,label,rf,mm,crList};
  $("#bnSub").textContent=bs.error?bs.error:`${src.label} contro il portafoglio con ${label}, su ${unitN(bs.n,al.fc)} in comune (${al.keys[0]} – ${al.keys[al.keys.length-1]}).`;
  if(bs.error){clear();$("#bnKpis").innerHTML=`<div class="kpi"><span class="eyebrow">Storia comune troppo corta</span><span class="v txt">${esc(bs.error)}</span>${rebuildHint()}</div>`;renderBnCrises();renderBnNotes();return;}
  const sgn=(x,d=1)=>fmtPct(x,d,true),btn=(k,v)=>`<button type="button" class="v" data-rc="bn-${k}-r">${v}</button>`;
  $("#bnKpis").innerHTML=[
    ["Rendimento annuo in più",btn("active",sgn(bs.active)),`${fmtPct(bs.cagrP,1,true)} contro ${fmtPct(bs.cagrB,1,true)} del benchmark`],
    ["Beta",btn("beta",fmtN(bs.beta)),bs.beta>1.05?"più reattivo del mercato":bs.beta<.95?"meno reattivo del mercato":"si muove come il mercato"],
    ["Tracking error",btn("te",fmtPct(bs.te,1)),"quanto ti discosti dal benchmark ogni anno"],
    ["Information ratio",btn("ir",fmtN(bs.ir)),"extra-rendimento per unità di scostamento"]
  ].map(k=>`<div class="kpi"><span class="eyebrow">${k[0]}</span>${k[1]}<span class="sub">${k[2]}</span></div>`).join("");
  drawBnGrow();drawBnRoll();renderBnTable();renderBnCrises();renderBnNotes();
  if(current==="bench")Morph.shape("bench");
}
function drawBnGrow(){
  const R=S.bnRes,al=R.al,n=al.keys.length,VW=900,VH=300,ml=50,mr=16,mt=14,mb=28,iw=VW-ml-mr,ih=VH-mt-mb;
  const cum=a=>{let v=100;return [100,...a.map(x=>v*=1+x)];},P1=cum(al.p),B1=cum(al.b),all=[...P1,...B1],lo=Math.min(...all)*.96,hi=Math.max(...all)*1.03;
  R.gP=P1;R.gB=B1;
  const X=i=>ml+i/n*iw,Y=v=>mt+ih-(v-lo)/(hi-lo)*ih;let g="";
  niceTicks(lo,hi,5).filter(v=>v>=lo&&v<=hi).forEach(v=>{g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)"/><text x="${ml-8}" y="${(Y(v)+4).toFixed(1)}" text-anchor="end">${fmtN(v,0)}</text>`;});
  const yrs=[...new Set(al.keys.map(k=>k.slice(0,4)))],step=yrs.length>24?5:yrs.length>12?3:yrs.length>6?2:1;
  al.keys.forEach((k,i)=>{if(k.endsWith("-01")||i===0){const y=+k.slice(0,4);if(y%step===0){const x=X(i+1);if(x>ml+14&&x<VW-mr-14)g+=`<text x="${x.toFixed(1)}" y="${VH-8}" text-anchor="middle">${y}</text>`;}}});
  let a="";P1.forEach((v,i)=>{a+=(i?"L":"M")+X(i).toFixed(1)+","+Y(v).toFixed(1);});for(let i=n;i>=0;i--)a+="L"+X(i).toFixed(1)+","+Y(B1[i]).toFixed(1);
  g+=`<path d="${a}Z" fill="${P1[n]>=B1[n]?"var(--good)":"var(--bad)"}" opacity=".1" class="area"/>`;
  const line=(arr,st,k)=>{let d="";arr.forEach((v,i)=>{d+=(i?"L":"M")+X(i).toFixed(1)+","+Y(v).toFixed(1);});return `<path d="${d}" fill="none" ${st} pathLength="1" class="draw" style="--k:${k}"/>`;};
  g+=line(B1,`stroke="var(--c3)" stroke-width="2.2"`,1)+line(P1,`stroke="var(--lime)" stroke-width="3"`,0);
  g+=`<text x="${X(n)-6}" y="${Y(P1[n])-8}" text-anchor="end" style="fill:var(--fg);font-weight:700">${fmtN(P1[n],0)}</text><text x="${X(n)-6}" y="${Y(B1[n])+16}" text-anchor="end" style="fill:var(--c3);font-weight:700">${fmtN(B1[n],0)}</text>`;
  $("#bnGrow").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Crescita di 100 euro: portafoglio contro ${esc(R.src.label)}">${g}</svg>`;
  $("#bnLegend").innerHTML=`<span><i style="background:var(--lime);height:3px"></i>Portafoglio (${esc(R.label)})</span><span><i style="background:var(--c3);height:3px"></i>${esc(R.src.label)}</span>`;
  $("#bnGrowLab").textContent=`base 100 · ${al.keys[0]} – ${al.keys[n-1]}`;
}
function drawBnRoll(){
  const R=S.bnRes,bs=R.bs,al=R.al,r=bs.roll,n=r.length,VW=640,VH=250,ml=44,mr=10,mt=12,mb=28,iw=VW-ml-mr,ih=VH-mt-mb;
  if(!n){$("#bnRoll").innerHTML="";return;}
  const lo=Math.min(0,...r)*1.1,hi=Math.max(0,...r)*1.1||.01,Y=v=>mt+ih-(v-lo)/((hi-lo)||1)*ih,bw=iw/n;let g="";
  niceTicks(lo,hi,4).filter(v=>v>=lo&&v<=hi).forEach(v=>{g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)"/><text x="${ml-6}" y="${(Y(v)+4).toFixed(1)}" text-anchor="end">${fmtPct(Math.abs(v)<1e-9?0:v,0,true)}</text>`;});
  r.forEach((v,i)=>{const y0=Y(0),y1=Y(v);g+=`<rect x="${(ml+i*bw).toFixed(2)}" y="${Math.min(y0,y1).toFixed(1)}" width="${Math.max(.6,bw-.6).toFixed(2)}" height="${Math.abs(y1-y0).toFixed(1)}" fill="${v>=0?"var(--good)":"var(--bad)"}" opacity=".8"><title>${al.keys[i+bs.win-1]}: ${fmtPct(v,1,true)} sugli ultimi ${unitN(bs.win,al.fc)}</title></rect>`;});
  [0,Math.floor(n/2),n-1].forEach(i=>{g+=`<text x="${(ml+i*bw+bw/2).toFixed(1)}" y="${VH-8}" text-anchor="${i===0?"start":i===n-1?"end":"middle"}">${al.keys[i+bs.win-1]}</text>`;});
  $("#bnRoll").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Rendimento del portafoglio rispetto al benchmark su finestre mobili di 12 mesi">${g}</svg>`;
  const pos=r.filter(v=>v>0).length;
  $("#bnRollLab").textContent=`finestre mobili di ${unitN(bs.win,al.fc)}`;
  $("#bnRollCap").textContent=`Ogni barra è quanto il portafoglio ha fatto meglio (verde) o peggio (rosso) del benchmark negli ultimi ${unitN(bs.win,al.fc)}. Sopra in ${pos} finestre su ${n} (${fmtPct(pos/n,0)}).`;
}
function renderBnTable(){
  const bs=S.bnRes.bs,c=(k,v,cl="")=>`<button type="button" class="cellbtn ${cl}" data-rc="bn-${k}-r">${v}</button>`;
  const two=[["cagr","CAGR",x=>fmtPct(x,1,true)],["tot","Rendimento totale",x=>fmtPct(x,1,true)],["vol","Volatilità",x=>fmtPct(x,1)],["sharpe","Sharpe",x=>fmtN(x)],["mdd","Max drawdown",x=>fmtPct(x,1)]];
  const key={cagr:["cagrP","cagrB"],tot:["totP","totB"],vol:["volP","volB"],sharpe:["sharpeP","sharpeB"],mdd:["mddP","mddB"]};
  const rel=[["beta","Beta (IC 95%)",`${fmtN(bs.beta)} (${fmtN(bs.betaLo)} – ${fmtN(bs.betaHi)})`],["alpha","Alpha di Jensen (annuo)",`${fmtPct(bs.alpha,2,true)} · ${bs.pAlpha<.05?"significativo":"non significativo"} (p ${fmtN(bs.pAlpha,2)})`],["r2","R² (quanto spiega il mercato)",fmtPct(bs.r2,0)],["te","Tracking error",fmtPct(bs.te,1)],["ir","Information ratio",fmtN(bs.ir)],["up","Cattura nei rialzi",fmtPct(bs.up,0)],["down","Cattura nei ribassi",fmtPct(bs.down,0)],["hit","Periodi sopra il benchmark",fmtPct(bs.hit,0)]];
  $("#bnTable").innerHTML=`<thead><tr><th>Misura</th><th>Portafoglio</th><th>${esc(S.bnRes.src.label)}</th></tr></thead><tbody>${two.map(([k,l,fm])=>`<tr><td>${l}</td><td>${c(k+"P",fm(bs[key[k][0]]))}</td><td>${c(k+"B",fm(bs[key[k][1]]))}</td></tr>`).join("")}
    ${rel.map(([k,l,v])=>`<tr><td>${l}</td><td colspan="2" style="text-align:center">${c(k,v)}</td></tr>`).join("")}</tbody>`;
}
function renderBnCrises(){
  const R=S.bnRes,f=S.ds.freq.f,rows=R.crList;
  $("#bnCrLab").textContent=`${R.src.label} su tutta la sua storia`;
  $("#bnCrises").innerHTML=`<thead><tr><th>Crisi</th><th>${esc(R.src.label)}: perdita massima</th><th>Tempo per il fondo</th><th>Recupero</th><th>Il tuo portafoglio</th></tr></thead><tbody>${rows.map(({c,b,p})=>{
    const bOk=b.status!=="out"&&b.used,pOk=p.status!=="out"&&p.used;
    return `<tr><td><span class="an">${esc(c.name)}</span></td><td>${bOk?`<span class="neg">${fmtPct(b.mdd,1)}</span>${b.status==="partial"?" · parziale":""}`:"fuori dallo storico"}</td><td>${bOk?unitN(b.toTrough,12):"—"}</td><td>${bOk?(b.recK!=null?unitN(b.recPeriods,12):"non recuperato nei dati"):"—"}</td><td>${pOk?`<span class="neg">${fmtPct(p.mdd,1)}</span>`:`<span style="color:var(--faint)">non nel tuo file</span>`}</td></tr>`;}).join("")}</tbody>`;
  const n=rows.filter(x=>x.b.status!=="out"&&x.b.used).length,m=rows.filter(x=>x.p.status!=="out"&&x.p.used).length;
  $("#bnCrCap").textContent=`Il benchmark copre ${n} crisi su 5, il tuo file ${m}. Per le crisi che il file non contiene vedi come si è comportato il mercato, non il tuo portafoglio: non lo ricostruisco con dati inventati. Le perdite del benchmark compaiono anche nelle schede dello Stress test.`;
}
function renderBnNotes(){
  const R=S.bnRes,m=R.src.meta;
  $("#bnNotes").innerHTML=[
    R.src.kind==="col"?`<b>Benchmark dal tuo file</b>: la colonna «${esc(R.src.label)}» è usata come indice, nella stessa valuta del file.`:`<b>Indice tramite ETF</b>: ${esc(m.desc)}. ${m.adjusted?"Prezzi rettificati per dividendi e frazionamenti (rendimento totale), al netto dei costi dell'ETF.":"Prezzi non rettificati: i dividendi non sono inclusi, il benchmark è sottostimato."}`,
    R.src.kind!=="col"?(m.eur?`<b>Valuta</b>: prezzi in dollari convertiti in euro con il cambio BCE di fine mese, così il confronto include l'effetto del cambio come per un investitore europeo.`:`<b>Valuta</b>: benchmark nella valuta di quotazione. Se il tuo file è in euro, la differenza include anche il cambio.`):`<b>Valuta</b>: la stessa del file.`,
    `<b>Stessi periodi</b>: solo i ${unitN(R.bs.n||0,R.al.fc)} in cui ci sono sia il portafoglio sia il benchmark. ${S.ds.freq.f>12?"Con dati giornalieri o settimanali i rendimenti sono composti per mese; primo e ultimo mese, parziali, sono esclusi.":""}`,
    `<b>Beta e alpha</b>: regressione dei rendimenti di periodo sul benchmark. Alpha di Jensen = (r̄ₚ − rf/f − β·(r̄ᵦ − rf/f))·f, con rf ${R.mm?`${fmtPct(R.rf,2)} (${R.mm.rfName})`:"0%"}.`,
    `<b>Tracking error e information ratio</b>: deviazione standard e media della differenza di rendimento, annualizzate.`,
    `<b>Crisi</b>: il benchmark è analizzato su tutta la sua storia con le stesse finestre dello Stress test (dati mensili).`,
    `<b>Fonte e limiti</b>: Alpha Vantage, piano gratuito con poche richieste al giorno; ogni serie resta in memoria 24 ore per tutti i visitatori.`,
    `<b>Storico, non previsione</b>: battere o no il benchmark in passato non dice cosa succederà.`
  ].map(x=>`<li>${x}</li>`).join("");
}
function bnReceipt(m){
  const R=S.bnRes,bs=R.bs,al=R.al,fc=al.fc;
  const base=[["Benchmark",R.src.label],["Periodi in comune",bs.n],["Periodo",`${al.keys[0]} – ${al.keys[al.keys.length-1]}`],["Portafoglio",R.label],["Frequenza",`f = ${fc}`]];
  const M={
    active:["Rendimento annuo in più",fmtPct(bs.active,2,true),"CAGRₚ − CAGRᵦ",[["CAGR portafoglio",fmtPct(bs.cagrP,2,true)],["CAGR benchmark",fmtPct(bs.cagrB,2,true)]]],
    beta:["Beta",fmtN(bs.beta,3),"β = cov(rₚ, rᵦ) / var(rᵦ)   (regressione OLS dei rendimenti in eccesso)\nIC 95% = β ± t₀,₉₇₅(n−2) · SE(β),  SE(β) = sₑ / √Σ(rᵦ − r̄ᵦ)²",[["IC 95%",`${fmtN(bs.betaLo,3)} – ${fmtN(bs.betaHi,3)}`],["Errore standard",fmtN(bs.seBeta,3)],["p-value di β = 1",fmtN(bs.pBeta1,3)],["Correlazione",fmtN(bs.corr,3)],["Volatilità residua (annua)",fmtPct(bs.resVol,2)]]],
    alpha:["Alpha di Jensen",fmtPct(bs.alpha,2,true),"α = (r̄ₚ − rf/f − β·(r̄ᵦ − rf/f)) · f   (intercetta della regressione OLS)\nt = α / SE(α) con n − 2 gradi di libertà;  significativo se p < 0,05",[["IC 95%",`${fmtPct(bs.alphaLo,2,true)} – ${fmtPct(bs.alphaHi,2,true)}`],["Errore standard (annuo)",fmtPct(bs.seAlpha,2)],["t",fmtN(bs.tAlpha,2)],["p-value",fmtN(bs.pAlpha,3)],["Gradi di libertà",bs.df],["Beta",fmtN(bs.beta,3)],["Tasso privo di rischio",fmtPct(R.rf,2)]]],
    r2:["R²",fmtPct(bs.r2,1),"R² = ρ²   quota della variabilità spiegata dal benchmark",[["Correlazione",fmtN(bs.corr,3)]]],
    te:["Tracking error",fmtPct(bs.te,2),"TE = sd(rₚ − rᵦ) · √f",[]],
    ir:["Information ratio",fmtN(bs.ir),"IR = media(rₚ − rᵦ) · f / TE",[["Tracking error",fmtPct(bs.te,2)]]],
    up:["Cattura nei rialzi",fmtPct(bs.up,1),"media(rₚ | rᵦ > 0) / media(rᵦ | rᵦ > 0)",[]],
    down:["Cattura nei ribassi",fmtPct(bs.down,1),"media(rₚ | rᵦ < 0) / media(rᵦ | rᵦ < 0)\nsotto 100% = perdi meno del mercato nei mesi negativi",[]],
    hit:["Periodi sopra il benchmark",fmtPct(bs.hit,1),"quota dei periodi con rₚ > rᵦ",[]],
    cagrP:["CAGR del portafoglio",fmtPct(bs.cagrP,2,true),"[ Π (1 + rₚ) ]^(f/n) − 1",[]],cagrB:["CAGR del benchmark",fmtPct(bs.cagrB,2,true),"[ Π (1 + rᵦ) ]^(f/n) − 1",[]],
    totP:["Rendimento totale del portafoglio",fmtPct(bs.totP,2,true),"Π (1 + rₚ) − 1",[]],totB:["Rendimento totale del benchmark",fmtPct(bs.totB,2,true),"Π (1 + rᵦ) − 1",[]],
    volP:["Volatilità del portafoglio",fmtPct(bs.volP,2),"sd(rₚ) · √f",[]],volB:["Volatilità del benchmark",fmtPct(bs.volB,2),"sd(rᵦ) · √f",[]],
    sharpeP:["Sharpe del portafoglio",fmtN(bs.sharpeP),"(r̄ₚ · f − rf) / σₚ",[]],sharpeB:["Sharpe del benchmark",fmtN(bs.sharpeB),"(r̄ᵦ · f − rf) / σᵦ",[]],
    mddP:["Max drawdown del portafoglio",fmtPct(bs.mddP,2),"min ( Wₜ / max(W) − 1 )",[]],mddB:["Max drawdown del benchmark",fmtPct(bs.mddB,2),"min ( Wₜ / max(W) − 1 )",[]]
  }[m]||[m,"—","",[]];
  return {title:M[0],value:M[1],formula:M[2]+"\nrendimenti di periodo sugli stessi mesi"+(R.src.meta.eur?", benchmark convertito in euro":""),kv:[...M[3],...base]};
}
document.addEventListener("click",e=>{
  const p=e.target.closest("[data-bnp]");if(p&&S.bn){S.bn.pick=p.dataset.bnp;renderBench();return;}
  const c=e.target.closest("[data-bcc]");if(c&&S.bn){S.bn.ccy=c.dataset.bcc;renderBench();return;}
  if(e.target.closest("#bnSymGo")&&S.bn){const v=$("#bnSym").value.trim().toUpperCase();if(!/^[A-Z0-9][A-Z0-9.\-]{0,19}$/.test(v)){$("#bnStatus").textContent="Simbolo non valido, per esempio VT o IWDA.LON.";return;}S.bn.sym=v;S.bn.col=null;$("#bnCol").value="";renderBench();}
});
$("#bnSym").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("#bnSymGo").click();}});
$("#bnCol").addEventListener("change",e=>{if(!S.bn)return;S.bn.col=e.target.value===""?null:+e.target.value;if(S.bn.col!=null)S.bn.sym="";renderBench();});

export { BENCHES, FI_F, FI_K, FI_KEY, MC_M, NETC, OP_L, PER, SWANS, SW_L, UNIT, benchCardLine, benchCrisisDetail, bnCovers, bnLoad, bnReceipt, bnSource, crisisSeries, ddWhyBox, drawBnGrow, drawBnRoll, drawContrib, drawCrisisCompare, drawCrisisPath, drawDist, drawFan, drawFrontier, drawHist, drawUnderwater, ensureBnCr, fiAgeTxt, fiBase, fiCompute, fiCurve, fiDefaults, fiFill, fiGoal, fiHero, fiKpis, fiLevers, fiLifeChart, fiNotes, fiRaf, fiReceipt, fiSet, fiT, fiVars, fiYearOf, fillSimForm, fmtEur, fmtK, getJSON, mcReceipt, netClear, netGet, netPut, opBase, opEval, opReceipt, opSolve, opT, placeLabels, quantileArr, renderBench, renderBnCrises, renderBnNotes, renderBnTable, renderCrisisDetail, renderDecomp, renderFI, renderMcNotes, renderMcTable, renderOpCmp, renderOpNotes, renderOpWeights, renderOpt, renderRisk, renderRiskPro, renderRiskTable, renderShock, renderSim, renderStNotes, renderStress, renderSwans, riskReceipt, riskWeights, runSim, shockValues, simDefaults, simInputs, simT, stPer, stReceipt, star, stressList, swanClass, unitN, wOpts, yr };
