const fmt=n=>Math.round(n).toLocaleString('ko-KR');
const COMPARE_METRICS=[
  {k:'selfReliance',l:'재정자립도',u:'%',better:'high'},
  {k:'debtRatio',l:'채무비율',u:'%',better:'low'},
  {k:'bankRate',l:'금고 이자율',u:'%',better:'high'},
  {k:'suuiRatio',l:'수의계약 비중',u:'%',better:'low'},
  {k:'perCapitaBudget',l:'1인당 예산',u:'만원',better:'neutral'},
];
const STATE={model:[
  {key:'A',name:'A',selfReliance:62,debtRatio:10,bankRate:3.1,suuiRatio:30,perCapitaBudget:380,score:74},
  {key:'B',name:'B',selfReliance:17,debtRatio:2, bankRate:1.9,suuiRatio:66,perCapitaBudget:840,score:55},
  {key:'C',name:'C',selfReliance:45,debtRatio:25,bankRate:2.5,suuiRatio:42,perCapitaBudget:300,score:60},
  {key:'D',name:'D',selfReliance:74,debtRatio:5, bankRate:4.8,suuiRatio:20,perCapitaBudget:480,score:82},
]};
function rankByMetric(R,k,better){const arr=STATE.model.slice().sort((a,b)=> better==='low'? a[k]-b[k] : b[k]-a[k]);const i=arr.findIndex(x=>x.key===R.key);return i<0?null:i+1;}
function pctTop(rank,total){return Math.max(1,Math.round(rank/total*100));}
const total=STATE.model.length;
const A=STATE.model[0], B=STATE.model[1];
let issues=[];
console.log("A vs B 비교 (총",total,"개 기준):\n");
COMPARE_METRICS.forEach(m=>{
  const av=A[m.k],bv=B[m.k];
  const aR=rankByMetric(A,m.k,m.better), bR=rankByMetric(B,m.k,m.better);
  const w=(m.better==='neutral'||av===bv)?0:(m.better==='low'?(av<bv?-1:1):(av>bv?-1:1));
  const winner=w===0?'참고/무승부':(w===-1?'A':'B');
  console.log(`${m.l.padEnd(8)} A=${av}${m.u}(${aR}위·상위${pctTop(aR,total)}%)  B=${bv}${m.u}(${bR}위·상위${pctTop(bR,total)}%)  → 우위: ${winner}`);
});
// 검증: 채무비율 낮은 B가 1위여야(better=low). 금고이자율 낮은 B는 꼴찌(4위).
if(rankByMetric(B,'debtRatio','low')!==1) issues.push("채무 low-rank 오류");
if(rankByMetric(D=STATE.model[3],'debtRatio','low')!==2) issues.push("채무 D 2위 오류");
if(rankByMetric(B,'bankRate','high')!==4) issues.push("금고 B 꼴찌 오류");
if(rankByMetric(D,'bankRate','high')!==1) issues.push("금고 D 1위 오류");
// 자립도: A=62는 2위(D 74 1위)
if(rankByMetric(A,'selfReliance','high')!==2) issues.push("자립도 A 2위 오류");
console.log("\n=====",issues.length?"문제 "+issues.length+" ❌":"통과 ✅"); issues.forEach(i=>console.log(" -",i));
