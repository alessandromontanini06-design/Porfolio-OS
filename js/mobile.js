/* Portfolio OS · sul telefono le schede si aprono a comparsa.
   Ogni scheda con un titolo (.card > .head) mostra solo il titolo e una riga di anteprima; un tocco la apre o la chiude.
   Resta aperta la prima scheda di ogni sezione. Sul computer non cambia nulla. */
(()=>{
  const mq=matchMedia("(max-width:760px)");
  const heads=card=>card.querySelector(":scope>.head");
  function setup(){
    document.querySelectorAll(".scene").forEach(sc=>{
      let first=true;
      sc.querySelectorAll(".card").forEach(card=>{
        if(card.closest(".cz-modal")||card.parentElement.closest(".card"))return; // solo le schede di primo livello
        const h=heads(card);if(!h)return;
        const vis=!card.hidden&&card.offsetParent!==null;
        if(card.dataset.mc==null){if(!vis)return;card.dataset.mc=first?"open":"closed";} // lo stato si decide quando la scheda compare
        if(vis)first=false;
        card.classList.add("mc");card.classList.toggle("mc-closed",mq.matches&&card.dataset.mc==="closed");
        h.setAttribute("role","button");h.setAttribute("aria-expanded",String(!card.classList.contains("mc-closed")));h.tabIndex=mq.matches?0:-1;
      });
    });
  }
  /* sottosezioni dentro una scheda (titoletti h4): chiuse di partenza sul telefono, si aprono con un tocco */
  const subSibs=h=>{const out=[];let n=h.nextElementSibling;while(n&&!(n.matches("h4.look-h"))){out.push(n);n=n.nextElementSibling;}return out;};
  function subSetup(){
    document.querySelectorAll(".scene .card h4.look-h").forEach(h=>{
      if(h.dataset.sub==null)h.dataset.sub="closed";
      const closed=mq.matches&&h.dataset.sub==="closed";h.classList.add("sub");h.classList.toggle("sub-closed",closed);
      h.setAttribute("role","button");h.setAttribute("aria-expanded",String(!closed));h.tabIndex=mq.matches?0:-1;
      subSibs(h).forEach(n=>n.classList.toggle("sub-hide",closed));
    });
  }
  function toggle(card,open){
    card.dataset.mc=open?"open":"closed";card.classList.toggle("mc-closed",!open);
    const h=heads(card);if(h)h.setAttribute("aria-expanded",String(open));
    if(open&&window.gsap&&!matchMedia("(prefers-reduced-motion: reduce)").matches){
      const kids=[...card.children].filter(k=>!k.classList.contains("head"));gsap.fromTo(kids,{opacity:0,y:8},{opacity:1,y:0,duration:.35,ease:"power2.out",stagger:.03,clearProps:"all"});
    }
  }
  document.addEventListener("click",e=>{
    if(!mq.matches)return;
    const h=e.target.closest(".card.mc>.head");
    if(h&&!e.target.closest("button,a,input,select,label,[data-rc]")){const c=h.parentElement;toggle(c,c.classList.contains("mc-closed"));return;}
    const sh=e.target.closest(".card h4.look-h.sub");if(sh){sh.dataset.sub=sh.dataset.sub==="closed"?"open":"closed";subSetup();return;}
    /* indice del laboratorio: la scheda scelta si apre */
    const li=e.target.closest("[data-li]");if(li){const cards=[...document.querySelectorAll("#scene-lab .card.mc")].filter(c=>!c.hidden&&c.offsetParent!==null);
      setTimeout(()=>{cards.forEach(c=>{const r=c.getBoundingClientRect();if(r.top>=0&&r.top<window.innerHeight*.6&&c.classList.contains("mc-closed"))toggle(c,true);});},450);}
  },true);
  document.addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target.matches&&e.target.matches(".card.mc>.head")){e.preventDefault();const c=e.target.parentElement;toggle(c,c.classList.contains("mc-closed"));}});
  let t;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(()=>{setup();subSetup();},120);}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["hidden"]});
  const all=()=>{setup();subSetup();};mq.addEventListener?mq.addEventListener("change",all):mq.addListener(all);
  all();
  window.__mc={setup,openAll:()=>document.querySelectorAll(".card.mc").forEach(c=>toggle(c,true))};
})();
