#!/usr/bin/env node
/* ============================================================================
   김보미.com 전 페이지 · 전 링크 · 전 단추 점검 — tools/qa-all.js
   2026-11-12 신설.

   왜 만들었나
     「버벅거림, 오래 걸림, 스크립트 오류, 눌러도 반응 없는 단추, 안 열리는 창·링크」가
     사람이 그때그때 눌러 보는 방식으로는 매번 다른 것만 걸리고 같은 실수가 다시 나왔다.
     이 파일은 모든 쪽을 두 화면 너비(PC 1280 · 휴대폰 360)로 열고,
     쪽 안의 링크를 전부 확인하고, 보이는 단추를 전부 한 번씩 눌러 본다.

   확인하는 것 (쪽마다)
     · 여는 시간: 첫 표시(FCP)·가장 큰 표시(LCP)·load. 오래 걸리면 경고
     · 버벅임: 50ms 넘는 긴 작업(long task)의 최대값. 300ms 넘으면 경고
     · 스크립트 오류(pageerror)·콘솔 오류·응답 400 이상·깨진 그림
     · 화면 글자에 undefined / NaN / [object Object]
     · 가로로 넘치는 화면(휴대폰에서 옆으로 밀림)
     · 링크: 사이트 안 쪽 링크가 있는 파일인지, #이름 링크의 목적지가 있는지,
       새 창 링크에 rel="noopener"가 있는지, 바깥 링크가 실제로 열리는지(--external)
     · 단추: 누른 뒤 화면이 바뀌거나(내용·주소·새 창·내려받기·대화상자) 하는지.
       아무 반응이 없으면 「반응 없음」, 누른 뒤 오류가 나면 「누르면 오류」,
       누르고 300ms 넘게 멈추면 「누르면 버벅임」

   안전장치
     · 사이트 값을 바꾸는 요청(POST·PUT·DELETE)은 실제로 보내지 않고 가짜 성공으로 돌려준다
       (소통 쪽 글 남기기, 관리자 기능 등). 결제·로그인 없음.
     · 기록관 쪽(archive·games·gongyak·manifesto)은 고치지 않는 쪽이라, 문제는 「기록관」으로 따로 적는다.

   실행
     node tools/qa-all.js                         이 저장소 파일을 직접 띄워 점검(서버 함수 /api 는 제외)
     BASE=https://미리보기주소 node tools/qa-all.js  배포본 점검(/api 까지)
     … --external                                 바깥 링크도 실제로 열어 본다(네트워크 필요)
     … --quick                                    단추 누르기 없이 쪽·링크만
   결과
     tools/out/qa-all.json · tools/out/qa-all.md
     종료코드 0 = 고칠 것 없음, 1 = 고칠 것 있음
   ========================================================================== */
const path = require('path'), fs = require('fs'), http = require('http');
const ROOT = path.resolve(__dirname, '..');
let pw; try { pw = require('playwright'); } catch (e) { console.error('playwright 필요: npm i --no-save playwright@1.49.0 && npx playwright install chromium'); process.exit(2); }

const ARGV = process.argv.slice(2);
const QUICK = ARGV.includes('--quick'), EXTERNAL = ARGV.includes('--external');
const LIVE = !!process.env.BASE;
const PORT = 8793;
const BASE = (process.env.BASE || `http://127.0.0.1:${PORT}`).replace(/\/$/, '');
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || '';

