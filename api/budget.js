/* ============================================================
   재정 365 — 실제 공공데이터 API (Vercel 서버리스 함수)
   경로:  /api/budget   (index.html 의 BUDGET_API 와 동일, 같은 도메인)
   ------------------------------------------------------------
   지방재정365 OpenAPI · 재정자립도(결산) FNCST 스펙에 맞춤.
     요청주소: https://www.lofin365.go.kr/lf/hub/FNCST
     인자    : Key, Type=json, pIndex, pSize, fyr(회계연도)
     출력    : laf_hg_nm(자치단체명), wa_laf_hg_nm(지역명),
               pfa_amt2(세입결산규모), pfa_amt3(자체수입·개편후),
               rate2(재정자립도·개편후), rate1/pfa_amt1(개편전) 등

   ▣ 설정값 (Vercel 환경 변수)
       DATA_GO_KR_KEY = 지방재정365 인증키 (필수)
       UPSTREAM_URL   = https://www.lofin365.go.kr/lf/hub/FNCST (선택·기본값)

   ▣ 점검
     - /api/budget?selfcheck=1  → 키/엔드포인트 설정 상태
     - /api/budget?debug=1      → 데이터가 있는 연도의 원본 응답(필드 확인)
     - /api/budget?zone=ALL     → 화면용 {b,e,s,f}

   ▣ 정확도
     - 전국 재정자립도 s = Σ자체수입(pfa_amt3) ÷ Σ세입결산규모(pfa_amt2) × 100
       (단순 평균이 아니라 '재정자립도 정의' 그대로의 집계 → 통상 공시값에 부합)
     - e(집행률)·f(분야별)는 이 데이터셋엔 없어 추정 기본값.
   ============================================================ */

const DEFAULT_UPSTREAM = "https://www.lofin365.go.kr/lf/hub/FNCST";
const EST_EXEC = 68.4;
const EST_FIELDS = [34, 16, 15, 12, 12, 11];

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");

  const q = (req.query && typeof req.query === "object") ? req.query : {};
  const zone = q.zone || "ALL";
  const KEY = process.env.DATA_GO_KR_KEY || "";
  const UPSTREAM = process.env.UPSTREAM_URL || DEFAULT_UPSTREAM;

  if (q.selfcheck) {
    return res.status(200).json({
      ok: true, hasKey: !!KEY, upstreamSet: true, upstream: UPSTREAM,
      hint: KEY ? "설정 완료. ?zone=ALL 로 실데이터를 확인하세요." : "환경변수 DATA_GO_KR_KEY(지방재정365 인증키)를 설정하세요.",
    });
  }

  try {
    if (!KEY) return res.status(500).json({ error: "DATA_GO_KR_KEY 미설정(Vercel 환경변수)" });

    // 회계연도: 요청값 → 없으면 최신부터 내려가며 데이터 있는 연도 탐색
    const yNow = new Date().getFullYear();
    const years = q.year ? [String(q.year)] : [yNow, yNow - 1, yNow - 2, yNow - 3, yNow - 4].map(String);

    let rows = null, usedYear = null, lastMsg = "", dbgRaw = null, dbgYear = null;
    for (const fyr of years) {
      const url = buildUrl(UPSTREAM, KEY, fyr, zone);
      const r = await fetch(url);
      if (!r.ok) { lastMsg = "UPSTREAM " + r.status; continue; }
      let raw;
      try { raw = await r.json(); } catch (e) { lastMsg = "JSON 파싱 실패(인증키/형식 확인)"; continue; }
      const ex = extractRows(raw);
      if (ex.rows && ex.rows.length) { rows = ex.rows; usedYear = fyr; dbgRaw = raw; dbgYear = fyr; break; }
      if (!dbgRaw) { dbgRaw = raw; dbgYear = fyr; }   // 데이터 없어도 첫 응답은 기억(디버그용)
      lastMsg = ex.msg || ex.code || "데이터 없음";
    }

    // 디버그: 데이터가 있는 연도의 원본을 보여줌(없으면 첫 응답)
    if (q.debug) return res.status(200).json({ upstream: UPSTREAM, fyr: dbgYear, hasRows: !!(rows && rows.length), rowCount: rows ? rows.length : 0, sample: dbgRaw });

    if (!rows || !rows.length) return res.status(200).json({ error: "데이터 없음 — " + (lastMsg || "연도/인증키 확인") });

    const out = MAP_FNCST(rows, zone);
    out.updated = new Date().toISOString();
    out.zone = zone;
    out.fyr = usedYear;
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};

