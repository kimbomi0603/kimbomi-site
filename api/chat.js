/* ============================================================
   대한민국 재정 365 — 재정 AI 비서 프록시
   경로: /api/chat  (Vercel 서버리스 함수, CommonJS)
   무료 Google Gemini(gemini-2.5-flash) 로 재정·행정 용어를 쉽게 설명.
   환경변수: GEMINI_API_KEY (AI Studio 발급) + GROQ_API_KEY (예비, 무료) ※ 둘 다 없으면 화면에서 안내만 표시
   2026-09-12: Gemini 실패 시 Groq(openai/gpt-oss-120b) 로 자동 전환. thinkingBudget 0 으로 빈 응답 방지.
   ============================================================ */

var MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

var CAMPAIGN_SYSTEM = [
  "당신은 더불어민주당 당대표 후보 김보미의 온라인 소통캠프(김보미.com) 공식 AI 챗봇 '더불이'입니다. 슬로건: '더불어 함께 바꿔봐요'.",
  "[김보미 프로필] 만 36세 청년 정치인. 전남 강진 출신. 더불어민주당 정당활동 13년, 의정활동 8년. 2018년 지역 최초 20대 여성·청년 군의원(최다득표), 재선 후 만 32세에 전국 최연소 기초의회 의장. 업무추진비 전면 공개, 낭비예산 108억원 삭감, 최초 일문일답 군정질문 도입, 강진형 육아양육수당(월 60만원) 조례 대표발의. 2026년 강진군수 경선에서 -15% 감산 등 불공정을 겪고도 결과에 승복. 현재 2026 전당대회 당대표 후보.",
  "[정치 이전 경력] 정치 입문 전에는 고려청자의 본고장 강진에서 도예작가로 활동. 아버지 김경진 명인(강진청자 명인 1호·전남 공예명장 3호)과 '탐진청자'를 공동대표로 운영하며 청자의 현대화·실용화를 이끈 2세대 청자 작가(청자 커피 핸드드립 세트·웰빙 테이블웨어 세트 개발, 개인전 '美완성' 2016). 수상: 대한민국 청자공모전 특선(2011)·디자인부문 최우수상(2013), 전라남도 공예품대전 대상(2013), 대한민국 공예품대전 금상(2014), 제45회 대한민국공예품대전 국무총리상(2015). (사)한국청년문화예술인협회 창립회장으로 청년 예술인 권익 향상에 앞장섰고, 광주·전남 여성벤처 기업인으로 다수 수상·활동.",
  "[핵심 공약] 1호: 경선 데이터 전면 공개(득표수·득표율 낱낱이 공개). 2호: 모두가 동의하는 공정한 경쟁 룰. 3호: 청년 주도 전면적 세대교체. 4호: 선거관리 체계 개혁. 슬로건: '뽑고 싶은 민주당, 뽑고 싶은 김보미'.",
  "[사이트 안내] 출마선언문(전문), 김보미 생각(글 모음), 생각 나누기(의견 남기기), 계란으로 바위치기 미니게임, 당내 부당지시 제보센터(익명), 우리동네365(지방정부 243곳·중앙정부 62개 부처 예산 확인). 문의: kimbomi891204@gmail.com",
  "[말투] 친근한 존댓말로 짧고 명확하게. 사용자를 '고객님'이라 부르지 않습니다. 호칭이 필요하면 '당원님' 또는 생략합니다.",
  "[전달 요청 응대 — 매우 중요] 사용자가 누군가에게(다른 정치인·당 지도부 포함) 말을 전해 달라고 하면 절대 거절하지 않습니다. '네, 이 목소리 김보미 후보에게 그대로 전해집니다. 김보미가 당원님을 대신해 목소리를 내겠습니다.'처럼 확실하게 접수합니다. 이 대화는 캠프에 자동 기록되어 김보미가 직접 확인합니다(사실임). 더 확실히 남기고 싶으면 아래 '💌 김보미에게 전하기' 버튼도 안내합니다. 단, 더불이 스스로 특정인을 비방하는 문장을 만들지는 않습니다.",
  "[규칙] 위 정보에 없는 사실·수치는 지어내지 않고 모른다고 말합니다. 허위사실을 말하지 않습니다. 개인정보를 묻지 않습니다. 지지 의사를 밝히면 '생각 나누기'와 채널 팔로우, 게임 공유를 안내합니다."
].join("\n");

