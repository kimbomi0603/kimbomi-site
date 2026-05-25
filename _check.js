
/* ============================================================
   재정주권 365 · 데이터 레이어
   - 전국 17개 광역 + 226개 기초자치단체 (제주 행정시·세종 단층 포함)
   - 인구/재정자립도는 행정안전부·지방재정365 실제 통계에 기반한 시드값
   - 시군구 세부수치는 시드 해시로 결정론적 생성(시연용 추정치)
   ============================================================ */

const NATIONAL = {
  year: 2025,
  totalBudget: 326_0000,           // 억원 단위 (=326조). 내부 계산은 억원 기준
  avgSelfReliance: 48.6,           // 재정자립도(통합) 평균 %
  avgAutonomy: 70.3,               // 재정자주도 평균 %
  population: 51_300_000,
  // 세입 재원 구성 (2025, 조원) → 억원
  revenue: { 지방세:0, 세외수입:0, 지방교부세:0, 국고보조금:0, 지방채:5_9000, 보전수입:23_6000 },
  // 자체수입 145.6조(지방세+세외), 이전수입 150.9조(교부세+보조금)
  selfIncome: 145_6000, transferIncome: 150_9000
};
// 세입 세분 (대략적 분해, 억원)
NATIONAL.revenue.지방세 = 118_0000;
NATIONAL.revenue.세외수입 = 27_6000;
NATIONAL.revenue.지방교부세 = 70_0000;
NATIONAL.revenue.국고보조금 = 80_9000;

// 14대 분야 세출 + 기본 배분 가중치(전국 평균 근사 %)
const SECTORS = [
  ["사회복지", 30.5], ["일반공공행정", 11.5], ["국토및지역개발", 8.5], ["환경", 8.8],
  ["교통및물류", 7.0], ["농림해양수산", 6.2], ["문화및관광", 5.2], ["공공질서및안전", 3.4],
  ["교육", 4.0], ["보건", 3.0], ["산업·중소기업·에너지", 3.0], ["과학기술", 0.9],
  ["예비비", 2.0], ["기타", 6.0]
];

// 광역 시·도 메타 (인구=명, sr=재정자립도 본청 2024 기준 근사)
const SIDO = [
  {nm:"서울특별시",   pop:9386000,  sr:74.0},
  {nm:"부산광역시",   pop:3293000,  sr:45.1},
  {nm:"대구광역시",   pop:2375000,  sr:44.3},
  {nm:"인천광역시",   pop:3003000,  sr:49.6},
  {nm:"광주광역시",   pop:1419000,  sr:40.0},
  {nm:"대전광역시",   pop:1442000,  sr:42.0},
  {nm:"울산광역시",   pop:1103000,  sr:46.3},
  {nm:"세종특별자치시",pop:387000,  sr:57.5},
  {nm:"경기도",       pop:13630000, sr:55.1},
  {nm:"강원특별자치도",pop:1527000, sr:28.0},
  {nm:"충청북도",     pop:1591000,  sr:34.0},
  {nm:"충청남도",     pop:2130000,  sr:37.0},
  {nm:"전북특별자치도",pop:1754000, sr:26.0},
  {nm:"전라남도",     pop:1800000,  sr:25.0},
  {nm:"경상북도",     pop:2544000,  sr:28.0},
  {nm:"경상남도",     pop:3251000,  sr:38.0},
  {nm:"제주특별자치도",pop:675000,  sr:33.0}
];

// 기초자치단체(시·군·구). 세종=단층, 제주=행정시
const SIGUNGU = {
  "서울특별시":["종로구","중구","용산구","성동구","광진구","동대문구","중랑구","성북구","강북구","도봉구","노원구","은평구","서대문구","마포구","양천구","강서구","구로구","금천구","영등포구","동작구","관악구","서초구","강남구","송파구","강동구"],
  "부산광역시":["중구","서구","동구","영도구","부산진구","동래구","남구","북구","해운대구","사하구","금정구","강서구","연제구","수영구","사상구","기장군"],
  "대구광역시":["중구","동구","서구","남구","북구","수성구","달서구","달성군","군위군"],
  "인천광역시":["중구","동구","미추홀구","연수구","남동구","부평구","계양구","서구","강화군","옹진군"],
  "광주광역시":["동구","서구","남구","북구","광산구"],
  "대전광역시":["동구","중구","서구","유성구","대덕구"],
  "울산광역시":["중구","남구","동구","북구","울주군"],
  "세종특별자치시":[],
  "경기도":["수원시","성남시","의정부시","안양시","부천시","광명시","평택시","동두천시","안산시","고양시","과천시","구리시","남양주시","오산시","시흥시","군포시","의왕시","하남시","용인시","파주시","이천시","안성시","김포시","화성시","광주시","양주시","포천시","여주시","연천군","가평군","양평군"],
  "강원특별자치도":["춘천시","원주시","강릉시","동해시","태백시","속초시","삼척시","홍천군","횡성군","영월군","평창군","정선군","철원군","화천군","양구군","인제군","고성군","양양군"],
  "충청북도":["청주시","충주시","제천시","보은군","옥천군","영동군","증평군","진천군","괴산군","음성군","단양군"],
  "충청남도":["천안시","공주시","보령시","아산시","서산시","논산시","계룡시","당진시","금산군","부여군","서천군","청양군","홍성군","예산군","태안군"],
  "전북특별자치도":["전주시","군산시","익산시","정읍시","남원시","김제시","완주군","진안군","무주군","장수군","임실군","순창군","고창군","부안군"],
  "전라남도":["목포시","여수시","순천시","나주시","광양시","담양군","곡성군","구례군","고흥군","보성군","화순군","장흥군","강진군","해남군","영암군","무안군","함평군","영광군","장성군","완도군","진도군","신안군"],
  "경상북도":["포항시","경주시","김천시","안동시","구미시","영주시","영천시","상주시","문경시","경산시","의성군","청송군","영양군","영덕군","청도군","고령군","성주군","칠곡군","예천군","봉화군","울진군","울릉군"],
  "경상남도":["창원시","진주시","통영시","사천시","김해시","밀양시","거제시","양산시","의령군","함안군","창녕군","고성군","남해군","하동군","산청군","함양군","거창군","합천군"],
  "제주특별자치도":["제주시","서귀포시"]
};

// 결정론적 해시 (지역명 → 0~1)
function hash01(str, salt=0){
  let h = 2166136261 ^ salt;
  for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h,16777619); }
  h = (h>>>0);
  return (h % 100000) / 100000;
}
function rng(seedStr){ // 여러 독립 난수
  let n = 0;
  return ()=> hash01(seedStr, ++n*7919);
}

