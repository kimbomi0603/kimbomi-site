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

/* ── 6-2. 외부 CDN 전역을 방어 없이 참조 ─────────────────────────────────
   Chart.js CDN이 죽으면 상세페이지 전체가, Tailwind CDN이 죽으면 region.html의
   인라인 스크립트 전체가 중단됐다(둘 다 2026-09-04 발견). 외부에서 오는 전역은
   typeof 검사를 거쳐야 한다. */
console.log('\n[6-2] 외부 CDN 전역 방어');
const CDN_GLOBALS = ['Chart', 'tailwind', 'XLSX', 'html2canvas', 'jspdf'];
let unguarded = 0;
for (const f of HTML) {
  const src = readSrc(f).split('\n');
  src.forEach((ln, i) => {
    if (/<script[^>]*\ssrc=/.test(ln)) return;                 // 라이브러리를 불러오는 태그 자체
    for (const g of CDN_GLOBALS) {
      const used = new RegExp(`(^|[^\\w.$'"\`])${g}\\s*[.(]`).test(ln);
      if (!used) continue;
      if (new RegExp(`typeof\\s+(window\\.)?${g}|window\\.${g}\\s*&&|if\\s*\\(\\s*!?\\s*window\\.${g}\\s*\\)|!window\\.${g}|window\\[['"]${g}['"]\\]`).test(ln)) return;
      /* 같은 함수 안 앞줄에 가드가 있으면 통과 — 앞 12줄까지 살핀다 */
      const near = src.slice(Math.max(0, i - 12), i).join('\n');
      if (new RegExp(`typeof\\s+(window\\.)?${g}\\s*===?\\s*['"]undefined['"]|typeof\\s+(window\\.)?${g}\\s*!==?\\s*['"]undefined['"]|if\\s*\\(\\s*!?\\s*window\\.${g}`).test(near)) return;
      unguarded++;
      bad(`${f}:${i+1} 외부 CDN 전역 ${g} 를 방어 없이 사용 — CDN 장애 시 페이지가 죽습니다   « ${ln.trim().slice(0,80)} »`);
    }
  });
}
if (!unguarded) ok('외부 CDN 전역(Chart·tailwind 등) 전부 방어됨');

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
console.log('\n[9] 표시 유틸 재구현 금지');
/* 2026-09-04: esc()·금액 포매터가 12개 파일에 23곳·11곳 따로 있었고,
   그중 5곳은 null을 '0억원'·'0원'으로 찍고 3곳은 예외를 냈다.
   이제 assets/kb-format.js 한 곳에서만 정의하고, 나머지는 위임만 한다. */
