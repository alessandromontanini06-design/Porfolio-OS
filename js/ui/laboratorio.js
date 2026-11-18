/* Portfolio OS · interfaccia · dati macro, dove sei investito, laboratorio, rete 3D.
   Parte di app.js divisa in moduli: il codice è lo stesso, cambiano solo import ed export. */
import { $, HAS_G, NET_COLORS, P, REDUCE, ROLE_SHORT, S, color, esc, fmtDate, fmtN, fmtPct } from "./core.js";
import { current } from "./scene.js";
import { ISIN_RX, an } from "./importa.js";
import { costCalc, renderCompare, renderCost, renderPortfolio, renderProfileCard } from "./portafoglio.js";
import { fmtEur, getJSON, renderOpt, renderRisk } from "./analisi.js";
import { drawReal, renderReal } from "./rendimento.js";
import { openReceipt } from "./report.js";
import { pmOfferRender } from "./patrimonio.js";

/* ---------- Dati macro ufficiali (BCE, FRED facoltativo) tramite /api/rates ---------- */
const ym=d=>`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;
function macroFor(src){
  const m=S.macro&&S.macro.status==="ready"&&S.macro.data[src];if(!m)return null;
  const rp=m.rf.points,cp=m.cpi.points;if(!rp.length||cp.length<2)return null;
  const rf=rp.reduce((s,x)=>s+x.v,0)/rp.length/100,months=cp.length-1,infl=Math.pow(cp[cp.length-1].v/cp[0].v,12/months)-1;
  return {rf,infl,months,rfName:m.rf.name,cpiName:m.cpi.name,source:m.rf.source,rfSeries:m.rf.series,cpiSeries:m.cpi.series,n:rp.length,from:rp[0].p,to:rp[rp.length-1].p,c0:cp[0],c1:cp[cp.length-1]};
}
async function fetchMacro(){
  const ds=S.ds;S.macro={status:"loading"};renderMacro();
  try{
    const r=await fetch(`/api/rates?from=${ym(ds.dates[0])}&to=${ym(ds.dates[ds.dates.length-1])}`,{signal:AbortSignal.timeout(25000)});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||`Errore ${r.status}`);
    S.macro={status:"ready",data:j};
    if(!j[S.rfSrc])S.rfSrc=j.ecb?"ecb":j.fred?"fred":"zero";
  }catch(e){
    S.macro={status:"error",msg:e instanceof TypeError?"I dati della BCE si caricano nella versione del sito pubblicata su Vercel.":String(e.message||e)};
  }
  if(S.lab){renderMacro();renderMetrics();renderPortfolio();renderReal();if(current==="risk")renderRisk();if(current==="opt")renderOpt();}
}
function renderMacro(){
  const el=$("#macro");if(!el)return;const M=S.macro;
  if(!M||M.status==="loading"){el.innerHTML=`<div class="thinking"><i></i><i></i><i></i><span>Scarico tassi e inflazione ufficiali per il periodo del dataset…</span></div>`;return;}
  if(M.status==="error"){el.innerHTML=`<p style="color:var(--muted)">${esc(M.msg)} Lo Sharpe usa un tasso privo di rischio dello 0%.</p>`;return;}
  const opts=[["ecb","BCE · Euribor 3 mesi"],["fred","FRED · T-bill USA 3 mesi"],["zero","Nessuno (0%)"]].filter(o=>o[0]==="zero"||M.data[o[0]]);
  const mm=macroFor(S.rfSrc);
  el.innerHTML=`<div class="head"><span class="eyebrow">Tasso privo di rischio e inflazione</span><div class="seg" role="group" aria-label="Fonte del tasso privo di rischio">${opts.map(o=>`<button type="button" data-rf="${o[0]}" aria-pressed="${S.rfSrc===o[0]}">${o[1]}</button>`).join("")}</div></div>
    ${mm?`<div class="kpis mk">
      <div class="kpi"><span class="eyebrow">Tasso privo di rischio medio</span><button type="button" class="cellbtn v" style="font-family:var(--f-display);font-size:1.8rem;font-weight:800" data-rc="macro-rf">${fmtPct(mm.rf,2)}</button><span class="caption">${esc(mm.rfName)}</span></div>
      <div class="kpi"><span class="eyebrow">Inflazione media annua</span><button type="button" class="cellbtn v" style="font-family:var(--f-display);font-size:1.8rem;font-weight:800" data-rc="macro-infl">${fmtPct(mm.infl,2)}</button><span class="caption">${esc(mm.cpiName)}</span></div>
      <div class="kpi"><span class="eyebrow">Fonte</span><span class="v txt">${esc(mm.source)}</span><span class="caption">${mm.n} mesi · ${mm.from} – ${mm.to}</span></div>
    </div>`:`<p style="color:var(--muted)">Sharpe calcolato con tasso privo di rischio dello 0%. Il rendimento reale richiede i dati sull'inflazione: scegli la BCE o la FRED.</p>`}
    ${(M.data.errors||[]).length?`<p class="caption">${esc(M.data.errors.join(" "))}</p>`:""}`;
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-rf]");if(!b)return;S.rfSrc=b.dataset.rf;renderMacro();renderMetrics();renderPortfolio();renderReal();if(current==="risk")renderRisk();if(current==="opt")renderOpt();});
/* volatilità di mercato a 1, 3 e 5 anni dai prezzi giornalieri (come i siti di ETF), per gli strumenti scaricati */
function mktVol(name){const p=S.portfolio&&S.portfolio.positions.find(x=>(x.ticker||x.nome)===name);return p&&p.vol&&(p.vol.y1||p.vol.y3||p.vol.y5)?{...p.vol,cur:p.currency,sym:p.yahoo||p.simbolo}:null;}
function renderMetrics(){
  const ds=S.ds,L=S.lab,f=ds.freq.f,mm=macroFor(S.rfSrc),rf=mm?mm.rf:0;
  const cell=(key,val,cls="")=>`<button type="button" class="cellbtn ${cls}" data-rc="${key}">${val}</button>`;
  const pending=S.macro&&S.macro.status==="loading";
  $("#metrics").innerHTML=`<thead><tr><th>Asset</th><th>Rend. annuo</th><th>Rend. reale</th><th>Volatilità</th><th>Sharpe</th><th>Max drawdown</th><th>Periodo peggiore</th><th>Oss.</th></tr></thead><tbody>${
    ds.assets.map((a,i)=>{const s=L.st[i];
      if(s.n<2)return `<tr><td><span class="an"><i style="background:${color(i)}"></i>${esc(a.name)}</span></td><td colspan="7" style="text-align:left;color:var(--muted)">Dati insufficienti</td></tr>`;
      const sh=s.vol>0?(s.mean*f-rf)/s.vol:NaN,real=mm?(1+s.cagr)/(1+mm.infl)-1:NaN;
      return `<tr><td><span class="an"><i style="background:${color(i)}"></i>${esc(a.name)}</span><span class="cl mono">${ROLE_SHORT[a.role]} · col. ${a.col}</span></td>
      <td>${cell("cagr-"+i,fmtPct(s.cagr,1,true),s.cagr<0?"neg":"")}</td>
      <td>${mm?cell("real-"+i,fmtPct(real,1,true),real<0?"neg":""):`<span class="cl">${pending?"…":"—"}</span>`}</td>
      <td>${cell("vol-"+i,fmtPct(s.vol))}${(()=>{const v=mktVol(a.name);return v?`<span class="cl mono volw" title="Volatilità dei rendimenti giornalieri di mercato, annualizzata (√252), come justETF">1a ${v.y1!=null?fmtPct(v.y1,1):"—"} · 3a ${v.y3!=null?fmtPct(v.y3,1):"—"} · 5a ${v.y5!=null?fmtPct(v.y5,1):"—"}</span>`:"";})()}</td><td>${cell("sharpe-"+i,fmtN(sh))}</td>
      <td>${cell("mdd-"+i,fmtPct(s.mdd),"neg")}</td><td>${cell("worst-"+i,`${fmtPct(s.worst)} <span style="color:var(--faint)">${fmtDate(ds.dates[s.worstK],f)}</span>`)}</td><td class="mono">${s.n}</td></tr>`;}).join("")}</tbody>`;
  const cap=$("#metricsCap");if(cap)cap.textContent=mm?`Sharpe con tasso privo di rischio medio ${fmtPct(mm.rf,2)} (${mm.rfName}). Rendimento reale al netto dell'inflazione media ${fmtPct(mm.infl,2)}.`:"Sharpe con tasso privo di rischio 0%.";
}
/* ---------- Dove sei investito: paesi, settori e costi dei fondi dalle schede di justETF (per ISIN) ---------- */
async function loadEtfInfo(){
  const pf=S.portfolio;if(!pf||pf.etfLoading||pf.etfDone)return;
  pf.etfLoading=true;renderLook();
  /* strumenti senza ISIN nel file: l'IA lo propone dal ticker e dal nome, il server lo verifica su OpenFIGI; si usano solo quelli verificati */
  const noIsin=pf.positions.filter(p=>!(p.isin&&ISIN_RX.test(p.isin)));
  if(noIsin.length&&!pf.isinSearched){pf.isinSearched=true;pf.isinStatus="loading";renderLook();
    try{const r=await fetch("/api/findisin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({strumenti:noIsin.map(p=>({nome:p.nome||"",ticker:p.ticker||"",simbolo:p.simbolo||""}))}),signal:AbortSignal.timeout(60000)});
      const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||`Errore ${r.status}`);
      (j.risultati||[]).forEach(x=>{const p=noIsin[x.indice];if(!p)return;if(x.verificato&&x.isin){p.isin=x.isin;p.isinFound={via:x.via,motivo:x.motivo};}else p.isinMiss=x.isin?`${x.isin} proposto ma scartato: ${x.motivo}`:x.motivo;});
      pf.isinStatus="done";}catch(e){pf.isinStatus="error";pf.isinErr=e instanceof TypeError?"ricerca ISIN non raggiungibile":String(e.message||e);}}
  const list=pf.positions.filter(p=>p.isin&&ISIN_RX.test(p.isin));if(!list.length){pf.etfLoading=false;pf.etfDone=true;renderLook();return;}
  /* tre schede alla volta (non una dopo l'altra); ogni scheda letta resta nel browser come copia di riserva:
     se justETF non risponde si usa l'ultima copia, e la didascalia mostra la data in cui era stata letta */
  const etfCopy=(isin,j)=>{try{if(j){localStorage.setItem("pos-etf-v1:"+isin,JSON.stringify(j));return j;}const x=localStorage.getItem("pos-etf-v1:"+isin);return x?JSON.parse(x):null;}catch{return null;}};
  const queue=list.slice();
  await Promise.all([0,1,2].map(async()=>{while(queue.length){const p=queue.shift();const j=await getJSON(`/api/etfinfo?isin=${p.isin}&v=2`);
    p.etf=j&&!j.error?etfCopy(p.isin,j):(etfCopy(p.isin)||{error:(j&&j.error)||"non disponibile"});renderLook();}}));
  pf.etfLoading=false;pf.etfDone=true;renderLook();renderReal();/* classi di attivo nel guadagno per strumento */
}
const LOOK_TABS=[["geo","Aree e paesi"],["conc","Concentrazione"],["ccy","Valute"],["style","Classi e stile"],["sect","Settori"]];
document.addEventListener("click",e=>{const b=e.target.closest("[data-look]");if(!b)return;S.lookTab=b.dataset.look;renderLook();});
function renderLook(){
  renderCost();
  const card=$("#lookCard"),body=$("#lookBody");if(!card||!body)return;
  const pf=S.portfolio,ds=S.ds;if(!pf||!S.lab||!ds||!ds.ok){card.hidden=true;return;}
  card.hidden=false;
  const tot=pf.positions.reduce((q,p)=>q+(p.valore||0),0);
  const items=pf.positions.map(p=>({nome:p.ticker||p.nome,w:tot?(p.valore||0)/tot:1/pf.positions.length,etf:p.etf,isin:p.isin,p}));
  if(pf.isinStatus==="loading"){body.innerHTML=`<div class="thinking"><i></i><i></i><i></i><span>Nel file mancano alcuni ISIN: li cerco dal ticker e dal nome, e verifico ognuno su OpenFIGI…</span></div>`;return;}
  if(pf.etfLoading&&!items.some(x=>x.etf)){body.innerHTML=`<div class="thinking"><i></i><i></i><i></i><span>Leggo le schede dei fondi su justETF…</span></div>`;return;}
  if(!items.some(x=>x.isin)){body.innerHTML=`<p style="color:var(--muted)">Per sapere dove sei investito servono gli ISIN dei fondi. Nel file non ci sono e non sono riuscito a trovarli con certezza${pf.isinErr?` (${esc(pf.isinErr)})`:""}: aggiungi una colonna «ISIN» nel file e ricaricalo.</p>`;return;}
  const ok=x=>x.etf&&!x.etf.error;
  const L=k=>P.lookThrough(items.map(x=>({w:x.w,parti:ok(x)?x.etf[k]:null}))),C=L("paesi"),Se=L("settori");
  const X=P.exposures(items.map(x=>({w:x.w,etf:ok(x)?x.etf:null})));
  const CC=costCalc(),T=CC&&Number.isFinite(CC.ter)?{ter:CC.ter,coverage:CC.coverage}:P.weightedTer(items.map(x=>({w:x.w,ter:ok(x)?x.etf.ter:NaN})));
  const sp=n=>/^Altr|^Non |^Senza area|, altre|Non dettagliato/.test(n);
  const bars=(rows,col,lim=10)=>{const mx=Math.max(...rows.map(x=>x.peso),1e-9);return `<ul class="look">${[...rows.filter(r=>!sp(r.nome)).slice(0,lim),...rows.filter(r=>sp(r.nome))].map(r=>`<li class="${sp(r.nome)?"oth":""}"><span>${esc(r.nome)}</span><i><em style="width:${Math.min(100,r.peso*100/mx)}%;background:${col}"></em></i><b>${fmtPct(r.peso,1)}</b></li>`).join("")}</ul>`;};
  const get=(rows,n)=>(rows.find(r=>r.nome===n)||{peso:0}).peso;
  /* fuori dall'euro: valute note + quote «altre» (le emergenti sono comunque non euro, le europee possono contenere euro) → intervallo */
  const isOth=n=>/, altre|non dettagliate/.test(n);
  const nonEur=X?X.ccy.filter(r=>r.nome!=="EUR"&&r.nome!=="Non classificato"&&!isOth(r.nome)).reduce((s,r)=>s+r.peso,0):NaN,emOth=X?get(X.ccy,"Valute emergenti, altre"):0,unk=X?X.ccy.filter(r=>isOth(r.nome)).reduce((s,r)=>s+r.peso,0):0,emg=X?get(X.dev,"Emergenti"):NaN;
  const nonEurMin=nonEur+emOth,nonEurMax=nonEur+unk,neTxt=Math.round(nonEurMax*100)>Math.round(nonEurMin*100)?`${fmtN(nonEurMin*100,0)}–${fmtPct(nonEurMax,0)}`:fmtPct(nonEurMin,0);
  const tab=S.lookTab||"geo";
  let main="";
  if(tab==="geo")main=`<div class="look-grid"><div><h4>Aree</h4>${bars(X.reg,"var(--c1)")}<h4 style="margin-top:18px">Sviluppati ed emergenti</h4>${bars(X.dev,"var(--c2)")}</div><div><h4>Paesi</h4>${bars(C.rows,"var(--c1)")}</div></div>
    <p class="caption">Le quote «Altri» di ogni fondo vengono assegnate a un'area solo quando il fondo la dichiara: «Altri» di un ETF sui mercati emergenti vanno negli Emergenti, quelli di un ETF MSCI World tra gli altri paesi sviluppati. Il resto rimane «non dettagliato».</p>`;
  else if(tab==="ccy"){const usd=get(X.ccy,"USD");main=`<div class="look-grid"><div><h4>Valute a cui sei esposto</h4>${bars(X.ccy,"var(--c2)")}</div><div><h4>Cosa significa</h4>
    <p style="color:var(--muted);margin:0 0 10px">${nonEurMax-nonEurMin>.005?`Tra ${artIl(nonEurMin)}<b style="color:var(--fg)">${fmtPct(nonEurMin,0)}</b> e ${artIl(nonEurMax)}<b style="color:var(--fg)">${fmtPct(nonEurMax,0)}</b>`:`${artIl(nonEurMin).replace(/^./,c=>c.toUpperCase())}<b style="color:var(--fg)">${fmtPct(nonEurMin,0)}</b>`} del portafoglio dipende da valute diverse dall'euro, anche se gli ETF sono quotati in euro: conta la valuta delle aziende e dei titoli dentro il fondo, non quella del listino.</p>
    ${usd>0?`<p style="color:var(--muted);margin:0 0 10px">Se il dollaro perdesse il 10% sull'euro, a parità di tutto il resto il portafoglio perderebbe circa <b style="color:var(--fg)">${fmtPct(usd*.1,1)}</b>${tot?` (≈ ${fmtEur(usd*.1*tot)})`:""}.</p>`:""}
    <p class="caption" style="margin:0">Regole: fondo con copertura valutaria → euro; obbligazioni → valuta delle emissioni indicata nel focus del fondo; oro e materie prime → dollaro; azioni → valuta di ogni paese (zona euro = EUR).</p></div></div>`;}
  else if(tab==="style"){main=`<div class="look-grid"><div><h4>Classi di attivo</h4>${bars(X.cls,"var(--c3)")}</div><div>${X.equity>0?`<h4>Dimensione · parte azionaria</h4>${bars(X.size,"var(--c1)")}<h4 style="margin-top:18px">Stile e fattori · parte azionaria</h4>${bars(X.style,"var(--c2)")}<h4 style="margin-top:18px">Criteri ESG · parte azionaria</h4>${bars(X.esg,"var(--c3)")}`:`<p style="color:var(--muted)">Nessun fondo azionario: dimensione e stile non si applicano.</p>`}</div></div>
    <p class="caption">Classi, dimensione e stile sono letti dal focus e dal nome dell'indice di ogni fondo (per esempio «Bassa capitalizzazione», «Value», «Minimum Volatility»). Un ETF a capitalizzazione di mercato senza stile è «Mercato»: è l'esposizione neutra ai fattori.</p>`;}
  else if(tab==="conc"){const K=P.companyExposure(items.map(x=>({nome:x.nome,w:x.w,eq:ok(x)&&P.etfClass(x.etf)==="Azioni",top:ok(x)?x.etf.partecipazioni:null})));
    if(!K||!K.funds)main=`<p style="color:var(--muted)">Nessun fondo azionario con composizione nota: la concentrazione per azienda non si può calcolare.</p>`;
    else{const rng=r=>r.hi==null?`almeno ${fmtPct(r.lo,1)}`:fmtPct(r.hi,1)===fmtPct(r.lo,1)?fmtPct(r.lo,1):`${fmtN(r.lo*100,1)}–${fmtPct(r.hi,1)}`;
      const PR=K.pairs.filter(p=>p.n>0),noOv=K.pairs.filter(p=>p.n===0).length;
      const R0=K.rows.slice(0,12),mx=Math.max(...R0.map(r=>r.hi==null?r.lo:r.hi),1e-9);
      main=`<div class="look-kpi k3"><div><span class="eyebrow">Azienda più pesante</span><b>${R0.length?esc(R0[0].nome):"—"}</b><small>${R0.length?`${rng(R0[0])} del portafoglio${tot?` · almeno ${fmtEur(R0[0].lo*tot)}`:""}`:""}</small></div>
        <div><span class="eyebrow">Prime 10 aziende</span><b>≥ ${fmtPct(K.top10,1)}</b><small>del portafoglio in 10 società</small></div>
        <div><span class="eyebrow">Titoli sottostanti</span><b>≥ ${Math.round(K.distinct).toLocaleString("it-IT")}</b><small>aziende diverse in tutto</small></div></div>
        <div class="look-grid"><div><h4>Aziende · minimo e massimo sul portafoglio</h4><ul class="look co">${R0.map(r=>`<li><span title="${esc(r.isin.join(", "))}">${esc(r.nome)}<small>${r.in.map(x=>`${esc(x.f)} ${fmtPct(x.peso,1)}`).join(" · ")}</small></span><i><em style="width:${r.lo/mx*100}%;background:var(--c1)"></em>${r.hi!=null&&r.hi>r.lo?`<em class="rng" style="left:${r.lo/mx*100}%;width:${(r.hi-r.lo)/mx*100}%"></em>`:""}</i><b>${rng(r)}</b></li>`).join("")}</ul></div>
        <div><h4>Sovrapposizione tra ETF azionari</h4>${PR.length?`<ul class="look ov">${PR.map(p=>`<li><span>${esc(p.a)} ↔ ${esc(p.b)}<small>${p.n} aziende in comune tra le prime 10</small></span><i><em style="width:${Math.min(100,p.lo*100/Math.max(...PR.map(x=>x.lo),1e-9))}%;background:var(--c2)"></em></i><b>≥ ${fmtPct(p.lo,0)}</b></li>`).join("")}</ul><p class="caption" style="margin-top:8px">Su 100 € in ciascuno dei due fondi, almeno quella parte è investita nelle stesse aziende. È un minimo: conta solo le prime 10 partecipazioni di ogni fondo.${noOv?` Le altre ${noOv} coppie non hanno aziende in comune tra le prime 10 (per esempio grandi e piccole aziende, o paesi sviluppati ed emergenti).`:""}</p>`:K.pairs.length?`<p style="color:var(--muted)">Nessuna coppia di ETF azionari ha aziende in comune tra le prime 10 partecipazioni.</p>`:`<p style="color:var(--muted)">Serve almeno un secondo ETF azionario per confrontarli.</p>`}</div></div>
        <p class="caption">Metodo: minimo = Σ peso del fondo × peso dell'azienda nel fondo, dove l'azienda è tra le prime 10. Massimo = minimo + Σ peso degli altri fondi azionari × peso della loro 10ª partecipazione: fuori dalla top 10 un'azienda non può pesare di più. Le classi di azioni della stessa società (es. Alphabet A e C) sono unite.${K.missing.length?` <span style="color:var(--warn)">Senza partecipazioni note: ${K.missing.map(esc).join(", ")}; il massimo non si può calcolare.</span>`:""} Fonte: prime 10 partecipazioni delle schede justETF.</p>`;}}
  else if(tab==="sect")main=`<div class="look-grid"><div><h4>Settori</h4>${bars(Se.rows,"var(--c3)")}</div><div><h4>Come leggerlo</h4><p style="color:var(--muted);margin:0">Ogni scheda justETF pubblica i primi 4 settori di ogni fondo più «Altri»: quella parte resta «Altri, non dettagliati» e non viene ridistribuita. Per le obbligazioni i settori sono quelli degli emittenti.</p></div></div>`;
  else{const r=.05,rowsT=items.map(x=>{const v=tot*x.w,t=ok(x)&&Number.isFinite(x.etf.ter)?x.etf.ter:NaN;return {x,v,t,y:v*t,d10:Number.isFinite(t)?P.terDrag(v,t,r,10):NaN,d20:Number.isFinite(t)?P.terDrag(v,t,r,20):NaN};});
    const sum=k=>rowsT.reduce((s,q)=>s+(Number.isFinite(q[k])?q[k]:0),0),eur=v=>!Number.isFinite(v)?"—":Math.abs(v)<10?fmtN(v,2)+" €":fmtEur(v);
    main=`<div class="tablewrap"><table class="mt"><thead><tr><th>Strumento</th><th>Valore</th><th>TER</th><th>Costo l'anno</th><th>In 10 anni</th><th>In 20 anni</th></tr></thead><tbody>${rowsT.sort((a,b)=>(b.t||0)-(a.t||0)).map(q=>`<tr><td><span class="an">${esc(q.x.nome)}</span></td><td class="mono">${eur(q.v)}</td><td class="mono">${Number.isFinite(q.t)?fmtPct(q.t,2):"—"}</td><td class="mono">${eur(q.y)}</td><td class="mono">${eur(q.d10)}</td><td class="mono">${eur(q.d20)}</td></tr>`).join("")}
      <tr class="pf"><td><b>Totale</b></td><td class="mono">${eur(tot)}</td><td class="mono">${Number.isFinite(T.ter)?fmtPct(T.ter,2):"—"}</td><td class="mono">${eur(sum("y"))}</td><td class="mono">${eur(sum("d10"))}</td><td class="mono">${eur(sum("d20"))}</td></tr></tbody></table></div>
      <p class="caption">«In 10/20 anni» è quanto capitale in meno avresti per colpa del TER, senza nuovi versamenti, se il fondo rendesse il 5% l'anno lordo: V · [(1 + 5%)ⁿ − (1 + 5% − TER)ⁿ]. Include l'effetto composto (i costi pagati non rendono più). Non comprende commissioni di acquisto, spread, bollo e imposte. Il TER è dichiarato dall'emittente ed è già tolto dai prezzi: le analisi del sito lo includono già.</p>`;}
  const per=items.map(x=>{const e=x.etf,src=x.p.isinFound?`<span class="cl">trovato dall'IA, verificato con ${x.p.isinFound.via==="ticker"?"il ticker":"il nome"} su OpenFIGI</span>`:x.isin?"":`<span class="cl">${esc(x.p.isinMiss||"non presente nel file")}</span>`;
    return `<tr><td><span class="an">${esc(x.nome)}</span>${ok(x)?`<span class="cl">${esc(e.nome||"")}</span>`:""}</td><td class="mono">${x.isin?esc(x.isin):"—"}${src}</td><td class="mono">${fmtPct(x.w,1)}</td><td>${ok(x)?esc([e.focus,e.indice].filter(Boolean).join(" · ")):`<span class="cl">${x.isin?esc(e?e.error:"in caricamento…"):"non classificato"}</span>`}</td><td class="mono">${ok(x)?esc([e.valuta,hedgedTxt(e),(e.distribuzione||"").toLowerCase()].filter(Boolean).join(" · ")):""}</td></tr>`;}).join("");
  const read=items.map(x=>ok(x)&&x.etf.letto).filter(Boolean).sort()[0],found=items.filter(x=>x.p.isinFound).length;
  body.innerHTML=`<div class="look-kpi k4"><div><span class="eyebrow">Costo annuo medio (TER)</span><b>${Number.isFinite(T.ter)?fmtPct(T.ter,2):"—"}</b><small>${Number.isFinite(T.ter)?`≈ ${T.ter*tot<10?fmtN(T.ter*tot,2)+" €":fmtEur(T.ter*tot)} l'anno${T.coverage<.999?` · noto per il ${fmtPct(T.coverage,0)}`:""}`:"TER non disponibile"}</small></div>
      <div><span class="eyebrow">Fuori dall'euro</span><b>${Number.isFinite(nonEur)?neTxt:"—"}</b><small>esposto ad altre valute${nonEurMax-nonEurMin>.005?" · intervallo per le quote non dettagliate":""}</small></div>
      <div><span class="eyebrow">Mercati emergenti</span><b>${Number.isFinite(emg)?fmtPct(emg,0):"—"}</b><small>del portafoglio</small></div>
      <div><span class="eyebrow">Copertura dei dati</span><b>${fmtPct(X?X.coverage:C.coverage,0)}</b><small>con scheda del fondo letta${pf.etfLoading?" · in caricamento":""}</small></div></div>
    <div class="seg look-tabs" role="tablist" aria-label="Vista della composizione">${LOOK_TABS.map(([k,l])=>`<button type="button" role="tab" data-look="${k}" aria-pressed="${tab===k}" aria-selected="${tab===k}">${l}</button>`).join("")}</div>
    <div class="look-main">${main}</div>
    <h4 class="look-h">Strumenti</h4>
    <div class="tablewrap"><table class="mt"><thead><tr><th>Strumento</th><th>ISIN</th><th>Peso</th><th>Esposizione</th><th>Valuta · tipo</th></tr></thead><tbody>${per}</tbody></table></div>
    <p class="caption">Composizione look-through: peso del paese = Σ peso del fondo × quota del paese nel fondo.${found?` ${found} ISIN mancanti nel file sono stati trovati dall'IA e usati solo dopo la verifica su OpenFIGI.`:""} Fonte: justETF, schede lette il ${read?read.split("-").reverse().join("/"):"—"}.</p>`;
}
/* articolo davanti a una percentuale: «l'8%», «l'11%», «l'84%», altrimenti «il» */
const artIl=v=>/^(8|11(?!\d))/.test(String(Math.round(v*100)))?"l'":"il ";
const hedgedTxt=e=>{const c=String(e.copertura||"").replace(/^Con copertura valutaria\s*/i,"").trim();return c&&!/^(no|nessuna?)$/i.test(c)?"coperto":null;};
/* indice delle schede del laboratorio: solo quelle visibili, nell'ordine in cui compaiono; un clic porta alla scheda */
const LAB_IDX=[["chgCard","Cosa è cambiato"],["realCard","Rendimento reale"],["costCard","Costi"],["chartbox","Crescita"],["profCard","Il tuo profilo"],["pfCard","Portafoglio e ribilanciamento"],["cmpCard","Confronta allocazioni"],["lookCard","Dove sei investito"],["metrics","Metriche"],["corr","Correlazioni"]];
function labIndex(){
  const nav=$("#labIdx");if(!nav)return;
  const vis=LAB_IDX.map(([id,l])=>{const el=document.getElementById(id),card=el&&(el.classList.contains("card")?el:el.closest(".card"));return card&&!card.hidden&&card.offsetParent!==null?{card,l,y:card.getBoundingClientRect().top}:null;}).filter(Boolean).sort((a,b)=>a.y-b.y);
  nav.hidden=vis.length<3;S.labIdx=vis;
  nav.innerHTML=`<span class="eyebrow">Vai a</span>${vis.map((v,i)=>`<button type="button" class="chipbtn" data-li="${i}">${esc(v.l)}</button>`).join("")}`;
}
/* indice laterale: evidenzia la scheda che stai guardando */
document.getElementById("scene-lab")?.addEventListener("scroll",()=>{if(!S.labIdx)return;let k=0;S.labIdx.forEach((v,i)=>{if(v.card.getBoundingClientRect().top<window.innerHeight*.35)k=i;});document.querySelectorAll("#labIdx [data-li]").forEach((b,i)=>{const was=b.classList.contains("on");b.classList.toggle("on",i===k);
  /* sul telefono l'indice è una riga che scorre di lato: la scheda attiva resta in vista */
  if(i===k&&!was&&window.innerWidth<1100){const nav=$("#labIdx");nav.scrollTo({left:b.offsetLeft-nav.clientWidth/2+b.offsetWidth/2,behavior:"smooth"});}});},{passive:true});
document.addEventListener("click",e=>{const b=e.target.closest("[data-gv]");if(!b)return;S.growView=b.dataset.gv;drawChart(false);});
document.addEventListener("click",e=>{const b=e.target.closest("[data-li]");if(!b||!S.labIdx)return;const v=S.labIdx[+b.dataset.li];if(v)v.card.scrollIntoView({behavior:REDUCE?"auto":"smooth",block:"start"});});
function renderLab(){
  pmOfferRender();/* «metti questo portafoglio nel tuo patrimonio» */
  const ds=S.ds,L=S.lab,f=ds.freq.f;
  const starts=ds.assets.map(a=>({n:a.name,k:Math.max(0,a.first-1)})),late=starts.filter(s=>s.k>Math.min(...starts.map(x=>x.k))+1),gc=$("#growthNote");
  if(gc)gc.textContent=late.length?`Le linee partono quando inizia lo storico di ciascuno strumento: ${starts.map(s=>`${s.n} da ${fmtDate(ds.dates[s.k],f)}`).join(", ")}. Per confrontarle sullo stesso periodo usa le sezioni Rischio e Frontiera, che lavorano sui mesi comuni.`:"";
  $("#labSource").textContent=`${S.source.name} · foglio «${an().name}» · ${ds.assets.length} asset dal ${fmtDate(ds.dates[0],f)} al ${fmtDate(ds.dates[ds.dates.length-1],f)}.`;
  $("#kpis").innerHTML=[
    ["Asset",ds.assets.length,true],["Osservazioni",ds.nObs,true],
    ["Periodo",`${fmtDate(ds.dates[0],f)} – ${fmtDate(ds.dates[ds.dates.length-1],f)}`],["Frequenza",ds.freq.label]
  ].map(k=>`<div class="kpi"><span class="eyebrow">${k[0]}</span><span class="v${k[2]?"":" txt"}"${k[2]&&HAS_G?` data-count="${k[1]}"`:""}>${esc(typeof k[1]==="number"?(k[2]&&HAS_G?0:k[1]).toLocaleString("it-IT"):k[1])}</span></div>`).join("");
  $("#legend").innerHTML=ds.assets.map((a,i)=>`<span><i style="background:${color(i)}"></i>${esc(a.name)}</span>`).join("");
  drawChart(false);
  renderMetrics();
  renderMacro();
  renderProfileCard();
  renderPortfolio();
  renderCompare();
  renderReal();
  renderMatrix();
  setTimeout(labIndex,60);
  const caps=P.capabilities(ds),get=n=>caps.find(c=>c.name.startsWith(n));
  const NX=[
    {t:"Analisi del rischio",d:"VaR e CVaR storici, Sortino, contributo di ogni asset al rischio, concentrazioni.",c:get("Volatilità"),go:"risk"},
    {t:"Monte Carlo",d:"Migliaia di percorsi ricampionati dai tuoi rendimenti, con versamenti e prelievi.",c:get("Monte Carlo"),go:"sim"},
    {t:"Stress test",d:"Replica storica dove i dati lo permettono, shock ipotetici dichiarati negli altri casi.",c:get("Stress test: crisi"),go:"stress"},
    {t:"Frontiera efficiente",d:"Markowitz sui tuoi dati: massimo Sharpe, minima volatilità, risk parity, target di rischio o rendimento, con vincoli di peso.",c:{ok:ds.assets.length>=2,why:ds.assets.length>=2?`${ds.assets.length} asset da combinare`:"serve almeno un secondo asset"},go:"opt"},
    {t:"Benchmark",d:"Confronto con S&P 500, Nasdaq-100, MSCI World, Euro Stoxx 50 o un indice tuo: beta, alpha, tracking error, crisi del mercato.",c:{ok:true,why:"storici mensili via ETF, convertiti in euro con il cambio BCE"},go:"bench"}
  ];
  $("#next").innerHTML=NX.map(n=>`<div class="card"><div class="head"><h3>${n.t}</h3>${n.go?`<span class="chip live"><i></i>Disponibile</span>`:`<span class="soon">In arrivo</span>`}</div><p>${n.d}</p><p class="ready ${n.c&&n.c.ok?"":"no"}"><b>${n.c&&n.c.ok?"✓":"–"}</b>${esc(n.c?n.c.why:"")}</p>${n.go?`<div><button type="button" class="btn sm primary" data-go="${n.go}">Apri l'analisi →</button></div>`:""}</div>`).join("");
  setCorrView(S.corrView,false);
}
function renderMatrix(){
  const ds=S.ds,L=S.lab,k=ds.assets.length,short=n=>esc(n.length>14?n.slice(0,13)+"…":n),el=$("#corr");
  if(k<2){el.style.gridTemplateColumns="1fr";el.innerHTML=`<p class="caption">Serve almeno un secondo asset.</p>`;return;}
  el.style.gridTemplateColumns=`minmax(70px,1.2fr) repeat(${k},minmax(0,1fr))`;
  let h=`<span></span>`+ds.assets.map(a=>`<span class="h" title="${esc(a.name)}">${short(a.name)}</span>`).join("");
  ds.assets.forEach((a,i)=>{h+=`<span class="h rowh" title="${esc(a.name)}">${short(a.name)}</span>`;
    ds.assets.forEach((b,j)=>{const r=L.C[i][j].r,pct=Number.isFinite(r)?Math.round(Math.abs(r)*72):0,base=r>=0?"var(--c1)":"var(--bad)";
      h+=`<button type="button" data-rc="corr-${i}-${j}" style="background:color-mix(in oklab,${base} ${pct}%,var(--raise))">${Number.isFinite(r)?fmtN(r):"—"}</button>`;});});
  el.innerHTML=h;
}
function setCorrView(v,build){
  S.corrView=v;
  $("#seg-net").setAttribute("aria-pressed",v==="net");$("#seg-mat").setAttribute("aria-pressed",v==="mat");
  $("#netbox").hidden=v!=="net";$("#matbox").hidden=v!=="mat";
  if(v==="net"&&build)buildNet();
  if(v==="mat")disposeNet();
}
$("#seg-net").addEventListener("click",()=>setCorrView("net",true));
$("#seg-mat").addEventListener("click",()=>setCorrView("mat",false));

function niceTicks(min,max,count){
  const span=max-min||1,raw=span/count,mag=10**Math.floor(Math.log10(raw)),e=raw/mag,step=(e>=7.5?10:e>=3.5?5:e>=1.5?2:1)*mag;
  const lo=Math.floor(min/step)*step,hi=Math.ceil(max/step)*step,t=[];for(let v=lo;v<=hi+step*1e-9;v+=step)t.push(+v.toFixed(10));return t;
}
function drawChart(animate){
  if(!S.lab)return;
  /* vista alternativa: i tuoi soldi veri (valore e versato) al posto di «crescita di 100 €» */
  const gv=$("#growView");if(gv){gv.hidden=!(S.real&&S.real.pp);gv.querySelectorAll("[data-gv]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.gv===(S.growView||"100"))));}
  const gt=$("#growTitle");if(gt)gt.textContent=S.growView==="money"&&S.real&&S.real.pp?"I tuoi soldi nel tempo":"Crescita di 100 €";
  if(S.growView==="money"&&S.real&&S.real.pp){drawReal("#chartbox","#legend");return;}
  $("#legend").innerHTML=S.ds.assets.map((a,i)=>`<span><i style="background:${color(i)}"></i>${esc(a.name)}</span>`).join("");
  const ds=S.ds,W=S.lab.W,n=ds.dates.length,f=ds.freq.f;
  const VW=900,VH=340,ml=50,mr=14,mt=12,mb=30,iw=VW-ml-mr,ih=VH-mt-mb;
  let mn=Infinity,mx=-Infinity;W.forEach(s=>s.forEach(v=>{if(Number.isFinite(v)){if(v<mn)mn=v;if(v>mx)mx=v;}}));
  const ticks=niceTicks(Math.min(mn,100),mx,5),y0=ticks[0],y1=ticks[ticks.length-1];
  const X=i=>ml+(n>1?i/(n-1):0)*iw,Y=v=>mt+ih-(v-y0)/(y1-y0)*ih,anim=animate&&!REDUCE;
  let g=`<defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--c1);stop-opacity:.25"/><stop offset="1" style="stop-color:var(--c1);stop-opacity:0"/></linearGradient></defs>`;
  ticks.forEach(t=>{g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" stroke="var(--line)" stroke-width="1"/><text x="${ml-8}" y="${(Y(t)+4).toFixed(1)}" text-anchor="end">${fmtN(t,0)}</text>`;});
  const stepY=ds.years>24?5:ds.years>12?3:ds.years>6?2:1;
  ds.dates.forEach((d,i)=>{const y=d.getUTCFullYear();if(y%stepY===0&&(i===0||ds.dates[i-1].getUTCFullYear()!==y)){const x=X(i);if(x>ml+12&&x<VW-mr-12)g+=`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${mt+ih}" y2="${mt+ih+5}" stroke="var(--faint)"/><text x="${x.toFixed(1)}" y="${VH-8}" text-anchor="middle">${y}</text>`;}});
  g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Y(100).toFixed(1)}" y2="${Y(100).toFixed(1)}" stroke="var(--muted)" stroke-dasharray="3 4" stroke-width="1"/>`;
  W.forEach((s,ai)=>{
    let d="",pen=false,fi=-1,li=-1;
    s.forEach((v,i)=>{if(Number.isFinite(v)){d+=(pen?"L":"M")+X(i).toFixed(1)+","+Y(v).toFixed(1);pen=true;if(fi<0)fi=i;li=i;}else pen=false;});
    if(ai===0&&fi>=0)g+=`<path class="${anim?"area":""}" d="${d}L${X(li).toFixed(1)},${(mt+ih).toFixed(1)}L${X(fi).toFixed(1)},${(mt+ih).toFixed(1)}Z" fill="url(#ga)"/>`;
    g+=`<path class="${anim?"draw":""}" style="--k:${ai}" pathLength="1" d="${d}" fill="none" stroke="${color(ai)}" stroke-width="${ai===0?2.4:1.7}" stroke-linejoin="round" stroke-linecap="round"/>`;
    if(li>=0)g+=`<circle class="${anim?"endpt":""}" style="--k:${ai}" cx="${X(li).toFixed(1)}" cy="${Y(s[li]).toFixed(1)}" r="3.6" fill="${color(ai)}"/>`;
  });
  g+=`<line id="cross" x1="0" x2="0" y1="${mt}" y2="${mt+ih}" stroke="var(--fg)" stroke-width="1" opacity="0"/><rect x="${ml}" y="${mt}" width="${iw}" height="${ih}" fill="transparent"/>`;
  const box=$("#chartbox");
  box.innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Crescita di 100 euro per ciascun asset">${g}</svg><div class="tip" id="tip" hidden></div>`;
  const svg=box.querySelector("svg"),tip=$("#tip"),cross=svg.querySelector("#cross");
  svg.addEventListener("pointermove",e=>{
    const r=svg.getBoundingClientRect(),sx=(e.clientX-r.left)/r.width*VW,i=Math.max(0,Math.min(n-1,Math.round((sx-ml)/iw*(n-1)))),x=X(i);
    cross.setAttribute("x1",x);cross.setAttribute("x2",x);cross.setAttribute("opacity",".35");
    tip.innerHTML=`<span class="eyebrow">${fmtDate(ds.dates[i],f)}</span>`+ds.assets.map((a,ai)=>`<div class="r"><span><i style="background:${color(ai)}"></i>${esc(a.name)}</span><b class="mono">${Number.isFinite(W[ai][i])?fmtN(W[ai][i],1):"—"}</b></div>`).join("");
    tip.hidden=false;const px=x/VW*r.width,tw=tip.offsetWidth;
    tip.style.left=Math.min(Math.max(0,px+14>r.width-tw?px-tw-14:px+14),Math.max(0,r.width-tw))+"px";tip.style.top="8px";
  });
  svg.addEventListener("pointerleave",()=>{tip.hidden=true;cross.setAttribute("opacity","0");});
}

/* ---------- Rete 3D ---------- */
let NET=null;
function mds3(D){
  const n=D.length,D2=D.map(r=>r.map(x=>x*x)),rm=D2.map(r=>r.reduce((a,b)=>a+b,0)/n),all=rm.reduce((a,b)=>a+b,0)/n;
  let M=D2.map((r,i)=>r.map((x,j)=>-0.5*(x-rm[i]-rm[j]+all)));const cols=[];
  for(let d=0;d<3;d++){
    let v=Array.from({length:n},(_,i)=>Math.sin(i*1.7+d*2.3)+0.6),nv=Math.hypot(...v)||1;v=v.map(x=>x/nv);
    for(let it=0;it<300;it++){const w=M.map(r=>r.reduce((s,x,j)=>s+x*v[j],0)),nw=Math.hypot(...w);if(nw<1e-12)break;v=w.map(x=>x/nw);}
    const Mv=M.map(r=>r.reduce((s,x,j)=>s+x*v[j],0)),lam=Math.max(0,Mv.reduce((s,x,i)=>s+x*v[i],0));
    cols.push(v.map(x=>x*Math.sqrt(lam)));M=M.map((r,i)=>r.map((x,j)=>x-lam*v[i]*v[j]));
  }
  return Array.from({length:n},(_,i)=>[cols[0][i],cols[1][i],cols[2][i]]);
}
function disposeNet(){
  if(!NET)return;cancelAnimationFrame(NET.raf);NET.ro.disconnect();
  NET.scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});
  NET.renderer.dispose();NET.renderer.domElement.remove();NET.labels.forEach(l=>l.remove());NET=null;
}
function netFallback(msg){setCorrView("mat",false);const old=$("#netmsg");if(old)old.remove();$("#corr").insertAdjacentHTML("beforebegin",`<p class="caption" id="netmsg">${esc(msg)}</p>`);}
let threeP=null;
const loadThree=()=>threeP||(threeP=new Promise((ok,ko)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";s.onload=ok;s.onerror=()=>{threeP=null;ko();};document.head.appendChild(s);}));
function buildNet(){
  disposeNet();const ds=S.ds,L=S.lab;if(!ds||!L)return;
  const k=ds.assets.length,box=$("#net");
  if(k<2){netFallback("La rete richiede almeno due asset.");return;}
  /* three.js si scarica solo qui, la prima volta che si apre la rete 3D (~120 KB risparmiati per chi non la usa) */
  if(!window.THREE){loadThree().then(()=>{if(S.corrView==="net")buildNet();}).catch(()=>netFallback("La vista 3D non si è caricata: ti mostro la matrice."));return;}
  let renderer;try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch(e){netFallback("Il tuo browser non supporta la grafica 3D: ti mostro la matrice.");return;}
  const T=THREE,scene=new T.Scene(),camera=new T.PerspectiveCamera(42,1,.1,100);
  camera.position.set(0,1.3,8.4);camera.lookAt(0,0,0);renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));box.prepend(renderer.domElement);
  const group=new T.Group();scene.add(group);
  const D=ds.assets.map((a,i)=>ds.assets.map((b,j)=>{if(i===j)return 0;const r=L.C[i][j].r;return Number.isFinite(r)?Math.sqrt(Math.max(0,2*(1-r))):1.41;}));
  let pos=mds3(D);const maxR=Math.max(...pos.map(p=>Math.hypot(...p)))||1;
  pos=pos.map((p,i)=>{const q=p.map(x=>x*2.6/maxR);return Math.hypot(...q)<1e-6?[Math.cos(i*2.4)*1.5,Math.sin(i*1.7)*.6,Math.sin(i*2.4)*1.5]:q;});
  const lineC=new T.Color("#3A2766"),accC=new T.Color("#C8FF2E"),badC=new T.Color("#FF5C8A");
  const grid=new T.PolarGridHelper(3.6,16,6,64,lineC,lineC);grid.position.y=-2.2;grid.material.transparent=true;grid.material.opacity=.7;group.add(grid);
  const stars=new T.BufferGeometry(),sp=new Float32Array(600*3);for(let i=0;i<600;i++){const r=6+Math.random()*10,a=Math.random()*Math.PI*2,b=Math.acos(2*Math.random()-1);sp[i*3]=r*Math.sin(b)*Math.cos(a);sp[i*3+1]=r*Math.cos(b);sp[i*3+2]=r*Math.sin(b)*Math.sin(a);}
  stars.setAttribute("position",new T.BufferAttribute(sp,3));scene.add(new T.Points(stars,new T.PointsMaterial({color:0xA47BFF,size:.03,transparent:true,opacity:.6})));
  const nodes=[],halos=[];
  ds.assets.forEach((a,i)=>{
    const c=new T.Color(NET_COLORS[i%6]),vol=Number.isFinite(L.st[i].vol)?L.st[i].vol:.1,rad=.12+Math.min(.34,vol*1.2);
    const m=new T.Mesh(new T.SphereGeometry(rad,32,20),new T.MeshBasicMaterial({color:c}));m.position.set(...pos[i]);m.userData.i=i;group.add(m);nodes.push(m);
    const h=new T.Mesh(new T.SphereGeometry(rad*2.3,24,16),new T.MeshBasicMaterial({color:c,transparent:true,opacity:.14,depthWrite:false,blending:T.AdditiveBlending}));h.position.copy(m.position);group.add(h);halos.push(h);
    group.add(new T.Line(new T.BufferGeometry().setFromPoints([m.position.clone(),new T.Vector3(pos[i][0],-2.2,pos[i][2])]),new T.LineBasicMaterial({color:c,transparent:true,opacity:.22})));
  });
  const edges=[];
  for(let i=0;i<k;i++)for(let j=i+1;j<k;j++){
    const r=L.C[i][j].r;if(!Number.isFinite(r)||Math.abs(r)<.15)continue;
    const base=.15+.8*Math.abs(r),ln=new T.Line(new T.BufferGeometry().setFromPoints([nodes[i].position.clone(),nodes[j].position.clone()]),new T.LineBasicMaterial({color:r>=0?accC:badC,transparent:true,opacity:base,blending:T.AdditiveBlending}));
    ln.userData={i,j,base};group.add(ln);edges.push(ln);
  }
  const labels=ds.assets.map((a,i)=>{const d=document.createElement("div");d.className="nl";const mv=mktVol(a.name);d.innerHTML=`${esc(a.name.length>18?a.name.slice(0,17)+"…":a.name)}<small>${mv&&mv.y3!=null?`σ 3a ${fmtPct(mv.y3)}`:`σ ${fmtPct(L.st[i].vol)}`}</small>`;d.style.borderColor=NET_COLORS[i%6];box.appendChild(d);return d;});
  const size=()=>{const w=box.clientWidth,h=box.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();};
  const ro=new ResizeObserver(size);ro.observe(box);size();
  NET={renderer,scene,camera,group,nodes,edges,labels,ro,raf:0,drag:null,hover:-1,auto:!REDUCE,rx:.2,ry:.5,vy:0,intro:REDUCE?1:0};
  const ray=new T.Raycaster(),mouse=new T.Vector2(),el=renderer.domElement;
  const pick=e=>{const r=el.getBoundingClientRect();mouse.x=(e.clientX-r.left)/r.width*2-1;mouse.y=-(e.clientY-r.top)/r.height*2+1;ray.setFromCamera(mouse,camera);const hit=ray.intersectObjects(nodes);return hit.length?hit[0].object.userData.i:-1;};
  el.addEventListener("pointerdown",e=>{NET.drag={x:e.clientX,y:e.clientY,moved:0};NET.auto=false;el.setPointerCapture(e.pointerId);});
  el.addEventListener("pointermove",e=>{
    if(NET.drag){const dx=e.clientX-NET.drag.x,dy=e.clientY-NET.drag.y;NET.drag.moved+=Math.abs(dx)+Math.abs(dy);NET.ry+=dx*.008;NET.rx=Math.max(-.6,Math.min(.9,NET.rx+dy*.006));NET.vy=dx*.008;NET.drag.x=e.clientX;NET.drag.y=e.clientY;}
    else NET.hover=pick(e);
  });
  el.addEventListener("pointerup",e=>{const d=NET.drag;NET.drag=null;if(d&&d.moved<5){const i=pick(e);if(i>=0)openReceipt("vol-"+i);}setTimeout(()=>{if(NET&&!NET.drag)NET.auto=!REDUCE;},2500);});
  el.addEventListener("pointerleave",()=>{if(NET)NET.hover=-1;});
  const v3=new T.Vector3();
  const loop=()=>{
    if(!NET)return;
    if(!box.offsetParent){NET.raf=requestAnimationFrame(loop);return;}
    if(NET.intro<1)NET.intro=Math.min(1,NET.intro+.014);
    const e=1-Math.pow(1-NET.intro,3);
    if(NET.auto)NET.ry+=.0028;else if(!NET.drag){NET.ry+=NET.vy;NET.vy*=.94;}
    group.rotation.set(NET.rx,NET.ry,0);group.scale.setScalar(.5+.5*e);
    edges.forEach(ln=>{const on=NET.hover<0||ln.userData.i===NET.hover||ln.userData.j===NET.hover;ln.material.opacity=(on?ln.userData.base:.03)*e;});
    const tt=performance.now()/600;halos.forEach((h,i)=>{h.material.opacity=(NET.hover===i?.38:.12+.05*Math.sin(tt+i))*e;});
    const w=box.clientWidth,h=box.clientHeight;
    nodes.forEach((m,i)=>{m.getWorldPosition(v3);v3.project(camera);const lb=labels[i];lb.style.left=((v3.x+1)/2*w)+"px";lb.style.top=((1-v3.y)/2*h)+"px";lb.style.opacity=(NET.hover<0||NET.hover===i?1:.3)*e;lb.style.zIndex=String(Math.round((1-v3.z)*1000));});
    renderer.render(scene,camera);NET.raf=requestAnimationFrame(loop);
  };
  loop();
}

export { LAB_IDX, LOOK_TABS, NET, artIl, buildNet, disposeNet, drawChart, fetchMacro, hedgedTxt, labIndex, loadEtfInfo, loadThree, macroFor, mds3, mktVol, netFallback, niceTicks, renderLab, renderLook, renderMacro, renderMatrix, renderMetrics, setCorrView, threeP, ym };
