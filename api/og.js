// api/og.js — 링크 미리보기용 OG 메타데이터 조회 (읽기 전용)
//   GET ?url=<기사 URL>  →  { ok, image, title, desc, site }
//   · 허용된 언론사 도메인만 조회 (SSRF 방지)
//   · https 만 허용, 6초 타임아웃, 응답 300KB 까지만 읽음
//   · 결과는 Upstash Redis에 7일 캐시 (kb_og:<url>)
const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL;
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN;
const TTL = 60 * 60 * 24 * 7;
const MAXB = 300 * 1024;

// 조회를 허용할 도메인 (언론사·포털 뉴스)
const ALLOW = [
  'naver.com', 'daum.net', 'ohmynews.com', 'pressian.com', 'khan.co.kr', 'hani.co.kr',
  'chosun.com', 'joongang.co.kr', 'donga.com', 'munhwa.com', 'seoul.co.kr', 'segye.com',
  'kmib.co.kr', 'hankookilbo.com', 'hankyung.com', 'mk.co.kr', 'edaily.co.kr', 'mt.co.kr',
  'newsis.com', 'news1.kr', 'yna.co.kr', 'ytn.co.kr', 'imbc.com', 'kbs.co.kr', 'sbs.co.kr',
  'jtbc.co.kr', 'newspim.com', 'fnnews.com', 'sedaily.com', 'asiae.co.kr', 'newstomato.com',
  'mediatoday.co.kr', 'polinews.co.kr', 'sisajournal.com', 'kukinews.com', 'tf.co.kr',
  'wikitree.co.kr', 'ilyoseoul.co.kr', 'shinmoongo.net', 'jgynews.com', 'theleader.co.kr',
  'christiandaily.co.kr', 'jeollailbo.com', 'joseilbo.com', 'lawissue.co.kr', 'imaeil.com'
];

function allowed(host){
  host = String(host || '').toLowerCase().replace(/^www\./, '');
  return ALLOW.some(function(d){ return host === d || host.endsWith('.' + d); });
}

async function redis(cmd){
  if (!RURL || !RTOK) return null;
  try {
    const r = await fetch(RURL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RTOK, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd)
    });
    return r.json();
  } catch (e) { return null; }
}

function pick(html, props){
  for (var i = 0; i < props.length; i++){
    var p = props[i];
    var re = new RegExp('<meta[^>]+(?:property|name)=["\']' + p + '["\'][^>]*>', 'i');
    var tag = (html.match(re) || [])[0];
    if (!tag) continue;
    var c = tag.match(/content=["']([^"']*)["']/i);
    if (c && c[1]) return c[1].trim();
  }
  return '';
}

function decode(s){
  return String(s || '')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
  var raw = String((req.query && req.query.url) || '');
  var u;
  try { u = new URL(raw); } catch (e) { res.status(200).json({ ok: false, error: 'bad url' }); return; }
  if (u.protocol !== 'https:') { res.status(200).json({ ok: false, error: 'https only' }); return; }
  if (!allowed(u.hostname)) { res.status(200).json({ ok: false, error: 'domain not allowed' }); return; }

  var key = 'kb_og:' + u.href;
  var hit = await redis(['GET', key]);
  if (hit && hit.result) {
    try { res.status(200).json(JSON.parse(hit.result)); return; } catch (e) {}
  }

  var out = { ok: false };
  try {
    var ctl = new AbortController();
    var timer = setTimeout(function(){ ctl.abort(); }, 6000);
    var r = await fetch(u.href, {
      redirect: 'follow',
      signal: ctl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; kimbomi.com link preview)', 'Accept': 'text/html' }
    });
    clearTimeout(timer);

    var ct = (r.headers.get('content-type') || '');
    if (!r.ok || ct.indexOf('text/html') < 0) throw new Error('not html');

    // 앞부분만 읽어서 <head> 메타태그만 확보
    var reader = r.body.getReader(), dec = new TextDecoder('utf-8'), html = '', got = 0;
    while (got < MAXB) {
      var chunk = await reader.read();
      if (chunk.done) break;
      got += chunk.value.length;
      html += dec.decode(chunk.value, { stream: true });
      if (html.indexOf('</head>') >= 0) break;
    }
    try { reader.cancel(); } catch (e) {}

    var img = pick(html, ['og:image', 'twitter:image', 'twitter:image:src']);
    if (img && img.indexOf('//') === 0) img = 'https:' + img;
    if (img && img.indexOf('http') !== 0) { try { img = new URL(img, u.href).href; } catch (e) { img = ''; } }
    if (img && img.indexOf('https://') !== 0) img = '';   // http 이미지는 혼합콘텐츠라 제외

    out = {
      ok: true,
      image: decode(img),
      title: decode(pick(html, ['og:title', 'twitter:title'])),
      desc:  decode(pick(html, ['og:description', 'twitter:description', 'description'])).slice(0, 200),
      site:  decode(pick(html, ['og:site_name'])) || u.hostname.replace(/^www\./, '')
    };
  } catch (e) {
    out = { ok: false, error: 'fetch failed', site: u.hostname.replace(/^www\./, '') };
  }

  await redis(['SET', key, JSON.stringify(out), 'EX', String(TTL)]);
  res.status(200).json(out);
};
