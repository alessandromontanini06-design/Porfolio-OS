/* Portfolio OS · interfaccia · caricamento dei file, lettura con l'IA, crea il portafoglio, import, correzioni, ricostruzione con i prezzi, controlli, modelli, tracker, obbligazioni.
   Parte di app.js divisa in moduli: il codice è lo stesso, cambiano solo import ed export. */
import { $, CONF_L, G, HAS_G, P, REDUCE, ROLES, ROLE_COLOR, ROLE_TAG, S, esc, fmtDate, fmtN, fmtPct, fmtSize } from "./core.js";
import { current, go, morphData, renderTicker } from "./scene.js";
import { hideLab } from "./portafoglio.js";
import { showLab } from "./archivio.js";
import { fmtEur, getJSON, netClear, netGet, netPut } from "./analisi.js";
import { detectTx } from "./rendimento.js";
import { renderChat } from "./quanta.js";
import { btpEtichetta, btpNota, btpPrezzi, btpSym, isBtpSym } from "./btp.js";

/* ---------- Caricamento ---------- */
function load(sheets,source,fromUser,opts={}){
  const isFile=source.kind==="file";
  /* un file nuovo caricato dall'utente non è il portafoglio dell'archivio aperto prima: niente sovrascritture */
  if(isFile&&fromUser&&!opts.recipe&&!opts.forceAuto&&!S.svResume){S.svSaved=null;S.svPrev=null;}
  if(isFile)S.fastOpen=null;
  if(isFile){S.rb=null;S.youngRes={};}
  if(isFile&&!opts.recipe&&!opts.forceAuto){S.fileSheets=sheets;S.recipe=null;S.conflict=null;S.agree=false;S.fp=P.structureFingerprint(sheets);S.tpl=tplGet(S.fp);}
  if(!isFile){S.fp=null;S.tpl=null;S.recipe=null;S.conflict=null;S.agree=false;}
  if(!opts.recipe||!opts.memory)S.tplUsed=false;
  resetImportState();S.tplCols=null;S.local=null;S.localParts=null;
  /* stesso modello di file già confermato con una ricetta dell'IA: la si riusa, senza chiamare di nuovo l'IA */
  if(isFile&&!opts.recipe&&!opts.forceAuto&&S.tpl&&S.tpl.recipe&&!S.tpl.auto){const T=P.applyRecipe(sheets,S.tpl.recipe);if(T.sheets.length||(T.tx&&T.tx.positions.length))opts={...opts,recipe:S.tpl.recipe,virtual:T.sheets,wide:T.wide,tx:T.tx,memory:true};}
  let virt=[],localTx=null,localPos=null;
  if(opts.recipe){S.wide=opts.wide||null;virt=opts.virtual||[];}
  else if(isFile){
    S.wide=P.reshapeWide(sheets);
    if(S.wide)virt=S.wide.sheets;
    else{const L=P.localRecipe(sheets);if(L){const LA=P.applyRecipe(sheets,L.recipe);virt=LA.sheets.map(x=>({...x,name:x.name.replace("★ Serie lette dall'IA","★ Serie riconosciute")}));localTx=LA.tx;localPos=L.recipe.posizioni;S.local=L;S.localParts=L.parts;}}
  }else S.wide=null;
  const all=[...virt,...sheets];
  S.source=source;S.raw=all.map(x=>x.aoa);
  S.sheets=all.map(x=>{const A=P.analyzeSheet(x.name,x.aoa);A.virtual=!!x.virtual;A.fromAI=!!(x.virtual&&opts.recipe&&!opts.memory);A.ccyArr=x.ccy||null;return A;});
  /* ruoli indicati dalla ricetta (IA, modello salvato o riconoscitori locali) */
  all.forEach((sh,i)=>{if(sh.roles)S.sheets[i].cols.forEach(c=>{const r=sh.roles[c.idx];if(r){c.suggest=r;c.conf="alta";c.reason=r==="date"?(opts.recipe?"Colonna data indicata dalla ricetta di lettura":"Colonna data riconosciuta"):(opts.recipe&&!opts.memory?"Serie indicata dall'IA dopo aver letto il file":opts.memory?"Serie del modello che hai già confermato":"Serie riconosciuta dalla struttura del file");}});});
  /* un foglio di prezzi ricostruito dalle quotazioni affiancate («★ Prezzi · …») ha la precedenza sui fogli originali */
  const qIdx=all.findIndex(x=>/^★ Prezzi · /.test(x.name));
  S.sheetIdx=virt.length?0:qIdx>=0?qIdx:S.sheets.reduce((b,x,i)=>x.score>S.sheets[b].score?i:b,0);
  /* file ricostruito: ogni colonna dice da dove vengono i suoi prezzi */
  if(source.kind==="rebuilt"&&S.rb)S.sheets.forEach(A=>A.cols.forEach(c=>{const m=S.rb.cols.find(x=>x.name===c.name);if(m&&c.suggest==="price"){const k=[...m.map.keys()].sort();c.conf="alta";c.reason=`Prezzo di mercato di ${m.sym} (${m.src}${m.info?", "+m.info.split(" · ")[0]:""}), ${m.adj?"chiusure rettificate per dividendi e frazionamenti":"chiusure"}${m.cur&&m.cur!=="EUR"?`, convertito da ${m.cur==="GBX"?"pence":m.cur} in euro con il cambio BCE`:", in euro"}, ${k.length} mesi dal ${k[0]}`;}}));
  /* nei tracker la liquidità cambia con versamenti e spese, non con il mercato: fuori dalle analisi salvo scelta diversa */
  if(S.wide)S.sheets.slice(0,S.wide.sheets.length).forEach(A=>A.cols.forEach(c=>{if(/^liquidit/i.test(c.name)&&c.suggest){c.suggest="ignore";c.conf="alta";c.reason="Saldi di conti e broker: cambiano con versamenti, spese e trasferimenti, non con il mercato";}}));
  initRoles();
  /* modello già confermato: stesso foglio e stessi ruoli dell'ultima volta */
  if(isFile&&S.tpl&&(opts.memory||(!opts.recipe&&(S.tpl.auto||!S.tpl.recipe))))S.tplUsed=tplApply(S.tpl);
  hideLab();$("#fileErr").hidden=true;S.scanPlayed=false;resetAI();
  renderImport(false);
  morphData();
  if(fromUser){S.scanPlayed=false;go("scan",{force:true});}
  if(source.kind!=="rebuilt"){S.portfolio=null;S.tx=detectTx(sheets);}
  const sym=new Map(((opts.recipe&&opts.recipe.simboli)||[]).map(x=>[String(x.titolo).trim().toLowerCase(),avSymbol(x.simbolo)]));
  let tx=opts.tx||localTx,pos=(opts.recipe&&opts.recipe.posizioni)||localPos||[];
  /* le posizioni (ticker, ISIN) servono sempre per i prezzi di mercato: se la ricetta non le ha, le cercano i riconoscitori locali */
  if(isFile&&opts.recipe&&!(tx&&tx.positions.length)&&!pos.length){const L2=P.localRecipe(sheets);if(L2){if(L2.recipe.movimenti){const T2=P.applyRecipe(sheets,{movimenti:L2.recipe.movimenti}).tx;if(T2&&T2.positions.length)tx=T2;}if(!(tx&&tx.positions.length)&&L2.recipe.posizioni.length)pos=L2.recipe.posizioni;}}
  const u=tx&&tx.positions.length?txSnapshot(tx,sym):S.wide?wideSnapshot(S.wide,sym):pos.length?{status:"ready",tipo:"riepilogo_portafoglio",local:!opts.recipe,foglio:"",spiegazione:opts.recipe?opts.recipe.spiegazione:`Riepilogo di ${pos.length} posizioni senza storico: con i prezzi di mercato le analisi usano anni di dati.`,posizioni:pos.slice(0,20).map(p=>({...p,simbolo:normSym(p)})),scartati:(opts.recipe?opts.recipe.scartati:(S.local&&S.local.recipe.scartati))||[]}:null;
  /* movimenti e foglio delle posizioni nello stesso file: le posizioni dei movimenti hanno solo il ticker,
     il foglio delle posizioni ha ISIN, nome completo e codice di borsa (anche «AMS:IWDA» di Google Fogli) */
  if(u&&u.posizioni&&tx&&tx.positions.length&&pos.length)posEnrich(u.posizioni,pos);
  if(u&&u.posizioni)fillTargets(u.posizioni,sheets);
  if(u){S.und=u;renderAI();}
  if(opts.memory){S.recipe={status:"memory",r:opts.recipe,errors:[]};S.tplUsed=true;}
  /* ogni file nuovo: l'IA legge la struttura di tutti i fogli; un modello già confermato non la richiede */
  /* il file di esempio è noto: niente lettura con l'IA (nessun costo), solo i riconoscitori locali */
  if(fromUser&&isFile&&aiAuto()&&!S.tplUsed&&!source.example&&!source.builder&&!source.screenshot)requestRecipe();
  renderImport(false);
  if(fromUser&&isFile&&(!aiAuto()||S.tplUsed||source.example||source.builder||source.screenshot))maybeAutoRebuild();
}
/* ---------- Lettura con l'IA: estratto strutturato → ricetta → il motore la esegue su tutto il file ---------- */
function aiSample(){
  const sheets=S.fileSheets||[],short=v=>{const t=cellText(v);return t.length>28?t.slice(0,27)+"…":t;};
  const kind=v=>v===null||v===undefined||String(v).trim()===""?"e":v instanceof Date||typeof v==="number"?"d":P.parseNum(v)||P.parseDate(v,false)?"d":"s";
  const build=(head,perSec,maxCols)=>({file:S.source.name,nota:"estratto: 'celle' è lettera di colonna → valore; 'dati' = quante celle numeriche o date ha la riga; le righe non elencate sono simili a quelle vicine.",
    fogli:sheets.slice(0,24).map(sh=>{
      const aoa=sh.aoa||[],w=aoa.reduce((m,r)=>Math.max(m,(r||[]).length),0),rows=[];let after=0;
      const nonEmpty=aoa.map((r,i)=>[i,r||[]]).filter(([,r])=>r.some(v=>kind(v)!=="e")),tail=new Set(nonEmpty.slice(-2).map(x=>x[0]));
      nonEmpty.forEach(([ri,r])=>{
        const cells=r.map((v,ci)=>[ci,v,kind(v)]).filter(x=>x[2]!=="e"),str=cells.filter(x=>x[2]==="s").length,dat=cells.length-str;
        const pick=list=>Object.fromEntries(list.map(([ci,v])=>[colLetterUI(ci),short(v)]));
        if(ri<head){rows.push({riga:ri+1,celle:pick(cells.slice(0,maxCols)),...(cells.length>maxCols?{altre:cells.length-maxCols}:{})});return;}
        const sec=str>0&&dat===0;if(sec)after=0;
        const keep=sec||tail.has(ri)||(str>0&&after<perSec)||(str===0&&after<1);
        if(!sec&&keep)after++;
        if(keep)rows.push({riga:ri+1,celle:pick([...cells.filter(x=>x[2]==="s").slice(0,5),...cells.filter(x=>x[2]==="d").slice(0,2)].sort((a,b)=>a[0]-b[0])),dati:dat});
      });
      return {nome:sh.name,righe:aoa.length,colonne:w,estratto:rows};
    })});
  for(const [h,ps,mc] of [[14,3,30],[10,2,24],[8,1,18],[6,1,14],[4,0,10]]){const p=build(h,ps,mc);if(JSON.stringify(p).length<95000)return p;}
  return build(3,0,8);
}
async function requestRecipe(){
  S.recipe={status:"loading"};renderAI();renderLog(an(),S.ds,false);
  const src=S.source;
  try{
    const r=await fetch("/api/recipe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(aiSample()),signal:AbortSignal.timeout(80000)});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||`Il server ha risposto con un errore (${r.status}).`);
    if(S.source!==src)return; // nel frattempo è stato caricato un altro file
    const A=P.applyRecipe(S.fileSheets,j);
    if(!A.sheets.length&&!(A.tx&&A.tx.positions.length)&&!(j.posizioni||[]).length){S.recipe={status:"empty",r:j,errors:A.errors};renderAI();renderImport(false);maybeAutoRebuild();return;}
    /* la lettura automatica di prima, per confrontarla con quella dell'IA */
    const autoSig=S.ds&&S.ds.ok&&an().virtual?{n:S.ds.assets.length,obs:S.ds.nObs,names:S.ds.assets.map(a=>a.name)}:null,autoUnd=S.und&&S.und.posizioni?S.und.posizioni.length:0;
    load(S.fileSheets,S.source,false,{recipe:j,virtual:A.sheets,wide:A.wide,tx:A.tx});
    S.recipe={status:"done",r:j,errors:A.errors};
    const aiSig=S.ds&&S.ds.ok?{n:S.ds.assets.length,obs:S.ds.nObs,names:S.ds.assets.map(a=>a.name)}:null;
    if(autoSig&&aiSig){
      if(autoSig.n===aiSig.n&&Math.abs(autoSig.obs-aiSig.obs)<=2)S.agree=true;
      else S.conflict={text:`Lettura automatica: ${autoSig.n} serie (${autoSig.names.slice(0,5).join(", ")}${autoSig.n>5?"…":""}), ${autoSig.obs} date. Lettura dell'IA: ${aiSig.n} serie (${aiSig.names.slice(0,5).join(", ")}${aiSig.n>5?"…":""}), ${aiSig.obs} date. Ora vedi quella dell'IA.`};
    }else if(autoUnd&&S.und&&S.und.posizioni&&S.und.posizioni.length===autoUnd)S.agree=true;
    renderAI();renderImport(false);maybeAutoRebuild();
  }catch(e){
    if(S.source!==src)return;
    S.recipe={status:"error",msg:e.name==="TimeoutError"||e.name==="AbortError"?"L'IA non ha risposto in tempo":e instanceof TypeError?"La lettura con l'IA funziona nel sito pubblicato":String(e.message||e)};
    renderAI();renderLog(an(),S.ds,false);maybeAutoRebuild();
  }
}
/* i rendimenti di mercato devono venire dai prezzi degli strumenti, non dai valori del file: appena ci sono posizioni con un ticker o un ISIN, si ricostruisce */
function maybeAutoRebuild(){
  const u=S.und;if(!u||!u.posizioni||!u.posizioni.length||u.status!=="ready"||!S.source||S.source.kind!=="file"||S.autoRebuilt===S.source)return;
  if(!u.posizioni.some(p=>p.simbolo||p.isin||ISIN_RX.test(p.ticker||"")))return;
  S.autoRebuilt=S.source;rebuildFromPrices();
}
function recipeOff(){load(S.fileSheets,S.source,false,{forceAuto:true});S.recipe={status:"off"};renderAI();renderImport(false);}
/* movimenti: le posizioni aperte (quantità nette × ultimo prezzo) diventano un riepilogo da ricostruire con i prezzi storici */
/* etichetta da mostrare: il ticker se c'è, altrimenti il nome; mai l'ISIN quando esiste altro */
function txLabel(p){
  const ok=t=>t&&!ISIN_RX.test(t);
  if(ok(p.tk))return p.tk;
  if(ok(p.titolo)&&!/\s/.test(p.titolo)&&p.titolo.length<=12)return p.titolo;
  const n=ok(p.nome)?p.nome:ok(p.titolo)?p.titolo:null;
  return n?(n.length>28?n.slice(0,27)+"…":n):p.titolo;
}
/* pesi target da un foglio di riepilogo (colonna «Peso target», «Target», «Obiettivo»), abbinati per ISIN, ticker o nome */
function fillTargets(pos,sheets){
  if(!pos.length||pos.some(p=>p.pesoTarget!=null&&p.pesoTarget>0))return;
  const key=v=>String(v==null?"":v).trim().toLowerCase();
  for(const sh of sheets){const A=sh.aoa||[];
    for(let h=0;h<Math.min(A.length,15);h++){const hd=(A[h]||[]).map(key),cT=hd.findIndex(x=>/^(peso )?target|obiettivo|peso obiettivo|allocazione target/.test(x));if(cT<0)continue;
      const ids=hd.map((x,i)=>/^(isin|ticker|simbolo|strumento|nome|titolo|etf)\b/.test(x)?i:-1).filter(i=>i>=0);if(!ids.length)continue;
      const M=new Map();for(let r=h+1;r<A.length;r++){const row=A[r]||[],p=P.parseNum(row[cT]);if(!p)continue;const w=p.pct?p.n:(p.n>1?p.n/100:p.n);ids.forEach(i=>{const k=key(row[i]);if(k)M.set(k,w);});}
      let hit=0;pos.forEach(p=>{const w=[p.isin,p.ticker,p.nome].map(key).map(k=>M.get(k)).find(x=>x!=null);if(w!=null){p.pesoTarget=w;hit++;}});
      if(hit){pos.forEach(p=>{if(p.pesoTarget==null)p.pesoTarget=0;});return;}}}
}
/* versamento medio mensile degli ultimi 12 mesi dai movimenti (per proporre il versamento del mese) */
function avgMonthly(){const T=S.tx;if(!T||!T.rows.length)return null;const last=Math.max(...T.rows.map(r=>+r.d)),from=last-365*864e5;
  const s=T.rows.filter(r=>+r.d>from&&r.amount>0&&!/divid|cedol/i.test(r.type||"")).reduce((a,r)=>a+r.amount,0);return s>0?Math.round(s/12/50)*50||50:null;}
function txSnapshot(T,sym){
  const tot=T.positions.reduce((s,p)=>s+(p.valore||0),0),cur=T.valuta&&T.valuta!=="EUR"?` ${T.valuta}`:" €";
  return {status:"ready",tipo:"riepilogo_portafoglio",foglio:"",
    spiegazione:`Dai ${T.n} movimenti del file risultano ${T.positions.length} posizioni aperte${T.chiuse?` (${T.chiuse} chiuse del tutto)`:""}, valutate all'ultimo prezzo pagato: circa ${fmtN(Math.round(tot))}${cur}. Con lo storico dei prezzi di mercato le analisi usano molti anni di dati, anche se hai iniziato da poco.`,
    posizioni:T.positions.map(p=>({prezzo:p.prezzo,per100:!!p.per100,data:p.data instanceof Date?p.data.toISOString().slice(0,10):p.data||null,quantita:p.quantita,nome:p.nome&&!ISIN_RX.test(p.nome)?p.nome:p.titolo,ticker:txLabel(p),labelIsName:!(p.tk&&!ISIN_RX.test(p.tk))&&!(p.titolo&&!ISIN_RX.test(p.titolo)&&!/\s/.test(p.titolo)&&p.titolo.length<=12),isin:p.isin||null,simbolo:sym.get(p.titolo.toLowerCase())||(/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(p.titolo)?"":guessSymbol(p.tk&&!ISIN_RX.test(p.tk)?p.tk:p.titolo,"",T.valuta)||""),alt:!p.isin&&p.tk&&/^[A-Z0-9]{2,6}$/.test(String(p.tk).toUpperCase())&&!CRYPTO[String(p.tk).toUpperCase()]?[".LON",".DEX",".AMS",".MIL",".PAR",".SWX"].map(x=>String(p.tk).toUpperCase()+x):[],valore:p.valore==null?null:Math.round(p.valore*100)/100,pesoAttuale:tot&&p.valore?p.valore/tot:null,pesoTarget:null})),scartati:[]};
}
function initRoles(){S.roles={};S.touched={};S.sheets[S.sheetIdx].cols.forEach(c=>{S.roles[c.idx]=c.suggest;});}
function showError(msg){const e=$("#fileErr");e.textContent=msg;e.hidden=false;}
async function handleFile(file){
  if(!file)return;
  if(file.size>15*1024*1024){showError("Il file supera i 15 MB. Riduci il periodo o il numero di colonne e riprova.");return;}
  const ext=(file.name.split(".").pop()||"").toLowerCase();
  try{
    let sheets;
    if(ext==="csv"||ext==="txt"){
      const buf=await file.arrayBuffer();let text=new TextDecoder("utf-8").decode(buf);
      if(text.includes(String.fromCharCode(0xFFFD)))text=new TextDecoder("windows-1252").decode(buf);
      sheets=[{name:file.name.replace(/\.[^.]+$/,""),aoa:P.parseCSV(text)}];
    }else if(["xlsx","xls","xlsm","ods"].includes(ext)){
      if(!window.XLSX)throw new Error("noxlsx");
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:"array",cellDates:true,cellFormula:false,cellHTML:false,bookVBA:false});
      sheets=wb.SheetNames.map(n=>({name:n,aoa:XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:null,blankrows:true})}));
    }else{showError(`Il formato .${ext} non è supportato. Usa .xlsx, .xls, .ods o .csv.`);return;}
    if(!sheets.some(s=>s.aoa.length)){showError("Il file è vuoto.");return;}
    if(isSim())spaceSwitch("real",{fresh:true,stay:true});
    track("start",{how:"file"});TR.t0=Date.now();
    sheets=P.normalizeExports(sheets); // export di broker a più sezioni (es. Interactive Brokers) → foglio di movimenti
    load(sheets,{name:file.name,size:file.size,kind:"file"},true);
  }catch(e){track("import_fail",{kind:"file",why:e.message==="noxlsx"?"lettore excel non caricato":"file illeggibile"});showError(e.message==="noxlsx"?"Il lettore Excel non si è caricato. Ricarica la pagina oppure salva il file come CSV.":"Non riesco a leggere il file. Se è protetto da password o danneggiato, salvalo di nuovo come .xlsx o .csv.");}
}
const drop=$("#drop");
["dragenter","dragover"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("over");void 0;}));
["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("over");void 0;}));
drop.addEventListener("drop",e=>handleFile(e.dataTransfer.files[0]));
window.addEventListener("dragover",e=>{if([...(e.dataTransfer?e.dataTransfer.types:[])].includes("Files"))void 0;});
window.addEventListener("dragleave",e=>{if(!e.relatedTarget)void 0;});
$("#file").addEventListener("change",e=>{handleFile(e.target.files[0]);e.target.value="";});
/* portafoglio di esempio: un vero Excel (movimenti dal 2019, 7 ETF con ISIN) letto come un file caricato dall'utente */
const EXAMPLE={url:"esempio/Portfolio_OS_esempio.xlsx",name:"Portfolio_OS_esempio.xlsx"};
const isExample=()=>!!(S.source&&(S.source.example||(S.source.kind==="rebuilt"&&S.rb&&S.rb.origSource&&S.rb.origSource.example)));
async function loadExample(fromUser){
  if(fromUser){track("start",{how:"esempio"});TR.t0=Date.now();}
  if(fromUser&&isSim()){spaceSwitch("real",{stay:true});if(isExample()&&S.source&&S.source.kind==="rebuilt"){go("scan",{force:true});return;}}
  if(fromUser&&isExample()&&S.source.kind==="rebuilt"){go("scan",{force:true});return;}
  try{
    for(let k=0;!window.XLSX&&k<50;k++)await new Promise(r=>setTimeout(r,100));
    if(!window.XLSX)throw new Error("noxlsx");
    const buf=await (await fetch(EXAMPLE.url)).arrayBuffer();
    const wb=XLSX.read(buf,{type:"array",cellDates:true,cellFormula:false,cellHTML:false,bookVBA:false});
    const sheets=wb.SheetNames.map(n=>({name:n,aoa:XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:null,blankrows:true})}));
    if(!fromUser&&S.source&&S.source.kind!=="sample")return; // l'utente ha già caricato un suo file
    load(sheets,{name:EXAMPLE.name,size:buf.byteLength,kind:"file",example:true},fromUser);
    if(!fromUser&&S.und&&S.und.posizioni&&S.und.posizioni.length){S.autoRebuilt=S.source;rebuildFromPrices({quiet:true});}
  }catch(e){if(fromUser)showError("Non riesco a caricare il file di esempio. Ricarica la pagina e riprova.");}
}
$("#sampleBtn").addEventListener("click",()=>loadExample(true));


/* ---------- Due spazi distinti: «Il mio portafoglio» (dal file) e «Prove e confronti» (portafogli creati a mano) ----------
   Ognuno ha il suo stato completo; cambiare spazio salva quello attuale e ripristina l'altro, senza sovrascrivere nulla.
   Restano comuni solo le preferenze (assistente, tasso privo di rischio, viste scelte, benchmark). */