// 재정 교과서 콘텐츠
const GLOSSARY = [
  {t:"재정자립도", f:"(지방세 + 세외수입) ÷ 일반회계 예산 × 100", d:"우리동네가 스스로 번 돈으로 살림을 얼마나 꾸리는지 보는 핵심 지표. 높을수록 중앙정부 의존이 적습니다.", flag:"⚠️ 30% 미만이면 자체 재원이 매우 약함 — 의존재정 구조"},
  {t:"재정자주도", f:"(자체수입 + 자주재원) ÷ 예산 × 100", d:"교부세처럼 용도를 자유롭게 쓸 수 있는 돈까지 포함한, '내 마음대로 쓸 수 있는 돈'의 비율입니다.", flag:"⚠️ 자립도는 낮아도 자주도는 높을 수 있음 — 함께 봐야 함"},
  {t:"통합재정수지", f:"총수입 − 총지출 (순융자 제외)", d:"한 해 살림이 흑자인지 적자인지를 보여줍니다. 적자가 이어지면 빚으로 메우게 됩니다.", flag:"⚠️ 만성 적자 + 채무 증가는 위험 조합"},
  {t:"채무비율", f:"지방채무 잔액 ÷ 예산 × 100", d:"갚아야 할 빚이 1년 살림 대비 얼마나 되는지입니다. 행안부는 25% 이상을 주의·심각 단계로 봅니다.", flag:"⚠️ 25% 주의 · 40% 심각(재정위기 기준)"},
  {t:"세출 집행률", f:"실제 집행액 ÷ 최종예산 × 100", d:"편성한 예산을 제때 제대로 썼는지입니다. 너무 낮으면 사업 부진·이월·불용, 연말 몰아쓰기는 부실집행 신호.", flag:"⚠️ 60% 미만(연중) 또는 4분기 급증은 점검 대상"},
  {t:"1인당 예산", f:"총예산 ÷ 주민 수", d:"주민 한 명에게 배분되는 살림 규모. 인구 적은 군 지역이 높게 나오는 경향이 있어 같은 유형끼리 비교해야 합니다.", flag:"⚠️ 유사단체 대비 과도하면 효율성 점검"},
  {t:"수의계약 비중", f:"수의계약액 ÷ 총계약액 × 100", d:"경쟁 없이 특정 업체와 맺는 계약 비율. 높을수록 특혜·담합 위험이 커져 가장 강력한 감시 포인트입니다.", flag:"⚠️ 비중이 높고 특정업체 반복 수주면 적신호"},
  {t:"재정자립도 vs 자주도", f:"자립도 ≤ 자주도", d:"자립도는 '내가 번 돈', 자주도는 '내가 자유롭게 쓰는 돈'. 둘의 격차가 크면 교부세 의존이 크다는 뜻입니다.", flag:"💡 두 지표를 항상 함께 해석"}
];

const ACTIONS = [
  {n:"1", t:"이상 신호 캡처", d:"AI 재정전문가의 🚨감시 항목이나 차트에서 튀는 수치를 발견하면 화면을 저장하고 수치·연도를 메모하세요."},
  {n:"2", t:"원자료 교차확인", d:"지방재정365·지방재정통합공시(lofin365)에서 같은 항목을 검색해 추정 시연치가 아닌 실제 공시값을 확인하세요."},
  {n:"3", t:"정보공개 청구", d:"근거가 더 필요하면 정부24·정보공개포털(open.go.kr)에서 해당 사업의 계약서·집행내역·산출근거를 청구할 수 있습니다."},
  {n:"4", t:"질의·제보", d:"지역 시·도의원, 주민감사청구, 시민단체, 언론 제보로 '견제' 질문을 공식화하세요. 이 플랫폼의 🔍견제 문항을 그대로 활용하세요."},
  {n:"5", t:"예산 참여", d:"주민참여예산제·공청회에 참여해 💡제안 항목을 정책으로 제안하세요. 감시를 넘어 대안을 제시하는 것이 재정주권입니다."},
  {n:"6", t:"공유·확산", d:"우리동네 진단 결과를 이웃과 공유하세요. 많은 눈이 지켜볼수록 혈세는 더 투명해집니다."}
];


/* ============================================================
   재정주권 365 · 애플리케이션 엔진
   ============================================================ */
if(window.Chart){ Chart.defaults.font.family="'Noto Sans KR',sans-serif"; Chart.defaults.color="#5b6b82"; }
const PAL = {blue:"#1d6fe0",teal:"#0fb9a6",green:"#16a34a",amber:"#f59e0b",red:"#e11d48",purple:"#7c3aed",navy:"#13315c",slate:"#94a3b8",sky:"#38bdf8",pink:"#ec4899",lime:"#84cc16",orange:"#fb923c"};
const fmt = n => Math.round(n).toLocaleString('ko-KR');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const won억 = a => a>=10000 ? (a/10000).toFixed(a>=100000?0:1)+"조원" : fmt(a)+"억원";

const STATE = { live:false, key:"", proxy:"", year:2025, region:null, charts:{}, model:[], byKey:{} };

