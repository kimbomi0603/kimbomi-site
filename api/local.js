/* ============================================================
   지역 탐방 프록시  /api/local
   ------------------------------------------------------------
   지자체별로 「사람들이 많이 가는 곳·맛집·관광지·지방의회 예산 논의」를 한 번에 불러온다.
   인증키는 서버에서만 쓴다(브라우저에 노출하지 않음).

   소스
     spots   : 카카오 로컬 키워드검색, 관광명소(AT4)            [KAKAO_REST_API_KEY]
     food    : 카카오 로컬 키워드검색, 음식점(FD6)              [KAKAO_REST_API_KEY]
     google  : 구글 Places(New) 텍스트검색 — 평점·리뷰 수 순위   [GOOGLE_PLACES_API_KEY]
               ※ 유료 API라 하루 호출 상한(GOOGLE_DAILY_CAP, 기본 200)과 지역별 24시간 캐시를 둔다.
     tour    : 한국관광공사 국문 관광정보 키워드검색(KorService2) [DATA_GO_KR_API_KEY]
     minutes : 국회도서관 CLIK 지방의회 회의록 검색(지역+예산)   [CLIK_API_KEY]

   호출:  /api/local?region=강진군              (전체, visitors 제외)
          /api/local?region=강진군&type=visitors (관광 빅데이터 방문자 3개년 비교)
          /api/local?region=강진군&type=food    (하나만)
          /api/local?region=강진군&type=search&q=한정식  (그 지역 안에서 음식·장소 낱말 검색)
   진단:  /api/local?selfcheck=1                (키가 들어 있는지만 true/false 로 보여줌)
   ============================================================ */

const KAKAO = process.env.KAKAO_REST_API_KEY || "";
const GKEY = process.env.GOOGLE_PLACES_API_KEY || "";
const CLIK = process.env.CLIK_API_KEY || "";
function decKey(k) { k = String(k || "").trim(); try { if (/%[0-9A-Fa-f]{2}/.test(k)) k = decodeURIComponent(k); } catch (e) {} return k; }
const DGK = decKey(process.env.DATA_GO_KR_API_KEY || "") /* 김보미.com의 DATA_GO_KR_KEY는 지방재정365 키라 쓰지 않는다 */;
const GOOGLE_DAILY_CAP = Number(process.env.GOOGLE_DAILY_CAP || 200);

const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL;
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN;

const TYPES = ["spots", "food", "google", "tour", "minutes", "visitors", "search"];
const mem = new Map(); // Redis가 없을 때 인스턴스 메모리 캐시
let memGoogleCount = { day: "", n: 0 };

function kstDate() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
function shortName(s) { return String(s || "").replace(/(특별자치시|특별자치도|특별시|광역시)$/, "").trim(); }

async function redis(cmd) {
  if (!RURL || !RTOK) return null;
  try {
    const r = await fetch(RURL, { method: "POST", headers: { Authorization: "Bearer " + RTOK, "Content-Type": "application/json" }, body: JSON.stringify(cmd), signal: AbortSignal.timeout(4000) });
    const j = await r.json();
    return j && "result" in j ? j.result : null;
  } catch (e) { return null; }
}
async function cacheGet(key) {
  const v = await redis(["GET", key]);
  if (v) { try { return JSON.parse(v); } catch (e) {} }
  const m = mem.get(key);
  if (m && m.exp > Date.now()) return m.v;
  return null;
}
async function cacheSet(key, v, sec) {
  mem.set(key, { v, exp: Date.now() + sec * 1000 });
  await redis(["SET", key, JSON.stringify(v), "EX", String(sec)]);
}

/* 구글 하루 호출 수 — 상한을 넘으면 호출하지 않는다 */
async function googleBudgetOk() {
  const day = kstDate();
  const key = "local:gcount:" + day;
  const n = await redis(["INCR", key]);
  if (n !== null) {
    if (Number(n) === 1) await redis(["EXPIRE", key, "172800"]);
    return Number(n) <= GOOGLE_DAILY_CAP;
  }
  if (memGoogleCount.day !== day) memGoogleCount = { day, n: 0 };
  memGoogleCount.n += 1;
  return memGoogleCount.n <= GOOGLE_DAILY_CAP;
}

async function getJSON(url, opts) {
  const r = await fetch(url, Object.assign({ signal: AbortSignal.timeout(10000) }, opts || {}));
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { return { _raw: t.slice(0, 300), _status: r.status }; }
}

