#!/usr/bin/env node
/* ============================================================================
   김보미.com 실사이트 전체 점검 — tools/audit-live.js
   2026-09-29 신설. 매일 정오 예약 점검이 이 파일을 돌린다(사람이 돌려도 된다).

   왜 만들었나
     같은 종류의 결함이 점검 때마다 다시 나왔다. 사람이 그때그때 다른 곳을 눌러 보면
     그때그때 다른 것만 걸린다. 여기 적힌 항목은 매번 같은 순서로 전부 확인한다.
       · 가짜 값: 공약 '이행' 자동 판정, 다른 시·도 구청장이 붙은 당선인 자료(2026-09-29 19곳)
       · 원자료와 다른 숫자: 내장 집행 자료 ↔ 지방재정365(QWGJK) 합계
       · 화면 오류: 스크립트 오류, undefined·NaN 노출, 늦게 온 옛 화면이 새 화면을 덮는 경쟁
       · 연결 오류: 페이지·링크 404, API 실패, 관리자 기록이 키 없이 열리는 사고

   실행
     playwright 는 작업 환경에 미리 깔려 있다(NODE_PATH). 없으면 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright@1.56.0
     node tools/audit-live.js                 전체 (약 10~20분)
     node tools/audit-live.js --quick         페이지·API·자료 대조만 (약 3분)
     BASE=https://… node tools/audit-live.js  다른 주소(미리보기 배포)를 점검
   결과
     audit-out/latest.json · audit-out/latest.md  (문제만 모은 요약 포함)
     종료코드 0 = 문제 없음, 1 = 고쳐야 할 문제 있음, 2 = 점검 자체가 실패
   원칙
     이 파일은 읽기만 한다. 사이트 값을 만들거나 바꾸지 않는다.
   ========================================================================== */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const BASE = (process.env.BASE || 'https://www.xn--4k0b53xuva.com/').replace(/\/?$/, '/');
const QUICK = process.argv.includes('--quick');
const OUT = path.join(ROOT, 'audit-out'); fs.mkdirSync(OUT, { recursive: true });
const R = { base: BASE, started: new Date().toISOString(), fail: [], warn: [], ok: [] };
const fail = (area, msg, detail) => { R.fail.push({ area, msg, detail }); console.log('  ✗ [' + area + '] ' + msg); };
const warn = (area, msg, detail) => { R.warn.push({ area, msg, detail }); console.log('  △ [' + area + '] ' + msg); };
const ok = (area, msg) => { R.ok.push({ area, msg }); console.log('  ✓ [' + area + '] ' + msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(u, opt = {}) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(opt.timeout || 45000), headers: opt.headers || {} });
      const text = opt.head ? '' : await r.text();
      return { status: r.status, text, url: r.url };
    } catch (e) { if (t === 2) return { status: 0, text: '', err: String(e.message || e) }; await sleep(1500 * (t + 1)); }
  }
}
async function json(u) { const r = await get(u); try { return JSON.parse(r.text); } catch (e) { return null; } }
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } })); return out; }
const gunzipB64 = (s) => JSON.parse(require('zlib').gunzipSync(Buffer.from(String(s).trim(), 'base64')).toString('utf8'));

/* 원본 보존 페이지(선거 기록) — 점검은 하되 고치지 않는다 */
const PRESERVE = ['archive.html', 'story.html', 'manifesto.html', 'gongyak.html', 'game.html', 'gacha.html', 'games.html'];