/* 호출 URL 구성 (지방재정365 / data.go.kr 모두 대응) */
function buildUrl(base, key, fyr, zone) {
  const isLofin = /lofin365\.go\.kr/.test(base);
  const p = new URLSearchParams();
  if (isLofin) {
    p.set("Key", key);
    p.set("Type", "json");
    p.set("pIndex", "1");
    p.set("pSize", "1000");
    p.set("fyr", fyr);
    if (zone && zone !== "ALL") p.set("laf_hg_nm", zone); // 자치단체명
  } else {
    p.set("serviceKey", key);
    p.set("returnType", "JSON");
    p.set("type", "JSON");
    p.set("page", "1");
    p.set("perPage", "1000");
    p.append("cond[회계연도::EQ]", fyr);
    if (zone && zone !== "ALL") p.append("cond[자치단체명::EQ]", zone);
  }
  return base + (base.includes("?") ? "&" : "?") + p.toString();
}

/* 다양한 응답 래퍼에서 row 배열 + 결과코드/메시지 추출
   - 데이터:   { FNCST:[ {head:[..,{RESULT:{CODE,MESSAGE}}]}, {row:[...]} ] }
   - 무데이터: { RESULT:[ {CODE:"INFO-200", MESSAGE:"해당하는 데이터는 없습니다."} ] } */
function extractRows(raw) {
  if (!raw || typeof raw !== "object") return { rows: [] };
  if (Array.isArray(raw.data)) return { rows: raw.data };
  if (Array.isArray(raw.items)) return { rows: raw.items };

  const readResult = (R) => { if (!R) return null; const o = Array.isArray(R) ? R[0] : R; return o ? { code: o.CODE, msg: o.MESSAGE } : null; };
  let rows = null, code = null, msg = null;

  for (const k of Object.keys(raw)) {
    const v = raw[k];
    if (Array.isArray(v)) {
      for (const blk of v) {
        if (blk && blk.row) rows = blk.row;
        if (blk && blk.head) for (const h of blk.head) { const rr = readResult(h && h.RESULT); if (rr) { code = rr.code; msg = rr.msg; } }
        if (blk && blk.RESULT) { const rr = readResult(blk.RESULT); if (rr) { code = rr.code; msg = rr.msg; } }
      }
    }
  }
  const top = readResult(raw.RESULT); if (top) { code = code || top.code; msg = msg || top.msg; }
  if (rows || code || msg) return { rows: rows || [], code, msg };

  if (raw.response && raw.response.body) {
    const it = raw.response.body.items;
    return { rows: Array.isArray(it) ? it : (it && it.item ? [].concat(it.item) : []) };
  }
  return { rows: [] };
}