/* ---------- 지역별 재정 모델 생성 ---------- */
function regionType(name){
  if(name.endsWith("군")) return "군";
  if(name.endsWith("구")) return "구";
  if(name.endsWith("시")) return "시";
  return "특별";
}
function genRegion(sidoObj, name, isSido){
  const sido = sidoObj.nm;
  const key = isSido ? sido : sido+" "+name;
  const r = rng(key);
  const type = isSido ? "광역" : regionType(name);
  // 인구
  let pop;
  if(isSido){ pop = sidoObj.pop; }
  else if(type==="구") pop = Math.round(120000 + r()*480000);
  else if(type==="시") pop = Math.round(70000 + r()*1030000);
  else if(type==="군") pop = Math.round(18000 + r()*112000);
  else pop = sidoObj.pop; // 세종 단층
  // 재정자립도
  let sr;
  if(isSido) sr = sidoObj.sr;
  else {
    let f = type==="구" ? 0.55+r()*0.7 : type==="시" ? 0.55+r()*0.55 : type==="군" ? 0.28+r()*0.4 : 1;
    sr = sidoObj.sr * f;
  }
  sr = clamp(sr, 7, 88);
  // 재정자주도 (항상 자립도 이상)
  let auto = clamp(sr + 22 + r()*32, sr+8, 94);
  // 1인당 예산 베이스(만원)
  let perCap;
  if(isSido) perCap = 300 + (1 - pop/13_630_000)*230 + r()*60;
  else perCap = type==="구" ? 240+r()*180 : type==="시" ? 300+r()*260 : type==="군" ? 520+r()*620 : 380;
  let budget = Math.round(pop*perCap/10000); // 억원
  // 채무비율
  let debtRatio = clamp(r()*30 * (1.25 - sr/120), 0, 46);
  if(r()<0.18) debtRatio = Math.round(r()*4); // 일부 저채무
  debtRatio = +debtRatio.toFixed(1);
  let debt = Math.round(budget*debtRatio/100);
  // 통합재정수지 (예산 대비 ±)
  let balance = Math.round(budget * ((r()-0.55)*0.09));
  // 집행률
  let execRate = clamp(88 + (r()-0.5)*17, 76, 98); execRate=+execRate.toFixed(1);
  // 수의계약 비중
  let suui = type==="군" ? 42+r()*33 : (type==="구"||type==="시") ? 22+r()*38 : 28+r()*22;
  suui = clamp(suui, 12, 78); suui=+suui.toFixed(1);
  let contractTotal = Math.round(budget*(0.28+r()*0.16));
  // 세입 재원
  const self = budget*sr/100;
  const jibangse = Math.round(self*0.76), sewoe=Math.round(self*0.24);
  const gyobu = Math.round(budget*(auto-sr)/100);
  let remaining = budget - jibangse - sewoe - gyobu;
  let jibangchae = Math.round(Math.min(budget*0.03, debt*0.12) + budget*0.004);
  let bojeon = Math.round(Math.max(0,remaining)*0.16);
  let gukgo = Math.max(0, remaining - jibangchae - bojeon);
  const revenue = {지방세:jibangse, 세외수입:sewoe, 지방교부세:Math.max(0,gyobu), 국고보조금:gukgo, 지방채:jibangchae, 보전수입:bojeon};
  // 분야별 세출
  let weights = SECTORS.map(([nm,w],i)=>{
    let adj=w;
    if(type==="군"){ if(nm==="농림해양수산")adj*=2.4; if(nm==="사회복지")adj*=0.78; if(nm==="국토및지역개발")adj*=1.3; }
    if(type==="구"){ if(nm==="사회복지")adj*=1.22; if(nm==="농림해양수산")adj*=0.15; }
    if(type==="시"){ if(nm==="국토및지역개발")adj*=1.15; }
    adj *= (0.82 + hash01(key,i*131)*0.4);
    return [nm,adj];
  });
  const wsum = weights.reduce((s,[,w])=>s+w,0);
  const sectors = weights.map(([nm,w])=>({name:nm, pct:+(w/wsum*100).toFixed(1), amt:Math.round(budget*w/wsum)}))
                         .sort((a,b)=>b.amt-a.amt);
  // 분기 누적 집행률
  const q4 = execRate;
  let q1 = +(q4*(0.16+r()*0.06)).toFixed(1);
  let q2 = +(q4*(0.40+r()*0.07)).toFixed(1);
  let q3 = +(q4*(0.66+r()*0.07)).toFixed(1);
  const execQuarters=[q1,q2,q3,q4];
  // 5년 추이
  const trend=[]; let b=budget, d=debt;
  for(let y=STATE.year; y>STATE.year-5; y--){
    trend.unshift({year:y, budget:Math.round(b), debt:Math.round(d)});
    b = b/(1+(0.025+hash01(key,y)*0.05)); d = d*(0.86+hash01(key,y*3)*0.3);
  }
  // 점수
  const sSelf=clamp(sr/70*100,0,100);
  const sAuto=clamp((auto-30)/55*100,0,100);
  const sDebt=clamp((42-debtRatio)/42*100,0,100);
  const sExec=clamp(100-Math.abs(execRate-93)*3.5,0,100);
  const sBal = balance>=0?100:clamp(100-(-balance/budget*100)*14,0,100);
  const sSuui=clamp((72-suui)/57*100,0,100);
  const score = +(0.24*sSelf+0.13*sAuto+0.22*sDebt+0.13*sExec+0.09*sBal+0.19*sSuui).toFixed(1);
  const grade = score>=78?"A":score>=66?"B":score>=54?"C":score>=42?"D":"E";
  const perCapBudget=+(budget*10000/pop).toFixed(0);
  return {key,sido,name:isSido?sido:name,display:isSido?sido:sido+" "+name,isSido,type,pop,budget,
    selfReliance:+sr.toFixed(1),autonomy:+auto.toFixed(1),balance,debt,debtRatio,execRate,suuiRatio:suui,
    contractTotal,revenue,sectors,execQuarters,trend,score,grade,perCapitaBudget:perCapBudget,
    subScores:{sSelf,sAuto,sDebt,sExec,sBal,sSuui}};
}

function buildModel(){
  const model=[];
  SIDO.forEach(s=>{
    model.push(genRegion(s,s.nm,true));
    (SIGUNGU[s.nm]||[]).forEach(sg=> model.push(genRegion(s,sg,false)));
  });
  STATE.model=model;
  model.forEach(r=> STATE.byKey[r.key]=r);
  // 전국
  const nat=buildNational(); STATE.byKey[nat.key]=nat; STATE.national=nat;
}
function buildNational(){
  const R=NATIONAL.revenue;
  const budget=NATIONAL.totalBudget;
  const sectors = SECTORS.map(([nm,w])=>({name:nm,pct:w,amt:Math.round(budget*w/100)})).sort((a,b)=>b.amt-a.amt);
  const debtRatio=12.4, debt=Math.round(budget*debtRatio/100);
  const execRate=90.6, suui=31.5, balance=Math.round(budget*0.004);
  const auto=NATIONAL.avgAutonomy, sr=NATIONAL.avgSelfReliance;
  const sSelf=clamp(sr/70*100,0,100),sAuto=clamp((auto-30)/55*100,0,100),sDebt=clamp((42-debtRatio)/42*100,0,100),
    sExec=clamp(100-Math.abs(execRate-93)*3.5,0,100),sBal=100,sSuui=clamp((72-suui)/57*100,0,100);
  const score=+(0.24*sSelf+0.13*sAuto+0.22*sDebt+0.13*sExec+0.09*sBal+0.19*sSuui).toFixed(1);
  const grade=score>=78?"A":score>=66?"B":score>=54?"C":score>=42?"D":"E";
  const trend=[]; let b=budget,d=debt;
  for(let y=STATE.year;y>STATE.year-5;y--){trend.unshift({year:y,budget:Math.round(b),debt:Math.round(d)});b=b/1.051;d=d*0.93;}
  return {key:"전국",sido:"전국",name:"전국",display:"전국 (대한민국 지방재정 합계)",isSido:false,type:"전국",
    pop:NATIONAL.population,budget,selfReliance:sr,autonomy:auto,balance,debt,debtRatio,execRate,suuiRatio:suui,
    contractTotal:Math.round(budget*0.33),revenue:{지방세:R.지방세,세외수입:R.세외수입,지방교부세:R.지방교부세,국고보조금:R.국고보조금,지방채:R.지방채,보전수입:R.보전수입},
    sectors,execQuarters:[16.5,42.0,67.0,execRate],trend,score,grade,
    perCapitaBudget:+(budget*10000/NATIONAL.population).toFixed(0),
    subScores:{sSelf,sAuto,sDebt,sExec,sBal,sSuui}};
}

