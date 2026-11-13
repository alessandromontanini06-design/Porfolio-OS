/* Portfolio OS · motore di calcolo deterministico (nessuna dipendenza dalla pagina).
   Usato dal browser (js/app.js) e dai test (tools/test-engine.mjs). */
/* ===== MOTORE DETERMINISTICO (nessuna dipendenza dal DOM) ===== */
"use strict";
const MONTHS={gen:0,jan:0,feb:1,mar:2,apr:3,mag:4,may:4,giu:5,jun:5,lug:6,jul:6,ago:7,aug:7,set:8,sep:8,ott:9,oct:9,nov:10,dic:11,dec:11};
const MON=["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
const DATE_HINT=/data|date|mese|month|periodo|period|anno|year|giorno|day|time/i;
const RET_HINT=/rend|return|\bret\b|perf|var\.?\s*%|%/i;
const PRICE_HINT=/prezz|price|close|chiusura|\bnav\b|valore|quota|indice|index|livello|level|\(eur\)|\(usd\)/i;
/* flussi e quantità: versamenti, importi, quote possedute, guadagni */
const FLOW_HINT=/versat|versament|\bvers\b|investit|importo|flusso|contribut|deposit|prelev|guadagn|profit|\bp&l\b|\bquote\b|^q\s|quantit|\bshares\b|\bunits\b|commission|dividend|cedol|tass[ae]\b|saveback/i;
/* valori di portafoglio: se nello stesso foglio ci sono versamenti, includono soldi aggiunti e non solo rendimento */
const VALUE_HINT=/valor|\bval\b|patrimon|saldo|totale|total|net worth|portafoglio/i;
const isBlank=v=>v===null||v===undefined||(typeof v==="string"&&v.trim()==="");
const median=a=>{if(!a.length)return NaN;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const fmtN=(x,d=2)=>Number.isFinite(x)?x.toLocaleString("it-IT",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
const fmtPct=(x,d=1,sign=false)=>Number.isFinite(x)?(sign&&x>0?"+":"")+(x*100).toLocaleString("it-IT",{minimumFractionDigits:d,maximumFractionDigits:d})+"%":"—";
const fmtDate=(d,f)=>!d?"—":(f&&f<=12?`${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`:`${String(d.getUTCDate()).padStart(2,"0")}/${String(d.getUTCMonth()+1).padStart(2,"0")}/${d.getUTCFullYear()}`);
const fmtRaw=v=>v instanceof Date?fmtDate(new Date(Date.UTC(v.getFullYear(),v.getMonth(),v.getDate()))):typeof v==="number"&&Number.isFinite(v)?v.toLocaleString("it-IT",{maximumFractionDigits:Math.abs(v)>=100?2:4}):String(v).trim().slice(0,22);

function parseNum(v){
  if(typeof v==="number")return Number.isFinite(v)?{n:v,pct:false}:null;
  if(typeof v!=="string")return null;
  let s=v.trim();
  if(!s||/^(n\/?a|na|nan|null|-|—|–|#n\/d|#n\/a|#div\/0!|#value!|#valore!)$/i.test(s))return null;
  let pct=false;
  if(/%$/.test(s)){pct=true;s=s.slice(0,-1).trim();}
  s=s.replace(/^(eur|usd|gbp|gbx|chf|jpy)\s*/i,"").replace(/\s*(eur|usd|gbp|gbx|chf|jpy)$/i,"").replace(/(\d)['’](?=\d{3})/g,"$1");
  s=s.replace(/[€$£\s ]/g,"").replace(/[−–]/g,"-");
  if(/^\(.*\)$/.test(s))s="-"+s.slice(1,-1);
  if(/^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s))s=s.replace(/\./g,"").replace(",",".");
  else if(/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s))s=s.replace(/,/g,"");
  else if(/^[+-]?\d*,\d+$/.test(s))s=s.replace(",",".");
  if(!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s))return null;
  const n=Number(s);
  return Number.isFinite(n)?{n:pct?n/100:n,pct}:null;
}
function mkDate(y,m,d){
  if(y<100)y+=y<70?2000:1900;
  if(m<0||m>11||d<1||d>31||y<1900||y>2100)return null;
  const dt=new Date(Date.UTC(y,m,d));
  return dt.getUTCMonth()===m?dt:null;
}
function parseDate(v,hint){
  if(v instanceof Date)return isNaN(v)?null:new Date(Date.UTC(v.getFullYear(),v.getMonth(),v.getDate()));
  if(typeof v==="number"){
    if(hint&&Number.isInteger(v)&&v>=1900&&v<=2100)return mkDate(v,11,31);
    if(hint&&v>=20000&&v<=80000)return new Date(Date.UTC(1899,11,30)+Math.round(v)*864e5);
    return null;
  }
  if(typeof v!=="string")return null;
  const s=v.trim().toLowerCase();let m;
  if((m=s.match(/^(\d{4})[-\/.](\d{1,2})(?:[-\/.](\d{1,2}))?(?:[t\s].*)?$/)))return mkDate(+m[1],+m[2]-1,m[3]?+m[3]:1);
  if((m=s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})(?:\s.*)?$/))){let a=+m[1],b=+m[2],d=a,mo=b;if(a<=12&&b>12){d=b;mo=a;}return mkDate(+m[3],mo-1,d);}
  if((m=s.match(/^(\d{1,2})[\/.\-](\d{4})$/)))return mkDate(+m[2],+m[1]-1,1);
  if((m=s.match(/^([a-z]{3})[a-z]*\.?[\s\-\/']*(\d{4}|\d{2})$/))&&(m[1] in MONTHS))return mkDate(+m[2],MONTHS[m[1]],1);
  if((m=s.match(/^(\d{1,2})[\s\-]([a-z]{3})[a-z]*\.?[\s\-](\d{4}|\d{2})$/))&&(m[2] in MONTHS))return mkDate(+m[3],MONTHS[m[2]],+m[1]);
  if((m=s.match(/^(?:q|t)([1-4])[\s\-\/]*(\d{4})$/))||(m=s.match(/^(\d{4})[\s\-\/]*(?:q|t)([1-4])$/))){const a=+m[1],b=+m[2],q=a<=4?a:b,y=a<=4?b:a;return new Date(Date.UTC(y,q*3,0));}
  if(hint&&(m=s.match(/^(\d{4})$/)))return mkDate(+m[1],11,31);
  return null;
}
function cellKind(v){
  if(isBlank(v))return "e";
  if(v instanceof Date)return "d";
  if(typeof v==="number")return "n";
  const s=String(v).trim();
  if(parseNum(s))return "n";
  if(parseDate(s,false))return "d";
  return "s";
}
function detectHeader(aoa){
  const lim=Math.min(aoa.length,25);
  for(let r=0;r<lim;r++){
    const kinds=(aoa[r]||[]).map(cellKind);
    const ne=kinds.filter(k=>k!=="e").length;
    if(ne<2)continue;
    const str=kinds.filter(k=>k==="s").length;
    if(str<Math.max(2,Math.ceil(ne*0.6)))continue;
    let r2=r+1;while(r2<aoa.length&&(aoa[r2]||[]).every(isBlank))r2++;
    if(r2>=aoa.length)continue;
    const k2=(aoa[r2]||[]).map(cellKind);
    const ne2=k2.filter(k=>k!=="e").length;
    const nd=k2.filter(k=>k==="n"||k==="d").length;
    if(ne2>=2&&nd>=Math.ceil(ne2*0.5))return r;
  }
  return -1;
}
function colLetter(i){let s="";i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;}

function profile(c,name,raw){
  const ne=raw.filter(v=>!isBlank(v));
  const hintDate=DATE_HINT.test(name),hintRet=RET_HINT.test(name),hintPrice=PRICE_HINT.test(name);
  let nd=0,nn=0,npct=0;const nums=[];
  for(const v of raw){
    if(isBlank(v)){nums.push(null);continue;}
    if(parseDate(v,hintDate))nd++;
    const p=v instanceof Date?null:parseNum(v);
    if(p){nn++;if(p.pct)npct++;nums.push(p.n);}else nums.push(null);
  }
  /* prezzi a 0 prima del primo acquisto (tracker personali): mancanti, non prezzi nulli */
  let leadZeros=0;
  if(hintPrice&&!FLOW_HINT.test(name)){const fi=nums.findIndex(x=>x!==null&&x!==0);
    if(fi>0&&nums.slice(0,fi).every(x=>x===null||x===0)&&nums.slice(fi).every(x=>x===null||x>0)){for(let i=0;i<fi;i++)if(nums[i]===0){nums[i]=null;leadZeros++;}}}
  const N=ne.length,dateFrac=nd/N,numFrac=nn/N;
  const col={idx:c,letter:colLetter(c),name,nums,hintDate,dateFrac,numFrac,nonNull:N,sample:ne.slice(0,3).map(fmtRaw),conf:"bassa",suggest:null,reason:"",leadZeros};
  if(dateFrac>=0.8&&(hintDate||typeof ne[0]==="string"||ne[0] instanceof Date)){col.suggest="date";col.kind="date";return col;}
  if(numFrac<0.8){
    col.kind="text";col.suggest="ignore";col.conf="alta";
    col.reason=numFrac>0.2?`Solo il ${Math.round(numFrac*100)}% dei valori è numerico: testo o note`:"Testo: note o etichette, non una serie numerica";
    return col;
  }
  col.kind="num";
  const v=nums.filter(x=>x!==null);
  let min=Infinity,max=-Infinity,sumAbs=0,pos=0,neg=0;
  for(const x of v){if(x<min)min=x;if(x>max)max=x;sumAbs+=Math.abs(x);if(x>0)pos++;else if(x<0)neg++;}
  const maxAbs=Math.max(Math.abs(min),Math.abs(max)),meanAbs=sumAbs/v.length;
  const both=pos>0&&neg>0&&Math.min(pos,neg)/v.length>0.1;
  const rel=[];for(let i=1;i<v.length;i++)if(v[i-1]!==0)rel.push(Math.abs(v[i]/v[i-1]-1));
  const medRel=median(rel),pctFrac=npct/nn,distinct=new Set(v).size;
  Object.assign(col,{min,max,maxAbs,meanAbs,both,medRel,pctFrac});
  /* serie cumulate (quote accumulate, versato totale): non scendono mai e restano ferme per molti periodi */
  let flat=0,down=0;for(let i=1;i<v.length;i++){if(v[i]===v[i-1])flat++;else if(v[i]<v[i-1])down++;}
  const cumul=v.length>8&&!down&&flat/(v.length-1)>=.25&&distinct>3;
  if(FLOW_HINT.test(name)){col.suggest="ignore";col.conf="alta";col.flow=true;
    col.reason="Versamenti, quantità o guadagni: non sono prezzi né rendimenti di mercato";
  }else if(cumul){col.suggest="ignore";col.conf="alta";col.flow=true;
    col.reason="Cresce solo a scalini e non scende mai: quote accumulate o versamenti cumulati, non un prezzo";
  }else if(distinct<=3&&v.length>5){
    col.reason=`Solo ${distinct} valori diversi ripetuti: sembra un parametro o una categoria, non una serie storica`;
  }else if(pctFrac>0.5){
    col.suggest="ret";col.conf="alta";
    col.reason=`Valori con il simbolo % (da ${fmtPct(min,2)} a ${fmtPct(max,2)}): rendimenti, convertiti in decimali`;
  }else if(min>0&&!both&&medRel<0.2){
    col.suggest="price";col.conf=hintRet?"media":"alta";
    col.reason=`Sempre positivi (da ${fmtN(min)} a ${fmtN(max)}) e variano poco da un periodo all'altro (mediana ${fmtPct(medRel)}): prezzi o valori${leadZeros?`. I ${leadZeros} zeri iniziali sono trattati come mancanti (prima dell'acquisto)`:""}`;
  }else if(both&&maxAbs<=1&&meanAbs<0.15){
    col.suggest="ret";col.conf=hintPrice?"media":"alta";
    col.reason=`Positivi e negativi, vicini allo zero (da ${fmtN(min,3)} a ${fmtN(max,3)}): rendimenti in forma decimale`;
  }else if(both&&maxAbs<=100&&meanAbs>=0.15&&meanAbs<20){
    col.suggest="retpct";col.conf=hintRet?"alta":"media";
    col.reason=`Positivi e negativi (da ${fmtN(min)} a ${fmtN(max)}): probabilmente rendimenti in punti percentuali`;
  }else{
    col.reason=`Numeri da ${fmtN(min)} a ${fmtN(max)} che non somigliano né a prezzi né a rendimenti: dimmi tu cosa rappresentano`;
  }
  return col;
}
function analyzeSheet(name,aoa){
  aoa=(aoa||[]).map(r=>Array.isArray(r)?r:[]);
  const h=detectHeader(aoa);
  const width=aoa.reduce((w,r)=>Math.max(w,r.length),0);
  const headers=[];
  for(let c=0;c<width;c++){const v=h>=0?aoa[h][c]:null;headers.push(isBlank(v)?`Colonna ${colLetter(c)}`:String(v).trim());}
  /* intestazione su due righe (gruppi sopra, nomi sotto, celle unite): «Gruppo · Nome» se la riga sopra ha almeno due gruppi */
  if(h>0){const up=aoa[h-1]||[],grp=up.map(v=>typeof v==="string"&&v.trim()&&!parseNum(v)&&!parseDate(v,false)?v.trim():null);
    if(grp.filter(Boolean).length>=2&&!up.some(v=>typeof v==="number")){let cur=null;for(let c=0;c<width;c++){if(grp[c])cur=grp[c];if(cur&&!isBlank(aoa[h][c]))headers[c]=`${cur} · ${headers[c]}`;}}}
  const body=[];
  for(let r=h+1;r<aoa.length;r++){const row=aoa[r];if(row.every(isBlank))continue;body.push({r,row});}
  const cols=[];
  for(let c=0;c<width;c++){const raw=body.map(b=>b.row[c]);if(raw.every(isBlank))continue;cols.push(profile(c,headers[c],raw));}
  if(cols.some(c=>c.flow&&/versat|\bvers\b|investit|contribut|deposit/i.test(c.name)))cols.forEach(c=>{
    if(c.suggest==="price"&&VALUE_HINT.test(c.name)&&!/prezz|price|close|chiusura|\bnav\b/i.test(c.name)){c.suggest=null;c.conf="bassa";c.flowValue=true;
      c.reason="Valore del portafoglio che include i versamenti: i rendimenti sarebbero gonfiati dai soldi aggiunti. Servono i prezzi degli strumenti";}});
  /* sinonimi: in un export di quotazioni contano la chiusura rettificata (o la chiusura), non aperture, massimi, minimi e volumi */
  const tagOf=c=>headerTag(String((h>=0?aoa[h][c.idx]:"")??"")),hasAdj=cols.some(c=>tagOf(c)==="adjclose"),ohlc=cols.filter(c=>["open","high","low"].includes(tagOf(c))).length>=2;
  cols.forEach(c=>{const t=tagOf(c);c.tag=t;c.ccy=ccyOf(c.name)||(c.sample||[]).map(ccyOf).find(Boolean)||null;if(c.kind!=="num")return;
    if(["open","high","low","volume"].includes(t)&&(ohlc||hasAdj)){c.suggest="ignore";c.conf="alta";c.reason=t==="volume"?"Volumi scambiati: non sono prezzi":"Apertura, massimo o minimo del giorno: per l'analisi serve la chiusura";}
    else if(t==="close"&&hasAdj){c.suggest="ignore";c.conf="alta";c.reason="C'è anche la chiusura rettificata per dividendi e frazionamenti: uso quella";}
    else if(t==="adjclose"&&c.suggest==="price"){c.conf="alta";c.reason="Chiusura rettificata per dividendi e frazionamenti: la serie giusta per i rendimenti";}
    else if(["qty","amount","fee","weight","target"].includes(t)&&c.suggest!=="ignore"){c.suggest="ignore";c.conf="alta";c.reason={qty:"Quantità possedute",amount:"Importi delle operazioni",fee:"Commissioni e tasse",weight:"Pesi del portafoglio",target:"Pesi obiettivo"}[t]+": non sono una serie di prezzi";}
  });
  const dc=cols.filter(c=>c.suggest==="date").sort((a,b)=>(b.dateFrac+(b.hintDate?.1:0))-(a.dateFrac+(a.hintDate?.1:0)));
  dc.forEach((c,i)=>{
    if(i===0){c.conf=c.dateFrac>=0.95?"alta":"media";c.reason=`Il ${Math.round(c.dateFrac*100)}% dei valori è una data valida`;}
    else{c.suggest=null;c.conf="bassa";c.reason="Una seconda colonna di date: scegli tu come usarla";}
  });
  const nAsset=cols.filter(c=>["price","ret","retpct"].includes(c.suggest)).length,nFlow=cols.filter(c=>c.flow||c.flowValue).length;
  const score=nAsset+(dc.length&&nAsset?3:dc.length?1:0);
  /* "tracker" personale: molte colonne di versamenti, quote o valori → i numeri non sono rendimenti di mercato */
  return {name,headerRow:h,body,cols,score,rowCount:aoa.length,tracker:nFlow>=2&&nFlow>=nAsset};
}

/* ---------- Fogli "a matrice" (tracker di patrimonio): una riga per voce, una colonna per data ----------
   Riconosce la riga delle date in orizzontale, la colonna dei nomi, valuta e tipo; separa posizioni, debiti, totali,
   tassi di cambio e blocchi di allocazione; unisce i fogli di anni diversi in una sola serie mensile e converte in euro
   con i cambi scritti nel file. Restituisce fogli "virtuali" nel formato normale (date in colonna, una serie per colonna). */
const CUR_CODE={U:"USD",US:"USD",USD:"USD",E:"EUR",EU:"EUR",EUR:"EUR",G:"GBP",GB:"GBP",GBP:"GBP",AE:"AED",AED:"AED",CHF:"CHF",JPY:"JPY",CAD:"CAD",AUD:"AUD",SEK:"SEK",NOK:"NOK",DKK:"DKK",PLN:"PLN",RUB:"RUB",CNY:"CNY",HKD:"HKD"};
const FXC="USD|EUR|GBP|AED|CHF|JPY|CAD|AUD|SEK|NOK|DKK|PLN|RUB|CNY|HKD|BTC|ETH|XAU|XAG";
const FXROW_RX=new RegExp(`^(${FXC})(${FXC})\\b`),TOTAL_RX=/^(nw\b|nw\(|net ?worth\b|patrimonio( netto)?\b|totale\b|total\b|grand total)/i;
const ALLOC_RX=/asset allocation|allocazione|per classe|by class/i,DEBT_RX=/^(debts?|debiti|passivit|liabilit|mutui|prestiti)/i,FXSEC_RX=/^(exchanges?|cambi|tassi di cambio|fx|currenc)/i;
function wideHeader(aoa){
  let best=null;
  for(let r=0;r<Math.min(aoa.length,20);r++){
    const cols=[];(aoa[r]||[]).forEach((v,c)=>{const d=v instanceof Date||typeof v==="string"?parseDate(v,false):null;if(d)cols.push({c,d});});
    if(cols.length<3)continue;
    let inc=0;for(let i=1;i<cols.length;i++)if(cols[i].d>=cols[i-1].d)inc++;
    if(inc<(cols.length-1)*.8)continue;
    if(!best||cols.length>best.cols.length)best={r,cols};
  }
  return best;
}
/* lettera di colonna Excel → indice (A=0); -1 se non valida */
function colIdx(L){if(L==null)return -1;const t=String(L).toUpperCase().trim();if(!/^[A-Z]{1,3}$/.test(t))return -1;let n=0;for(const ch of t)n=n*26+ch.charCodeAt(0)-64;return n-1;}
const lc=x=>String(x??"").trim().toLowerCase();
/* hint (dall'IA, facoltativo): {rigaDate, colonnaNome, colonnaValuta, colonnaTipo, codiciValuta, sezioni, righeSpeciali, classiPerTipo} */
function parseWideSheet(name,aoa,hint){
  aoa=(aoa||[]).map(r=>Array.isArray(r)?r:[]);
  let H;
  if(hint&&hint.rigaDate){const r=hint.rigaDate-1,cols=[];(aoa[r]||[]).forEach((v,c)=>{const d=v instanceof Date||typeof v==="string"?parseDate(v,true):typeof v==="number"&&v>20000&&v<80000?parseDate(v,true):null;if(d)cols.push({c,d});});H=cols.length>=2?{r,cols}:null;}
  else H=wideHeader(aoa);
  if(!H)return null;
  const first=H.cols[0].c,hdr=aoa[H.r],body=aoa.slice(H.r+1),left=[];
  for(let c=0;c<first;c++){const vals=body.map(r=>r[c]).filter(v=>typeof v==="string"&&v.trim()&&!parseNum(v)).map(v=>v.trim());left.push({c,vals,h:String(hdr[c]??"")});}
  const isCur=x=>x.vals.length>=3&&x.vals.filter(v=>CUR_CODE[v.toUpperCase()]).length/x.vals.length>=.8&&x.vals.every(v=>v.length<=4);
  const byLetter=L=>{const i=colIdx(L);return i>=0?{c:i,vals:body.map(r=>r[i]).filter(v=>typeof v==="string"&&v.trim()).map(v=>v.trim()),h:String(hdr[i]??"")}:null;};
  const curC=hint?byLetter(hint.colonnaValuta):left.find(x=>/curr|valut|ccy/i.test(x.h)&&x.vals.length)||left.find(isCur)||null;
  const typeC=hint?byLetter(hint.colonnaTipo):left.find(x=>x!==curC&&/^(type|tipo|categ|class)/i.test(x.h.trim()))||null;
  const labC=hint&&colIdx(hint.colonnaNome)>=0?byLetter(hint.colonnaNome):left.filter(x=>x!==curC&&x!==typeC).sort((a,b)=>b.vals.length-a.vals.length)[0];
  if(!labC||labC.vals.length<2)return null;
  const curMap={...CUR_CODE};(hint&&hint.codiciValuta||[]).forEach(x=>{if(x&&x.codice&&/^[A-Z]{3}$/.test(String(x.valuta||"").toUpperCase()))curMap[String(x.codice).trim().toUpperCase()]=String(x.valuta).toUpperCase();});
  const SEC={posizioni:"",debiti:"debt",totali:"total",cambi:"fx",classi:"alloc",ignora:"skip"},ROW={posizione:"hold",debito:"debt",totale:"total",cambio:"fx",classe:"alloc",ignora:"skip"};
  const secRole=new Map((hint&&hint.sezioni||[]).map(x=>[lc(x.etichetta),SEC[x.ruolo]]));
  const rowRole=new Map((hint&&hint.righeSpeciali||[]).map(x=>[lc(x.etichetta),ROW[x.ruolo]]));
  const clsOf=new Map((hint&&hint.classiPerTipo||[]).map(x=>[lc(x.tipo),x.classe]));
  /* le colonne della stessa data o dello stesso mese: vale l'ultima a destra (istantanea di fine mese) */
  const months=H.cols.map(x=>({c:x.c,k:x.d.toISOString().slice(0,7)}));
  const out={name,months:months.map(m=>m.k),hold:[],total:[],alloc:[],fx:[],debt:[],skipped:0};
  let sec="",mode="";
  for(let r=H.r+1;r<aoa.length;r++){
    const row=aoa[r],lab=String(row[labC.c]??"").trim();
    const vals=months.map(m=>{const p=row[m.c] instanceof Date?null:parseNum(row[m.c]);return p?p.n:null;});
    const nn=vals.filter(v=>v!==null).length;
    if(!lab){if(nn)out.skipped++;continue;}
    if(!nn){sec=lab;if(secRole.has(lc(lab)))mode=secRole.get(lc(lab));else if(!hint)mode=ALLOC_RX.test(lab)?"alloc":FXSEC_RX.test(lab)?"fx":DEBT_RX.test(lab)?"debt":"";continue;}
    const cc=curC?String(row[curC.c]??"").trim().toUpperCase():"",type=typeC&&typeof row[typeC.c]==="string"?row[typeC.c].trim():"";
    const item={label:lab,cur:curMap[cc]||null,type,sec,vals,cls:clsOf.get(lc(type))||null};
    const forced=rowRole.get(lc(lab));
    if(forced){if(forced!=="skip"){if(forced==="total"&&!item.cur&&curMap[lab.toUpperCase()])item.cur=curMap[lab.toUpperCase()];out[forced].push(item);}continue;}
    if(mode==="skip")continue;
    if(mode==="total"){out.total.push(item);continue;}
    if(mode==="fx"||(!item.cur&&FXROW_RX.test(lab.toUpperCase())))out.fx.push(item);
    else if(CUR_CODE[lab.toUpperCase()]&&lab.length>=3){item.cur=CUR_CODE[lab.toUpperCase()];out.total.push(item);}
    else if(TOTAL_RX.test(lab)||/^total/i.test(type))out.total.push(item);
    else if(mode==="alloc")out.alloc.push(item);
    else if(mode==="debt"||vals.every(v=>v===null||v<=0))out.debt.push(item);
    else out.hold.push(item);
  }
  return out.hold.length+out.alloc.length+out.total.length?out:null;
}
const CLASS_MAP=[[/etf|stock|azion|equity|shares/i,"Azioni ed ETF"],[/crypto|bitcoin|btc/i,"Crypto"],[/^re$|real ?estate|immob|apparta/i,"Immobili"],[/^pe$|private/i,"Private equity"],[/p2p|lending|bond|obblig|prestit|crowd/i,"Prestiti e obbligazioni"],[/pension|previd/i,"Previdenza"],[/cash|liquid|cont[oi]|deposit|bank|banca/i,"Liquidità"]];
const CLASS_ORDER=["Azioni ed ETF","Previdenza","Crypto","Immobili","Private equity","Prestiti e obbligazioni","Altro","Liquidità"];
function assetClass(h){if(h.cls)return h.cls;for(const [rx,n] of CLASS_MAP)if(rx.test(h.type||""))return n;for(const [rx,n] of CLASS_MAP)if(rx.test(h.sec||""))return n;return "Altro";}
function reshapeWide(sheets,hints){
  const parsed=(sheets||[]).filter(s=>!hints||hints[s.name]).map(s=>parseWideSheet(s.name,s.aoa,hints&&hints[s.name])).filter(Boolean);
  if(!parsed.length)return null;
  parsed.sort((a,b)=>a.months[0]<b.months[0]?-1:a.months[0]>b.months[0]?1:0);
  const months=[...new Set(parsed.flatMap(p=>p.months))].sort(),mi=new Map(months.map((m,i)=>[m,i])),N=months.length;
  /* ogni mese appartiene a un solo foglio: quello che contiene più mesi di quell'anno (la prima colonna di un foglio annuale
     spesso ripete la chiusura dell'anno prima, a volte con nomi già cambiati: contarla due volte raddoppierebbe le posizioni) */
  const owner=kind=>{const O=new Map(),cand=parsed.filter(p=>p[kind].length);months.forEach(m=>{const y=m.slice(0,4);let best=null,bs=-1;cand.forEach(p=>{if(!p.months.includes(m))return;const sc=p.months.filter(x=>x.slice(0,4)===y).length*1e4+p[kind].length;if(sc>=bs){bs=sc;best=p;}});O.set(m,best);});return O;};
  const merge=(kind,key)=>{const M=new Map(),O=owner(kind);parsed.forEach(p=>p[kind].forEach(it=>{const k=key(it);if(!M.has(k))M.set(k,{...it,vals:new Array(N).fill(null)});const t=M.get(k);t.type=it.type||t.type;t.sec=it.sec||t.sec;t.cls=it.cls||t.cls;it.vals.forEach((v,j)=>{if(v!==null&&O.get(p.months[j])===p)t.vals[mi.get(p.months[j])]=v;});}));return [...M.values()];};
  const fx=merge("fx",x=>x.label.toUpperCase().replace(/[\s(].*$/,""));
  fx.forEach(f=>{let last=null;f.vals=f.vals.map(v=>v>0?(last=v):last);});
  const fxv=code=>{const f=fx.find(x=>x.label.toUpperCase().replace(/[\s(].*$/,"")===code);return f?f.vals:null;};
  const usdeur=fxv("USDEUR")||(fxv("EURUSD")?fxv("EURUSD").map(v=>v?1/v:null):null);
  const rate=(cur,i)=>{if(!cur||cur==="EUR")return 1;if(!usdeur||!usdeur[i])return null;if(cur==="USD")return usdeur[i];const ux=fxv("USD"+cur);return ux&&ux[i]?usdeur[i]/ux[i]:null;};
  const curs=new Set();
  const conv=it=>{curs.add(it.cur||"?");const v=it.vals.map((x,i)=>{if(x===null)return null;const k=rate(it.cur,i);return k===null?null:x*k;});return v;};
  const positive=v=>v.map(x=>x!==null&&x>0?x:null),enough=v=>v.filter(x=>x!==null).length>=3;
  const canEUR=c=>!c||c==="EUR"||(!!usdeur&&(c==="USD"||!!fxv("USD"+c)));
  const hold=merge("hold",x=>`${x.label}|${x.cur}|${x.type}|${x.sec}`),alloc=merge("alloc",x=>x.label),total=merge("total",x=>x.label),debt=merge("debt",x=>`${x.label}|${x.cur}`);
  /* classi di attivo: somma delle posizioni per tipo (copre tutti gli anni); il blocco di allocazione del file solo se copre più mesi */
  const covered=list=>new Set(list.flatMap(s=>s.v.map((x,i)=>x!=null?i:-1).filter(i=>i>=0))).size;
  const fromAlloc=alloc.filter(a=>canEUR(a.cur)).map(a=>({name:a.label,v:positive(conv(a))})).filter(s=>enough(s.v));
  const G=new Map();hold.filter(h=>canEUR(h.cur)).forEach(h=>{const k=assetClass(h),v=conv(h);if(!G.has(k))G.set(k,new Array(N).fill(null));const g=G.get(k);v.forEach((x,i)=>{if(x!==null&&x>0)g[i]=(g[i]||0)+x;});});
  const fromHold=[...G].map(([name,v])=>({name,v})).filter(s=>enough(s.v)).sort((x,y)=>CLASS_ORDER.indexOf(x.name)-CLASS_ORDER.indexOf(y.name));
  const useAlloc=fromAlloc.length&&covered(fromAlloc)>covered(fromHold);
  const classes=useAlloc?fromAlloc:fromHold,classSrc=useAlloc?"il blocco di allocazione del file":"la somma delle posizioni per tipo";
  const lbl=new Map();hold.forEach(h=>lbl.set(h.label,(lbl.get(h.label)||0)+1));
  const positions=hold.map(h=>{const eur=canEUR(h.cur);return {name:`${h.label}${lbl.get(h.label)>1?` · ${h.sec||h.type}`:""}${eur?"":` (${h.cur})`}`,v:positive(eur?conv(h):h.vals)};}).filter(s=>enough(s.v));
  /* patrimonio netto: per ogni mese la riga in euro se c'è, altrimenti una riga in un'altra valuta convertita */
  const nwv=new Array(N).fill(null);[...total.filter(t=>t.cur==="EUR"),...total.filter(t=>t.cur!=="EUR"&&canEUR(t.cur))].forEach(t=>{const v=t.cur==="EUR"?t.vals:conv(t);v.forEach((x,i)=>{if(nwv[i]==null&&x!=null&&x>0)nwv[i]=x;});});
  const nw=enough(nwv)?[{name:"Patrimonio netto (EUR)",v:nwv}]:[];
  const mk=(name,series)=>{const aoa=[["Data",...series.map(s=>s.name)]];months.forEach((m,i)=>{if(series.every(s=>s.v[i]==null))return;const [y,mo]=m.split("-").map(Number);aoa.push([new Date(y,mo,0),...series.map(s=>s.v[i]==null?null:Math.round(s.v[i]*100)/100)]);});return {name,aoa,virtual:true};};
  const out=[];
  /* le classi vengono prima solo se sono almeno due: altrimenti si parte dalle singole posizioni */
  if(classes.length>=2)out.push(mk("★ Classi di attivo · tutti gli anni",classes));
  if(positions.length)out.push(mk("★ Posizioni · tutti gli anni",positions));
  if(classes.length===1)out.push(mk("★ Classi di attivo · tutti gli anni",classes));
  if(nw.length)out.push(mk("★ Patrimonio netto · tutti gli anni",nw));
  if(!out.length)return null;
  const detail=hold.map(h=>({label:h.label,type:h.type,sec:h.sec,cls:assetClass(h),cur:h.cur,eur:canEUR(h.cur)?conv(h):null}));
  return {sheets:out,months,detail,report:{sheets:parsed.map(p=>p.name),months:N,from:months[0],to:months[N-1],classes:classes.map(c=>c.name),classSrc,positions:positions.length,holdings:hold.length,debts:debt.length,totals:total.length,fx:usdeur?"i tassi di cambio scritti nel file":null,currencies:[...curs].filter(c=>c!=="?")}};
}

/* ---------- Ricetta di lettura (scritta dall'IA, eseguita qui): l'IA dice DOVE sono i dati, il motore li legge e li controlla ---------- */
const COLROLE={prezzo:"price",valore:"price",rendimento_decimale:"ret",rendimento_percentuale:"retpct"};
function columnBlocks(sheets,blocks,extra){
  const byName=new Map(sheets.map(s=>[s.name,s.aoa||[]])),series=[...(extra||[])],errors=[];
  for(const b of blocks||[]){
    const aoa=byName.get(b.foglio);if(!aoa){errors.push(`Il foglio «${b.foglio}» non esiste.`);continue;}
    const dc=colIdx(b.colonnaData);if(dc<0){errors.push(`«${b.foglio}»: colonna data «${b.colonnaData}» non valida.`);continue;}
    const h=(b.rigaIntestazione||0)-1,r0=Math.max(0,b.primaRiga?b.primaRiga-1:h+1),rows=[];
    /* l'ultima riga indicata è solo un punto di partenza: se le date continuano senza interruzioni, la tabella continua */
    let r1=Math.min(aoa.length-1,b.ultimaRiga?b.ultimaRiga-1:aoa.length-1);
    while(r1+1<aoa.length&&parseDate((aoa[r1+1]||[])[dc],true))r1++;
    for(let r=r0;r<=r1;r++){const d=parseDate((aoa[r]||[])[dc],true);if(d)rows.push({r,d});}
    if(rows.length<3){errors.push(`«${b.foglio}»: nella colonna ${b.colonnaData} ci sono solo ${rows.length} date valide.`);continue;}
    const gaps=[];for(let k=1;k<rows.length;k++)gaps.push(Math.abs(rows[k].d-rows[k-1].d)/864e5);const md=median(gaps);
    for(const s of b.serie||[]){
      const role=COLROLE[s.ruolo];if(!role)continue;
      const c=colIdx(s.colonna);if(c<0){errors.push(`«${s.nome}»: colonna «${s.colonna}» non valida.`);continue;}
      /* controllo: se tra la colonna data indicata e la serie c'è un'altra colonna di date (tabelle affiancate), vale quella più vicina */
      let rowsS=rows;
      for(let k=c-1;k>=0;k--){const rr=[];for(let r=r0;r<=r1;r++){const d=parseDate((aoa[r]||[])[k],true);if(d)rr.push({r,d});}if(rr.length>=3){if(k!==dc){rowsS=rr;errors.push(`«${s.nome}»: uso le date della colonna ${colLetter(k)}, la più vicina alla serie.`);}break;}}
      const pts=rowsS.map(x=>{const v=(aoa[x.r]||[])[c],p=v instanceof Date?null:parseNum(v);return [x.d,p?(role==="retpct"&&p.pct?p.n*100:p.n):null];});
      const nn=pts.filter(p=>p[1]!=null).length;
      if(nn<3){errors.push(`«${s.nome}» (colonna ${s.colonna} di «${b.foglio}»): solo ${nn} numeri, esclusa.`);continue;}
      series.push({name:String(s.nome||s.colonna).trim(),role,pts,md,foglio:b.foglio,ccy:s.valuta?String(s.valuta).toUpperCase():ccyOf(s.nome)||ccyOf(((aoa[h]||[])[c]))});
    }
  }
  if(!series.length)return {sheet:null,errors};
  /* stesso nome in fogli diversi: si aggiunge il foglio */
  const cnt=new Map();series.forEach(s=>cnt.set(s.name,(cnt.get(s.name)||0)+1));series.forEach(s=>{if(cnt.get(s.name)>1)s.name+=` · ${s.foglio}`;});
  /* tutte mensili o più rade: si allineano per mese (fine mese); altrimenti per giorno */
  const monthly=series.every(s=>s.md>=25),key=d=>monthly?d.toISOString().slice(0,7):d.toISOString().slice(0,10);
  const keys=[...new Set(series.flatMap(s=>s.pts.map(p=>key(p[0]))))].sort(),ki=new Map(keys.map((k,i)=>[k,i]));
  const aoa=[["Data",...series.map(s=>s.name)]];keys.forEach(k=>{const [y,m,d]=k.split("-").map(Number);aoa.push([monthly?new Date(y,m,0):new Date(y,m-1,d),...series.map(()=>null)]);});
  series.forEach((s,j)=>s.pts.forEach(([d,v])=>{if(v!=null)aoa[1+ki.get(key(d))][1+j]=v;}));
  return {sheet:{name:"★ Serie lette dall'IA",aoa,virtual:true,roles:["date",...series.map(s=>s.role)],ccy:[null,...series.map(s=>s.ccy||null)]},errors};
}
/* movimenti (acquisti e vendite): quantità nette e ultimo prezzo pagato per titolo */
function txPositions(sheets,m){
  const aoa=(sheets.find(s=>s.name===m.foglio)||{}).aoa;if(!aoa)return {errors:[`Il foglio «${m.foglio}» non esiste.`],positions:[],n:0};
  const h=(m.rigaIntestazione||1)-1,cD=colIdx(m.colonnaData),cT=colIdx(m.colonnaTitolo),cI=colIdx(m.colonnaIsin),cQ=colIdx(m.colonnaQuantita),cP=colIdx(m.colonnaPrezzo),cA=colIdx(m.colonnaImporto),cO=colIdx(m.colonnaOperazione);
  if(cT<0)return {errors:["Manca la colonna del titolo."],positions:[],n:0};
  const P=new Map();let n=0;const num=(row,c)=>{if(c<0)return null;const p=parseNum(row[c]);return p?p.n:null;};
  /* colonne di contorno lette dall'intestazione: nome leggibile e ticker, per mostrare «EUNL» e non l'ISIN */
  const hd=(aoa[h]||[]).map(v=>lc(v)),fc=re=>hd.findIndex((x,i)=>i!==cT&&re.test(x));
  const cN=fc(/^(strumento|nome|descrizione|titolo|prodotto|name|security|etf)\b/),cK=fc(/^(ticker|simbolo|symbol|codice di borsa)\b/),cI2=cI>=0?cI:fc(/^isin\b/);
  for(let r=h+1;r<aoa.length;r++){
    const row=aoa[r]||[],t=String(row[cT]??"").trim();if(!t)continue;
    const d=cD>=0?parseDate(row[cD],true):null,px=num(row,cP),amt=num(row,cA);let q=num(row,cQ);
    if(q==null&&amt!=null&&px)q=Math.abs(amt)/px;if(q==null)continue;
    const op=cO>=0?lc(row[cO]):"";
    /* dividendi, cedole, commissioni e imposte non cambiano le quote possedute */
    if(/divid|cedol|coupon|commission|bollo|impost|tass[ae]|fee|tax/.test(op))continue;
    const sell=/vend|sell|sale|cession|uscit|rimbors|short/.test(op),buy=/acq|buy|purch|sottoscr|entrat|compr/.test(op);
    const qty=sell?-Math.abs(q):buy?Math.abs(q):q;
    const isin=cI2>=0?String(row[cI2]??"").trim().toUpperCase():"",it=P.get(t)||{titolo:t,nome:cN>=0?String(row[cN]??"").trim()||null:null,tk:cK>=0?String(row[cK]??"").trim().toUpperCase()||null:null,isin:/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)?isin:/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(t)?t:null,q:0,last:null,lastD:null,inv:0,n:0};it.q+=qty;it.n++;
    if(px>0&&(!it.lastD||!d||d>=it.lastD)){it.last=px;it.lastD=d;}
    it.inv+=amt!=null?(qty<0?-1:1)*Math.abs(amt):px?qty*px:0;P.set(t,it);n++;
  }
  const positions=[...P.values()].filter(x=>x.q>1e-9).map(x=>({titolo:x.titolo,nome:x.nome||null,tk:x.tk||null,isin:x.isin,quantita:x.q,prezzo:x.last,valore:x.last?x.q*x.last:null,investito:x.inv,operazioni:x.n,data:x.lastD}));
  return {errors:n?[]:["Nessun movimento leggibile."],positions,n,chiuse:[...P.values()].filter(x=>x.q<=1e-9).length};
}
/* tabella di rendimenti mensili: un anno per riga, dodici colonne di mesi (gen → dic) */
function matrixSeries(sheets,blocks,errors){
  const out=[];
  for(const b of blocks||[]){
    const aoa=(sheets.find(s=>s.name===b.foglio)||{}).aoa;if(!aoa){errors.push(`Il foglio «${b.foglio}» non esiste.`);continue;}
    const cy=colIdx(b.colonnaAnno),c0=colIdx(b.colonnaGennaio),pct=b.ruolo==="rendimento_percentuale";
    if(cy<0||c0<0){errors.push(`«${b.foglio}»: colonne dell'anno o di gennaio non valide.`);continue;}
    const pts=[];
    for(let r=Math.max(0,(b.primaRiga||1)-1);r<=Math.min(aoa.length-1,b.ultimaRiga?b.ultimaRiga-1:aoa.length-1);r++){
      const row=aoa[r]||[],yp=parseNum(row[cy]),y=yp&&Number.isInteger(yp.n)&&yp.n>1900&&yp.n<2100?yp.n:null;if(!y)continue;
      for(let m=0;m<12;m++){const p=parseNum(row[c0+m]);if(!p)continue;pts.push([new Date(Date.UTC(y,m+1,0)),pct?(p.pct?p.n*100:p.n):(p.pct?p.n:p.n)]);}
    }
    if(pts.length<3){errors.push(`«${b.nome}»: meno di tre mesi leggibili nella tabella.`);continue;}
    out.push({name:String(b.nome).trim(),role:pct?"retpct":"ret",pts,md:30,foglio:b.foglio});
  }
  return out;
}
function applyRecipe(sheets,R){
  const out={sheets:[],errors:[],wide:null,tx:null};if(!R)return out;
  const groups=(R.serieInRiga||[]).filter(g=>g&&(g.fogli||[]).length);
  if(groups.length){
    const hints={};groups.forEach(g=>g.fogli.forEach(f=>{hints[f]=g;}));
    const W=reshapeWide(sheets,hints);
    if(W){out.wide=W;out.sheets.push(...W.sheets);}else out.errors.push("Nei fogli indicati con le date in riga non ho trovato date leggibili.");
  }
  const mx=matrixSeries(sheets,R.matriciRendimenti,out.errors);
  if((R.serieInColonna||[]).length||mx.length){const C=columnBlocks(sheets,R.serieInColonna,mx);out.errors.push(...C.errors);if(C.sheet)out.sheets.unshift(C.sheet);}
  if(R.movimenti){const T=txPositions(sheets,R.movimenti);out.tx={...T,valuta:R.movimenti.valuta||null};out.errors.push(...T.errors);}
  return out;
}

/* ---------- Smart column mapping: sinonimi delle intestazioni (italiano, inglese, tedesco, francese, spagnolo) ---------- */
const SYN=[
  ["adjclose",/^adj\.?\s*close|adjusted\s*close|chiusura\s*rettificata|close\s*adj|adj\.?\s*cl\b/i],
  ["close",/^(close|chiusura|ultimo|last|last price|prezzo di chiusura|prezzo chiusura|schlusskurs|schluss|cl[oô]ture|cierre|price)$/i],
  ["open",/^(open|apertura|er[oö]ffnung|ouverture|apertura prezzo)$/i],
  ["high",/^(high|max|massimo|hoch|haut|m[aá]ximo)$/i],
  ["low",/^(low|min|minimo|tief|bas|m[ií]nimo)$/i],
  ["volume",/^(volume|vol\.?|volumi|umsatz|volumen)$/i],
  ["nav",/\bnav\b|valore quota|net asset value/i],
  ["isin",/^(isin|codice isin|isin code)$/i],
  ["ticker",/^(ticker|simbolo|symbol|codice|code|tkr)$/i],
  ["name",/^(titolo|strumento|nome|descrizione|prodotto|asset|security|instrument|name|description|wertpapier|titre)$/i],
  ["qty",/quantit|^qty$|^q\.?t[aà]\.?$|^shares$|^units$|^pezzi$|^quote$|^st[uü]ck|^n\.?\s*azioni|^nominale$/i],
  ["price",/^(prezzo|price|kurs|cours|precio|prezzo unitario|prezzo medio|unit price|pmc)$/i],
  ["amount",/importo|controvalore|^amount$|ammontare|totale operazione|betrag|montant|^valore operazione$|net amount|^totale$/i],
  ["fee",/commission|^fees?$|spese|^costi$|tasse|^tax(es)?$|bollo/i],
  ["side",/^(tipo|operazione|segno|side|type|buy\/sell|acquisto\/vendita|movimento|tipo operazione|transaction type|action)$/i],
  ["ccy",/^(valuta|currency|ccy|divisa|w[aä]hrung|devise|moneda)$/i],
  ["value",/^(valore|value|controvalore attuale|valore di mercato|market value|valore €|valore eur|marktwert)/i],
  ["weight",/^(peso|weight|allocazione|allocation|% portafoglio|% del portafoglio|peso attuale|peso %)/i],
  ["target",/target|obiettivo|desiderat|peso ideale|ziel/i]
];
function headerTag(h){const t=String(h??"").replace(/\s+/g," ").trim();if(!t)return null;for(const [k,rx] of SYN)if(rx.test(t))return k;return null;}
/* valuta indicata nell'intestazione o nelle celle */
function ccyOf(text){const t=String(text??"");if(/\bGBX\b|\bGBp\b|pence/.test(t))return "GBX";if(/\bUSD\b|US\$|\$/.test(t))return "USD";if(/\bGBP\b|£/.test(t))return "GBP";if(/\bCHF\b/.test(t))return "CHF";if(/\bJPY\b|¥/.test(t))return "JPY";if(/\bEUR\b|€/.test(t))return "EUR";return null;}
const MONTH_TOK=/^(gen(naio)?|jan(uary)?|feb(braio|ruary)?|mar(zo|ch)?|apr(ile|il)?|mag(gio)?|may|giu(gno)?|jun(e)?|lug(lio)?|jul(y)?|ago(sto)?|aug(ust)?|set(tembre)?|sep(t(ember)?)?|ott(obre)?|oct(ober)?|nov(embre|ember)?|dic(embre)?|dec(ember)?)\.?$/i;
const GENERIC_SHEET=/^(sheet|foglio|tabelle|feuil|hoja|blatt)\s*\d*$/i;

/* ---------- Riconoscitori locali (senza IA): producono una ricetta nello stesso formato di quella dell'IA ---------- */
function localRecipe(sheets){
  const R={serieInColonna:[],serieInRiga:[],matriciRendimenti:[],movimenti:null,posizioni:[],simboli:[],scartati:[]},parts=[];
  for(const sh of sheets||[]){
    const aoa=(sh.aoa||[]).map(r=>Array.isArray(r)?r:[]);if(!aoa.length)continue;
    /* 1) tabella di rendimenti mensili: una riga con almeno 10 mesi consecutivi, anni nella colonna a sinistra */
    let mx=null;
    for(let r=0;r<Math.min(aoa.length,30)&&!mx;r++){const row=aoa[r];for(let c=0;c<row.length;c++){let k=0;while(c+k<row.length&&MONTH_TOK.test(String(row[c+k]??"").trim()))k++;if(k>=10){mx={r,c};break;}}}
    if(mx){
      let yc=-1,ys=0;for(let c=mx.c-1;c>=0;c--){let n=0;for(let r=mx.r+1;r<aoa.length;r++){const p=parseNum(aoa[r][c]);if(p&&Number.isInteger(p.n)&&p.n>1900&&p.n<2100)n++;}if(n>ys){ys=n;yc=c;}}
      if(yc>=0&&ys>=1){
        let pct=false,big=false;for(let r=mx.r+1;r<aoa.length;r++)for(let m=0;m<12;m++){const v=aoa[r][mx.c+m];if(typeof v==="string"&&/%/.test(v))pct=true;const p=parseNum(v);if(p&&Math.abs(p.n)>1.5)big=true;}
        let title=null;for(let r=mx.r-1;r>=0&&!title;r--)title=(aoa[r]||[]).find(v=>typeof v==="string"&&v.trim().length>3&&!parseNum(v))||null;
        R.matriciRendimenti.push({foglio:sh.name,nome:String(title||sh.name).replace(/\s*[–-]\s*rendimenti.*$/i,"").trim(),colonnaAnno:colLetter(yc),colonnaGennaio:colLetter(mx.c),primaRiga:mx.r+2,ultimaRiga:null,ruolo:pct||big?"rendimento_percentuale":"rendimento_decimale"});
        parts.push({kind:"matrice",foglio:sh.name,conf:"alta",d:`«${sh.name}»: tabella di rendimenti mensili (anni in riga, mesi in colonna)`});
        continue;
      }
    }
    const an=analyzeSheet(sh.name,aoa),h=an.headerRow;if(h<0)continue;
    const hdr=aoa[h].map(v=>String(v??"").trim()),tags=hdr.map(headerTag),find=k=>tags.indexOf(k);
    const dateCols=an.cols.filter(c=>c.kind==="date"&&c.dateFrac>=.8).map(c=>c.idx).sort((a,b)=>a-b);
    /* 2) export di quotazioni (Yahoo, Investing, broker): Open/High/Low/Close/Adj Close/Volume */
    const iAdj=find("adjclose"),iClose=find("close"),ohlc=[find("open"),find("high"),find("low")].filter(i=>i>=0).length>=2;
    if(dateCols.length===1&&(iAdj>=0||(iClose>=0&&ohlc))){
      const pc=iAdj>=0?iAdj:iClose,nm=GENERIC_SHEET.test(sh.name)?(hdr[pc]||sh.name):sh.name;
      R.serieInColonna.push({foglio:sh.name,rigaIntestazione:h+1,colonnaData:colLetter(dateCols[0]),primaRiga:null,ultimaRiga:null,serie:[{colonna:colLetter(pc),nome:nm,ruolo:"prezzo",valuta:ccyOf(hdr[pc])}]});
      parts.push({kind:"quotazioni",foglio:sh.name,conf:"alta",d:`«${sh.name}»: export di quotazioni, uso ${iAdj>=0?"la chiusura rettificata":"la chiusura"} e ignoro aperture, massimi, minimi e volumi`});
      continue;
    }
    /* 3) due o più tabelle affiancate: ogni gruppo di colonne usa la colonna di date alla sua sinistra */
    if(dateCols.length>=2){
      const blocks=dateCols.map((dc,i)=>{const end=i+1<dateCols.length?dateCols[i+1]:Infinity,ser=an.cols.filter(c=>c.idx>dc&&c.idx<end&&ASSET_ROLES.includes(c.suggest));return ser.length?{foglio:sh.name,rigaIntestazione:h+1,colonnaData:colLetter(dc),primaRiga:null,ultimaRiga:null,serie:ser.map(c=>({colonna:c.letter,nome:c.name,ruolo:{price:"prezzo",ret:"rendimento_decimale",retpct:"rendimento_percentuale"}[c.suggest],valuta:ccyOf(c.name)}))}:null;}).filter(Boolean);
      if(blocks.length>=2){R.serieInColonna.push(...blocks);parts.push({kind:"affiancate",foglio:sh.name,conf:"media",d:`«${sh.name}»: ${blocks.length} tabelle affiancate con date diverse, unite per data`});continue;}
    }
    /* 4) movimenti: data + titolo/ISIN + (quantità e prezzo, oppure importo) */
    const cT=[find("name"),find("ticker"),find("isin")].find(i=>i>=0),cQ=find("qty"),cP=find("price")>=0?find("price"):find("close"),cA=find("amount"),cS=find("side");
    if(dateCols.length>=1&&cT!=null&&cT>=0&&((cQ>=0&&cP>=0)||(cA>=0&&cQ>=0))&&!R.movimenti){
      R.movimenti={foglio:sh.name,rigaIntestazione:h+1,colonnaData:colLetter(dateCols[0]),colonnaTitolo:colLetter(cT),colonnaIsin:find("isin")>=0?colLetter(find("isin")):null,colonnaQuantita:cQ>=0?colLetter(cQ):null,colonnaPrezzo:cP>=0?colLetter(cP):null,colonnaImporto:cA>=0?colLetter(cA):null,colonnaOperazione:cS>=0?colLetter(cS):null,valuta:null};
      const cc=find("ccy");if(cc>=0){const vals=new Set(aoa.slice(h+1).map(r=>String(r[cc]??"").trim().toUpperCase()).filter(Boolean));if(vals.size===1)R.movimenti.valuta=[...vals][0];}
      parts.push({kind:"movimenti",foglio:sh.name,conf:"media",d:`«${sh.name}»: elenco di acquisti e vendite`});
      continue;
    }
    /* 5) riepilogo di posizioni senza date: nome/ticker/ISIN + valore o peso */
    const cV=find("value")>=0?find("value"):cA,cW=tags.findIndex((t,i)=>t==="weight"&&!/target|obiettivo/i.test(hdr[i])),cG=tags.findIndex((t,i)=>t==="target"||(t==="weight"&&/target|obiettivo/i.test(hdr[i]))),cTk=find("ticker"),cIs=find("isin"),cN=find("name");
    /* colonne riconosciute dal contenuto: codici brevi (SWDA, CSNDX) e codici con la borsa (AMS:IWDA, ETR:XXSC, come in Google Finanza) */
    let tEnd=h+1;while(tEnd<aoa.length&&(aoa[tEnd]||[]).some(v=>!isBlank(v)))tEnd++; // la tabella finisce alla prima riga vuota
    const colFrac=(c,rx)=>{const v=aoa.slice(h+1,tEnd).map(r=>r[c]).filter(x=>typeof x==="string"&&x.trim()&&!/^(totale|total)\b/i.test(x.trim()));return v.length>=2?v.filter(x=>rx.test(x.trim())).length/v.length:0;};
    const width=Math.max(0,...aoa.slice(h,h+30).map(r=>r.length));
    let cEx=-1,cCode=-1;for(let c=0;c<width;c++){if(cEx<0&&colFrac(c,/^[A-Z]{2,8}:[A-Z0-9.\-]{1,12}$/)>=.8)cEx=c;if(cCode<0&&c!==cIs&&colFrac(c,/^[A-Z][A-Z0-9]{1,5}$/)>=.8)cCode=c;}
    const cTick=cTk>=0&&cTk!==cEx?cTk:cCode>=0?cCode:cTk;
    if(!dateCols.length&&(cTick>=0||cIs>=0||cEx>=0)&&(cV>=0||cW>=0)){
      const pos=[],sc=[],w=x=>{const p=parseNum(x);return p?(p.pct?p.n:p.n>1.5?p.n/100:p.n):null;};
      for(let r=h+1;r<tEnd;r++){const row=aoa[r],cell=c=>c>=0?String(row[c]??"").trim():"";
        const code=cell(cTick)||(cell(cEx).split(":")[1]||""),isin=cell(cIs),ex=cell(cEx),nm=cell(cN)||code||isin;
        if(!nm&&!code&&!isin)continue;if(/^(totale|total|somma)\b/i.test(nm)||/^(totale|total|somma)\b/i.test(code))continue;
        if(!code&&!isin&&!ex){const v=cV>=0?parseNum(row[cV]):null;if(nm)sc.push(`${nm}${v?` ${fmtN(v.n,0)} €`:""}: senza ticker né ISIN`);continue;}
        const v=cV>=0?parseNum(row[cV]):null;
        pos.push({nome:nm,ticker:code||isin,isin:isin||null,simbolo:ex||code||"",valore:v?v.n:null,pesoAttuale:cW>=0?w(row[cW]):null,pesoTarget:cG>=0?w(row[cG]):null});}
      if(pos.length){R.posizioni=pos;R.scartati.push(...sc);parts.push({kind:"posizioni",foglio:sh.name,conf:"media",d:`«${sh.name}»: riepilogo di ${pos.length} posizioni senza storico`});continue;}
    }
  }
  /* più fogli di quotazioni: ognuno diventa una serie, tutte unite per data */
  return parts.length?{recipe:R,parts}:null;
}

/* ---------- Impronta della struttura di un file: per riconoscere lo stesso modello la volta dopo (solo struttura, niente valori) ---------- */
function structureFingerprint(sheets){
  const norm=v=>String(v??"").toLowerCase().replace(/\d+/g,"#").replace(/\s+/g," ").trim();
  const sig=(sheets||[]).map(s=>{const rows=(s.aoa||[]).slice(0,12).map(r=>(r||[]).filter(v=>typeof v==="string"&&v.trim()&&!parseNum(v)&&!parseDate(v,false)).map(norm).join("|")).filter(Boolean).join("¶");return norm(s.name)+"§"+rows;});
  const uniq=[...new Set(sig)].sort().join("\n");
  let h1=5381,h2=52711;for(let i=0;i<uniq.length;i++){const c=uniq.charCodeAt(i);h1=(h1*33)^c;h2=(h2*33)^c;}
  return ((h1>>>0).toString(16)+(h2>>>0).toString(16)).padStart(16,"0");
}

const FREQS=[{max:4,label:"giornaliera",adj:"giornaliere",f:252},{max:10,label:"settimanale",adj:"settimanali",f:52},{max:45,label:"mensile",adj:"mensili",f:12},{max:120,label:"trimestrale",adj:"trimestrali",f:4},{max:Infinity,label:"annuale",adj:"annuali",f:1}];
const OUTLIER={252:0.25,52:0.35,12:0.5,4:0.7,1:1.5};
const ASSET_ROLES=["price","ret","retpct"];

/* opts (decisioni dell'utente sulle anomalie): {adjust:{[col]:[{k,factor}]}, exclude:{[col]:[k]}, dropFuture:bool, today:Date}
   Restituisce anche "anomalies": frazionamenti, cambi di unità, date future, prezzi fermi. Le prime tre richiedono una decisione. */
function buildDataset(an,roles,opts){
  opts=opts||{};
  const Q={errors:[],warnings:[],infos:[]},anomalies=[];
  const fail=()=>({ok:false,Q,assets:[],dates:[],anomalies});
  const dateIdx=an.cols.map(c=>c.idx).find(i=>roles[i]==="date");
  const assetCols=an.cols.filter(c=>ASSET_ROLES.includes(roles[c.idx]));
  if(dateIdx===undefined){Q.errors.push("Manca una colonna data: senza date non posso ordinare le osservazioni né calcolare la frequenza.");return fail();}
  if(!assetCols.length){Q.errors.push("Nessuna colonna è indicata come prezzo o rendimento.");return fail();}
  const dcol=an.cols.find(c=>c.idx===dateIdx);
  let rows=[],bad=0;
  an.body.forEach((b,i)=>{
    const d=parseDate(b.row[dateIdx],dcol.hintDate);
    if(!d){if(!isBlank(b.row[dateIdx]))bad++;return;}
    rows.push({d,i});
  });
  if(bad)Q.infos.push(`${bad} ${bad===1?"riga senza una data valida è stata esclusa":"righe senza una data valida sono state escluse"} (per esempio totali o medie in fondo al foglio).`);
  let sorted=true;for(let k=1;k<rows.length;k++)if(rows[k].d<rows[k-1].d){sorted=false;break;}
  if(!sorted){rows.sort((a,b)=>a.d-b.d);Q.infos.push("Le date non erano in ordine cronologico: le ho ordinate.");}
  const seen=new Set();let dup=0;
  rows=rows.filter(x=>{const k=x.d.getTime();if(seen.has(k)){dup++;return false;}seen.add(k);return true;});
  const today=opts.today||new Date(),fut=rows.filter(x=>x.d>today);
  if(fut.length){if(opts.dropFuture){rows=rows.filter(x=>x.d<=today);Q.infos.push(`${fut.length} ${fut.length===1?"data futura esclusa":"date future escluse"} (righe di previsione o modello da compilare).`);}
    else anomalies.push({id:"future",type:"future",block:true,n:fut.length,text:`${fut.length} ${fut.length===1?"riga ha una data":"righe hanno date"} nel futuro (dalla ${fmtDate(fut[0].d)}): previsioni, righe da compilare o un errore di data.`});}
  if(dup>rows.length*0.5)Q.warnings.push("Molte date si ripetono: il file potrebbe avere una riga per asset e per data (formato lungo). Questa versione legge un asset per colonna.");
  else if(dup)Q.warnings.push(`${dup} date duplicate: ho tenuto solo la prima occorrenza.`);
  if(rows.length<3){Q.errors.push("Servono almeno 3 date valide per costruire una serie.");return fail();}
  const dates=rows.map(x=>x.d);
  const diffs=[];for(let k=1;k<rows.length;k++)diffs.push((dates[k]-dates[k-1])/864e5);
  const md=median(diffs),freq=FREQS.find(f=>md<=f.max);
  const gapThr=freq.f===252?5:md*1.8,gaps=diffs.filter(x=>x>gapThr).length;
  if(gaps)Q.warnings.push(`${gaps} ${gaps===1?"buco":"buchi"} nel calendario: mancano dei periodi rispetto alla frequenza ${freq.label}.`);
  const thr=OUTLIER[freq.f];
  const assets=assetCols.map(c=>{
    const role=roles[c.idx],ret=new Array(rows.length).fill(NaN),missDates=[];
    let missing=0,nonpos=0,first;
    const vals=rows.map(x=>c.nums[x.i]);
    let f0=vals.findIndex(x=>x!==null),l=vals.length-1;while(l>=0&&vals[l]===null)l--;
    if(role==="price"){
      for(let k=0;k<vals.length;k++)if(vals[k]!==null&&vals[k]<=0){nonpos++;vals[k]=null;}
      /* correzioni decise dall'utente: frazionamento o cambio di unità a partire dal periodo k → i prezzi precedenti vengono riportati sulla stessa scala */
      ((opts.adjust||{})[c.idx]||[]).forEach(a=>{for(let j=0;j<a.k&&j<vals.length;j++)if(vals[j]!==null)vals[j]*=a.factor;});
      f0=vals.findIndex(x=>x!==null);
      for(let k=f0+1;k<=l;k++){
        if(vals[k]===null){missing++;missDates.push(dates[k]);continue;}
        if(vals[k-1]!==null)ret[k]=vals[k]/vals[k-1]-1;
      }
      first=f0+1;
    }else{
      const sc=role==="retpct"?0.01:1;
      for(let k=f0;k<=l;k++){
        if(vals[k]===null){missing++;missDates.push(dates[k]);continue;}
        ret[k]=vals[k]*sc;
      }
      first=f0;
      if(role==="ret"&&c.maxAbs>1)Q.warnings.push(`«${c.name}»: valori oltre ±1 per dei rendimenti decimali. Forse sono in punti percentuali?`);
    }
    if(nonpos)Q.warnings.push(`«${c.name}»: ${nonpos} prezzi nulli o negativi esclusi.`);
    if(role==="price"){
      /* frazionamenti (1:2, 1:10, raggruppamenti) e cambi di unità (×100, per esempio pence e sterline): salti che non sono rendimenti */
      const done=new Set(((opts.adjust||{})[c.idx]||[]).map(a=>a.k)),excl=new Set((opts.exclude||{})[c.idx]||[]);
      for(let k=1;k<vals.length;k++){
        if(opts.values||c.flowValue)break; // valori di patrimonio: un salto è un versamento o una vendita, non un frazionamento
        if(vals[k]==null||vals[k-1]==null||done.has(k)||excl.has(k))continue;
        const q=vals[k]/vals[k-1];if(q>.55&&q<1.8)continue;
        for(const n of [100,.01,2,3,4,5,10,20,.5,1/3,.25,.2,.1,.05]){
          if(Math.abs(q/n-1)<(Math.abs(Math.log(n))>4?.06:.025)){const unit=n===100||n===.01;
            anomalies.push({id:`${unit?"unit":"split"}:${c.idx}:${k}`,type:unit?"unit":"split",block:true,col:c.idx,k,factor:n,date:dates[k],asset:c.name,
              text:`«${c.name}», ${fmtDate(dates[k],freq.f)}: il prezzo passa da ${fmtN(vals[k-1])} a ${fmtN(vals[k])} (×${n>=1?fmtN(n,n%1?2:0):"1/"+fmtN(1/n,0)}). ${unit?"Sembra un cambio di unità (per esempio pence e sterline)":"Sembra un frazionamento o un raggruppamento di azioni"}, non un rendimento del ${fmtPct(q-1,0)}.`});
            break;}
        }
      }
      /* prezzi quasi sempre uguali: non è uno storico di mercato (per esempio il prezzo di oggi copiato su tutte le date) */
      const nv=vals.filter(v=>v!=null),cnt=new Map();nv.forEach(v=>cnt.set(v,(cnt.get(v)||0)+1));const top=Math.max(0,...cnt.values());
      if(nv.length>=8&&top/nv.length>=.8)anomalies.push({id:`flat:${c.idx}`,type:"flat",block:true,col:c.idx,asset:c.name,text:`«${c.name}»: lo stesso prezzo (${fmtN([...cnt].find(x=>x[1]===top)[0])}) nel ${Math.round(top/nv.length*100)}% delle date. Non è uno storico di mercato: rendimenti e rischi verrebbero quasi zero.`});
      else{
      /* prezzi fermi per molti periodi: valori inseriti a mano o strumento non quotato */
      let run=1,maxRun=1,at=0;for(let k=1;k<vals.length;k++){if(vals[k]!=null&&vals[k]===vals[k-1]){run++;if(run>maxRun){maxRun=run;at=k;}}else run=1;}
      if(maxRun>=(freq.f>=52?15:6))anomalies.push({id:`stale:${c.idx}`,type:"stale",block:false,col:c.idx,asset:c.name,text:`«${c.name}»: lo stesso valore per ${maxRun} periodi di fila (fino a ${fmtDate(dates[at],freq.f)}). Valori inseriti a mano o strumento senza quotazione: la volatilità risulterà più bassa del vero.`});
      }
    }
    ((opts.exclude||{})[c.idx]||[]).forEach(k=>{if(k<ret.length)ret[k]=NaN;});
    if(missing)Q.warnings.push(`«${c.name}»: ${missing} ${missing===1?"valore mancante":"valori mancanti"} (${missDates.slice(0,3).map(d=>fmtDate(d,freq.f)).join(", ")}${missing>3?"…":""}). Esclusi dai calcoli, non stimati.`);
    const out=[];ret.forEach((x,k)=>{if(Number.isFinite(x)&&(Math.abs(x)>thr||x<=-1))out.push(k);});
    if(out.length)Q.warnings.push(`«${c.name}»: ${out.length} ${out.length===1?"rendimento anomalo":"rendimenti anomali"} (oltre ±${Math.round(thr*100)}% in un periodo), per esempio ${fmtPct(ret[out[0]])} a ${fmtDate(dates[out[0]],freq.f)}. Verifica che non sia un errore.`);
    return {name:c.name,col:c.letter,role,ret,first,missing};
  });
  const minFirst=Math.min(...assets.map(a=>a.first));
  assets.forEach(a=>{if(a.first>minFirst+1)Q.infos.push(`«${a.name}» inizia a ${fmtDate(dates[a.first],freq.f)}, dopo le altre serie.`);});
  const years=(dates[dates.length-1]-dates[0])/(365.25*864e5)+1/freq.f;
  return {ok:true,Q,dates,freq,medianDays:md,assets,nObs:rows.length,years,anomalies};
}

function stats(a,f,dates){
  const idx=[];a.ret.forEach((x,k)=>{if(Number.isFinite(x))idx.push(k);});
  const r=idx.map(k=>a.ret[k]),n=r.length;
  if(n<2)return {n,idx};
  const mean=r.reduce((s,x)=>s+x,0)/n;
  const sd=Math.sqrt(r.reduce((s,x)=>s+(x-mean)**2,0)/(n-1));
  const valid=r.every(x=>x>-1);
  const logSum=valid?r.reduce((s,x)=>s+Math.log1p(x),0):NaN;
  const cagr=valid?Math.exp(logSum*f/n)-1:NaN,total=valid?Math.exp(logSum)-1:NaN;
  const vol=sd*Math.sqrt(f),sharpe=vol>0?(mean*f)/vol:NaN;
  let w=1,peak=1,peakK=Math.max(0,idx[0]-1),mdd=0,mddPeak=peakK,mddTrough=idx[0];
  for(const k of idx){w*=1+a.ret[k];if(w>peak){peak=w;peakK=k;}const dd=w/peak-1;if(dd<mdd){mdd=dd;mddTrough=k;mddPeak=peakK;}}
  let worstK=idx[0],bestK=idx[0];
  for(const k of idx){if(a.ret[k]<a.ret[worstK])worstK=k;if(a.ret[k]>a.ret[bestK])bestK=k;}
  return {n,idx,mean,sd,cagr,total,vol,sharpe,mdd,mddPeak,mddTrough,worst:a.ret[worstK],worstK,best:a.ret[bestK],bestK,
    from:dates[idx[0]],to:dates[idx[n-1]],skipped:a.missing};
}
function corr(a,b){
  const xs=[],ys=[];
  for(let k=0;k<a.ret.length;k++)if(Number.isFinite(a.ret[k])&&Number.isFinite(b.ret[k])){xs.push(a.ret[k]);ys.push(b.ret[k]);}
  const n=xs.length;if(n<3)return {n,r:NaN};
  const mx=xs.reduce((s,x)=>s+x,0)/n,my=ys.reduce((s,x)=>s+x,0)/n;
  let sxy=0,sxx=0,syy=0;for(let i=0;i<n;i++){const dx=xs[i]-mx,dy=ys[i]-my;sxy+=dx*dy;sxx+=dx*dx;syy+=dy*dy;}
  return {n,r:sxx>0&&syy>0?sxy/Math.sqrt(sxx*syy):NaN};
}
function wealth(a,len){
  const W=new Array(len).fill(NaN);let w=100;
  if(a.first>=1)W[a.first-1]=100;
  for(let k=Math.max(0,a.first);k<len;k++){if(Number.isFinite(a.ret[k]))w*=1+a.ret[k];W[k]=w;}
  return W;
}
function capabilities(ds){
  if(!ds.ok)return [];
  const n=ds.nObs,k=ds.assets.length,y=ds.years;
  return [
    {name:"Statistiche descrittive e rendimenti annualizzati",ok:n>=12,why:n>=12?`${n} osservazioni`:"servono almeno 12 osservazioni"},
    {name:"Volatilità, Sharpe, Sortino e drawdown",ok:n>=24,why:n>=24?`${n} osservazioni ${ds.freq.adj}`:"servono almeno 24 osservazioni"},
    {name:"Matrice di correlazione",ok:k>=2,why:k>=2?`${k} asset, ${k*(k-1)/2} coppie`:"serve almeno un secondo asset"},
    {name:"Confronto tra allocazioni e ribilanciamento",ok:k>=2,why:k>=2?`portafogli combinando ${k} asset`:"serve almeno un secondo asset"},
    {name:"Monte Carlo con ricampionamento storico",ok:y>=5,why:y>=5?`${fmtN(y,1)} anni di storia da ricampionare`:"meno di 5 anni di storia: risultati poco affidabili"},
    {name:"Stress test: crisi storiche",ok:true,why:(()=>{const inn=CRISES.filter(c=>{const [a,b]=crisisRange(c,ds.freq.f);return ds.dates[0].getTime()<a&&ds.dates[ds.dates.length-1].getTime()>=b;});return inn.length?`nei dati: ${inn.map(c=>c.name).join(", ")}`:"nessuna crisi nei dati: solo shock ipotetici";})()}
  ];
}
/* ===== Rischio (Modulo 2): tutto storico e deterministico ===== */
function quantile(sorted,p){
  if(!sorted.length)return NaN;
  const pos=(sorted.length-1)*p,lo=Math.floor(pos),hi=Math.ceil(pos);
  return sorted[lo]+(sorted[hi]-sorted[lo])*(pos-lo);
}
function riskStats(ret,f,rfAnnual){
  const idx=[];ret.forEach((x,k)=>{if(Number.isFinite(x))idx.push(k);});
  const r=idx.map(k=>ret[k]),n=r.length;
  if(n<6)return {n};
  const s=[...r].sort((a,b)=>a-b),rfA=rfAnnual||0;
  const q05=quantile(s,.05),q01=quantile(s,.01);
  const tailMean=q=>{const t=s.filter(x=>x<=q);return t.length?t.reduce((a,b)=>a+b,0)/t.length:q;};
  const mean=r.reduce((a,b)=>a+b,0)/n,v=r.reduce((a,x)=>a+(x-mean)**2,0)/n,sd=Math.sqrt(v*n/(n-1));
  const mar=rfA/f,downDev=Math.sqrt(r.reduce((a,x)=>a+Math.min(0,x-mar)**2,0)/n)*Math.sqrt(f);
  const skew=v>0?(r.reduce((a,x)=>a+(x-mean)**3,0)/n)/Math.pow(v,1.5):NaN;
  const kurt=v>0?(r.reduce((a,x)=>a+(x-mean)**4,0)/n)/(v*v)-3:NaN;
  const dd=new Array(ret.length).fill(NaN);
  let w=1,peak=1,peakK=Math.max(0,idx[0]-1),start=null,longest=0,lStart=null,lEnd=null,mdd=0,troughK=null,peakAtTrough=null;
  for(const k of idx){
    w*=1+ret[k];
    if(w>=peak){if(start!==null){if(k-start>longest){longest=k-start;lStart=start;lEnd=k;}start=null;}peak=w;peakK=k;}
    else if(start===null)start=peakK;
    dd[k]=w/peak-1;
    if(dd[k]<mdd){mdd=dd[k];troughK=k;peakAtTrough=peakK;}
  }
  let ongoing=false;
  if(start!==null&&idx[n-1]-start>longest){longest=idx[n-1]-start;lStart=start;lEnd=null;ongoing=true;}
  let recK=null;if(troughK!==null)for(const k of idx){if(k>troughK&&dd[k]>=-1e-12){recK=k;break;}}
  const win=Math.max(1,Math.round(f));let best12=NaN,worst12=NaN,best12K=null,worst12K=null;
  if(n>win)for(let j=win-1;j<n;j++){let g=1;for(let t=j-win+1;t<=j;t++)g*=1+r[t];g-=1;
    if(!(g<=best12)){best12=g;best12K=idx[j];}if(!(g>=worst12)){worst12=g;worst12K=idx[j];}}
  /* Sharpe con la sua incertezza (Mertens 2002, valido anche con code spesse e asimmetria) e Probabilistic Sharpe Ratio (Bailey & López de Prado) */
  const sp=sd>0?(mean-mar)/sd:NaN,varSp=(1+.5*sp*sp-skew*sp+(kurt/4)*sp*sp)/(n-1),srSE=Math.sqrt(Math.max(0,varSp))*Math.sqrt(f),srAnn=sp*Math.sqrt(f);
  /* VaR al 95%: storico (sopra), parametrico normale e Cornish-Fisher (corregge per asimmetria e curtosi) */
  const z=-1.6448536269514722,zcf=z+(z*z-1)*skew/6+(z**3-3*z)*kurt/24-(2*z**3-5*z)*skew*skew/36;
  /* drawdown in dettaglio: Ulcer index, Pain index, tempo sott'acqua, calo medio */
  const dv=idx.map(k=>dd[k]),under=dv.filter(x=>x<-1e-12);
  const up=r.reduce((a,x)=>a+Math.max(0,x-mar),0),dn=r.reduce((a,x)=>a+Math.max(0,mar-x),0);
  return {n,mean,sd,var95:-q05,var99:-q01,cvar95:-tailMean(q05),cvar99:-tailMean(q01),q05,q01,
    tail95:s.filter(x=>x<=q05).length,mar,downDev,sortino:downDev>0?(mean*f-rfA)/downDev:NaN,skew,kurt,
    pctPos:r.filter(x=>x>0).length/n,dd,mdd,troughK,peakAtTrough,recK,longest,lStart,lEnd,ongoing,win,best12,best12K,worst12,worst12K,sorted:s,
    srAnn,srSE,srLo:srAnn-1.959964*srSE,srHi:srAnn+1.959964*srSE,psr:varSp>0?normCdf(sp/Math.sqrt(varSp)):NaN,
    varParam95:-(mean+z*sd),varCF95:-(mean+zcf*sd),zcf,
    ulcer:Math.sqrt(dv.reduce((a,x)=>a+x*x,0)/dv.length),pain:dv.reduce((a,x)=>a-x,0)/dv.length,underwater:under.length/dv.length,
    avgDD:under.length?under.reduce((a,x)=>a+x,0)/under.length:0,omega:dn>0?up/dn:NaN};
}
/* ===== Distribuzioni per i test statistici ===== */
function normCdf(x){ // Φ(x), errore < 1e-7 (W. J. Cody, approssimazione razionale di erfc)
  const z=Math.abs(x)/Math.SQRT2,t=1/(1+.5*z),y=t*Math.exp(-z*z-1.26551223+t*(1.00002368+t*(.37409196+t*(.09678418+t*(-.18628806+t*(.27886807+t*(-1.13520398+t*(1.48851587+t*(-.82215223+t*.17087277)))))))));
  return x>=0?1-y/2:y/2;
}
function lgamma(x){const c=[76.18009172947146,-86.50532032941677,24.01409824083091,-1.231739572450155,.1208650973866179e-2,-.5395239384953e-5];let y=x,t=x+5.5;t-=(x+.5)*Math.log(t);let s=1.000000000190015;for(const ci of c)s+=ci/++y;return -t+Math.log(2.5066282746310005*s/x);}
function betacf(a,b,x){let qab=a+b,qap=a+1,qam=a-1,c=1,d=1-qab*x/qap;if(Math.abs(d)<1e-30)d=1e-30;d=1/d;let h=d;
  for(let m=1;m<=200;m++){const m2=2*m;let aa=m*(b-m)*x/((qam+m2)*(a+m2));d=1+aa*d;if(Math.abs(d)<1e-30)d=1e-30;c=1+aa/c;if(Math.abs(c)<1e-30)c=1e-30;d=1/d;h*=d*c;
    aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2));d=1+aa*d;if(Math.abs(d)<1e-30)d=1e-30;c=1+aa/c;if(Math.abs(c)<1e-30)c=1e-30;d=1/d;const del=d*c;h*=del;if(Math.abs(del-1)<3e-12)break;}
  return h;}
function ibeta(a,b,x){if(x<=0)return 0;if(x>=1)return 1;const bt=Math.exp(lgamma(a+b)-lgamma(a)-lgamma(b)+a*Math.log(x)+b*Math.log(1-x));return x<(a+1)/(a+b+2)?bt*betacf(a,b,x)/a:1-bt*betacf(b,a,1-x)/b;}
function tCdf(t,df){const x=df/(df+t*t),p=.5*ibeta(df/2,.5,x);return t>0?1-p:p;}
const pTwoSided=(t,df)=>2*(1-tCdf(Math.abs(t),df));
function tInv975(df){let a=0,b=20;for(let k=0;k<80;k++){const m=(a+b)/2;if(tCdf(m,df)<.975)a=m;else b=m;}return (a+b)/2;} // quantile 97,5% della t di Student
const chi2p1=lr=>lr<=0?1:2*(1-normCdf(Math.sqrt(lr))); // p-value di una χ² con 1 grado di libertà
/* Backtest del VaR storico fuori campione: ogni periodo il VaR è stimato sui "win" periodi precedenti,
   poi si conta quante volte la perdita lo supera. Test di Kupiec (proportion of failures). */
function varBacktest(ret,win,alpha){
  alpha=alpha||.05;const r=ret.filter(Number.isFinite);let n=0,x=0;const hits=[];
  for(let t=win;t<r.length;t++){const s=r.slice(t-win,t).sort((a,b)=>a-b),v=-quantile(s,alpha);n++;if(r[t]<-v){x++;hits.push(t);}}
  if(n<20)return {n,error:`Servono almeno ${win+20} periodi per il backtest: ce ne sono ${r.length}.`};
  const ph=x/n,ll0=(n-x)*Math.log(1-alpha)+x*Math.log(alpha),ll1=(x?x*Math.log(ph):0)+(n-x?(n-x)*Math.log(1-ph):0),lr=-2*(ll0-ll1),p=chi2p1(lr);
  return {n,x,expected:n*alpha,rate:ph,alpha,win,lr,p,ok:p>=.05};
}
function covMatrix(assets){
  const T=assets[0].ret.length,common=[];
  for(let t=0;t<T;t++)if(assets.every(a=>Number.isFinite(a.ret[t])))common.push(t);
  const m=common.length,mu=assets.map(a=>common.reduce((s,t)=>s+a.ret[t],0)/(m||1));
  const C=assets.map((a,i)=>assets.map((b,j)=>m>1?common.reduce((s,t)=>s+(a.ret[t]-mu[i])*(b.ret[t]-mu[j]),0)/(m-1):NaN));
  return {C,common:m};
}
function riskContrib(w,C,f){
  const Cw=C.map(row=>row.reduce((s,x,j)=>s+x*w[j],0)),varP=w.reduce((s,x,i)=>s+x*Cw[i],0),sp=Math.sqrt(Math.max(0,varP));
  const rc=w.map((x,i)=>sp>0?x*Cw[i]/sp:0),sig=C.map((row,i)=>Math.sqrt(Math.max(0,row[i]))),hhi=w.reduce((s,x)=>s+x*x,0);
  /* MCRᵢ = ∂σₚ/∂wᵢ = (Σw)ᵢ / σₚ ; CCRᵢ = wᵢ · MCRᵢ (punti di volatilità, Σ CCR = σₚ) — tutto annualizzato con √f */
  const mcr=Cw.map(x=>sp>0?x/sp*Math.sqrt(f):NaN),ccr=mcr.map((x,i)=>w[i]*x);
  return {volP:sp*Math.sqrt(f),pct:rc.map(x=>sp>0?x/sp:0),sig:sig.map(x=>x*Math.sqrt(f)),mcr,ccr,
    divRatio:sp>0?w.reduce((s,x,i)=>s+x*sig[i],0)/sp:NaN,hhi,neff:hhi>0?1/hhi:NaN};
}
function countOut(text,d){let n=0,q=false;for(const ch of text){if(ch==='"')q=!q;else if(!q&&ch===d)n++;}return n;}
function parseCSV(text){
  text=text.replace(/^﻿/,"");
  let delim=null;const sepLine=text.match(/^sep=(.)\r?\n/i);
  if(sepLine){delim=sepLine[1];text=text.slice(sepLine[0].length);}
  if(!delim){const head=text.split(/\r?\n/).slice(0,15).join("\n");let bc=-1;for(const d of [";",",","\t","|"]){const c=countOut(head,d);if(c>bc){bc=c;delim=d;}}}
  const rows=[];let row=[],cell="",q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(q){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=ch;}
    else if(ch==='"')q=true;
    else if(ch===delim){row.push(cell);cell="";}
    else if(ch==="\n"||ch==="\r"){if(ch==="\r"&&text[i+1]==="\n")i++;row.push(cell);rows.push(row);row=[];cell="";}
    else cell+=ch;
  }
  if(cell!==""||row.length){row.push(cell);rows.push(row);}
  return rows.map(r=>r.map(c=>c.trim()===""?null:c));
}
function sampleSheets(){
  let s=20240917;
  const rnd=()=>{s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
  const gauss=()=>{let u=0;while(u===0)u=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rnd());};
  const shocks={"2011-8":[-.075,-.09,.012,.06],"2011-9":[-.06,-.1,.01,-.08],"2015-8":[-.07,-.09,0,.02],"2018-12":[-.065,-.03,.005,.04],"2020-2":[-.085,-.05,0,-.002],"2020-3":[-.13,-.16,-.03,-.005],"2020-4":[.11,.09,.015,.065],"2022-1":[-.05,-.02,-.02,-.02],"2022-6":[-.07,-.06,-.035,-.015],"2022-9":[-.06,-.08,-.04,-.03]};
  const aoa=[["Report portafoglio · estrazione interna"],[],["Data rif.","Az. Globale (EUR)","Az. Emergenti","Obblig. Euro","Oro - rend. mensile","Flussi netti (mln)","Note"]];
  const p=[100,100,100];
  for(let y=2010;y<=2024;y++)for(let m=0;m<12;m++){
    const z=gauss();
    let rg=.0105+.035*z,re=.009+.038*z+.028*gauss(),rb=.0022+.01*gauss(),ro=.0068+.036*gauss()+.004*z;
    if(y===2022)rb-=.012;
    const sh=shocks[`${y}-${m+1}`];if(sh)[rg,re,rb,ro]=sh;
    p[0]*=1+rg;p[1]*=1+re;p[2]*=1+rb;
    const last=new Date(Date.UTC(y,m+1,0)).getUTCDate();
    const ds=`${String(last).padStart(2,"0")}/${String(m+1).padStart(2,"0")}/${y}`;
    const missEM=(y===2015&&m===5)||(y===2018&&m===10);
    const note=m===11&&y%3===0?"ribilanciamento annuale":(y===2020&&m===2?"forte volatilità":null);
    const flow=Math.round(rnd()*900-420);
    aoa.push([ds,+p[0].toFixed(2),missEM?null:+p[1].toFixed(2),+p[2].toFixed(2),(ro*100).toFixed(2).replace(".",",")+"%",flow,note]);
  }
  aoa.push([]);aoa.push(["Media"]);
  return [{name:"Rendimenti ETF",aoa},{name:"Legenda",aoa:[["Foglio di note"],["Prezzi di fine mese in euro, base 100 a gennaio 2010"],["Dati sintetici generati per la demo"]]}];
}
/* ===== Portafoglio e Monte Carlo: deterministici a parità di seme ===== */
function portfolioReturns(assets,w){
  const n=assets.length?assets[0].ret.length:0,ret=new Array(n).fill(NaN);
  for(let k=0;k<n;k++){let r=0,ws=0;assets.forEach((a,i)=>{if(w[i]>0&&Number.isFinite(a.ret[k])){r+=w[i]*a.ret[k];ws+=w[i];}});if(ws>.999)ret[k]=r;}
  return ret;
}
function makeRng(seed){let s=seed|0;return ()=>{s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const MC_PCT=[.05,.10,.25,.50,.75,.90,.95];
function monteCarlo(o){
  const hist=(o.ret||[]).filter(Number.isFinite),m=hist.length,f=o.f||12;
  if(m<12)return {error:"Servono almeno 12 rendimenti storici per simulare."};
  const years=Math.max(1,Math.min(60,Math.round(o.years||10))),steps=years*f,n=Math.max(100,Math.min(20000,Math.round(o.n||2000)));
  const method=["boot","block","normal"].includes(o.method)?o.method:"boot",block=Math.max(2,Math.min(m,Math.round(o.block||f)));
  const initial=Math.max(0,+o.initial||0),perStep=(+o.monthly||0)*12/f,feeF=Math.pow(1-Math.max(0,Math.min(.2,+o.costs||0)),1/f);
  const infl=Number.isFinite(+o.infl)?+o.infl:0,goal=+o.goal||0,rnd=makeRng(o.seed==null?1:o.seed);
  const mean=hist.reduce((s,x)=>s+x,0)/m,sd=Math.sqrt(hist.reduce((s,x)=>s+(x-mean)**2,0)/Math.max(1,m-1));
  const gauss=()=>{let u=0;while(u===0)u=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rnd());};
  const Y=years+1,cp=new Float64Array(n*Y),fin=new Float64Array(n),mdd=new Float64Array(n);let depleted=0;
  for(let s=0;s<n;s++){
    let W=initial,idx=1,peak=1,dd=0,pos=0,dead=false;cp[s*Y]=W;
    for(let t=1;t<=steps;t++){
      let r;
      if(method==="normal")r=Math.max(-.99,mean+sd*gauss());
      else if(method==="block"){if((t-1)%block===0)pos=Math.floor(rnd()*m);else pos=(pos+1)%m;r=hist[pos];}
      else r=hist[Math.floor(rnd()*m)];
      idx*=1+r;if(idx>peak)peak=idx;const d=idx/peak-1;if(d<dd)dd=d;
      if(!dead){W=W*(1+r)*feeF+perStep;if(W<=0&&perStep<0){W=0;dead=true;}}
      if(t%f===0)cp[s*Y+t/f]=W;
    }
    fin[s]=W;mdd[s]=dd;if(dead)depleted++;
  }
  const defl=y=>Math.pow(1+infl,y),pct=(arr)=>{const a=Array.from(arr).sort((x,y)=>x-y);return MC_PCT.map(p=>quantile(a,p));};
  const fan=[];for(let y=0;y<Y;y++){const col=new Float64Array(n);for(let s=0;s<n;s++)col[s]=cp[s*Y+y];const p=pct(col);fan.push({y,nom:p,real:p.map(v=>v/defl(y)),invested:initial+perStep*f*y});}
  const finSorted=Array.from(fin).sort((a,b)=>a-b),invested=initial+perStep*steps,finReal=finSorted.map(v=>v/defl(years));
  const share=c=>finSorted.filter(c).length/n;
  return {method,block,n,years,steps,f,initial,perStep,monthly:+o.monthly||0,infl,costs:+o.costs||0,seed:o.seed==null?1:o.seed,hist:{m,mean,sd},
    pcts:MC_PCT,fan,final:finSorted,finalReal:finReal,invested,
    pFinal:pct(fin),pFinalReal:pct(fin).map(v=>v/defl(years)),
    probGoal:goal>0?share(v=>v>=goal):NaN,probGoalReal:goal>0?finReal.filter(v=>v>=goal).length/n:NaN,goal,
    probLoss:share(v=>v<invested),
    /* errore standard di una proporzione stimata su n percorsi: √(p(1−p)/n) */
    probGoalSE:goal>0?Math.sqrt(share(v=>v>=goal)*(1-share(v=>v>=goal))/n):NaN,probLossSE:Math.sqrt(share(v=>v<invested)*(1-share(v=>v<invested))/n),depleted:depleted/n,mean:finSorted.reduce((a,b)=>a+b,0)/n,
    mddMedian:quantile(Array.from(mdd).sort((a,b)=>a-b),.5),mddP5:quantile(Array.from(mdd).sort((a,b)=>a-b),.05)};
}
/* ===== Stress test: crisi storiche sui dati reali e shock ipotetici ===== */
/* Finestre dal massimo al minimo dell'azionario globale (date indicative). m = mesi inclusi per dati mensili o più radi. */
const CRISES=[
  {id:"dotcom",name:"Bolla dot-com",d0:"2000-03-27",d1:"2002-10-09",m0:"2000-04",m1:"2002-09",what:"Scoppio della bolla tecnologica: tre anni di ribassi, guidati dai titoli tecnologici."},
  {id:"gfc",name:"Crisi finanziaria 2008",d0:"2007-11-01",d1:"2009-03-09",m0:"2007-11",m1:"2009-02",what:"Crisi dei mutui subprime e fallimento di Lehman Brothers: il crollo più profondo dal dopoguerra."},
  {id:"euro",name:"Crisi del debito euro",d0:"2011-05-02",d1:"2011-10-04",m0:"2011-05",m1:"2011-09",what:"Timori sul debito di Grecia, Italia e Spagna e declassamento del rating USA."},
  {id:"covid",name:"Crollo COVID-19",d0:"2020-02-20",d1:"2020-03-23",m0:"2020-02",m1:"2020-03",what:"Pandemia e lockdown: il crollo più rapido della storia, seguito da un rimbalzo altrettanto veloce."},
  {id:"infl",name:"Shock inflazione 2022",d0:"2022-01-04",d1:"2022-10-12",m0:"2022-01",m1:"2022-09",what:"Inflazione alta e rialzo rapido dei tassi: azioni e obbligazioni in calo insieme."}
];
function crisisRange(c,f){
  if(f<=12){const [y0,mo0]=c.m0.split("-").map(Number),[y1,mo1]=c.m1.split("-").map(Number);return [Date.UTC(y0,mo0-1,1),Date.UTC(y1,mo1,0)];}
  return [Date.parse(c.d0+"T00:00:00Z"),Date.parse(c.d1+"T00:00:00Z")];
}
function crisisAnalysis(dates,assets,w,f,c){
  const [a,b]=crisisRange(c,f),idx=[];dates.forEach((d,k)=>{const t=d.getTime();if(t>=a&&t<=b)idx.push(k);});
  const pr=portfolioReturns(assets,w),out={id:c.id,name:c.name,what:c.what,from:new Date(a),to:new Date(b),idx};
  const first=pr.findIndex(Number.isFinite),last=pr.length-1-[...pr].reverse().findIndex(Number.isFinite);
  const valid=idx.filter(k=>Number.isFinite(pr[k]));
  if(!idx.length||first<0||dates[first].getTime()>b||dates[last].getTime()<a){out.status="out";return out;}
  /* coperta se i dati iniziano entro il primo periodo della crisi e arrivano alla fine, con almeno il 90% dei periodi */
  const startsIn=first<=idx[0],endsIn=dates[last].getTime()>=dates[idx[idx.length-1]].getTime();
  out.status=startsIn&&endsIn&&valid.length>=Math.ceil(idx.length*.9)?"in":valid.length?"partial":"out";
  if(!valid.length)return out;
  let V=1,peak=1,mdd=0,troughK=null,peakAtTrough=null,peakK=idx[0]-1;const path=[],contrib=w.map(()=>0);
  for(const k of idx){if(!Number.isFinite(pr[k]))continue;assets.forEach((x,i)=>{if(w[i]>0&&Number.isFinite(x.ret[k]))contrib[i]+=w[i]*x.ret[k]*V;});
    V*=1+pr[k];if(V>peak){peak=V;peakK=k;}const d=V/peak-1;if(d<mdd){mdd=d;troughK=k;peakAtTrough=peak;}path.push({k,v:V});}
  let recK=null;
  if(troughK!==null){let VV=path.find(p=>p.k===troughK).v;for(let k=troughK+1;k<pr.length;k++){if(!Number.isFinite(pr[k]))continue;VV*=1+pr[k];if(VV>=peakAtTrough-1e-12){recK=k;break;}}}
  const aRes=assets.map(x=>{let v=1,pk=1,dd=0,n=0;for(const k of idx){if(!Number.isFinite(x.ret[k]))continue;n++;v*=1+x.ret[k];if(v>pk)pk=v;dd=Math.min(dd,v/pk-1);}return n?{ret:v-1,mdd:dd,n}:{ret:NaN,mdd:NaN,n:0};});
  const live=assets.map((x,i)=>i).filter(i=>w[i]>0);let cs=0,cn=0;
  if(valid.length>=6)for(let p=0;p<live.length;p++)for(let q=p+1;q<live.length;q++){const r=corr({ret:idx.map(k=>assets[live[p]].ret[k])},{ret:idx.map(k=>assets[live[q]].ret[k])}).r;if(Number.isFinite(r)){cs+=r;cn++;}}
  Object.assign(out,{periods:idx.length,used:valid.length,ret:V-1,mdd,troughK,toTrough:troughK===null?0:idx.indexOf(troughK)+1,recK,
    recPeriods:recK===null?null:recK-troughK,assets:aRes,contrib,corrIn:cn?cs/cn:NaN,corrPairs:cn,path});
  return out;
}
function avgCorr(assets,w){let s=0,n=0;const live=assets.map((x,i)=>i).filter(i=>w[i]>0);for(let p=0;p<live.length;p++)for(let q=p+1;q<live.length;q++){const r=corr(assets[live[p]],assets[live[q]]).r;if(Number.isFinite(r)){s+=r;n++;}}return n?s/n:NaN;}
/* Shock condizionato: gli asset senza shock si muovono come prevede la covarianza storica.
   r_U = Σ_UK · Σ_KK⁻¹ · s_K   (attesa condizionata di una normale multivariata, medie a zero) */
function solve(A,b){const n=b.length,M=A.map((r,i)=>[...r,b[i]]);
  for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;if(Math.abs(M[p][c])<1e-14)return null;[M[c],M[p]]=[M[p],M[c]];
    for(let r=0;r<n;r++){if(r===c)continue;const k=M[r][c]/M[c][c];for(let j=c;j<=n;j++)M[r][j]-=k*M[c][j];}}
  return M.map((r,i)=>r[n]/r[i]);}
function conditionalShock(C,shocks){
  const K=[],U=[];shocks.forEach((s,i)=>(Number.isFinite(s)?K:U).push(i));
  const out=shocks.map(s=>Number.isFinite(s)?s:0);if(!K.length||!U.length)return {r:out,implied:shocks.map(()=>false)};
  const x=solve(K.map(i=>K.map(j=>C[i][j])),K.map(i=>shocks[i]));if(!x)return {r:out,implied:shocks.map(()=>false),error:"Gli asset colpiti sono troppo simili tra loro: lascia lo shock su uno solo."};
  U.forEach(u=>{out[u]=Math.max(-1,K.reduce((s,k,j)=>s+C[u][k]*x[j],0));});
  return {r:out,implied:shocks.map(s=>!Number.isFinite(s))};
}
function stressImpact(w,r){const c=w.map((x,i)=>x*(r[i]||0));return {total:c.reduce((a,b)=>a+b,0),contrib:c};}
/* ===== Frontiera efficiente (Markowitz) e ottimizzatore =====
   min wᵀΣw − λ·μᵀw  con Σwᵢ = 1 e lᵢ ≤ wᵢ ≤ uᵢ, risolto con gradiente proiettato accelerato (FISTA). */
function annualInputs(assets,f){
  const T=assets[0].ret.length,common=[];for(let t=0;t<T;t++)if(assets.every(a=>Number.isFinite(a.ret[t])))common.push(t);
  const m=common.length,mu=assets.map(a=>common.reduce((s,t)=>s+a.ret[t],0)/(m||1));
  const C=covMatrix(assets).C.map(r=>r.map(x=>x*f));
  return {mu:mu.map(x=>x*f),C,common:m};
}
/* inversa di una matrice simmetrica (Gauss-Jordan con pivot parziale e una minima regolarizzazione) */
function invSym(A){
  const n=A.length,tr=A.reduce((s,r,i)=>s+r[i],0)||1,M=A.map((r,i)=>[...r.map((x,j)=>x+(i===j?1e-10*tr/n:0)),...r.map((_,j)=>i===j?1:0)]);
  for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;[M[c],M[p]]=[M[p],M[c]];const d=M[c][c];if(!d)return null;
    for(let j=0;j<2*n;j++)M[c][j]/=d;for(let r=0;r<n;r++)if(r!==c){const k=M[r][c];if(k)for(let j=0;j<2*n;j++)M[r][j]-=k*M[c][j];}}
  return M.map(r=>r.slice(n));
}
/* Rendimenti attesi prudenti: stimatore di Bayes-Stein (Jorion, 1986).
   Ogni media storica viene avvicinata alla media del portafoglio a minima varianza μ₀:
   μ̂ = (1 − φ)·μ + φ·μ₀,   φ = (N + 2) / ( (N + 2) + T · (μ − μ₀)ᵀ Σ̃⁻¹ (μ − μ₀) ),   Σ̃ = Σ · (T − 1)/(T − N − 2)
   Pochi periodi o medie poco distinguibili dal rumore → φ vicino a 1 (molta prudenza); molti anni e differenze nette → φ piccolo. */
function bayesStein(assets,f){
  const T0=assets[0].ret.length,common=[];for(let t=0;t<T0;t++)if(assets.every(a=>Number.isFinite(a.ret[t])))common.push(t);
  const T=common.length,N=assets.length,mu=assets.map(a=>common.reduce((s,t)=>s+a.ret[t],0)/(T||1));
  const S=assets.map((a,i)=>assets.map((b,j)=>T>1?common.reduce((s,t)=>s+(a.ret[t]-mu[i])*(b.ret[t]-mu[j]),0)/(T-1):NaN));
  const out=(phi,mu0,note)=>({mu:mu.map(m=>((1-phi)*m+phi*mu0)*f),raw:mu.map(m=>m*f),phi,mu0:mu0*f,T,N,note});
  if(N<2||T<3)return out(0,mu[0]||0,"troppo pochi dati per stimare");
  const Si=invSym(S);if(!Si)return out(0,mu.reduce((a,b)=>a+b,0)/N,"covarianza non invertibile");
  const one=Si.map(r=>r.reduce((a,b)=>a+b,0)),den=one.reduce((a,b)=>a+b,0),w0=one.map(x=>x/den),mu0=w0.reduce((s,w,i)=>s+w*mu[i],0);
  if(T-N-2<=0)return out(1,mu0,"più asset che periodi: rendimenti attesi tutti uguali alla media prudente");
  const d=mu.map(m=>m-mu0),k=(T-N-2)/(T-1),q=d.reduce((s,di,i)=>s+di*Si[i].reduce((t,x,j)=>t+x*d[j],0),0)*k;
  const phi=Math.min(1,Math.max(0,(N+2)/((N+2)+T*q)));
  return out(phi,mu0,null);
}
/* Composizione "look-through": il peso di ogni paese (o settore) nel portafoglio = Σ peso dello strumento × quota del paese nello strumento.
   items: [{nome, w (peso nel portafoglio, anche non normalizzato), parti: [{nome, peso}] | null}]
   Le parti «Altri» di ogni fondo restano una voce a sé ("Altri, non dettagliati"), gli strumenti senza dati vanno in "Non classificato":
   niente viene ridistribuito o inventato. Restituisce anche la copertura (quota del portafoglio con dati). */
function lookThrough(items){
  const tot=items.reduce((s,x)=>s+(x.w>0?x.w:0),0);if(!(tot>0))return {rows:[],coverage:0,total:0};
  const M=new Map(),add=(k,v)=>M.set(k,(M.get(k)||0)+v);let cov=0;
  items.forEach(x=>{const w=(x.w>0?x.w:0)/tot;if(!w)return;
    if(!x.parti||!x.parti.length){add("Non classificato",w);return;}
    cov+=w;const sum=x.parti.reduce((s,p)=>s+(p.peso||0),0);
    x.parti.forEach(p=>add(/^altr[io]$/i.test(p.nome.trim())?"Altri, non dettagliati":p.nome.trim(),w*(p.peso||0)));
    if(sum<.999)add("Altri, non dettagliati",w*(1-sum)); // la scheda può non arrivare al 100%
  });
  const rows=[...M].map(([nome,peso])=>({nome,peso})).sort((a,b)=>{const sp=n=>/^Altri|^Non classificato/.test(n);return sp(a.nome)-sp(b.nome)||b.peso-a.peso;});
  return {rows,coverage:cov,total:rows.reduce((s,r)=>s+r.peso,0)};
}
/* Paesi (nomi italiani delle schede justETF) → valuta e area. Zona euro in EUR. */
const EUR_C=["Francia","Germania","Paesi Bassi","Italia","Spagna","Irlanda","Belgio","Finlandia","Austria","Portogallo","Lussemburgo","Grecia","Slovacchia","Slovenia","Estonia","Lettonia","Lituania","Croazia","Cipro","Malta"];
const COUNTRY={"Stati Uniti":["USD","Nord America"],"Canada":["CAD","Nord America"],"Regno Unito":["GBP","Europa"],"Svizzera":["CHF","Europa"],"Svezia":["SEK","Europa"],"Danimarca":["DKK","Europa"],"Norvegia":["NOK","Europa"],
  "Giappone":["JPY","Giappone"],"Australia":["AUD","Pacifico"],"Hong Kong":["HKD","Pacifico"],"Singapore":["SGD","Pacifico"],"Nuova Zelanda":["NZD","Pacifico"],"Israele":["ILS","Medio Oriente sviluppato"],
  "Cina":["CNY","Emergenti"],"Taiwan":["TWD","Emergenti"],"Corea del Sud":["KRW","Emergenti"],"Corea":["KRW","Emergenti"],"India":["INR","Emergenti"],"Brasile":["BRL","Emergenti"],"Sudafrica":["ZAR","Emergenti"],"Arabia Saudita":["SAR","Emergenti"],
  "Messico":["MXN","Emergenti"],"Indonesia":["IDR","Emergenti"],"Thailandia":["THB","Emergenti"],"Malesia":["MYR","Emergenti"],"Polonia":["PLN","Emergenti"],"Emirati Arabi Uniti":["AED","Emergenti"],"Qatar":["QAR","Emergenti"],
  "Kuwait":["KWD","Emergenti"],"Cile":["CLP","Emergenti"],"Turchia":["TRY","Emergenti"],"Filippine":["PHP","Emergenti"],"Perù":["PEN","Emergenti"],"Colombia":["COP","Emergenti"],"Ungheria":["HUF","Emergenti"],"Repubblica Ceca":["CZK","Emergenti"]};
EUR_C.forEach(c=>{COUNTRY[c]=["EUR","Europa"];});
/* classe di un fondo dal «focus di investimento» di justETF (es. "Azioni, Globale, Bassa capitalizzazione") */
function etfClass(e){const f=String(e&&e.focus||"").toLowerCase(),t=f+" "+String(e&&e.indice||"").toLowerCase()+" "+String(e&&e.nome||"").toLowerCase();
  if(/^azion/.test(f))return "Azioni";if(/^obblig/.test(f))return "Obbligazioni";if(/^(metalli|materie|commodit)/.test(f)||/\bgold\b|\boro\b|\betc\b/.test(t))return "Materie prime";
  if(/^immobil|real estate|reit/.test(t))return "Immobiliare";if(/^mercato monetario|money market/.test(t))return "Monetario";if(/^cripto|crypto/.test(t))return "Cripto";return f?"Altro":"Non classificato";}
const hedged=e=>{const c=String(e&&e.copertura||"").replace(/^Con copertura valutaria\s*/i,"").trim();return !!c&&!/^(no|nessuna?|—|-)$/i.test(c);};
/* Esposizioni del portafoglio dalle schede dei fondi. items: [{w, etf}] (etf = scheda /api/etfinfo o null).
   Regole dichiarate: nulla viene inventato; le quote «Altri» dei fondi diventano voci a sé, attribuite a un'area solo quando il focus del fondo la dice (es. mercati emergenti). */
function exposures(items){
  const tot=items.reduce((s,x)=>s+(x.w>0?x.w:0),0),acc=()=>new Map(),add=(M,k,v)=>{if(v>0)M.set(k,(M.get(k)||0)+v);};
  const cls=acc(),reg=acc(),dev=acc(),ccy=acc(),size=acc(),style=acc(),esg=acc();let cov=0,eq=0;
  if(!(tot>0))return null;
  items.forEach(x=>{const w=(x.w>0?x.w:0)/tot;if(!w)return;const e=x.etf&&!x.etf.error?x.etf:null;
    if(!e){["cls","reg","ccy"].forEach(k=>add({cls,reg,ccy}[k],"Non classificato",w));add(dev,"Non classificato",w);return;}
    cov+=w;const c=etfClass(e),f=String(e.focus||""),t=`${f} ${e.indice||""} ${e.nome||""}`,em=/emergent|emerging/i.test(t),world=/\bworld\b|globale/i.test(t)&&!/all[- ]?world|acwi|all country|emerging|emergent/i.test(t);
    /* dove vanno le quote «Altri» del fondo: nell'area che il fondo dichiara, se ne dichiara una sola */
    const area=em?"Emergenti":/europ/i.test(t)?"Europa":/stati uniti|\busa?\b|s&p 500|nasdaq|nord america|north america/i.test(t)?"Nord America":/giappone|japan/i.test(t)?"Giappone":world?"Altri paesi sviluppati":null;
    const oReg=area||"Altri, non dettagliati",oDev=area==="Emergenti"?"Emergenti":area?"Sviluppati":"Non dettagliato",oCcy=area==="Emergenti"?"Valute emergenti, altre":area==="Europa"?"Valute europee, altre (anche EUR)":"Altre valute, non dettagliate";
    add(cls,c,w);
    const P=(e.paesi||[]).filter(p=>p&&p.peso>0),sum=P.reduce((s,p)=>s+p.peso,0);
    /* aree e sviluppati/emergenti */
    if(c==="Materie prime"){add(reg,"Senza area (materie prime)",w);add(dev,"Senza area (materie prime)",w);}
    else if(!P.length){add(reg,"Non classificato",w);add(dev,"Non classificato",w);}
    else{P.forEach(p=>{const nm=p.nome.trim(),k=COUNTRY[nm];const q=w*p.peso;
        if(/^altr[io]$/i.test(nm)){add(reg,oReg,q);add(dev,oDev,q);}
        else if(k){add(reg,k[1],q);add(dev,k[1]==="Emergenti"?"Emergenti":"Sviluppati",q);}
        else{add(reg,"Altri, non dettagliati",q);add(dev,"Non dettagliato",q);}});
      if(sum<.999){add(reg,oReg,w*(1-sum));add(dev,oDev,w*(1-sum));}}
    /* valute: fondo coperto → euro; obbligazioni → valuta delle emissioni scritta nel focus; materie prime → dollaro; azioni → valuta dei paesi */
    const fc=(f.match(/\b(EUR|USD|GBP|CHF|JPY|CAD|AUD|SEK|NOK|DKK|CNY)\b/)||[])[1];
    if(hedged(e))add(ccy,"EUR",w);
    else if(c==="Obbligazioni"&&fc)add(ccy,fc,w);
    else if(c==="Materie prime")add(ccy,"USD",w);
    else if(c==="Monetario")add(ccy,fc||e.valuta||"EUR",w);
    else if(!P.length)add(ccy,"Non classificato",w);
    else{P.forEach(p=>{const nm=p.nome.trim(),k=COUNTRY[nm];add(ccy,k?k[0]:oCcy,w*p.peso);});if(sum<.999)add(ccy,oCcy,w*(1-sum));}
    /* stile e fattori: solo la parte azionaria, dal nome dell'indice e dal focus */
    if(c==="Azioni"){eq+=w;
      add(size,/bassa capitalizzazione|small ?cap/i.test(t)?"Small cap":/media capitalizzazione|mid ?cap/i.test(t)?"Mid cap":/\bIMI\b|investable market|all cap|total market|tutte le capitalizzazioni/i.test(t)?"Tutte le capitalizzazioni":"Large e mid cap",w);
      const st=/value|valore/i.test(t)?"Value":/growth|crescita/i.test(t)?"Growth":/momentum/i.test(t)?"Momentum":/quality|qualità/i.test(t)?"Quality":/min(imum)? ?vol|bassa volatilit|low vol/i.test(t)?"Bassa volatilità":/dividend/i.test(t)?"Dividendi":/equal weight|equally weighted|equiponderat/i.test(t)?"Pesi uguali":/multi.?factor|multifattor/i.test(t)?"Multifattoriale":"Mercato (nessuno stile)";
      add(style,st,w);add(esg,/\besg\b|\bsri\b|sostenib|socially|paris|climate|clima/i.test(t)?"Con criteri ESG":"Senza criteri ESG",w);}
  });
  const rows=M=>[...M].map(([nome,peso])=>({nome,peso})).sort((a,b)=>{const sp=n=>/^Altr|^Non |^Senza area|, altre/.test(n);return sp(a.nome)-sp(b.nome)||b.peso-a.peso;});
  const rel=M=>rows(M).map(r=>({...r,peso:eq>0?r.peso/eq:0}));
  return {cls:rows(cls),reg:rows(reg),dev:rows(dev),ccy:rows(ccy),size:rel(size),style:rel(style),esg:rel(esg),equity:eq,coverage:cov};
}
/* quanto costa il TER nel tempo: differenza tra crescere al rendimento lordo r e a r − TER, su un capitale V */
function terDrag(V,ter,r,years){return V*(Math.pow(1+r,years)-Math.pow(1+r-ter,years));}
/* Divide un versamento C tra gli strumenti per avvicinarsi ai pesi target senza vendere.
   Acquisti bᵢ = max(0, tᵢ·K − vᵢ) con K scelto (bisezione) perché Σ bᵢ = C: i più sottopesati salgono insieme
   allo stesso rapporto (vᵢ + bᵢ)/tᵢ = K, il che minimizza il massimo scostamento relativo. Deterministico. */
function contributionSplit(v,t,C){
  const n=v.length,ts=t.reduce((s,x)=>s+(x>0?x:0),0);if(!(ts>0)||!(C>0))return v.map(()=>0);
  const tt=t.map(x=>(x>0?x:0)/ts),buy=K=>tt.map((x,i)=>Math.max(0,x*K-v[i])),sum=K=>buy(K).reduce((s,x)=>s+x,0);
  let lo=0,hi=(v.reduce((s,x)=>s+x,0)+C)/Math.min(...tt.filter(x=>x>0))+1;
  for(let k=0;k<200;k++){const m=(lo+hi)/2;if(sum(m)<C)lo=m;else hi=m;}
  const b=buy(hi),s=b.reduce((a,x)=>a+x,0);return s>0?b.map(x=>x*C/s):b;
}
/* Mesi di versamenti costanti C per rientrare nella banda ±band dai target senza vendere, a prezzi fermi. */
function monthsToTarget(v,t,C,band,max=600){
  const ts=t.reduce((s,x)=>s+(x>0?x:0),0);if(!(ts>0))return null;const tt=t.map(x=>(x>0?x:0)/ts);
  let cur=v.slice();const ok=x=>{const T=x.reduce((s,y)=>s+y,0);return T>0&&x.every((y,i)=>Math.abs(y/T-tt[i])<=band+1e-12);};
  if(ok(cur))return 0;if(!(C>0))return null;
  for(let m=1;m<=max;m++){const b=contributionSplit(cur,tt,C);cur=cur.map((x,i)=>x+b[i]);if(ok(cur))return m;}
  return null;
}
/* costo annuo ponderato: Σ wᵢ · TERᵢ sugli strumenti con TER noto; la parte senza TER resta dichiarata */
function weightedTer(items){
  const tot=items.reduce((s,x)=>s+(x.w>0?x.w:0),0);if(!(tot>0))return {ter:NaN,coverage:0};
  let c=0,cov=0;items.forEach(x=>{const w=(x.w>0?x.w:0)/tot;if(Number.isFinite(x.ter)){c+=w*x.ter;cov+=w;}});
  return {ter:cov>0?c/cov:NaN,known:c,coverage:cov};
}
function projBox(v,lo,hi){
  let a=Math.min(...v.map((x,i)=>x-hi[i]))-1,b=Math.max(...v.map((x,i)=>x-lo[i]))+1;
  const s=t=>v.reduce((acc,x,i)=>acc+Math.min(hi[i],Math.max(lo[i],x-t)),0);
  for(let k=0;k<100;k++){const m=(a+b)/2;if(s(m)>1)a=m;else b=m;}
  const t=(a+b)/2;return v.map((x,i)=>Math.min(hi[i],Math.max(lo[i],x-t)));
}
function powerMax(C){let v=C.map(()=>1),l=0;for(let k=0;k<60;k++){const w=C.map(r=>r.reduce((s,x,j)=>s+x*v[j],0)),n=Math.hypot(...w)||1;l=n/Math.hypot(...v);v=w.map(x=>x/n);}return l||1;}
function qpSolve(C,mu,lam,lo,hi,w0,L){
  const n=mu.length;let w=w0?projBox(w0,lo,hi):projBox(mu.map(()=>1/n),lo,hi),y=w.slice(),t=1;const step=1/(2*(L||powerMax(C)));
  for(let it=0;it<4000;it++){
    const g=C.map((r,i)=>2*r.reduce((s,x,j)=>s+x*y[j],0)-lam*mu[i]),wn=projBox(y.map((x,i)=>x-step*g[i]),lo,hi);
    const tn=(1+Math.sqrt(1+4*t*t))/2;let diff=0;y=wn.map((x,i)=>{diff=Math.max(diff,Math.abs(x-w[i]));return x+(t-1)/tn*(x-w[i]);});
    w=wn;t=tn;if(diff<1e-11&&it>20)break;
  }
  return w;
}
const pStats=(w,mu,C)=>{const r=w.reduce((s,x,i)=>s+x*mu[i],0),v=w.reduce((s,x,i)=>s+x*C[i].reduce((a,c,j)=>a+c*w[j],0),0);return {ret:r,vol:Math.sqrt(Math.max(0,v))};};
function riskParity(C){
  const n=C.length,b=1/n;let w=C.map((r,i)=>1/Math.sqrt(Math.max(1e-12,r[i])));const s0=w.reduce((a,x)=>a+x,0);w=w.map(x=>x/s0);
  for(let it=0;it<500;it++){let ch=0;for(let i=0;i<n;i++){const a=C[i][i],c=C[i].reduce((s,x,j)=>j===i?s:s+x*w[j],0),nw=(-c+Math.sqrt(c*c+4*a*b))/(2*a);ch=Math.max(ch,Math.abs(nw-w[i]));w[i]=nw;}if(ch<1e-13)break;}
  const s=w.reduce((a,x)=>a+x,0);return w.map(x=>x/s);
}
function optimize(o){
  const {mu,C}=o,n=mu.length,rf=o.rf||0,lo=mu.map(()=>o.min==null?0:o.min),hi=mu.map(()=>o.max==null?1:o.max);
  if(lo.reduce((a,b)=>a+b,0)>1+1e-9||hi.reduce((a,b)=>a+b,0)<1-1e-9)return {error:`Vincoli impossibili: con ${n} asset il peso minimo deve stare sotto ${fmtPct(1/n,1)} e il massimo sopra ${fmtPct(1/n,1)}.`};
  if(n===1)return {w:[1],frontier:[{lam:0,w:[1],...pStats([1],mu,C)}],minVar:{w:[1],...pStats([1],mu,C)},maxSharpe:{w:[1],...pStats([1],mu,C)},lo,hi};
  const L=powerMax(C),lams=[0,...Array.from({length:56},(_,k)=>Math.pow(10,-4+k*6/55))];
  let prev=null;const frontier=lams.map(l=>{const w=qpSolve(C,mu,l,lo,hi,prev,L);prev=w;return {lam:l,w,...pStats(w,mu,C)};});
  const near0=l=>frontier.reduce((a,p)=>Math.abs(Math.log10((p.lam||1e-6)/(l||1e-6)))<Math.abs(Math.log10((a.lam||1e-6)/(l||1e-6)))?p:a);
  const at=l=>{const w=qpSolve(C,mu,l,lo,hi,near0(l).w,L);return {lam:l,w,...pStats(w,mu,C)};};
  const sh=p=>p.vol>0?(p.ret-rf)/p.vol:-Infinity;
  /* massimo Sharpe: punto migliore della griglia, poi sezione aurea su log λ */
  let bi=0;frontier.forEach((p,i)=>{if(sh(p)>sh(frontier[bi]))bi=i;});
  let A=Math.log10(Math.max(1e-6,frontier[Math.max(1,bi-1)].lam||1e-6)),B=Math.log10(frontier[Math.min(frontier.length-1,bi+1)].lam||1e-4);
  let best=frontier[bi];if(bi>0){const gr=.618;for(let k=0;k<40;k++){const x1=B-gr*(B-A),x2=A+gr*(B-A),p1=at(10**x1),p2=at(10**x2);if(sh(p1)>sh(p2))B=x2;else A=x1;if(sh(p1)>sh(best))best=p1;if(sh(p2)>sh(best))best=p2;}}
  const target=(key,val)=>{const f0=frontier[0],fN=frontier[frontier.length-1];if(val<=f0[key])return {...f0,clamped:"low"};if(val>=fN[key])return {...fN,clamped:"high"};
    let a=1e-6,b=fN.lam;for(let k=0;k<50;k++){const m=Math.sqrt(a*b),p=at(m);if(p[key]<val)a=m;else b=m;}return at(Math.sqrt(a*b));};
  return {frontier,minVar:frontier[0],maxSharpe:best,target,lo,hi,rf};
}
function randomPortfolios(n,k,lo,hi,seed){
  const rnd=makeRng(seed||9),out=[];let tries=0;
  while(out.length<k&&tries<k*40){tries++;const e=Array.from({length:n},()=>-Math.log(rnd()||1e-12)),s=e.reduce((a,b)=>a+b,0),w=e.map(x=>x/s);if(w.every((x,i)=>x>=lo[i]-1e-12&&x<=hi[i]+1e-12))out.push(w);}
  return out;
}
/* ===== Benchmark: allineamento per periodo e misure relative ===== */
const ym=d=>`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;
const prevYm=k=>{let [y,m]=k.split("-").map(Number);m--;if(!m){m=12;y--;}return `${y}-${String(m).padStart(2,"0")}`;};
/* prezzi di fine mese del benchmark, convertiti in euro se c'è il cambio (unità di valuta per 1 euro) */
function benchPrices(points,fx){
  const rate=fx?new Map(fx.map(x=>[x.p,x.v])):null,px=new Map();
  points.forEach(x=>{const k=String(x.d).slice(0,7);if(rate){const r=rate.get(k);if(!(r>0))return;px.set(k,x.v/r);}else px.set(k,x.v);});
  return px;
}
function benchAlign(dates,f,pret,px){
  const out={keys:[],p:[],b:[],at:[]};
  if(f<=12){
    for(let k=1;k<dates.length;k++){if(!Number.isFinite(pret[k]))continue;const a=px.get(ym(dates[k-1])),b=px.get(ym(dates[k]));
      if(a>0&&b>0&&ym(dates[k])!==ym(dates[k-1])){out.keys.push(ym(dates[k]));out.p.push(pret[k]);out.b.push(b/a-1);out.at.push(k);}}
    out.fc=f;return out;
  }
  /* dati giornalieri o settimanali: rendimenti mensili composti; primo e ultimo mese (parziali) esclusi */
  const months=[];let cur=null;
  for(let k=1;k<dates.length;k++){const key=ym(dates[k]);if(!cur||cur.key!==key){cur={key,g:1,ok:true,k};months.push(cur);}if(Number.isFinite(pret[k]))cur.g*=1+pret[k];else cur.ok=false;cur.k=k;}
  months.slice(1,-1).forEach(m=>{const a=px.get(prevYm(m.key)),b=px.get(m.key);if(m.ok&&a>0&&b>0){out.keys.push(m.key);out.p.push(m.g-1);out.b.push(b/a-1);out.at.push(m.k);}});
  out.fc=12;return out;
}
function benchStats(p,b,fc,rf){
  const n=p.length;if(n<12)return {n,error:`Servono almeno 12 periodi in comune con il benchmark: ce ne sono ${n}.`};
  rf=rf||0;const mean=a=>a.reduce((s,x)=>s+x,0)/a.length,sd=a=>{const m=mean(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1));};
  const grow=a=>a.reduce((g,x)=>g*(1+x),1),cagr=a=>Math.pow(grow(a),fc/a.length)-1,mdd=a=>{let w=1,pk=1,d=0;a.forEach(x=>{w*=1+x;if(w>pk)pk=w;d=Math.min(d,w/pk-1);});return d;};
  const mp=mean(p),mb=mean(b),cv=p.reduce((s,x,i)=>s+(x-mp)*(b[i]-mb),0)/(n-1),vb=sd(b)**2,beta=vb>0?cv/vb:NaN,act=p.map((x,i)=>x-b[i]),te=sd(act)*Math.sqrt(fc);
  const sel=(c)=>{const P0=[],B0=[];b.forEach((x,i)=>{if(c(x)){P0.push(p[i]);B0.push(x);}});return P0.length?mean(P0)/mean(B0):NaN;};
  const win=Math.max(2,Math.round(fc)),roll=[];for(let j=win-1;j<n;j++){let gp=1,gb=1;for(let t=j-win+1;t<=j;t++){gp*=1+p[t];gb*=1+b[t];}roll.push(gp/gb-1);}
  const corrPB=cv/(sd(p)*sd(b));
  /* regressione OLS dei rendimenti in eccesso: rₚ − rf/f = α + β·(rᵦ − rf/f) + ε → errori standard, t e p-value */
  const rfp=rf/fc,ap=(mp-rfp)-beta*(mb-rfp),Sxx=b.reduce((s,x)=>s+(x-mb)**2,0),xbar=mb-rfp;
  const s2=p.reduce((s,x,i)=>s+((x-rfp)-ap-beta*(b[i]-rfp))**2,0)/(n-2),seB=Math.sqrt(s2/Sxx),seA=Math.sqrt(s2*(1/n+xbar*xbar/Sxx)),df=n-2;
  const tA=ap/seA,tB=(beta-1)/seB,tcrit=tInv975(df);
  return {n,fc,cagrP:cagr(p),cagrB:cagr(b),totP:grow(p)-1,totB:grow(b)-1,volP:sd(p)*Math.sqrt(fc),volB:sd(b)*Math.sqrt(fc),mddP:mdd(p),mddB:mdd(b),
    sharpeP:(mp*fc-rf)/(sd(p)*Math.sqrt(fc)),sharpeB:(mb*fc-rf)/(sd(b)*Math.sqrt(fc)),beta,alpha:ap*fc,corr:corrPB,r2:corrPB*corrPB,
    te,ir:te>0?mean(act)*fc/te:NaN,active:cagr(p)-cagr(b),up:sel(x=>x>0),down:sel(x=>x<0),hit:act.filter(x=>x>0).length/n,win,roll,
    df,seAlpha:seA*fc,tAlpha:tA,pAlpha:pTwoSided(tA,df),alphaLo:(ap-tcrit*seA)*fc,alphaHi:(ap+tcrit*seA)*fc,
    seBeta:seB,betaLo:beta-tcrit*seB,betaHi:beta+tcrit*seB,pBeta1:pTwoSided(tB,df),resVol:Math.sqrt(s2*fc)};
}
/* il benchmark come "asset" su tutta la sua storia, per le crisi fuori dal file */
function benchAsset(px){
  const keys=[...px.keys()].sort(),dates=keys.map(k=>{const [y,m]=k.split("-").map(Number);return new Date(Date.UTC(y,m,0));}),ret=keys.map((k,i)=>i?px.get(k)/px.get(keys[i-1])-1:NaN);
  return {dates,asset:{name:"benchmark",ret,first:1,missing:0}};
}
/* ===== Rendimento reale dell'investitore: versamenti veri, non 100 € all'inizio ===== */
/* TIR (XIRR): tasso annuo r per cui Σ flussoᵢ / (1+r)^(giorniᵢ/365) = 0. Versamenti negativi, valore finale positivo. */
function xirr(flows){
  const fl=flows.filter(x=>Number.isFinite(x.v)&&x.v!==0&&x.t instanceof Date);if(fl.length<2||!fl.some(x=>x.v>0)||!fl.some(x=>x.v<0))return NaN;
  const t0=Math.min(...fl.map(x=>x.t.getTime())),npv=r=>fl.reduce((s,x)=>s+x.v/Math.pow(1+r,(x.t.getTime()-t0)/(365*864e5)),0);
  let a=-.9999,b=10,fa=npv(a),fb=npv(b);if(fa*fb>0)return NaN;
  for(let k=0;k<200;k++){const m=(a+b)/2,fm=npv(m);if(Math.abs(fm)<1e-10||b-a<1e-12)return m;if(fa*fm<0){b=m;fb=fm;}else{a=m;fa=fm;}}
  return (a+b)/2;
}
/* Valore nel tempo con i versamenti veri: Vᵢ,ₜ = Vᵢ,ₜ₋₁ · (1 + rᵢ,ₜ) + versamentiᵢ,ₜ  (versamenti a fine periodo).
   Rendimento ponderato nel tempo (TWR): Rₜ = Σ Vᵢ,ₜ₋₁ · rᵢ,ₜ / Σ Vᵢ,ₜ₋₁, poi composto. */
function personalPerformance(dates,assets,tx){
  const n=dates.length,k=assets.length,flowAt=Array.from({length:n},()=>new Array(k).fill(0)),out={unmatched:[],before:0,after:0,used:0};
  tx.forEach(x=>{if(x.i==null||x.i<0||x.i>=k){out.unmatched.push(x);return;}
    let p=dates.findIndex(d=>d.getTime()>=x.d.getTime());
    if(p<0){out.after++;p=n-1;}            // dopo l'ultima data: nel periodo finale
    if(p===0&&n>1&&dates[0].getTime()-x.d.getTime()>dates[1].getTime()-dates[0].getTime())out.before++; // più di un periodo prima dei dati
    flowAt[p][x.i]+=x.amount;out.used++;});
  const V=new Array(k).fill(0),series=[];let inv=0,twr=1,first=-1,miss=0,peak=1,mdd=0;
  for(let t=0;t<n;t++){
    const prev=V.reduce((s,x)=>s+x,0);let gain=0;
    if(prev>0)assets.forEach((a,i)=>{if(V[i]>0){const r=a.ret[t];if(Number.isFinite(r)){gain+=V[i]*r;V[i]*=1+r;}else miss++;}});
    if(prev>0){twr*=1+gain/prev;if(twr>peak)peak=twr;mdd=Math.min(mdd,twr/peak-1);}
    const F=flowAt[t].reduce((s,x)=>s+x,0);flowAt[t].forEach((x,i)=>{V[i]=Math.max(0,V[i]+x);});inv+=F;
    if(first<0&&F!==0)first=t;
    if(first>=0)series.push({t,value:V.reduce((s,x)=>s+x,0),invested:inv,twr});
  }
  if(first<0)return {...out,error:"Nessuna transazione collegata agli strumenti dei dati."};
  const last=n-1,value=V.reduce((s,x)=>s+x,0),years=(dates[last]-dates[first])/(365.25*864e5);
  const flows=tx.filter(x=>x.i!=null&&x.i>=0&&x.i<k).map(x=>({t:x.d,v:-x.amount}));flows.push({t:dates[last],v:value});
  return {...out,series,first,flowsT:flowAt.map(r=>r.reduce((s,x)=>s+x,0)),value,invested:inv,gain:value-inv,gainPct:inv>0?value/inv-1:NaN,xirr:xirr(flows),twr:twr-1,twrAnn:years>0?Math.pow(twr,1/Math.max(years,1e-9))-1:NaN,years,mdd,miss,
    byAsset:assets.map((a,i)=>({value:V[i],invested:flowAt.reduce((s,r)=>s+r[i],0)}))};
}
/* gli stessi versamenti messi in un benchmark (rendimenti di periodo allineati alle date) */
function sameFlows(dates,bret,flowsByT){
  let V=0,inv=0;const series=[];
  for(let t=0;t<dates.length;t++){if(V>0&&Number.isFinite(bret[t]))V*=1+bret[t];V=Math.max(0,V+flowsByT[t]);inv+=flowsByT[t];series.push(V);}
  return {series,value:V,invested:inv};
}
export const POS={contributionSplit,monthsToTarget,lookThrough,weightedTer,exposures,etfClass,terDrag,bayesStein,invSym,reshapeWide,applyRecipe,colIdx,localRecipe,structureFingerprint,headerTag,ccyOf,parseNum,parseDate,analyzeSheet,buildDataset,stats,corr,wealth,capabilities,parseCSV,sampleSheets,fmtN,fmtPct,fmtDate,ASSET_ROLES,quantile,riskStats,covMatrix,riskContrib,portfolioReturns,makeRng,monteCarlo,CRISES,crisisAnalysis,avgCorr,conditionalShock,stressImpact,annualInputs,projBox,qpSolve,optimize,riskParity,pStats,randomPortfolios,benchPrices,benchAlign,benchStats,benchAsset,xirr,personalPerformance,sameFlows,normCdf,tCdf,tInv975,pTwoSided,chi2p1,varBacktest};
if (typeof window !== "undefined") window.POS = POS;
export default POS;
