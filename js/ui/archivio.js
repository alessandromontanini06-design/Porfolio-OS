/* Portfolio OS · interfaccia · archivio dei portafogli (IndexedDB), cosa è cambiato, pagina Archivio.
   Parte di app.js divisa in moduli: il codice è lo stesso, cambiano solo import ed export. */
import { $, G, HAS_G, P, REDUCE, S, esc, fmtDate, fmtN, fmtPct } from "./core.js";
import { current, go, renderPager, reveal } from "./scene.js";
import { isExample, isSim, load, rbAoa, renderImport, spaceSwitch, trackOnce } from "./importa.js";
import { PZ } from "./report.js";
import { detectTx } from "./rendimento.js";
import { pfAsset } from "./portafoglio.js";
import { buildNet, drawChart, fetchMacro, labIndex, loadEtfInfo, renderLab, renderLook, ym } from "./laboratorio.js";
import { fiDefaults, fmtEur, netClear, obLoad, riskWeights } from "./analisi.js";
import { renderLabs } from "./home.js";

/* ---------- Archivio dei portafogli (IndexedDB, solo in questo browser) ----------
   Ogni portafoglio salvato ha un identificativo suo (due clienti con lo stesso estratto del broker non si sovrascrivono),
   il nome scelto (es. il cliente), le note, i fogli letti dal file, le scelte (pesi, dati FIRE) e una «fotografia» dei numeri
   a ogni revisione: la storia serve a vedere cosa è cambiato. Si salva solo se l'utente lo chiede. */
const SV={db:null},AR={q:"",f:"all",sort:"rev",open:null};
function svDB(){if(SV.db)return SV.db;SV.db=new Promise((ok,ko)=>{try{const r=indexedDB.open("portfolio-os",1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains("analisi"))r.result.createObjectStore("analisi",{keyPath:"id"});};r.onsuccess=()=>ok(r.result);r.onerror=()=>ko(r.error);}catch(e){ko(e);}});SV.db.catch(()=>{SV.db=null;});return SV.db;}
async function svTx(mode,fn){const db=await svDB();return new Promise((ok,ko)=>{const t=db.transaction("analisi",mode),req=fn(t.objectStore("analisi"));t.oncomplete=()=>ok(req&&req.result);t.onerror=()=>ko(t.error);t.onabort=()=>ko(t.error);});}
const svList=()=>svTx("readonly",st=>st.getAll()).then(a=>(a||[]).map(svFix)).catch(()=>[]);
const svGet=id=>svTx("readonly",st=>st.get(id)).then(r=>r?svFix(r):null).catch(()=>null);
const svPut=r=>svTx("readwrite",st=>st.put(r));
/* modifica atomica: lettura e scrittura nella stessa transazione (due modifiche ravvicinate non si cancellano a vicenda) */
const svPatch=(id,fn)=>svTx("readwrite",st=>{const g=st.get(id);g.onsuccess=()=>{if(g.result){const r=svFix(g.result);fn(r);st.put(r);}};return g;});
/* record vecchi (prima dell'archivio): campi mancanti */
function svFix(r){return {note:"",history:[],createdAt:r.savedAt,reviewedAt:r.savedAt,file:r.name,...r};}
const svPref=()=>{try{return localStorage.getItem("pos-save");}catch{return null;}}; // "1" salva sempre, "0" mai, null chiedi
const svCanSave=()=>S.source&&S.fileSheets&&S.fileSheets.length&&!isExample()&&!isSim()&&!(S.source.builder)&&S.ds&&S.ds.ok;
const svNewId=()=>"p"+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const svFileName=()=>String(S.source&&S.source.name||"portafoglio").replace(/ · ricostruito$/,"").replace(/\.(xlsx|xlsm|xls|ods|csv|txt)$/i,"");
/* la fotografia dei numeri di oggi: valore e TIR dalle transazioni (se ci sono), rendimento e rischio dai dati storici */
function svSnap(){
  const ds=S.ds,f=ds.freq.f,{w}=riskWeights(),pa=pfAsset(w,"Portafoglio"),st=P.stats(pa,f,ds.dates),pp=S.real&&S.real.pp;
  const pv=S.portfolio?S.portfolio.positions.reduce((a,p)=>a+(p.valore||0),0):0;
  return {at:Date.now(),value:pp?pp.value:pv>0?pv:null,invested:pp?pp.invested:null,xirr:pp?pp.xirr:null,cagr:st.cagr,vol:st.vol,mdd:st.mdd,last:fmtDate(ds.dates[ds.dates.length-1],f),
    weights:ds.assets.map((a,i)=>[a.name,w[i]]).filter(x=>x[1]>0.0005)};
}
/* «apertura rapida»: dati già pronti per il laboratorio, senza riscaricare i prezzi né ripassare da scansione e mappa.
   Solo array e oggetti semplici (niente Map), così passa anche dalla copia di sicurezza in JSON. */
