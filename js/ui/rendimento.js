/* Portfolio OS · interfaccia · il tuo rendimento reale dalle transazioni.
   Parte di app.js divisa in moduli: il codice è lo stesso, cambiano solo import ed export. */
import { $, P, S, color, esc, fmtDate, fmtPct } from "./core.js";
import { go } from "./scene.js";
import { an, requestUnderstand } from "./importa.js";
import { drawChart, labIndex, niceTicks } from "./laboratorio.js";
import { UNIT, bnSource, fmtEur, fmtK } from "./analisi.js";

/* ---------- Il tuo rendimento reale: transazioni del file + rendimenti degli strumenti ---------- */
function detectTx(sheets){
  let best=null;
  sheets.forEach((s,si)=>{
    const an=P.analyzeSheet(s.name,s.aoa),h=an.headerRow;if(h<0)return;
    const hd=(s.aoa[h]||[]).map(v=>String(v==null?"":v).trim()),find=re=>hd.findIndex(x=>re.test(x));
    const dI=an.cols.find(c=>c.suggest==="date"||c.kind==="date"),cD=dI?dI.idx:find(/^data\b|date/i);
    const cT=find(/^(etf|ticker|strumento|titolo|simbolo|asset|prodotto|isin)\b|\bticker\b|\betf\b/i),cA=find(/importo|controvalore|ammontare|amount|valore operazione|^investit|^totale\b|proceeds/i);
    const cU=find(/^quote$|^quote\b|quantit|shares|units|pezzi/i),cP=find(/^prezzo|price|quotazione|koers|^corso/i),cSg=find(/^segno$/i),cY=cSg>=0?cSg:find(/^tipo|operazione|^type|movimento/i);/* «Segno» (A/V) vale più di «Operazione» («Compravendita») */
    /* altre colonne che identificano lo stesso strumento: servono ad abbinare i movimenti agli asset anche se nei dati hanno un altro nome */
    const alias=[find(/^isin\b|\bisin\b/i),find(/^(ticker|simbolo|symbol)\b/i),find(/^(strumento|nome|descrizione|titolo|prodotto|name)\b/i)].filter(c=>c>=0&&c!==cT);
    if(cD<0||cT<0||(cA<0&&(cU<0||cP<0)))return;
    const rows=[];
    for(let r=h+1;r<s.aoa.length;r++){const row=s.aoa[r]||[],d=P.parseDate(row[cD],true),tk=String(row[cT]==null?"":row[cT]).trim(),ty=cY>=0?String(row[cY]==null?"":row[cY]).trim():"";
      if(!d||!tk||/^[—–-]+$/.test(tk)||/totale|valore oggi|saldo/i.test(ty+" "+tk))continue;
      let amt=cA>=0?P.parseNum(row[cA]):null;amt=amt?amt.n:NaN;
      if(!Number.isFinite(amt)&&cU>=0&&cP>=0){const u=P.parseNum(row[cU]),p=P.parseNum(row[cP]);if(u&&p)amt=u.n*p.n;}
      if(!Number.isFinite(amt)||amt===0)continue;
      const qn=cU>=0?P.parseNum(row[cU]):null,sell=/^(v|s)$/i.test(ty)||/(^|[^a-z])(vend|sell|riscatt|prelie|rimbors)|divid|cedol|coupon/i.test(ty)||(!ty&&!!qn&&qn.n<0);/* dividendi e cedole incassati escono dal portafoglio come un prelievo */
      rows.push({d,ticker:tk,alias:alias.map(c=>String(row[c]==null?"":row[c]).trim()).filter(Boolean),type:ty,amount:sell?-Math.abs(amt):Math.abs(amt)});}
    if(rows.length>=2&&(!best||rows.length>best.rows.length))best={sheet:s.name,rows,cols:{data:hd[cD],strumento:hd[cT],importo:cA>=0?hd[cA]:`${hd[cU]} × ${hd[cP]}`,tipo:cY>=0?hd[cY]:null}};
  });
  return best;
}
function txMatch(tk,names){
  const t=tk.toLowerCase(),re=new RegExp(`\\b${tk.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`,"i");
  let i=names.findIndex(n=>n.toLowerCase()===t);if(i<0)i=names.findIndex(n=>re.test(n));if(i<0)i=names.findIndex(n=>t.includes(n.toLowerCase())&&n.length>=3);return i;
}
function realCalc(){
  if(!S.tx||!S.ds||!S.ds.ok)return null;
  const ds=S.ds,names=ds.assets.map(a=>a.name);
  /* ogni asset è riconoscibile da più nomi: quello mostrato, il nome lungo, il simbolo e l'ISIN della posizione da cui è stato ricostruito */
  const pos=(S.portfolio&&S.portfolio.positions)||[],key=v=>String(v||"").trim().toLowerCase();
  const akas=ds.assets.map(a=>{const c=S.rb&&S.rb.cols.find(x=>x.name===a.name),q=pos.find(x=>(x.ticker||x.nome)===a.name);return new Set([a.name,c&&c.nome,c&&c.sym,q&&q.isin,q&&q.nome,q&&q.ticker].filter(Boolean).map(key));});
  const match=x=>{for(const v of [x.ticker,...(x.alias||[])]){const i=akas.findIndex(s=>s.has(key(v)));if(i>=0)return i;}return txMatch(x.ticker,names);};
  const tx=S.tx.rows.map(x=>({...x,i:match(x)}));
  const pp=P.personalPerformance(ds.dates,ds.assets,tx);if(pp.error)return {error:pp.error,tx};
  return {pp,tx};
}
/* Imposte se vendessi tutto oggi (regime amministrato italiano, stima):
   - 12,5% per gli ETF di titoli di Stato (in realtà vale per la quota di titoli di Stato del fondo: qui solo se il fondo è tutto governativo);
   - 26% per tutto il resto (azioni, obbligazioni societarie o miste, ETC sull'oro);
   - si paga solo sui guadagni: le minusvalenze degli ETF non compensano le plusvalenze degli ETF (sono redditi di capitale), quindi niente compensazione tra strumenti. */
