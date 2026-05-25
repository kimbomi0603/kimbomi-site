/* ============================================================
   지방재정365 OpenAPI 실시간 연동 (세출예산 / ACEXBG)
   - Cloudflare Worker 프록시를 통해 호출합니다(인증키는 Worker 가 보관).
   - LOFIN.proxy 가 비어 있으면 data.js 의 확정 공식 수치(BUDGET)를 그대로 사용합니다.
   - 호출 실패해도 페이지는 항상 확정 수치로 정상 동작합니다.
   - 응답 단위: 원(₩) → 억원으로 환산.
   ============================================================ */
const LofinAPI = (function(){
  function buildUrl(){
    const base = String(LOFIN.proxy || "").replace(/\/+$/,"");
    const p = new URLSearchParams({ fyr: String(LOFIN.year), laf: LOFIN.lafName });
    return base + "/?" + p.toString();
  }
  function eok(won){
    const n = Number(String(won).replace(/[^\d.-]/g,""));
    return isFinite(n) ? Math.round(n / 1e8) : 0;
  }
  function parse(json){
    try{
      const rows = json && json.ACEXBG && json.ACEXBG[1] && json.ACEXBG[1].row ? json.ACEXBG[1].row : (json.row || json.data || []);
      const arr = Array.isArray(rows) ? rows : [rows];
      const r = arr.find(x => String(x.laf_cd) === String(LOFIN.lafCode)) || arr[0];
      if(!r || r.ane_tott_amt == null) return null;
      const general = eok(r.gen_acnt_amt);
      const special = eok((Number(r.etc_spc_acnt_amt)||0) + (Number(r.pbco_spc_acnt_amt)||0));
      const fund    = eok(r.fnd_amt || 0);
      return { general, special, fund, total: general + special, year: Number(r.fyr) || LOFIN.year };
    }catch(e){ return null; }
  }
  async function refresh(){
    if(!LOFIN.enabled || !LOFIN.proxy) return false;
    try{
      const res = await fetch(buildUrl(), { headers:{ "Accept":"application/json" }});
      if(!res.ok) return false;
      const d = parse(await res.json());
      if(!d || !d.general) return false;
      BUDGET.general = d.general; BUDGET.special = d.special; BUDGET.fund = d.fund;
      BUDGET.total = d.general + d.special;
      if(d.year) BUDGET.year = d.year;
      BUDGET._live = true;
      return true;
    }catch(e){ console.warn("[LofinAPI] 실시간 연동 실패 — 확정 수치 표시", e); return false; }
  }
  return { refresh };
})();