/* FNCST → 화면 모델 {b,e,s,f} 매핑 */
function MAP_FNCST(rows, zone) {
  const num = (x) => { const n = Number(String(x == null ? "" : x).replace(/[, ]/g, "")); return isFinite(n) ? n : 0; };
  const own  = (r) => num(r.pfa_amt3) || num(r.pfa_amt1);   // 자체수입(개편후 우선)
  const tot  = (r) => num(r.pfa_amt2);                      // 세입결산규모
  const rate = (r) => num(r.rate2) || num(r.rate1);         // 재정자립도(원본 컬럼·보조용)
  const isSummary = (r) => /전국|합계|총계|소계|평균/.test(String(r.laf_hg_nm || r.wa_laf_hg_nm || ""));
  // 시·도 17곳 식별: 광역단체명만 매칭 (시·군·구 ~시/~군/~구 제외)
  const SIDO_RE = /^(?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원도|강원특별자치도|충청북도|충청남도|전라북도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)$/;
  const isSidoRow = (r) => SIDO_RE.test(String(r.laf_hg_nm || "").trim());
  const isNat = (zone === "ALL");

  // 자립도(%) = 자체수입 / 세입결산규모 × 100 (정의 그대로). 불가 시 원본 rate 사용.
  let s, sumTot, basis;
  if (!isNat) {
    // 특정 자치단체: 자체수입/세입 (정의), 불가 시 원본 rate
    const r = rows[0] || {};
    s = (tot(r) > 0 && own(r) > 0) ? +(own(r) / tot(r) * 100).toFixed(1) : rate(r);
    sumTot = tot(r);
    basis = "지역행";
  } else {
    // 전국 평균 재정자립도 산출 — 행안부 공시(약 45%)에 근접하도록 우선순위 설정
    //   ① 데이터셋에 '전국' 요약행이 있으면 그 값 (순계 공시값)
    //   ② 시·도 17곳만 가중평균 (광역+기초 중복 합산 방지 → 공시 평균에 근접)
    //   ③ 그래도 안 되면 전체 개별 자치단체 합산
    //   ④ 최후 폴백: 단순평균
    const natRow = rows.find((r) => /전국/.test(String(r.laf_hg_nm || r.wa_laf_hg_nm || "")));
    const sidoRows = rows.filter(isSidoRow);
    const indiv = rows.filter((r) => !isSummary(r));
    const sumSidoOwn = sidoRows.reduce((a, r) => a + own(r), 0);
    const sumSidoTot = sidoRows.reduce((a, r) => a + tot(r), 0);
    const aggOwn = indiv.reduce((a, r) => a + own(r), 0);
    const aggTot = indiv.reduce((a, r) => a + tot(r), 0);

    if (natRow && rate(natRow) > 0) {
      s = rate(natRow); basis = "전국요약행(순계 공시값)";
    } else if (sidoRows.length >= 10 && sumSidoTot > 0 && sumSidoOwn > 0) {
      s = +(sumSidoOwn / sumSidoTot * 100).toFixed(1);
      basis = "시·도 " + sidoRows.length + "곳 가중평균(순계 근사)";
    } else if (aggTot > 0 && aggOwn > 0) {
      s = +(aggOwn / aggTot * 100).toFixed(1); basis = "개별 자치단체 집계(총계)";
    } else {
      const base = indiv.length ? indiv : rows;
      const rs = base.map(rate).filter((v) => v > 0);
      s = rs.length ? +(rs.reduce((a, v) => a + v, 0) / rs.length).toFixed(1) : 0;
      basis = "단순평균";
    }
    // 총예산은 전체 자치단체 합산(시·도+시·군·구) 유지 — 통상 표시 규모
    sumTot = (natRow && tot(natRow) > 0) ? tot(natRow) : aggTot;
  }

  // 총예산(세입결산규모) → 조원, 단위 자동 보정
  let b = sumTot / 1e12;
  if (isNat) { let g = 0; while (b > 0 && b < 50 && g < 6) { b *= 1000; g++; } }
  else { let g = 0; while (b > 0 && b < 0.02 && g < 6) { b *= 1000; g++; } }

  return {
    b: +(+b).toFixed(1),     // 총예산(세입결산규모, 조원)
    e: EST_EXEC,             // 집행률(추정 — 데이터셋에 없음)
    s: +(+s).toFixed(1),     // 재정자립도(%) — 실데이터
    f: EST_FIELDS.slice(),   // 분야별(추정 — 데이터셋에 없음)
    basis: basis,            // 계산 방식(검증용)
    src: "lofin365 FNCST(재정자립도)",
  };
}