/* 카카오 로컬: 키워드+카테고리, 최대 3쪽(45곳) */
async function kakao(region, word, cat) {
  if (!KAKAO) return { ok: false, reason: "KAKAO_REST_API_KEY 없음", items: [] };
  const items = [];
  for (let page = 1; page <= 3; page++) {
    const q = new URLSearchParams({ query: region + " " + word, category_group_code: cat, size: "15", page: String(page) });
    const j = await getJSON("https://dapi.kakao.com/v2/local/search/keyword.json?" + q, { headers: { Authorization: "KakaoAK " + KAKAO } });
    if (!j.documents) return { ok: false, reason: "카카오 응답 오류", items };
    j.documents.forEach(function (d) {
      if (shortName(region) && d.address_name && d.address_name.indexOf(shortName(region).replace(/(시|군|구)$/, "")) < 0) return; // 다른 지역 결과 제외
      items.push({ name: d.place_name, category: d.category_name, address: d.road_address_name || d.address_name, phone: d.phone, x: d.x, y: d.y, url: d.place_url });
    });
    if (j.meta && j.meta.is_end) break;
  }
  return { ok: true, source: "카카오 로컬 검색(정확도순)", items };
}

/* 구글 Places: 평점·리뷰 수로 순위 */
async function google(region) {
  if (!GKEY) return { ok: false, reason: "GOOGLE_PLACES_API_KEY 없음", items: [] };
  if (!(await googleBudgetOk())) return { ok: false, reason: "오늘 구글 호출 상한(" + GOOGLE_DAILY_CAP + "회) 도달", items: [] };
  const j = await getJSON("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GKEY, "X-Goog-FieldMask": "places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.googleMapsUri,places.primaryTypeDisplayName" },
    body: JSON.stringify({ textQuery: region + " 맛집", languageCode: "ko", regionCode: "KR", pageSize: 20 }),
  });
  if (!j.places) return { ok: false, reason: "구글 응답 오류", items: [] };
  const items = j.places.map(function (p) {
    const rating = p.rating || 0, cnt = p.userRatingCount || 0;
    return { name: p.displayName && p.displayName.text, rating, reviews: cnt, type: p.primaryTypeDisplayName && p.primaryTypeDisplayName.text, address: p.formattedAddress, url: p.googleMapsUri, score: Math.round(rating * Math.log10(cnt + 1) * 100) / 100 };
  }).sort(function (a, b) { return b.score - a.score; });
  return { ok: true, source: "구글 지도 평점·리뷰 수 (점수 = 평점 × log10(리뷰수+1))", items };
}

/* 지역 법정동 코드 — 카카오 주소 검색(b_code 앞 5자리 = 시도 2 + 시군구 3) */
async function regionCode(region) {
  if (!KAKAO) return null;
  const j = await getJSON("https://dapi.kakao.com/v2/local/search/address.json?" + new URLSearchParams({ query: region, size: "1" }), { headers: { Authorization: "KakaoAK " + KAKAO } });
  const d = j.documents && j.documents[0];
  const b = d && d.address && d.address.b_code;
  return b ? { sido: b.slice(0, 2), sgg: b.slice(2, 5), name: d.address_name } : null;
}

