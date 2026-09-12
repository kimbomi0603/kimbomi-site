/* 생각 나누기 공유 게시판 — /api/thoughts
   저장소: Redis(Upstash) REST API. 아래 환경변수 중 한 세트가 있으면 동작합니다.
     KV_REST_API_URL / KV_REST_API_TOKEN               (Vercel 마켓플레이스 Redis 연결 시)
     UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (Upstash 직접 사용 시)
   진단:  GET /api/thoughts?selfcheck=1  → {configured:true|false}
   조회:  GET /api/thoughts             → {items:[...최신순]}
   등록:  POST /api/thoughts {name,region,msg}
*/
const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL || "";
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN || "";
const LKEY = "kb_thoughts";
const MAX = 500;

async function redis(cmd) {
  const r = await fetch(RURL, {
    method: "POST",
    headers: { Authorization: "Bearer " + RTOK, "Content-Type": "application/json" },
    body: JSON.stringify(cmd)
  });
  const d = await r.json();
  if (!r.ok) throw new Error("redis " + r.status);
  return d.result;
}
function clean(s, n) {
  return String(s == null ? "" : s).slice(0, n).trim();
}
/* 공개용 이름 마스킹: '홍길동' → '홍*동', '홍길' → '홍*', 영문/긴 이름도 가운데 마스킹 */
function maskName(s) {
  s = String(s == null ? "" : s).trim();
  if (s.length <= 1) return s;
  if (s.length === 2) return s[0] + "*";
  return s[0] + "*".repeat(s.length - 2) + s[s.length - 1];
}
/* 본문 내 휴대폰/전화번호 패턴 비공개 처리 */
function maskPhone(s) {
  return String(s == null ? "" : s)
    .replace(/01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g, "(연락처 비공개)")
    .replace(/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g, "(연락처 비공개)");
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const configured = !!(RURL && RTOK);
  const Q = (req.query && typeof req.query === "object") ? req.query : {};

  if (Q.selfcheck) return res.status(200).json({ ok: true, configured: configured });

  if (req.method === "GET") {
    if (!configured) return res.status(200).json({ ok: true, configured: false, items: [] });
    try {
      const raw = await redis(["LRANGE", LKEY, "0", String(MAX - 1)]);
      const items = (raw || []).map(function (s) { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean)
        /* 공개 목록 개인정보 보호: 실명 일부 마스킹 + 본문 내 전화번호 비공개 처리 (원본은 그대로 저장되며 관리자 화면에서는 전체 열람) */
        .map(function (it) {
          const o = { name: maskName(it.name), region: it.region, msg: maskPhone(it.msg), date: it.date };
          return o;
        });
      return res.status(200).json({ ok: true, configured: true, count: items.length, items: items });
    } catch (e) {
      return res.status(200).json({ ok: false, configured: true, error: "read", items: [] });
    }
  }

  if (req.method === "POST") {
    if (!configured) return res.status(200).json({ ok: false, configured: false });
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || typeof body !== "object") body = {};
    const msg = clean(body.msg, 1000);
    if (!msg) return res.status(400).json({ ok: false, error: "empty" });
    const ip = ((req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.headers["x-real-ip"] || "anon";
    try {
      const c = await redis(["INCR", "rl:th:" + ip]);
      if (c === 1) await redis(["EXPIRE", "rl:th:" + ip, "600"]);
      if (c > 5) return res.status(200).json({ ok: false, configured: true, error: "rate" });
    } catch (e) {}
    const item = { name: clean(body.name, 20), region: clean(body.region, 20), msg: msg, date: new Date().toISOString() };
    try {
      await redis(["LPUSH", LKEY, JSON.stringify(item)]);
      await redis(["LTRIM", LKEY, "0", String(MAX - 1)]);
      return res.status(200).json({ ok: true, configured: true, item: item });
    } catch (e) {
      return res.status(200).json({ ok: false, configured: true, error: "write" });
    }
  }
  return res.status(405).json({ ok: false, error: "method" });
};