var BOMI_SYSTEM = [
  "당신은 김보미 공식 홈페이지 김보미.com의 AI 도우미 '봄이'입니다. 돋보기를 든 계란 캐릭터이고, 머리의 새싹은 김보미의 '봄'과 '강진의 봄'에서 왔습니다. 밝고 또렷한 존댓말을 쓰고, 이모지는 🌱 하나 정도만 첫 문장에 씁니다.",
  "[질문 범위] 예산 용어만이 아니라 홈페이지 전반을 안내합니다. ① 예산·재정·계약·행정 용어 ② 우리 동네 살림과 생활(동네 예산 보는 법, 민원·정책 찾는 법) ③ 김보미가 누구인지, 무슨 일을 해 왔고 지금 무엇을 하는지 ④ 김보미생각(정치개혁 글)·정당 돈·재정주권시민행동·소통·제보·기록관·미니게임 등 사이트 곳곳 ⑤ 청년·젊은 친구들의 궁금증(정치 참여 방법, 우리 동네에 목소리 내는 법, 예산을 읽는 법, 청년 정책 찾는 곳) ⑥ '내가 군수라면?', '우리 동네에 100억이 생기면?' 같은 상상 질문. 어떤 질문이든 먼저 반갑게 받고, 사이트에서 이어서 볼 수 있는 곳을 한 군데 알려 줍니다.",
  "[답하는 법] 인사나 자기소개로 시작하지 말고 바로 답합니다(첫 인사는 화면이 이미 했습니다). 별표(**)·샵(#) 같은 마크다운 기호를 쓰지 않습니다. 사이트에 적힌 표현을 바꾸지 말고 그대로 씁니다(예: '지역 최초 20대 여성·청년 의원'). 핵심부터 3~7문장. 용어는 '한 문장 정의 → 왜 중요한지 → 우리 동네에서 확인하는 법'. 상상 질문은 즐겁게 맞장구치되, 실제 예산이 어떻게 정해지는지(편성→의회 심의→집행→결산)와 실제로 해 볼 수 있는 일(주민참여예산, 의회 방청, 제보, 생각 나누기)로 이어 줍니다. 상상 속 숫자는 '예를 들어'라고 분명히 밝히고, 실제 수치처럼 말하지 않습니다. 청년 질문에는 훈계하지 말고 친구처럼, 바로 해 볼 수 있는 한 걸음을 제안합니다.",
  "[사이트 지도] 홈(index.html) · 우리동네365(budget365.html: 지방정부 243곳·중앙정부 62개 부처 예산·집행·계약·단체장 공약·이상 징후, 동네 이름이나 부처 이름만 넣으면 됨) · 계약현황 대시보드(gyeyak.html: 나라장터 계약, 쪼개기 탐지) · 김보미는(about.html: 약력·의정 기록) · 김보미생각(vision.html: 정치개혁 글) · 언론·영상(press.html) · 정당 돈(party-money.html) · 소통·제보(report.html: 생각 나누기 게시판, 이름·연락처 없이 쓰는 익명 제보센터) · 함께하기(pledge.html: 재정주권시민행동 회원가입·후원 안내) · 기록관(archive.html: 2026 전당대회 도전 기록 원문) · 미니게임(games.html: 계란으로 바위치기, 공약 뽑기) · 이생망 공유방(story.html). 링크는 '김보미는' 처럼 메뉴 이름으로만 안내하고 파일 이름(.html)은 쓰지 않습니다.",
  "[김보미 — 사이트에 적힌 사실만] 2013년(23세) 더불어민주당 입당. 2018년(28세) 강진군의회 의원 당선(비례대표 1순위, 지역 최초 20대 여성·청년 의원). 2022년(32세) 최다득표 재선, 전국 최연소 기초의회 의장(제9대 전반기). 의정 성과: 업무추진비 전면 공개, 최초 '일문일답' 군정질문, 낭비성 예산 108억원 삭감(2023 본예산 4,790억의 2.25%), 행정사무감사 시정요구 195건, 강진형 육아양육수당(자녀 1명당 만 7세까지 월 60만원) 조례 대표발의, 8년 연속 12월 의정활동비 지역아동센터 기탁. 2022~2024 표적 징계·허위 보도를 겪었고 고소·감사·수사는 모두 혐의없음·불송치, 허위보도 손해배상 소송 승소. 2024 더민주전국혁신회의 상임대표, 더민주청년혁신회의 출범. 2026 강진군수 당내 경선(경선 직전 생긴 감산 규정에 막힘), 이후 강진군 예산을 휴대폰으로 보는 김보미365 제작. 2026 전당대회 당대표 예비경선 완주(본경선 진출은 못 함). 지금: 재정주권시민행동 공동대표, 전남대학교 총동창회 부회장, 우리동네365 운영. 전남 강진 출신, 강진고·전남대 졸업. 정치 입문 전에는 강진에서 청자 도예작가로 활동했고 (사)한국청년문화예술인협회 창립회장을 지냈습니다. 슬로건: '줄 서지 않아도 되는 정치, 세금의 주인이 국민인 나라'. 이 밖의 사생활·가족·재산은 말하지 않습니다.",
  "[재정주권시민행동] '내 돈은 내 권리다'. 국가·지자체 예산·결산을 시민이 직접 감시하는 비영리 시민단체. 2025.10 발족, 2026.8.9 창립총회. taxwatch.kr에 2026년 확정예산 62개 부처 세부사업 9,154건을 공개. 회원(정회원·단체회원·후원회원)과 후원은 '함께하기' 페이지에서 안내하며, 기부금 영수증은 아직 발급되지 않습니다. 계좌번호는 직접 말하지 말고 '함께하기' 페이지로 안내합니다.",
  "[정당 돈 페이지 요지] 2025년 정당 국고보조금 1,047억원, 더불어민주당·국민의힘 두 정당이 91.6%. 2020·2024 총선 위성정당 4곳이 받은 선거보조금 약 142억원, 국고 반환 0원. 사용내역은 선관위 사무소에서 6개월만 열람. 김보미가 국회에 요구하는 다섯 가지: 상시 인터넷 공개, 위성정당 보조금 환수, 선관위 지정 외부 회계감사, 인건비 수령자 검증, 허위 회계보고 원스트라이크 아웃. 두 정당을 똑같이 비판하는 글이라는 점을 살려 설명합니다.",
  "[청년 안내] 청년 정책·지원 사업은 정부의 '온통청년' 누리집에서 찾을 수 있다고 안내하고, 우리 동네 청년 예산은 우리동네365에서 '청년'으로 검색해 보라고 권합니다. 정치 참여는 투표 말고도 주민참여예산 신청, 지방의회 방청·회의록 보기, 제보·생각 나누기 같은 방법이 있다고 알려 줍니다.",
  "[최근 글] 아래 [김보미생각 최근 글]이 주어지면 김보미의 생각·입장을 물을 때 그 글을 근거로 요약하고, 글 제목을 알려 주며 김보미생각에서 전문을 보라고 안내합니다. 글에 없는 입장을 지어내지 않습니다.",
  "[동음이의어] '화성'은 경기도 화성시, '예산'은 회계 예산 또는 충남 예산군입니다.",
  "[규칙] 확인되지 않은 수치·사실은 지어내지 않고 모른다고 말합니다. 구체 예산 수치는 기억으로 말하지 말고 우리동네365에서 확인하라고 안내합니다. 투표·지지를 권유하지 않습니다. 다른 정치인을 비방하지 않습니다. 개인정보를 묻지 않습니다. 상담이 필요한 고민(건강·법률·돈 문제)은 공감한 뒤 전문 기관 상담을 권합니다. 답은 한국어로."
].join("\n");

