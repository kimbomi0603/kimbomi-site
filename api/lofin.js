/* ============================================================
   대한민국 재정 365 — 지방재정365 OpenAPI 보안 프록시
   경로: /api/lofin  (Vercel 서버리스 함수, CommonJS)
   ------------------------------------------------------------
   브라우저는 lofin365.go.kr 을 직접 호출할 수 없고(CORS 차단),
   인증키를 공개 HTML 에 넣으면 노출됩니다. 이 함수가 서버에서 대신 호출합니다.

   환경변수: DATA_GO_KR_KEY  (기존 budget.js 와 동일 키 재사용)
   임의 허브코드(영문대문자+숫자 3~8자리)를 받아 프록시하므로
   JFIED·EJAEE·ARBGT·DFGDGG·UCMZQA·YCEHF·NBRILV·BGGCD 등 전부 호출 가능.
   호출 예: /api/lofin?hub=JFIED&fyr=2024&pSize=400
   ============================================================ */

const HUB_BASE = "https://www.lofin365.go.kr/lf/hub";

/* 🚨 인증키/데이터 장애 관리자 경보 — Redis로 6시간 디바운스, Resend 메일 발송 */
async function kbAlertAdmin(subject, detail) {
  try {
    const RESEND = process.env.RESEND_API_KEY || "";
    const AURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL || "";
    const ATOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN || "";
    if (!RESEND || !AURL) return;
    const g = await fetch(AURL, { method: "POST", headers: { Authorization: "Bearer " + ATOK, "Content-Type": "application/json" }, body: JSON.stringify(["SET", "rl:lofinalert", "1", "NX", "EX", "21600"]), signal: AbortSignal.timeout(3000) });
    const gd = await g.json();
    if (!gd || gd.result !== "OK") return;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + RESEND, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || "onboarding@resend.dev",
        to: [process.env.MAIL_TO || "kimbomi891204@gmail.com"],
        subject: "\ud83d\udea8 " + subject,
        html: "<b>\uc0ac\uc774\ud2b8 \uc2e4\ub370\uc774\ud130 \uc5f0\ub3d9 \uc7a5\uc560 \uac10\uc9c0</b><p>" + String(detail).replace(/</g, "&lt;") + "</p><p>\uc870\uce58: lofin365.go.kr\uc5d0\uc11c \uc778\uc99d\ud0a4 \ud655\uc778 \u2192 Vercel \ud658\uacbd\ubcc0\uc218 DATA_GO_KR_KEY \uad50\uccb4 \u2192 Redeploy</p><p style=\"color:#888\">\uae40\ubcf4\ubbf8.com \uc790\ub3d9 \uac10\uc2dc (6\uc2dc\uac04 \ub2f9 1\ud68c \ubc1c\uc1a1)</p>"
      }),
      signal: AbortSignal.timeout(6000)
    });
  } catch (e) {}
}