function taxInfo(i){
  const ds=S.ds,a=ds.assets[i],pos=S.portfolio?S.portfolio.positions:[],q=pos.find(p=>(p.ticker||p.nome)===a.name||p.simbolo===a.sym);
  const t=[a.name,q&&q.nome,q&&q.titolo,q&&q.etf&&!q.etf.error?[q.etf.nome,q.etf.indice,q.etf.focus].join(" "):""].filter(Boolean).join(" ").toLowerCase();
  const gov=/govt|government|treasury|treasuries|sovereign|titoli di stato|\bbtp|\bbot\b|\bbund|\boat\b|gilt|staatsanleihen|t-bill/.test(t)&&!/corporate|aggregate|societar|high yield|\bcorp\b/.test(t);
  return gov?{rate:.125,why:"titoli di Stato: 12,5%"}:{rate:.26,why:"26%"};
}
function taxCalc(pp){
  const ds=S.ds,B=pp.byAsset,rows=B.map((b,i)=>{const ti=taxInfo(i),g=b.value-b.invested;return {i,rate:ti.rate,why:ti.why,gain:g,tax:g>0&&b.value>0?g*ti.rate:0};}).filter(x=>B[x.i].ops>0);
  const tax=rows.reduce((s,x)=>s+x.tax,0),net=pp.value-tax;
  const fl=(S.real&&S.real.tx?S.real.tx:[]).filter(x=>x.i>=0).map(x=>({t:x.d,v:-x.amount}));fl.push({t:ds.dates[ds.dates.length-1],v:net});
  return {tax,net,rows,xirr:fl.length>1?P.xirr(fl):NaN,gainNet:net-pp.invested};
}
function renderReal(){
  setTimeout(labIndex,60);
  const el=$("#realCard");if(!el)return;
  const R=realCalc();if(!R){el.hidden=true;S.real=null;return;}
  el.hidden=false;const ds=S.ds,f=ds.freq.f;
  if(R.error){el.innerHTML=`<div class="head"><h3>Il tuo rendimento reale</h3><span class="chip hist"><i></i>dalle tue transazioni</span></div><p style="color:var(--muted)">Ho trovato ${S.tx.rows.length} transazioni nel foglio «${esc(S.tx.sheet)}», ma nessuna corrisponde agli strumenti dei dati (${esc(ds.assets.map(a=>a.name).join(", "))}).</p>`;S.real=null;return;}
  const pp=R.pp,un=[...new Set(pp.unmatched.map(x=>x.ticker))],c=(k,v)=>`<button type="button" class="cellbtn" data-rc="rl-${k}">${v}</button>`;
  /* stessi versamenti nel benchmark scelto (S&P 500 se non scelto) */
  if(!S.bn)S.bn={pick:"SPY",ccy:"EUR",col:null,sym:""};
  const src=bnSource();let bm=null;
  if(src.px){const bret=ds.dates.map((d,t)=>{if(!t)return NaN;const a=src.px.get(`${ds.dates[t-1].getUTCFullYear()}-${String(ds.dates[t-1].getUTCMonth()+1).padStart(2,"0")}`),b=src.px.get(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`);return a>0&&b>0?b/a-1:NaN;});
    const sf=P.sameFlows(ds.dates,bret,pp.flowsT),miss=bret.slice(pp.first+1).filter(x=>!Number.isFinite(x)).length;
    const fl=R.tx.filter(x=>x.i>=0).map(x=>({t:x.d,v:-x.amount}));fl.push({t:ds.dates[ds.dates.length-1],v:sf.value});
    bm={label:src.label,value:sf.value,xirr:P.xirr(fl),series:sf.series,miss};}
  S.real={...R,bm,src};S.real.taxes=taxCalc(pp);const TX=S.real.taxes;
  const pos=pp.gain>=0;
  el.innerHTML=`<div class="head"><div><span class="eyebrow">Dalle tue ${pp.used} transazioni · foglio «${esc(S.tx.sheet)}» · dal ${fmtDate(ds.dates[pp.first],f)}</span><h3 style="margin-top:4px">Il tuo rendimento reale</h3></div><span class="chip hist"><i></i>versamenti veri</span></div>
    <div class="real-k">
      <div class="k"><span>Rendimento annuo (TIR)</span>${c("xirr",fmtPct(pp.xirr,1,true))}<small>tiene conto di quando hai versato ogni euro</small></div>
      <div class="k"><span>Valore stimato oggi</span>${c("value",fmtEur(pp.value))}<small>al ${fmtDate(ds.dates[ds.dates.length-1],f)}</small></div>
      <div class="k"><span>Versato</span>${c("inv",fmtEur(pp.invested))}<small>somma degli acquisti${pp.invested!==R.tx.filter(x=>x.i>=0&&x.amount>0).reduce((s,x)=>s+x.amount,0)?", meno le vendite":""}</small></div>
      <div class="k"><span>Guadagno</span>${c("gain",`<span class="${pos?"up":"dn"}">${pos?"+":"−"}${fmtEur(Math.abs(pp.gain))}</span>`)}<small>${fmtPct(pp.gainPct,1,true)} sul versato</small></div>
      <div class="k k-net"><span>Al netto delle tasse</span>${c("tax",fmtPct(TX.xirr,1,true))}<small>TIR se vendessi tutto oggi: imposte stimate ${fmtEur(TX.tax)}, ti resterebbero ${fmtEur(TX.net)}</small></div>
      <div class="k"><span>Rendimento ponderato nel tempo</span>${c("twr",fmtPct(pp.twr,1,true))}<small>${pp.years>=1?`${fmtPct(pp.twrAnn,1,true)} l'anno · `:""}come gli strumenti, senza l'effetto dei versamenti</small></div>
    </div>
    <div class="real-two"><div><div class="chartbox" id="realChart"></div><div class="legend" id="realLeg"></div></div>
      <div class="real-vs">${bm?`<span class="eyebrow">Con gli stessi versamenti in ${esc(bm.label)}</span><b class="big ${bm.value<=pp.value?"up":"dn"}">${fmtEur(bm.value)}</b>
        <span style="color:var(--muted);font-size:.9rem">${bm.value<=pp.value?`Hai fatto <b>${fmtEur(pp.value-bm.value)}</b> in più dell'indice`:`L'indice avrebbe fatto <b>${fmtEur(bm.value-pp.value)}</b> in più`}, con TIR ${fmtPct(bm.xirr,1,true)} contro ${fmtPct(pp.xirr,1,true)}. Stessi euro, stesse date: cambia solo dove li hai messi.</span>
        <span class="caption">Cambia indice nella sezione <button type="button" class="btn sm" data-go="bench" style="padding:2px 9px">Benchmark</button></span>`
        :src.loading?`<span class="eyebrow">Confronto con l'indice</span><span style="color:var(--muted)">Scarico lo storico di ${esc(src.sym||"S&P 500")}…</span>`
        :`<span class="eyebrow">Confronto con l'indice</span><span style="color:var(--muted)">${esc(src.error||"Scegli un indice nella sezione Benchmark.")}</span>`}
      </div></div>
    <p class="caption" style="margin-top:12px">Il valore segue i rendimenti degli strumenti nei dati e aggiunge ogni versamento a fine ${UNIT[f]?UNIT[f][0]:"periodo"}. ${S.source.kind==="rebuilt"?"I rendimenti sono quelli di mercato convertiti in euro con il cambio BCE di fine mese; il valore può differire un po' da quello del tuo broker (prezzi di fine mese, borsa diversa).":"I rendimenti vengono dai prezzi del file: se sono prezzi medi pagati, il valore è una stima."}${un.length?` Transazioni non collegate (strumento non nei dati): ${esc(un.join(", "))}.`:""}${pp.before?` ${pp.before} transazioni sono prima dell'inizio dei dati e sono contate dal primo periodo.`:""} TIR e rendimento ponderato su meno di un anno o due possono cambiare molto: non sono previsioni.</p>`;
  el.insertAdjacentHTML("beforeend",attribHTML(R));
  drawReal();
  {const gv=$("#growView");if(gv)gv.hidden=false;if(S.growView==="money")drawChart(false);}
}
/* Quanto ha reso ogni strumento, in euro: guadagno = valore oggi − (acquisti − vendite − dividendi incassati).
   La somma dei guadagni degli strumenti è esattamente il guadagno totale: niente collegamenti tra periodi né approssimazioni. */
function attribHTML(R){
  const pp=R.pp,ds=S.ds,B=pp.byAsset,idx=ds.assets.map((a,i)=>i).filter(i=>B[i].ops>0);if(!idx.length)return "";
  const tg=idx.reduce((s,i)=>s+B[i].gain,0),eur=v=>`${v>=0?"+":"−"}${fmtEur(Math.abs(v))}`,c=(k,i,v,cl="")=>`<button type="button" class="cellbtn ${cl}" data-rc="rl-at${k}-${i}">${v}</button>`;
  const pos=S.portfolio?S.portfolio.positions:[],cls=i=>{const q=pos.find(p=>(p.ticker||p.nome)===ds.assets[i].name);return q&&q.etf&&!q.etf.error?P.etfClass(q.etf):null;};
  const rows=idx.slice().sort((a,b)=>B[b].gain-B[a].gain).map(i=>{const b=B[i],sh=tg!==0?b.gain/tg:NaN;
    return `<tr><td><span class="an"><i style="background:${color(i)}"></i>${esc(ds.assets[i].name)}</span>${cls(i)?`<span class="cl">${esc(cls(i))}</span>`:""}</td><td class="mono">${fmtEur(b.bought)}</td><td class="mono">${b.sold>.5?"−"+fmtEur(b.sold):"—"}</td><td class="mono">${b.income>.005?"+"+fmtEur(b.income):"—"}</td><td>${c("v",i,fmtEur(b.value))}</td><td>${c("g",i,`<span class="${b.gain>=0?"up":"dn"}">${eur(b.gain)}</span>`)}</td><td class="mono">${Number.isFinite(b.xirr)?fmtPct(b.xirr,1,true):"—"}</td><td class="mono">${Number.isFinite(sh)?fmtPct(sh,0):"—"}</td></tr>`;}).join("");
  /* per classe di attivo, se le schede dei fondi sono state lette */
  const byC=new Map();idx.forEach(i=>{const k=cls(i);if(!k)return;const o=byC.get(k)||{g:0,v:0,inv:0};o.g+=B[i].gain;o.v+=B[i].value;o.inv+=B[i].invested;byC.set(k,o);});
  const clsRows=byC.size>1&&idx.every(i=>cls(i))?`<h4 class="look-h">Per classe di attivo</h4><div class="tablewrap"><table class="mt"><thead><tr><th>Classe</th><th>Versato netto</th><th>Valore oggi</th><th>Guadagno</th><th>Quota del guadagno</th></tr></thead><tbody>${[...byC].sort((a,b)=>b[1].g-a[1].g).map(([k,o])=>`<tr><td>${esc(k)}</td><td class="mono">${fmtEur(o.inv)}</td><td class="mono">${fmtEur(o.v)}</td><td class="mono ${o.g>=0?"up":"dn"}">${eur(o.g)}</td><td class="mono">${tg!==0?fmtPct(o.g/tg,0):"—"}</td></tr>`).join("")}</tbody></table></div>`:"";
  const clip=idx.filter(i=>B[i].clipped>1);
  const best=idx.reduce((a,i)=>B[i].gain>B[a].gain?i:a,idx[0]),worst=idx.reduce((a,i)=>B[i].gain<B[a].gain?i:a,idx[0]);
  return `<h4 class="look-h" style="margin-top:22px">Quanto ha reso ogni strumento</h4>
    <div class="tablewrap"><table class="mt at-t"><thead><tr><th>Strumento</th><th>Acquisti</th><th>Vendite</th><th>Dividendi incassati</th><th>Valore oggi</th><th>Guadagno</th><th>TIR</th><th>Quota del guadagno</th></tr></thead><tbody>${rows}
      <tr class="pf"><td><b>Totale</b></td><td class="mono">${fmtEur(idx.reduce((s,i)=>s+B[i].bought,0))}</td><td class="mono">${idx.some(i=>B[i].sold>.5)?"−"+fmtEur(idx.reduce((s,i)=>s+B[i].sold,0)):"—"}</td><td class="mono">${idx.some(i=>B[i].income>.005)?"+"+fmtEur(idx.reduce((s,i)=>s+B[i].income,0)):"—"}</td><td class="mono"><b>${fmtEur(pp.value)}</b></td><td class="mono ${tg>=0?"up":"dn"}"><b>${eur(tg)}</b></td><td class="mono">${fmtPct(pp.xirr,1,true)}</td><td class="mono">100%</td></tr></tbody></table></div>${clsRows}
    <p class="caption">${idx.length>1?`<b>${esc(ds.assets[best].name)}</b> ha portato il guadagno maggiore (${eur(B[best].gain)})${B[worst].gain<0?`, <b>${esc(ds.assets[worst].name)}</b> è in perdita (${eur(B[worst].gain)})`:worst!==best?`, <b>${esc(ds.assets[worst].name)}</b> il minore (${eur(B[worst].gain)})`:""}. `:""}Guadagno = valore oggi − acquisti + vendite + dividendi incassati: la somma per strumento è esattamente il guadagno totale. I prezzi sono rettificati, quindi i dividendi reinvestiti sono già nel valore; quelli incassati (ETF a distribuzione) contano come soldi usciti dal portafoglio, che hai però guadagnato. Commissioni e imposta di bollo non abbinate a uno strumento non sono incluse.${clip.length?` <span style="color:var(--warn)">Per ${clip.map(i=>esc(ds.assets[i].name)).join(", ")} alcune vendite superano il valore stimato di ${fmtEur(clip.reduce((s,i)=>s+B[i].clipped,0))}: quella parte risulta guadagno realizzato, ma può dipendere dai prezzi di fine mese o da una borsa diversa da quella del tuo broker.</span>`:""}</p>`;
}
function drawReal(box="#realChart",leg="#realLeg"){
  const R=S.real,pp=R.pp,ds=S.ds,f=ds.freq.f,s=pp.series,n=s.length,VW=640,VH=260,ml=56,mr=12,mt=12,mb=28,iw=VW-ml-mr,ih=VH-mt-mb;
  const bmS=R.bm?R.bm.series.slice(pp.first):null,all=[...s.map(x=>x.value),...s.map(x=>x.invested),...(bmS||[])].filter(Number.isFinite),hi=Math.max(...all)*1.06||1;
  const X=i=>ml+(n>1?i/(n-1):0)*iw,Y=v=>mt+ih-v/hi*ih;let g="";
  niceTicks(0,hi,4).filter(v=>v>=0&&v<=hi).forEach(v=>{g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)"/><text x="${ml-6}" y="${(Y(v)+4).toFixed(1)}" text-anchor="end">${fmtK(v)}</text>`;});
  [0,Math.floor((n-1)/2),n-1].forEach(i=>{g+=`<text x="${X(i).toFixed(1)}" y="${VH-8}" text-anchor="${i===0?"start":i===n-1?"end":"middle"}">${fmtDate(ds.dates[s[i].t],f)}</text>`;});
  const path=(arr,st,k)=>{let d="";arr.forEach((v,i)=>{d+=(i?"L":"M")+X(i).toFixed(1)+","+Y(v).toFixed(1);});return `<path d="${d}" fill="none" ${st} pathLength="1" class="draw" style="--k:${k}"/>`;};
  let area="";s.forEach((x,i)=>{area+=(i?"L":"M")+X(i).toFixed(1)+","+Y(x.value).toFixed(1);});area+=`L${X(n-1).toFixed(1)},${Y(0)}L${X(0).toFixed(1)},${Y(0)}Z`;
  g+=`<path d="${area}" fill="var(--lime)" opacity=".1" class="area"/>`;
  g+=path(s.map(x=>x.invested),`stroke="var(--muted)" stroke-width="1.8" stroke-dasharray="5 4"`,1);
  if(bmS)g+=path(bmS,`stroke="var(--c3)" stroke-width="2"`,2);
  g+=path(s.map(x=>x.value),`stroke="var(--lime)" stroke-width="3"`,0);
  $(box).innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Valore del portafoglio con i versamenti veri, confrontato con il versato">${g}</svg>`;
  $(leg).innerHTML=`<span><i style="background:var(--lime);height:3px"></i>valore del tuo portafoglio</span><span><i style="background:var(--muted)"></i>soldi versati</span>${bmS?`<span><i style="background:var(--c3);height:3px"></i>stessi versamenti in ${esc(R.bm.label)}</span>`:""}`;
}
function realReceipt(m){
  if(m==="tax"&&S.real&&S.real.taxes){const T=S.real.taxes,pp=S.real.pp,ds=S.ds;
    return {title:"Rendimento al netto delle tasse",value:fmtPct(T.xirr,1,true),
      formula:"Imposta per strumento = max(0, valore oggi − versato netto) × aliquota\naliquota: 26% (12,5% per gli ETF di titoli di Stato)\nTIR netto: stessi flussi, ma il valore finale è il valore oggi meno le imposte",
      kv:[...T.rows.map(x=>[`${ds.assets[x.i].name} · ${x.why}`,x.tax>0?`${fmtEur(x.tax)} su ${fmtEur(x.gain)} di guadagno`:x.gain<0?`nessuna (in perdita di ${fmtEur(-x.gain)})`:"nessuna"]),
        ["Imposte totali stimate",fmtEur(T.tax)],["Valore oggi",fmtEur(pp.value)],["Ti resterebbe",fmtEur(T.net)],["Guadagno netto",fmtEur(T.gainNet)],
        ["Ipotesi","regime amministrato; le perdite di un ETF non compensano i guadagni di un altro ETF; non include imposta di bollo (0,2% l'anno) né eventuali minusvalenze pregresse"]]};}
  const R=S.real,pp=R.pp,ds=S.ds,f=ds.freq.f;
  const base=[["Transazioni usate",pp.used],["Foglio",S.tx.sheet],["Colonne",`${S.tx.cols.data} · ${S.tx.cols.strumento} · ${S.tx.cols.importo}${S.tx.cols.tipo?" · "+S.tx.cols.tipo:""}`],["Valutazione al",fmtDate(ds.dates[ds.dates.length-1],f)]];
  const M={
    xirr:["Rendimento annuo (TIR)",fmtPct(pp.xirr,2,true),"Σ flussoᵢ / (1 + TIR)^(giorniᵢ / 365) = 0\nversamenti negativi alla loro data, valore di oggi positivo",[["Versato",fmtEur(pp.invested)],["Valore oggi",fmtEur(pp.value)]]],
    value:["Valore stimato oggi",fmtEur(pp.value),"Vᵢ,ₜ = Vᵢ,ₜ₋₁ · (1 + rᵢ,ₜ) + versamentiᵢ,ₜ\nsomma su tutti gli strumenti",ds.assets.map((a,i)=>pp.byAsset[i].invested?[a.name,`${fmtEur(pp.byAsset[i].value)} (versati ${fmtEur(pp.byAsset[i].invested)})`]:null).filter(Boolean)],
    inv:["Versato",fmtEur(pp.invested),"Σ acquisti − Σ vendite",[]],
    gain:["Guadagno",fmtEur(pp.gain),"Valore oggi − Versato",[["Sul versato",fmtPct(pp.gainPct,2,true)]]],
    twr:["Rendimento ponderato nel tempo",fmtPct(pp.twr,2,true),"Rₜ = Σ Vᵢ,ₜ₋₁ · rᵢ,ₜ / Σ Vᵢ,ₜ₋₁    TWR = Π (1 + Rₜ) − 1\nnon dipende da quanto e quando hai versato: misura le tue scelte di strumenti",[["Annualizzato",pp.years>=1?fmtPct(pp.twrAnn,2,true):"periodo inferiore a un anno"],["Massimo calo",fmtPct(pp.mdd,2)]]]
  }[m]||[m,"—","",[]];
  if(/^at[vg]$/.test(m)&&arguments[1]!=null){const i=+arguments[1],b=pp.byAsset[i],a=ds.assets[i];
    return m==="atg"?{title:`Guadagno · ${a.name}`,value:fmtEur(b.gain),formula:"Guadagnoᵢ = Valoreᵢ oggi − (Acquistiᵢ − Venditeᵢ − Dividendi incassatiᵢ)\nΣ Guadagnoᵢ = Guadagno totale",kv:[["Acquisti",fmtEur(b.bought)],["Vendite",fmtEur(b.sold)],["Dividendi incassati",fmtEur(b.income)],["Versato netto",fmtEur(b.invested)],["Valore oggi",fmtEur(b.value)],["TIR dello strumento",Number.isFinite(b.xirr)?fmtPct(b.xirr,2,true):"—"],["Operazioni",b.ops],...base]}
      :{title:`Valore oggi · ${a.name}`,value:fmtEur(b.value),formula:"Vₜ = Vₜ₋₁ · (1 + rₜ) + flussoₜ   (flusso: acquisti +, vendite e dividendi incassati −)\nrₜ = rendimento di mercato dello strumento in euro",kv:[["Periodi",ds.nObs],["Operazioni",b.ops],...base]};}
  return {title:M[0],value:M[1],formula:M[2],kv:[...M[3],...base]};
}
/* storia corta: la frontiera e il benchmark riguardano gli strumenti, non da quanto li possiedi */
function rebuildHint(){
  if(!S.source||S.source.kind==="rebuilt"||!(S.tx||S.sheets.some(s=>s.tracker)))return "";
  return `<div class="rebuild-hint"><span class="caption">Il tuo file ha pochi mesi, ma gli ETF esistono da anni: con i loro prezzi di mercato hai molta più storia.</span><button type="button" class="btn sm lime" data-rebuild>Usa i prezzi di mercato degli ETF</button></div>`;
}
document.addEventListener("click",e=>{if(!e.target.closest("[data-rebuild]"))return;go("map");if(!S.und||S.und.status==="error")requestUnderstand();});

export { attribHTML, detectTx, drawReal, realCalc, realReceipt, rebuildHint, renderReal, taxCalc, taxInfo, txMatch };
