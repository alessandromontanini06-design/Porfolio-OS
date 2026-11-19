/* Portfolio OS · interfaccia · Quanta: la chat con l'analista e la sua presentazione.
   Parte di app.js divisa in moduli: il codice è lo stesso, cambiano solo import ed export. */
import { $, CALM, G, HAS_G, P, REDUCE, S, esc, fmtDate, fmtN, fmtPct } from "./core.js";
import { current, go } from "./scene.js";
import { pmHas, pmQuantaOp, pmQuantaSummary } from "./patrimonio.js";
import { cbSet } from "./costibanca.js";
import { trackOnce } from "./importa.js";
import { cmpCalc, pfAsset } from "./portafoglio.js";
import { macroFor } from "./laboratorio.js";
import { BENCHES, MC_M, OP_L, PER, bnLoad, fiDefaults, fmtEur, getJSON, opBase, opEval, opSolve, riskWeights, simDefaults, stPer, unitN } from "./analisi.js";

/* ---------- Analista in chat: l'IA capisce, il motore calcola ---------- */
S.chat=[];S.chatView=[];let chatBusy=false;
const TOOL_L={indipendenza_finanziaria:"indipendenza finanziaria (FIRE)",panoramica:"panoramica dei dati",metriche:"metriche per asset",rischio_portafoglio:"rischio del portafoglio",confronta_pesi:"confronto tra allocazioni",correlazioni:"correlazioni",macro:"tassi e inflazione",portafoglio_utente:"il tuo portafoglio",monte_carlo:"simulazione Monte Carlo",crisi_storiche:"crisi storiche",stress_shock:"stress test",ottimizza:"frontiera efficiente",confronta_benchmark:"confronto con il benchmark"};
function openChat(){$("#chat").classList.add("open");$("#chat").setAttribute("aria-hidden","false");document.body.classList.add("chat-on");renderChat();setTimeout(()=>$("#chatIn").focus(),300);}
function closeChat(){$("#chat").classList.remove("open");$("#chat").setAttribute("aria-hidden","true");document.body.classList.remove("chat-on");setTimeout(()=>$("#chatBtn").focus({preventScroll:true}),350);}
const orbBusy=on=>document.querySelectorAll(".orb").forEach(o=>o.classList.toggle("busy",on));
$("#chatBtn").addEventListener("click",()=>$("#chat").classList.contains("open")?closeChat():openChat());
$("#chatClose").addEventListener("click",closeChat);
$("#chatNew").addEventListener("click",()=>{if(chatBusy)return;S.chat=[];S.chatView=[];renderChat();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("#chat").classList.contains("open"))closeChat();});
function chatContext(){
  const oggi=oggiLoc(),pm=pmHas()?"l'utente ha un patrimonio salvato (strumento patrimonio)":"nessun patrimonio salvato",extra=`oggi è il ${oggi}; ${pm}${Q.lastSaved?`; appena salvato: ${Q.lastSaved}`:""}${Q.fromVoice?"; l'utente sta parlando a voce: rispondi breve e naturale":""}`;
  if(!S.lab||!S.ds||!S.ds.ok)return `${extra}; nessun laboratorio costruito: rispondi a domande generali sul sito e sui concetti, senza inventare numeri del portafoglio dell'utente (quelli del patrimonio si leggono con lo strumento patrimonio)`;
  return extra+"; "+chatContextLab();
}
function chatContextLab(){
  return `file «${S.source.name}», ${S.ds.assets.length} asset (${S.ds.assets.map(a=>a.name).join(", ")}), ${S.ds.nObs} osservazioni ${S.ds.freq.adj}, pesi selezionati nell'app: ${S.risk?S.risk.wLabel:(S.portfolio?"pesi attuali dell'utente":"pesi uguali")}${S.portfolio?", l'utente ha caricato un riepilogo con i suoi pesi":""}`;
}
function md(t){
  const lines=esc(t||"").replace(/\*\*(.+?)\*\*/g,"<b>$1</b>").split(/\n+/);let h="",list=false;
  lines.forEach(l=>{const m=l.match(/^\s*[-*•]\s+(.*)$/);if(m){if(!list){h+="<ul>";list=true;}h+=`<li>${m[1]}</li>`;}else{if(list){h+="</ul>";list=false;}if(l.trim())h+=`<p>${l}</p>`;}});
  return h+(list?"</ul>":"");
}
function chatSuggestions(){
  if(!S.lab&&pmHas())return ["Quanto ho guadagnato in tutto?","Quante tasse pagherei se vendessi oggi?","Quali cedole e dividendi arrivano?","Come va verso i miei obiettivi?"];
  if(!S.lab)return ["Come funziona Portfolio OS?","Che cos'è il TIR?","Che file posso caricare?","Che differenza c'è tra volatilità e drawdown?"];
  const n=S.ds.assets.map(a=>a.name),s=["Qual è l'asset più rischioso?","Riassumi il portafoglio in tre punti","Quanto si è perso nel periodo peggiore?"];
  s.splice(1,2,"Come ha retto il portafoglio nelle crisi?","Con 300 € al mese, quanto avrei tra 15 anni?");
  if(n.length>=2)s.splice(1,0,"Qual è l'allocazione più efficiente con massimo 50% per asset?");
  if(n.length>=2)s.push(`E se metto il 70% in ${n[0]} e il 30% in ${n[n.length-1]}?`);
  if(S.portfolio)s.unshift("I miei pesi target riducono il rischio?");
  return s.slice(0,4);
}
function renderChat(){
  const log=$("#chatLog");if(!log)return;
  const intro=S.lab?`<div class="msg ai"><p>Ciao! Chiedimi qualsiasi cosa su <b>${esc(S.source.name)}</b>: rischio, rendimenti, correlazioni, oppure "e se cambiassi i pesi?". Ogni numero lo prendo dal motore di calcolo.</p></div>`
    :pmHas()?`<div class="msg ai"><p>Ciao! Sono <b>Quanta</b> e conosco il tuo <b>patrimonio</b>. Chiedimi guadagni, tasse e cedole, oppure dimmi cosa hai comprato: preparo l'operazione e la salvi tu con «Conferma».</p></div>`
    :`<div class="msg ai"><p>Ciao! Sono <b>Quanta</b>, l'analista IA di Portfolio OS. Puoi chiedermi subito come funziona il sito o cosa vuol dire un termine (TIR, volatilità, drawdown…). Per i numeri del <b>tuo</b> portafoglio carica il file o apri l'esempio e costruisci il laboratorio.</p></div>`;
  log.innerHTML=intro+S.chatView.map((v,i)=>v.k==="user"?`<div class="msg user">${v.img&&v.img.length?`<span class="q-imgs">${v.img.map(u=>`<img src="${u}" alt="Foto mandata a Quanta">`).join("")}</span>`:""}${v.voce?`<span class="q-vtag">messaggio vocale</span>`:""}${esc(v.t)}</div>`
    :v.k==="op"?opCard(v)
    :v.k==="tool"?`<span class="toolchip"><i></i>calcolo: ${esc(v.t)}</span>`
    :v.k==="typing"?`<div class="typing" aria-label="Quanta sta rispondendo"><i></i><i></i><i></i></div>`
    :v.k==="error"?`<div class="msg err">${esc(v.t)}</div>`
    :`<div class="msg ai">${md(v.t)}<span class="by">Quanta · numeri dal motore${TTS?`<button type="button" class="q-say${Q.speaking===i?" on":""}" data-say="${i}" aria-label="${Q.speaking===i?"Ferma la lettura":"Ascolta la risposta"}">${Q.speaking===i?"■ Ferma":"▶ Ascolta"}</button>`:""}</span></div>`).join("");
  log.scrollTop=log.scrollHeight;
  $("#chatSugg").innerHTML=S.chatView.length?"":sugItems().map(x=>`<button type="button" ${x.act?`data-qact="${x.act}"`:`data-ask="${esc(x.t)}"`}>${ICO[x.ico]||ICO.chat}<span>${esc(x.t)}</span></button>`).join("");
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-ask]");if(b)askChat(b.dataset.ask);});
$("#chatForm").addEventListener("submit",e=>{e.preventDefault();ttsUnlock();const t=$("#chatIn").value;$("#chatIn").value="";grow();askChat(t);});
$("#chatNew").addEventListener("click",()=>{talkStop();Q.imgs=[];attRender();});
$("#chatClose").addEventListener("click",()=>talkStop());
$("#chatIn").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("#chatForm").requestSubmit();}});
/* Strumenti che l'IA può chiamare: tutti calcolati dal motore, sui dati confermati */
function fmtW(w){return S.ds.assets.map((a,i)=>w[i]>0?`${a.name} ${fmtPct(w[i],0)}`:null).filter(Boolean).join(", ");}
function parseWeights(arr){
  if(!Array.isArray(arr)||!arr.length)return null;
  const ds=S.ds,w=ds.assets.map(()=>0),unknown=[];
  arr.forEach(x=>{const name=String(x&&x.asset||"").toLowerCase().trim();if(!name){return;}
    let i=ds.assets.findIndex(a=>a.name.toLowerCase()===name);
    if(i<0)i=ds.assets.findIndex(a=>a.name.toLowerCase().includes(name)||name.includes(a.name.toLowerCase()));
    if(i<0){unknown.push(x.asset);return;}
    let p=Number(x.peso);if(p>1)p/=100;if(Number.isFinite(p)&&p>=0)w[i]+=p;});
  if(unknown.length)return {error:`Asset non trovati: ${unknown.join(", ")}. Asset disponibili: ${ds.assets.map(a=>a.name).join(", ")}.`};
  const s=w.reduce((a,b)=>a+b,0);if(!(s>0))return {error:"I pesi devono sommare a più di zero."};
  return {w:w.map(x=>x/s),normalizzati:Math.abs(s-1)>.001};
}
function pfSummary(w){
  const ds=S.ds,f=ds.freq.f,mm=macroFor(S.rfSrc),rf=mm?mm.rf:0,pa=pfAsset(w,"p"),st=P.stats(pa,f,ds.dates),rk=P.riskStats(pa.ret,f,rf),rc=P.riskContrib(w,P.covMatrix(ds.assets).C,f);
  if(!rk.n||rk.n<6)return {error:"Troppi pochi periodi comuni a tutti gli asset per questa allocazione."};
  return {pesi:fmtW(w),rendimento_annuo:fmtPct(st.cagr,1,true),rendimento_reale:mm?fmtPct((1+st.cagr)/(1+mm.infl)-1,1,true):"non disponibile",volatilita_annua:fmtPct(st.vol,1),
    sharpe:fmtN(st.vol>0?(st.mean*f-rf)/st.vol:NaN),max_drawdown:fmtPct(st.mdd,1),VaR95:`${fmtPct(-rk.var95,1)} ${PER[f]||""}`.trim(),CVaR95:fmtPct(-rk.cvar95,1),sortino:fmtN(rk.sortino),
    drawdown_piu_lungo:unitN(rk.longest,f),contributo_al_rischio:Object.fromEntries(ds.assets.map((a,i)=>[a.name,fmtPct(rc.pct[i],0)]).filter((x,i)=>w[i]>0)),
    asset_effettivi:fmtN(rc.neff,1),diversificazione:`${fmtN(rc.divRatio)}x`,osservazioni:rk.n};
}
const TOOLS_LOCAL={
  panoramica:()=>{const ds=S.ds,f=ds.freq.f;return {file:S.source.name,asset:ds.assets.map(a=>a.name),periodo:`${fmtDate(ds.dates[0],f)} - ${fmtDate(ds.dates[ds.dates.length-1],f)}`,frequenza:ds.freq.label,osservazioni:ds.nObs,anni:fmtN(ds.years,1)};},
  metriche:({asset})=>{const ds=S.ds,f=ds.freq.f,mm=macroFor(S.rfSrc),rf=mm?mm.rf:0,q=String(asset||"").toLowerCase().trim();
    const rows=ds.assets.map((a,i)=>({a,s:S.lab.st[i]})).filter(x=>!q||x.a.name.toLowerCase().includes(q)||q.includes(x.a.name.toLowerCase()));
    if(!rows.length)return {error:`Asset non trovato. Disponibili: ${ds.assets.map(a=>a.name).join(", ")}.`};
    return {tasso_privo_di_rischio:mm?fmtPct(rf,2):"0%",asset:rows.map(({a,s})=>s.n<2?{nome:a.name,nota:"dati insufficienti"}:{nome:a.name,rendimento_annuo:fmtPct(s.cagr,1,true),rendimento_reale:mm?fmtPct((1+s.cagr)/(1+mm.infl)-1,1,true):"non disponibile",volatilita:fmtPct(s.vol,1),sharpe:fmtN(s.vol>0?(s.mean*f-rf)/s.vol:NaN),max_drawdown:fmtPct(s.mdd,1),periodo_peggiore:`${fmtPct(s.worst,1)} a ${fmtDate(ds.dates[s.worstK],f)}`})};},
  rischio_portafoglio:({pesi})=>{const pw=pesi?parseWeights(pesi):null;if(pw&&pw.error)return pw;const w=pw?pw.w:(S.risk?S.risk.w:riskWeights().w);return pfSummary(w);},
  confronta_pesi:({pesiA,pesiB})=>{const a=parseWeights(pesiA),b=parseWeights(pesiB);if(!a)return {error:"pesiA mancanti"};if(a.error)return a;if(!b)return {error:"pesiB mancanti"};if(b.error)return b;
    return {A:pfSummary(a.w),B:pfSummary(b.w),nota:"Stessi dati storici; portafogli ribilanciati a ogni periodo."};},
  correlazioni:()=>{const ds=S.ds,out=[];ds.assets.forEach((a,i)=>ds.assets.forEach((b,j)=>{if(j>i)out.push({coppia:`${a.name} / ${b.name}`,correlazione:fmtN(S.lab.C[i][j].r)});}));return {correlazioni:out};},
  macro:()=>{const mm=macroFor(S.rfSrc);return mm?{tasso_privo_di_rischio_medio:fmtPct(mm.rf,2),fonte_tasso:`${mm.rfName} · ${mm.source}`,inflazione_media_annua:fmtPct(mm.infl,2),periodo:`${mm.from} - ${mm.to}`}:{nota:"Dati macro non disponibili: lo Sharpe usa un tasso dello 0%."};},
  indipendenza_finanziaria:(a)=>{
    /* stessi calcoli della sezione Indipendenza; i valori non indicati vengono da lì (o da valori tipici) */
    const I={...(S.mcIn||simDefaults())},FI=S.fi?S.fi.in:fiDefaults(),num=(v,d)=>Number.isFinite(+v)&&v!==null&&v!==""?+v:d;
    const pw=a.pesi?parseWeights(a.pesi):null;if(pw&&pw.error)return pw;
    const w=pw?pw.w:riskWeights().w,ret=pfAsset(w,"p").ret;
    const o={ret,age:Math.round(num(a.eta,FI.age)),endAge:Math.round(num(a.eta_fine,FI.end)),initial:Math.max(0,num(a.capitale,FI.cap)),save:Math.max(0,num(a.risparmio_mensile,FI.save)),spend:Math.max(100,num(a.spesa_mensile,FI.spend)),
      pension:Math.max(0,num(a.pensione,FI.pen)),pensionAge:Math.round(num(a.eta_pensione,FI.penAge)),infl:I.infl/100,costs:I.costs/100,target:Math.max(.5,Math.min(.99,num(a.probabilita,FI.target))),method:I.method,block:12,n:600};
    const A=P.fireAge(o);if(A.error)return {error:A.error};
    const R=A.age!=null?A.age:o.endAge-1,sw=P.fireSwr({...o,years:Math.max(5,o.endAge-Math.max(R,o.age))}),L=P.fireLife({...o,retireAge:R});
    const out={nota:"Tutto in euro di oggi, sui rendimenti storici del portafoglio ricampionati. Niente tasse; la pensione è quella indicata.",
      eta_oggi:o.age,soldi_fino_a:o.endAge,capitale_attuale:fmtEur(o.initial),risparmio_mensile:fmtEur(o.save),spesa_mensile:fmtEur(o.spend),pensione:o.pension?`${fmtEur(o.pension)} dai ${o.pensionAge} anni`:"non contata",sicurezza:fmtPct(o.target,0),
      puoi_smettere_a:A.already?"già oggi":A.age==null?`non prima dei ${o.endAge} anni`:A.age,anno:A.age!=null&&!A.already?new Date().getFullYear()+(A.age-o.age):null,
      eta_con_mercati_favorevoli:A.dist?{un_futuro_su_4:A.dist.p25,meta_dei_futuri:A.dist.p50}:null,capitale_quando_smetti:fmtEur(L.capAtRetire),
      numero_fire:fmtEur(o.spend*12/sw.swr),tasso_prelievo_sostenibile:fmtPct(sw.swr,2)+" l'anno",successo_regola_4_per_cento:fmtPct(sw.at4,0),prelievo_mensile_se_smetti_oggi:fmtEur(o.initial*sw.swr/12)};
    if(a.eta_obiettivo!=null){const g=P.fireSaveFor({...o,retireAge:Math.round(+a.eta_obiettivo)}),gn=P.fireLife({...o,retireAge:Math.round(+a.eta_obiettivo)});out.per_smettere_a=Math.round(+a.eta_obiettivo);out.risparmio_mensile_necessario=g.save!=null?fmtEur(g.save):"nessun risparmio ragionevole basta";out.successo_con_risparmio_attuale=fmtPct(gn.success,0);}
    return out;
  },
  monte_carlo:(a)=>{
    const I={...(S.mcIn||simDefaults())},num=(v,d)=>Number.isFinite(+v)&&v!==null&&v!==""?+v:d,ds=S.ds,f=ds.freq.f;
    const pw=a.pesi?parseWeights(a.pesi):null;if(pw&&pw.error)return pw;
    const w=pw?pw.w:riskWeights().w,years=Math.max(1,Math.min(60,Math.round(num(a.anni,I.years)))),method={storico:"boot",blocchi:"block",normale:"normal"}[a.metodo]||I.method;
    const R=P.monteCarlo({ret:pfAsset(w,"p").ret,f,years,initial:Math.max(0,num(a.capitale_iniziale,I.init)),monthly:num(a.versamento_mensile,I.monthly),goal:Math.max(0,num(a.obiettivo,I.goal)),infl:I.infl/100,costs:I.costs/100,method,n:Math.min(2000,Math.floor(8e6/(years*f))),block:f,seed:20260101});
    if(R.error)return {error:R.error};
    const L=["5°","10°","25°","50° (mediana)","75°","90°","95°"];
    return {metodo:MC_M[R.method],percorsi:R.n,anni:R.years,pesi:fmtW(w),capitale_iniziale:fmtEur(R.initial),versamento_mensile:fmtEur(R.monthly),totale_versato:fmtEur(R.invested),
      inflazione_ipotizzata:fmtPct(R.infl,2),costi_annui:fmtPct(R.costs,2),
      capitale_finale_nominale:Object.fromEntries(L.map((l,i)=>[l,fmtEur(R.pFinal[i])])),capitale_finale_euro_di_oggi:Object.fromEntries(L.map((l,i)=>[l,fmtEur(R.pFinalReal[i])])),
      obiettivo:R.goal>0?fmtEur(R.goal):"nessuno",probabilita_obiettivo_nominale:R.goal>0?fmtPct(R.probGoal,0):null,probabilita_obiettivo_euro_di_oggi:R.goal>0?fmtPct(R.probGoalReal,0):null,
      probabilita_di_finire_sotto_il_versato:fmtPct(R.probLoss,0),capitale_esaurito:R.monthly<0?fmtPct(R.depleted,0):null,drawdown_mediano_simulato:fmtPct(R.mddMedian,0),
      storia_usata:`${R.hist.m} rendimenti ${ds.freq.adj} del file`,nota:"Simulazione basata sui rendimenti passati: non è una previsione."};
  },
  confronta_benchmark:async(a)=>{
    const ds=S.ds,f=ds.freq.f,sym={sp500:"SPY",nasdaq100:"QQQ",msci_world:"URTH",eurostoxx50:"FEZ"}[a.benchmark]||"SPY",eur=a.valuta!=="usd";
    await bnLoad(sym);if(eur&&!S.fx){const fx=await getJSON("/api/fx?ccy=USD");if(fx.error)return {error:`Cambio BCE non disponibile: ${fx.error}`};S.fx=fx;}
    const d=S.bnData[sym];if(!d||d.error)return {error:(d&&d.error)||"Storico del benchmark non disponibile."};
    const px=P.benchPrices(d.points,eur?S.fx.points:null),pw=a.pesi?parseWeights(a.pesi):null;if(pw&&pw.error)return pw;
    const w=pw?pw.w:riskWeights().w,mm=macroFor(S.rfSrc),rf=mm?mm.rf:0,al=P.benchAlign(ds.dates,f,pfAsset(w,"p").ret,px),bs=P.benchStats(al.p,al.b,al.fc,rf);
    const name=BENCHES.find(b=>b.id===sym).name,ba=P.benchAsset(px);
    const crisi=P.CRISES.map(c=>{const b=P.crisisAnalysis(ba.dates,[ba.asset],[1],12,c),p=P.crisisAnalysis(ds.dates,ds.assets,w,f,c);
      return {crisi:c.name,benchmark:b.status!=="out"&&b.used?`perdita massima ${fmtPct(b.mdd,1)}, recupero ${b.recK!=null?unitN(b.recPeriods,12):"non avvenuto nei dati"}`:"fuori dallo storico",portafoglio:p.status!=="out"&&p.used?`perdita massima ${fmtPct(p.mdd,1)}`:"non nel file dell'utente"};});
    if(bs.error)return {benchmark:name,errore_confronto:bs.error,crisi};
    return {benchmark:`${name} (ETF ${sym}${eur?", convertito in euro con cambio BCE":""})`,periodo_comune:`${al.keys[0]} - ${al.keys[al.keys.length-1]} (${bs.n} periodi)`,pesi:fmtW(w),
      cagr_portafoglio:fmtPct(bs.cagrP,1,true),cagr_benchmark:fmtPct(bs.cagrB,1,true),rendimento_annuo_in_piu:fmtPct(bs.active,1,true),volatilita_portafoglio:fmtPct(bs.volP,1),volatilita_benchmark:fmtPct(bs.volB,1),
      max_drawdown_portafoglio:fmtPct(bs.mddP,1),max_drawdown_benchmark:fmtPct(bs.mddB,1),beta:fmtN(bs.beta),alpha_jensen_annuo:fmtPct(bs.alpha,2,true),r2:fmtPct(bs.r2,0),tracking_error:fmtPct(bs.te,1),information_ratio:fmtN(bs.ir),
      cattura_rialzi:fmtPct(bs.up,0),cattura_ribassi:fmtPct(bs.down,0),periodi_sopra_benchmark:fmtPct(bs.hit,0),crisi,nota:"Confronto storico, non una previsione."};
  },
  ottimizza:(a)=>{
    const ds=S.ds;if(ds.assets.length<2)return {error:"Serve almeno un secondo asset per ottimizzare."};
    const mode={massimo_sharpe:"sharpe",minima_volatilita:"minvar",risk_parity:"rp",pesi_uguali:"eq",volatilita_target:"tvol",rendimento_target:"tret"}[a.obiettivo]||"sharpe";
    let t=Number(a.target);if(Math.abs(t)>1)t/=100;if((mode==="tvol"||mode==="tret")&&!Number.isFinite(t))return {error:"Indica il target in decimali, per esempio 0.08."};
    let mn=a.peso_minimo==null?0:Number(a.peso_minimo),mx=a.peso_massimo==null?1:Number(a.peso_massimo);if(Math.abs(mn)>1)mn/=100;if(mx>1.5)mx/=100;
    const R=opSolve({mode,target:t,min:Number.isFinite(mn)?mn:0,max:Number.isFinite(mx)?mx:1});if(R.error)return {error:R.error};
    const base=opBase(),A=opEval(base.w,R.inp,R.rf),B=opEval(R.chosen,R.inp,R.rf),m=x=>({rendimento_atteso:fmtPct(x.ret,1),volatilita:fmtPct(x.vol,1),sharpe:fmtN(x.sharpe),cagr_storico:fmtPct(x.cagr,1,true),max_drawdown_storico:fmtPct(x.mdd,1)});
    return {obiettivo:OP_L[mode],vincoli:`pesi tra ${fmtPct(R.O.lo[0],0)} e ${fmtPct(R.O.hi[0],0)}`,pesi_di_partenza:`${base.label}: ${fmtW(base.w)}`,pesi_ottimizzati:ds.assets.map((x,i)=>`${x.name} ${fmtPct(R.chosen[i],1)}`).join(", "),
      prima:m(A),dopo:m(B),nota:(R.note?R.note+" ":"")+"Ottimo nel campione storico: i rendimenti attesi sono medie passate, non previsioni."};
  },
  crisi_storiche:(a)=>{
    const ds=S.ds,f=ds.freq.f,pw=a.pesi?parseWeights(a.pesi):null;if(pw&&pw.error)return pw;
    const w=pw?pw.w:riskWeights().w,all=P.avgCorr(ds.assets,w);
    return {pesi:fmtW(w),periodo_del_file:`${fmtDate(ds.dates[0],f)} - ${fmtDate(ds.dates[ds.dates.length-1],f)}`,correlazione_media_normale:fmtN(all),crisi:P.CRISES.map(c=>{const r=P.crisisAnalysis(ds.dates,ds.assets,w,f,c);
      if(r.status==="out"||!r.used)return {nome:c.name,stato:"fuori dai dati del file: non stimata"};
      return {nome:c.name,stato:r.status==="in"?"nei dati":"dati parziali",finestra:`${fmtDate(r.from,f)} - ${fmtDate(r.to,f)}`,perdita_massima:fmtPct(r.mdd,1),rendimento_nella_crisi:fmtPct(r.ret,1,true),
        tempo_per_il_minimo:stPer(r.toTrough,f),recupero:r.recK!=null?`${stPer(r.recPeriods,f)} dal minimo`:"non recuperato nei dati",correlazione_media_in_crisi:Number.isFinite(r.corrIn)?fmtN(r.corrIn):"non calcolabile (pochi periodi)",
        asset:ds.assets.map((x,i)=>w[i]>0?{nome:x.name,rendimento:fmtPct(r.assets[i].ret,1,true),contributo_alla_perdita:fmtPct(r.contrib[i],1,true)}:null).filter(Boolean)};})};
  },
  stress_shock:(a)=>{
    const ds=S.ds,pw=a.pesi?parseWeights(a.pesi):null;if(pw&&pw.error)return pw;
    const w=pw?pw.w:riskWeights().w,v=ds.assets.map(()=>NaN),unk=[];
    (Array.isArray(a.shock)?a.shock:[]).forEach(x=>{const q=String(x&&x.asset||"").toLowerCase().trim();let i=ds.assets.findIndex(y=>y.name.toLowerCase()===q);if(i<0)i=ds.assets.findIndex(y=>y.name.toLowerCase().includes(q)||q.includes(y.name.toLowerCase()));
      if(i<0||!q){unk.push(x&&x.asset);return;}let s=Number(x.variazione);if(Math.abs(s)>1)s/=100;if(Number.isFinite(s))v[i]=Math.max(-1,s);});
    if(unk.length)return {error:`Asset non trovati: ${unk.join(", ")}. Disponibili: ${ds.assets.map(y=>y.name).join(", ")}.`};
    if(!v.some(Number.isFinite))return {error:"Nessuno shock indicato."};
    const prop=a.propaga!==false,s=prop?P.conditionalShock(P.covMatrix(ds.assets).C,v):{r:v.map(x=>Number.isFinite(x)?x:0),implied:v.map(()=>false)};if(s.error)return {error:s.error};
    const imp=P.stressImpact(w,s.r),cap=Number.isFinite(+a.capitale)&&+a.capitale>0?+a.capitale:(S.st?S.st.cap:(S.mcIn?S.mcIn.init:10000));
    return {pesi:fmtW(w),impatto_sul_portafoglio:fmtPct(imp.total,1,true),impatto_in_euro:fmtEur(imp.total*cap),capitale:fmtEur(cap),propagazione:prop?"attiva: asset senza shock stimati dalla covarianza storica":"spenta: asset senza shock a zero",
      asset:ds.assets.map((x,i)=>w[i]>0?{nome:x.name,shock:fmtPct(s.r[i],1,true),origine:s.implied[i]?"stimato":"indicato",contributo:fmtPct(imp.contrib[i],1,true)}:null).filter(Boolean),nota:"Shock istantaneo e ipotetico, non una previsione."};
  },
  rendimento_reale:()=>{const R=S.real;if(!R||!R.pp)return {error:"Nessuna transazione nel file: il rendimento reale si calcola solo da un file di movimenti."};const pp=R.pp,ds=S.ds,B=pp.byAsset,tg=B.reduce((s,b)=>s+(b.ops?b.gain:0),0);
    const pos=S.portfolio?S.portfolio.positions:[],cls=i=>{const q=pos.find(p=>(p.ticker||p.nome)===ds.assets[i].name);return q&&q.etf&&!q.etf.error?P.etfClass(q.etf):null;};
    return {tir:fmtPct(pp.xirr,1,true),valore_oggi:fmtEur(pp.value),versato_netto:fmtEur(pp.invested),guadagno:fmtEur(pp.gain),guadagno_percentuale:fmtPct(pp.gainPct,1,true),rendimento_ponderato_nel_tempo:fmtPct(pp.twr,1,true),
      per_strumento:ds.assets.map((a,i)=>B[i].ops?{strumento:a.name,classe:cls(i),acquisti:fmtEur(B[i].bought),vendite:fmtEur(B[i].sold),dividendi_incassati:fmtEur(B[i].income),valore_oggi:fmtEur(B[i].value),guadagno:fmtEur(B[i].gain),tir:Number.isFinite(B[i].xirr)?fmtPct(B[i].xirr,1,true):null,quota_del_guadagno:tg?fmtPct(B[i].gain/tg,0):null}:null).filter(Boolean),
      nota:"Guadagno = valore oggi − acquisti + vendite + dividendi incassati; la somma per strumento è il guadagno totale. Prezzi di mercato di fine mese."};},
  composizione:()=>{const pf=S.portfolio;if(!pf)return {error:"Serve un portafoglio con posizioni (file o portafoglio creato) per conoscere la composizione dei fondi."};
    const tot=pf.positions.reduce((q,p)=>q+(p.valore||0),0),ok=p=>p.etf&&!p.etf.error,items=pf.positions.map(p=>({nome:p.ticker||p.nome,w:tot?(p.valore||0)/tot:1/pf.positions.length,etf:ok(p)?p.etf:null}));
    if(!items.some(x=>x.etf))return {error:pf.etfLoading?"Sto ancora leggendo le schede dei fondi: riprova tra qualche secondo.":"Nessuna scheda dei fondi disponibile (servono gli ISIN)."};
    const X=P.exposures(items.map(x=>({w:x.w,etf:x.etf}))),T=P.weightedTer(items.map(x=>({w:x.w,ter:x.etf?x.etf.ter:NaN}))),C=P.lookThrough(items.map(x=>({w:x.w,parti:x.etf?x.etf.paesi:null}))),Se=P.lookThrough(items.map(x=>({w:x.w,parti:x.etf?x.etf.settori:null})));
    const K=P.companyExposure(items.map(x=>({nome:x.nome,w:x.w,eq:!!x.etf&&P.etfClass(x.etf)==="Azioni",top:x.etf?x.etf.partecipazioni:null}))),r=rows=>rows.slice(0,8).map(x=>`${x.nome} ${fmtPct(x.peso,1)}`);
    return {paesi:r(C.rows),aree:r(X.reg),sviluppati_emergenti:r(X.dev),valute:r(X.ccy),classi:r(X.cls),dimensione_azioni:r(X.size),stile_azioni:r(X.style),settori:r(Se.rows),ter_medio:Number.isFinite(T.ter)?fmtPct(T.ter,2):null,costo_annuo:Number.isFinite(T.ter)?fmtEur(T.ter*tot):null,
      aziende_principali:K&&K.rows?K.rows.slice(0,10).map(x=>`${x.nome}: ${x.hi==null?"almeno "+fmtPct(x.lo,1):fmtPct(x.hi,1)===fmtPct(x.lo,1)?fmtPct(x.lo,1):fmtPct(x.lo,1)+"–"+fmtPct(x.hi,1)} ${tot?` ≈ ${fmtEur(x.lo*tot)}${x.hi!=null&&fmtPct(x.hi,1)!==fmtPct(x.lo,1)?"–"+fmtEur(x.hi*tot):""}`:""} (in ${x.in.map(y=>y.f).join(", ")})`):[],
      sovrapposizioni:K&&K.pairs?K.pairs.filter(p=>p.n>0).map(p=>`${p.a} e ${p.b}: almeno ${fmtPct(p.lo,0)} in comune`):[],
      nota:"Fonte justETF: prime 4 voci per paesi/settori e prime 10 partecipazioni per fondo; le quote 'Altri' restano non dettagliate, le aziende hanno un minimo e un massimo."};},
  confronto_allocazioni:()=>{if(!S.cmp||!S.ds)return {error:"La scheda «Confronta allocazioni» non è ancora aperta: costruisci il laboratorio."};const R=cmpCalc(),ds=S.ds,f=ds.freq.f;
    return {mesi_comuni:R.ks.length,periodo:R.ks.length?`${fmtDate(ds.dates[Math.max(0,R.ks[0]-1)],f)} - ${fmtDate(ds.dates[R.ks[R.ks.length-1]],f)}`:null,
      portafogli:R.res.map(r=>r.empty?{nome:r.name,vuoto:true}:{nome:r.name,pesi:fmtW(r.wn),rendimento_annuo:fmtPct(r.st.cagr,1,true),volatilita:fmtPct(r.st.vol,1),sharpe:fmtN(r.sharpe),perdita_massima:fmtPct(r.st.mdd,1),peggiori_12_mesi:fmtPct(r.rk.worst12,1),crisi:r.cr.map(c=>`${c.name}: ${fmtPct(c.mdd,1)}`)}),
      nota:"Stessi mesi per tutti, ribilanciamento mensile, senza costi né tasse. È il passato."};},
  profilo_rischio:()=>{const B=S.PR;if(!B||!B.result)return {error:"L'utente non ha ancora fatto il test «La tua allocazione è coerente con te?» (scheda «Il tuo profilo» nel laboratorio)."};const r=B.result;
    return {perdita_che_regge:r.tol!=null?`meno del ${fmtPct(-r.tol,0)}`:r.thr!=null?`almeno il ${fmtPct(-r.thr,0)}`:null,perdita_peggiore_del_portafoglio:fmtPct(-r.worst,0),coerente:r.coh,quota_investita_entro_la_soglia:r.okMix!=null?fmtPct(r.okMix,0):null,
      risposte:B.ans,scelte_nelle_crisi:B.cr.map((c,i)=>`${c.name} (${fmtPct(c.mdd,0)}): ${B.ch[i]||"-"}`),nota:"Profilo educativo basato sulle scelte nelle crisi rivissute; non è consulenza."};},
  portafoglio_utente:()=>S.portfolio?{da_file:S.portfolio.from,posizioni:S.portfolio.positions.map(p=>({nome:p.nome,ticker:p.ticker,valore:p.valore==null?null:`${fmtN(p.valore)} €`,peso_attuale:p.pesoAttuale==null?null:fmtPct(p.pesoAttuale,1),peso_target:p.pesoTarget==null?null:fmtPct(p.pesoTarget,1)}))}:{nota:"Nessun riepilogo di portafoglio caricato: si usano pesi uguali o quelli indicati nella domanda."}
};
async function askChat(text,opt={}){
  trackOnce("feature","assistente",{name:"assistente"});
  text=String(text||"").trim();const imgs=Q.imgs.slice();
  if(chatBusy||(!text&&!imgs.length))return;
  if(TTS)TTS.cancel();Q.speaking=null;Q.fromVoice=!!opt.voce;if(imgs.length)trackOnce("feature","quanta_foto",{name:"quanta_foto"});if(opt.voce)trackOnce("feature","quanta_voce",{name:"quanta_voce"});
  chatBusy=true;orbBusy(true);Q.imgs=[];attRender();barUi();
  S.chat.push({role:"user",text,...(imgs.length?{images:imgs.map(x=>({mime:x.mime,data:x.data}))}:{})});S.chatView.push({k:"user",t:text,img:imgs.map(x=>x.url),voce:!!opt.voce},{k:"typing"});renderChat();
  try{
    for(let round=0;round<5;round++){
      /* le foto viaggiano solo con l'ultimo messaggio che le ha: le precedenti diventano un promemoria */
      const msgs=S.chat.slice(-30),li=msgs.map((m,i)=>m.images&&m.images.length?i:-1).filter(i=>i>=0).pop();
      const r=await fetch("/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:msgs.map((m,i)=>m.images&&i!==li?{role:m.role,text:(m.text||"")+" [foto mandata prima]"}:m),context:chatContext()}),signal:AbortSignal.timeout(55000)});
      const j=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(j.error||`Il server ha risposto con un errore (${r.status}).`);
      const calls=Array.isArray(j.calls)?j.calls:[];
      S.chat.push({role:"assistant",text:j.text||"",calls});
      if(calls.length){
        for(const c of calls){
          let result;if(!S.lab&&!NO_LAB.has(c.name)){result={error:"Nessun portafoglio nel laboratorio: rispondi in generale, usa il patrimonio se c'è e, se servono numeri del file, invita a caricarlo o ad aprire l'esempio."};}else try{result=await (TOOLS_LOCAL[c.name]||(()=>({error:"strumento sconosciuto"})))(c.args||{});}catch(e){result={error:String(e.message||e)};}
          S.chat.push({role:"tool",id:c.id,name:c.name,result});
          if(c.name!=="registra_operazione")S.chatView.splice(S.chatView.length-1,0,{k:"tool",t:TOOL_L[c.name]||c.name});
        }
        renderChat();continue;
      }
      S.chatView=S.chatView.filter(v=>v.k!=="typing");S.chatView.push({k:"ai",t:j.text,p:j.provider});renderChat();
      if(opt.voce||Q.talk){if(TTS)speakAt(S.chatView.length-1,talkNext);else setTimeout(talkNext,0);}return;
    }
    throw new Error("La domanda ha richiesto troppi passaggi: prova a farla più semplice.");
  }catch(e){
    S.chatView=S.chatView.filter(v=>v.k!=="typing");
    S.chatView.push({k:"error",t:e instanceof TypeError?"Quanta funziona nella versione del sito pubblicata su Vercel.":e.name==="TimeoutError"?"Le IA non hanno risposto in tempo. Riprova.":String(e.message||e)});
    renderChat();if(Q.talk)talkStop();
  }finally{chatBusy=false;orbBusy(false);barUi();}
}


/* ---------- Quanta parla, ascolta e guarda ----------
   Voce: la sintesi vocale del browser (gratis; il testo non esce dal dispositivo), con la voce italiana migliore che c'è.
   Dettatura: il riconoscimento vocale del browser (Chrome lo fa con Google, Safari con Apple); il testo dettato parte come messaggio.
   Foto: rimpicciolite nel browser e mandate all'IA solo dopo il permesso (pos-quanta-foto-ok). */
const TTS=("speechSynthesis" in window)&&window.SpeechSynthesisUtterance?window.speechSynthesis:null,SR=window.SpeechRecognition||window.webkitSpeechRecognition||null;
const Q={speaking:null,rec:null,listening:false,auto:false,talk:false,imgs:[],fromVoice:false,lastSaved:""};
function pickVoice(){if(!TTS)return null;const vs=TTS.getVoices().filter(v=>/^it([-_]|$)/i.test(v.lang));for(const re of [/natural|neural|online|premium|enhanced/i,/google/i,/alice|federica|elsa|isabella|paola|emma|diego|luca/i]){const v=vs.find(x=>re.test(x.name));if(v)return v;}return vs[0]||null;}
if(TTS&&TTS.addEventListener)TTS.addEventListener("voiceschanged",()=>{});
/* testo da leggere: senza grassetti ed elenchi, segni detti a parole */
function plain(t){return String(t||"").replace(/\*\*(.+?)\*\*/g,"$1").replace(/^\s*[-*•]\s+/gm,"").replace(/[#_`>]/g,"").replace(/−/g,"meno ").replace(/(\d)\s?%/g,"$1 per cento").replace(/€/g," euro").replace(/\s+/g," ").trim();}
/* ---------- voce: prima quella naturale online (Gemini TTS da /api/assistant?modo=voce), se non risponde quella del dispositivo ----------
   L'audio arriva a pezzi di frasi: il primo suona mentre si prepara il secondo. Se la voce online fallisce, per 5 minuti si usa quella del dispositivo. */
const VOX={ctx:null,src:null,off:0,cache:new Map()};
const splitParts=(t,max)=>(t.match(/[^.!?;:]+[.!?;:]*/g)||[]).reduce((a,x)=>{const s=x.trim();if(!s)return a;if(a.length&&a[a.length-1].length+s.length<max)a[a.length-1]+=" "+s;else a.push(s.slice(0,max));return a;},[]);
function audioCtx(){const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;if(!VOX.ctx){try{VOX.ctx=new C();}catch{return null;}}if(VOX.ctx.state==="suspended")VOX.ctx.resume().catch(()=>{});return VOX.ctx;}
const cloudOn=()=>Date.now()>VOX.off&&!!(window.AudioContext||window.webkitAudioContext);
const voceScelta=()=>{try{return localStorage.getItem("pos-quanta-voce-v1")||undefined;}catch{return undefined;}};
async function cloudAudio(text){
  const k=(voceScelta()||"")+"|"+text;if(VOX.cache.has(k))return VOX.cache.get(k);
  const r=await fetch("/api/assistant?modo=voce",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({testo:text,voce:voceScelta()}),signal:AbortSignal.timeout(30000)});
  const j=await r.json().catch(()=>({}));if(!r.ok||!j.audio)throw new Error(j.error||"voce online non disponibile");
  const bin=atob(j.audio),u8=new Uint8Array(bin.length);for(let n=0;n<bin.length;n++)u8[n]=bin.charCodeAt(n);
  if(VOX.cache.size>24)VOX.cache.delete(VOX.cache.keys().next().value);VOX.cache.set(k,u8.buffer);return u8.buffer;
}
async function playBuf(buf,tok){
  const ctx=audioCtx();if(!ctx)throw new Error("audio non disponibile");if(ctx.state!=="running"){await ctx.resume().catch(()=>{});if(ctx.state!=="running")throw new Error("audio bloccato dal browser");}
  const ab=await ctx.decodeAudioData(buf.slice(0));if(Q.tok!==tok)return false;
  return new Promise(res=>{const s=ctx.createBufferSource();s.buffer=ab;s.connect(ctx.destination);VOX.src=s;s.onended=()=>{if(VOX.src===s)VOX.src=null;res(true);};s.start();});
}
function browserSpeak(t,end){const parts=splitParts(t,180),voice=pickVoice();if(!parts.length){end(true);return;}
  parts.forEach((x,k)=>{const u=new SpeechSynthesisUtterance(x);u.lang="it-IT";if(voice)u.voice=voice;u.rate=1.03;u.pitch=1;if(k===parts.length-1)u.onend=()=>end(true);u.onerror=()=>end(false);TTS.speak(u);});}
/* legge un testo; i = risposta della chat che si sta leggendo, done = cosa fare dopo */
async function speakText(text,i=null,done=null){
  hush();const t=plain(text),tok={};if(!t||(!TTS&&!cloudOn())){if(done)done();return;}
  Q.speaking=i;Q.tok=tok;speakUi(true);renderChat();barUi();
  const end=ok=>{if(Q.tok!==tok)return;Q.tok=null;Q.speaking=null;speakUi(false);renderChat();barUi();if(ok&&done)done();};
  let rest=t;
  if(cloudOn()){const parts=splitParts(t,450);let k=0;
    try{let next=cloudAudio(parts[0]);
      for(;k<parts.length;k++){const buf=await next;if(Q.tok!==tok)return;next=k+1<parts.length?cloudAudio(parts[k+1]):null;if(next)next.catch(()=>{});
        if(!await playBuf(buf,tok)||Q.tok!==tok)return;}
      end(true);return;
    }catch(e){if(Q.tok!==tok)return;VOX.off=Date.now()+5*60e3;rest=parts.slice(k).join(" ");}}
  if(!TTS){end(true);return;}browserSpeak(rest,end);
}
function speakAt(i,done){const v=S.chatView[i];if(v&&v.k==="ai")speakText(v.t,i,done);}
function hush(){if(TTS)TTS.cancel();if(VOX.src){const s=VOX.src;VOX.src=null;try{s.stop();}catch{}}Q.tok=null;Q.speaking=null;speakUi(false);}
/* audio e voce del dispositivo partono solo dopo un tocco (Safari su iPhone): al primo tocco si sbloccano entrambi */
let ttsOk=false;function ttsUnlock(){audioCtx();if(!TTS||ttsOk)return;ttsOk=true;try{const u=new SpeechSynthesisUtterance(" ");u.volume=0;TTS.speak(u);}catch{}}
function speakUi(on){document.querySelectorAll(".orb").forEach(o=>o.classList.toggle("speaking",on));}
document.addEventListener("click",e=>{const sb=e.target.closest("[data-say]");if(!sb)return;ttsUnlock();const i=+sb.dataset.say;if(Q.speaking===i){hush();renderChat();barUi();}else speakAt(i);});

/* ---------- la barra: «+» foto, testo, microfono (dettatura), pulsante tondo (conversazione a voce, invio o stop) ---------- */
function grow(){const i=$("#chatIn");if(!i)return;i.style.height="auto";i.style.height=Math.min(i.scrollHeight,160)+"px";}
function barUi(){
  const go=$("#chatSend"),mic=$("#chatMic"),inp=$("#chatIn"),f=$("#chatForm");if(!go||!inp)return;
  const has=!!(inp.value.trim()||Q.imgs.length),mode=Q.talk?"stop":has||!SR?"send":"talk";
  go.dataset.mode=mode;go.disabled=mode!=="stop"&&(chatBusy||(mode==="send"&&!has));
  go.setAttribute("aria-label",mode==="stop"?"Chiudi la conversazione a voce":mode==="talk"?"Parla con Quanta a voce":"Invia");go.title=go.getAttribute("aria-label");
  if(mic){mic.hidden=!SR||Q.talk;const on=Q.listening&&!Q.auto;mic.classList.toggle("on",on);mic.setAttribute("aria-pressed",String(on));mic.setAttribute("aria-label",on?"Ho finito di dettare":"Detta il messaggio");}
  f.classList.toggle("talking",Q.talk);
  inp.placeholder=Q.talk?(Q.listening?"Ti ascolto…":chatBusy?"Quanta ci pensa…":Q.speaking!==null||Q.tok?"Quanta risponde… tocca il quadrato per fermarla":"Conversazione a voce"):Q.listening?"Ti ascolto…":"Chiedi a Quanta";
}
$("#chatIn").addEventListener("input",()=>{grow();barUi();});
$("#chatSend").addEventListener("click",()=>{const m=$("#chatSend").dataset.mode;if(m==="stop")talkStop();else if(m==="talk")talkStart();else $("#chatForm").requestSubmit();});
/* ascolto: auto = conversazione a voce (manda da solo), altrimenti dettatura (il testo resta nella barra da controllare) */
function listen(auto){
  if(!SR||Q.listening||(auto&&(chatBusy||!Q.talk)))return;hush();
  const r=new SR();r.lang="it-IT";r.interimResults=true;r.continuous=false;r.maxAlternatives=1;let heard="",err="";const pre=auto?"":$("#chatIn").value.trim();
  r.onresult=e=>{let t="";for(let k=0;k<e.results.length;k++)t+=e.results[k][0].transcript;heard=t;$("#chatIn").value=(pre?pre+" ":"")+t;grow();};
  r.onerror=e=>{err=e.error||"errore";};
  r.onend=()=>{Q.listening=false;Q.rec=null;const t=heard.trim();
    if(err==="not-allowed"||err==="service-not-allowed"){Q.talk=false;chatNote("Per parlare con Quanta permetti l'uso del microfono nelle impostazioni del browser.");}
    if(!auto){barUi();if(!t&&err==="no-speech")chatNote("Non ho sentito niente: riprova, oppure scrivi.");$("#chatIn").focus();return;}
    $("#chatIn").value="";grow();if(!Q.talk){barUi();return;}
    if(!t){Q.talk=false;barUi();if(err!=="aborted")chatNote("Non ti ho sentito, così ho chiuso la conversazione a voce. Tocca il pulsante tondo per riprendere.");return;}
    if(voiceCmd(t))return;askChat(t,{voce:true});};
  Q.rec=r;Q.listening=true;Q.auto=auto;barUi();try{r.start();}catch{Q.listening=false;Q.rec=null;if(auto)Q.talk=false;barUi();}
}
function talkStart(){if(!SR||chatBusy)return;ttsUnlock();trackOnce("feature","quanta_conversazione",{name:"quanta_conversazione"});Q.talk=true;$("#chatConsent").hidden=true;barUi();listen(true);}
function talkStop(){Q.talk=false;if(Q.rec){try{(Q.rec.abort||Q.rec.stop).call(Q.rec);}catch{}}hush();renderChat();barUi();}
function talkNext(){if(Q.talk)setTimeout(()=>listen(true),350);}
/* in conversazione, la scheda da confermare si conferma a voce: «sì», «conferma», «annulla», «no»; «basta» chiude */
function voiceCmd(t){
  const s=t.toLowerCase().trim(),v=[...S.chatView].reverse().find(x=>x.k==="op"&&x.st==="wait");
  const W="(?![a-zà-ù])";if(new RegExp("^(basta|stop|fine|chiudi|ho finito)"+W).test(s)){talkStop();return true;}
  if(!v)return false;
  const yes=new RegExp("^(s[iì]|conferma|confermo|ok|okay|va bene|salva|salvala|certo)"+W).test(s),no=new RegExp("^(no|annulla|lascia|non salvare)"+W).test(s);if(!yes&&!no)return false;
  S.chatView.push({k:"user",t,voce:true});renderChat();
  opDecide(v,yes).then(()=>speakText(v.st==="done"?v.msg:v.st==="no"?"Va bene, non ho registrato niente.":v.msg||"Non sono riuscita a salvarla.",null,talkNext));return true;
}
function chatNote(t){S.chatView.push({k:"error",t});renderChat();}
document.addEventListener("click",e=>{if(!e.target.closest("#chatMic"))return;ttsUnlock();if(Q.listening){if(Q.rec)Q.rec.stop();}else listen(false);});
/* foto: permesso la prima volta, poi la scelta (sul telefono anche la fotocamera) */
const fotoOk=()=>{try{return localStorage.getItem("pos-quanta-foto-ok")==="1";}catch{return false;}};
async function shrinkImg(file,max=1600,q=.82){const bmp=await createImageBitmap(file),k=Math.min(1,max/bmp.width,max/bmp.height),w=Math.round(bmp.width*k),h=Math.round(bmp.height*k);
  const c=document.createElement("canvas");c.width=w;c.height=h;const g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,w,h);g.drawImage(bmp,0,0,w,h);bmp.close&&bmp.close();const url=c.toDataURL("image/jpeg",q);return {url,data:url.split(",")[1],mime:"image/jpeg"};}
function attRender(){const a=$("#chatAtt");if(!a)return;a.hidden=!Q.imgs.length;a.innerHTML=Q.imgs.map((x,i)=>`<span class="q-thumb"><img src="${x.url}" alt="Foto da mandare"><button type="button" data-attdel="${i}" aria-label="Togli la foto">×</button></span>`).join("")+(Q.imgs.length?`<small>${Q.imgs.length===1?"La foto parte":"Le foto partono"} con il prossimo messaggio</small>`:"");barUi();}
function photoStart(){if(Q.talk)talkStop();if(Q.imgs.length>=2){chatNote("Al massimo due foto per messaggio.");return;}if(fotoOk())$("#chatFile").click();else $("#chatConsent").hidden=false;}
document.addEventListener("click",e=>{
  if(e.target.closest("#chatPhoto")){photoStart();return;}
  const qa=e.target.closest("[data-qact]");if(qa){if(qa.dataset.qact==="foto")photoStart();else talkStart();return;}
  if(e.target.closest("#chatConsentOk")){try{localStorage.setItem("pos-quanta-foto-ok","1");}catch{}$("#chatConsent").hidden=true;$("#chatFile").click();return;}
  if(e.target.closest("#chatConsentNo")){$("#chatConsent").hidden=true;return;}
  const d=e.target.closest("[data-attdel]");if(d){Q.imgs.splice(+d.dataset.attdel,1);attRender();}
});
document.addEventListener("change",async e=>{if(e.target.id!=="chatFile")return;const fs=[...e.target.files].filter(f=>/^image\//.test(f.type)).slice(0,2-Q.imgs.length);e.target.value="";
  for(const f of fs){try{Q.imgs.push(await shrinkImg(f));}catch{chatNote("Non riesco ad aprire questa foto: prova con un'altra (JPEG o PNG).");}}attRender();const i=$("#chatIn");if(i)i.focus();});
/* suggerimenti con le icone: due domande per il momento in cui sei, poi foto e conversazione a voce */
const SVGI=b=>`<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${b}</svg>`;
const ICO={chat:SVGI('<path d="M5 5h14v10H9l-4 4z"/>'),chart:SVGI('<path d="M4 17l5-5 4 3 7-7"/><path d="M15 8h5v5"/>'),tax:SVGI('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9.5 9h5M9.5 13h5"/>'),
  coin:SVGI('<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>'),flag:SVGI('<path d="M6 21V4M6 4h11l-2 4 2 4H6"/>'),shield:SVGI('<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>'),
  bolt:SVGI('<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>'),help:SVGI('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7M12 17h.01"/>'),book:SVGI('<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>'),
  file:SVGI('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>'),sliders:SVGI('<path d="M5 6h14M5 12h14M5 18h14"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="8" cy="18" r="2" fill="currentColor"/>'),
  photo:SVGI('<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-9 8"/>'),wave:SVGI('<path d="M5 10v4M9 7v10M13 4v16M17 8v8M21 11v2"/>')};
function icoFor(t){return /guadagn|rendiment|tir\b|riassumi/i.test(t)?"chart":/tass|impost/i.test(t)?"tax":/cedol|dividend/i.test(t)?"coin":/obiettiv/i.test(t)?"flag":/rischi|perso|peggiore/i.test(t)?"shield":/crisi/i.test(t)?"bolt":/come funziona/i.test(t)?"help":/che cos|differenza/i.test(t)?"book":/file/i.test(t)?"file":/pesi|allocazione|metto/i.test(t)?"sliders":"chat";}
function sugItems(){const acts=[{t:"Leggi la foto del rendiconto della banca",ico:"photo",act:"foto"}];if(SR)acts.push({t:"Parla con Quanta a voce",ico:"wave",act:"talk"});
  return [...chatSuggestions().slice(0,4-acts.length).map(t=>({t,ico:icoFor(t)})),...acts];}
/* strumenti che non hanno bisogno del laboratorio */
const NO_LAB=new Set(["patrimonio","registra_operazione","costi_banca","vai_a"]);
Object.assign(TOOL_L,{patrimonio:"il tuo patrimonio",costi_banca:"quanto ti costa la banca",vai_a:"apro la pagina"});
const OPQ_L={acquisto:"Acquisto",vendita:"Vendita",dividendo:"Dividendo",cedola:"Cedola"};
/* la data di oggi sul fuso dell'utente, e le date come le dicono le IA o le persone: «ieri», «18/11», «18 novembre 2026» (null se non è chiara) */
const oggiLoc=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);};
const MESI_IT=["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
function dataIt(v,oggi){
  const s=String(v||"").trim().toLowerCase().replace(/[’`]/g,"'");if(!s||s==="oggi")return oggi;
  const ok=r=>{const t=new Date(r+"T12:00:00Z");return !isNaN(t)&&t.toISOString().slice(0,10)===r?r:null;},pad=n=>String(n).padStart(2,"0");
  const back=n=>{const t=new Date(oggi+"T12:00:00Z");t.setUTCDate(t.getUTCDate()-n);return t.toISOString().slice(0,10);};
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return ok(s);if(s==="ieri")return back(1);if(/^(l')?altro ?ieri$/.test(s))return back(2);
  const fix=(y,mo,d,hasY)=>{let r=ok(`${y}-${pad(mo)}-${pad(d)}`);if(r&&!hasY&&r>oggi)r=ok(`${y-1}-${pad(mo)}-${pad(d)}`);return r;};
  let m=s.match(/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2}|\d{4}))?$/);if(m){const y=m[3]?(+m[3]<100?2000+ +m[3]:+m[3]):+oggi.slice(0,4);return fix(y,+m[2],+m[1],!!m[3]);}
  m=s.match(/^(\d{1,2})\s+([a-zà-ù]+)\.?(?:\s+(\d{4}))?$/);if(m){const k=MESI_IT.indexOf(m[2].slice(0,3));if(k>=0)return fix(m[3]?+m[3]:+oggi.slice(0,4),k+1,+m[1],!!m[3]);}
  return null;
}
const dIt=d=>`${d.slice(8,10)}/${d.slice(5,7)}/${d.slice(0,4)}`;
function opText(o){const n=x=>fmtN(x,x%1?(x<10?3:2):0);return o.tipo==="acquisto"||o.tipo==="vendita"?`${OPQ_L[o.tipo]} · ${n(o.quantita)} ${o.quantita===1?"quota":"quote"} di ${o.strumento} a ${fmtN(o.prezzo,2)} € · ${dIt(o.data)}${o.spese?` · spese ${fmtN(o.spese,2)} €`:""}`:`${OPQ_L[o.tipo]} · ${fmtN(o.importo,2)} € da ${o.strumento} · ${dIt(o.data)}`;}
function opCard(v){const o=v.op;return `<div class="msg q-op ${v.st}" data-op="${v.id}"><span class="eyebrow">${v.st==="done"?"Salvato nel patrimonio":v.st==="no"?"Non salvato":v.st==="err"?"Non salvato":"Da confermare"}</span><b>${esc(opText(o))}</b>${v.st==="wait"?`<span class="q-opb"><button type="button" class="btn sm lime" data-opok="${v.id}">Conferma</button><button type="button" class="btn sm" data-opno="${v.id}">Annulla</button></span>`:v.st==="saving"?`<small>Salvo…</small>`:v.msg?`<small>${esc(v.msg)}</small>`:""}</div>`;}
Object.assign(TOOLS_LOCAL,{
  patrimonio:()=>pmQuantaSummary(),
  registra_operazione:a=>{
    const tipo=String(a.tipo||""),str=String(a.strumento||"").trim().slice(0,60),oggi=oggiLoc(),data=dataIt(a.data,oggi);
    if(!OPQ_L[tipo])return {error:"tipo di operazione non previsto"};if(!str)return {error:"manca lo strumento: chiedilo all'utente"};
    if(!data)return {error:"data non chiara: chiedi all'utente il giorno (per esempio 18/11/2026)"};if(data>oggi)return {error:"la data è nel futuro: chiedi la data giusta"};
    const o={tipo,strumento:str,data,quantita:+a.quantita||0,prezzo:+a.prezzo||0,importo:+a.importo||0,spese:Math.max(0,+a.spese||0)};
    if((tipo==="acquisto"||tipo==="vendita")&&!(o.quantita>0&&o.prezzo>0))return {error:"mancano le quote o il prezzo: chiedili all'utente"};
    if((tipo==="dividendo"||tipo==="cedola")&&!(o.importo>0))return {error:"manca l'importo incassato: chiedilo all'utente"};
    S.chatView.splice(S.chatView.length-1,0,{k:"op",op:o,id:"op"+Date.now().toString(36),st:"wait"});
    return {stato:"proposta mostrata all'utente in una scheda: NON è salvata finché non preme «Conferma»",operazione:opText(o)};
  },
  costi_banca:a=>cbSet({pat:a.patrimonio_medio,serv:a.costi_servizi,prod:a.costi_prodotti,inc:a.incentivi}),
  vai_a:a=>{const M={home:"home",patrimonio:"patrimonio",laboratorio:"lab",strumenti:"strumenti",rischio:"risk",simulazioni:"sim",indipendenza_finanziaria:"fire",crisi:"stress",frontiera:"opt",benchmark:"bench",costi_banca:"strumenti"},t=M[a.pagina];
    if(!t)return {error:"pagina sconosciuta"};if(["lab","risk","sim","fire","stress","opt","bench"].includes(t)&&!S.lab)return {error:"questa pagina si apre dopo aver costruito il laboratorio con un file o con il patrimonio"};
    setTimeout(()=>{go(t);if(a.pagina==="costi_banca")setTimeout(()=>{const b=$("#cbBox");if(b)b.scrollIntoView({behavior:"smooth",block:"start"});},500);if(window.innerWidth<760&&!Q.talk)closeChat();},250);return {fatto:true,pagina:a.pagina};}
});
async function opDecide(v,ok){
  if(!v||v.st!=="wait")return;
  if(!ok){v.st="no";v.msg="Annullato: non ho registrato niente.";renderChat();return;}
  v.st="saving";renderChat();const r=await pmQuantaOp(v.op).catch(err=>({error:String(err.message||err)}));
  if(r.ok){v.st="done";v.msg=r.testo;Q.lastSaved=opText(v.op);}else{v.st="err";v.msg=`Non salvato: ${r.error}.`;}renderChat();
}
document.addEventListener("click",e=>{
  const ok=e.target.closest("[data-opok]"),no=e.target.closest("[data-opno]");if(!ok&&!no)return;
  opDecide(S.chatView.find(x=>x.k==="op"&&x.id===(ok||no).dataset[ok?"opok":"opno"]),!!ok);
});
barUi();

/* ---------- Quanta si presenta: fumetti per sezione e qualche giro per lo schermo ---------- */
const QTIPS={
  fire:{t:"Chiedimi: «Se risparmio 300 € in più, quando posso smettere?»",q:"Se risparmio 300 € in più al mese, a che età posso smettere di lavorare?"},
  home:{t:"Ciao, sono <b>Quanta</b>! Carica un file e chiedimi qualsiasi cosa sui tuoi investimenti.",q:null},
  scan:{t:"Sto guardando il tuo file con il motore. Se qualcosa non torna, chiedimelo.",q:null},
  map:{t:"Una colonna non ti è chiara? Te la spiego io.",q:null},
  lab:{t:"Vuoi sapere quale asset ti fa rischiare di più?",q:"Qual è l'asset più rischioso?"},
  risk:{t:"Il VaR ti sembra arabo? Te lo spiego con i <b>tuoi</b> numeri.",q:"Spiegami il VaR e il CVaR del mio portafoglio in parole semplici"},
  sim:{t:"Chiedimi: «Con 300 € al mese quanto avrei tra 20 anni?»",q:"Con 300 € al mese quanto avrei tra 20 anni?"},
  stress:{t:"Come avrebbe retto il tuo portafoglio nel 2008? Chiedimelo.",q:"Come ha retto il portafoglio nelle crisi?"},
  opt:{t:"Ti trovo l'allocazione più efficiente con i tuoi vincoli.",q:"Qual è l'allocazione più efficiente con massimo 50% per asset?"},
  bench:{t:"Hai battuto il mercato? Te lo dico con la statistica.",q:"Ho battuto l'S&P 500? L'alpha è significativo?"}
};
const QG={seen:new Set(),roams:0,opened:false,hideT:0,tl:null,pos:{x:0,y:0},lastInput:Date.now()};
const say=document.createElement("button");say.type="button";say.className="orb-say";say.setAttribute("aria-live","polite");document.body.appendChild(say);
const orbBtn=$("#chatBtn"),narrowUI=()=>window.innerWidth<760;
["pointerdown","keydown","wheel"].forEach(ev=>window.addEventListener(ev,()=>{QG.lastInput=Date.now();},{passive:true}));
function placeSay(){
  const r=orbBtn.getBoundingClientRect(),left=r.left+r.width/2>window.innerWidth/2;
  say.classList.toggle("r",!left);
  const w=Math.min(300,window.innerWidth-40);say.style.maxWidth=w+"px";
  const top=Math.max(12,Math.min(window.innerHeight-say.offsetHeight-12,r.top+r.height/2-say.offsetHeight/2));
  say.style.top=top+"px";
  say.style.left=(left?Math.max(12,r.left-say.offsetWidth-14):Math.min(window.innerWidth-say.offsetWidth-12,r.right+14))+"px";
}
function showSay(scene,ms){
  const tip=QTIPS[scene]||QTIPS.home;if(document.body.classList.contains("chat-on"))return;
  say.innerHTML=`<span class="who">Quanta</span>${tip.t}${tip.q&&S.lab?`<span class="go">Chiedimelo →</span>`:""}`;say.dataset.scene=scene;
  /* sul telefono il fumetto copre il contenuto: resta meno e sparisce appena si scorre */
  const mob=window.innerWidth<760;
  say.classList.add("on");placeSay();clearTimeout(QG.hideT);QG.hideT=setTimeout(()=>say.classList.remove("on"),mob?3500:(ms||6500));
}
window.addEventListener("scroll",()=>{if(window.innerWidth<760&&say.classList.contains("on"))say.classList.remove("on");},{passive:true});
say.addEventListener("click",()=>{const tip=QTIPS[say.dataset.scene]||{};say.classList.remove("on");openChat();if(tip.q&&S.lab)setTimeout(()=>askChat(tip.q),250);});
function quantaScene(name){
  if(QG.seen.has(name)||QG.opened&&name!=="home")return;
  QG.seen.add(name);setTimeout(()=>{if(current===name&&!document.body.classList.contains("chat-on")&&!QG.tl)showSay(name);},name==="home"?6500:2600);
}
/* il giro: la sfera vola verso il contenuto lasciando una scia, dice una cosa utile e torna al suo posto */
function setOrb(x,y){QG.pos={x,y};orbBtn.style.translate=`${x}px ${y}px`;if(say.classList.contains("on"))placeSay();}
function orbSpark(){const r=orbBtn.getBoundingClientRect(),s=document.createElement("i");s.className="orb-spark";s.style.left=(r.left+r.width/2)+"px";s.style.top=(r.top+r.height/2)+"px";document.body.appendChild(s);setTimeout(()=>s.remove(),700);}
function roam(){
  if(CALM)return; // grafica 2: Quanta resta ferma nell'angolo
  if(!HAS_G||REDUCE||narrowUI()||QG.tl||QG.opened||document.hidden||document.body.classList.contains("chat-on")||$("#drawer").classList.contains("open"))return;
  if(Date.now()-QG.lastInput<4000)return; // non disturbare mentre l'utente sta facendo qualcosa
  const r=orbBtn.getBoundingClientRect(),W=window.innerWidth,H=window.innerHeight;
  const tx=W*(.2+Math.random()*.25)-(r.left+r.width/2),ty=H*(.25+Math.random()*.25)-(r.top+r.height/2);
  const mid={x:tx*.55+(Math.random()-.5)*W*.15,y:ty*.35-H*.18};
  const o={x:0,y:0},sp=setInterval(orbSpark,45);QG.roams++;orbBtn.classList.add("roaming");
  QG.tl=G.timeline({onComplete:()=>{clearInterval(sp);orbBtn.classList.remove("roaming");setOrb(0,0);QG.tl=null;}})
    .to(o,{x:mid.x,y:mid.y,duration:1.1,ease:"power2.in",onUpdate:()=>setOrb(o.x,o.y)})
    .to(o,{x:tx,y:ty,duration:1.1,ease:"power3.out",onUpdate:()=>setOrb(o.x,o.y)})
    .add(()=>{clearInterval(sp);showSay(current,4800);})
    .to(orbBtn,{scale:1.18,duration:.35,yoyo:true,repeat:3,ease:"sine.inOut"})
    .to({},{duration:3.2})
    .add(()=>{say.classList.remove("on");const s2=setInterval(orbSpark,45);setTimeout(()=>clearInterval(s2),1500);})
    .to(o,{x:0,y:0,duration:1.5,ease:"expo.inOut",onUpdate:()=>setOrb(o.x,o.y)});
}
orbBtn.addEventListener("click",()=>{QG.opened=true;say.classList.remove("on");if(QG.tl){QG.tl.kill();QG.tl=null;orbBtn.classList.remove("roaming");G.set(orbBtn,{scale:1});setOrb(0,0);}});
/* primo giro dopo ~35 s, poi ogni 55-80 s, al massimo 4 volte */
(function schedule(first){setTimeout(()=>{roam();if(QG.roams<4&&!QG.opened)schedule(false);},first?35000:55000+Math.random()*25000);})(true);
window.addEventListener("resize",()=>{if(say.classList.contains("on"))placeSay();});
window.__quanta={roam:()=>{QG.lastInput=0;roam();},say:s=>showSay(s||current)}; // per i test automatici

export { QG, QTIPS, TOOLS_LOCAL, TOOL_L, askChat, chatBusy, chatContext, chatSuggestions, closeChat, fmtW, md, narrowUI, openChat, orbBtn, orbBusy, orbSpark, parseWeights, pfSummary, placeSay, quantaScene, renderChat, roam, say, setOrb, showSay };