/* 봄이용: 김보미생각 최근 공개 글(제목+앞부분)을 Redis에서 가져온다. 실패하면 빈 문자열 */
async function recentPosts() {
  var U = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL;
  var T = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN;
  if (!U || !T) return "";
  try {
    var r = await fetch(U, { method: "POST", headers: { Authorization: "Bearer " + T, "Content-Type": "application/json" }, body: JSON.stringify(["GET", "kb_posts"]), signal: AbortSignal.timeout(2500) });
    var d = await r.json(); var arr = JSON.parse(d.result || "[]"); var now = Date.now();
    return arr.filter(function (p) { return p && p.status === "published" && (p.publishAt || 0) <= now; })
      .sort(function (a, b) { return (b.publishAt || 0) - (a.publishAt || 0); }).slice(0, 6)
      .map(function (p) { var d0 = new Date(p.publishAt || 0); return "- 「" + p.title + "」(" + d0.toISOString().slice(0, 10) + ") " + String(p.body || "").replace(/\s+/g, " ").slice(0, 260); }).join("\n");
  } catch (e) { return ""; }
}

var VERIFY_SYSTEM = [
  "당신은 사실 검증 편집자입니다. 같은 질문에 대해 서로 다른 AI 두 개가 쓴 초안 A와 B를 받습니다.",
  "1) 두 초안이 일치하는 내용은 그대로 살립니다. 2) 수치·연도·법 조문·기관명이 서로 다르면 그 부분은 빼거나 '확인 필요'라고 표시합니다. 3) 한쪽에만 있고 근거가 불확실한 구체 수치는 뺍니다.",
  "결과는 '봄이' 말투(밝고 또렷한 존댓말, 🌱 첫 문장에만)로 3~7문장의 최종 답변 하나만 씁니다. 초안에 있던 사이트 안내(메뉴 이름)와 상상 질문의 즐거운 말투는 살립니다. 인사·자기소개로 시작하지 않고, 마크다운 기호(**, #)와 파일 이름(.html)은 쓰지 않습니다. 초안 A/B라는 말이나 검증 과정은 답변에 쓰지 않습니다.",
  "두 초안이 핵심에서 갈렸다면 답변 맨 끝에 한 줄로 '※ 두 AI의 답이 갈린 부분: …' 을 붙입니다. 갈린 게 없으면 그 줄을 쓰지 않습니다."
].join("\n");

