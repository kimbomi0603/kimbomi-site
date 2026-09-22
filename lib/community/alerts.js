/* 내 동네 변화 알림 구독 — /api/community?kind=alerts  (2026-09-23)
   저장: Redis 해시 kb_alerts (field = 이메일, value = JSON {cd,nm,tg,at,ok})
   흐름: POST {email,cd,nm,tg?} → 확인 메일(Resend) → GET ?confirm=TOKEN → ok:1
         GET ?unsub=TOKEN → 삭제.  토큰 = HMAC(email) 이라 DB에 따로 저장하지 않는다.
   발송: api/admin.js action=alerts (일 1회 cron) 가 data/index.json 의 집행률·기준일 변화를 비교해 메일/텔레그램으로 보낸다.
   [위험] RESEND_API_KEY·MAIL_FROM 이 없으면 확인 메일을 못 보내므로 구독이 완료되지 않는다 → 응답에 configured:false 로 알린다.
*/
"use strict";
const crypto = require("crypto");
const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL || "";
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN || "";
const RESEND = process.env.RESEND_API_KEY || "";
const FROM = process.env.MAIL_FROM || "onboarding@resend.dev";
const SECRET = process.env.ALERT_SECRET || process.env.CRON_SECRET || process.env.ADMIN_KEY || "kb-alerts";
const SITE = "https://www.xn--4k0b53xuva.com";
const HKEY = "kb_alerts";

async function redis(cmd) {
  const r = await fetch(RURL, { method: "POST", headers: { Authorization: "Bearer " + RTOK, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  const d = await r.json(); if (!r.ok) throw new Error("redis " + r.status); return d.result;
}
function token(email) { return crypto.createHmac("sha256", SECRET).update(email.toLowerCase()).digest("hex").slice(0, 32); }
function safeEq(a, b) { try { return crypto.timingSafeEqual(Buffer.from(String(a)), Buffer.from(String(b))); } catch (e) { return false; } }
function readBody(req) {
  return new Promise(function (resolve) {
    if (req.body !== undefined && req.body !== null) { resolve(req.body); return; }
    let d = ""; req.on("data", c => d += c); req.on("end", () => resolve(d)); req.on("error", () => resolve(""));
  });
}
async function sendMail(to, subject, html) {
  if (!RESEND) return false;
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + RESEND, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }), signal: AbortSignal.timeout(8000) });
  return r.ok;
}
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function page(title, body) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<body style="font-family:'Noto Sans KR',sans-serif;background:#FBF7EE;color:#1C1B18;margin:0;padding:40px 20px"><div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #E6DFCF;padding:28px 26px">
<h1 style="font-size:20px;margin:0 0 10px">${esc(title)}</h1><p style="line-height:1.7;margin:0 0 18px">${body}</p><a href="${SITE}/budget365.html" style="color:#0F5C46;font-weight:700">우리동네365로 돌아가기 →</a></div></body>`;
}

module.exports = async function (req, res) {
  res.setHeader("Cache-Control", "no-store");
  const q = req.query || {};
  if (!RURL || !RTOK) return res.status(200).json({ ok: false, configured: false });

  // 확인 / 해지 링크 (메일에서 클릭)
  if (req.method === "GET" && (q.confirm || q.unsub)) {
    const email = String(q.e || "").toLowerCase().trim();
    const t = String(q.confirm || q.unsub);
    if (!email || !safeEq(t, token(email))) { res.setHeader("Content-Type", "text/html; charset=utf-8"); return res.status(400).send(page("링크가 올바르지 않습니다", "주소가 잘렸거나 이미 처리된 링크입니다.")); }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (q.unsub) { await redis(["HDEL", HKEY, email]); return res.status(200).send(page("알림을 해지했습니다", "더 이상 알림 메일을 보내지 않습니다. 언제든 다시 신청할 수 있습니다.")); }
    const raw = await redis(["HGET", HKEY, email]); if (!raw) return res.status(404).send(page("신청 내역이 없습니다", "먼저 우리동네365에서 알림을 신청해 주세요."));
    const o = JSON.parse(raw); o.ok = 1; o.confirmed_at = Date.now();
    await redis(["HSET", HKEY, email, JSON.stringify(o)]);
    return res.status(200).send(page("알림 신청이 완료됐습니다", `<b>${esc(o.nm)}</b>의 집행률·자료 기준일이 바뀌면 이 주소로 한 줄 알려드립니다. 하루 1회를 넘지 않습니다.`));
  }

  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  let body = await readBody(req); if (typeof body === "string") { try { body = JSON.parse(body || "{}"); } catch (e) { body = {}; } }
  if (String(body.hp || "").trim()) return res.status(200).json({ ok: true, item: null });   // 허니팟
  const email = String(body.email || "").toLowerCase().trim().slice(0, 120);
  const cd = String(body.cd || "").replace(/\D/g, "").slice(0, 7);
  const nm = String(body.nm || "").trim().slice(0, 40);
  const tg = String(body.tg || "").replace(/[^\d-]/g, "").slice(0, 20);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || cd.length !== 7 || !nm) return res.status(400).json({ ok: false, error: "bad input" });

  // IP 기준 하루 10회 제한
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "0";
  const rk = "kb_alerts_rl:" + crypto.createHash("sha1").update(ip).digest("hex").slice(0, 12);
  const n = await redis(["INCR", rk]); if (n === 1) await redis(["EXPIRE", rk, 86400]); if (n > 10) return res.status(429).json({ ok: false, error: "too many" });

  const prev = await redis(["HGET", HKEY, email]); const po = prev ? JSON.parse(prev) : null;
  const o = { cd, nm, tg, at: Date.now(), ok: po && po.ok && po.cd === cd ? 1 : 0, last: po && po.cd === cd ? po.last : null };
  await redis(["HSET", HKEY, email, JSON.stringify(o)]);
  if (o.ok) return res.status(200).json({ ok: true, configured: true, state: "already" });
  const t = token(email);
  const link = `${SITE}/api/community?kind=alerts&confirm=${t}&e=${encodeURIComponent(email)}`;
  const sent = await sendMail(email, `[우리동네365] ${nm} 변화 알림 신청 확인`,
    `<div style="font-family:'Noto Sans KR',sans-serif;line-height:1.7"><p><b>${esc(nm)}</b>의 예산 집행률과 자료 기준일이 바뀔 때 알려드리는 알림을 신청하셨습니다.</p><p>아래 버튼을 누르면 신청이 완료됩니다.</p>
     <p><a href="${link}" style="display:inline-block;background:#0F5C46;color:#fff;padding:10px 18px;text-decoration:none;font-weight:700">알림 신청 확인</a></p>
     <p style="color:#777;font-size:12px">본인이 신청한 것이 아니면 이 메일을 무시하세요. 우리동네365 · 김보미.com</p></div>`);
  return res.status(200).json({ ok: true, configured: sent, state: sent ? "sent" : "mail_unavailable" });
};