/* 한국관광공사 관광정보 — 해당 시군구의 관광지·문화시설·축제·여행코스·레포츠(이미지 있는 순) */
async function tour(region) {
  if (!DGK) return { ok: false, reason: "DATA_GO_KR_API_KEY 없음", items: [] };
  const rc = await regionCode(region);
  if (!rc) return { ok: false, reason: "지역 코드를 찾지 못함", items: [] };
  const TYPE = { "12": "관광지", "14": "문화시설", "15": "축제·행사", "25": "여행코스", "28": "레포츠" };
  const lists = await Promise.all(["12", "14", "15", "28"].map(async function (ct) {
    const q = new URLSearchParams({ serviceKey: DGK, MobileOS: "ETC", MobileApp: "kimbomi", _type: "json", numOfRows: "15", pageNo: "1", arrange: "Q", contentTypeId: ct, lDongRegnCd: rc.sido, lDongSignguCd: rc.sgg });
    for (let attempt = 0; attempt < 2; attempt++) {
      const j = await getJSON("https://apis.data.go.kr/B551011/KorService2/areaBasedList2?" + q);
      const body = j && j.response && j.response.body;
      if (!body) continue;
      let arr = body.items && body.items.item ? body.items.item : [];
      if (!Array.isArray(arr)) arr = [arr];
      return { total: Number(body.totalCount || 0), arr: arr };
    }
    return { total: 0, arr: [], failed: true };
  }));
  if (lists.every(function (l) { return l.failed; })) return { ok: false, reason: "관광공사 응답 오류", items: [] };
  const items = [];
  lists.forEach(function (l) { l.arr.forEach(function (it) { items.push({ name: it.title, kind: TYPE[it.contenttypeid] || it.contenttypeid, address: it.addr1, image: it.firstimage || "", contentId: it.contentid }); }); });
  const total = lists.reduce(function (n, l) { return n + l.total; }, 0);
  return { ok: true, source: "한국관광공사 국문 관광정보 — " + rc.name + " 관광지·문화시설·축제·레포츠(이미지 있는 순)", total: total, items: items };
}

/* 관광 빅데이터 — 한국관광공사 데이터랩 기초지자체 방문자 수(현지인·외지인·외국인, 일별)
   최근 자료가 있는 달과 1년 전·2년 전 같은 달을 합산해 비교한다(정책·사업 효과 진단용). */
function ym(d) { return d.toISOString().slice(0, 7).replace("-", ""); }
function monthRange(y, m) { const s = new Date(Date.UTC(y, m - 1, 1)), e = new Date(Date.UTC(y, m, 0)); const f = function (d) { return d.toISOString().slice(0, 10).replace(/-/g, ""); }; return [f(s), f(e)]; }
async function dlPage(s, e, page) {
  const q = new URLSearchParams({ serviceKey: DGK, MobileOS: "ETC", MobileApp: "kimbomi", _type: "json", numOfRows: "10000", pageNo: String(page), startYmd: s, endYmd: e });
  const j = await getJSON("https://apis.data.go.kr/B551011/DataLabService/locgoRegnVisitrDDList?" + q);
  const b = j && j.response && j.response.body;
  if (!b) return null;
  let arr = b.items && b.items.item ? b.items.item : [];
  if (!Array.isArray(arr)) arr = [arr];
  return { total: Number(b.totalCount || 0), arr: arr };
}
async function monthSum(y, m, match) {
  const r = monthRange(y, m);
  const first = await dlPage(r[0], r[1], 1);
  if (!first) return null;
  if (!first.total) return { empty: true };
  const pages = Math.ceil(first.total / 10000);
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, function (_, i) { return dlPage(r[0], r[1], i + 2); }));
  const sum = { local: 0, outside: 0, foreign: 0, name: "", code: "" };
  [first].concat(rest).forEach(function (pg) { (pg && pg.arr || []).forEach(function (it) {
    if (!match(it)) return;
    sum.name = it.signguNm; sum.code = it.signguCode;
    const n = Number(it.touNum || 0);
    if (it.touDivCd === "1") sum.local += n; else if (it.touDivCd === "2") sum.outside += n; else if (it.touDivCd === "3") sum.foreign += n;
  }); });
  ["local", "outside", "foreign"].forEach(function (k) { sum[k] = Math.round(sum[k]); });
  sum.total = sum.local + sum.outside + sum.foreign;
  return sum;
}
async function visitors(region) {
  if (!DGK) return { ok: false, reason: "DATA_GO_KR_API_KEY 없음", items: [] };
  const words = shortName(region).split(/\s+/);
  const name = words[words.length - 1];
  const rc = await regionCode(region); // 같은 이름(중구·동구 등) 구별용
  const sidoName = words.length > 1 ? words[0] : "";
  const ambiguous = /^(중구|동구|서구|남구|북구|강서구)$/.test(name);
  const match = function (it) {
    if (it.signguNm !== name) return false;
    if (!ambiguous) return true;
    return rc ? String(it.signguCode).slice(0, 2) === rc.sido || String(it.signguCode).slice(0, 5) === rc.sido + rc.sgg : true;
  };
  // 자료가 있는 가장 최근 달 찾기(이번 달부터 거꾸로 6개월)
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  let y = now.getUTCFullYear(), m = now.getUTCMonth() + 1, latest = null;
  for (let i = 0; i < 6 && !latest; i++) {
    const r = monthRange(y, m);
    const chk = await dlPage(r[1], r[1], 1); // 그 달 마지막 날 자료가 있으면 한 달 치가 다 있다
    if (chk && chk.total) latest = { y: y, m: m };
    m -= 1; if (m === 0) { m = 12; y -= 1; }
  }
  if (!latest) return { ok: false, reason: "최근 방문자 자료를 찾지 못함", items: [] };
  const targets = [0, 1, 2].map(function (k) { return { y: latest.y - k, m: latest.m }; });
  const sums = await Promise.all(targets.map(function (t) { return monthSum(t.y, t.m, match); }));
  const items = targets.map(function (t, i) { const s = sums[i] || {}; return { period: t.y + "." + String(t.m).padStart(2, "0"), local: s.local || 0, outside: s.outside || 0, foreign: s.foreign || 0, total: s.total || 0 }; });
  if (!items[0].total) return { ok: false, reason: name + " 방문자 자료가 없음", items: [] };
  const pct = function (a, b) { return b ? Math.round((a - b) / b * 1000) / 10 : null; };
  return { ok: true, source: "한국관광공사 데이터랩 기초지자체 방문자 수(이동통신 기반 추정) — 같은 달 3개년 비교", region: (sums[0] && sums[0].name) || name,
    change1y: { total: pct(items[0].total, items[1].total), outside: pct(items[0].outside, items[1].outside), foreign: pct(items[0].foreign, items[1].foreign) },
    change2y: { total: pct(items[0].total, items[2].total), outside: pct(items[0].outside, items[2].outside) }, items: items };
}