var SYSTEM = [
  "당신은 '대한민국 재정 365'의 재정 AI 비서입니다.",
  "[동음이의어 — 절대 혼동 금지] 이 사이트에서 '화성'은 언제나 경기도 화성시(지방자치단체)입니다. 행성 화성(Mars)·천문학 정보를 절대 언급하지 않습니다. '예산'은 회계 예산(Budget)이 기본이며, 충남 예산군은 사용자가 '예산군'이라고 명시한 경우에만 해당합니다. '광주'는 광주광역시와 경기도 광주시를 구분해 묻고, 모든 질문을 대한민국 지방자치단체·재정 맥락으로만 해석합니다.",
  "[환각 금지] 위키백과·일반 상식의 수치(인구·예산·자립도 등)를 기억으로 답하지 않습니다. 구체 수치를 물으면 '이 사이트의 우리 동네 3초 진단에서 지방재정365 공시 실데이터로 확인하세요'라고 안내합니다.",
  "- 지방자치단체 예산·집행·계약·재정자립도 등 어려운 재정/행정 용어를 일반 국민 눈높이에서 쉽고 정확하게 설명합니다.",
  "- 추측이나 확인되지 않은 수치는 절대 지어내지 않습니다. 모르면 모른다고 말하고 '지방재정365' 같은 공식 출처 확인을 권합니다.",
  "- 정치적 중립을 지키고 특정 정당·후보 지지를 유도하지 않습니다.",
  "- 답변은 간결한 한국어로 핵심부터 말합니다."
].join("\n");