const SPACE_KEEP=new Set(["chat","chatView","rfSrc","lookTab","corrView","bn","bnData"]);
const SPACES={cur:"real",store:{real:null,sim:null}};
const spaceBlank=()=>({source:null,raw:[],sheets:[],sheetIdx:0,roles:{},touched:{},ds:null,lab:null,scanPlayed:false,labFx:{},ai:null,aiLog:[],aiRoles:{},rawOrig:null,macro:null});
function spaceSave(){const o={};for(const k of Object.keys(S))if(!SPACE_KEEP.has(k))o[k]=S[k];SPACES.store[SPACES.cur]=o;}
function spaceSwitch(to,opt={}){
  if(to===SPACES.cur&&!opt.fresh)return;
  const hadLab=!!S.lab;spaceSave();if(hadLab)hideLab();
  for(const k of Object.keys(S))if(!SPACE_KEEP.has(k))delete S[k];
  Object.assign(S,spaceBlank());SPACES.cur=to;
  const o=opt.fresh?null:SPACES.store[to];
  if(o){Object.assign(S,o);const lab=!!o.lab;S.lab=null;
    renderImport(false);
    if(lab&&S.ds&&S.ds.ok)showLab(true,true);
    /* l'esempio si stava ricostruendo in sottofondo quando si è cambiato spazio: si riparte */
    if(S.und&&S.und.status==="rebuilding"){S.und={...S.und,status:"ready"};S.autoRebuilt=S.source;rebuildFromPrices({quiet:true});}
  }else if(S.sheets&&S.sheets.length)renderImport(false);
  spaceBar();
  if(!opt.stay){if(S.lab)go("lab",{force:true});else if(!opt.fresh)go("home",{force:true});}
}
function spaceBar(){const el=$("#spaceSw");if(!el)return;const other=SPACES.cur==="real"?"sim":"real",show=SPACES.cur==="sim"||!!SPACES.store.sim;
  el.hidden=!show;el.querySelectorAll("[data-space]").forEach(b=>{const on=b.dataset.space===SPACES.cur;b.setAttribute("aria-pressed",String(on));b.classList.toggle("on",on);b.disabled=!on&&b.dataset.space===other&&!SPACES.store[other]&&other==="sim";});
  document.body.dataset.space=SPACES.cur;}
document.addEventListener("click",e=>{const b=e.target.closest("[data-space]");if(!b||b.classList.contains("on"))return;spaceSwitch(b.dataset.space);});
const isSim=()=>SPACES.cur==="sim";


/* ---------- Statistiche d'uso anonime (beta): niente cookie, niente dati dei file ----------
   Ogni scheda del browser ha un codice casuale di sessione; gli eventi partono a gruppi verso /api/track.
   Se l'archivio non è collegato su Vercel la funzione risponde «nessun contenuto» e non si salva nulla. */
const TR={sid:(()=>{try{let s=sessionStorage.getItem("pos-sid");if(!s){s=Math.random().toString(36).slice(2,12);sessionStorage.setItem("pos-sid",s);}return s;}catch{return Math.random().toString(36).slice(2,12);}})(),q:[],seen:new Set(),t0:0,errs:0,h:0};
function track(e,p={}){try{TR.q.push({e,p});clearTimeout(TR.h);TR.h=setTimeout(trackFlush,1200);}catch{}}
function trackOnce(e,key,p){try{if(TR.seen.has(e+":"+key))return;TR.seen.add(e+":"+key);track(e,p);}catch{}}
function trackFlush(){if(!TR.q.length)return;const body=JSON.stringify({s:TR.sid,list:TR.q.splice(0,20)});
  try{const ok=navigator.sendBeacon&&navigator.sendBeacon("/api/track",new Blob([body],{type:"application/json"}));if(!ok)fetch("/api/track",{method:"POST",headers:{"Content-Type":"application/json"},body,keepalive:true}).catch(()=>{});}catch{}
  if(TR.q.length)setTimeout(trackFlush,300);}
addEventListener("pagehide",trackFlush);
addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")trackFlush();});
addEventListener("error",e=>{if(TR.errs++<5)track("error",{msg:String(e.message||"errore").slice(0,120),where:current});});
addEventListener("unhandledrejection",e=>{if(TR.errs++<5)track("error",{msg:String((e.reason&&e.reason.message)||e.reason||"promessa rifiutata").slice(0,120),where:current});});
(()=>{let from="diretto";try{const h=new URL(document.referrer).hostname;from=/linkedin|lnkd/.test(h)?"linkedin":/google/.test(h)?"google":/whatsapp|wa\.me/.test(h)?"whatsapp":/instagram|facebook|fb\./.test(h)?"social":h&&h!==location.hostname?"altro":"diretto";}catch{}
  track("visit",{from,device:innerWidth<760?"telefono":innerWidth<1100?"tablet":"computer"});})();
const importKind=()=>S.source&&(S.source.builder||(S.rb&&S.rb.origSource&&S.rb.origSource.builder))?"crea":isExample()?"esempio":S.rb?"file_prezzi_mercato":"file";


/* segnalazione di un file letto male: testo libero e, solo con il consenso, la struttura (nomi di fogli e intestazioni, mai valori né nome del file) */
function fileStructure(){
  const sh=(S.fileSheets&&S.fileSheets.length?S.fileSheets:S.sheets.map(x=>({name:x.name,aoa:[]})))||[];
  return sh.slice(0,8).map(x=>{const A=x.aoa||[],an=P.analyzeSheet(x.name,A),h=an.headerRow,hd=h>=0?(A[h]||[]).filter(v=>typeof v==="string"&&v.trim()&&!/\d{3,}/.test(v)).map(v=>v.trim().slice(0,30)).slice(0,25):[];
    return `${String(x.name).slice(0,30)} [${A.length} righe] ${h>=0?"intestazione riga "+(h+1)+": "+hd.join(" | "):"intestazione non trovata"}`;});
}
document.addEventListener("click",e=>{if(e.target.id!=="fbSend")return;const t=$("#fbText").value.trim(),st=$("#fbStruct").checked;
  if(!t&&!st){$("#fbMsg").textContent="Scrivi cosa non va oppure spunta la struttura del file.";return;}
  track("feedback",{text:t,structure:st?fileStructure():null,kind:S.source?importKind():"nessun file"});trackFlush();
  $("#fbMsg").textContent="Grazie, segnalazione inviata.";$("#fbText").value="";$("#fbStruct").checked=false;});

/* ---------- Crea il tuo portafoglio: strumenti e pesi scelti a mano, poi lo stesso percorso di un Excel (prezzi di mercato → laboratorio) ---------- */
/* catalogo: [ticker, nome, ISIN, classe, scheda, filtro1, filtro2, forma]. Ogni ISIN verificato su OpenFIGI con i prezzi (tools/catalogo/verifica-etf.mjs e verifica-bond.mjs, 19/11/2026).
   Le azioni singole sono in js/data/azioni.json (802 titoli dei principali indici, verificati), caricate quando si apre il costruttore. */
const POPULAR=[["VWCE","Vanguard FTSE All-World (Acc)","IE00BK5BQT80","Azioni","ETF","Mondo","Generale","ETF"],["VWRL","Vanguard FTSE All-World (Dist)","IE00B3RBWM25","Azioni","ETF","Mondo","Generale","ETF"],["SWDA","iShares Core MSCI World (Acc)","IE00B4L5Y983","Azioni","ETF","Mondo","Generale","ETF"],["XDWD","Xtrackers MSCI World 1C","IE00BJ0KDQ92","Azioni","ETF","Mondo","Generale","ETF"],["SSAC","iShares MSCI ACWI (Acc)","IE00B6R52259","Azioni","ETF","Mondo","Generale","ETF"],["SPYI","SPDR MSCI ACWI IMI (Acc)","IE00B3YLTY66","Azioni","ETF","Mondo","Generale","ETF"],["IUSN","iShares MSCI World Small Cap","IE00BF4RFH31","Azioni","ETF","Mondo","Piccole aziende","ETF"],["IWQU","iShares MSCI World Quality Factor","IE00BP3QZ601","Azioni","ETF","Mondo","Fattori","ETF"],["IWMO","iShares MSCI World Momentum Factor","IE00BP3QZ825","Azioni","ETF","Mondo","Fattori","ETF"],["IWVL","iShares MSCI World Value Factor","IE00BP3QZB59","Azioni","ETF","Mondo","Fattori","ETF"],["MVOL","iShares MSCI World Min Volatility","IE00B8FHGS14","Azioni","ETF","Mondo","Fattori","ETF"],["VHYL","Vanguard FTSE All-World High Dividend Yield","IE00B8GKDB10","Azioni","ETF","Mondo","Dividendi","ETF"],["TDIV","VanEck Morningstar Developed Markets Dividend Leaders","NL0011683594","Azioni","ETF","Mondo","Dividendi","ETF"],["ISPA","iShares STOXX Global Select Dividend 100","DE000A0F5UH1","Azioni","ETF","Mondo","Dividendi","ETF"],["SUSW","iShares MSCI World SRI (Acc)","IE00BYX2JD69","Azioni","ETF","Mondo","Sostenibili (ESG)","ETF"],["WSRI","Amundi MSCI World SRI Climate Paris Aligned","IE000Y77LGG9","Azioni","ETF","Mondo","Sostenibili (ESG)","ETF"],["XDWT","Xtrackers MSCI World Information Technology","IE00BM67HT60","Azioni","ETF","Mondo","Tecnologia","ETF"],["XDWH","Xtrackers MSCI World Health Care","IE00BM67HK77","Azioni","ETF","Mondo","Salute","ETF"],["XDWF","Xtrackers MSCI World Financials","IE00BM67HL84","Azioni","ETF","Mondo","Finanza","ETF"],["XDW0","Xtrackers MSCI World Energy","IE00BM67HM91","Azioni","ETF","Mondo","Energia","ETF"],["XDWC","Xtrackers MSCI World Consumer Discretionary","IE00BM67HP23","Azioni","ETF","Mondo","Consumi","ETF"],["XDWS","Xtrackers MSCI World Consumer Staples","IE00BM67HN09","Azioni","ETF","Mondo","Beni di prima necessità","ETF"],["XDWI","Xtrackers MSCI World Industrials","IE00BM67HV82","Azioni","ETF","Mondo","Industria","ETF"],["XDWM","Xtrackers MSCI World Materials","IE00BM67HS53","Azioni","ETF","Mondo","Materiali","ETF"],["XDWU","Xtrackers MSCI World Utilities","IE00BM67HQ30","Azioni","ETF","Mondo","Servizi pubblici","ETF"],["XWTS","Xtrackers MSCI World Communication Services","IE00BM67HR47","Azioni","ETF","Mondo","Telecomunicazioni","ETF"],["IWDP","iShares Developed Markets Property Yield","IE00B1FZS350","Azioni","ETF","Mondo","Immobiliare","ETF"],["SMH","VanEck Semiconductor","IE00BMC38736","Azioni","ETF","Mondo","Semiconduttori","ETF"],["XAIX","Xtrackers Artificial Intelligence & Big Data","IE00BGV5VN51","Azioni","ETF","Mondo","Intelligenza artificiale","ETF"],["WTAI","WisdomTree Artificial Intelligence","IE00BDVPNG13","Azioni","ETF","Mondo","Intelligenza artificiale","ETF"],["RBOT","iShares Automation & Robotics","IE00BYZK4552","Azioni","ETF","Mondo","Robotica","ETF"],["ISPY","L&G Cyber Security","IE00BYPLS672","Azioni","ETF","Mondo","Sicurezza informatica","ETF"],["ECAR","iShares Electric Vehicles and Driving Technology","IE00BGL86Z12","Azioni","ETF","Mondo","Auto elettriche","ETF"],["DFNS","VanEck Defense","IE000YYE6WK5","Azioni","ETF","Mondo","Difesa","ETF"],["IQQH","iShares Global Clean Energy","IE00B1XNHC34","Azioni","ETF","Mondo","Energia pulita","ETF"],["IH2O","iShares Global Water","IE00B1TXK627","Azioni","ETF","Mondo","Acqua","ETF"],["HEAL","iShares Healthcare Innovation","IE00BYZK4776","Azioni","ETF","Mondo","Salute","ETF"],["CSSPX","iShares Core S&P 500 (Acc)","IE00B5BMR087","Azioni","ETF","USA","Generale","ETF"],["VUAA","Vanguard S&P 500 (Acc)","IE00BFMXXD54","Azioni","ETF","USA","Generale","ETF"],["VUSA","Vanguard S&P 500 (Dist)","IE00B3XXRP09","Azioni","ETF","USA","Generale","ETF"],["SPXS","Invesco S&P 500 (Acc)","IE00B3YCGJ38","Azioni","ETF","USA","Generale","ETF"],["CSNDX","iShares Nasdaq 100 (Acc)","IE00B53SZB19","Azioni","ETF","USA","Tecnologia","ETF"],["EQQQ","Invesco EQQQ Nasdaq-100 (Dist)","IE0032077012","Azioni","ETF","USA","Tecnologia","ETF"],["XDEW","Xtrackers S&P 500 Equal Weight","IE00BLNMYC90","Azioni","ETF","USA","Generale","ETF"],["ZPRV","SPDR MSCI USA Small Cap Value Weighted","IE00BSPLC413","Azioni","ETF","USA","Piccole aziende","ETF"],["IUIT","iShares S&P 500 Information Technology Sector","IE00B3WJKG14","Azioni","ETF","USA","Tecnologia","ETF"],["IUHC","iShares S&P 500 Health Care Sector","IE00B43HR379","Azioni","ETF","USA","Salute","ETF"],["IUFS","iShares S&P 500 Financials Sector","IE00B4JNQZ49","Azioni","ETF","USA","Finanza","ETF"],["IUES","iShares S&P 500 Energy Sector","IE00B42NKQ00","Azioni","ETF","USA","Energia","ETF"],["IUCD","iShares S&P 500 Consumer Discretionary Sector","IE00B4MCHD36","Azioni","ETF","USA","Consumi","ETF"],["IUCS","iShares S&P 500 Consumer Staples Sector","IE00B40B8R38","Azioni","ETF","USA","Beni di prima necessità","ETF"],["IUIS","iShares S&P 500 Industrials Sector","IE00B4LN9N13","Azioni","ETF","USA","Industria","ETF"],["IUMS","iShares S&P 500 Materials Sector","IE00B4MKCJ84","Azioni","ETF","USA","Materiali","ETF"],["IUUS","iShares S&P 500 Utilities Sector","IE00B4KBBD01","Azioni","ETF","USA","Servizi pubblici","ETF"],["MEUD","Amundi Core Stoxx Europe 600 (Acc)","LU0908500753","Azioni","ETF","Europa","Generale","ETF"],["IMEU","iShares Core MSCI Europe (Acc)","IE00B4K48X80","Azioni","ETF","Europa","Generale","ETF"],["VEUR","Vanguard FTSE Developed Europe (Dist)","IE00B945VV12","Azioni","ETF","Europa","Generale","ETF"],["CSX5","iShares Core Euro Stoxx 50 (Acc)","IE00B53L3W79","Azioni","ETF","Europa","Generale","ETF"],["EXS1","iShares Core DAX","DE0005933931","Azioni","ETF","Europa","Generale","ETF"],["IDVY","iShares Euro Dividend","IE00B0M62S72","Azioni","ETF","Europa","Dividendi","ETF"],["ZPRX","SPDR MSCI Europe Small Cap Value Weighted","IE00BSPLC298","Azioni","ETF","Europa","Piccole aziende","ETF"],["EXV3","iShares STOXX Europe 600 Technology","DE000A0H08Q4","Azioni","ETF","Europa","Tecnologia","ETF"],["EXV4","iShares STOXX Europe 600 Health Care","DE000A0Q4R36","Azioni","ETF","Europa","Salute","ETF"],["EXV1","iShares STOXX Europe 600 Banks","DE000A0F5UJ7","Azioni","ETF","Europa","Finanza","ETF"],["SXEPEX","iShares STOXX Europe 600 Oil & Gas","DE000A0H08M3","Azioni","ETF","Europa","Energia","ETF"],["IPRP","iShares European Property Yield","IE00B0M63284","Azioni","ETF","Europa","Immobiliare","ETF"],["ETFMIB","Amundi FTSE MIB (Dist)","FR0010010827","Azioni","ETF","Italia","Generale","ETF"],["CSMIB","iShares FTSE MIB (Acc)","IE00B53L4X51","Azioni","ETF","Italia","Generale","ETF"],["EIMI","iShares Core MSCI EM IMI (Acc)","IE00BKM4GZ66","Azioni","ETF","Emergenti","Generale","ETF"],["VFEM","Vanguard FTSE Emerging Markets (Dist)","IE00B3VVMM84","Azioni","ETF","Emergenti","Generale","ETF"],["XMME","Xtrackers MSCI Emerging Markets 1C","IE00BTJRMP35","Azioni","ETF","Emergenti","Generale","ETF"],["NDIA","iShares MSCI India (Acc)","IE00BZCQB185","Azioni","ETF","Emergenti","Generale","ETF"],["ICGA","iShares MSCI China A (Acc)","IE00BQT3WG13","Azioni","ETF","Emergenti","Generale","ETF"],["SJPA","iShares Core MSCI Japan IMI (Acc)","IE00B4L5YX21","Azioni","ETF","Asia e Pacifico","Generale","ETF"],["CPXJ","iShares Core MSCI Pacific ex-Japan (Acc)","IE00B52MJY50","Azioni","ETF","Asia e Pacifico","Generale","ETF"],["IBGS","iShares € Govt Bond 1-3yr","IE00B14X4Q57","Obbligazioni","Obbligazioni","Stati","Breve (fino a 3 anni)","ETF"],["IBGM","iShares € Govt Bond 3-7yr","IE00B3VTML14","Obbligazioni","Obbligazioni","Stati","Media (3-10 anni)","ETF"],["IBGX","iShares € Govt Bond 7-10yr","IE00B3VTN290","Obbligazioni","Obbligazioni","Stati","Media (3-10 anni)","ETF"],["IBGL","iShares € Govt Bond 15-30yr","IE00B1FZS913","Obbligazioni","Obbligazioni","Stati","Lunga (oltre 10 anni)","ETF"],["IEGA","iShares Core € Govt Bond","IE00B4WXJJ64","Obbligazioni","Obbligazioni","Stati","Tutte le scadenze","ETF"],["XGLE","Xtrackers Eurozone Government Bond","LU0290355717","Obbligazioni","Obbligazioni","Stati","Tutte le scadenze","ETF"],["IITB","iShares Italy Govt Bond (BTP)","IE00B7LW6Y90","Obbligazioni","Obbligazioni","Stati","Tutte le scadenze","ETF"],["IBCI","iShares € Inflation Linked Govt Bond","IE00B0M62X26","Obbligazioni","Obbligazioni","Stati","Legate all'inflazione","ETF"],["IBTS","iShares $ Treasury Bond 1-3yr","IE00B14X4S71","Obbligazioni","Obbligazioni","Stati","Breve (fino a 3 anni)","ETF"],["IBTM","iShares $ Treasury Bond 7-10yr","IE00B1FZS798","Obbligazioni","Obbligazioni","Stati","Media (3-10 anni)","ETF"],["DTLA","iShares $ Treasury Bond 20+yr","IE00BSKRJZ44","Obbligazioni","Obbligazioni","Stati","Lunga (oltre 10 anni)","ETF"],["IGLO","iShares Global Govt Bond","IE00B3F81K65","Obbligazioni","Obbligazioni","Stati","Tutte le scadenze","ETF"],["IEMB","iShares J.P. Morgan $ Emerging Markets Bond","IE00B2NPKV68","Obbligazioni","Obbligazioni","Stati","Tutte le scadenze","ETF"],["EMBE","iShares J.P. Morgan $ EM Bond EUR Hedged","IE00B9M6RS56","Obbligazioni","Obbligazioni","Stati","Tutte le scadenze","ETF"],["IE15","iShares € Corp Bond 1-5yr","IE00B4L60045","Obbligazioni","Obbligazioni","Aziende","Breve (fino a 3 anni)","ETF"],["IEAC","iShares Core € Corp Bond","IE00B3F81R35","Obbligazioni","Obbligazioni","Aziende","Tutte le scadenze","ETF"],["IHYG","iShares € High Yield Corp Bond","IE00B66F4759","Obbligazioni","Obbligazioni","Aziende","Tutte le scadenze","ETF"],["LQDE","iShares $ Corp Bond","IE0032895942","Obbligazioni","Obbligazioni","Aziende","Tutte le scadenze","ETF"],["IHYU","iShares $ High Yield Corp Bond","IE00B4PY7Y77","Obbligazioni","Obbligazioni","Aziende","Tutte le scadenze","ETF"],["AGGH","iShares Core Global Aggregate Bond EUR Hedged","IE00BDBRDM35","Obbligazioni","Obbligazioni","Misti","Tutte le scadenze","ETF"],["VAGF","Vanguard Global Aggregate Bond EUR Hedged (Acc)","IE00BG47KH54","Obbligazioni","Obbligazioni","Misti","Tutte le scadenze","ETF"],["IEAG","iShares € Aggregate Bond ESG","IE00B3DKXQ41","Obbligazioni","Obbligazioni","Misti","Tutte le scadenze","ETF"],["XGL1","Xtrackers Eurozone Government Bond 1-3","LU0290356871","Obbligazioni","Obbligazioni","Stati","Breve (fino a 3 anni)","ETF"],["XGL3","Xtrackers Eurozone Government Bond 3-5","LU0290356954","Obbligazioni","Obbligazioni","Stati","Media (3-10 anni)","ETF"],["XGL5","Xtrackers Eurozone Government Bond 5-7","LU0290357176","Obbligazioni","Obbligazioni","Stati","Media (3-10 anni)","ETF"],["XGL7","Xtrackers Eurozone Government Bond 7-10","LU0290357259","Obbligazioni","Obbligazioni","Stati","Media (3-10 anni)","ETF"],["XG15","Xtrackers Eurozone Government Bond 15-30","LU0290357846","Obbligazioni","Obbligazioni","Stati","Lunga (oltre 10 anni)","ETF"],["XG25","Xtrackers Eurozone Government Bond 25+","LU0290357929","Obbligazioni","Obbligazioni","Stati","Lunga (oltre 10 anni)","ETF"],["XEIN","Xtrackers Eurozone Inflation-Linked Bond","LU0290358224","Obbligazioni","Obbligazioni","Stati","Legate all'inflazione","ETF"],["EM13","Amundi Euro Government Bond 1-3Y","LU1650487413","Obbligazioni","Obbligazioni","Stati","Breve (fino a 3 anni)","ETF"],["EM35","Amundi Euro Government Bond 3-5Y","LU1650488494","Obbligazioni","Obbligazioni","Stati","Media (3-10 anni)","ETF"],["EM710","Amundi Euro Government Bond 7-10Y","LU1287023185","Obbligazioni","Obbligazioni","Stati","Media (3-10 anni)","ETF"],["EM1015","Amundi Euro Government Bond 10-15Y","LU1287023268","Obbligazioni","Obbligazioni","Stati","Lunga (oltre 10 anni)","ETF"],["EM15","Amundi Euro Government Bond 15+Y","LU1287023342","Obbligazioni","Obbligazioni","Stati","Lunga (oltre 10 anni)","ETF"],["VETY","Vanguard EUR Eurozone Government Bond (Dist)","IE00BZ163H91","Obbligazioni","Obbligazioni","Stati","Tutte le scadenze","ETF"],["SYBB","SPDR Bloomberg Euro Government Bond","IE00B3S5XW04","Obbligazioni","Obbligazioni","Stati","Tutte le scadenze","ETF"],["XGER","Xtrackers II Germany Government Bond","LU0468896575","Obbligazioni","Obbligazioni","Stati","Tutte le scadenze","ETF"],["XFRA","Xtrackers II France Government Bond","LU0643975591","Obbligazioni","Obbligazioni","Stati","Tutte le scadenze","ETF"],["XSPA","Xtrackers II Spain Government Bond","LU0925589839","Obbligazioni","Obbligazioni","Stati","Tutte le scadenze","ETF"],["CBU7","iShares $ Treasury Bond 3-7yr","IE00B3VWN393","Obbligazioni","Obbligazioni","Stati","Media (3-10 anni)","ETF"],["IDTL","iShares $ Treasury Bond 20+yr EUR Hedged","IE00BD8PGZ49","Obbligazioni","Obbligazioni","Stati","Lunga (oltre 10 anni)","ETF"],["ITPS","iShares $ TIPS","IE00B1FZSC47","Obbligazioni","Obbligazioni","Stati","Legate all'inflazione","ETF"],["XUTD","Xtrackers US Treasuries","LU0429459356","Obbligazioni","Obbligazioni","Stati","Tutte le scadenze","ETF"],["VDTY","Vanguard USD Treasury Bond","IE00BZ163M45","Obbligazioni","Obbligazioni","Stati","Tutte le scadenze","ETF"],["XG7S","Xtrackers Global Government Bond EUR Hedged","LU0378818131","Obbligazioni","Obbligazioni","Stati","Tutte le scadenze","ETF"],["SEML","iShares J.P. Morgan EM Local Govt Bond","IE00B5M4WH52","Obbligazioni","Obbligazioni","Stati","Tutte le scadenze","ETF"],["XEMB","Xtrackers USD Emerging Markets Bond","IE00BD4DXB77","Obbligazioni","Obbligazioni","Stati","Tutte le scadenze","ETF"],["XBLC","Xtrackers EUR Corporate Bond","LU0478205379","Obbligazioni","Obbligazioni","Aziende","Tutte le scadenze","ETF"],["SYBC","SPDR Bloomberg Euro Corporate Bond","IE00B3T9LM79","Obbligazioni","Obbligazioni","Aziende","Tutte le scadenze","ETF"],["VECP","Vanguard EUR Corporate Bond","IE00BZ163G84","Obbligazioni","Obbligazioni","Aziende","Tutte le scadenze","ETF"],["SE15","SPDR Bloomberg 0-3 Year Euro Corporate Bond","IE00BC7GZW19","Obbligazioni","Obbligazioni","Aziende","Breve (fino a 3 anni)","ETF"],["VUCP","Vanguard USD Corporate Bond","IE00BZ163K21","Obbligazioni","Obbligazioni","Aziende","Tutte le scadenze","ETF"],["XHYE","Xtrackers EUR High Yield Corporate Bond","LU1109943388","Obbligazioni","Obbligazioni","Aziende","Tutte le scadenze","ETF"],["JNKE","SPDR Bloomberg Euro High Yield Bond","IE00B6YX5M31","Obbligazioni","Obbligazioni","Aziende","Tutte le scadenze","ETF"],["HYLD","iShares Global High Yield Corp Bond","IE00B74DQ490","Obbligazioni","Obbligazioni","Aziende","Tutte le scadenze","ETF"],["IEMS","iShares $ Emerging Markets Corp Bond","IE00B6TLBW47","Obbligazioni","Obbligazioni","Aziende","Tutte le scadenze","ETF"],["CORP","iShares Global Corp Bond","IE00B7J7TB45","Obbligazioni","Obbligazioni","Aziende","Tutte le scadenze","ETF"],["GRON","iShares € Green Bond","IE00BMDBMN04","Obbligazioni","Obbligazioni","Misti","Tutte le scadenze","ETF"],["VGEA","Vanguard EUR Eurozone Government Bond (Acc)","IE00BH04GL39","Obbligazioni","Obbligazioni","Stati","Tutte le scadenze","ETF"],["XEON","Xtrackers EUR Overnight Rate Swap","LU0290358497","Liquidità","Liquidità","Euro","Monetari","ETF"],["CSH2","Amundi Smart Overnight Return","LU1190417599","Liquidità","Liquidità","Euro","Monetari","ETF"],["ERNE","iShares € Ultrashort Bond","IE00BCRY6557","Liquidità","Liquidità","Euro","Brevissimo termine","ETF"],["IB01","iShares $ Treasury Bond 0-1yr","IE00BGSF1X88","Liquidità","Liquidità","Dollaro","Brevissimo termine","ETF"],["SGLN","iShares Physical Gold","IE00B4ND3602","Oro","Oro e materie prime","Oro","Fisico","ETC"],["4GLD","Xetra-Gold","DE000A0S9GB0","Oro","Oro e materie prime","Oro","Fisico","ETC"],["PHAU","WisdomTree Physical Gold","JE00B1VS3770","Oro","Oro e materie prime","Oro","Fisico","ETC"],["SGLD","Invesco Physical Gold","IE00B579F325","Oro","Oro e materie prime","Oro","Fisico","ETC"],["PHAG","WisdomTree Physical Silver","JE00B1VS3333","Oro","Oro e materie prime","Argento","Fisico","ETC"],["CMOD","Invesco Bloomberg Commodity","IE00BD6FTQ80","Altro","Oro e materie prime","Materie prime","Paniere","ETF"],["BTC","Bitcoin",null,"Altro","Cripto","Monete","Principali","Moneta"],["ETH","Ethereum",null,"Altro","Cripto","Monete","Principali","Moneta"],["SOL","Solana",null,"Altro","Cripto","Monete","Altre","Moneta"],["XRP","XRP",null,"Altro","Cripto","Monete","Altre","Moneta"],["ADA","Cardano",null,"Altro","Cripto","Monete","Altre","Moneta"],["DOGE","Dogecoin",null,"Altro","Cripto","Monete","Altre","Moneta"],["LINK","Chainlink",null,"Altro","Cripto","Monete","Altre","Moneta"],["AVAX","Avalanche",null,"Altro","Cripto","Monete","Altre","Moneta"],["DOT","Polkadot",null,"Altro","Cripto","Monete","Altre","Moneta"],["LTC","Litecoin",null,"Altro","Cripto","Monete","Altre","Moneta"],["UNI","Uniswap",null,"Altro","Cripto","Monete","Altre","Moneta"],["XLM","Stellar",null,"Altro","Cripto","Monete","Altre","Moneta"],["BTCE","BTCetc Bitcoin fisico","DE000A27Z304","Altro","Cripto","ETP in borsa","Bitcoin","ETN"],["VBTC","VanEck Bitcoin ETN","DE000A28M8D0","Altro","Cripto","ETP in borsa","Bitcoin","ETN"],["ENI","Eni","IT0003132476","Azioni","Azioni",null,null,"Azione"],["ENEL","Enel","IT0003128367","Azioni","Azioni",null,null,"Azione"],["ISP","Intesa Sanpaolo","IT0000072618","Azioni","Azioni",null,null,"Azione"],["UCG","UniCredit","IT0005239360","Azioni","Azioni",null,null,"Azione"],["STLAM","Stellantis","NL00150001Q9","Azioni","Azioni",null,null,"Azione"],["RACE","Ferrari","NL0011585146","Azioni","Azioni",null,null,"Azione"],["G","Generali","IT0000062072","Azioni","Azioni",null,null,"Azione"],["STMMI","STMicroelectronics","NL0000226223","Azioni","Azioni",null,null,"Azione"],["PST","Poste Italiane","IT0003796171","Azioni","Azioni",null,null,"Azione"],["LDO","Leonardo","IT0003856405","Azioni","Azioni",null,null,"Azione"],["MB","Mediobanca","IT0000062957","Azioni","Azioni",null,null,"Azione"],["BMED","Banca Mediolanum","IT0004776628","Azioni","Azioni",null,null,"Azione"],["SRG","Snam","IT0003153415","Azioni","Azioni",null,null,"Azione"],["TRN","Terna","IT0003242622","Azioni","Azioni",null,null,"Azione"],["MONC","Moncler","IT0004965148","Azioni","Azioni",null,null,"Azione"],["PRY","Prysmian","IT0004176001","Azioni","Azioni",null,null,"Azione"],["BAMI","Banco BPM","IT0005218380","Azioni","Azioni",null,null,"Azione"],["A2A","A2A","IT0001233417","Azioni","Azioni",null,null,"Azione"],["CPR","Campari","NL0015435975","Azioni","Azioni",null,null,"Azione"],["AAPL","Apple","US0378331005","Azioni","Azioni",null,null,"Azione"],["MSFT","Microsoft","US5949181045","Azioni","Azioni",null,null,"Azione"],["NVDA","Nvidia","US67066G1040","Azioni","Azioni",null,null,"Azione"],["AMZN","Amazon","US0231351067","Azioni","Azioni",null,null,"Azione"],["GOOGL","Alphabet (A)","US02079K3059","Azioni","Azioni",null,null,"Azione"],["META","Meta Platforms","US30303M1027","Azioni","Azioni",null,null,"Azione"],["TSLA","Tesla","US88160R1014","Azioni","Azioni",null,null,"Azione"],["BRK.B","Berkshire Hathaway (B)","US0846707026","Azioni","Azioni",null,null,"Azione"],["JPM","JPMorgan Chase","US46625H1005","Azioni","Azioni",null,null,"Azione"],["V","Visa","US92826C8394","Azioni","Azioni",null,null,"Azione"],["KO","Coca-Cola","US1912161007","Azioni","Azioni",null,null,"Azione"],["JNJ","Johnson & Johnson","US4781601046","Azioni","Azioni",null,null,"Azione"],["ASML","ASML Holding","NL0010273215","Azioni","Azioni",null,null,"Azione"],["MC","LVMH","FR0000121014","Azioni","Azioni",null,null,"Azione"],["SAP","SAP","DE0007164600","Azioni","Azioni",null,null,"Azione"],["NESN","Nestlé","CH0038863350","Azioni","Azioni",null,null,"Azione"],["NOVO","Novo Nordisk (B)","DK0062498333","Azioni","Azioni",null,null,"Azione"],["TTE","TotalEnergies","FR0000120271","Azioni","Azioni",null,null,"Azione"],["SIE","Siemens","DE0007236101","Azioni","Azioni",null,null,"Azione"],["ALV","Allianz","DE0008404005","Azioni","Azioni",null,null,"Azione"]];
const PRESETS=[["Azionario mondo",[["VWCE",100]]],["60/40",[["SWDA",60],["AGGH",40]]],["Core e satelliti",[["SWDA",70],["EIMI",10],["IUSN",10],["CSNDX",10]]],["Prudente",[["SWDA",30],["IEAG",40],["IBGS",15],["SGLN",15]]],
  ["Tre ETF",[["SWDA",60],["EIMI",10],["AGGH",30]]],["Permanente",[["SWDA",25],["IEGA",25],["XEON",25],["SGLD",25]]],["All Weather",[["SWDA",30],["DTLA",40],["IBTM",15],["SGLD",7.5],["CMOD",7.5]]],
  ["Golden Butterfly",[["SWDA",20],["ZPRV",20],["DTLA",20],["IBTS",20],["SGLD",20]]],["Dividendi",[["VHYL",60],["TDIV",40]]]];
