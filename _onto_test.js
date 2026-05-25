// ===== 격리 테스트: 온톨로지 적용 로직 (genProjects v2 + genRiskFlags + fundFlow) =====
function hash01(str,salt=0){let h=2166136261^salt;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}h=(h>>>0);return (h%100000)/100000;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
const won억=a=>a>=10000?(a/10000).toFixed(a>=100000?0:1)+"조원":Math.round(a)+"억원";

const PROGRAM_TYPES=['직접수행','보조','출연','공모','포뮬러'];
const BENEFICIARIES=['개인','기업','지자체','대학','법인','단체'];
const DELIVERERS=['중앙','광역','기초','민간위탁'];
const CONTRACTOR_CAT=['시공','컨설팅','기자재','용역'];
const PROJECT_POOL=["기초연금 지급","영유아 보육료 지원","노인일자리 및 사회활동 지원","생계급여 등 기초생활보장","장애인 활동지원 급여","청년 일자리 창출사업","도로 개설 및 확·포장","상수도시설 정비","하수처리시설 운영·개선","농업인 경영안정 직불금","도시재생 뉴딜사업","공공산후조리·출산장려 지원","지역축제·관광자원 개발","생활폐기물 수집·운반·처리","공공도서관·문화시설 운영","국공립 어린이집 확충·운영","재해예방 및 하천정비","대중교통(버스) 운영지원","스마트도시 기반조성","전통시장 시설현대화"];

function genProjects(key,budget,suui){
  const idx=PROJECT_POOL.map((n,i)=>[n,hash01(key,i*97)]).sort((a,b)=>b[1]-a[1]).slice(0,10).map(x=>x[0]);
  const weights=idx.map((n,i)=>(10-i)+hash01(key,i*31)*4);
  const ws=weights.reduce((a,b)=>a+b,0), pot=budget*0.20;
  return idx.map((n,i)=>{
    const b=Math.round(pot*weights[i]/ws);
    const rate=+clamp(72+hash01(key,i*13)*26,62,99).toFixed(1);
    const settle=Math.round(b*(0.92+hash01(key,i*17)*0.10));
    const spent=Math.round(settle*rate/100);
    const carry=Math.max(0,Math.round((settle-spent)*0.6)); // 이월
    const unused=Math.max(0,settle-spent-carry);            // 불용
    const mr=hash01(key,i*7);
    const ptype=PROGRAM_TYPES[Math.floor(hash01(key,i*23)*PROGRAM_TYPES.length)];
    const ben=BENEFICIARIES[Math.floor(hash01(key,i*29)*BENEFICIARIES.length)];
    const del=DELIVERERS[Math.floor(hash01(key,i*37)*DELIVERERS.length)];
    const method=mr<(suui/100)?'수의계약':mr<0.9?'경쟁입찰':'공모';
    const match=(ptype==='보조'||ptype==='공모')?Math.round(30+hash01(key,i*41)*40):0;
    return {name:n,budget:b,settle,spent,rate,carry,unused,method,programType:ptype,beneficiary:ben,deliverer:del,matchRatio:match};
  });
}

