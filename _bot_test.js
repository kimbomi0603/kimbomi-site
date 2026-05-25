const GLOSSARY=[
  {t:"재정자립도",f:"(지방세+세외수입)÷예산×100",d:"스스로 번 돈으로 살림을 얼마나 꾸리는지 보는 지표.",flag:"⚠️ 30% 미만이면 의존재정"},
  {t:"수의계약",f:"경쟁입찰 없이 특정 업체와 직접 맺는 계약",d:"경쟁 없이 한 업체를 골라 맺는 계약. 비싸지거나 특혜·담합 위험.",flag:"⚠️ 비중 높으면 적신호"},
  {t:"이월·불용",f:"이월=다음해로 넘김·불용=못씀",d:"그 해에 다 못 쓴 돈.",flag:"⚠️ 반복되면 과다편성"},
  {t:"금고 이자율 (은행)",f:"예치이자=평균잔액×이자율",d:"세금을 맡긴 은행 이자율.",flag:"⚠️ 낮으면 손해"}
];
const RISKFLAG_DEF={self_dealing:["이해상충","동일 실소유주 의심"],unit_price_outlier:["단가 이상치","단가가 통계적 이상치"],low_competition:["저경쟁","수의계약 과다"]};
const STATE={region:{key:'전라남도 강진군',display:'전라남도 강진군',name:'강진군',grade:'C',score:55,selfReliance:16.3,debtRatio:2,execRate:89.5,bankRate:1.9,bankName:'농협은행'},national:{key:'전국',display:'전국',name:'전국'},
  model:[{key:'전라남도 강진군',name:'강진군',display:'전라남도 강진군'},{key:'경기도 수원시',name:'수원시',display:'경기도 수원시'}],byKey:{}};
STATE.model.forEach(r=>STATE.byKey[r.key]=r); STATE.byKey['전국']=STATE.national;
const SIDO=[{nm:'전라남도'},{nm:'경기도'}];
function genRiskFlags(R){return R.bankRate<2.2?[{type:'low_competition'},{type:'self_dealing'}]:[];}
function botFindTerm(q){for(const g of GLOSSARY){const key=g.t.replace(/[\s·]/g,'');if(q.includes(key))return g;}
 if(q.includes('자립도'))return GLOSSARY.find(g=>g.t.includes('재정자립도'));
 if(q.includes('금고')||q.includes('이자'))return GLOSSARY.find(g=>g.t.includes('금고'));
 if(q.includes('수의'))return GLOSSARY.find(g=>g.t.includes('수의계약'));
 if(q.includes('이월')||q.includes('불용'))return GLOSSARY.find(g=>g.t.includes('이월'));return null;}
function botRegionSummary(R){const flags=R.key!=='전국'?genRiskFlags(R):[];let s=`[${R.display}] 등급 ${R.grade}·자립도 ${R.selfReliance}%·금고 ${R.bankRate}%`;if(R.key!=='전국')s+=` · 위험플래그 ${flags.length}건`;return s;}
function botFindRegion(raw){let best=null;STATE.model.forEach(r=>{if(r.name.length>=2&&raw.includes(r.name)){if(!best||r.name.length>best.name.length)best=r;}});SIDO.forEach(s=>{if(raw.includes(s.nm)&&(!best||s.nm.length>best.name.length))best=STATE.byKey[s.nm];});return best;}
const BOT_EXTRA={'예산':'한 해 살림 계획','세입':'들어오는 돈'};
const BOT_HELP=[{k:['비교','vs'],a:'⚖️ 비교하기 메뉴 사용'},{k:['pdf','다운로드'],a:'📄 PDF 생성 버튼'}];
function botReply(raw){const q=raw.replace(/\s/g,'').toLowerCase();if(!q)return '입력!';
 if(/(안녕|하이|hi|hello)/.test(q))return '[인사]';
 if(/(우리동네|우리지역|내동네)/.test(q))return botRegionSummary(STATE.region||STATE.national);
 const reg=botFindRegion(raw);if(reg)return botRegionSummary(reg);
 const g=botFindTerm(q);if(g)return `[용어:${g.t}] ${g.d}`;
 if(q.includes('자전거래'))return '[자전거래] '+RISKFLAG_DEF.self_dealing[1];
 for(const k in BOT_EXTRA){if(q.includes(k))return `[기본:${k}] ${BOT_EXTRA[k]}`;}
 for(const h of BOT_HELP){if(h.k.some(k=>q.includes(k.replace(/\s/g,'').toLowerCase())))return '[도움]'+h.a;}
 return '[폴백]';}

const tests=['안녕','재정자립도가 뭐야?','수의계약이 뭐야?','이월이 뭐야?','금고 이자율이 왜 중요해?','우리동네 어때?','수원시는 어때?','예산이 뭐야?','어떻게 비교해?','PDF 어떻게 받아?','자전거래가 뭐야?','날씨 알려줘'];
tests.forEach(t=>console.log(`Q: ${t}\n→ ${botReply(t)}\n`));
console.log("✅ 봇 응답 로직 동작 확인");
