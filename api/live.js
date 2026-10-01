// /api/live — 정부·국회 발표 실시간 + 온통청년 (김보미.com 「정책 실시간」 live.html)
//   ?src=feeds[&g=gov|nas]         정책브리핑·부처 보도자료·관보·성평등가족부·국회 의안·국회 보도자료
//   ?src=youth&op=plcy|space|content|way|fcs|asmt[&plcyKywdNm=..&page=&size=]  온통청년 6개 API
//   ?selfcheck=1                   출처별 상태만
// 인증키는 서버 환경변수에서만 읽는다(DATA_GO_KR_KEY, ASSEMBLY_KEY, YOUTH_*). 응답에서 키는 지운다.
// 같은 질문은 CDN 이 30분(청년 1시간) 보관 → 공공 API 하루 호출 한도를 지킨다.
const F = require('./_feeds.js');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const q = (req.query && typeof req.query === 'object') ? req.query : {};
  try {
    if (q.selfcheck) {
      const r = await F.runAll({ days: 2 });
      const y = {};
      for (const op of Object.keys(F.YOUTH_OPS)) { try { const o = await F.youth(op, { size: 1 }); y[op] = o.state; } catch (e) { y[op] = 'error'; } }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, at: r.at, feeds: r.status, youth: y });
    }
    if (q.src === 'youth') {
      const op = String(q.op || 'plcy');
      if (!F.YOUTH_OPS[op]) return res.status(400).json({ ok: false, error: 'op 는 plcy·space·content·way·fcs·asmt 중 하나' });
      const o = await F.youth(op, q);
      res.setHeader('Cache-Control', o.state === 'ok' ? 'public, s-maxage=3600, stale-while-revalidate=86400' : 'no-store');
      return res.status(200).json(Object.assign({ ok: o.state === 'ok', op }, o));
    }
    // 기본: 정부·국회 발표
    const g = q.g === 'gov' || q.g === 'nas' ? q.g : '';
    const r = await F.runAll({ days: 3, only: g ? [g] : null });
    const anyOk = r.status.some((s) => s.state === 'ok');
    res.setHeader('Cache-Control', anyOk ? 'public, s-maxage=1800, stale-while-revalidate=86400' : 'no-store');
    return res.status(200).json({ ok: anyOk, at: r.at, status: r.status, items: r.items.slice(0, 1500) });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ ok: false, error: '처리 중 오류' });
  }
};
