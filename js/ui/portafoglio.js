/* Portfolio OS · interfaccia · il tuo portafoglio: pesi, ribilanciamento, confronto allocazioni, proposta, profilo, costi.
   Parte di app.js divisa in moduli: il codice è lo stesso, cambiano solo import ed export. */
import { $, P, S, esc, fmtDate, fmtN, fmtPct, loadXLSX } from "./core.js";
import { current, go } from "./scene.js";
import { ISIN_RX, bondsHTML, isSim, track, trackOnce } from "./importa.js";
import { svFileName, svKeep } from "./archivio.js";
import { disposeNet, labIndex, macroFor, niceTicks } from "./laboratorio.js";
import { UNIT, fmtEur, renderRisk, unitN } from "./analisi.js";
import { taxInfo } from "./rendimento.js";
import { rpBrand } from "./report.js";
import { renderLabs } from "./home.js";

/* ---------- Il tuo portafoglio: pesi dal file, ribilanciamento ---------- */
function pfWeights(kind){
  const pf=S.portfolio,ds=S.ds;if(!pf||!ds||!ds.ok)return null;
  const tot=pf.positions.reduce((s,p)=>s+(p.valore||0),0);
  const w=ds.assets.map(a=>{const p=pf.positions.find(p=>(p.ticker||p.nome)===a.name);if(!p)return 0;return kind==="target"?(p.pesoTarget??0):(p.pesoAttuale??(tot?(p.valore||0)/tot:0));});
  const s=w.reduce((x,y)=>x+y,0);return s>0?w.map(x=>x/s):null;
}
function pfAsset(w,label){
  const ds=S.ds,n=ds.dates.length,ret=new Array(n).fill(NaN);let first=n;
  for(let k=0;k<n;k++){let r=0,ws=0;ds.assets.forEach((a,i)=>{if(w[i]>0&&Number.isFinite(a.ret[k])){r+=w[i]*a.ret[k];ws+=w[i];}});if(ws>.999){ret[k]=r;if(k<first)first=k;}}
  return {name:label,ret,first,missing:0,role:"price",col:"—"};
}
/* ---------- Ribilanciamento: pesi target modificabili, versamento del mese, banda di tolleranza ----------
   Tutto a prezzi fermi e senza costi né tasse: dice quanto comprare, non prevede i mercati. */
function rebalanceHTML(pf){
  const P0=pf.positions.filter(p=>p.valore!=null&&p.valore>0),tot=P0.reduce((s,p)=>s+p.valore,0);if(!P0.length||!(tot>0))return "";
  if(!S.rbal)S.rbal={C:pf.monthly||500,band:.03};
  const has=P0.some(p=>p.pesoTarget>0),tsum=P0.reduce((s,p)=>s+(p.pesoTarget>0?p.pesoTarget:0),0);
  const head=`<h3 style="font-size:1.1rem;margin-top:6px">Ribilanciamento</h3>`;
  if(!has)return `${head}<p style="color:var(--muted)">Nel file non ci sono pesi target. Scrivili qui sotto, oppure parti dai pesi attuali e modificali.</p>
    <div class="row" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px"><button type="button" class="btn sm" id="tgtFromNow">Usa i pesi attuali come target</button><button type="button" class="btn sm" id="tgtEqual">Pesi uguali</button></div>`;
  const v=P0.map(p=>p.valore),t=P0.map(p=>(p.pesoTarget>0?p.pesoTarget:0)/tsum),C=S.rbal.C,band=S.rbal.band;
  const b=P.contributionSplit(v,t,C),after=v.map((x,i)=>x+b[i]),T1=tot+C,T2=Math.max(...P0.map((p,i)=>t[i]>0?v[i]/t[i]:0));
  const months=P.monthsToTarget(v,t,C,band),out=P0.filter((p,i)=>Math.abs(v[i]/tot-t[i])>band).length;
  const e=x=>fmtEur(x),pt=x=>`${x>=0?"+":"−"}${fmtN(Math.abs(x)*100,1)} pt`;
  const rows=P0.map((p,i)=>{const dev=v[i]/tot-t[i],full=t[i]*tot-v[i],only=t[i]*T2-v[i];
    return `<tr><td><span class="an">${esc(p.ticker||p.nome)}</span></td><td class="mono">${e(v[i])}</td><td class="mono">${fmtPct(v[i]/tot,1)}</td>
      <td><input class="tgt" type="number" min="0" max="100" step="0.5" inputmode="decimal" data-tgt="${esc(p.ticker||p.nome)}" value="${+(p.pesoTarget*100/ (tsum>0?tsum:1)).toFixed(2)}" aria-label="Peso target di ${esc(p.ticker||p.nome)} in percentuale"></td>
      <td class="mono ${Math.abs(dev)>band?(dev>0?"neg":"dn"):""}">${pt(dev)}</td>
      <td class="mono">${b[i]>.005?"<b>+"+e(b[i])+"</b>":"—"}</td><td class="mono">${fmtPct(after[i]/T1,1)}</td>
      <td class="mono ${full<0?"neg":""}">${full>=0?"+":"−"}${e(Math.abs(full))}</td><td class="mono">${only>.5?"+"+e(only):"—"}</td></tr>`;}).join("");
  const norm=Math.abs(tsum-1)>.001?`<p class="caption" style="color:var(--warn)">I pesi target sommano a ${fmtPct(tsum,1)}: li uso riproporzionati a 100%.</p>`:"";
  return `${head}
    <div class="rb-form"><label><span class="eyebrow">Versamento di questo mese (€)</span><input type="number" min="0" step="50" inputmode="decimal" id="rbC" value="${C}"></label>
      <label><span class="eyebrow">Banda di tolleranza (± punti)</span><input type="number" min="0.5" max="20" step="0.5" inputmode="decimal" id="rbBand" value="${+(band*100).toFixed(1)}"></label>
      <div class="rb-sum"><b>${out?`${out} ${out===1?"strumento fuori":"strumenti fuori"} dalla banda`:"Tutto dentro la banda"}</b><span>${months===0?"non serve ribilanciare":months?`con ${e(C)} al mese rientri in <b>${months} ${months===1?"mese":"mesi"}</b> senza vendere`:"con questo versamento non rientri in 50 anni: serve vendere o versare di più"}</span></div></div>
    <div class="tablewrap"><table class="mt rb-t"><thead><tr><th>Strumento</th><th>Valore</th><th>Peso attuale</th><th>Target %</th><th>Scostamento</th><th>Questo mese</th><th>Peso dopo</th><th>Compra / vendi</th><th>Solo acquisti</th></tr></thead><tbody>${rows}
      <tr class="pf"><td><b>Totale</b></td><td class="mono"><b>${e(tot)}</b></td><td class="mono">100%</td><td class="mono">${fmtN(tsum*100,1)}%</td><td></td><td class="mono"><b>+${e(C)}</b></td><td class="mono">100%</td><td class="mono">0 €</td><td class="mono"><b>+${e(Math.max(0,T2-tot))}</b></td></tr></tbody></table></div>${norm}
    <p class="caption"><b>Questo mese</b>: il versamento va agli strumenti più sottopesati, portandoli insieme verso il target (acquisti bᵢ = max(0, tᵢ·K − vᵢ), con K tale che Σ bᵢ = versamento). <b>Compra / vendi</b>: riporta oggi ai target senza aggiungere soldi. <b>Solo acquisti</b>: quanto versare per arrivarci senza vendere. I mesi necessari sono calcolati a prezzi fermi, senza commissioni né tasse: vendere può generare plusvalenze tassate al 26% (12,5% sui titoli di Stato).</p>`;
}
document.addEventListener("click",e=>{const id=e.target&&e.target.id;if(id!=="tgtFromNow"&&id!=="tgtEqual")return;const pf=S.portfolio;if(!pf)return;
  const P0=pf.positions.filter(p=>p.valore>0),tot=P0.reduce((s,p)=>s+p.valore,0);P0.forEach(p=>{p.pesoTarget=id==="tgtEqual"?1/P0.length:+(p.valore/tot).toFixed(4);});renderPortfolio();});