/* 점검 기준(숫자를 바꾸면 기준이 바뀐다) */
const LIMIT = { lcp: 4000, load: 8000, longtask: 300, clickLongtask: 300, clickWait: 550, clicksPerView: 60 };
const ARCHIVE = /^(archive|games|gongyak|manifesto)\.html$/;
const SKIP_PAGES = /^(google[0-9a-f]+|naver[0-9a-f]+|admin|404|kimbomi_banner)\.html$/;   /* 소유권 확인·관리자·404·배너 시안(noindex, 연결 없음)은 따로 */
/* vercel.json 에서 다른 쪽으로 넘기는 주소(예: narasalim.html → budget365.html)는 실제로 열리지 않으므로 뺀다 */
const REDIRECTED = new Set((() => { try { return (JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).redirects || []).filter(r => !r.has).map(r => String(r.source).replace(/^\//, '')); } catch (e) { return []; } })());

/* ── 정적 서버(로컬 점검용) ── */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.xml': 'application/xml', '.txt': 'text/plain', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.gz': 'application/gzip' };
function serve() {
  return new Promise(r => {
    const s = http.createServer((q, res) => {
      let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/' ) p = '/index.html';
      if (p.startsWith('/api/')) { res.writeHead(204); res.end(); return; }   /* 서버 함수는 로컬에 없다 */
      const f = path.join(ROOT, p); if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('not found'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }); res.end(d); });
    });
    s.listen(PORT, () => r(s));
  });
}

/* ── 점검할 쪽과 우리동네365 화면 ── */
const PAGES = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && !SKIP_PAGES.test(f) && !REDIRECTED.has(f)).sort();
const B365 = ['#/', '#/sido/' + encodeURIComponent('서울특별시'), '#/lg/4682000', '#/lg/4682000/budget', '#/lg/4682000/exec', '#/lg/4682000/contract',
  '#/lg/4682000/diag', '#/lg/4682000/pledge', '#/lg/4682000/peer', '#/lg/1100000', '#/lg/3611000', '#/gov', '#/gov/' + encodeURIComponent('보건복지부'),
  '#/gov27', '#/gov27/' + encodeURIComponent('보건복지부'), '#/policy', '#/key', '#/task', '#/spol', '#/docs', '#/q/' + encodeURIComponent('노인일자리')];
const VIEWS = [{ tag: 'PC', w: 1280, h: 900 }, { tag: '휴대폰', w: 360, h: 780, mobile: true }];

const issues = []; const stats = [];
function add(sev, where, kind, msg) { issues.push({ sev, where, kind, msg: String(msg).slice(0, 300) }); }

/* 바깥 링크 확인(한 번만) */
const extSeen = new Map();
const { execFileSync } = require('child_process');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
/* 로그인 화면으로 돌려보내거나 기계 접속을 막는 곳: 사람 브라우저에서는 열린다(2026-11-12 Chrome으로 확인) */
const BOT_WALL = /(^|\.)(facebook\.com|instagram\.com|x\.com|twitter\.com|threads\.net|linkedin\.com)$/;
async function checkExternal(req, url) {
  if (extSeen.has(url)) return extSeen.get(url);
  let st = 0, note = '';
  try { const host = new URL(url).hostname; if (BOT_WALL.test(host)) { const r = { st: 200, note: '로그인 벽(사람 브라우저로 확인)' }; extSeen.set(url, r); return r; } } catch (e) {}
  /* curl이 있으면 브라우저처럼 GET 으로 확인(HEAD·짧은 머리글을 거부하는 언론사가 많다) */
  try { const out = execFileSync('curl', ['-s', '-o', '/dev/null', '-L', '--max-time', '25', '-A', UA, '-H', 'Accept-Language: ko-KR,ko', '-w', '%{http_code}', url], { encoding: 'utf8', timeout: 30000 }); st = +out.trim(); if (st > 0) { const r = { st, note: st >= 400 ? 'curl' : '' }; extSeen.set(url, r); return r; } note = 'curl 응답 없음'; } catch (e) { note = 'curl: ' + String(e.message).split('\n')[0].slice(0, 80); }
  try {
    let r = await req.fetch(url, { method: 'HEAD', timeout: 15000, maxRedirects: 6, failOnStatusCode: false });
    st = r.status();
    if (st === 405 || st === 403 || st === 400 || st === 404 || st === 501) { r = await req.fetch(url, { method: 'GET', timeout: 20000, maxRedirects: 6, failOnStatusCode: false }); st = r.status(); }
  } catch (e) { st = -1; note = String(e.message).split('\n')[0].slice(0, 120); }
  const res = { st, note }; extSeen.set(url, res); return res;
}

