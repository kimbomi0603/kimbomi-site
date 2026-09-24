// api/posts.js — 비전·공약 글(예약 발행) API. Upstash Redis 재사용.
// 데이터: 단일 키 kb_posts = JSON 배열. post={id,title,body,publishAt(ms),status('published'|'hidden'),createdAt,updatedAt}
// 공개 노출 조건: status==='published' && publishAt <= now
// actions:
//   GET  ?action=list                         → 공개 글 목록(발행 시각 내림차순)
//   GET  ?action=get&id=                       → 공개 글 1개
//   GET  ?action=all&key=ADMIN_KEY            → (관리자) 전체(상태 라벨 포함), 없으면 기본글 시드
//   POST ?action=save&key=ADMIN_KEY  body:{id?,title,body,publishAt?,status?}
//   POST ?action=remove&key=ADMIN_KEY body:{id}
const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL;
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN;
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const KEY = 'kb_posts';
const IMGKEY = 'kb_img:';   // 글에 첨부한 사진 (kb_img:<id>)

var T1 = Date.parse('2026-07-01T10:00:00+09:00');
var T2 = Date.parse('2026-07-01T09:00:00+09:00');
const DEFAULT_POSTS = [
  { id:'msg1', status:'published', publishAt:T1, createdAt:T1, updatedAt:T1,
    title:'뽑고 싶은 민주당을 만들겠습니다',
    body:[
      "'1인 1표제'를 둘러싼 논쟁이 뜨겁습니다. 지역별·연령별 가중치 부여로 보완이 필요하다는 주장과, 1인 1표제 원칙을 흔들어선 안 된다는 주장이 거세게 부딪히고 있습니다. 청년 세대의 의견을 반영할 제도적 보완, 험지의 목소리를 균형 있게 담을 가중치 설계 — 분명 치열하게 논의해야 할 중요한 과제입니다.",
      "하지만 저는 이 룰을 둘러싼 대립을 지켜보며, 우리가 가장 본질적인 질문을 놓치고 있는 건 아닌지 생각하게 되었습니다. 진정한 정당 민주주의, 진정한 '전 당원 1인 1표제'는 어떻게 완성될까요? 가중치를 부여하고 대의원제를 부활한다고 완성될까요? 아닙니다. 진정한 정당 민주주의는 당원들에게 '뽑고 싶은 후보'가 눈앞에 있을 때 비로소 완성됩니다.",
      "국민의 팍팍한 삶을 어떻게 해결할 것인지, 벼랑 끝에 몰린 대한민국을 어떻게 진단하고 어떤 해법을 내놓을 것인지, 우리 민주당이 지켜야 할 핵심 가치와 시대정신은 무엇인지, 그리고 그것을 현실로 만들 나의 '진짜 실력'은 어떠한지 — 이 모든 것을 당원과 국민 앞에 소상히 밝히고 경쟁하여, 진정으로 '뽑고 싶은 후보'가 존재해야만 1인 1표제도 그 빛을 발할 수 있습니다.",
      "그런데 지금 우리 민주당이 그런 정당입니까? 비전과 가치에 대한 치열한 토론은 실종되고, 오직 상대방의 이름만 호명하며 비난하는 낡은 정치를 하고 있습니다. '차악'을 선택하는 정치, 누군가를 심판하려 방어적으로 투표하게 하는 정치, 끝없는 계파 싸움에 지쳐 아예 투표를 포기하게 만드는 정치. 아무리 완벽한 제도를 만든들, 누구에게도 표를 주고 싶지 않다면 그 어떤 민주주의도 꽃필 수 없습니다.",
      "저 김보미가 우리 더불어민주당을 '뽑고 싶은 정당'으로 만들겠습니다. 누굴 미워하며 표를 포기하는 정치가 아닌, 내일의 희망을 기대하며 표를 던지는 가슴 벅찬 정당으로 다시 세우겠습니다. 각자의 뚜렷한 철학과 비전으로 무장한 인재들이 진짜 실력으로 경쟁하여, 당원과 국민이 \"이 후보도 저 후보도 훌륭해 누구를 뽑을지 모르겠다\"며 기분 좋은 고민을 하는 정당으로 혁신하겠습니다. 뽑고 싶은 민주당, 뽑고 싶은 김보미가 되겠습니다. 감사합니다.",
      "[ 뽑고 싶은 민주당, 뽑고 싶은 김보미 ]"
    ].join("\n\n") },
  { id:'msg2', status:'published', publishAt:T2, createdAt:T2, updatedAt:T2,
    title:"승자도 패자도 함께 빛나는 '싱어게인' 같은 민주당을 만들겠습니다",
    body:[
      "오디션 프로그램 '싱어게인'에서 가장 감동적인 순간은 우승자가 가려질 때가 아닙니다. 경쟁에서 떨어진 무명 가수들이 비로소 자신의 진짜 이름을 당당히 밝히고 환하게 웃으며 무대를 내려올 때입니다. 이긴 사람은 감사와 미안함에 눈물 흘리고, 진 사람은 후련하게 웃으며 승자를 격려합니다. 패배한 사람조차 박수받으며 다음을 기약할 수 있습니다.",
      "왜 그럴까요? 모두가 동의하는 공정한 룰 위에서, 모두가 지켜보는 가운데 투명하고 치열하게 경쟁했기 때문입니다. 명확한 피드백을 통해 무엇이 부족했고 어떻게 성장해야 할지 정확히 알 수 있었기 때문입니다. 우리 민주당도 이래야 하지 않겠습니까?",
      "그런데 지금 우리 더불어민주당은 철저한 '블랙박스'입니다. 당사자에게조차 자신이 얻은 득표수와 득표율을 제대로 알려주지 않습니다. 당원들의 표심이 담긴 소중한 데이터를 왜 밀실에 가두어두는 것입니까? 경선에서 떨어진 사람은 자신이 왜 떨어졌는지, 어느 지역과 세대의 마음을 얻지 못했는지 알아야 반성하고 발전할 수 있습니다. 피드백이 없으면 성장은 멈춥니다.",
      "저 김보미가 이 낡은 블랙박스를 완전히 부수겠습니다. 밀실 공천, 깜깜이 경선을 끝내고 모두가 동의하는 공정한 룰로, 모두가 보는 공개적인 곳에서 투명하고 치열하게 경쟁하는 시스템을 만들겠습니다. 경선이 끝나면 본인이 받은 표가 몇 표인지, 어느 세대와 지역에서 얼마나 지지받았는지 모든 데이터를 상세하게 공개하겠습니다.",
      "약속드립니다. 저 김보미가 당대표가 된다면, 지난 지방선거의 모든 경선 데이터를 상세하고 투명하게 전면 공개하겠습니다. 아울러 당대표 선거에 나서는 다른 후보님들께도 제안합니다. 우리 민주당이 정말 공정하고 투명한 정당이라 자신하신다면, 저의 이 '경선 데이터 전면 공개' 공약을 이번 전당대회 우리 모두의 공통 공약으로 삼읍시다.",
      "밀실에 갇힌 민주당을 광장으로 끌어내겠습니다. 투명한 데이터와 공정한 룰 위에서, 승자와 패자 모두가 웃으며 함께 성장하는 진짜 민주당. 훌륭한 후보가 너무 많아 누구를 뽑을지 기분 좋게 고민하게 만드는 '뽑고 싶은 민주당'을 만들겠습니다. 감사합니다.",
      "[ 뽑고 싶은 민주당, 뽑고 싶은 김보미 ]"
    ].join("\n\n") }
];