const PRESET_TXT=["Un solo ETF su tutto il mondo, mercati sviluppati ed emergenti. Semplice e molto diversificato.","Il classico bilanciato: 60% azioni mondiali, 40% obbligazioni globali coperte dal cambio.","Base sul mondo sviluppato, più emergenti, piccole aziende e tecnologia USA.","Più obbligazioni e oro, meno azioni: oscillazioni più contenute.",
  "Ispirato al portafoglio a tre fondi di Bogle: azioni sviluppate, emergenti e obbligazioni globali.","Ispirato al Portafoglio Permanente di Harry Browne: azioni, titoli di Stato, liquidità e oro in parti uguali.","Ispirato all'All Weather di Ray Dalio: tante obbligazioni a lungo termine, poche azioni, oro e materie prime.","Ispirato al Golden Butterfly: cinque parti uguali tra azioni, piccole aziende value, Treasury lunghi e brevi, oro.","Azioni che pagano dividendi alti e stabili, in tutto il mondo."];
const CLS_COL={"Azioni":"var(--fg)","Obbligazioni":"var(--c2)","Liquidità":"var(--faint)","Oro":"var(--c5)","Altro":"var(--line-2)"};
const bdCls=v=>{const f=bdFind(v);return f&&f[3]?f[3]:"Altro";};
const BD={ports:[[["SWDA",80],["EIMI",20]]],cur:0};
Object.defineProperty(BD,"rows",{get(){return this.ports[this.cur];},set(v){this.ports[this.cur]=v;}});
/* strumenti scelti dalla ricerca su tutte le borse (Yahoo Finance): simbolo nel formato del sito → nome, borsa, tipo */
const BDMETA=new Map();
const metaCls=m=>m.tipo==="Cripto"?"Altro":m.tipo==="Azione"?"Azioni":/bond|obblig|govt|treasury|aggregate|corporate|€ gov|income/i.test(m.nome)?"Obbligazioni":/gold|\boro\b|silver|commodit|precious/i.test(m.nome)?"Oro":/overnight|money market|monetar|liquidit|cash|ultrashort/i.test(m.nome)?"Liquidità":"Azioni";
function bdFind(v){const t=String(v||"").trim().toUpperCase(),isin=(t.match(/[A-Z]{2}[A-Z0-9]{9}\d/)||[])[0],tk=t.split(/[\s·]+/)[0];
  const m=BDMETA.get(tk);if(m&&m.btp)return [m.sym,m.nome,m.isin,"Obbligazioni",m];if(m)return [tk,m.nome,null,metaCls(m),m];
  return POPULAR.find(p=>p[2]===isin||p[0]===tk)||(isin?[null,null,isin]:tk?[tk,null,null]:null);}
/* verifica mentre si scrive: ISIN → quotazioni su OpenFIGI; ticker → si prova a scaricarne i prezzi. Risultato in memoria per la sessione. */
const BDCHK=new Map();
function bdState(v){const f=bdFind(v);if(!v||!String(v).trim())return "";if(f&&f[1])return "ok";const c=BDCHK.get(String(v).trim().toUpperCase());return c?c.st:"";}
function bdHint(v){const t=String(v||"").trim();if(!t)return "";const f=bdFind(t);if(f&&f[1])return esc(f[1])+" · "+esc(f[4]?[f[4].tipo,f[4].borsa,f[4].btp?null:f[0]].filter(Boolean).join(" · "):f[2]);
  const c=BDCHK.get(t.toUpperCase());if(!c){bdCheck(t);return "verifico…";}
  return c.st==="wait"?"verifico…":c.st==="ok"?"✓ "+esc(c.name||c.sym):c.why?"✗ "+esc(c.why):"✗ non trovato: prova con l'ISIN (lo trovi su justETF o sul sito dell'emittente)";}
async function bdCheck(v){const k=String(v).trim().toUpperCase();if(BDCHK.has(k))return;BDCHK.set(k,{st:"wait"});
  try{const isin=(k.match(/^[A-Z]{2}[A-Z0-9]{9}\d$/)||[])[0];
    if(isin){const j=await getJSON(`/api/isin?isin=${isin}`),r=(j.results||[])[0];
      if(r&&!r.simbolo&&r.stato){const st=r.stato,sym=st.tipo==="fisso"?btpSym(st.cedola,st.scadenza):null;
        if(sym){BDMETA.set(k,{nome:st.nome,tipo:"BTP",borsa:"prezzo stimato (Banca d'Italia)",btp:true,sym,isin});BDCHK.set(k,{st:"ok",name:st.nome,sym});}
        else BDCHK.set(k,{st:"no",why:st.tipo==="fisso"?`${st.nome}: già scaduto`:st.tipo==="estero"?`${st.nome}: titolo di Stato estero, nessuna fonte gratuita dei prezzi`:`${st.nome}: le cedole cambiano nel tempo, il prezzo non si può stimare`});}
      else BDCHK.set(k,r&&r.simbolo?{st:"ok",name:r.nome||r.simbolo,sym:r.simbolo}:{st:"no"});}
    else{const sym=guessSymbol(k,"ETF",null)||k,j=await getJSON(`/api/prices?symbol=${encodeURIComponent(sym)}&v=4`);BDCHK.set(k,j&&!j.error&&j.points&&j.points.length?{st:"ok",name:(j.info||"").split(" · ")[0]||sym,sym}:{st:"no"});}
  }catch{BDCHK.set(k,{st:"no"});}
  if($("#builder").classList.contains("open"))bdRender();}
function bdRender(){
  const L="ABC";
  $("#bdTabs").innerHTML=BD.ports.map((p,i)=>`<button type="button" class="chipbtn${i===BD.cur?" on":""}" role="tab" aria-selected="${i===BD.cur}" data-bdt="${i}">Portafoglio ${L[i]}</button>`).join("")+(BD.ports.length<3?`<button type="button" class="chipbtn ghost" data-bdt="new">+ Confronta con ${L[BD.ports.length]}</button>`:"")+(BD.ports.length>1?`<button type="button" class="chipbtn ghost" data-bdt="del">Togli ${L[BD.cur]}</button>`:"");
  $("#bdPresets").innerHTML=PRESETS.map((p,i)=>{if(!BDCAT.allModels&&i>=3)return "";const tot=p[1].reduce((a,x)=>a+x[1],0),by={};p[1].forEach(x=>{const c=bdCls(x[0]);by[c]=(by[c]||0)+x[1];});
    return `<button type="button" class="bd-model" data-bdp="${i}"><b>${esc(p[0])}</b><span class="bd-mbar">${Object.entries(by).map(([c,w])=>`<i style="width:${w/tot*100}%;background:${CLS_COL[c]}"></i>`).join("")}</span><small>${esc(PRESET_TXT[i]||"")}</small><em>${p[1].map(x=>`${esc(x[0])} ${x[1]}%`).join(" · ")}</em></button>`;}).join("")+`<button type="button" class="btn sm bd-more" data-bdmore="1">${BDCAT.allModels?"Mostra meno modelli":`Altri ${PRESETS.length-3} modelli: tre ETF, permanente, All Weather…`}</button>`;
  $("#bdList").innerHTML=POPULAR.map(p=>`<option value="${p[0]} · ${esc(p[1])}">`).join("");
  $("#bdRows").innerHTML=BD.rows.map((r,i)=>{const c=r[0]?bdCls(r[0]):"";return `<div class="bd-row"><div class="bd-in"><input list="bdList" data-bdi="${i}" value="${esc(r[0])}" placeholder="Ticker o ISIN" aria-label="Strumento ${i+1}" spellcheck="false"><small class="bd-hint ${bdState(r[0])}">${bdHint(r[0])}</small></div>
    <span class="bd-cls">${c?`<i style="background:${CLS_COL[c]}"></i>${c==="Altro"?"—":c}`:""}</span>
    <label class="bd-w"><input type="number" min="0" max="100" step="1" data-bdw="${i}" value="${r[1]}" aria-label="Peso dello strumento ${i+1} in percentuale" inputmode="decimal"><span>%</span></label><button type="button" class="btn sm bd-del" data-bdd="${i}" aria-label="Togli lo strumento ${i+1}">×</button></div>`;}).join("");
  const have=new Set(BD.rows.map(r=>(bdFind(r[0])||[])[0]).filter(Boolean));
  bdCatRender();
  /* riepilogo */
  const s=BD.rows.reduce((a,r)=>a+(+r[1]||0),0),val=BD.rows.filter(r=>String(r[0]).trim()&&+r[1]>0),ok=val.length,cap=Math.max(0,parseFloat($("#bdCap").value)||0);
  const by={};val.forEach(r=>{const c=bdCls(r[0]);by[c]=(by[c]||0)+(+r[1]);});
  $("#bdWhich").textContent=BD.ports.length>1?"· portafoglio "+L[BD.cur]:"";
  $("#bdClassBar").innerHTML=s>0?Object.entries(by).map(([c,w])=>`<i style="width:${w/s*100}%;background:${CLS_COL[c]}" title="${c} ${fmtN(w/s*100,0)}%"></i>`).join(""):"";
  $("#bdClassLeg").innerHTML=Object.entries(by).map(([c,w])=>`<span><i style="background:${CLS_COL[c]}"></i>${c==="Altro"?"Altro / da verificare":c} <b>${fmtN(w/s*100,0)}%</b></span>`).join("");
  $("#bdComp").innerHTML=val.length?val.map(r=>{const f=bdFind(r[0])||[r[0]],w=(+r[1])/(s||1);return `<div class="bd-ci2"><span><b>${esc(f[4]&&f[4].btp?btpEtichetta(f[4].sym):f[0]||f[2]||r[0])}</b><small>${esc(f[4]&&f[4].btp?(f[4].isin||"")+" · prezzo stimato":f[1]||"")}</small></span><span class="bd-pw"><i style="width:${w*100}%"></i></span><span class="bd-num">${fmtN(w*100,1)}%<small>${fmtN(cap*w,0)} €</small></span></div>`;}).join(""):`<p class="caption">Ancora nessuno strumento.</p>`;
  const verified=val.filter(r=>bdState(r[0])==="ok").length,bad=val.filter(r=>bdState(r[0])==="no").length,nc=Object.keys(by).length;
  const checks=[[Math.abs(s-100)<.01,Math.abs(s-100)<.01?"I pesi sommano a 100%":`I pesi sommano a ${fmtN(s,0)}%: li riporto a 100% in proporzione`],
    [ok>0&&verified===ok,bad?`${bad} ${bad>1?"strumenti non trovati":"strumento non trovato"}: prova con l'ISIN`:ok&&verified===ok?`${ok} ${ok>1?"strumenti riconosciuti":"strumento riconosciuto"}`:"Verifico gli strumenti…"],
    [ok>1,ok===1?"Un solo strumento: la diversificazione dipende tutta da lui":`${ok} strumenti, ${nc} ${nc>1?"classi":"classe"} di attivo`]];
  $("#bdChecks").innerHTML=ok?checks.map(([g,t])=>`<li class="${g?"ok":"warn"}">${t}</li>`).join(""):"";
  $("#bdSum").innerHTML=`Totale <b class="${Math.abs(s-100)<.01?"up":"dn"}">${fmtN(s,0)}%</b>${Math.abs(s-100)>=.01?" · li riporto a 100%":""}`;
  $("#bdGo").disabled=!ok;
}
/* catalogo come in un broker: schede (Azioni, ETF, Obbligazioni…), filtri a tendina, numero di risultati, elenco che scorre.
   Le azioni (802) arrivano da js/data/azioni.json; il resto è POPULAR. La ricerca scrive in tutto il catalogo e poi «Da tutte le borse». */
const BD_TABS=["Azioni","ETF","Obbligazioni","Liquidità","Oro e materie prime","Cripto"];
const BD_FILT={Azioni:[["set","Settore"],["paese","Paese"]],ETF:[["f1","Area"],["f2","Tema"]],Obbligazioni:[["f1","Emittente"],["f2","Scadenza"],["area","Area"]],"Oro e materie prime":[["f1","Tipo"]],Cripto:[["f1","Tipo"]],Liquidità:[]};
const BDCAT={tab:"ETF",f:{},q:"",n:40,allModels:false};
const normQ=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
let AZIONI=null,azLoading=null;
/* BTP a tasso fisso in circolazione (elenco ufficiale del MEF, js/data/btp.json): prezzo stimato dalla curva della Banca d'Italia */
let BTPS=null,btpLoading=null,BTP_AL=null;
const BTP_FASCIA=a=>a<=3?"Breve (fino a 3 anni)":a<=10?"Media (3-10 anni)":"Lunga (oltre 10 anni)";
function btpLoad(){if(BTPS||btpLoading)return btpLoading;btpLoading=fetch("/js/data/btp.json").then(r=>r.json()).then(j=>{BTP_AL=j.al||null;const today=new Date().toISOString().slice(0,10);
  BTPS=(j.righe||[]).filter(x=>x[3]>today).map(([isin,g,em,sc,c])=>{const sym=btpSym(c,sc),nome=`${g} ${String(+(c*100).toFixed(3)).replace(".",",")}% ${sc.slice(8,10)}/${sc.slice(5,7)}/${sc.slice(0,4)}`;return {isin,g,em,sc,c,sym,nome,anni:(Date.parse(sc)-Date.now())/(365.25*864e5)};}).filter(b=>b.sym);
  if($("#builder").classList.contains("open"))bdCatRender();}).catch(()=>{BTPS=[];});return btpLoading;}
