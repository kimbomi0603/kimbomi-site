const noop=()=>{};
function fakeEl(){return new Proxy({innerHTML:'',textContent:'',value:'',disabled:false,scrollTop:0,style:{},classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},addEventListener:noop,appendChild:noop,scrollIntoView:noop,offsetTop:0,querySelectorAll:()=>[]},{get(t,p){return p in t?t[p]:(typeof p==='string'?(t[p]=fakeEl(),t[p]):undefined);}});}
global.document={readyState:'complete',getElementById:()=>fakeEl(),querySelectorAll:()=>[],addEventListener:noop,createElement:()=>fakeEl(),body:{style:{}}};
global.window={addEventListener:noop,scrollTo:noop,open:()=>({document:{write:noop,close:noop}})};
global.localStorage={getItem:()=>null,setItem:noop,removeItem:noop};
global.AbortController=class{constructor(){this.signal={}}abort(){}};
const CHARTS=[];class ChartStub{constructor(el,cfg){CHARTS.push(cfg);}destroy(){}}ChartStub.defaults={font:{},color:''};
global.Chart=ChartStub;global.window.Chart=ChartStub;
const fs=require('fs');let js=fs.readFileSync('_check2.js','utf8');
js+="\nglobal.STATE=STATE;global.aiAnalyze=aiAnalyze;global.fmtwon=won억;global.renderDetail=renderDetail;global.openDetail=openDetail;global.CHARTS=CHARTS;global.extGrade=extGrade;";
eval(js);
let issues=[];const m=STATE.model;
console.log("지자체:",m.length,"(+전국)  등급:",(()=>{const d={A:0,B:0,C:0,D:0,E:0};m.forEach(r=>d[r.grade]++);return JSON.stringify(d);})());
// 신규 필드 검증
let nan=0,bad=0,proj=0;
m.forEach(r=>{
 ['households','elderlyRatio','youthRatio','popChange','extIndex','bankRate','avgDeposit','interestIncome'].forEach(k=>{if(typeof r[k]!=='number'||isNaN(r[k]))nan++;});
 if(!Array.isArray(r.projects)||r.projects.length!==10)proj++;
 r.projects.forEach(p=>{if(isNaN(p.budget)||isNaN(p.spent)||isNaN(p.rate))nan++; if(!p.name||!p.method)bad++;});
 if(r.extIndex<0.05||r.extIndex>1.7)bad++;
 if(r.elderlyRatio<8||r.elderlyRatio>50)bad++;
 if(r.accounts.일반회계+r.accounts.특별회계+r.accounts.기금-r.budget>2)bad++;
 // 주요사업 합 < 예산
 const ps=r.projects.reduce((a,p)=>a+p.budget,0); if(ps>r.budget)bad++;
});
console.log("신규필드 NaN:",nan,"| projects!=10:",proj,"| 정합성:",bad);
if(nan)issues.push("NaN"+nan);if(proj)issues.push("proj"+proj);if(bad)issues.push("정합성"+bad);
// 강진군 금고 최하위권 확인
const gj=STATE.byKey['전라남도 강진군'];
const sorted=m.slice().sort((a,b)=>a.bankRate-b.bankRate); // 오름차순(낮은=꼴찌)
const gjBottom=sorted.findIndex(x=>x.key===gj.key)+1;
console.log("강진군 금고이자율:",gj.bankRate+"%","| 하위",gjBottom,"번째 (낮을수록 꼴찌) / 총",m.length);
console.log("강진군 인구소멸지수:",gj.extIndex,extGrade(gj.extIndex)[0],"| 고령화",gj.elderlyRatio+"%","| 인구",fmtwon?'' :'',gj.pop);
// AI 강진군에 금고 watch 들어갔는지
const a=aiAnalyze(gj);
console.log("강진 AI 감시:",a.watch.map(w=>w[1]).join(' / '));
console.log("강진 AI 제안:",a.prop.map(p=>p[0]).join(' / '));
// renderDetail 동작 (전국 + 강진)
try{ STATE.region=STATE.national; renderDetail(STATE.national); renderDetail(gj); console.log("renderDetail OK (차트 누적:",CHARTS.length,")"); }
catch(e){issues.push("renderDetail오류:"+e.message);console.log("renderDetail ERR",e);}
// 차트 NaN
let cn=0;CHARTS.forEach(c=>(c.data.datasets||[]).forEach(ds=>(ds.data||[]).forEach(v=>{if(typeof v==='number'&&isNaN(v))cn++;})));
console.log("전체 차트 NaN:",cn);if(cn)issues.push("chartNaN"+cn);
console.log("\n=====",issues.length?"문제 "+issues.length+"건 ❌":"모두 통과 ✅");issues.forEach(i=>console.log(" -",i));
