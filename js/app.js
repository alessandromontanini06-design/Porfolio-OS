/* Portfolio OS · interfaccia (scene, grafici, IA, ricevute). Importa il motore. */
import { POS } from "./engine.js";
const P=POS;
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const {fmtN,fmtPct,fmtDate}=P;
const REDUCE=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const FINE=window.matchMedia("(hover:hover) and (pointer:fine)").matches;
const G=window.gsap,ST=window.ScrollTrigger,HAS_G=!!(G&&ST)&&!REDUCE;
if(HAS_G)G.registerPlugin(ST);
const ROLES=[{v:"date",l:"Data"},{v:"price",l:"Prezzo / valore"},{v:"ret",l:"Rendimento (decimale)"},{v:"retpct",l:"Rendimento (in %)"},{v:"ignore",l:"Ignora"}];
const ROLE_SHORT={price:"prezzi",ret:"rendimenti",retpct:"rendimenti %"};
const ROLE_TAG={date:"data",price:"prezzo",ret:"rend.",retpct:"rend. %",ignore:"ignora"};
const ROLE_COLOR={date:"var(--c4)",price:"var(--c1)",ret:"var(--c3)",retpct:"var(--c3)",ignore:"var(--faint)"};
const CONF_L={alta:"Alta",media:"Da verificare",bassa:"Da confermare",utente:"Confermata"};
const COLORS=["var(--c1)","var(--c2)","var(--c3)","var(--c4)","var(--c5)","var(--c6)"];
const NET_COLORS=["#C8FF2E","#A47BFF","#47E5FF","#FF7AD9","#FFC24B","#5BF0A5"];
const color=i=>COLORS[i%COLORS.length];
const fmtSize=b=>b<1024?b+" B":b<1048576?fmtN(b/1024,0)+" KB":fmtN(b/1048576,1)+" MB";
const S={source:null,raw:[],sheets:[],sheetIdx:0,roles:{},touched:{},ds:null,lab:null,corrView:"net",scanPlayed:false,labFx:{},ai:null,aiLog:[],aiRoles:{},rawOrig:null,macro:null,rfSrc:"ecb"};

/* ---------- Scene e dock ---------- */
const SCENES=["home","scan","map","lab","risk","sim","stress","opt","bench","games"],SCENE_L={home:"Home",scan:"Scansione",map:"Mappa",lab:"Laboratorio",risk:"Rischio",sim:"Simulazioni",stress:"Stress test",opt:"Frontiera",bench:"Benchmark",games:"Giochi"};
let current="home";
function movePill(){
  const b=document.querySelector(`.dock button[data-go="${current}"]`),pill=$("#pillbg");if(!b||!pill)return;
  pill.style.width=b.offsetWidth+"px";pill.style.transform=`translateX(${b.offsetLeft-6}px)`;
}
function go(name,opts={}){
  if(!SCENES.includes(name)||(name===current&&!opts.force))return;
  const prev=$("#scene-"+current),nxt=$("#scene-"+name);current=name;
  document.querySelectorAll(".dock button[data-go]").forEach(b=>b.setAttribute("aria-current",String(b.dataset.go===name)));
  $("#sceneChip").textContent=SCENE_L[name];movePill();Morph.shape(name);
  document.body.dataset.scene=name;if(Morph.tint)Morph.tint(name);
  if(prev&&prev!==nxt){if(Morph.burst)Morph.burst(.9);warp(nxt);}
  if(prev&&prev!==nxt){
    if(HAS_G)G.to(prev,{opacity:0,y:-36,scale:.97,filter:"blur(8px)",duration:.35,ease:"power2.in",onComplete:()=>{prev.hidden=true;G.set(prev,{clearProps:"all"});}});
    else prev.hidden=true;
  }
  nxt.hidden=false;nxt.scrollTop=0;
  if(HAS_G){
    const items=nxt.querySelectorAll(".scene-title,.bento>*,.kpis,.next,#labEmpty");
    G.fromTo(items,{y:70,opacity:0,rotateX:-10,transformPerspective:900},{y:0,opacity:1,rotateX:0,duration:1,ease:"expo.out",stagger:.055,delay:prev&&prev!==nxt?.22:0,clearProps:"transform,opacity"});
  }
  onEnter(name);
}
/* salto tra le sezioni: linee di velocità dal centro, anello di luce e titolo che entra con un glitch */
const warpEl=document.createElement("div");warpEl.className="warp";warpEl.setAttribute("aria-hidden","true");warpEl.innerHTML="<i class='w-lines'></i><i class='w-ring'></i><i class='w-flash'></i>";document.body.appendChild(warpEl);
function warp(nxt){
  if(REDUCE||!HAS_G)return;
  warpEl.classList.remove("go");void warpEl.offsetWidth;warpEl.classList.add("go");
  clearTimeout(warp.t);warp.t=setTimeout(()=>warpEl.classList.remove("go"),1100);
  const h=nxt&&nxt.querySelector(".scene-title h2");
  if(h){h.classList.remove("glitch");void h.offsetWidth;h.classList.add("glitch");setTimeout(()=>h.classList.remove("glitch"),900);}
}
function onEnter(name){
  quantaScene(name);
  if(name==="scan"&&!S.scanPlayed)setTimeout(playScan,HAS_G?450:0);
  if(name==="risk")renderRisk();
  if(name==="sim")renderSim();
  if(name==="stress")renderStress();
  if(name==="opt")renderOpt();
  if(name==="bench")renderBench();
  if(name==="games")renderGames();
  if(name==="lab"&&S.lab&&!S.labFx.done){S.labFx.done=true;setTimeout(()=>{countAll();drawChart(true);if(S.corrView==="net")buildNet();},HAS_G?380:0);}
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-go]");if(!b||b.disabled||b.classList.contains("off"))return;go(b.dataset.go);});
window.addEventListener("resize",movePill);
document.addEventListener("keydown",e=>{
  if(e.target.closest&&e.target.closest("input,select,textarea")||$("#drawer").classList.contains("open"))return;
  const i=SCENES.indexOf(current);
  if(e.key==="ArrowRight"&&i<SCENES.length-1){const n=SCENES[i+1];if(!((n==="lab"||n==="risk"||n==="sim"||n==="stress"||n==="opt"||n==="bench")&&!S.lab))go(n);}
  if(e.key==="ArrowLeft"&&i>0)go(SCENES[i-1]);
});

/* ---------- Cursore, luce sulle tessere, inclinazione 3D ---------- */
if(FINE&&!REDUCE){
  document.body.classList.add("has-cur");
  const cur=$("#cur"),ring=cur.querySelector(".r"),dot=cur.querySelector(".d");
  let mx=-100,my=-100,rx=-100,ry=-100;
  window.addEventListener("pointermove",e=>{mx=e.clientX;my=e.clientY;dot.style.transform=`translate(${mx}px,${my}px)`;
    cur.classList.toggle("big",!!e.target.closest("a,button,label,select,[data-rc],.net canvas,.drop"));},{passive:true});
  const loop=()=>{rx+=(mx-rx)*.18;ry+=(my-ry)*.18;ring.style.transform=`translate(${rx}px,${ry}px)`;requestAnimationFrame(loop);};loop();
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
  G.fromTo("#scene-home .bento>*:not(.hero-tile)",{y:80,opacity:0,rotateX:-12,transformPerspective:900},{y:0,opacity:1,rotateX:0,duration:1.1,ease:"expo.out",stagger:.07,delay:.25,clearProps:"transform,opacity"});
  G.from(".dock",{y:120,duration:1,ease:"expo.out",delay:.5});
  G.from(".topbar",{y:-60,opacity:0,duration:.9,ease:"expo.out",delay:.4});
}
if(HAS_G){
  /* Intro: contatore a tutto schermo, poi la tenda si alza */
  const ld=document.createElement("div");ld.className="loader";ld.setAttribute("aria-hidden","true");
  ld.innerHTML=`<div class="ld-top"><span>Portfolio OS</span><span>Avvio del sistema</span></div><div><div class="ld-mid"><div class="ld-num">000</div><ul class="ld-log"><li>Lettura delle celle</li><li>Collegamento alle IA</li><li>Dati BCE e prezzi</li><li>Particelle pronte</li></ul></div><div class="ld-bar"><i></i></div></div>`;
  document.body.appendChild(ld);
  const lis=ld.querySelectorAll("li"),num=ld.querySelector(".ld-num"),bar=ld.querySelector(".ld-bar i"),o={v:0};
  G.timeline({onComplete:()=>ld.remove()})
    .to(o,{v:100,duration:1.6,ease:"power2.inOut",onUpdate:()=>{const v=Math.round(o.v);num.textContent=String(v).padStart(3,"0");bar.style.width=v+"%";lis.forEach((li,i)=>li.classList.toggle("on",v>=(i+1)*24));}})
    .to(ld,{clipPath:"circle(0% at 50% 100%)",duration:1.1,ease:"expo.inOut"},"+=.1")
    .add(heroIntro,"-=.6");
}

