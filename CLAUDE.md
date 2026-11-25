# kimbomi-site 작업 규칙

## push 전 필수
- `git config core.hooksPath .githooks` 를 먼저 실행한다(새로 clone한 경우).
- 커밋·push 전에 `node tools/verify.js` 가 「통과」여야 한다. pre-push 훅이 실패하면 push가 멈춘다.
- 검사를 건너뛰는 `--no-verify` 는 쓰지 않는다.

## 왜
- 2026-11-23~24에 정적 검사(local.html 표시 유틸 자체 구현)에서 실패한 커밋이 올라갔고,
  그 때문에 11-24 매일 자료 갱신(daily-refresh)이 같은 검사에서 멈춰 그날 자료가 갱신되지 않았다.

## 표시 유틸
- 숫자·날짜·HTML 이스케이프 같은 표시 함수는 페이지 안에 새로 만들지 말고 `assets/kb-format.js` 를 쓴다.