// ===== 코드에 박아 두는 글(관리자 키 없이 배포로 추가) — 저장소에 같은 id 가 없으면 첫 조회 때 합쳐 저장 =====
var T3 = Date.parse('2026-09-24T09:30:00+09:00');
const STATIC_POSTS = [
  { id:'fb20260924', status:'published', publishAt:T3, createdAt:T3, updatedAt:T3,
    title:'연휴 잘 보내고 계신가요? 「우리동네365」와 김보미의 근황을 전합니다',
    body:"국민 여러분, 당원 동지 여러분, 잘 지내시죠? 요즘 뭐 하고 지내는지 연락 주시는 분들이 많아 한 분 한 분 답을 드려야 하는데, 해야만 하는 것들이 너무 많아 바쁘다는 핑계로 늦었지만, 명절을 빌려 근황을 전합니다. 잊지 않고 응원해 주시는 분들께 정말, 정말 감사드립니다. 덕분에 잘 버티고 있습니다.🫡\n\n요즘 김보미는, 재정주권시민행동 공동대표로 뛰고 있습니다. \"내 돈은 내 권리다.\" 이 한 문장으로 모인 비영리 시민단체입니다. 세금은 정부의 것도, 단체장의 것도 아닙니다. 누가 얼마를 어디에 쓰는지 국민이 직접 볼 수 있어야 합니다. 중앙정부 62개 부처의 올해 확정예산 세부사업을 하나하나 뜯어 taxwatch.kr에 누구나 볼 수 있게 공개했고, 예산 읽는 법을 같이 배우는 스터디와 토론회를 열며, 주민이 자기 동네 살림을 들여다보는 우리 동네 감시단도 만들어 가는 중입니다.\n\n또, 시골쥐가 서울로 상경해 연구위원으로 출퇴근하고 있습니다. 시골의 1km와 서울의 1km가 다른 만큼 너무나 다른 환경을 보고 배우며 분투하고 있습니다. 지자체 재정을 분석하고, 지방정부의 정책과 재정전략을 짜고, 지방의원의 의정 역량을 키우는 교육까지, 하나하나 배우고 있습니다. 군의회에서 8년 동안 예산서를 붙들고 씨름했지만, 전국 단위로 숫자와 정책을 다루는 건 또 다른 세계입니다. 밤샘 작업을 하면서 뉴스를 볼 때마다, 전당대회 이후 떨어지는 지지율을 볼 때마다, 불쑥불쑥 화도 나지만, 지금 제가 할 수 있는 자리에서 바꾸어 나가는 것이 최선이라고 생각하고 그야말로 열공하고 있습니다.\n\n군의회 8년 동안 일문일답 군정질문을 처음 도입해 집행부에 따져 묻고, 낭비성 예산을 삭감하고, 업무추진비를 전면 공개하고, 본회의와 행정사무감사를 생중계했습니다. 그런데 예산서와 결산서를 붙들고 씨름할수록 절실하게 느낀 게 있었습니다. 그 두꺼운 예산서, 보기도 어려운 계약 내역을 누가 시간을 내서 들여다보겠습니까? 확인하려면 아는 공무원을 찾아가야 하는데, 시골은 한 집 건너 아는 사이라 눈치 보여 정보공개청구도 사실상 어렵습니다. 자료 요구를 해도 개인정보를 이유로 제대로 받지도 못합니다.\n\n결국 의원도 제대로 파악하지 못하고, 군민은 우리 혈세가 어디로 가는지 모른 채 지나갑니다. 의원이 아니어도 군민 한 사람 한 사람이 군정을 훤히 들여다보고 있어야 우리 동네가 바뀌지 않겠습니까? CCTV처럼 지켜보는 사람이 생기면 돈의 방향이 바뀝니다. 낙선하고도 공약을 지키려고 강진의 예산,집행,계약 현황을 누구나 볼 수 있는 「김보미365」를 만든 이유이고, 지금의 재정주권시민행동 활동으로 이어졌습니다.\n\n그 확신으로 당대표 예비경선 홈페이지로 사용했던 김보미.com을 뜯어고쳤습니다. 「우리동네365」에 들어가면 전국 지방정부 243곳과 중앙정부 62개 부처의 예산이 한 화면에 있습니다. 올해 세부사업, 계약대장 전수, 단체장 공약이 예산에 실제로 반영됐는지까지 확인됩니다. 내 동네를 한 번 저장해 두면 다음부터 우리 동네 집행률이 가장 먼저 뜹니다.\n\n정부가 발표한 정책도 한눈에 확인할 수 있습니다. 3대 메가프로젝트나 국민성장펀드 150조 원 같은 정책 하나를 열면, 이 정책이 우리 동네 예산에 어떻게 잡혔는지가 바로 나옵니다. 지자체 재정 원자료를 검색해 원문으로 열 수 있고, 수의계약 비중이나 특정 업체 반복 수주, 분할 발주 의심 같은 계약 이상 징후도 규칙으로 걸러 보여 줍니다.\n\n이리저리 뛰면서 동지들도 생겼습니다. 능력자 후배님들부터 든든한 686 짱돌 선배님들까지, 정치개혁으로 세대교체를 진짜로 해 보자는 3060 혁신가분들이 모였습니다. 지난 13일 국회에서 첫 워크숍을 하며 위성정당이 어떻게 선거제도를 망가뜨렸는지 배웠고, 밤늦게까지 토론하고 열공하며 계란으로 바위 치기(?)를 함께 준비하고 있습니다. 계란들의 도전, 기대해 주세요!\n\n또! 바람이지만...선거와 의정 활동에 밀려 미뤄 둔 숙제도 하려고 합니다. '경단녀'가 되어 버린 논문을 다시 써서 석사를 마치고, 새로운 공부도 시작해 보고 싶습니다.\n\n추석 연휴 끝내주는 가을 하늘 아래, 보고 싶었던 분들과 마주 앉은 명절 밥상에서 \"우리 동네 세금은 잘 쓰이고 있나\" 한 번쯤 이야기 나눠 주세요. 그 질문이 재정주권의 시작이고, 가장 확실한 정치 참여입니다.\n\n김보미가 여러분의 목소리를 들고 가서 기어이 반영시켰다는 기쁜 소식을 전할 수 있도록, 꺾이지 않는 마음으로 깡깡하게 킵고잉하겠습니다. 다시 힘내서 인사드리겠습니다.\n👉 www.김보미.com" }
];

