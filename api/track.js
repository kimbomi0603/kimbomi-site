// api/track.js — first-party analytics collector. Stores only aggregates (no PII).
const crypto = require('crypto');

const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL;
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN;
const SALT = process.env.ANALYTICS_SALT || 'kb-analytics-v1';

function kstDate(){ return new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10); }
function kstHour(){ return new Date(Date.now() + 9*3600*1000).toISOString().slice(11,13); }

async function pipeline(cmds){
  const r = await fetch(RURL + '/pipeline', {
    method:'POST',
    headers:{ Authorization:'Bearer '+RTOK, 'Content-Type':'application/json' },
    body: JSON.stringify(cmds)
  });
  return r.json();
}

function readBody(req){
  return new Promise(function(resolve){
    if (req.body !== undefined && req.body !== null) { resolve(req.body); return; }
    var d = ''; req.on('data', function(c){ d += c; });
    req.on('end', function(){ resolve(d); });
    req.on('error', function(){ resolve(''); });
  });
}

var SEARCH = { 'naver':'네이버','google':'구글','daum':'다음','bing':'빙','yahoo':'야후','kakao':'카카오' };
var SOCIAL = { 'facebook':'페이스북','instagram':'인스타그램','youtube':'유튜브','youtu':'유튜브','t.co':'X(트위터)','twitter':'X(트위터)','x.com':'X(트위터)','band':'밴드','blog.naver':'네이버블로그','threads':'스레드','tiktok':'틱톡' };

function classifySource(ref, utm, selfHost){
  if (utm) return 'UTM·' + utm.slice(0,40);
  if (!ref) return '직접 유입';
  var host = '';
  try { host = new URL(ref).host.replace(/^www\./,''); } catch(e){ return '직접 유입'; }
  if (host === selfHost || host.indexOf('4k0b53xuva') >= 0) return '사이트 내부';
  for (var k in SEARCH){ if (host.indexOf(k) >= 0) return '검색·' + SEARCH[k]; }
  for (var s in SOCIAL){ if (host.indexOf(s) >= 0) return 'SNS·' + SOCIAL[s]; }
  return '추천·' + host.slice(0,40);
}

function safe(v, n){ return String(v == null ? '' : v).replace(/[\r\n]/g,' ').slice(0, n || 60); }

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok:false }); return; }
  if (!RURL || !RTOK) { res.status(200).json({ ok:false, configured:false }); return; }

  var raw = await readBody(req);
  var body = raw;
  if (typeof raw === 'string') { try { body = JSON.parse(raw || '{}'); } catch(e){ body = {}; } }
  if (!body || typeof body !== 'object') body = {};
  var events = Array.isArray(body.e) ? body.e.slice(0, 12) : [];
  if (!events.length) { res.status(200).json({ ok:true, n:0 }); return; }

  var h = req.headers;
  var ip = (h['x-forwarded-for'] || '').split(',')[0].trim() || h['x-real-ip'] || '';
  var ua = h['user-agent'] || '';
  var country = h['x-vercel-ip-country'] || '';
  var region = h['x-vercel-ip-country-region'] || '';
  var city = '';
  try { city = decodeURIComponent(h['x-vercel-ip-city'] || ''); } catch(e){ city = h['x-vercel-ip-city'] || ''; }
  var selfHost = (h['host'] || '').replace(/^www\./,'');

  var day = kstDate();
  var hour = kstHour();
  var vid = crypto.createHash('sha256').update(ip + '|' + ua + '|' + day + '|' + SALT).digest('hex').slice(0,16);

  // region label
  var regionLabel;
  if (country === 'KR') regionLabel = city ? ('대한민국·' + city) : '대한민국·기타';
  else if (country) regionLabel = (country) + (city ? ('·' + city) : '');
  else regionLabel = '알수없음';
  regionLabel = safe(regionLabel, 50);

  var HK = 'a:h:' + day;
  var cmds = [];

  events.forEach(function(ev){
    var ty = ev.ty || 'pv';
    var path = safe(ev.p || '/', 80) || '/';
    if (ty === 'pv') {
      var src = classifySource(safe(ev.r, 200), safe(ev.u, 40), selfHost);
      var dev = (ev.d === 'm') ? '모바일' : 'PC';
      cmds.push(['INCR', 'a:pv:' + day]);
      cmds.push(['PFADD', 'a:uv:' + day, vid]);
      cmds.push(['HINCRBY', HK, 'src:' + src, 1]);
      cmds.push(['HINCRBY', HK, 'rg:' + regionLabel, 1]);
      cmds.push(['HINCRBY', HK, 'path:' + path, 1]);
      cmds.push(['HINCRBY', HK, 'hr:' + hour, 1]);
      cmds.push(['HINCRBY', HK, 'dev:' + dev, 1]);
      if (ev.en === '1') cmds.push(['HINCRBY', HK, 'enter:' + path, 1]);
    } else if (ty === 'menu') {
      cmds.push(['HINCRBY', HK, 'menu:' + safe(ev.m, 40), 1]);
    } else if (ty === 'out') {
      cmds.push(['HINCRBY', HK, 'out:' + safe(ev.m, 50), 1]);
    }
  });

  if (!cmds.length) { res.status(200).json({ ok:true, n:0 }); return; }

  try { await pipeline(cmds); } catch(e){}
  res.status(200).json({ ok:true, n:events.length });
};
