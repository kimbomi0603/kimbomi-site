/* ═══════════════════════════════════════════════════════════════
   열린재정(openfiscaldata.go.kr) OPEN API 프록시
   ───────────────────────────────────────────────────────────────
   기관: 기획예산처·한국재정정보원
   인증키: 환경변수 OFD_API_KEY (코드 하드코딩 금지)
   호출: /api/ofd?ep=IncomeTax&OJ_YY=2025
         /api/ofd?ep=OPFI166&ACNT_YR=2026
   주의: 원 API가 브라우저 UA·Referer 헤더를 요구함(없으면 오류 페이지 반환)
   ═══════════════════════════════════════════════════════════════ */
const KEY = process.env.OFD_API_KEY || "";
const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const TTL = 21600;   /* 6시간 — 열린재정 갱신주기는 대부분 연/분기 단위 */

async function kvGet(k){ if(!RURL) return null; try{ const r=await fetch(RURL,{method:"POST",headers:{Authorization:"Bearer "+RTOK,"Content-Type":"application/json"},body:JSON.stringify(["GET",k]),signal:AbortSignal.timeout(4000)}); const d=await r.json(); return d&&d.result?JSON.parse(d.result):null; }catch(e){ return null; } }
async function kvSet(k,o,ttl){ if(!RURL) return; try{ const a=["SET",k,JSON.stringify(o)]; if(ttl) a.push("EX",String(ttl)); await fetch(RURL,{method:"POST",headers:{Authorization:"Bearer "+RTOK,"Content-Type":"application/json"},body:JSON.stringify(a),signal:AbortSignal.timeout(4000)}); }catch(e){} }

/* 화이트리스트 — 검증 완료된 엔드포인트만 허용(임의 프록시 방지) */
const ALLOW = {
  IncomeTax:            { nm:"국세수입",             yr:"OJ_YY"   },
  NontaxIncome:         { nm:"세외수입",             yr:"OJ_YY"   },
  FundIncome:           { nm:"기금수입",             yr:"OJ_YY"   },
  OPFI166:              { nm:"중앙관서별 총지출추이",   yr:"ACNT_YR" },
  OPFI163:              { nm:"사업성기금 운용규모",     yr:"ACNT_YR" },
  OPFI161:              { nm:"특별회계별 재정지출추이",  yr:"ACNT_YR" },
  OPFI123:              { nm:"성질별 지출추이",        yr:"ACNT_YR" },
  OPFI121:              { nm:"이월의 성질별 추이",      yr:"ACNT_YR" },
  OPFB129:              { nm:"분야별 재원배분 계획",    yr:"ACNT_YR" },
  OPFI172:              { nm:"분야별 프로그램 예산",    yr:"ACNT_YR" },
  OPFI134:              { nm:"분야별 출연금 지출추이",   yr:"ACNT_YR" },
  OPFI165:              { nm:"16대 분야별 재원배분",    yr:"ACNT_YR" },
  OPFI150:              { nm:"작성기준별 주요재정통계",  yr:"ACNT_YR" },
  OPFI140:              { nm:"연도별 총세입·총세출",    yr:"ACNT_YR" },
  GovernmentInvestment: { nm:"정부출자현황",           yr:"OJ_YY"   },
  GovernmentDividend:   { nm:"정부출자기관 정부배당",   yr:"ACNT_YR" }
};

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Content-Type","application/json; charset=utf-8");

  const q = (req.query && typeof req.query==="object") ? req.query : {};

  if (q.list) {   /* 사용 가능한 엔드포인트 목록 */
    res.setHeader("Cache-Control","public, s-maxage=86400");
    return res.status(200).json({ ok:true, endpoints:Object.entries(ALLOW).map(([k,v])=>({ep:k,nm:v.nm,yearParam:v.yr})) });
  }

  const ep = String(q.ep||"").trim();
  if (!ALLOW[ep]) return res.status(200).json({ ok:false, error:"허용되지 않은 엔드포인트", hint:"/api/ofd?list=1 로 목록 확인" });
  if (!KEY)       { res.setHeader("Cache-Control","no-store"); return res.status(200).json({ ok:false, error:"OFD_API_KEY 미설정", hint:"Vercel 환경변수에 열린재정 인증키를 등록하세요." }); }

  const def = ALLOW[ep];
  const yr  = String(q[def.yr] || q.year || "").replace(/[^0-9]/g,"").slice(0,4);
  const size = Math.min(parseInt(q.pSize||"1000",10)||1000, 1000);
  const idx  = Math.max(parseInt(q.pIndex||"1",10)||1, 1);

  const ck = `ofd:v1:${ep}:${yr}:${idx}:${size}`;
  if (!q.fresh) { const c = await kvGet(ck); if (c) { c.cached = true; return res.status(200).json(c); } }

  const p = new URLSearchParams({ Key:KEY, Type:"json", pIndex:String(idx), pSize:String(size) });
  if (yr) p.set(def.yr, yr);

  try {
    const r = await fetch(`https://openapi.openfiscaldata.go.kr/${ep}?${p}`, {
      headers:{
        "User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Referer":"https://www.openfiscaldata.go.kr/",
        "Accept":"application/json,*/*"
      },
      signal: AbortSignal.timeout(15000)
    });
    let txt = await r.text();
    /* 원 API가 JSON 문자열을 한 번 더 감싸 반환하는 경우가 있음 */
    let j; try { j = JSON.parse(txt); if (typeof j === "string") j = JSON.parse(j); } catch(e){ j = null; }
    if (!j) { res.setHeader("Cache-Control","no-store"); return res.status(200).json({ ok:false, ep, error:"응답 파싱 실패(원 API 오류 페이지)" }); }

    if (j.RESULT) {   /* INFO-200 = 해당 연도 데이터 없음 */
      const out = { ok:true, ep, nm:def.nm, year:yr||null, total:0, rows:[], note:j.RESULT.MESSAGE||"" };
      await kvSet(ck,out,TTL);
      res.setHeader("Cache-Control","public, s-maxage=21600, stale-while-revalidate=86400");
      return res.status(200).json(out);
    }
    const body = j[ep] || [];
    const head = (body.find(b=>b.head)||{}).head || [];
    const total = ((head.find(h=>h.list_total_count!=null)||{}).list_total_count) ?? null;
    const rows = (body.find(b=>b.row)||{}).row || [];
    const out = { ok:true, ep, nm:def.nm, year:yr||null, total, count:rows.length, rows,
                  src:"기획예산처·한국재정정보원 열린재정 OPEN API", fetched_at:new Date().toISOString() };
    await kvSet(ck,out,TTL);
    res.setHeader("Cache-Control","public, s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).json(out);
  } catch(e) {
    res.setHeader("Cache-Control","no-store");
    return res.status(200).json({ ok:false, ep, error:String((e&&e.message)||e) });
  }
};