const btpItem=b=>({code:b.isin,n:b.nome,sub:`${b.isin} · ${b.anni<1?"meno di un anno":fmtN(b.anni,1)+" anni"} alla scadenza · prezzo stimato`,cls:"Obbligazioni",tab:"Obbligazioni",f1:"BTP singoli",f2:BTP_FASCIA(b.anni),area:"Italia",btp:b});
const btpMeta=b=>({nome:b.nome,tipo:"BTP",borsa:"prezzo stimato (Banca d'Italia)",btp:true,sym:b.sym,isin:b.isin});
/* un BTP che arriva da fuori (patrimonio): codice della riga = ISIN o simbolo della stima */
function bdBtpMeta(code,nome,sym,isin){BDMETA.set(String(code).toUpperCase(),{nome,tipo:"BTP",borsa:"prezzo stimato (Banca d'Italia)",btp:true,sym,isin:isin||null});}
const tabBase=tab=>tab==="Azioni"?(AZIONI||[]).map(azItem):[...POPULAR.filter(p=>p[4]===tab).map(etfItem),...(tab==="Obbligazioni"?(BTPS||[]).map(btpItem):[])];
function azLoad(){if(AZIONI||azLoading)return azLoading;azLoading=fetch("/js/data/azioni.json").then(r=>r.json()).then(a=>{AZIONI=a.map(x=>({s:x[0],n:x[1],set:x[2],paese:x[3],isin:x[4],idx:x[5]}));if($("#builder").classList.contains("open"))bdCatRender();}).catch(()=>{AZIONI=[];});return azLoading;}
/* un elemento uniforme per l'elenco: codice da mettere nella riga, nome, riga sotto, settore o classe per il colore */
/* area delle obbligazioni, dal nome: dove sono gli emittenti (e quindi la valuta) */
const bondArea=n=>/\bital/i.test(n)?"Italia":/german|rexx/i.test(n)?"Germania":/france/i.test(n)?"Francia":/spain/i.test(n)?"Spagna":/emerg|\bEM\b/i.test(n)?"Emergenti":/global|world/i.test(n)?"Mondo":/\$|\bUSD?\b|treasur|tips/i.test(n)?"USA":"Euro";
const etfItem=p=>({code:p[0],n:p[1],sub:[p[0],p[5],p[6],p[4]==="Obbligazioni"?bondArea(p[1]):null,p[2]].filter(Boolean).join(" · "),cls:p[3],tab:p[4],f1:p[5],f2:p[6],area:p[4]==="Obbligazioni"?bondArea(p[1]):null,pop:p});
const azItem=a=>({code:a.s,n:a.n,sub:[a.s.replace(/\.US$/,""),a.paese,a.set].join(" · "),cls:"Azioni",tab:"Azioni",set:a.set,paese:a.paese,az:a});
const SET_COL={"Tecnologia":"#2E6FD1","Salute":"#1D9A8A","Finanza":"#161616","Energia":"#C2263F","Consumi":"#D4572E","Beni di prima necessità":"#C99A00","Industria e difesa":"#5C5C5C","Materiali":"#8C6D3F","Servizi pubblici":"#0B7A3E","Telecomunicazioni e media":"#8F3BFF","Immobiliare":"#E0569B"};
const TEMA_COL={"Salute":"#1D9A8A","Finanza":"#161616","Energia":"#C2263F","Consumi":"#D4572E","Beni di prima necessità":"#C99A00","Industria":"#5C5C5C","Materiali":"#8C6D3F","Servizi pubblici":"#0B7A3E","Telecomunicazioni":"#8F3BFF","Immobiliare":"#E0569B","Tecnologia":"#2E6FD1","Semiconduttori":"#2E6FD1","Intelligenza artificiale":"#2E6FD1","Dividendi":"#0B7A3E","Difesa":"#5C5C5C","Energia pulita":"#1D9A8A","Acqua":"#1D9A8A"};
const itemCol=x=>SET_COL[x.set]||TEMA_COL[x.f2]||(x.tab==="Cripto"?"#D4572E":x.tab==="Oro e materie prime"?"#C99A00":null)||CLS_COL[x.cls]||CLS_COL.Altro;
const initials=n=>String(n||"?").replace(/^(the|iShares|Vanguard|Xtrackers|Amundi|SPDR|Invesco|VanEck|WisdomTree|L&G)\s+/i,"").split(/[\s.,&-]+/).filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase();
function bdItems(){
  const tab=BDCAT.tab,f=BDCAT.f[tab]||{};
  let L=tabBase(tab);
  for(const [k] of BD_FILT[tab]||[])if(f[k])L=L.filter(x=>x[k]===f[k]);
  return L;
}
function bdAll(){return [...POPULAR.filter(p=>p[4]!=="Azioni").map(etfItem),...(BTPS||[]).map(btpItem),...(AZIONI||[]).map(azItem)];}
const BDREM={q:"",res:[],busy:false,err:"",t:null},BDREMC=new Map();
function bdRemote(q){
  clearTimeout(BDREM.t);q=String(q||"").trim();BDREM.q=q;
  if(q.length<2){BDREM.res=[];BDREM.busy=false;BDREM.err="";return;}
  if(BDREMC.has(q.toLowerCase())){BDREM.res=BDREMC.get(q.toLowerCase());BDREM.busy=false;BDREM.err="";return;}
  BDREM.busy=true;BDREM.err="";
  BDREM.t=setTimeout(async()=>{try{const j=await getJSON(`/api/isin?q=${encodeURIComponent(q)}`);if(BDREM.q!==q)return;BDREM.res=(j&&j.results)||[];BDREM.err=j&&j.error?j.error:"";BDREMC.set(q.toLowerCase(),BDREM.res);}catch{if(BDREM.q===q){BDREM.res=[];BDREM.err="Ricerca non disponibile adesso.";}}
    if(BDREM.q===q){BDREM.busy=false;bdCatRender();}},320);
}
function bdCatRender(have){
  have=have||new Set(BD.rows.map(r=>String(r[0]).toUpperCase()));
  const box=$("#bdCat");
  if(!box.querySelector(".bd-cq"))box.innerHTML=`<input class="bd-cq" type="search" placeholder="Cerca azioni, ETF, obbligazioni, cripto: nome, ticker o ISIN" aria-label="Cerca uno strumento da aggiungere" spellcheck="false" autocomplete="off">
    <div class="bd-tabs2" role="tablist" aria-label="Tipo di strumento"></div><div class="bd-filt"></div><p class="bd-count" aria-live="polite"></p><div class="bd-clist" role="list"></div><div class="bd-rlist" aria-live="polite"></div>`;
  const q=normQ(BDCAT.q).trim(),words=q.split(/\s+/).filter(Boolean);box.classList.toggle("searching",!!q);
  const tabs=box.querySelector(".bd-tabs2");
  tabs.innerHTML=BD_TABS.map(t=>`<button type="button" class="bd-tab${!q&&t===BDCAT.tab?" on":""}" role="tab" aria-selected="${!q&&t===BDCAT.tab}" data-bdtab="${esc(t)}">${esc(t)}</button>`).join("");
  /* filtri della scheda: le voci si contano sull'elenco con gli altri filtri già scelti */
  const fl=box.querySelector(".bd-filt");
  if(q){fl.innerHTML="";}else{const tab=BDCAT.tab,f=BDCAT.f[tab]||{},base=tabBase(tab);
    fl.innerHTML=(BD_FILT[tab]||[]).map(([k,lab])=>{const other=base.filter(x=>(BD_FILT[tab]||[]).every(([k2])=>k2===k||!f[k2]||x[k2]===f[k2])),cnt={};other.forEach(x=>{if(x[k])cnt[x[k]]=(cnt[x[k]]||0)+1;});
      const opts=Object.entries(cnt).sort((a,b)=>b[1]-a[1]);
      return `<label class="bd-sel${f[k]?" on":""}"><span>${lab}</span><select data-bdf="${k}" aria-label="${lab}"><option value="">${lab}: tutti</option>${opts.map(([v,n])=>`<option value="${esc(v)}"${f[k]===v?" selected":""}>${esc(v)} (${n})</option>`).join("")}</select></label>`;}).join("")+
      (Object.values(f).some(Boolean)?`<button type="button" class="btn sm" data-bdfx="1">Togli i filtri</button>`:"");}
  /* elenco */
  const all=q?bdAll().filter(x=>words.every(w=>normQ(x.n+" "+x.code+" "+x.sub).includes(w))):bdItems();
  const list=all.slice(0,BDCAT.n),cnt=box.querySelector(".bd-count");
  cnt.textContent=BDCAT.tab==="Azioni"&&!AZIONI&&!q?"Carico le azioni…":`${all.length.toLocaleString("it-IT")} ${all.length===1?"risultato":"risultati"}${q?" nel catalogo":""}${!q&&BDCAT.tab==="Obbligazioni"&&(BDCAT.f.Obbligazioni||{}).f1==="BTP singoli"?` · elenco del MEF${BTP_AL?" al "+BTP_AL.split("-").reverse().join("/"):""}, prezzi stimati dalla curva dei BTP della Banca d'Italia`:""}`;
  const row=x=>{const on=have.has(String(x.code).toUpperCase());return `<button type="button" class="bd-it${on?" in":""}" role="listitem" data-bdc="${esc(x.code)}"${on?' aria-disabled="true"':""}><i style="background:${itemCol(x)}" aria-hidden="true">${esc(initials(x.n))}</i><span><b>${esc(x.n)}</b><small>${esc(x.sub)}</small></span><em aria-hidden="true">${on?"✓":"+"}</em></button>`;};
  box.querySelector(".bd-clist").innerHTML=list.map(row).join("")+(all.length>list.length?`<button type="button" class="btn sm bd-moreit" data-bdmoreit="1">Mostra altri ${Math.min(40,all.length-list.length)} di ${all.length-list.length}</button>`:"")+(q&&!all.length?`<p class="caption">Niente nel catalogo: guarda qui sotto tra tutte le borse.</p>`:"");
  /* da tutte le borse: quello che il catalogo non ha (azioni di altre borse, altri ETF, fondi comuni) */
  const rl=box.querySelector(".bd-rlist"),isinQ=/^[A-Z]{2}[A-Z0-9]{9}\d$/i.test(BDCAT.q.trim());
  if(!q){rl.innerHTML="";}
  else{const inCat=new Set(bdAll().map(x=>String(x.code).toUpperCase())),R=BDREM.res.filter(r=>!inCat.has(String(r.simbolo).toUpperCase())&&!inCat.has(String(r.simbolo).toUpperCase().split(".")[0]));
    rl.innerHTML=`<p class="bd-rh">Da tutte le borse${BDREM.busy?" · cerco…":""}</p>`+(R.length?`<div class="bd-rgrid">${R.map((r,i)=>{const on=have.has(String(r.simbolo).toUpperCase());return `<button type="button" class="bd-ri${on?" in":""}" data-bdr="${i}"${on?' aria-disabled="true"':""}><span><b>${esc(r.nome)}</b><small>${esc(r.tipo)} · ${esc(r.borsa)} · ${esc(String(r.simbolo).replace(/\.US$/,""))}</small></span><em aria-hidden="true">${on?"✓":"+"}</em></button>`;}).join("")}</div>`
      :BDREM.busy?"":isinQ?`<button type="button" class="bd-ri" data-bdisin="${esc(BDCAT.q.trim().toUpperCase())}"><span><b>Aggiungi l'ISIN ${esc(BDCAT.q.trim().toUpperCase())}</b><small>lo verifico su OpenFIGI e cerco la quotazione</small></span><em aria-hidden="true">+</em></button>`
      :`<p class="caption">${esc(BDREM.err||"Nessun titolo trovato con questo nome. Prova con il ticker o l'ISIN.")}</p>`);
    BDREM.view=R;}
}
function bdAddSym(code,meta){
  if(meta)BDMETA.set(code,meta);
  const empty=BD.rows.findIndex(r=>!String(r[0]).trim());if(empty>=0)BD.rows[empty]=[code,0];else if(!BD.rows.some(r=>String(r[0]).toUpperCase()===code))BD.rows.push([code,0]);
  if(meta)BDCHK.set(code,{st:"ok",name:meta.nome,sym:code});
  bdRender();const k=BD.rows.findIndex(r=>String(r[0]).toUpperCase()===code),w=document.querySelectorAll("#bdRows input[data-bdw]");if(w[k])w[k].focus();
}
document.addEventListener("click",e=>{const r=e.target.closest("[data-bdr]");if(r&&!r.classList.contains("in")){const x=(BDREM.view||[])[+r.dataset.bdr];if(x)bdAddSym(String(x.simbolo).toUpperCase(),{nome:x.nome,tipo:x.tipo,borsa:x.borsa});return;}
  const z=e.target.closest("[data-bdisin]");if(z)bdAddSym(z.dataset.bdisin,null);});
document.addEventListener("input",e=>{if(e.target.classList&&e.target.classList.contains("bd-cq")){BDCAT.q=e.target.value;BDCAT.n=40;bdRemote(e.target.value);if(BDCAT.q){azLoad();btpLoad();}bdCatRender();}});
document.addEventListener("click",e=>{if(e.target.closest("[data-bdmore]")){BDCAT.allModels=!BDCAT.allModels;bdRender();return;}
  const t=e.target.closest("[data-bdtab]");if(t){BDCAT.tab=t.dataset.bdtab;BDCAT.q="";BDCAT.n=40;const i=document.querySelector(".bd-cq");if(i)i.value="";if(BDCAT.tab==="Azioni")azLoad();if(BDCAT.tab==="Obbligazioni")btpLoad();bdCatRender();return;}
  if(e.target.closest("[data-bdmoreit]")){BDCAT.n+=40;bdCatRender();return;}
  if(e.target.closest("[data-bdfx]")){BDCAT.f[BDCAT.tab]={};BDCAT.n=40;bdCatRender();return;}
  /* un titolo dell'elenco delle azioni: codice con la borsa, nome e settore restano per la riga */
  const c=e.target.closest(".bd-it[data-bdc]");if(c&&!c.classList.contains("in")){const code=c.dataset.bdc,az=(AZIONI||[]).find(a=>a.s===code),bt=(BTPS||[]).find(b=>b.isin===code);bdAddSym(String(code).toUpperCase(),bt?btpMeta(bt):az?{nome:az.n,tipo:"Azione",borsa:az.paese,set:az.set}:null);e.stopImmediatePropagation();}});
document.addEventListener("change",e=>{const s=e.target.closest("[data-bdf]");if(!s)return;(BDCAT.f[BDCAT.tab]||=({}))[s.dataset.bdf]=s.value;BDCAT.n=40;bdCatRender();});
function openBuilder(){trackOnce("feature","pannello_crea",{name:"pannello_crea"});bdRender();$("#builder").classList.add("open");document.body.classList.add("bd-on");$("#builder").scrollTop=0;$("#builder").setAttribute("aria-hidden","false");setTimeout(()=>{const i=document.querySelector("#bdRows input");if(i)i.focus();},350);}
function closeBuilder(){$("#builder").classList.remove("open");document.body.classList.remove("bd-on");if(!$("#drawer").classList.contains("open"))$("#scrim").classList.remove("open");$("#builder").setAttribute("aria-hidden","true");}
$("#builderBtn").addEventListener("click",openBuilder);
/* copia l'allocazione vera come portafoglio A: la modifichi nello spazio di prova senza toccare l'originale */
document.addEventListener("click",e=>{if(!e.target.closest("#variantBtn")||!S.portfolio)return;trackOnce("feature","variante",{name:"variante"});const P0=S.portfolio.positions.filter(p=>p.valore>0),tot=P0.reduce((a,p)=>a+p.valore,0);if(!(tot>0))return;
  BD.ports=[P0.map(p=>{const f=POPULAR.find(x=>x[2]===p.isin);return [f?f[0]:(p.isin||p.ticker||p.nome),Math.round(p.valore/tot*1000)/10];})];BD.cur=0;$("#bdCap").value=Math.round(tot);openBuilder();});
$("#closeBuilder").addEventListener("click",closeBuilder);
$("#scrim").addEventListener("click",closeBuilder);
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("#builder").classList.contains("open"))closeBuilder();});
$("#builder").addEventListener("click",e=>{const p=e.target.closest("[data-bdp]"),d=e.target.closest("[data-bdd]");
  if(p){BD.rows=PRESETS[+p.dataset.bdp][1].map(x=>[...x]);bdRender();}
  const tb=e.target.closest("[data-bdt]");if(tb){const v=tb.dataset.bdt;if(v==="new"){BD.ports.push(BD.rows.map(r=>[...r]));BD.cur=BD.ports.length-1;}else if(v==="del"){BD.ports.splice(BD.cur,1);BD.cur=Math.max(0,BD.cur-1);}else BD.cur=+v;bdRender();}
  if(d){BD.rows.splice(+d.dataset.bdd,1);if(!BD.rows.length)BD.rows.push(["",0]);bdRender();}
  if(e.target.id==="bdAdd"){BD.rows.push(["",0]);bdRender();const ins=document.querySelectorAll("#bdRows input[list]");ins[ins.length-1].focus();}
  if(e.target.id==="bdGo")bdGo();
  const c=e.target.closest("[data-bdc]");if(c&&!c.classList.contains("in")){const empty=BD.rows.findIndex(r=>!String(r[0]).trim());if(empty>=0)BD.rows[empty]=[c.dataset.bdc,0];else BD.rows.push([c.dataset.bdc,0]);bdRender();const k=BD.rows.findIndex(r=>r[0]===c.dataset.bdc),w=document.querySelectorAll("#bdRows input[data-bdw]");if(w[k])w[k].focus();}
  const n=BD.rows.filter(r=>String(r[0]).trim()).length,t=BD.rows.reduce((a,r)=>a+(+r[1]||0),0);
  if(e.target.id==="bdEq"&&n){BD.rows.forEach(r=>{if(String(r[0]).trim())r[1]=Math.round(1000/n)/10;});bdRender();}
  if(e.target.id==="bdNorm"&&t>0){BD.rows.forEach(r=>{r[1]=Math.round((+r[1]||0)/t*1000)/10;});bdRender();}
  if(e.target.id==="bdClear"){BD.rows=[["",0]];bdRender();}});
$("#bdCap").addEventListener("input",()=>bdRender());
$("#builder").addEventListener("change",e=>{const i=e.target.dataset.bdi,w=e.target.dataset.bdw;
  if(i!=null){const f=bdFind(e.target.value);BD.rows[+i][0]=f&&f[0]?f[0]:String(e.target.value).trim().toUpperCase();bdRender();}
  if(w!=null){BD.rows[+w][1]=Math.max(0,parseFloat(String(e.target.value).replace(",","."))||0);bdRender();}});
function bdGo(){
  /* tutti gli strumenti di A, B e C: i prezzi si scaricano una volta; il valore del file è quello di A (gli altri a zero) */
  const P2=BD.ports.map(rs=>rs.filter(r=>String(r[0]).trim()&&+r[1]>0)),key=r=>{const f=bdFind(r[0])||[r[0]];return f[0]||f[2];};
  const uni=[];P2.forEach(rs=>rs.forEach(r=>{if(!uni.some(u=>key(u)===key(r)))uni.push([r[0],0]);}));
  const rows=uni.map(u=>{const a=P2[0].find(r=>key(r)===key(u));return [u[0],a?+a[1]:0];}),s=rows.reduce((a,r)=>a+(+r[1]),0);if(!rows.length||!(s>0))return;
  S.cmpPending=P2.length>1?P2.map(rs=>{const t=rs.reduce((a,r)=>a+(+r[1]),0),w={};rs.forEach(r=>{const f=bdFind(r[0])||[r[0]];w[f[4]&&f[4].btp?btpEtichetta(f[4].sym):f[0]&&!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(f[0])?f[0]:(f[1]||f[2]||r[0])]=(+r[1])/t;});return {w};}):null;
  const cap=Math.max(100,parseFloat($("#bdCap").value)||10000);
  /* un riepilogo di posizioni come quello di un Excel: lo legge il riconoscitore locale, poi i prezzi di mercato */
  const aoa=[["Strumento","Ticker","ISIN","Valore (€)","Peso"],...rows.map(r=>{const f=bdFind(r[0])||[r[0],null,null],w=(+r[1])/s;return [(f[4]&&f[4].nome)||f[1]||f[0]||f[2],f[0]&&!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(f[0])?f[0]:"",f[2]||"",Math.round(cap*w*100)/100,w];})];
  closeBuilder();
  track("start",{how:BD.ports.length>1?"crea_confronto":"crea"});TR.t0=Date.now();
  const pend=S.cmpPending;spaceSwitch("sim",{fresh:true,stay:true});S.cmpPending=pend; // le allocazioni A, B, C scelte passano al nuovo spazio
  load([{name:"Portafoglio di prova",aoa}],{name:"Portafoglio di prova",size:0,kind:"file",builder:true},true);spaceBar();
}

/* ---------- Import ---------- */
const an=()=>S.sheets[S.sheetIdx];
const needCount=()=>an().cols.filter(c=>S.roles[c.idx]==null).length;
function renderImport(animate){
  if(!S.res)resetImportState();
  const A=an();S.ds=P.buildDataset(A,S.roles,fixOpts());
  $("#dsName").textContent=S.source.name;
  $("#dsChip").innerHTML=S.source.kind==="sample"?`<span class="chip sample"><i></i>Esempio · dati sintetici</span>`:isExample()?`<span class="chip sample"><i></i>Esempio · portafoglio dimostrativo</span>`:(S.source.builder||(S.rb&&S.rb.origSource&&S.rb.origSource.builder))?`<span class="chip sample"><i></i>Portafoglio creato da te</span>`:"";
  renderScan(A,animate);renderLog(A,S.ds,animate);renderSummary(A,S.ds);renderSheets();renderMapping(A);renderQuality(S.ds);renderCaps(S.ds);renderChecks(A,S.ds);renderConfirm(S.ds);renderTicker();renderAI();renderDeadEnd();
}
/* ---------- File senza un portafoglio da analizzare: lo si dice subito, con cosa serve e cosa fare (niente attese a vuoto) ---------- */
function renderDeadEnd(){
  const busy=(S.recipe&&S.recipe.status==="loading")||(S.und&&/loading|rebuilding/.test(S.und.status||""));
  const hasPos=S.und&&S.und.posizioni&&S.und.posizioni.length;
  /* movimenti letti ma nessun titolo ancora in portafoglio: tutto venduto (le colonne di prezzi del file non sono un portafoglio) */
  const moves=(S.sheets||[]).some(x=>/^★ Movimenti/.test(x.name)),sold=S.source&&S.source.kind==="file"&&!busy&&moves&&!hasPos;
  const dead=S.source&&S.source.kind==="file"&&!busy&&(!(S.ds&&S.ds.ok)||sold)&&!hasPos;
  /* in scansione sotto «Cosa ho trovato», in mappa in cima, prima della lettura con l'IA */
  const aiCard=[...document.querySelectorAll("#scene-map .card")].find(c=>/Lettura con IA/.test((c.querySelector("h3")||{}).textContent||""));
  [["summary",document.getElementById("summary"),"after"],["map",aiCard,"before"]].forEach(([id,host,where])=>{if(!host)return;let el=document.querySelector(`.deadend[data-at="${id}"]`);
    if(!dead){if(el)el.remove();return;}
    if(!el){el=document.createElement("div");el.className="deadend";el.dataset.at=id;el.setAttribute("role","alert");where==="after"?host.after(el):host.before(el);}
    const sheets=(S.sheets||[]).filter(x=>!x.virtual).length;
    el.innerHTML=sold?`<b>Tutti i titoli di questo file risultano venduti</b>
      <p>Ho letto gli acquisti e le vendite, ma alla fine del periodo non resta nessun titolo in portafoglio: non c'è un portafoglio di oggi da analizzare. Se il conto ha titoli comprati prima dell'inizio del file, scarica l'elenco dei movimenti dall'apertura del conto, oppure la situazione del portafoglio di oggi.</p>`:`<b>In questo file non trovo un portafoglio da analizzare</b>
      <p>Ho letto ${sheets===1?"il foglio":`${sheets} fogli`}, ma non ci sono acquisti e vendite di titoli, né le posizioni di oggi con il loro valore, né prezzi nel tempo. Capita con gli estratti che contengono solo versamenti, dividendi, commissioni o scambi tra cripto.</p>
      <p class="caption">Per analizzare un portafoglio serve almeno una di queste tre cose: un elenco di acquisti e vendite (data, titolo o ISIN, quantità e prezzo o importo); le posizioni di oggi (titolo o ISIN e valore); i prezzi nel tempo (date e prezzi).</p>
      <div class="row">${aiAuto()&&!(S.recipe&&S.recipe.status==="error")?"":`<button type="button" class="btn sm lime" data-dead="ai">Prova la lettura con l'IA</button>`}<button type="button" class="btn sm" data-dead="file">Carica un altro file</button><button type="button" class="btn sm" data-dead="example">Guarda un esempio</button></div>`;});
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-dead]");if(!b)return;const a=b.dataset.dead;
  if(a==="ai"){requestRecipe();renderDeadEnd();}else if(a==="file")$("#file").click();else if(a==="example")$("#sampleBtn").click();});