function svFast(){
  if(!S.source||S.source.kind!=="rebuilt"||!S.rb||!S.ds||!S.ds.ok||S.fastOpen)return null;
  try{return {v:1,at:Date.now(),sheet:{name:"Prezzi mensili",aoa:rbAoa()},
    rb:{cols:S.rb.cols.map(c=>({...c,map:[...c.map],proxy:c.proxy?[...c.proxy]:null})),fxm:Object.fromEntries(Object.entries(S.rb.fxm||{}).map(([k,m])=>[k,[...(m instanceof Map?m:[])]])),origName:S.rb.origName,origSource:S.rb.origSource?{name:S.rb.origSource.name,kind:S.rb.origSource.kind,size:S.rb.origSource.size||0}:null},
    youngRes:{...(S.youngRes||{})},res:{...(S.res||{})},portfolio:S.portfolio?JSON.parse(JSON.stringify(S.portfolio)):null,lastUnd:S.lastUnd?JSON.parse(JSON.stringify(S.lastUnd)):null,
    cmp:S.cmp?JSON.parse(JSON.stringify(S.cmp)):null,pz:{client:PZ.client||"",next:PZ.next||""}};}catch(e){return null;}
}
async function svSave(name){
  if(!svCanSave())return null;
  const ds=S.ds,f=ds.freq.f,old=S.svSaved?await svGet(S.svSaved):null,snap=svSnap(),now=Date.now();
  const hist=old?old.history.slice():[];const lastH=hist[hist.length-1];
  if(!lastH||now-lastH.at>864e5||Math.abs((lastH.value||0)-(snap.value||0))>1)hist.push(snap);else hist[hist.length-1]=snap;
  const rec={...(old||{}),id:old?old.id:svNewId(),name:(name||old&&old.name||svFileName()).slice(0,80),file:svFileName(),note:old?old.note:"",
    createdAt:old?old.createdAt:now,savedAt:now,reviewedAt:now,sheets:S.fileSheets.map(x=>({name:x.name,aoa:x.aoa})),
    assets:ds.assets.map(a=>a.name),period:`${fmtDate(ds.dates[0],f)} – ${fmtDate(ds.dates[ds.dates.length-1],f)}`,riskW:S.riskW||null,fi:S.fi?S.fi.in:null,ob:S.mcOb?S.mcOb.slice(0,8):(old&&old.ob)||null,snap,history:hist.slice(-60),fast:svFast()||(old&&old.fast)||null};
  try{await svPut(rec);S.svSaved=rec.id;trackOnce("feature","salva",{name:"salva"});svBadge();return rec;}catch{return null;}
}
async function svOfferRender(){
  const el=$("#svOffer");if(!el)return;
  renderChange();
  if(!svCanSave()||svPref()==="0"&&!S.svSaved){el.hidden=true;return;}
  if(S.fastOpen&&S.svSaved){const r=await svGet(S.svSaved);el.hidden=!r;if(r)el.innerHTML=`<span class="sv-ok">Aperto dall'archivio: <b>${esc(r.name)}</b>, con i prezzi del ${new Date(S.fastOpen.at).toLocaleDateString("it-IT",{day:"numeric",month:"long",year:"numeric"})}. <button type="button" class="linkbtn" data-sv="refresh">Aggiorna i prezzi</button> · <button type="button" class="linkbtn" data-ar="open">Apri l'archivio</button></span>`;return;}
  /* portafoglio già in archivio: si aggiorna la revisione */
  if(S.svSaved){const r=await svSave();el.hidden=!r;if(r)el.innerHTML=`<span class="sv-ok">✓ <b>${esc(r.name)}</b> è nell'archivio · revisione del ${new Date(r.reviewedAt).toLocaleDateString("it-IT",{day:"numeric",month:"long"})} salvata. <button type="button" class="linkbtn" data-ar="open">Apri l'archivio</button></span>`;return;}
  if(svPref()==="1"){const r=await svSave();el.hidden=!r;if(r)el.innerHTML=`<span class="sv-ok">✓ Salvato nell'archivio come <b>${esc(r.name)}</b>. <button type="button" class="linkbtn" data-ar="rename">Cambia nome</button> · <button type="button" class="linkbtn" data-sv="never">Non salvare più in automatico</button></span>`;return;}
  el.hidden=false;
  el.innerHTML=`<div><b>Vuoi tenerlo nell'archivio?</b><span>Resta solo in questo browser, su questo computer: lo ritrovi la prossima volta, con la storia delle revisioni. Nessun server.</span></div>
    <label class="sv-name"><span>Nome</span><input type="text" id="svName" maxlength="80" value="${esc(svFileName())}" placeholder="es. il nome del cliente"></label>
    <label class="sv-al"><input type="checkbox" id="svAlways"> salva sempre</label><button type="button" class="btn sm lime" data-sv="yes">Salva nell'archivio</button><button type="button" class="btn sm" data-sv="no">No, grazie</button>`;
  /* oppure: è un file nuovo di un cliente già in archivio → si aggiorna quello e si vede cosa è cambiato (il più simile per strumenti viene per primo) */
  const R=await svRank();if(R.length)el.insertAdjacentHTML("beforeend",`<div class="sv-upd"><span>oppure è un aggiornamento di</span><select id="svUpd" aria-label="Portafoglio dell'archivio da aggiornare">${R.map(r=>`<option value="${esc(r.id)}">${esc(r.name)} · rivisto il ${new Date(r.reviewedAt).toLocaleDateString("it-IT",{day:"numeric",month:"short",year:"numeric"})}</option>`).join("")}</select><button type="button" class="btn sm" data-sv="upd">Aggiorna</button></div>`);
}
async function svBadge(){const L=await svList(),b=$("#archN");if(b){b.hidden=!L.length;b.textContent=L.length;}return L;}
/* home: gli ultimi quattro, più il rimando all'archivio */
async function svHome(){
  const el=$("#svList");if(!el)return;const L=(await svBadge()).sort((a,b)=>b.reviewedAt-a.reviewedAt);
  if(!L.length){el.hidden=true;el.innerHTML="";return;}
  el.hidden=false;
  el.innerHTML=`<div class="sv-h"><b>Riprendi da dove eri</b><button type="button" class="linkbtn" data-ar="open">Apri l'archivio${L.length>3?` (${L.length})`:""}</button></div>`+L.slice(0,3).map(r=>`<div class="sv-it"><button type="button" class="sv-open" data-svo="${esc(r.id)}"><b>${esc(r.name)}</b><small>${r.assets.length} strumenti${r.snap&&r.snap.value?` · ${fmtEur(r.snap.value)}`:""} · rivisto il ${new Date(r.reviewedAt).toLocaleDateString("it-IT",{day:"numeric",month:"short"})}</small></button><button type="button" class="sv-x" data-svd="${esc(r.id)}" aria-label="Elimina ${esc(r.name)}">×</button></div>`).join("");
}
/* riquadro d'attesa mentre un portafoglio dell'archivio si riapre */
function svBusy(on,txt){let el=$("#svBusy");if(!el){el=document.createElement("div");el.id="svBusy";el.setAttribute("role","status");el.setAttribute("aria-live","polite");document.body.appendChild(el);}
  if(on)el.innerHTML=`<div><i></i><b>${esc(txt||"")}</b><span>Aggiorno i prezzi di oggi e preparo i risultati.</span></div>`;el.hidden=!on;document.body.classList.toggle("sv-busy",!!on);}