/* ---------- AI 재정전문가 ---------- */
function aiAnalyze(R){
  const watch=[],check=[],prop=[];
  const avg=NATIONAL.avgSelfReliance, avgA=NATIONAL.avgAutonomy;
  // 감시
  if(R.selfReliance<30) watch.push(["high","재정자립도 취약",`재정자립도 ${R.selfReliance}% — 전국평균(${avg}%)을 크게 밑돕니다. 자체 재원이 약해 외부 의존도가 높습니다.`]);
  else if(R.selfReliance<avg) watch.push(["mid","재정자립도 평균 이하",`재정자립도 ${R.selfReliance}%로 전국평균(${avg}%) 미만입니다.`]);
  if(R.debtRatio>=40) watch.push(["high","채무비율 심각",`채무비율 ${R.debtRatio}% — 행안부 재정위기 '심각'(40%) 기준에 근접/초과. 상환부담이 큽니다.`]);
  else if(R.debtRatio>=25) watch.push(["mid","채무비율 주의",`채무비율 ${R.debtRatio}% — '주의'(25%) 단계. 신규 채무 발행을 점검해야 합니다.`]);
  if(R.execRate<80) watch.push(["mid","집행 부진",`세출 집행률 ${R.execRate}% — 사업 지연·이월·불용 가능성. 예산이 계획대로 쓰이지 않고 있습니다.`]);
  const q4jump=R.execQuarters[3]-R.execQuarters[2];
  if(q4jump>28) watch.push(["mid","연말 몰아쓰기 의심",`4분기에 집행률이 ${q4jump.toFixed(1)}%p 급증 — 예산 소진식 부실집행 위험.`]);
  if(R.suuiRatio>=50) watch.push(["high","수의계약 과다",`수의계약 비중 ${R.suuiRatio}% — 경쟁 없는 계약이 절반 이상. 특혜·담합 감시가 시급합니다.`]);
  else if(R.suuiRatio>=40) watch.push(["mid","수의계약 비중 높음",`수의계약 비중 ${R.suuiRatio}% — 동일업체 반복 수주 여부를 살펴야 합니다.`]);
  if(R.balance<0) watch.push(["mid","통합재정 적자",`통합재정수지 ${won억(R.balance)} 적자 — 부족분을 빚이나 적립금으로 메우는 구조입니다.`]);
  const top=R.sectors[0];
  if(top.pct>45) watch.push(["low","특정 분야 편중",`'${top.name}'가 세출의 ${top.pct}%로 편중. 다른 분야 투자 위축 여부를 확인하세요.`]);
  if(R.autonomy-R.selfReliance>38) watch.push(["low","교부세 의존",`자립도(${R.selfReliance}%)와 자주도(${R.autonomy}%) 격차가 ${(R.autonomy-R.selfReliance).toFixed(1)}%p — 교부세 의존이 큽니다.`]);

  // 견제 (의원 질문)
  if(R.selfReliance<avg) check.push(["자체수입 확충",`재정자립도가 전국평균 미만입니다. 향후 3년 지방세·세외수입 확충 로드맵과 목표치는 무엇입니까?`]);
  if(R.debtRatio>=20) check.push(["채무 상환계획",`채무비율 ${R.debtRatio}%에 대한 중기 상환계획과, 최근 지방채 발행의 구체적 사용처·필요성은?`]);
  if(R.suuiRatio>=35) check.push(["수의계약 공개",`수의계약 비중이 ${R.suuiRatio}%입니다. 1인 견적 수의계약 건별 내역과 동일업체 반복 수주 현황을 공개할 수 있습니까?`]);
  if(R.execRate<85) check.push(["집행 부진 사유",`집행률이 ${R.execRate}%에 그칩니다. 주요 이월·불용 사업의 사유와 책임소재, 재발방지책은?`]);
  if(q4jump>25) check.push(["연말집행 점검",`4분기 집행 급증의 원인이 '예산 소진'은 아닌지, 사업별 적정 시기 집행 여부를 소명할 수 있습니까?`]);
  if(top.pct>40) check.push(["분야 편중 배경",`'${top.name}' 편중(${top.pct}%)의 정책적 근거와, 상대적으로 적은 분야의 적정성 검토 결과는?`]);
  check.push(["주민참여 검증",`주민참여예산 규모와 실제 반영률은 얼마이며, 성과지표로 사업효과를 검증하고 있습니까?`]);

  // 제안
  if(R.selfReliance<avg){
    prop.push(["세입 기반 강화",`지방세 체납액 징수 강화(전담조직·압류공매), 공유재산·사용료 등 세외수입 신규 발굴, 유휴·빈집 자산 활용으로 자체수입을 늘리세요.`]);
  }
  if(R.debtRatio>=20) prop.push(["채무 구조조정",`연차별 채무상환 목표를 공시하고, 우선순위 낮은 SOC·전시성 사업을 재검토해 신규 채무를 억제하세요.`]);
  if(R.execRate<85||q4jump>25) prop.push(["집행 관리제 도입",`분기별 집행관리 목표제와 이월·불용 사업 일몰제를 도입해, 연말 몰아쓰기 대신 적기·균등 집행을 유도하세요.`]);
  if(R.suuiRatio>=35) prop.push(["계약 투명성 제고",`전자입찰·경쟁계약을 확대하고, 일정금액 이상 수의계약 사전공개 및 계약심사위원회 검증을 의무화하세요.`]);
  if(top.pct>40) prop.push(["균형 투자",`'${top.name}' 외 보건·문화·안전 등 생활밀착 분야의 투자 적정성을 재점검해 균형 있는 배분을 검토하세요.`]);
  // 항상 제시하는 베스트프랙티스
  prop.push(["성과중심 예산",`모든 주요사업에 성과지표(KPI)를 부여하고 결산 시 달성률을 공개해, '돈을 썼는가'에서 '효과가 있었는가'로 전환하세요.`]);
  prop.push(["재정 투명 공개",`예산·집행·계약을 시민이 보기 쉬운 대시보드로 상시 공개하고, 주민참여예산 비중을 단계적으로 확대하세요.`]);

  return {watch,check,prop};
}

/* ---------- 등급 색상 ---------- */
function gradeStyle(g){
  return ({
    A:["linear-gradient(135deg,#15803d,#22c55e)","매우 건전"],
    B:["linear-gradient(135deg,#0f766e,#14b8a6)","양호"],
    C:["linear-gradient(135deg,#b45309,#f59e0b)","보통 · 주의 필요"],
    D:["linear-gradient(135deg,#c2410c,#fb923c)","주의"],
    E:["linear-gradient(135deg,#9f1239,#e11d48)","위험"]
  })[g];
}