function playScan(){
  S.scanPlayed=true;
  const sc=document.querySelector(".scan");if(sc&&!REDUCE){sc.classList.remove("play");void sc.offsetWidth;sc.classList.add("play");}
  renderLog(an(),S.ds,true);
}
function cellText(v){
  if(v===null||v===undefined)return "";
  if(v instanceof Date)return fmtDate(new Date(Date.UTC(v.getFullYear(),v.getMonth(),v.getDate())));
  if(typeof v==="number")return v.toLocaleString("it-IT",{maximumFractionDigits:4});
  return String(v);
}
function renderScan(A,animate){
  const raw=S.raw[S.sheetIdx]||[],rebuilt=S.source&&S.source.kind==="rebuilt";
  const rows=rebuilt?[0,...Array.from({length:Math.min(12,raw.length-1)},(_,k)=>raw.length-Math.min(12,raw.length-1)+k)]:Array.from({length:Math.min(raw.length,13)},(_,k)=>k),maxR=rows.length;
  let width=0;for(const r of rows)width=Math.max(width,(raw[r]||[]).length);
  width=Math.max(1,Math.min(width,8));
  const colInfo=c=>{const col=A.cols.find(x=>x.idx===c);return col?{role:S.roles[c],known:true}:{role:null,known:false};};
  const L=i=>{let s="";i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;};
  let h=`<div class="colh" style="position:sticky;left:0;z-index:1"></div>`;
  for(let c=0;c<width;c++){const ci=colInfo(c),rc=ci.role?ROLE_COLOR[ci.role]:ci.known?"var(--warn)":"var(--faint)";h+=`<div class="colh" style="--rc:${rc};--c:${c}">${L(c)}<span class="tagr">${ci.role?ROLE_TAG[ci.role]:ci.known?"?":"vuota"}</span></div>`;}
  for(let i=0;i<maxR;i++){
    const r=rows[i],row=raw[r]||[],kind=A.headerRow>=0&&r<A.headerRow?"pre":r===A.headerRow?"hdr":"data";
    h+=`<div class="cell rn" style="--r:${i};--c:0">${r+1}</div>`;
    for(let c=0;c<width;c++){
      const ci=colInfo(c),rc=ci.role?ROLE_COLOR[ci.role]:ci.known?"var(--warn)":"transparent";
      const cls=["cell",kind==="pre"?"pre":kind==="hdr"?"hdr":"",kind==="data"&&ci.role==="ignore"?"ign":"",kind==="data"&&ci.known&&ci.role==null?"q":""].join(" ");
      const tx=esc(cellText(row[c]));
      h+=`<div class="${cls}" style="--r:${i};--c:${c};--rc:${kind==="pre"?"transparent":rc}" title="${tx}">${tx||"&nbsp;"}</div>`;
    }
  }
  h+=`<div class="scanline" aria-hidden="true"></div>`;
  $("#scanwrap").innerHTML=(rebuilt?rebuildBanner():"")+`<div class="scan${animate&&!REDUCE?" play":""}" style="grid-template-columns:44px repeat(${width},minmax(90px,auto))" role="img" aria-label="Anteprima delle prime righe del foglio con le colonne riconosciute">${h}</div>`;
}
function renderLog(A,ds,animate){
  const t0=performance.now(),L=[];
  L.push(["ok",`Letto «${S.source.name}» · ${S.sheets.length} ${S.sheets.length===1?"foglio":"fogli"}${S.source.size?" · "+fmtSize(S.source.size):""}`]);
  const RC=S.recipe;
  if(S.tplUsed&&S.tpl)L.push(["ok",`Modello già visto: «${S.tpl.file}», confermato il ${new Date(S.tpl.saved).toLocaleDateString("it-IT")}. Stessa lettura, nessuna chiamata all'IA`]);
  (S.localParts||[]).forEach(x=>L.push(["ok","Riconosciuto senza IA: "+x.d]));
  if(S.agree)L.push(["ok","L'IA e la lettura automatica concordano"]);
  if(S.conflict)L.push(["warn","L'IA e la lettura automatica danno risultati diversi: scegli tu nella mappa"]);
  if(RC&&RC.status==="loading")L.push(["warn",`L'IA sta leggendo la struttura di ${(S.fileSheets||[]).length} ${(S.fileSheets||[]).length===1?"foglio":"fogli"}: intanto vedi la lettura automatica`]);
  else if(RC&&RC.status==="done"){L.push(["ok",`Struttura letta dall'IA: ${RC.r.spiegazione}`]);(RC.errors||[]).slice(0,4).forEach(e=>L.push(["warn","Controllo della ricetta: "+e]));}
  else if(RC&&RC.status==="empty")L.push(["warn","L'IA non ha trovato dati da analizzare: resta la lettura automatica"]);
  else if(RC&&RC.status==="error")L.push(["warn",`${RC.msg}: resta la lettura automatica`]);
  const W=S.wide&&S.wide.report;
  if(W){
    L.push(["ok",`Formato a matrice riconosciuto: date in orizzontale, una riga per voce, in ${W.sheets.length} fogli (${W.sheets.slice(0,4).join(", ")}${W.sheets.length>4?"…":""})`]);
    L.push(["ok",`Uniti in una sola storia mensile: ${W.from} → ${W.to} · ${W.holdings} posizioni${W.debts?`, ${W.debts} debiti`:""}${W.totals?`, ${W.totals} righe di patrimonio totale`:""}`]);
    L.push([W.fx?"ok":"warn",W.fx?`Valute ${W.currencies.join(", ")} convertite in euro con ${W.fx}, mese per mese`:`Valute diverse (${W.currencies.join(", ")}) senza tassi di cambio nel file: le posizioni restano nella loro valuta`]);
    L.push(["ok",`Classi di attivo ricostruite da ${W.classSrc}: ${W.classes.join(", ")}`]);
    L.push(["warn","Sono valori di patrimonio, non prezzi: i versamenti e i prelievi entrano nei rendimenti mensili"]);
    if(!A.virtual&&!/^★/.test(A.name))L.push(["ok",`Stai guardando il foglio originale «${A.name}»`]);
  }else if(S.sheets.length>1)L.push(["ok",`Scelto il foglio «${A.name}»: è quello con più serie numeriche`]);
  L.push([A.headerRow>=0?"ok":"warn",A.headerRow>=0?`Intestazioni alla riga ${A.headerRow+1}${A.headerRow>0?` (saltate ${A.headerRow} righe di titolo)`:""}`:"Nessuna riga di intestazione: uso le lettere delle colonne"]);
  const need=needCount();
  L.push([need?"warn":"ok",`${A.cols.length} colonne analizzate · ${need?need+" da confermare":"tutte interpretate"}`]);
  if(ds.ok)L.push(["ok",`Frequenza ${ds.freq.label} · intervallo mediano ${fmtN(ds.medianDays,1)} giorni`]);
  const ne=ds.Q.errors.length,nw=ds.Q.warnings.length;
  L.push([ne?"bad":nw?"warn":"ok",`Controllo qualità: ${ne} ${ne===1?"errore":"errori"}, ${nw} ${nw===1?"avviso":"avvisi"}`]);
  $("#log").innerHTML=L.map((l,i)=>`<li class="${l[0]}${animate&&!REDUCE?" in":""}" style="--i:${i+(animate?6:0)}"><span class="g">${l[0]==="ok"?"✓":"!"}</span><span>${esc(l[1])}</span></li>`).join("");
  $("#logTime").textContent=`analisi in ${fmtN(performance.now()-t0+0.4,1)} ms`;
}
function renderSummary(A,ds){
  let h;
  if(!A.cols.length)h=`Il foglio «${esc(A.name)}» non contiene una tabella di dati.`;
  else if(!ds.ok)h=`Ho letto il foglio, ma non posso ancora costruire le analisi. ${esc(ds.Q.errors[0])}`;
  else{
    const k=ds.assets.length,last=ds.dates[ds.dates.length-1];
    h=`Ho individuato <b>${k} asset</b> e <b>${ds.nObs} osservazioni ${ds.freq.adj}</b>, da ${fmtDate(ds.dates[0],ds.freq.f)} a ${fmtDate(last,ds.freq.f)}: <b>${fmtN(ds.years,ds.years<10?1:0)} anni</b> di storia.`;
    const miss=ds.assets.filter(a=>a.missing);
    if(miss.length)h+=` Mancano ${miss.map(a=>`${a.missing} ${a.missing===1?"valore":"valori"} in «${esc(a.name)}»`).join(" e ")}.`;
  }
  const need=needCount();
  if(need)h+=`<span class="ask">Prima di procedere, dimmi come interpretare ${need===1?"una colonna":need+" colonne"}: le trovi evidenziate nella mappa.</span>`;
  $("#summary").innerHTML=h;
}
function renderSheets(){
  const el=$("#sheets");
  el.innerHTML=S.sheets.length<2?"":S.sheets.map((s,i)=>`<button type="button" data-sheet="${i}" aria-pressed="${i===S.sheetIdx}">${esc(s.name)}${s.score===0?" · senza serie":""}</button>`).join("");
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-sheet]");if(!b)return;undoAI(true);S.sheetIdx=+b.dataset.sheet;resetAI();resetImportState();S.tplCols=null;initRoles();hideLab();renderImport(true);morphData();});
function spark(c){
  if(c.kind!=="num")return `<span class="cl">—</span>`;
  const v=c.nums.filter(x=>x!==null);if(v.length<2)return `<span class="cl">—</span>`;
  const step=Math.max(1,Math.floor(v.length/60)),pts=v.filter((_,i)=>i%step===0);
  const mn=Math.min(...pts),mx=Math.max(...pts),W=96,H=26;
  const xy=pts.map((y,i)=>[i/(pts.length-1)*W,H-2-(mx>mn?(y-mn)/(mx-mn):.5)*(H-4)]);
  const line=xy.map(p=>p.map(n=>n.toFixed(1)).join(",")).join(" ");
  const col=ROLE_COLOR[S.roles[c.idx]]||"var(--warn)",lp=xy[xy.length-1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polygon points="0,${H} ${line} ${W},${H}" fill="${col}" opacity=".12"/><polyline points="${line}" fill="none" stroke="${col}" stroke-width="1.3" stroke-linejoin="round"/><circle cx="${lp[0].toFixed(1)}" cy="${lp[1].toFixed(1)}" r="2" fill="${col}"/></svg>`;
}
function renderMapping(A){
  if(!A.cols.length){$("#mapBody").innerHTML=`<tr><td colspan="6" style="color:var(--muted)">Nessuna colonna con dati in questo foglio.</td></tr>`;return;}
  $("#mapBody").innerHTML=A.cols.map(c=>{
    const role=S.roles[c.idx],need=role==null,conf=need?"bassa":S.touched[c.idx]?"utente":c.conf;
    return `<tr class="${need?"need":""}">
      <td><div class="cname">${esc(c.name)}</div><div class="cl mono">col. ${c.letter} · ${c.nonNull} valori</div></td>
      <td class="mono samp">${c.sample.map(esc).join("<br>")}</td>
      <td>${spark(c)}</td>
      <td><select id="role-${c.idx}" data-col="${c.idx}" class="${need?"need":""}" aria-label="Interpretazione di ${esc(c.name)}">${need?`<option value="" selected disabled>Scegli…</option>`:""}${ROLES.map(r=>`<option value="${r.v}"${role===r.v?" selected":""}>${r.l}</option>`).join("")}</select></td>
      <td><span class="conf ${conf}">${CONF_L[conf]}</span><small class="src">${{auto:"automatica",IA:"dall'IA",modello:"modello salvato",utente:"scelta da te",mercato:"prezzi di mercato"}[colSource(A,c)]}</small></td>
      <td class="why">${esc(S.aiRoles[c.idx]?"Proposta dall'IA, applicata da te: "+S.aiRoles[c.idx]:S.touched[c.idx]?"Interpretazione scelta da te":c.reason)}</td>
    </tr>`;
  }).join("");
}
document.addEventListener("change",e=>{
  const t=e.target;if(!t.matches("select[data-col]"))return;
  const idx=+t.dataset.col,v=t.value;
  if(v==="date")for(const k in S.roles)if(S.roles[k]==="date"&&+k!==idx){S.roles[k]="ignore";S.touched[k]=true;}
  S.roles[idx]=v;S.touched[idx]=true;hideLab();
  renderImport(false);morphData();
  const again=document.getElementById(t.id);if(again)again.focus({preventScroll:true});
});
function renderQuality(ds){
  const items=[...S.aiLog.map(t=>["ai","IA",t]),...ds.Q.errors.map(t=>["err","Errore",t]),...ds.Q.warnings.map(t=>["warn","Avviso",t]),...ds.Q.infos.map(t=>["info","Nota",t])];
  if(!items.length)items.push(["ok","OK","Nessun problema rilevato: date ordinate, nessun valore mancante, nessun rendimento anomalo."]);
  $("#quality").innerHTML=items.map(i=>`<li class="t-${i[0]}"><span class="tag">${i[1]}</span><span>${esc(i[2])}</span></li>`).join("");
  $("#qCount").textContent=`${ds.Q.errors.length} errori · ${ds.Q.warnings.length} avvisi · ${ds.Q.infos.length} note`;
}
function renderCaps(ds){
  const caps=P.capabilities(ds);
  $("#caps").innerHTML=caps.length?caps.map(c=>`<li class="${c.ok?"":"no"}"><span class="s">${c.ok?"✓":"–"}</span><span class="n">${esc(c.name)}<small>${esc(c.why)}</small></span></li>`).join(""):`<li class="no"><span class="s">–</span><span class="n">Completa la mappatura per vedere le analisi possibili.</span></li>`;
}
function renderConfirm(ds){
  const need=needCount(),btn=$("#confirmBtn"),t=$("#confirmText");
  const open=(S.checks||[]).filter(c=>c.block&&!c.done).length;
  btn.disabled=!!need||!ds.ok||!!open;
  if(!need&&ds.ok&&open)t.innerHTML=`<b>${open} ${open===1?"verifica":"verifiche"} prima del laboratorio</b>: le trovi qui sopra, in «Prima di costruire il laboratorio».`;
  else if(need)t.innerHTML=`<b>${need} ${need===1?"colonna":"colonne"} da confermare</b> prima del laboratorio. <button type="button" class="btn sm" id="gotoNeed" style="margin-left:6px">Mostrami ${need===1?"quale":"quali"}</button>`;
  else if(!ds.ok)t.innerHTML=`<b>Mappatura incompleta.</b> ${esc(ds.Q.errors[0])}`;
  else t.innerHTML=`Pronto: <b>${ds.assets.length} serie</b> · ${ds.nObs} date · ${ds.Q.warnings.length} ${ds.Q.warnings.length===1?"avviso":"avvisi"}`;
}
document.addEventListener("click",e=>{
  if(!e.target.closest("#gotoNeed"))return;
  const sel=document.querySelector("select.need");if(!sel)return;
  const row=sel.closest("tr");go("map");
  setTimeout(()=>{row.scrollIntoView({behavior:REDUCE?"auto":"smooth",block:"center"});row.classList.remove("flash");void row.offsetWidth;row.classList.add("flash");sel.focus({preventScroll:true});},380);
});
$("#confirmBtn").addEventListener("click",e=>{
  track("import_ok",{kind:importKind(),assets:S.ds&&S.ds.ok?S.ds.assets.length:0,fixes:Object.keys(S.touched||{}).length+Object.keys(S.doneChecks||{}).length,checks:(S.checks||[]).map(c=>c.id),secs:TR.t0?Math.round((Date.now()-TR.t0)/1000):null});
  tplSave();
  if(!HAS_G){showLab(false);return;}
  const ds=S.ds,b=e.currentTarget.getBoundingClientRect(),cx=b.left+b.width/2,cy=b.top+b.height/2;
  const R=Math.hypot(Math.max(cx,innerWidth-cx),Math.max(cy,innerHeight-cy))+20,k=ds.assets.length;
  $("#wipeStats").innerHTML=[[k,"asset"],[ds.nObs,"date"],[k*(k-1)/2,"correlazioni"],[k*5,"metriche"]].map(x=>`<li><b data-to="${x[0]}">0</b>${x[1]}</li>`).join("");
  const w=$("#wipe");w.style.display="flex";
  let shown=false,closed=false;
  const show=()=>{if(shown)return;shown=true;showLab(true);};
  const close=()=>{if(closed)return;closed=true;clearTimeout(safety);G.set(w,{clearProps:"all"});w.style.display="none";};
  const safety=setTimeout(()=>{show();close();},5000);
  G.timeline()
    .fromTo(w,{clipPath:`circle(0px at ${cx}px ${cy}px)`},{clipPath:`circle(${R}px at ${cx}px ${cy}px)`,duration:.85,ease:"expo.inOut"})
    .fromTo(w.querySelector("h2"),{yPercent:60,opacity:0},{yPercent:0,opacity:1,duration:.6,ease:"power3.out"},"-=.3")
    .add(()=>{w.querySelectorAll("b[data-to]").forEach(el=>{const o={v:0},to=+el.dataset.to;G.to(o,{v:to,duration:.7,ease:"power2.out",onUpdate:()=>{el.textContent=Math.round(o.v).toLocaleString("it-IT");}});});},"-=.2")
    .add(show,"+=.75")
    .to(w,{yPercent:-100,duration:.9,ease:"expo.inOut"},"+=.15")
    .add(close);
});

/* ---------- Correzione con IA (Claude tramite la funzione server /api/fix) ---------- */
const AI_URL="/api/fix";
const colLetter=i=>{let s="";i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;};
const colIndex=l=>{let n=0;for(const ch of String(l).toUpperCase().trim()){const c=ch.charCodeAt(0)-64;if(c<1||c>26)return -1;n=n*26+c;}return n-1;};
function aiAuto(){try{return localStorage.getItem("pos-ai-auto")!=="0";}catch(e){return true;}}
function resetAI(){S.ai=null;S.aiLog=[];S.aiRoles={};S.rawOrig=null;S.und=null;S.chat=[];S.chatView=[];if(typeof renderChat==="function")renderChat();}
function aiPayload(){
  const A=an(),raw=S.raw[S.sheetIdx]||[],hdr=Math.max(0,A.headerRow);
  const head=raw.slice(0,Math.min(raw.length,hdr+8)).map((r,i)=>({row:i+1,cells:(r||[]).slice(0,14).map(cellText)}));
  const columns=A.cols.map(c=>({col:c.letter,name:c.name,interpretazione:S.roles[c.idx]||"incerto",confidenza:c.conf,motivo:c.reason,valori:c.nonNull}));
  const sus=new Set();
  A.cols.forEach(c=>{
    const role=S.roles[c.idx]||(c.kind==="num"?"num":null);if(!role||role==="date"||role==="ignore")return;
    c.nums.forEach((v,i)=>{
      const rv=A.body[i].row[c.idx];
      if(v===null&&rv!=null&&String(rv).trim()!==""&&!(rv instanceof Date))sus.add(i);
      if(role==="price"&&v!==null&&i>0&&c.nums[i-1]&&Math.abs(v/c.nums[i-1]-1)>.45)sus.add(i);
      if(role==="ret"&&v!==null&&Math.abs(v)>.5)sus.add(i);
      if(role==="retpct"&&v!==null&&Math.abs(v)>50)sus.add(i);
    });
  });
  const idx=[...sus].sort((a,b)=>a-b).slice(0,25),ctx=new Set();
  idx.forEach(i=>{for(let d=-2;d<=2;d++){const k=i+d;if(k>=0&&k<A.body.length)ctx.add(k);}});
  const rows=[...ctx].sort((a,b)=>a-b).slice(0,90).map(i=>({row:A.body[i].r+1,sospetta:sus.has(i),cells:A.body[i].row.slice(0,14).map(cellText)}));
  S.aiAllowedRows=new Set(rows.map(r=>r.row));
  return {foglio:A.name,rigaIntestazione:A.headerRow+1,colonne:columns,primeRighe:head,righeSospette:rows,problemiRilevati:[...S.ds.Q.errors,...S.ds.Q.warnings].slice(0,20)};
}
function validateAI(j){
  const A=an(),raw=S.raw[S.sheetIdx]||[],ok=new Set(ROLES.map(r=>r.v));
  const roles=(Array.isArray(j.roles)?j.roles:[]).filter(p=>{const ci=colIndex(p.col);return ok.has(p.role)&&A.cols.some(c=>c.idx===ci)&&S.roles[ci]!==p.role;})
    .map(p=>({col:String(p.col).toUpperCase(),idx:colIndex(p.col),role:p.role,why:String(p.why||"")}));
  const cells=(Array.isArray(j.cells)?j.cells:[]).filter(p=>{
    const r=Number(p.row),ci=colIndex(p.col);
    return Number.isInteger(r)&&r>=1&&r<=raw.length&&ci>=0&&S.aiAllowedRows&&S.aiAllowedRows.has(r)&&(p.value===null||p.value===undefined||Number.isFinite(Number(p.value)));
  }).map(p=>{const ci=colIndex(p.col),r=Number(p.row);return {row:r,col:String(p.col).toUpperCase(),idx:ci,from:cellText((raw[r-1]||[])[ci]),value:p.value==null?null:Number(p.value),why:String(p.why||"")};})
    .filter(p=>p.value!==null||p.from!=="");
  return {summary:String(j.summary||""),roles,cells,model:j.model||"Claude"};
}
async function requestFix(){
  S.ai={status:"loading"};renderAI();
  let payload;try{payload=aiPayload();}catch(e){S.ai={status:"error",msg:"Non riesco a preparare l'estratto del foglio."};renderAI();return;}
  try{
    const ctrl=new AbortController(),to=setTimeout(()=>ctrl.abort(),60000);
    const r=await fetch(AI_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),signal:ctrl.signal});
    clearTimeout(to);
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||`Il server ha risposto con un errore (${r.status}).`);
    S.ai={status:"ready",...validateAI(j)};
  }catch(e){
    const msg=e.name==="AbortError"?"L'IA non ha risposto in tempo. Riprova.":e instanceof TypeError?"La correzione con IA funziona nella versione del sito pubblicata su Vercel. Qui puoi sistemare le colonne dal menu della mappa.":String(e.message||e);
    S.ai={status:"error",msg};
  }
  renderAI();
}
function applyAI(){
  const a=S.ai;if(!a||a.status!=="ready")return;
  const name=an().name,raw=S.raw[S.sheetIdx];
  if(!S.rawOrig)S.rawOrig=raw.map(r=>Array.isArray(r)?r.slice():r);
  const log=[];
  a.cells.forEach(c=>{const row=raw[c.row-1]||(raw[c.row-1]=[]);row[c.idx]=c.value;log.push(`Riga ${c.row}, col. ${c.col}: ${c.from||"vuota"} → ${c.value==null?"vuota":fmtN(c.value,c.value%1?2:0)}. ${c.why}`);});
  const keep={},touched={...S.touched};Object.keys(S.touched).forEach(k=>{keep[k]=S.roles[k];});
  S.sheets[S.sheetIdx]=P.analyzeSheet(name,raw);initRoles();
  Object.keys(keep).forEach(k=>{S.roles[k]=keep[k];S.touched[k]=touched[k];});
  a.roles.forEach(p=>{if(p.role==="date")for(const k in S.roles)if(S.roles[k]==="date"&&+k!==p.idx)S.roles[k]="ignore";S.roles[p.idx]=p.role;S.touched[p.idx]=true;S.aiRoles[p.idx]=p.why;log.push(`Colonna ${p.col} interpretata come «${(ROLES.find(r=>r.v===p.role)||{}).l}». ${p.why}`);});
  S.aiLog=log;S.ai={...a,status:"applied",n:log.length};
  hideLab();renderImport(false);morphData();
}
function undoAI(silent){
  if(!S.rawOrig)return;
  S.raw[S.sheetIdx]=S.rawOrig;S.sheets[S.sheetIdx]=P.analyzeSheet(an().name,S.rawOrig);
  initRoles();S.rawOrig=null;S.aiLog=[];S.aiRoles={};
  if(!silent){S.ai=null;hideLab();renderImport(false);morphData();}
}
/* riquadro della mappa e della scansione per un file ricostruito: da dove vengono i prezzi di ogni strumento */
function rebuildRows(){
  const pf=S.portfolio;if(!pf||!S.rb)return "";
  return S.rb.cols.map(c=>{const k=[...c.map.keys()].sort(),y=S.youngRes&&S.youngRes[c.name];return `<tr><td><span class="an">${esc(c.name)}</span><span class="cl">${esc((c.info||c.nome||"").split(" · ")[0])}</span></td><td class="mono">${esc(c.sym)}${c.orig?`<span class="cl">al posto di ${esc(c.orig)}</span>`:""}</td><td>${esc(c.src)}</td><td class="mono">${esc(c.cur==="GBX"?"pence (GBX)":c.cur||"—")}</td><td class="mono">${k[0]||"—"} → ${k[k.length-1]||"—"}<br><span class="cl">${k.length} mesi${y==="proxy"?" · esteso con l'indice":""}${y==="exclude"?" · escluso":""}</span></td></tr>`;}).join("");
}
function rebuildBanner(){
  const pf=S.portfolio,n=S.rb?S.rb.cols.length:0;if(!pf||!n)return "";
  return `<div class="rb-banner"><b>Ricostruito con i prezzi di mercato</b><span>Dal tuo file «${esc(S.rb.origName)}» ho preso solo <b>quali strumenti</b> hai e <b>quanto</b>: ${n} ${n===1?"strumento":"strumenti"}. I prezzi sotto sono quelli di mercato di ogni strumento, in euro: qui vedi gli ultimi 12 mesi. Il dettaglio delle fonti è nella mappa.</span></div>`;
}
function renderAI(){
  setTimeout(renderDeadEnd,0);
  const el=$("#aiBody");if(!el)return;const a=S.ai;
  const rebuilt=S.source&&S.source.kind==="rebuilt"&&S.portfolio&&S.rb&&!S.und;
  const h3=document.querySelector("#aiCard .head h3"),chip=document.querySelector("#aiCard .head .chip");
  if(h3)h3.textContent=rebuilt?"Prezzi di mercato":"Lettura con IA";if(chip)chip.innerHTML=rebuilt?"<i></i>da dove vengono i numeri":"<i></i>Claude · proposte da confermare";
  if(rebuilt){const M=S.portfolio.missing||[];
    el.innerHTML=`<p style="margin:0 0 12px;line-height:1.5">Le analisi usano i prezzi di mercato di ogni strumento, non i valori del tuo file: versamenti, vendite e spostamenti di liquidità non falsano rischio e rendimenti. Il tuo rendimento personale (TIR) si calcola a parte, dalle tue transazioni.</p>
      <div class="tablewrap"><table class="mt"><thead><tr><th>Strumento</th><th>Simbolo</th><th>Fonte</th><th>Valuta di quotazione</th><th>Storico</th></tr></thead><tbody>${rebuildRows()}</tbody></table></div>
      ${M.length?`<p class="caption">Non scaricati: ${M.map(m=>`${esc(m.nome)}${m.simbolo?` (${esc(m.simbolo)})`:""}: ${esc(m.err)}`).join(" · ")}</p>`:""}
      <div class="row" style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn" id="rbOrig">Torna al file originale</button></div>`;
    return;}
  if(S.recipe&&S.recipe.status==="loading"&&!S.und){el.innerHTML=`<div class="thinking"><i></i><i></i><i></i><span>L'IA sta leggendo la struttura di ${(S.fileSheets||[]).length} ${(S.fileSheets||[]).length===1?"foglio":"fogli"}: dove sono le date, quali righe sono asset, debiti, totali, cambi…</span></div>`;return;}
  if(S.recipe&&S.recipe.status==="done"&&!S.und){el.innerHTML=`<p class="lead">${esc(S.recipe.r.spiegazione)}</p>${(S.recipe.r.scartati||[]).length?`<p class="caption">Scartato: ${S.recipe.r.scartati.map(esc).join(" · ")}</p>`:""}<div class="row" style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn" id="recipeOff">Usa la lettura automatica</button></div>`;return;}
  if(S.und){renderUnderstand(el);return;}
  const auto=`<label class="toggle"><input type="checkbox" id="aiAuto"${aiAuto()?" checked":""}>Fai partire l'IA quando carico un file</label>`;
  if(!a){el.innerHTML=`<p class="lead">L'IA rilegge il file: corregge colonne dubbie ed errori di battitura, oppure lo ricostruisce tenendo solo gli asset, con i loro prezzi e il loro andamento. Tu confermi con un clic.</p><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button type="button" class="btn primary" id="aiUnderstand" data-mag>Ricostruisci il file con l'IA</button><button type="button" class="btn" id="aiRun">Correggi solo gli errori</button>${auto}</div>`;return;}
  if(a.status==="loading"){const A=an();el.innerHTML=`<div class="thinking"><i></i><i></i><i></i><span>Claude sta rileggendo ${A.cols.length} colonne e le righe sospette. Può volerci fino a un minuto…</span></div>`;return;}
  if(a.status==="error"){el.innerHTML=`<p style="color:var(--muted)">${esc(a.msg)}</p><div><button type="button" class="btn" id="aiRun">Riprova</button></div>`;return;}
  if(a.status==="applied"){el.innerHTML=`<p class="lead">Applicate ${a.n} ${a.n===1?"correzione":"correzioni"}. Le trovi nel controllo qualità con l'etichetta IA.</p><div><button type="button" class="btn" id="aiUndo">Annulla le correzioni</button></div>`;return;}
  const n=a.roles.length+a.cells.length;
  const items=[
    ...a.roles.map(p=>`<li><span class="k">Colonna ${esc(p.col)}</span><span class="chg">→ <b>${esc((ROLES.find(r=>r.v===p.role)||{}).l)}</b></span><span class="w">${esc(p.why)}</span></li>`),
    ...a.cells.map(p=>`<li><span class="k">Riga ${p.row} · ${esc(p.col)}</span><span class="chg"><s>${esc(p.from||"vuota")}</s> → <b>${p.value==null?"vuota":esc(fmtN(p.value,p.value%1?2:0))}</b></span><span class="w">${esc(p.why)}</span></li>`)
  ].join("");
  el.innerHTML=`<p class="lead">${esc(a.summary||(n?"Ecco cosa propongo di correggere.":"Il foglio è già in ordine: nessuna correzione necessaria."))}</p>
    ${n?`<ul class="props">${items}</ul><div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn primary" id="aiApply" data-mag>Applica tutte (${n})</button><button type="button" class="btn" id="aiDismiss">Ignora</button></div>`:""}`;
}
document.addEventListener("click",e=>{
  const t=e.target.closest("#aiRun,#aiApply,#aiDismiss,#aiUndo,#aiUnderstand,#undApply,#undRebuild,#undDismiss,#recipeOff,#recipeRun,#tplForget,#rbOrig");if(!t)return;
  if(t.id==="recipeOff")return recipeOff();
  if(t.id==="rbOrig"&&S.rb&&S.fileSheets){const src=S.rb.origSource;S.autoRebuilt=src;load(S.fileSheets,src,false,{forceAuto:true});return;}
  if(t.id==="tplForget"){tplForget(S.fp);S.tpl=null;S.tplUsed=false;load(S.fileSheets,S.source,false,{forceAuto:true});if(aiAuto())requestRecipe();return;}
  if(t.id==="recipeRun")return requestRecipe();
  if(t.id==="aiUnderstand")requestUnderstand();
  else if(t.id==="undApply")applyUnderstandSeries();
  else if(t.id==="undRebuild")rebuildFromPrices();
  else if(t.id==="undDismiss"){S.und=null;renderAI();}
  else if(t.id==="aiRun"){S.und=null;requestFix();}
  else if(t.id==="aiApply")applyAI();
  else if(t.id==="aiDismiss"){S.ai=null;renderAI();}
  else if(t.id==="aiUndo")undoAI(false);
});
document.addEventListener("change",e=>{if(e.target.id==="aiAuto"){try{localStorage.setItem("pos-ai-auto",e.target.checked?"1":"0");}catch(err){}}});