/* CLIK 지방의회 회의록: ① 의회 이름으로 의회 ID를 찾고 ② 그 의회 회의록에서 「예산」 검색 */
async function clik(params) {
  const q = new URLSearchParams(Object.assign({ key: CLIK, type: "json", displayType: "list", startCount: "0" }, params));
  const j = await getJSON("https://clik.nanet.go.kr/openapi/minutes.do?" + q);
  const top = Array.isArray(j) ? j[0] : j;
  return top && top.RESULT_CODE === "SUCCESS" ? top : null;
}
async function minutes(region) {
  if (!CLIK) return { ok: false, reason: "CLIK_API_KEY 없음", items: [] };
  const words = shortName(region).split(/\s+/);
  const last = words[words.length - 1];
  const head = words.length > 1 ? words[0].replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, "") : "";
  const found = await clik({ listCount: "20", searchType: "RASMBLY_NM", searchKeyword: last + "의회" });
  if (!found) return { ok: false, reason: "CLIK 응답 오류", items: [] };
  const cands = (found.LIST || []).map(function (x) { return x.ROW || {}; }).filter(function (r) {
    return r.RASMBLY_NM && r.RASMBLY_NM.indexOf(last + "의회") >= 0 && (!head || r.RASMBLY_NM.indexOf(head) >= 0);
  });
  if (!cands.length) return { ok: false, reason: last + "의회 회의록을 찾지 못함", items: [] };
  const id = cands[0].RASMBLY_ID, name = cands[0].RASMBLY_NM;
  const top = await clik({ listCount: "60", searchType: "ALL", searchKeyword: "예산", rasmblyId: id });
  if (!top) return { ok: false, reason: "CLIK 응답 오류", items: [] };
  const items = (top.LIST || []).map(function (x) {
    const r = x.ROW || {};
    return { council: r.RASMBLY_NM, meeting: r.MTGNM, date: r.MTG_DE, session: r.RASMBLY_SESN, order: r.MINTS_ODR, docid: r.DOCID };
  }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 15);
  return { ok: true, source: "국회도서관 CLIK 지방의회 회의록 — " + name + " 「예산」 검색", total: top.TOTAL_COUNT, items };
}

