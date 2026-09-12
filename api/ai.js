// api/ai.js — 회의록 도우미용 텍스트 AI 프록시 (claudenote 정밀모드 자동화, 2026-09-13)
//   POST { task: "clean" | "minutes", text: "<전사본>" }  →  { ok, model, text }
//   · clean   : STT 전사본 문맥 교정(오인식·띄어쓰기·군말), 화자/타임스탬프 보존, 의미 변경 금지
//   · minutes : 회의록(제목·일시/참석자·핵심요약·결정사항·할일 표·쟁점·다음단계), 추측은 [추정]
//   AI: Gemini 2.5 flash(1순위) → Groq(예비). 키는 Vercel 환경변수 GEMINI_API_KEY / GROQ_API_KEY.
//   남용 방지: Origin 허용 목록(김보미.com·*.vercel.app·kimbomi0603.github.io·localhost) + IP 당 분당 6회.
// [위험] 전사본은 저장하지 않는다(로그·Redis 없음). 회의 내용이 외부 AI(구글·Groq)로 전송된다는 점은 앱 화면에 표시한다.
// [위험] 입력 60,000자 상한 — 긴 회의는 앱에서 나눠 보낸다. 서버리스 기본 시간(10초 Hobby)은 부족하므로 vercel.json 에서 60초로.
"use strict";

var MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
var GROQ_MODELS = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"];
var MAX_IN = 60000;
var BUCKET = {};   // ip → [timestamps]  (인스턴스 단위 간이 제한)

var PROMPTS = {
  clean: "다음은 음성 자동 전사한 한국어 회의록입니다. STT 오인식·띄어쓰기 오류·군말이 많습니다.\n" +
         "1) 문맥을 고려해 오탈자·오인식을 교정한다(고유명사 포함) 2) 군말('어', '그', '뭐냐면' 등)을 제거하고 자연스러운 문장으로 만든다 " +
         "3) 화자 이름과 [타임스탬프] 표기는 그대로 보존한다 4) 의미를 바꾸거나 내용을 추가·요약하지 않는다 5) 출력은 교정된 전사본만, 다른 말 없이.",
  minutes: "다음 회의 전사로 한국어 회의록을 작성한다. 형식(마크다운): # 제목 / 일시·참석자 / ## 핵심 요약(5~7개 불릿) / ## 결정 사항 / ## 할 일(표: 담당·내용·기한) / ## 쟁점·이견 / ## 다음 단계. " +
           "전사에 있는 사실만 쓴다. 전사에 없는 담당·기한·숫자는 만들지 말고, 추측이 필요하면 [추정]을 붙인다. 상투어·보도자료 톤 금지."
};

function pick(ip) {
  var now = Date.now(), arr = (BUCKET[ip] || []).filter(function (t) { return now - t < 60000; });
  if (arr.length >= 6) return false;
  arr.push(now); BUCKET[ip] = arr;
  if (Object.keys(BUCKET).length > 5000) BUCKET = {};
  return true;
}

function readBody(req) {
  return new Promise(function (resolve) {
    if (req.body !== undefined && req.body !== null) { resolve(req.body); return; }
    var d = ""; req.on("data", function (c) { d += c; if (d.length > MAX_IN * 4) { d = d.slice(0, MAX_IN * 4); } });
    req.on("end", function () { resolve(d); }); req.on("error", function () { resolve(""); });
  });
}

module.exports = async function (req, res) {
  res.setHeader("Cache-Control", "no-store");
  var origin = String(req.headers.origin || "");
  var okOrigin = /^https:\/\/(www\.)?xn--4k0b53xuva\.com$|\.vercel\.app$|^https:\/\/kimbomi0603\.github\.io$|^https?:\/\/localhost(:\d+)?$/.test(origin.replace(/\/$/, ""));
  if (origin && okOrigin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") return res.status(200).json({ ok: true, name: "회의록 AI 도우미 (Gemini + Groq 예비)", tasks: Object.keys(PROMPTS) });
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  if (origin && !okOrigin) return res.status(403).json({ ok: false, error: "forbidden origin" });

  var KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  var GROQ = process.env.GROQ_API_KEY || "";
  if (!KEY && !GROQ) return res.status(500).json({ ok: false, error: "GEMINI_API_KEY/GROQ_API_KEY 미설정" });

  var ip = String(req.headers["x-forwarded-for"] || req.socket && req.socket.remoteAddress || "").split(",")[0].trim();
  if (!pick(ip)) return res.status(429).json({ ok: false, error: "요청이 너무 잦습니다. 1분 뒤 다시 시도하세요." });

  var body = await readBody(req);
  if (typeof body === "string") { try { body = JSON.parse(body || "{}"); } catch (e) { body = {}; } }
  var task = String((body && body.task) || "").trim();
  var text = String((body && body.text) || "").trim();
  if (!PROMPTS[task]) return res.status(400).json({ ok: false, error: "task 는 clean 또는 minutes" });
  if (!text) return res.status(400).json({ ok: false, error: "text 가 비어 있습니다" });
  if (text.length > MAX_IN) return res.status(413).json({ ok: false, error: "전사본이 너무 깁니다(" + text.length + "자 > " + MAX_IN + "). 나눠서 보내세요." });

  var prompt = PROMPTS[task] + "\n\n=== 전사본 ===\n" + text;
  var maxOut = task === "clean" ? 16000 : 4000;
  var errs = [];

  async function gemini() {
    if (!KEY) throw new Error("no gemini key");
    for (var i = 0; i < MODELS.length; i++) {
      try {
        var r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + MODELS[i] + ":generateContent?key=" + KEY, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: maxOut, thinkingConfig: { thinkingBudget: 0 } } }),
          signal: AbortSignal.timeout(50000)
        });
        var j = await r.json();
        if (!r.ok) { errs.push((j.error && j.error.message) || ("Gemini " + r.status)); continue; }
        var parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
        var t = parts.map(function (p) { return p.text || ""; }).join("");
        if (t.trim()) return { model: MODELS[i], text: t.trim() };
        errs.push("Gemini 빈 응답");
      } catch (e) { errs.push(String((e && e.message) || e)); }
    }
    throw new Error("gemini failed");
  }
  async function groq() {
    if (!GROQ) throw new Error("no groq key");
    for (var k = 0; k < GROQ_MODELS.length; k++) {
      try {
        var r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + GROQ, "User-Agent": "Mozilla/5.0 kimbomi-site" },
          body: JSON.stringify({ model: GROQ_MODELS[k], messages: [{ role: "user", content: prompt }], temperature: 0.2, max_tokens: Math.min(maxOut, 8000) }),
          signal: AbortSignal.timeout(50000)
        });
        var j = await r.json();
        if (!r.ok) { errs.push((j.error && j.error.message) || ("Groq " + r.status)); continue; }
        var t = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
        if (t.trim()) return { model: GROQ_MODELS[k], text: t.trim() };
      } catch (e) { errs.push(String((e && e.message) || e)); }
    }
    throw new Error("groq failed");
  }

  try {
    var out;
    try { out = await gemini(); } catch (e1) { out = await groq(); }
    return res.status(200).json({ ok: true, task: task, model: out.model, text: out.text });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "AI 응답 실패: " + errs.slice(-2).join(" / ").slice(0, 200) });
  }
};
