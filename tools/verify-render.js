#!/usr/bin/env node
/* ============================================================================
   전수 렌더 검증 — tools/verify-render.js
   2026-09-04 신설.

   이 파일이 있는 이유:
     "강진군 한 곳만 열어 보고 243곳이 괜찮다"고 판단했다가, 실제로는
     전남광주통합특별시 소속 27곳과 인천 서해구의 상세페이지가 아예 뜨지
     않고 있었다(2026-09-04 발견). 표본 검사로는 특정 지자체에서만 터지는
     결함을 잡을 수 없다. 그래서 선택 가능한 항목 전부를 실제로 연다.

   두 시나리오를 모두 돌린다:
     ① 차트 라이브러리 정상
     ② Chart.js CDN 장애 — 외부 CDN이 죽어도 본문은 떠야 한다

   필요:  npx playwright install webkit
   실행:  node tools/verify-render.js
   종료코드 0=통과, 1=실패
   ========================================================================== */
const path = require('path'), fs = require('fs'), http = require('http');
const ROOT = path.resolve(__dirname, '..');
let pw;
try { pw = require('playwright'); }
catch (e) { console.error('playwright가 필요합니다: npm i -D playwright && npx playwright install webkit'); process.exit(1); }

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css',
               '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg',
               '.svg':'image/svg+xml', '.bin':'application/octet-stream', '.webp':'image/webp',
               '.ico':'image/x-icon', '.woff2':'font/woff2' };
const PORT = 8791;
const srv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT)) { s.writeHead(403); s.end(); return; }
  fs.readFile(f, (e, d) => {
    if (e) { s.writeHead(404); s.end('{}'); return; }
    s.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    s.end(d);
  });
});

