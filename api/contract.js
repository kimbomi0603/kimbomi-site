/* ============================================================
   🏛️ 나라장터(조달청) G2B OpenAPI — Vercel 서버리스 함수 (v2)
   경로:  /api/contract
   ------------------------------------------------------------
   ⚠ 2024 나라장터 차세대 전환으로 API 주소가 변경됨.
     1차: 입찰공고정보서비스  https://apis.data.go.kr/1230000/ad/BidPublicInfoService
          → 수요기관명(dminsttNm)으로 지역 직접 검색 (공사+용역+물품 병렬)
     2차 폴백: 공공데이터개방표준서비스 https://apis.data.go.kr/1230000/ao/PubDataOpnStdService
          → 전국 조회 후 지역명 필터 (인증키가 1차 서비스 미신청일 때)

   환경변수
     G2B_API_KEY = 공공데이터포털 인증키 (필수)
       ※ data.go.kr에서 "나라장터 입찰공고정보서비스"(15129394)와
         "나라장터 공공데이터개방표준서비스"(15058815) 두 건 활용신청(자동승인) 권장.

   쿼리
     /api/contract?selfcheck=1            → 인증키·업스트림 실연결 진단
     /api/contract?region=강진군          → 최근 90일 입찰·계약 공고
     /api/contract?region=강진군&days=180 → 기간 조절(30일 단위 창, 최대 180)
     /api/contract?region=강진군&vendor=○○ → 업체/기관명 드릴다운
   ============================================================ */

const AD_BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";
const AO_BASE = "https://apis.data.go.kr/1230000/ao/PubDataOpnStdService";
const KEY = process.env.G2B_API_KEY || "";
/* 실낙찰 연계용 보조키(선택) — '나라장터 낙찰정보서비스'가 승인된 data.go.kr 계정의 일반 인증키.
   Encoding(%포함)·Decoding 어느 형태든 허용. 설정되면 지역 공고에 낙찰업체·낙찰금액을 병합. */
let KEY2 = process.env.G2B_API_KEY2 || "";
try { if (/%[0-9A-Fa-f]{2}/.test(KEY2)) KEY2 = decodeURIComponent(KEY2); } catch (e) {}
const AS_BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
const AS_OPS = ["getScsbidListSttusCnstwkPPSSrch", "getScsbidListSttusServcPPSSrch", "getScsbidListSttusThngPPSSrch"];

/* ── Redis(Upstash) 결과 캐시 — 첫 호출 7~8초 문제 해결: 30분간 결과 재사용 ── */
const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL || "";
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN || "";
const CACHE_TTL = 1800; // 30분
async function kvGet(key) {
  if (!RURL) return null;
  try {
    const r = await fetch(RURL, { method: "POST", headers: { Authorization: "Bearer " + RTOK, "Content-Type": "application/json" }, body: JSON.stringify(["GET", key]), signal: AbortSignal.timeout(3000) });
    const d = await r.json();
    return d && d.result ? JSON.parse(d.result) : null;
  } catch (e) { return null; }
}
async function kvSet(key, obj, ttl) {
  if (!RURL) return;
  try {
    await fetch(RURL, { method: "POST", headers: { Authorization: "Bearer " + RTOK, "Content-Type": "application/json" }, body: JSON.stringify(["SET", key, JSON.stringify(obj), "EX", String(ttl)]), signal: AbortSignal.timeout(3000) });
  } catch (e) {}
}

const AD_OPS = [
  ["getBidPblancListInfoCnstwkPPSSrch", "공사"],
  ["getBidPblancListInfoServcPPSSrch", "용역"],
  ["getBidPblancListInfoThngPPSSrch", "물품"],
];

function pad(n) { return n < 10 ? "0" + n : "" + n; }
function ymdhm(d) {
  return "" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + pad(d.getHours()) + pad(d.getMinutes());
}
function num(x) { const n = Number(String(x == null ? "" : x).replace(/[, ]/g, "")); return isFinite(n) ? n : 0; }

/* 30일 단위 조회창 생성 (API가 조회기간 1개월 제한) */
function windows(days) {
  const out = [];
  const end = new Date();
  let cursor = new Date(end);
  let remain = days;
  while (remain > 0 && out.length < 6) {
    const span = Math.min(30, remain);
    const from = new Date(cursor.getTime() - span * 24 * 3600 * 1000);
    out.push([ymdhm(from), ymdhm(cursor)]);
    cursor = from;
    remain -= span;
  }
  return out;
}

