/* ============================================================
   🏛️ 나라장터(조달청) G2B OpenAPI — Vercel 서버리스 함수
   경로:  /api/contract  (각 시·군 계약의 "모든 것"을 한 화면에)
   ------------------------------------------------------------
   환경변수
     G2B_API_KEY  =  공공데이터포털 조달청 OpenAPI 인증키 (필수)

   쿼리
     /api/contract?selfcheck=1                 → 인증키 상태
     /api/contract?region=강진군               → 그 지역 1년치 계약 전부 (~200건)
     /api/contract?region=강진군&days=365      → 기간 조절 (1~1095일)
     /api/contract?region=강진군&page=2        → 페이지네이션 (numOfRows=100 단위)
     /api/contract?region=강진군&vendor=○○건설 → 특정 업체 드릴다운
   ============================================================ */

const G2B_BASE = "http://apis.data.go.kr/1230000/PubDataOpnStdService";
const KEY = process.env.G2B_API_KEY || "";

function ymd(d) { return d.toISOString().slice(0,10).replace(/-/g,""); }
function num(x) { const n = Number(String(x==null?"":x).replace(/[, ]/g,"")); return isFinite(n)?n:0; }

async function fetchPage(region, days, page) {
  const today = new Date();
  const start = new Date(today.getTime() - days*24*3600*1000);
  const p = new URLSearchParams();
  p.set("serviceKey", KEY);
  p.set("pageNo", String(page));
  p.set("numOfRows", "100");
  p.set("type", "json");
  p.set("inqryDiv", "1");
  p.set("inqryBgnDt", ymd(start) + "0000");
  p.set("inqryEndDt", ymd(today) + "2359");
  if (region) p.set("dminsttNm", region);
  const url = G2B_BASE + "/getDataSetOpnStdBidPblancInfo?" + p.toString();
  const r = await fetch(url);
  if (!r.ok) throw new Error("G2B HTTP " + r.status);
  let raw;
  try { raw = await r.json(); } catch(e) { throw new Error("JSON 파싱 실패"); }
  const body = raw?.response?.body || raw;
  let items = body?.items || [];
  if (items && !Array.isArray(items)) items = items.item ? [].concat(items.item) : [items];
  const totalCount = num(body?.totalCount);
  return { items, totalCount };
}

function normalize(items) {
  return items.map(it => ({
    title: it.bidNtceNm || it.prdctClsfcNoNm || "(제목 미상)",
    method: it.bidMethdNm || "",
    amount: num(it.presmptPrce || it.bidPrjctEstmtPrice),
    org: it.dminsttNm || it.ntceInsttNm || "",
    vendor: (it.scsbidNm || it.bidwinnrNm || "").trim(),
    date: (it.bidNtceDt || it.opengDt || "").toString().slice(0,10),
    year: ((it.bidNtceDt || it.opengDt || "")+"").slice(0,4),
    url: it.bidNtceUrl || ""
  }));
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","public, s-maxage=600, stale-while-revalidate=1800");

  const q = (req.query && typeof req.query === "object") ? req.query : {};
  const region = (q.region || "").toString().trim();
  const vendor = (q.vendor || "").toString().trim();
  const days = Math.max(1, Math.min(1095, parseInt(q.days || 365, 10)));
  const page = Math.max(1, parseInt(q.page || 1, 10));

  if (q.selfcheck) {
    return res.status(200).json({
      ok:true, hasKey: !!KEY, base: G2B_BASE,
      hint: KEY ? "✅ G2B 인증키 활성" : "⚠️ G2B_API_KEY 미설정 — Vercel 환경변수 추가 필요"
    });
  }
  if (!KEY) return res.status(200).json({ configured:false, error:"G2B_API_KEY 미설정" });

  try {
    // 1년치(최대 ~200건) 페이지 1·2 자동 수집 → 충분한 통계
    const p1 = await fetchPage(region, days, 1);
    let all = p1.items;
    if (p1.totalCount > 100 && page === 1 && all.length === 100) {
      try { const p2 = await fetchPage(region, days, 2); all = all.concat(p2.items); } catch(e){}
    }
    const bids = normalize(all);

    // 업체 필터(드릴다운)
    const filtered = vendor ? bids.filter(b => b.vendor && b.vendor.indexOf(vendor) >= 0) : bids;

    // 연도별 집계
    const byYear = {};
    bids.forEach(b => {
      if (!b.year) return;
      if (!byYear[b.year]) byYear[b.year] = { year:b.year, count:0, amount:0 };
      byYear[b.year].count += 1;
      byYear[b.year].amount += b.amount;
    });
    const yearStats = Object.values(byYear).sort((a,b) => b.year.localeCompare(a.year));

    // 업체별 집계
    const byVendor = {};
    bids.forEach(b => {
      if (!b.vendor) return;
      if (!byVendor[b.vendor]) byVendor[b.vendor] = { vendor:b.vendor, count:0, amount:0, sutil:0 };
      byVendor[b.vendor].count += 1;
      byVendor[b.vendor].amount += b.amount;
      if (/수의|단독/.test(b.method)) byVendor[b.vendor].sutil += 1;
    });
    const vendorStats = Object.values(byVendor).sort((a,b) => b.amount - a.amount);

    // 전체 통계
    const total = filtered.reduce((a,b) => a + (b.amount||0), 0);
    const sutil = filtered.filter(b => /수의|단독/.test(b.method)).length;

    return res.status(200).json({
      configured: true,
      region: region || "전국",
      vendor: vendor || null,
      days_window: days,
      total_count: p1.totalCount,
      fetched_count: bids.length,
      filtered_count: filtered.length,
      bids: filtered.slice(0, 50),
      stats: {
        total_amount: total,
        avg_amount: filtered.length ? Math.round(total/filtered.length) : 0,
        sutil_count: sutil,
        sutil_ratio: filtered.length ? +(sutil/filtered.length*100).toFixed(1) : 0,
        vendor_count: Object.keys(byVendor).length
      },
      by_year: yearStats,
      by_vendor: vendorStats.slice(0, 30),  // Top 30 업체
      fetched_at: new Date().toISOString(),
      src: "조달청 나라장터(G2B) · getDataSetOpnStdBidPblancInfo"
    });
  } catch (e) {
    return res.status(200).json({ configured:true, error: String((e && e.message) || e), region });
  }
};
