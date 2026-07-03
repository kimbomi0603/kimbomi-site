// api/admin.js — analytics + thoughts read API. Protected by ADMIN_KEY env var.
const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL;
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN;
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const REPORT_TOKEN = process.env.REPORT_TOKEN || '';

function kstDate(off){ return new Date(Date.now() + 9*3600*1000 - (off||0)*86400000).toISOString().slice(0,10); }

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
function hobj(result){
  var o = {};
  if (Array.isArray(result)) { for (var i=0;i<result.length;i+=2) o[result[i]] = result[i+1]; }
  else if (result && typeof result === 'object') { o = result; }
  return o;
}
function groupDims(result){
  var o = hobj(result);
  var g = { src:{}, rg:{}, path:{}, hr:{}, dev:{}, menu:{}, out:{}, enter:{} };
  Object.keys(o).forEach(function(f){
    var i = f.indexOf(':'); if (i < 0) return;
    var pre = f.slice(0,i), key = f.slice(i+1), val = parseInt(o[f],10) || 0;
    if (g[pre]) g[pre][key] = val;
  });
  return g;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control','no-store');
  const action = (req.query.action || 'overview');
  const key = req.query.key || req.headers['x-admin-key'] || '';
  const isAdmin = ADMIN_KEY && key === ADMIN_KEY;
  const isReporter = REPORT_TOKEN && key === REPORT_TOKEN;

  if (!RURL || !RTOK) { res.status(200).json({ ok:false, configured:false }); return; }
  if (!ADMIN_KEY && !REPORT_TOKEN) { res.status(200).json({ ok:false, configured:false, needsKey:true }); return; }
  if (!isAdmin && !isReporter) { res.status(401).json({ ok:false, error:'unauthorized' }); return; }

  try {
    if (action === 'savereport' && req.method === 'POST') {
      var raw = await readBody(req); var b = raw;
      if (typeof raw === 'string') { try { b = JSON.parse(raw||'{}'); } catch(e){ b={}; } }
      var rec = JSON.stringify({ date: (b.date||kstDate(1)), title: String(b.title||'').slice(0,200), md: String(b.md||'').slice(0,20000), stats: b.stats||{}, ts: Date.now() });
      await pipeline([ ['LPUSH','a:reports', rec], ['LTRIM','a:reports',0,199] ]);
      res.status(200).json({ ok:true }); return;
    }

    if (action === 'thoughts') {
      var t = await redis(['LRANGE','kb_thoughts',0,499]);
      var items = (t.result||[]).map(function(s){ try { return JSON.parse(s); } catch(e){ return null; } }).filter(Boolean);
      res.status(200).json({ ok:true, count: items.length, items: items }); return;
    }

    if (action === 'reports') {
      var rr = await redis(['LRANGE','a:reports',0,120]);
      var reports = (rr.result||[]).map(function(s){ try { return JSON.parse(s); } catch(e){ return { md:s }; } });
      res.status(200).json({ ok:true, items: reports }); return;
    }

    if (action === 'day') {
      var d = req.query.date || kstDate(0);
      var pr = await pipeline([ ['GET','a:pv:'+d], ['PFCOUNT','a:uv:'+d], ['HGETALL','a:h:'+d] ]);
      var pv = parseInt((pr[0]&&pr[0].result)||0,10)||0;
      var uv = parseInt((pr[1]&&pr[1].result)||0,10)||0;
      var dims = groupDims(pr[2]&&pr[2].result);
      res.status(200).json({ ok:true, date:d, pv:pv, uv:uv, dims:dims }); return;
    }

    // overview (default): trend + today breakdown + thoughts count
    var days = Math.min(parseInt(req.query.days||'14',10)||14, 60);
    var dates = []; for (var i=days-1;i>=0;i--) dates.push(kstDate(i));
    var tcmds = [];
    dates.forEach(function(dd){ tcmds.push(['GET','a:pv:'+dd]); tcmds.push(['PFCOUNT','a:uv:'+dd]); });
    var tp = await pipeline(tcmds);
    var trend = dates.map(function(dd, idx){
      return { date:dd, pv: parseInt((tp[idx*2]&&tp[idx*2].result)||0,10)||0, uv: parseInt((tp[idx*2+1]&&tp[idx*2+1].result)||0,10)||0 };
    });
    var today = kstDate(0);
    var tb = await pipeline([ ['HGETALL','a:h:'+today], ['LLEN','kb_thoughts'] ]);
    var dims = groupDims(tb[0]&&tb[0].result);
    var thoughtCount = parseInt((tb[1]&&tb[1].result)||0,10)||0;
    var totPv = trend.reduce(function(a,x){return a+x.pv;},0);
    res.status(200).json({ ok:true, today:today, trend:trend, dims:dims, thoughtCount:thoughtCount, totalPvRange:totPv });
  } catch(e) {
    res.status(200).json({ ok:false, error:String(e && e.message || e) });
  }
};
