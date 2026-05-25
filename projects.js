const ENDPOINT = "https://www.lofin365.go.kr/lf/hub/QWGJK";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=7200");

  const q = req.query || {};
  const lafCd = q.laf_cd || "";
  const zone  = q.zone || "";
  const limit = Math.min(parseInt(q.limit || "10", 10), 50);
  const KEY = process.env.DATA_GO_KR_KEY || "";
  if (!KEY) return res.status(500).json({ error: "DATA_GO_KR_KEY 미설정" });

  try {
    const yNow = new Date().getFullYear();
    const fyrs = q.fyr ? [String(q.fyr)] : [yNow, yNow - 1].map(String);
    const dates = lastNDates(10);

    let rows = null, usedDate = null, usedFyr = null;
    outer:
    for (const fyr of fyrs) {
      for (const date of dates) {
        const url = buildUrl(KEY, fyr, date, lafCd);
        const r = await fetch(url);
        if (!r.ok) continue;
        let raw; try { raw = await r.json(); } catch (e) { continue; }
        const ex = extractRows(raw);
        if (ex && ex.length) { rows = ex; usedDate = date; usedFyr = fyr; break outer; }
      }
    }

    if (!rows || !rows.length) return res.status(200).json({ error: "데이터 없음 — 일자/코드/연도 확인 필요", projects: [] });
    if (zone) rows = rows.filter(r => String(r.laf_hg_nm || "").includes(zone));

    const groups = {};
    rows.forEach(r => {
      const key = r.dbiz_cd || r.dbiz_nm || "_";
      if (!groups[key]) groups[key] = { name: r.dbiz_nm || "(이름 없음)", budget: 0, exec: 0, fld: r.fld_nm || "" };
      groups[key].budget += num(r.bdg_cash_amt);
      groups[key].exec   += num(r.ep_amt);
    });

    const projects = Object.values(groups)
      .filter(p => p.budget > 0)
      .map(p => ({ name: p.name, field: p.fld, budget: fmt(p.budget), exec: fmt(p.exec), rate: Math.min(100, Math.round(p.exec / p.budget * 100)) }))
      .sort((a, b) => parseSize(b.budget) - parseSize(a.budget))
      .slice(0, limit);

    return res.status(200).json({ region: rows[0] ? (rows[0].laf_hg_nm || rows[0].wa_laf_hg_nm || "") : "", projects, date: usedDate, fyr: usedFyr, laf_cd: lafCd, count: projects.length, src: "lofin365 QWGJK(세부사업별 세출)" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};

function buildUrl(key, fyr, exe_ymd, lafCd) {
  const p = new URLSearchParams();
  p.set("Key", key); p.set("Type", "json"); p.set("pIndex", "1"); p.set("pSize", "1000");
  p.set("fyr", fyr); p.set("exe_ymd", exe_ymd);
  if (lafCd) p.set("laf_cd", lafCd);
  return ENDPOINT + "?" + p.toString();
}

function extractRows(raw) {
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw.data)) return raw.data;
  for (const k of Object.keys(raw)) {
    const v = raw[k];
    if (Array.isArray(v)) { for (const blk of v) if (blk && blk.row) return blk.row; }
  }
  return [];
}

function num(x) { const n = Number(String(x == null ? "" : x).replace(/[, ]/g, "")); return isFinite(n) ? n : 0; }
function fmt(won) {
  if (won >= 1e12) return (won / 1e12).toFixed(1) + "조원";
  if (won >= 1e8)  return Math.round(won / 1e8).toLocaleString("ko-KR") + "억원";
  if (won >= 1e4)  return Math.round(won / 1e4).toLocaleString("ko-KR") + "만원";
  return Math.round(won).toLocaleString("ko-KR") + "원";
}
function parseSize(s) {
  if (!s) return 0;
  if (s.endsWith("조원")) return parseFloat(s) * 1e12;
  if (s.endsWith("억원")) return parseFloat(s.replace(/,/g, "")) * 1e8;
  if (s.endsWith("만원")) return parseFloat(s.replace(/,/g, "")) * 1e4;
  return parseFloat(s.replace(/,/g, "")) || 0;
}
function lastNDates(n) {
  const out = []; const today = new Date();
  for (let i = 0; i < n; i++) { const d = new Date(today); d.setDate(today.getDate() - i);
    out.push(d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0")); }
  return out;
}
