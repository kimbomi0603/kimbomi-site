#!/usr/bin/env node
/* ============================================================
   data-integrity-guard v2 — 4대 기준 자동 감사
   ① 렌더된 화면값 ↔ 실 API 응답 대조 (클릭 경로 포함)
   ② 페이지 간 공유 수치 일치
   ③ 집계·홍보 문구 ↔ 실목록 개수 대조
   ④ 성능예산 (이미지·번들·페이지 총 전송량)
   ⑤ 독립 경로 값 대조 — 같은 데이터를 다른 구현으로 부른 값과 필드별로 맞춘다
      (2026-08-29 추가. rows>0 만 보면 "전국 첫 행을 우리 지자체 값으로 표시"하는 결함을 놓친다.
       실제로 9건이 서울·전국 값을 강진군 값처럼 보여주고 있었다.)
   ⑥ 링크 생존 — 화면이 거는 외부 링크가 실제로 열리는가
      (403·429는 봇 차단·레이트리밋이므로 '죽음'으로 단정하지 않는다. YouTube은 oEmbed로 실존 확인.)
   원칙: 코드 grep이 아니라 "사용자가 보는 픽셀"을 판정 근거로 삼는다.
   ============================================================ */
const pw = require('/tmp/node_modules/playwright-core');
const fs = require('fs');
const CFG = JSON.parse(fs.readFileSync(process.argv[2] || '/home/claude/guard/sites.json', 'utf8'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126 Safari/537.36';
const BUDGET = { pageBytes: 5 * 1048576, assetBytes: 1 * 1048576, apiMs: 8000 };

const findings = [];
function add(sev, site, page, kind, msg, ev) {
  findings.push({ sev, site, page, kind, msg, evidence: ev || null });
}

/* 요청 프록시 — 메서드·헤더·본문을 반드시 보존한다 (GET 강제는 405 오탐의 원인) */
async function installRoute(ctx, onApi, onBad, onAsset) {
  await ctx.route('**/*', async r => {
    const req = r.request(), u = req.url();
    if (/googletagmanager|google-analytics|gtag|doubleclick|facebook\.net/.test(u)) return r.abort();
    try {
      const init = { method: req.method(), headers: { ...req.headers(), 'User-Agent': UA } };
      const pd = req.postData();
      if (pd && !['GET', 'HEAD'].includes(req.method())) init.body = pd;
      delete init.headers['content-length'];
      const t0 = Date.now();
      const res = await fetch(u, init);
      const buf = Buffer.from(await res.arrayBuffer());
      const ms = Date.now() - t0;
      if (/\/api\//.test(u)) {
        let rows = null, empty = false;
        try { const j = JSON.parse(buf.toString());
          const a = Array.isArray(j) ? j : (j.rows || j.data || j.list || j.items);
          if (Array.isArray(a)) rows = a.length;
          if (j && (j.empty === true || j.ok === false)) empty = true;
        } catch (e) {}
        onApi({ m: req.method(), u, status: res.status, rows, empty, ms });
      } else if (buf.length > 0) {
        const ext = (CFG.excludeAssetHosts || []).some(h => u.includes(h));
        onAsset({ u, bytes: buf.length, external: ext });
      }
      if (res.status >= 400) onBad(`${req.method()} ${res.status} ${u}`);
      return r.fulfill({ status: res.status, body: buf,
        headers: { 'content-type': res.headers.get('content-type') || 'text/html' } });
    } catch (e) { onBad('NETFAIL ' + u); return r.abort(); }
  });
}

(async () => {
  const br = await pw.chromium.launch({ executablePath: CFG.chromium });
  const shared = {};   /* ② 공유수치: label -> Set("value@site/page") */

  for (const site of CFG.sites) {
    for (const path of site.pages) {
      const ctx = await br.newContext({ viewport: { width: 1366, height: 950 } });
      const api = [], bad = [], assets = [], errs = [];
      await installRoute(ctx, a => api.push(a), b => bad.push(b), a => assets.push(a));
      const pg = await ctx.newPage();
      pg.on('pageerror', e => errs.push('JS: ' + String(e).slice(0, 140)));
      pg.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 140)); });

      let navOk = true;
      try { await pg.goto(site.base + path, { waitUntil: 'domcontentloaded', timeout: 60000 }); }
      catch (e) { navOk = false; add('HIGH', site.name, path, 'nav', '페이지 로드 실패', String(e).slice(0, 120)); }
      if (!navOk) { await ctx.close(); continue; }
      await pg.waitForTimeout(site.waitMs || 9000);

      const dom = await pg.evaluate(() => {
        const t = document.body.innerText || '';
        const im = [...document.querySelectorAll('img')];
        return {
          text: t,
          len: t.length,
          loading: (t.match(/로딩\s*중|불러오는 중|Loading\.\.\./g) || []).length,
          nan: (t.match(/\bNaN\b|\bundefined\b|\[object Object\]|\bnull\b원/g) || []).length,
          imgs: im.length,
          /* src 속성이 아예 없는 img(라이트박스 자리표시자 등)는 요청을 만들지 않으므로 정상.
             빈 문자열 src="" 만 결함으로 본다 — 브라우저가 현재 페이지를 이미지로 재요청한다. */
          brokenImgs: im.filter(x => x.complete && x.naturalWidth === 0 && x.getAttribute('src') !== null)
                        .map(x => ({ src: x.getAttribute('src'), id: x.id, alt: x.alt })),
          emptySrc: im.filter(x => !x.getAttribute('src')).length,
          lists: [...document.querySelectorAll('ul,ol')].map(u => u.querySelectorAll(':scope > li').length),
          deadAnchors: [...document.querySelectorAll('a[href]')]
            .filter(a => ['#', '', 'javascript:void(0)'].includes(a.getAttribute('href'))).length
        };
      });

      /* ── ① 렌더 ↔ API ─────────────────────────────── */
      const emptyApis = api.filter(a => a.rows === 0 || a.empty);
      const failApis  = api.filter(a => a.status >= 400);
      const slowApis  = api.filter(a => a.ms > BUDGET.apiMs);
      failApis.forEach(a => add('HIGH', site.name, path, '①API실패',
        `API가 ${a.status}를 반환하는데 화면에는 오류 안내가 없음`, `${a.m} ${a.u}`));
      if (emptyApis.length && !/데이터 없음|자료 없음|—/.test(dom.text))
        add('HIGH', site.name, path, '①빈응답_무고지',
          `API ${emptyApis.length}건이 빈 응답인데 화면에 '데이터 없음' 표기가 없음`,
          emptyApis.slice(0, 3).map(a => a.u).join(' | '));
      slowApis.forEach(a => add('MED', site.name, path, '①API지연', `${a.ms}ms`, a.u));
      if (dom.loading > 0) {
        /* 로딩 표시가 남아 있으면 추가로 최대 25초까지 지켜본다.
           끝내 안 풀리면 ①영구로딩(HIGH), 늦게라도 풀리면 ④성능_지연로딩(MED). */
        let resolvedAt = null, snap = null;
        for (const extra of [5000, 5000, 5000, 5000]) {
          await pg.waitForTimeout(extra);
          const r = await pg.evaluate(() => {
            const t = document.body.innerText || '';
            const m = /로딩\s*중|불러오는 중|Loading\.\.\./.exec(t);
            return { n: (t.match(/로딩\s*중|불러오는 중|Loading\.\.\./g) || []).length,
                     s: m ? t.slice(Math.max(0, m.index - 70), m.index + 60).replace(/\s+/g, ' ') : null };
          });
          snap = r.s;
          if (r.n === 0) { resolvedAt = (site.waitMs || 9000) + extra; break; }
        }
        if (resolvedAt === null)
          add('HIGH', site.name, path, '①영구로딩',
            `${((site.waitMs || 9000) + 20000) / 1000}초가 지나도 '로딩 중'이 풀리지 않음`, snap);
        else
          add('MED', site.name, path, '④성능_지연로딩',
            `콘텐츠가 약 ${Math.round(resolvedAt / 1000)}초 뒤에야 표시됨 (사용자 이탈 구간)`, snap);
      }
      if (dom.nan > 0)
        add('HIGH', site.name, path, '①깨진값', `NaN/undefined/[object Object] ${dom.nan}곳 노출`, null);

      /* 클릭 경로 검증: "실데이터 보기" 류 카드가 실제로 값을 보여주는가 */
      for (const probe of (site.clickProbes || [])) {
        if (!path.startsWith(probe.page)) continue;
        for (const label of probe.labels) {
          try {
            const b = pg.locator(probe.selector).filter({ hasText: label }).first();
            if (!(await b.count())) continue;
            const cardText = (await b.innerText()).replace(/\s+/g, ' ');
            await b.click(); await pg.waitForTimeout(probe.waitMs || 4500);
            const modal = await pg.evaluate(sel => {
              const d = [...document.querySelectorAll('div')].find(x => new RegExp(sel).test(x.className || ''));
              return d ? d.innerText.replace(/\s+/g, ' ').slice(0, 300) : null;
            }, probe.modalClass);
            if (modal && probe.emptyPattern && new RegExp(probe.emptyPattern).test(modal))
              add('HIGH', site.name, path, '①표기_실제_불일치',
                `카드에는 "${(cardText.match(probe.claimPattern) || [''])[0] || '보유'}"로 표시되는데 클릭 결과는 데이터 없음`,
                `카드="${cardText.slice(0, 90)}" → 결과="${modal.slice(0, 90)}"`);
            await pg.keyboard.press('Escape').catch(() => {});
            await pg.waitForTimeout(600);
          } catch (e) {}
        }
      }

      /* ── ③ 집계 문구 ↔ 실목록 ─────────────────────── */
      for (const c of (site.claims || [])) {
        if (!path.startsWith(c.page)) continue;
        const m = dom.text.match(new RegExp(c.pattern));
        if (!m) { add('MED', site.name, path, '③집계문구_소실', `기대한 집계 문구를 찾지 못함: ${c.pattern}`); continue; }
        const claimed = parseInt(String(m[1]).replace(/,/g, ''), 10);
        const actual = await pg.evaluate(sel => document.querySelectorAll(sel).length, c.countSelector);
        if (Number.isFinite(claimed) && actual > 0 && claimed !== actual)
          add('HIGH', site.name, path, '③집계_불일치',
            `화면 문구는 ${claimed}${c.unit || '개'}인데 실제 목록은 ${actual}${c.unit || '개'}`,
            `문구="${m[0]}" 셀렉터="${c.countSelector}"`);
      }

      /* ── ② 공유 수치 수집 ─────────────────────────── */
      for (const s of (site.sharedMetrics || [])) {
        const re = new RegExp(s.pattern);
        const m = dom.text.match(re);
        if (m) (shared[s.key] = shared[s.key] || []).push({ v: m[1].trim(), site: site.name, page: path });
      }

      /* ── ④ 성능예산 ───────────────────────────────── */
      /* 자사 자산만 성능예산에 산입 — 외부 위젯(유튜브·페북 등)은 통제 불가하므로 제외 */
      const own = assets.filter(a => !a.external);
      const pageBytes = own.reduce((a, x) => a + x.bytes, 0) + dom.len;
      if (pageBytes > BUDGET.pageBytes)
        add('MED', site.name, path, '④성능_페이지',
          `페이지 총 전송량 ${(pageBytes / 1048576).toFixed(2)} MB (예산 ${(BUDGET.pageBytes / 1048576)} MB)`,
          `자사 자산 ${own.length}개 / 전체 ${assets.length}개`);
      own.filter(a => a.bytes > BUDGET.assetBytes)
        .sort((a, b) => b.bytes - a.bytes).slice(0, 5)
        .forEach(a => add('MED', site.name, path, '④성능_자산',
          `${(a.bytes / 1048576).toFixed(2)} MB 단일 자산`, a.u.slice(0, 110)));

      /* 기타 위생 */
      dom.brokenImgs.forEach(b => add('MED', site.name, path, '깨진이미지',
        b.src === '' || b.src === null ? 'src가 비어 있는 <img> (불필요한 요청·콘솔 오류 유발)' : '이미지 로드 실패',
        JSON.stringify(b)));
      bad.slice(0, 5).forEach(b => add('MED', site.name, path, '자원실패', b.slice(0, 130)));
      errs.slice(0, 5).forEach(e => add('LOW', site.name, path, '콘솔오류', e));

      await ctx.close();
    }
  }

  /* ── ⑤ 독립 경로 값 대조 ─────────────────────────────
     같은 데이터를 서로 다른 구현으로 부른 값을 필드별로 맞춘다.
     값이 "있다"는 것과 "맞다"는 것은 다르다. */
  for (const cc of (CFG.crossChecks || [])) {
    let keys = cc.keys || [];
    if (cc.keysFrom) {
      try {
        const r = await fetch(cc.keysFrom, { headers: { 'User-Agent': UA } });
        const j = await r.json();
        keys = (cc.keysPath ? cc.keysPath.split('.').reduce((o, k) => o?.[k], j) : j) || [];
      } catch (e) { add('MED', cc.name, '(교차대조)', '⑤키목록_실패', String(e).slice(0, 90)); }
    }
    let mismatch = 0, checked = 0, empty = 0;
    for (const key of keys.slice(0, cc.limit || 200)) {
      try {
        const a = await (await fetch(cc.a.replace('{key}', key), { headers: { 'User-Agent': UA } })).json();
        const ar = (a.rows || a.data || [])[0];
        if (!ar) { empty++; continue; }
        const bUrl = cc.b.replace('{key}', key).replace('{fyr}', a.usedFyr || cc.fyr || '');
        const b = await (await fetch(bUrl, { headers: { 'User-Agent': UA } })).json();
        const br = (b.rows || b.data || []).find((x) => !cc.matchField || String(x[cc.matchField]) === String(cc.matchValue)) || (b.rows || [])[0];
        if (!br) { empty++; continue; }
        checked++;
        const diffs = [];
        for (const [k, v] of Object.entries(ar)) {
          if (!(k in br)) continue;
          const x = Number(v), y = Number(br[k]);
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          if (Math.abs(x - y) > Math.max(0.01, Math.abs(y) * 1e-9)) diffs.push(`${k}: ${v} vs ${br[k]}`);
        }
        if (diffs.length) {
          mismatch++;
          add('HIGH', cc.name, key, '⑤값_불일치',
            '독립 경로와 값이 다름 — 다른 지역/집계의 값을 보여주고 있을 수 있음', diffs.slice(0, 3).join(' | '));
        }
      } catch (e) { /* 개별 실패는 무시하고 계속 */ }
    }
    if (checked) console.error(`  [⑤ ${cc.name}] 대조 ${checked}건 · 불일치 ${mismatch} · 빈값 ${empty}`);
  }

  /* ── ⑥ 링크 생존 ─────────────────────────────────────
     403(봇 차단)·429(레이트리밋)는 '죽은 링크'가 아니다 — 판정 보류로 남긴다. */
  for (const lc of (CFG.linkChecks || [])) {
    let urls = [];
    try {
      const html = await (await fetch(lc.page, { headers: { 'User-Agent': UA } })).text();
      urls = [...new Set([...html.matchAll(new RegExp(lc.pattern, 'g'))].map((m) => m[1].replace(/&amp;/g, '&')))];
    } catch (e) { add('MED', lc.name, lc.page, '⑥링크목록_실패', String(e).slice(0, 90)); continue; }
    let dead = 0, blocked = 0, alive = 0;
    for (const u of urls.slice(0, lc.limit || 250)) {
      /* YouTube은 oEmbed가 실존 여부의 정답 — 시청 페이지는 레이트리밋에 걸린다 */
      if (/youtube\.com\/watch|youtu\.be\//.test(u)) {
        try {
          const r = await fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent(u) + '&format=json', { headers: { 'User-Agent': UA } });
          if (r.status === 200) alive++;
          else { dead++; add('MED', lc.name, u.slice(0, 70), '⑥영상_없음', 'oEmbed ' + r.status); }
        } catch (e) { blocked++; }
        continue;
      }
      let st = 0;
      for (let k = 0; k < 3; k++) {
        try {
          const r = await fetch(u, { headers: { 'User-Agent': UA, Referer: 'https://www.google.com/', 'Accept-Language': 'ko-KR,ko;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
          st = r.status; if (st < 400) break;
        } catch (e) { st = 0; }
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (st >= 200 && st < 400) alive++;
      else if (st === 403 || st === 429) blocked++;
      else { dead++; add('MED', lc.name, u.slice(0, 70), '⑥죽은링크', 'HTTP ' + st); }
    }
    console.error(`  [⑥ ${lc.name}] 링크 ${urls.length} · 정상 ${alive} · 죽음 ${dead} · 차단(판정보류) ${blocked}`);
  }

  /* ② 판정 */
  for (const [k, arr] of Object.entries(shared)) {
    const vals = [...new Set(arr.map(x => x.v))];
    if (vals.length > 1)
      add('HIGH', '(교차)', '(여러 페이지)', '②공유수치_불일치',
        `"${k}"가 페이지마다 다름: ${vals.join(' vs ')}`,
        arr.map(x => `${x.v} @ ${x.site}${x.page}`).join(' | '));
  }

  await br.close();
  const out = { at: new Date().toISOString(), total: findings.length,
    high: findings.filter(f => f.sev === 'HIGH').length,
    med: findings.filter(f => f.sev === 'MED').length,
    low: findings.filter(f => f.sev === 'LOW').length, findings };
  fs.writeFileSync('/home/claude/guard/last_report.json', JSON.stringify(out, null, 1));
  console.log(`\n═══ data-integrity-guard v2 ═══`);
  console.log(`HIGH ${out.high} · MED ${out.med} · LOW ${out.low}\n`);
  ['HIGH', 'MED', 'LOW'].forEach(s => {
    const g = findings.filter(f => f.sev === s);
    if (!g.length) return;
    console.log(`── ${s} ──`);
    g.forEach(f => { console.log(`  [${f.kind}] ${f.site}${f.page} — ${f.msg}`);
      if (f.evidence) console.log(`      ↳ ${String(f.evidence).slice(0, 150)}`); });
    console.log();
  });
  process.exit(out.high > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(2); });
