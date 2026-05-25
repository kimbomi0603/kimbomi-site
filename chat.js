/* ============================================================================
 * 대한민국 재정 365 · AI 도우미봇 서버 함수  (Vercel Serverless Function)
 * ----------------------------------------------------------------------------
 * ▣ 배포 방법
 *   1) 이 파일을 프로젝트의  /api/chat.js  경로에 둡니다. (Vercel은 /api/* 를
 *      자동으로 서버리스 함수로 인식합니다. 플랫폼 봇은 이 경로를 호출합니다.)
 *   2) Vercel 대시보드 → Settings → Environment Variables 에 발급키를 추가:
 *        ANTHROPIC_API_KEY = sk-ant-...        (https://console.anthropic.com 에서 발급)
 *   3) 재배포(Redeploy). 끝.  키가 없거나 오류가 나면 플랫폼 봇은 자동으로
 *      '내장 규칙봇'으로 폴백하므로 사이트는 항상 정상 작동합니다.
 *
 * ▣ 플랫폼(재정주권365.html) 연결
 *   - 같은 도메인(김보미.com)에 함께 올렸다면, HTML 의 BOT_API 를 '/api/chat' 로
 *     바꾸면 CORS 없이 동작합니다. (다른 도메인/로컬에서 쓰려면 절대경로 + 아래 CORS)
 *
 * ▣ 요청/응답 형식 (HTML 봇과 약속된 계약)
 *   요청  POST { "messages":[{role:'user'|'assistant',content:'...'}], "context":"현재 지역·용어집 요약" }
 *   응답  200  { "reply":"AI 답변 텍스트" }
 * ========================================================================== */

const MODEL = 'claude-haiku-4-5-20251001';   // 빠르고 저렴. 필요시 'claude-sonnet-4-6' 등으로 교체
const MAX_TOKENS = 600;

export default async function handler(req, res) {
  // ---- CORS (어느 도메인/로컬에서도 호출 가능) ----
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const context = String(body.context || '').slice(0, 4000);
    const incoming = Array.isArray(body.messages) ? body.messages : [];

    // 메시지 정제 (역할/길이 제한, 최근 8개)
    const messages = incoming.slice(-8).map(m => ({
      role: m && m.role === 'assistant' ? 'assistant' : 'user',
      content: String((m && m.content) || '').slice(0, 2000)
    })).filter(m => m.content);
    if (!messages.length) return res.status(400).json({ error: '메시지가 비어 있습니다.' });

    const system =
      "너는 시민 재정 감시 플랫폼 '대한민국 재정 365'의 'AI 도우미 챗봇'이다. 친근하고 명료한 말투로 사이트 이용을 돕는다. " +
      "역할: (1) 사이트 전반 안내 — 재정진단·시각화·전국 순위·지자체 비교·상세페이지·세출예산 PDF·시민 의견·김보미 소개 등 어디서 무엇을 할 수 있는지 길을 알려준다. " +
      "(2) 어려운 재정·예산 용어(재정자립도·재정자주도·집행률·채무비율·금고이자율·수의계약·이월/불용·통합재정수지·인구소멸지수 등)를 일반 시민이 이해하도록 쉽게 풀어 설명한다. " +
      "가드레일: (a) 아래 '플랫폼 컨텍스트'의 수치는 통계 기반 참고치임을 전제로 답하고, 신고·인용 전 공식 원부(지방재정365·lofin365) 확인을 권한다. 모르면 모른다고 한다. " +
      "(b) 특정 인물·단체를 단정적으로 비방하지 말고 객관 수치만 다룬다. 특정 후보·정당에 대한 투표 권유나 선거운동성 발언은 하지 않는다. " +
      "(c) 한국어로 보통 3~5문장, 필요하면 짧은 불릿. 시민이 직접 감시·견제·제안에 참여하도록 따뜻하게 독려한다.\n\n" +
      "[플랫폼 컨텍스트]\n" + (context || '(없음)');

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system, messages })
    });

    if (!r.ok) {
      const errText = await r.text();
      return res.status(502).json({ error: 'LLM 호출 실패', detail: errText.slice(0, 500) });
    }
    const data = await r.json();
    const reply = (data && data.content && data.content[0] && data.content[0].text) || '';
    return res.status(200).json({ reply: reply || '죄송해요, 지금은 답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요.' });

  } catch (e) {
    return res.status(500).json({ error: '서버 오류', detail: String(e).slice(0, 300) });
  }
}

/* ----------------------------------------------------------------------------
 * (대안) OpenAI 를 쓰고 싶다면 위 fetch 블록을 아래로 교체하고
 *        환경변수 OPENAI_API_KEY 를 설정하세요.
 *
 *   const r = await fetch('https://api.openai.com/v1/chat/completions', {
 *     method: 'POST',
 *     headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
 *     body: JSON.stringify({
 *       model: 'gpt-4o-mini', max_tokens: 600,
 *       messages: [{ role: 'system', content: system }, ...messages]
 *     })
 *   });
 *   const data = await r.json();
 *   const reply = data?.choices?.[0]?.message?.content || '';
 * -------------------------------------------------------------------------- */
