/* ============================================================
   대한민국 재정 365 — 정책·혜택 통합검색 프록시  /api/policy
   ------------------------------------------------------------
   소스 3종 (브라우저에서 직접 호출 불가 → 서버에서 대신 호출)
     1) 보조금24/정부24 공공서비스(혜택) — odcloud gov24   [DATA_GO_KR_KEY]
     2) 복지로 지자체복지서비스 (B554287)                  [DATA_GO_KR_KEY]
     3) 온통청년 청년정책 (youthcenter getPlcy)            [YOUTH_API_KEY · 선택]

   환경변수
     DATA_GO_KR_KEY  : 공공데이터포털 인증키 (기존 lofin/budget 과 동일 키 재사용 가능)
        ※ data.go.kr 에서 아래 2건 "활용신청"(자동승인) 후 같은 키로 동작:
          - 행정안전부_대한민국 공공서비스(혜택) 정보 (15113968)
          - 한국사회보장정보원_지자체복지서비스 (15108347)
     YOUTH_API_KEY   : 온통청년(youthcenter.go.kr) 발급 인증키 (없으면 청년정책 소스만 생략)

   진단:  /api/policy?selfcheck=1
   호출:  /api/policy?q=노인%20일자리&region=강진군
   ============================================================ */

const KEY  = process.env.DATA_GO_KR_KEY || process.env.GOV_API_KEY || "";
const YKEY = process.env.YOUTH_API_KEY  || "";

function stripGu(s) {
  return String(s || "").replace(/(특별자치시|특별시|광역시|특별자치도|도|시|군|구)$/, "").trim();
}
function xmlTag(block, tag) {
  const m = block.match(new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">"));
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
}
async function fetchText(url, opts) {
  const r = await fetch(url, Object.assign({ signal: AbortSignal.timeout(12000) }, opts || {}));
  return await r.text();
}

/* 1) 보조금24 / 정부24 공공서비스(혜택) — odcloud gov24 */
async function gov24(q, region) {
  if (!KEY) return [];
  const p = new URLSearchParams();
  p.set("page", "1"); p.set("perPage", "10"); p.set("serviceKey", KEY);
  if (q) p.set("cond[서비스명::LIKE]", q);
  if (region) p.set("cond[소관기관명::LIKE]", stripGu(region));
  const url = "https://api.odcloud.kr/api/gov24/v3/serviceList?" + p.toString();
  const text = await fetchText(url, { headers: { Authorization: "Infuser " + KEY } });
  let j; try { j = JSON.parse(text); } catch (e) { return []; }
  const rows = j.data || [];
  return rows.map(function (x) {
    const id = x["서비스ID"] || x["서비스아이디"] || "";
    return {
      title: x["서비스명"] || "",
      summary: x["서비스목적요약"] || x["지원내용"] || "",
      agency: x["소관기관명"] || "",
      target: x["지원대상"] || "",
      url: x["상세조회URL"] || (id ? "https://www.gov.kr/portal/rcvfvrSvc/dtlEx/" + id : "https://www.gov.kr/portal/rcvfvrSvc/main"),
      source: "보조금24"
    };
  }).filter(function (x) { return x.title; });
}

/* 2) 복지로 지자체복지서비스 */
async function bokjiro(q, region) {
  if (!KEY) return [];
  const p = new URLSearchParams();
  p.set("serviceKey", KEY); p.set("pageNo", "1"); p.set("numOfRows", "10");
  if (q) p.set("searchWrd", q);
  const url = "http://apis.data.go.kr/B554287/LocalGovernmentWelfareInformations/LcgvWelfarelist?" + p.toString();
  const text = await fetchText(url);
  const blocks = text.split(/<servList>/).slice(1);
  const out = [];
  for (const b of blocks) {
    const title = xmlTag(b, "servNm");
    if (!title) continue;
    const ctpv = xmlTag(b, "ctpvNm"), sgg = xmlTag(b, "sggNm");
    out.push({
      title: title,
      summary: xmlTag(b, "servDgst"),
      agency: (ctpv + " " + sgg).trim() || xmlTag(b, "jurMnofNm"),
      dept: xmlTag(b, "bizChrDeptNm"),
      url: xmlTag(b, "servDtlLink") || "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do",
      source: "복지로(지자체)"
    });
  }
  return out;
}

/* 3) 온통청년 청년정책 */
async function youth(q, region) {
  if (!YKEY) return [];
  const p = new URLSearchParams();
  p.set("apiKeyNm", YKEY); p.set("pageNum", "1"); p.set("pageSize", "10"); p.set("rtnType", "json");
  if (q) p.set("plcyKywdNm", q);
  const url = "https://www.youthcenter.go.kr/go/ythip/getPlcy?" + p.toString();
  const text = await fetchText(url);
  let j; try { j = JSON.parse(text); } catch (e) { return []; }
  const rows = (j.result && j.result.youthPolicyList) || j.youthPolicyList || [];
  return rows.map(function (x) {
    return {
      title: x.plcyNm || "",
      summary: x.plcyExplnCn || "",
      agency: x.sprvsnInstCdNm || x.rgtrInstCdNm || "",
      url: "https://www.youthcenter.go.kr/youngPlcyUnif/youngPlcyUnifDtl.do",
      source: "온통청년"
    };
  }).filter(function (x) { return x.title; });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const Q = (req.query && typeof req.query === "object") ? req.query : {};
  const q = Q.q ? String(Q.q) : "";
  const region = Q.region ? String(Q.region) : "";

  if (Q.selfcheck) {
    res.setHeader("Cache-Control", "no-store");
    const out = { hasDataKey: !!KEY, hasYouthKey: !!YKEY, tests: {} };
    const probes = [["gov24", gov24], ["bokjiro", bokjiro], ["youth", youth]];
    for (const [nm, fn] of probes) {
      try { out.tests[nm] = (await fn(q || "청년", region)).length; }
      catch (e) { out.tests[nm] = "ERR:" + (e && e.message ? e.message : e); }
    }
    return res.status(200).json(out);
  }

  if (!KEY && !YKEY) return res.status(200).json({ ok: true, configured: false, items: [] });
  if (!q) return res.status(200).json({ ok: true, configured: true, items: [] });

  let items = [];
  const settled = await Promise.allSettled([gov24(q, region), bokjiro(q, region), youth(q, region)]);
  for (const r of settled) if (r.status === "fulfilled") items = items.concat(r.value);

  const seen = {};
  items = items.filter(function (x) {
    if (!x.title || seen[x.title]) return false; seen[x.title] = 1; return true;
  }).slice(0, 18);

  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).json({ ok: true, configured: true, count: items.length, items: items });
};