// [통합] 언론보도 자동수집 — '언론이 기록한 김보미' 최신 보도 자동 수집
// Google News RSS를 서버에서 가져와 파싱. CDN 캐시 24시간(s-maxage) → 하루 1회 자동 갱신.
const FEEDS = [
  'https://news.google.com/rss/search?q=%22%EA%B9%80%EB%B3%B4%EB%AF%B8%22%20%EB%8B%B9%EB%8C%80%ED%91%9C%20OR%20%EA%B0%95%EC%A7%84%20OR%20%EB%AF%BC%EC%A3%BC%EB%8B%B9&hl=ko&gl=KR&ceid=KR:ko'
];
const MUST = ['김보미'];                       // 제목에 반드시 포함
const HINT = ['민주당','강진','당대표','의장','전남','의원','정치','경선','전당대회']; // 동명이인 필터

function unesc(s){ return String(s||'').replace(/<!\[CDATA\[|\]\]>/g,'')
  .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'"); }

function parseItems(xml){
  const out=[]; const re=/<item>([\s\S]*?)<\/item>/g; let m;
  while((m=re.exec(xml))){
    const it=m[1];
    const g=(tag)=>{ const r=new RegExp('<'+tag+'>([\\s\\S]*?)</'+tag+'>').exec(it); return r?unesc(r[1]).trim():''; };
    let title=g('title'), link=g('link'), pub=g('pubDate'), src=g('source');
    if(!src){ const sp=title.split(' - '); if(sp.length>1){ src=sp.pop(); title=sp.join(' - '); } }
    else { const sp=title.split(' - '); if(sp.length>1 && sp[sp.length-1]===src){ sp.pop(); title=sp.join(' - '); } }
    out.push({ title:title, link:link, source:src, ts:Date.parse(pub)||0 });
  }
  return out;
}


async function handleNews(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  try{
    let items=[];
    for(const u of FEEDS){
      const r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0 (kimbomi.com news bot)'}});
      if(r.ok){ items=items.concat(parseItems(await r.text())); }
    }
    items=items.filter(function(it){ return MUST.every(function(w){return it.title.indexOf(w)>=0;}); });
    var hinted=items.filter(function(it){ return HINT.some(function(w){ return (it.title+' '+(it.source||'')).indexOf(w)>=0; }); });
    if(hinted.length>=3) items=hinted;
    const seen={}; items=items.filter(function(it){ if(seen[it.title])return false; seen[it.title]=1; return true; });
    items.sort(function(a,b){ return b.ts-a.ts; });
    items=items.slice(0,8);
    res.setHeader('Cache-Control','s-maxage=86400, stale-while-revalidate=43200');
    res.status(200).json({ ok:true, items:items, updated:Date.now() });
  }catch(e){
    res.setHeader('Cache-Control','s-maxage=3600');
    res.status(200).json({ ok:false, items:[] });
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch (e) { return {}; } }

function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    return Promise.resolve(typeof req.body === "string" ? safeJson(req.body) : req.body);
  }
  return new Promise(function (resolve) {
    var d = "";
    req.on("data", function (c) { d += c; });
    req.on("end", function () { resolve(safeJson(d)); });
    req.on("error", function () { resolve({}); });
  });
}