async function redis(cmd){
  const r = await fetch(RURL, { method:'POST', headers:{ Authorization:'Bearer '+RTOK, 'Content-Type':'application/json' }, body: JSON.stringify(cmd) });
  return r.json();
}
function readBody(req){
  return new Promise(function(resolve){
    if (req.body !== undefined && req.body !== null) { resolve(req.body); return; }
    var d=''; req.on('data',function(c){d+=c;}); req.on('end',function(){resolve(d);}); req.on('error',function(){resolve('');});
  });
}
function clean(s, max){
  s = String(s == null ? '' : s);
  var out=''; for (var i=0;i<s.length;i++){ var c=s.charCodeAt(i); if (c===9||c===10||c>=32) out+=s[i]; }
  out = out.replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  if (out.length > max) out = out.slice(0, max);
  return out;
}
async function loadRaw(){
  var r = await redis(['GET', KEY]);
  var v = r && r.result;
  var a = null;
  if (v) { try { var t = JSON.parse(v); a = Array.isArray(t) ? t : null; } catch(e){ a = null; } }
  if (!a) return null;
  // 코드에 박아 둔 글 병합(없는 id 만) → 저장
  var added = false;
  STATIC_POSTS.forEach(function(sp){ if (!a.some(function(x){ return x.id === sp.id; })) { a.push(sp); added = true; } });
  if (added) { try { await save(a); } catch(e){} }
  return a;
}
async function save(arr){ await redis(['SET', KEY, JSON.stringify(arr)]); }
function pubList(arr){
  var now = Date.now();
  return arr.filter(function(p){ return p.status==='published' && (p.publishAt||0) <= now; })
            .sort(function(a,b){ return (b.publishAt||0)-(a.publishAt||0); });
}

