/* Portfolio OS · interfaccia · scene e dock, cursore, titolo animato, particelle, ticker.
   Parte di app.js divisa in moduli: il codice è lo stesso, cambiano solo import ed export. */
import { $, CALM, FINE, G, HAS_G, P, REDUCE, S, esc, fmtPct } from "./core.js";
import { an, playScan, trackOnce } from "./importa.js";
import { countAll, svHome } from "./archivio.js";
import { buildNet, drawChart } from "./laboratorio.js";
import { renderBench, renderFI, renderOpt, renderRisk, renderSim, renderStress } from "./analisi.js";
import { quantaScene } from "./quanta.js";
import { pmEnter, pmHas, pmToLab } from "./patrimonio.js";

/* ---------- Scene e dock ---------- */
const SCENES=["home","scan","map","lab","patrimonio","strumenti","risk","sim","fire","stress","opt","bench"],SCENE_L={home:"Home",patrimonio:"Patrimonio",strumenti:"Strumenti",scan:"Scansione",map:"Mappa",lab:"Laboratorio",risk:"Rischio",sim:"Simulazioni",fire:"Indipendenza",stress:"Stress test",opt:"Frontiera",bench:"Benchmark"};
let current="home";
/* colore d'accento di ogni sezione (lo stesso del CSS) */
const ACC={home:"212,255,58",patrimonio:"201,242,74",strumenti:"201,242,74",scan:"212,255,58",map:"212,255,58",lab:"212,255,58",risk:"255,122,61",sim:"71,229,255",fire:"201,242,74",stress:"255,194,75",opt:"255,122,217",bench:"91,240,165"};
/* la pillola del dock insegue il pulsante attivo con una molla, anche mentre l'etichetta si allarga */
const pillS={x:0,w:0,on:false,until:0};
function movePill(){pillS.until=performance.now()+900;if(pillS.on)return;pillS.on=true;
  const step=()=>{const b=navBtn(current),pill=$("#pillbg");if(!b||!pill){pillS.on=false;return;}
    const tx=b.offsetLeft-6,tw=b.offsetWidth,k=REDUCE||!pillS.w?1:.22;pillS.x+=(tx-pillS.x)*k;pillS.w+=(tw-pillS.w)*k;
    pill.style.width=pillS.w.toFixed(1)+"px";pill.style.transform=`translateX(${pillS.x.toFixed(1)}px)`;
    if(performance.now()<pillS.until||Math.abs(tx-pillS.x)>.5||Math.abs(tw-pillS.w)>.5)requestAnimationFrame(step);else pillS.on=false;};
  requestAnimationFrame(step);
  const d=$("#dock"),b=navBtn(current);
  if(d&&b&&d.scrollWidth>d.clientWidth)setTimeout(()=>d.scrollTo({left:b.offsetLeft-d.clientWidth/2+b.offsetWidth/2,behavior:REDUCE?"auto":"smooth"}),420);
}
const avail=n=>{const b=document.querySelector(`.dock [data-go="${n}"]`);return !!b&&!b.disabled&&!b.classList.contains("off");};
const neighbor=(name,dir)=>{for(let i=SCENES.indexOf(name)+dir;i>=0&&i<SCENES.length;i+=dir)if(avail(SCENES[i]))return SCENES[i];return null;};
/* il menu ha 4 voci: Home, Laboratorio (analisi del file → mappa → risultati), Patrimonio, Strumenti (le 6 analisi) */
const GROUP={home:"home",patrimonio:"patrimonio",scan:"lab",map:"lab",lab:"lab",strumenti:"strumenti",risk:"strumenti",sim:"strumenti",fire:"strumenti",stress:"strumenti",opt:"strumenti",bench:"strumenti"};
const navBtn=n=>document.querySelector(`.dock [data-nav="${GROUP[n]}"]`)||document.querySelector(`.dock button[data-go="${n}"]:not(.dk-old)`);
/* «Laboratorio» porta al passo a cui sei arrivato: i risultati se ci sono, altrimenti l'analisi del file */
const labTarget=()=>["lab","map","scan"].includes(current)?current:avail("lab")?"lab":"scan";
const LOCK=`<svg class="ico-lock" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
const LAB_STEPS=[["scan","Analisi del file"],["map","Mappa"],["lab","Risultati"]];
const TOOLS=[["risk","Rischio","Quanto puoi perdere in un anno cattivo: VaR, drawdown, chi pesa di più sul rischio."],
  ["sim","Simulazioni","Migliaia di futuri possibili con Monte Carlo: quanto avrai, con che probabilità."],
  ["fire","Indipendenza","Quando puoi smettere di lavorare e quanto puoi prelevare ogni mese."],
  ["stress","Stress test","Come sarebbe andata nel 2008, nel 2020, nel 2022, e con uno shock a scelta."],
  ["opt","Frontiera","I pesi più efficienti secondo Markowitz, con i limiti che decidi tu."],
  ["bench","Benchmark","Hai battuto il mercato? Confronto con MSCI World, S&P 500 e altri indici."]];
/* barra in cima alle sezioni di un gruppo: i passi del laboratorio, oppure gli altri strumenti */
function renderSubnav(name){
  const sc=$("#scene-"+name),inner=sc&&sc.querySelector(":scope>.inner");if(!inner)return;
  let nav=inner.querySelector(":scope>.subnav");const g=GROUP[name];
  if(g!=="lab"&&!(g==="strumenti"&&name!=="strumenti")){if(nav)nav.remove();return;}
  if(!nav){nav=document.createElement("nav");nav.className="subnav";inner.prepend(nav);}
  if(g==="lab"){nav.setAttribute("aria-label","Passi del laboratorio");
    nav.innerHTML=`<ol class="sn-steps">${LAB_STEPS.map(([k,l],i)=>{const on=k===name,ok=avail(k);return `<li><button type="button" class="sn-step${on?" on":""}${ok?"":" off"}" ${ok?`data-go="${k}"`:"disabled"} aria-current="${on?"step":"false"}"><i>${i+1}</i>${l}${ok?"":LOCK}</button></li>`;}).join("")}</ol>
      <button type="button" class="sn-link" data-go="patrimonio">Il mio patrimonio →</button>`;}
  else{nav.setAttribute("aria-label","Strumenti");
    nav.innerHTML=`<button type="button" class="sn-link back" data-go="strumenti">← Strumenti</button><div class="sn-tools">${TOOLS.map(([k,l])=>`<button type="button" class="sn-tool${k===name?" on":""}" data-go="${k}"${avail(k)?"":" disabled"} aria-current="${k===name?"page":"false"}">${l}</button>`).join("")}</div>`;}
}
function renderTools(){
  const ready=avail("risk"),grid=$("#toolsGrid"),lock=$("#toolsLock");if(!grid)return;
  const src=S.source&&S.source.name;
  $("#toolsSrc").textContent=ready?`Analizzano il portafoglio del laboratorio${src?`: «${src}»`:""}.`:"Le analisi lavorano sul portafoglio che hai nel laboratorio.";
  lock.hidden=ready;
  if(!ready)lock.innerHTML=`<div><b>Prima serve un portafoglio nel laboratorio</b><span>Caricane uno da un file, oppure usa il tuo patrimonio: in un minuto gli strumenti si sbloccano.</span></div>
    <span class="tl-b">${pmHas()?`<button type="button" class="btn lime" id="toolsPm">Usa il mio patrimonio</button>`:""}<button type="button" class="btn${pmHas()?"":" lime"}" data-nav="lab">Vai al laboratorio</button></span>`;
  grid.innerHTML=TOOLS.map(([k,l,d],i)=>`<button type="button" class="tool-card${ready?"":" off"}" ${ready?`data-go="${k}"`:"disabled"} style="--t:${ACC[k]}"><span class="tc-n">${String(i+1).padStart(2,"0")}</span><b>${l}</b><small>${d}</small><em>${ready?"Apri →":LOCK+" Disponibile con un portafoglio nel laboratorio"}</em></button>`).join("");
}
document.addEventListener("click",e=>{if(e.target.closest("#toolsPm"))pmToLab();});
/* gli elementi che entrano in scena uno dopo l'altro: tutto ciò che è visibile, anche dentro i riquadri dei risultati */
function enterItems(sc){
  const out=[];sc.querySelectorAll(":scope>.inner>*").forEach(el=>{
    if(el.hidden)return;
    if(el.classList.contains("bento"))out.push(...el.children);
    else if(el.id&&/Box$/.test(el.id))out.push(...[...el.children].filter(k=>!k.hidden));
    else out.push(el);});
  return out;
}
/* pannello di passaggio: copre la sezione che esce, mostra numero e nome di quella che entra, poi si apre */
const xfer=document.createElement("div");xfer.className="xfer";xfer.setAttribute("aria-hidden","true");
xfer.innerHTML=`<div class="xf-p"></div><div class="xf-in"><span class="xf-n"></span><div class="xf-t"><small></small><b></b></div></div>`;document.body.appendChild(xfer);
function go(name,opts={}){
  if(!SCENES.includes(name)||(name===current&&!opts.force))return;
  trackOnce("scene",name,{name}); // funzione dichiarata più in basso: sicura anche prima che le statistiche siano pronte
  const from=current,prev=$("#scene-"+current),nxt=$("#scene-"+name);current=name;
  document.querySelectorAll(".dock button[data-go]").forEach(b=>b.setAttribute("aria-current",String(b.dataset.go===name)));
  document.querySelectorAll(".dock button[data-nav]").forEach(b=>b.setAttribute("aria-current",String(b.dataset.nav===GROUP[name])));
  $("#sceneChip").textContent=SCENE_L[name];movePill();Morph.shape(name);
  document.body.dataset.scene=name;if(Morph.tint)Morph.tint(name);
  if(go.tl){go.tl.progress(1).kill();go.tl=null;}
  const change=prev&&prev!==nxt;
  const show=()=>{if(change){prev.hidden=true;if(HAS_G)G.set(prev,{clearProps:"all"});}nxt.hidden=false;nxt.scrollTop=0;renderSubnav(name);onEnter(name);renderPager(name);};
  if(!HAS_G||REDUCE||!change||CALM){show();if(HAS_G&&!REDUCE){const it=enterItems(nxt);G.fromTo(it,{y:CALM?18:60,opacity:0},{y:0,opacity:1,duration:CALM?.6:.9,ease:CALM?"power3.out":"expo.out",stagger:CALM?.04:.05,clearProps:"transform,opacity"});}return;}
  if(Morph.burst)Morph.burst(.9);
  const dir=SCENES.indexOf(name)>=SCENES.indexOf(from)?1:-1,p=xfer.querySelector(".xf-p"),inn=xfer.querySelectorAll(".xf-in>*");
  xfer.style.setProperty("--xf",ACC[name]);
  xfer.querySelector(".xf-n").textContent=String(SCENES.indexOf(name)+1).padStart(2,"0");
  xfer.querySelector(".xf-t small").textContent=`${SCENE_L[from]}  ${dir>0?"→":"←"}  ${SCENE_L[name]}`;
  xfer.querySelector(".xf-t b").textContent=SCENE_L[name];
  let items=[];
  go.tl=G.timeline({onComplete:()=>{go.tl=null;}})
    .set(xfer,{visibility:"visible"})
    .to(prev,{opacity:0,x:-70*dir,filter:"blur(6px)",duration:.28,ease:"power2.in"},0)
    .fromTo(p,{xPercent:-115*dir},{xPercent:0,duration:.34,ease:"power3.in"},0)
    .fromTo(inn,{opacity:0,x:90*dir},{opacity:1,x:0,duration:.4,ease:"expo.out",stagger:.05},.2)
    .add(()=>{show();items=enterItems(nxt);G.set(items,{opacity:0,y:56});const h=nxt.querySelector(".scene-title h2");if(h){h.classList.remove("glitch");void h.offsetWidth;h.classList.add("glitch");setTimeout(()=>h.classList.remove("glitch"),900);}},.34)
    .to(inn,{opacity:0,x:-70*dir,duration:.22,ease:"power2.in",stagger:.03},.58)
    .to(p,{xPercent:115*dir,duration:.42,ease:"power3.inOut"},.62)
    .add(()=>{G.to(items,{opacity:1,y:0,duration:.85,ease:"expo.out",stagger:.045,clearProps:"transform,opacity"});},.7)
    .set(xfer,{visibility:"hidden"},1.05);
}
/* in fondo a ogni sezione: da dove vieni, dove vai, a che punto sei */
function renderPager(name){
  const sc=$("#scene-"+name),inner=sc&&sc.querySelector(":scope>.inner");if(!inner)return;
  let nav=inner.querySelector(":scope>.pager");if(!nav){nav=document.createElement("nav");nav.className="pager";nav.setAttribute("aria-label","Sezione precedente e successiva");inner.appendChild(nav);}
  const pv=neighbor(name,-1),nx=neighbor(name,1),lockNext=!nx&&SCENES.indexOf(name)<SCENES.length-1?SCENES[SCENES.indexOf(name)+1]:null;
  const card=(n,cls,arrow)=>n?`<button type="button" class="pg ${cls}" data-go="${n}" style="--t:${ACC[n]}"><span>${cls==="nx"?"":arrow+" "}${String(SCENES.indexOf(n)+1).padStart(2,"0")}${cls==="nx"?" "+arrow:""}</span><b>${SCENE_L[n]}</b></button>`:`<span class="pg ${cls} none"></span>`;
  nav.innerHTML=card(pv,"pv","←")+`<div class="pg-dots" aria-hidden="true">${SCENES.map(s=>`<i class="${s===name?"on":avail(s)?"":"off"}" style="--t:${ACC[s]}"></i>`).join("")}</div>`
    +(nx?card(nx,"nx","→"):lockNext?`<span class="pg nx locked"><span>${String(SCENES.indexOf(lockNext)+1).padStart(2,"0")} ${LOCK}</span><b>${SCENE_L[lockNext]}</b><small>si sblocca costruendo il laboratorio</small></span>`:`<span class="pg nx none"></span>`);
}
/* pagine di analisi: si ricalcolano solo se è cambiato qualcosa da quando sono state disegnate
   (dati del file, pesi scelti, scelte della pagina, dati macro, larghezza dello schermo). Tornarci è immediato.
   Le modifiche fatte dentro la pagina ridisegnano subito come prima: qui conta solo l'ingresso. */
let DSV=0;const dsVer=()=>{const d=S.ds;if(!d||!d.ok)return 0;if(!d.__v)Object.defineProperty(d,"__v",{value:++DSV});return d.__v;};
const SIG_OF={
  risk:()=>[S.riskW,S.optW&&S.optW.label],
  sim:()=>[S.riskW,S.optW&&S.optW.label,S.mcIn,S.mcOb,S.svSaved||""],
  fire:()=>[S.riskW,S.optW&&S.optW.label,S.fi&&S.fi.in,S.mcIn],
  stress:()=>[S.riskW,S.optW&&S.optW.label,S.st],
  opt:()=>[S.opIn],
  bench:()=>[S.riskW,S.optW&&S.optW.label,S.bn&&{p:S.bn.pick,c:S.bn.ccy,s:S.bn.sym,n:S.bn.series&&Object.keys(S.bn.series).length},!!S.bnRes]
};
const lastSig={};
const sigOf=name=>{try{return JSON.stringify([dsVer(),S.space||"",S.rfSrc||"",!!(S.macro&&S.macro.status==="ready"),Math.round(innerWidth/40),S.portfolio?S.portfolio.positions.map(p=>[p.valore,p.pesoTarget]):null,S.cmp||null,...SIG_OF[name]()]);}catch{return null;}};
/* il ricordo si prende dopo il disegno: al primo ingresso ogni pagina sistema le sue scelte iniziali */
function needRender(name){if(!SIG_OF[name])return true;const sig=sigOf(name);return !(sig&&lastSig[name]===sig&&$("#scene-"+name).querySelector("svg, table, .kpi"));}
function rendered(name){if(SIG_OF[name])lastSig[name]=sigOf(name);}
function onEnter(name){
  quantaScene(name);
  if(name==="scan"&&!S.scanPlayed)setTimeout(playScan,HAS_G?450:0);
  if(name==="risk"&&needRender("risk")){renderRisk();rendered("risk");}
  if(name==="sim"&&needRender("sim")){renderSim();rendered("sim");}
  if(name==="home")svHome();
  if(name==="patrimonio")pmEnter();
  if(name==="strumenti")renderTools();
  if(name==="fire"&&needRender("fire")){renderFI();rendered("fire");}
  if(name==="stress"&&needRender("stress")){renderStress();rendered("stress");}
  if(name==="opt"&&needRender("opt")){renderOpt();rendered("opt");}
  if(name==="bench"&&needRender("bench")){renderBench();rendered("bench");}
  if(name==="lab"&&S.lab&&!S.labFx.done){S.labFx.done=true;setTimeout(()=>{if(!S.lab)return;countAll();drawChart(true);if(S.corrView==="net")buildNet();},HAS_G?380:0);}
}
document.addEventListener("click",e=>{const n=e.target.closest("[data-nav]");if(n){go(n.dataset.nav==="lab"?labTarget():"strumenti");return;}const b=e.target.closest("[data-go]");if(!b||b.disabled||b.classList.contains("off"))return;go(b.dataset.go);});
window.addEventListener("resize",movePill);
document.addEventListener("keydown",e=>{
  if(e.target.closest&&e.target.closest("input,select,textarea")||$("#drawer").classList.contains("open"))return;
  if(document.body.classList.contains("bs-on"))return;
  if(e.key==="ArrowRight"){const n=neighbor(current,1);if(n)go(n);}
  if(e.key==="ArrowLeft"){const n=neighbor(current,-1);if(n)go(n);}
});

/* ---------- Cursore, luce sulle tessere, inclinazione 3D ---------- */
if(FINE&&!REDUCE&&!CALM){
  document.body.classList.add("has-cur");
  const cur=$("#cur"),ring=cur.querySelector(".r"),dot=cur.querySelector(".d");
  let mx=-100,my=-100,rx=-100,ry=-100;
  window.addEventListener("pointermove",e=>{mx=e.clientX;my=e.clientY;dot.style.transform=`translate(${mx}px,${my}px)`;cur.classList.remove("out");
    if(rx<-50){rx=mx;ry=my;}
    cur.classList.toggle("big",!!(e.target.closest&&e.target.closest("a,button,label,select,[data-rc],.net canvas,.drop")));},{passive:true});
  document.documentElement.addEventListener("mouseleave",()=>cur.classList.add("out"));
  window.addEventListener("blur",()=>cur.classList.add("out"));
  const loop=()=>{rx+=(mx-rx)*.35;ry+=(my-ry)*.35;ring.style.transform=`translate(${rx}px,${ry}px)`;requestAnimationFrame(loop);};loop();
  document.addEventListener("pointermove",e=>{
    const t=e.target.closest&&e.target.closest(".tile:not(.ghost),.kpi,.next .card");
    document.querySelectorAll(".tilt").forEach(x=>{if(x!==t){x.style.transform="";x.classList.remove("tilt");}});
    if(!t)return;const r=t.getBoundingClientRect(),px=(e.clientX-r.left)/r.width-.5,py=(e.clientY-r.top)/r.height-.5,m=r.width>600?3:7;
    t.classList.add("tilt");t.style.transform=`perspective(1000px) rotateX(${(-py*m).toFixed(2)}deg) rotateY(${(px*m).toFixed(2)}deg)`;
  },{passive:true});
}
document.addEventListener("pointermove",e=>{
  const c=e.target.closest&&e.target.closest(".card,.tile");if(!c)return;
  const r=c.getBoundingClientRect();c.style.setProperty("--mx",(e.clientX-r.left)+"px");c.style.setProperty("--my",(e.clientY-r.top)+"px");
},{passive:true});

/* ---------- Titolo diviso in lettere, lettere magnetiche ---------- */
function splitChars(el){
  const words=el.textContent.split(" ");
  el.innerHTML=words.map(w=>`<span style="display:inline-block;white-space:nowrap">${[...w].map(ch=>`<span class="ch">${esc(ch)}</span>`).join("")}</span>`).join(" ");
}
document.querySelectorAll("#heroTitle .sp").forEach(splitChars);
let magnetOn=false;
function heroMagnet(){
  if(!HAS_G||!FINE||magnetOn)return;magnetOn=true;
  const area=$("#scene-home"),chars=[...document.querySelectorAll("#heroTitle .ch")];
  const qy=chars.map(c=>G.quickTo(c,"y",{duration:.6,ease:"power3.out"})),qs=chars.map(c=>G.quickTo(c,"scale",{duration:.6,ease:"power3.out"})),qr=chars.map(c=>G.quickTo(c,"rotation",{duration:.6,ease:"power3.out"}));
  area.addEventListener("pointermove",e=>{
    chars.forEach((c,i)=>{const r=c.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),d=Math.hypot(dx,dy),k=Math.max(0,1-d/210);qy[i](-k*k*34);qs[i](1+k*k*.2);qr[i](-dx/210*k*k*14);});
  },{passive:true});
  area.addEventListener("pointerleave",()=>{qy.forEach(f=>f(0));qs.forEach(f=>f(1));qr.forEach(f=>f(0));});
}
function heroIntro(){
  if(!HAS_G){return;}
  G.from("#heroTitle .ch",{yPercent:120,rotate:9,duration:1.3,ease:"expo.out",stagger:.024,onComplete:heroMagnet});
  G.fromTo("#scene-home .bento>*:not(.hero-tile):nth-child(-n+2)",{y:80,opacity:0,rotateX:-12,transformPerspective:900},{y:0,opacity:1,rotateX:0,duration:1.1,ease:"expo.out",stagger:.07,delay:.25,clearProps:"transform,opacity"});
  G.from(".dock",{y:120,duration:1,ease:"expo.out",delay:.5});
  G.from(".topbar",{y:-60,opacity:0,duration:.9,ease:"expo.out",delay:.4});
}
if(HAS_G&&!CALM){
  /* Avvio: un mercato si disegna dal vivo (crollo e rimbalzo), implode in un punto, esplode in un'onda d'urto,
     il titolo appare e due serrande si aprono sulla home. Clic o tasto per accelerare; più breve dalla seconda visita. */
  const ld=document.createElement("div");ld.className="loader";ld.setAttribute("aria-hidden","true");
  let seen=false;try{seen=sessionStorage.getItem("pos-boot")==="1";sessionStorage.setItem("pos-boot","1");}catch{}
  const K=seen?.5:1,today=new Date().toLocaleDateString("it-IT",{weekday:"short",day:"2-digit",month:"short",year:"numeric"});
  ld.innerHTML=`<div class="ld-sh t"></div><div class="ld-sh b"></div><canvas class="ld-cv"></canvas>
    <div class="ld-ui"><div class="ld-top"><span>PORTFOLIO OS <em>v4</em></span><span>${today}</span><span>FINANCIAL INTELLIGENCE LAB</span></div>
    <div><div class="ld-mid"><div class="ld-num">000</div><ul class="ld-log"></ul></div><div class="ld-bar"><i></i></div></div></div>
    <div class="ld-title"><span class="a">PORTFOLIO</span><span class="b">OS</span></div><div class="ld-skip">clic per entrare</div>`;
  document.body.appendChild(ld);
  const LOG=["Motore statistico · oltre 200 test","Prezzi di mercato · ISIN verificati su OpenFIGI","Cambi e tassi ufficiali BCE","Composizione dei fondi · justETF","Quanta online"];
  const cv=ld.querySelector(".ld-cv"),cx=cv.getContext("2d"),dpr=Math.min(2,window.devicePixelRatio||1),num=ld.querySelector(".ld-num"),bar=ld.querySelector(".ld-bar i"),log=ld.querySelector(".ld-log");
  let W=0,H=0;const size=()=>{W=innerWidth;H=innerHeight;cv.width=W*dpr;cv.height=H*dpr;cx.setTransform(dpr,0,0,dpr,0,0);};size();window.addEventListener("resize",size);
  // percorso: passeggiata casuale con un crollo e un rimbalzo, normalizzata 0..1
  const N=200,raw=[];let lv=0,sd=11;const rnd=()=>{sd=(sd*16807)%2147483647;return sd/2147483647-.5;};
  for(let i=0;i<N;i++){const f=i/N;lv+=rnd()*.07+(f>.55&&f<.66?-.075:f>.66?.03:.01);raw.push(lv);}
  const lo=Math.min(...raw),hi=Math.max(...raw),pts=raw.map((y,i)=>({x:i/(N-1),y:(y-lo)/(hi-lo||1)}));
  const sparks=Array.from({length:320},()=>({a:Math.random()*6.283,r:.15+Math.random()*1.1,w:.6+Math.random()*2.2,c:["#D4FF3A","#A47BFF","#47E5FF","#FF7AD9"][Math.random()*4|0]}));
  const o={v:0,c:0,x:0};let shown=0;
  const draw=()=>{
    cx.clearRect(0,0,W,H);
    const L=W*.07,R=W*.93,T=H*.17,B=H*.6,mx=W/2,my=H/2,n=Math.max(2,Math.round(o.v/100*N)),e=o.c*o.c;
    const P=i=>{const p=pts[i],x=L+(R-L)*p.x,y=B-(B-T)*p.y;return[x+(mx-x)*e,y+(my-y)*e];};
    cx.globalAlpha=.5*(1-o.x);cx.strokeStyle="rgba(160,140,255,.12)";cx.lineWidth=1;cx.beginPath();
    for(let x=L;x<=R+1;x+=(R-L)/12){cx.moveTo(x,T-40);cx.lineTo(x,B+40);}for(let y=T-40;y<=B+41;y+=(B-T+80)/6){cx.moveTo(L,y);cx.lineTo(R,y);}cx.stroke();
    if(o.x<1){
      cx.globalAlpha=1-o.x;
      const g=cx.createLinearGradient(0,T,0,B);g.addColorStop(0,"rgba(212,255,58,.22)");g.addColorStop(1,"rgba(212,255,58,0)");
      cx.beginPath();for(let i=0;i<n;i++){const[x,y]=P(i);i?cx.lineTo(x,y):cx.moveTo(x,y);}
      const[lx]=P(n-1),[fx]=P(0);cx.lineTo(lx,B+(my-B)*e);cx.lineTo(fx,B+(my-B)*e);cx.closePath();cx.fillStyle=g;cx.globalAlpha=(1-o.x)*(1-o.c);cx.fill();
      cx.globalAlpha=1-o.x;cx.lineWidth=2.4;cx.strokeStyle="#D4FF3A";cx.shadowColor="#D4FF3A";cx.shadowBlur=20;cx.beginPath();
      for(let i=0;i<n;i++){const[x,y]=P(i);i?cx.lineTo(x,y):cx.moveTo(x,y);}cx.stroke();
      const[hx,hy]=P(n-1),pu=4+2.5*Math.sin(performance.now()/90)+o.c*10;cx.fillStyle="#fff";cx.shadowColor="#fff";cx.beginPath();cx.arc(hx,hy,pu,0,6.283);cx.fill();cx.shadowBlur=0;
      if(o.c===0&&n<N){cx.font="600 12px "+getComputedStyle(document.body).getPropertyValue("--f-mono");cx.fillStyle="#D4FF3A";cx.fillText((1e6*(.7+pts[n-1].y*.6)).toLocaleString("it-IT",{maximumFractionDigits:0})+" €",hx+12,hy-10);}
    }
    if(o.x>0){
      const M=Math.hypot(W,H)*.62,k=1-o.x;
      for(let j=0;j<3;j++){const rr=M*Math.max(0,o.x-j*.08);cx.globalAlpha=k*(.9-j*.25);cx.lineWidth=3-j;cx.strokeStyle=j?"#A47BFF":"#D4FF3A";cx.shadowColor=cx.strokeStyle;cx.shadowBlur=30;cx.beginPath();cx.arc(mx,my,rr,0,6.283);cx.stroke();}
      cx.shadowBlur=0;
      sparks.forEach(s=>{const d=M*s.r*o.x,x=mx+Math.cos(s.a)*d,y=my+Math.sin(s.a)*d;cx.globalAlpha=k;cx.strokeStyle=s.c;cx.lineWidth=s.w;cx.beginPath();cx.moveTo(x,y);cx.lineTo(x-Math.cos(s.a)*18*k,y-Math.sin(s.a)*18*k);cx.stroke();});
    }
    cx.globalAlpha=1;
  };
  G.ticker.add(draw);
  const end=()=>{G.ticker.remove(draw);window.removeEventListener("resize",size);ld.remove();};
  const tl=G.timeline({onComplete:end});
  tl.to(o,{v:100,duration:1.6*K,ease:"power1.inOut",onUpdate:()=>{const v=Math.round(o.v);num.textContent=String(v).padStart(3,"0");bar.style.width=v+"%";
      while(shown<LOG.length&&v>=(shown+1)*19){const li=document.createElement("li");li.textContent=LOG[shown++];log.appendChild(li);}}})
    .to(".ld-ui",{opacity:0,y:-20,duration:.35,ease:"power2.in"})
    .to(o,{c:1,duration:.5*K,ease:"power3.in"},"<")
    .add(()=>ld.classList.add("boom"))
    .to(o,{x:1,duration:1.1*K,ease:"expo.out"})
    .fromTo(".ld-title span",{opacity:0,scale:1.8,filter:"blur(18px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:.8*K,ease:"expo.out",stagger:.08},"<")
    .to(".ld-title",{scale:1.25,opacity:0,filter:"blur(10px)",duration:.6,ease:"expo.in"},"-=.35")
    .to(".ld-sh.t",{yPercent:-100,duration:1,ease:"expo.inOut"},"<.25")
    .to(".ld-sh.b",{yPercent:100,duration:1,ease:"expo.inOut"},"<")
    .to(".ld-skip",{opacity:0,duration:.2},"<")
    .add(heroIntro,"-=.65");
  const skip=()=>{tl.timeScale(4);};ld.addEventListener("click",skip);window.addEventListener("keydown",skip,{once:true});
}

/* ---------- Oggetto di particelle che si trasforma a ogni scena ---------- */
const Morph={on:false,shape(){},cur:{x:0,y:0,s:1,a:1},goal:{x:0,y:0,s:1,a:1},mx:0,my:0,vis:true};
function morphPlace(name){
  const narrow=window.innerWidth<820;
  const P={home:narrow?{x:0,y:.6,s:.85,a:.45}:{x:1.5,y:.05,s:1.4,a:.62},scan:narrow?{x:0,y:2.6,s:.6,a:.22}:{x:3.4,y:1.4,s:.72,a:.34},map:narrow?{x:0,y:2.6,s:.6,a:.22}:{x:3.6,y:-1.1,s:.7,a:.3},lab:{x:0,y:0,s:1.3,a:.16},risk:narrow?{x:0,y:2.4,s:.6,a:.22}:{x:3.3,y:-1.3,s:.72,a:.32},sim:narrow?{x:0,y:2.4,s:.6,a:.22}:{x:3.2,y:-1.2,s:.75,a:.3},stress:narrow?{x:0,y:2.4,s:.6,a:.22}:{x:3.2,y:-1.3,s:.75,a:.3},opt:narrow?{x:0,y:2.4,s:.6,a:.22}:{x:3.2,y:-1.2,s:.75,a:.3},bench:narrow?{x:0,y:2.4,s:.6,a:.22}:{x:3.2,y:-1.2,s:.75,a:.3}};
  return P[name]||P.home;
}
function morphShape(name){
  const N=Morph.N,out=new Float32Array(N*3),rnd=i=>{const x=Math.sin(i*12.9898+78.233)*43758.5453;return x-Math.floor(x);};
  if(name==="scan"){
    const cols=46,rows=Math.ceil(N/cols);
    for(let i=0;i<N;i++){const c=i%cols,r=Math.floor(i/cols);let x=(c/(cols-1)-.5)*7,y=(r/(rows-1)-.5)*4.4,z=Math.sin(c*.35)*.18+Math.cos(r*.5)*.12;
      const a=-.55,b=.45,y2=y*Math.cos(a)-z*Math.sin(a),z2=y*Math.sin(a)+z*Math.cos(a),x3=x*Math.cos(b)+z2*Math.sin(b),z3=-x*Math.sin(b)+z2*Math.cos(b);
      out[i*3]=x3;out[i*3+1]=y2;out[i*3+2]=z3;}
  }else if(name==="map"){
    const A=S.sheets.length?an():null,cols=A&&A.cols.length?A.cols.slice(0,10):[1,2,3,4,5,6];
    const k=cols.length,h=cols.map((c,j)=>{if(!c.kind)return 1+((j*7)%5)*.6;const role=S.roles[c.idx];return role==="ignore"?.6:role==null?1.4:role==="date"?1.9:2.4+(c.numFrac||0)*1.4;});
    for(let i=0;i<N;i++){const j=i%k,bx=(j-(k-1)/2)*.78,hh=h[j];out[i*3]=bx+(rnd(i)-.5)*.5;out[i*3+1]=-2+rnd(i+7)*hh*1.2;out[i*3+2]=(rnd(i+3)-.5)*.5;}
  }else if(name==="risk"&&S.risk&&S.risk.PR&&S.risk.PR.sorted){
    const s=S.risk.PR.sorted,B=24,lo=s[0],hi=s[s.length-1],cnt=new Array(B).fill(0);s.forEach(x=>{cnt[Math.min(B-1,Math.floor((x-lo)/((hi-lo)||1)*B))]++;});
    const cum=[];let acc=0;cnt.forEach(c=>{acc+=c;cum.push(acc/s.length);});const mx=Math.max(...cnt);
    for(let i=0;i<N;i++){const u=rnd(i+11);let b=cum.findIndex(c=>c>=u);if(b<0)b=B-1;out[i*3]=(b-(B-1)/2)*.3+(rnd(i)-.5)*.24;out[i*3+1]=-2+rnd(i+7)*(cnt[b]/mx)*4.2;out[i*3+2]=(rnd(i+3)-.5)*.6;}
  }else if(name==="stress"&&S.stress&&S.stress.series){
    /* la caduta e la risalita del portafoglio nella crisi selezionata, con detriti sotto la linea */
    const sr=S.stress.series,n=sr.length,mn=Math.min(...sr),mx=Math.max(...sr),sp=(mx-mn)||1;
    for(let i=0;i<N;i++){const t=rnd(i+1),j=Math.min(n-1,Math.floor(t*n)),v=sr[j],y=((v-mn)/sp-.5)*3.6,deb=rnd(i+5)<.35;
      out[i*3]=(t-.5)*8;out[i*3+1]=deb?y-rnd(i+7)*((v-mn)/sp*3.6+.2):y+(rnd(i+9)-.5)*.1;out[i*3+2]=(rnd(i+3)-.5)*(deb?1.2:.4);}
  }else if(name==="bench"&&S.bnRes&&S.bnRes.gP){
    /* due nastri: il portafoglio e il benchmark che corrono insieme */
    const A=S.bnRes.gP,B=S.bnRes.gB,n=A.length,all=[...A,...B],mn=Math.min(...all),mx=Math.max(...all),sp=(mx-mn)||1;
    for(let i=0;i<N;i++){const t=rnd(i+1),j=Math.min(n-1,Math.floor(t*n)),isP=i%2===0,v=(isP?A:B)[j];
      out[i*3]=(t-.5)*8;out[i*3+1]=((v-mn)/sp-.5)*4+(rnd(i+5)-.5)*.08;out[i*3+2]=(isP?.35:-.35)+(rnd(i+3)-.5)*.25;}
  }else if(name==="opt"&&S.opt&&S.opt.O){
    /* nuvola di portafogli e la frontiera come cresta luminosa */
    const F=S.opt.O.frontier,cl=S.opt.cloud||[],all=[...F,...cl],vx=Math.max(...all.map(p=>p.vol))||1,r0=Math.min(...all.map(p=>p.ret)),r1=Math.max(...all.map(p=>p.ret)),sp=(r1-r0)||1;
    for(let i=0;i<N;i++){const onF=i%3===0||!cl.length,p=onF?F[Math.floor(rnd(i+1)*F.length)]:cl[Math.floor(rnd(i+1)*cl.length)];
      out[i*3]=(p.vol/vx-.5)*7+(rnd(i+5)-.5)*(onF?.05:.12);out[i*3+1]=((p.ret-r0)/sp-.5)*4.2+(rnd(i+7)-.5)*(onF?.05:.12);out[i*3+2]=(rnd(i+3)-.5)*(onF?.15:.8);}
  }else if(name==="sim"&&S.mc&&S.mc.fan){
    /* ventaglio: il tempo da sinistra a destra, i percentili simulati in verticale (scala logaritmica) */
    const F=S.mc.fan,Y=F.length-1,L=v=>Math.log(Math.max(1,v)),lo=L(Math.min(...F.map(r=>r.nom[0]))),hi=L(Math.max(...F.map(r=>r.nom[6]))),sp=(hi-lo)||1;
    for(let i=0;i<N;i++){const t=rnd(i+1),yy=t*Y,y0=Math.floor(yy),y1=Math.min(Y,y0+1),fr=yy-y0,u=rnd(i+5)*6,q0=Math.floor(u),q1=Math.min(6,q0+1),fu=u-q0;
      const at=y=>F[y].nom[q0]+(F[y].nom[q1]-F[y].nom[q0])*fu,v=at(y0)+(at(y1)-at(y0))*fr;
      out[i*3]=(t-.5)*8;out[i*3+1]=((L(v)-lo)/sp-.5)*4.2+(rnd(i+9)-.5)*.08;out[i*3+2]=(rnd(i+3)-.5)*.5;}
  }else if(name==="lab"&&S.lab&&S.lab.W&&S.lab.W.length){
    const W=S.lab.W,k=W.length;let mn=Infinity,mx=-Infinity;W.forEach(s=>s.forEach(v=>{if(Number.isFinite(v)){if(v<mn)mn=v;if(v>mx)mx=v;}}));
    for(let i=0;i<N;i++){const a=i%k,s=W[a],n=s.length,t=rnd(i+1),idx=Math.min(n-1,Math.floor(t*n));let v=s[idx];if(!Number.isFinite(v))v=100;
      out[i*3]=(t-.5)*8;out[i*3+1]=((v-mn)/(mx-mn||1)-.5)*4.2+(rnd(i+5)-.5)*.12;out[i*3+2]=(a-(k-1)/2)*.7+(rnd(i+9)-.5)*.2;}
  }else{
    const r=2.35,ga=Math.PI*(3-Math.sqrt(5));
    for(let i=0;i<N;i++){const y=1-(i/(N-1))*2,rad=Math.sqrt(Math.max(0,1-y*y)),th=ga*i,wob=1+.07*Math.sin(th*3)+.05*Math.cos(y*9);
      out[i*3]=Math.cos(th)*rad*r*wob;out[i*3+1]=y*r*wob;out[i*3+2]=Math.sin(th)*rad*r*wob;}
  }
  return out;
}
function morphData(){
  if(Morph.on){Morph.tgt.set(morphShape(current));}
  const lbl=$("#flowLabel");if(lbl)lbl.textContent=`${Morph.N||0} particelle · si trasformano in ogni sezione · dati di «${S.source?S.source.name:"esempio"}»`;
}
/* Le particelle: uno shader su misura (luce additiva, scintillio, respiro, onda d'urto al clic, spinta del mouse)
   e un'esplosione che si ricompone a ogni cambio di sezione. */
const MORPH_VS=`
attribute vec3 color;attribute float aRand;attribute float aSize;
uniform float uTime,uPix,uAlpha,uBurst,uAspect,uMouseOn,uPulseR,uPulseA,uCalm,uTintK;uniform vec2 uMouse,uPulseC;uniform vec3 uTint;
varying vec3 vColor;varying float vAlpha;varying float vHot;
void main(){
  vec3 p=position;
  float n=sin(p.x*1.7+uTime*.9+aRand*6.28)*cos(p.y*1.3-uTime*.7)*sin(p.z*1.5+uTime*.6);
  p+=normalize(p+vec3(1e-4))*n*(.05*uCalm+uBurst*1.1);
  vec4 mv=modelViewMatrix*vec4(p,1.);vec4 clip=projectionMatrix*mv;vec2 ndc=clip.xy/clip.w;
  vec2 dm=ndc-uMouse;float dist=length(dm*vec2(uAspect,1.));float f=smoothstep(.38,0.,dist)*uMouseOn;
  clip.xy+=normalize(dm+1e-5)*f*.09*clip.w;
  float r=length((ndc-uPulseC)*vec2(uAspect,1.));float ring=exp(-pow((r-uPulseR)*10.,2.))*uPulseA;
  clip.xy+=normalize(ndc-uPulseC+1e-5)*ring*.07*clip.w;
  gl_Position=clip;
  float tw=.62+.38*sin(uTime*(1.6+aRand*1.8)+aRand*40.);
  vHot=clamp(ring*1.2+f*.9+uBurst*.7,0.,1.);
  gl_PointSize=aSize*uPix*(320./-mv.z)*(1.+ring*1.6+f*1.1+uBurst*.9);
  vec3 base=mix(color,uTint,uTintK*(.35+.4*step(.5,fract(aRand*7.))));vColor=mix(base,uTint*1.15+.08,vHot*.85);
  vAlpha=uAlpha*tw*(.45+.55*smoothstep(-15.,-6.5,mv.z));
}`;
const MORPH_FS=`
varying vec3 vColor;varying float vAlpha;varying float vHot;
void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,0.,d);float core=smoothstep(.16,0.,d);
  gl_FragColor=vec4(vColor*(.75+core*(.9+vHot)),a*vAlpha);}`;
function morphInit(){
  const cv=$("#morph");if(!window.THREE)return;
  let renderer;try{renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true,powerPreference:"high-performance"});}catch(e){return;}
  const T=THREE,scene=new T.Scene(),cam=new T.PerspectiveCamera(45,1,.1,100);cam.position.set(0,0,9.5);
  const PIX=Math.min(window.devicePixelRatio||1,2);renderer.setPixelRatio(PIX);
  const N=window.innerWidth<700?2600:6400,pos=new Float32Array(N*3),col=new Float32Array(N*3),tgt=new Float32Array(N*3),spd=new Float32Array(N),rnd=new Float32Array(N),siz=new Float32Array(N);
  for(let i=0;i<N;i++){const u=Math.random(),v=Math.random(),th=u*Math.PI*2,ph=Math.acos(2*v-1),r=6+Math.random()*4;
    pos[i*3]=r*Math.sin(ph)*Math.cos(th);pos[i*3+1]=r*Math.sin(ph)*Math.sin(th);pos[i*3+2]=r*Math.cos(ph);spd[i]=.035+Math.random()*.05;rnd[i]=Math.random();
    /* palette: viola profondo, lavanda, ciano raro, lime per le "stelle" */
    const q=Math.random(),k=i%9;
    if(k===0){col[i*3]=.83;col[i*3+1]=1;col[i*3+2]=.23;}else if(k===4){col[i*3]=.28;col[i*3+1]=.9;col[i*3+2]=1;}else{col[i*3]=.45+q*.35;col[i*3+1]=.3+q*.25;col[i*3+2]=1;}
    siz[i]=Math.random()<.04?.2+Math.random()*.12:.07+Math.random()*.07;}
  const geo=new T.BufferGeometry();geo.setAttribute("position",new T.BufferAttribute(pos,3));geo.setAttribute("color",new T.BufferAttribute(col,3));
  geo.setAttribute("aRand",new T.BufferAttribute(rnd,1));geo.setAttribute("aSize",new T.BufferAttribute(siz,1));
  const U={uTime:{value:0},uPix:{value:PIX},uAlpha:{value:1},uBurst:{value:0},uAspect:{value:1},uMouse:{value:new T.Vector2(9,9)},uMouseOn:{value:0},uPulseC:{value:new T.Vector2(0,0)},uPulseR:{value:0},uPulseA:{value:0},uCalm:{value:REDUCE?0:1},uTint:{value:new T.Vector3(.83,1,.23)},uTintK:{value:0}};
  const mat=new T.ShaderMaterial({uniforms:U,vertexShader:MORPH_VS,fragmentShader:MORPH_FS,transparent:true,depthWrite:false,blending:T.AdditiveBlending});
  const group=new T.Group();group.add(new T.Points(geo,mat));
  /* alone: un disco di luce viola dietro le particelle, che si accende nelle transizioni */
  const hc=document.createElement("canvas");hc.width=hc.height=256;const hx=hc.getContext("2d"),hg=hx.createRadialGradient(128,128,0,128,128,128);
  hg.addColorStop(0,"rgba(150,95,255,.55)");hg.addColorStop(.35,"rgba(110,50,240,.22)");hg.addColorStop(1,"rgba(80,20,200,0)");hx.fillStyle=hg;hx.fillRect(0,0,256,256);
  const halo=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(hc),transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:.5}));halo.scale.set(13,13,1);
  scene.add(halo);scene.add(group);const HB={v:.5};
  Object.assign(Morph,{on:true,renderer,scene,cam,group,geo,pos,tgt,spd,N,mat,U,halo});
  Morph.shape=name=>{Morph.tgt.set(morphShape(name));Morph.goal=morphPlace(name);};
  /* ogni sezione tinge le particelle del suo colore (casa e laboratorio restano viola e lime) */
  const TINT={risk:[1,.48,.24],sim:[.28,.9,1],stress:[1,.76,.29],opt:[1,.48,.85],bench:[.36,.94,.65]};
  Morph.tint=name=>{const t=TINT[name],v=U.uTint.value;if(!HAS_G){if(t)v.set(...t);U.uTintK.value=t?1:0;return;}if(t)G.to(v,{x:t[0],y:t[1],z:t[2],duration:1.2,ease:"power2.out"});G.to(U.uTintK,{value:t?1:0,duration:1.2,ease:"power2.out"});};
  /* esplosione: le particelle schizzano verso l'esterno e si ricompongono nella forma della nuova sezione */
  Morph.burst=(power=1)=>{
    if(REDUCE||!HAS_G)return;
    const p=Morph.pos;for(let i=0;i<N;i++){const o=i*3,x=p[o],y=p[o+1],z=p[o+2],l=Math.hypot(x,y,z)||1,k=(1.2+Math.random()*2.6)*power;p[o]+=x/l*k;p[o+1]+=y/l*k;p[o+2]+=z/l*k;}
    G.killTweensOf(U.uBurst);G.fromTo(U.uBurst,{value:power},{value:0,duration:1.6,ease:"expo.out"});
    G.killTweensOf(cam);G.fromTo(cam,{fov:45+14*power},{fov:45,duration:1.4,ease:"expo.out",onUpdate:()=>cam.updateProjectionMatrix()});
    G.killTweensOf(HB);G.fromTo(HB,{v:1},{v:.5,duration:1.6,ease:"power2.out"});
  };
  /* onda d'urto dove clicchi (sullo sfondo, non sui pulsanti) */
  window.addEventListener("pointerdown",e=>{
    if(REDUCE||!HAS_G||e.target.closest("button,a,input,select,textarea,label,[data-rc],.card,.kpi,.chat,.drawer"))return;
    U.uPulseC.value.set(e.clientX/window.innerWidth*2-1,-(e.clientY/window.innerHeight*2-1));
    G.killTweensOf([U.uPulseR,U.uPulseA]);G.fromTo(U.uPulseR,{value:0},{value:1.9,duration:1.5,ease:"power2.out"});G.fromTo(U.uPulseA,{value:1.2},{value:0,duration:1.5,ease:"power1.in"});
  },{passive:true});
  Morph.shape(current);Morph.cur={...Morph.goal};morphData();
  const size=()=>{const w=window.innerWidth,h=window.innerHeight;renderer.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();U.uAspect.value=w/h;Morph.goal=morphPlace(current);};
  window.addEventListener("resize",size);size();
  let mouseT=0;
  window.addEventListener("pointermove",e=>{Morph.mx=e.clientX/window.innerWidth*2-1;Morph.my=e.clientY/window.innerHeight*2-1;U.uMouse.value.set(Morph.mx,-Morph.my);mouseT=performance.now();},{passive:true});
  let t0=performance.now();
  const loop=now=>{
    const dt=Math.min(3,(now-t0)/16.67);t0=now;
    if(!document.hidden){
      const p=Morph.pos,t=Morph.tgt,time=now/1000;
      for(let i=0;i<N;i++){const k=Math.min(1,spd[i]*dt),o=i*3;p[o]+=(t[o]-p[o])*k;p[o+1]+=(t[o+1]-p[o+1])*k;p[o+2]+=(t[o+2]-p[o+2])*k;}
      geo.attributes.position.needsUpdate=true;
      U.uTime.value=REDUCE?0:time;
      U.uMouseOn.value+=((FINE&&!REDUCE&&now-mouseT<2500?1:0)-U.uMouseOn.value)*.06*dt;
      const c=Morph.cur,g=Morph.goal,e=.05*dt;c.x+=(g.x-c.x)*e;c.y+=(g.y-c.y)*e;c.s+=(g.s-c.s)*e;c.a+=(g.a-c.a)*e;
      group.position.set(c.x+Morph.mx*.25,c.y-Morph.my*.2,0);group.scale.setScalar(c.s);U.uAlpha.value=c.a;
      halo.position.set(group.position.x,group.position.y,-2.5);halo.scale.setScalar(12*c.s*(1+.04*Math.sin(time*.8)));halo.material.opacity=HB.v*(.25+.75*c.a);
      group.rotation.y+=REDUCE?0:.0022*dt;group.rotation.x+=((current==="lab"?.1:Morph.my*.25)-group.rotation.x)*.04;
      renderer.render(scene,cam);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/* ---------- Ticker con metriche vere ---------- */
function renderTicker(){
  const ds=S.ds,el=$("#ticker");if(!el)return;
  if(!ds||!ds.ok){el.innerHTML="<span>Carica un file per vedere le metriche</span>";return;}
  const f=ds.freq.f,items=[`<span>${ds.assets.length} ASSET · ${ds.nObs} OSSERVAZIONI ${ds.freq.adj.toUpperCase()}</span>`];
  ds.assets.forEach(a=>{const s=P.stats(a,f,ds.dates);if(s.n<2)return;
    items.push(`<span>${esc(a.name.toUpperCase())} <b class="${s.cagr>=0?"up":"dn"}">${fmtPct(s.cagr,1,true)}</b> <span style="opacity:.6">CAGR</span> <b>${fmtPct(s.vol,1)}</b> <span style="opacity:.6">VOL</span> <b class="dn">${fmtPct(s.mdd,1)}</b> <span style="opacity:.6">MAX DD</span></span>`);});
  const miss=ds.assets.reduce((s,a)=>s+a.missing,0);items.push(`<span>${miss} VALORI MANCANTI · NESSUNO STIMATO</span>`);
  const one=items.join("");el.innerHTML=one+one;
}
function reveal(){}

export { GROUP, labTarget, renderSubnav, renderTools, ACC, MORPH_FS, MORPH_VS, Morph, SCENES, SCENE_L, avail, current, enterItems, go, heroIntro, heroMagnet, magnetOn, morphData, morphInit, morphPlace, morphShape, movePill, neighbor, onEnter, pillS, renderPager, renderTicker, reveal, splitChars, xfer };
