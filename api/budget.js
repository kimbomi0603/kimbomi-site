/* ============================================================
   재정 365 — 실제 공공데이터 API (Vercel 서버리스 함수)
   경로:  /api/budget   (index.html 의 BUDGET_API 와 동일, 같은 도메인)
   ------------------------------------------------------------
   지방재정365 OpenAPI · 재정자립도(결산) FNCST 스펙에 맞춤.
     요청주소: https://www.lofin365.go.kr/lf/hub/FNCST
     인자    : Key, Type=json, pIndex, pSize, fyr(회계연도)
     출력    : laf_hg_nm, wa_laf_hg_nm, rate2(재정자립도), pfa_amt2(세입결산규모) 등
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

    const yNow = new Date().getFullYear();
    const years = q.year ? [String(q.year)] : [yNow, yNow - 1, yNow - 2, yNow - 3].map(String);

    let rows = null, lastMsg = "";
    for (const fyr of years) {
      const url = buildUrl(UPSTREAM, KEY, fyr, zone);
      const r = await fetch(url);
      if (!r.ok) { lastMsg = "UPSTREAM " + r.status; continue; }
      let raw;
      try { raw = await r.json(); } catch (e) { lastMsg = "JSON 파싱 실패(인증키/형식 확인)"; continue; }
      if (q.debug) return res.status(200).json({ upstream: UPSTREAM, fyr, sample: raw });
      const ex = extractRows(raw);
      if (ex.code && ex.code !== "INFO-000" && (!ex.rows || !ex.rows.length)) { lastMsg = ex.msg || ex.code; continue; }
      if (ex.rows && ex.rows.length) { rows = ex.rows; break; }
      lastMsg = ex.msg || "데이터 없음";
    }

    if (!rows || !rows.length) return res.status(200).json({ error: "데이터 없음 — " + (lastMsg || "연도/인증키 확인") });

    const out = MAP_FNCST(rows, zone);
    out.updated = new Date().toISOString();
    out.zone = zone;
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};

function buildUrl(base, key, fyr, zone) {
  const isLofin = /lofin365\.go\.kr/.test(base);
  const p = new URLSearchParams();
  if (isLofin) {
    p.set("Key", key);
    p.set("Type", "json");
    p.set("pIndex", "1");
    p.set("pSize", "1000");
    p.set("fyr", fyr);
    if (zone && zone !== "ALL") p.set("laf_hg_nm", zone);
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

function extractRows(raw) {
  if (raw && Array.isArray(raw.data)) return { rows: raw.data };
  if (raw && Array.isArray(raw.items)) return { rows: raw.items };
  if (raw && typeof raw === "object") {
    for (const k of Object.keys(raw)) {
      const v = raw[k];
      if (Array.isArray(v)) {
        let rows = null, code = null, msg = null;
        for (const blk of v) {
          if (blk && blk.row) rows = blk.row;
          if (blk && blk.head) for (const h of blk.head) if (h && h.RESULT) { code = h.RESULT.CODE; msg = h.RESULT.MESSAGE; }
        }
        if (rows || code) return { rows: rows || [], code, msg };
      }
    }
    if (raw.RESULT) return { rows: [], code: raw.RESULT.CODE, msg: raw.RESULT.MESSAGE };
    if (raw.response && raw.response.body) {
      const it = raw.response.body.items;
      const rows = Array.isArray(it) ? it : (it && it.item ? [].concat(it.item) : []);
      return { rows };
    }
  }
  return { rows: [] };
}

function MAP_FNCST(rows, zone) {
  const num = (x) => { const n = Number(String(x == null ? "" : x).replace(/[, ]/g, "")); return isFinite(n) ? n : 0; };
  const rate = (r) => num(r.rate2) || num(r.rate1);
  const amt  = (r) => num(r.pfa_amt2);

  const isNat = (zone === "ALL");
  const natRow = rows.find((r) => /전국|합계|전체/.test(String(r.laf_hg_nm || r.wa_laf_hg_nm || "")));

  let s, totalAmt, basisRows;
  if (isNat && natRow) {
    s = rate(natRow); totalAmt = amt(natRow); basisRows = [natRow];
  } else if (isNat) {
    const rs = rows.map(rate).filter((v) => v > 0);
    s = rs.length ? rs.reduce((a, v) => a + v, 0) / rs.length : 0;
    totalAmt = rows.reduce((a, r) => a + amt(r), 0); basisRows = rows;
  } else {
    const row = rows[0]; s = rate(row); totalAmt = amt(row); basisRows = [row];
  }

  let b = totalAmt / 1e12;
  const big = basisRows.length >= 30 || isNat;
  if (big) { let g = 0; while (b > 0 && b < 50 && g < 6) { b *= 1000; g++; } }
  else { let g = 0; while (b > 0 && b < 0.05 && g < 6) { b *= 1000; g++; } }

  return {
    b: +(+b).toFixed(1),
    e: EST_EXEC,
    s: +(+s).toFixed(1),
    f: EST_FIELDS.slice(),
    src: "lofin365 FNCST(재정자립도)",
  };
}