/* 지역 안 낱말 검색 — 음식점(FD6)·카페(CE7)·관광명소(AT4)를 함께 찾아 음식점 먼저 보여 준다 */
async function search(region, word) {
  const rs = await Promise.all([kakao1(region, word, "FD6"), kakao1(region, word, "CE7"), kakao1(region, word, "AT4")]);
  if (rs.every(function (r) { return !r.ok; })) return { ok: false, reason: rs[0].reason, items: [] };
  const seen = {}, items = [];
  rs.forEach(function (r) { r.items.forEach(function (x) { if (seen[x.url]) return; seen[x.url] = 1; items.push(x); }); });
  return { ok: true, source: "카카오 로컬 검색(정확도순) — 음식점·카페·관광명소", items: items.slice(0, 30) };
}
async function kakao1(region, word, cat) {
  if (!KAKAO) return { ok: false, reason: "KAKAO_REST_API_KEY 없음", items: [] };
  const q = new URLSearchParams({ query: region + " " + word, category_group_code: cat, size: "15", page: "1" });
  const j = await getJSON("https://dapi.kakao.com/v2/local/search/keyword.json?" + q, { headers: { Authorization: "KakaoAK " + KAKAO } });
  if (!j.documents) return { ok: false, reason: "카카오 응답 오류", items: [] };
  const key = shortName(region).replace(/(시|군|구)$/, "");
  const items = [];
  j.documents.forEach(function (d) {
    if (key && d.address_name && d.address_name.indexOf(key) < 0) return;
    items.push({ name: d.place_name, category: d.category_name, address: d.road_address_name || d.address_name, phone: d.phone, x: d.x, y: d.y, url: d.place_url });
  });
  return { ok: true, items };
}

const RUN = {
  spots: function (r) { return kakao(r, "가볼만한곳", "AT4"); },
  food: function (r) { return kakao(r, "맛집", "FD6"); },
  google: google,
  tour: tour,
  minutes: minutes,
  visitors: visitors,
};
const TTL = { spots: 86400, food: 86400, google: 86400, tour: 86400, minutes: 21600, visitors: 86400, search: 86400 };

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const url = new URL(req.url, "http://x");

  if (url.searchParams.get("selfcheck")) {
    res.status(200).send(JSON.stringify({ ok: true, keys: { KAKAO_REST_API_KEY: !!KAKAO, GOOGLE_PLACES_API_KEY: !!GKEY, CLIK_API_KEY: !!CLIK, DATA_GO_KR_API_KEY: !!DGK, redis: !!(RURL && RTOK) }, googleDailyCap: GOOGLE_DAILY_CAP }));
    return;
  }

  /* 카카오 지도(JavaScript) 키 — 브라우저에서 쓰는 공개용 키이며 카카오에 등록한 도메인에서만 작동한다 */
  if (url.searchParams.get("config")) {
    res.setHeader("Cache-Control", "s-maxage=86400");
    res.status(200).send(JSON.stringify({ ok: true, kakaoJsKey: process.env.KAKAO_JS_KEY || "" }));
    return;
  }

  const region = String(url.searchParams.get("region") || "").trim().slice(0, 30);
  if (!region) { res.status(400).send(JSON.stringify({ ok: false, error: "region 이 필요합니다. 예: /api/local?region=강진군" })); return; }
  const want = String(url.searchParams.get("type") || "all");
  const types = want === "all" ? TYPES.filter(function (t) { return t !== "visitors" && t !== "search"; }) : want.split(",").filter(function (t) { return TYPES.indexOf(t) >= 0; });
  if (!types.length) { res.status(400).send(JSON.stringify({ ok: false, error: "type 은 " + TYPES.join(", ") + " 중 하나" })); return; }

  /* 낱말 검색: 한글·영문·숫자·공백만, 20자까지 */
  const word = String(url.searchParams.get("q") || "").replace(/[^0-9A-Za-z가-힣 ]/g, "").trim().slice(0, 20);
  if (types.indexOf("search") >= 0 && !word) { res.status(400).send(JSON.stringify({ ok: false, error: "q 가 필요합니다. 예: /api/local?region=강진군&type=search&q=한정식" })); return; }

  const out = { ok: true, region, fetchedAt: new Date().toISOString() };
  if (word) out.q = word;
  await Promise.all(types.map(async function (t) {
    const ck = "local:v1:" + t + ":" + region + (t === "search" ? ":" + word : "");
    const hit = await cacheGet(ck);
    if (hit) { out[t] = Object.assign({ cached: true }, hit); return; }
    try {
      const v = t === "search" ? await search(region, word) : await RUN[t](region);
      if (v.ok && v.items && v.items.length) await cacheSet(ck, v, TTL[t]);
      out[t] = v;
    } catch (e) {
      out[t] = { ok: false, reason: "불러오기 실패", items: [] };
    }
  }));
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(JSON.stringify(out));
};
