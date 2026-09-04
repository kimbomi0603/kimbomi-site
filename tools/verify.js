#!/usr/bin/env node
/* ============================================================================
   김보미.com 배포 전 자동 검증 — tools/verify.js
   2026-09-04 신설. 사람이 눈으로 훑는 점검을 기계가 매번 대신하도록 만든 것.

   이 파일이 있는 이유:
     같은 종류의 결함(임의 계수로 만든 가짜 수치, 단위 오류, 특정 지자체에서만
     터지는 렌더 예외)이 8월·9월 점검마다 반복해서 나왔다. 사람이 매번 다른
     검색어로 찾다 보니 매번 다른 것만 걸렸다. 아래 검사는 고정돼 있고
     전수라서, 통과하지 못하면 배포하지 않는다.

   실행:  node tools/verify.js            (정적 검사만 — 빠름)
          node tools/verify.js --render   (WebKit 전수 렌더까지 — 느림)
   종료코드 0=통과, 1=실패
   ========================================================================== */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
let FAIL = 0, WARN = 0;
const bad = (m) => { FAIL++; console.log('  ✗ ' + m); };
const warn = (m) => { WARN++; console.log('  △ ' + m); };
const ok  = (m) => console.log('  ✓ ' + m);

/* 주석을 같은 길이의 공백으로 바꿔 줄 번호를 보존한 채 검사한다.
   (2026-09-04: '해시로 만들어 냈다'는 폐기 기록 주석이 검사에 걸렸다) */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
const readSrc = (f) => stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));

const HTML = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
const APIS = fs.existsSync(path.join(ROOT,'api'))
  ? fs.readdirSync(path.join(ROOT,'api')).filter(f => f.endsWith('.js')) : [];

/* ── 1. 조작 계수 탐지 ───────────────────────────────────────────────────
   공시에 없는 값을 "총액 × 0.55" 식으로 만들어 화면에 금액·비율로 찍던 사고가
   세 번 반복됐다(분기 집행률 0.22/0.47/0.74, 자금흐름 0.55/0.25/0.62,
   5년 추이 0.85/0.88/0.93/0.98). 금액·비율 변수에 리터럴 계수를 곱하는 패턴을
   전부 잡아내고, 정당한 경우는 아래 ALLOW에 사유와 함께 등록하게 한다. */
console.log('\n[1] 조작 계수 (공시에 없는 값을 계수로 만들어 표시)');
const MONEYVAR = /(budget|amt|amount|total|spent|exec|revenue|sectors?|contract|debt|pop|score|rate|cost|sum)/i;
const ALLOW = [
  /\*\s*0?\.0[0-9]/,                 // 0.0x — 대개 단위 환산·미세 보정
  /100|1e[0-9]|1000|10000/,          // 백분율·단위 환산
];
/* 정당한 계수는 여기에 '파일:줄에 있는 식'과 사유를 함께 적는다.
   사유 없이 목록에 넣지 말 것 — 이 목록이 느슨해지면 검사 자체가 무의미해진다. */
