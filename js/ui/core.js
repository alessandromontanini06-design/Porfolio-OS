/* Portfolio OS · interfaccia · cose comuni a tutta l'interfaccia: stato S, scorciatoie, colori, formati.
   Parte di app.js divisa in moduli: il codice è lo stesso, cambiano solo import ed export. */
/* Portfolio OS · interfaccia (scene, grafici, IA, ricevute). Importa il motore. */
import { POS } from "../engine.js";
const P=POS;
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const {fmtN,fmtPct,fmtDate}=P;
const REDUCE=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const CALM=true; // grafica 2: niente sfera 3D, cursore personalizzato, apertura animata e transizioni pesanti (il codice resta, basta mettere false)
const FINE=window.matchMedia("(hover:hover) and (pointer:fine)").matches;
const G=window.gsap,ST=window.ScrollTrigger,HAS_G=!!(G&&ST)&&!REDUCE;
if(HAS_G)G.registerPlugin(ST);
const ROLES=[{v:"date",l:"Data"},{v:"price",l:"Prezzo / valore"},{v:"ret",l:"Rendimento (decimale)"},{v:"retpct",l:"Rendimento (in %)"},{v:"ignore",l:"Ignora"}];
const ROLE_SHORT={price:"prezzi",ret:"rendimenti",retpct:"rendimenti %"};
const ROLE_TAG={date:"data",price:"prezzo",ret:"rend.",retpct:"rend. %",ignore:"ignora"};
const ROLE_COLOR={date:"var(--c4)",price:"var(--c1)",ret:"var(--c3)",retpct:"var(--c3)",ignore:"var(--faint)"};
const CONF_L={alta:"Alta",media:"Da verificare",bassa:"Da confermare",utente:"Confermata"};
const COLORS=["var(--c1)","var(--c2)","var(--c3)","var(--c4)","var(--c5)","var(--c6)","var(--c7,#8C8C8C)"];
const NET_COLORS=["#C8FF2E","#A47BFF","#47E5FF","#FF7AD9","#FFC24B","#5BF0A5"];
const color=i=>COLORS[i%COLORS.length];
const fmtSize=b=>b<1024?b+" B":b<1048576?fmtN(b/1024,0)+" KB":fmtN(b/1048576,1)+" MB";
const S={source:null,raw:[],sheets:[],sheetIdx:0,roles:{},touched:{},ds:null,lab:null,corrView:"mat",scanPlayed:false,labFx:{},ai:null,aiLog:[],aiRoles:{},rawOrig:null,macro:null,rfSrc:"ecb"};

/* lettore Excel (SheetJS, 197 KB): non all'apertura, ma quando serve (file, esempio, esportazioni) o quando il sito è libero */
const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
let xlsxP = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return xlsxP ||= new Promise((ok, ko) => { const s = document.createElement("script"); s.src = XLSX_URL; s.async = true; s.crossOrigin = "anonymous";
    s.onload = () => window.XLSX ? ok(window.XLSX) : ko(new Error("noxlsx")); s.onerror = () => { xlsxP = null; s.remove(); ko(new Error("noxlsx")); }; document.head.appendChild(s); });
}
/* lavori non urgenti: quando il browser è libero (o al massimo dopo qualche secondo) */
const whenIdle = (cb, max = 4000) => ("requestIdleCallback" in window ? requestIdleCallback(() => cb(), { timeout: max }) : setTimeout(cb, Math.min(max, 1500)));

export { loadXLSX, whenIdle, $, CALM, COLORS, CONF_L, FINE, G, HAS_G, NET_COLORS, P, POS, REDUCE, ROLES, ROLE_COLOR, ROLE_SHORT, ROLE_TAG, S, ST, color, esc, fmtDate, fmtN, fmtPct, fmtSize };