// ===== 링크 미리보기(OG) 조회 =====  GET ?action=og&url=<기사 URL>
//   · 허용된 언론사 도메인만 (SSRF 방지) · https 만 · 6초 타임아웃 · 300KB 까지만 읽음 · 7일 캐시
const OGKEY = 'kb_og3:';
const OG_TTL = 60 * 60 * 24 * 7;
const OG_MAXB = 300 * 1024;
const OG_ALLOW = [
  'naver.com', 'daum.net', 'ohmynews.com', 'pressian.com', 'khan.co.kr', 'hani.co.kr',
  'chosun.com', 'joongang.co.kr', 'donga.com', 'munhwa.com', 'seoul.co.kr', 'segye.com',
  'kmib.co.kr', 'hankookilbo.com', 'hankyung.com', 'mk.co.kr', 'edaily.co.kr', 'mt.co.kr',
  'newsis.com', 'news1.kr', 'yna.co.kr', 'ytn.co.kr', 'imbc.com', 'kbs.co.kr', 'sbs.co.kr',
  'jtbc.co.kr', 'newspim.com', 'fnnews.com', 'sedaily.com', 'asiae.co.kr', 'newstomato.com',
  'mediatoday.co.kr', 'polinews.co.kr', 'sisajournal.com', 'kukinews.com', 'tf.co.kr',
  'wikitree.co.kr', 'ilyoseoul.co.kr', 'shinmoongo.net', 'jgynews.com', 'theleader.co.kr',
  'christiandaily.co.kr', 'jeollailbo.com', 'joseilbo.com', 'lawissue.co.kr', 'imaeil.com',
  'joongang.com', 'm-joongang.com', 'sisain.co.kr', 'srtimes.kr', 'breaknews.com'
];
function ogAllowed(host){
  host = String(host || '').toLowerCase().replace(/^www\./, '');
  return OG_ALLOW.some(function(d){ return host === d || host.endsWith('.' + d); });
}
function ogPick(html, props){
  for (var i = 0; i < props.length; i++){
    var re = new RegExp('<meta[^>]+(?:property|name)=["\']' + props[i] + '["\'][^>]*>', 'i');
    var tag = (html.match(re) || [])[0];
    if (!tag) continue;
    var c = tag.match(/content=["']([^"']*)["']/i);
    if (c && c[1]) return c[1].trim();
  }
  return '';
}
function ogDecode(s){
  return String(s || '')
    .replace(/&#x([0-9a-fA-F]+);/g, function(m, h){ try { return String.fromCodePoint(parseInt(h, 16)); } catch(e){ return m; } })
    .replace(/&#(\d+);/g, function(m, d){ try { return String.fromCodePoint(parseInt(d, 10)); } catch(e){ return m; } })
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}
async function ogFetch(u){
  var ctl = new AbortController();
  var timer = setTimeout(function(){ ctl.abort(); }, 6000);
  try {
    var r = await fetch(u.href, {
      redirect: 'follow', signal: ctl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9'
      }
    });
    clearTimeout(timer);
    try { if (r.url && !ogAllowed(new URL(r.url).hostname)) throw new Error('redirected off allowlist'); } catch(e){ throw e; }
    var ct = (r.headers.get('content-type') || '');
    if (!r.ok || ct.indexOf('text/html') < 0) throw new Error('http ' + r.status);
    var reader = r.body.getReader(), dec = new TextDecoder('utf-8'), html = '', got = 0;
    while (got < OG_MAXB) {
      var chunk = await reader.read();
      if (chunk.done) break;
      got += chunk.value.length;
      html += dec.decode(chunk.value, { stream: true });
      if (html.indexOf('</head>') >= 0) break;
    }
    try { reader.cancel(); } catch(e){}
    var img = ogDecode(ogPick(html, ['og:image', 'twitter:image', 'twitter:image:src']));
    if (img && img.indexOf('//') === 0) img = 'https:' + img;
    if (img && img.indexOf('http') !== 0) { try { img = new URL(img, u.href).href; } catch(e){ img = ''; } }
    if (img && img.indexOf('https://') !== 0) img = '';   // http 이미지는 혼합콘텐츠라 제외
    var ttl = ogDecode(ogPick(html, ['og:title', 'twitter:title']));
    if (!ttl) { var m = html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i); if (m) ttl = ogDecode(m[1]); }
    // 출처 표기: 네이버 뉴스는 원 언론사명(og:article:author)을 우선 사용
    var host = u.hostname.replace(/^www\./, '');
    var author = ogDecode(ogPick(html, ['og:article:author'])).split('|')[0].trim();
    var site = ogDecode(ogPick(html, ['og:site_name']));
    if (/(^|\.)naver\.com$/.test(host)) site = author || '네이버 뉴스';
    else if (/(^|\.)daum\.net$/.test(host)) site = author || site || '다음 뉴스';
    if (!site || /^[a-z0-9.\-]+$/i.test(site) === true && site.indexOf('.') >= 0) site = author || site || host;
    return {
      ok: true,
      image: img,
      title: ttl,
      desc: ogDecode(ogPick(html, ['og:description', 'twitter:description', 'description'])).slice(0, 200),
      site: site || host
    };
  } catch(e) {
    clearTimeout(timer);
    return { ok: false, error: 'fetch failed', site: u.hostname.replace(/^www\./, '') };
  }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control','no-store');
  if (!RURL || !RTOK) { res.status(200).json({ ok:false, configured:false }); return; }
  var action = req.query.action || 'list';
  try {
    if (action === 'og') {
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
      var ou; try { ou = new URL(String(req.query.url || '')); } catch(e){ res.status(200).json({ ok:false, error:'bad url' }); return; }
      if (ou.protocol !== 'https:') { res.status(200).json({ ok:false, error:'https only' }); return; }
      if (!ogAllowed(ou.hostname)) { res.status(200).json({ ok:false, error:'domain not allowed' }); return; }
      var ock = OGKEY + ou.href;
      var ohit = await redis(['GET', ock]);
      if (ohit && ohit.result) { try { res.status(200).json(JSON.parse(ohit.result)); return; } catch(e){} }
      var oout = await ogFetch(ou);
      await redis(['SET', ock, JSON.stringify(oout), 'EX', String(oout.ok ? OG_TTL : 3600)]);
      res.status(200).json(oout);
      return;
    }
    if (action === 'rss') {
      // 김보미생각 RSS — 공개 글 최신 50건
      var arrR = await loadRaw(); if (!arrR) arrR = DEFAULT_POSTS;
      var itemsR = pubList(arrR).slice(0, 50);
      var xe = function(t){ return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
      var strip = function(b){ return String(b||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0, 300); };
      var base = 'https://www.xn--4k0b53xuva.com';
      var xml = '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>'
        + '<title>김보미생각 — 김보미.com</title><link>' + base + '/vision.html</link>'
        + '<atom:link href="' + base + '/feed.xml" rel="self" type="application/rss+xml"/>'
        + '<description>기득권의 밀실을 열고 공정한 경쟁을 제도로 만들자는 김보미의 정치개혁 제안과 현안 입장</description><language>ko</language>'
        + '<lastBuildDate>' + new Date(itemsR.length ? (itemsR[0].publishAt||Date.now()) : Date.now()).toUTCString() + '</lastBuildDate>'
        + itemsR.map(function(p){ var u = base + '/post/' + encodeURIComponent(p.id); return '<item><title>' + xe(p.title) + '</title><link>' + u + '</link><guid isPermaLink="true">' + u + '</guid><description>' + xe(strip(p.body)) + '</description><pubDate>' + new Date(p.publishAt||Date.now()).toUTCString() + '</pubDate></item>'; }).join('')
        + '</channel></rss>';
      res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=1800');
      res.status(200).send(xml);
      return;
    }
    if (action === 'page') {
      // 글별 공유용 정적 페이지: 봇에게는 OG 메타, 사람에게는 vision.html?post= 로 이동
      var arrP = await loadRaw(); if (!arrP) arrP = DEFAULT_POSTS;
      var pid = String(req.query.id||''); var pp = pubList(arrP).find(function(x){ return x.id===pid; });
      var xe2 = function(t){ return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
      var base2 = 'https://www.xn--4k0b53xuva.com';
      if (!pp) { res.setHeader('Location', base2 + '/vision.html'); res.status(302).end(); return; }
      var desc = String(pp.body||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0, 160);
      var target = base2 + '/vision.html?post=' + encodeURIComponent(pp.id);
      var htmlP = '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>' + xe2(pp.title) + ' | 김보미생각</title>'
        + '<meta name="description" content="' + xe2(desc) + '"><link rel="canonical" href="' + target + '">'
        + '<meta property="og:type" content="article"><meta property="og:site_name" content="김보미.com"><meta property="og:title" content="' + xe2(pp.title) + '"><meta property="og:description" content="' + xe2(desc) + '"><meta property="og:url" content="' + target + '">'
        + '<meta property="og:image" content="' + base2 + '/og-ud365.jpg?v=20260921d"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="' + xe2(pp.title) + '"><meta name="twitter:description" content="' + xe2(desc) + '">'
        + '<meta property="article:published_time" content="' + new Date(pp.publishAt||Date.now()).toISOString() + '"><meta property="article:author" content="김보미">'
        + '<meta http-equiv="refresh" content="0;url=' + target + '"></head><body style="font-family:sans-serif;padding:24px"><h1>' + xe2(pp.title) + '</h1><p>' + xe2(desc) + '</p><p><a href="' + target + '">글 읽기 →</a></p><script>location.replace(' + JSON.stringify(target) + ')</script></body></html>';
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=900');
      res.status(200).send(htmlP);
      return;
    }
    if (action === 'list') {
      var arr = await loadRaw(); if (!arr) arr = DEFAULT_POSTS.concat(STATIC_POSTS);
      var items = pubList(arr).map(function(p){ return { id:p.id, title:p.title, body:p.body, publishAt:p.publishAt }; });
      res.status(200).json({ ok:true, total:items.length, items:items });
      return;
    }
    if (action === 'get') {
      var arr2 = await loadRaw(); if (!arr2) arr2 = DEFAULT_POSTS.concat(STATIC_POSTS);
      var id = String(req.query.id||'');
      var p = pubList(arr2).find(function(x){ return x.id===id; });
      if (!p) { res.status(200).json({ ok:false, error:'not found' }); return; }
      res.status(200).json({ ok:true, item:p });
      return;
    }
    if (action === 'all') {
      var akey = req.query.key || req.headers['x-admin-key'] || '';
      if (!ADMIN_KEY || akey !== ADMIN_KEY) { res.status(401).json({ ok:false, error:'unauthorized' }); return; }
      var arr3 = await loadRaw();
      if (!arr3) { arr3 = DEFAULT_POSTS.slice(); await save(arr3); }  // 최초 진입 시 기본글 시드
      var now = Date.now();
      var items3 = arr3.slice().sort(function(a,b){ return (b.publishAt||0)-(a.publishAt||0); }).map(function(p){
        var state = p.status!=='published' ? 'hidden' : ((p.publishAt||0)<=now ? 'public' : 'scheduled');
        return { id:p.id, title:p.title, body:p.body, publishAt:p.publishAt, status:p.status, state:state, updatedAt:p.updatedAt };
      });
      res.status(200).json({ ok:true, total:items3.length, items:items3 });
      return;
    }
    if (action === 'save' && req.method === 'POST') {
      var akey2 = req.query.key || req.headers['x-admin-key'] || '';
      if (!ADMIN_KEY || akey2 !== ADMIN_KEY) { res.status(401).json({ ok:false, error:'unauthorized' }); return; }
      var raw = await readBody(req); var b = raw;
      if (typeof raw === 'string') { try { b = JSON.parse(raw||'{}'); } catch(e){ b={}; } }
      var title = clean(b.title, 120);
      var body = clean(b.body, 8000);
      if (!title || !body) { res.status(200).json({ ok:false, error:'empty' }); return; }
      var status = (b.status==='hidden') ? 'hidden' : 'published';
      var publishAt = parseInt(b.publishAt,10); if (isNaN(publishAt) || publishAt<=0) publishAt = Date.now();
      var arr4 = await loadRaw(); if (!arr4) arr4 = DEFAULT_POSTS.slice();
      var now2 = Date.now();
      var id2 = b.id ? String(b.id) : ('p'+now2.toString(36)+Math.random().toString(36).slice(2,6));
      var idx = arr4.findIndex(function(x){ return x.id===id2; });
      if (idx >= 0) {
        arr4[idx].title = title; arr4[idx].body = body; arr4[idx].status = status; arr4[idx].publishAt = publishAt; arr4[idx].updatedAt = now2;
      } else {
        arr4.push({ id:id2, title:title, body:body, status:status, publishAt:publishAt, createdAt:now2, updatedAt:now2 });
      }
      await save(arr4);
      res.status(200).json({ ok:true, id:id2 });
      return;
    }
    if (action === 'remove' && req.method === 'POST') {
      var akey3 = req.query.key || req.headers['x-admin-key'] || '';
      if (!ADMIN_KEY || akey3 !== ADMIN_KEY) { res.status(401).json({ ok:false, error:'unauthorized' }); return; }
      var raw2 = await readBody(req); var b2 = raw2;
      if (typeof raw2 === 'string') { try { b2 = JSON.parse(raw2||'{}'); } catch(e){ b2={}; } }
      var id3 = String(b2.id||''); if (!id3) { res.status(200).json({ ok:false, error:'no id' }); return; }
      var arr5 = await loadRaw(); if (!arr5) arr5 = DEFAULT_POSTS.slice();
      var before = arr5.length;
      arr5 = arr5.filter(function(x){ return x.id!==id3; });
      await save(arr5);
      res.status(200).json({ ok:true, removed: before-arr5.length });
      return;
    }
    // ===== 글 첨부 사진: 저장(uploadimg) / 서빙(img) =====
    if (action === 'img') {
      var iid = String(req.query.id||'').replace(/[^a-z0-9]/gi,'').slice(0,40);
      if (!iid) { res.status(404).end(); return; }
      var ir = await redis(['GET', IMGKEY + iid]);
      var iv = ir && ir.result;
      if (!iv) { res.status(404).end(); return; }
      var irec = null; try { irec = JSON.parse(iv); } catch(e2){ irec = null; }
      if (!irec || !irec.d) { res.status(404).end(); return; }
      var ibuf = Buffer.from(irec.d, 'base64');
      res.setHeader('Content-Type', irec.m || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Length', ibuf.length);
      res.status(200).end(ibuf);
      return;
    }
    if (action === 'uploadimg' && req.method === 'POST') {
      var iak = req.query.key || req.headers['x-admin-key'] || '';
      if (!ADMIN_KEY || iak !== ADMIN_KEY) { res.status(401).json({ ok:false, error:'unauthorized' }); return; }
      var iraw = await readBody(req); var ib = iraw;
      if (typeof iraw === 'string') { try { ib = JSON.parse(iraw||'{}'); } catch(e3){ ib={}; } }
      var imime = String(ib.mime||'').toLowerCase();
      if (['image/jpeg','image/png','image/webp','image/gif'].indexOf(imime) < 0) { res.status(200).json({ ok:false, error:'이미지 파일만 올릴 수 있습니다.' }); return; }
      var idata = String(ib.data||'').replace(/^data:[^,]*,/, '').replace(/\s/g,'');
      if (!idata) { res.status(200).json({ ok:false, error:'empty' }); return; }
      if (idata.length > 900000) { res.status(200).json({ ok:false, error:'사진 용량이 너무 큽니다. 더 작은 사진을 써주세요.' }); return; }
      var newid = Date.now().toString(36) + Math.random().toString(36).slice(2,8);
      await redis(['SET', IMGKEY + newid, JSON.stringify({ m:imime, d:idata, ts:Date.now() })]);
      res.status(200).json({ ok:true, id:newid, url:'/api/posts?action=img&id='+newid });
      return;
    }
    res.status(200).json({ ok:false, error:'bad action' });
  } catch(e) {
    res.status(200).json({ ok:false, error:String(e && e.message || e) });
  }
};