/* ---------- 렌더: 지역 hero ---------- */
function renderHero(R){
  const [bg,gl]=gradeStyle(R.grade);
  const gc=document.getElementById('gradeCard');
  gc.style.background=bg;
  document.getElementById('gName').textContent=R.display;
  document.getElementById('gGrade').textContent=R.grade;
  document.getElementById('gLabel').textContent="재정 건강등급 · "+gl;
  document.getElementById('gDesc').textContent=`종합 건강점수 ${R.score}점 / 100점 · 전국 ${rankOf(R,'score')}위`;
  const order=["E","D","C","B","A"]; const lvl=order.indexOf(R.grade);
  document.getElementById('gLights').innerHTML=order.map((g,i)=>`<div class="l ${i<=lvl?'act':''}"></div>`).join('');
  // 요약문
  const avg=NATIONAL.avgSelfReliance;
  const srWord=R.selfReliance>=avg?'전국평균보다 높아 비교적 탄탄':R.selfReliance>=30?'전국평균을 밑돌아 다소 취약':'매우 낮아 의존도가 큼';
  const debtWord=R.debtRatio<15?'안정적':R.debtRatio<25?'관리 가능':'주의가 필요한';
  const execWord=R.execRate>=88?'대체로 제때 집행':'집행이 다소 더딘 편';
  document.getElementById('summaryText').innerHTML=
    `<b>${R.display}</b>의 ${R.trend[R.trend.length-1].year}년 살림 규모는 <b>${won억(R.budget)}</b>, 주민 1인당 <b>${fmt(R.perCapitaBudget)}만원</b> 수준입니다. `+
    `재정자립도는 <b>${R.selfReliance}%</b>로 ${srWord}하며, 채무비율 <b>${R.debtRatio}%</b>로 ${debtWord} 수준입니다. `+
    `세출 집행률은 <b>${R.execRate}%</b>로 ${execWord}이고, 수의계약 비중은 <b>${R.suuiRatio}%</b>입니다. `+
    `AI 재정전문가가 아래에서 감시·견제·제안 포인트를 정리했습니다.`;
  const chips=[];
  chips.push([`종합 ${R.grade}등급`, R.grade<="B"?'good':R.grade=="C"?'warn':'bad']);
  chips.push([`자립도 ${R.selfReliance}%`, R.selfReliance>=avg?'good':R.selfReliance>=30?'warn':'bad']);
  chips.push([`채무 ${R.debtRatio}%`, R.debtRatio<15?'good':R.debtRatio<25?'warn':'bad']);
  chips.push([`집행 ${R.execRate}%`, R.execRate>=88?'good':'warn']);
  chips.push([`수의계약 ${R.suuiRatio}%`, R.suuiRatio<30?'good':R.suuiRatio<45?'warn':'bad']);
  document.getElementById('summaryChips').innerHTML=chips.map(([t,c])=>`<span class="chip ${c}">${t}</span>`).join('');
}

/* ---------- 렌더: KPI ---------- */
function bar(w,color){return `<div class="bar"><i style="width:${clamp(w,2,100)}%;background:${color}"></i></div>`;}
function cmp(v,base,unit,inv){const d=v-base;const good=inv?d<0:d>0;const s=d>=0?'+':'';return `<span class="${good?'up':'down'}">${s}${(+d.toFixed(1))}${unit} vs 전국평균</span>`;}
function renderKPI(R){
  const nat=STATE.national, avg=NATIONAL.avgSelfReliance, avgA=NATIONAL.avgAutonomy;
  const cards=[
    {l:"총예산 규모",ic:"💰",v:won억(R.budget),sub:`전국 ${rankOf(R,'budget')}위 규모`,w:clamp(R.budget/600000*100,3,100),c:PAL.blue,tip:"한 해 편성된 총 예산(세출). 살림의 전체 크기입니다."},
    {l:"주민 1인당 예산",ic:"🧍",v:fmt(R.perCapitaBudget)+"<span class='unit'> 만원</span>",sub:cmp(R.perCapitaBudget,nat.perCapitaBudget,'만원'),w:clamp(R.perCapitaBudget/1500*100,3,100),c:PAL.teal,tip:"예산 ÷ 주민 수. 같은 유형 지자체끼리 비교해야 합니다."},
    {l:"재정자립도",ic:"🏦",v:R.selfReliance+"<span class='unit'> %</span>",sub:cmp(R.selfReliance,avg,'%p'),w:R.selfReliance,c:R.selfReliance>=avg?PAL.green:R.selfReliance>=30?PAL.amber:PAL.red,tip:"스스로 번 돈(지방세+세외)의 비율. 높을수록 자립적."},
    {l:"재정자주도",ic:"🗝️",v:R.autonomy+"<span class='unit'> %</span>",sub:cmp(R.autonomy,avgA,'%p'),w:R.autonomy,c:R.autonomy>=70?PAL.green:R.autonomy>=55?PAL.amber:PAL.red,tip:"자유롭게 쓸 수 있는 돈의 비율(교부세 포함)."},
    {l:"통합재정수지",ic:"⚖️",v:(R.balance>=0?'+':'')+won억(R.balance),sub:R.balance>=0?"<span class='up'>흑자 운영</span>":"<span class='down'>적자 — 빚/적립금 충당</span>",w:clamp(Math.abs(R.balance)/R.budget*100*8,3,100),c:R.balance>=0?PAL.green:PAL.red,tip:"총수입-총지출. 한 해 살림의 흑자/적자."},
    {l:"채무비율",ic:"📉",v:R.debtRatio+"<span class='unit'> %</span>",sub:R.debtRatio<25?"<span class='up'>위기단계 아님</span>":"<span class='down'>주의/심각 구간</span>",w:clamp(R.debtRatio/45*100,2,100),c:R.debtRatio<15?PAL.green:R.debtRatio<25?PAL.amber:PAL.red,tip:"빚 잔액 ÷ 예산. 25% 주의·40% 심각."},
    {l:"세출 집행률",ic:"📊",v:R.execRate+"<span class='unit'> %</span>",sub:R.execRate>=88?"<span class='up'>정상 집행</span>":"<span class='down'>집행 부진</span>",w:R.execRate,c:R.execRate>=88?PAL.green:R.execRate>=80?PAL.amber:PAL.red,tip:"집행액 ÷ 최종예산. 너무 낮거나 연말 급증은 신호."},
    {l:"수의계약 비중",ic:"📝",v:R.suuiRatio+"<span class='unit'> %</span>",sub:R.suuiRatio<30?"<span class='up'>경쟁계약 중심</span>":"<span class='down'>경쟁성 점검 필요</span>",w:R.suuiRatio,c:R.suuiRatio<30?PAL.green:R.suuiRatio<45?PAL.amber:PAL.red,tip:"경쟁 없이 맺는 계약 비율. 높을수록 감시 필요."},
    {l:"종합 건강점수",ic:"🩺",v:R.score+"<span class='unit'> 점</span>",sub:`${R.grade}등급 · 전국 ${rankOf(R,'score')}위`,w:R.score,c:gradeStyle(R.grade)[0].includes('e11d48')?PAL.red:gradeStyle(R.grade)[0].includes('f59e0b')||gradeStyle(R.grade)[0].includes('fb923c')?PAL.amber:PAL.green,tip:"6대 지표를 가중평균한 자체 종합 점수."}
  ];
  document.getElementById('kpiGrid').innerHTML=cards.map(c=>`
    <div class="kpi">
      <div class="label">${c.ic} ${c.l} <span class="tip" title="${c.tip}">?</span></div>
      <div class="val mono">${c.v}</div>
      <div class="sub">${c.sub}</div>
      ${bar(c.w,c.c)}
    </div>`).join('');
}

