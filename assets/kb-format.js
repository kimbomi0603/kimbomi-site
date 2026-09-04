/* ============================================================================
   김보미.com 공통 표시 유틸 — assets/kb-format.js
   2026-09-04 신설.

   왜 만들었나
   ───────────────────────────────────────────────────────────────────────────
   같은 일을 하는 함수가 페이지마다 따로 적혀 있었다. 12개 파일에 esc() 23곳,
   금액 포매터 11곳. 한 곳을 고쳐도 나머지는 그대로 남았고, 실제로 아래 결함이
   각각 다른 파일에 흩어져 있었다.

     · narasalim  won() 3곳이 null을 받으면 "0억원"을 찍었다.
                  재정 데이터에서 '0억원'과 '출처 미확보'는 전혀 다른 뜻이다.
     · narasalim  won()의 입력 단위가 섞여 있었다(억원 7곳 / 원 2곳).
                  2026-09-04 "예산현액 63,290,000조원"이 이 때문이었다.
     · gyeyak     won()이 +w||0 이라 null을 "0원"으로 찍었다.
     · almedalen  esc()가 큰따옴표를 이스케이프하지 않고, null을 "null"로 찍었다.
     · report     esc()가 (s||'')라 숫자를 넘기면 .replace에서 예외가 났다.
     · 전남7개군   위와 같음.
     · 전 파일     esc()가 작은따옴표를 이스케이프하지 않았다.
                  속성값을 '…'로 감싸는 자리가 있어 속성 탈출이 가능했다.

   이제 표시 규칙은 이 파일에서만 정한다.

   표시 정책
   ───────────────────────────────────────────────────────────────────────────
     · 값이 없으면 '—'. 절대 0으로 대체하지 않는다. (data-integrity-guard)
     · 진짜 0은 '0억원'으로 표시한다. '—'와 구분한다.
     · KB_won억(n)  입력 단위 **억원**
     · KB_won원(n)  입력 단위 **원**
     · 두 함수 모두 {short:true} 를 주면 '조원/억원' 대신 '조/억'
   ========================================================================== */
(function (root) {
  'use strict';

  /* HTML 이스케이프.
     작은따옴표까지 처리한다(속성값을 '…'로 감싸는 자리가 있다).
     null·undefined만 빈 문자열로 보고, 숫자 0은 "0"으로 남긴다.
     문자열이 아닌 값도 String()으로 감싸 예외가 나지 않게 한다. */
  function KB_esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function isBlank(n) {
    return n === null || n === undefined || n === '' || !isFinite(n);
  }

  /* 억원 단위 금액 → 읽는 문자열. 값이 없으면 '—'. */
  function KB_won억(n, opt) {
    if (isBlank(n)) return '—';
    n = Number(n);
    var short = !!(opt && opt.short);
    var 조 = short ? '조' : '조원', 억 = short ? '억' : '억원';
    var a = Math.abs(n);
    if (a >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + 조;
    if (a >= 1 || n === 0) return n.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + 억;
    return (Math.round(n * 100) / 100) + 억;      /* 1억 미만은 소수 둘째 자리까지 */
  }

  /* 원 단위 금액 → 읽는 문자열. 1억 미만은 '만' 단위로 내린다. */
  function KB_won원(n, opt) {
    if (isBlank(n)) return '—';
    n = Number(n);
    var short = !!(opt && opt.short);
    var 억값 = n / 1e8;
    if (Math.abs(억값) >= 1) return KB_won억(억값, opt);
    if (n === 0) return short ? '0' : '0원';
    if (Math.abs(n) < 1e4) return Math.round(n).toLocaleString('ko-KR') + '원';   /* 소액 계약 대비 */
    return Math.round(n / 1e4).toLocaleString('ko-KR') + (short ? '만' : '만원');
  }

  /* 정수 천단위 구분. 값이 없으면 '—'. */
  function KB_fmt(n) {
    if (isBlank(n)) return '—';
    return Math.round(Number(n)).toLocaleString('ko-KR');
  }

  root.KB_esc = KB_esc;
  root.KB_won억 = KB_won억;
  root.KB_won원 = KB_won원;
  root.KB_fmt = KB_fmt;
})(typeof window !== 'undefined' ? window : this);