document.addEventListener("change",e=>{const el=e.target;if(!el||!S.portfolio)return;
  if(el.matches&&el.matches("input.tgt")){const p=S.portfolio.positions.find(x=>(x.ticker||x.nome)===el.dataset.tgt),v=parseFloat(String(el.value).replace(",","."));if(p&&Number.isFinite(v)&&v>=0){p.pesoTarget=v/100;S.portfolio.positions.forEach(x=>{if(x!==p&&x.pesoTarget==null)x.pesoTarget=0;});renderPortfolio();if(current==="risk")renderRisk();}return;}
  if(el.id==="rbC"||el.id==="rbBand"){const v=parseFloat(String(el.value).replace(",","."));if(!Number.isFinite(v)||v<0)return;if(!S.rbal)S.rbal={C:500,band:.03};if(el.id==="rbC")S.rbal.C=v;else S.rbal.band=Math.max(.001,v/100);renderPortfolio();}
});
/* ---------- Confronta allocazioni: fino a 3 portafogli sugli stessi strumenti, valutati sugli stessi mesi ----------
   Mesi comuni = quelli in cui hanno un rendimento tutti gli strumenti usati da almeno un portafoglio: così nessuno è avvantaggiato
   da una storia più lunga. Ribilanciamento mensile ai pesi indicati, senza costi né tasse. */