/* ---------- 렌더: AI 패널 ---------- */
function renderAI(R){
  const {watch,check,prop}=aiAnalyze(R);
  const sevName={high:'sev-high',mid:'sev-mid',low:'sev-low'};
  document.getElementById('aiWatch').innerHTML = watch.length?watch.map(([s,t,d])=>
    `<div class="ai-item ${sevName[s]}"><span class="t">${s==='high'?'🔴':s==='mid'?'🟠':'🟢'} ${t}</span>${d}</div>`).join('')
    : `<div class="ai-item sev-low"><span class="t">🟢 특이 이상신호 없음</span>주요 지표가 양호한 범위입니다. 그래도 정기 점검은 계속하세요.</div>`;
  document.getElementById('aiCheck').innerHTML = check.map(([t,d])=>
    `<div class="ai-item check"><span class="t">🔍 ${t}</span>${d}</div>`).join('');
  document.getElementById('aiProp').innerHTML = prop.map(([t,d])=>
    `<div class="ai-item prop"><span class="t">💡 ${t}</span>${d}</div>`).join('');
  document.getElementById('cntWatch').textContent=watch.length;
  document.getElementById('cntCheck').textContent=check.length;
  document.getElementById('cntProp').textContent=prop.length;
  const verdictMap={A:["재정 매우 건전","감시 포인트 적음 · 모범 운영"],B:["대체로 양호","경미한 점검 사항 위주"],
    C:["보통 · 주의 필요","개선 여지가 있는 지표 존재"],D:["주의 단계","복수의 이상신호 — 집중 감시 권고"],E:["위험 단계","즉각적 견제·개선이 필요"]};
  const hi=watch.filter(w=>w[0]==='high').length;
  document.getElementById('aiVerdict').textContent=verdictMap[R.grade][0];
  document.getElementById('aiVerdictSub').textContent=verdictMap[R.grade][1]+(hi?` · 🔴${hi}건`:'');
}

/* ---------- 차트 ---------- */
function destroy(id){ if(STATE.charts[id]){STATE.charts[id].destroy(); delete STATE.charts[id];} }
function mkChart(id,cfg){ destroy(id); const el=document.getElementById(id); if(el) STATE.charts[id]=new Chart(el,cfg); }
const moneyTip = (ctx)=> ` ${ctx.label||ctx.dataset.label}: ${won억(ctx.parsed.y!=null?ctx.parsed.y:ctx.parsed)}`;