/* ---------- Oggetto di particelle che si trasforma a ogni scena ---------- */
const Morph={on:false,shape(){},cur:{x:0,y:0,s:1,a:1},goal:{x:0,y:0,s:1,a:1},mx:0,my:0,vis:true};
function morphPlace(name){
  const narrow=window.innerWidth<820;
  const P={home:narrow?{x:0,y:.6,s:.85,a:.45}:{x:1.5,y:.05,s:1.4,a:.62},scan:narrow?{x:0,y:2.6,s:.6,a:.22}:{x:3.4,y:1.4,s:.72,a:.34},map:narrow?{x:0,y:2.6,s:.6,a:.22}:{x:3.6,y:-1.1,s:.7,a:.3},lab:{x:0,y:0,s:1.3,a:.16},risk:narrow?{x:0,y:2.4,s:.6,a:.22}:{x:3.3,y:-1.3,s:.72,a:.32},sim:narrow?{x:0,y:2.4,s:.6,a:.22}:{x:3.2,y:-1.2,s:.75,a:.3},stress:narrow?{x:0,y:2.4,s:.6,a:.22}:{x:3.2,y:-1.3,s:.75,a:.3},opt:narrow?{x:0,y:2.4,s:.6,a:.22}:{x:3.2,y:-1.2,s:.75,a:.3},bench:narrow?{x:0,y:2.4,s:.6,a:.22}:{x:3.2,y:-1.2,s:.75,a:.3},games:narrow?{x:0,y:2.2,s:.65,a:.3}:{x:3,y:-1,s:.85,a:.45}};
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
  const TINT={risk:[1,.48,.24],sim:[.28,.9,1],stress:[1,.76,.29],opt:[1,.48,.85],bench:[.36,.94,.65],games:[.48,.64,1]};
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

/* ---------- Caricamento ---------- */
function load(sheets,source,fromUser){
  S.source=source;S.raw=sheets.map(s=>s.aoa);
  S.sheets=sheets.map(s=>P.analyzeSheet(s.name,s.aoa));
  S.sheetIdx=S.sheets.reduce((b,s,i)=>s.score>S.sheets[b].score?i:b,0);
  initRoles();hideLab();$("#fileErr").hidden=true;S.scanPlayed=false;resetAI();
  renderImport(false);
  morphData();
  if(fromUser){S.scanPlayed=false;go("scan",{force:true});}
  if(source.kind!=="rebuilt"){S.portfolio=null;S.tx=detectTx(sheets);}
  /* file "tracker" (versamenti, quote, valori) o con molti fogli: prima l'IA capisce che file è, poi eventualmente ricostruisce con i prezzi veri */
  if(fromUser&&source.kind==="file"&&aiAuto()){const tracker=S.sheets.some(s=>s.tracker);if(S.ds&&S.ds.ok&&!tracker&&S.sheets.length<3)requestFix();else requestUnderstand();}
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
    }else if(["xlsx","xls","xlsm"].includes(ext)){
      if(!window.XLSX)throw new Error("noxlsx");
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:"array",cellDates:true,cellFormula:false,cellHTML:false,bookVBA:false});
      sheets=wb.SheetNames.map(n=>({name:n,aoa:XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:null,blankrows:true})}));
    }else{showError(`Il formato .${ext} non è supportato. Usa .xlsx, .xls o .csv.`);return;}
    if(!sheets.some(s=>s.aoa.length)){showError("Il file è vuoto.");return;}
    load(sheets,{name:file.name,size:file.size,kind:"file"},true);
  }catch(e){showError(e.message==="noxlsx"?"Il lettore Excel non si è caricato. Ricarica la pagina oppure salva il file come CSV.":"Non riesco a leggere il file. Se è protetto da password o danneggiato, salvalo di nuovo come .xlsx o .csv.");}
}
const drop=$("#drop");
["dragenter","dragover"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("over");void 0;}));
["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("over");void 0;}));
drop.addEventListener("drop",e=>handleFile(e.dataTransfer.files[0]));
window.addEventListener("dragover",e=>{if([...(e.dataTransfer?e.dataTransfer.types:[])].includes("Files"))void 0;});
window.addEventListener("dragleave",e=>{if(!e.relatedTarget)void 0;});
$("#file").addEventListener("change",e=>{handleFile(e.target.files[0]);e.target.value="";});
$("#sampleBtn").addEventListener("click",()=>load(P.sampleSheets(),{name:"esempio_portafoglio.xlsx",size:0,kind:"sample"},true));

/* ---------- Import ---------- */
const an=()=>S.sheets[S.sheetIdx];
const needCount=()=>an().cols.filter(c=>S.roles[c.idx]==null).length;
function renderImport(animate){
  const A=an();S.ds=P.buildDataset(A,S.roles);
  $("#dsName").textContent=S.source.name;
  $("#dsChip").innerHTML=S.source.kind==="sample"?`<span class="chip sample"><i></i>Esempio · dati sintetici</span>`:"";
  renderScan(A,animate);renderLog(A,S.ds,animate);renderSummary(A,S.ds);renderSheets();renderMapping(A);renderQuality(S.ds);renderCaps(S.ds);renderConfirm(S.ds);renderTicker();renderAI();
}
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
  const raw=S.raw[S.sheetIdx]||[],maxR=Math.min(raw.length,13);
  let width=0;for(let r=0;r<maxR;r++)width=Math.max(width,(raw[r]||[]).length);
  width=Math.max(1,Math.min(width,8));
  const colInfo=c=>{const col=A.cols.find(x=>x.idx===c);return col?{role:S.roles[c],known:true}:{role:null,known:false};};
  const L=i=>{let s="";i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;};
  let h=`<div class="colh" style="position:sticky;left:0;z-index:1"></div>`;
  for(let c=0;c<width;c++){const ci=colInfo(c),rc=ci.role?ROLE_COLOR[ci.role]:ci.known?"var(--warn)":"var(--faint)";h+=`<div class="colh" style="--rc:${rc};--c:${c}">${L(c)}<span class="tagr">${ci.role?ROLE_TAG[ci.role]:ci.known?"?":"vuota"}</span></div>`;}
  for(let r=0;r<maxR;r++){
    const row=raw[r]||[],kind=A.headerRow>=0&&r<A.headerRow?"pre":r===A.headerRow?"hdr":"data";
    h+=`<div class="cell rn" style="--r:${r};--c:0">${r+1}</div>`;
    for(let c=0;c<width;c++){
      const ci=colInfo(c),rc=ci.role?ROLE_COLOR[ci.role]:ci.known?"var(--warn)":"transparent";
      const cls=["cell",kind==="pre"?"pre":kind==="hdr"?"hdr":"",kind==="data"&&ci.role==="ignore"?"ign":"",kind==="data"&&ci.known&&ci.role==null?"q":""].join(" ");
      const tx=esc(cellText(row[c]));
      h+=`<div class="${cls}" style="--r:${r};--c:${c};--rc:${kind==="pre"?"transparent":rc}" title="${tx}">${tx||"&nbsp;"}</div>`;
    }
  }
  h+=`<div class="scanline" aria-hidden="true"></div>`;
  $("#scanwrap").innerHTML=`<div class="scan${animate&&!REDUCE?" play":""}" style="grid-template-columns:44px repeat(${width},minmax(90px,auto))" role="img" aria-label="Anteprima delle prime righe del foglio con le colonne riconosciute">${h}</div>`;
}
function renderLog(A,ds,animate){
  const t0=performance.now(),L=[];
  L.push(["ok",`Letto «${S.source.name}» · ${S.sheets.length} ${S.sheets.length===1?"foglio":"fogli"}${S.source.size?" · "+fmtSize(S.source.size):""}`]);
  if(S.sheets.length>1)L.push(["ok",`Scelto il foglio «${A.name}»: è quello con più serie numeriche`]);
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
document.addEventListener("click",e=>{const b=e.target.closest("[data-sheet]");if(!b)return;undoAI(true);S.sheetIdx=+b.dataset.sheet;resetAI();initRoles();hideLab();renderImport(true);morphData();});
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
      <td><span class="conf ${conf}">${CONF_L[conf]}</span></td>
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
  btn.disabled=!!need||!ds.ok;
  if(need)t.innerHTML=`<b>${need} ${need===1?"colonna":"colonne"} da confermare</b> prima del laboratorio. <button type="button" class="btn sm" id="gotoNeed" style="margin-left:6px">Mostrami ${need===1?"quale":"quali"}</button>`;
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
function renderAI(){
  const el=$("#aiBody");if(!el)return;const a=S.ai;
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
  const t=e.target.closest("#aiRun,#aiApply,#aiDismiss,#aiUndo,#aiUnderstand,#undApply,#undRebuild,#undDismiss");if(!t)return;
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
  if(u.status==="rebuilding"){el.innerHTML=`<div class="thinking"><i></i><i></i><i></i><span>Scarico lo storico di ${u.posizioni.length} strumenti da Alpha Vantage e ricostruisco il file…</span></div>`;return;}
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
      <p class="caption">Il simbolo è proposto dall'IA (formato TICKER.BORSA: .LON Londra, .DEX Xetra). Correggilo se serve: lo storico arriva da Alpha Vantage e viene convertito in euro con il cambio BCE di fine mese.</p>
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
async function rebuildFromPrices(){
  const u=S.und;
  const pos=u.posizioni.map((p,i)=>({...p,simbolo:String(((document.getElementById("und-sym-"+i)||{}).value)||p.simbolo).trim().toUpperCase()})).filter(p=>p.simbolo);
  S.und={...u,posizioni:pos,status:"rebuilding",err:null};renderAI();
  try{
    // Un ETF per richiesta: la rete di Vercel conserva ogni serie 24 ore e la condivide tra tutti i visitatori.
    const series=[];
    for(const p of pos){
      const r=await fetch(`/api/prices?symbol=${encodeURIComponent(p.simbolo)}&v=2`,{signal:AbortSignal.timeout(30000)});
      const j=await r.json().catch(()=>({}));
      series.push(r.ok&&!j.error?j:{symbol:p.simbolo,error:j.error||`Errore ${r.status} per ${p.simbolo}.`});
    }
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
    const maps=ok.map(o=>{const c=ccyOf(o.s),pence=String(o.s.currency||"").toUpperCase()==="GBX",m=new Map();
      o.s.points.forEach(x=>{const k=x.d.slice(0,7);let v=x.v/(pence?100:1);if(c&&c!=="EUR"){const r=fxm[c].get(k);if(!(r>0))return;v/=r;}m.set(k,{d:x.d,v:+v.toFixed(6)});});return m;});
    const months=[...maps[0].keys()].filter(m=>maps.every(mp=>mp.has(m))).sort();
    if(months.length<13)throw new Error("Lo storico comune degli strumenti è troppo corto (meno di un anno). Prova a cambiare i simboli.");
    const aoa=[["Data",...ok.map(o=>o.p.ticker||o.p.nome)]];
    months.forEach(m=>{const d=maps[0].get(m).d;aoa.push([`${d.slice(8,10)}/${d.slice(5,7)}/${d.slice(0,4)}`,...maps.map(mp=>mp.get(m).v)]);});
    const orig=S.source.name,scartati=u.scartati||[];
    const pf={from:orig,positions:ok.map(o=>({...o.p,adjusted:o.s.adjusted,currency:o.s.currency||null})),missing:bad.map(b=>({nome:b.p.nome,simbolo:b.p.simbolo,err:b.s.error})),base:"EUR"};
    load([{name:"Prezzi mensili",aoa}],{name:`${orig.replace(/\.[^.]+$/,"")} · ricostruito`,size:0,kind:"rebuilt"},true);
    S.portfolio=pf;
    S.aiLog=[`File ricostruito: ${ok.length} ${ok.length===1?"strumento":"strumenti"}, ${months.length} mesi di prezzi da Alpha Vantage (${ok.every(o=>o.s.adjusted)?"chiusure rettificate per dividendi e frazionamenti":"chiusure"}), tutto convertito in euro con il cambio BCE di fine mese.`,
      `Valute di quotazione: ${ok.map(o=>`${o.p.ticker||o.p.nome} ${o.s.currency||"sconosciuta"}`).join(", ")}.`,
      ...(unknown.length?[`Valuta non determinata per ${unknown.join(", ")}: lasciata com'è, verifica il simbolo.`]:[]),
      ...pf.missing.map(m=>`Non scaricato: ${m.nome} (${m.simbolo}). ${m.err}`),...scartati.map(x=>"Scartato: "+x)];
    renderQuality(S.ds);
  }catch(e){
    S.und={...S.und,status:"ready",err:e instanceof TypeError?"Lo storico dei prezzi si scarica nella versione del sito pubblicata su Vercel.":String(e.message||e)};renderAI();
  }
}

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
function renderPortfolio(){
  const card=$("#pfCard");if(!card)return;
  const pf=S.portfolio,ds=S.ds,f=ds&&ds.freq?ds.freq.f:12;
  if(!pf||!S.lab){card.hidden=true;return;}
  card.hidden=false;
  const mm=macroFor(S.rfSrc),rf=mm?mm.rf:0;
  S.lab.pf=[["Pesi attuali","now"],["Pesi target","target"]].map(([label,k])=>{const w=pfWeights(k);if(!w)return null;const a=pfAsset(w,label);return {label,w,a,st:P.stats(a,f,ds.dates)};}).filter(Boolean);
  const cell=(key,val,cls="")=>`<button type="button" class="cellbtn ${cls}" data-rc="${key}">${val}</button>`;
  const rows=S.lab.pf.map((r,i)=>{const s=r.st;if(s.n<2)return "";const sh=s.vol>0?(s.mean*f-rf)/s.vol:NaN,real=mm?(1+s.cagr)/(1+mm.infl)-1:NaN;
    return `<tr><td><span class="an">${esc(r.label)}</span><span class="cl mono">${r.w.map((x,j)=>x>0?`${esc(ds.assets[j].name)} ${fmtPct(x,0)}`:"").filter(Boolean).join(" · ")}</span></td>
      <td>${cell("pf-cagr-"+i,fmtPct(s.cagr,1,true),s.cagr<0?"neg":"")}</td><td>${mm?cell("pf-real-"+i,fmtPct(real,1,true),real<0?"neg":""):"—"}</td><td>${cell("pf-vol-"+i,fmtPct(s.vol))}</td><td>${cell("pf-sharpe-"+i,fmtN(sh))}</td><td>${cell("pf-mdd-"+i,fmtPct(s.mdd),"neg")}</td></tr>`;}).join("");
  const P0=pf.positions.filter(p=>p.valore!=null),tot=P0.reduce((s,p)=>s+p.valore,0),tsum=P0.reduce((s,p)=>s+(p.pesoTarget||0),0);
  let reb="";
  if(P0.length&&tot>0&&tsum>0){
    const tw=p=>(p.pesoTarget||0)/tsum,T2=Math.max(...P0.filter(p=>tw(p)>0).map(p=>p.valore/tw(p)));
    reb=`<h3 style="font-size:1.1rem;margin-top:6px">Ribilanciamento verso i pesi target</h3>
    <div class="tablewrap"><table class="mt"><thead><tr><th>Strumento</th><th>Valore</th><th>Peso attuale</th><th>Peso target</th><th>Compra / vendi</th><th>Solo acquisti</th></tr></thead><tbody>
    ${P0.map(p=>{const d=tw(p)*tot-p.valore,b=tw(p)*T2-p.valore;return `<tr><td><span class="an">${esc(p.ticker||p.nome)}</span></td><td class="mono">${fmtN(p.valore)} €</td><td class="mono">${fmtPct(p.valore/tot,1)}</td><td class="mono">${fmtPct(tw(p),1)}</td><td class="mono ${d<0?"neg":""}">${d>=0?"+":""}${fmtN(d)} €</td><td class="mono">${b>0.005?"+"+fmtN(b)+" €":"—"}</td></tr>`;}).join("")}
    <tr><td><b>Totale</b></td><td class="mono"><b>${fmtN(tot)} €</b></td><td></td><td></td><td class="mono">0,00 €</td><td class="mono"><b>+${fmtN(T2-tot)} €</b></td></tr>
    </tbody></table></div>
    <p class="caption">"Compra / vendi" riporta il portafoglio di oggi ai pesi target senza aggiungere soldi. "Solo acquisti" indica quanto versare, e in cosa, per arrivarci senza vendere nulla.</p>`;
  }
  card.innerHTML=`<div class="head"><h3>Il tuo portafoglio</h3><span class="chip hist"><i></i>pesi dal file «${esc(pf.from)}»</span></div>
    <div class="tablewrap"><table class="mt"><thead><tr><th>Portafoglio</th><th>Rend. annuo</th><th>Rend. reale</th><th>Volatilità</th><th>Sharpe</th><th>Max drawdown</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="caption">Ipotesi: portafoglio ribilanciato ogni mese ai pesi indicati, sullo storico di ${ds.nObs} mesi. Prezzi nella valuta di quotazione di ciascun ETF, non convertiti in euro.${pf.missing.length?` Esclusi perché senza prezzi: ${pf.missing.map(m=>esc(m.nome)).join(", ")}.`:""}</p>${reb}`;
}

/* ---------- Laboratorio ---------- */
function hideLab(){
  setTimeout(renderLabs,0);
  disposeNet();S.lab=null;
  $("#lab").hidden=true;$("#labEmpty").hidden=false;$("#navLab").classList.add("off");$("#navRisk").classList.add("off");$("#navSim").classList.add("off");$("#navStress").classList.add("off");$("#navOpt").classList.add("off");$("#navBench").classList.add("off");S.risk=null;S.mc=null;S.stress=null;S.opt=null;S.optW=null;
}
function showLab(instant){
  setTimeout(renderLabs,0);
  const ds=S.ds,f=ds.freq.f;
  S.lab={st:ds.assets.map(a=>P.stats(a,f,ds.dates)),W:ds.assets.map(a=>P.wealth(a,ds.dates.length)),C:ds.assets.map(a=>ds.assets.map(b=>P.corr(a,b)))};
  S.labFx={};
  $("#lab").hidden=false;$("#labEmpty").hidden=true;$("#navLab").classList.remove("off");$("#navRisk").classList.remove("off");$("#navSim").classList.remove("off");$("#navStress").classList.remove("off");$("#navOpt").classList.remove("off");$("#navBench").classList.remove("off");S.mc=null;S.mcIn=null;S.stress=null;S.st=null;S.opt=null;S.opIn=null;S.optW=null;if(S.riskW==="opt")S.riskW=null;
  if(!S.macro||S.macro.status!=="ready"||S.macro.key!==ym(ds.dates[0])+ym(ds.dates[ds.dates.length-1]))S.macro=null;
  renderLab();reveal($("#lab"));
  if(!S.macro)fetchMacro().then(()=>{if(S.macro)S.macro.key=ym(ds.dates[0])+ym(ds.dates[ds.dates.length-1]);});
  if(!HAS_G){countAll();drawChart(false);if(S.corrView==="net")buildNet();S.labFx.done=true;}
  go("lab",{force:true});
}
function countAll(){
  document.querySelectorAll("[data-count]").forEach(el=>{
    const to=+el.dataset.count;if(REDUCE||!HAS_G){el.textContent=to.toLocaleString("it-IT");return;}
    const o={v:0};G.to(o,{v:to,duration:1.4,ease:"power3.out",onUpdate:()=>{el.textContent=Math.round(o.v).toLocaleString("it-IT");}});
  });
}
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
  if(S.lab){renderMacro();renderMetrics();renderPortfolio();renderReal();if(current==="risk")renderRisk();}
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
document.addEventListener("click",e=>{const b=e.target.closest("[data-rf]");if(!b)return;S.rfSrc=b.dataset.rf;renderMacro();renderMetrics();renderPortfolio();renderReal();if(current==="risk")renderRisk();});
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
      <td>${cell("vol-"+i,fmtPct(s.vol))}</td><td>${cell("sharpe-"+i,fmtN(sh))}</td>
      <td>${cell("mdd-"+i,fmtPct(s.mdd),"neg")}</td><td>${cell("worst-"+i,`${fmtPct(s.worst)} <span style="color:var(--faint)">${fmtDate(ds.dates[s.worstK],f)}</span>`)}</td><td class="mono">${s.n}</td></tr>`;}).join("")}</tbody>`;
  const cap=$("#metricsCap");if(cap)cap.textContent=mm?`Sharpe con tasso privo di rischio medio ${fmtPct(mm.rf,2)} (${mm.rfName}). Rendimento reale al netto dell'inflazione media ${fmtPct(mm.infl,2)}.`:"Sharpe con tasso privo di rischio 0%.";
}
function renderLab(){
  const ds=S.ds,L=S.lab,f=ds.freq.f;
  $("#labSource").textContent=`${S.source.name} · foglio «${an().name}» · ${ds.assets.length} asset dal ${fmtDate(ds.dates[0],f)} al ${fmtDate(ds.dates[ds.dates.length-1],f)}.`;
  $("#kpis").innerHTML=[
    ["Asset",ds.assets.length,true],["Osservazioni",ds.nObs,true],
    ["Periodo",`${fmtDate(ds.dates[0],f)} – ${fmtDate(ds.dates[ds.dates.length-1],f)}`],["Frequenza",ds.freq.label]
  ].map(k=>`<div class="kpi"><span class="eyebrow">${k[0]}</span><span class="v${k[2]?"":" txt"}"${k[2]&&HAS_G?` data-count="${k[1]}"`:""}>${esc(typeof k[1]==="number"?(k[2]&&HAS_G?0:k[1]).toLocaleString("it-IT"):k[1])}</span></div>`).join("");
  $("#legend").innerHTML=ds.assets.map((a,i)=>`<span><i style="background:${color(i)}"></i>${esc(a.name)}</span>`).join("");
  drawChart(false);
  renderMetrics();
  renderMacro();
  renderPortfolio();
  renderReal();
  renderMatrix();
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
function buildNet(){
  disposeNet();const ds=S.ds,L=S.lab;if(!ds||!L)return;
  const k=ds.assets.length,box=$("#net");
  if(k<2){netFallback("La rete richiede almeno due asset.");return;}
  if(!window.THREE){netFallback("La vista 3D non si è caricata: ti mostro la matrice.");return;}
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
  const labels=ds.assets.map((a,i)=>{const d=document.createElement("div");d.className="nl";d.innerHTML=`${esc(a.name.length>18?a.name.slice(0,17)+"…":a.name)}<small>σ ${fmtPct(L.st[i].vol)}</small>`;d.style.borderColor=NET_COLORS[i%6];box.appendChild(d);return d;});
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

/* ---------- Analisi del rischio (Modulo 2) ---------- */
const PER={252:"in un giorno",52:"in una settimana",12:"in un mese",4:"in un trimestre",1:"in un anno"};
const UNIT={252:["giorno","giorni"],52:["settimana","settimane"],12:["mese","mesi"],4:["trimestre","trimestri"],1:["anno","anni"]};
const unitN=(n,f)=>`${n} ${(UNIT[f]||["periodo","periodi"])[n===1?0:1]}`;
function wOpts(){return [["equal","Pesi uguali"]].concat(S.portfolio?[["now","Pesi attuali"],["target","Pesi target"]]:[]).concat(S.optW?[["opt","Ottimizzati"]]:[]);}
function riskWeights(){
  const ds=S.ds,k=ds.assets.length;
  if(S.riskW==="opt"&&S.optW&&S.optW.w.length===ds.assets.length)return {w:S.optW.w,label:`pesi ottimizzati (${S.optW.label})`};
  if(S.portfolio&&(S.riskW==="now"||S.riskW==="target")){const w=pfWeights(S.riskW==="target"?"target":"now");if(w)return {w,label:S.riskW==="target"?"pesi target":"pesi attuali"};}
  return {w:ds.assets.map(()=>1/k),label:"pesi uguali"};
}
function renderRisk(){
  const box=$("#riskBox"),empty=$("#riskEmpty");
  if(!S.lab||!S.ds||!S.ds.ok){box.hidden=true;empty.hidden=false;$("#riskW").innerHTML="";return;}
  box.hidden=false;empty.hidden=true;
  if(!S.riskW)S.riskW=S.portfolio?"now":"equal";
  const ds=S.ds,f=ds.freq.f,mm=macroFor(S.rfSrc),rf=mm?mm.rf:0,{w,label}=riskWeights();
  const pa=pfAsset(w,"Portafoglio"),PR=P.riskStats(pa.ret,f,rf),PS=P.stats(pa,f,ds.dates);
  const AR=ds.assets.map(a=>P.riskStats(a.ret,f,rf)),cov=P.covMatrix(ds.assets),RC=P.riskContrib(w,cov.C,f);
  S.risk={w,wLabel:label,pa,PR,PS,AR,cov,RC,rf,mm};
  const opts=wOpts();
  $("#riskW").innerHTML=opts.map(o=>`<button type="button" data-rw="${o[0]}" aria-pressed="${S.riskW===o[0]}">${o[1]}</button>`).join("");
  $("#riskSub").textContent=`Portafoglio con ${label}, ribilanciato ogni periodo, su ${unitN(PR.n||0,f)} di dati confermati.`;
  if(!PR.n||PR.n<6){$("#riskKpis").innerHTML=`<div class="kpi"><span class="eyebrow">Dati insufficienti</span><span class="v txt">Servono almeno 6 periodi comuni a tutti gli asset.</span>${rebuildHint()}</div>`;return;}
  const per=PER[f]||"in un periodo",btn=(key,val)=>`<button type="button" class="v" data-rc="${key}">${val}</button>`;
  $("#riskKpis").innerHTML=[
    ["VaR 95%",btn("rk-var95-p",fmtPct(-PR.var95,1)),`la perdita ${per} superata solo 1 volta su 20`],
    ["CVaR 95%",btn("rk-cvar95-p",fmtPct(-PR.cvar95,1)),`la perdita media in quei casi peggiori`],
    ["Sortino",btn("rk-sortino-p",fmtN(PR.sortino)),`rendimento per unità di rischio al ribasso`],
    ["Drawdown più lungo",btn("rk-ddlen-p",unitN(PR.longest,f)),PR.ongoing?"non ancora recuperato":`sotto il massimo, poi recuperato`]
  ].map(k=>`<div class="kpi"><span class="eyebrow">${k[0]}</span>${k[1]}<span class="sub">${k[2]}</span></div>`).join("");
  drawHist(PR,f);drawContrib();drawUnderwater(PR,f);renderRiskTable();renderRiskPro();
  if(current==="risk")Morph.shape("risk");
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-rw]");if(!b)return;S.riskW=b.dataset.rw;renderRisk();if(current==="sim")renderSim();if(current==="stress")renderStress();if(current==="bench")renderBench();});
function drawHist(PR,f){
  const s=PR.sorted,B=28,lo=s[0],hi=s[s.length-1],span=(hi-lo)||1,cnt=new Array(B).fill(0);
  s.forEach(x=>{cnt[Math.min(B-1,Math.floor((x-lo)/span*B))]++;});
  const VW=640,VH=290,ml=34,mr=12,mt=26,mb=30,iw=VW-ml-mr,ih=VH-mt-mb,mx=Math.max(...cnt),X=v=>ml+(v-lo)/span*iw,bw=iw/B;
  let g="";
  for(let t=0;t<=4;t++){const y=mt+ih-ih*t/4;g+=`<line x1="${ml}" x2="${VW-mr}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${ml-6}" y="${y+4}" text-anchor="end">${Math.round(mx*t/4)}</text>`;}
  cnt.forEach((c,b)=>{if(!c)return;const x0=ml+b*bw,top=lo+(b+1)*span/B,h=c/mx*ih,bad=top<=-PR.var95+1e-12;
    g+=`<rect class="grow" style="--k:${b}" x="${(x0+1).toFixed(1)}" y="${(mt+ih-h).toFixed(1)}" width="${(bw-2).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${bad?"var(--bad)":"var(--c2)"}" opacity="${bad?.95:.75}"><title>${c} ${c===1?"periodo":"periodi"} tra ${fmtPct(lo+b*span/B,1)} e ${fmtPct(top,1)}</title></rect>`;});
  const tk=niceTicks(lo,hi,5).filter(v=>v>=lo&&v<=hi);
  tk.forEach(v=>{g+=`<text x="${X(v).toFixed(1)}" y="${VH-8}" text-anchor="middle">${fmtPct(v,0)}</text>`;});
  if(lo<0&&hi>0)g+=`<line x1="${X(0)}" x2="${X(0)}" y1="${mt}" y2="${mt+ih}" stroke="var(--muted)" stroke-dasharray="2 4"/>`;
  const xv=X(-PR.var95),xc=X(-PR.cvar95);
  g+=`<line x1="${xv}" x2="${xv}" y1="${mt-6}" y2="${mt+ih}" stroke="var(--lime)" stroke-width="2" stroke-dasharray="5 4"/><text x="${xv+6}" y="${mt+6}" style="fill:var(--fg);font-weight:600">VaR ${fmtPct(-PR.var95,1)}</text>`;
  g+=`<line x1="${xc}" x2="${xc}" y1="${mt+18}" y2="${mt+ih}" stroke="var(--bad)" stroke-width="2"/><text x="${xc+6}" y="${mt+30}" style="fill:var(--bad);font-weight:600">CVaR ${fmtPct(-PR.cvar95,1)}</text>`;
  $("#riskHist").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Istogramma dei rendimenti di periodo del portafoglio">${g}</svg>`;
  $("#histUnit").textContent=`rendimenti ${S.ds.freq.adj} · ${PR.n} osservazioni`;
  $("#histCap").textContent=`In rosso i ${PR.tail95} ${UNIT[f]?UNIT[f][1]:"periodi"} peggiori (il 5%). Asimmetria ${fmtN(PR.skew)}, curtosi in eccesso ${fmtN(PR.kurt)}: ${PR.kurt>1?"le perdite estreme sono più frequenti che in una distribuzione normale.":"code vicine a quelle di una distribuzione normale."}`;
}
/* Qualità statistica: quanto sono affidabili i numeri del rischio */
function renderRiskPro(){
  const R=S.risk,PR=R.PR,f=S.ds.freq.f,el=$("#riskPro");if(!el||!PR.n||PR.n<6)return;
  const win={252:250,52:104,12:60,4:20,1:10}[f]||60;R.BT=P.varBacktest(R.pa.ret,win,.05);
  const c=(k,v,cl="")=>`<button type="button" class="cellbtn ${cl}" data-rc="rk-${k}-p">${v}</button>`,bt=R.BT;
  const sig=PR.srLo>0?"positivo con il 95% di confidenza":PR.srHi<0?"negativo con il 95% di confidenza":"non distinguibile da zero con questi dati";
  el.innerHTML=`<div class="head"><div><span class="eyebrow">Portafoglio · ${R.wLabel}</span><h3 style="margin-top:4px">Quanto sono affidabili questi numeri</h3></div><span class="chip hist"><i></i>statistica</span></div>
    <div class="pro-grid">
      <div class="pro"><span class="eyebrow">Sharpe e incertezza</span>
        <div class="pro-v">${c("sr",fmtN(PR.srAnn))}<small>IC 95%: ${fmtN(PR.srLo)} – ${fmtN(PR.srHi)}</small></div>
        <div class="pro-bar" title="Scala da −1 a 3: la riga sottile è lo zero, la barra viola l'intervallo di confidenza, il segno lime lo Sharpe stimato"><i style="left:${Math.max(0,Math.min(100,(PR.srLo+1)/4*100))}%;width:${Math.max(1,Math.min(100,(PR.srHi-PR.srLo)/4*100))}%"></i><b style="left:${Math.max(0,Math.min(100,(PR.srAnn+1)/4*100))}%"></b><em style="left:25%"></em></div>
        <p>Su ${unitN(PR.n,f)} lo Sharpe è <b>${sig}</b>. Probabilità che sia davvero sopra zero: ${c("psr",PR.psr>.999?"> 99,9%":fmtPct(PR.psr,1))}.</p></div>
      <div class="pro"><span class="eyebrow">VaR 95% · tre metodi</span>
        <table class="mt mc-t pro-t"><tbody><tr><td>Storico</td><td>${c("var95",fmtPct(-PR.var95,1),"neg")}</td></tr><tr><td>Normale</td><td>${c("vpar",fmtPct(-PR.varParam95,1),"neg")}</td></tr><tr><td>Cornish-Fisher</td><td>${c("vcf",fmtPct(-PR.varCF95,1),"neg")}</td></tr></tbody></table>
        <p>${PR.varCF95>PR.varParam95*1.1?"Le code sono più spesse di una normale: il metodo normale sottostima la perdita.":"Le tre stime sono vicine: la distribuzione è poco lontana da una normale."}</p></div>
      <div class="pro"><span class="eyebrow">Il VaR ha funzionato? · Kupiec</span>
        ${bt.error?`<p>${esc(bt.error)}</p>`:`<div class="pro-v">${c("bt",`${bt.x} / ${bt.n}`)}<small>superamenti, attesi ${fmtN(bt.expected,1)}</small></div>
        <p class="${bt.ok?"up":"dn"}" style="font-weight:700">${bt.ok?"✓ Modello non rifiutato":"✗ Modello rifiutato"} (p = ${fmtN(bt.p,2)})</p>
        <p>VaR stimato ogni ${UNIT[f]?UNIT[f][0]:"periodo"} sui ${unitN(win,f)} precedenti e confrontato con la perdita successiva, fuori campione.</p>`}</div>
      <div class="pro"><span class="eyebrow">Drawdown in profondità</span>
        <table class="mt mc-t pro-t"><tbody><tr><td>Ulcer index</td><td>${c("ulcer",fmtPct(PR.ulcer,1))}</td></tr><tr><td>Tempo sott'acqua</td><td>${c("uw",fmtPct(PR.underwater,0))}</td></tr><tr><td>Calo medio</td><td>${c("uw",fmtPct(PR.avgDD,1),"neg")}</td></tr><tr><td>Omega</td><td>${c("omega",fmtN(PR.omega))}</td></tr></tbody></table></div>
    </div>`;
}
function drawContrib(){
  const R=S.risk,ds=S.ds,maxv=Math.max(...R.w,...R.RC.pct.map(x=>Math.max(0,x)),.01);
  const rows=ds.assets.map((a,i)=>R.w[i]>0?`<div class="cbar"><span class="nm">${esc(a.name)}</span><div class="bars">
    <div class="b w"><i data-w="${(R.w[i]/maxv*100).toFixed(1)}"></i><button type="button" data-rc="rk-rc-${i}" tabindex="-1">${fmtPct(R.w[i],0)}</button></div>
    <div class="b r"><i data-w="${(Math.max(0,R.RC.pct[i])/maxv*100).toFixed(1)}"></i><button type="button" data-rc="rk-rc-${i}">${fmtPct(R.RC.pct[i],0)}</button></div></div></div>`:"").join("");
  $("#riskContrib").innerHTML=`<div class="leg2"><span><i style="background:var(--c2)"></i>peso nel portafoglio</span><span><i style="background:var(--lime)"></i>quota del rischio</span></div>${rows}`;
  requestAnimationFrame(()=>requestAnimationFrame(()=>document.querySelectorAll("#riskContrib i[data-w]").forEach(el=>{el.style.width=el.dataset.w+"%";})));
  $("#riskConc").innerHTML=`<div class="conc">
    <button type="button" data-rc="rk-volp-p"><b>${fmtPct(R.RC.volP,1)}</b><span>volatilità del portafoglio</span></button>
    <button type="button" data-rc="rk-neff-p"><b>${fmtN(R.RC.neff,1)}</b><span>asset effettivi su ${ds.assets.length}</span></button>
    <button type="button" data-rc="rk-div-p"><b>${fmtN(R.RC.divRatio)}×</b><span>rapporto di diversificazione</span></button></div>`;
}
function drawUnderwater(PR,f){
  const ds=S.ds,n=ds.dates.length,dd=PR.dd,VW=900,VH=230,ml=50,mr=14,mt=14,mb=28,iw=VW-ml-mr,ih=VH-mt-mb;
  const lo=Math.min(-.01,PR.mdd*1.12),X=i=>ml+(n>1?i/(n-1):0)*iw,Y=v=>mt+(v/lo)*ih;
  let g="";niceTicks(lo,0,4).filter(v=>v>=lo&&v<=0).forEach(v=>{g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)"/><text x="${ml-8}" y="${(Y(v)+4).toFixed(1)}" text-anchor="end">${fmtPct(v,0)}</text>`;});
  const stepY=ds.years>24?5:ds.years>12?3:ds.years>6?2:1;
  ds.dates.forEach((d,i)=>{const y=d.getUTCFullYear();if(y%stepY===0&&(i===0||ds.dates[i-1].getUTCFullYear()!==y)){const x=X(i);if(x>ml+12&&x<VW-mr-12)g+=`<text x="${x.toFixed(1)}" y="${VH-8}" text-anchor="middle">${y}</text>`;}});
  let line="",fi=-1,li=-1;dd.forEach((v,i)=>{if(Number.isFinite(v)){line+=(fi<0?"M":"L")+X(i).toFixed(1)+","+Y(v).toFixed(1);if(fi<0)fi=i;li=i;}});
  if(fi>=0){
    g+=`<path d="${line}L${X(li).toFixed(1)},${Y(0).toFixed(1)}L${X(fi).toFixed(1)},${Y(0).toFixed(1)}Z" fill="var(--bad)" opacity=".22" class="area"/>`;
    g+=`<path d="${line}" fill="none" stroke="var(--bad)" stroke-width="1.8" pathLength="1" class="draw" style="--k:0"/>`;
    if(PR.troughK!=null){const x=X(PR.troughK),y=Y(PR.mdd);g+=`<circle cx="${x}" cy="${y}" r="5" fill="var(--bad)"/><text x="${x+8}" y="${y+4}" style="fill:var(--fg);font-weight:600">${fmtPct(PR.mdd,1)} · ${fmtDate(ds.dates[PR.troughK],f)}</text>`;}
  }
  g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--muted)"/>`;
  $("#riskDD").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Drawdown del portafoglio nel tempo">${g}</svg>`;
  $("#ddCap").textContent=PR.troughK!=null?`Il calo peggiore è iniziato a ${fmtDate(ds.dates[PR.peakAtTrough],f)} e ha toccato il fondo a ${fmtDate(ds.dates[PR.troughK],f)}; ${PR.recK!=null?`è stato recuperato a ${fmtDate(ds.dates[PR.recK],f)}.`:"non è ancora stato recuperato."}`:"Nessun calo dal massimo nel periodo.";
}
function renderRiskTable(){
  const R=S.risk,ds=S.ds,f=ds.freq.f,cell=(k,v,c="")=>`<button type="button" class="cellbtn ${c}" data-rc="${k}">${v}</button>`;
  const row=(name,st,base,id,cls,sw)=>{if(!st.n||st.n<6)return `<tr><td>${name}</td><td colspan="9" style="text-align:left;color:var(--muted)">Dati insufficienti</td></tr>`;
    const cal=base.cagr/Math.abs(base.mdd);
    return `<tr class="${cls}"><td><span class="an">${sw}${name}</span></td><td>${cell(`rk-var95-${id}`,fmtPct(-st.var95,1),"neg")}</td><td>${cell(`rk-cvar95-${id}`,fmtPct(-st.cvar95,1),"neg")}</td><td>${cell(`rk-sortino-${id}`,fmtN(st.sortino))}</td><td>${cell(`rk-calmar-${id}`,fmtN(cal))}</td><td>${cell(`rk-pos-${id}`,fmtPct(st.pctPos,0))}</td><td>${cell(`rk-w12-${id}`,fmtPct(st.worst12,1),st.worst12<0?"neg":"")}</td><td>${cell(`rk-skew-${id}`,fmtN(st.skew))}</td><td>${cell(`rk-kurt-${id}`,fmtN(st.kurt))}</td><td>${cell(`rk-ddlen-${id}`,unitN(st.longest,f))}</td></tr>`;};
  const w12=UNIT[f]?`Peggiori ${unitN(Math.round(f),f)}`:"Peggiore anno";
  $("#riskTable").innerHTML=`<thead><tr><th>Asset</th><th>VaR 95%</th><th>CVaR 95%</th><th>Sortino</th><th>Calmar</th><th>Periodi positivi</th><th>${w12}</th><th>Asimmetria</th><th>Curtosi</th><th>Drawdown più lungo</th></tr></thead><tbody>
    ${row("Portafoglio",R.PR,R.PS,"p","pf",`<i style="background:var(--lime)"></i>`)}
    ${ds.assets.map((a,i)=>row(esc(a.name),R.AR[i],S.lab.st[i],i,"",`<i style="background:${color(i)}"></i>`)).join("")}</tbody>`;
}
function riskReceipt(m,who){
  const R=S.risk,ds=S.ds,f=ds.freq.f,isP=who==="p",i=+who,st=isP?R.PR:R.AR[i],base=isP?R.PS:S.lab.st[i],name=isP?"Portafoglio":ds.assets[i].name,per=PER[f]||"in un periodo";
  const src=isP?"rₚ = Σ wᵢ · rᵢ   (ribilanciamento a ogni periodo)\n":"";
  const M={
    var95:{t:"VaR storico 95%",v:fmtPct(-st.var95,2),fx:"VaR₉₅ = − quantile al 5% dei rendimenti di periodo\n(interpolazione lineare tra i valori ordinati, nessuna ipotesi di normalità)",kv:[["Significato",`perdita ${per} superata solo nel 5% dei casi`],["Periodi oltre la soglia",st.tail95]]},
    cvar95:{t:"CVaR storico 95% (Expected Shortfall)",v:fmtPct(-st.cvar95,2),fx:"CVaR₉₅ = − media dei rendimenti ≤ quantile al 5%",kv:[["Significato","perdita media nei periodi peggiori"],["Periodi nella coda",st.tail95],["Soglia VaR",fmtPct(-st.var95,2)]]},
    sortino:{t:"Indice di Sortino",v:fmtN(st.sortino),fx:"Sortino = (r̄ · f − rf) / DD\nDD = √( Σ min(0, rᵢ − rf/f)² / n ) · √f",kv:[["Rendimento medio annualizzato",fmtPct(st.mean*f,2)],["Deviazione al ribasso",fmtPct(st.downDev,2)],["Tasso privo di rischio",R.mm?`${fmtPct(R.rf,2)} · ${R.mm.rfName}`:"0%"]]},
    calmar:{t:"Indice di Calmar",v:fmtN(base.cagr/Math.abs(base.mdd)),fx:"Calmar = CAGR / |Max drawdown|",kv:[["CAGR",fmtPct(base.cagr,2,true)],["Max drawdown",fmtPct(base.mdd,2)]]},
    pos:{t:"Periodi positivi",v:fmtPct(st.pctPos,1),fx:"quota dei periodi con rendimento maggiore di zero",kv:[]},
    w12:{t:"Peggiore finestra di un anno",v:fmtPct(st.worst12,2),fx:`Π (1 + rᵢ) − 1 su finestre mobili di ${unitN(st.win,f)}`,kv:[["Finestra che termina",st.worst12K!=null?fmtDate(ds.dates[st.worst12K],f):"—"],["Migliore finestra",st.best12K!=null?`${fmtPct(st.best12,2,true)} · ${fmtDate(ds.dates[st.best12K],f)}`:"—"]]},
    skew:{t:"Asimmetria",v:fmtN(st.skew),fx:"γ = m₃ / m₂^1,5   (momenti centrali dei rendimenti)\nnegativa = cadute estreme più frequenti dei rialzi estremi",kv:[]},
    kurt:{t:"Curtosi in eccesso",v:fmtN(st.kurt),fx:"κ = m₄ / m₂² − 3\npositiva = code più spesse di una distribuzione normale",kv:[]},
    ddlen:{t:"Drawdown più lungo",v:unitN(st.longest,f),fx:"periodi tra un massimo e il ritorno a quel livello",kv:[["Inizio",st.lStart!=null?fmtDate(ds.dates[st.lStart],f):"—"],["Fine",st.ongoing?"non ancora recuperato":st.lEnd!=null?fmtDate(ds.dates[st.lEnd],f):"—"]]},
    rc:{t:"Contributo al rischio",v:fmtPct(R.RC.pct[i],1),fx:"RCᵢ = wᵢ · (Σw)ᵢ / σₚ   (la somma dei contributi è σₚ)\nquota = RCᵢ / σₚ",kv:[["Peso nel portafoglio",fmtPct(R.w[i],1)],["Volatilità dell'asset",fmtPct(R.RC.sig[i],2)],["Volatilità del portafoglio",fmtPct(R.RC.volP,2)],["Periodi comuni usati",R.cov.common]]},
    volp:{t:"Volatilità del portafoglio",v:fmtPct(R.RC.volP,2),fx:"σₚ = √( wᵀ Σ w ) · √f\nΣ = matrice di covarianza sui periodi comuni",kv:[["Periodi comuni usati",R.cov.common]]},
    neff:{t:"Asset effettivi",v:fmtN(R.RC.neff,2),fx:"N_eff = 1 / Σ wᵢ²   (inverso dell'indice di Herfindahl)",kv:[["Indice di Herfindahl",fmtN(R.RC.hhi,3)],["Asset nel file",ds.assets.length]]},
    div:{t:"Rapporto di diversificazione",v:fmtN(R.RC.divRatio),fx:"DR = Σ wᵢ σᵢ / σₚ\n1 = nessun beneficio; più è alto, più la diversificazione riduce il rischio",kv:[["Volatilità del portafoglio",fmtPct(R.RC.volP,2)]]},
    sr:{t:"Sharpe con intervallo di confidenza",v:`${fmtN(st.srAnn)} (${fmtN(st.srLo)} – ${fmtN(st.srHi)})`,fx:"SR = (r̄ − rf/f) / s · √f\nVar(SR) = [1 + SR²/2 − γ₃·SR + (γ₄/4)·SR²] / (n − 1)   (Mertens 2002, SR di periodo)\nIC 95% = SR ± 1,96 · √Var · √f",kv:[["Errore standard (annuo)",fmtN(st.srSE,3)],["Asimmetria γ₃",fmtN(st.skew)],["Curtosi in eccesso γ₄",fmtN(st.kurt)],["Osservazioni",st.n]]},
    psr:{t:"Probabilistic Sharpe Ratio",v:fmtPct(st.psr,1),fx:"PSR = Φ( SR / σ(SR) )   (Bailey e López de Prado 2012)\nprobabilità che lo Sharpe vero sia maggiore di zero, tenendo conto di campione, asimmetria e code",kv:[["Sharpe annuo",fmtN(st.srAnn)],["Errore standard",fmtN(st.srSE,3)]]},
    vpar:{t:"VaR 95% parametrico (normale)",v:fmtPct(-st.varParam95,2),fx:"VaR = −(μ − 1,645 · σ)\nipotizza rendimenti a campana",kv:[["Media di periodo",fmtPct(st.mean,3)],["Deviazione standard",fmtPct(st.sd,3)]]},
    vcf:{t:"VaR 95% Cornish-Fisher",v:fmtPct(-st.varCF95,2),fx:"z_CF = z + (z² − 1)γ₃/6 + (z³ − 3z)γ₄/24 − (2z³ − 5z)γ₃²/36,  z = −1,645\nVaR = −(μ + z_CF · σ)   corregge la normale per asimmetria e code spesse",kv:[["z corretto",fmtN(st.zcf,3)],["Asimmetria γ₃",fmtN(st.skew)],["Curtosi in eccesso γ₄",fmtN(st.kurt)]]},
    bt:{t:"Backtest del VaR (test di Kupiec)",v:R.BT&&!R.BT.error?`${R.BT.x} superamenti su ${R.BT.n}`:"—",fx:"ogni periodo: VaR storico 95% stimato sui periodi precedenti (finestra mobile), poi confronto con la perdita reale\nLR = −2 ln[ (1−p)^(n−x) p^x ] + 2 ln[ (1−x/n)^(n−x) (x/n)^x ] ~ χ²(1)",kv:R.BT&&!R.BT.error?[["Attesi (5%)",fmtN(R.BT.expected,1)],["Frequenza osservata",fmtPct(R.BT.rate,1)],["Finestra di stima",unitN(R.BT.win,f)],["LR",fmtN(R.BT.lr,3)],["p-value",fmtN(R.BT.p,3)],["Esito",R.BT.ok?"il modello non è rifiutato al 5%":"rifiutato: il VaR storico sbaglia la frequenza delle perdite"]]:[["Nota",R.BT?R.BT.error:"—"]]},
    ulcer:{t:"Ulcer index",v:fmtPct(st.ulcer,2),fx:"UI = √( media(DDₜ²) )   (Martin 1987)\npesa di più i cali profondi e lunghi",kv:[["Pain index (calo medio, tutti i periodi)",fmtPct(st.pain,2)]]},
    uw:{t:"Tempo sott'acqua",v:fmtPct(st.underwater,0),fx:"quota dei periodi sotto il massimo precedente",kv:[["Calo medio quando sott'acqua",fmtPct(st.avgDD,2)],["Drawdown più lungo",unitN(st.longest,f)]]},
    omega:{t:"Omega ratio",v:fmtN(st.omega),fx:"Ω = Σ max(rᵢ − τ, 0) / Σ max(τ − rᵢ, 0),   τ = rf / f\nconfronta tutti i guadagni con tutte le perdite, senza ipotesi di normalità",kv:[["Soglia τ di periodo",fmtPct(st.mar,3)]]}
  }[m]||{t:m,v:"—",fx:"",kv:[]};
  const who2=m==="rc"?ds.assets[i].name:name;
  return {title:`${M.t} · ${who2}`,value:M.v,formula:src+M.fx,kv:[...M.kv,["Osservazioni",st.n],["Frequenza",`${ds.freq.label} · f = ${f}`],["Pesi del portafoglio",R.wLabel]]};
}

/* ---------- Simulazioni Monte Carlo (Modulo 3) ---------- */
const fmtEur=v=>Number.isFinite(v)?Math.round(v).toLocaleString("it-IT",{useGrouping:"always"})+" €":"—";
const fmtK=v=>!Number.isFinite(v)?"—":Math.abs(v)>=1e6?fmtN(v/1e6,1)+" mln":Math.abs(v)>=1e4?fmtN(v/1e3,0)+"k":fmtN(v,0);
const MC_M={boot:"Storico",block:"A blocchi",normal:"Normale"};
function simDefaults(){
  const mm=macroFor(S.rfSrc),pfv=S.portfolio?S.portfolio.positions.reduce((s,p)=>s+(p.valore||0),0):0,init=pfv>0?Math.round(pfv):10000,monthly=200,years=20;
  return {init,monthly,years,goal:Math.max(1000,Math.round((init+monthly*12*years)*1.5/10000)*10000),infl:mm?+(mm.infl*100).toFixed(2):2,inflSrc:mm?`media ${mm.cpiName}`:"ipotesi: nessun dato macro",costs:.2,method:"boot",n:2000,real:false};
}
function simInputs(){
  const I=S.mcIn,num=(id,d)=>{const v=parseFloat($(id).value);return Number.isFinite(v)?v:d;};
  I.init=Math.max(0,num("#mcInit",I.init));I.monthly=num("#mcMonthly",I.monthly);I.years=Math.max(1,Math.min(60,Math.round(num("#mcYears",I.years))));
  I.goal=Math.max(0,num("#mcGoal",I.goal));I.infl=Math.max(-5,Math.min(30,num("#mcInfl",I.infl)));I.costs=Math.max(0,Math.min(20,num("#mcCosts",I.costs)));
}
function fillSimForm(){
  const I=S.mcIn;$("#mcInit").value=I.init;$("#mcMonthly").value=I.monthly;$("#mcYears").value=I.years;$("#mcGoal").value=I.goal;$("#mcInfl").value=I.infl;$("#mcCosts").value=I.costs;$("#mcInflSrc").textContent=I.inflSrc;
}
function runSim(){
  const ds=S.ds,f=ds.freq.f,I=S.mcIn,{w,label}=riskWeights(),pa=pfAsset(w,"Portafoglio"),steps=I.years*f;
  const n=Math.max(200,Math.min(I.n,Math.floor(8e6/steps)));
  const R=P.monteCarlo({ret:pa.ret,f,years:I.years,initial:I.init,monthly:I.monthly,goal:I.goal,infl:I.infl/100,costs:I.costs/100,method:I.method,n,block:f,seed:20260101});
  R.wLabel=label;R.w=w;R.nAsked=I.n;R.histFrom=pa.ret.findIndex(Number.isFinite);
  S.mc=R;return R;
}
function renderSim(){
  const box=$("#simBox"),empty=$("#simEmpty");
  if(!S.lab||!S.ds||!S.ds.ok){box.hidden=true;empty.hidden=false;$("#simW").innerHTML="";return;}
  box.hidden=false;empty.hidden=true;
  if(!S.riskW)S.riskW=S.portfolio?"now":"equal";
  if(!S.mcIn){S.mcIn=simDefaults();fillSimForm();}
  const opts=wOpts();
  $("#simW").innerHTML=opts.map(o=>`<button type="button" data-rw="${o[0]}" aria-pressed="${S.riskW===o[0]}">${o[1]}</button>`).join("");
  document.querySelectorAll("#mcMethod [data-mcm]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mcm===S.mcIn.method)));
  document.querySelectorAll("#mcN [data-mcn]").forEach(b=>b.setAttribute("aria-pressed",String(+b.dataset.mcn===S.mcIn.n)));
  document.querySelectorAll("#mcReal [data-mcr]").forEach(b=>b.setAttribute("aria-pressed",String((b.dataset.mcr==="1")===S.mcIn.real)));
  const R=runSim();
  if(R.error){$("#mcKpis").innerHTML=`<div class="kpi"><span class="eyebrow">Dati insufficienti</span><span class="v txt">${esc(R.error)}</span>${rebuildHint()}</div>`;["#mcFan","#mcDist","#mcTable","#mcNotes","#mcLegend"].forEach(id=>$(id).innerHTML="");return;}
  const real=S.mcIn.real,pf=real?R.pFinalReal:R.pFinal,yrs=unitN(R.years,1),btn=(k,v)=>`<button type="button" class="v" data-rc="mc-${k}">${v}</button>`;
  $("#simSub").textContent=`${fmtN(R.n,0).replace(",00","")} percorsi di ${yrs} con ${R.wLabel}, ricampionando ${R.hist.m} rendimenti ${S.ds.freq.adj} del file.`;
  const k3=R.monthly<0&&R.depleted>0?["Capitale esaurito",btn("dep",fmtPct(R.depleted,0)),"dei percorsi finisce i soldi prima della fine"]:["Probabilità di perdita",btn("loss",fmtPct(R.probLoss,0)),`di finire sotto i ${fmtEur(R.invested)} versati`];
  $("#mcKpis").innerHTML=[
    [`Mediana dopo ${yrs}`,btn("med",fmtEur(pf[3])),real?"in euro di oggi, al netto dell'inflazione":"metà dei percorsi finisce sopra"],
    ["Che probabilità hai?",btn("goal",R.goal>0?fmtPct(real?R.probGoalReal:R.probGoal,0):"—"),R.goal>0?`di arrivare a ${fmtEur(R.goal)}${real?" in euro di oggi":""} · ±${fmtN(1.96*Math.sqrt((real?R.probGoalReal:R.probGoal)*(1-(real?R.probGoalReal:R.probGoal))/R.n)*100,1)} punti di errore di simulazione`:"imposta un obiettivo"],
    k3,
    ["Scenario sfavorevole",btn("p-0",fmtEur(pf[0])),"5 percorsi su 100 finiscono più in basso"]
  ].map(k=>`<div class="kpi"><span class="eyebrow">${k[0]}</span>${k[1]}<span class="sub">${k[2]}</span></div>`).join("");
  drawFan(R,real);drawDist(R,real);renderMcTable(R);renderMcNotes(R);
  if(current==="sim")Morph.shape("sim");
}
function drawFan(R,real){
  const F=R.fan,Y=F.length-1,key=real?"real":"nom",VW=900,VH=330,ml=62,mr=16,mt=16,mb=30,iw=VW-ml-mr,ih=VH-mt-mb;
  const inv=F.map(r=>real?r.invested/Math.pow(1+R.infl,r.y):r.invested);
  let hi=Math.max(...F.map(r=>r[key][6]),...inv,R.goal&&R.goal<Math.max(...F.map(r=>r[key][6]))*1.3?R.goal:0)*1.06;if(!(hi>0))hi=1;
  const X=y=>ml+(Y?y/Y:0)*iw,Yv=v=>mt+ih-Math.max(0,Math.min(1,v/hi))*ih;
  let g="";niceTicks(0,hi,5).filter(v=>v>=0&&v<=hi).forEach(v=>{g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Yv(v).toFixed(1)}" y2="${Yv(v).toFixed(1)}" stroke="var(--line)"/><text x="${ml-8}" y="${(Yv(v)+4).toFixed(1)}" text-anchor="end">${fmtK(v)}</text>`;});
  const step=Y>30?10:Y>12?5:Y>6?2:1;for(let y=0;y<=Y;y+=step)g+=`<text x="${X(y).toFixed(1)}" y="${VH-8}" text-anchor="middle">${y===0?"oggi":"+"+y+"a"}</text>`;
  const band=(a,b,op,k)=>{let d="";F.forEach((r,i)=>{d+=(i?"L":"M")+X(r.y).toFixed(1)+","+Yv(r[key][b]).toFixed(1);});for(let i=Y;i>=0;i--)d+="L"+X(F[i].y).toFixed(1)+","+Yv(F[i][key][a]).toFixed(1);return `<path d="${d}Z" fill="var(--c2)" opacity="${op}" class="area" style="animation-delay:${k}s"/>`;};
  const line=(arr,st)=>{let d="";arr.forEach((v,i)=>{d+=(i?"L":"M")+X(i).toFixed(1)+","+Yv(v).toFixed(1);});return `<path d="${d}" fill="none" ${st}/>`;};
  g+=band(0,6,.16,.2)+band(1,5,.18,.35)+band(2,4,.3,.5);
  g+=line(inv,`stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 5"`);
  if(R.goal>0&&R.goal<=hi)g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Yv(R.goal).toFixed(1)}" y2="${Yv(R.goal).toFixed(1)}" stroke="var(--warn)" stroke-width="1.5" stroke-dasharray="8 6"/><text x="${VW-mr-4}" y="${(Yv(R.goal)-7).toFixed(1)}" text-anchor="end" style="fill:var(--warn);font-weight:600">obiettivo ${fmtK(R.goal)}</text>`;
  g+=line(F.map(r=>r[key][3]),`stroke="var(--lime)" stroke-width="3" pathLength="1" class="draw" style="--k:0"`);
  const last=F[Y][key];g+=`<circle cx="${X(Y)}" cy="${Yv(last[3])}" r="5" fill="var(--lime)" class="endpt" style="--k:0"/>`;
  g+=`<line id="mcCursor" x1="0" x2="0" y1="${mt}" y2="${mt+ih}" stroke="var(--fg)" stroke-opacity=".35" visibility="hidden"/><rect x="${ml}" y="${mt}" width="${iw}" height="${ih}" fill="transparent" id="mcHit"/>`;
  $("#mcFan").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Ventaglio dei percorsi simulati: percentili del capitale anno per anno">${g}</svg><div class="tip" id="mcTip" hidden></div>`;
  $("#mcLegend").innerHTML=`<span><i style="background:var(--lime);height:3px"></i>mediana</span><span><i style="background:var(--c2);opacity:.6;height:10px"></i>metà centrale (25–75)</span><span><i style="background:var(--c2);opacity:.3;height:10px"></i>10–90 e 5–95</span><span><i style="background:var(--muted)"></i>soldi versati</span>${R.goal>0?`<span><i style="background:var(--warn)"></i>obiettivo</span>`:""}`;
  $("#mcFanCap").textContent=`Dopo ${unitN(R.years,1)}, 9 percorsi su 10 finiscono tra ${fmtEur(last[0])} e ${fmtEur(last[6])}${real?" (euro di oggi)":""}. La forma del ventaglio dipende dai rendimenti del file: un passato diverso darebbe un ventaglio diverso.`;
  const svg=$("#mcFan svg"),tip=$("#mcTip"),cur=$("#mcCursor");
  $("#mcHit").addEventListener("pointermove",e=>{
    const r=svg.getBoundingClientRect(),sx=(e.clientX-r.left)/r.width*VW,y=Math.max(0,Math.min(Y,Math.round((sx-ml)/iw*Y))),row=F[y][key],x=X(y);
    cur.setAttribute("x1",x);cur.setAttribute("x2",x);cur.setAttribute("visibility","visible");
    tip.hidden=false;tip.innerHTML=`<b>${y===0?"Oggi":`Dopo ${unitN(y,1)}`}</b>${[[6,"95°"],[5,"90°"],[3,"mediana"],[1,"10°"],[0,"5°"]].map(([q,l])=>`<div class="r"><span>${l}</span><b>${fmtEur(row[q])}</b></div>`).join("")}<div class="r"><span>versato</span><span>${fmtEur(inv[y])}</span></div>`;
    const px=x/VW*r.width;tip.style.left=Math.min(r.width-200,Math.max(0,px+14))+"px";tip.style.top="10px";
  });
  $("#mcHit").addEventListener("pointerleave",()=>{tip.hidden=true;cur.setAttribute("visibility","hidden");});
}
function drawDist(R,real){
  const vals=real?R.finalReal:R.final,goal=R.goal,cap=quantileArr(vals,.99),lo=vals[0],span=(cap-lo)||1,B=32,cnt=new Array(B).fill(0);
  vals.forEach(v=>{cnt[Math.max(0,Math.min(B-1,Math.floor((Math.min(v,cap)-lo)/span*B)))]++;});
  const VW=640,VH=270,ml=34,mr=12,mt=24,mb=30,iw=VW-ml-mr,ih=VH-mt-mb,mx=Math.max(...cnt),bw=iw/B,X=v=>ml+(v-lo)/span*iw;
  let g="";
  cnt.forEach((c,b)=>{if(!c)return;const x0=ml+b*bw,top=lo+(b+1)*span/B,h=c/mx*ih,ok=goal>0&&lo+b*span/B>=goal;
    g+=`<rect class="grow" style="--k:${b}" x="${(x0+1).toFixed(1)}" y="${(mt+ih-h).toFixed(1)}" width="${Math.max(1,bw-2).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${ok?"var(--lime)":"var(--c2)"}" opacity="${ok?.9:.7}"><title>${c} percorsi tra ${fmtEur(lo+b*span/B)} e ${fmtEur(top)}${b===B-1?" o più":""}</title></rect>`;});
  niceTicks(lo,cap,5).filter(v=>v>=lo&&v<=cap).forEach(v=>{g+=`<text x="${X(v).toFixed(1)}" y="${VH-8}" text-anchor="middle">${fmtK(v)}</text>`;});
  const med=(real?R.pFinalReal:R.pFinal)[3];g+=`<line x1="${X(med)}" x2="${X(med)}" y1="${mt-8}" y2="${mt+ih}" stroke="var(--fg)" stroke-width="1.5" stroke-dasharray="3 4"/><text x="${X(med)+6}" y="${mt}" style="fill:var(--fg);font-weight:600">mediana</text>`;
  if(goal>0&&goal>=lo&&goal<=cap)g+=`<line x1="${X(goal)}" x2="${X(goal)}" y1="${mt+12}" y2="${mt+ih}" stroke="var(--warn)" stroke-width="2"/><text x="${X(goal)+6}" y="${mt+24}" style="fill:var(--warn);font-weight:600">obiettivo</text>`;
  $("#mcDist").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Distribuzione del capitale finale nei percorsi simulati">${g}</svg>`;
  $("#mcDistUnit").textContent=`capitale finale · ${real?"euro di oggi":"nominale"}`;
  const pg=real?R.probGoalReal:R.probGoal;
  $("#mcDistCap").textContent=goal>0?`In lime i percorsi che arrivano all'obiettivo: ${fmtPct(pg,0)}, cioè circa ${Math.round(pg*100)} su 100. L'1% di percorsi più alti è raccolto nell'ultima barra.`:"L'1% di percorsi più alti è raccolto nell'ultima barra.";
}
function quantileArr(sorted,p){return P.quantile(sorted,p);}
function renderMcTable(R){
  const L=["5°","10°","25°","50° · mediana","75°","90°","95°"],cell=(k,v)=>`<button type="button" class="cellbtn" data-rc="mc-${k}">${v}</button>`;
  $("#mcTable").innerHTML=`<thead><tr><th>Percentile</th><th>Nominale</th><th>Euro di oggi</th></tr></thead><tbody>${R.pcts.map((p,i)=>`<tr${i===3?' class="pf"':""}><td>${L[i]}</td><td>${cell("p-"+i,fmtEur(R.pFinal[i]))}</td><td>${cell("p-"+i,fmtEur(R.pFinalReal[i]))}</td></tr>`).join("")}</tbody>`;
}
function renderMcNotes(R){
  const ds=S.ds,f=ds.freq.f,from=fmtDate(ds.dates[Math.max(0,R.histFrom)],f),to=fmtDate(ds.dates[ds.dates.length-1],f),kurt=P.riskStats(pfAsset(R.w,"p").ret,f,0).kurt;
  const M={boot:`<b>Storico (bootstrap)</b>: ogni ${UNIT[f]?UNIT[f][0]:"periodo"} futuro pesca a caso uno dei ${R.hist.m} rendimenti reali del portafoglio, dal ${from} al ${to}. Conserva code e asimmetrie vere, ma tratta ogni periodo come indipendente dagli altri.`,
    block:`<b>A blocchi</b>: pesca sequenze consecutive di ${unitN(R.block,f)} dalla storia, così conserva parte delle fasi di mercato (cali e rimbalzi ravvicinati).`,
    normal:`<b>Normale</b>: rendimenti con la stessa media (${fmtPct(R.hist.mean,2)}) e deviazione standard (${fmtPct(R.hist.sd,2)}) della storia, ma a campana. ${kurt>1?`Il tuo file ha code più spesse (curtosi in eccesso ${fmtN(kurt)}): questo metodo sottostima i crolli.`:"Il tuo file ha code vicine a quelle normali."}`}[R.method];
  const n=[M,
    `<b>Il passato si ripete</b>: tutti i metodi assumono che il futuro somigli al periodo nel file. Con ${fmtN(ds.years,1)} anni di storia, ${ds.years<10?"il campione è corto e può non contenere cicli completi di mercato.":"il campione contiene più fasi di mercato, ma non tutte quelle possibili."}`,
    `<b>Portafoglio</b>: ${R.wLabel}, ${R.w.map((x,i)=>x>0?`${esc(ds.assets[i].name)} ${fmtPct(x,0)}`:null).filter(Boolean).join(", ")}, ribilanciato a ogni periodo.`,
    `<b>Flussi</b>: ${R.monthly>=0?`versamento di ${fmtEur(R.monthly)} al mese`:`prelievo di ${fmtEur(-R.monthly)} al mese`}, applicato a fine periodo (${fmtEur(Math.abs(R.perStep))} ${PER[f]||"a periodo"}). Costi del ${fmtN(R.costs*100,2)}% l'anno tolti ogni periodo.`,
    `<b>Inflazione</b>: costante al ${fmtN(R.infl*100,2)}% l'anno, usata solo per riportare i valori in euro di oggi. Le tasse non sono modellate.`,
    `<b>Riproducibile</b>: ${fmtN(R.n,0).replace(",00","")} percorsi con seme fisso ${R.seed}: con gli stessi dati e parametri ottieni sempre gli stessi numeri.${R.n<R.nAsked?` Ridotti da ${R.nAsked} per tenere veloce il calcolo sui dati ${ds.freq.adj}.`:""}`,
    `<b>Drawdown simulato</b>: nel percorso mediano il portafoglio perde fino al ${fmtPct(-R.mddMedian,0)} dal massimo; in 1 percorso su 20 oltre il ${fmtPct(-R.mddP5,0)}.`,
    `<b>Non è una previsione</b>: è una mappa di possibilità coerenti con i dati storici, non una promessa di rendimento né un consiglio d'investimento.`];
  $("#mcNotes").innerHTML=n.map(x=>`<li>${x}</li>`).join("");
}
function mcReceipt(m,arg){
  const R=S.mc,ds=S.ds,f=ds.freq.f,real=S.mcIn.real;
  const base=[["Metodo",MC_M[R.method]+(R.method==="block"?` · blocchi di ${unitN(R.block,f)}`:"")],["Percorsi",R.n],["Orizzonte",`${unitN(R.years,1)} = ${R.steps} passi ${ds.freq.adj}`],["Capitale iniziale",fmtEur(R.initial)],["Flusso per periodo",fmtEur(R.perStep)],["Costi annui",fmtPct(R.costs,2)],["Rendimenti storici usati",R.hist.m],["Seme",R.seed]];
  const fx="Wₜ = Wₜ₋₁ · (1 + r̃ₜ) · (1 − c)^(1/f) + v · 12/f\nr̃ₜ = rendimento estratto dalla storia del portafoglio";
  if(m==="p"){const i=+arg,L=["5°","10°","25°","50°","75°","90°","95°"][i];return {title:`Capitale finale · ${L} percentile`,value:fmtEur(R.pFinal[i]),formula:fx+`\nP${L} = quantile dei ${R.n} capitali finali (interpolazione lineare)`,kv:[["In euro di oggi",fmtEur(R.pFinalReal[i])],["Inflazione",fmtPct(R.infl,2)],...base]};}
  if(m==="med")return mcReceipt("p","3");
  if(m==="goal")return {title:"Probabilità di raggiungere l'obiettivo",value:fmtPct(real?R.probGoalReal:R.probGoal,1),formula:fx+"\nProb = (percorsi con W_T ≥ obiettivo) / percorsi totali\nerrore di simulazione = √(p(1 − p) / n);  IC 95% = p ± 1,96 · errore",kv:[["Obiettivo",fmtEur(R.goal)+(real?" in euro di oggi":"")],["Errore standard (nominale)",`${fmtN(R.probGoalSE*100,2)} punti`],["Probabilità nominale",fmtPct(R.probGoal,1)],["Probabilità in euro di oggi",fmtPct(R.probGoalReal,1)],...base]};
  if(m==="loss")return {title:"Probabilità di perdita",value:fmtPct(R.probLoss,1),formula:fx+"\nProb = (percorsi con W_T < capitale versato) / percorsi totali",kv:[["Capitale versato",fmtEur(R.invested)],...base]};
  if(m==="dep")return {title:"Percorsi che esauriscono il capitale",value:fmtPct(R.depleted,1),formula:fx+"\nesaurito se Wₜ ≤ 0 con prelievi attivi; da lì i prelievi si fermano",kv:base};
  return {title:"Simulazione",value:"—",formula:fx,kv:base};
}
let simT=0;
$("#mcForm").addEventListener("input",()=>{clearTimeout(simT);simT=setTimeout(()=>{simInputs();renderSim();},280);});
$("#mcForm").addEventListener("submit",e=>e.preventDefault());
document.addEventListener("click",e=>{
  const m=e.target.closest("[data-mcm]"),n=e.target.closest("[data-mcn]"),r=e.target.closest("[data-mcr]");
  if(!(m||n||r)||!S.mcIn)return;
  if(m)S.mcIn.method=m.dataset.mcm;if(n)S.mcIn.n=+n.dataset.mcn;if(r)S.mcIn.real=r.dataset.mcr==="1";
  simInputs();renderSim();
});

/* ---------- Stress test e crisi storiche (Modulo 4) ---------- */
const yr=d=>d.getUTCFullYear(),stPer=(n,f)=>n==null?"—":unitN(n,f);
function stressList(){
  const ds=S.ds,f=ds.freq.f,{w,label}=riskWeights();
  const list=P.CRISES.map(c=>P.crisisAnalysis(ds.dates,ds.assets,w,f,c));
  return {w,label,list,avgAll:P.avgCorr(ds.assets,w),C:P.covMatrix(ds.assets).C};
}
function renderStress(){
  const box=$("#stBox"),empty=$("#stEmpty");
  if(!S.lab||!S.ds||!S.ds.ok){box.hidden=true;empty.hidden=false;$("#stW").innerHTML="";return;}
  box.hidden=false;empty.hidden=true;
  if(!S.riskW)S.riskW=S.portfolio?"now":"equal";
  const ds=S.ds,f=ds.freq.f,R=stressList();S.stress=R;ensureBnCr();
  if(!S.st){const pfv=S.portfolio?S.portfolio.positions.reduce((s,p)=>s+(p.valore||0),0):0;S.st={sel:null,shock:ds.assets.map(()=>""),prop:true,cap:S.mcIn?S.mcIn.init:(pfv>0?Math.round(pfv):10000)};}
  const opts=wOpts();
  $("#stW").innerHTML=opts.map(o=>`<button type="button" data-rw="${o[0]}" aria-pressed="${S.riskW===o[0]}">${o[1]}</button>`).join("");
  const usable=R.list.filter(c=>c.status!=="out"&&c.used);
  if(!S.st.sel||!(usable.some(c=>c.id===S.st.sel)||bnCovers(S.st.sel))){const bu=S.bnCr?S.bnCr.list.filter(c=>bnCovers(c.id)):[];S.st.sel=usable.length?usable.reduce((a,b)=>b.mdd<a.mdd?b:a).id:bu.length?bu.reduce((a,b)=>b.mdd<a.mdd?b:a).id:null;}
  $("#stSub").textContent=`${usable.length} ${usable.length===1?"crisi su 5 è":"crisi su 5 sono"} nei dati del file (${fmtDate(ds.dates[0],f)} – ${fmtDate(ds.dates[ds.dates.length-1],f)}). Portafoglio con ${R.label}.`;
  $("#stCrises").innerHTML=R.list.map(c=>{
    const st=c.status,lab=st==="in"?"Nei dati":st==="partial"?"Dati parziali":"Fuori dai dati";
    const range=`${yr(c.from)}${yr(c.to)!==yr(c.from)?"–"+yr(c.to):""}`;
    return `<button type="button" class="crisis" role="listitem" data-crisis="${c.id}" aria-pressed="${S.st.sel===c.id}" ${(st==="out"||!c.used)&&!bnCovers(c.id)?"disabled":""}>
      <span class="yr">${range}</span><b class="nm">${esc(c.name)}</b>
      ${st!=="out"&&c.used?`<span class="big ${c.mdd>=0?"ok":""}">${fmtPct(c.mdd,1)}</span><small>perdita massima del portafoglio</small>`:`<small>Il file non copre ${fmtDate(c.from,f)} – ${fmtDate(c.to,f)}: nessuna stima inventata${bnCovers(c.id)?`. Clicca per vedere ${esc(S.bnCr.label)}.`:"."}</small>`}
      <span class="st ${st}">${lab}</span>${benchCardLine(c.id)}</button>`;}).join("");
  renderCrisisDetail();drawCrisisCompare();renderShock(true);renderStNotes();
  if(current==="stress")Morph.shape("stress");
}
function benchCrisisDetail(id){
  const C=S.bnCr,b=bnCovers(id),ba=C.ba,el=$("#stDetail");
  const k0=b.idx[0],endK=Math.min(ba.dates.length-1,Math.max(b.idx[b.idx.length-1]+Math.max(3,Math.round(b.periods*.6)),b.recK!=null?b.recK:0)),ks=[];for(let k=k0-1;k<=endK;k++)ks.push(k);
  let v=1;const ser=ks.map((k,j)=>{if(j&&Number.isFinite(ba.asset.ret[k]))v*=1+ba.asset.ret[k];return v;});S.stress.series=ser;
  const rec=b.recK!=null?unitN(b.recPeriods,12):"non ancora";
  el.innerHTML=`<div class="head"><div><span class="eyebrow">${fmtDate(b.from,12)} – ${fmtDate(b.to,12)} · ${unitN(b.periods,12)} · solo benchmark</span><h3 style="margin-top:4px">${esc(b.name)} · ${esc(C.label)}</h3></div></div>
    <p style="color:var(--muted);margin:4px 0 10px">${esc(b.what)} Il tuo file non copre questo periodo: qui vedi come si è mosso <b>${esc(C.label)}</b>, non il tuo portafoglio.</p>
    <div class="st-kpis"><div class="k"><span>Perdita massima</span><b class="neg" style="font-family:var(--f-display);font-size:1.5rem">${fmtPct(b.mdd,1)}</b></div><div class="k"><span>Rendimento nella crisi</span><b style="font-family:var(--f-display);font-size:1.5rem">${fmtPct(b.ret,1,true)}</b></div><div class="k"><span>Tempo per toccare il fondo</span><b style="font-family:var(--f-display);font-size:1.5rem">${unitN(b.toTrough,12)}</b></div><div class="k"><span>Recupero dal minimo</span><b style="font-family:var(--f-display);font-size:1.5rem">${rec}</b></div></div>
    <div class="chartbox" id="stPath"></div><p class="caption">Dati mensili dell'ETF ${esc(S.bn&&S.bn.pick!=="custom"?S.bn.pick:C.label)}${S.bn&&S.bn.ccy==="EUR"?", convertiti in euro con il cambio BCE":""}. Per vedere il tuo portafoglio in questa crisi serve un file con una storia che la includa.</p>`;
  const VW=900,VH=260,ml=46,mr=12,mt=14,mb=28,iw=VW-ml-mr,ih=VH-mt-mb,n=ser.length,lo=Math.min(...ser,1)*.97,hi=Math.max(...ser,1)*1.03,X=j=>ml+(n>1?j/(n-1):0)*iw,Y=x=>mt+ih-(x-lo)/((hi-lo)||1)*ih,j1=ks.indexOf(b.idx[b.idx.length-1]);
  let g=`<rect x="${X(0)}" y="${mt}" width="${X(j1)-X(0)}" height="${ih}" fill="var(--bad)" opacity=".08"/>`;
  niceTicks(lo-1,hi-1,4).forEach(t=>{const y=Y(1+t);if(y>=mt&&y<=mt+ih)g+=`<line x1="${ml}" x2="${VW-mr}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)"/><text x="${ml-6}" y="${(y+4).toFixed(1)}" text-anchor="end">${fmtPct(Math.abs(t)<1e-9?0:t,0,true)}</text>`;});
  [0,Math.floor((n-1)/2),n-1].forEach(j=>{g+=`<text x="${X(j).toFixed(1)}" y="${VH-8}" text-anchor="${j===0?"start":j===n-1?"end":"middle"}">${fmtDate(ba.dates[ks[j]],12)}</text>`;});
  let d="";ser.forEach((x,j)=>{d+=(j?"L":"M")+X(j).toFixed(1)+","+Y(x).toFixed(1);});
  g+=`<path d="${d}" fill="none" stroke="var(--c3)" stroke-width="3" pathLength="1" class="draw" style="--k:0"/>`;
  if(b.troughK!=null){const j=ks.indexOf(b.troughK);g+=`<circle cx="${X(j)}" cy="${Y(ser[j])}" r="5" fill="var(--bad)"/><text x="${X(j)+8}" y="${Y(ser[j])+16}" style="fill:var(--fg);font-weight:600">${fmtPct(b.mdd,1)}</text>`;}
  $("#stPath").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="${esc(C.label)} durante ${esc(b.name)}">${g}</svg>`;
}
function crisisSeries(c,extra){
  const ds=S.ds,R=S.stress,pr=P.portfolioReturns(ds.assets,R.w),k0=c.idx[0],endK=Math.min(ds.dates.length-1,Math.max(c.idx[c.idx.length-1]+extra,c.recK||0));
  const ks=[k0-1];for(let k=k0;k<=endK;k++)ks.push(k);
  const run=ret=>{let v=1;return ks.map((k,j)=>{if(j===0)return 1;if(Number.isFinite(ret[k]))v*=1+ret[k];return v;});};
  return {ks,pf:run(pr),assets:ds.assets.map((a,i)=>R.w[i]>0?run(a.ret):null),endK};
}
function renderCrisisDetail(){
  const R=S.stress,ds=S.ds,f=ds.freq.f,el=$("#stDetail"),c=R.list.find(x=>x.id===S.st.sel);
  if(c&&(c.status==="out"||!c.used)&&bnCovers(c.id)){benchCrisisDetail(c.id);return;}
  if(!c){el.innerHTML=`<div class="head"><h3>Nessuna crisi nei dati</h3></div><p style="color:var(--muted)">Il file va dal ${fmtDate(ds.dates[0],f)} al ${fmtDate(ds.dates[ds.dates.length-1],f)} e non contiene nessuna delle cinque crisi della libreria. Non le ricostruisco con shock inventati: puoi usare <b>Il tuo shock</b> qui sotto, oppure caricare un file con una storia più lunga.</p>`;S.stress.series=null;return;}
  const S2=crisisSeries(c,Math.max(3,Math.round(c.periods*.6)));S.stress.series=S2.pf;
  const live=ds.assets.map((a,i)=>i).filter(i=>R.w[i]>0&&c.assets[i].n),byRet=[...live].sort((a,b)=>c.assets[a].ret-c.assets[b].ret);
  const worst=byRet[0],best=byRet[byRet.length-1],cell=(k,v,cl="")=>`<button type="button" class="cellbtn ${cl}" data-rc="st-${k}-${c.id}">${v}</button>`;
  const rec=c.recK!=null?stPer(c.recPeriods,f):c.troughK==null?"nessun calo":"non ancora";
  const corrTxt=Number.isFinite(c.corrIn)?`Durante la crisi la correlazione media tra i tuoi asset è stata <b>${fmtN(c.corrIn)}</b>, contro <b>${fmtN(R.avgAll)}</b> sull'intero periodo${c.corrIn>R.avgAll+.1?": nei momenti peggiori gli asset si sono mossi più insieme e la diversificazione ha protetto meno.":c.corrIn<R.avgAll-.1?": in questa crisi gli asset si sono mossi meno insieme del solito.":"."}`:`Correlazioni durante la crisi non calcolabili: servono almeno 6 periodi, qui ce ne sono ${c.used}.`;
  el.innerHTML=`<div class="head"><div><span class="eyebrow">${fmtDate(c.from,f)} – ${fmtDate(c.to,f)} · ${unitN(c.periods,f)}${c.status==="partial"?" · dati parziali":""}</span><h3 style="margin-top:4px">${esc(c.name)}</h3></div></div>
    <p style="color:var(--muted);margin:4px 0 10px">${esc(c.what)}</p>
    <div class="st-kpis">
      <div class="k"><span>Perdita massima</span>${cell("mdd",fmtPct(c.mdd,1),"neg")}</div>
      <div class="k"><span>Rendimento nella crisi</span>${cell("ret",fmtPct(c.ret,1,true),c.ret<0?"neg":"")}</div>
      <div class="k"><span>Tempo per toccare il fondo</span>${cell("trough",c.troughK==null?"—":stPer(c.toTrough,f))}</div>
      <div class="k"><span>Recupero dal minimo</span>${cell("rec",rec)}</div>
    </div>
    <div class="st-two"><div><div class="chartbox" id="stPath"></div><div class="legend" id="stPathLeg" style="margin-top:8px"></div></div>
      <div><div class="tablewrap"><table class="mt mc-t"><thead><tr><th>Asset</th><th>Nella crisi</th><th>Max drawdown</th><th>Contributo</th></tr></thead><tbody>
      <tr class="pf"><td><span class="an"><i style="background:var(--lime)"></i>Portafoglio</span></td><td>${cell("ret",fmtPct(c.ret,1,true),c.ret<0?"neg":"")}</td><td>${cell("mdd",fmtPct(c.mdd,1),"neg")}</td><td>${cell("ret",fmtPct(c.ret,1,true))}</td></tr>
      ${live.map(i=>`<tr><td><span class="an"><i style="background:${color(i)}"></i>${esc(ds.assets[i].name)}</span></td><td>${cell("aret-"+i,fmtPct(c.assets[i].ret,1,true),c.assets[i].ret<0?"neg":"")}</td><td>${cell("amdd-"+i,fmtPct(c.assets[i].mdd,1),c.assets[i].mdd<0?"neg":"")}</td><td>${cell("ctr-"+i,fmtPct(c.contrib[i],1,true),c.contrib[i]<0?"neg":"")}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="caption" style="margin-top:10px">${live.length>1?`Il più colpito è stato <b>${esc(ds.assets[worst].name)}</b> (${fmtPct(c.assets[worst].ret,1,true)}), il più resistente <b>${esc(ds.assets[best].name)}</b> (${fmtPct(c.assets[best].ret,1,true)}). `:""}Il contributo è la parte della perdita del portafoglio dovuta a ogni asset: la somma dà il rendimento nella crisi.</p>
      <p class="caption">${corrTxt}</p></div></div>`;
  drawCrisisPath(c,S2);
}
function drawCrisisPath(c,S2){
  const ds=S.ds,f=ds.freq.f,ks=S2.ks,n=ks.length,VW=640,VH=280,ml=46,mr=12,mt=14,mb=28,iw=VW-ml-mr,ih=VH-mt-mb;
  const all=[S2.pf,...S2.assets.filter(Boolean)].flat().filter(Number.isFinite),lo=Math.min(...all,1)*.98,hi=Math.max(...all,1)*1.02;
  const X=j=>ml+(n>1?j/(n-1):0)*iw,Y=v=>mt+ih-(v-lo)/((hi-lo)||1)*ih,j0=1,j1=ks.indexOf(c.idx[c.idx.length-1]);
  let g=`<rect x="${X(j0-1)}" y="${mt}" width="${X(j1)-X(j0-1)}" height="${ih}" fill="var(--bad)" opacity=".08"/><text x="${X(j0-1)+6}" y="${mt+14}" style="fill:var(--bad)">crisi</text>`;
  niceTicks(lo-1,hi-1,4).forEach(v=>{const y=Y(1+v);if(y>=mt&&y<=mt+ih)g+=`<line x1="${ml}" x2="${VW-mr}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)"/><text x="${ml-6}" y="${(y+4).toFixed(1)}" text-anchor="end">${fmtPct(Math.abs(v)<1e-9?0:v,0,true)}</text>`;});
  g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Y(1)}" y2="${Y(1)}" stroke="var(--muted)" stroke-dasharray="3 4"/>`;
  [0,Math.floor((n-1)/2),n-1].forEach(j=>{g+=`<text x="${X(j).toFixed(1)}" y="${VH-8}" text-anchor="${j===0?"start":j===n-1?"end":"middle"}">${fmtDate(ds.dates[ks[j]],f)}</text>`;});
  const line=(arr,st,k)=>{let d="";arr.forEach((v,j)=>{d+=(j?"L":"M")+X(j).toFixed(1)+","+Y(v).toFixed(1);});return `<path d="${d}" fill="none" ${st} pathLength="1" class="draw" style="--k:${k}"/>`;};
  S2.assets.forEach((s,i)=>{if(s)g+=line(s,`stroke="${color(i)}" stroke-width="1.6" opacity=".85"`,i+1);});
  g+=line(S2.pf,`stroke="var(--lime)" stroke-width="3.2"`,0);
  if(c.troughK!=null){const j=ks.indexOf(c.troughK),v=S2.pf[j];g+=`<circle cx="${X(j)}" cy="${Y(v)}" r="5" fill="var(--bad)" class="endpt" style="--k:0"/><text x="${X(j)+8}" y="${Y(v)+16}" style="fill:var(--fg);font-weight:600">${fmtPct(c.mdd,1)}</text>`;}
  if(c.recK!=null&&ks.includes(c.recK)){const j=ks.indexOf(c.recK);g+=`<circle cx="${X(j)}" cy="${Y(S2.pf[j])}" r="5" fill="var(--good)" class="endpt" style="--k:1"/><text x="${X(j)-8}" y="${Y(S2.pf[j])-10}" text-anchor="end" style="fill:var(--good);font-weight:600">recuperato</text>`;}
  $("#stPath").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Valore del portafoglio e degli asset durante ${esc(c.name)}, base 100 all'inizio">${g}</svg>`;
  $("#stPathLeg").innerHTML=`<span><i style="background:var(--lime)"></i>Portafoglio</span>`+S2.assets.map((s,i)=>s?`<span><i style="background:${color(i)}"></i>${esc(ds.assets[i].name)}</span>`:"").join("");
}
function drawCrisisCompare(){
  const R=S.stress,ds=S.ds,rows=R.list.filter(c=>c.status!=="out"&&c.used);
  if(!rows.length){$("#stCompare").innerHTML=`<p style="color:var(--muted)">Nessuna crisi della libreria è nei dati del file.</p>`;$("#stCompareCap").textContent="";return;}
  const VW=900,rh=46,mt=10,VH=mt+rows.length*rh+30,ml=190,mr=20,iw=VW-ml-mr;
  const vals=rows.flatMap(c=>[c.mdd,c.ret,...c.assets.filter((a,i)=>R.w[i]>0).map(a=>a.ret)]).filter(Number.isFinite);
  const lo=Math.min(-.05,...vals)*1.08,hi=Math.max(.02,...vals)*1.08,X=v=>ml+(v-lo)/(hi-lo)*iw;
  let g="";niceTicks(lo,hi,6).filter(v=>v>=lo&&v<=hi).forEach(v=>{g+=`<line x1="${X(v)}" x2="${X(v)}" y1="${mt}" y2="${VH-24}" stroke="var(--line)"/><text x="${X(v)}" y="${VH-8}" text-anchor="middle">${fmtPct(v,0)}</text>`;});
  g+=`<line x1="${X(0)}" x2="${X(0)}" y1="${mt}" y2="${VH-24}" stroke="var(--muted)"/>`;
  rows.forEach((c,r)=>{const y=mt+r*rh+rh/2;
    g+=`<text x="${ml-12}" y="${y+4}" text-anchor="end" style="fill:var(--fg);font-family:var(--f-body);font-size:13px;font-weight:700">${esc(c.name)}</text>`;
    g+=`<rect class="grow" style="--k:${r}" x="${Math.min(X(0),X(c.mdd))}" y="${y-11}" width="${Math.abs(X(c.mdd)-X(0))}" height="22" rx="6" fill="var(--bad)" opacity=".8"><title>Perdita massima del portafoglio ${fmtPct(c.mdd,1)}</title></rect>`;
    g+=`<line x1="${X(c.ret)}" x2="${X(c.ret)}" y1="${y-15}" y2="${y+15}" stroke="var(--lime)" stroke-width="3"><title>Rendimento nella crisi ${fmtPct(c.ret,1,true)}</title></line>`;
    c.assets.forEach((a,i)=>{if(R.w[i]>0&&Number.isFinite(a.ret))g+=`<circle cx="${X(a.ret)}" cy="${y}" r="5" fill="${color(i)}" stroke="var(--solid)" stroke-width="1.5"><title>${esc(ds.assets[i].name)}: ${fmtPct(a.ret,1,true)}</title></circle>`;});});
  $("#stCompare").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Confronto tra le crisi: perdita massima del portafoglio e rendimento di ogni asset">${g}</svg>`;
  const worst=rows.reduce((a,b)=>b.mdd<a.mdd?b:a);
  $("#stCompareCap").innerHTML=`Barra rossa: perdita massima del portafoglio. Linea lime: rendimento a fine crisi. Pallini: rendimento di ogni asset nella stessa finestra. La crisi peggiore per questo portafoglio è <b>${esc(worst.name)}</b> (${fmtPct(worst.mdd,1)}).`;
}
/* Shock ipotetico */
function shockValues(){
  const st=S.st,R=S.stress,v=st.shock.map(x=>{const n=parseFloat(String(x).replace(",","."));return Number.isFinite(n)?n/100:NaN;});
  if(!v.some(Number.isFinite))return {r:v.map(()=>0),implied:v.map(()=>false),none:true};
  return st.prop?P.conditionalShock(R.C,v):{r:v.map(x=>Number.isFinite(x)?x:0),implied:v.map(()=>false)};
}
function renderShock(rebuild){
  const ds=S.ds,R=S.stress,st=S.st;
  if(rebuild){
    $("#stShocks").innerHTML=ds.assets.map((a,i)=>R.w[i]>0?`<div class="st-row"><label class="nm" for="sh${i}"><i style="background:${color(i)}"></i>${esc(a.name)}</label><input id="sh${i}" data-sh="${i}" type="text" inputmode="decimal" placeholder="—" value="${esc(st.shock[i])}" aria-label="Shock su ${esc(a.name)} in percentuale"><span class="imp" id="shi${i}"></span></div>`:"").join("");
    $("#stProp").checked=st.prop;$("#stCap").value=st.cap;
  }
  const s=shockValues(),imp=P.stressImpact(R.w,s.r),cap=st.cap;
  ds.assets.forEach((a,i)=>{const el=$("#shi"+i),inp=$("#sh"+i);if(!el)return;el.className="imp"+(s.implied[i]&&!s.none?" auto":"");el.textContent=s.none?"":`${s.implied[i]?"≈ ":""}${fmtPct(s.r[i],1,true)}`;if(inp)inp.placeholder=s.implied[i]&&!s.none?fmtN(s.r[i]*100,1):"—";});
  const live=ds.assets.map((a,i)=>i).filter(i=>R.w[i]>0),mx=Math.max(...live.map(i=>Math.abs(imp.contrib[i])),1e-9);
  $("#stRes").innerHTML=s.error?`<div class="msg err">${esc(s.error)}</div>`:s.none?`<span class="eyebrow">Impatto sul portafoglio</span><p style="color:var(--muted);margin-top:10px">Scrivi uno shock, per esempio <b>-30</b> accanto a un asset azionario, oppure scegli uno scenario pronto.</p>`
    :`<span class="eyebrow">Impatto sul portafoglio</span><button type="button" class="cellbtn hit ${imp.total<0?"neg":"pos"}" data-rc="st-shock-p-x" style="border:0;margin:6px 0 0;padding:0">${fmtPct(imp.total,1,true)}</button>
      <div class="eur">${imp.total<0?"−":"+"}${fmtEur(Math.abs(imp.total*cap))} su ${fmtEur(cap)}</div>
      ${live.map(i=>`<div class="cbar"><span class="nm">${esc(ds.assets[i].name)}</span><div class="bars"><div class="b r"><i style="width:${(Math.abs(imp.contrib[i])/mx*100).toFixed(1)}%;background:${imp.contrib[i]<0?"var(--bad)":"var(--good)"}"></i><button type="button" data-rc="st-shock-${i}-x">${fmtPct(imp.contrib[i],1,true)}</button></div></div></div>`).join("")}
      <p class="caption" style="margin-top:10px">Contributo = peso × shock. ${s.implied.some((x,i)=>x&&R.w[i]>0)?"I valori con ≈ sono stimati dalla covarianza storica: è come si sono mossi in media insieme agli asset colpiti, non una certezza.":"Nessun asset stimato: ogni shock è scritto da te."}</p>`;
}
document.addEventListener("input",e=>{
  const i=e.target.dataset&&e.target.dataset.sh;if(i!==undefined&&S.st){S.st.shock[+i]=e.target.value;renderShock(false);return;}
  if(e.target.id==="stCap"&&S.st){const v=parseFloat(e.target.value);S.st.cap=Number.isFinite(v)&&v>=0?v:0;renderShock(false);}
});
document.addEventListener("change",e=>{if(e.target.id==="stProp"&&S.st){S.st.prop=e.target.checked;renderShock(false);}});
document.addEventListener("click",e=>{
  const c=e.target.closest("[data-crisis]");if(c&&!c.disabled&&S.st){S.st.sel=c.dataset.crisis;document.querySelectorAll("[data-crisis]").forEach(b=>b.setAttribute("aria-pressed",String(b===c)));renderCrisisDetail();Morph.shape("stress");return;}
  const p=e.target.closest("[data-stp]");if(!p||!S.st)return;
  const ds=S.ds,R=S.stress,k=p.dataset.stp;
  if(k==="all20")S.st.shock=ds.assets.map(()=>"-20");
  else if(k==="vol2")S.st.shock=ds.assets.map((a,i)=>Number.isFinite(S.lab.st[i].vol)?fmtN(-2*S.lab.st[i].vol*100,1):"");
  else if(k==="worst"){const u=R.list.filter(x=>x.status!=="out"&&x.used);if(!u.length){$("#stRes").innerHTML=`<div class="msg err">Nessuna crisi della libreria è nei dati: non posso ripeterla.</div>`;return;}
    const w=u.reduce((a,b)=>b.mdd<a.mdd?b:a);S.st.shock=ds.assets.map((a,i)=>Number.isFinite(w.assets[i].ret)?fmtN(w.assets[i].ret*100,1):"");S.st.preset=w.name;}
  else S.st.shock=ds.assets.map(()=>"");
  renderShock(true);
});
function renderStNotes(){
  const ds=S.ds,f=ds.freq.f;
  $("#stNotes").innerHTML=[
    `<b>Crisi storiche</b>: finestre dal massimo al minimo dell'azionario globale (date indicative). I numeri usano solo i rendimenti del tuo file in quelle date; le crisi fuori dai dati non vengono stimate.`,
    `<b>Crisi fuori dal file</b>: ${S.bnCr?`le schede mostrano anche ${esc(S.bnCr.label)} su tutta la sua storia (cambia indice nella sezione Benchmark). Cliccando una crisi che il file non copre vedi solo il mercato, mai un portafoglio ricostruito.`:"se scegli un benchmark nella sezione Benchmark, le schede mostrano anche come si è mosso il mercato."}`,
    `<b>Frequenza</b>: con dati ${ds.freq.adj} ${f<=12?"la finestra comprende mesi interi, quindi il minimo può differire da quello giornaliero.":"la finestra segue le date esatte di massimo e minimo."}`,
    `<b>Pesi di oggi applicati al passato</b>: il portafoglio è ribilanciato a ogni periodo con i pesi scelti. Nella realtà allora avresti potuto avere altri asset o altri pesi.`,
    `<b>Contributo alla perdita</b>: cᵢ = Σ wᵢ · rᵢ,ₜ · Vₜ₋₁; la somma dei contributi è il rendimento del portafoglio nella crisi.`,
    `<b>Shock ipotetico istantaneo</b>: applicato tutto in un colpo, senza ribilanciamento né recupero.`,
    `<b>Propagazione</b>: gli asset senza shock si muovono di r = Σ_UK · Σ_KK⁻¹ · s (attesa condizionata con la covarianza dell'intero periodo). Nelle crisi le correlazioni di solito salgono: la stima può essere ottimista.`,
    `<b>Tassi, inflazione, cambio</b>: servono sensibilità che il file non contiene (duration, esposizione valutaria). Puoi tradurli tu in shock per asset: per esempio obbligazioni con duration 7 e tassi +2% ≈ −14%.`,
    `<b>Non è una previsione</b>: mostra come il portafoglio ha reagito o reagirebbe a eventi estremi, non cosa succederà.`
  ].map(x=>`<li>${x}</li>`).join("");
}
function stReceipt(m,a,b){
  const R=S.stress,ds=S.ds,f=ds.freq.f;
  if(m==="shock"){const s=shockValues(),imp=P.stressImpact(R.w,s.r);
    if(a==="p")return {title:"Impatto dello shock sul portafoglio",value:fmtPct(imp.total,2,true),formula:"Δₚ = Σ wᵢ · sᵢ\n"+(S.st.prop?"sᵢ stimato (≈) = Σ_iK · Σ_KK⁻¹ · s_K   (covarianza storica)":"sᵢ = shock scritto (0 se vuoto)"),kv:[...ds.assets.map((x,i)=>R.w[i]>0?[x.name,`peso ${fmtPct(R.w[i],1)} × shock ${fmtPct(s.r[i],1,true)}${s.implied[i]?" (stimato)":""}`]:null).filter(Boolean),["Impatto in euro",fmtEur(imp.total*S.st.cap)]]};
    const i=+a;return {title:`Contributo allo shock · ${ds.assets[i].name}`,value:fmtPct(imp.contrib[i],2,true),formula:"cᵢ = wᵢ · sᵢ",kv:[["Peso",fmtPct(R.w[i],1)],["Shock",fmtPct(s.r[i],2,true)+(s.implied[i]?" · stimato dalla covarianza":" · scritto da te")]]};}
  const c=R.list.find(x=>x.id===(b&&R.list.some(y=>y.id===b)?b:a));const id=c.id,i=+a;
  const base=[["Finestra",`${fmtDate(c.from,f)} – ${fmtDate(c.to,f)}`],["Periodi nella finestra",c.periods],["Periodi con dati",c.used],["Pesi",R.label]];
  const M={
    mdd:{t:"Perdita massima nella crisi",v:fmtPct(c.mdd,2),fx:"Vₜ = Π (1 + rₚ) dall'inizio della finestra\nDD = min ( Vₜ / max(V) − 1 )",kv:[["Minimo",c.troughK!=null?fmtDate(ds.dates[c.troughK],f):"—"]]},
    ret:{t:"Rendimento nella crisi",v:fmtPct(c.ret,2,true),fx:"R = Π (1 + rₚ,ₜ) − 1   sui periodi della finestra\nrₚ = Σ wᵢ · rᵢ",kv:[]},
    trough:{t:"Tempo per toccare il fondo",v:stPer(c.toTrough,f),fx:"periodi dall'inizio della finestra al minimo",kv:[["Minimo",c.troughK!=null?fmtDate(ds.dates[c.troughK],f):"—"]]},
    rec:{t:"Tempo di recupero",v:c.recK!=null?stPer(c.recPeriods,f):"non recuperato",fx:"periodi dal minimo al ritorno sul massimo precedente\ncercato anche dopo la fine della finestra, fino alla fine dei dati",kv:[["Recuperato a",c.recK!=null?fmtDate(ds.dates[c.recK],f):"non nei dati"]]},
    aret:{t:`Rendimento nella crisi · ${ds.assets[i]&&ds.assets[i].name}`,v:c.assets[i]?fmtPct(c.assets[i].ret,2,true):"—",fx:"R = Π (1 + rᵢ,ₜ) − 1",kv:[["Periodi con dati",c.assets[i]?c.assets[i].n:"—"]]},
    amdd:{t:`Max drawdown nella crisi · ${ds.assets[i]&&ds.assets[i].name}`,v:c.assets[i]?fmtPct(c.assets[i].mdd,2):"—",fx:"DD = min ( Vₜ / max(V) − 1 )",kv:[]},
    ctr:{t:`Contributo alla perdita · ${ds.assets[i]&&ds.assets[i].name}`,v:fmtPct(c.contrib[i],2,true),fx:"cᵢ = Σₜ wᵢ · rᵢ,ₜ · Vₜ₋₁\nΣ cᵢ = rendimento del portafoglio nella crisi",kv:[["Peso",fmtPct(R.w[i],1)],["Rendimento dell'asset",fmtPct(c.assets[i].ret,2,true)],["Rendimento del portafoglio",fmtPct(c.ret,2,true)]]}
  }[m]||{t:m,v:"—",fx:"",kv:[]};
  return {title:`${M.t} · ${c.name}`,value:M.v,formula:M.fx,kv:[...M.kv,...base]};
}

/* ---------- Frontiera efficiente e ottimizzatore (Modulo 5) ---------- */
const OP_L={sharpe:"massimo Sharpe",minvar:"minima volatilità",rp:"risk parity",eq:"pesi uguali",tvol:"volatilità target",tret:"rendimento target"};
function opBase(){
  const ds=S.ds,k=ds.assets.length,w=S.portfolio?pfWeights("now"):null;
  return w?{w,label:"pesi attuali"}:{w:ds.assets.map(()=>1/k),label:"pesi uguali"};
}
function opEval(w,inp,rf){
  const ds=S.ds,f=ds.freq.f,p=P.pStats(w,inp.mu,inp.C),pa=pfAsset(w,"p"),st=P.stats(pa,f,ds.dates),rk=P.riskStats(pa.ret,f,rf);
  return {w,ret:p.ret,vol:p.vol,sharpe:p.vol>0?(p.ret-rf)/p.vol:NaN,cagr:st.cagr,mdd:st.mdd,var95:rk.var95,n:st.n};
}
function opSolve(a){
  /* a = {mode,target(decimale),min,max} → {O,chosen,note} ; usato dalla sezione e da Quanta */
  const ds=S.ds,f=ds.freq.f,mm=macroFor(S.rfSrc),rf=mm?mm.rf:0,inp=P.annualInputs(ds.assets,f),k=ds.assets.length;
  if(inp.common<12)return {error:`Servono almeno 12 periodi in cui tutti gli asset hanno un valore: qui ce ne sono ${inp.common}.`};
  const O=P.optimize({mu:inp.mu,C:inp.C,rf,min:a.min,max:a.max});if(O.error)return {error:O.error};
  let ch,note="";
  if(a.mode==="minvar")ch=O.minVar;
  else if(a.mode==="rp"){ch={w:P.riskParity(inp.C)};if(ch.w.some((x,i)=>x<O.lo[i]-1e-6||x>O.hi[i]+1e-6))note="La risk parity non rispetta i limiti di peso: per definizione i pesi dipendono solo dai rischi.";}
  else if(a.mode==="eq"){ch={w:ds.assets.map(()=>1/k)};if(ch.w.some((x,i)=>x<O.lo[i]-1e-6||x>O.hi[i]+1e-6))note="Pesi uguali fuori dai limiti impostati.";}
  else if(a.mode==="tvol"||a.mode==="tret"){const key=a.mode==="tvol"?"vol":"ret";ch=O.target(key,a.target);
    if(ch.clamped)note=`Il target ${fmtPct(a.target,1)} è ${ch.clamped==="low"?"sotto il minimo":"sopra il massimo"} raggiungibile con questi vincoli: uso ${ch.clamped==="low"?"il portafoglio di minima volatilità":"il portafoglio a rendimento massimo"}.`;}
  else ch=O.maxSharpe;
  return {O,inp,rf,mm,chosen:ch.w,note};
}
function renderOpt(){
  const box=$("#opBox"),empty=$("#opEmpty");
  if(!S.lab||!S.ds||!S.ds.ok||S.ds.assets.length<2){box.hidden=true;empty.hidden=false;if(S.lab&&S.ds&&S.ds.assets.length<2)empty.querySelector("p").textContent="Con un solo asset non c'è niente da combinare: la frontiera serve almeno due asset.";return;}
  box.hidden=false;empty.hidden=true;
  const ds=S.ds,f=ds.freq.f;
  if(!S.opIn){S.opIn={mode:"sharpe",target:null,min:0,max:100,short:false};$("#opMin").value=0;$("#opMax").value=100;$("#opShort").checked=false;}
  const I=S.opIn,base=opBase();
  document.querySelectorAll("#opMode [data-opm]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.opm===I.mode)));
  const tgt=I.mode==="tvol"||I.mode==="tret";$("#opTargetL").style.visibility=tgt?"visible":"hidden";
  const R=opSolve({mode:I.mode,target:I.target==null?NaN:I.target/100,min:I.short?I.min/100:Math.max(0,I.min/100),max:I.max/100});
  if(!R.error&&tgt&&I.target==null){const b=opEval(base.w,R.inp,R.rf);I.target=+((I.mode==="tvol"?b.vol:b.ret)*100).toFixed(1);$("#opTarget").value=I.target;return renderOpt();}
  if(tgt){$("#opTargetLbl").textContent=I.mode==="tvol"?"Volatilità target (%)":"Rendimento target (%)";if(document.activeElement!==$("#opTarget"))$("#opTarget").value=I.target;}
  if(R.error){$("#opKpis").innerHTML=`<div class="kpi"><span class="eyebrow">Impossibile ottimizzare</span><span class="v txt">${esc(R.error)}</span>${rebuildHint()}</div>`;["#opChart","#opCmp","#opWeights","#opLegend"].forEach(id=>$(id).innerHTML="");$("#opCap").textContent="";S.opt=null;return;}
  const A=opEval(base.w,R.inp,R.rf),B=opEval(R.chosen,R.inp,R.rf);
  S.opt={...R,A,B,base,modeLabel:OP_L[I.mode],lo:R.O.lo,hi:R.O.hi};
  $("#opSub").textContent=`${ds.assets.length} asset, ${R.inp.common} periodi comuni. Obiettivo: ${OP_L[I.mode]}${tgt?` ${fmtPct(I.target/100,1)}`:""}, pesi tra ${fmtPct(R.O.lo[0],0)} e ${fmtPct(R.O.hi[0],0)}${R.rf?`, tasso privo di rischio ${fmtPct(R.rf,2)}`:""}.`;
  const d=(x,y,inv,pp)=>{const v=y-x;if(!Number.isFinite(v)||Math.abs(v)<(pp?.0005:.005))return "uguale a prima";const good=inv?v<0:v>0;return `<span class="${good?"up":"dn"}">${v>0?"+":"−"}${pp?fmtN(Math.abs(v)*100,1)+" punti":fmtN(Math.abs(v))}</span> rispetto a prima`;};
  const btn=(k,v)=>`<button type="button" class="v" data-rc="op-${k}-o">${v}</button>`;
  $("#opKpis").innerHTML=[["Rendimento atteso",btn("ret",fmtPct(B.ret,1)),d(A.ret,B.ret,false,true)],["Volatilità",btn("vol",fmtPct(B.vol,1)),d(A.vol,B.vol,true,true)],["Sharpe",btn("sharpe",fmtN(B.sharpe)),d(A.sharpe,B.sharpe,false,false)],["Max drawdown storico",btn("mdd",fmtPct(B.mdd,1)),d(A.mdd,B.mdd,false,true)]]
    .map(k=>`<div class="kpi"><span class="eyebrow">${k[0]}</span>${k[1]}<span class="sub">${k[2]}</span></div>`).join("");
  drawFrontier();renderOpCmp();renderOpWeights();renderOpNotes();
  $("#opUse").textContent=S.optW&&S.riskW==="opt"&&S.optW.w.every((x,i)=>Math.abs(x-B.w[i])<1e-9)?"Pesi in uso nelle altre analisi ✓":"Usa questi pesi nelle altre analisi";
  if(current==="opt")Morph.shape("opt");
}
function drawFrontier(){
  const O=S.opt,ds=S.ds,inp=O.inp,n=ds.assets.length,VW=900,VH=440,ml=58,mr=24,mt=18,mb=40,iw=VW-ml-mr,ih=VH-mt-mb;
  const cloud=S.opIn.short?[]:P.randomPortfolios(n,700,O.lo,O.hi,7).map(w=>P.pStats(w,inp.mu,inp.C));O.cloud=cloud;
  const F=O.O.frontier,assetsP=ds.assets.map((a,i)=>({vol:Math.sqrt(inp.C[i][i]),ret:inp.mu[i]}));
  const pts=[...F,...assetsP,O.A,O.B,...cloud];let x1=Math.max(...pts.map(p=>p.vol))*1.08,y0=Math.min(0,...pts.map(p=>p.ret)),y1=Math.max(...pts.map(p=>p.ret));const yp=(y1-y0)*.08;y0-=yp;y1+=yp;
  const X=v=>ml+v/x1*iw,Y=v=>mt+ih-(v-y0)/((y1-y0)||1)*ih;
  let g="";niceTicks(0,x1,6).filter(v=>v>=0&&v<=x1).forEach(v=>{g+=`<line x1="${X(v)}" x2="${X(v)}" y1="${mt}" y2="${mt+ih}" stroke="var(--line)"/><text x="${X(v)}" y="${VH-20}" text-anchor="middle">${fmtPct(v,0)}</text>`;});
  niceTicks(y0,y1,5).filter(v=>v>=y0&&v<=y1).forEach(v=>{g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${ml-8}" y="${Y(v)+4}" text-anchor="end">${fmtPct(Math.abs(v)<1e-9?0:v,0)}</text>`;});
  g+=`<text x="${ml+iw/2}" y="${VH-4}" text-anchor="middle">volatilità annua →</text><text transform="translate(14 ${mt+ih/2}) rotate(-90)" text-anchor="middle">rendimento atteso annuo →</text>`;
  cloud.forEach(p=>{g+=`<circle cx="${X(p.vol).toFixed(1)}" cy="${Y(p.ret).toFixed(1)}" r="2.2" fill="var(--c2)" opacity=".28"/>`;});
  const ms=O.O.maxSharpe,shp=ms.vol>0?(ms.ret-O.rf)/ms.vol:0;
  if(shp>0){let xe=x1,ye=O.rf+shp*xe;if(ye>y1){xe=(y1-O.rf)/shp;ye=y1;}
    g+=`<line x1="${X(0)}" y1="${Y(O.rf)}" x2="${X(xe).toFixed(1)}" y2="${Y(ye).toFixed(1)}" stroke="var(--warn)" stroke-width="1.5" stroke-dasharray="6 5" opacity=".9"/>`;}
  let dF="";F.forEach((p,i)=>{dF+=(i?"L":"M")+X(p.vol).toFixed(1)+","+Y(p.ret).toFixed(1);});
  g+=`<path d="${dF}" fill="none" stroke="var(--lime)" stroke-width="3.5" stroke-linecap="round" pathLength="1" class="draw" style="--k:0"/>`;
  assetsP.forEach((p,i)=>{g+=`<g class="pt"><circle cx="${X(p.vol)}" cy="${Y(p.ret)}" r="7" fill="${color(i)}" stroke="var(--solid)" stroke-width="2"/><text x="${X(p.vol)>VW-180?X(p.vol)-11:X(p.vol)+11}" y="${Y(p.ret)+(X(p.vol)>VW-180?18:4)}" text-anchor="${X(p.vol)>VW-180?"end":"start"}" style="fill:var(--fg);font-weight:600">${esc(ds.assets[i].name.length>22?ds.assets[i].name.slice(0,21)+"…":ds.assets[i].name)}</text><title>${esc(ds.assets[i].name)}: rendimento ${fmtPct(p.ret,1)}, volatilità ${fmtPct(p.vol,1)}</title></g>`;});
  const mv=O.O.minVar;g+=`<g class="pt"><circle cx="${X(mv.vol)}" cy="${Y(mv.ret)}" r="5" fill="var(--solid)" stroke="var(--lime)" stroke-width="2.5"/><title>Minima volatilità: ${fmtPct(mv.ret,1)} · ${fmtPct(mv.vol,1)}</title></g>`;
  if(shp>0)g+=`<g class="pt"><path d="${star(X(ms.vol),Y(ms.ret),9,4)}" fill="var(--warn)"/><title>Massimo Sharpe ${fmtN(shp)}: ${fmtPct(ms.ret,1)} · ${fmtPct(ms.vol,1)}</title></g>`;
  const a=O.A,b=O.B;
  g+=`<line x1="${X(a.vol)}" y1="${Y(a.ret)}" x2="${X(b.vol)}" y2="${Y(b.ret)}" stroke="var(--fg)" stroke-opacity=".5" stroke-width="1.5" stroke-dasharray="2 4"/>`;
  g+=`<g class="pt"><rect x="${X(a.vol)-7}" y="${Y(a.ret)-7}" width="14" height="14" transform="rotate(45 ${X(a.vol)} ${Y(a.ret)})" fill="var(--fg)" stroke="var(--solid)" stroke-width="2"/><text x="${X(a.vol)+12}" y="${Y(a.ret)+18}" style="fill:var(--fg)">${O.base.label}</text><title>Prima (${O.base.label}): ${fmtPct(a.ret,1)} · ${fmtPct(a.vol,1)}</title></g>`;
  g+=`<g class="pt"><circle cx="${X(b.vol)}" cy="${Y(b.ret)}" r="16" fill="var(--lime)" opacity=".22" class="endpt" style="--k:1"/><circle cx="${X(b.vol)}" cy="${Y(b.ret)}" r="8" fill="var(--lime)" stroke="var(--lime-ink)" stroke-width="2"/><text x="${X(b.vol)-12}" y="${Y(b.ret)-14}" text-anchor="end" style="fill:var(--fg);font-weight:700">${O.modeLabel}</text><title>Ottimizzato (${O.modeLabel}): ${fmtPct(b.ret,1)} · ${fmtPct(b.vol,1)}</title></g>`;
  $("#opChart").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Frontiera efficiente: volatilità sull'asse orizzontale, rendimento atteso su quello verticale">${g}</svg>`;
  $("#opLegend").innerHTML=`<span><i style="background:var(--lime);height:4px"></i>frontiera efficiente</span>${cloud.length?`<span><i style="background:var(--c2);opacity:.5;height:8px;width:8px;border-radius:50%"></i>portafogli casuali</span>`:""}${shp>0?`<span><i style="background:var(--warn)"></i>linea di allocazione del capitale</span>`:""}<span><i style="background:var(--fg);height:8px;width:8px"></i>prima</span><span><i style="background:var(--lime);height:10px;width:10px;border-radius:50%"></i>ottimizzato</span>`;
  $("#opCap").textContent=`Ogni punto della linea lime è il massimo rendimento storico ottenibile per quel livello di volatilità, con i vincoli scelti. I puntini sono ${cloud.length?cloud.length+" portafogli casuali: nessuno sta sopra la frontiera.":"nascosti con le vendite allo scoperto."} ${shp>0?`La linea tratteggiata parte dal tasso privo di rischio (${fmtPct(O.rf,2)}) e tocca la frontiera nel portafoglio a massimo Sharpe (stella).`:""}`;
}
function star(cx,cy,R,r){let d="";for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r:R;d+=(i?"L":"M")+(cx+rr*Math.cos(a)).toFixed(1)+","+(cy+rr*Math.sin(a)).toFixed(1);}return d+"Z";}
function renderOpCmp(){
  const O=S.opt,A=O.A,B=O.B,f=S.ds.freq.f,cell=(k,w,v,cl="")=>`<button type="button" class="cellbtn ${cl}" data-rc="op-${k}-${w}">${v}</button>`;
  const rows=[["ret","Rendimento atteso",x=>fmtPct(x,1),false,true],["vol","Volatilità",x=>fmtPct(x,1),true,true],["sharpe","Sharpe",x=>fmtN(x),false,false],["cagr","CAGR storico",x=>fmtPct(x,1,true),false,true],["mdd","Max drawdown storico",x=>fmtPct(x,1),false,true],["var95",`VaR 95% ${PER[f]||""}`,x=>fmtPct(-x,1),false,true]];
  $("#opCmp").innerHTML=`<thead><tr><th>Misura</th><th>Prima</th><th>Ottimizzato</th><th>Differenza</th></tr></thead><tbody>${rows.map(([k,l,fm,inv,pp])=>{const v=k==="var95"?A[k]-B[k]:B[k]-A[k],good=inv?v<0:v>0;
    return `<tr><td>${l}</td><td>${cell(k,"c",fm(A[k]))}</td><td>${cell(k,"o",fm(B[k]))}</td><td class="mono ${Math.abs(v)<1e-9?"":good?"up":"dn"}">${Math.abs(v)<1e-9?"=":(v>0?"+":"−")+(pp?fmtN(Math.abs(v)*100,1)+" pt":fmtN(Math.abs(v)))}</td></tr>`;}).join("")}</tbody>`;
}
function renderOpWeights(){
  const O=S.opt,ds=S.ds,mx=Math.max(...O.A.w.map(Math.abs),...O.B.w.map(Math.abs),.01);
  $("#opWLab").textContent=`${O.base.label} → ${O.modeLabel}`;
  $("#opWeights").innerHTML=`<div class="leg2"><span><i style="background:var(--c2)"></i>prima</span><span><i style="background:var(--lime)"></i>ottimizzato</span></div>`+ds.assets.map((a,i)=>`<div class="wcmp"><span class="nm">${esc(a.name)}</span><div class="bars">
    <div class="b"><i style="width:${(Math.abs(O.A.w[i])/mx*100).toFixed(1)}%;background:var(--c2)"></i><span>${fmtPct(O.A.w[i],0)}</span></div>
    <div class="b"><i style="width:${(Math.abs(O.B.w[i])/mx*100).toFixed(1)}%;background:${O.B.w[i]<0?"var(--bad)":"var(--lime)"}"></i><span>${fmtPct(O.B.w[i],0)}</span></div></div></div>`).join("")+(O.note?`<p class="caption" style="color:var(--warn)">${esc(O.note)}</p>`:"");
}
function renderOpNotes(){
  const O=S.opt,ds=S.ds,f=ds.freq.f;
  $("#opNotes").innerHTML=[
    `<b>Rendimenti attesi = medie storiche</b>: μ è la media dei rendimenti ${ds.freq.adj} sui ${O.inp.common} periodi comuni × ${f}. È la parte più incerta: piccoli cambi nelle medie spostano molto i pesi ottimali. Per questo l'ottimizzatore tende a concentrarsi sugli asset andati meglio in passato.`,
    `<b>Rischio</b>: covarianza campionaria sugli stessi periodi, annualizzata (Σ × ${f}).`,
    `<b>Problema risolto</b>: min wᵀΣw − λ·μᵀw con Σw = 1 e limiti di peso, per 57 valori di λ (gradiente proiettato accelerato). Massimo Sharpe: ricerca a sezione aurea lungo la frontiera. Target: bisezione su λ.`,
    `<b>Minima volatilità e minima varianza</b> coincidono: minimizzare σ o σ² dà gli stessi pesi.`,
    `<b>Risk parity</b>: ogni asset porta la stessa quota di rischio (contributi uguali). Non usa i rendimenti attesi.`,
    `<b>Vincoli</b>: peso minimo, peso massimo e vendite allo scoperto. Limiti per categoria (azioni, obbligazioni, aree) richiedono una classificazione degli asset che il file non contiene.`,
    `<b>Confronto con prima</b>: rendimento, volatilità e Sharpe sono quelli del modello; CAGR, drawdown e VaR vengono dal portafoglio ottimizzato applicato agli stessi dati storici. È un confronto nel campione: l'ottimizzatore ha già "visto" questi dati, quindi il miglioramento è sovrastimato.`,
    `<b>Non è una previsione né un consiglio</b>: mostra l'allocazione che sarebbe stata efficiente nel passato del file, senza costi né tasse.`
  ].map(x=>`<li>${x}</li>`).join("");
}
function opReceipt(m,who){
  const O=S.opt,ds=S.ds,f=ds.freq.f,P0=who==="c"?O.A:O.B,lab=who==="c"?`Prima · ${O.base.label}`:`Ottimizzato · ${O.modeLabel}`;
  const fx={ret:"μₚ = Σ wᵢ · μᵢ    μᵢ = media dei rendimenti di periodo × f",vol:"σₚ = √( wᵀ Σ w )    Σ = covarianza di periodo × f",sharpe:"Sharpe = (μₚ − rf) / σₚ",cagr:"CAGR = [ Π (1 + rₚ) ]^(f / n) − 1   sui dati storici",mdd:"DD = min ( Wₜ / max(W) − 1 )   sui dati storici",var95:"VaR₉₅ = − quantile al 5% dei rendimenti di periodo storici"}[m];
  const val={ret:fmtPct(P0.ret,2),vol:fmtPct(P0.vol,2),sharpe:fmtN(P0.sharpe),cagr:fmtPct(P0.cagr,2,true),mdd:fmtPct(P0.mdd,2),var95:fmtPct(-P0.var95,2)}[m];
  const name={ret:"Rendimento atteso",vol:"Volatilità",sharpe:"Sharpe",cagr:"CAGR storico",mdd:"Max drawdown storico",var95:"VaR 95%"}[m];
  return {title:`${name} · ${lab}`,value:val,formula:fx+(who==="o"?`\nw = soluzione "${O.modeLabel}" con ${fmtPct(O.lo[0],0)} ≤ wᵢ ≤ ${fmtPct(O.hi[0],0)}`:""),
    kv:[...ds.assets.map((a,i)=>[`${a.name}`,`peso ${fmtPct(P0.w[i],1)} · μ ${fmtPct(O.inp.mu[i],1)} · σ ${fmtPct(Math.sqrt(O.inp.C[i][i]),1)}`]),["Periodi comuni",O.inp.common],["Tasso privo di rischio",O.mm?`${fmtPct(O.rf,2)} · ${O.mm.rfName}`:"0%"]]};
}
let opT=0;
$("#opForm").addEventListener("input",e=>{if(e.target.id==="opShort")return;clearTimeout(opT);opT=setTimeout(()=>{const I=S.opIn;if(!I)return;const v=id=>parseFloat($(id).value);
  if(Number.isFinite(v("#opTarget")))I.target=v("#opTarget");if(Number.isFinite(v("#opMin")))I.min=Math.max(-100,Math.min(100,v("#opMin")));if(Number.isFinite(v("#opMax")))I.max=Math.max(0,Math.min(300,v("#opMax")));renderOpt();},300);});
$("#opForm").addEventListener("submit",e=>e.preventDefault());
$("#opShort").addEventListener("change",e=>{const I=S.opIn;if(!I)return;I.short=e.target.checked;if(I.short&&I.min>=0){I.min=-30;I.max=Math.max(I.max,130);}if(!I.short){I.min=Math.max(0,I.min);I.max=Math.min(100,I.max);}$("#opMin").value=I.min;$("#opMax").value=I.max;renderOpt();});
document.addEventListener("click",e=>{
  const m=e.target.closest("[data-opm]");if(m&&S.opIn){if(S.opIn.mode!==m.dataset.opm){S.opIn.mode=m.dataset.opm;if(m.dataset.opm==="tvol"||m.dataset.opm==="tret")S.opIn.target=null;}renderOpt();return;}
  if(e.target.closest("#opUse")&&S.opt){S.optW={w:S.opt.B.w.slice(),label:S.opt.modeLabel};S.riskW="opt";$("#opUse").textContent="Pesi in uso nelle altre analisi ✓";$("#opUseCap").textContent="Rischio, Simulazioni e Stress test ora usano questi pesi.";}
});

/* ---------- Benchmark (Modulo 6) ---------- */
const BENCHES=[
  {id:"SPY",name:"S&P 500",desc:"ETF SPDR S&P 500 (SPY): 500 grandi aziende USA"},
  {id:"QQQ",name:"Nasdaq-100",desc:"ETF Invesco QQQ: 100 grandi aziende non finanziarie del Nasdaq"},
  {id:"URTH",name:"MSCI World",desc:"ETF iShares MSCI World (URTH): azioni dei paesi sviluppati, quotato dal 2012"},
  {id:"FEZ",name:"Euro Stoxx 50",desc:"ETF SPDR Euro Stoxx 50 (FEZ): 50 grandi aziende dell'area euro, quotato in dollari"},
  {id:"custom",name:"Personalizzato",desc:""}];
S.bnData={};S.fx=null;
async function getJSON(url){
  try{const r=await fetch(url,{signal:AbortSignal.timeout(40000)}),j=await r.json().catch(()=>({}));return r.ok?j:{error:j.error||`Errore del server (${r.status}).`};}
  catch(e){return {error:e instanceof TypeError?"I benchmark si scaricano dal sito pubblicato su Vercel.":"Il server non ha risposto in tempo. Riprova."};}
}
function bnLoad(sym){
  const cur=S.bnData[sym];if(cur)return cur.loading?cur.pr:Promise.resolve();
  const pr=Promise.all([getJSON(`/api/prices?symbol=${encodeURIComponent(sym)}&v=2`),S.fx?Promise.resolve(S.fx):getJSON("/api/fx?ccy=USD")]).then(([d,fx])=>{
    S.bnData[sym]=d;if(!fx.error){S.fx=fx;S.fxErr=null;}else if(!S.fx)S.fxErr=fx.error;
    if(current==="bench")renderBench();if(current==="stress"&&S.stress)renderStress();if(current==="lab"&&S.lab)renderReal();
  });
  S.bnData[sym]={loading:true,pr};return pr;
}
function bnSource(){
  /* → {label,px,kind,meta} oppure {loading} / {error} */
  const B=S.bn,ds=S.ds;
  if(B.pick==="custom"&&B.col!=null&&ds.assets[B.col]){
    const a=ds.assets[B.col],px=new Map();let v=100;ds.dates.forEach((d,k)=>{if(k&&Number.isFinite(a.ret[k]))v*=1+a.ret[k];if(k>=a.first-1)px.set(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`,v);});
    return {label:a.name,px,kind:"col",meta:{desc:`colonna ${a.col} del tuo file`,adjusted:a.role!=="price"?true:null,source:"il tuo file"}};
  }
  const sym=B.pick==="custom"?B.sym:B.pick;if(!sym)return {empty:true};
  const d=S.bnData[sym];if(!d){bnLoad(sym);return {loading:true,sym};}if(d.loading)return {loading:true,sym};if(d.error)return {error:d.error,sym};
  const preset=BENCHES.find(b=>b.id===sym),eur=B.ccy==="EUR";
  if(eur&&!S.fx)return S.fxErr?{error:`Cambio BCE non disponibile: ${S.fxErr}`}:{loading:true,sym};
  return {label:preset?preset.name:sym,sym,px:P.benchPrices(d.points,eur?S.fx.points:null),kind:preset?"preset":"sym",meta:{desc:preset?preset.desc:`simbolo ${sym}`,adjusted:d.adjusted,source:d.source||"Alpha Vantage",first:d.points[0].d,last:d.points[d.points.length-1].d,eur}};
}
/* lo Stress test usa il benchmark scelto (S&P 500 se non ne hai scelto uno) per le crisi fuori dal file */
function ensureBnCr(){
  if(!S.bn)S.bn={pick:"SPY",ccy:"EUR",col:null,sym:""};
  const src=bnSource();if(!src.px)return;
  const key=`${src.sym||src.label}|${S.bn.ccy}`;if(S.bnCr&&S.bnCr.key===key)return;
  const ba=P.benchAsset(src.px);S.bnCr={label:src.label,list:P.CRISES.map(c=>P.crisisAnalysis(ba.dates,[ba.asset],[1],12,c)),ba,key};
}
const bnCovers=id=>{const C=S.bnCr;if(!C)return null;const c=C.list.find(x=>x.id===id);return c&&c.status!=="out"&&c.used?c:null;};
function benchCardLine(id){
  const C=S.bnCr;if(!C)return "";const c=C.list.find(x=>x.id===id);
  return c&&c.status!=="out"&&c.used?`<span class="bm">${esc(C.label)}: <b>${fmtPct(c.mdd,1)}</b>${c.status==="partial"?" (parziale)":""}</span>`:`<span class="bm">${esc(C.label)}: non disponibile</span>`;
}
function renderBench(){
  const box=$("#bnBox"),empty=$("#bnEmpty");
  if(!S.lab||!S.ds||!S.ds.ok){box.hidden=true;empty.hidden=false;$("#bnW").innerHTML="";return;}
  box.hidden=false;empty.hidden=true;
  const ds=S.ds,f=ds.freq.f;
  if(!S.bn)S.bn={pick:"SPY",ccy:"EUR",col:null,sym:""};
  if(!S.riskW)S.riskW=S.portfolio?"now":"equal";
  const B=S.bn,{w,label}=riskWeights();
  $("#bnW").innerHTML=wOpts().map(o=>`<button type="button" data-rw="${o[0]}" aria-pressed="${S.riskW===o[0]}">${o[1]}</button>`).join("");
  $("#bnPick").innerHTML=BENCHES.map(b=>`<button type="button" data-bnp="${b.id}" aria-pressed="${B.pick===b.id}">${b.name}${b.id!=="custom"?`<span class="bn-sym">${b.id}</span>`:""}</button>`).join("");
  document.querySelectorAll("#bnCcy [data-bcc]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.bcc===B.ccy)));
  $("#bnCustomBox").hidden=B.pick!=="custom";
  if(B.pick==="custom"&&!$("#bnCol").options.length||$("#bnCol").dataset.n!==String(ds.assets.length)){$("#bnCol").innerHTML=`<option value="">— scegli —</option>`+ds.assets.map((a,i)=>`<option value="${i}">${esc(a.name)}</option>`).join("");$("#bnCol").dataset.n=ds.assets.length;}
  if(B.col!=null)$("#bnCol").value=String(B.col);
  $("#bnCcy").parentElement.hidden=B.pick==="custom"&&B.col!=null;
  const src=bnSource(),st=$("#bnStatus"),clear=()=>{["#bnKpis","#bnGrow","#bnRoll","#bnTable","#bnCrises","#bnLegend","#bnNotes"].forEach(id=>$(id).innerHTML="");["#bnRollCap","#bnCrCap"].forEach(id=>$(id).textContent="");};
  st.classList.remove("err");
  if(src.empty){st.textContent="Scegli una colonna del tuo file o scrivi un simbolo.";clear();S.bnRes=null;return;}
  if(src.loading){st.textContent=`Scarico lo storico di ${src.sym}${B.ccy==="EUR"?" e il cambio euro/dollaro della BCE":""}…`;clear();return;}
  if(src.error){st.classList.add("err");st.textContent=src.error+(/Limite/i.test(src.error)?" Intanto puoi usare come benchmark una colonna del tuo file (Personalizzato).":"");clear();S.bnRes=null;return;}
  const mm=macroFor(S.rfSrc),rf=mm?mm.rf:0,pret=pfAsset(w,"p").ret,al=P.benchAlign(ds.dates,f,pret,src.px),bs=P.benchStats(al.p,al.b,al.fc,rf);
  st.textContent=`${src.meta.desc}${src.meta.first?` · dati ${src.meta.first.slice(0,7)} – ${src.meta.last.slice(0,7)}`:""}${src.kind!=="col"?` · ${src.meta.eur?"convertito in euro con il cambio BCE di fine mese":"nella valuta di quotazione"} · fonte ${src.meta.source}`:""}.`;
  /* crisi: il benchmark su tutta la sua storia, il portafoglio solo dove il file le copre */
  const ba=P.benchAsset(src.px);
  const crList=P.CRISES.map(c=>({c,b:P.crisisAnalysis(ba.dates,[ba.asset],[1],12,c),p:P.crisisAnalysis(ds.dates,ds.assets,w,f,c)}));
  S.bnCr={label:src.label,list:crList.map(x=>x.b),ba,key:`${src.sym||src.label}|${B.ccy}`};
  S.bnRes={src,al,bs,w,label,rf,mm,crList};
  $("#bnSub").textContent=bs.error?bs.error:`${src.label} contro il portafoglio con ${label}, su ${unitN(bs.n,al.fc)} in comune (${al.keys[0]} – ${al.keys[al.keys.length-1]}).`;
  if(bs.error){clear();$("#bnKpis").innerHTML=`<div class="kpi"><span class="eyebrow">Storia comune troppo corta</span><span class="v txt">${esc(bs.error)}</span>${rebuildHint()}</div>`;renderBnCrises();renderBnNotes();return;}
  const sgn=(x,d=1)=>fmtPct(x,d,true),btn=(k,v)=>`<button type="button" class="v" data-rc="bn-${k}-r">${v}</button>`;
  $("#bnKpis").innerHTML=[
    ["Rendimento annuo in più",btn("active",sgn(bs.active)),`${fmtPct(bs.cagrP,1,true)} contro ${fmtPct(bs.cagrB,1,true)} del benchmark`],
    ["Beta",btn("beta",fmtN(bs.beta)),bs.beta>1.05?"più reattivo del mercato":bs.beta<.95?"meno reattivo del mercato":"si muove come il mercato"],
    ["Tracking error",btn("te",fmtPct(bs.te,1)),"quanto ti discosti dal benchmark ogni anno"],
    ["Information ratio",btn("ir",fmtN(bs.ir)),"extra-rendimento per unità di scostamento"]
  ].map(k=>`<div class="kpi"><span class="eyebrow">${k[0]}</span>${k[1]}<span class="sub">${k[2]}</span></div>`).join("");
  drawBnGrow();drawBnRoll();renderBnTable();renderBnCrises();renderBnNotes();
  if(current==="bench")Morph.shape("bench");
}
function drawBnGrow(){
  const R=S.bnRes,al=R.al,n=al.keys.length,VW=900,VH=300,ml=50,mr=16,mt=14,mb=28,iw=VW-ml-mr,ih=VH-mt-mb;
  const cum=a=>{let v=100;return [100,...a.map(x=>v*=1+x)];},P1=cum(al.p),B1=cum(al.b),all=[...P1,...B1],lo=Math.min(...all)*.96,hi=Math.max(...all)*1.03;
  R.gP=P1;R.gB=B1;
  const X=i=>ml+i/n*iw,Y=v=>mt+ih-(v-lo)/(hi-lo)*ih;let g="";
  niceTicks(lo,hi,5).filter(v=>v>=lo&&v<=hi).forEach(v=>{g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)"/><text x="${ml-8}" y="${(Y(v)+4).toFixed(1)}" text-anchor="end">${fmtN(v,0)}</text>`;});
  const yrs=[...new Set(al.keys.map(k=>k.slice(0,4)))],step=yrs.length>24?5:yrs.length>12?3:yrs.length>6?2:1;
  al.keys.forEach((k,i)=>{if(k.endsWith("-01")||i===0){const y=+k.slice(0,4);if(y%step===0){const x=X(i+1);if(x>ml+14&&x<VW-mr-14)g+=`<text x="${x.toFixed(1)}" y="${VH-8}" text-anchor="middle">${y}</text>`;}}});
  let a="";P1.forEach((v,i)=>{a+=(i?"L":"M")+X(i).toFixed(1)+","+Y(v).toFixed(1);});for(let i=n;i>=0;i--)a+="L"+X(i).toFixed(1)+","+Y(B1[i]).toFixed(1);
  g+=`<path d="${a}Z" fill="${P1[n]>=B1[n]?"var(--good)":"var(--bad)"}" opacity=".1" class="area"/>`;
  const line=(arr,st,k)=>{let d="";arr.forEach((v,i)=>{d+=(i?"L":"M")+X(i).toFixed(1)+","+Y(v).toFixed(1);});return `<path d="${d}" fill="none" ${st} pathLength="1" class="draw" style="--k:${k}"/>`;};
  g+=line(B1,`stroke="var(--c3)" stroke-width="2.2"`,1)+line(P1,`stroke="var(--lime)" stroke-width="3"`,0);
  g+=`<text x="${X(n)-6}" y="${Y(P1[n])-8}" text-anchor="end" style="fill:var(--fg);font-weight:700">${fmtN(P1[n],0)}</text><text x="${X(n)-6}" y="${Y(B1[n])+16}" text-anchor="end" style="fill:var(--c3);font-weight:700">${fmtN(B1[n],0)}</text>`;
  $("#bnGrow").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Crescita di 100 euro: portafoglio contro ${esc(R.src.label)}">${g}</svg>`;
  $("#bnLegend").innerHTML=`<span><i style="background:var(--lime);height:3px"></i>Portafoglio (${esc(R.label)})</span><span><i style="background:var(--c3);height:3px"></i>${esc(R.src.label)}</span>`;
  $("#bnGrowLab").textContent=`base 100 · ${al.keys[0]} – ${al.keys[n-1]}`;
}
function drawBnRoll(){
  const R=S.bnRes,bs=R.bs,al=R.al,r=bs.roll,n=r.length,VW=640,VH=250,ml=44,mr=10,mt=12,mb=28,iw=VW-ml-mr,ih=VH-mt-mb;
  if(!n){$("#bnRoll").innerHTML="";return;}
  const lo=Math.min(0,...r)*1.1,hi=Math.max(0,...r)*1.1||.01,Y=v=>mt+ih-(v-lo)/((hi-lo)||1)*ih,bw=iw/n;let g="";
  niceTicks(lo,hi,4).filter(v=>v>=lo&&v<=hi).forEach(v=>{g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)"/><text x="${ml-6}" y="${(Y(v)+4).toFixed(1)}" text-anchor="end">${fmtPct(Math.abs(v)<1e-9?0:v,0,true)}</text>`;});
  r.forEach((v,i)=>{const y0=Y(0),y1=Y(v);g+=`<rect x="${(ml+i*bw).toFixed(2)}" y="${Math.min(y0,y1).toFixed(1)}" width="${Math.max(.6,bw-.6).toFixed(2)}" height="${Math.abs(y1-y0).toFixed(1)}" fill="${v>=0?"var(--good)":"var(--bad)"}" opacity=".8"><title>${al.keys[i+bs.win-1]}: ${fmtPct(v,1,true)} sugli ultimi ${unitN(bs.win,al.fc)}</title></rect>`;});
  [0,Math.floor(n/2),n-1].forEach(i=>{g+=`<text x="${(ml+i*bw+bw/2).toFixed(1)}" y="${VH-8}" text-anchor="${i===0?"start":i===n-1?"end":"middle"}">${al.keys[i+bs.win-1]}</text>`;});
  $("#bnRoll").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Rendimento del portafoglio rispetto al benchmark su finestre mobili di 12 mesi">${g}</svg>`;
  const pos=r.filter(v=>v>0).length;
  $("#bnRollLab").textContent=`finestre mobili di ${unitN(bs.win,al.fc)}`;
  $("#bnRollCap").textContent=`Ogni barra è quanto il portafoglio ha fatto meglio (verde) o peggio (rosso) del benchmark negli ultimi ${unitN(bs.win,al.fc)}. Sopra in ${pos} finestre su ${n} (${fmtPct(pos/n,0)}).`;
}
function renderBnTable(){
  const bs=S.bnRes.bs,c=(k,v,cl="")=>`<button type="button" class="cellbtn ${cl}" data-rc="bn-${k}-r">${v}</button>`;
  const two=[["cagr","CAGR",x=>fmtPct(x,1,true)],["tot","Rendimento totale",x=>fmtPct(x,1,true)],["vol","Volatilità",x=>fmtPct(x,1)],["sharpe","Sharpe",x=>fmtN(x)],["mdd","Max drawdown",x=>fmtPct(x,1)]];
  const key={cagr:["cagrP","cagrB"],tot:["totP","totB"],vol:["volP","volB"],sharpe:["sharpeP","sharpeB"],mdd:["mddP","mddB"]};
  const rel=[["beta","Beta (IC 95%)",`${fmtN(bs.beta)} (${fmtN(bs.betaLo)} – ${fmtN(bs.betaHi)})`],["alpha","Alpha di Jensen (annuo)",`${fmtPct(bs.alpha,2,true)} · ${bs.pAlpha<.05?"significativo":"non significativo"} (p ${fmtN(bs.pAlpha,2)})`],["r2","R² (quanto spiega il mercato)",fmtPct(bs.r2,0)],["te","Tracking error",fmtPct(bs.te,1)],["ir","Information ratio",fmtN(bs.ir)],["up","Cattura nei rialzi",fmtPct(bs.up,0)],["down","Cattura nei ribassi",fmtPct(bs.down,0)],["hit","Periodi sopra il benchmark",fmtPct(bs.hit,0)]];
  $("#bnTable").innerHTML=`<thead><tr><th>Misura</th><th>Portafoglio</th><th>${esc(S.bnRes.src.label)}</th></tr></thead><tbody>${two.map(([k,l,fm])=>`<tr><td>${l}</td><td>${c(k+"P",fm(bs[key[k][0]]))}</td><td>${c(k+"B",fm(bs[key[k][1]]))}</td></tr>`).join("")}
    ${rel.map(([k,l,v])=>`<tr><td>${l}</td><td colspan="2" style="text-align:center">${c(k,v)}</td></tr>`).join("")}</tbody>`;
}
function renderBnCrises(){
  const R=S.bnRes,f=S.ds.freq.f,rows=R.crList;
  $("#bnCrLab").textContent=`${R.src.label} su tutta la sua storia`;
  $("#bnCrises").innerHTML=`<thead><tr><th>Crisi</th><th>${esc(R.src.label)}: perdita massima</th><th>Tempo per il fondo</th><th>Recupero</th><th>Il tuo portafoglio</th></tr></thead><tbody>${rows.map(({c,b,p})=>{
    const bOk=b.status!=="out"&&b.used,pOk=p.status!=="out"&&p.used;
    return `<tr><td><span class="an">${esc(c.name)}</span></td><td>${bOk?`<span class="neg">${fmtPct(b.mdd,1)}</span>${b.status==="partial"?" · parziale":""}`:"fuori dallo storico"}</td><td>${bOk?unitN(b.toTrough,12):"—"}</td><td>${bOk?(b.recK!=null?unitN(b.recPeriods,12):"non recuperato nei dati"):"—"}</td><td>${pOk?`<span class="neg">${fmtPct(p.mdd,1)}</span>`:`<span style="color:var(--faint)">non nel tuo file</span>`}</td></tr>`;}).join("")}</tbody>`;
  const n=rows.filter(x=>x.b.status!=="out"&&x.b.used).length,m=rows.filter(x=>x.p.status!=="out"&&x.p.used).length;
  $("#bnCrCap").textContent=`Il benchmark copre ${n} crisi su 5, il tuo file ${m}. Per le crisi che il file non contiene vedi come si è comportato il mercato, non il tuo portafoglio: non lo ricostruisco con dati inventati. Le perdite del benchmark compaiono anche nelle schede dello Stress test.`;
}
function renderBnNotes(){
  const R=S.bnRes,m=R.src.meta;
  $("#bnNotes").innerHTML=[
    R.src.kind==="col"?`<b>Benchmark dal tuo file</b>: la colonna «${esc(R.src.label)}» è usata come indice, nella stessa valuta del file.`:`<b>Indice tramite ETF</b>: ${esc(m.desc)}. ${m.adjusted?"Prezzi rettificati per dividendi e frazionamenti (rendimento totale), al netto dei costi dell'ETF.":"Prezzi non rettificati: i dividendi non sono inclusi, il benchmark è sottostimato."}`,
    R.src.kind!=="col"?(m.eur?`<b>Valuta</b>: prezzi in dollari convertiti in euro con il cambio BCE di fine mese, così il confronto include l'effetto del cambio come per un investitore europeo.`:`<b>Valuta</b>: benchmark nella valuta di quotazione. Se il tuo file è in euro, la differenza include anche il cambio.`):`<b>Valuta</b>: la stessa del file.`,
    `<b>Stessi periodi</b>: solo i ${unitN(R.bs.n||0,R.al.fc)} in cui ci sono sia il portafoglio sia il benchmark. ${S.ds.freq.f>12?"Con dati giornalieri o settimanali i rendimenti sono composti per mese; primo e ultimo mese, parziali, sono esclusi.":""}`,
    `<b>Beta e alpha</b>: regressione dei rendimenti di periodo sul benchmark. Alpha di Jensen = (r̄ₚ − rf/f − β·(r̄ᵦ − rf/f))·f, con rf ${R.mm?`${fmtPct(R.rf,2)} (${R.mm.rfName})`:"0%"}.`,
    `<b>Tracking error e information ratio</b>: deviazione standard e media della differenza di rendimento, annualizzate.`,
    `<b>Crisi</b>: il benchmark è analizzato su tutta la sua storia con le stesse finestre dello Stress test (dati mensili).`,
    `<b>Fonte e limiti</b>: Alpha Vantage, piano gratuito con poche richieste al giorno; ogni serie resta in memoria 24 ore per tutti i visitatori.`,
    `<b>Storico, non previsione</b>: battere o no il benchmark in passato non dice cosa succederà.`
  ].map(x=>`<li>${x}</li>`).join("");
}
function bnReceipt(m){
  const R=S.bnRes,bs=R.bs,al=R.al,fc=al.fc;
  const base=[["Benchmark",R.src.label],["Periodi in comune",bs.n],["Periodo",`${al.keys[0]} – ${al.keys[al.keys.length-1]}`],["Portafoglio",R.label],["Frequenza",`f = ${fc}`]];
  const M={
    active:["Rendimento annuo in più",fmtPct(bs.active,2,true),"CAGRₚ − CAGRᵦ",[["CAGR portafoglio",fmtPct(bs.cagrP,2,true)],["CAGR benchmark",fmtPct(bs.cagrB,2,true)]]],
    beta:["Beta",fmtN(bs.beta,3),"β = cov(rₚ, rᵦ) / var(rᵦ)   (regressione OLS dei rendimenti in eccesso)\nIC 95% = β ± t₀,₉₇₅(n−2) · SE(β),  SE(β) = sₑ / √Σ(rᵦ − r̄ᵦ)²",[["IC 95%",`${fmtN(bs.betaLo,3)} – ${fmtN(bs.betaHi,3)}`],["Errore standard",fmtN(bs.seBeta,3)],["p-value di β = 1",fmtN(bs.pBeta1,3)],["Correlazione",fmtN(bs.corr,3)],["Volatilità residua (annua)",fmtPct(bs.resVol,2)]]],
    alpha:["Alpha di Jensen",fmtPct(bs.alpha,2,true),"α = (r̄ₚ − rf/f − β·(r̄ᵦ − rf/f)) · f   (intercetta della regressione OLS)\nt = α / SE(α) con n − 2 gradi di libertà;  significativo se p < 0,05",[["IC 95%",`${fmtPct(bs.alphaLo,2,true)} – ${fmtPct(bs.alphaHi,2,true)}`],["Errore standard (annuo)",fmtPct(bs.seAlpha,2)],["t",fmtN(bs.tAlpha,2)],["p-value",fmtN(bs.pAlpha,3)],["Gradi di libertà",bs.df],["Beta",fmtN(bs.beta,3)],["Tasso privo di rischio",fmtPct(R.rf,2)]]],
    r2:["R²",fmtPct(bs.r2,1),"R² = ρ²   quota della variabilità spiegata dal benchmark",[["Correlazione",fmtN(bs.corr,3)]]],
    te:["Tracking error",fmtPct(bs.te,2),"TE = sd(rₚ − rᵦ) · √f",[]],
    ir:["Information ratio",fmtN(bs.ir),"IR = media(rₚ − rᵦ) · f / TE",[["Tracking error",fmtPct(bs.te,2)]]],
    up:["Cattura nei rialzi",fmtPct(bs.up,1),"media(rₚ | rᵦ > 0) / media(rᵦ | rᵦ > 0)",[]],
    down:["Cattura nei ribassi",fmtPct(bs.down,1),"media(rₚ | rᵦ < 0) / media(rᵦ | rᵦ < 0)\nsotto 100% = perdi meno del mercato nei mesi negativi",[]],
    hit:["Periodi sopra il benchmark",fmtPct(bs.hit,1),"quota dei periodi con rₚ > rᵦ",[]],
    cagrP:["CAGR del portafoglio",fmtPct(bs.cagrP,2,true),"[ Π (1 + rₚ) ]^(f/n) − 1",[]],cagrB:["CAGR del benchmark",fmtPct(bs.cagrB,2,true),"[ Π (1 + rᵦ) ]^(f/n) − 1",[]],
    totP:["Rendimento totale del portafoglio",fmtPct(bs.totP,2,true),"Π (1 + rₚ) − 1",[]],totB:["Rendimento totale del benchmark",fmtPct(bs.totB,2,true),"Π (1 + rᵦ) − 1",[]],
    volP:["Volatilità del portafoglio",fmtPct(bs.volP,2),"sd(rₚ) · √f",[]],volB:["Volatilità del benchmark",fmtPct(bs.volB,2),"sd(rᵦ) · √f",[]],
    sharpeP:["Sharpe del portafoglio",fmtN(bs.sharpeP),"(r̄ₚ · f − rf) / σₚ",[]],sharpeB:["Sharpe del benchmark",fmtN(bs.sharpeB),"(r̄ᵦ · f − rf) / σᵦ",[]],
    mddP:["Max drawdown del portafoglio",fmtPct(bs.mddP,2),"min ( Wₜ / max(W) − 1 )",[]],mddB:["Max drawdown del benchmark",fmtPct(bs.mddB,2),"min ( Wₜ / max(W) − 1 )",[]]
  }[m]||[m,"—","",[]];
  return {title:M[0],value:M[1],formula:M[2]+"\nrendimenti di periodo sugli stessi mesi"+(R.src.meta.eur?", benchmark convertito in euro":""),kv:[...M[3],...base]};
}
document.addEventListener("click",e=>{
  const p=e.target.closest("[data-bnp]");if(p&&S.bn){S.bn.pick=p.dataset.bnp;renderBench();return;}
  const c=e.target.closest("[data-bcc]");if(c&&S.bn){S.bn.ccy=c.dataset.bcc;renderBench();return;}
  if(e.target.closest("#bnSymGo")&&S.bn){const v=$("#bnSym").value.trim().toUpperCase();if(!/^[A-Z0-9][A-Z0-9.\-]{0,19}$/.test(v)){$("#bnStatus").textContent="Simbolo non valido, per esempio VT o IWDA.LON.";return;}S.bn.sym=v;S.bn.col=null;$("#bnCol").value="";renderBench();}
});
$("#bnSym").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("#bnSymGo").click();}});
$("#bnCol").addEventListener("change",e=>{if(!S.bn)return;S.bn.col=e.target.value===""?null:+e.target.value;if(S.bn.col!=null)S.bn.sym="";renderBench();});

/* ---------- Il tuo rendimento reale: transazioni del file + rendimenti degli strumenti ---------- */
function detectTx(sheets){
  let best=null;
  sheets.forEach((s,si)=>{
    const an=P.analyzeSheet(s.name,s.aoa),h=an.headerRow;if(h<0)return;
    const hd=(s.aoa[h]||[]).map(v=>String(v==null?"":v).trim()),find=re=>hd.findIndex(x=>re.test(x));
    const dI=an.cols.find(c=>c.suggest==="date"||c.kind==="date"),cD=dI?dI.idx:find(/^data\b|date/i);
    const cT=find(/^(etf|ticker|strumento|titolo|simbolo|asset|prodotto|isin)\b|\bticker\b|\betf\b/i),cA=find(/importo|controvalore|ammontare|amount|valore operazione|^investit/i);
    const cU=find(/^quote$|^quote\b|quantit|shares|units|pezzi/i),cP=find(/^prezzo|price/i),cY=find(/^tipo|operazione|^type|movimento|segno/i);
    if(cD<0||cT<0||(cA<0&&(cU<0||cP<0)))return;
    const rows=[];
    for(let r=h+1;r<s.aoa.length;r++){const row=s.aoa[r]||[],d=P.parseDate(row[cD],true),tk=String(row[cT]==null?"":row[cT]).trim(),ty=cY>=0?String(row[cY]==null?"":row[cY]).trim():"";
      if(!d||!tk||/^[—–-]+$/.test(tk)||/totale|valore oggi|saldo/i.test(ty+" "+tk))continue;
      let amt=cA>=0?P.parseNum(row[cA]):null;amt=amt?amt.n:NaN;
      if(!Number.isFinite(amt)&&cU>=0&&cP>=0){const u=P.parseNum(row[cU]),p=P.parseNum(row[cP]);if(u&&p)amt=u.n*p.n;}
      if(!Number.isFinite(amt)||amt===0)continue;
      const sell=/vend|sell|riscatt|prelie|rimbors/i.test(ty);
      rows.push({d,ticker:tk,type:ty,amount:sell?-Math.abs(amt):Math.abs(amt)});}
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
  const ds=S.ds,names=ds.assets.map(a=>a.name),tx=S.tx.rows.map(x=>({...x,i:txMatch(x.ticker,names)}));
  const pp=P.personalPerformance(ds.dates,ds.assets,tx);if(pp.error)return {error:pp.error,tx};
  return {pp,tx};
}
function renderReal(){
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
  S.real={...R,bm,src};
  const pos=pp.gain>=0;
  el.innerHTML=`<div class="head"><div><span class="eyebrow">Dalle tue ${pp.used} transazioni · foglio «${esc(S.tx.sheet)}» · dal ${fmtDate(ds.dates[pp.first],f)}</span><h3 style="margin-top:4px">Il tuo rendimento reale</h3></div><span class="chip hist"><i></i>versamenti veri</span></div>
    <div class="real-k">
      <div class="k"><span>Rendimento annuo (TIR)</span>${c("xirr",fmtPct(pp.xirr,1,true))}<small>tiene conto di quando hai versato ogni euro</small></div>
      <div class="k"><span>Valore stimato oggi</span>${c("value",fmtEur(pp.value))}<small>al ${fmtDate(ds.dates[ds.dates.length-1],f)}</small></div>
      <div class="k"><span>Versato</span>${c("inv",fmtEur(pp.invested))}<small>somma degli acquisti${pp.invested!==R.tx.filter(x=>x.i>=0&&x.amount>0).reduce((s,x)=>s+x.amount,0)?", meno le vendite":""}</small></div>
      <div class="k"><span>Guadagno</span>${c("gain",`<span class="${pos?"up":"dn"}">${pos?"+":"−"}${fmtEur(Math.abs(pp.gain))}</span>`)}<small>${fmtPct(pp.gainPct,1,true)} sul versato</small></div>
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
  drawReal();
}
function drawReal(){
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
  $("#realChart").innerHTML=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Valore del portafoglio con i versamenti veri, confrontato con il versato">${g}</svg>`;
  $("#realLeg").innerHTML=`<span><i style="background:var(--lime);height:3px"></i>valore del tuo portafoglio</span><span><i style="background:var(--muted)"></i>soldi versati</span>${bmS?`<span><i style="background:var(--c3);height:3px"></i>stessi versamenti in ${esc(R.bm.label)}</span>`:""}`;
}
function realReceipt(m){
  const R=S.real,pp=R.pp,ds=S.ds,f=ds.freq.f;
  const base=[["Transazioni usate",pp.used],["Foglio",S.tx.sheet],["Colonne",`${S.tx.cols.data} · ${S.tx.cols.strumento} · ${S.tx.cols.importo}${S.tx.cols.tipo?" · "+S.tx.cols.tipo:""}`],["Valutazione al",fmtDate(ds.dates[ds.dates.length-1],f)]];
  const M={
    xirr:["Rendimento annuo (TIR)",fmtPct(pp.xirr,2,true),"Σ flussoᵢ / (1 + TIR)^(giorniᵢ / 365) = 0\nversamenti negativi alla loro data, valore di oggi positivo",[["Versato",fmtEur(pp.invested)],["Valore oggi",fmtEur(pp.value)]]],
    value:["Valore stimato oggi",fmtEur(pp.value),"Vᵢ,ₜ = Vᵢ,ₜ₋₁ · (1 + rᵢ,ₜ) + versamentiᵢ,ₜ\nsomma su tutti gli strumenti",ds.assets.map((a,i)=>pp.byAsset[i].invested?[a.name,`${fmtEur(pp.byAsset[i].value)} (versati ${fmtEur(pp.byAsset[i].invested)})`]:null).filter(Boolean)],
    inv:["Versato",fmtEur(pp.invested),"Σ acquisti − Σ vendite",[]],
    gain:["Guadagno",fmtEur(pp.gain),"Valore oggi − Versato",[["Sul versato",fmtPct(pp.gainPct,2,true)]]],
    twr:["Rendimento ponderato nel tempo",fmtPct(pp.twr,2,true),"Rₜ = Σ Vᵢ,ₜ₋₁ · rᵢ,ₜ / Σ Vᵢ,ₜ₋₁    TWR = Π (1 + Rₜ) − 1\nnon dipende da quanto e quando hai versato: misura le tue scelte di strumenti",[["Annualizzato",pp.years>=1?fmtPct(pp.twrAnn,2,true):"periodo inferiore a un anno"],["Massimo calo",fmtPct(pp.mdd,2)]]]
  }[m]||[m,"—","",[]];
  return {title:M[0],value:M[1],formula:M[2],kv:[...M[3],...base]};
}
/* storia corta: la frontiera e il benchmark riguardano gli strumenti, non da quanto li possiedi */
function rebuildHint(){
  if(!S.source||S.source.kind==="rebuilt"||!(S.tx||S.sheets.some(s=>s.tracker)))return "";
  return `<div class="rebuild-hint"><span class="caption">Il tuo file ha pochi mesi, ma gli ETF esistono da anni: con i loro prezzi di mercato hai molta più storia.</span><button type="button" class="btn sm lime" data-rebuild>Usa i prezzi di mercato degli ETF</button></div>`;
}
document.addEventListener("click",e=>{if(!e.target.closest("[data-rebuild]"))return;go("map");if(!S.und||S.und.status==="error")requestUnderstand();});

/* ---------- Analista in chat: l'IA capisce, il motore calcola ---------- */
S.chat=[];S.chatView=[];let chatBusy=false;
const TOOL_L={panoramica:"panoramica dei dati",metriche:"metriche per asset",rischio_portafoglio:"rischio del portafoglio",confronta_pesi:"confronto tra allocazioni",correlazioni:"correlazioni",macro:"tassi e inflazione",portafoglio_utente:"il tuo portafoglio",monte_carlo:"simulazione Monte Carlo",crisi_storiche:"crisi storiche",stress_shock:"stress test",ottimizza:"frontiera efficiente",confronta_benchmark:"confronto con il benchmark"};
function openChat(){$("#chat").classList.add("open");$("#chat").setAttribute("aria-hidden","false");document.body.classList.add("chat-on");renderChat();setTimeout(()=>$("#chatIn").focus(),300);}
function closeChat(){$("#chat").classList.remove("open");$("#chat").setAttribute("aria-hidden","true");document.body.classList.remove("chat-on");setTimeout(()=>$("#chatBtn").focus({preventScroll:true}),350);}
const orbBusy=on=>document.querySelectorAll(".orb").forEach(o=>o.classList.toggle("busy",on));
$("#chatBtn").addEventListener("click",()=>$("#chat").classList.contains("open")?closeChat():openChat());
$("#chatClose").addEventListener("click",closeChat);
$("#chatNew").addEventListener("click",()=>{if(chatBusy)return;S.chat=[];S.chatView=[];renderChat();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("#chat").classList.contains("open"))closeChat();});
function chatContext(){
  if(!S.ds||!S.ds.ok)return "nessun dataset confermato";
  return `file «${S.source.name}», ${S.ds.assets.length} asset (${S.ds.assets.map(a=>a.name).join(", ")}), ${S.ds.nObs} osservazioni ${S.ds.freq.adj}, pesi selezionati nell'app: ${S.risk?S.risk.wLabel:(S.portfolio?"pesi attuali dell'utente":"pesi uguali")}${S.portfolio?", l'utente ha caricato un riepilogo con i suoi pesi":""}`;
}
function md(t){
  const lines=esc(t||"").replace(/\*\*(.+?)\*\*/g,"<b>$1</b>").split(/\n+/);let h="",list=false;
  lines.forEach(l=>{const m=l.match(/^\s*[-*•]\s+(.*)$/);if(m){if(!list){h+="<ul>";list=true;}h+=`<li>${m[1]}</li>`;}else{if(list){h+="</ul>";list=false;}if(l.trim())h+=`<p>${l}</p>`;}});
  return h+(list?"</ul>":"");
}
function chatSuggestions(){
  if(!S.lab)return [];
  const n=S.ds.assets.map(a=>a.name),s=["Qual è l'asset più rischioso?","Riassumi il portafoglio in tre punti","Quanto si è perso nel periodo peggiore?"];
  s.splice(1,2,"Come ha retto il portafoglio nelle crisi?","Con 300 € al mese, quanto avrei tra 15 anni?");
  if(n.length>=2)s.splice(1,0,"Qual è l'allocazione più efficiente con massimo 50% per asset?");
  if(n.length>=2)s.push(`E se metto il 70% in ${n[0]} e il 30% in ${n[n.length-1]}?`);
  if(S.portfolio)s.unshift("I miei pesi target riducono il rischio?");
  return s.slice(0,4);
}
function renderChat(){
  const log=$("#chatLog");if(!log)return;
  if(!S.lab){
    log.innerHTML=`<div class="msg ai"><p>Ciao! Sono <b>Quanta</b>, l'analista IA di Portfolio OS. Per rispondere ho bisogno dei tuoi dati: carica un file, conferma la mappa e costruisci il laboratorio.</p></div><div><button type="button" class="btn sm lime" data-go="map">Vai alla mappa</button></div>`;
    $("#chatSugg").innerHTML="";return;
  }
  const intro=`<div class="msg ai"><p>Ciao! Chiedimi qualsiasi cosa su <b>${esc(S.source.name)}</b>: rischio, rendimenti, correlazioni, oppure "e se cambiassi i pesi?". Ogni numero lo prendo dal motore di calcolo.</p></div>`;
  log.innerHTML=intro+S.chatView.map(v=>v.k==="user"?`<div class="msg user">${esc(v.t)}</div>`
    :v.k==="tool"?`<span class="toolchip"><i></i>calcolo: ${esc(v.t)}</span>`
    :v.k==="typing"?`<div class="typing" aria-label="Quanta sta rispondendo"><i></i><i></i><i></i></div>`
    :v.k==="error"?`<div class="msg err">${esc(v.t)}</div>`
    :`<div class="msg ai">${md(v.t)}<span class="by">Quanta · numeri dal motore</span></div>`).join("");
  log.scrollTop=log.scrollHeight;
  $("#chatSugg").innerHTML=S.chatView.length?"":chatSuggestions().map(q=>`<button type="button" data-ask="${esc(q)}">${esc(q)}</button>`).join("");
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-ask]");if(b)askChat(b.dataset.ask);});
$("#chatForm").addEventListener("submit",e=>{e.preventDefault();const t=$("#chatIn").value;$("#chatIn").value="";askChat(t);});
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
  portafoglio_utente:()=>S.portfolio?{da_file:S.portfolio.from,posizioni:S.portfolio.positions.map(p=>({nome:p.nome,ticker:p.ticker,valore:p.valore==null?null:`${fmtN(p.valore)} €`,peso_attuale:p.pesoAttuale==null?null:fmtPct(p.pesoAttuale,1),peso_target:p.pesoTarget==null?null:fmtPct(p.pesoTarget,1)}))}:{nota:"Nessun riepilogo di portafoglio caricato: si usano pesi uguali o quelli indicati nella domanda."}
};
async function askChat(text){
  text=String(text||"").trim();
  if(chatBusy||!text)return;
  if(!S.lab){renderChat();return;}
  chatBusy=true;$("#chatSend").disabled=true;orbBusy(true);
  S.chat.push({role:"user",text});S.chatView.push({k:"user",t:text},{k:"typing"});renderChat();
  try{
    for(let round=0;round<5;round++){
      const r=await fetch("/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:S.chat.slice(-30),context:chatContext()}),signal:AbortSignal.timeout(55000)});
      const j=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(j.error||`Il server ha risposto con un errore (${r.status}).`);
      const calls=Array.isArray(j.calls)?j.calls:[];
      S.chat.push({role:"assistant",text:j.text||"",calls});
      if(calls.length){
        for(const c of calls){
          let result;try{result=await (TOOLS_LOCAL[c.name]||(()=>({error:"strumento sconosciuto"})))(c.args||{});}catch(e){result={error:String(e.message||e)};}
          S.chat.push({role:"tool",id:c.id,name:c.name,result});
          S.chatView.splice(S.chatView.length-1,0,{k:"tool",t:TOOL_L[c.name]||c.name});
        }
        renderChat();continue;
      }
      S.chatView=S.chatView.filter(v=>v.k!=="typing");S.chatView.push({k:"ai",t:j.text,p:j.provider});renderChat();return;
    }
    throw new Error("La domanda ha richiesto troppi passaggi: prova a farla più semplice.");
  }catch(e){
    S.chatView=S.chatView.filter(v=>v.k!=="typing");
    S.chatView.push({k:"error",t:e instanceof TypeError?"Quanta funziona nella versione del sito pubblicata su Vercel.":e.name==="TimeoutError"?"Le IA non hanno risposto in tempo. Riprova.":String(e.message||e)});
    renderChat();
  }finally{chatBusy=false;$("#chatSend").disabled=false;orbBusy(false);}
}

/* ---------- Ricevute ---------- */
function receipt(key){
  const ds=S.ds,L=S.lab,f=ds.freq.f,parts=key.split("-"),kind=parts[0];
  if(kind==="rk"&&S.risk)return riskReceipt(parts[1],parts[2]);
  if(kind==="mc"&&S.mc)return mcReceipt(parts[1],parts[2]);
  if(kind==="st"&&S.stress)return stReceipt(parts[1],parts[2],parts[3]);
  if(kind==="op"&&S.opt)return opReceipt(parts[1],parts[2]);
  if(kind==="bn"&&S.bnRes)return bnReceipt(parts[1],parts[2]);
  if(kind==="rl"&&S.real)return realReceipt(parts[1]);
  if(kind==="corr"){
    const i=+parts[1],j=+parts[2],a=ds.assets[i],b=ds.assets[j],c=L.C[i][j];
    return {title:`Correlazione · ${a.name} / ${b.name}`,value:fmtN(c.r),formula:"ρ = Σ (xᵢ − x̄)(yᵢ − ȳ) / √[ Σ (xᵢ − x̄)² · Σ (yᵢ − ȳ)² ]\nx, y = rendimenti di periodo dei due asset",
      kv:[["Coppie di rendimenti usate",c.n],["Regola","solo periodi in cui entrambi hanno un valore"],["Lettura",Number.isFinite(c.r)?(Math.abs(c.r)>=.7?"legame forte":Math.abs(c.r)>=.3?"legame moderato":"legame debole")+(c.r<0?", opposto":""):"—"]]};
  }
  const mm=macroFor(S.rfSrc),rf=mm?mm.rf:0;
  if(kind==="macro"&&mm){
    return parts[1]==="rf"
      ?{title:`Tasso privo di rischio medio · ${mm.rfName}`,value:fmtPct(mm.rf,2),formula:"rf = media dei valori mensili del periodo / 100",kv:[["Serie",mm.rfSeries],["Fonte",mm.source],["Mesi usati",mm.n],["Periodo",`${mm.from} – ${mm.to}`]]}
      :{title:`Inflazione media annua · ${mm.cpiName}`,value:fmtPct(mm.infl,2),formula:"π = (Indice finale / Indice iniziale)^(12 / mesi) − 1",kv:[["Serie",mm.cpiSeries],["Fonte",mm.source],["Indice iniziale",`${fmtN(mm.c0.v)} · ${mm.c0.p}`],["Indice finale",`${fmtN(mm.c1.v)} · ${mm.c1.p}`],["Mesi",mm.months]]};
  }
  if(kind==="pf"&&L.pf&&L.pf[+parts[2]]){
    const r=L.pf[+parts[2]],s=r.st,met=parts[1];
    const v={cagr:fmtPct(s.cagr,2,true),real:mm?fmtPct((1+s.cagr)/(1+mm.infl)-1,2,true):"—",vol:fmtPct(s.vol,2),sharpe:fmtN(s.vol>0?(s.mean*f-rf)/s.vol:NaN),mdd:fmtPct(s.mdd,2)}[met];
    const fx={cagr:"CAGR = [ Π (1 + r_p) ]^(f / n) − 1",real:"Reale = (1 + CAGR) / (1 + π) − 1",vol:"σ_p = dev. standard di r_p · √f",sharpe:"Sharpe = (r̄_p · f − rf) / σ_p",mdd:"DD = min ( W_t / max(W) − 1 )"}[met];
    return {title:`${r.label} · ${({cagr:"Rendimento annuo",real:"Rendimento reale",vol:"Volatilità",sharpe:"Sharpe",mdd:"Massimo drawdown"})[met]}`,value:v,
      formula:"r_p = Σ wᵢ · rᵢ   (ribilanciamento mensile ai pesi wᵢ)\n"+fx,
      kv:[...r.w.map((x,j)=>x>0?[`Peso ${ds.assets[j].name}`,fmtPct(x,1)]:null).filter(Boolean),["Mesi usati",s.n],["Tasso privo di rischio",mm?fmtPct(rf,2):"0%"],["Pesi presi da",S.portfolio.from]]};
  }
  const i=+parts[1],a=ds.assets[i],s=L.st[i];
  const base=[["Osservazioni (rendimenti)",s.n],["Periodo",`${fmtDate(s.from,f)} – ${fmtDate(s.to,f)}`],["Frequenza",`${ds.freq.label} · fattore f = ${f}`],["Valori mancanti esclusi",s.skipped],["Origine",`col. ${a.col} · ${ROLE_SHORT[a.role]}`]];
  const src=a.role==="price"?"rᵢ = Pᵢ / Pᵢ₋₁ − 1   (dai prezzi)\n":a.role==="retpct"?"rᵢ = valore / 100   (dai punti %)\n":"rᵢ = valore   (rendimenti decimali)\n";
  const M={
    cagr:{t:"Rendimento annuo composto (CAGR)",v:fmtPct(s.cagr,2,true),fx:src+"CAGR = [ Π (1 + rᵢ) ]^(f / n) − 1",kv:[["Rendimento totale",fmtPct(s.total,1,true)],["n",s.n],["f",f]]},
    vol:{t:"Volatilità annualizzata",v:fmtPct(s.vol,2),fx:src+"σ = √[ Σ (rᵢ − r̄)² / (n − 1) ] · √f",kv:[["Deviazione standard di periodo",fmtPct(s.sd,2)],["Rendimento medio di periodo",fmtPct(s.mean,3)]]},
    sharpe:{t:"Indice di Sharpe",v:fmtN(s.vol>0?(s.mean*f-rf)/s.vol:NaN),fx:src+"Sharpe = (r̄ · f − rf) / σ",kv:[["Rendimento medio annualizzato",fmtPct(s.mean*f,2)],["Volatilità annualizzata",fmtPct(s.vol,2)],["Tasso privo di rischio",mm?`${fmtPct(rf,2)} · ${mm.rfName}`:"0% · nessun dato macro"]]},
    real:{t:"Rendimento reale annuo",v:mm?fmtPct((1+s.cagr)/(1+mm.infl)-1,2,true):"—",fx:src+"Reale = (1 + CAGR) / (1 + π) − 1\nπ = inflazione media annua del periodo",kv:[["CAGR nominale",fmtPct(s.cagr,2,true)],["Inflazione media annua",mm?`${fmtPct(mm.infl,2)} · ${mm.cpiName}`:"—"]]},
    mdd:{t:"Massimo drawdown",v:fmtPct(s.mdd,2),fx:src+"Wₜ = Π (1 + rᵢ)   fino a t\nDD = min ( Wₜ / max(W₀…Wₜ) − 1 )",kv:[["Picco",fmtDate(ds.dates[s.mddPeak],f)],["Minimo",fmtDate(ds.dates[s.mddTrough],f)]]},
    worst:{t:"Periodo peggiore",v:fmtPct(s.worst,2),fx:src+"min(rᵢ)",kv:[["Data",fmtDate(ds.dates[s.worstK],f)],["Periodo migliore",`${fmtPct(s.best,2,true)} · ${fmtDate(ds.dates[s.bestK],f)}`]]}
  }[kind];
  return {title:`${M.t} · ${a.name}`,value:M.v,formula:M.fx,kv:[...M.kv,...base]};
}
function openReceipt(key){
  const R=receipt(key);
  $("#receipt").innerHTML=`<div style="display:flex;flex-direction:column;gap:8px"><span class="eyebrow">Ricevuta del calcolo</span><h3 style="font-size:1.25rem">${esc(R.title)}</h3></div>
    <div class="rc-val">${esc(R.value)}</div><div class="formula">${esc(R.formula)}</div>
    <dl class="kv">${R.kv.map(k=>`<dt>${esc(k[0])}</dt><dd>${esc(k[1])}</dd>`).join("")}</dl>
    <div class="stamp"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Calcolo deterministico sui dati del file. Nessun valore generato dall'IA.</div>`;
  $("#drawer").classList.add("open");$("#scrim").classList.add("open");$("#drawer").setAttribute("aria-hidden","false");
  $("#closeDrawer").focus();
}
function closeReceipt(){$("#drawer").classList.remove("open");$("#scrim").classList.remove("open");$("#drawer").setAttribute("aria-hidden","true");}
document.addEventListener("click",e=>{const b=e.target.closest("[data-rc]");if(b)openReceipt(b.dataset.rc);});
$("#closeDrawer").addEventListener("click",closeReceipt);
$("#scrim").addEventListener("click",closeReceipt);
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeReceipt();});

/* ---------- Home: terminale con dati ufficiali BCE e mappa dei 10 laboratori ---------- */
const LABS=[
  {n:"01",t:"Portfolio Intelligence",d:"Metriche, rischio, contributi, benchmark e il tuo rendimento reale.",c:"var(--lime)",go:"lab",g:"M4 20 10 12l4 4 8-11"},
  {n:"02",t:"Simulation Lab",d:"Monte Carlo con versamenti, prelievi, inflazione e probabilità di obiettivo.",c:"var(--c3)",go:"sim",g:"M3 18c5 0 6-12 9-12s4 8 9 8M3 18c5 0 7-6 9-6s5 3 9 3"},
  {n:"03",t:"Crisis Room",d:"Dot-com, 2008, debito euro, COVID, inflazione 2022 e i tuoi shock.",c:"var(--bad)",go:"stress",g:"M3 6l6 8 4-4 8 10"},
  {n:"04",t:"Quant Lab",d:"Frontiera efficiente, ottimizzatori, VaR a tre metodi, test statistici.",c:"var(--c2)",go:"opt",g:"M4 20C6 10 11 5 20 4M8 15h.01M13 10h.01M17 8h.01"},
  {n:"05",t:"Strategy Arena",d:"Backtest e strategie a confronto nelle stesse condizioni.",c:"var(--warn)",soon:true,g:"M5 19l7-14 7 14M8 13h8"},
  {n:"06",t:"Macro & Economy",d:"Curva dei tassi, inflazione, obbligazioni, duration.",c:"var(--good)",soon:true,g:"M3 17c4-8 8-10 18-10M3 21h18"},
  {n:"07",t:"Behavioral Lab",d:"Panico, avversione alle perdite, market timing: provali sulla tua pelle.",c:"var(--c4)",soon:true,g:"M12 21c5-3 8-7 8-11a8 8 0 1 0-16 0c0 4 3 8 8 11z"},
  {n:"08",t:"AI Research",d:"Quanta: fai domande, lei chiede i numeri al motore e te li spiega.",c:"var(--lime)",chat:true,g:"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8z"},
  {n:"09",t:"Financial Games",d:"Sopravvivi alle crisi mese per mese, batti la frontiera: sfide sui dati veri.",c:"#7AA2FF",go:"games",free:true,g:"M6 12h4M8 10v4M15 11h.01M18 13h.01M3 9a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"},
  {n:"10",t:"Academy & Workspace",d:"Formule, glossario, analisi salvate e report.",c:"var(--muted)",soon:true,g:"M4 5h7v14H4zM13 5h7v14h-7z"}
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

/* ---------- Financial Games ---------- */
const GAMES=[
  {id:"survive",n:"01",t:"Sopravvivi alla crisi",d:"Entri nel 2008 (o nel 2000, nel 2020, nel 2022) con 10.000 € nell'S&P 500. Il futuro è nascosto: ogni mese scegli azioni o contanti.",tag:"dati storici reali"},
  {id:"frontier",n:"02",t:"Batti la frontiera",d:"Costruisci a mano il portafoglio più efficiente con i tuoi asset entro un limite di rischio. Il motore ti dà il voto.",tag:"i tuoi dati"},
  {id:"timing",n:"03",t:"Market Timing Challenge",d:"Indovina i mesi migliori per entrare e uscire.",soon:true},
  {id:"bubble",n:"04",t:"Bubble Detective",d:"Riconosci una bolla prima che scoppi.",soon:true},
  {id:"div",n:"05",t:"Diversification Challenge",d:"Riduci il rischio senza sacrificare il rendimento.",soon:true}];
const GM={game:null};
function renderGames(){
  if(GM.game){$("#gmHub").hidden=true;$("#gmPlay").hidden=false;return;}
  $("#gmPlay").hidden=true;$("#gmHub").hidden=false;
  $("#gmHub").innerHTML=GAMES.map(g=>`<button type="button" class="gm-card${g.soon?" soon":""}" ${g.soon?"disabled":`data-game="${g.id}"`}>
    <span class="gm-n">${g.n}</span><b>${g.t}</b><span class="gm-d">${g.d}</span>
    <span class="gm-tag">${g.soon?"in arrivo":g.id==="frontier"&&!S.lab?"serve un file nel laboratorio":g.tag}</span>${g.soon?"":`<span class="gm-play-b">Gioca →</span>`}</button>`).join("");
}
document.addEventListener("click",e=>{
  const g=e.target.closest("[data-game]");if(g){GM.game=g.dataset.game;if(GM.game==="survive")svSetup();else fxStart();renderGames();return;}
  if(e.target.closest("[data-gm-back]")){GM.game=null;GM.sv=null;renderGames();}
});
/* --- Gioco 1: Sopravvivi alla crisi --- */
async function svSetup(){
  const el=$("#gmPlay");el.hidden=false;
  el.innerHTML=`<div class="card gm-panel"><div class="head"><div><span class="eyebrow">Gioco 01</span><h3 style="margin-top:4px">Sopravvivi alla crisi</h3></div><button type="button" class="btn sm" data-gm-back>← Tutti i giochi</button></div>
    <p class="gm-lead">Hai <b>10.000 €</b> investiti nell'S&P 500. Il gioco parte qualche mese prima della crisi e prosegue fino a tre anni dopo il minimo. Ogni mese vedi solo il passato e scegli quanto tenere in azioni: il resto resta in contanti allo 0%. Alla fine ti confronti con chi non ha mai toccato nulla.</p>
    <div class="gm-crises" id="svPick"><p class="caption">Scarico lo storico dell'S&P 500 e il cambio euro/dollaro della BCE…</p></div>
    <p class="caption">Dati storici reali: ETF SPY (S&P 500, dividendi inclusi) in euro con il cambio BCE di fine mese. Le crisi sono vere, le tue decisioni no.</p></div>`;
  await bnLoad("SPY");if(!S.fx){const fx=await getJSON("/api/fx?ccy=USD");if(!fx.error)S.fx=fx;}
  const d=S.bnData.SPY;if(!d||d.error||!S.fx){$("#svPick").innerHTML=`<p class="msg err">${esc((d&&d.error)||"Dati non disponibili in questo momento.")} Riprova tra poco.</p>`;return;}
  GM.px=P.benchPrices(d.points,S.fx.points);
  $("#svPick").innerHTML=P.CRISES.map(c=>{const w=P.gameWindow(GM.px,c,3,36);return `<button type="button" class="gm-crisis" ${w.error?"disabled":`data-sv="${c.id}"`}><span>${c.m0.slice(0,4)}</span><b>${esc(c.name)}</b><small>${w.error?"fuori dallo storico":`${w.keys.length-1} mesi`}</small></button>`;}).join("");
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-sv]");if(!b)return;const c=P.CRISES.find(x=>x.id===b.dataset.sv),w=P.gameWindow(GM.px,c,3,36);
  GM.sv={c,win:w,t:0,w:w.ret.map(()=>1),x:1};svRender();});
function svStep(k){
  const G0=GM.sv;if(!G0)return;
  for(let i=0;i<k&&G0.t<G0.win.ret.length-1;i++){G0.t++;G0.w[G0.t]=G0.x;}
  if(G0.t>=G0.win.ret.length-1){svEnd();return;}
  svRender();
}
function svChart(full){
  const G0=GM.sv,n=G0.win.keys.length,res=P.survival(G0.win.ret.slice(0,(full?n:G0.t+1)),G0.w),VW=900,VH=300,ml=56,mr=14,mt=14,mb=28,iw=VW-ml-mr,ih=VH-mt-mb;
  const all=[...res.path,...res.hold],hi=Math.max(...all,10000)*1.05,lo=Math.min(...all,10000)*.92,X=i=>ml+i/(n-1)*iw,Y=v=>mt+ih-(v-lo)/(hi-lo)*ih;
  let g=`<rect x="${X(G0.win.start)}" y="${mt}" width="${Math.max(2,X(G0.win.end)-X(G0.win.start))}" height="${ih}" fill="var(--bad)" opacity=".08"/>`;
  niceTicks(lo,hi,4).filter(v=>v>=lo&&v<=hi).forEach(v=>{g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)"/><text x="${ml-6}" y="${(Y(v)+4).toFixed(1)}" text-anchor="end">${fmtK(v)}</text>`;});
  [0,Math.floor((n-1)/2),n-1].forEach(i=>{g+=`<text x="${X(i)}" y="${VH-8}" text-anchor="${i===0?"start":i===n-1?"end":"middle"}">${G0.win.keys[i]}</text>`;});
  if(!full)g+=`<rect x="${X(G0.t)}" y="${mt}" width="${X(n-1)-X(G0.t)}" height="${ih}" fill="url(#fog)"/><text x="${(X(G0.t)+X(n-1))/2}" y="${mt+ih/2}" text-anchor="middle" style="fill:var(--faint);font-size:14px">futuro nascosto</text>`;
  const line=(a,st)=>`<path d="${a.map((v,i)=>(i?"L":"M")+X(i).toFixed(1)+","+Y(v).toFixed(1)).join("")}" fill="none" ${st}/>`;
  g+=line(res.hold,`stroke="var(--muted)" stroke-width="1.8" stroke-dasharray="5 4"`)+line(res.path,`stroke="var(--lime)" stroke-width="3"`);
  const last=res.path.length-1;g+=`<circle cx="${X(last)}" cy="${Y(res.path[last])}" r="6" fill="var(--lime)"/>`;
  return {svg:`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Il tuo portafoglio contro chi resta investito"><defs><linearGradient id="fog" x1="0" x2="1"><stop offset="0" stop-color="rgba(255,255,255,.06)"/><stop offset="1" stop-color="rgba(255,255,255,.01)"/></linearGradient></defs>${g}</svg>`,res};
}
function svRender(){
  const G0=GM.sv,{svg,res}=svChart(false),k=G0.win.keys,t=G0.t,V=res.final,H=res.holdFinal,mk=G0.win.ret[t],phase=t<G0.win.start?"prima della crisi":t<=G0.win.end?"crisi in corso":"dopo il minimo";
  $("#gmPlay").innerHTML=`<div class="card gm-panel"><div class="head"><div><span class="eyebrow">${esc(G0.c.name)} · ${phase}</span><h3 style="margin-top:4px">${k[t]} <span class="gm-mo">mese ${t} di ${k.length-1}</span></h3></div><button type="button" class="btn sm" data-gm-back>← Esci</button></div>
    <div class="gm-hud"><div><span>Il tuo portafoglio</span><b>${fmtEur(V)}</b><small class="${V>=10000?"up":"dn"}">${fmtPct(V/10000-1,1,true)} dall'inizio</small></div>
      <div><span>Mercato questo mese</span><b class="${!Number.isFinite(mk)?"":mk>=0?"up":"dn"}">${Number.isFinite(mk)?fmtPct(mk,1,true):"—"}</b><small>S&P 500 in euro</small></div>
      <div><span>Chi non ha toccato nulla</span><b>${fmtEur(H)}</b><small>${fmtPct(H/10000-1,1,true)}</small></div></div>
    <div class="chartbox">${svg}</div>
    <div class="gm-ctrl"><span class="eyebrow">Per il prossimo mese tieni in azioni</span>
      <div class="gm-ch">${[[1,"100% azioni"],[.5,"50 / 50"],[0,"Tutto in contanti"]].map(([x,l])=>`<button type="button" data-svx="${x}" aria-pressed="${G0.x===x}">${l}</button>`).join("")}</div>
      <div class="gm-go"><button type="button" class="btn lime" data-svstep="1">Mese successivo →</button><button type="button" class="btn" data-svstep="6">Avanti 6 mesi</button></div>
      <p class="caption">Tasto → o Spazio per avanzare. La linea tratteggiata è chi resta sempre investito.</p></div></div>`;
}
document.addEventListener("click",e=>{const x=e.target.closest("[data-svx]");if(x&&GM.sv){GM.sv.x=+x.dataset.svx;document.querySelectorAll("[data-svx]").forEach(b=>b.setAttribute("aria-pressed",String(b===x)));return;}
  const s=e.target.closest("[data-svstep]");if(s)svStep(+s.dataset.svstep);
  if(e.target.closest("[data-svagain]")&&GM.sv){const c=GM.sv.c,w=P.gameWindow(GM.px,c,3,36);GM.sv={c,win:w,t:0,w:w.ret.map(()=>1),x:1};svRender();}
  if(e.target.closest("[data-svother]"))svSetup();});
document.addEventListener("keydown",e=>{if(current!=="games"||!GM.sv||GM.sv.done||e.target.closest("input,textarea,select"))return;if(e.key==="ArrowRight"||e.key===" "){e.preventDefault();e.stopPropagation();svStep(1);}},true);
function svEnd(){
  const G0=GM.sv;G0.done=true;const {svg,res}=svChart(true),k=G0.win.keys,better=res.diff>=0;
  const BD={"Mano ferma":"Non hai mai toccato nulla: hai preso tutto il crollo e tutto il rimbalzo. È la strategia che in media batte quasi tutti gli investitori.",
    "Venditore nel panico":"Hai ridotto le azioni subito dopo mesi pesanti, e il rimbalzo è arrivato senza di te. È l'errore più caro e più comune.",
    "Market timer (fortunato?)":"Hai fatto meglio di chi è rimasto fermo. Prova un'altra crisi: indovinare due volte di fila è molto più difficile.",
    "Spettatore prudente":"Sei rimasto fuori dal mercato per la maggior parte del tempo: meno paura, ma anche meno crescita.",
    "Navigatore":"Hai cambiato rotta qualche volta senza grossi danni: risultato vicino a chi è rimasto fermo.",
    "Rimbalzo perso":"Le tue uscite ti hanno fatto perdere una parte della ripresa."}[res.badge];
  $("#gmPlay").innerHTML=`<div class="card gm-panel gm-end"><div class="head"><div><span class="eyebrow">${esc(G0.c.name)} · ${k[0]} – ${k[k.length-1]}</span><h3 style="margin-top:4px">Risultato</h3></div><button type="button" class="btn sm" data-gm-back>← Tutti i giochi</button></div>
    <div class="gm-badge"><span>Che investitore sei</span><b>${res.badge}</b><p>${BD}</p></div>
    <div class="gm-hud"><div><span>Tu</span><b>${fmtEur(res.final)}</b><small>${fmtPct(res.final/10000-1,1,true)} · calo massimo ${fmtPct(res.mdd,0)}</small></div>
      <div><span>Chi è rimasto fermo</span><b>${fmtEur(res.holdFinal)}</b><small>${fmtPct(res.holdFinal/10000-1,1,true)} · calo massimo ${fmtPct(res.holdMdd,0)}</small></div>
      <div><span>Differenza</span><b class="${better?"up":"dn"}">${better?"+":"−"}${fmtEur(Math.abs(res.final-res.holdFinal))}</b><small>${fmtPct(res.diff,1,true)} rispetto a restare fermo</small></div></div>
    <div class="chartbox">${svg}</div>
    <div class="gm-facts"><div><b>${res.switches}</b><span>cambi di rotta</span></div><div><b>${res.panic}</b><span>vendite dopo un mese ≤ −4%</span></div><div><b>${fmtPct(res.outShare,0)}</b><span>del tempo fuori dal mercato</span></div><div><b class="${res.missed>0?"dn":""}">${fmtPct(res.missed,1)}</b><span>persi nei 5 mesi migliori</span></div></div>
    <p class="caption">I 5 mesi migliori del periodo: ${res.best.map(m=>`${k[m.t]} ${fmtPct(m.r,1,true)} (eri al ${fmtPct(m.x,0)})`).join(" · ")}. Contanti allo 0%, nessun costo né tassa. Dati storici reali, decisioni simulate.</p>
    <div class="gm-go"><button type="button" class="btn lime" data-svagain>Rigioca questa crisi</button><button type="button" class="btn" data-svother>Un'altra crisi</button></div></div>`;
  if(Morph.burst)Morph.burst(better?.8:.5);
}
/* --- Gioco 2: Batti la frontiera --- */
function fxStart(){
  const el=$("#gmPlay");el.hidden=false;
  if(!S.lab||!S.ds||S.ds.assets.length<2){el.innerHTML=`<div class="card gm-panel"><div class="head"><h3>Batti la frontiera</h3><button type="button" class="btn sm" data-gm-back>← Tutti i giochi</button></div><p class="gm-lead">Questo gioco usa i tuoi dati: carica un file con almeno due asset (o prova l'esempio) e costruisci il laboratorio.</p><div><button type="button" class="btn lime" data-go="home">Vai alla home</button></div></div>`;return;}
  const inp=P.annualInputs(S.ds.assets,S.ds.freq.f);if(inp.common<12){el.innerHTML=`<div class="card gm-panel"><p>Servono almeno 12 periodi comuni a tutti gli asset.</p><button type="button" class="btn sm" data-gm-back>← Indietro</button></div>`;return;}
  const vols=inp.C.map((r,i)=>Math.sqrt(r[i])).sort((a,b)=>a-b),maxVol=Math.round(vols[Math.floor(vols.length/2)]*100*.8)/100;
  GM.fx={inp,maxVol,w:S.ds.assets.map(()=>Math.round(100/S.ds.assets.length)),done:false};fxRender();
}
function fxRender(){
  const F=GM.fx,ds=S.ds,mm=macroFor(S.rfSrc),rf=mm?mm.rf:0,R=P.frontierScore(F.inp.mu,F.inp.C,F.w,F.maxVol,rf);
  const VW=640,VH=300,ml=50,mr=14,mt=14,mb=34,iw=VW-ml-mr,ih=VH-mt-mb,pts=[...R.frontier,{vol:R.vol,ret:R.ret},...F.inp.mu.map((m,i)=>({vol:Math.sqrt(F.inp.C[i][i]),ret:m}))];
  const x1=Math.max(...pts.map(p=>p.vol))*1.1,y0=Math.min(0,...pts.map(p=>p.ret)),y1=Math.max(...pts.map(p=>p.ret))*1.12,X=v=>ml+v/x1*iw,Y=v=>mt+ih-(v-y0)/(y1-y0)*ih;
  let g=`<rect x="${ml}" y="${mt}" width="${X(F.maxVol)-ml}" height="${ih}" fill="var(--lime)" opacity=".06"/><line x1="${X(F.maxVol)}" x2="${X(F.maxVol)}" y1="${mt}" y2="${mt+ih}" stroke="var(--lime)" stroke-dasharray="5 4"/><text x="${X(F.maxVol)+6}" y="${mt+14}" style="fill:var(--lime)">limite ${fmtPct(F.maxVol,0)}</text>`;
  niceTicks(0,x1,5).filter(v=>v<=x1).forEach(v=>{g+=`<text x="${X(v)}" y="${VH-12}" text-anchor="middle">${fmtPct(v,0)}</text>`;});
  niceTicks(y0,y1,4).filter(v=>v>=y0&&v<=y1).forEach(v=>{g+=`<line x1="${ml}" x2="${VW-mr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${ml-6}" y="${Y(v)+4}" text-anchor="end">${fmtPct(v,0)}</text>`;});
  if(F.done)g+=`<path d="${R.frontier.map((p,i)=>(i?"L":"M")+X(p.vol).toFixed(1)+","+Y(p.ret).toFixed(1)).join("")}" fill="none" stroke="var(--muted)" stroke-width="2.5"/><circle cx="${X(R.best.vol)}" cy="${Y(R.best.ret)}" r="8" fill="none" stroke="var(--fg)" stroke-width="2.5"/><text x="${X(R.best.vol)+12}" y="${Y(R.best.ret)-8}" style="fill:var(--fg);font-weight:700">ottimo</text>`;
  F.inp.mu.forEach((m,i)=>{g+=`<circle cx="${X(Math.sqrt(F.inp.C[i][i]))}" cy="${Y(m)}" r="5" fill="${color(i)}"><title>${esc(ds.assets[i].name)}</title></circle>`;});
  g+=`<circle cx="${X(R.vol)}" cy="${Y(R.ret)}" r="10" fill="${R.over?"var(--bad)":"var(--lime)"}" stroke="var(--solid)" stroke-width="2"/><text x="${X(R.vol)-12}" y="${Y(R.ret)-14}" text-anchor="end" style="fill:var(--fg);font-weight:800">tu</text>`;
  $("#gmPlay").innerHTML=`<div class="card gm-panel"><div class="head"><div><span class="eyebrow">Gioco 02 · ${esc(S.source.name)}</span><h3 style="margin-top:4px">Batti la frontiera</h3></div><button type="button" class="btn sm" data-gm-back>← Tutti i giochi</button></div>
    <p class="gm-lead">Obiettivo: il <b>massimo rendimento</b> con una volatilità <b>non oltre ${fmtPct(F.maxVol,0)}</b>. Muovi i cursori, poi chiedi il voto al motore.</p>
    <div class="fx-grid"><div class="fx-sl">${ds.assets.map((a,i)=>`<label class="fx-row"><span class="nm"><i style="background:${color(i)}"></i>${esc(a.name)}</span><input type="range" min="0" max="100" step="1" value="${F.w[i]}" data-fxw="${i}" ${F.done?"disabled":""}><b>${fmtPct(R.w[i],0)}</b></label>`).join("")}
      <div class="gm-hud fx-hud"><div><span>Rendimento atteso</span><b>${fmtPct(R.ret,1)}</b></div><div><span>Volatilità</span><b class="${R.over?"dn":""}">${fmtPct(R.vol,1)}</b><small>${R.over?"oltre il limite!":"entro il limite"}</small></div></div>
      ${F.done?`<div class="gm-badge"><span>Il tuo voto</span><b>${R.score}/100</b><p>${R.over?"Hai superato il limite di rischio: in gara non vale.":R.score>=95?"Praticamente sulla frontiera: da quant!":R.score>=75?"Molto vicino all'ottimo.":"C'era margine: guarda i pesi dell'ottimo."} Ottimo: ${fmtPct(R.best.ret,1)} di rendimento con ${fmtPct(R.best.vol,1)} di volatilità (${ds.assets.map((a,i)=>`${esc(a.name)} ${fmtPct(R.best.w[i],0)}`).join(", ")}).</p></div>
        <div class="gm-go"><button type="button" class="btn lime" data-fxagain>Riprova</button></div>`:`<div class="gm-go"><button type="button" class="btn lime" data-fxcheck>Dammi il voto</button></div>`}
      </div><div class="chartbox"><svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Il tuo portafoglio sul piano rischio-rendimento">${g}</svg></div></div>
    <p class="caption">Rendimenti attesi = medie storiche del file, rischio = covarianza storica (come nella sezione Frontiera). È una gara nel campione, non una previsione.</p></div>`;
}
document.addEventListener("input",e=>{const i=e.target.dataset&&e.target.dataset.fxw;if(i===undefined||!GM.fx)return;GM.fx.w[+i]=+e.target.value;clearTimeout(fxRender.t);fxRender.t=setTimeout(()=>{const a=document.activeElement&&document.activeElement.dataset.fxw;fxRender();if(a!==undefined){const el=document.querySelector(`[data-fxw="${a}"]`);if(el)el.focus();}},60);});
document.addEventListener("click",e=>{if(e.target.closest("[data-fxcheck]")&&GM.fx){GM.fx.done=true;fxRender();if(Morph.burst)Morph.burst(.6);}if(e.target.closest("[data-fxagain]")&&GM.fx){GM.fx.done=false;fxRender();}});

/* ---------- Quanta si presenta: fumetti per sezione e qualche giro per lo schermo ---------- */
const QTIPS={
  home:{t:"Ciao, sono <b>Quanta</b>! Carica un file e chiedimi qualsiasi cosa sui tuoi investimenti.",q:null},
  scan:{t:"Sto guardando il tuo file con il motore. Se qualcosa non torna, chiedimelo.",q:null},
  map:{t:"Una colonna non ti è chiara? Te la spiego io.",q:null},
  lab:{t:"Vuoi sapere quale asset ti fa rischiare di più?",q:"Qual è l'asset più rischioso?"},
  risk:{t:"Il VaR ti sembra arabo? Te lo spiego con i <b>tuoi</b> numeri.",q:"Spiegami il VaR e il CVaR del mio portafoglio in parole semplici"},
  sim:{t:"Chiedimi: «Con 300 € al mese quanto avrei tra 20 anni?»",q:"Con 300 € al mese quanto avrei tra 20 anni?"},
  stress:{t:"Come avrebbe retto il tuo portafoglio nel 2008? Chiedimelo.",q:"Come ha retto il portafoglio nelle crisi?"},
  opt:{t:"Ti trovo l'allocazione più efficiente con i tuoi vincoli.",q:"Qual è l'allocazione più efficiente con massimo 50% per asset?"},
  bench:{t:"Hai battuto il mercato? Te lo dico con la statistica.",q:"Ho battuto l'S&P 500? L'alpha è significativo?"},
  games:{t:"Sai perché chi vende nel panico perde il rimbalzo? Gioca, poi chiedimelo.",q:null}
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
  say.classList.add("on");placeSay();clearTimeout(QG.hideT);QG.hideT=setTimeout(()=>say.classList.remove("on"),ms||6500);
}
say.addEventListener("click",()=>{const tip=QTIPS[say.dataset.scene]||{};say.classList.remove("on");openChat();if(tip.q&&S.lab)setTimeout(()=>askChat(tip.q),250);});
function quantaScene(name){
  if(QG.seen.has(name)||QG.opened&&name!=="home")return;
  QG.seen.add(name);setTimeout(()=>{if(current===name&&!document.body.classList.contains("chat-on")&&!QG.tl)showSay(name);},name==="home"?6500:2600);
}
/* il giro: la sfera vola verso il contenuto lasciando una scia, dice una cosa utile e torna al suo posto */
function setOrb(x,y){QG.pos={x,y};orbBtn.style.translate=`${x}px ${y}px`;if(say.classList.contains("on"))placeSay();}
function orbSpark(){const r=orbBtn.getBoundingClientRect(),s=document.createElement("i");s.className="orb-spark";s.style.left=(r.left+r.width/2)+"px";s.style.top=(r.top+r.height/2)+"px";document.body.appendChild(s);setTimeout(()=>s.remove(),700);}
function roam(){
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

/* ---------- Avvio ---------- */
load(P.sampleSheets(),{name:"esempio_portafoglio.xlsx",size:0,kind:"sample"},false);
morphInit();
renderLabs();loadMarket();
quantaScene("home");
requestAnimationFrame(movePill);
if(!HAS_G)heroIntro();