const CMP_COL=["var(--lime)","var(--c2)","var(--c3)"];
function cmpInit(){
  const ds=S.ds,n=ds.assets.length,eq=ds.assets.map(()=>1/n),names=ds.assets.map(a=>a.name);
  if(S.cmpPending){const ports=S.cmpPending.map(p=>names.map(nm=>+(p.w[nm]||0)));S.cmpPending=null;if(ports.some(w=>w.some(x=>x>0))){S.cmp={ports:ports.map((w,i)=>({name:"ABC"[i],w}))};return;}}
  const now=pfWeights("now"),tgt=pfWeights("target");
  S.cmp={ports:[{name:"A",w:now||eq},{name:"B",w:tgt&&now&&tgt.some((x,i)=>Math.abs(x-now[i])>1e-6)?tgt:eq}]};
}
function cmpCalc(){
  const ds=S.ds,f=ds.freq.f,n=ds.dates.length,mm=macroFor(S.rfSrc),rf=mm?mm.rf:0;
  const P0=S.cmp.ports.map(p=>{const s=p.w.reduce((a,x)=>a+(x>0?x:0),0);return {...p,wn:s>0?p.w.map(x=>(x>0?x:0)/s):null,sum:s};});
  const used=ds.assets.map((a,i)=>P0.some(p=>p.wn&&p.wn[i]>0));
  const mask=ds.dates.map((d,k)=>k>0&&used.some(Boolean)&&ds.assets.every((a,i)=>!used[i]||Number.isFinite(a.ret[k])));
  const ks=mask.map((m,k)=>m?k:-1).filter(k=>k>=0);
  const masked=ds.assets.map(a=>({...a,ret:a.ret.map((r,k)=>mask[k]?r:NaN)}));
  const res=P0.map(p=>{if(!p.wn)return {...p,empty:true};
    const ret=ds.dates.map((d,k)=>mask[k]?p.wn.reduce((s,w,i)=>s+(w>0?w*ds.assets[i].ret[k]:0),0):NaN),first=ret.findIndex(Number.isFinite);
    const A={name:p.name,ret,first:first<0?n:first,missing:0,role:"price",col:"—"},st=P.stats(A,f,ds.dates),rk=P.riskStats(ret,f,rf);
    const W=[1];ks.forEach(k=>W.push(W[W.length-1]*(1+ret[k])));
    const cr=P.CRISES.map(c=>P.crisisAnalysis(ds.dates,masked,p.wn,f,c)).filter(c=>c.status==="in");
    return {...p,st,rk,W,cr,sharpe:st.vol>0?(st.mean*f-rf)/st.vol:NaN};});
  return {res,ks,rf,mm,used};
}
function renderCompare(){
  setTimeout(labIndex,60);
  const card=$("#cmpCard");if(!card)return;const ds=S.ds;
  /* nello spazio «Prove e confronti» il confronto è la scheda principale: in cima al laboratorio */
  const pc=$("#profCard"),pf=$("#pfCard");if(pc&&pf){if(isSim()){if(card.nextElementSibling!==pc)pc.parentNode.insertBefore(card,pc);}else if(pf.nextElementSibling!==card)pf.parentNode.insertBefore(card,pf.nextSibling);}
  if(!S.lab||!ds||!ds.ok||ds.assets.length<1){card.hidden=true;return;}
  card.hidden=false;if(!S.cmp||S.cmp.n!==ds.assets.length+":"+ds.nObs){cmpInit();S.cmp.n=ds.assets.length+":"+ds.nObs;}
  const R=cmpCalc(),f=ds.freq.f,K=R.ks,ok=R.res.filter(r=>!r.empty);
  const inputs=ds.assets.map((a,i)=>`<tr><td><span class="an">${esc(a.name)}</span></td>${S.cmp.ports.map((p,j)=>`<td><input class="cmp-w" type="number" min="0" max="100" step="1" inputmode="decimal" data-cp="${j}" data-ci="${i}" value="${+(p.w[i]*100).toFixed(1)}" aria-label="Peso di ${esc(a.name)} nel portafoglio ${p.name}"></td>`).join("")}</tr>`).join("");
  const sums=S.cmp.ports.map(p=>{const s=p.w.reduce((a,x)=>a+(x>0?x:0),0);return `<td class="mono ${Math.abs(s-1)<.001?"":"dn"}">${fmtN(s*100,0)}%</td>`;}).join("");
  const head=S.cmp.ports.map((p,j)=>`<th><span class="cmp-dot" style="background:${CMP_COL[j]}"></span>${p.name}${j>0?` <button type="button" class="cmp-x" data-cpx="${j}" aria-label="Togli il portafoglio ${p.name}">×</button>`:""}</th>`).join("");
  const best=(key,hi)=>{const v=ok.map(r=>r[key]);const m=hi?Math.max(...v.filter(Number.isFinite)):Math.min(...v.filter(Number.isFinite));return x=>ok.length>1&&Number.isFinite(x)&&Math.abs(x-m)<1e-12;};
  const rows=[["Rendimento annuo",r=>r.st.cagr,x=>fmtPct(x,1,true),true],["Volatilità",r=>r.st.vol,x=>fmtPct(x,1),false],["Sharpe",r=>r.sharpe,x=>fmtN(x),true],["Perdita massima",r=>r.st.mdd,x=>fmtPct(x,1),true],["Peggiori 12 mesi",r=>r.rk.worst12,x=>fmtPct(x,1),true],["VaR 95% in un mese",r=>-r.rk.var95,x=>fmtPct(x,1),true]];
  const crIds=[...new Set(ok.flatMap(r=>r.cr.map(c=>c.id)))];
  const met=rows.map(([l,g,fm,hi])=>{const vals=R.res.map(r=>r.empty?NaN:g(r)),isB=best(null,hi),m=hi?Math.max(...vals.filter(Number.isFinite)):Math.min(...vals.filter(Number.isFinite));
    return `<tr><td>${l}</td>${vals.map(v=>`<td class="mono${ok.length>1&&Number.isFinite(v)&&Math.abs(v-m)<1e-12?" cmp-best":""}">${Number.isFinite(v)?fm(v):"—"}</td>`).join("")}</tr>`;}).join("")+
    (()=>{const t=R.res.map(r=>r.empty?NaN:cmpTer(r));if(t.filter(Number.isFinite).length<2)return "";const m=Math.min(...t.filter(Number.isFinite));return `<tr><td>Costo annuo</td>${t.map(v=>`<td class="mono${ok.length>1&&Number.isFinite(v)&&Math.abs(v-m)<1e-12?" cmp-best":""}">${Number.isFinite(v)?fmtPct(v,2):"—"}</td>`).join("")}</tr>`;})()+
    crIds.map(id=>{const nm=(ok[0].cr.find(c=>c.id===id)||ok.flatMap(r=>r.cr).find(c=>c.id===id)).name,vals=R.res.map(r=>{const c=!r.empty&&r.cr.find(x=>x.id===id);return c?c.mdd:NaN;}),m=Math.max(...vals.filter(Number.isFinite));
      return `<tr><td>Crisi: ${esc(nm)}</td>${vals.map(v=>`<td class="mono${ok.length>1&&Number.isFinite(v)&&Math.abs(v-m)<1e-12?" cmp-best":""}">${Number.isFinite(v)?fmtPct(v,1):"—"}</td>`).join("")}</tr>`;}).join("");
  const from=K.length?fmtDate(ds.dates[K[0]-1]||ds.dates[K[0]],f):"—",to=K.length?fmtDate(ds.dates[K[K.length-1]],f):"—";
  /* chi accorcia il periodo comune: lo strumento usato con la storia più breve, se toglie almeno un anno rispetto agli altri */
  const starts=ds.assets.map((a,i)=>R.used[i]?{n:a.name,k:a.ret.findIndex(Number.isFinite)}:null).filter(x=>x&&x.k>=0).sort((a,b)=>b.k-a.k);
  const lim=starts.length>1&&starts[0].k-starts[1].k>=f?`<b>${esc(starts[0].n)}</b> ha prezzi solo da ${fmtDate(ds.dates[Math.max(0,starts[0].k-1)],f)} e accorcia il periodo comune: senza, si partirebbe da ${fmtDate(ds.dates[Math.max(0,starts[1].k-1)],f)} (${unitN(starts[0].k-starts[1].k,f)} in più). Se esiste una quotazione più vecchia dello stesso indice, usarla allunga il confronto.`:"";
  card.innerHTML=`<div class="head"><h3>Confronta allocazioni</h3><span class="eyebrow">stessi mesi · ${K.length} ${UNIT[f]?UNIT[f][1]:"periodi"}</span></div>
    <div class="cmp-grid"><div><div class="tablewrap"><table class="mt cmp-t"><thead><tr><th>Peso %</th>${head}</tr></thead><tbody>${inputs}<tr class="pf"><td><b>Totale</b></td>${sums}</tr></tbody></table></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${S.cmp.ports.length<3?`<button type="button" class="btn sm" id="cmpAdd">+ Aggiungi ${"ABC"[S.cmp.ports.length]}</button>`:""}<button type="button" class="btn sm" id="cmpEq">B a pesi uguali</button></div>
      <p class="caption">Se un portafoglio non somma a 100% lo riproporziono. Per confrontare strumenti che non sono nel file usa «Crea il tuo portafoglio» in home.</p></div>
    <div><div class="chartbox" id="cmpChart"></div><div class="legend">${R.res.map((r,j)=>`<span><i style="background:${CMP_COL[j]}"></i>${r.name}${r.empty?" (vuoto)":""}</span>`).join("")}</div></div></div>
    ${K.length>=12?`<div class="tablewrap"><table class="mt cmp-r"><thead><tr><th>Misura</th>${R.res.map((r,j)=>`<th><span class="cmp-dot" style="background:${CMP_COL[j]}"></span>${r.name}</th>`).join("")}</tr></thead><tbody>${met}</tbody></table></div>`:`<p style="color:var(--warn)">Servono almeno 12 ${UNIT[f]?UNIT[f][1]:"periodi"} in cui hanno dati tutti gli strumenti usati: qui ce ne sono ${K.length}.</p>`}
    ${K.length>=12?cmpMovesHTML(R):""}
    ${lim?`<p class="caption" style="color:var(--warn)">${lim}</p>`:""}
    <p class="caption">Confronto su ${K.length} ${UNIT[f]?UNIT[f][1]:"periodi"} comuni (${from} – ${to}): solo i mesi in cui hanno un prezzo tutti gli strumenti usati da almeno un portafoglio, così nessuno è avvantaggiato da una storia più lunga. Portafogli ribilanciati ogni mese ai pesi indicati, senza costi né tasse; in evidenza il valore migliore di ogni riga. Le crisi compaiono solo se cadono per intero nei mesi comuni. È il passato, non una previsione.</p>`;
  drawCompare(R);
}
/* ---------- Dalla proposta alle operazioni: quanto comprare e vendere per passare da A a B, imposte stimate sulle vendite, costi; export in Excel ---------- */
function cmpTer(r){const C=costCalc();if(!C||!r||r.empty)return NaN;let s=0,k=0;S.ds.assets.forEach((a,i)=>{const it=C.items.find(q=>q.nome===a.name);if(r.wn[i]>0&&it&&it.ter!=null){s+=r.wn[i]*it.ter;k+=r.wn[i];}});return k>.95?s/k+C.other:NaN;}
function cmpMoves(R){
  if(isSim())return null;const ok=R.res.filter(r=>!r.empty);if(ok.length<2)return null;
  const A=R.res[0],B=R.res[1];if(A.empty||B.empty)return null;
  const pp=S.real&&S.real.pp,C=costCalc(),V=pp?pp.value:C?C.tot:null;if(!(V>0))return null;
  const ds=S.ds,pos=(S.portfolio&&S.portfolio.positions)||[];
  const rows=ds.assets.map((a,i)=>{const va=V*A.wn[i],vb=V*B.wn[i],d=vb-va,q=pos.find(x=>(x.ticker||x.nome)===a.name);
    let tax=0,why="";
    /* vendita: si realizza la quota di guadagno latente in proporzione a quanto si vende (stima col costo medio dei versamenti) */
    if(d<-0.5&&pp&&pp.byAsset[i]&&pp.byAsset[i].value>0){const b=pp.byAsset[i],g=b.value-b.invested,ti=taxInfo(i);if(g>0){tax=-d*(g/b.value)*ti.rate;why=ti.why;}}
    return {i,name:a.name,isin:q&&q.isin||"",full:q&&(q.etf&&!q.etf.error&&q.etf.nome||q.nome)||"",wa:A.wn[i],wb:B.wn[i],va,vb,d,tax,why};}).filter(x=>x.wa>0.0005||x.wb>0.0005);
  return {V,rows,tax:rows.reduce((s,x)=>s+x.tax,0),buy:rows.reduce((s,x)=>s+(x.d>0?x.d:0),0),sell:rows.reduce((s,x)=>s+(x.d<0?-x.d:0),0),A,B,ta:cmpTer(A),tb:cmpTer(B)};
}
function cmpMovesHTML(R){
  const M=cmpMoves(R);if(!M)return "";
  const op=d=>Math.abs(d)<1?`<span class="cl">nessuna</span>`:d>0?`<b class="mv-buy">Compra ${fmtEur(d)}</b>`:`<b class="mv-sell">Vendi ${fmtEur(-d)}</b>`;
  return `<div class="mv"><div class="mv-h"><h4>Per passare da ${esc(M.A.name)} a ${esc(M.B.name)}</h4><button type="button" class="btn sm lime" id="cmpXls">Scarica la proposta in Excel</button></div>
    <div class="tablewrap"><table class="mt"><thead><tr><th>Strumento</th><th>Oggi (${esc(M.A.name)})</th><th>Con la proposta (${esc(M.B.name)})</th><th>Operazione</th><th>Imposte stimate</th></tr></thead><tbody>
    ${M.rows.map(x=>`<tr><td><span class="an">${esc(x.name)}</span>${x.isin?`<span class="cl">${esc(x.isin)}</span>`:""}</td><td class="mono">${fmtEur(x.va)}<span class="cl">${fmtPct(x.wa,1)}</span></td><td class="mono">${fmtEur(x.vb)}<span class="cl">${fmtPct(x.wb,1)}</span></td><td>${op(x.d)}</td><td class="mono">${x.tax>0.5?fmtEur(x.tax):"—"}${x.why&&x.tax>0.5?`<span class="cl">${esc(x.why)}</span>`:""}</td></tr>`).join("")}
    <tr class="pf"><td><b>Totale</b></td><td class="mono">${fmtEur(M.V)}</td><td class="mono">${fmtEur(M.V)}</td><td class="mono">vendite ${fmtEur(M.sell)} · acquisti ${fmtEur(M.buy)}</td><td class="mono"><b>${M.tax>0.5?fmtEur(M.tax):"—"}</b></td></tr></tbody></table></div>
    <p class="caption">Importi sul valore di oggi (${fmtEur(M.V)}), senza nuovi versamenti. Le imposte sono una stima: sulle vendite si realizza la parte di guadagno latente in proporzione a quanto si vende, al 26% o al 12,5% per i titoli di Stato; non considera minusvalenze da compensare, commissioni e spread.${Number.isFinite(M.ta)&&Number.isFinite(M.tb)?` Costo annuo: ${fmtPct(M.ta,2)} oggi, ${fmtPct(M.tb,2)} con la proposta (${fmtEur(Math.abs(M.tb-M.ta)*M.V)} l'anno ${M.tb<M.ta?"in meno":"in più"}).`:""}</p></div>`;
}
async function cmpExport(){
  await loadXLSX().catch(()=>{});if(typeof XLSX==="undefined"){alert("Il lettore Excel non si è caricato: controlla la connessione e riprova.");return;}
  const R=cmpCalc(),M=cmpMoves(R);if(!M)return;const ds=S.ds,f=ds.freq.f,B=rpBrand(),today=new Date().toLocaleDateString("it-IT");
  const r2=v=>Math.round(v*100)/100,p4=v=>Math.round(v*1e4)/1e4;
  const s1=[["Strumento","Nome","ISIN",`Peso ${M.A.name}`,`Peso ${M.B.name}`,`Valore ${M.A.name} (€)`,`Valore ${M.B.name} (€)`,"Operazione","Importo (€)","Imposte stimate (€)"],
    ...M.rows.map(x=>[x.name,x.full,x.isin,p4(x.wa),p4(x.wb),r2(x.va),r2(x.vb),Math.abs(x.d)<1?"nessuna":x.d>0?"Acquisto":"Vendita",r2(Math.abs(x.d)),r2(x.tax)]),
    ["Totale","","",1,1,r2(M.V),r2(M.V),"",r2(M.buy+M.sell),r2(M.tax)]];
  const res=[M.A,M.B],crIds=[...new Set(M.B.cr.map(c=>c.id))].filter(id=>M.A.cr.some(c=>c.id===id));
  const s2=[["Misura",M.A.name,M.B.name],["Rendimento annuo",p4(M.A.st.cagr),p4(M.B.st.cagr)],["Volatilità",p4(M.A.st.vol),p4(M.B.st.vol)],["Sharpe",r2(M.A.sharpe),r2(M.B.sharpe)],["Perdita massima",p4(M.A.st.mdd),p4(M.B.st.mdd)],["VaR 95% in un mese",p4(-M.A.rk.var95),p4(-M.B.rk.var95)],
    ...crIds.map(id=>{const a=M.A.cr.find(c=>c.id===id),b=M.B.cr.find(c=>c.id===id);return [`Crisi: ${a.name}`,p4(a.mdd),p4(b.mdd)];}),
    ...(Number.isFinite(M.ta)&&Number.isFinite(M.tb)?[["Costo annuo (TER e altri costi)",p4(M.ta),p4(M.tb)]]:[])];
  const s3=[["Proposta di portafoglio"],["Data",today],...(B.studio?[["Preparata da",B.studio]]:[]),["File",S.source&&S.source.name||""],["Periodo del confronto",`${R.ks.length} ${UNIT[f]?UNIT[f][1]:"periodi"} comuni, ${fmtDate(ds.dates[R.ks[0]-1]||ds.dates[R.ks[0]],f)} – ${fmtDate(ds.dates[R.ks[R.ks.length-1]],f)}`],
    ["Ipotesi","Portafogli ribilanciati ogni mese ai pesi indicati, senza costi né tasse. Importi sul valore di oggi, senza nuovi versamenti."],["Imposte","Stima: guadagno latente realizzato in proporzione alla vendita, 26% (12,5% titoli di Stato). Non considera minusvalenze, commissioni e spread."],
    ["Avvertenza","Analisi dei dati storici calcolata da Quanta Portfolio: i rendimenti passati non garantiscono quelli futuri."]];
  const wb=XLSX.utils.book_new(),pct=(ws,cols,rows)=>{rows.forEach(r=>cols.forEach(c=>{const a=XLSX.utils.encode_cell({r,c});if(ws[a]&&typeof ws[a].v==="number")ws[a].z="0.0%";}));};
  const w1=XLSX.utils.aoa_to_sheet(s1);pct(w1,[3,4],s1.map((_,i)=>i).slice(1));w1["!cols"]=[{wch:14},{wch:44},{wch:14},{wch:10},{wch:10},{wch:14},{wch:14},{wch:12},{wch:12},{wch:16}];
  const w2=XLSX.utils.aoa_to_sheet(s2);s2.forEach((r,i)=>{if(i&&!/Sharpe/.test(r[0]))pct(w2,[1,2],[i]);});w2["!cols"]=[{wch:34},{wch:12},{wch:12}];
  const w3=XLSX.utils.aoa_to_sheet(s3);w3["!cols"]=[{wch:22},{wch:100}];
  XLSX.utils.book_append_sheet(wb,w1,"Operazioni");XLSX.utils.book_append_sheet(wb,w2,"Confronto");XLSX.utils.book_append_sheet(wb,w3,"Note");
  const nm=svFileName().replace(/[^\w\- ]+/g,"").trim()||"portafoglio";
  XLSX.writeFile(wb,`Proposta ${nm} ${new Date().toISOString().slice(0,10)}.xlsx`);trackOnce("feature","proposta_excel",{name:"proposta_excel"});
}
document.addEventListener("click",e=>{if(e.target.closest("#cmpXls"))cmpExport();});
function drawCompare(R){
  const el=$("#cmpChart");if(!el)return;const ds=S.ds,K=R.ks,VW=640,VH=280,ml=46,mr=10,mt=10,mb=26,iw=VW-ml-mr,ih=VH-mt-mb;
  const L=R.res.filter(r=>!r.empty);if(!K.length||!L.length){el.innerHTML="";return;}
  const all=L.flatMap(r=>r.W),lo=Math.min(...all)*.95,hi=Math.max(...all)*1.03,n=K.length+1;
  const X=i=>ml+i/(n-1||1)*iw,Y=v=>mt+ih-(v-lo)/((hi-lo)||1)*ih;let g="";
  niceTicks(lo*100,hi*100,4).forEach(v=>{if(v<lo*100||v>hi*100)return;g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Y(v/100).toFixed(1)}" y2="${Y(v/100).toFixed(1)}" stroke="var(--line)"/><text x="${ml-6}" y="${(Y(v/100)+4).toFixed(1)}" text-anchor="end">${fmtN(v,0)}</text>`;});
  [0,n-1].forEach(i=>{const k=i===0?K[0]-1:K[K.length-1];g+=`<text x="${X(i).toFixed(1)}" y="${VH-6}" text-anchor="${i?"end":"start"}">${fmtDate(ds.dates[Math.max(0,k)],ds.freq.f)}</text>`;});
  R.res.forEach((r,j)=>{if(r.empty)return;let d="";r.W.forEach((v,i)=>{d+=(i?"L":"M")+X(i).toFixed(1)+","+Y(v).toFixed(1);});g+=`<path d="${d}" fill="none" stroke="${CMP_COL[j]}" stroke-width="${j?2:2.6}" stroke-linejoin="round"><title>${r.name}: 100 € diventano ${fmtN(r.W[r.W.length-1]*100,0)} €</title></path>`;});
  el.innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Crescita di 100 euro per ogni portafoglio sugli stessi mesi">${g}</svg>`;
}
document.addEventListener("change",e=>{const el=e.target;if(!el.matches||!el.matches("input.cmp-w")||!S.cmp)return;trackOnce("feature","confronto",{name:"confronto"});const v=parseFloat(String(el.value).replace(",","."));if(!Number.isFinite(v)||v<0)return;S.cmp.ports[+el.dataset.cp].w[+el.dataset.ci]=v/100;renderCompare();svKeep();});
document.addEventListener("click",e=>{if(!S.cmp)return;const t=e.target;
  if(t.id==="cmpAdd"&&S.cmp.ports.length<3){const n=S.ds.assets.length;S.cmp.ports.push({name:"ABC"[S.cmp.ports.length],w:S.ds.assets.map(()=>1/n)});renderCompare();}
  else if(t.id==="cmpEq"&&S.cmp.ports[1]){const n=S.ds.assets.length;S.cmp.ports[1].w=S.ds.assets.map(()=>1/n);renderCompare();}
  else if(t.dataset&&t.dataset.cpx){S.cmp.ports.splice(+t.dataset.cpx,1);S.cmp.ports.forEach((p,i)=>p.name="ABC"[i]);renderCompare();}
  else return;svKeep();});
/* ---------- Il tuo profilo: la tua allocazione è coerente con te? ----------
   Non è consulenza: non indica prodotti. Misura la perdita che l'utente regge da come reagisce a crisi vere rivissute
   con il suo capitale, e la confronta con le perdite storiche del suo portafoglio e di versioni più prudenti
   (stessa composizione di oggi + liquidità al tasso BCE), sugli stessi dati. */
const PRQ=[
  {k:"hor",q:"Fra quanto tempo ti serviranno questi soldi?",o:[["lt3","Meno di 3 anni"],["3-7","Da 3 a 7 anni"],["7-15","Da 7 a 15 anni"],["gt15","Oltre 15 anni"]]},
  {k:"use",q:"A cosa servono, soprattutto?",o:[["casa","Un acquisto importante (casa, studi…)"],["pens","Pensione o futuro lontano"],["cresc","Far crescere il patrimonio"],["ris","Una riserva per gli imprevisti"]]},
  {k:"cash",q:"Fuori da questo portafoglio, per quanti mesi di spese hai liquidità da parte?",o:[["0-3","Meno di 3 mesi"],["3-6","Da 3 a 6 mesi"],["6-12","Da 6 a 12 mesi"],["gt12","Più di un anno"]]}];
const PRC=[["stay","Resto investito"],["half","Vendo metà"],["all","Vendo tutto"],["buy","Compro di più"]];
function prBase(){
  const ds=S.ds,f=ds.freq.f,w=pfWeights("now")||ds.assets.map(()=>1/ds.assets.length),pos=S.portfolio?S.portfolio.positions:[];
  const cap=Math.round(pos.reduce((s,p)=>s+(p.valore||0),0))||10000,mm=macroFor(S.rfSrc),rf=mm?mm.rf:0;
  const cr=P.CRISES.map(c=>P.crisisAnalysis(ds.dates,ds.assets,w,f,c)).filter(c=>c.status==="in"&&c.troughK!=null&&c.mdd<-.05).sort((a,b)=>a.mdd-b.mdd).slice(0,3);
  return {ds,f,w,cap,rf,cr};
}
/* quanto sarebbe valso restare: dal punto più basso fino al recupero, o al massimo 24 periodi dopo */
function prAfter(c,f){const pr=P.portfolioReturns(S.ds.assets,S.PR.w),end=Math.min(pr.length-1,c.recK!=null?c.recK:c.troughK+Math.round(2*f));let v=1;for(let k=c.troughK+1;k<=end;k++)if(Number.isFinite(pr[k]))v*=1+pr[k];return {g:v-1,end};}
/* versione più prudente: x del portafoglio di oggi, il resto in liquidità al tasso privo di rischio, ribilanciata ogni periodo */
function prMix(x){const B=S.PR,pr=P.portfolioReturns(B.ds.assets,B.w),cash=B.rf/B.f,r=pr.map(v=>Number.isFinite(v)?x*v+(1-x)*cash:NaN);
  let V=1,pk=1,mdd=0;r.forEach(v=>{if(!Number.isFinite(v))return;V*=1+v;if(V>pk)pk=V;mdd=Math.min(mdd,V/pk-1);});
  const cr=B.cr.map(c=>{let v=1,p=1,d=0;c.idx.forEach(k=>{if(!Number.isFinite(r[k]))return;v*=1+r[k];if(v>p)p=v;d=Math.min(d,v/p-1);});return d;});
  const n=r.filter(Number.isFinite).length,cagr=n?Math.pow(r.reduce((a,v)=>Number.isFinite(v)?a*(1+v):a,1),B.f/n)-1:NaN;
  return {x,mdd,cr,worst:Math.min(mdd,...cr),cagr};}
function openProfile(){
  trackOnce("feature","profilo",{name:"profilo"});
  if(!S.lab||!S.ds||!S.ds.ok)return;S.PR={...prBase(),step:0,ans:{},ch:[]};prRender();
  $("#profile").classList.add("open");$("#scrim").classList.add("open");$("#profile").setAttribute("aria-hidden","false");
}
function closeProfile(){$("#profile").classList.remove("open");if(!$("#drawer").classList.contains("open")&&!$("#builder").classList.contains("open"))$("#scrim").classList.remove("open");$("#profile").setAttribute("aria-hidden","true");}
function prRender(){
  const B=S.PR,el=$("#prBody"),nq=PRQ.length,nc=B.cr.length,tot=1+nq+nc+1,st=B.step,ds=B.ds,f=B.f;
  const bar=`<div class="pr-bar"><i style="width:${Math.round(st/(tot-1)*100)}%"></i></div><span class="eyebrow">Passo ${Math.min(st+1,tot)} di ${tot}</span>`;
  if(st===0){el.innerHTML=`${bar}<h3 class="pr-h">La tua allocazione è coerente con te?</h3>
    <p>Tre domande su di te, poi rivivi ${nc?`${nc} ${nc===1?"crisi vera":"crisi vere"}`:"le crisi"} con il tuo capitale di oggi (${fmtEur(B.cap)}) e scegli cosa avresti fatto. Alla fine confronto la perdita che reggi con quella che il tuo portafoglio ha avuto davvero.</p>
    ${nc?"":`<p style="color:var(--warn)">Nei dati del tuo portafoglio non c'è nessuna crisi completa con un calo di almeno il 5%: il test resta alle tre domande e alle perdite storiche.</p>`}
    <p class="caption">Strumento educativo, non consulenza: non ti dico cosa comprare. Usa solo i prezzi storici del tuo portafoglio.</p>
    <button type="button" class="btn lime" data-prgo="1">Inizia · 2 minuti</button>`;return;}
  if(st<=nq){const q=PRQ[st-1];el.innerHTML=`${bar}<h3 class="pr-h">${q.q}</h3><div class="pr-opts">${q.o.map(o=>`<button type="button" class="pr-opt${B.ans[q.k]===o[0]?" on":""}" data-pra="${q.k}" data-prv="${o[0]}">${o[1]}</button>`).join("")}</div>${st>1?`<button type="button" class="btn sm" data-prgo="-1">Indietro</button>`:""}`;return;}
  if(st<=nq+nc){const i=st-nq-1,c=B.cr[i],v=c.path.find(p=>p.k===c.troughK).v,val=B.cap*(1+c.mdd),done=B.ch[i];
    const head=`${bar}<span class="eyebrow">${esc(c.name)} · ${fmtDate(ds.dates[c.troughK],f)}</span><h3 class="pr-h">Il tuo portafoglio da ${fmtEur(B.cap)} ora vale <span class="dn">${fmtEur(val)}</span></h3>
      <p>In ${unitN(c.troughK-c.idx[0]+1,f)} ha perso il <b class="dn">${fmtPct(-c.mdd,0)}</b>. ${esc(c.what||"")} Nessuno sa se il peggio è passato.</p>`;
    if(!done){el.innerHTML=`${head}<h4 class="pr-q">Cosa fai?</h4><div class="pr-opts">${PRC.map(o=>`<button type="button" class="pr-opt" data-prc="${i}" data-prv="${o[0]}">${o[1]}</button>`).join("")}</div>`;return;}
    const A=prAfter(c,f),lost=done==="all"?A.g:done==="half"?A.g/2:done==="buy"?-A.g*.25:0,eur=B.cap*(1+c.mdd)*Math.abs(lost);
    el.innerHTML=`${head}<div class="pr-res"><b>Hai scelto: ${PRC.find(o=>o[0]===done)[1].toLowerCase()}.</b>
      <p>Restando investito, ${A.end<ds.dates.length-1&&c.recK!=null?`a ${fmtDate(ds.dates[A.end],f)} il portafoglio aveva recuperato tutto`:`nei ${unitN(A.end-c.troughK,f)} successivi il portafoglio ha fatto ${fmtPct(A.g,0,true)}`}.
      ${done==="stay"?"Restare ti avrebbe fatto recuperare la perdita.":done==="buy"?`Comprare di più (un quarto del valore) ti avrebbe fatto guadagnare circa ${fmtEur(eur)} in più.`:A.g>0?`Vendendo avresti rinunciato a circa <b class="dn">${fmtEur(eur)}</b> di recupero.`:"Questa volta vendere non ti sarebbe costato."}</p></div>
      <button type="button" class="btn lime" data-prgo="1">${i<nc-1?"Prossima crisi":"Vedi il risultato"}</button>`;return;}
  /* verdetto */
  const sold=B.cr.map((c,i)=>({c,ch:B.ch[i]})).filter(x=>x.ch==="all"||x.ch==="half"),tol=sold.length?Math.max(...sold.map(x=>x.c.mdd)):null;
  /* chi vende a un calo d non regge d: la soglia è appena sopra (d + 2 punti); chi non vende mai regge almeno il calo più profondo rivissuto */
  const deepest=B.cr.length?Math.min(...B.cr.map(c=>c.mdd)):null,thr=tol!=null?tol+.02:deepest!=null?deepest:null;
  const all=prMix(1),mixes=[1,.8,.6,.4,.2].map(prMix),fits=m=>thr!=null&&m.worst>=thr-1e-9,okMix=thr!=null?mixes.find(fits):null;
  const hor=B.ans.hor,cash=B.ans.cash,warn=[];
  if(hor==="lt3"&&all.worst<-.15)warn.push(`Ti servono i soldi entro 3 anni, ma nel passato il portafoglio ha perso fino al ${fmtPct(-all.worst,0)}: in un periodo così breve una perdita potrebbe non fare in tempo a recuperare.`);
  if(cash==="0-3")warn.push("Hai meno di 3 mesi di spese da parte: un imprevisto durante un crollo potrebbe costringerti a vendere in perdita. Molti tengono da 3 a 6 mesi di riserva prima di investire.");
  if(B.ans.use==="ris"&&all.worst<-.1)warn.push("Dici che questi soldi sono una riserva per gli imprevisti, ma il portafoglio può perdere molto proprio quando servono.");
  const coh=thr==null?null:fits(all);
  el.innerHTML=`${bar}<h3 class="pr-h">${coh==null?"Il tuo risultato":coh?"La tua allocazione è coerente con come reagisci":`Il tuo portafoglio è più rischioso di quanto reggi`}</h3>
    <div class="pr-k"><div><span class="eyebrow">La perdita che reggi</span><b>${tol!=null?`meno del ${fmtPct(-tol,0)}`:deepest!=null?`almeno il ${fmtPct(-deepest,0)}`:"—"}</b><small>${tol!=null?`hai venduto quando il portafoglio perdeva il ${fmtPct(-tol,0)}`:deepest!=null?"non hai mai venduto nelle crisi rivissute":"nessuna crisi nei dati"}</small></div>
      <div><span class="eyebrow">Perdita peggiore del tuo portafoglio</span><b class="dn">${fmtPct(-all.worst,0)}</b><small>nei dati storici, con i pesi di oggi</small></div></div>
    ${thr!=null?`<h4 class="pr-q">Quanto avresti potuto tenere investito, così com'è, per restare sotto la tua soglia</h4>
    <div class="tablewrap"><table class="mt pr-t"><thead><tr><th>Investito come oggi</th><th>Liquidità</th><th>Perdita peggiore</th><th>Rendimento annuo</th></tr></thead><tbody>${mixes.map(m=>`<tr class="${okMix&&m.x===okMix.x?"pr-ok":""}"><td class="mono">${fmtPct(m.x,0)}</td><td class="mono">${fmtPct(1-m.x,0)}</td><td class="mono ${fits(m)?"":"dn"}">${fmtPct(-m.worst,0)}</td><td class="mono">${fmtPct(m.cagr,1,true)}</td></tr>`).join("")}</tbody></table></div>
    <p class="caption">${okMix?`Nel passato, con il ${fmtPct(okMix.x,0)} investito come oggi e il resto in liquidità la perdita peggiore sarebbe rimasta entro la tua soglia.`:"Nessuna combinazione con almeno il 20% investito sarebbe rimasta sotto la tua soglia."} Liquidità remunerata al tasso privo di rischio medio${B.mm?"":" (0%)"}. Puoi provare mix diversi in «Confronta allocazioni».</p>`:""}
    ${warn.length?`<ul class="pr-warn">${warn.map(x=>`<li>${x}</li>`).join("")}</ul>`:""}
    <p class="caption">Come leggerlo: la soglia nasce da quello che hai scelto rivivendo crisi vere, non da quello che dichiari. Le perdite sono storiche e calcolate sui prezzi di mercato del tuo portafoglio; il futuro può essere peggiore. Strumento educativo, non consulenza finanziaria: non indica prodotti da comprare o vendere.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn" data-prgo="restart">Rifai il test</button><button type="button" class="btn lime" data-prgo="cmp">Prova un'allocazione diversa</button></div>`;
  S.PR.result={tol,thr,worst:all.worst,coh,okMix:okMix&&okMix.x};
  track("profile_done",{result:coh==null?"senza_crisi":coh?"coerente":"piu_rischioso"});
}
$("#profile").addEventListener("click",e=>{const B=S.PR;if(!B)return;const g=e.target.closest("[data-prgo]"),a=e.target.closest("[data-pra]"),c=e.target.closest("[data-prc]");
  if(a){B.ans[a.dataset.pra]=a.dataset.prv;B.step++;prRender();}
  else if(c){B.ch[+c.dataset.prc]=c.dataset.prv;prRender();}
  else if(g){const v=g.dataset.prgo;if(v==="restart"){S.PR={...prBase(),step:0,ans:{},ch:[]};}else if(v==="cmp"){closeProfile();const el=$("#cmpCard");if(el){go("lab");setTimeout(()=>el.scrollIntoView({behavior:"smooth",block:"start"}),400);}return;}else B.step=Math.max(0,B.step+(+v));prRender();}});
$("#closeProfile").addEventListener("click",closeProfile);
$("#scrim").addEventListener("click",closeProfile);
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("#profile").classList.contains("open"))closeProfile();});
document.addEventListener("click",e=>{if(e.target.closest("#prStart"))openProfile();});
function renderProfileCard(){const el=$("#profCard");if(!el)return;if(!S.lab||!S.ds||!S.ds.ok){el.hidden=true;return;}el.hidden=false;
  const r=S.PR&&S.PR.result;
  el.innerHTML=`<div class="prof-cta"><div><span class="eyebrow">Il tuo profilo</span><h3>La tua allocazione è coerente con te?</h3><p class="caption" style="margin:0">${r&&r.coh!=null?(r.coh?"Ultimo risultato: coerente con come reagisci alle crisi.":"Ultimo risultato: il portafoglio è più rischioso di quanto reggi."):"Rivivi crisi vere con il tuo capitale e scopri la perdita che reggi davvero, misurata da come reagisci e non da un questionario."}</p></div><button type="button" class="btn lime" id="prStart">${r?"Rifai il test":"Fai il test · 2 minuti"}</button></div>`;}
