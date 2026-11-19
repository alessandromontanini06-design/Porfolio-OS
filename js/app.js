/* Portfolio OS · interfaccia: punto di partenza. Il codice è diviso in moduli nella cartella ui/ (vedi ui/LEGGIMI.md). */
import { $, CALM, HAS_G, P, S, loadXLSX, whenIdle } from "./ui/core.js";
import { go, heroIntro, morphInit, movePill, renderPager } from "./ui/scene.js";
import { TPL_KEY, an, load, loadExample } from "./ui/importa.js";
import { svHome } from "./ui/archivio.js";
import { loadEtfInfo } from "./ui/laboratorio.js";
import { realCalc } from "./ui/rendimento.js";
import { TOOLS_LOCAL, quantaScene } from "./ui/quanta.js";
import { loadMarket, renderLabs } from "./ui/home.js";
import { pmHas, pmRender } from "./ui/patrimonio.js";
import "./ui/screenshot.js";
import "./ui/ruolo.js";
import "./ui/vetrina.js";
import "./ui/costibanca.js";

/* ---------- Avvio ---------- */
load(P.sampleSheets(),{name:"esempio_portafoglio.xlsx",size:0,kind:"sample"},false);/* subito qualcosa da mostrare, poi il portafoglio di esempio vero */
/* il portafoglio d'esempio vero (Excel + prezzi di 7 ETF) si prepara quando il sito è libero, e solo sulla home:
   chi apre sul proprio patrimonio non deve aspettare i prezzi dell'esempio. Il lettore Excel arriva comunque quando c'è tempo. */
const startPm=pmHas()&&!/[?&]home\b/.test(location.search);let exPre=false;
const preEx=()=>{if(exPre)return;exPre=true;whenIdle(()=>loadExample(false),3000);};
if(!startPm)preEx();else{const mo=new MutationObserver(()=>{if(document.body.dataset.scene==="home"){mo.disconnect();preEx();}});mo.observe(document.body,{attributes:true,attributeFilter:["data-scene"]});}
whenIdle(()=>loadXLSX().catch(()=>{}),8000);
if(!CALM)morphInit();
renderLabs();if(!$("#mkt")||!$("#mkt").classList.contains("v2-hidden"))loadMarket();
quantaScene("home");svHome();
requestAnimationFrame(movePill);
if(!HAS_G)heroIntro();
renderPager("home");
/* chi ha già un patrimonio lo ritrova subito: il sito si apre sulla sezione Patrimonio, con i prezzi del giorno */
pmRender();if(startPm)go("patrimonio");
/* per i test automatici: caricare fogli come se fossero un file e leggere cosa ha capito il sito */
window.__pos={real:()=>{const R=realCalc();return R?{error:R.error||null,used:R.pp?R.pp.used:null,unmatched:R.pp?R.pp.unmatched.length:null,nTx:S.tx&&S.tx.rows.length,ok:!!(S.ds&&S.ds.ok),lab:!!S.lab}:{none:true,tx:!!S.tx,ds:!!(S.ds&&S.ds.ok)};},tool:(n,a)=>TOOLS_LOCAL[n](a||{}),pf:()=>S.portfolio,loadEtfInfo:()=>loadEtfInfo(),loadSheets:(sheets,name)=>load(sheets,{name:name||"prova.xlsx",size:0,kind:"file"},true),
  state:()=>({recipe:S.recipe?{status:S.recipe.status,tipo:S.recipe.r&&S.recipe.r.tipoFile,raw:S.recipe.r&&{c:S.recipe.r.serieInColonna,m:S.recipe.r.matriciRendimenti,provider:S.recipe.r.provider},errors:S.recipe.errors||[],msg:S.recipe.msg||null}:null,sheet:an()&&an().name,
    assets:S.ds&&S.ds.ok?S.ds.assets.map(a=>`${a.name}:${a.role}`):[],obs:S.ds&&S.ds.ok?S.ds.nObs:0,
    und:S.und&&S.und.posizioni?S.und.posizioni.map(p=>`${p.ticker}→${p.simbolo}`):null,sheets:S.sheets.map(s=>s.name),
    checks:(S.checks||[]).map(c=>({id:c.id,block:c.block,done:c.done})),tpl:!!S.tplUsed,tx:S.tx?S.tx.rows.length:0,rebuilt:S.source&&S.source.kind==="rebuilt",portfolio:S.portfolio?S.portfolio.positions.map(p=>`${p.ticker||p.nome}→${p.simbolo}`):null,confirmDisabled:$("#confirmBtn").disabled}),
  forgetTemplates:()=>{try{localStorage.removeItem(TPL_KEY);}catch{}}};
