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
        if (r.ok) r.items.forEach(function (it) { if (!it.bsnsDivNm) it.bsnsDivNm = kindNm; });
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
  return { ok: true, items: items, total: okOnes.reduce(function (a, x) { return a + (x.total || 0); }, 0), src: "나라장터 입찰공고정보서비스(ad)" };
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
async function fetchAwardMap(days) {
  const capped = Math.min(days, 60);          // 낙찰 연계는 최근 60일까지
  /* 전역(지역 무관) 낙찰맵 — 1시간 캐시로 두 번째 요청부터 즉시 */
  const ck = "g2b:awmap:v1:" + capped;
  const cached = await kvGet(ck);
  if (cached && cached.map) return cached;
  const wins = windows(capped);               // 30일 단위 창
  const jobs = [];
  for (const win of wins) {
    for (const op of AS_OPS) {
      for (let p = 1; p <= 4; p++) {
        const q = new URLSearchParams({
          serviceKey: KEY2, pageNo: String(p), numOfRows: "999", type: "json",
          inqryDiv: "1", inqryBgnDt: win[0], inqryEndDt: win[1]
        });
        jobs.push(callApi(AS_BASE + "/" + op + "?" + q.toString()).catch(function () { return { ok: false }; }));
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
  await kvSet(ck, out, 3600);
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

function normalize(items) {
  return dedup(items).map(function (it) {
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
      sutil: /수의|단독|1인|협상/.test(it.sucsfbidMthdNm || it.cntrctCnclsMthdNm || it.bidMethdNm || it.bidwinrDcsnMthdNm || "")
    };
  }).sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");

  const q = (req.query && typeof req.query === "object") ? req.query : {};
  const region = (q.region || "").toString().trim();
  const vendor = (q.vendor || "").toString().trim();
  const days = Math.max(1, Math.min(180, parseInt(q.days || 90, 10)));

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
    out.hint = KEY ? "ad_live/ao_live 가 ❌면 data.go.kr에서 해당 서비스 활용신청 또는 키 확인 필요" : "⚠️ G2B_API_KEY 미설정 — Vercel 환경변수 추가 필요";
    return res.status(200).json(out);
  }
  if (!KEY) { res.setHeader("Cache-Control", "no-store"); return res.status(200).json({ configured: false, error: "G2B_API_KEY 미설정" }); }

  /* Redis 캐시 히트 시 즉시 응답 (콜드스타트에도 0.5초 내) */
  const cacheKey = "g2b:v4:" + region + ":" + days + ":" + vendor + ":" + (q.full ? "F" : "S") + ":" + (KEY2 ? "R" : "B");
  const cachedPayload = await kvGet(cacheKey);
  if (cachedPayload) {
    cachedPayload.cached = true;
    return res.status(200).json(cachedPayload);
  }

  try {
    let r = await fetchAD(region, days);
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
        const aw = await fetchAwardMap(days);
        bids.forEach(function (b) {
          const hit = b.ntceNo && aw.map[b.ntceNo];
          if (hit) {
            if (!b.vendor) b.vendor = hit.v;
            if (hit.a > 0) { b.presmAmt = b.amount; b.amount = hit.a; b.awardAmt = hit.a; }  // 낙찰금액으로 교체(추정가는 presmAmt 보존)
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

    const total = filtered.reduce(function (a, b) { return a + (b.amount || 0); }, 0);
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
        total_amount: total,
        avg_amount: filtered.length ? Math.round(total / filtered.length) : 0,
        sutil_count: sutil,
        sutil_ratio: filtered.length ? +(sutil / filtered.length * 100).toFixed(1) : 0,
        vendor_count: Object.keys(byVendor).length
      },
      by_year: yearStats,
      by_kind: Object.values(byKind).sort(function (a, b) { return b.amount - a.amount; }),
      by_vendor: vendorStats.slice(0, (q.full ? 300 : 30)),
      partial: !!r.partial,
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