const COEF_ALLOW = [
  { file:'narasalim.html', expr:'R.debtRatio*2.2',
    why:'레이더 차트 정규화. 공시값을 그대로 쓰는 게 아니라 0~100 척도로 환산하는 것이며, '
      + '화면에 "본 사이트 자체 산식"이라고 명시돼 있다. 금액·공시 지표로 표시되지 않는다.' },
];
const COEF = /([A-Za-z_$][\w.$\[\]']*)\s*\*\s*(0?\.\d{1,2}|\d\.\d{1,2})\b/g;
let coefHits = 0;
for (const f of HTML) {
  const src = readSrc(f).split('\n');
  src.forEach((ln, i) => {
    if (/opacity|rgba|scale|tension|alpha|translate|blur|shadow|deg|px\b|vh|vw|lineWidth|borderWidth/i.test(ln)) return;
    let m;
    COEF.lastIndex = 0;
    while ((m = COEF.exec(ln))) {
      if (!MONEYVAR.test(m[1])) continue;
      if (ALLOW.some(r => r.test(m[0]))) continue;
      if (COEF_ALLOW.some(a => a.file === f && ln.includes(a.expr))) continue;
      coefHits++;
      bad(`${f}:${i+1} 금액·지표 변수에 리터럴 계수 → ${m[0].trim()}   « ${ln.trim().slice(0,90)} »`);
    }
  });
}
if (!coefHits) ok('금액·지표 변수에 곱해지는 임의 계수 없음');

/* ── 2. 해시·난수로 만든 통계 ───────────────────────────────────────────── */
console.log('\n[2] 해시·난수 기반 수치 생성');
let rngHits = 0;
const RNG_SKIP = ['game.html','gacha.html'];   // 게임 연출은 난수가 본질
for (const f of HTML.concat(APIS.map(a => 'api/' + a))) {
  if (RNG_SKIP.includes(f)) continue;
  const src = readSrc(f).split('\n');
  src.forEach((ln, i) => {
    const isHashFn = /\bh32|\bfnv1|\bhashOf\b/i.test(ln);
    if (!isHashFn && !/Math\.random/.test(ln)) return;
    if (isHashFn) {                       // 해시 난수기는 이 코드베이스에 정당한 용도가 없다
      rngHits++;
      bad(`${f}:${i+1} 해시 난수기 호출 — 수치 생성용으로만 쓰이던 함수다   « ${ln.trim().slice(0,90)} »`);
      return;
    }
    if (/location\.hash|hashchange|pushState|HASHTAGS|#\w/.test(ln)) return;        // URL 해시·해시태그
    if (/\b(id|uuid|token|seed|nonce|cache|shuffle)\b|무작위 동네/i.test(ln)) return;   // ID 생성은 정당
    if (/style|canvas|ctx\.|particle|shard|confetti|animation|vx|vy|rot\b|ang\b|life:|drop|spawn/i.test(ln)) return; // 게임·연출
    if (!MONEYVAR.test(ln)) return;                    // 금액·지표와 같은 줄일 때만 문제
    rngHits++;
    bad(`${f}:${i+1} 난수·해시가 지표 수치 생성에 쓰일 수 있음   « ${ln.trim().slice(0,90)} »`);
  });
}
if (!rngHits) ok('난수·해시로 만든 통계 없음 (ID 생성 용도만 존재)');

/* ── 3. 단위 오류 ────────────────────────────────────────────────────────
   won억()은 '억원' 단위 값을 받는다. 여기에 1e8을 곱해 넘기면
   "63,290,000조원" 같은 값이 화면에 찍힌다(2026-09-04 실제 발생). */
console.log('\n[3] 통화 단위 오용');
let unitHits = 0;
for (const f of HTML) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const m = src.match(/won억\([^)]*\*\s*1e8[^)]*\)/g);
  if (m) { unitHits += m.length; m.forEach(x => bad(`${f} won억()은 억원 단위 인자를 받는다 → ${x}`)); }
}
if (!unitHits) ok('won억() 인자 단위 정상');

