#!/bin/sh
# assets/kb.css 만들기: 토큰 + 기존 규칙(kb-base) + 새 기준 규칙(kb-design)
# 사용: sh tools/build-css.sh   (kb-tokens.css·kb-base.css·kb-design.css 를 고친 뒤 실행)
cd "$(dirname "$0")/.." || exit 1
{
  echo "/* kb.css — 김보미.com 공통 스타일 단일 파일. 직접 고치지 말고 kb-tokens.css / kb-base.css / kb-design.css 를 고친 뒤 tools/build-css.sh 로 만든다. 기준: DESIGN.md */"
  cat assets/kb-tokens.css
  echo "/* ===== kb-tokens 끝 ===== */"
  cat assets/kb-base.css
  cat assets/kb-design.css
} > assets/kb.css
wc -c assets/kb.css
