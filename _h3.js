const noop=()=>{};
function fakeEl(){return new Proxy({innerHTML:'',textContent:'',value:'',disabled:false,scrollTop:0,style:{},classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},addEventListener:noop,appendChild:noop,scrollIntoView:noop,offsetTop:0,querySelectorAll:()=>[]},{get(t,p){return p in t?t[p]:(typeof p==='string'?(t[p]=fakeEl(),t[p]):undefined);}});}
global.document={readyState:'complete',getElementById:()=>fakeEl(),querySelectorAll:()=>[],addEventListener:noop,createElement:()=>fakeEl(),body:{style:{}}};
global.window={addEventListener:noop,scrollTo:noop,open:()=>({document:{write:noop,close:noop}})};
global.localStorage={getItem:()=>null,setItem:noop,removeItem:noop};
global.AbortController=class{constructor(){this.signal={}}abort(){}};
const CHARTS=[];class ChartStub{constructor(el,cfg){CHARTS.push(cfg);}destroy(){}}ChartStub.defaults={font:{},color:''};
global.Chart=ChartStub;global.window.Chart=ChartStub;global.CHARTS=CHARTS;
process.on('unhandledRejection',()=>{}); // ignore async fetch rejections
const fs=require('fs');let js=fs.readFileSync('_check2.js','utf8');
js+="\nglobal.STATE=STATE;global.aiAnalyze=aiAnalyze;global.fmtwon=won억;global.renderDetail=renderDetail;global.openDetail=openDetail;global.extGrade=extGrade;";
try{ eval(js); }catch(e){ console.log("EVAL ERROR:",e.message,"\n",e.stack.split('\n').slice(0,3).join('\n')); process.exit(1); }
console.log("eval OK");