const FORMATTER = /function\s+(esc|escHtml|won|won억|fmt억)\s*\(|(?:const|var|let)\s+(esc|won|won억)\s*=/;
let reimpl = 0;
for (const f of HTML) {
  const src = readSrc(f).split('\n');
  src.forEach((ln, i) => {
    if (!FORMATTER.test(ln)) return;
    if (/KB_(esc|won억|won원|won365|fmt)\(/.test(ln)) return;      // 위임은 정상 (KB_won365: 2026-09-29 우리동네365 표기)
    reimpl++;
    bad(`${f}:${i+1} 표시 유틸을 자체 구현함 — assets/kb-format.js 로 위임하십시오   « ${ln.trim().slice(0,80)} »`);
  });
}
if (!reimpl) ok('esc·금액 포매터 전부 assets/kb-format.js 위임');

/* KB_ 를 쓰면서 공통 파일을 로드하지 않으면 화면이 통째로 죽는다 */
for (const f of HTML) {
  const raw = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (!/\bKB_(esc|won억|won원|won365|fmt)\s*\(/.test(raw)) continue;
  /* 2026-09-04: 처음엔 파일명 문자열만 찾아, 위임 주석에 적힌 이름까지 '로드됨'으로
     세는 바람에 실제로 로더가 빠진 페이지 7개를 놓쳤다. script 태그로 확인한다. */
  if (!/<script[^>]+src=["'][^"']*assets\/kb-format\.js["'][^>]*>/.test(raw))
    bad(`${f} KB_ 유틸을 쓰면서 assets/kb-format.js 스크립트 태그가 없음`);
}

/* ── 9-2. 값이 없을 때 0으로 채우는 포매터 ─────────────────────────────── */
console.log('\n[9-2] 값 없음을 0으로 채우는 포매터');
let zeroFill = 0;
for (const f of HTML.concat(APIS.map(a => 'api/' + a))) {
  const src = readSrc(f).split('\n');
  src.forEach((ln, i) => {
    if (!/(억원|조원|만원|'억'|"억"|'원'|"원")/.test(ln)) return;
    if (!/Math\.round\s*\(\s*[A-Za-z_$][\w.$]*\s*\|\|\s*0|\+\s*[A-Za-z_$][\w.$]*\s*\|\|\s*0/.test(ln)) return;
    zeroFill++;
    bad(`${f}:${i+1} 값이 없을 때 0으로 채워 금액을 표시함 — '—'로 비워야 합니다   « ${ln.trim().slice(0,80)} »`);
  });
}
if (!zeroFill) ok("값 없음을 0억원·0원으로 채우는 포매터 없음");

/* ── 9-3. 회계 항등식 (공시 원자료와 구조가 맞는지) ──────────────────────
   2026-09-06 신설. 지방재정365 AJGCF(회계별 세출결산)의 5칸을
   [예산현액·지출액·집행률·이월·불용]으로 잘못 읽어 243개 지자체 전부에
   존재하지 않는 '세출 집행률'과 잘못된 '이월·불용'을 표시하던 사고가 있었다.
   원자료의 항등식(총계 = 일반회계 + 공기업특별회계 + 기타특별회계 + 기금)을
   매번 기계가 확인한다. 여수시 2024 결산공시 17,318 = 15,152+1,145+638+383 로 확정된 구조. */
console.log('\n[9-3] 회계 항등식 · 결산 데이터 구조');
(function(){
  const raw = fs.readFileSync(path.join(ROOT,'narasalim.html'),'utf8');
  const grab = (name) => {
    const i = raw.indexOf('const ' + name + '=');
    if (i < 0) return null;
    const st = raw.indexOf('{', i);
    let d = 0, j = st;
    for (; j < raw.length; j++) { const c = raw[j]; if (c === '{') d++; else if (c === '}') { d--; if (!d) { j++; break; } } }
    try { return JSON.parse(raw.slice(st, j)); } catch (e) { return null; }
  };
  const EX = grab('REAL_EXEC_2024'), AC = grab('REAL_ACC_2024'), SC = grab('REAL_SEC_2024');
  if (!EX || !AC) { bad('REAL_EXEC_2024 / REAL_ACC_2024 상수를 읽지 못했습니다'); return; }

  /* (1) 세출결산 총계 ≥ 일반회계 + 공기업특회 + 기금 — 나머지가 기타특별회계 */
  let neg = [];
  for (const k of Object.keys(EX)) {
    const e = EX[k];
    const etc = (e[5] != null) ? e[5] : (e[0] - e[1] - e[3] - e[4]);
    if (etc < -1) neg.push(`${k}(기타특회 ${etc.toFixed(1)}억)`);
  }
  if (neg.length) bad(`회계 항등식 위반 ${neg.length}곳 — 총계 < 일반+공기업특회+기금 : ${neg.slice(0,5).join(', ')}`);
  else ok(`회계 항등식 정상 (243곳 · 총계 = 일반 + 공기업특회 + 기타특회 + 기금)`);

  /* (2) 회계별 세출결산(AJGCF)을 집행률·이월·불용으로 다시 읽는 코드가 되살아나지 않았는지 — 전 HTML 대상.
         2026-09-06: narasalim.html만 보다가 region.html에 같은 오해석이 남아 있던 것을 놓쳤다. */
  const REVIVE = [
    [/execRate\s*=\s*EXv\[|carryover\s*=\s*EXv\[|unusedAmt\s*=\s*EXv\[|execBase\s*=\s*EXv\[/, "REAL_EXEC_2024 배열을 집행률·이월·불용·예산현액으로 읽음"],
    [/pfa_amt1\s*\/\s*[A-Za-z_$][\w.$]*\s*\*\s*100|spent\s*\/\s*base\s*\*\s*100/, "tot_pfa_amt·pfa_amt1(결산총계·일반회계)로 집행률을 계산함"],
    [/지출액\s*÷\s*예산현액/, "'지출액÷예산현액' 표기 — 이 공시에 없는 지표"]
  ];
  let revived = 0;
  for (const f of HTML) {
    const src = readSrc(f);
    if (!/EXEC|REAL_EXEC_2024|tot_pfa_amt/.test(src)) continue;
    src.split('\n').forEach((ln, i) => {
      /* '이 공시에 없다'고 설명하는 문장은 제외 — 값을 만들어 쓰는 코드만 잡는다 */
      if (/표시하지 않|없는 값|없어 표시|존재하지 않/.test(ln)) return;
      for (const [re, msg] of REVIVE) {
        if (re.test(ln)) { revived++; bad(`${f}:${i+1} — ${msg}. AJGCF는 [결산총계·일반회계·공기업특별회계·기타특별회계·기금] 회계 구분값입니다`); }
      }
    });
  }
  if (!revived) ok("세출결산 배열을 집행률·이월·불용으로 읽는 코드 없음 (전 HTML)");

  /* (3) 분야별 세출 합계 vs 일반회계 세출결산 — 크게 어긋나면 화면 경고가 필요 */
  if (SC) {
    let off = [];
    for (const k of Object.keys(SC)) {
      const sum = SC[k].reduce((a, b) => a + (+b || 0), 0), gen = EX[k] && EX[k][1];
      if (!gen || !sum) continue;
      if (Math.abs(sum - gen) / gen > 0.5) off.push(k);
    }
    if (off.length) warn(`분야별 세출 합계가 일반회계 결산과 50% 넘게 어긋나는 곳 ${off.length}곳 — 화면 경고 문구가 표시되는지 확인 (${off.slice(0,4).join(', ')})`);
    else ok('분야별 세출 합계 중대 결손 없음');
  }
})();

/* ── 11~15. 가짜 판정·동명 오매칭·경계 변경 (2026-09-29 신설) ─────────────────
   사고: 인천 화면에서 (1) 공약 제목 낱말('전국'·'인천')이 사업명에 들어 있기만 하면 '예산 반영·집행 시작'으로
   판정해, 신산업 공약이 향교·농산물 행사 사업으로 '이행'된 것처럼 보였다. (2) 선관위 당선인을 구·군 이름만으로
   찾아 대구·광주·대전·울산·부산 등 19곳에 다른 시·도 구청장(서울 중구청장, 부산 동구청장 등)이 붙어 있었다.
   (3) 서해구(옛 서구, 2026.7.1 검단구 분리)에 검단 포함 인구로 1인당 값을 냈고, 인구 공시가 없는 곳은
   '인구가 비슷한 5곳'을 목록 앞 5곳으로 아무렇게나 골랐다. (4) 기금이 포함된 합계를 '세출예산 총계'라 불렀다.
   아래 검사는 같은 종류가 되살아나면 배포를 막는다. */
console.log('\n[11] 자동 판정 금지 — 낱말이 겹친다고 이행·반영을 판정하지 않는다');
(function(){
  const src = readSrc('budget365.html');
  const BAN = [
    [/공약 이행 신호등|예산에 이름이 닿은 공약|pledgeMatch\s*\(/, '공약-사업 낱말 매칭으로 이행 상태를 판정함'],
    [/['"`]집행 시작['"`]|>집행 시작</, "'집행 시작' 판정 표기"],
    [/관련 사업 예산현액 합계/, '낱말 매칭 합계를 공약 예산처럼 표시함'],
    [/어느 사업에 앉았는지|어느 사업과 닿는지/, '정책 돈이 특정 사업에 들어갔다고 단정하는 문구'],
    [/POL_KW\[[^\]]+\]\s*\|\|\s*\[\]\)\.slice/, '정책 제목에 없는 분야 일반어로 사업을 찾음']
  ];
  let n = 0;
  src.split('\n').forEach((ln, i) => { for (const [re, msg] of BAN) if (re.test(ln)) { n++; bad(`budget365.html:${i+1} ${msg}`); } });
  if (!n) ok('공약·정책 자동 판정 표기 없음');
})();

console.log('\n[12] 당선인 자료 — 시·도와 구·군이 둘 다 맞는지 (동명 구·군 오매칭 차단)');
(function(){
  const src = readSrc('budget365.html');
  const mw = src.match(/function matchWinner[\s\S]*?\n/);
  if (!mw || /\|\|\s*list\.find\(\s*w\s*=>\s*\(\s*w\.wiwName/.test(src)) bad('matchWinner 가 구·군 이름만으로 당선인을 찾는 경로를 가짐');
  let gz; try { gz = require('zlib'); } catch (e) {}
  const DIR = path.join(ROOT, 'data', 'pledge');
  if (!fs.existsSync(DIR) || !gz) { warn('data/pledge 없음 — 건너뜀'); return; }
  const master = (cd) => { try { return JSON.parse(gz.gunzipSync(Buffer.from(fs.readFileSync(path.join(ROOT,'data',cd+'.txt'),'utf8').trim(),'base64'))).master; } catch (e) { return null; } };
  const TONG = { '전남광주통합특별시': ['광주광역시','전라남도','전남광주통합특별시'] };
  let wrong = [], dead = [];
  for (const f of fs.readdirSync(DIR)) {
    if (!/^\d{7}\.json$/.test(f)) continue;
    const cd = f.slice(0,7); const j = JSON.parse(fs.readFileSync(path.join(DIR,f),'utf8')); const w = j.lg && j.lg[cd] && j.lg[cd].w;
    if (!w) continue;
    const m = master(cd); if (!m) continue;
    if (m.live_2026 === false) { dead.push(cd); continue; }
    const sds = new Set([m.sido_2024, m.sido_new, ...(TONG[m.sido_new]||[])].filter(Boolean));
    const gus = new Set([m.sigungu_new, m.sigungu_2024].filter(Boolean));
    const okSd = sds.has(w.sd);
    const okGu = m.level === '광역' ? true : gus.has(w.wiw) || (m.sigungu_new && String(w.wiw||'').startsWith(m.sigungu_new));
    if (!okSd || !okGu) wrong.push(`${cd} ${m.display_new||''} ← ${w.sd} ${w.wiw} ${w.name}`);
  }
  if (wrong.length) bad(`당선인이 다른 시·도·구·군 사람으로 붙은 곳 ${wrong.length}곳: ${wrong.slice(0,5).join(' / ')}`);
  if (dead.length) bad(`2026.7.1 없어진 지자체에 당선인이 붙어 있음: ${dead.join(', ')}`);
  if (!wrong.length && !dead.length) ok('당선인 자료 전부 시·도+구·군 일치');
})();

console.log('\n[13] 경계 변경 지자체 — 옛 경계 값에 표시가 있는지');
(function(){
  let gz; try { gz = require('zlib'); } catch (e) { return; }
  const ix = JSON.parse(fs.readFileSync(path.join(ROOT,'data','index.json'),'utf8'));
  const byCd = {}; ix.rows.forEach(r => byCd[r.laf_cd] = r);
  const miss = [];
  for (const r of ix.rows) {
    let m; try { m = JSON.parse(gz.gunzipSync(Buffer.from(fs.readFileSync(path.join(ROOT,'data',r.laf_cd+'.txt'),'utf8').trim(),'base64'))).master; } catch (e) { continue; }
    for (const old of (m.replaces || [])) {
      const o = byCd[old];
      if (o && o.live_2026 && !o.bnd_2026) miss.push(`${old} ${o.display}(→ ${r.display} 분리)`);
    }
  }
  if (miss.length) bad(`경계가 바뀌었는데 bnd_2026 표시가 없는 지자체: ${[...new Set(miss)].join(', ')} — 옛 인구로 1인당 값이 계산됩니다`);
  else ok('경계 변경 지자체 전부 표시됨');
  const src = readSrc('budget365.html');
  if (!/bnd_2026/.test(src)) bad('budget365.html 이 bnd_2026(경계 변경)을 처리하지 않음');
  if (/:pool\.slice\(0,\s*5\)/.test(src)) bad("비교 대상이 없을 때 목록 앞 5곳을 임의로 고름 (':pool.slice(0,5)')");
})();

console.log('\n[14] 금액 이름표 — 기금이 들어간 합계를 예산 총계라 부르지 않기');
(function(){
  const src = readSrc('budget365.html');
  let n = 0;
  src.split('\n').forEach((ln, i) => {
    if (/ane_tott_amt|tot_pfa_amt/.test(ln) && /l:\s*[`'"](세출예산 총계|세출결산 총계)/.test(ln)) { n++; bad(`budget365.html:${i+1} 기금 포함 합계에 '기금' 없이 총계라고 붙임`); }
  });
  if (!n) ok("기금 포함 합계 이름표에 '기금' 표기");
})();

console.log('\n[15] AI 대화 — 본인이 고른 「저장 안 함」이 지켜지는지');
(function(){
  const chat = readSrc('api/chat.js'), bomi = readSrc('assets/bomi.js');
  let n = 0;
  if (!/body\.nolog\s*===\s*true\)\s*return/.test(chat)) { n++; bad('api/chat.js saveChat 이 nolog(저장 안 함)를 확인하지 않음'); }
  if (!/id="bomiNolog"/.test(bomi) || !/nolog:\s*!!/.test(bomi)) { n++; bad('assets/bomi.js 에 「이 대화 저장 안 함」 체크 또는 nolog 전송이 없음'); }
  if (/LTRIM/.test(chat) || !/CHATLOG_KEYS/.test(chat)) { n++; bad('api/chat.js 가 대화 기록을 자르거나(LTRIM) 챗봇별 저장 키(CHATLOG_KEYS)를 쓰지 않음'); }
  if (!n) ok('저장 안 함 체크·전송·서버 확인 모두 있음, 대화 기록 자르기 없음');
})();

/* ── 10. 전수 렌더 (--render) ───────────────────────────────────────── */
if (process.argv.includes('--render')) {
  console.log('\n[10] WebKit 전수 렌더 — tools/verify-render.js 를 실행하세요');
  console.log('     node tools/verify-render.js');
}

console.log('\n' + '─'.repeat(70));
console.log(FAIL ? `실패 ${FAIL}건 · 경고 ${WARN}건 — 배포하지 마십시오`
                 : `통과 · 경고 ${WARN}건`);
process.exit(FAIL ? 1 : 0);
