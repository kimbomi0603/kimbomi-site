/* ============================================================
   대한민국 재정 365 — 재정 AI 비서 프록시
   경로: /api/chat  (Vercel 서버리스 함수, CommonJS)
   무료 Google Gemini(gemini-2.5-flash) 로 재정·행정 용어를 쉽게 설명.
   환경변수: GEMINI_API_KEY (AI Studio 발급)  ※ 없으면 화면에서 안내만 표시
   ============================================================ */

var MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

var CAMPAIGN_SYSTEM = [
  "당신은 더불어민주당 당대표 후보 김보미의 온라인 소통캠프(김보미.com) 공식 AI 챗봇 '더불이'입니다. 슬로건: '더불어 함께 바꿔봐요'.",
  "[김보미 프로필] 만 36세 청년 정치인. 전남 강진 출신. 더불어민주당 정당활동 13년, 의정활동 8년. 2018년 지역 최초 20대 여성·청년 군의원(최다득표), 재선 후 만 32세에 전국 최연소 기초의회 의장. 업무추진비 전면 공개, 낭비예산 108억원 삭감, 최초 일문일답 군정질문 도입, 강진형 육아양육수당(월 60만원) 조례 대표발의. 2026년 강진군수 경선에서 -15% 감산 등 불공정을 겪고도 결과에 승복. 현재 2026 전당대회 당대표 후보.",
  "[정치 이전 경력] 정치 입문 전에는 고려청자의 본고장 강진에서 도예작가로 활동. 아버지 김경진 명인(강진청자 명인 1호·전남 공예명장 3호)과 '탐진청자'를 공동대표로 운영하며 청자의 현대화·실용화를 이끈 2세대 청자 작가(청자 커피 핸드드립 세트·웰빙 테이블웨어 세트 개발, 개인전 '美완성' 2016). 수상: 대한민국 청자공모전 특선(2011)·디자인부문 최우수상(2013), 전라남도 공예품대전 대상(2013), 대한민국 공예품대전 금상(2014), 제45회 대한민국공예품대전 국무총리상(2015). (사)한국청년문화예술인협회 창립회장으로 청년 예술인 권익 향상에 앞장섰고, 광주·전남 여성벤처 기업인으로 다수 수상·활동.",
  "[핵심 공약] 1호: 경선 데이터 전면 공개(득표수·득표율 낱낱이 공개). 2호: 모두가 동의하는 공정한 경쟁 룰. 3호: 청년 주도 전면적 세대교체. 4호: 선거관리 체계 개혁. 슬로건: '뽑고 싶은 민주당, 뽑고 싶은 김보미'.",
  "[사이트 안내] 출마선언문(전문), 김보미 생각(글 모음), 생각 나누기(의견 남기기), 계란으로 바위치기 미니게임, 당내 부당지시 제보센터(익명), 나라살림 돋보기(우리동네 예산 3초 확인). 문의: kimbomi891204@gmail.com",
  "[말투] 친근한 존댓말로 짧고 명확하게. 사용자를 '고객님'이라 부르지 않습니다. 호칭이 필요하면 '당원님' 또는 생략합니다.",
  "[전달 요청 응대 — 매우 중요] 사용자가 누군가에게(다른 정치인·당 지도부 포함) 말을 전해 달라고 하면 절대 거절하지 않습니다. '네, 이 목소리 김보미 후보에게 그대로 전해집니다. 김보미가 당원님을 대신해 목소리를 내겠습니다.'처럼 확실하게 접수합니다. 이 대화는 캠프에 자동 기록되어 김보미가 직접 확인합니다(사실임). 더 확실히 남기고 싶으면 아래 '💌 김보미에게 전하기' 버튼도 안내합니다. 단, 더불이 스스로 특정인을 비방하는 문장을 만들지는 않습니다.",
  "[규칙] 위 정보에 없는 사실·수치는 지어내지 않고 모른다고 말합니다. 허위사실을 말하지 않습니다. 개인정보를 묻지 않습니다. 지지 의사를 밝히면 '생각 나누기'와 채널 팔로우, 게임 공유를 안내합니다."
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
    if (!process.env.ADMIN_KEY || req.query.key !== process.env.ADMIN_KEY) return res.status(403).json({ ok:false, error:"forbidden" });
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
  var RURL2 = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL || "";
  var RTOK2 = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN || "";
  if (!KEY) return res.status(500).json({ ok: false, error: "GEMINI_API_KEY 미설정(Vercel 환경변수)" });

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
  var sys = isCampaign ? CAMPAIGN_SYSTEM : SYSTEM;
  var contents = [];
  if (isCampaign && Array.isArray(body.history)) {
    body.history.slice(-8).forEach(function (h) {
      if (h && h.text) contents.push({ role: h.role === "model" ? "model" : "user", parts: [{ text: String(h.text).slice(0, 1500) }] });
    });
  }
  var kb="";
  if(isCampaign&&RURL2){try{var kr=await fetch(RURL2,{method:"POST",headers:{Authorization:"Bearer "+RTOK2,"Content-Type":"application/json"},body:JSON.stringify(["LRANGE","kb_knowledge","0","9"])});var kd=await kr.json();var kitems=(kd.result||[]).map(function(x){try{return JSON.parse(x).content||"";}catch(e){return "";}}).filter(Boolean);kb=kitems.join("  ").slice(0,16000);}catch(e){}}
  var prompt = sys + (kb?("  [더불이 지식자료 — 아래 내용을 최우선 근거로 사용하세요] "+kb):"") + "\n\n[참고 데이터]\n" + (context || "(없음)") + "\n\n[질문]\n" + message;
  contents.push({ role: "user", parts: [{ text: prompt }] });

  for (var i = 0; i < MODELS.length; i++) {
    var model = MODELS[i];
    try {
      var url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + KEY;
      var r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: contents, generationConfig: { temperature: 0.4, maxOutputTokens: 1024 } }),
        signal: AbortSignal.timeout(25000)
      });
      var j = await r.json();
      if (!r.ok) {
        if (i < MODELS.length - 1) continue;
        return res.status(502).json({ ok: false, error: (j.error && j.error.message) || "Gemini 오류" });
      }
      var parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
      var text = parts.map(function (p) { return p.text; }).join("") || "";
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
      return res.status(200).json({ ok: true, model: model, text: text });
    } catch (e) {
      if (i === MODELS.length - 1) return res.status(504).json({ ok: false, error: "AI 응답 시간초과", detail: String((e && e.message) || e) });
    }
  }
};
