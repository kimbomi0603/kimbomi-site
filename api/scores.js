// api/scores.js — 「계란으로 바위치기」 명예의 전당(랭킹) API. 기존 Upstash Redis 재사용.
// actions:
//   GET  ?action=top[&id=<recId>]      → 상위 10위 + (id 지정 시) 내 순위
//   POST ?action=submit  body:{msg,score,keywords[],runCount} → 등록 + 내 순위 반환
//   POST ?action=remove  body:{id}  header/query key=ADMIN_KEY → 관리자 삭제(소프트)
const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL;
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN;
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const LIST = 'kb_scores';
const MAXKEEP = 300;

// 과하지 않은 기본 금칙어(욕설). 인물 실명 비방은 기본 필터 + 관리자 삭제로 대응.
const BADWORDS = ['시발','씨발','ㅅㅂ','병신','ㅂㅅ','개새끼','개새','새끼','좆','존나','꺼져','닥쳐','엿먹','죽어','지랄','미친놈','미친년','fuck','shit','asshole'];

async function redis(cmd){
  const r = await fetch(RURL, { method:'POST', headers:{ Authorization:'Bearer '+RTOK, 'Content-Type':'application/json' }, body: JSON.stringify(cmd) });
  return r.json();
}
async function pipeline(cmds){
  const r = await fetch(RURL + '/pipeline', { method:'POST', headers:{ Authorization:'Bearer '+RTOK, 'Content-Type':'application/json' }, body: JSON.stringify(cmds) });
  return r.json();
}
function readBody(req){
  return new Promise(function(resolve){
    if (req.body !== undefined && req.body !== null) { resolve(req.body); return; }
    var d=''; req.on('data',function(c){d+=c;}); req.on('end',function(){resolve(d);}); req.on('error',function(){resolve('');});
  });
}
function clean(s, max){
  s = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g,'').replace(/\s+/g,' ').trim();
  if (s.length > max) s = s.slice(0, max);
  return s;
}
function hasBad(s){ var t = s.replace(/\s/g,'').toLowerCase(); return BADWORDS.some(function(w){ return t.indexOf(w) >= 0; }); }
function cmp(a,b){ return (b.score-a.score) || (a.runCount-b.runCount) || ((b.ts||0)-(a.ts||0)); }
function ipOf(req){ var f = req.headers['x-forwarded-for'] || ''; return (f.split(',')[0] || (req.socket && req.socket.remoteAddress) || '').trim(); }
function parse(list){ return (list||[]).map(function(s){ try { return JSON.parse(s); } catch(e){ return null; } }).filter(Boolean); }

module.exports = async (req, res) => {
  res.setHeader('Cache-Control','no-store');
  if (!RURL || !RTOK) { res.status(200).json({ ok:false, configured:false, error:'no store' }); return; }
  const action = req.query.action || 'top';
  try {
    if (action === 'submit' && req.method === 'POST') {
      // rate limit: 동일 IP 5분당 15건
      var ip = ipOf(req), rlKey = 'rl:sc:' + ip;
      var rl = await redis(['INCR', rlKey]); var n = parseInt((rl && rl.result) || 0, 10) || 0;
      if (n === 1) { await redis(['EXPIRE', rlKey, 300]); }
      if (n > 15) { res.status(200).json({ ok:false, error:'rate' }); return; }

      var raw = await readBody(req); var b = raw;
      if (typeof raw === 'string') { try { b = JSON.parse(raw || '{}'); } catch(e){ b = {}; } }

      var msg = clean(b.msg, 40);
      if (!msg || hasBad(msg)) msg = '익명의 계란';
      var kws = Array.isArray(b.keywords) ? b.keywords.slice(0,5).map(function(k){ return clean(k,20); }).filter(Boolean) : [];
      var sc = Math.max(0, Math.min(10000000, parseInt(b.score,10) || 0));
      var rc = Math.max(1, Math.min(999, parseInt(b.runCount,10) || 1));
      var id = Date.now().toString(36) + Math.random().toString(36).slice(2,8);
      var rec = { id:id, msg:msg, score:sc, keywords:kws, runCount:rc, ts:Date.now() };

      await pipeline([ ['LPUSH', LIST, JSON.stringify(rec)], ['LTRIM', LIST, 0, MAXKEEP-1] ]);
      var all = await redis(['LRANGE', LIST, 0, MAXKEEP-1]);
      var arr = parse(all.result).sort(cmp);
      var rank = arr.findIndex(function(x){ return x.id === id; }) + 1;
      res.status(200).json({ ok:true, id:id, rank:rank, total:arr.length, top:arr.slice(0,10) });
      return;
    }

    if (action === 'top') {
      var all2 = await redis(['LRANGE', LIST, 0, MAXKEEP-1]);
      var arr2 = parse(all2.result).sort(cmp);
      var out = { ok:true, total:arr2.length, top:arr2.slice(0,10) };
      var qid = req.query.id;
      if (qid) { var i = arr2.findIndex(function(x){ return x.id === qid; }); out.myRank = i >= 0 ? i+1 : null; }
      res.status(200).json(out);
      return;
    }

    if (action === 'remove' && req.method === 'POST') {
      var key = req.query.key || req.headers['x-admin-key'] || '';
      if (!ADMIN_KEY || key !== ADMIN_KEY) { res.status(401).json({ ok:false, error:'unauthorized' }); return; }
      var raw3 = await readBody(req); var bb = raw3;
      if (typeof raw3 === 'string') { try { bb = JSON.parse(raw3 || '{}'); } catch(e){ bb = {}; } }
      var tid = bb && bb.id; if (!tid) { res.status(200).json({ ok:false, error:'no id' }); return; }
      var all3 = await redis(['LRANGE', LIST, 0, MAXKEEP-1]);
      var target = (all3.result || []).find(function(s){ try { return JSON.parse(s).id === tid; } catch(e){ return false; } });
      if (!target) { res.status(200).json({ ok:false, error:'not found' }); return; }
      var rem = await redis(['LREM', LIST, 1, target]);
      var removed = parseInt((rem && rem.result) || 0, 10) || 0;
      if (removed > 0) { await pipeline([ ['LPUSH','kb_scores_removed', target], ['LTRIM','kb_scores_removed',0,199] ]); }
      res.status(200).json({ ok:true, removed:removed });
      return;
    }

    res.status(200).json({ ok:false, error:'bad action' });
  } catch(e) {
    res.status(200).json({ ok:false, error:String(e && e.message || e) });
  }
};