const CHART_LOCAL = path.join(__dirname, 'chart.umd.min.js');   // 있으면 로컬본 사용

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const browser = await pw.webkit.launch();
  let fail = 0;

  for (const scen of [{ n:'차트 정상', chart:true }, { n:'Chart.js CDN 장애', chart:false }]) {
    if (scen.chart && !fs.existsSync(CHART_LOCAL)) {
      console.log(`\n▷ ${scen.n} — tools/chart.umd.min.js 없음, 건너뜀`);
      continue;
    }
    console.log(`\n▷ ${scen.n}`);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const CH = scen.chart ? fs.readFileSync(CHART_LOCAL, 'utf8') : null;
    await ctx.route('**/*', (route, req) => {
      const u = req.url();
      if (u.startsWith(`http://127.0.0.1:${PORT}`)) return route.continue();
      if (CH && /chart\.umd/.test(u)) return route.fulfill({ status:200, contentType:'text/javascript', body:CH });
      return route.abort();                       // 그 외 외부 자원은 전부 차단(장애 재현)
    });
    const pg = await ctx.newPage();
    const perr = [];
    pg.on('pageerror', e => perr.push(String(e).slice(0, 140)));
    await pg.goto(`http://127.0.0.1:${PORT}/narasalim.html`, { waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(3000);

    const keys = await pg.evaluate(() => Object.keys((window.STATE && STATE.byKey) || {}));
    console.log(`  선택 가능한 항목 ${keys.length}개`);
    if (keys.length < 240) { console.log('  ✗ 지역 목록이 채워지지 않았습니다'); fail++; }

    /* 화면 표기와 데이터 키가 일부러 다른 곳. 사유 없이 추가하지 말 것. */
    const TITLE_ALIAS = {
      '인천광역시 서구': '서해구',   // 2026.7.1 서구→서해구 개명(검단구 분리). 2024 공시 키는 '서구'
    };
    let bad = 0;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      perr.length = 0;
      const r = await pg.evaluate(async (kk) => {
        const body = document.getElementById('detailBody'); if (body) body.innerHTML = '';
        try { openDetail(kk); } catch (e) { return { err: 'THROW ' + e.message }; }
        await new Promise(r => setTimeout(r, 700));   /* 비동기 값이 자리잡을 시간. 420ms에서는 직전 지역의 늦은 콜백이 섞여 오탐이 났다 */
        const t = (document.getElementById('detailBody') || {}).innerText || '';
        return {
          len: t.length,
          nan: (t.match(/NaN|Infinity|undefined|\bnull\b/g) || []),
          unit: (t.match(/\d{6,}\s*조원/g) || []),          // 억↔조 단위 오용
          title: (document.getElementById('dTitle') || {}).innerText || '',
          hs: document.documentElement.scrollWidth > window.innerWidth + 2,
        };
      }, k);
      const nan = r.nan || [], unit = r.unit || [];
      const want = TITLE_ALIAS[k] || k.split(' ').pop();
      const nameOk = r.title && r.title.includes(want) && r.title.includes('상세');
      if (r.err || nan.length || unit.length || (r.len || 0) < 1500 || !nameOk || perr.length) {
        bad++; fail++;
        console.log(`  ✗ ${k} — ${r.err || ''}${nan.length ? ' 노출:' + nan.slice(0,3) : ''}`
          + `${unit.length ? ' 단위오류:' + unit[0] : ''}${!nameOk ? ` 제목불일치:"${r.title}"` : ''}`
          + `${(r.len||0) < 1500 ? ` 본문 ${r.len}자` : ''}${perr[0] ? ' ' + perr[0] : ''}`);
      }
    }
    if (!bad) console.log(`  ✓ ${keys.length}곳 전부 정상 — NaN·예외·단위오류·가로스크롤 0건`);
    await ctx.close();
  }

  /* ── 공개 페이지 전체 로드 ────────────────────────────────────────────
     2026-09-04: esc·금액 포매터를 assets/kb-format.js 한 곳으로 모았다.
     그 파일이 로드되지 않으면 해당 페이지의 렌더가 통째로 죽는다.
     그래서 모든 공개 페이지를 실제로 열어 유틸 존재와 예외 0건을 확인한다. */
  console.log('\n▷ 공개 페이지 로드 · 공통 유틸 확인');
  {
    /* 404·소유권 확인용 페이지는 본문이 원래 짧다 */
    /* 404·소유권 확인 페이지, 그리고 admin은 로그인 게이트라 본문이 원래 짧다 */
    const SHORT_OK = /^(404\.html|admin\.html|google[0-9a-f]+\.html|.*verification.*\.html)$/i;
    const PAGES = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route('**/*', (route, req) =>
      req.url().startsWith(`http://127.0.0.1:${PORT}`) ? route.continue() : route.abort());
    for (const f of PAGES) {
      const pg = await ctx.newPage();
      const errs = [];
      pg.on('pageerror', e => errs.push(String(e).slice(0, 120)));
      /* 외부 자원을 전부 차단한 상태이므로, 그 때문에 나는 오류는 세지 않는다
         (tailwind·폰트 CDN 등). 코드 자체의 예외만 본다. */
      pg.on('console', m => {
        const t = m.text();
        if (m.type() !== 'error') return;
        if (/Failed to load resource|tailwind|fonts\.|cdn\.|Chart is not defined|Can't find variable: Chart/i.test(t)) return;
        errs.push(t.slice(0, 120));
      });
      try {
        await pg.goto(`http://127.0.0.1:${PORT}/${encodeURIComponent(f)}`, { waitUntil: 'domcontentloaded' });
        await pg.waitForTimeout(1800);
        const r = await pg.evaluate(() => ({
          needsUtil: /KB_(esc|won억|won원|fmt)\s*\(/.test(document.documentElement.innerHTML),
          hasUtil: typeof window.KB_esc === 'function' && typeof window.KB_won억 === 'function',
          len: (document.body.innerText || '').length,
          hs: document.documentElement.scrollWidth > window.innerWidth + 2,
        }));
        const problems = [];
        if (r.needsUtil && !r.hasUtil) problems.push('assets/kb-format.js 미로드');
        if (!SHORT_OK.test(f) && r.len < 200) problems.push(`본문 ${r.len}자`);
        if (r.hs) problems.push('가로스크롤');
        if (errs.length) problems.push(errs[0]);
        if (problems.length) { fail++; console.log(`  ✗ ${f} — ${problems.join(' · ')}`); }
      } catch (e) { fail++; console.log(`  ✗ ${f} — ${String(e).slice(0, 90)}`); }
      await pg.close();
    }
    if (!fail) console.log(`  ✓ 공개 페이지 ${PAGES.length}개 — 공통 유틸 로드·예외 0건`);
    await ctx.close();
  }

  await browser.close(); srv.close();
  console.log('\n' + '─'.repeat(70));
  console.log(fail ? `실패 ${fail}건 — 배포하지 마십시오` : '전수 렌더 통과');
  process.exit(fail ? 1 : 0);
})();
