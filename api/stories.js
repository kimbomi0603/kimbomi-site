// api/stories.js — "이생망 공유방" API. Upstash Redis 재사용 (Supabase 미사용).
// rooms: 'personal'(나의 이생망) | 'party'(민주당의 이생망)
// actions:
//   GET  ?action=list&room=&sort=new|top&offset=&limit=
//   POST ?action=post    body:{room,nick,content}
//   POST ?action=react   body:{room,id,key,op:'add'|'remove'}   key: cry|heart|up|fire|lol
//   POST ?action=report  body:{room,id}
//   GET  ?action=all&key=ADMIN_KEY[&room=]        (관리자: 신고순)
//   POST ?action=remove&key=ADMIN_KEY  body:{room,id}
const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL;
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN;
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const MAXKEEP = 300;
const RKEYS = ['cry','heart','up','fire','lol'];
const ROOMS = { personal:1, party:1 };
const BADWORDS = ['시발','씨발','ㅅㅂ','병신','ㅂㅅ','개새끼','개새','새끼','좆','존나','꺼져','닥쳐','엿먹','죽어','지랄','미친놈','미친년','fuck','shit','asshole'];

function listKey(room){ return 'kb_st:' + room; }
function statKey(id){ return 'kb_stx:' + id; }

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
  s = String(s == null ? '' : s);
  var out = '';
  for (var i=0;i<s.length;i++){ var c=s.charCodeAt(i); if (c===9 || c===10 || c>=32) out += s[i]; }
  out = out.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  if (out.length > max) out = out.slice(0, max);
  return out;
}
function hasBad(s){ var t = s.replace(/\s/g,'').toLowerCase(); return BADWORDS.some(function(w){ return t.indexOf(w) >= 0; }); }
function ipOf(req){ var f = req.headers['x-forwarded-for'] || ''; return (f.split(',')[0] || (req.socket && req.socket.remoteAddress) || '').trim(); }
function parse(list){ return (list||[]).map(function(s){ try { var o=JSON.parse(s); o._raw=s; return o; } catch(e){ return null; } }).filter(Boolean); }
function hobj(result){ var o={}; if(Array.isArray(result)){ for(var i=0;i<result.length;i+=2) o[result[i]]=result[i+1]; } else if(result && typeof result==='object'){ o=result; } return o; }
async function limited(req, tag, max, ttl){
  var key='rl:'+tag+':'+ipOf(req);
  var r=await redis(['INCR', key]); var n=parseInt((r&&r.result)||0,10)||0;
  if(n===1){ await redis(['EXPIRE', key, ttl]); }
  return n>max;
}
async function attachStats(items){
  if(!items.length) return items;
  var cmds = items.map(function(it){ return ['HGETALL', statKey(it.id)]; });
  var res = await pipeline(cmds);
  items.forEach(function(it, i){
    var h = hobj(res[i] && res[i].result);
    var reactions={}, sum=0;
    RKEYS.forEach(function(k){ var v=parseInt(h[k]||0,10)||0; reactions[k]=v; sum+=v; });
    it.reactions=reactions; it.reactSum=sum; it.report=parseInt(h.report||0,10)||0;
    delete it._raw;
  });
  return items;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control','no-store');
  if (!RURL || !RTOK) { res.status(200).json({ ok:false, configured:false, error:'no store' }); return; }
  var action = req.query.action || 'list';
  try {
    if (action === 'list') {
      var room = req.query.room; if(!ROOMS[room]){ res.status(200).json({ ok:false, error:'bad room' }); return; }
      var sort = req.query.sort==='top' ? 'top' : 'new';
      var offset = Math.max(0, parseInt(req.query.offset,10)||0);
      var limit = Math.min(20, Math.max(1, parseInt(req.query.limit,10)||10));
      var lr = await redis(['LRANGE', listKey(room), 0, MAXKEEP-1]);
      var arr = parse(lr.result);
      await attachStats(arr);
      if(sort==='top'){ arr.sort(function(a,b){ return (b.reactSum-a.reactSum) || (b.ts-a.ts); }); }
      res.status(200).json({ ok:true, room:room, sort:sort, total:arr.length, offset:offset, limit:limit, items:arr.slice(offset, offset+limit) });
      return;
    }

    if (action === 'post' && req.method === 'POST') {
      if (await limited(req,'st',12,600)) { res.status(200).json({ ok:false, error:'rate' }); return; }
      var raw = await readBody(req); var b = raw;
      if (typeof raw === 'string') { try { b = JSON.parse(raw||'{}'); } catch(e){ b={}; } }
      var room2 = b.room; if(!ROOMS[room2]){ res.status(200).json({ ok:false, error:'bad room' }); return; }
      var content = clean(b.content, 200);
      if(!content){ res.status(200).json({ ok:false, error:'empty' }); return; }
      if(hasBad(content)){ res.status(200).json({ ok:false, error:'badword' }); return; }
      var nick = clean(b.nick, 16);
      if(nick && hasBad(nick)) nick='';
      if(!nick){ nick = '익명의 계란 #' + Math.floor(Math.random()*900+100); }
      var id = Date.now().toString(36) + Math.random().toString(36).slice(2,8);
      var rec = { id:id, room:room2, nick:nick, content:content, ts:Date.now() };
      await pipeline([ ['LPUSH', listKey(room2), JSON.stringify(rec)], ['LTRIM', listKey(room2), 0, MAXKEEP-1] ]);
      var out = { id:id, room:room2, nick:nick, content:content, ts:rec.ts, reactions:{cry:0,heart:0,up:0,fire:0,lol:0}, reactSum:0, report:0 };
      res.status(200).json({ ok:true, item:out });
      return;
    }

    if (action === 'react' && req.method === 'POST') {
      if (await limited(req,'rx',200,600)) { res.status(200).json({ ok:false, error:'rate' }); return; }
      var raw3 = await readBody(req); var b3 = raw3;
      if (typeof raw3 === 'string') { try { b3 = JSON.parse(raw3||'{}'); } catch(e){ b3={}; } }
      var id3 = String(b3.id||''); var key3 = String(b3.key||'');
      if(!id3 || RKEYS.indexOf(key3)<0){ res.status(200).json({ ok:false, error:'bad' }); return; }
      var delta = (b3.op==='remove') ? -1 : 1;
      var hr = await redis(['HINCRBY', statKey(id3), key3, delta]);
      var count = parseInt((hr&&hr.result),10); if(isNaN(count)) count=0;
      if(count<0){ await redis(['HSET', statKey(id3), key3, 0]); count=0; }
      res.status(200).json({ ok:true, key:key3, count:count });
      return;
    }

    if (action === 'report' && req.method === 'POST') {
      if (await limited(req,'rp',30,600)) { res.status(200).json({ ok:false, error:'rate' }); return; }
      var raw4 = await readBody(req); var b4 = raw4;
      if (typeof raw4 === 'string') { try { b4 = JSON.parse(raw4||'{}'); } catch(e){ b4={}; } }
      var id4 = String(b4.id||''); if(!id4){ res.status(200).json({ ok:false, error:'bad' }); return; }
      var rr = await redis(['HINCRBY', statKey(id4), 'report', 1]);
      res.status(200).json({ ok:true, report: parseInt((rr&&rr.result)||0,10)||0 });
      return;
    }

    if (action === 'all') {
      var akey = req.query.key || req.headers['x-admin-key'] || '';
      if (!ADMIN_KEY || akey !== ADMIN_KEY) { res.status(401).json({ ok:false, error:'unauthorized' }); return; }
      var rooms = req.query.room && ROOMS[req.query.room] ? [req.query.room] : ['personal','party'];
      var acc = [];
      for (var ri=0; ri<rooms.length; ri++){
        var lr2 = await redis(['LRANGE', listKey(rooms[ri]), 0, MAXKEEP-1]);
        var a2 = parse(lr2.result); await attachStats(a2); acc = acc.concat(a2);
      }
      acc.sort(function(a,b){ return (b.report-a.report) || (b.ts-a.ts); });
      res.status(200).json({ ok:true, total:acc.length, items:acc });
      return;
    }

    if (action === 'remove' && req.method === 'POST') {
      var akey2 = req.query.key || req.headers['x-admin-key'] || '';
      if (!ADMIN_KEY || akey2 !== ADMIN_KEY) { res.status(401).json({ ok:false, error:'unauthorized' }); return; }
      var raw5 = await readBody(req); var b5 = raw5;
      if (typeof raw5 === 'string') { try { b5 = JSON.parse(raw5||'{}'); } catch(e){ b5={}; } }
      var room5 = b5.room, id5 = String(b5.id||'');
      if(!ROOMS[room5] || !id5){ res.status(200).json({ ok:false, error:'bad' }); return; }
      var lr3 = await redis(['LRANGE', listKey(room5), 0, MAXKEEP-1]);
      var target = (lr3.result||[]).find(function(s){ try { return JSON.parse(s).id === id5; } catch(e){ return false; } });
      if(!target){ res.status(200).json({ ok:false, error:'not found' }); return; }
      var rem = await redis(['LREM', listKey(room5), 1, target]);
      var removed = parseInt((rem&&rem.result)||0,10)||0;
      if(removed>0){ await pipeline([ ['LPUSH','kb_st_removed', target], ['LTRIM','kb_st_removed',0,299], ['DEL', statKey(id5)] ]); }
      res.status(200).json({ ok:true, removed:removed });
      return;
    }

    res.status(200).json({ ok:false, error:'bad action' });
  } catch(e) {
    res.status(200).json({ ok:false, error:String(e && e.message || e) });
  }
};