/* modifiche fatte nel laboratorio (proposta A/B, note della presentazione): si tengono nel portafoglio dell'archivio aperto */
let svKeepT=null;
function svKeep(){if(!S.svSaved)return;clearTimeout(svKeepT);svKeepT=setTimeout(()=>{const cmp=S.cmp?JSON.parse(JSON.stringify(S.cmp)):null,pz={client:PZ.client||"",next:PZ.next||""};svPatch(S.svSaved,r=>{if(r.fast){r.fast.cmp=cmp;r.fast.pz=pz;}}).catch(()=>{});},700);}
/* obiettivi del cliente: stanno nel suo portafoglio dell'archivio (quelli salvati prima di questa funzione: gli obiettivi del browser) */
function svKeepOb(){if(!S.svSaved)return false;const ob=(S.mcOb||[]).slice(0,8);svPatch(S.svSaved,r=>{r.ob=ob;}).catch(()=>{});return true;}
const svOb=r=>Array.isArray(r.ob)?r.ob.slice(0,8):obLoad();
function svOpenFast(r){
  const F=r.fast;
  S.svResume=null;S.svSaved=r.id;S.svPrev=r.snap||null;S.conti=[{name:r.name,sheets:r.sheets}];
  S.fileSheets=r.sheets;S.tx=detectTx(r.sheets);
  S.rb={...F.rb,cols:F.rb.cols.map(c=>({...c,map:new Map(c.map),proxy:c.proxy?new Map(c.proxy):null})),fxm:Object.fromEntries(Object.entries(F.rb.fxm||{}).map(([k,v])=>[k,new Map(v)]))};
  S.youngRes={...(F.youngRes||{})};S.lastUnd=F.lastUnd||null;
  if(r.riskW)S.riskW=r.riskW;if(r.fi)S.fi={in:{...fiDefaults(),...r.fi,cap:fiDefaults().cap}};S.mcOb=svOb(r);
  if(F.pz){PZ.client=F.pz.client||"";PZ.next=F.pz.next||"";}
  S.fastOpen={at:F.at,id:r.id};
  load([F.sheet],{name:`${r.file||r.name} · ricostruito`,size:0,kind:"rebuilt"},false);
  S.portfolio=F.portfolio;S.cmp=F.cmp||null;
  /* scelte già fatte all'importazione (strumenti mancanti, storici corti): restano fatte */
  S.res={...(F.res||{})};renderImport(false);
  const b=$("#confirmBtn");if(!S.ds||!S.ds.ok||!b||b.disabled)throw new Error("non pronto");
  showLab(true);go("lab",{force:true});
}
async function svOpen(id,opts={}){
  const r=await svGet(id);if(!r)return svHome();
  if(r.fast&&r.fast.v===1&&!opts.full){closeArchive();if(isSim())spaceSwitch("real",{stay:true});trackOnce("feature","riprendi",{name:"riprendi"});
    try{svOpenFast(r);return;}catch(e){S.fastOpen=null;/* dati rapidi non utilizzabili: si va col percorso completo */}}
  trackOnce("feature","riprendi",{name:"riprendi"});closeArchive();
  if(isSim())spaceSwitch("real",{stay:true});
  S.fastOpen=null;S.svResume={id,t0:Date.now(),riskW:r.riskW,fi:r.fi,ob:svOb(r)};S.svSaved=id;S.svPrev=opts.keepPrev?S.svPrev:(r.snap||null);
  /* niente analisi del file né mappa a vista: un riquadro d'attesa, i passi li rifà il sito da solo, poi direttamente i Risultati */
  svBusy(true,opts.full?`Aggiorno i prezzi di «${r.name}»…`:`Apro «${r.name}»…`);
  load(r.sheets,{name:r.file||r.name,size:0,kind:"file"},true);
  /* la mappa è già confermata in memoria: appena il file è pronto (anche dopo i prezzi di mercato) si costruisce il laboratorio */
  const tick=()=>{const R=S.svResume;if(!R||R.id!==id)return;if(Date.now()-R.t0>150000){S.svResume=null;svBusy(false);go("map",{force:true});return;}
    const busy=(S.und&&/loading|rebuilding/.test(S.und.status||""))||(S.recipe&&S.recipe.status==="loading");
    const b=$("#confirmBtn");if(!busy&&b&&!b.disabled&&S.ds&&S.ds.ok){if(!R.ready){R.ready=Date.now();}else if(Date.now()-R.ready>1200){S.svResume=null;S.mcOb=R.ob;if(R.riskW)S.riskW=R.riskW;if(R.fi){S.fi={in:{...fiDefaults(),...R.fi,cap:fiDefaults().cap}};}S.svSaved=id;showLab(true);go("lab",{force:true});svBusy(false);return;}}else R.ready=0;
    setTimeout(tick,400);};
  setTimeout(tick,600);
}
/* ---------- Cosa è cambiato dall'ultima revisione: i numeri di oggi contro l'ultima fotografia salvata nell'archivio ----------
   Funziona riaprendo un portafoglio dall'archivio (prezzi aggiornati) e caricando un file nuovo dello stesso cliente («Aggiorna» nella proposta di salvataggio). */