(async () => {
  /* 자료는 저장소 파일이 아니라 점검 대상 사이트(BASE)에서 받는다 — 실제로 배포된 것을 본다 */
  const idx = await json(BASE + 'data/index.json');
  if (!idx || !Array.isArray(idx.rows)) { fail('자료', 'data/index.json 을 받지 못함'); throw new Error('index.json'); }
  const live = idx.rows.filter(r => r.live_2026);

  /* ── 1. 페이지 응답 ─────────────────────────────────────────── */
  console.log('\n[1] 페이지 응답');
  const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && !/^google|^naver/.test(f));
  const sm = (await get(BASE + 'sitemap.xml')).text || '';
  const smUrls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/^https?:\/\/[^/]+\//, BASE));
  const pageUrls = [...new Set([...pages.map(p => BASE + p), ...smUrls])];
  const pr = await pool(pageUrls, 8, async u => ({ u, r: await get(u, { timeout: 30000 }) }));
  const badPages = pr.filter(x => x.r.status !== 200);
  if (badPages.length) badPages.forEach(x => fail('페이지', `${x.u} → ${x.r.status || x.r.err}`));
  else ok('페이지', `${pr.length}개 모두 200`);

  /* ── 2. 링크 ───────────────────────────────────────────────── */
  console.log('\n[2] 링크');
  const MAIN = ['index.html', 'about.html', 'vision.html', 'press.html', 'report.html', 'pledge.html', 'party-money.html', 'privacy.html', 'almedalen.html', 'gyeyak.html', 'region.html'];
  const links = new Map();
  for (const p of MAIN) {
    const x = pr.find(y => y.u === BASE + p); if (!x || !x.r.text) continue;
    /* <a> 링크만 본다(<link rel=preconnect> 제외). 스크립트 안 문자열 조각('+esc(u)+' · ${…})은 링크가 아니다 */
    for (const m of x.r.text.matchAll(/<a\s[^>]*href="([^"#][^"]*)"/g)) {
      let h = m[1]; if (/^(mailto|tel|javascript):/.test(h) || /'\s*\+|\+\s*'|\$\{/.test(h)) continue;
      try { h = new URL(h, BASE + p).href; } catch (e) { continue; }
      if (!links.has(h)) links.set(h, p);
    }
  }
  const lr = await pool([...links.keys()], 8, async u => ({ u, from: links.get(u), r: await get(u, { timeout: 25000 }) }));
  let lf = 0;
  for (const x of lr) {
    const internal = x.u.startsWith(BASE);
    if (x.r.status >= 400 || x.r.status === 0) {
      if (internal) { lf++; fail('링크', `${x.from} → ${x.u} (${x.r.status || x.r.err})`); }
      else if (x.r.status === 404 || x.r.status === 410) { lf++; fail('링크', `외부 링크 없음 ${x.from} → ${x.u} (${x.r.status})`); }
      else warn('링크', `외부 응답 이상(점검 환경에서 막혔을 수 있음) ${x.u} (${x.r.status || x.r.err})`);
    }
  }
  if (!lf) ok('링크', `${lr.length}개 확인`);

  /* ── 3. API ────────────────────────────────────────────────── */
  console.log('\n[3] API');
  const posts = await json(BASE + 'api/posts?action=list');
  if (!posts || !Array.isArray(posts.items) || posts.items.length < 10) fail('API', 'api/posts 목록 이상', posts && posts.error);
  else ok('API', `김보미생각 글 ${posts.items.length}편`);
  const cl = await get(BASE + 'api/chat?action=chatlog&bot=bomi');
  if (cl.status !== 403) fail('API', `관리자 대화 기록이 키 없이 열림(status ${cl.status})`); else ok('API', '관리자 대화 기록 잠김(403)');
  const news = await json(BASE + 'api/chat?action=news');
  if (!news || news.ok === false) warn('API', '언론 보도 자동 로드 실패(api/chat?action=news)'); else ok('API', '언론 보도 자동 로드');

  /* ── 4. 원자료 대조: 내장 집행 합계 ↔ 지방재정365 QWGJK ─────────── */
  console.log('\n[4] 원자료 대조 — 집행');
  const pick = [...new Set(['2800000', '2818000', '4678000', ...live.sort(() => Math.random() - .5).slice(0, QUICK ? 3 : 7).map(r => r.laf_cd)])];
  for (const cd of pick) {
    let d; try { d = gunzipB64((await get(BASE + 'data/' + cd + '.txt')).text); } catch (e) { fail('자료', `data/${cd}.txt 를 받지 못하거나 풀 수 없음`); continue; }
    const e = d.exec && d.exec['2026']; if (!e) continue;
    const h = await json(`${BASE}api/lofin?hub=QWGJK&fyr=2026&laf_cd=${cd}&exe_ymd=${e.exe_ymd}&pSize=5`);
    if (!h || !h.ok) { warn('원자료', `${cd} 지방재정365 응답 없음 — 대조 보류`); continue; }
    const pages2 = Math.ceil((h.total || 0) / 1000); let b = 0, x = 0, n = 0;
    for (let i = 1; i <= pages2; i++) { const j = await json(`${BASE}api/lofin?hub=QWGJK&fyr=2026&laf_cd=${cd}&exe_ymd=${e.exe_ymd}&pSize=1000&pIndex=${i}`); (j && j.rows || []).forEach(r => { b += +r.bdg_cash_amt || 0; x += +r.ep_amt || 0; n++; }); }
    const same = Math.abs(b - e.sum.budget) < 1e6 && Math.abs(x - e.sum.exec) < 1e6;
    if (!same) fail('원자료', `${cd} ${d.master.display_new} 집행 합계가 원자료와 다름 (사이트 ${e.sum.budget}/${e.sum.exec} · 원자료 ${b}/${x}, ${n}행)`);
    else ok('원자료', `${cd} ${d.master.display_new} 집행 합계 일치 (${e.exe_ymd})`);
  }

  /* ── 5. 원자료 대조: 단체장 = 선관위 당선인(시·도+구·군) ──────────── */
  console.log('\n[5] 원자료 대조 — 단체장');
  const nec = async (typ) => { const out = []; for (let p = 1; p <= 4; p++) { const j = await json(`${BASE}api/contract?nec=WinnerInfoInqireService2/getWinnerInfoInqire&sgId=20260603&sgTypecode=${typ}&pageNo=${p}&numOfRows=100`); const it = (j && j.items) || []; out.push(...it); if (it.length < 100) break; } return out; };
  const w4 = await nec(4), w3 = await nec(3);
  if (w4.length < 200 || w3.length < 15) warn('단체장', `선관위 당선인 목록을 다 받지 못함(${w4.length}/${w3.length}) — 대조 보류`);
  else {
    let bad = 0;
    for (const r of live) {
      const k24 = String(r.key_2024 || '').split(' '), gNew = String(r.display || '').replace(r.sido_new + ' ', '').replace(/^\(2024 공시\) /, '');
      const m = { level: r.level, sido_new: r.sido_new };
      const pf = await json(BASE + 'data/pledge/' + r.laf_cd + '.json');
      const w = pf && pf.lg && pf.lg[r.laf_cd] && pf.lg[r.laf_cd].w;
      const sds = new Set([k24[0], r.sido_new, ...(r.sido_new === '전남광주통합특별시' ? ['광주광역시', '전라남도'] : [])].filter(Boolean));
      const gus = new Set([gNew, k24.slice(1).join(' ')].filter(Boolean));
      const c = m.level === '광역' ? w3.filter(x => sds.has(x.sdName)) : [...new Map(w4.filter(x => sds.has(x.sdName) && (gus.has(x.wiwName) || gus.has(x.sggName))).map(x => [x.huboid, x])).values()];
      if (c.length !== 1) { warn('단체장', `${r.display} 선관위 후보 ${c.length}명 — 확인 필요`); continue; }
      if (!w || w.name !== c[0].name) { bad++; fail('단체장', `${r.display}: 사이트 ${w ? w.name : '없음'} ≠ 선관위 ${c[0].name}`); }
    }
    if (!bad) ok('단체장', `${live.length}곳 모두 선관위 당선인과 일치`);
  }

  /* ── 6. 브라우저 점검 ─────────────────────────────────────── */
  if (!QUICK) {
    console.log('\n[6] 브라우저 — 스크립트 오류·빈 값 노출·가짜 판정·화면 경쟁');
    let chromium; try { ({ chromium } = require('playwright')); } catch (e) { fail('점검 도구', 'playwright 가 없습니다 — npm i playwright 후 다시'); }
    if (chromium) {
      const b = await chromium.launch();
      try {
        const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
        let cur = ''; const errs = [];
        p.on('pageerror', e => errs.push([cur, e.message.slice(0, 200)]));
        p.on('response', r => { const u = r.url(); if (u.startsWith(BASE) && r.status() >= 400 && !/api\/chat\?action=chatlog|favicon/.test(u)) errs.push([cur, `${r.status()} ${u.slice(BASE.length, BASE.length + 90)}`]); });
        for (const f of pages) { cur = f; try { await p.goto(BASE + f, { waitUntil: 'domcontentloaded', timeout: 45000 }); await p.waitForTimeout(1500); } catch (e) { errs.push([f, 'goto ' + e.message.slice(0, 80)]); } }
        /* 좁은 폰에서 가로 넘침 */
        await p.setViewportSize({ width: 360, height: 740 });
        for (const f of MAIN.concat(['budget365.html'])) { cur = f + '@360'; try { await p.goto(BASE + f, { waitUntil: 'domcontentloaded', timeout: 45000 }); await p.waitForTimeout(1200); const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (ov > 2) warn('화면', `${f} 360px 폭에서 가로로 ${ov}px 넘침`); } catch (e) {} }
        await p.setViewportSize({ width: 1366, height: 900 });
        /* 우리동네365 경로 */
        const sidos = [...new Set(live.map(r => r.sido_new))];
        const must = ['2800000', '2818000', '2818500', '2811500', '2812500', '2811000', '2711000', '2912000', '4678000', '6100000', '4280000'].filter(c => idx.rows.some(r => r.laf_cd === c));
        const lgs = [...new Set([...must, ...live.sort(() => Math.random() - .5).slice(0, 35).map(r => r.laf_cd)])];
        const routes = ['#/', '#/gov', '#/key', '#/policy', '#/task', '#/spol', '#/docs', '#/q/' + encodeURIComponent('청년'), ...sidos.map(s => '#/sido/' + encodeURIComponent(s))];
        lgs.forEach(c => ['', '/budget', '/exec', '/contract', '/diag', '/pledge', '/peer'].forEach(s => routes.push('#/lg/' + c + s)));
        await p.goto(BASE + 'budget365.html', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2000);
        let tb = 0;
        for (const h of routes) {
          cur = 'budget365' + h;
          await p.evaluate(x => { location.hash = x; }, h); await p.waitForTimeout(/contract|pledge|q\//.test(h) ? 1500 : 800);
          const t = await p.evaluate(() => { const a = document.getElementById('app'); return a ? a.innerText.slice(0, 6000) : ''; });
          const m = t.match(/.{0,30}(undefined|NaN|\[object Object\]|Infinity).{0,30}/);
          if (m) { tb++; fail('화면', `${decodeURIComponent(h)} 빈 값 노출: …${m[0]}…`); }
          if (/집행 시작|예산에 이름이 닿은|공약 이행 신호등/.test(t)) { tb++; fail('가짜 판정', `${decodeURIComponent(h)} 공약 자동 판정 표기가 다시 나타남`); }
        }
        if (!tb) ok('화면', `우리동네365 ${routes.length}개 경로에 빈 값·가짜 판정 없음`);
        /* 늦게 온 옛 화면이 새 화면을 덮는지 */
        /* 마지막 화면에만 나오는 낱말로 확인한다('대구광역시'·'중앙정부'는 메뉴에도 있어 판별이 안 된다) */
        const pairs = [['#/q/' + encodeURIComponent('청년') + '/' + encodeURIComponent('충청남도'), '#/sido/' + encodeURIComponent('대구광역시'), '대구광역시 본청'], ['#/lg/1100000', '#/gov', '2027 정부안']];
        for (const [a, b2, want] of pairs) {
          cur = 'race';
          await p.evaluate(x => { location.hash = x; }, a); await p.waitForTimeout(60); await p.evaluate(x => { location.hash = x; }, b2); await p.waitForTimeout(6000);
          const t = await p.evaluate(() => (document.getElementById('app') || document.body).innerText.slice(0, 1500));
          if (!t.includes(want)) fail('화면 경쟁', `${decodeURIComponent(a)} → ${decodeURIComponent(b2)} 빠르게 옮기면 마지막 화면이 아님`); else ok('화면 경쟁', `${decodeURIComponent(b2)} 정상`);
        }
        const seen = new Set();
        for (const [where, msg] of errs) { const k = where + msg; if (seen.has(k)) continue; seen.add(k); (PRESERVE.includes(where) ? warn : fail)('스크립트', `${where}: ${msg}`); }
        if (!errs.length) ok('스크립트', '스크립트 오류·실패 요청 없음');
      } finally { await b.close(); }
    }
  }

  /* ── 결과 ─────────────────────────────────────────────────── */
  R.finished = new Date().toISOString();
  const md = [`# 김보미.com 전체 점검 ${R.finished.slice(0, 16).replace('T', ' ')} UTC`, `대상 ${BASE}`, '',
    `문제 ${R.fail.length}건 · 주의 ${R.warn.length}건 · 정상 ${R.ok.length}건`, '',
    ...(R.fail.length ? ['## 고쳐야 할 문제', ...R.fail.map(x => `- [${x.area}] ${x.msg}`), ''] : []),
    ...(R.warn.length ? ['## 주의', ...R.warn.map(x => `- [${x.area}] ${x.msg}`), ''] : [])].join('\n');
  fs.writeFileSync(path.join(OUT, 'latest.json'), JSON.stringify(R, null, 1));
  fs.writeFileSync(path.join(OUT, 'latest.md'), md);
  console.log('\n' + '─'.repeat(60) + `\n문제 ${R.fail.length}건 · 주의 ${R.warn.length}건 → audit-out/latest.md`);
  process.exit(R.fail.length ? 1 : 0);
})().catch(e => { console.error('점검 자체 실패:', e); process.exit(2); });