function renderPortfolio(){
  const card=$("#pfCard");if(!card)return;
  if(isSim()){card.hidden=true;return;} /* portafoglio di prova: pesi e confronto sono nella scheda «Confronta allocazioni» */
  const pf=S.portfolio,ds=S.ds,f=ds&&ds.freq?ds.freq.f:12;
  if(!pf||!S.lab){card.hidden=true;return;}
  card.hidden=false;
  const mm=macroFor(S.rfSrc),rf=mm?mm.rf:0;
  S.lab.pf=[["Pesi attuali","now"],["Pesi target","target"]].map(([label,k])=>{const w=pfWeights(k);if(!w)return null;const a=pfAsset(w,label);return {label,w,a,st:P.stats(a,f,ds.dates)};}).filter(Boolean);
  const cell=(key,val,cls="")=>`<button type="button" class="cellbtn ${cls}" data-rc="${key}">${val}</button>`;
  const rows=S.lab.pf.map((r,i)=>{const s=r.st;if(s.n<2)return "";const sh=s.vol>0?(s.mean*f-rf)/s.vol:NaN,real=mm?(1+s.cagr)/(1+mm.infl)-1:NaN;
    return `<tr><td><span class="an">${esc(r.label)}</span><span class="cl mono">${r.w.map((x,j)=>x>0?`${esc(ds.assets[j].name)} ${fmtPct(x,0)}`:"").filter(Boolean).join(" · ")}</span></td>
      <td>${cell("pf-cagr-"+i,fmtPct(s.cagr,1,true),s.cagr<0?"neg":"")}</td><td>${mm?cell("pf-real-"+i,fmtPct(real,1,true),real<0?"neg":""):"—"}</td><td>${cell("pf-vol-"+i,fmtPct(s.vol))}</td><td>${cell("pf-sharpe-"+i,fmtN(sh))}</td><td>${cell("pf-mdd-"+i,fmtPct(s.mdd),"neg")}</td></tr>`;}).join("");
  const reb=rebalanceHTML(pf);
  card.innerHTML=`<div class="head"><h3>Il tuo portafoglio</h3><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button type="button" class="btn sm" id="variantBtn">Prova una variante</button><span class="chip hist"><i></i>pesi dal file «${esc(pf.from)}»</span></div></div>
    <div class="tablewrap"><table class="mt"><thead><tr><th>Portafoglio</th><th>Rend. annuo</th><th>Rend. reale</th><th>Volatilità</th><th>Sharpe</th><th>Max drawdown</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="caption">Ipotesi: portafoglio ribilanciato ogni mese ai pesi indicati, sullo storico di ${ds.nObs} mesi. ${S.rb?"Prezzi di mercato convertiti in euro con il cambio BCE di fine mese.":"Valori come nel file."}${pf.missing.length?` Esclusi perché senza prezzi: ${pf.missing.map(m=>esc(m.nome)).join(", ")}.`:""}</p>${bondsHTML()}${reb}`;
}

