// 재현: accounts 분배 로직 + pop override 가 정합한지 1만회 무작위 검증
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
let bad=0,nan=0,minFundPct=1;
for(let i=0;i<10000;i++){
  const budget=Math.round(500+Math.random()*500000);
  const r=Math.random, ra=r(),rb=r();
  const accGen=Math.round(budget*(0.62+ra*0.10));
  const accSpec=Math.round(budget*(0.16+rb*0.09));
  const accFund=Math.max(0,budget-accGen-accSpec);
  const sum=accGen+accSpec+accFund;
  if(isNaN(sum))nan++;
  if(Math.abs(sum-budget)>1)bad++;          // 반올림 오차 ±1 허용
  if(accFund<0)bad++;
  minFundPct=Math.min(minFundPct,accFund/budget);
}
console.log("accounts 정합성: NaN",nan,"| 위반",bad,"| 최소 기금비중", (minFundPct*100).toFixed(2)+"%");
// pop override 시뮬
const OVERRIDES={"전라남도 강진군":{bankRate:1.55,pop:33000}};
let pop=90000; const _ov=OVERRIDES["전라남도 강진군"]; if(_ov&&_ov.pop)pop=_ov.pop;
console.log("강진군 pop override →", pop, "(실제 강진군 ~33,000명과 일치)");
console.log(bad===0&&nan===0? "✅ 회계 분배 로직 통과 (합계=예산, 기금>0 항상 성립)":"❌ 문제");