// 5종 RiskFlag (fiscal-ontology v1.2)
function genRiskFlags(R){
  const f=[]; const h=(s)=>hash01(R.key,s);
  // low_competition (저경쟁/수의계약 과다)
  if(R.suuiRatio>=50) f.push({type:'low_competition',label:'저경쟁(수의계약 과다)',sev:'high',conf:0.9,
    desc:`수의계약 비중 ${R.suuiRatio}% — 경쟁입찰이 절반 이하. 특정업체 반복수주·담합 위험.`});
  else if(R.suuiRatio>=40) f.push({type:'low_competition',label:'저경쟁 주의',sev:'mid',conf:0.7,
    desc:`수의계약 비중 ${R.suuiRatio}% — 경쟁성 확보 점검 필요.`});
  // execution_delay (집행 지연)
  const q4jump=R.execQuarters[3]-R.execQuarters[2];
  if(R.execRate<82) f.push({type:'execution_delay',label:'집행 지연',sev:'mid',conf:0.75,
    desc:`세출 집행률 ${R.execRate}% — 이월·불용 가능성. 사업 추진 지연 의심.`});
  else if(q4jump>28) f.push({type:'execution_delay',label:'연말 집행 쏠림',sev:'mid',conf:0.65,
    desc:`4분기 집행 ${q4jump.toFixed(1)}%p 급증 — 예산 소진식 부실집행 위험.`});
  // concentration_high (집중도)
  const ps=R.projects.reduce((a,p)=>a+p.budget,0), top=R.projects[0];
  const share=top.budget/ps*100;
  if(share>=22) f.push({type:'concentration_high',label:'사업 집중도 높음',sev:share>=28?'high':'mid',conf:0.7,
    desc:`최상위 사업 '${top.name}'가 상위10 예산의 ${share.toFixed(1)}% 차지 — 특정사업 편중.`});
  // unit_price_outlier (단가 이상치) — 시공형·수의 결합 시뮬
  const olIdx=R.projects.findIndex((p,i)=>p.method==='수의계약'&&h(i*53)>0.78);
  if(olIdx>=0) f.push({type:'unit_price_outlier',label:'단가 이상치 의심',sev:'mid',conf:0.6,
    desc:`'${R.projects[olIdx].name}' 수의계약 단가가 유사사업 대비 이상치 가능 — 산출근거 확인 권고.`});
  // self_dealing (자전거래/이해상충 — SAME_PRINCIPAL)
  if(R.suuiRatio>=45 && h(999)>0.7) f.push({type:'self_dealing',label:'이해상충(자전거래) 의심',sev:'high',conf:0.55,
    desc:`수의계약 다수 + 동일 실소유주(SAME_PRINCIPAL) 패턴 가능 — 보조사업자↔계약자 관계 확인 필요.`});
  return f;
}

// 4단 자금흐름
function fundFlow(R){
  const total=R.projects.reduce((a,p)=>a+p.budget,0);
  const gukgo=Math.round(total*0.55), gwang=Math.round(total*0.25), gicho=total-gukgo-gwang;
  return [
    {stage:1,from:'국고(중앙부처)',to:'광역시·도',amt:gukgo},
    {stage:2,from:'광역 매칭',to:'기초 시·군·구',amt:gwang},
    {stage:3,from:'기초 매칭',to:'최종수혜자(사업주체)',amt:gicho},
    {stage:4,from:'사업주체',to:'계약자(나라장터)',amt:Math.round(total*0.62)}
  ];
}

// ----- 테스트 -----
const sample={key:'전라남도 강진군',name:'강진군',suuiRatio:66.1,execRate:89.5,
  execQuarters:[14,38,61,89.5]};
sample.projects=genProjects(sample.key,840*5,sample.suuiRatio); // budget억 가정
let issues=[];
console.log("projects:",sample.projects.length);
sample.projects.slice(0,3).forEach(p=>console.log("  -",p.name,"|",p.programType,"|수혜",p.beneficiary,"|전달",p.deliverer,"|예산",won억(p.budget),"|집행률",p.rate+"%","|이월",won억(p.carry),"|불용",won억(p.unused),"|매칭",p.matchRatio+"%","|",p.method));
// 정합성: 집행+이월+불용 ≈ 결산
sample.projects.forEach(p=>{const s=p.spent+p.carry+p.unused; if(Math.abs(s-p.settle)>2)issues.push("결산정합 "+p.name+" "+s+"/"+p.settle);});
const rf=genRiskFlags(sample);
console.log("\nRiskFlags:",rf.length);
rf.forEach(x=>console.log("  ["+x.sev+"]",x.label,"(conf "+x.conf+") —",x.desc));
const ff=fundFlow(sample);
console.log("\nFundFlow 4단:");
ff.forEach(s=>console.log("  stage"+s.stage,s.from,"→",s.to,won억(s.amt)));
console.log("\n=====",issues.length?"문제 "+issues.length:"통과 ✅"); issues.forEach(i=>console.log(" -",i));