/* 공통 응답 파서 — JSON 우선, XML 게이트웨이 에러도 해석 */
async function callApi(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await r.text();
  let raw = null;
  try { raw = JSON.parse(text); } catch (e) {
    const code = (text.match(/<returnReasonCode>(\d+)<\/returnReasonCode>/) || [])[1];
    const msg = (text.match(/<returnAuthMsg>([^<]+)<\/returnAuthMsg>/) || [])[1] || (text.match(/<errMsg>([^<]+)<\/errMsg>/) || [])[1];
    return { ok: false, code: code || ("HTTP" + r.status), msg: msg || text.slice(0, 120) };
  }
  const header = (raw && raw.response && raw.response.header) || (raw && raw.header) || {};
  const rc = header.resultCode != null ? String(header.resultCode) : "00";
  if (rc !== "00" && rc !== "0") return { ok: false, code: rc, msg: header.resultMsg || "" };
  const body = (raw && raw.response && raw.response.body) || (raw && raw.body) || raw;
  let items = (body && body.items) || [];
  if (items && !Array.isArray(items)) items = items.item ? [].concat(items.item) : [items];
  return { ok: true, items: items.filter(Boolean), total: num(body && body.totalCount) };
}

/* 1차: 입찰공고정보서비스 — 지역(수요기관명) 직접 검색 */
async function fetchAD(region, days) {
  const wins = windows(days);
  const jobs = [];
  for (const win of wins) {
    for (const opdef of AD_OPS) {
      const op = opdef[0], kindNm = opdef[1];
      const p = new URLSearchParams({
        serviceKey: KEY, pageNo: "1", numOfRows: "100",
        inqryDiv: "1", inqryBgnDt: win[0], inqryEndDt: win[1], type: "json",
      });
      if (region) p.set("dminsttNm", region);
      jobs.push(callApi(AD_BASE + "/" + op + "?" + p.toString()).then(function (r) {
        if (r.ok) {
          r.items.forEach(function (it) { if (!it.bsnsDivNm) it.bsnsDivNm = kindNm; });
          if ((r.total || 0) > r.items.length) r.truncated = true;   /* numOfRows(100) 초과분 미수신 */
        }
        return r;
      }));
    }
  }
  const results = await Promise.all(jobs);
  const okOnes = results.filter(function (x) { return x.ok; });
  if (!okOnes.length) {
    const e = results[0] || {};
    return { ok: false, code: e.code, msg: e.msg };
  }
  const items = [].concat.apply([], okOnes.map(function (x) { return x.items; }));
  const truncated = okOnes.some(function (x) { return x.truncated; });
  return { ok: true, items: items, total: okOnes.reduce(function (a, x) { return a + (x.total || 0); }, 0), partial: truncated, src: "나라장터 입찰공고정보서비스(ad)" };
}

/* 2차 폴백: 개방표준서비스 — 전국 조회 후 지역명 필터 */
async function fetchAO(region, days) {
  const wins = windows(Math.min(days, 60));
  const jobs = wins.map(function (win) {
    const p = new URLSearchParams({
      serviceKey: KEY, pageNo: "1", numOfRows: "999", type: "json",
      bidNtceBgnDt: win[0], bidNtceEndDt: win[1],
    });
    return callApi(AO_BASE + "/getDataSetOpnStdBidPblancInfo?" + p.toString());
  });
  const results = await Promise.all(jobs);
  const okOnes = results.filter(function (x) { return x.ok; });
  if (!okOnes.length) {
    const e = results[0] || {};
    return { ok: false, code: e.code, msg: e.msg };
  }
  let items = [].concat.apply([], okOnes.map(function (x) { return x.items; }));
  if (region) {
    items = items.filter(function (it) {
      return String(it.dmndInsttNm || "").indexOf(region) >= 0 ||
        String(it.ntceInsttNm || "").indexOf(region) >= 0;
    });
  }
  return { ok: true, items: items, total: items.length, src: "나라장터 공공데이터개방표준서비스(ao) · 지역필터", partial: true };
}

/* ── 실낙찰 연계 (KEY2 필요): 낙찰정보서비스에서 공고번호→낙찰업체·낙찰금액 맵 생성 ── */
async function fetchAwardMap(days, force) {
  const capped = Math.min(days, 30);          // 낙찰 연계는 최근 30일(속도·타임아웃 안전)
  /* 전역(지역 무관) 낙찰맵 — 1시간 캐시로 두 번째 요청부터 즉시 */
  const ck = "g2b:awmap:v2:" + capped;
  const cached = force ? null : await kvGet(ck);
  if (cached && cached.map) return cached;
  const wins = windows(capped);               // 30일 단위 창(=1개)
  const jobs = [];
  const raced = function (p) {                // 느린 요청은 45초에 포기(워밍 경로 전용)
    return Promise.race([p, new Promise(function (res) { setTimeout(function () { res({ ok: false }); }, 45000); })]);
  };
  for (const win of wins) {
    for (const op of AS_OPS) {
      for (let p = 1; p <= 8; p++) {
        const q = new URLSearchParams({
          serviceKey: KEY2, pageNo: String(p), numOfRows: "500", type: "json",
          inqryDiv: "1", inqryBgnDt: win[0], inqryEndDt: win[1]
        });
        jobs.push(raced(callApi(AS_BASE + "/" + op + "?" + q.toString()).catch(function () { return { ok: false }; })));
      }
    }
  }
  const results = await Promise.all(jobs);
  const map = {};
  let cnt = 0;
  results.forEach(function (r) {
    if (!r || !r.ok) return;
    (r.items || []).forEach(function (it) {
      const no = String(it.bidNtceNo || "").trim();
      if (!no) return;
      const v = String(it.bidwinnrNm || it.fnlSucsfCorpNm || "").trim();
      if (!v) return;
      if (!map[no]) { map[no] = { v: v, a: num(it.sucsfbidAmt || it.fnlSucsfAmt), biz: String(it.bidwinnrBizno || "") }; cnt++; }
    });
  });
  const out = { map: map, count: cnt };
  await kvSet(ck, out, 93600);   // 26시간 — 일일 크론 워밍으로 갱신
  return out;
}