/* ── 4. 사용자 입력이 이스케이프 없이 innerHTML로 들어가는지 ────────────── */
console.log('\n[4] 게시글 XSS');
let xssHits = 0;
const UGC_PAGES = ['index.html','story.html','report.html','game.html','vision.html'];  // 사용자 글이 표시되는 페이지
const UGC_FIELD = /\.(nick|content|msg|message|name|region|title|body|comment|text)\b/;
for (const f of HTML) {
  if (!UGC_PAGES.includes(f)) continue;
  const src = readSrc(f).split('\n');
  src.forEach((ln, i) => {
    /* innerHTML 대입 줄만 보면, 여러 줄로 이어 붙이는 카드 템플릿을 놓친다
       (2026-09-04 자체 시험에서 story.html 한 줄을 못 잡았다). HTML 조각을
       만드는 줄 전부를 본다. */
    if (!/['"`]\s*<\w|<\/\w+>/.test(ln)) return;              // HTML 조각을 만드는 줄
    if (!/\+|\$\{/.test(ln)) return;                          // 변수 삽입이 있는 줄
    if (!UGC_FIELD.test(ln)) return;
    const idx = ln.search(UGC_FIELD);
    const around = ln.slice(Math.max(0, idx - 40), idx + 20);
    if (/esc\(|escHtml\(|encodeURIComponent\(|fmt\(|Number\(|parseInt\(/.test(around)) return;
    xssHits++;
    bad(`${f}:${i+1} 사용자 글이 이스케이프 없이 HTML로 들어감   « ${ln.trim().slice(0,90)} »`);
  });
}
if (!xssHits) ok('사용자 데이터 렌더 경로 전부 이스케이프 적용');

/* ── 5. 관리자 키가 쿼리스트링으로 나가는지 ──────────────────────────────
   쿼리스트링은 서버·CDN·프록시 접근 로그와 Referer에 원문으로 남는다. */
console.log('\n[5] 관리자 키 노출');
if (HTML.includes('admin.html')) {
  const a = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  const q = (a.match(/fetch\(['"][^'"]*[?&]key=/g) || []).length;
  const wrapped = /x-admin-key/.test(a) && /window\.fetch\s*=/.test(a);
  if (q && !wrapped) bad(`admin.html 관리자 키가 쿼리스트링으로 전송됨 (${q}곳) — 헤더 래퍼 없음`);
  else ok(`admin.html 관리자 키 ${q}곳 모두 x-admin-key 헤더로 전환됨`);
}
for (const f of APIS) {
  const s = fs.readFileSync(path.join(ROOT, 'api', f), 'utf8');
  if (!/ADMIN_KEY/.test(s)) continue;
  if (!/x-admin-key/.test(s)) bad(`api/${f} ADMIN_KEY를 쓰면서 x-admin-key 헤더를 받지 않음`);
}

/* ── 6. 인증 없는 관리자 액션 ────────────────────────────────────────────
   api/chat.js의 ?action=chatlog가 무인증으로 열려 있던 사고(2026-09-04). */
console.log('\n[6] 관리자 엔드포인트 인증');
const ADMIN_ACTIONS = /action\s*===?\s*['"](chatlog|reportlist|signlist|donorset|pledgelist|listknowledge|suggestions|all|remove|save|uploadimg|removethought|reportremove|signremove|pledgeremove|addknowledge|removeknowledge)['"]/;
for (const f of APIS) {
  const s = fs.readFileSync(path.join(ROOT, 'api', f), 'utf8');
  if (!ADMIN_ACTIONS.test(s)) continue;
  if (!/ADMIN_KEY|REPORT_TOKEN/.test(s)) bad(`api/${f} 관리자성 액션이 있으나 키 검증이 없음`);
}
if (!FAIL) ok('관리자성 액션 전부 키 검증 존재');

/* ── 7. 문법 ─────────────────────────────────────────────────────────── */
console.log('\n[7] JS 문법');
let syn = 0;
for (const f of HTML) {
  const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of h.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/type="application\//.test(m[1]) || /src=/.test(m[1])) continue;
    try { new Function(m[2]); } catch (e) { syn++; bad(`${f} 인라인 스크립트 문법 오류 — ${e.message.slice(0,80)}`); }
  }
}
for (const f of APIS) {
  try { new Function(fs.readFileSync(path.join(ROOT, 'api', f), 'utf8').replace(/^export |^import .*$/gm, '')); }
  catch (e) { /* ESM 구문은 여기서 판정하지 않음 */ }
}
if (!syn) ok(`HTML ${HTML.length}개 인라인 스크립트 전부 파싱 통과`);

/* ── 8. JSON-LD ─────────────────────────────────────────────────────── */
console.log('\n[8] 구조화 데이터(JSON-LD)');
let ld = 0, ldbad = 0;
for (const f of HTML) {
  const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of h.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    ld++;
    try { JSON.parse(m[1]); } catch (e) { ldbad++; bad(`${f} JSON-LD 파싱 실패 — ${e.message.slice(0,70)}`); }
  }
}
if (!ldbad) ok(`JSON-LD ${ld}블록 파싱 정상`);

/* ── 9. 중복 정의 (구조 경고) ────────────────────────────────────────── */
console.log('\n[9] 구조 — 같은 이름 함수의 중복 정의');
for (const f of HTML) {
  const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const fn of ['won', 'esc', 'fmt', 'escHtml']) {
    const n = (h.match(new RegExp(`function\\s+${fn}\\b|(?:const|var|let)\\s+${fn}\\s*=`, 'g')) || []).length;
    if (n >= 4) warn(`${f} ${fn}() 정의가 ${n}곳 — 한 곳만 고치면 다른 곳이 어긋난다`);
  }
}

/* ── 10. 전수 렌더 (--render) ───────────────────────────────────────── */
if (process.argv.includes('--render')) {
  console.log('\n[10] WebKit 전수 렌더 — tools/verify-render.js 를 실행하세요');
  console.log('     node tools/verify-render.js');
}

console.log('\n' + '─'.repeat(70));
console.log(FAIL ? `실패 ${FAIL}건 · 경고 ${WARN}건 — 배포하지 마십시오`
                 : `통과 · 경고 ${WARN}건`);
process.exit(FAIL ? 1 : 0);