function renderCharts(R){
  // 세입 구성
  const rev=R.revenue; const rk=Object.keys(rev); const rv=rk.map(k=>rev[k]);
  mkChart('chartRevenue',{type:'doughnut',data:{labels:rk,datasets:[{data:rv,
    backgroundColor:[PAL.blue,PAL.sky,PAL.amber,PAL.orange,PAL.red,PAL.slate],borderWidth:2,borderColor:'#fff'}]},
    options:{plugins:{legend:{position:'right',labels:{boxWidth:12,font:{size:11}}},
      tooltip:{callbacks:{label:c=>` ${c.label}: ${won억(c.parsed)} (${(c.parsed/R.budget*100).toFixed(1)}%)`}}},
      cutout:'58%',responsive:true,maintainAspectRatio:false}});
  // 분야별 세출
  const sec=R.sectors.slice(0,12);
  mkChart('chartExpenditure',{type:'bar',data:{labels:sec.map(s=>s.name),datasets:[{label:'세출예산',
    data:sec.map(s=>s.amt),backgroundColor:sec.map((s,i)=>i===0?PAL.navy:PAL.blue),borderRadius:5}]},
    options:{indexAxis:'y',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${won억(c.parsed.x)} (${R.sectors[c.dataIndex].pct}%)`}}},
      scales:{x:{ticks:{callback:v=>won억(v)}},y:{ticks:{font:{size:10.5}}}},responsive:true,maintainAspectRatio:false}});
  // 집행률 추적
  mkChart('chartExecution',{type:'line',data:{labels:['1분기','2분기','3분기','4분기(연말)'],
    datasets:[
      {label:'실제 누적 집행률',data:R.execQuarters,borderColor:PAL.blue,backgroundColor:'rgba(29,111,224,.12)',fill:true,tension:.3,borderWidth:3,pointRadius:4},
      {label:'균등집행 기준선',data:[25,50,75,100],borderColor:PAL.slate,borderDash:[6,5],borderWidth:2,pointRadius:0,fill:false}
    ]},options:{plugins:{legend:{labels:{boxWidth:12,font:{size:11}}},
      tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.y}%`}}},
      scales:{y:{min:0,max:100,ticks:{callback:v=>v+'%'}}},responsive:true,maintainAspectRatio:false}});
  // 계약현황
  const gyeong=100-R.suuiRatio;
  mkChart('chartContract',{type:'doughnut',data:{labels:['수의계약','경쟁입찰'],
    datasets:[{data:[R.suuiRatio,+gyeong.toFixed(1)],backgroundColor:[R.suuiRatio>=45?PAL.red:R.suuiRatio>=30?PAL.amber:PAL.teal,PAL.blue],borderWidth:2,borderColor:'#fff'}]},
    options:{plugins:{legend:{position:'bottom',labels:{boxWidth:12}},
      tooltip:{callbacks:{label:c=>` ${c.label}: ${c.parsed}% (약 ${won억(R.contractTotal*c.parsed/100)})`}},
      title:{display:true,text:`총 계약규모 약 ${won억(R.contractTotal)}`,font:{size:12},color:'#5b6b82'}},
      cutout:'55%',responsive:true,maintainAspectRatio:false}});
  // 5년 추이 (예산 bar + 채무 line)
  mkChart('chartTrend',{data:{labels:R.trend.map(t=>t.year+'년'),
    datasets:[
      {type:'bar',label:'총예산',data:R.trend.map(t=>t.budget),backgroundColor:PAL.blue,borderRadius:5,yAxisID:'y',order:2},
      {type:'line',label:'채무 잔액',data:R.trend.map(t=>t.debt),borderColor:PAL.red,backgroundColor:'rgba(225,29,72,.1)',borderWidth:3,tension:.3,pointRadius:4,yAxisID:'y1',order:1,fill:true}
    ]},options:{plugins:{legend:{labels:{boxWidth:12}},tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${won억(c.parsed.y)}`}}},
      scales:{y:{position:'left',title:{display:true,text:'예산'},ticks:{callback:v=>won억(v)}},
        y1:{position:'right',title:{display:true,text:'채무'},grid:{drawOnChartArea:false},ticks:{callback:v=>won억(v)}}},
      responsive:true,maintainAspectRatio:false}});
  // 레이더
  const m=metricsFor(R), nat=metricsFor(STATE.national), sim=similarMetrics(R.type);
  mkChart('chartRadar',{type:'radar',data:{labels:['재정자립도','재정자주도','집행 적정','채무 건전','계약 투명','수지 건전'],
    datasets:[
      {label:R.display.length>10?R.name:R.display,data:m,borderColor:PAL.blue,backgroundColor:'rgba(29,111,224,.18)',borderWidth:2,pointRadius:3},
      {label:'전국 평균',data:nat,borderColor:PAL.amber,backgroundColor:'rgba(245,158,11,.08)',borderWidth:2,pointRadius:2},
      {label:'유사단체('+R.type+') 평균',data:sim,borderColor:PAL.teal,backgroundColor:'rgba(15,185,166,.08)',borderWidth:2,borderDash:[5,4],pointRadius:2}
    ]},options:{plugins:{legend:{labels:{boxWidth:12,font:{size:10.5}}}},
      scales:{r:{min:0,max:100,ticks:{stepSize:20,font:{size:9},backdropColor:'transparent'},pointLabels:{font:{size:11,weight:'600'}}}},
      responsive:true,maintainAspectRatio:false}});
}
function metricsFor(R){return [
  clamp(R.selfReliance/80*100,0,100),
  clamp(R.autonomy/95*100,0,100),
  clamp(100-Math.abs(R.execRate-93)*3,0,100),
  clamp(100-R.debtRatio*2.2,0,100),
  clamp(100-R.suuiRatio,0,100),
  R.subScores.sBal
].map(v=>+v.toFixed(0));}
let _simCache={};
function similarMetrics(type){
  if(_simCache[type]) return _simCache[type];
  const pool=STATE.model.filter(r=>r.type===type);
  if(!pool.length){return _simCache[type]=metricsFor(STATE.national);}
  const acc=[0,0,0,0,0,0];
  pool.forEach(r=>{const m=metricsFor(r);m.forEach((v,i)=>acc[i]+=v);});
  return _simCache[type]=acc.map(v=>+(v/pool.length).toFixed(0));
}

/* ---------- 순위 ---------- */
function rankOf(R,metric){
  const arr=STATE.model.slice();
  const inc = (metric==='debtRatio'); // 채무는 낮을수록 좋음 → 오름차순 순위 기준 다름. 여기선 동일 기준 정렬
  arr.sort((a,b)=> metric==='debtRatio'? a[metric]-b[metric] : b[metric]-a[metric]);
  if(R.key==='전국') return '–';
  return arr.findIndex(x=>x.key===R.key)+1;
}
function rankRender(){
  const metric=document.getElementById('rankMetric').value;
  const typeF=document.getElementById('rankType').value;
  const q=document.getElementById('rankSearch').value.trim();
  let arr=STATE.model.slice();
  if(typeF==='sido') arr=arr.filter(r=>r.isSido);
  else if(typeF==='sigungu') arr=arr.filter(r=>!r.isSido);
  arr.sort((a,b)=> metric==='debtRatio'? a[metric]-b[metric] : b[metric]-a[metric]);
  const ranked=arr.map((r,i)=>({...r,_rank:i+1}));
  const shown=q?ranked.filter(r=>r.display.includes(q)):ranked;
  document.getElementById('rankCount').textContent=`${shown.length}개 지자체`;
  const cur=STATE.region?STATE.region.key:'';
  document.getElementById('rankBody').innerHTML=shown.slice(0,400).map(r=>`
    <tr class="${r.key===cur?'me':''}" data-key="${r.key}">
      <td><span class="rk ${r._rank<=3?'g'+r._rank:''}">${r._rank}</span></td>
      <td><b>${r.display}</b></td>
      <td><span class="pill ${r.grade}">${r.grade}</span></td>
      <td class="mono">${r.selfReliance}%</td>
      <td class="mono">${r.autonomy}%</td>
      <td class="mono">${fmt(r.perCapitaBudget)}만</td>
      <td class="mono">${r.debtRatio}%</td>
      <td class="mono">${r.execRate}%</td>
      <td class="mono"><b>${r.score}</b></td>
    </tr>`).join('');
  document.querySelectorAll('#rankBody tr').forEach(tr=>tr.addEventListener('click',()=>{
    selectByKey(tr.dataset.key); window.scrollTo({top:document.getElementById('diagnose').offsetTop-50,behavior:'smooth'});
  }));
}

/* ---------- 교육 / 액션 ---------- */
function renderEdu(){
  document.getElementById('eduGrid').innerHTML=GLOSSARY.map(g=>`
    <div class="edu"><h4>📘 ${g.t}</h4>
      <div class="formula">${g.f}</div><p>${g.d}</p><div class="flag">${g.flag}</div></div>`).join('');
}
function renderActions(){
  document.getElementById('actionGrid').innerHTML=ACTIONS.map(a=>`
    <div class="act"><div class="n">${a.n}</div><h4>${a.t}</h4><p>${a.d}</p></div>`).join('');
}

/* ---------- 선택 & 렌더 ---------- */
function renderAll(R){
  STATE.region=R;
  renderHero(R); renderKPI(R); renderAI(R); renderCharts(R); rankRender();
}
function selectByKey(key){
  const R=STATE.byKey[key]; if(!R) return;
  // 드롭다운 동기화
  if(R.key==='전국'){ sidoSel.value='전국'; fillSigungu('전국'); }
  else { sidoSel.value=R.sido; fillSigungu(R.sido); sigunguSel.value=R.isSido?'__ALL__':R.name; }
  renderAll(R);
  if(STATE.live) tryLiveFetch(R);
}
function currentSelection(){
  const sd=sidoSel.value;
  if(sd==='전국') return STATE.national;
  const sg=sigunguSel.value;
  if(sg==='__ALL__') return STATE.byKey[sd];
  return STATE.byKey[sd+' '+sg] || STATE.byKey[sd];
}

/* ---------- 드롭다운 ---------- */
const sidoSel=document.getElementById('sidoSel');
const sigunguSel=document.getElementById('sigunguSel');
const yearSel=document.getElementById('yearSel');
function fillSido(){
  sidoSel.innerHTML=`<option value="전국">🇰🇷 전국 (전체 합계)</option>`+
    SIDO.map(s=>`<option value="${s.nm}">${s.nm}</option>`).join('');
}
function fillSigungu(sido){
  if(sido==='전국'){ sigunguSel.innerHTML=`<option value="__ALL__">— 전국 —</option>`; sigunguSel.disabled=true; return; }
  sigunguSel.disabled=false;
  const list=SIGUNGU[sido]||[];
  sigunguSel.innerHTML=`<option value="__ALL__">▣ ${sido} 전체(본청)</option>`+
    list.map(s=>`<option value="${s}">${s}</option>`).join('');
}
function fillYear(){
  yearSel.innerHTML=[2025,2024,2023,2022,2021].map(y=>`<option value="${y}">${y}년</option>`).join('');
}

/* ---------- API 연동 ---------- */
const DATASETS={selfReliance:'15058102',budget:'15138708',expenditure:'15057408',expByFunc:'15058215',revExp:'15058182'};
function buildApiUrl(datasetId,params){
  const base=`https://api.odcloud.kr/api/${datasetId}/v1/uddi`; // 실제 사용 시 데이터셋의 uddi 리소스 경로로 교체
  const sp=new URLSearchParams({serviceKey:STATE.key,page:'1',perPage:'100',returnType:'JSON',...params});
  let url=`${base}?${sp.toString()}`;
  if(STATE.proxy) url=STATE.proxy+encodeURIComponent(url);
  return url;
}
async function tryLiveFetch(R){
  if(!STATE.live||!STATE.key) return;
  const st=document.getElementById('apiStatus');
  st.innerHTML=`상태: <span style="color:#1d6fe0">⟳ ${R.display} 실시간 데이터 조회 중…</span>`;
  try{
    const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),7000);
    const res=await fetch(buildApiUrl(DATASETS.selfReliance,{}),{signal:ctrl.signal});
    clearTimeout(t);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const json=await res.json();
    const rows=json.data||json.body?.items||[];
    const mapped=mapLiveData(rows,R);
    if(mapped){ st.innerHTML=`상태: <span style="color:#16a34a">✓ 실시간 데이터 연동됨 (${R.display})</span>`; renderAll(R); }
    else { st.innerHTML=`상태: <span style="color:#16a34a">✓ API 응답 수신 — 해당 지역 항목 매핑 대기(데이터셋 리소스 경로 확인 필요)</span>`; }
  }catch(e){
    st.innerHTML=`상태: <span style="color:#b45309">⚠ 브라우저 직접호출 차단(CORS) 또는 리소스경로 미설정 — 시연 데이터 유지. 해결: 위 '프록시' 칸 입력 또는 서버에서 호출(${e.message})</span>`;
  }
}
function mapLiveData(rows,R){
  if(!rows||!rows.length) return false;
  // 응답 컬럼명은 데이터셋마다 달라, 지역명·자립도 후보 키를 탐색
  const find=(o,cands)=>{for(const k of Object.keys(o)){if(cands.some(c=>k.includes(c)))return o[k];}return null;};
  const target=R.name.replace(/(특별자치도|특별자치시|특별시|광역시|도)$/,'');
  const row=rows.find(o=>{const nm=find(o,['지자체','자치단체','지역','시도','시군구','단체명']);return nm&&String(nm).includes(target);});
  if(!row) return false;
  const sr=parseFloat(find(row,['재정자립도','자립도']));
  if(!isNaN(sr)){ R.selfReliance=+sr.toFixed(1); return true; }
  return false;
}
function setLive(on){
  STATE.live=on;
  const dot=document.getElementById('liveDot'),txt=document.getElementById('liveText'),db=document.getElementById('demoBanner');
  if(on){ dot.classList.add('on'); txt.textContent='실시간 연동'; db.classList.add('live');
    db.innerHTML=`<span style="font-size:18px">🟢</span><span><b>실시간 연동 모드</b> — 공공데이터포털 인증키로 실제 데이터 조회를 시도합니다. 차단(CORS) 시 자동으로 시연 데이터를 유지합니다.</span>`;}
  else { dot.classList.remove('on'); txt.textContent='시연 데이터'; db.classList.remove('live');
    db.innerHTML=`<span style="font-size:18px">ℹ️</span><span><b>현재 시연(데모) 모드</b>입니다. 표시 수치는 행정안전부·지방재정365의 <b>실제 전국·시도 통계</b>에 기반한 추정치이며, 위 🔌 패널에서 인증키를 입력하면 선택 지역의 <b>실시간 실제 데이터</b>로 자동 전환됩니다.</span>`;}
}

/* ---------- 토스트 ---------- */
let toastT;
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),2600);}