async function prepPage(ctx, where) {
  const pg = await ctx.newPage();
  const rec = { err: [], con: [], bad: [] };
  pg.on('pageerror', e => rec.err.push(String(e.message || e).split('\n')[0].slice(0, 200)));
  pg.on('console', m => { if (m.type() !== 'error') return; const t = m.text();
    if (/Failed to load resource/.test(t)) return;               /* 응답 쪽에서 따로 센다 */
    if (!LIVE && /\/api\//.test(t)) return;
    rec.con.push(t.slice(0, 200)); });
  pg.on('response', r => { const s = r.status(), u = r.url();
    if (s < 400) return; if (!LIVE && u.includes('/api/')) return;
    if (/google-analytics|googletagmanager|vercel-insights|_vercel\/insights|speed-insights/.test(u)) return;
    rec.bad.push(s + ' ' + u.replace(BASE, '').slice(0, 160)); });
  await pg.addInitScript(() => {
    window.__qa = { lt: [], lcp: 0, mut: 0 };
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__qa.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__qa.lcp = Math.round(e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
    document.addEventListener('DOMContentLoaded', () => { try { new MutationObserver(m => { window.__qa.mut += m.length; }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true }); } catch (e) {} });
  });
  return { pg, rec };
}

async function pageChecks(pg, rec, where, isArchive, req) {
  const sev = isArchive ? '기록관' : '고칠것';
  const info = await pg.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const fcp = (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0;
    const txt = document.body ? document.body.innerText : '';
    const bad = (txt.match(/\bundefined\b|\bNaN\b|\[object Object\]/g) || []);
    const imgs = [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.getAttribute('src') && i.offsetParent).map(i => i.getAttribute('src'));
    const ov = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
    const ovEl = ov ? [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > document.documentElement.clientWidth + 2 && r.width > 0 && getComputedStyle(e).position !== 'fixed'; }).slice(0, 3).map(e => e.tagName + '.' + String(e.className).slice(0, 30)) : [];
    const links = [...document.querySelectorAll('a[href]')].map(a => ({ h: a.getAttribute('href'), t: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 30), blank: a.target === '_blank', rel: a.rel || '', vis: !!a.offsetParent }));
    const lt = window.__qa ? window.__qa.lt : [];
    return { load: Math.round(nav.loadEventEnd || 0), dcl: Math.round(nav.domContentLoadedEventEnd || 0), fcp: Math.round(fcp), lcp: window.__qa ? window.__qa.lcp : 0,
      lt: lt.reduce((m, x) => Math.max(m, x[1]), 0), ltSum: lt.reduce((s, x) => s + x[1], 0), bad, imgs, ov, ovEl, links, len: txt.length };
  });
  stats.push({ where, load: info.load, fcp: info.fcp, lcp: info.lcp, longtask: info.lt, longtaskSum: info.ltSum });
  if (info.lcp > LIMIT.lcp) add('느림', where, '여는 시간', `가장 큰 표시 ${info.lcp}ms (기준 ${LIMIT.lcp}ms)`);
  if (info.load > LIMIT.load) add('느림', where, '여는 시간', `load ${info.load}ms (기준 ${LIMIT.load}ms)`);
  if (info.lt > LIMIT.longtask) add('느림', where, '버벅임', `여는 중 가장 긴 멈춤 ${info.lt}ms (기준 ${LIMIT.longtask}ms)`);
  rec.err.forEach(e => add(sev, where, '스크립트 오류', e));
  rec.con.forEach(e => add(sev, where, '콘솔 오류', e));
  rec.bad.forEach(e => add(sev, where, '응답 오류', e));
  if (info.bad.length) add(sev, where, '이상한 글자', [...new Set(info.bad)].join(', '));
  info.imgs.forEach(s => add(sev, where, '깨진 그림', s));
  if (info.ov) add(sev, where, '가로 넘침', '옆으로 밀리는 화면 ' + info.ovEl.join(', '));
  if (info.len < 150) add(sev, where, '빈 화면', `본문 ${info.len}자`);
  rec.err.length = 0; rec.con.length = 0; rec.bad.length = 0;
  /* 링크 */
  for (const L of info.links) {
    const h = (L.h || '').trim();
    if (h === '#') continue;   /* href="#" 은 스크립트로 동작하는 단추 — 단추 누르기에서 반응을 본다 */
    if (!h) { if (L.vis) add(sev, where, '빈 링크', `「${L.t}」 href 비어 있음`); continue; }
    if (/^javascript:/i.test(h)) continue;
    if (L.blank && !/noopener|noreferrer/.test(L.rel)) add(sev, where, '새 창 링크', `「${L.t}」 ${h.slice(0, 80)} rel="noopener" 없음`);
    if (/^(mailto:|tel:|sms:)/i.test(h)) continue;
    if (/^#/.test(h)) {
      if (/^#\//.test(h)) continue;   /* 우리동네365 화면 이동은 화면 점검에서 */
      const id = decodeURIComponent(h.slice(1)); const ok = await pg.evaluate(id => !!(document.getElementById(id) || document.getElementsByName(id)[0]), id);
      if (!ok) add(sev, where, '목적지 없는 링크', `「${L.t}」 ${h}`); continue;
    }
    let u; try { u = new URL(h, pg.url()); } catch (e) { add(sev, where, '잘못된 링크', h); continue; }
    if (u.origin === new URL(BASE).origin || /김보미\.com|xn--4k0b53xuva\.com/.test(u.hostname)) {
      let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
      if (LIVE) { const r = await checkExternal(req, u.origin === new URL(BASE).origin ? u.href.split('#')[0] : BASE + u.pathname + u.search); if (r.st >= 400 || r.st < 0) add(sev, where, '깨진 사이트 안 링크', `「${L.t}」 ${p} → ${r.st} ${r.note}`); }
      else if (!p.startsWith('/api/') && !fs.existsSync(path.join(ROOT, p)) && !fs.existsSync(path.join(ROOT, p + '.html')) && !/^\/(narasalim)(\.html)?$/.test(p)) add(sev, where, '깨진 사이트 안 링크', `「${L.t}」 ${p} 파일 없음`);
      continue;
    }
    if (EXTERNAL && /^https?:/.test(u.protocol)) {
      const r = await checkExternal(req, u.href);
      const T = String(L.t).replace(/\s+/g, ' ');
      if ([404, 410].includes(r.st)) add(sev, where, '깨진 바깥 링크', `「${T}」 ${u.href.slice(0, 120)} → ${r.st}`);
      else if (r.st >= 400 && ![401, 403, 429, 999].includes(r.st)) add('확인필요', where, '바깥 사이트 오류', `「${T}」 ${u.href.slice(0, 120)} → ${r.st}`);
      else if (r.st < 0 || r.st === 0) add('확인필요', where, '열리지 않는 바깥 링크', `「${String(L.t).replace(/\s+/g, ' ')}」 ${u.href.slice(0, 120)} → ${r.note}`);
    }
  }
}