/* ---------- Ricostruzione del file: Claude capisce il file (/api/understand), i prezzi arrivano da /api/prices ---------- */
const TIPO_L={serie_storica:"Serie storica",riepilogo_portafoglio:"Riepilogo di portafoglio",movimenti:"Movimenti",altro:"Altro"};
function undPayload(){
  /* tutti i fogli (fino a 12), solo le celle piene con la loro lettera di colonna; righe ridotte se il file è grande */
  const sheetRows=(aoa,max)=>(aoa||[]).slice(0,max).map((r,ri)=>{const c={};(r||[]).forEach((v,ci)=>{if(v!==null&&v!==undefined&&String(v).trim()!=="")c[colLetterUI(ci)]=cellText(v);});return {riga:ri+1,celle:c};}).filter(x=>Object.keys(x.celle).length);
  const build=max=>({file:S.source.name,nota:"celle è un oggetto lettera di colonna → valore; le celle vuote sono omesse. Per ogni foglio ci sono anche righe totali e colonne con un'intestazione.",
    fogli:S.raw.slice(0,12).map((aoa,i)=>({nome:S.sheets[i].name,righeTotali:(aoa||[]).length,
      analisiMotore:S.sheets[i].tracker?"contiene versamenti, quote o valori che crescono con i soldi aggiunti":"",righe:sheetRows(aoa,max)}))});
  for(const max of [30,20,12,8]){const p=build(max);if(JSON.stringify(p).length<70000)return p;}
  return build(5);
}
function colLetterUI(i){let s="";i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;}
async function requestUnderstand(){
  S.ai=null;S.und={status:"loading"};renderAI();
  try{
    const r=await fetch("/api/understand",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(undPayload()),signal:AbortSignal.timeout(60000)});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||`Il server ha risposto con un errore (${r.status}).`);
    S.und={status:"ready",...j};
  }catch(e){
    S.und={status:"error",msg:e.name==="TimeoutError"||e.name==="AbortError"?"L'IA non ha risposto in tempo. Riprova.":e instanceof TypeError?"La ricostruzione con IA funziona nella versione del sito pubblicata su Vercel.":String(e.message||e)};
  }
  renderAI();
}
function renderUnderstand(el){
  const u=S.und;
  if(u.status==="loading"){el.innerHTML=`<div class="thinking"><i></i><i></i><i></i><span>L'IA sta leggendo ${Math.min(12,S.raw.length)} ${S.raw.length===1?"foglio":"fogli"} per capire che file è…</span></div>`;return;}
  if(u.status==="rebuilding"){el.innerHTML=`<div class="thinking"><i></i><i></i><i></i><span>${esc(u.progress||`Scarico lo storico di mercato di ${u.posizioni.length} strumenti e ricostruisco il file…`)}</span></div><p class="caption">Le analisi useranno i prezzi di mercato di ogni strumento, non i valori del tuo Excel.</p>`;return;}
  if(u.status==="error"){el.innerHTML=`<p style="color:var(--muted)">${esc(u.msg)}</p><div class="row" style="display:flex;gap:10px"><button type="button" class="btn" id="aiUnderstand">Riprova</button><button type="button" class="btn" id="undDismiss">Chiudi</button></div>`;return;}
  const tipo=`<span class="chip hist"><i></i>${esc(TIPO_L[u.tipo]||u.tipo)}</span>`;
  const scart=(u.scartati||[]).length?`<p class="caption">Scartato: ${u.scartati.map(esc).join(" · ")}</p>`:"";
  const err=u.err?`<p class="err">${esc(u.err)}</p>`:"";
  if(u.tipo==="serie_storica"&&u.serie&&u.serie.asset.length){
    el.innerHTML=`<div class="row" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${tipo}<span class="caption">foglio «${esc(u.foglio)}»</span></div><p class="lead">${esc(u.spiegazione)}</p>
      <ul class="props">${u.serie.colonnaData?`<li><span class="k">Colonna ${esc(u.serie.colonnaData)}</span><span class="chg"><b>Data</b></span></li>`:""}${u.serie.asset.map(x=>`<li><span class="k">Colonna ${esc(x.col)}</span><span class="chg"><b>${esc(x.nome)}</b> · ${esc((ROLES.find(r=>r.v===x.tipo)||{}).l||x.tipo)}</span></li>`).join("")}</ul>
      ${scart}${err}<div class="row" style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn primary" id="undApply" data-mag>Usa solo questi ${u.serie.asset.length} asset</button><button type="button" class="btn" id="undDismiss">Ignora</button></div>`;
    return;
  }
  if(u.tipo==="riepilogo_portafoglio"&&u.posizioni.length){
    const pc=x=>x==null?"—":fmtPct(x,1);
    el.innerHTML=`<div class="row" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${tipo}<span class="caption">foglio «${esc(u.foglio)}»</span></div><p class="lead">${esc(u.spiegazione)}</p>
      <div class="tablewrap"><table class="mt pos"><thead><tr><th>Strumento</th><th>Simbolo per i prezzi</th><th>Valore</th><th>Peso attuale</th><th>Peso target</th></tr></thead><tbody>
      ${u.posizioni.map((p,i)=>`<tr><td><span class="an">${esc(p.nome)}</span><span class="cl mono">${esc(p.ticker)}</span></td><td><input class="sym" id="und-sym-${i}" value="${esc(p.simbolo)}" aria-label="Simbolo di ${esc(p.nome)}" spellcheck="false"></td><td class="mono">${p.valore==null?"—":fmtN(p.valore)+" €"}</td><td class="mono">${pc(p.pesoAttuale)}</td><td class="mono">${pc(p.pesoTarget)}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="caption">Il simbolo è proposto ${u.local?"dal ticker scritto nel file":"dall'IA"} (formato TICKER.BORSA: .LON Londra, .DEX Xetra). Correggilo se serve: lo storico arriva da Yahoo Finance (Alpha Vantage come riserva) e viene convertito in euro con il cambio BCE di fine mese.</p>
      ${scart}${err}<div class="row" style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn primary" id="undRebuild" data-mag>Scarica lo storico e ricostruisci il file</button><button type="button" class="btn" id="undDismiss">Ignora</button></div>`;
    return;
  }
  el.innerHTML=`<div class="row" style="display:flex;gap:10px;align-items:center">${tipo}</div><p class="lead">${esc(u.spiegazione||"Non ho trovato serie storiche né posizioni di portafoglio da analizzare.")}</p>
    <p style="color:var(--muted)">${u.tipo==="movimenti"?"I file di movimenti (acquisti e vendite) non sono ancora supportati: arriveranno in un prossimo modulo.":"Carica un file con date e prezzi, oppure un riepilogo delle tue posizioni."}</p>${scart}
    <div><button type="button" class="btn" id="undDismiss">Chiudi</button></div>`;
}
function applyUnderstandSeries(){
  const u=S.und,si=S.sheets.findIndex(s=>s.name===u.foglio);
  if(si>=0)S.sheetIdx=si;
  initRoles();const A=an(),dIdx=u.serie.colonnaData?colIndex(u.serie.colonnaData):-1;
  const keep=new Map(u.serie.asset.map(x=>[colIndex(x.col),x]));
  A.cols.forEach(c=>{
    if(c.idx===dIdx)S.roles[c.idx]="date";
    else if(keep.has(c.idx)){S.roles[c.idx]=keep.get(c.idx).tipo;S.aiRoles[c.idx]="asset individuato: "+keep.get(c.idx).nome;}
    else S.roles[c.idx]="ignore";
    S.touched[c.idx]=true;
  });
  S.aiLog=[`Ricostruzione IA: tenuti ${keep.size} asset${dIdx>=0?" e la colonna data":""}, scartato tutto il resto.`,...(u.scartati||[]).map(x=>"Scartato: "+x)];
  S.und=null;hideLab();renderImport(false);morphData();
}
const ISIN_RX=/^[A-Z]{2}[A-Z0-9]{9}\d$/;
/* ---------- Strumenti con poca storia: estensione con lo stesso indice, esclusione o soli mesi comuni ---------- */
const PROXY=[[/msci world|ftse developed world|developed world/i,"IWDA.AMS","MSCI World"],[/s&p ?500|sp ?500/i,"SXR8.DEX","S&P 500"],[/nasdaq[- ]?100/i,"CNDX.AMS","Nasdaq-100"],[/emerging|msci em\b|\bem imi\b/i,"EMIM.AMS","MSCI Emerging Markets"],[/all[- ]world|acwi/i,"VWRL.AMS","FTSE All-World"],[/stoxx europe 600/i,"EXSA.DEX","STOXX Europe 600"]];
/* prezzi in euro, mese per mese (GBX = pence) */
function eurMap(s,fxm){const c=String(s.currency||"").toUpperCase(),cc=c==="GBX"||c==="GBP"?"GBP":c||null,pence=c==="GBX",m=new Map();
  s.points.forEach(x=>{const k=x.d.slice(0,7);let v=x.v/(pence?100:1);if(cc&&cc!=="EUR"){const r=fxm[cc]&&fxm[cc].get(k);if(!(r>0))return;v/=r;}m.set(k,{d:x.d,v:+v.toFixed(6)});});return m;}
function findYoung(){
  const R=S.rb,starts=R.cols.map(c=>[...c.map.keys()].sort()[0]),sorted=[...starts].sort(),med=sorted[Math.floor(sorted.length/2)];
  const mi=k=>{const [y,m]=k.split("-").map(Number);return y*12+m;};
  R.cols.forEach((c,i)=>{c.first=starts[i];c.young=R.cols.length>1&&mi(starts[i])-mi(med)>=36&&c.map.size<60;
    const px=PROXY.find(p=>p[0].test(c.info+" "+c.name));c.proxySym=px&&px[1]!==c.sym?px[1]:null;c.proxyIdx=px?px[2]:null;});
}
/* tabella dei prezzi dalle decisioni: esclusi fuori, estesi con l'indice prima del primo prezzo, «mesi comuni» = solo i mesi di tutti */
function rbAoa(){
  const R=S.rb,cols=R.cols.filter(c=>S.youngRes[c.name]!=="exclude");
  const ser=cols.map(c=>{let m=c.map;if(S.youngRes[c.name]==="proxy"&&c.proxy){const f=[...c.map.keys()].sort()[0],a=c.map.get(f),b=c.proxy.get(f);if(a&&b){m=new Map(c.map);const k=a.v/b.v;for(const [mm,x] of c.proxy)if(mm<f)m.set(mm,{d:x.d,v:+(x.v*k).toFixed(6)});}}return {name:c.name,m};});
  let months=[...new Set(ser.flatMap(x=>[...x.m.keys()]))].sort();
  if(cols.some(c=>c.young&&S.youngRes[c.name]==="keep"))months=months.filter(k=>ser.every(x=>x.m.has(k)));
  const aoa=[["Data",...ser.map(x=>x.name)]];
  const today=new Date();
  months.forEach(k=>{const [y,mo]=k.split("-").map(Number),end=new Date(Date.UTC(y,mo,0)),d=end>today?new Date(Date.UTC(today.getFullYear(),today.getMonth(),today.getDate())):end;aoa.push([`${String(d.getUTCDate()).padStart(2,"0")}/${String(mo).padStart(2,"0")}/${y}`,...ser.map(x=>x.m.has(k)?x.m.get(k).v:null)]);});
  return aoa;
}
async function youngDecide(c,act){
  if(act==="proxy"&&!c.proxy){
    const j=await getJSON(`/api/prices?symbol=${encodeURIComponent(c.proxySym)}&v=4`);if(j.error||!j.points)return `Indice ${c.proxySym} non disponibile: ${j.error||"riprova"}`;
    const cc=String(j.currency||"").toUpperCase(),need=cc==="GBX"?"GBP":cc;if(need&&need!=="EUR"&&!S.rb.fxm[need]){const f=await getJSON(`/api/fx?ccy=${need}`);if(f.points)S.rb.fxm[need]=new Map(f.points.map(x=>[x.p,x.v]));}
    c.proxy=eurMap(j,S.rb.fxm);
  }
  S.youngRes[c.name]=act;
  const pf=S.portfolio,log=S.rbLog||[],name=S.source.name;
  load([{name:"Prezzi mensili",aoa:rbAoa()}],{name,size:0,kind:"rebuilt"},false);
  S.portfolio=pf;
  S.aiLog=[...log,...S.rb.cols.filter(x=>S.youngRes[x.name]).map(x=>S.youngRes[x.name]==="proxy"?`${x.name}: prima del ${x.first} usa l'indice ${x.proxyIdx} (${x.proxySym}), riscalato sul primo prezzo vero. È un'approssimazione: le due quotazioni seguono lo stesso indice ma con costi e metodi di replica diversi.`:S.youngRes[x.name]==="exclude"?`${x.name}: escluso dalle analisi per lo storico troppo corto (dal ${x.first}); i pesi sono ricalcolati sugli altri.`:`${x.name}: analisi solo sui mesi in cui esistono tutti gli strumenti.`)];
  renderImport(false);return null;
}

/* da ISIN a simbolo di borsa (OpenFIGI, lato server): per le posizioni che nel file non hanno un ticker utilizzabile */
async function resolveIsins(pos){
  const need=pos.filter(p=>!p.simbolo&&(p.isin||ISIN_RX.test(p.ticker||"")));if(!need.length)return [];
  const isins=[...new Set(need.map(p=>p.isin||p.ticker))],found=new Map();
  for(let i=0;i<isins.length;i+=10){const j=await getJSON(`/api/isin?isin=${isins.slice(i,i+10).join(",")}`);(j.results||[]).forEach(r=>{if(r&&(r.simbolo||r.stato))found.set(r.isin,r);});}
  need.forEach(p=>{const r=found.get(p.isin||p.ticker);if(r&&r.simbolo){p.simbolo=r.simbolo;p.alt=r.alternative||[];p.isinFrom=r.nome;}else if(r&&r.stato)p.stato=r.stato;});
  return need.map(p=>`${p.nome}: ${p.simbolo?`${p.isin||p.ticker} → ${p.simbolo}`:p.stato?`titolo di Stato ${p.stato.nome}`:"ISIN non trovato"}`);
}
/* BTP, BOT e CTZ a tasso fisso senza quotazione di borsa: prezzo stimato dalla curva della Banca d'Italia.
   Cedola e scadenza da OpenFIGI (con l'ISIN) o dal nome («BTP 3,35% 01MZ35»); il prezzo del file, se c'è con la sua data, allinea la stima. */
function btpAssign(pos){
  pos.forEach(p=>{if(p.simbolo&&!isBtpSym(p.simbolo))return;
    let sym=isBtpSym(p.simbolo)?p.simbolo:null;
    if(!sym){const st=p.stato,nm=p.nome||p.titolo||p.ticker||"",tipo=st?st.tipo:P.btpTipo(nm,p.isin);if(tipo!=="fisso")return;
      const bi=st?null:bondInfo(nm);sym=st?btpSym(st.cedola,st.scadenza):bi?btpSym(bi.cpn,bi.mat):null;if(!sym)return;}
    p.simbolo=sym;p.btp=true;p.per100=true;
    const px=+p.prezzo,d=p.data?String(p.data).slice(0,10):null;p.ancora=px>40&&px<200&&d&&/^\d{4}-\d{2}-\d{2}$/.test(d)?{prezzo:px,data:d}:null;
    if(!p.ticker||ISIN_RX.test(p.ticker)||p.labelIsName||bondInfo(p.ticker)||isBtpSym(p.ticker))p.ticker=btpEtichetta(sym);});
}
const whyNoSym=p=>{const t=p.stato?p.stato.tipo:P.btpTipo(p.nome||p.ticker||"",p.isin);
  if(t==="indicizzato")return "titolo di Stato con cedole che cambiano (legate all'inflazione o crescenti): il prezzo non si può stimare dalla curva dei BTP, quindi resta fuori dalle analisi";
  if(t==="variabile")return "CCT a tasso variabile: il prezzo non si può stimare dalla curva dei BTP, quindi resta fuori dalle analisi";
  if(t==="estero")return "titolo di Stato estero: le fonti gratuite non pubblicano lo storico dei prezzi, quindi resta fuori dalle analisi";
  if(t==="fisso")return "titolo di Stato a tasso fisso, ma dal nome non si leggono cedola e scadenza: scrivi l'ISIN, oppure il simbolo BTP:cedola:scadenza (es. BTP:3.35:2035-03-01)";
  if(isBondPos(p))return "obbligazione: le fonti gratuite non pubblicano lo storico dei prezzi, quindi resta fuori dalle analisi";
  return "senza simbolo di borsa: scrivilo nella tabella per includerlo";};