function normDate(s) {
  s = String(s || "");
  if (/^\d{8}/.test(s)) return s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8);
  return s.slice(0, 10);
}

/* 같은 공고번호의 정정·재공고는 최신 차수만 유지 */
function dedup(items) {
  const map = {};
  for (const it of items) {
    const no = String(it.bidNtceNo || it.bidNtceNm || Math.random());
    const ord = num(it.bidNtceOrd);
    if (!map[no] || ord >= num(map[no].bidNtceOrd)) map[no] = it;
  }
  return Object.values(map);
}

/* 재공고는 매번 새 공고번호를 받아 번호기준 dedup을 통과함(2026.08 강진군 실측: 동일 제목·금액 4중 계상)
   → 제목+수요기관+금액이 같으면 동일 사업의 재공고로 보고 최신 1건만 남기고 횟수를 기록 */
function dedupRenotice(rows) {
  const map = {};
  rows.forEach(function (b) {
    const key = b.title + "|" + b.org + "|" + (b.amount || 0);
    if (!map[key] || String(b.date) > String(map[key].date)) {
      const prev = map[key];
      map[key] = b;
      b.reCnt = (prev ? prev.reCnt : 0) + (prev ? 1 : 0);
    } else {
      map[key].reCnt = (map[key].reCnt || 0) + 1;
    }
  });
  return Object.values(map);
}
function normalize(items) {
  const rows = dedup(items).map(function (it) {
    const rawDt = it.bidNtceDt || it.bidNtceDate || it.opengDt || it.opengDate || "";
    return {
      title: it.bidNtceNm || it.prdctClsfcNoNm || "(제목 미상)",
      method: it.sucsfbidMthdNm || it.cntrctCnclsMthdNm || it.bidMethdNm || it.bidwinrDcsnMthdNm || "",
      amount: num(it.presmptPrce || it.asignBdgtAmt || it.bdgtAmt || it.bidPrjctEstmtPrice),
      org: it.dminsttNm || it.dmndInsttNm || it.ntceInsttNm || "",
      vendor: (it.scsbidNm || it.bidwinnrNm || it.fnlSucsfCorpNm || "").trim(),
      kind: it.bsnsDivNm || "",
      date: normDate(rawDt),
      year: String(rawDt).replace(/[^0-9]/g, "").slice(0, 4),
      url: it.bidNtceDtlUrl || it.bidNtceUrl || "",
      ntceNo: String(it.bidNtceNo || "").trim(),
      sutil: /수의|단독|1인/.test(it.sucsfbidMthdNm || it.cntrctCnclsMthdNm || it.bidMethdNm || it.bidwinrDcsnMthdNm || ""),   /* 협상에의한계약은 경쟁방식 — 수의 분류에서 제외(2026.08.23 정정) */
      unit: /단가/.test(String(it.bidNtceNm || "") + String(it.cntrctCnclsMthdNm || ""))   /* 단가계약(원/kg 등) — 총액 합산에서 제외 */
    };
  });
  return dedupRenotice(rows).sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");

  const q = (req.query && typeof req.query === "object") ? req.query : {};
  const region = (q.region || "").toString().trim();
  const vendor = (q.vendor || "").toString().trim();
  const days = Math.max(1, Math.min(180, parseInt(q.days || 90, 10)));

  /* ═══ 열린재정(openfiscaldata.go.kr) OPEN API 프록시 — Hobby 함수 12개 제한으로 contract.js에 통합 ═══
     호출: /api/contract?ofd=IncomeTax&OJ_YY=2025  /  목록: /api/contract?ofd=list
     기관: 기획예산처·한국재정정보원 · 인증키: 환경변수 OFD_API_KEY(하드코딩 금지)
     주의: 원 API가 브라우저 UA·Referer 헤더를 요구함(없으면 오류 페이지 반환) */
  if (q.ofd) {
    const OFD_ALLOW = {
      IncomeTax:{nm:"국세수입",yr:"OJ_YY"}, NontaxIncome:{nm:"세외수입",yr:"OJ_YY"},
      FundIncome:{nm:"기금수입",yr:"OJ_YY"}, GovernmentInvestment:{nm:"정부출자현황",yr:"OJ_YY"},
      GovernmentDividend:{nm:"정부출자기관 정부배당",yr:"OJ_YY"},
      OPFI166:{nm:"중앙관서별 총지출추이",yr:"ACNT_YR"}, OPFI163:{nm:"사업성기금 운용규모",yr:"ACNT_YR"},
      OPFI161:{nm:"특별회계별 재정지출추이",yr:"ACNT_YR"}, OPFI123:{nm:"성질별 지출추이",yr:"ACNT_YR"},
      OPFI121:{nm:"이월의 성질별 추이",yr:"ACNT_YR"}, OPFB129:{nm:"분야별 재원배분 계획",yr:"ACNT_YR"},
      OPFI172:{nm:"분야별 프로그램 예산",yr:"ACNT_YR"}, OPFI134:{nm:"분야별 출연금 지출추이",yr:"ACNT_YR"},
      OPFI165:{nm:"16대 분야별 재원배분",yr:"ACNT_YR"}, OPFI150:{nm:"작성기준별 주요재정통계",yr:"ACNT_YR"},
      OPFI140:{nm:"연도별 총세입·총세출",yr:"ACNT_YR"}
    };
    const ep = String(q.ofd).trim();
    if (ep === "list") {
      res.setHeader("Cache-Control","public, s-maxage=86400");
      return res.status(200).json({ ok:true, endpoints:Object.entries(OFD_ALLOW).map(([k,v])=>({ep:k,nm:v.nm,yearParam:v.yr})) });
    }
    if (!OFD_ALLOW[ep]) return res.status(200).json({ ok:false, error:"허용되지 않은 엔드포인트", hint:"/api/contract?ofd=list" });
    const OKEY = process.env.OFD_API_KEY || "";
    if (!OKEY) { res.setHeader("Cache-Control","no-store"); return res.status(200).json({ ok:false, error:"OFD_API_KEY 미설정", hint:"Vercel 환경변수에 열린재정 인증키를 등록하세요." }); }
    const d = OFD_ALLOW[ep];
    const oyr = String(q[d.yr] || q.year || "").replace(/[^0-9]/g,"").slice(0,4);
    const osz = Math.min(parseInt(q.pSize||"1000",10)||1000, 1000);
    const oix = Math.max(parseInt(q.pIndex||"1",10)||1, 1);
    const ock = `ofd:v1:${ep}:${oyr}:${oix}:${osz}`;
    if (!q.fresh) { const c = await kvGet(ock); if (c) { c.cached = true; return res.status(200).json(c); } }
    const op = new URLSearchParams({ Key:OKEY, Type:"json", pIndex:String(oix), pSize:String(osz) });
    if (oyr) op.set(d.yr, oyr);
    try {
      const rr = await fetch(`https://openapi.openfiscaldata.go.kr/${ep}?${op}`, {
        headers:{ "User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
                  "Referer":"https://www.openfiscaldata.go.kr/", "Accept":"application/json,*/*" },
        signal: AbortSignal.timeout(15000) });
      const txt = await rr.text();
      let j; try { j = JSON.parse(txt); if (typeof j === "string") j = JSON.parse(j); } catch(e){ j = null; }
      if (!j) { res.setHeader("Cache-Control","no-store"); return res.status(200).json({ ok:false, ep, error:"응답 파싱 실패(원 API 오류 페이지)" }); }
      if (j.RESULT) {
        const o0 = { ok:true, ep, nm:d.nm, year:oyr||null, total:0, count:0, rows:[], note:j.RESULT.MESSAGE||"" };
        await kvSet(ock,o0,21600);
        res.setHeader("Cache-Control","public, s-maxage=21600, stale-while-revalidate=86400");
        return res.status(200).json(o0);
      }
      const body = j[ep] || [];
      const hd = (body.find(b=>b.head)||{}).head || [];
      const tc = ((hd.find(x=>x.list_total_count!=null)||{}).list_total_count);
      const rws = (body.find(b=>b.row)||{}).row || [];
      const o1 = { ok:true, ep, nm:d.nm, year:oyr||null, total:(tc==null?null:tc), count:rws.length, rows:rws,
                   src:"기획예산처·한국재정정보원 열린재정 OPEN API", fetched_at:new Date().toISOString() };
      await kvSet(ock,o1,21600);
      res.setHeader("Cache-Control","public, s-maxage=21600, stale-while-revalidate=86400");
      return res.status(200).json(o1);
    } catch(e) {
      res.setHeader("Cache-Control","no-store");
      return res.status(200).json({ ok:false, ep, error:String((e&&e.message)||e) });
    }
  }

  /* 중앙선관위(9760000) 공공데이터 프록시 — /api/contract?nec=<서비스>/<오퍼>&sgId=... (Hobby 함수 제한으로 통합)
     예: ?nec=ElecPrmsInfoInqireService/getCnddtElecPrmsInfoInqire&sgId=20220601&sgTypecode=4&cnddtId=100135777 */
  if (q.nec) {
    if (!KEY2) return res.status(200).json({ ok: false, error: "G2B_API_KEY2 미설정" });
    const m = String(q.nec).match(/^([A-Za-z0-9]{3,60})\/([A-Za-z0-9]{3,80})$/);
    if (!m) return res.status(200).json({ ok: false, error: "nec=서비스명/오퍼레이션명 형식 필요" });
    const svc = m[1], op = m[2];
    const PASS = ["sgId", "sgTypecode", "sdName", "wiwName", "sggName", "cnddtId", "huboId", "partyName", "krName", "sggName2", "prmsCnt"];
    const qs2 = new URLSearchParams({ serviceKey: KEY2, resultType: "json", pageNo: String(parseInt(q.pageNo || 1, 10) || 1), numOfRows: String(Math.min(100, parseInt(q.numOfRows || 50, 10) || 50)) });
    const ckParts = [];
    for (const k of PASS) { if (q[k]) { const v = String(q[k]).slice(0, 80); qs2.set(k, v); ckParts.push(k + "=" + v); } }
    const ck2 = "nec:v1:" + svc + ":" + op + ":" + qs2.get("pageNo") + ":" + qs2.get("numOfRows") + ":" + ckParts.join("|");
    const cached2 = q.fresh ? null : await kvGet(ck2);
    if (cached2) { res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=21600"); return res.status(200).json(cached2); }
    try {
      const call2 = function () {
        return fetch("https://apis.data.go.kr/9760000/" + svc + "/" + op + "?" + qs2.toString(), { signal: AbortSignal.timeout(12000) });
      };
      let rn = await call2();
      if (!rn.ok) rn = await call2();
      const txt = await rn.text();
      let dn; try { dn = JSON.parse(txt); } catch (e) { dn = null; }
      if (!dn) return res.status(200).json({ ok: false, error: "선관위 응답 파싱 실패", raw: txt.slice(0, 300) });
      const body = (dn.response && dn.response.body) || {};
      const head = (dn.response && dn.response.header) || {};
      const out2 = { ok: head.resultCode === "INFO-00" || head.resultCode === "00", code: head.resultCode || "", msg: head.resultMsg || "", total: body.totalCount || 0, items: (body.items && body.items.item) || [], src: "중앙선거관리위원회 " + svc + "(실데이터)" };
      if (out2.ok) await kvSet(ck2, out2, 21600);
      res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=21600");
      return res.status(200).json(out2);
    } catch (e) { return res.status(200).json({ ok: false, error: String(e.message || e) }); }
  }

  /* data.go.kr 범용 프록시 — /api/contract?dg=<기관코드>/<서비스>/<오퍼>&...
     권익위 반부패(1140100/NcpBaService_v3) 등 apis.data.go.kr 계열 (Hobby 함수 제한으로 통합) */
  if (q.dg) {
    if (!KEY2) return res.status(200).json({ ok: false, error: "G2B_API_KEY2 미설정" });
    const mg = String(q.dg).match(/^(\d{5,10}|B\d{6})\/([A-Za-z0-9_.\-]{2,80})\/([A-Za-z0-9_]{2,90})$/);
    if (!mg) return res.status(200).json({ ok: false, error: "dg=기관코드/서비스/오퍼 형식 필요" });
    const qs4 = new URLSearchParams();
    for (const k of Object.keys(q)) {
      if (k === "dg" || k === "fresh" || k === "raw" || k === "nodef" || k === "serviceKey") continue;
      const v4 = String(q[k]).slice(0, 200);
      if (v4 !== "") qs4.set(k.slice(0, 60), v4);
    }
    if (!q.nodef) {
      if (!qs4.get("pageNo")) qs4.set("pageNo", "1");
      if (!qs4.get("numOfRows")) qs4.set("numOfRows", "20");
      if (!qs4.get("resultType") && !qs4.get("_type")) qs4.set("resultType", "json");
    }
    const ck4 = "dg:v1:" + q.dg + ":" + qs4.toString();
    const cached4 = q.fresh ? null : await kvGet(ck4);
    if (cached4) { res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=21600"); return res.status(200).json(cached4); }
    try {
      qs4.set("serviceKey", KEY2);
      const call4 = function () {
        return fetch("https://apis.data.go.kr/" + mg[1] + "/" + mg[2] + "/" + mg[3] + "?" + qs4.toString(), { signal: AbortSignal.timeout(12000) });
      };
      let rg = await call4();
      if (!rg.ok && rg.status >= 500) rg = await call4();
      const txt4 = await rg.text();
      if (q.raw) { res.setHeader("Cache-Control", "no-store"); return res.status(200).json({ ok: rg.ok, status: rg.status, raw: txt4.slice(0, 200000) }); }
      let d4; try { d4 = JSON.parse(txt4); } catch (e) { d4 = null; }
      let out4;
      if (d4) {
        const RESP = d4.Response || d4.response || d4;
        const body4 = (RESP && RESP.body) || (RESP && RESP.items !== undefined ? RESP : null) || d4.body || d4;
        const head4 = (RESP && (RESP.header || RESP.head)) || d4.header || {};
        let items4 = (body4.items && (body4.items.item || body4.items)) || body4.item || body4.data || [];
        if (typeof items4 === "string") items4 = [];
        if (!head4.resultCode && head4.resultMsg === undefined && d4.Response && d4.Response.head) { head4.resultCode = d4.Response.head.resultCode; head4.resultMsg = d4.Response.head.resultMsg; }
        if (items4 && !Array.isArray(items4)) items4 = [items4];
        out4 = { ok: rg.ok, code: head4.resultCode || "", msg: head4.resultMsg || "", total: body4.totalCount || 0, items: items4 || [], src: "공공데이터포털 " + mg[2] + "(실데이터)" };
      } else {
        out4 = { ok: rg.ok, xml: txt4.slice(0, 60000), src: "공공데이터포털 " + mg[2] + "(실데이터·XML)" };
      }
      if (out4.ok) await kvSet(ck4, out4, 21600);
      res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=21600");
      return res.status(200).json(out4);
    } catch (e) { return res.status(200).json({ ok: false, error: String(e.message || e) }); }
  }

  /* odcloud(공공데이터 표준 API) 프록시 — /api/contract?od=gov24/v3/serviceList&perPage=10&...
     행안부 공공서비스(혜택)·권익위 청렴도 등 api.odcloud.kr 계열 (Hobby 함수 제한으로 통합) */
  if (q.od) {
    if (!KEY2) return res.status(200).json({ ok: false, error: "G2B_API_KEY2 미설정" });
    const path2 = String(q.od).replace(/[^A-Za-z0-9/_:.\-]/g, "").replace(/^\/+/, "").slice(0, 160);
    if (!path2 || path2.indexOf("..") !== -1) return res.status(200).json({ ok: false, error: "od=경로 필요" });
    const qs3 = new URLSearchParams();
    for (const k of Object.keys(q)) {
      if (k === "od" || k === "fresh" || k === "serviceKey") continue;
      qs3.set(k.slice(0, 60), String(q[k]).slice(0, 200));
    }
    if (!qs3.get("page")) qs3.set("page", "1");
    if (!qs3.get("perPage")) qs3.set("perPage", "20");
    qs3.set("returnType", "JSON");
    const ck3 = "od:v1:" + path2 + ":" + qs3.toString();
    const cached3 = q.fresh ? null : await kvGet(ck3);
    if (cached3) { res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=21600"); return res.status(200).json(cached3); }
    try {
      qs3.set("serviceKey", KEY2);
      const call3 = function () {
        return fetch("https://api.odcloud.kr/api/" + path2 + "?" + qs3.toString(), { signal: AbortSignal.timeout(12000) });
      };
      let ro = await call3();
      if (!ro.ok && ro.status >= 500) ro = await call3();
      const txt3 = await ro.text();
      let d3; try { d3 = JSON.parse(txt3); } catch (e) { d3 = null; }
      if (!d3) return res.status(200).json({ ok: false, error: "odcloud 응답 파싱 실패(" + ro.status + ")", raw: txt3.slice(0, 300) });
      const out3 = { ok: !d3.code || d3.code >= 0 ? ro.ok : false, status: ro.status, total: d3.totalCount || 0, count: d3.currentCount || 0, items: d3.data || [], src: "공공데이터포털 odcloud " + path2 + "(실데이터)" };
      if (!ro.ok) { out3.ok = false; out3.error = d3.msg || d3.message || "HTTP " + ro.status; }
      if (out3.ok) await kvSet(ck3, out3, 21600);
      res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=21600");
      return res.status(200).json(out3);
    } catch (e) { return res.status(200).json({ ok: false, error: String(e.message || e) }); }
  }

  /* 국세청 사업자상태 조회 — /api/contract?biz=1028142945,8191202555 (Hobby 함수수 제한으로 통합) */
  if (q.biz) {
    if (!KEY2) return res.status(200).json({ ok: false, error: "G2B_API_KEY2 미설정" });
    const nos = Array.from(new Set(String(q.biz).replace(/[^0-9,]/g, "").split(",").filter(function (x) { return /^\d{10}$/.test(x); }))).slice(0, 50);
    if (!nos.length) return res.status(200).json({ ok: false, error: "사업자번호 필요(10자리, 콤마구분)" });
    const items = {}, misses = [];
    for (const no of nos) {
      const c = await kvGet("biz:v1:" + no);
      if (c) items[no] = c; else misses.push(no);
    }
    if (misses.length) {
      try {
        const call = function () {
          return fetch("https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=" + encodeURIComponent(KEY2), {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ b_no: misses }), signal: AbortSignal.timeout(12000)
          });
        };
        let r2 = await call();
        if (!r2.ok) r2 = await call();
        const d2 = await r2.json();
        if (d2 && Array.isArray(d2.data)) {
          for (const row of d2.data) {
            const no = String(row.b_no || ""); if (!no) continue;
            const it = { stt: row.b_stt || "확인불가", cd: row.b_stt_cd || "", endDt: row.end_dt || "", taxType: row.tax_type || "" };
            items[no] = it;
            await kvSet("biz:v1:" + no, it, 86400);
          }
        }
      } catch (e) { /* 미확인 번호는 미표기(가짜정보 방지) */ }
    }
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=600");
    return res.status(200).json({ ok: true, items: items, src: "국세청 사업자등록 상태조회(실데이터)" });
  }

  /* 낙찰맵 사전 워밍(크론·수동) — 최근 30일 낙찰 수집해 26시간 캐시 */
  if (q.warmawards) {
    if (!KEY2) return res.status(200).json({ ok: false, error: "G2B_API_KEY2 미설정" });
    try {
      const w = await fetchAwardMap(30, true);
      /* 격일 스냅샷 갱신(지방재정365 전수 재수집·검증) — lofin 쪽에서 40시간 이내면 스킵 */
      let snap = null;
      try {
        const host = (req.headers && (req.headers["x-forwarded-host"] || req.headers.host)) || "www.xn--4k0b53xuva.com";
        const sr = await fetch("https://" + host + "/api/lofin?snaprefresh=1", { signal: AbortSignal.timeout(50000) });
        snap = await sr.json();
      } catch (e) { snap = { ok: false, error: String(e && e.message || e) }; }
      return res.status(200).json({ ok: true, awards: w.count, snapshot: snap });
    } catch (e) { return res.status(200).json({ ok: false, error: String(e.message || e) }); }
  }

  if (q.selfcheck) {
    const out = { ok: true, hasKey: !!KEY, ad: AD_BASE, ao: AO_BASE };
    if (KEY) {
      try {
        const t = await fetchAD("강진군", 7);
        out.ad_live = t.ok ? "✅ 정상 (" + t.items.length + "건)" : "❌ " + t.code + " " + (t.msg || "");
      } catch (e) { out.ad_live = "❌ " + String(e.message || e); }
      try {
        const t2 = await fetchAO("", 3);
        out.ao_live = t2.ok ? "✅ 정상 (" + t2.items.length + "건)" : "❌ " + t2.code + " " + (t2.msg || "");
      } catch (e) { out.ao_live = "❌ " + String(e.message || e); }
    }
    out.hasKey2 = !!KEY2;
    if (KEY2) {
      try {
        const qs = new URLSearchParams({ serviceKey: KEY2, pageNo: "1", numOfRows: "2", type: "json", inqryDiv: "1", inqryBgnDt: windows(7)[0][0], inqryEndDt: windows(7)[0][1] });
        const t3 = await callApi(AS_BASE + "/getScsbidListSttusServcPPSSrch?" + qs.toString());
        out.as_live = t3.ok ? "✅ 정상 (낙찰 " + (t3.total || t3.items.length) + "건/7일)" : "❌ " + t3.code + " " + (t3.msg || "");
      } catch (e) { out.as_live = "❌ " + String(e.message || e); }
    }
    out.hint = KEY ? "ad_live/ao_live 가 ❌면 data.go.kr에서 해당 서비스 활용신청 또는 키 확인 필요" : "⚠️ G2B_API_KEY 미설정 — Vercel 환경변수 추가 필요";
    return res.status(200).json(out);
  }
  if (!KEY) { res.setHeader("Cache-Control", "no-store"); return res.status(200).json({ configured: false, error: "G2B_API_KEY 미설정" }); }

  /* Redis 캐시 히트 시 즉시 응답 (콜드스타트에도 0.5초 내) */
  const cacheKey = "g2b:v6:" + region + ":" + days + ":" + vendor + ":" + (q.full ? "F" : "S") + ":" + (KEY2 ? "R" : "B");
  const cachedPayload = await kvGet(cacheKey);
  if (cachedPayload) {
    cachedPayload.cached = true;
    return res.status(200).json(cachedPayload);
  }

  try {
    let r = await fetchAD(region, days);
    /* ── 2026.7.1 전남광주통합특별시 출범: 나라장터 기관명 신·구 체계 혼재 대응 ──
       신형 검색 0건 → 구형(광주광역시/전라남도)으로, 구형 0건 → 신형으로 1회 재시도.
       (실측: 광주 구는 '전남광주통합특별시 X'로만 검색됨 — 전남 시군은 전환 시점에 따라 상이 가능) */
    if (r.ok && (!r.items || !r.items.length) && region) {
      let alt = null;
      const GJ = { "동구": 1, "서구": 1, "남구": 1, "북구": 1, "광산구": 1 };
      let m = region.match(/^전남광주통합특별시\s+(.+)$/);
      if (m) alt = (GJ[m[1]] ? "광주광역시 " : "전라남도 ") + m[1];
      else {
        m = region.match(/^(광주광역시|전라남도)\s+(.+)$/);
        if (m) alt = "전남광주통합특별시 " + m[2];
      }
      if (alt) {
        const r2 = await fetchAD(alt, days);
        if (r2.ok && r2.items && r2.items.length) { r = r2; }
      }
    }
    if (!r.ok) {
      const fb = await fetchAO(region, days);
      if (fb.ok) { r = fb; }
      else {
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).json({
          configured: true, region: region,
          error: "나라장터 응답 오류 — ad:[" + (r.code || "") + " " + (r.msg || "") + "] ao:[" + (fb.code || "") + " " + (fb.msg || "") + "]",
          hint: "공공데이터포털(data.go.kr)에서 이 인증키로 '나라장터 입찰공고정보서비스' 활용신청이 되어 있는지 확인하세요."
        });
      }
    }

    const bids = normalize(r.items);

    /* ── 실낙찰 연계(KEY2 설정 시): 공고번호 매칭으로 낙찰업체·낙찰금액 병합 ── */
    let awardHits = 0;
    if (KEY2 && bids.length) {
      try {
        /* 사용자 요청 경로는 캐시만 읽음(항상 빠름) — 수집은 크론 warmawards가 담당 */
        const aw = (await kvGet("g2b:awmap:v2:30")) || { map: {} };
        bids.forEach(function (b) {
          const hit = b.ntceNo && aw.map[b.ntceNo];
          if (hit) {
            if (!b.vendor) b.vendor = hit.v;
            if (hit.a > 0) { b.presmAmt = b.amount; b.amount = hit.a; b.awardAmt = hit.a; }  // 낙찰금액으로 교체(추정가는 presmAmt 보존)
            if (hit.biz) b.bizNo = hit.biz;   // 낙찰업체 사업자번호 — 국세청 상태검증(/api/bizstatus)용
            awardHits++;
          }
        });
      } catch (e) { /* 낙찰 연계 실패 시 조용히 공고 모드 유지 */ }
    }

    const filtered = vendor ? bids.filter(function (b) { return (b.vendor + b.org + b.title).indexOf(vendor) >= 0; }) : bids;

    // 연도별 집계
    const byYear = {};
    bids.forEach(function (b) {
      if (!b.year) return;
      if (!byYear[b.year]) byYear[b.year] = { year: b.year, count: 0, amount: 0 };
      byYear[b.year].count += 1;
      byYear[b.year].amount += b.amount;
    });
    const yearStats = Object.values(byYear).sort(function (a, b) { return b.year.localeCompare(a.year); });

    // 구분(공사/용역/물품)별 집계
    const byKind = {};
    bids.forEach(function (b) {
      const k = b.kind || "기타";
      if (!byKind[k]) byKind[k] = { kind: k, count: 0, amount: 0 };
      byKind[k].count += 1;
      byKind[k].amount += b.amount;
    });

    // 업체/기관별 집계 (입찰공고 단계라 낙찰업체는 비어있을 수 있음)
    const byVendor = {};
    bids.forEach(function (b) {
      const v = b.vendor || "";
      if (!v) return;
      if (!byVendor[v]) byVendor[v] = { vendor: v, count: 0, amount: 0, sutil: 0 };
      byVendor[v].count += 1;
      byVendor[v].amount += b.amount;
      if (/수의|단독/.test(b.method)) byVendor[v].sutil += 1;
    });
    const vendorStats = Object.values(byVendor).sort(function (a, b) { return b.amount - a.amount; });

    const nonUnit = filtered.filter(function (b) { return !b.unit; });
    const total = nonUnit.reduce(function (a, b) { return a + (b.amount || 0); }, 0);
    const amts = nonUnit.map(function (b) { return b.amount || 0; }).filter(function (v) { return v > 0; }).sort(function (a, b) { return a - b; });
    const med = amts.length ? amts[Math.floor(amts.length / 2)] : 0;
    const renoticeRemoved = filtered.reduce(function (a, b) { return a + (b.reCnt || 0); }, 0);
    const sutil = filtered.filter(function (b) { return /수의|단독/.test(b.method); }).length;

    const payload = {
      configured: true,
      region: region || "전국",
      vendor: vendor || null,
      days_window: days,
      total_count: r.total || bids.length,
      fetched_count: bids.length,
      filtered_count: filtered.length,
      bids: filtered.slice(0, (q.full ? 700 : 50)),
      stats: {
        total_amount: total,               /* 단가계약 제외·재공고 최신 1건 기준 */
        med_amount: med,                   /* 중위 금액(0원·단가 제외) */
        unit_count: filtered.length - nonUnit.length,   /* 단가계약 건수(별도) */
        renotice_removed: renoticeRemoved, /* 재공고·정정으로 접힌 중복 건수 */
        avg_amount: nonUnit.length ? Math.round(total / nonUnit.length) : 0,
        sutil_count: sutil,
        sutil_ratio: filtered.length ? +(sutil / filtered.length * 100).toFixed(1) : 0,
        vendor_count: Object.keys(byVendor).length
      },
      by_year: yearStats,
      by_kind: Object.values(byKind).sort(function (a, b) { return b.amount - a.amount; }),
      by_vendor: vendorStats.slice(0, (q.full ? 300 : 30)),
      partial: !!r.partial,              /* true = 원천 API가 창당 100건 초과로 일부만 수신 */
      fetched_at: new Date().toISOString(),
      src: "조달청 나라장터 · " + r.src + (awardHits ? " + 낙찰정보 연계(낙찰업체 " + awardHits + "건)" : ""),
      award_linked: awardHits
    };
    await kvSet(cacheKey, payload, CACHE_TTL);
    return res.status(200).json(payload);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ configured: true, error: String((e && e.message) || e), region: region });
  }
};
