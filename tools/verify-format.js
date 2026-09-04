#!/usr/bin/env node
/* ============================================================================
   공통 표시 유틸 단위 시험 — tools/verify-format.js
   2026-09-04 신설. assets/kb-format.js 의 표시 규칙이 지켜지는지 확인한다.

   특히 지키는 것: 값이 없으면 '—'. 절대 0으로 대체하지 않는다.
   (이 규칙이 깨져서 null이 "0억원"·"0원"으로 찍히던 자리가 5곳 있었다)
   ========================================================================== */
const path = require('path');
global.window = global.window || global;
require(path.resolve(__dirname, '../assets/kb-format.js'));

let fail = 0;
const t = (label, got, want) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`  ${ok ? '✓' : '✗'} ${label} → ${JSON.stringify(got)}${ok ? '' : `  (기대 ${JSON.stringify(want)})`}`);
};

console.log('\n[KB_won억] 입력 단위 = 억원');
t('null',            KB_won억(null),            '—');
t('undefined',       KB_won억(undefined),       '—');
t('NaN',             KB_won억(NaN),             '—');
t('빈 문자열',        KB_won억(''),              '—');
t('0 (진짜 0)',       KB_won억(0),               '0억원');
t('5281',            KB_won억(5281),            '5,281억원');
t('0.5',             KB_won억(0.5),             '0.5억원');
t('12000',           KB_won억(12000),           '1.2조원');
t('63290000',        KB_won억(63290000),        '6329조원');
t('short 5281',      KB_won억(5281, {short:1}), '5,281억');
t('음수 -120',        KB_won억(-120),            '-120억원');

console.log('\n[KB_won원] 입력 단위 = 원');
t('null',            KB_won원(null),            '—');
t('0',               KB_won원(0),               '0원');
t('5,000원',         KB_won원(5000),            '5,000원');
t('3만원',           KB_won원(30000),           '3만원');
t('5,281억원',       KB_won원(5.281e11),        '5,281억원');

console.log('\n[KB_esc]');
t('null',            KB_esc(null),              '');
t('undefined',       KB_esc(undefined),         '');
t('숫자 0 보존',      KB_esc(0),                 '0');
t('숫자 123',        KB_esc(123),               '123');
t('작은따옴표',       KB_esc("a'b"),             'a&#39;b');
t('큰따옴표',        KB_esc('a"b'),             'a&quot;b');
t('꺾쇠·앰퍼샌드',    KB_esc('<b>&</b>'),        '&lt;b&gt;&amp;&lt;/b&gt;');
t('스크립트 주입',    KB_esc("<img src=x onerror='alert(1)'>"),
                     '&lt;img src=x onerror=&#39;alert(1)&#39;&gt;');

console.log('\n[KB_fmt]');
t('null',            KB_fmt(null),              '—');
t('0',               KB_fmt(0),                 '0');
t('32722',           KB_fmt(32722),             '32,722');

console.log('\n' + '─'.repeat(70));
console.log(fail ? `실패 ${fail}건` : '표시 유틸 단위 시험 전부 통과');
process.exit(fail ? 1 : 0);