async function rebuildFromPrices(o={}){
  /* o.quiet: ricostruzione in sottofondo (esempio all'apertura), senza cambiare pagina; se nel frattempo arriva un altro file si abbandona */
  const u=S.und,src0=S.source;
  let pos=u.posizioni.map((p,i)=>({...p,simbolo:String(((document.getElementById("und-sym-"+i)||{}).value)||p.simbolo||"").trim().toUpperCase()}));
  S.lastUnd={...u,posizioni:pos.map(p=>({...p}))};
  S.und={...u,posizioni:pos,status:"rebuilding",err:null,progress:""};renderAI();
  const prog=t=>{if(S.und&&S.und.status==="rebuilding"){S.und.progress=t;renderAI();}};
  try{
    /* con l'ISIN nel file comanda l'ISIN (identificativo ufficiale): il simbolo suggerito (dall'IA o indovinato) diventa una riserva.
       Un simbolo cambiato a mano dall'utente nella tabella resta il primo. */
    pos.forEach((p,i)=>{const sug=String((u.posizioni[i]||{}).simbolo||"").trim().toUpperCase();if(p.isin&&ISIN_RX.test(p.isin)&&p.simbolo&&p.simbolo===sug){p.simboloHint=p.simbolo;p.simbolo="";}});
    prog("Cerco i simboli di borsa degli ISIN…");
    const isinLog=await resolveIsins(pos);
    pos.forEach(p=>{if(!p.simboloHint)return;if(!p.simbolo)p.simbolo=p.simboloHint;else if(p.simboloHint!==p.simbolo)p.alt=[...(p.alt||[]).filter(x=>x!==p.simboloHint),p.simboloHint];});
    btpAssign(pos);
    const noSym=pos.filter(p=>!p.simbolo);pos=pos.filter(p=>p.simbolo);
    if(!pos.length)throw new Error("Nessuno strumento ha un simbolo di borsa: scrivilo nella colonna «Simbolo per i prezzi».");
    // Un ETF per richiesta: la rete di Vercel conserva ogni serie 24 ore e la condivide tra tutti i visitatori.
    // Se un simbolo non scarica, si provano le altre quotazioni dello stesso ISIN.
    const series=[];
    /* limite al minuto del piano gratuito di Alpha Vantage: si aspetta e si riprova, fino a 4 volte per simbolo */
    const fetchSym=async(sym,pp)=>{if(isBtpSym(sym)){const j=await btpPrezzi(sym,pp&&pp.ancora);return {r:{ok:!j.error,status:j.error?502:200},j};}const U=`/api/prices?symbol=${encodeURIComponent(sym)}&v=4`,hit=netGet(U);if(hit)return {r:{ok:true,status:200},j:hit};for(let k=0;k<5;k++){const r=await fetch(`/api/prices?symbol=${encodeURIComponent(sym)}&v=4`,{signal:AbortSignal.timeout(45000)});const j=await r.json().catch(()=>({}));
      if(j.error&&/limite/i.test(j.error)&&k<4){for(let w=20;w>0;w--){prog(`Limite al minuto di Alpha Vantage: riprovo ${sym} tra ${w} s…`);await new Promise(res=>setTimeout(res,1000));}continue;}if(r.ok&&!j.error&&j.points&&j.points.length)netPut(U,j);return {r,j};}};
    for(const [n,p] of pos.entries()){
      let got=null,tried=[];
      let short=null;
      const cands=[p.simbolo,...(p.alt||[]).filter(x=>x!==p.simbolo)].filter(Boolean).slice(0,7);
      for(const sym of cands){
        tried.push(sym);prog(`Scarico lo storico di ${p.ticker||p.nome} (${sym}) · ${n+1} di ${pos.length}…`);
        const {r,j}=await fetchSym(sym,p);
        /* meno di 6 mesi di prezzi: si tiene come riserva e si prova la quotazione successiva (stesso titolo su un'altra borsa) */
        if(r.ok&&!j.error&&j.points&&j.points.length&&j.points.length<6&&sym!==cands[cands.length-1]){if(!short||j.points.length>short.j.points.length)short={sym,j};continue;}
        if(r.ok&&!j.error&&j.points&&j.points.length){got=j;if(sym!==p.simbolo){p.simboloOrig=p.simbolo;p.simbolo=sym;}break;}
        got={symbol:sym,error:j.error||`Errore ${r.status} per ${sym}.`};
        if(/limite giornaliero/i.test(got.error))break;
      }
      if((!got||got.error)&&short){got=short.j;if(short.sym!==p.simbolo){p.simboloOrig=p.simbolo;p.simbolo=short.sym;}}
      /* il simbolo indicato (dal file o dall'IA) non esiste: se c'è l'ISIN, si cercano le sue quotazioni su OpenFIGI e si riprova */
      /* quotazione con meno di 5 anni di storia: lo stesso ISIN su un'altra borsa può averne molta di più (VWCE ad Amsterdam dal 2023, a Francoforte dal 2019) */
      const yrs=j=>{const pts=j&&j.points;return pts&&pts.length>1?(new Date(pts[pts.length-1].d)-new Date(pts[0].d))/(365.25*864e5):0;};
      if(!got.error&&!p.btp&&yrs(got)<5&&p.isin&&ISIN_RX.test(p.isin)){
        let alts=(p.alt||[]).filter(x=>!tried.includes(x));
        if(!alts.length){const jj=await getJSON(`/api/isin?isin=${p.isin}`),rr=(jj.results||[])[0];alts=(rr&&rr.simbolo?[rr.simbolo,...(rr.alternative||[])]:[]).filter(x=>!tried.includes(x));}
        for(const s2 of alts.slice(0,3)){tried.push(s2);prog(`${p.ticker||p.nome}: cerco una quotazione con più storia (${s2})…`);
          const {r:r2,j:j2}=await fetchSym(s2);
          if(r2.ok&&!j2.error&&j2.points&&j2.points.length&&yrs(j2)>yrs(got)+1){got=j2;p.simboloOrig=p.simboloOrig||p.simbolo;p.simbolo=s2;}}
      }
      if(got.error&&!p.btp&&!/limite giornaliero/i.test(got.error)&&p.isin&&ISIN_RX.test(p.isin)&&!p.isinTried){p.isinTried=true;
        prog(`${tried[tried.length-1]||p.simbolo} non trovato: cerco le quotazioni dell'ISIN ${p.isin}…`);
        const j=await getJSON(`/api/isin?isin=${p.isin}`),r=(j.results||[])[0];
        for(const s2 of (r&&r.simbolo?[r.simbolo,...(r.alternative||[])]:[]).filter(x=>!tried.includes(x)).slice(0,4)){
          tried.push(s2);prog(`Scarico lo storico di ${p.ticker||p.nome} (${s2}) · ${n+1} di ${pos.length}…`);
          const {r:r2,j:j2}=await fetchSym(s2);
          if(r2.ok&&!j2.error&&j2.points&&j2.points.length){got=j2;p.simboloOrig=p.simbolo;p.simbolo=s2;break;}
        }}
      if(got.error&&tried.length>1)got.error+=` (provati: ${tried.join(", ")})`;
      series.push(got);
    }
    /* senza ticker nel file l'etichetta era il nome lungo del fondo: si usa il ticker di borsa della quotazione trovata (IWDA.AMS → IWDA) */
    const used=new Set(pos.map(p=>p.ticker));pos.forEach((p,i)=>{if(!p.labelIsName||p.btp||series[i].error)return;const t=String(p.simbolo||"").split(".")[0];/* i fondi comuni su Yahoo hanno codici tipo 0P0000ABTK: resta il nome del fondo */if(t&&!/^0P[0-9A-Z]{8}$/.test(t)&&!used.has(t)){used.add(t);p.ticker=t;}});
    S.isinLog=isinLog;S.noSym=noSym;
    const ok=[],bad=[];
    series.forEach((s,i)=>{(s.error?bad:ok).push({p:pos[i],s});});
    if(!ok.length)throw new Error(bad.map(b=>b.s.error).join(" ")||"Nessun prezzo scaricato.");
    /* tutto in euro: ogni serie nella sua valuta di quotazione viene convertita con il cambio BCE di fine mese
       (pence GBX → sterline ÷ 100, poi ÷ unità di valuta per 1 euro) */
    const ccyOf=s=>{const c=String(s.currency||"").toUpperCase();return c==="GBX"||c==="GBP"?"GBP":c||null;};
    const need=[...new Set(ok.map(o=>ccyOf(o.s)).filter(c=>c&&c!=="EUR"))],fxm={},fxErr=[];
    for(const c of need){const j=await getJSON(`/api/fx?ccy=${c}`);if(j.error||!j.points)fxErr.push(`${c}: ${j.error||"cambio non disponibile"}`);else fxm[c]=new Map(j.points.map(x=>[x.p,x.v]));}
    if(fxErr.length)throw new Error(`Non riesco a convertire in euro (${fxErr.join("; ")}). Riprova tra poco.`);
    const unknown=ok.filter(o=>!ccyOf(o.s)).map(o=>o.p.simbolo);
    const maps=ok.map(o=>eurMap(o.s,fxm));
    /* nel frattempo è arrivato un altro file (es. l'esempio ricostruito in sottofondo mentre l'utente carica il suo): non si toccano i suoi prezzi */
    if(S.source!==src0)return;
    S.rb={cols:ok.map((o,i)=>({name:o.p.ticker||o.p.nome,nome:o.p.nome,map:maps[i],info:o.s.info||"",sym:o.p.simbolo,src:o.s.source||"Alpha Vantage",cur:o.s.currency||null,adj:!!o.s.adjusted,orig:o.p.simboloOrig||null,removed:o.s.vol&&o.s.vol.removed||0})),fxm,origName:S.source.name.replace(/ · ricostruito$/,""),origSource:S.source.kind==="file"?S.source:(S.rb&&S.rb.origSource)||S.source};S.youngRes={};
    findYoung();
    const aoa=rbAoa();
    if(aoa.length<14)throw new Error("Lo storico degli strumenti è troppo corto (meno di un anno). Prova a cambiare i simboli.");
    const months={length:aoa.length-1};
    if(S.source!==src0)return;
    const orig=S.source.name.replace(/ · ricostruito$/,""),scartati=u.scartati||[];
    const pf={monthly:avgMonthly(),from:orig,positions:ok.map(o=>({...o.p,adjusted:o.s.adjusted,currency:o.s.currency||null,vol:o.s.vol||null,yahoo:o.s.yahoo||null,stima:o.s.stima||null,pxStima:o.s.prezzi&&o.s.prezzi.length?o.s.prezzi[o.s.prezzi.length-1]:null})),missing:[...bad.map(b=>({nome:b.p.nome,simbolo:b.p.simbolo,err:b.s.error})),...(S.noSym||[]).map(p=>({nome:p.nome,simbolo:"",err:whyNoSym(p)}))],base:"EUR"};
    load([{name:"Prezzi mensili",aoa}],{name:`${orig.replace(/\.[^.]+$/,"")} · ricostruito`,size:0,kind:"rebuilt"},!o.quiet);
    S.portfolio=pf;S.rbLog=null;
    S.aiLog=[...(S.isinLog||[]).map(x=>"ISIN cercato su OpenFIGI: "+x),...ok.filter(o=>o.s.stima).map(o=>btpNota(o.s)),...ok.filter(o=>o.p.simboloOrig).map(o=>`${o.p.nome}: ${o.p.simboloOrig} non disponibile, usata la quotazione ${o.p.simbolo}`),`File ricostruito con i prezzi di mercato, non con i valori del tuo Excel (che includono versamenti, vendite e spostamenti di liquidità): ${ok.length} ${ok.length===1?"strumento":"strumenti"}, ${months.length} mesi di prezzi di mercato da ${[...new Set(ok.map(o=>o.s.source||"Alpha Vantage"))].join(" e ")} (${ok.every(o=>o.s.adjusted)?"chiusure rettificate per dividendi e frazionamenti"+(ok.some(o=>o.s.stima)?"; per i BTP indice con le cedole reinvestite":""):"chiusure"}), tutto convertito in euro con il cambio BCE di fine mese.`,
      `Valute di quotazione: ${ok.map(o=>`${o.p.ticker||o.p.nome} ${o.s.currency||"sconosciuta"}`).join(", ")}.`,
      ...(unknown.length?[`Valuta non determinata per ${unknown.join(", ")}: lasciata com'è, verifica il simbolo.`]:[]),
      ...pf.missing.map(m=>`Non scaricato: ${m.nome}${m.simbolo?` (${m.simbolo})`:""}. ${m.err}`),...scartati.map(x=>"Scartato: "+x)];
    S.rbLog=[...S.aiLog];
    renderImport(false);
    if(S.rb&&S.rb.origSource&&(S.rb.origSource.builder||S.rb.origSource.screenshot)&&!o.quiet)setTimeout(()=>{const b=$("#confirmBtn");if(b&&!b.disabled)b.click();},900);
  }catch(e){
    if(S.source!==src0)return;
    track("import_fail",{kind:importKind(),why:"prezzi: "+String(e.message||e).slice(0,70)});
    S.und={...S.und,status:"ready",err:e instanceof TypeError?"Lo storico dei prezzi si scarica nella versione del sito pubblicata su Vercel.":String(e.message||e)};renderAI();
  }
}

/* ---------- Importazione: confidenza, conferme obbligatorie, anomalie, valute, memoria dei modelli ----------
   Principio: meglio due conferme in più che un'analisi costruita su dati sbagliati.
   S.res = decisioni dell'utente sulle verifiche; S.fix = correzioni dei prezzi (frazionamenti, unità, date future);
   S.cconf = colonne incerte confermate; S.ccyDone = conversioni di valuta già fatte. */
