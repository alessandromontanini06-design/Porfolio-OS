/* Portfolio OS · grafici ingranditi e lettura punto per punto.
   Ogni grafico (.chartbox con un svg) riceve il pulsante «Ingrandisci». Nella vista grande:
   - il grafico occupa lo schermo;
   - una barra di scorrimento (o le frecce ← →, o la rotella) passa da un dato al successivo;
   - per ogni linea si legge il valore in quel punto e la data.
   I valori si ricavano dal disegno stesso (coordinate delle linee e numeri sugli assi), quindi funziona con tutti i grafici a linee
   senza toccare il codice che li disegna. I grafici a barre si possono solo ingrandire. */
(()=>{
  const MON=["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
  const nf=(v,d)=>v.toLocaleString("it-IT",{minimumFractionDigits:d,maximumFractionDigits:d});

  /* numero scritto su un asse: «1.000», «-4%», «1,6 mln», «120k», «+10%» */
  const parseTick=t=>{
    t=(t||"").trim().replace(/[−–]/g,"-");if(!t)return null;
    const m=t.match(/^([+-]?)\s*([\d.]*\d(?:,\d+)?)\s*(k|mln|mld|%|€)?\s*€?$/i);if(!m)return null;
    let v=parseFloat(m[2].replace(/\./g,"").replace(",","."));if(!Number.isFinite(v))return null;
    if(m[1]==="-")v=-v;const u=(m[3]||"").toLowerCase();
    if(u==="k")v*=1e3;else if(u==="mln")v*=1e6;else if(u==="mld")v*=1e9;
    return {v,pct:u==="%"||/%/.test(t),eur:/€/.test(t)};
  };
  /* data scritta sotto l'asse: «2010», «apr 2018», «2018-05» → mesi dall'anno 0 */
  const parseDate=t=>{
    t=(t||"").trim().toLowerCase();let m;
    if((m=t.match(/^(\d{4})-(\d{2})$/)))return +m[1]*12+(+m[2]-1);
    if((m=t.match(/^([a-z]{3})\w*\s+(\d{4})$/))&&MON.includes(m[1]))return +m[2]*12+MON.indexOf(m[1]);
    if((m=t.match(/^(\d{4})$/)))return +m[1]*12;
    return null;
  };
  const fit=pts=>{ // retta ai minimi quadrati
    const n=pts.length;if(n<2)return null;let sx=0,sy=0,sxx=0,sxy=0;
    pts.forEach(([x,y])=>{sx+=x;sy+=y;sxx+=x*x;sxy+=x*y;});const d=n*sxx-sx*sx;if(Math.abs(d)<1e-9)return null;
    const a=(n*sxy-sx*sy)/d,b=(sy-a*sx)/n;return x=>a*x+b;
  };
  const pathPts=p=>{const d=p.getAttribute("d")||"",out=[];const re=/([ML])\s*(-?[\d.]+)[ ,](-?[\d.]+)/g;let m;while((m=re.exec(d)))out.push([+m[2],+m[3]]);return out;};

  /* legge un svg: linee (serie), funzione y→valore, funzione x→data */
  function read(svg,home){
    const paths=[...svg.querySelectorAll("path")].filter(p=>{const f=p.getAttribute("fill"),s=p.getAttribute("stroke");return (f==="none")&&s&&s!=="none"&&!p.closest("defs");});
    let series=paths.map(p=>({p,pts:pathPts(p),stroke:p.getAttribute("stroke"),title:(p.querySelector("title")?.textContent||"").split(":")[0].trim()}))
      .filter(s=>s.pts.length>=8&&s.pts.every((q,i)=>!i||q[0]>=s.pts[i-1][0]-.01));
    if(!series.length)return null;
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    series.forEach(s=>s.pts.forEach(([x,y])=>{minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}));
    const texts=[...svg.querySelectorAll("text")].map(t=>({t:t.textContent,x:+t.getAttribute("x"),y:+t.getAttribute("y"),a:t.getAttribute("text-anchor")}));
    const yt=texts.filter(t=>t.x<=minX+2&&(t.a==="end"||t.x<minX)).map(t=>({...t,p:parseTick(t.t)})).filter(t=>t.p);
    const yf=fit(yt.map(t=>[t.y-4,t.p.v])),pct=yt.some(t=>t.p.pct),eur=yt.some(t=>t.p.eur);
    const big=Math.max(...yt.map(t=>Math.abs(t.p.v)),0);
    const xt=texts.filter(t=>t.y>maxY-2).map(t=>({...t,d:parseDate(t.t)})).filter(t=>t.d!=null);
    const xf=xt.length>=2?fit(xt.map(t=>[t.x,t.d])):null;
    /* nomi: dal titolo della linea, oppure dalla legenda vicina se il numero coincide */
    const box=home||svg.closest(".chartbox"),card=box&&(box.closest(".card")||box.parentElement);
    const spans=card?[...card.querySelectorAll(".legend span,[id$='Legend'] span,[id$='Leg'] span")].filter(x=>x.textContent.trim()):[];
    const byColor={};spans.forEach(x=>{const bg=(x.querySelector("i")?.getAttribute("style")||"").match(/background:\s*([^;]+)/);if(bg)byColor[bg[1].trim()]=x.textContent.trim();});
    const leg=spans.map(x=>x.textContent.trim());
    series.forEach((s,i)=>{if(!s.title)s.title=byColor[s.stroke]||(leg.length===series.length?leg[i]:series.length===1?"Valore":`Linea ${i+1}`);});
    const ref=series.reduce((a,b)=>b.pts.length>a.pts.length?b:a);
    const fmtV=v=>{if(!yf)return "";const d=big>=1000?0:big>=20?1:2;return (pct&&v>0?"+":"")+nf(v,d)+(pct?"%":eur?" €":"");};
    const fmtX=x=>{if(!xf)return null;const m=Math.round(xf(x)),y=Math.floor(m/12);return MON[((m%12)+12)%12]+" "+y;};
    return {series,ref,yf,fmtV,fmtX,minY,maxY};
  }

  /* overlay di lettura dentro un svg */
  function inspector(svg,out,onIdx,home){
    const R=read(svg,home);if(!R)return null;
    const NS="http://www.w3.org/2000/svg",g=document.createElementNS(NS,"g");g.setAttribute("class","cz-o");g.style.pointerEvents="none";
    const ln=document.createElementNS(NS,"line");ln.setAttribute("y1",R.minY-6);ln.setAttribute("y2",R.maxY+4);ln.setAttribute("stroke","var(--fg)");ln.setAttribute("stroke-width","1");ln.setAttribute("stroke-dasharray","3 3");g.appendChild(ln);
    const dots=R.series.map(s=>{const c=document.createElementNS(NS,"circle");c.setAttribute("r","4.5");c.setAttribute("fill","var(--bg)");c.setAttribute("stroke",s.stroke);c.setAttribute("stroke-width","2.4");g.appendChild(c);return c;});
    svg.appendChild(g);
    const N=R.ref.pts.length;let cur=N-1;
    const near=(s,x)=>{let lo=0,hi=s.pts.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(s.pts[m][0]<x)lo=m;else hi=m;}return Math.abs(s.pts[lo][0]-x)<=Math.abs(s.pts[hi][0]-x)?lo:hi;};
    function set(i){
      cur=Math.max(0,Math.min(N-1,i));const x=R.ref.pts[cur][0];ln.setAttribute("x1",x);ln.setAttribute("x2",x);
      const rows=R.series.map((s,k)=>{const j=near(s,x),q=s.pts[j],ok=Math.abs(q[0]-x)<(R.ref.pts[1]?.[0]-R.ref.pts[0][0]||5)*1.6;
        dots[k].setAttribute("cx",q[0]);dots[k].setAttribute("cy",q[1]);dots[k].style.display=ok?"":"none";
        return {name:s.title,color:s.stroke,v:ok&&R.yf?R.fmtV(R.yf(q[1])):"—"};});
      if(out)out({date:R.fmtX(x),i:cur,n:N,rows});if(onIdx)onIdx(cur);
    }
    const fromEvent=e=>{const pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const m=svg.getScreenCTM();if(!m)return;const p=pt.matrixTransform(m.inverse());set(near(R.ref,p.x));};
    return {R,N,set,get:()=>cur,fromEvent,remove:()=>g.remove()};
  }

  /* ---------- vista grande ---------- */
  let modal=null;
  function openZoom(box){
    const src=box.querySelector("svg");if(!src)return;
    const card=box.closest(".card"),title=(card?.querySelector("h3")?.textContent||"Grafico").trim();
    const leg=card?.querySelector(".legend,[id$='Legend'],[id$='Leg']");
    modal=document.createElement("div");modal.className="cz-modal";modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");modal.setAttribute("aria-label",title);
    modal.innerHTML=`<div class="cz-panel"><header><h3>${title.replace(/</g,"&lt;")}</h3><button type="button" class="btn sm cz-x" aria-label="Chiudi">Chiudi</button></header>
      <div class="cz-body"><div class="cz-chart"></div><aside class="cz-read" aria-live="polite"></aside></div>
      <div class="cz-scrub" hidden><button type="button" class="btn sm" data-st="-1" aria-label="Dato precedente">←</button><input type="range" min="0" value="0" aria-label="Scorri i dati"><button type="button" class="btn sm" data-st="1" aria-label="Dato successivo">→</button><span class="cz-hint">frecce ← → o rotella per scorrere un dato alla volta</span></div></div>`;
    document.body.appendChild(modal);document.body.classList.add("cz-on");
    const svg=src.cloneNode(true);svg.querySelectorAll(".cz-o").forEach(n=>n.remove());svg.removeAttribute("width");svg.style.width="100%";svg.style.height="100%";
    svg.querySelectorAll("[class]").forEach(n=>{n.classList.remove("draw","area","endpt");});
    modal.querySelector(".cz-chart").appendChild(svg);
    if(leg){const l=leg.cloneNode(true);l.removeAttribute("id");l.classList.add("legend","cz-leg");modal.querySelector(".cz-chart").appendChild(l);}
    const read=modal.querySelector(".cz-read"),scr=modal.querySelector(".cz-scrub"),rng=scr.querySelector("input");
    const ins=inspector(svg,o=>{read.innerHTML=`<p class="cz-d">${o.date||`dato ${o.i+1} di ${o.n}`}</p>`+o.rows.map(r=>`<div class="cz-r"><span><i style="background:${r.color}"></i>${r.name.replace(/</g,"&lt;")}</span><b>${r.v}</b></div>`).join("");},i=>{rng.value=i;},box);
    if(ins){
      scr.hidden=false;rng.max=ins.N-1;ins.set(ins.N-1);
      rng.addEventListener("input",()=>ins.set(+rng.value));
      scr.querySelectorAll("[data-st]").forEach(b=>b.addEventListener("click",()=>ins.set(ins.get()+ +b.dataset.st)));
      svg.addEventListener("pointermove",ins.fromEvent);
      modal.querySelector(".cz-chart").addEventListener("wheel",e=>{e.preventDefault();ins.set(ins.get()+(e.deltaY>0||e.deltaX>0?1:-1));},{passive:false});
      modal.__ins=ins;
    }else read.innerHTML=`<p class="cz-d">Passa sopra le barre per leggere i valori.</p>`;
    modal.querySelector(".cz-x").addEventListener("click",closeZoom);
    modal.addEventListener("click",e=>{if(e.target===modal)closeZoom();});
    modal.querySelector(".cz-x").focus();
    if(window.gsap&&!matchMedia("(prefers-reduced-motion: reduce)").matches)gsap.fromTo(modal.querySelector(".cz-panel"),{y:24,opacity:0,scale:.98},{y:0,opacity:1,scale:1,duration:.45,ease:"power3.out"});
  }
  function closeZoom(){if(!modal)return;modal.remove();modal=null;document.body.classList.remove("cz-on");}
  document.addEventListener("keydown",e=>{
    if(!modal)return;
    if(e.key==="Escape"){closeZoom();return;}
    const ins=modal.__ins;if(!ins)return;
    if(e.key==="ArrowLeft"||e.key==="ArrowRight"){if(document.activeElement?.type!=="range"){e.preventDefault();ins.set(ins.get()+(e.key==="ArrowRight"?1:-1));}}
    if(e.key==="Home"){ins.set(0);}if(e.key==="End"){ins.set(ins.N-1);}
  });

  /* ---------- pulsante su ogni grafico, e lettura al passaggio del mouse dove il grafico non ce l'ha già ---------- */
  function equip(box){
    const svg=box.querySelector(":scope>svg");if(!svg)return;
    if(!box.querySelector(":scope>.cz-btn")){
      const b=document.createElement("button");b.type="button";b.className="cz-btn";b.title="Ingrandisci";b.setAttribute("aria-label","Ingrandisci il grafico");
      b.innerHTML=`<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M8.5 3.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm3.6 8.6 4.4 4.4M8.5 6.2v4.6M6.2 8.5h4.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
      b.addEventListener("click",e=>{e.stopPropagation();openZoom(box);});box.appendChild(b);
    }
    if(svg.__cz||box.querySelector(":scope>.tip"))return;svg.__cz=true;
    let ins=null,tip=null;
    svg.addEventListener("pointerenter",()=>{if(ins)return;ins=inspector(svg,o=>{if(!tip){tip=document.createElement("div");tip.className="cz-tip";box.appendChild(tip);}
      tip.innerHTML=`<span>${o.date||`dato ${o.i+1}`}</span>`+o.rows.map(r=>`<div><i style="background:${r.color}"></i>${r.name.replace(/</g,"&lt;")} <b>${r.v}</b></div>`).join("");});});
    svg.addEventListener("pointermove",e=>{if(!ins)return;ins.fromEvent(e);if(tip){const r=box.getBoundingClientRect(),x=e.clientX-r.left;tip.style.left=Math.min(Math.max(8,x+16>r.width-tip.offsetWidth?x-tip.offsetWidth-16:x+16),r.width-tip.offsetWidth-8)+"px";}});
    svg.addEventListener("pointerleave",()=>{if(ins){ins.remove();ins=null;}if(tip){tip.remove();tip=null;}});
  }
  const scan=()=>document.querySelectorAll(".chartbox").forEach(equip);
  let t;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(scan,60);}).observe(document.body,{childList:true,subtree:true});
  scan();
  window.__chartzoom={open:id=>{const b=document.getElementById(id);if(b)openZoom(b);},close:closeZoom};
})();
