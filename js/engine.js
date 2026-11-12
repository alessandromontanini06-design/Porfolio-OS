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
const fmtRaw=v=>v instanceof Date?fmtDate(new Date(Date.UTC(v.getFullYear(),v.getMonth(),v.getDate()))):String(v).trim().slice(0,22);

function parseNum(v){
  if(typeof v==="number")return Number.isFinite(v)?{n:v,pct:false}:null;
  if(typeof v!=="string")return null;
  let s=v.trim();
  if(!s||/^(n\/?a|na|nan|null|-|—|–|#n\/d|#n\/a|#div\/0!|#value!|#valore!)$/i.test(s))return null;
  let pct=false;
  if(/%$/.test(s)){pct=true;s=s.slice(0,-1).trim();}
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
  const body=[];
  for(let r=h+1;r<aoa.length;r++){const row=aoa[r];if(row.every(isBlank))continue;body.push({r,row});}
  const cols=[];
  for(let c=0;c<width;c++){const raw=body.map(b=>b.row[c]);if(raw.every(isBlank))continue;cols.push(profile(c,headers[c],raw));}
  if(cols.some(c=>c.flow&&/versat|\bvers\b|investit|contribut|deposit/i.test(c.name)))cols.forEach(c=>{
    if(c.suggest==="price"&&VALUE_HINT.test(c.name)&&!/prezz|price|close|chiusura|\bnav\b/i.test(c.name)){c.suggest=null;c.conf="bassa";c.flowValue=true;
      c.reason="Valore del portafoglio che include i versamenti: i rendimenti sarebbero gonfiati dai soldi aggiunti. Servono i prezzi degli strumenti";}});
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

const FREQS=[{max:4,label:"giornaliera",adj:"giornaliere",f:252},{max:10,label:"settimanale",adj:"settimanali",f:52},{max:45,label:"mensile",adj:"mensili",f:12},{max:120,label:"trimestrale",adj:"trimestrali",f:4},{max:Infinity,label:"annuale",adj:"annuali",f:1}];
const OUTLIER={252:0.25,52:0.35,12:0.5,4:0.7,1:1.5};
const ASSET_ROLES=["price","ret","retpct"];

function buildDataset(an,roles){
  const Q={errors:[],warnings:[],infos:[]};
  const fail=()=>({ok:false,Q,assets:[],dates:[]});
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
    if(missing)Q.warnings.push(`«${c.name}»: ${missing} ${missing===1?"valore mancante":"valori mancanti"} (${missDates.slice(0,3).map(d=>fmtDate(d,freq.f)).join(", ")}${missing>3?"…":""}). Esclusi dai calcoli, non stimati.`);
    const out=[];ret.forEach((x,k)=>{if(Number.isFinite(x)&&(Math.abs(x)>thr||x<=-1))out.push(k);});
    if(out.length)Q.warnings.push(`«${c.name}»: ${out.length} ${out.length===1?"rendimento anomalo":"rendimenti anomali"} (oltre ±${Math.round(thr*100)}% in un periodo), per esempio ${fmtPct(ret[out[0]])} a ${fmtDate(dates[out[0]],freq.f)}. Verifica che non sia un errore.`);
    return {name:c.name,col:c.letter,role,ret,first,missing};
  });
  const minFirst=Math.min(...assets.map(a=>a.first));
  assets.forEach(a=>{if(a.first>minFirst+1)Q.infos.push(`«${a.name}» inizia a ${fmtDate(dates[a.first],freq.f)}, dopo le altre serie.`);});
  const years=(dates[dates.length-1]-dates[0])/(365.25*864e5)+1/freq.f;
  return {ok:true,Q,dates,freq,medianDays:md,assets,nObs:rows.length,years};
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
  return {n,mean,sd,var95:-q05,var99:-q01,cvar95:-tailMean(q05),cvar99:-tailMean(q01),q05,q01,
    tail95:s.filter(x=>x<=q05).length,mar,downDev,sortino:downDev>0?(mean*f-rfA)/downDev:NaN,skew,kurt,
    pctPos:r.filter(x=>x>0).length/n,dd,mdd,troughK,peakAtTrough,recK,longest,lStart,lEnd,ongoing,win,best12,best12K,worst12,worst12K,sorted:s};
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
  return {volP:sp*Math.sqrt(f),pct:rc.map(x=>sp>0?x/sp:0),sig:sig.map(x=>x*Math.sqrt(f)),
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
    probLoss:share(v=>v<invested),depleted:depleted/n,mean:finSorted.reduce((a,b)=>a+b,0)/n,
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
  return {n,fc,cagrP:cagr(p),cagrB:cagr(b),totP:grow(p)-1,totB:grow(b)-1,volP:sd(p)*Math.sqrt(fc),volB:sd(b)*Math.sqrt(fc),mddP:mdd(p),mddB:mdd(b),
    sharpeP:(mp*fc-rf)/(sd(p)*Math.sqrt(fc)),sharpeB:(mb*fc-rf)/(sd(b)*Math.sqrt(fc)),beta,alpha:(mp-rf/fc-beta*(mb-rf/fc))*fc,corr:corrPB,r2:corrPB*corrPB,
    te,ir:te>0?mean(act)*fc/te:NaN,active:cagr(p)-cagr(b),up:sel(x=>x>0),down:sel(x=>x<0),hit:act.filter(x=>x>0).length/n,win,roll};
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
export const POS={parseNum,parseDate,analyzeSheet,buildDataset,stats,corr,wealth,capabilities,parseCSV,sampleSheets,fmtN,fmtPct,fmtDate,ASSET_ROLES,quantile,riskStats,covMatrix,riskContrib,portfolioReturns,makeRng,monteCarlo,CRISES,crisisAnalysis,avgCorr,conditionalShock,stressImpact,annualInputs,projBox,qpSolve,optimize,riskParity,pStats,randomPortfolios,benchPrices,benchAlign,benchStats,benchAsset,xirr,personalPerformance,sameFlows};
if (typeof window !== "undefined") window.POS = POS;
export default POS;
