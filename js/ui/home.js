/* Portfolio OS · interfaccia · home: terminale con i dati BCE e mappa dei laboratori.
   Parte di app.js divisa in moduli: il codice è lo stesso, cambiano solo import ed export. */
import { $, S, fmtN, fmtPct } from "./core.js";
import { go } from "./scene.js";
import { getJSON } from "./analisi.js";
import { QG, openChat, showSay } from "./quanta.js";

/* ---------- Home: terminale con dati ufficiali BCE e mappa dei laboratori ---------- */
const LABS=[
  {n:"01",t:"Portfolio Intelligence",d:"Metriche, rischio, contributi, benchmark e il tuo rendimento reale.",c:"var(--lime)",go:"lab",g:"M4 20 10 12l4 4 8-11"},
  {n:"02",t:"Simulation Lab",d:"Monte Carlo con versamenti, prelievi, inflazione e probabilità di obiettivo.",c:"var(--c3)",go:"sim",g:"M3 18c5 0 6-12 9-12s4 8 9 8M3 18c5 0 7-6 9-6s5 3 9 3"},
  {n:"03",t:"Crisis Room",d:"Dot-com, 2008, debito euro, COVID, inflazione 2022 e i tuoi shock.",c:"var(--bad)",go:"stress",g:"M3 6l6 8 4-4 8 10"},
  {n:"04",t:"Quant Lab",d:"Frontiera efficiente, ottimizzatori, VaR a tre metodi, test statistici.",c:"var(--c2)",go:"opt",g:"M4 20C6 10 11 5 20 4M8 15h.01M13 10h.01M17 8h.01"},
  {n:"05",t:"AI Research",d:"Quanta: fai domande, lei chiede i numeri al motore e te li spiega.",c:"var(--lime)",chat:true,g:"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8z"}
];
function renderLabs(){
  const el=$("#labsGrid");if(!el)return;
  el.innerHTML=LABS.map(l=>`<button type="button" class="lab-tile${l.soon?" soon":""}" style="--ac:${l.c}" ${l.soon?"disabled":l.chat?'data-labchat="1"':`data-lab="${l.go}"${l.free?' data-free="1"':""}`}>
    <span class="lab-n">${l.n}</span><svg class="lab-g" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="${l.g}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <b>${l.t}</b><span class="lab-d">${l.d}</span><span class="lab-s">${l.soon?"in arrivo":l.chat?"apri la chat →":S.lab||l.free?"apri →":"pronto · carica un file"}</span></button>`).join("");
}
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-lab]");if(b){if(S.lab||b.dataset.free)go(b.dataset.lab);else{go("map");showSay("map",5000);}return;}
  if(e.target.closest("[data-labchat]")){QG.opened=true;openChat();}
});
const spark12=(pts,c)=>{if(pts.length<2)return "";const v=pts.map(x=>x.v),lo=Math.min(...v),hi=Math.max(...v),X=i=>i/(v.length-1)*100,Y=x=>26-(x-lo)/((hi-lo)||1)*22;
  return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path d="${v.map((x,i)=>(i?"L":"M")+X(i).toFixed(1)+","+Y(x).toFixed(1)).join("")}" fill="none" stroke="${c}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;};
async function loadMarket(){
  const el=$("#mktRows");if(!el)return;
  const now=new Date(),to=`${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}`,f=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-36,1)),from=`${f.getUTCFullYear()}-${String(f.getUTCMonth()+1).padStart(2,"0")}`;
  const [r,fx]=await Promise.all([getJSON(`/api/rates?from=${from}&to=${to}`),getJSON("/api/fx?ccy=USD")]);
  const rows=[],mon=p=>{const [y,m]=p.split("-");return `${["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"][+m-1]} ${y}`;};
  const e=r&&r.ecb;
  if(e&&e.rf.points.length){const p=e.rf.points,l=p[p.length-1],d=l.v-p[Math.max(0,p.length-13)].v;rows.push({k:"Euribor 3 mesi",v:`${fmtN(l.v,2)}%`,s:`${d>=0?"+":""}${fmtN(d,2)} pt in un anno`,m:mon(l.p),sp:spark12(p.slice(-13),"var(--lime)")});}
  if(e&&e.cpi.points.length>12){
    /* inflazione su 12 mesi all'ultimo dato pubblicato (la BCE può essere indietro di alcuni mesi: il mese è sempre mostrato) */
    const p=e.cpi.points,l=p[p.length-1],[ly,lm]=l.p.split("-").map(Number),key=`${ly-1}-${String(lm).padStart(2,"0")}`,y=p.find(x=>x.p===key);
    if(y){const yoy=p.map((x,i)=>{const [a,b]=x.p.split("-").map(Number),q=p.find(z=>z.p===`${a-1}-${String(b).padStart(2,"0")}`);return q?{v:x.v/q.v-1}:null;}).filter(Boolean);
      rows.splice(1,0,{k:"Inflazione area euro",v:fmtPct(l.v/y.v-1,1),s:"HICP, su 12 mesi",m:mon(l.p),sp:spark12(yoy.slice(-13),"var(--c4)")});}}
  if(fx&&fx.points&&fx.points.length){const p=fx.points,l=p[p.length-1],d=l.v/p[Math.max(0,p.length-13)].v-1;rows.push({k:"Euro / Dollaro",v:fmtN(l.v,4),s:`${d>=0?"+":""}${fmtPct(d,1)} in un anno`,m:mon(l.p),sp:spark12(p.slice(-13),"var(--c3)")});}
  if(!rows.length){el.innerHTML=`<p class="mkt-note">Dati BCE momentaneamente non raggiungibili${r&&r.error&&/Vercel/.test(r.error)?" (funzionano sul sito pubblicato)":""}.</p>`;return;}
  el.innerHTML=rows.map(x=>`<div class="mkt-row"><div><span class="k">${x.k}</span><span class="m">${x.m}</span></div><div class="sp">${x.sp}</div><div class="vv"><b>${x.v}</b><small>${x.s}</small></div></div>`).join("");
  $("#mktNote").textContent="Fonte: Banca centrale europea, data-api.ecb.europa.eu. Ultimo dato mensile disponibile.";
}

export { LABS, loadMarket, renderLabs, spark12 };
