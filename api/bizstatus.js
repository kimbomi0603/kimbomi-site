/* ============================================================
   🧾 국세청 사업자등록 상태조회 프록시 — Vercel 서버리스 함수
   경로: /api/bizstatus?b=1028142945,8191202555   (콤마구분, 최대 50개)
   응답: { ok, items: { "1028142945": { stt:"계속사업자", cd:"01", endDt:"", taxType:"..." }, ... } }
   - 데이터: 국세청 「사업자등록정보 진위확인 및 상태조회」 (api.odcloud.kr)
   - 인증: G2B_API_KEY2 (data.go.kr 일반 인증키 — Encoding/Decoding 자동 정규화)
   - 캐시: 사업자번호별 24시간 (국세청 데이터는 30분 주기 갱신이나 일 단위면 충분)
   - 용도: 낙찰업체 휴·폐업 검증 배지 (가짜정보 방지 — 실데이터만 표시)
   ============================================================ */

let KEY2 = process.env.G2B_API_KEY2 || "";
try { if (/%[0-9A-Fa-f]{2}/.test(KEY2)) KEY2 = decodeURIComponent(KEY2); } catch (e) {}

const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL || "";
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN || "";
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

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (!KEY2) { res.setHeader("Cache-Control", "no-store"); return res.status(200).json({ ok: false, error: "G2B_API_KEY2 미설정" }); }

  const q = (req.query && typeof req.query === "object") ? req.query : {};
  const raw = String(q.b || "").replace(/[^0-9,]/g, "");
  const nos = Array.from(new Set(raw.split(",").filter(function (x) { return /^\d{10}$/.test(x); }))).slice(0, 50);
  if (!nos.length) return res.status(200).json({ ok: false, error: "사업자번호(b) 필요 — 10자리 숫자, 콤마구분" });

  const items = {};
  const misses = [];
  for (const no of nos) {
    const c = await kvGet("biz:v1:" + no);
    if (c) items[no] = c; else misses.push(no);
  }

  if (misses.length) {
    try {
      const call = function () {
        return fetch("https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=" + encodeURIComponent(KEY2), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ b_no: misses }),
          signal: AbortSignal.timeout(12000)
        });
      };
      let r = await call();
      if (!r.ok) r = await call();   // 일시 오류(503 등) 1회 재시도
      const d = await r.json();
      if (d && Array.isArray(d.data)) {
        for (const row of d.data) {
          const no = String(row.b_no || "");
          if (!no) continue;
          const it = {
            stt: row.b_stt || "확인불가",
            cd: row.b_stt_cd || "",
            endDt: row.end_dt || "",
            taxType: row.tax_type || ""
          };
          items[no] = it;
          await kvSet("biz:v1:" + no, it, 86400);
        }
      }
    } catch (e) {
      /* 국세청 오류 시 조회된 캐시분만 반환 — 미확인 번호는 표기하지 않음(가짜정보 방지) */
    }
  }

  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=600");
  return res.status(200).json({ ok: true, items: items, src: "국세청 사업자등록 상태조회(실데이터)" });
};