function chgCalc(){
  const a=S.svPrev;if(!a||!S.lab||!S.ds||!S.ds.ok||isSim())return null;
  let b;try{b=svSnap();}catch{return null;}
  const fin=v=>v!=null&&Number.isFinite(v);
  const dV=fin(a.value)&&fin(b.value)?b.value-a.value:NaN,dI=fin(a.invested)&&fin(b.invested)?b.invested-a.invested:NaN,mkt=Number.isFinite(dV)&&Number.isFinite(dI)?dV-dI:NaN;
  const wa=new Map(a.weights||[]),wb=new Map(b.weights||[]),names=[...new Set([...wa.keys(),...wb.keys()])];
  const W=names.map(n=>({n,a:wa.get(n)||0,b:wb.get(n)||0})).map(x=>({...x,d:x.b-x.a,st:!wa.has(x.n)?"nuovo":!wb.has(x.n)?"uscito":""})).sort((x,y)=>Math.abs(y.d)-Math.abs(x.d));
  return {a,b,dV,dI,mkt,W,days:Math.max(0,Math.round((b.at-a.at)/864e5))};
}
function renderChange(){
  const el=$("#chgCard");if(!el)return;const X=chgCalc();
  /* riaperto lo stesso giorno senza differenze: niente da raccontare */
  if(!X||X.days<1&&!(Math.abs(X.dV)>=1)&&!X.W.some(x=>Math.abs(x.d)>=.005||x.st)){el.hidden=true;return;}
  el.hidden=false;const {a,b}=X,fin=v=>v!=null&&Number.isFinite(v),sg=v=>(v>=0?"+":"−")+fmtEur(Math.abs(v)),pt=v=>(v>=0?"+":"−")+fmtN(Math.abs(v)*100,1)+" punti";
  const when=new Date(a.at).toLocaleDateString("it-IT",{day:"numeric",month:"long",year:"numeric"});
  const lead=Number.isFinite(X.dV)?`Dal ${when} il portafoglio è passato da <b>${fmtEur(a.value)}</b> a <b>${fmtEur(b.value)}</b>${Number.isFinite(X.mkt)?`: ${X.dI>0.5?`<b>${fmtEur(X.dI)}</b> versati`:X.dI<-0.5?`<b>${fmtEur(-X.dI)}</b> ritirati`:"nessun versamento"} e <b class="${X.mkt>=0?"up":"dn"}">${sg(X.mkt)}</b> dai mercati`:` (${sg(X.dV)})`}.`
    :`Ultima revisione il ${when}: ecco come sono cambiati rendimento, rischio e pesi.`;
  const k=(l,v,s,c="")=>`<div><span class="eyebrow">${l}</span><b class="${c}">${v}</b><small>${s}</small></div>`;
  const kp=[fin(b.value)?k("Valore",fmtEur(b.value),fin(a.value)?`${sg(X.dV)} · era ${fmtEur(a.value)}`:"",""):"",
    Number.isFinite(X.dI)?k("Versato nel frattempo",X.dI>=0?fmtEur(X.dI):"−"+fmtEur(-X.dI),fin(a.invested)?`in tutto ${fmtEur(b.invested)}`:""):"",
    Number.isFinite(X.mkt)?k("Effetto dei mercati",sg(X.mkt),"valore − versamenti",X.mkt>=0?"up":"dn"):"",
    fin(b.xirr)&&fin(a.xirr)?k("Rendimento annuo (TIR)",fmtPct(b.xirr,1,true),`${pt(b.xirr-a.xirr)} · era ${fmtPct(a.xirr,1,true)}`):fin(b.cagr)&&fin(a.cagr)?k("Rendimento annuo",fmtPct(b.cagr,1,true),`era ${fmtPct(a.cagr,1,true)}`):"",
    fin(b.vol)&&fin(a.vol)?k("Volatilità",fmtPct(b.vol,1),`era ${fmtPct(a.vol,1)}`):""].filter(Boolean);
  const moved=X.W.filter(x=>Math.abs(x.d)>=.005||x.st);
  el.innerHTML=`<div class="head"><div><span class="eyebrow">Dall'ultima revisione · ${when} · ${X.days===0?"oggi":X.days===1?"ieri":`${X.days} giorni fa`}</span><h3 style="margin-top:4px">Cosa è cambiato</h3></div><span class="chip hist"><i></i>archivio</span></div>
    <p class="co-lead">${lead}</p>
    <div class="look-kpi k${Math.min(4,Math.max(2,kp.length))} chg-k">${kp.slice(0,4).join("")}</div>
    ${moved.length?`<div class="tablewrap"><table class="mt"><thead><tr><th>Strumento</th><th>Peso prima</th><th>Peso oggi</th><th>Differenza</th></tr></thead><tbody>${moved.map(x=>`<tr><td><span class="an">${esc(x.n)}</span>${x.st?`<span class="cl">${x.st}</span>`:""}</td><td class="mono">${x.a?fmtPct(x.a,1):"—"}</td><td class="mono">${x.b?fmtPct(x.b,1):"—"}</td><td class="mono">${pt(x.d)}</td></tr>`).join("")}</tbody></table></div>`:`<p class="caption">I pesi degli strumenti sono rimasti gli stessi (differenze sotto mezzo punto).</p>`}
    <p class="caption">Confronto tra la fotografia salvata nell'archivio il ${when} (dati fino a ${esc(a.last||"—")}) e quella di oggi (dati fino a ${esc(b.last||"—")}). «Effetto dei mercati» è la variazione del valore meno i soldi versati nel frattempo: comprende guadagni, perdite, dividendi reinvestiti e costi.</p>`;
}
/* portafogli dell'archivio ordinati per somiglianza col file aperto: strumenti in comune, poi stesso nome del file, poi revisione più recente */
async function svRank(){
  if(!S.ds||!S.ds.ok)return [];const cur=new Set(S.ds.assets.map(a=>a.name)),fn=svFileName().toLowerCase();
  return (await svList()).map(r=>{const s=new Set(r.assets||[]),inter=[...cur].filter(x=>s.has(x)).length;return {r,sc:inter/Math.max(1,new Set([...cur,...s]).size)+((r.file||"").toLowerCase()===fn?.2:0)};})
    .sort((a,b)=>b.sc-a.sc||b.r.reviewedAt-a.r.reviewedAt).map(x=>x.r);
}
/* ---------- Pagina Archivio ---------- */
const arDue=r=>Date.now()-r.reviewedAt>182*864e5;
const arAgo=t=>{const d=Math.floor((Date.now()-t)/864e5);return d<=0?"oggi":d===1?"ieri":d<31?`${d} giorni fa`:d<365?`${Math.round(d/30.4)} mesi fa`:`${(d/365).toFixed(1).replace(".",",")} anni fa`;};
function openArchive(){const p=$("#archive");p.classList.add("open");p.setAttribute("aria-hidden","false");document.body.classList.add("bd-on");p.scrollTop=0;trackOnce("feature","archivio",{name:"archivio"});renderArchive();setTimeout(()=>$("#arQ").focus(),300);}
function closeArchive(){const p=$("#archive");if(!p||!p.classList.contains("open"))return;p.classList.remove("open");p.setAttribute("aria-hidden","true");if(!$("#builder").classList.contains("open"))document.body.classList.remove("bd-on");}
async function renderArchive(){
  const all=await svBadge(),q=AR.q.trim().toLowerCase();
  let L=all.filter(r=>!q||[r.name,r.file,r.note,...(r.assets||[])].join(" ").toLowerCase().includes(q)).filter(r=>AR.f!=="due"||arDue(r));
  L.sort(AR.sort==="name"?(a,b)=>a.name.localeCompare(b.name,"it"):AR.sort==="value"?(a,b)=>((b.snap&&b.snap.value)||0)-((a.snap&&a.snap.value)||0):(a,b)=>b.reviewedAt-a.reviewedAt);
  const due=all.filter(arDue).length,tot=all.reduce((a,r)=>a+((r.snap&&r.snap.value)||0),0);
  $("#arSub").innerHTML=all.length?`<b>${all.length}</b> ${all.length===1?"portafoglio":"portafogli"}${tot>0?` · ${fmtEur(tot)} in totale`:""}${due?` · <b class="ar-due-t">${due} da rivedere</b>`:""}`:"Qui trovi i portafogli che salvi: per cliente, con note e storia delle revisioni.";
  /* riquadri in alto, come uno studio: patrimonio seguito, rendimento medio pesato sul valore, revisioni da fare */
  const kp=$("#arKpi");if(kp){const wv=all.filter(r=>r.snap&&r.snap.value>0&&Number.isFinite(r.snap.xirr)),wt=wv.reduce((a,r)=>a+r.snap.value,0),tir=wt>0?wv.reduce((a,r)=>a+r.snap.xirr*r.snap.value,0)/wt:NaN,pro=document.body.dataset.ruolo==="pro";
    kp.hidden=all.length<2;
    kp.innerHTML=`<div><span>${pro?"Patrimonio seguito":"Valore in archivio"}</span><b>${tot>0?fmtEur(tot):"—"}</b><small>${all.length} ${all.length===1?(pro?"cliente":"portafoglio"):pro?"clienti":"portafogli"}</small></div>`+
      `<div><span>Rendimento medio (TIR)</span><b class="${tir>=0?"up":"dn"}">${Number.isFinite(tir)?fmtPct(tir,1,true):"—"}</b><small>${wv.length?`pesato sul valore · ${wv.length} con i movimenti`:"servono i movimenti nel file"}</small></div>`+
      `<div><span>Da rivedere</span><b class="${due?"dn":""}">${due}</b><small>${due?"revisione oltre i tempi":"tutto in ordine"}</small></div>`+
      `<div><span>Ultima revisione</span><b>${arAgo(Math.max(...all.map(r=>r.reviewedAt||0)))}</b><small>${new Date(Math.max(...all.map(r=>r.reviewedAt||0))).toLocaleDateString("it-IT",{day:"numeric",month:"long"})}</small></div>`;}
  const tt=$("#arTitle");if(tt)tt.innerHTML=document.body.dataset.ruolo==="pro"?"I tuoi <em>clienti</em>":"Il tuo <em>archivio</em>";
  {const pro=document.body.dataset.ruolo==="pro",cr=document.querySelector("#archive .bd-crumb"),nb=$("#arNew");
    if(cr)cr.innerHTML=`Portfolio OS <i>/</i> ${pro?"Clienti":"Archivio"}`;if(nb)nb.textContent=pro?"+ Nuovo cliente":"+ Nuovo portafoglio";
    if(pro&&all.length)$("#arSub").innerHTML=$("#arSub").innerHTML.replace(/(\d+<\/b>) portafoglio\b/,"$1 cliente").replace(/(\d+<\/b>) portafogli\b/,"$1 clienti");}
  document.querySelectorAll("#arF [data-arf]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.arf===AR.f)));
  if(!all.length){$("#arList").innerHTML=`<div class="ar-empty"><b>L'archivio è vuoto</b><p>Carica un file (l'Excel del cliente o l'estratto del broker), costruisci il laboratorio e scegli <b>Salva nell'archivio</b>.</p><button type="button" class="btn lime" id="arNew2">Carica un file</button></div>`;return;}
  if(!L.length){$("#arList").innerHTML=`<div class="ar-empty"><b>Nessun risultato</b><p>Prova un'altra ricerca o togli il filtro.</p></div>`;return;}
  const num=(v,fm)=>v==null||!Number.isFinite(v)?"—":fm(v);
  $("#arList").innerHTML=`<div class="ar-head" aria-hidden="true"><span>Portafoglio</span><span>Valore</span><span>Rendimento</span><span>Rischio</span><span>Ultima revisione</span><span></span></div>`+L.map(r=>{const s=r.snap||{},open=AR.open===r.id;
    return `<article class="ar-row${open?" open":""}" data-arid="${esc(r.id)}">
      <div class="ar-main">
        <div class="ar-name"><b>${esc(r.name)}</b><small>${esc(r.file||"")} · ${r.assets.length} strumenti · ${esc(r.period||"")}</small></div>
        <div class="ar-v"><span class="ar-l">Valore</span>${num(s.value,fmtEur)}</div>
        <div class="ar-v"><span class="ar-l">Rendimento</span>${s.xirr!=null&&Number.isFinite(s.xirr)?`${fmtPct(s.xirr,1,true)}<small>TIR</small>`:num(s.cagr,x=>fmtPct(x,1,true)+"<small>l'anno</small>")}</div>
        <div class="ar-v"><span class="ar-l">Rischio</span>${num(s.vol,x=>fmtPct(x,1))}<small>${num(s.mdd,x=>"calo max "+fmtPct(x,0))}</small></div>
        <div class="ar-v"><span class="ar-l">Ultima revisione</span>${new Date(r.reviewedAt).toLocaleDateString("it-IT",{day:"numeric",month:"short",year:"numeric"})}<small>${arAgo(r.reviewedAt)}${arDue(r)?` · <b class="ar-due">da rivedere</b>`:""}</small></div>
        <div class="ar-act"><button type="button" class="btn sm lime" data-svo="${esc(r.id)}">Apri</button><button type="button" class="btn sm" data-arx="${esc(r.id)}" aria-expanded="${open}">${open?"Chiudi":"Dettagli"}</button></div>
      </div>
      ${open?arDetail(r):""}
    </article>`;}).join("");
}
function arDetail(r){
  const H=(r.history||[]).slice().reverse(),num=(v,fm)=>v==null||!Number.isFinite(v)?"—":fm(v);
  const ch=(a,b,k,fm)=>{if(!a||!b||a[k]==null||b[k]==null)return "";const d=a[k]-b[k];if(Math.abs(d)<1e-9)return "";return `<em class="${d>0?"up":"dn"}">${d>0?"+":"−"}${fm(Math.abs(d))}</em>`;};
  return `<div class="ar-det">
    <div class="ar-edit">
      <label><span>Nome nell'archivio</span><input type="text" data-arn="${esc(r.id)}" value="${esc(r.name)}" maxlength="80"></label>
      <label><span>Note <small>si salvano da sole</small></span><textarea data-arnote="${esc(r.id)}" rows="5" maxlength="4000" placeholder="Obiettivi, profilo, cosa avete deciso, prossimo incontro…">${esc(r.note||"")}</textarea></label>
      <div class="ar-meta">Creato il ${new Date(r.createdAt).toLocaleDateString("it-IT")} · ${(r.assets||[]).map(esc).join(", ")}</div>
      <button type="button" class="ar-del" data-svd="${esc(r.id)}">Elimina dall'archivio</button>
    </div>
    <div class="ar-hist"><b>Storia delle revisioni</b>${H.length?`<div class="tablewrap"><table class="mt"><thead><tr><th>Revisione</th><th>Valore</th><th>Rendimento</th><th>Rischio</th></tr></thead><tbody>${H.map((h,i)=>{const prev=H[i+1];return `<tr><td>${new Date(h.at).toLocaleDateString("it-IT",{day:"numeric",month:"short",year:"numeric"})}<small>dati fino a ${esc(h.last||"—")}</small></td><td>${num(h.value,fmtEur)} ${ch(h,prev,"value",fmtEur)}</td><td>${h.xirr!=null&&Number.isFinite(h.xirr)?fmtPct(h.xirr,1,true)+" TIR":num(h.cagr,x=>fmtPct(x,1,true))}</td><td>${num(h.vol,x=>fmtPct(x,1))}</td></tr>`;}).join("")}</tbody></table></div><p class="caption">Ogni volta che riapri il portafoglio si aggiunge una riga con i numeri di quel giorno.</p>`:`<p class="caption">Nessuna revisione registrata.</p>`}</div>
  </div>`;
}
/* esporta in Excel: un file da leggere (e da passare al commercialista o al gestionale), non una copia tecnica.
   Fogli: Clienti (una riga per portafoglio), Pesi, Revisioni, Leggimi. Per rimettere l'archivio in un altro browser c'è la copia di sicurezza (JSON). */
async function arExcel(){
  if(!window.XLSX){alert("Il lettore Excel non si è caricato: ricarica la pagina e riprova.");return;}
  const L=(await svList()).sort((a,b)=>String(a.name).localeCompare(String(b.name),"it"));if(!L.length)return;
  const r2=v=>v==null||!isFinite(v)?null:Math.round(v*100)/100,pc=v=>v==null||!isFinite(v)?null:Math.round(v*10000)/10000,day=t=>t?new Date(t):null,now=Date.now();
  const cli=[["Cliente / portafoglio","File","Valore (€)","Investito (€)","Guadagno (€)","Rendimento annuo (TIR)","Crescita annua storica","Volatilità annua","Perdita massima","Strumenti","Periodo dei dati","Creato il","Ultima revisione","Giorni dall'ultima revisione","Revisioni","Note"]];
  const obi=[["Cliente / portafoglio","Obiettivo","Importo (€ di oggi)","Tra anni","Anno"]],y0=new Date().getFullYear();
  const pesi=[["Cliente / portafoglio","Strumento","Peso"]],rev=[["Cliente / portafoglio","Data","Valore (€)","Rendimento annuo (TIR)","Volatilità annua","Perdita massima"]];
  for(const r of L){const s=r.snap||{},gain=s.value!=null&&s.invested!=null?s.value-s.invested:null;
    cli.push([r.name,r.file||"",r2(s.value),r2(s.invested),r2(gain),pc(s.xirr),pc(s.cagr),pc(s.vol),pc(s.mdd),(r.assets||[]).length,r.period||"",day(r.createdAt),day(r.reviewedAt),r.reviewedAt?Math.floor((now-r.reviewedAt)/864e5):null,(r.history||[]).length,r.note||""]);
    (s.weights||[]).forEach(([n,w])=>pesi.push([r.name,n,pc(w)]));
    (r.history||[]).forEach(h=>rev.push([r.name,day(h.at),r2(h.value),pc(h.xirr),pc(h.vol),pc(h.mdd)]));
    (Array.isArray(r.ob)?r.ob:[]).filter(g=>g&&+g.importo>0&&+g.anno>=1).forEach((g,i)=>obi.push([r.name,g.nome||`Obiettivo ${i+1}`,r2(+g.importo),Math.round(+g.anno),y0+Math.round(+g.anno)]));}
  const leggi=[["Archivio di Portfolio OS"],[`Esportato il ${new Date().toLocaleDateString("it-IT",{day:"numeric",month:"long",year:"numeric"})} · ${L.length} ${L.length>1?"portafogli":"portafoglio"}`],[],
    ["Clienti","una riga per portafoglio salvato, con i numeri dell'ultima revisione"],["Pesi","la composizione di ogni portafoglio all'ultima revisione"],["Revisioni","lo storico: una riga per ogni revisione salvata"],["Obiettivi","gli obiettivi di ogni cliente (casa, studi, pensione…), in euro di oggi; le probabilità si calcolano nelle Simulazioni"],[],
    ["Rendimento annuo (TIR)","calcolato dai movimenti (date e importi dei versamenti); vuoto se il file non ha i movimenti"],["Crescita annua storica","crescita media annua dei prezzi con i pesi attuali"],["Volatilità e perdita massima","dai prezzi storici con i pesi attuali"],[],
    ["Per rimettere l'archivio in un altro browser usa «Copia di sicurezza» nell'archivio: questo Excel serve da leggere, non da reimportare."],["Strumento di analisi: non è un consiglio di investimento."]];
  const wb=XLSX.utils.book_new(),sheet=(aoa,cols,fmt)=>{const ws=XLSX.utils.aoa_to_sheet(aoa,{cellDates:true});ws["!cols"]=cols.map(w=>({wch:w}));
    const rg=XLSX.utils.decode_range(ws["!ref"]);for(let R=1;R<=rg.e.r;R++)for(const [c,z] of Object.entries(fmt)){const cell=ws[XLSX.utils.encode_cell({r:R,c:+c})];if(cell&&cell.t!=="s")cell.z=z;}
    ws["!autofilter"]={ref:XLSX.utils.encode_range({r:0,c:0},{r:0,c:rg.e.c})};return ws;};
  const E="#,##0.00 €",P2="0.0%",D="dd/mm/yyyy";
  XLSX.utils.book_append_sheet(wb,sheet(cli,[28,26,14,14,14,12,12,12,12,10,22,12,14,12,10,40],{2:E,3:E,4:E,5:P2,6:P2,7:P2,8:P2,11:D,12:D}),"Clienti");
  XLSX.utils.book_append_sheet(wb,sheet(pesi,[28,30,10],{2:P2}),"Pesi");
  XLSX.utils.book_append_sheet(wb,sheet(rev,[28,12,14,12,12,12],{1:D,2:E,3:P2,4:P2,5:P2}),"Revisioni");
  if(obi.length>1)XLSX.utils.book_append_sheet(wb,sheet(obi,[28,28,18,10,8],{2:E}),"Obiettivi");
  const wl=XLSX.utils.aoa_to_sheet(leggi);wl["!cols"]=[{wch:30},{wch:90}];XLSX.utils.book_append_sheet(wb,wl,"Leggimi");
  XLSX.writeFile(wb,`portfolio-os-archivio-${new Date().toISOString().slice(0,10)}.xlsx`);
  trackOnce("feature","archivio_excel",{name:"archivio_excel"});
}
/* esporta e importa: un file JSON con tutto l'archivio (le date dei fogli tornano date all'importazione) */
async function arExport(){
  const L=await svList();if(!L.length){alert("L'archivio è vuoto.");return;}
  const blob=new Blob([JSON.stringify({formato:"portfolio-os-archivio",versione:1,esportato:new Date().toISOString(),portafogli:L})],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`portfolio-os-archivio-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
  trackOnce("feature","archivio_esporta",{name:"archivio_esporta"});
}
async function arImport(file){
  try{const j=JSON.parse(await file.text(),(k,v)=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v)?new Date(v):v);
    if(!j||j.formato!=="portfolio-os-archivio"||!Array.isArray(j.portafogli))throw new Error("formato");
    const cur=new Map((await svList()).map(r=>[r.id,r]));let n=0;
    for(const r of j.portafogli){if(!r||!r.id||!Array.isArray(r.sheets))continue;const old=cur.get(r.id);if(old&&old.savedAt>=r.savedAt)continue;await svPut(r);n++;}
    alert(n?`Importati ${n} ${n===1?"portafoglio":"portafogli"}.`:"Niente di nuovo da importare: l'archivio era già aggiornato.");renderArchive();svHome();
  }catch(e){alert("Questo file non è un archivio di Portfolio OS.");}
}
const arNoteT={};
document.addEventListener("input",e=>{
  if(e.target.id==="arQ"){AR.q=e.target.value;renderArchive();return;}
  const n=e.target.dataset&&(e.target.dataset.arnote||e.target.dataset.arn);if(!n)return;
  /* un timer per campo: nome e note si salvano entrambi anche se modificati uno subito dopo l'altro */
  const el=e.target,k=(el.dataset.arnote?"note:":"name:")+n;clearTimeout(arNoteT[k]);
  arNoteT[k]=setTimeout(async()=>{const v=el.value;await svPatch(n,r=>{if(el.dataset.arnote)r.note=v;else r.name=v.trim()||r.name;}).catch(()=>{});if(el.dataset.arn)svHome();},400);
});
document.addEventListener("change",e=>{if(e.target.id==="arSort"){AR.sort=e.target.value;renderArchive();}if(e.target.id==="arImport"&&e.target.files[0]){arImport(e.target.files[0]);e.target.value="";}});
document.addEventListener("click",async e=>{
  const b=e.target.closest("[data-sv],[data-svo],[data-svd],[data-ar],[data-arx],[data-arf],#archBtn,#closeArchive,#arExport,#arBackup,#arNew,#arNew2");if(!b)return;
  if(b.id==="archBtn"){openArchive();return;}
  if(b.id==="closeArchive"){closeArchive();return;}
  if(b.id==="arExport"){arExcel();return;}if(b.id==="arBackup"){arExport();return;}
  if(b.id==="arNew"||b.id==="arNew2"){closeArchive();go("home",{force:true});setTimeout(()=>$("#file").click(),300);return;}
  if(b.dataset.arf){AR.f=b.dataset.arf;renderArchive();return;}
  if(b.dataset.arx){AR.open=AR.open===b.dataset.arx?null:b.dataset.arx;renderArchive();return;}
  if(b.dataset.svo){svOpen(b.dataset.svo);return;}
  if(b.dataset.svd){const r=await svGet(b.dataset.svd);if(!r||!confirm(`Eliminare «${r.name}» dall'archivio? Non si può recuperare.`))return;
    await svTx("readwrite",st=>st.delete(b.dataset.svd)).catch(()=>{});if(S.svSaved===b.dataset.svd)S.svSaved=null;svHome();if($("#archive").classList.contains("open"))renderArchive();return;}
  if(b.dataset.ar==="open"){openArchive();return;}
  if(b.dataset.ar==="rename"){openArchive();AR.open=S.svSaved;renderArchive();return;}
  const a=b.dataset.sv;
  if(a==="yes"){const al=$("#svAlways");if(al&&al.checked){try{localStorage.setItem("pos-save","1");}catch{}}const r=await svSave(($("#svName")||{}).value);const el=$("#svOffer");el.innerHTML=r?`<span class="sv-ok">✓ Salvato nell'archivio come <b>${esc(r.name)}</b>. <button type="button" class="linkbtn" data-ar="open">Apri l'archivio</button></span>`:`<span class="sv-ok">Non riesco a salvare in questo browser (forse è in navigazione privata).</span>`;svHome();}
  if(a==="no"){const al=$("#svAlways");if(al&&al.checked){try{localStorage.setItem("pos-save","0");}catch{}}$("#svOffer").hidden=true;}
  if(a==="upd"){const sel=$("#svUpd"),old=sel?await svGet(sel.value):null;if(old){S.svSaved=old.id;S.svPrev=old.snap||null;const r=await svSave();const el=$("#svOffer");el.innerHTML=r?`<span class="sv-ok">✓ <b>${esc(r.name)}</b> aggiornato · revisione di oggi salvata. <button type="button" class="linkbtn" data-ar="open">Apri l'archivio</button></span>`:`<span class="sv-ok">Non riesco a salvare in questo browser.</span>`;renderChange();svHome();setTimeout(labIndex,60);}return;}
  if(a==="refresh"&&S.svSaved){netClear(/^\/api\/(prices|fx)\b/);svOpen(S.svSaved,{full:true});return;}
  if(a==="never"){try{localStorage.setItem("pos-save","0");}catch{}$("#svOffer").hidden=true;}
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("#archive")&&$("#archive").classList.contains("open"))closeArchive();});
window.__saved={list:svList,open:svOpen,clear:()=>svTx("readwrite",st=>st.clear()),archive:openArchive,json:async()=>JSON.stringify({formato:"portfolio-os-archivio",versione:1,portafogli:await svList()})}; // per i test
function showLab(instant,stay){
  setTimeout(renderLabs,0);
  const ds=S.ds,f=ds.freq.f;
  S.lab={st:ds.assets.map(a=>P.stats(a,f,ds.dates)),W:ds.assets.map(a=>P.wealth(a,ds.dates.length)),C:ds.assets.map(a=>ds.assets.map(b=>P.corr(a,b)))};
  S.labFx={};
  $("#lab").hidden=false;$("#labEmpty").hidden=true;$("#navLab").classList.remove("off");$("#navRisk").classList.remove("off");$("#navSim").classList.remove("off");$("#navFire").classList.remove("off");$("#navStress").classList.remove("off");$("#navOpt").classList.remove("off");$("#navBench").classList.remove("off");renderPager(current);S.mc=null;S.mcIn=null;S.stress=null;S.st=null;S.opt=null;S.opIn=null;S.optW=null;if(S.riskW==="opt")S.riskW=null;
  if(!S.macro||S.macro.status!=="ready"||S.macro.key!==ym(ds.dates[0])+ym(ds.dates[ds.dates.length-1]))S.macro=null;
  renderLab();reveal($("#lab"));renderLook();loadEtfInfo();
  if(!S.macro)fetchMacro().then(()=>{if(S.macro)S.macro.key=ym(ds.dates[0])+ym(ds.dates[ds.dates.length-1]);});
  if(!HAS_G){countAll();drawChart(false);if(S.corrView==="net")buildNet();S.labFx.done=true;}
  setTimeout(svOfferRender,50);
  if(!stay)go("lab",{force:true});
}
function countAll(){
  document.querySelectorAll("[data-count]").forEach(el=>{
    const to=+el.dataset.count;if(REDUCE||!HAS_G){el.textContent=to.toLocaleString("it-IT");return;}
    const o={v:0};G.to(o,{v:to,duration:1.4,ease:"power3.out",onUpdate:()=>{el.textContent=Math.round(o.v).toLocaleString("it-IT");}});
  });
}

export { AR, arAgo, arDetail, arDue, arExcel, arExport, arImport, arNoteT, chgCalc, closeArchive, countAll, openArchive, renderArchive, renderChange, showLab, SV, svBadge, svCanSave, svDB, svFast, svFileName, svFix, svGet, svHome, svKeep, svList, svNewId, svOfferRender, svOpen, svOpenFast, svPatch, svPref, svPut, svRank, svSave, svSnap, svTx, svKeepOb };