/* 보이는 단추 모으기: 같은 모양은 한 번만 */
async function collectButtons(pg) {
  return pg.evaluate((cap) => {
    const vis = e => { const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' && !e.closest('[hidden],[aria-hidden="true"]'); };
    const sel = 'button, [role="button"], summary, [onclick], a[href^="#"]:not([href^="#/"]), input[type="button"], input[type="submit"]';
    const out = [], seen = new Set();
    document.querySelectorAll(sel).forEach((e, i) => {
      if (!vis(e) || e.disabled || e.closest('#bomi')) return;
      /* 이미 골라져 있는 탭·칩은 다시 눌러도 바뀌지 않는 게 맞다 */
      if (e.matches('.on,.active,[aria-pressed="true"],[aria-selected="true"],[aria-current]:not([aria-current="false"])')) return;
      if (e.matches('a') && !e.matches('[onclick]') && e.getAttribute('href') !== '#' && !/^#[^/]/.test(e.getAttribute('href') || '')) return;
      if (e.type === 'submit' && e.form) return;              /* 글 보내기 단추는 누르지 않는다 */
      const txt = (e.innerText || e.value || e.getAttribute('aria-label') || e.title || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const sig = e.tagName + '|' + String(e.className).replace(/\b(on|open|active|sel)\b/g, '').trim().slice(0, 40) + '|' + (e.closest('tr') ? 'TR' : txt.replace(/[\d,.%]+/g, '9'));
      if (seen.has(sig)) return; seen.add(sig);
      e.setAttribute('data-qa', String(i)); out.push({ id: String(i), txt: txt || '(글자 없음)', tag: e.tagName });
    });
    return out.slice(0, cap);
  }, LIMIT.clicksPerView);
}

async function clickAll(ctx, pg, rec, where, url, sev, restore) {
  const btns = await collectButtons(pg);
  let n = 0;
  for (const b of btns) {
    const exists = await pg.$(`[data-qa="${b.id}"]`);
    if (!exists) { await restore(); continue; }
    const before = await pg.evaluate(() => ({ url: location.href, mut: window.__qa.mut, lt: window.__qa.lt.length, sy: window.scrollY }));
    let popup = null, dl = null, dialog = null;
    const onPage = p => { popup = p; }; const onDl = d => { dl = d; }; const onDlg = d => { dialog = d.message().slice(0, 60); d.dismiss().catch(() => {}); };
    ctx.on('page', onPage); pg.on('download', onDl); pg.on('dialog', onDlg);
    let clickErr = '', apiCalls = 0; const onReq = r => { if (r.url().includes('/api/')) apiCalls++; }; pg.on('request', onReq);
    try { await exists.click({ timeout: 8000 }); }
    catch (e) {
      const m = String(e.message);
      /* 계속 움직이는(숨쉬는 효과) 단추는 기계가 「멈출 때까지」 기다리다 못 누른다. 사람은 누를 수 있으므로 힘으로 한 번 더 */
      if (/stable|Timeout/.test(m)) { try { await exists.click({ timeout: 4000, force: true }); } catch (e2) { clickErr = String(e2.message).split('\n')[0].slice(0, 120); } }
      else clickErr = m.split('\n')[0].slice(0, 120);
    }
    await pg.waitForTimeout(LIMIT.clickWait);
    ctx.off('page', onPage); pg.off('download', onDl); pg.off('dialog', onDlg); pg.off('request', onReq);
    n++;
    const label = `「${b.txt}」`;
    let after;
    try { after = await pg.evaluate(() => ({ url: location.href, mut: window.__qa ? window.__qa.mut : -1, lt: window.__qa ? window.__qa.lt : [], sy: window.scrollY })); }
    catch (e) { after = null; }
    if (clickErr && !/intercepts pointer events|not visible|detached|outside of the viewport/.test(clickErr)) add(sev, where, '누를 수 없음', `${label} ${clickErr}`);
    else if (clickErr) add('확인필요', where, '가려진 단추', `${label} 다른 것에 가려 눌리지 않음`);
    if (rec.err.length) { add(sev, where, '누르면 오류', `${label} → ${rec.err[0]}`); rec.err.length = 0; }
    if (rec.con.length) { add(sev, where, '누르면 콘솔 오류', `${label} → ${rec.con[0]}`); rec.con.length = 0; }
    if (rec.bad.length) { add(sev, where, '누르면 응답 오류', `${label} → ${rec.bad[0]}`); rec.bad.length = 0; }
    if (after) {
      const newLt = after.lt.slice(before.lt).reduce((m, x) => Math.max(m, x[1]), 0);
      if (newLt > LIMIT.clickLongtask) add('느림', where, '누르면 버벅임', `${label} 멈춤 ${newLt}ms`);
      const moved = after.url !== before.url || after.mut > before.mut || popup || dl || dialog || Math.abs(after.sy - before.sy) > 20;
      if (!moved && !clickErr) { if (!LIVE && apiCalls) add('확인필요', where, '서버 함수 단추', `${label} 로컬에는 /api 가 없어 확인 못 함 — BASE=배포주소로 다시 점검`); else add(sev, where, '반응 없음', `${label} 눌러도 아무것도 바뀌지 않음`); }
    }
    if (popup) { const pu = popup.url(); await popup.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {}); if (!pu || pu === 'about:blank') { const u2 = popup.url(); if (!u2 || u2 === 'about:blank') add(sev, where, '빈 새 창', `${label} 새 창이 비어 있음`); } await popup.close().catch(() => {}); }
    if (!after || after.url !== before.url || dialog) await restore();
    else { await pg.keyboard.press('Escape').catch(() => {}); }
  }
  return n;
}

(async () => {
  const srv = LIVE ? null : await serve();
  const launch = {}; if (PROXY && (LIVE || EXTERNAL)) launch.proxy = { server: PROXY, bypass: '127.0.0.1,localhost' };
  const browser = await pw.chromium.launch(launch);
  const t0 = Date.now(); let clicks = 0;
  for (const V of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: V.w, height: V.h }, isMobile: !!V.mobile, hasTouch: !!V.mobile, acceptDownloads: true, deviceScaleFactor: 1 });
    /* 값을 바꾸는 요청은 보내지 않는다 */
    await ctx.route('**/*', (route, req) => {
      const m = req.method(); const u = req.url();
      if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS' && /\/api\//.test(u)) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"qa":"점검용 가짜 응답"}' });
      if (!LIVE && !EXTERNAL && !u.startsWith(BASE) && !/^data:|^blob:/.test(u)) {
        if (/cdnjs\.cloudflare\.com|fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|unpkg\.com/.test(u) && PROXY) return route.continue();
        return route.abort();
      }
      return route.continue();
    });
    const req = ctx.request;
    const targets = [];
    for (const p of PAGES) { if (p === 'budget365.html') continue; targets.push({ url: '/' + encodeURI(p), name: p }); }
    for (const h of B365) targets.push({ url: '/budget365.html' + h, name: 'budget365.html' + decodeURIComponent(h), b365: true });
    for (const T of targets) {
      const where = `${V.tag} ${T.name}`; const isArchive = ARCHIVE.test(T.name); const sev = isArchive ? '기록관' : '고칠것';
      const { pg, rec } = await prepPage(ctx, where);
      const open = async () => {
        try { await pg.goto(BASE + T.url, { waitUntil: 'load', timeout: 45000 }); } catch (e) { add(sev, where, '열리지 않음', String(e.message).split('\n')[0]); return false; }
        await pg.waitForTimeout(T.b365 ? 4500 : 2000);
        return true;
      };
      if (!(await open())) { await pg.close(); continue; }
      await pageChecks(pg, rec, where, isArchive, req);
      if (!QUICK) {
        const restore = async () => { await open(); rec.err.length = 0; rec.con.length = 0; rec.bad.length = 0; };
        clicks += await clickAll(ctx, pg, rec, where, T.url, sev, restore);
      }
      await pg.close();
      process.stdout.write('.');
    }
    await ctx.close();
  }
  await browser.close(); if (srv) srv.close();
  /* 결과 */
  const order = ['고칠것', '느림', '확인필요', '기록관'];
  issues.sort((a, b) => order.indexOf(a.sev) - order.indexOf(b.sev) || a.where.localeCompare(b.where));
  const outDir = path.join(ROOT, 'tools', 'out'); fs.mkdirSync(outDir, { recursive: true });
  const sum = order.map(s => `${s} ${issues.filter(i => i.sev === s).length}`).join(' · ');
  fs.writeFileSync(path.join(outDir, 'qa-all.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), clicks, sum, issues, stats }, null, 1));
  const md = [`# 전 페이지·링크·단추 점검`, ``, `- 대상: ${BASE}`, `- 시각: ${new Date().toISOString()}`, `- 쪽·화면 ${stats.length}개(두 너비), 단추 ${clicks}번 누름, ${Math.round((Date.now() - t0) / 1000)}초`, `- 결과: ${sum}`, ``,
    `| 구분 | 위치 | 종류 | 내용 |`, `|---|---|---|---|`, ...issues.map(i => `| ${i.sev} | ${i.where} | ${i.kind} | ${i.msg.replace(/\|/g, '/')} |`), ``,
    `## 여는 시간(ms)`, `| 위치 | FCP | LCP | load | 가장 긴 멈춤 |`, `|---|---|---|---|---|`, ...stats.map(s => `| ${s.where} | ${s.fcp} | ${s.lcp} | ${s.load} | ${s.longtask} |`)].join('\n');
  fs.writeFileSync(path.join(outDir, 'qa-all.md'), md);
  console.log(`\n${'─'.repeat(60)}\n${sum} · 단추 ${clicks}번 · ${Math.round((Date.now() - t0) / 1000)}초\n결과: tools/out/qa-all.md`);
  process.exit(issues.some(i => i.sev === '고칠것') ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