function resetImportState(){S.doneChecks={};S.res={};S.fix={adjust:{},exclude:{},dropFuture:false};S.cconf=new Set();S.ccyDone={};}
function fixOpts(){const A=an();return {adjust:S.fix.adjust,exclude:S.fix.exclude,dropFuture:S.fix.dropFuture,values:!!(A&&A.virtual&&S.wide&&S.wide.sheets.some(x=>x.name===A.name))};}
const ASSETR=["price","ret","retpct"];
function colSource(A,c){
  if(S.touched[c.idx])return "utente";
  if(S.source&&S.source.kind==="rebuilt"&&c.suggest==="price")return "mercato";
  if(S.tplCols&&S.tplCols.has(c.idx))return "modello";
  if(A.virtual&&A.fromAI)return "IA";
  return "auto";
}
function sheetCcy(A,c){const v=A.ccyArr&&A.ccyArr[c.idx];return (S.ccyDone[A.name]&&S.ccyDone[A.name][c.idx])?"EUR":v||c.ccy||null;}
function computeChecks(A,ds){
  const out=[],R=S.res,canRebuild=!!(S.und&&S.und.posizioni&&S.und.posizioni.some(p=>p.simbolo||p.isin||ISIN_RX.test(p.ticker||"")));
  /* 1) due letture diverse dello stesso file: l'utente sceglie */
  if(S.conflict)out.push({id:"conflict",block:true,title:"L'IA e la lettura automatica non sono d'accordo",text:S.conflict.text,acts:[["ai","Usa la lettura dell'IA"],["auto","Usa la lettura automatica"]]});
  /* 2) lettura fatta solo dall'IA, senza conferme da altre fonti: va guardata una volta */
  if(A.virtual&&A.fromAI&&!S.agree&&!S.tplUsed)out.push({id:"aiRead",block:true,title:"Lettura dell'IA da verificare",text:`Le serie del foglio «${A.name}» le ha individuate l'IA. Controlla nella mappa qui sotto che nomi e colonne siano giusti.`,acts:[["ok","Ho controllato, è giusta"]]});
  /* 3) colonne con interpretazione incerta */
  const unsure=A.cols.filter(c=>{const r=S.roles[c.idx];return r!=null&&r!=="ignore"&&(c.conf==="media"||c.conf==="bassa")&&!S.touched[c.idx]&&!S.cconf.has(c.idx)&&colSource(A,c)!=="modello";});
  if(unsure.length)out.push({id:"unsure",block:true,title:`${unsure.length} ${unsure.length===1?"colonna da verificare":"colonne da verificare"}`,text:unsure.map(c=>`«${c.name}» → ${(ROLES.find(r=>r.v===S.roles[c.idx])||{}).l}: ${c.reason}`).join(" · "),acts:[["ok","Le ho controllate, confermo"],["show","Mostramele"]],cols:unsure.map(c=>c.idx)});
  /* 4) valori di patrimonio invece di prezzi */
  const flowy=(A.virtual&&S.wide&&S.wide.sheets.some(s=>s.name===A.name))||A.cols.some(c=>c.flowValue&&ASSETR.includes(S.roles[c.idx]));
  if(flowy)out.push({id:"flows",block:true,title:"Sono valori di patrimonio, non prezzi",text:"Contengono i soldi che hai aggiunto o tolto: un versamento sembra un guadagno, una vendita o uno spostamento di liquidità sembra un crollo, e la volatilità esce falsata (anche oltre il 100%). Volatilità, correlazioni e frontiera vanno calcolate sui prezzi di mercato di ogni strumento."+(canRebuild?"":" In questo file non ci sono ticker o ISIN: scrivili nel riquadro qui sopra oppure analizza i valori sapendo che i rischi saranno falsati."),acts:canRebuild?[["rebuild","Usa i prezzi di mercato (consigliato)"],["ok","Analizza comunque i valori del file"]]:[["ok","Analizza comunque i valori del file"]]});
  /* 5) valute diverse dall'euro */
  if(ds&&ds.ok){const cc=A.cols.filter(c=>ASSETR.includes(S.roles[c.idx])).map(c=>[c,sheetCcy(A,c)]).filter(([,v])=>v&&v!=="EUR");
    if(cc.length)out.push({id:"ccy",block:true,title:"Serie in valute diverse dall'euro",text:cc.map(([c,v])=>`«${c.name}» in ${v}`).join(" · ")+". Mescolare valute falsa correlazioni e rischio: conviene convertire con il cambio ufficiale BCE di fine mese.",acts:[["convert","Converti in euro"],["keep","Lascia nella valuta originale"]],cc:cc.map(([c,v])=>[c.idx,v])});}
  /* strumenti con poca storia: senza una scelta tagliano a pochi mesi rischio, correlazioni e frontiera di tutto il portafoglio */
  if(S.rb&&S.source&&S.source.kind==="rebuilt")S.rb.cols.filter(c=>c.young).forEach(c=>{const id="young:"+c.name;if(S.youngRes[c.name])R[id]=S.youngRes[c.name];
    out.push({id,block:true,title:`${c.name}: storico corto (dal ${c.first}, ${c.map.size} mesi)`,text:`Gli altri strumenti hanno molti anni di prezzi. Con ${c.name} dentro così com'è, rischio, correlazioni e frontiera userebbero solo i mesi in cui esistono tutti: troppo pochi per stime affidabili.${c.proxySym?` ${c.name} replica l'indice ${c.proxyIdx}: per gli anni precedenti si può usare ${c.proxySym}, che segue lo stesso indice.`:""}`,
      acts:[...(c.proxySym?[["proxy",`Estendi con ${c.proxySym} (stesso indice)`]]:[]),["exclude","Escludi dalle analisi"],["keep","Usa solo i mesi comuni"]],young:c});});
  /* portafoglio ricostruito a cui mancano strumenti: niente risultati parziali in silenzio */
  if(S.portfolio&&S.portfolio.missing&&S.portfolio.missing.length&&S.source&&S.source.kind==="rebuilt"){
    const M=S.portfolio.missing,tot=(S.lastUnd&&S.lastUnd.posizioni||[]).reduce((q,p)=>q+(p.valore||0),0),mv=M.reduce((q,m)=>q+(((S.lastUnd&&S.lastUnd.posizioni)||[]).find(p=>p.nome===m.nome)||{}).valore||0,0);
    out.push({id:"partial",block:true,title:`${M.length===1?"Manca":"Mancano"} ${M.length} ${M.length===1?"strumento":"strumenti"}${tot&&mv?` (${fmtPct(mv/tot,0)} del valore)`:""}`,text:M.map(m=>`${m.nome}${m.simbolo?` (${m.simbolo})`:""}: ${m.err}`).join(" · ")+" Senza di loro pesi, rischio e frontiera descrivono solo una parte del portafoglio.",acts:[["retry","Riprova a scaricarli"],["ok","Procedi senza (pesi ricalcolati sul resto)"]]});
  }
  /* prezzi che si fermano troppo presto (risposta incompleta della fonte o cambio BCE mancante): valore e rendimento «di oggi» sarebbero di mesi fa */
  if(S.rb&&S.source&&S.source.kind==="rebuilt"&&!S.fastOpen){const now=new Date(),lim=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`,mAgo=k=>{const [y,m]=k.split("-").map(Number);return (now.getFullYear()-y)*12+now.getMonth()+1-m;};
    const old=S.rb.cols.map(c=>({c,last:[...c.map.keys()].sort().pop()})).filter(x=>x.last&&x.last<=lim&&mAgo(x.last)>2);
    if(old.length)out.push({id:"oldpx",block:true,title:old.length===1?`Prezzi di ${old[0].c.name} fermi a ${fmtDate(new Date(old[0].last+"-15"),12)}`:`Prezzi fermi a mesi fa per ${old.length} strumenti`,
      text:old.map(x=>`${x.c.name}: ultimo prezzo ${fmtDate(new Date(x.last+"-15"),12)}`).join(" · ")+". Il valore «di oggi», il rendimento e il rischio si fermerebbero a quella data. Di solito è una risposta incompleta della fonte dei prezzi: riprovare basta quasi sempre.",
      acts:S.lastUnd?[["retry","Riprova a scaricarli"],["ok","Procedi comunque"]]:[["ok","Procedi comunque"]]});}
  /* 6) anomalie dei dati */
  (ds&&ds.anomalies||[]).forEach(a=>{
    if(a.type==="future")out.push({id:"future",block:true,title:"Date nel futuro",text:a.text,acts:[["drop","Escludile"]]});
    else if(a.type==="flat")out.push({id:a.id,block:true,title:"Prezzi costanti",text:a.text,acts:canRebuild?[["rebuild","Usa i prezzi di mercato (consigliato)"],["drop","Escludi questa serie"]]:[["drop","Escludi questa serie"]],a});
    /* prezzi di mercato rettificati (Yahoo): frazionamenti già corretti, un salto grande è un movimento vero */
    else if((a.type==="split"||a.type==="unit")&&S.source&&S.source.kind==="rebuilt"&&S.rb&&S.rb.cols.every(c=>c.adj))return;
    else if(a.type==="split"||a.type==="unit")out.push({id:a.id,block:true,title:a.type==="unit"?"Possibile cambio di unità":"Possibile frazionamento",text:a.text,acts:[["fix",a.type==="unit"?"Correggi la scala":"Correggi i prezzi precedenti"],["exclude","Escludi questo periodo"],["keep","È un movimento vero"]],a});
  });
  const stale=(ds&&ds.anomalies||[]).filter(a=>a.type==="stale");
  if(stale.length)out.push({id:"stale",block:false,title:stale.length===1?"Valori fermi":`Valori fermi in ${stale.length} serie`,text:stale.length===1?stale[0].text:`${stale.map(a=>a.asset).join(", ")}: lo stesso valore per molti periodi di fila. Valori inseriti a mano o senza quotazione: la volatilità risulterà più bassa del vero.`,acts:[]});
  (S.recipe&&S.recipe.status==="done"&&S.recipe.errors||[]).slice(0,4).forEach((e,i)=>out.push({id:"rerr"+i,block:false,title:"Controllo della ricetta",text:e,acts:[]}));
  /* le correzioni già fatte fanno sparire l'anomalia dai dati: restano in elenco, annullabili */
  Object.values(S.doneChecks||{}).forEach(c=>{if(!out.some(x=>x.id===c.id))out.push(c);});
  return out.map(c=>({...c,done:R[c.id]!=null}));
}
function importConfidence(checks,A){
  const open=checks.filter(c=>c.block&&!c.done).length,src=S.tplUsed?"modello":S.agree?"concorde":A.virtual&&A.fromAI?"IA":"auto";
  if(open)return {lv:"bassa",l:`${open} ${open===1?"conferma richiesta":"conferme richieste"}`};
  if(src==="modello")return {lv:"alta",l:"Alta · modello già confermato da te"};
  if(src==="concorde")return {lv:"alta",l:"Alta · IA e lettura automatica concordano"};
  if(S.source&&S.source.kind==="rebuilt")return {lv:"alta",l:"Alta · prezzi di mercato scaricati per ogni strumento"};
  return {lv:checks.some(c=>c.done)?"alta":"media",l:checks.some(c=>c.done)?"Alta · verificata da te":"Media · lettura non verificata da una seconda fonte"};
}
function renderChecks(A,ds){
  const el=$("#checks");if(!el)return;
  const ch=computeChecks(A,ds);S.checks=ch;const conf=importConfidence(ch,A);
  const prev=ds&&ds.ok?previewHTML(ds):"";
  el.innerHTML=`<div class="chk-head"><h3>Prima di costruire il laboratorio</h3><span class="conf ${conf.lv==="alta"?"alta":conf.lv==="media"?"media":"bassa"}">Affidabilità: ${esc(conf.l)}</span>${S.tplUsed?`<button type="button" class="btn sm" id="tplForget">Dimentica questo modello</button>`:""}</div>
    ${ch.length?`<ul class="chk">${ch.map(c=>`<li class="${c.block?"blk":"info"} ${c.done?"done":""}"><b>${esc(c.title)}</b><span>${esc(c.text)}</span>${c.done?`<em>✓ ${esc((c.acts.find(a=>a[0]===S.res[c.id])||[,"fatto"])[1])}</em> <button type="button" class="btn sm" data-chk="${esc(c.id)}" data-act="undo">Annulla</button>`:c.acts.map(a=>`<button type="button" class="btn sm${a[0]==="fix"||a[0]==="convert"||a[0]==="ai"||a[0]==="drop"||a[0]==="rebuild"||(a[0]==="ok"&&!c.acts.some(x=>x[0]==="rebuild"))?" primary":""}" data-chk="${esc(c.id)}" data-act="${a[0]}">${esc(a[1])}</button>`).join("")}</li>`).join("")}</ul>`:`<p class="caption">Nessuna verifica richiesta: lettura confermata e dati senza anomalie.</p>`}
    ${prev}`;
}
function previewHTML(ds){
  const k=Math.min(ds.assets.length,5),n=ds.dates.length,idx=[...new Set([1,2,3,n-3,n-2,n-1].filter(i=>i>0&&i<n))];
  return `<details class="prev"><summary>Anteprima: cosa entra nel laboratorio (${ds.assets.length} serie, ${ds.nObs} date, frequenza ${ds.freq.label})</summary><div class="tablewrap"><table class="mt"><thead><tr><th>Data</th>${ds.assets.slice(0,k).map(a=>`<th>${esc(a.name)}</th>`).join("")}</tr></thead><tbody>${idx.map(i=>`<tr><td class="mono">${fmtDate(ds.dates[i],ds.freq.f)}</td>${ds.assets.slice(0,k).map(a=>`<td class="mono">${Number.isFinite(a.ret[i])?fmtPct(a.ret[i],2,true):"—"}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="caption">Rendimenti per periodo calcolati dal motore dopo le tue scelte${ds.assets.length>k?` · prime ${k} serie`:""}.</p></details>`;
}
function blockingOpen(){return (S.checks||[]).some(c=>c.block&&!c.done);}
document.addEventListener("click",async e=>{
  const b=e.target.closest("[data-chk]");if(!b)return;
  const id=b.dataset.chk,act=b.dataset.act,c=(S.checks||[]).find(x=>x.id===id);if(!c)return;
  if(act==="undo"&&!c.young){
    if(c.a){const a=c.a,arr=(S.fix.adjust[a.col]||[]).filter(x=>x.k!==a.k);S.fix.adjust[a.col]=arr;S.fix.exclude[a.col]=(S.fix.exclude[a.col]||[]).filter(k=>k!==a.k);}
    if(id==="future")S.fix.dropFuture=false;
    if(id==="unsure")(c.cols||[]).forEach(i=>S.cconf.delete(i));
    delete S.res[id];delete S.doneChecks[id];hideLab();renderImport(false);return;
  }
  if(act==="show"){const sel=document.querySelector(`#role-${c.cols[0]}`);if(sel){const row=sel.closest("tr");row.scrollIntoView({behavior:REDUCE?"auto":"smooth",block:"center"});row.classList.remove("flash");void row.offsetWidth;row.classList.add("flash");}return;}
  if(act==="rebuild"){S.autoRebuilt=S.source;rebuildFromPrices();return;}
  if(c.young&&act!=="undo"){b.disabled=true;b.textContent="Un momento…";const err=await youngDecide(c.young,act);if(err){b.disabled=false;b.textContent=err;}return;}
  if(c.young&&act==="undo"){delete S.youngRes[c.young.name];const pf=S.portfolio,log=S.rbLog||[];load([{name:"Prezzi mensili",aoa:rbAoa()}],{name:S.source.name,size:0,kind:"rebuilt"},false);S.portfolio=pf;S.aiLog=[...log];renderImport(false);return;}
  /* riprovando, niente risposte in memoria: prezzi e cambi si riscaricano */
  if((id==="partial"||id==="oldpx")&&act==="retry"&&S.lastUnd){netClear(/^\/api\/(prices|fx)\b/);S.und={...S.lastUnd,status:"ready",posizioni:S.lastUnd.posizioni.map(p=>({...p}))};S.lastSource=S.source;go("map");rebuildFromPrices();return;}
  if(c.a&&c.a.type==="flat"&&act==="drop"){S.roles[c.a.col]="ignore";S.touched[c.a.col]=true;S.res[id]=act;S.doneChecks[id]={...c};hideLab();renderImport(false);return;}
  if(id==="conflict"){S.res.conflict=act;const keep=S.conflict;S.conflict=null;if(act==="auto"){S.recipeChoice="auto";load(S.fileSheets,S.source,false,{forceAuto:true});S.res.conflict="auto";}else{S.agree=false;renderImport(false);}void keep;return;}
  if(c.a&&act==="fix"){const a=c.a;(S.fix.adjust[a.col]=S.fix.adjust[a.col]||[]).push({k:a.k,factor:a.factor});}
  if(c.a&&act==="exclude"){const a=c.a;(S.fix.exclude[a.col]=S.fix.exclude[a.col]||[]).push(a.k);}
  if(id==="future"&&act==="drop")S.fix.dropFuture=true;
  if(id==="unsure"&&act==="ok")(c.cols||[]).forEach(i=>S.cconf.add(i));
  if(id==="ccy"&&act==="convert"){b.disabled=true;b.textContent="Scarico i cambi BCE…";const ok=await convertCurrency(c.cc);if(!ok){b.disabled=false;b.textContent="Riprova la conversione";return;}}
  S.res[id]=act;if(c.a||id==="future"||id==="ccy")S.doneChecks[id]={...c};hideLab();renderImport(false);
});
/* conversione in euro con il cambio BCE di fine mese (unità di valuta per 1 euro); GBX = pence */
async function convertCurrency(list){
  const A=an(),si=S.sheetIdx,need=[...new Set(list.map(x=>x[1]==="GBX"?"GBP":x[1]))],fx={};
  for(const c of need){const j=await getJSON(`/api/fx?ccy=${c}`);if(j.error||!j.points){toastImport(`Cambio ${c} non disponibile: ${j.error||"riprova"}`);return false;}fx[c]=new Map(j.points.map(p=>[p.p,p.v]));}
  const aoa=S.raw[si].map(r=>Array.isArray(r)?[...r]:r),di=A.cols.find(c=>S.roles[c.idx]==="date");if(!di)return false;
  let miss=0;
  list.forEach(([ci,cur])=>{const role=S.roles[ci],m=fx[cur==="GBX"?"GBP":cur],div=cur==="GBX"?100:1;let prevRate=null;
    A.body.forEach(b=>{const r=b.r,d=P.parseDate(aoa[r][di.idx],di.hintDate);if(!d)return;const rate=m.get(d.toISOString().slice(0,7));const p=P.parseNum(aoa[r][ci]);
      if(!p){prevRate=rate||prevRate;return;}if(!(rate>0)){aoa[r][ci]=null;miss++;return;}
      if(role==="price")aoa[r][ci]=p.n/div/rate;
      else{const x=role==="retpct"?p.n/100:p.n,eur=prevRate?(1+x)*prevRate/rate-1:null;aoa[r][ci]=eur==null?null:role==="retpct"?eur*100:eur;}
      prevRate=rate;});});
  const roles={...S.roles},touched={...S.touched},nm=A.name;
  S.raw[si]=aoa;const B=P.analyzeSheet(nm,aoa);B.virtual=A.virtual;B.fromAI=A.fromAI;B.ccyArr=A.ccyArr;S.sheets[si]=B;S.roles=roles;S.touched=touched;
  S.ccyDone[nm]=Object.fromEntries(list.map(([ci])=>[ci,true]));
  S.aiLog=[...(S.aiLog||[]),`Convertite in euro con il cambio BCE di fine mese: ${list.map(([ci,c])=>`${(A.cols.find(x=>x.idx===ci)||{}).name} (${c})`).join(", ")}${miss?` · ${miss} valori senza cambio esclusi`:""}.`];
  return true;
}
function toastImport(msg){const t=$("#confirmText");if(t)t.innerHTML=`<b>${esc(msg)}</b>`;}

/* ---------- Memoria dei modelli: la struttura confermata di un file viene ricordata (solo in questo browser) ---------- */
const TPL_KEY="pos-templates-v1";
function tplAll(){try{return JSON.parse(localStorage.getItem(TPL_KEY)||"[]")||[];}catch{return [];}}
function tplGet(fp){return tplAll().find(t=>t.fp===fp)||null;}
function tplSave(){
  if(!S.source||S.source.kind!=="file"||!S.fp)return;
  const A=an(),roles={};A.cols.forEach(c=>{if(S.roles[c.idx]!=null)roles[c.name]=S.roles[c.idx];});
  const t={fp:S.fp,file:S.source.name,saved:new Date().toISOString(),recipe:S.recipe&&S.recipe.status==="done"?S.recipe.r:S.recipe&&S.recipe.status==="memory"?S.recipe.r:null,auto:S.res.conflict==="auto",sheet:A.name,roles,ccy:S.res.ccy||null,flows:S.res.flows||null};
  const all=tplAll().filter(x=>x.fp!==t.fp);all.unshift(t);try{localStorage.setItem(TPL_KEY,JSON.stringify(all.slice(0,25)));}catch{}
}
function tplForget(fp){try{localStorage.setItem(TPL_KEY,JSON.stringify(tplAll().filter(x=>x.fp!==fp)));}catch{}}
/* dopo il caricamento: foglio e ruoli come l'ultima volta (per nome di colonna) */
function tplApply(t){
  const si=S.sheets.findIndex(s=>s.name===t.sheet);if(si<0)return false;
  S.sheetIdx=si;S.roles={};S.touched={};S.tplCols=new Set();
  S.sheets[si].cols.forEach(c=>{const r=t.roles[c.name];if(r!==undefined){S.roles[c.idx]=r;S.tplCols.add(c.idx);}else S.roles[c.idx]=c.suggest;});
  if(t.flows)S.res.flows=t.flows;
  return true;
}

/* ---------- Tracker a matrice: le posizioni quotate dell'ultimo mese diventano un riepilogo da ricostruire con i prezzi veri ---------- */
/* simboli nel formato di Alpha Vantage: i suffissi di Yahoo (.L, .DE, .PA, .AS, .MI) vengono tradotti */
/* un solo modo di normalizzare i simboli, da qualunque fonte: «AMS:IWDA» → IWDA.AMS, suffissi Yahoo → Alpha Vantage, ISIN → da cercare */
function posEnrich(list,pos){const k=v=>String(v||"").trim().toUpperCase();
  list.forEach(p=>{const q=pos.find(x=>(x.ticker&&p.ticker&&k(x.ticker)===k(p.ticker))||(x.isin&&p.isin&&x.isin===p.isin)||(x.nome&&p.nome&&k(x.nome)===k(p.nome)));if(!q)return;
    if(!p.isin&&q.isin)p.isin=q.isin;if(q.nome&&(!p.nome||k(p.nome)===k(p.ticker)))p.nome=q.nome;
    const s=q.simbolo?normSym({simbolo:q.simbolo}):"";if(s)p.simbolo=s;
    if(p.pesoTarget==null&&q.pesoTarget!=null)p.pesoTarget=q.pesoTarget;});}
function normSym(p){const t=String(p.simbolo||"").trim().toUpperCase();if(!t||/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(t))return "";if(isBtpSym(t))return t;if(/^[A-Z0-9]{2,12}-(EUR|USD|GBP|CHF|USDT)$/.test(t))return t;if(/:/.test(t))return guessSymbol(t,"ETF",null)||"";if(/\./.test(t))return avSymbol(t);if(p.isin)return "";return guessSymbol(t,"ETF",null)||t;}
function avSymbol(x){const t=String(x||"").trim().toUpperCase();const m=t.match(/^([A-Z0-9\-]+)\.(L|DE|F|PA|AS|SW|MI)$/);if(!m)return t;return m[1]+"."+({L:"LON",DE:"DEX",F:"DEX",PA:"PAR",AS:"AMS",SW:"SWX",MI:"MIL"}[m[2]]);}
/* cripto principali: Yahoo pubblica il prezzo in euro come BTC-EUR, ETH-EUR… */
const CRYPTO={BTC:"BTC",BITCOIN:"BTC",XBT:"BTC",ETH:"ETH",ETHEREUM:"ETH",ETHER:"ETH",SOL:"SOL",SOLANA:"SOL",XRP:"XRP",RIPPLE:"XRP",ADA:"ADA",CARDANO:"ADA",DOGE:"DOGE",DOGECOIN:"DOGE",BNB:"BNB",DOT:"DOT",POLKADOT:"DOT",LTC:"LTC",LITECOIN:"LTC",AVAX:"AVAX",LINK:"LINK",/* aggiunte del 19/11/2026, simboli Yahoo verificati con i prezzi */CRO:"CRO",CRONOS:"CRO",USDC:"USDC",USDT:"USDT",TETHER:"USDT",POL:"POL28321",MATIC:"POL28321",POLYGON:"POL28321",ATOM:"ATOM",COSMOS:"ATOM",XLM:"XLM",STELLAR:"XLM",TRX:"TRX",TRON:"TRX",SHIB:"SHIB",UNI:"UNI7083",UNISWAP:"UNI7083",ALGO:"ALGO",ALGORAND:"ALGO",EGLD:"EGLD",MULTIVERSX:"EGLD",BCH:"BCH",ETC:"ETC",XMR:"XMR",MONERO:"XMR",FIL:"FIL",FILECOIN:"FIL",AAVE:"AAVE",HBAR:"HBAR",HEDERA:"HBAR",ICP:"ICP",VET:"VET",VECHAIN:"VET"};
function guessSymbol(label,type,cur){
  const t=String(label).trim().toUpperCase();let m;
  if(CRYPTO[t])return CRYPTO[t]+"-EUR";
  if((m=t.match(/^(EPA|PAR|EURONEXT):([A-Z0-9]+)$/)))return m[2]+".PAR";
  if((m=t.match(/^(BIT|MIL|BIT MI):([A-Z0-9]+)$/)))return m[2]+".MIL";
  if((m=t.match(/^(ETR|XETRA|FRA|GER):([A-Z0-9]+)$/)))return m[2]+".DEX";
  if((m=t.match(/^(LON|LSE):([A-Z0-9]+)$/)))return m[2]+".LON";
  if((m=t.match(/^(AMS):([A-Z0-9]+)$/)))return m[2]+".AMS";
  if((m=t.match(/^(NASDAQ|NYSE|NYSEARCA|AMEX):([A-Z0-9.]+)$/)))return m[2].replace(".","-");
  if(!/^[A-Z][A-Z0-9.\-]{0,6}$/.test(t))return null;
  if(/etf/i.test(type||""))return t+(cur==="EUR"?".DEX":".LON");
  return t.replace(".","-");
}
function wideSnapshot(W,sym){sym=sym||new Map();
  const D=W.detail||[],N=(W.months||[]).length,fmtM=m=>{const [y,mo]=m.split("-").map(Number);return fmtDate(new Date(Date.UTC(y,mo-1,1)),12);};
  /* quotata: ha un codice con la borsa scritto nel file, oppure è un'azione/ETF o una previdenza con un simbolo plausibile, oppure il nome è un ticker (anche tra le obbligazioni: BNDW, BSV) */
  const tick=d=>String(d.label).toUpperCase().replace(/\s*\(.*\)\s*$/,"").trim(),tickerish=d=>/^[A-Z][A-Z0-9]{1,5}$/.test(tick(d))&&!!d.cur&&!/^(CASH|USD|EUR|CHF|GBP)$/.test(tick(d));
  const symOf=d=>d.sym?guessSymbol(d.sym,"ETF",d.cur):tickerish(d)&&!/^(Azioni ed ETF|Previdenza)$/.test(d.cls)?guessSymbol(tick(d),"ETF",d.cur):guessSymbol(d.label,d.type,d.cur);
  const listed=d=>!!(d.sym||tickerish(d)||/^(Azioni ed ETF|Previdenza)$/.test(d.cls))&&!!symOf(d);
  /* un mese conta se non è nel futuro e se è compilato davvero (almeno il 30% delle voci del mese più pieno) */
  const now=new Date().toISOString().slice(0,7),cnt=i=>D.filter(d=>d.eur&&d.eur[i]>0).length,mx=Math.max(0,...W.months.map((_,i)=>cnt(i)));
  const real=i=>W.months[i]<=now&&cnt(i)>=mx*.3;
  let last=-1;for(let i=N-1;i>=0&&last<0;i--)if(real(i))last=i;
  const share=i=>{let a=0,t=0;D.forEach(d=>{const v=d.eur&&d.eur[i];if(v>0){t+=v;if(listed(d))a+=v;}});return t?a/t:0;};
  let li=-1;for(let i=last;i>=0&&li<0;i--)if(real(i)&&share(i)>=.1)li=i;
  if(li<0)return null;
  const lowNow=li<last?share(last):null;
  const held=D.filter(d=>d.eur&&d.eur[li]>0),pos=held.filter(listed),tot=held.reduce((s,d)=>s+d.eur[li],0),ptot=pos.reduce((s,d)=>s+d.eur[li],0);
  const by=new Map();held.filter(d=>!listed(d)).forEach(d=>by.set(d.cls,(by.get(d.cls)||0)+d.eur[li]));
  const why={"Crypto":"wallet ed exchange, non un singolo strumento quotato","Immobili":"non quotati","Private equity":"non quotato","Liquidità":"conti e saldi","Altro":"beni e investimenti non quotati","Prestiti e obbligazioni":"piattaforme senza prezzo di mercato","Previdenza":"fondo senza simbolo di borsa","Azioni ed ETF":"senza simbolo di borsa riconoscibile"};
  return {status:"ready",tipo:"riepilogo_portafoglio",foglio:W.sheets[0].name,
    local:!sym.size,spiegazione:`${sym.size?"Letto dall'IA":"Letto senza IA"} dal tuo tracker. ${li<last?`A ${fmtM(W.months[last])} i titoli quotati sono il ${fmtPct(lowNow,0)} del patrimonio: uso ${fmtM(W.months[li])}, l'ultimo mese in cui pesavano almeno il 10%.`:`Posizioni di ${fmtM(W.months[li])}.`} ${pos.length} titoli quotati per ${fmtN(Math.round(ptot))} € (${fmtPct(ptot/tot,0)} del patrimonio lordo). Ricostruendo il file con i loro prezzi storici i rendimenti diventano quelli del mercato, senza i soldi che hai aggiunto o tolto.`,
    posizioni:pos.map(d=>({nome:d.label+(d.sec?` · ${d.sec}`:""),ticker:tickerish(d)?tick(d):d.label,simbolo:sym.get(d.label.toLowerCase())||symOf(d),
      /* ticker europeo senza borsa scritta: se non c'è su Xetra si prova Milano, Londra, Amsterdam */
      alt:!d.sym&&tickerish(d)&&/^(EUR|GBP|CHF)$/.test(d.cur||"")?[".MIL",".LON",".AMS"].map(x=>tick(d)+x):[],valore:Math.round(d.eur[li]*100)/100,pesoAttuale:d.eur[li]/ptot,pesoTarget:null})),
    scartati:[...by].sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${fmtN(Math.round(v))} €: ${why[k]||"non quotato"}`)};
}

/* ---------- BTP e obbligazioni: cedola e scadenza dal nome («BTP 3,35% 01MZ35», «BTP-1GN29 1,5%»), rendimento a scadenza dal prezzo ---------- */
const BMON={GE:0,FB:1,MZ:2,AP:3,MG:4,GN:5,LG:6,AG:7,ST:8,OT:9,NV:10,DC:11};
function bondInfo(name){const t=String(name||"").toUpperCase(),c=t.match(/(\d{1,2}(?:[.,]\d{1,3})?)\s?%/),m=t.match(/(\d{2})(GE|FB|MZ|AP|MG|GN|LG|AG|ST|OT|NV|DC)(\d{2})\b/)||t.match(/\b(\d{2})[\/.](\d{2})[\/.](\d{2,4})\b/);
  if(!m||!/\b(BTP|BOT|CCT|CTZ|BUND|OAT|BOND|BONOS|OBBL|GOVT|TREASURY|T-NOTE|EMTN|FRN)\b|%/.test(t))return null;
  const mat=BMON[m[2]]!=null?new Date(Date.UTC(2000+ +m[3],BMON[m[2]],+m[1])):new Date(Date.UTC(m[3].length===2?2000+ +m[3]:+m[3],+m[2]-1,+m[1]));
  return isNaN(mat)?null:{cpn:c?parseFloat(c[1].replace(",","."))/100:null,mat};}
function bondYtm(px,cpn,mat,today){const yrs=(mat-today)/(365.25*864e5);if(!(px>0)||!(yrs>0)||cpn==null)return NaN;
  const n=Math.max(1,Math.ceil(yrs*2)),f=yrs*2-(n-1),pv=y=>{let s=0;for(let k=0;k<n;k++)s+=cpn/2*100/Math.pow(1+y/2,f+k);return s+100/Math.pow(1+y/2,f+n-1);};
  let a=-.5,b=1;for(let i=0;i<80;i++){const m=(a+b)/2;if(pv(m)>px)a=m;else b=m;}return (a+b)/2;}
const isBondPos=p=>!!bondInfo(p.nome||p.titolo)||/^IT000[45]/.test(p.isin||"")||!!p.per100;
function bondsHTML(){
  const u=S.lastUnd||S.und,pf=S.portfolio;if(!pf)return "";
  const miss=new Set((pf.missing||[]).map(m=>m.nome)),now=new Date(),today=now.toISOString().slice(0,10);
  const E=(pf.positions||[]).filter(p=>p.stima),B=u&&u.posizioni?u.posizioni.filter(p=>miss.has(p.nome)&&isBondPos(p)):[];
  if(!E.length&&!B.length)return "";
  const dt=s=>s?new Date(s+"T00:00:00Z").toLocaleDateString("it-IT",{timeZone:"UTC"}):"—";
  const rowsE=E.map(p=>{const st=p.stima,px=p.pxStima&&p.pxStima.v,b={cedola:st.cedola,scadenza:st.scadenza},y=px?P.btpTir(b,p.pxStima.d||today,px):NaN;
    return `<tr><td><span class="an">${esc(st.nome)}</span>${p.isin?`<span class="cl">${esc(p.isin)}</span>`:""}</td><td class="mono">${p.valore?fmtEur(p.valore):"—"}</td><td class="mono">${fmtPct(st.cedola,2)}</td><td class="mono">${dt(st.scadenza)}</td>
      <td class="mono">${px?fmtN(px,2):"—"}<span class="cl">stimato${st.ancora?", allineato al file":""}</span></td><td class="mono">${Number.isFinite(y)?fmtPct(y/100,2):"—"}</td></tr>`;}).join("");
  const rowsB=B.map(p=>{const b=bondInfo(p.nome)||{},px=p.per100?p.prezzo:null,y=px&&b.mat>now?bondYtm(px,b.cpn,b.mat,now):NaN;
    return `<tr class="out"><td><span class="an">${esc(p.nome)}</span><span class="cl">${p.isin?esc(p.isin)+" · ":""}fuori dalle analisi</span></td><td class="mono">${p.valore?fmtEur(p.valore):"—"}</td><td class="mono">${b.cpn!=null?fmtPct(b.cpn,2):"—"}</td><td class="mono">${b.mat?b.mat.toLocaleDateString("it-IT",{timeZone:"UTC"}):"—"}</td><td class="mono">${px?fmtN(px,2):"—"}${px?`<span class="cl">ultimo movimento</span>`:""}</td><td class="mono">${Number.isFinite(y)?fmtPct(y,2):"—"}</td></tr>`;}).join("");
  const totB=B.reduce((a,p)=>a+(p.valore||0),0),al=E.length?E[0].stima.curvaAl:null;
  return `<h4 class="look-h">Obbligazioni e titoli di Stato</h4><div class="tablewrap"><table class="mt"><thead><tr><th>Titolo</th><th>Valore</th><th>Cedola</th><th>Scadenza</th><th>Prezzo su 100</th><th>Rendimento a scadenza</th></tr></thead><tbody>${rowsE}${rowsB}</tbody></table></div>
    <p class="caption">${E.length?`I BTP a tasso fisso entrano in rischio, crisi e frontiera con un prezzo <b>stimato</b>: le cedole e il rimborso sono scontati ai rendimenti dei BTP benchmark a 3, 5, 10 e 30 anni pubblicati dalla Banca d'Italia (dati al ${dt(al)}); nei rendimenti le cedole lorde sono reinvestite. Il prezzo vero di ogni titolo si scosta di solito di qualche decimo: se nel file c'è un prezzo con la sua data, la stima si allinea a quello. Fonte: Banca d'Italia. `:""}${B.length?`${totB?fmtEur(totB)+" in obbligazioni restano":"Le obbligazioni qui sopra segnate «fuori dalle analisi» restano"} fuori da rischio, crisi e frontiera: per BTP indicizzati, CCT, titoli esteri e obbligazioni societarie non c'è una fonte gratuita dello storico dei prezzi. `:""}Il rendimento a scadenza è lordo.</p>`;
}

export { bdBtpMeta, posEnrich, AI_URL, ASSETR, BD, BDCHK, BMON, CLS_COL, CRYPTO, EXAMPLE, ISIN_RX, POPULAR, PRESETS, PRESET_TXT, PROXY, SPACES, SPACE_KEEP, TIPO_L, TPL_KEY, TR, aiAuto, aiPayload, aiSample, an, applyAI, applyUnderstandSeries, avSymbol, avgMonthly, bdCheck, bdCls, bdFind, bdGo, bdHint, bdRender, bdState, blockingOpen, bondInfo, bondYtm, bondsHTML, cellText, closeBuilder, colIndex, colLetter, colLetterUI, colSource, computeChecks, convertCurrency, drop, eurMap, fileStructure, fillTargets, findYoung, fixOpts, guessSymbol, handleFile, importConfidence, importKind, initRoles, isBondPos, isExample, isSim, load, loadExample, maybeAutoRebuild, needCount, normSym, openBuilder, playScan, previewHTML, rbAoa, rebuildBanner, rebuildFromPrices, rebuildRows, recipeOff, renderAI, renderCaps, renderChecks, renderConfirm, renderDeadEnd, renderImport, renderLog, renderMapping, renderQuality, renderScan, renderSheets, renderSummary, renderUnderstand, requestFix, requestRecipe, requestUnderstand, resetAI, resetImportState, resolveIsins, sheetCcy, showError, spaceBar, spaceBlank, spaceSave, spaceSwitch, spark, toastImport, tplAll, tplApply, tplForget, tplGet, tplSave, track, trackFlush, trackOnce, txLabel, txSnapshot, undPayload, undoAI, validateAI, wideSnapshot, youngDecide };