const HUB_RE = /^[A-Z0-9]{3,8}$/;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const noStore = () => res.setHeader("Cache-Control", "no-store");
  const KEY = process.env.DATA_GO_KR_KEY || process.env.LOFIN365_API_KEY || "";
  const q = (req.query && typeof req.query === "object") ? req.query : {};

  if (q.selfcheck) { noStore(); return res.status(200).json({ ok: true, hasKey: !!KEY }); }
  if (!KEY) { noStore(); return res.status(500).json({ ok: false, error: "DATA_GO_KR_KEY 미설정(Vercel 환경변수)" }); }

  /* ── Redis(KV) — 스냅샷 저장용 ── */
  const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL || "";
  const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN || "";
  async function kvGet(k){ if(!RURL) return null; try{ const r=await fetch(RURL,{method:"POST",headers:{Authorization:"Bearer "+RTOK,"Content-Type":"application/json"},body:JSON.stringify(["GET",k]),signal:AbortSignal.timeout(4000)}); const d=await r.json(); return d&&d.result?JSON.parse(d.result):null; }catch(e){ return null; } }
  async function kvSet(k,o,ttl){ if(!RURL) return; try{ const args=["SET",k,JSON.stringify(o)]; if(ttl) args.push("EX",String(ttl)); await fetch(RURL,{method:"POST",headers:{Authorization:"Bearer "+RTOK,"Content-Type":"application/json"},body:JSON.stringify(args),signal:AbortSignal.timeout(4000)}); }catch(e){} }
  async function hubRows(hub,fyr){
    const pp=new URLSearchParams({Key:KEY,Type:"json",pIndex:"1",pSize:"400",fyr:String(fyr)});
    const r=await fetch(HUB_BASE+"/"+hub+"?"+pp.toString(),{signal:AbortSignal.timeout(20000)});
    const j=JSON.parse(await r.text());
    const top=j[hub]; return (top&&top[1]&&top[1].row)||[];
  }

  /* ── 스냅샷 제공: /api/lofin?snap=1 — 프론트가 임베드 상수보다 최신·완전한 갱신본을 읽음 ── */
  if (q.snap) {
    const s = await kvGet("snap:fiscal:v1");
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json(s || { ok: false, reason: "스냅샷 미생성 — 임베드 실데이터가 기본으로 사용됩니다" });
  }

  /* ── 스냅샷 갱신: /api/lofin?snaprefresh=1 — 라이브 전수 수집 → 완전성 검증 통과 시에만 교체.
        실패·불완전 시 기존 스냅샷 유지(임의 숫자 대체 절대 금지) ── */
  if (q.snaprefresh) {
    noStore();
    const last = await kvGet("snap:fiscal:last");
    const now = Date.now();
    if (!q.force && last && (now - last.ts) < 40*3600*1000) {
      return res.status(200).json({ ok: true, skipped: true, reason: "최근 갱신됨(이틀 주기)", lastAt: new Date(last.ts).toISOString() });
    }
    const FYR = 2024;
    const HUBS = { M_FDOST:"FDOST", M_HEDFC:"HEDFC", M_UNIST:"UNIST", M_GAEJG:"GAEJG", M_DDJAB:"DDJAB", M_DADBC:"DADBC", M_BJHJB:"BJHJB", M_EAGGD:"EAGGD", M_GAECF:"GAECF", M_FBHIF:"FBHIF", M_ELYET:"ELYET", M_GJFHC:"GJFHC", M_HCDIB:"HCDIB", SR:"JFIED", AU:"EJAEE", EXEC:"AJGCF", ACC:"ACEXBG", FISCAL:"FNCST" };
    try {
      const names = Object.keys(HUBS);
      const results = await Promise.all(names.map(n => hubRows(HUBS[n], FYR).catch(()=>null)));
      const data = {}; let incomplete = [];
      names.forEach((n,i)=>{ data[n]=results[i]; if(!results[i] || results[i].length !== 243) incomplete.push(n+"("+(results[i]?results[i].length:"ERR")+")"); });
      if (incomplete.length) {
        return res.status(200).json({ ok:false, kept:true, reason:"수집 불완전 — 기존 스냅샷/임베드 유지", incomplete });
      }
      /* 필드 완전성: 각 세트 대표 필드 null 비율 검사 */
      const nullRate = (rows, f) => rows.filter(r => r[f]==null || r[f]==="").length / rows.length;
      const checks = [ ["M_FDOST","rate2"], ["M_HEDFC","rate"], ["M_GAEJG","rate"], ["M_BJHJB","pptn_num"], ["SR","rate1"], ["AU","rate1"], ["EXEC","pfa_amt1"], ["ACC","ane_tott_amt"], ["FISCAL","rate2"] ];
      const badFields = checks.filter(([n,f]) => nullRate(data[n], f) > 0.02).map(([n,f]) => n+"."+f);
      if (badFields.length) {
        return res.status(200).json({ ok:false, kept:true, reason:"필드 결측 과다 — 기존 스냅샷/임베드 유지", badFields });
      }
      const snap = { ok:true, v:new Date().toISOString().slice(0,10), fyr:FYR, data };
      await kvSet("snap:fiscal:v1", snap);           /* TTL 없음 — 성공본은 영구 보존 */
      await kvSet("snap:fiscal:last", { ts: now });
      return res.status(200).json({ ok:true, refreshed:true, v:snap.v, sets:names.length, rowsEach:243 });
    } catch (e) {
      return res.status(200).json({ ok:false, kept:true, reason:"수집 실패 — 기존 스냅샷/임베드 유지", error:String(e&&e.message||e) });
    }
  }

  const hub = String(q.hub || "JFIED").toUpperCase();
  if (!HUB_RE.test(hub)) { noStore(); return res.status(400).json({ ok: false, error: "허용되지 않은 hub 코드" }); }

  const p = new URLSearchParams();
  p.set("Key", KEY);
  p.set("Type", "json");
  p.set("pIndex", String(q.pIndex || "1"));
  p.set("pSize", String(Math.min(Number(q.pSize) || 400, 1000)));
  if (q.fyr) p.set("fyr", String(q.fyr));
  if (q.laf_cd) p.set("laf_cd", String(q.laf_cd));
  if (q.exe_ymd) p.set("exe_ymd", String(q.exe_ymd));

  const url = `${HUB_BASE}/${hub}?${p.toString()}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
    const text = await r.text();
    let j;
    try { j = JSON.parse(text); }
    catch (e) { noStore(); return res.status(502).json({ ok: false, error: "지방재정365 응답 파싱 실패", raw: text.slice(0, 200) }); }

    const top = j[hub];
    const head = top && top[0] && top[0].head;
    const total = head && head[0] && head[0].list_total_count;
    const result = head && head[1] && head[1].RESULT;
    const rows = (top && top[1] && top[1].row) || [];

    // 인증키 장애 감지 → 관리자 경보 + 캐시 금지
    const failMsg = (result && result.CODE !== "INFO-000") ? String(result.MESSAGE || result.CODE || "") : "";
    if (failMsg && /인증키|SERVICE ?KEY|UNREGISTERED|등록되지 않|미등록/i.test(failMsg)) {
      res.setHeader("Cache-Control", "no-store");
      await kbAlertAdmin("지방재정365 인증키 오류 — /api/lofin(" + hub + ")", "업스트림 응답: " + failMsg);
    } else {
      // 재정 데이터는 연 단위 갱신 → CDN 24시간 캐시
      res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    }
    return res.status(200).json({
      ok: result ? result.CODE === "INFO-000" : Array.isArray(rows),
      hub, fyr: q.fyr || null, laf_cd: q.laf_cd || null,
      total: typeof total === "number" ? total : rows.length,
      rows, result: result || null,
      src: "행정안전부 지방재정365 OpenAPI",
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    noStore();
    return res.status(504).json({ ok: false, error: "지방재정365 호출 시간초과/오류", detail: String((e && e.message) || e) });
  }
};
