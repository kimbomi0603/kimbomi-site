/* ============================================================
   대한민국 재정 365 — 재정 AI 비서 프록시
   경로: /api/chat  (Vercel 서버리스 함수, CommonJS)
   무료 Google Gemini(gemini-2.5-flash) 로 재정·행정 용어를 쉽게 설명.
   환경변수: GEMINI_API_KEY (AI Studio 발급)  ※ 없으면 화면에서 안내만 표시
   ============================================================ */

var MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

var SYSTEM = [
  "당신은 '대한민국 재정 365'의 재정 AI 비서입니다.",
  "- 지방자치단체 예산·집행·계약·재정자립도 등 어려운 재정/행정 용어를 일반 국민 눈높이에서 쉽고 정확하게 설명합니다.",
  "- 추측이나 확인되지 않은 수치는 절대 지어내지 않습니다. 모르면 모른다고 말하고 '지방재정365' 같은 공식 출처 확인을 권합니다.",
  "- 정치적 중립을 지키고 특정 정당·후보 지지를 유도하지 않습니다.",
  "- 답변은 간결한 한국어로 핵심부터 말합니다."
].join("\n");

function safeJson(s) { try { return JSON.parse(s); } catch (e) { return {}; } }

function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    return Promise.resolve(typeof req.body === "string" ? safeJson(req.body) : req.body);
  }
  return new Promise(function (resolve) {
    var d = "";
    req.on("data", function (c) { d += c; });
    req.on("end", function () { resolve(safeJson(d)); });
    req.on("error", function () { resolve({}); });
  });
}

module.exports = async function (req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  var KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!KEY) return res.status(500).json({ ok: false, error: "GEMINI_API_KEY 미설정(Vercel 환경변수)" });

  var body = await readBody(req);
  var message = String((body && body.message) || "").slice(0, 2000);
  var context = String((body && body.context) || "").slice(0, 4000);
  if (!message) return res.status(400).json({ ok: false, error: "message 필요" });

  var prompt = SYSTEM + "\n\n[참고 데이터]\n" + (context || "(없음)") + "\n\n[질문]\n" + message;
  var contents = [{ role: "user", parts: [{ text: prompt }] }];

  for (var i = 0; i < MODELS.length; i++) {
    var model = MODELS[i];
    try {
      var url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + KEY;
      var r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: contents, generationConfig: { temperature: 0.4, maxOutputTokens: 1024 } }),
        signal: AbortSignal.timeout(25000)
      });
      var j = await r.json();
      if (!r.ok) {
        if (i < MODELS.length - 1) continue;
        return res.status(502).json({ ok: false, error: (j.error && j.error.message) || "Gemini 오류" });
      }
      var parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
      var text = parts.map(function (p) { return p.text; }).join("") || "";
      return res.status(200).json({ ok: true, model: model, text: text });
    } catch (e) {
      if (i === MODELS.length - 1) return res.status(504).json({ ok: false, error: "AI 응답 시간초과", detail: String((e && e.message) || e) });
    }
  }
};
