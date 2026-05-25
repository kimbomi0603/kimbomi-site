/* ============================================================
   지방재정365 프록시 — Cloudflare Worker
   목적: 정적 사이트(광주박정하.kr)에서 지방재정365 OpenAPI 를 브라우저로
        직접 부르면 CORS 로 막히므로, 이 Worker 가 대신 호출해 결과를
        CORS 허용 헤더와 함께 돌려줍니다. 인증키(LOFIN_KEY)는 이 Worker
        안에만 보관되어 외부에 노출되지 않습니다.

   설정(중요): Cloudflare 대시보드 → 해당 Worker → Settings →
     Variables and Secrets → "LOFIN_KEY" Secret 을 만들고 값에
     발급받은 지방재정365 인증키를 넣으세요.
     (인증키는 절대 이 파일이나 깃허브에 적지 마세요 — Secret 에만 보관)

   호출 예: https://<워커주소>/?fyr=2026&laf=광주북구
   ============================================================ */
export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const inUrl = new URL(request.url);
    const fyr = inUrl.searchParams.get("fyr") || "2026";
    const laf = inUrl.searchParams.get("laf") || "광주북구";

    const api = new URL("https://www.lofin365.go.kr/lf/hub/ACEXBG");
    api.searchParams.set("Key", env.LOFIN_KEY);
    api.searchParams.set("Type", "json");
    api.searchParams.set("pIndex", "1");
    api.searchParams.set("pSize", "10");
    api.searchParams.set("fyr", fyr);
    api.searchParams.set("laf_hg_nm", laf);

    try {
      const upstream = await fetch(api.toString(), { headers: { "Accept": "application/json" } });
      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=86400" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "upstream_failed", message: String(e) }),
        { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }
  }
};
