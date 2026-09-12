// api/community.js — 게시판 3종을 한 함수로 묶은 진입점 (2026-09-13)
//   Vercel Hobby 플랜은 서버리스 함수 12개가 상한이라, 성격이 같은 작은 API 셋을 하나로 합쳤다.
//   실제 코드는 lib/community/{scores,stories,thoughts}.js 에 그대로 있고(변경 없음), 여기서 kind 로 나눠 부른다.
//   기존 주소는 vercel.json rewrites 로 그대로 살아 있다:
//     /api/scores   → /api/community?kind=scores    (계란으로 바위치기 랭킹)
//     /api/stories  → /api/community?kind=stories   (이생망 공유방)
//     /api/thoughts → /api/community?kind=thoughts  (생각 나누기)
//   따라서 index.html·game.html·story.html·report.html·admin.html 은 손대지 않았다.
// [위험] rewrites 가 빠지면 세 게시판이 전부 404 가 된다 → vercel.json 을 고칠 때 이 세 줄을 지우지 말 것.
"use strict";
const HANDLERS = {
  scores: require("../lib/community/scores.js"),
  stories: require("../lib/community/stories.js"),
  thoughts: require("../lib/community/thoughts.js"),
};

function pickKind(req) {
  const q = req.query || {};
  if (q.kind && HANDLERS[q.kind]) return q.kind;
  // rewrite 가 kind 를 못 넘긴 경우의 예비: 원래 경로에서 추정
  const u = String(req.url || "");
  const m = u.match(/\/api\/(scores|stories|thoughts)\b/);
  return m ? m[1] : "";
}

module.exports = async function (req, res) {
  const kind = pickKind(req);
  const h = HANDLERS[kind];
  if (!h) {
    res.statusCode = 404;
    return res.json({ ok: false, error: "unknown community kind" });
  }
  if (req.query) delete req.query.kind;   // 원래 핸들러가 보던 query 그대로
  return h(req, res);
};