/* ---------- Quanto costa il portafoglio: TER di ogni strumento (justETF per gli ETF, dal KID per i fondi), altri costi, confronto con strumenti a basso costo ----------
   Le scelte restano in questo browser (pos-costs-v1): TER inseriti per ISIN o nome, altri costi annui, TER di confronto. */
const CO_KEY="pos-costs-v1",CO_R=.05,CO_Y=20;
function coPrefs(){try{return JSON.parse(localStorage.getItem(CO_KEY)||"{}")||{};}catch{return {};}}
function coSave(p){try{localStorage.setItem(CO_KEY,JSON.stringify(p));}catch{}}
const coKey=p=>p.isin&&ISIN_RX.test(p.isin)?p.isin:String(p.ticker||p.nome||"").trim().toLowerCase();
function costCalc(){
  const pf=S.portfolio;if(!pf||!pf.positions||!pf.positions.length||isSim())return null;
  const tot=pf.positions.reduce((a,p)=>a+(p.valore>0?p.valore:0),0);if(!(tot>0))return null;
  const pr=coPrefs(),own=pr.ter||{},cheap=Number.isFinite(pr.cheap)?pr.cheap:.002,other=Number.isFinite(pr.other)?pr.other:0;
  const items=pf.positions.map(p=>{const k=coKey(p),j=p.etf&&!p.etf.error&&Number.isFinite(p.etf.ter)?p.etf.ter:null,u=Number.isFinite(own[k])?own[k]:null,t=u!=null?u:j,v=p.valore>0?p.valore:0;
    return {p,k,nome:p.ticker||p.nome||"—",full:p.etf&&!p.etf.error&&p.etf.nome||p.nome||"",isin:p.isin&&ISIN_RX.test(p.isin)?p.isin:null,v,w:v/tot,ter:t,src:u!=null?"tu":j!=null?(p.etf.btp?"titolo di Stato":"justETF"):null,etfTer:j,
      y:t!=null?v*t:NaN,d20:t!=null?P.terDrag(v,t,CO_R,CO_Y):NaN,save:t!=null&&t>cheap?P.terDrag(v,t,CO_R,CO_Y)-P.terDrag(v,cheap,CO_R,CO_Y):0};});
  const known=items.filter(x=>x.ter!=null),kv=known.reduce((a,x)=>a+x.v,0);
  const ter=kv>0?known.reduce((a,x)=>a+x.v*x.ter,0)/kv:NaN;
  const sum=k=>known.reduce((a,x)=>a+x[k],0);
  /* altri costi (gestione della banca, consulenza, deposito) in % del patrimonio: si sommano al TER sull'intero valore */
  const oy=tot*other,od20=other>0?P.terDrag(tot,other,CO_R,CO_Y):0;
  return {items,tot,ter,coverage:kv/tot,missing:items.filter(x=>x.ter==null),cheap,other,
    year:sum("y")+oy,d20:sum("d20")+od20,save:sum("save"),pending:!!(pf.etfLoading||pf.isinStatus==="loading")};
}
function renderCost(){
  const el=$("#costCard");if(!el)return;
  const C=costCalc();if(!C||!S.lab){el.hidden=true;return;}
  el.hidden=false;
  const eur=v=>!Number.isFinite(v)?"—":Math.abs(v)<10?fmtN(v,2)+" €":fmtEur(v),pc=(v,d=2)=>Number.isFinite(v)?fmtPct(v,d):"—";
  const full=C.coverage>.999,anyCost=C.items.some(x=>x.ter!=null)||C.other>0;
  const lead=!anyCost?`Inserisci il costo annuo di ogni strumento: per gli ETF lo leggo da solo, per i fondi è nel KID alla voce «Costi correnti».`
    :`Il portafoglio costa <b>${pc(C.ter+C.other)}</b> l'anno: circa <b>${eur(C.year)}</b> quest'anno${full?"":` sulla parte con costo noto (${fmtPct(C.coverage,0)})`}. In ${CO_Y} anni, con un rendimento lordo del 5%, sono <b>${eur(C.d20)}</b> di capitale in meno.`;
  const rows=C.items.slice().sort((a,b)=>(b.ter??-1)-(a.ter??-1)).map(x=>{
    const tag=x.src==="titolo di Stato"?`<span class="co-src">titolo di Stato: nessun costo di gestione</span>`:x.src==="justETF"?`<span class="co-src">justETF</span>`:x.src==="tu"?`<span class="co-src tu">inserito${x.etfTer!=null?` · <button type="button" class="linkbtn" data-cor="${esc(x.k)}">usa justETF ${fmtPct(x.etfTer,2)}</button>`:""}</span>`:`<span class="co-src miss">${C.pending?"cerco…":"manca · dal KID"}</span>`;
    const hi=x.ter!=null&&x.ter>=.01;
    return `<tr class="${hi?"co-hi":""}"><td><span class="an">${esc(x.nome)}</span><span class="cl">${esc([x.full&&x.full!==x.nome?x.full:"",x.isin||""].filter(Boolean).join(" · "))}</span></td>
      <td class="mono">${eur(x.v)}</td>
      <td><label class="co-in"><input type="number" inputmode="decimal" min="0" max="10" step="0.01" data-cok="${esc(x.k)}" value="${x.ter!=null?+(x.ter*100).toFixed(3):""}" placeholder="—" aria-label="Costo annuo di ${esc(x.nome)} in percentuale"><i>%</i></label>${tag}</td>
      <td class="mono">${eur(x.y)}</td><td class="mono">${eur(x.d20)}</td><td class="mono">${x.save>0?eur(x.save):"—"}</td></tr>`;}).join("");
  el.innerHTML=`<div class="head"><div><span class="eyebrow">Costi</span><h3 style="margin-top:4px">Quanto costa il portafoglio</h3></div><span class="chip hist"><i></i>TER e costi annui</span></div>
    <p class="co-lead">${lead}</p>
    <div class="look-kpi k4 co-k">
      <div><span class="eyebrow">Costo annuo</span><b>${anyCost?pc(C.ter+C.other):"—"}</b><small>${C.other>0?`TER ${pc(C.ter)} + altri ${pc(C.other)}`:"TER medio ponderato"}</small></div>
      <div><span class="eyebrow">Quest'anno</span><b>${anyCost?eur(C.year):"—"}</b><small>pagati anche quando il mercato scende</small></div>
      <div><span class="eyebrow">In ${CO_Y} anni</span><b class="dn">${anyCost?eur(C.d20):"—"}</b><small>capitale in meno, effetto composto</small></div>
      <div class="co-alt"><span class="eyebrow">Con strumenti al <label class="co-in sm"><input type="number" inputmode="decimal" min="0" max="3" step="0.01" id="coCheap" value="${+(C.cheap*100).toFixed(3)}" aria-label="TER di confronto in percentuale"><i>%</i></label></span><b class="${C.save>0?"up":""}">${C.save>0?"+"+eur(C.save):"—"}</b><small>${C.save>0?`in ${CO_Y} anni, a parità di rendimento lordo`:"nessuno strumento costa di più"}</small></div>
    </div>
    <div class="tablewrap"><table class="mt co-t"><thead><tr><th>Strumento</th><th>Valore</th><th>Costo annuo (TER)</th><th>L'anno</th><th>In ${CO_Y} anni</th><th>Differenza con ${pc(C.cheap)}</th></tr></thead><tbody>${rows}
      <tr class="pf"><td><b>Totale</b>${C.missing.length?`<span class="cl">senza costo: ${C.missing.map(x=>esc(x.nome)).join(", ")}</span>`:""}</td><td class="mono">${eur(C.tot)}</td><td class="mono">${pc(C.ter)}</td><td class="mono">${eur(C.year)}</td><td class="mono">${eur(C.d20)}</td><td class="mono">${C.save>0?eur(C.save):"—"}</td></tr></tbody></table></div>
    <div class="co-other"><label><span>Altri costi annui sul patrimonio <small>gestione o consulenza della banca, deposito titoli</small></span><span class="co-in"><input type="number" inputmode="decimal" min="0" max="5" step="0.05" id="coOther" value="${C.other?+(C.other*100).toFixed(3):""}" placeholder="0"><i>%</i></span></label></div>
    <p class="caption">«In ${CO_Y} anni» è il capitale in meno per colpa dei costi, senza nuovi versamenti, se gli strumenti rendessero il 5% l'anno lordo: V · [(1 + 5%)ⁿ − (1 + 5% − costo)ⁿ]; conta anche il rendimento perso sui costi pagati. «Differenza» confronta ogni strumento con uno che costa ${pc(C.cheap)} l'anno e rende lo stesso al lordo. Non comprende commissioni d'ingresso e d'uscita, spread, bollo e imposte. Il TER è già tolto dai prezzi, quindi rendimenti e rischio del sito lo includono. Per i fondi della banca il costo è nel KID, alla voce «Costi correnti» o «Commissioni di gestione e altri costi»: i valori che inserisci restano in questo browser.</p>`;
}
document.addEventListener("change",e=>{const t=e.target;if(!t||!t.closest||!t.closest("#costCard"))return;
  const pr=coPrefs(),v=t.value===""?null:parseFloat(String(t.value).replace(",","."))/100;
  if(t.dataset.cok){pr.ter=pr.ter||{};if(v==null||!Number.isFinite(v)||v<0)delete pr.ter[t.dataset.cok];else pr.ter[t.dataset.cok]=Math.min(v,.1);trackOnce("feature","costi",{name:"costi"});}
  else if(t.id==="coCheap"){if(v!=null&&Number.isFinite(v)&&v>=0)pr.cheap=Math.min(v,.03);else delete pr.cheap;}
  else if(t.id==="coOther"){if(v!=null&&Number.isFinite(v)&&v>0)pr.other=Math.min(v,.05);else delete pr.other;}
  else return;
  coSave(pr);renderCost();
  /* il campo successivo resta a portata: dopo il ridisegno torna il fuoco su quello che segue */
  const nx=t.dataset.cok?[...document.querySelectorAll("#costCard [data-cok]")].find(x=>!x.value):null;if(nx)nx.focus();
});
document.addEventListener("click",e=>{const b=e.target.closest("[data-cor]");if(!b)return;const pr=coPrefs();if(pr.ter)delete pr.ter[b.dataset.cor];coSave(pr);renderCost();});

/* ---------- Laboratorio ---------- */
function hideLab(){
  setTimeout(renderLabs,0);
  disposeNet();S.lab=null;
  $("#lab").hidden=true;$("#labEmpty").hidden=false;$("#navLab").classList.add("off");$("#navRisk").classList.add("off");$("#navSim").classList.add("off");$("#navFire").classList.add("off");$("#navStress").classList.add("off");$("#navOpt").classList.add("off");$("#navBench").classList.add("off");S.risk=null;S.mc=null;S.stress=null;S.opt=null;S.optW=null;
}

export { CMP_COL, CO_KEY, CO_R, CO_Y, PRC, PRQ, closeProfile, cmpCalc, cmpExport, cmpInit, cmpMoves, cmpMovesHTML, cmpTer, coKey, coPrefs, coSave, costCalc, drawCompare, hideLab, openProfile, pfAsset, pfWeights, prAfter, prBase, prMix, prRender, rebalanceHTML, renderCompare, renderCost, renderPortfolio, renderProfileCard };
