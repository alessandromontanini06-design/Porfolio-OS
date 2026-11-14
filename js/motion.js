/* Portfolio OS · animazioni della grafica 2 (GSAP + ScrollTrigger + SplitType).
   Poche e brevi: titoli che salgono riga per riga, elementi che entrano in sequenza, linee dei grafici che si disegnano.
   Non tocca la logica del sito; se le librerie non ci sono o l'utente preferisce meno movimento, non fa niente. */
(()=>{
  const G=window.gsap,ST=window.ScrollTrigger;
  if(!G||matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  if(ST)G.registerPlugin(ST);

  /* titolo diviso in righe, ognuna sale da dietro una maschera */
  const lines=el=>{
    if(!el||!window.SplitType)return null;
    if(!el.__split){el.__split=new SplitType(el,{types:"lines",lineClass:"ln"});
      el.__split.lines.forEach(l=>{const w=document.createElement("span");w.className="ln-mask";l.parentNode.insertBefore(w,l);w.appendChild(l);});}
    return el.__split.lines;
  };
  const rise=(el,delay=0)=>{const ls=lines(el);if(ls&&ls.length)G.fromTo(ls,{yPercent:110},{yPercent:0,duration:.9,ease:"power4.out",stagger:.08,delay});};

  /* ---------- home ---------- */
  const home=document.getElementById("scene-home");
  const heroIn=()=>{
    rise(document.getElementById("heroTitle"),.05);
    G.from(".hero2 .kick,.hero2 .lead,.hero2 .fine",{y:14,opacity:0,duration:.8,ease:"power3.out",stagger:.08,delay:.3,clearProps:"transform,opacity"});
    G.from(".start .opt",{x:24,opacity:0,duration:.8,ease:"power3.out",stagger:.08,delay:.4,clearProps:"transform,opacity"});
  };
  if(ST&&home){
    const sc={scroller:home,start:"top 85%"};
    G.from(".sc-text h2,.sc-text>p",{y:20,opacity:0,duration:.8,ease:"power3.out",stagger:.08,scrollTrigger:{...sc,trigger:".showcase"}});
    G.from(".answers li",{y:16,opacity:0,duration:.7,ease:"power3.out",stagger:.1,scrollTrigger:{...sc,trigger:".answers"}});
    G.fromTo(".sc-receipt",{y:40,rotate:-4,opacity:0},{y:0,rotate:1.2,opacity:1,duration:1.1,ease:"power3.out",scrollTrigger:{...sc,trigger:".showcase"}});
    G.fromTo(".rc-num",{"--hl":0},{"--hl":1,duration:.7,ease:"power2.inOut",delay:.6,scrollTrigger:{...sc,trigger:".showcase"}});
  }
  /* il pulsante principale si avvicina appena al cursore */
  const pb=document.querySelector(".opt.primary");
  if(pb&&matchMedia("(pointer:fine)").matches){
    const qx=G.quickTo(pb,"x",{duration:.4,ease:"power3"}),qy=G.quickTo(pb,"y",{duration:.4,ease:"power3"});
    pb.addEventListener("pointermove",e=>{const r=pb.getBoundingClientRect();qx((e.clientX-r.left-r.width/2)*.05);qy((e.clientY-r.top-r.height/2)*.1);});
    pb.addEventListener("pointerleave",()=>{qx(0);qy(0);});
  }

  /* ---------- grafici: la linea principale si disegna ---------- */
  const drawLines=sc=>{
    sc.querySelectorAll(".chartbox svg, .chart svg").forEach(svg=>{
      if(svg.__drawn)return;svg.__drawn=true;
      const ps=[...svg.querySelectorAll("path,polyline")].filter(p=>{const f=p.getAttribute("fill");return (f==="none"||f===null&&p.tagName==="polyline")&&!p.getAttribute("stroke-dasharray");});
      ps.slice(0,6).forEach((p,i)=>{let L=0;try{L=p.getTotalLength();}catch(e){}if(!L||L<80)return;
        G.fromTo(p,{strokeDasharray:L,strokeDashoffset:L},{strokeDashoffset:0,duration:1.2,ease:"power2.inOut",delay:.15+i*.08,onComplete:()=>{p.style.strokeDasharray="";p.style.strokeDashoffset="";}});});
    });
  };

  /* ---------- ingresso in ogni sezione ---------- */
  const enter=sc=>{
    if(sc===home){heroIn();return;}
    rise(sc.querySelector(".scene-title h2"));
    /* i grafici arrivano dopo i calcoli: due giri di attesa, poi si disegnano quelli nuovi */
    setTimeout(()=>drawLines(sc),450);
    if(ST)setTimeout(()=>ST.refresh(),60);
  };
  /* se la finestra cambia larghezza, le righe vanno ricalcolate */
  let rz;addEventListener("resize",()=>{clearTimeout(rz);rz=setTimeout(()=>document.querySelectorAll("h1,h2").forEach(el=>{if(el.__split){el.__split.revert();el.__split=null;}}),200);});
  document.querySelectorAll(".scene").forEach(sc=>{
    new MutationObserver(()=>{if(!sc.hidden)enter(sc);}).observe(sc,{attributes:true,attributeFilter:["hidden"]});
  });
  const first=document.querySelector(".scene:not([hidden])");
  if(first)(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>enter(first));
})();