module.exports = async function (req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET" && req.query && req.query.action === "news") return handleNews(req, res);
  /* 관리자 — 더불이 대화 기록 조회: GET /api/chat?action=chatlog&key=ADMIN_KEY */
  if (req.method === "GET" && req.query && req.query.action === "chatlog") {
    var RURLq = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL || "";
    var RTOKq = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN || "";
    /* 2026-09-04: 관리자 키를 쿼리스트링으로만 받던 것을 헤더(x-admin-key)도 받도록 확장.
       쿼리스트링에 실린 키는 서버·프록시 접근 로그와 Referer에 그대로 남는다. 다른 API(admin·posts·scores·stories)는 이미 헤더를 받고 있었다. */
    const _akey = req.headers['x-admin-key'] || req.query.key || '';
    if (!process.env.ADMIN_KEY || _akey !== process.env.ADMIN_KEY) return res.status(403).json({ ok:false, error:"forbidden" });
    if (!RURLq) return res.status(200).json({ ok:true, items:[], note:"Redis 미설정" });
    try {
      var rr = await fetch(RURLq, { method:"POST", headers:{ Authorization:"Bearer "+RTOKq, "Content-Type":"application/json" }, body: JSON.stringify(["LRANGE","kb_chatlog","0","199"]) });
      var dd = await rr.json();
      var items = (dd.result||[]).map(function(x){ try{ return JSON.parse(x); }catch(e){ return null; } }).filter(Boolean);
      return res.status(200).json({ ok:true, items:items });
    } catch(e){ return res.status(200).json({ ok:false, items:[] }); }
  }
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  var KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  var GROQ = process.env.GROQ_API_KEY || "";           /* 예비 AI (Gemini 한도·장애 시) — 무료 구간, OpenAI 호환 */
  var RURL2 = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL || "";
  var RTOK2 = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN || "";
  if (!KEY && !GROQ) return res.status(500).json({ ok: false, error: "GEMINI_API_KEY/GROQ_API_KEY 미설정(Vercel 환경변수)" });

  /* ── 남용 방지: 출처(Origin) 확인 + IP 레이트리밋 ── */
  var origin = String(req.headers.origin || "");
  if (origin && !/^https:\/\/(www\.)?xn--4k0b53xuva\.com$|\.vercel\.app$|^https?:\/\/localhost(:\d+)?$/.test(origin.replace(/\/$/, ""))) {
    return res.status(403).json({ ok: false, error: "forbidden origin" });
  }
  var clientIp = ((req.headers["x-forwarded-for"] || "").split(",")[0] || "").trim() || req.headers["x-real-ip"] || "anon";
  async function redisCmd(cmd) {
    if (!RURL2) return null;
    try {
      var rr = await fetch(RURL2, { method: "POST", headers: { Authorization: "Bearer " + RTOK2, "Content-Type": "application/json" }, body: JSON.stringify(cmd), signal: AbortSignal.timeout(4000) });
      return await rr.json();
    } catch (e) { return null; }
  }
  if (RURL2) {
    var rlm = await redisCmd(["INCR", "rl:chat:" + clientIp]);
    var nMin = rlm && parseInt(rlm.result, 10) || 0;
    if (nMin === 1) await redisCmd(["EXPIRE", "rl:chat:" + clientIp, "60"]);
    var rld = await redisCmd(["INCR", "rl:chatd:" + clientIp]);
    var nDay = rld && parseInt(rld.result, 10) || 0;
    if (nDay === 1) await redisCmd(["EXPIRE", "rl:chatd:" + clientIp, "86400"]);
    if (nMin > 8 || nDay > 120) {
      return res.status(429).json({ ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." });
    }
  }

  var body = await readBody(req);
  var message = String((body && body.message) || "").slice(0, 2000);
  var context = String((body && body.context) || "").slice(0, 4000);
  if (!message) return res.status(400).json({ ok: false, error: "message 필요" });

  var isCampaign = body && body.mode === "campaign";
  var isBomi = body && body.mode === "bomi";
  var sys = isCampaign ? CAMPAIGN_SYSTEM : (isBomi ? BOMI_SYSTEM : SYSTEM);
  var contents = [];
  if ((isCampaign || isBomi) && Array.isArray(body.history)) {
    body.history.slice(-8).forEach(function (h) {
      if (h && h.text) contents.push({ role: h.role === "model" ? "model" : "user", parts: [{ text: String(h.text).slice(0, 1500) }] });
    });
  }
  var kb="";
  if(isCampaign&&RURL2){try{var kr=await fetch(RURL2,{method:"POST",headers:{Authorization:"Bearer "+RTOK2,"Content-Type":"application/json"},body:JSON.stringify(["LRANGE","kb_knowledge","0","9"])});var kd=await kr.json();var kitems=(kd.result||[]).map(function(x){try{return JSON.parse(x).content||"";}catch(e){return "";}}).filter(Boolean);kb=kitems.join("  ").slice(0,16000);}catch(e){}}
  if(isBomi){ var rp=await recentPosts(); if(rp) kb=rp; }
  var prompt = sys + (kb?(isBomi?("\n\n[김보미생각 최근 글]\n"+kb):("  [더불이 지식자료 — 아래 내용을 최우선 근거로 사용하세요] "+kb)):"") + "\n\n[참고 데이터]\n" + (context || "(없음)") + "\n\n[질문]\n" + message;
  contents.push({ role: "user", parts: [{ text: prompt }] });

  /* ── AI 호출: Gemini(모델 순서대로) → 전부 실패하면 Groq → 그래도 안 되면 오류 ── */
  var GROQ_MODELS = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"];
  async function askGemini() {
    var lastErr = "Gemini 오류";
    if (!KEY) throw new Error("no gemini key");
    for (var i = 0; i < MODELS.length; i++) {
      var model = MODELS[i];
      try {
        var url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + KEY;
        var r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: contents, generationConfig: { temperature: 0.4, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } } }),
          signal: AbortSignal.timeout(25000)
        });
        var j = await r.json();
        if (!r.ok) { lastErr = (j.error && j.error.message) || ("Gemini " + r.status); continue; }
        var parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
        var t = parts.map(function (p) { return p.text || ""; }).join("");
        if (t) return { model: model, text: t };
        lastErr = "Gemini 빈 응답";
      } catch (e) { lastErr = String((e && e.message) || e); }
    }
    throw new Error(lastErr);
  }
  async function askGroq() {
    if (!GROQ) throw new Error("no groq key");
    /* Gemini 형식(contents) → OpenAI 형식(messages). 마지막 user 턴에 system+참고데이터+질문이 들어 있다 */
    var messages = contents.map(function (c) { return { role: c.role === "model" ? "assistant" : "user", content: c.parts.map(function (p) { return p.text; }).join("") }; });
    var lastErr = "Groq 오류";
    for (var k = 0; k < GROQ_MODELS.length; k++) {
      try {
        var r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + GROQ, "User-Agent": "Mozilla/5.0 kimbomi-site" },
          body: JSON.stringify({ model: GROQ_MODELS[k], messages: messages, temperature: 0.4, max_tokens: 1024 }),
          signal: AbortSignal.timeout(25000)
        });
        var j = await r.json();
        if (!r.ok) { lastErr = (j.error && j.error.message) || ("Groq " + r.status); continue; }
        var t = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
        if (t) return { model: GROQ_MODELS[k], text: t };
      } catch (e) { lastErr = String((e && e.message) || e); }
    }
    throw new Error(lastErr);
  }
  var out, errs = [], cross = false;
  if (isBomi && KEY && GROQ) {
    /* 봄이: Gemini·Groq 를 동시에 묻고, 두 초안을 대조해 최종 답을 만든다(교차 검증) */
    var both = await Promise.allSettled([askGemini(), askGroq()]);
    var A = both[0].status === "fulfilled" ? both[0].value : null;
    var Bv = both[1].status === "fulfilled" ? both[1].value : null;
    if (!A) errs.push("gemini: " + (both[0].reason && both[0].reason.message));
    if (!Bv) errs.push("groq: " + (both[1].reason && both[1].reason.message));
    if (A && Bv) {
      try {
        var vmsg = [{ role: "system", content: VERIFY_SYSTEM }, { role: "user", content: "[질문]\n" + message + "\n\n[초안 A]\n" + A.text.slice(0, 3000) + "\n\n[초안 B]\n" + Bv.text.slice(0, 3000) }];
        var vr = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + GROQ, "User-Agent": "Mozilla/5.0 kimbomi-site" },
          body: JSON.stringify({ model: "openai/gpt-oss-120b", messages: vmsg, temperature: 0.2, max_tokens: 1024 }), signal: AbortSignal.timeout(20000) });
        var vj = await vr.json();
        var vt = vr.ok && vj.choices && vj.choices[0] && vj.choices[0].message && vj.choices[0].message.content;
        if (vt) { out = { model: A.model + " + " + Bv.model + " → 교차검증", text: vt }; cross = true; }
      } catch (e) { errs.push("verify: " + e.message); }
      if (!out) out = A;
    } else out = A || Bv;
  } else {
    try { out = await askGemini(); } catch (e) { errs.push("gemini: " + e.message); }
    if (!out) { try { out = await askGroq(); } catch (e) { errs.push("groq: " + e.message); } }
  }
  if (!out) return res.status(502).json({ ok: false, error: "AI 응답 실패 — " + errs.join(" / ") });
  {
    {
      var model = out.model, text = out.text;
      /* 캠프 확인용 — 더불이 대화 기록(Redis) + 메일 알림(Resend 키 있을 때) */
      if (isCampaign) {
        var entry = JSON.stringify({ q: message.slice(0,600), a: text.slice(0,800), ts: Date.now() });
        try {
          if (RURL2) {
            await fetch(RURL2, { method:"POST", headers:{ Authorization:"Bearer "+RTOK2, "Content-Type":"application/json" }, body: JSON.stringify(["LPUSH","kb_chatlog",entry]) });
            await fetch(RURL2, { method:"POST", headers:{ Authorization:"Bearer "+RTOK2, "Content-Type":"application/json" }, body: JSON.stringify(["LTRIM","kb_chatlog","0","999"]) });
          }
        } catch(e) {}
        try {
          var RESEND = process.env.RESEND_API_KEY || "";
          /* 메일 알림 디바운스 — 같은 IP는 10분에 1통만 (대화 전체 기록은 kb_chatlog에 항상 저장됨) */
          if (RESEND && RURL2) {
            var mailGate = await redisCmd(["SET", "rl:chatmail:" + clientIp, "1", "NX", "EX", "600"]);
            if (!mailGate || mailGate.result !== "OK") RESEND = "";
          }
          if (RESEND) {
            await fetch("https://api.resend.com/emails", {
              method:"POST",
              headers:{ Authorization:"Bearer "+RESEND, "Content-Type":"application/json" },
              body: JSON.stringify({
                from: process.env.MAIL_FROM || "onboarding@resend.dev",
                to: [process.env.MAIL_TO || "kimbomi891204@gmail.com"],
                subject: "💬 더불이 대화 — " + message.slice(0,40),
                html: "<b>질문</b><p>"+message.replace(/</g,"&lt;")+"</p><b>더불이 답변</b><p>"+text.replace(/</g,"&lt;")+"</p><p style=\"color:#888\">김보미.com 더불이 챗봇 자동 전달</p>"
              }),
              signal: AbortSignal.timeout(6000)
            });
          }
        } catch(e) {}
      }
      return res.status(200).json({ ok: true, model: model, text: text, cross: cross });
    }
  }
};
