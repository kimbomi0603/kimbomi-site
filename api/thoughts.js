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
      const items = (raw || []).map(function (s) { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
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