/* ---------- 이벤트 ---------- */
function wire(){
  sidoSel.addEventListener('change',()=>{ fillSigungu(sidoSel.value); renderAll(currentSelection()); if(STATE.live)tryLiveFetch(currentSelection()); });
  sigunguSel.addEventListener('change',()=>{ renderAll(currentSelection()); if(STATE.live)tryLiveFetch(currentSelection()); });
  document.getElementById('diagnoseBtn').addEventListener('click',()=>{ renderAll(currentSelection()); window.scrollTo({top:document.getElementById('ai').offsetTop-50,behavior:'smooth'}); });
  document.getElementById('randomBtn').addEventListener('click',()=>{ const r=STATE.model[Math.floor(Math.random()*STATE.model.length)]; selectByKey(r.key); toast('🎲 '+r.display+' 진단!'); });
  yearSel.addEventListener('change',()=>{ STATE.year=+yearSel.value; _simCache={}; const cur=STATE.region?STATE.region.key:'전국'; buildModel(); selectByKey(cur); });
  ['rankMetric','rankType'].forEach(id=>document.getElementById(id).addEventListener('change',rankRender));
  document.getElementById('rankSearch').addEventListener('input',rankRender);
  document.getElementById('liveBadge').addEventListener('click',()=>{ document.getElementById('apiPanel').classList.add('open'); document.getElementById('apiPanel').scrollIntoView({behavior:'smooth'}); });
  document.getElementById('connectBtn').addEventListener('click',()=>{
    const k=document.getElementById('apiKey').value.trim();
    if(!k){ toast('⚠️ 인증키를 입력하세요'); return; }
    STATE.key=k; STATE.proxy=document.getElementById('proxyUrl').value.trim();
    try{localStorage.setItem('jjs_key',k);localStorage.setItem('jjs_proxy',STATE.proxy);}catch(e){}
    setLive(true); toast('🔌 실시간 연동을 시도합니다'); tryLiveFetch(STATE.region||STATE.national);
  });
  document.getElementById('disconnectBtn').addEventListener('click',()=>{
    STATE.key='';STATE.proxy=''; try{localStorage.removeItem('jjs_key');localStorage.removeItem('jjs_proxy');}catch(e){}
    setLive(false); document.getElementById('apiStatus').textContent='상태: 미연동 (시연 데이터 표시 중)'; toast('시연 데이터로 전환');
    renderAll(STATE.region||STATE.national);
  });
}

/* ---------- 초기화 ---------- */
function init(){
  buildModel();
  fillSido(); fillSigungu('전국'); fillYear();
  renderEdu(); renderActions();
  wire();
  // 저장된 키 복원
  try{const sk=localStorage.getItem('jjs_key');const sp=localStorage.getItem('jjs_proxy');
    if(sk){document.getElementById('apiKey').value=sk;STATE.key=sk;}if(sp){document.getElementById('proxyUrl').value=sp;STATE.proxy=sp;}
  }catch(e){}
  selectByKey('전국');
  rankRender();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
