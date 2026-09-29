#!/usr/bin/env node
/* ============================================================================
   L5 운영 화면 대조 — 5중 검증의 마지막 층 (2026-09-29 신설)

   tools/verify_data.py 가 원자료·API·교차 대조를 통과한 값으로 audit-out/expect.json(기대값)을 만든다.
   이 스크립트는 실제 사이트 화면(우리동네365 지자체 화면)을 243곳 전부 열어,
   화면에 찍힌 숫자가 기대값과 한 글자까지 같은지 본다. 막힌 값은 화면에 '—'로 나와야 한다.

   실행:  python3 tools/verify_data.py        # 기대값 만들기
          node tools/verify-screen.js [BASE]  # 기본 BASE = 운영 사이트
   결과:  audit-out/screen.md, 종료코드 1 = 어긋난 화면 있음
   ============================================================================ */
const fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/usr/local/lib/node_modules_global/playwright')); }
const ROOT = path.join(__dirname, '..');
const BASE = process.argv[2] || process.env.KB_BASE || 'https://www.xn--4k0b53xuva.com';
const EXP = JSON.parse(fs.readFileSync(path.join(ROOT, 'audit-out/expect.json'), 'utf8')).lg;
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const num = v => Number(v).toLocaleString('ko-KR');
const pct = (v, d = 1) => Number(v).toFixed(d) + '%';
const ymd = s => String(s).replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3');

(async () => {
  const b = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? undefined : undefined });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const cds = Object.keys(EXP).filter(c => !ONLY.length || ONLY.includes(c));
  const bad = [], ok = [];
  const W = 6; let i = 0;
  async function one(cd) {
    const p = await ctx.newPage();
    try {
      await p.goto(`${BASE}/budget365.html#/lg/${cd}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p.waitForSelector('.kpi, .empty', { timeout: 45000 });
      const got = await p.evaluate(() => {
        const t = s => (document.querySelector(s)?.textContent || '').replace(/\s+/g, ' ').trim();
        const kp = {}; document.querySelectorAll('.kpi > div').forEach(d => { kp[(d.querySelector('.l')?.textContent || '').trim()] = (d.querySelector('.n')?.textContent || '').replace(/\s+/g, ' ').trim(); });
        const gl = document.querySelector('.glance a[href$="/exec"]');
        return { kpi: kp, glN: gl ? (gl.querySelector('.n')?.textContent || '').trim() : null, glS: gl ? (gl.querySelector('.s')?.textContent || '').trim() : null,
          badges: t('.badges'), held: t('.note b') , body: document.body.innerText.slice(0, 200000) };
      });
      const e = EXP[cd] || {}; const miss = [];
      if (e.e26_rate != null) {
        if (got.glN !== pct(e.e26_rate)) miss.push(`올해 집행 ${got.glN} ≠ 기대 ${pct(e.e26_rate)}`);
        const s = `세부사업 ${num(e.e26_dbiz)}건 · ${ymd(e.e26_ymd)} 기준`;
        if (got.glS !== s) miss.push(`집행 기준 '${got.glS}' ≠ '${s}'`);
      }
      if (e.sr_rate2 != null) {
        const n = got.kpi['재정자립도 (2024 결산기준)'] || '';
        if (!n.startsWith(pct(e.sr_rate2, 2))) miss.push(`재정자립도 '${n}' ≠ ${pct(e.sr_rate2, 2)}`);
        if (e.sr_rank && !n.includes(`${e.sr_rank[0]}/${e.sr_rank[1]}위`)) miss.push(`재정자립도 순위 '${n}' ≠ ${e.sr_rank[0]}/${e.sr_rank[1]}위`);
      } else if (got.kpi['재정자립도 (2024 결산기준)'] && /\d/.test(got.kpi['재정자립도 (2024 결산기준)'])) {
        miss.push(`막혔거나 없는 재정자립도가 화면에 나옴 '${got.kpi['재정자립도 (2024 결산기준)']}'`);
      }
      if (e.pop != null && !got.badges.includes(`인구 ${num(e.pop)}명`)) miss.push(`인구 배지 '${got.badges.slice(0, 40)}' ≠ ${num(e.pop)}명`);
      if (/undefined|NaN/.test(got.body)) miss.push('undefined/NaN 노출');
      if (miss.length) bad.push({ cd, miss }); else ok.push(cd);
    } catch (err) { bad.push({ cd, miss: ['열기 실패 ' + String(err.message || err).slice(0, 120)] }); }
    finally { await p.close(); }
  }
  const run = async () => { while (i < cds.length) { const cd = cds[i++]; await one(cd); if ((ok.length + bad.length) % 40 === 0) console.log(`  화면 대조 ${ok.length + bad.length}/${cds.length}`); } };
  await Promise.all(Array.from({ length: W }, run));
  await b.close();
  const md = [`# L5 운영 화면 대조 (${new Date().toISOString().slice(0, 16)}Z · ${BASE})`, '', `- 지자체 ${cds.length}곳 · 일치 ${ok.length} · **어긋남 ${bad.length}**`, ''];
  bad.forEach(x => md.push(`- ${x.cd}: ${x.miss.join(' / ')}`));
  fs.mkdirSync(path.join(ROOT, 'audit-out'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'audit-out/screen.md'), md.join('\n') + '\n');
  console.log(md.slice(0, 3).join('\n')); bad.slice(0, 15).forEach(x => console.log(' ', x.cd, x.miss.join(' / ')));
  process.exit(bad.length ? 1 : 0);
})();
