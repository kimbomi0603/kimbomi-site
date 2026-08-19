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
  // 유입 경로에서 '사이트 내부'(사이트 안에서의 페이지 이동)는 유입이 아니므로 제외한다.
  // (과거에 쌓인 데이터도 화면에서 함께 제외됨)
  if (g.src) delete g.src['사이트 내부'];
  return g;
}


const CRON_SECRET = process.env.CRON_SECRET || '';
function kstDateFrom(ms){ return new Date(ms + 9*3600*1000).toISOString().slice(0,10); }
var DOW = ['일','월','화','수','목','금','토'];
function dow(dstr){ try { return DOW[new Date(dstr+'T00:00:00+09:00').getDay()]; } catch(e){ return ''; } }
function topN(obj, n){ return Object.keys(obj||{}).map(function(k){return [k,obj[k]];}).sort(function(a,b){return b[1]-a[1];}).slice(0,n); }
function listLines(entries, unit){ if(!entries.length) return '  · (없음)'; return entries.map(function(e,i){ return '  '+(i+1)+'. '+e[0]+' — '+e[1].toLocaleString()+(unit||''); }).join('\n'); }
function pctc(a,b){ if(!b) return a>0?'신규':'0%'; var d=Math.round((a-b)/b*100); return (d>=0?'+':'')+d+'%'; }

module.exports = async (req, res) => {
  res.setHeader('Cache-Control','no-store');
  const action = (req.query.action || 'overview');
  const key = req.query.key || req.headers['x-admin-key'] || '';
  const isAdmin = ADMIN_KEY && key === ADMIN_KEY;
  const isReporter = REPORT_TOKEN && key === REPORT_TOKEN;

  if (!RURL || !RTOK) { res.status(200).json({ ok:false, configured:false }); return; }
  if (action === 'cronreport') {
    if (CRON_SECRET) { var _a=req.headers['authorization']||''; var _t=req.query.t||''; if(_a!=='Bearer '+CRON_SECRET && _t!==CRON_SECRET){ res.status(401).json({ok:false,error:'unauthorized'}); return; } }
    try {
      var cdate = req.query.date || kstDate(1);
      var cprev = kstDateFrom(new Date(cdate+'T00:00:00+09:00').getTime() - 86400000);
      var cpr = await pipeline([['GET','a:pv:'+cdate],['PFCOUNT','a:uv:'+cdate],['HGETALL','a:h:'+cdate],['GET','a:pv:'+cprev],['PFCOUNT','a:uv:'+cprev],['LRANGE','kb_thoughts',0,499]]);
      var cpv=parseInt((cpr[0]&&cpr[0].result)||0,10)||0, cuv=parseInt((cpr[1]&&cpr[1].result)||0,10)||0;
      var cdims=groupDims(cpr[2]&&cpr[2].result);
      var cpvPrev=parseInt((cpr[3]&&cpr[3].result)||0,10)||0, cuvPrev=parseInt((cpr[4]&&cpr[4].result)||0,10)||0;
      var cAll=((cpr[5]&&cpr[5].result)||[]).map(function(x){try{return JSON.parse(x);}catch(e){return null;}}).filter(Boolean);
      var cNew=cAll.filter(function(t){ try{return kstDateFrom(new Date(t.date).getTime())===cdate;}catch(e){return false;} });
      var cDevPc=(cdims.dev&&cdims.dev['PC'])||0, cDevMo=(cdims.dev&&cdims.dev['모바일'])||0, cDevTot=cDevPc+cDevMo;
      var cSrcTop=topN(cdims.src,1)[0], cPathTop=topN(cdims.path,1)[0], cHrTop=topN(cdims.hr,1)[0];
      var L=[];
      L.push('# 일일 분석 리포트 · '+cdate+' ('+dow(cdate)+')'); L.push('');
      L.push('## 한눈에');
      L.push('- 방문(PV): '+cpv.toLocaleString()+'  (전일 '+cpvPrev.toLocaleString()+' · '+pctc(cpv,cpvPrev)+')');
      L.push('- 순방문(UV): '+cuv.toLocaleString()+'  (전일 '+cuvPrev.toLocaleString()+' · '+pctc(cuv,cuvPrev)+')');
      L.push('- 생각 나누기: 신규 '+cNew.length+'건 (누적 '+cAll.length+'건)');
      L.push('- 주 유입: '+(cSrcTop?cSrcTop[0]+' ('+cSrcTop[1]+')':'-'));
      L.push('- 관심 페이지 1위: '+(cPathTop?cPathTop[0]+' ('+cPathTop[1]+')':'-'));
      L.push('- 접속 피크: '+(cHrTop?cHrTop[0]+'시 ('+cHrTop[1]+')':'-'));
      L.push('- 기기: '+(cDevTot?('PC '+Math.round(cDevPc/cDevTot*100)+'% · 모바일 '+Math.round(cDevMo/cDevTot*100)+'%'):'-'));
      L.push(''); L.push('## 유입 경로'); L.push(listLines(topN(cdims.src,6)));
      L.push(''); L.push('## 지역 (상위)'); L.push(listLines(topN(cdims.rg,6)));
      L.push(''); L.push('## 인기 페이지'); L.push(listLines(topN(cdims.path,6)));
      L.push(''); L.push('## 메뉴 클릭 · 외부 이동');
      var cmt=topN(cdims.menu,5), cot=topN(cdims.out,5);
      L.push('- 메뉴 클릭: '+(cmt.length?cmt.map(function(e){return e[0]+'('+e[1]+')';}).join(', '):'(없음)'));
      L.push('- 외부로 이동: '+(cot.length?cot.map(function(e){return e[0]+'('+e[1]+')';}).join(', '):'(없음)'));
      L.push(''); L.push('## 생각 나누기 신규');
      if(cNew.length){ cNew.slice(0,5).forEach(function(t){ var who=[t.name,t.region].filter(Boolean).join('·')||'익명'; var msg=String(t.msg||'').replace(/\s+/g,' ').slice(0,80); L.push('- "'+msg+'" — '+who); }); } else { L.push('- (오늘 새 글 없음)'); }
      L.push(''); L.push('## 인사이트');
      var ci=[];
      if(cpvPrev===0&&cpv>0) ci.push('데이터 수집 첫 구간입니다. 오늘 방문 '+cpv+'건이 기록되었습니다.');
      else if(cpv>cpvPrev) ci.push('전일 대비 방문이 '+pctc(cpv,cpvPrev)+' 늘었습니다.');
      else if(cpv<cpvPrev) ci.push('전일 대비 방문이 '+pctc(cpv,cpvPrev)+' 줄었습니다.');
      if(cSrcTop) ci.push('유입은 '+cSrcTop[0]+'이(가) 가장 많았습니다('+cSrcTop[1]+'건).');
      if(cPathTop) ci.push('가장 많이 본 페이지는 '+cPathTop[0]+'입니다.');
      if(cot.length) ci.push('사이트에서 '+cot[0][0]+'(으)로 나간 이동이 가장 많았습니다.');
      if(cNew.length) ci.push('생각 나누기 신규 '+cNew.length+'건이 등록되었습니다. 내용을 확인해 공약·활동에 반영해 보세요.');
      if(!ci.length) ci.push('이 날은 특별한 변동이 없었습니다.');
      ci.forEach(function(x){ L.push('- '+x); });
      var cmd=L.join('\n');
      var crec=JSON.stringify({ date:cdate, title:'일일 분석 리포트 · '+cdate+' ('+dow(cdate)+')', md:cmd, stats:{pv:cpv,uv:cuv,newThoughts:cNew.length}, ts:Date.now() });
      var chead=await redis(['LRANGE','a:reports',0,0]); var csame=false;
      try{ csame=chead.result&&chead.result[0]&&JSON.parse(chead.result[0]).date===cdate; }catch(e){}
      if(csame){ await redis(['LSET','a:reports',0,crec]); } else { await pipeline([['LPUSH','a:reports',crec],['LTRIM','a:reports',0,199]]); }
      res.status(200).json({ ok:true, date:cdate, pv:cpv, uv:cuv, saved:true, replaced:csame });
    } catch(e){ res.status(200).json({ ok:false, error:String(e&&e.message||e) }); }
    return;
  }
  if (action === 'reportsubmit' && req.method === 'POST') {
    try {
      var _ip = ((req.headers['x-forwarded-for']||'').split(',')[0]||'').trim();
      var _rk = 'rl:rep2:'+_ip;
      var _r = await redis(['INCR', _rk]); var _n = parseInt((_r&&_r.result)||0,10)||0;
      if(_n===1){ await redis(['EXPIRE', _rk, 600]); }
      if(_n>5){ res.status(200).json({ ok:false, error:'rate' }); return; }
      var rraw = await readBody(req); var rb = rraw;
      if (typeof rraw === 'string') { try { rb = JSON.parse(rraw||'{}'); } catch(e){ rb={}; } }
      var _clean = function(v,max){ var x=String(v==null?'':v); var o=''; for(var i=0;i<x.length;i++){var c=x.charCodeAt(i); if(c===9||c===10||c>=32)o+=x[i];} o=o.replace(/\r/g,'').replace(/\n{3,}/g,'\n\n').trim(); if(o.length>max)o=o.slice(0,max); return o; };
      var CATS = {line:1,pressure:1,watch:1,etc:1};
      var cat = CATS[rb.category] ? rb.category : 'etc';
      var content = _clean(rb.content, 1500);
      if(!content){ res.status(200).json({ ok:false, error:'empty' }); return; }
      var region = _clean(rb.region, 30);
      var contact = _clean(rb.contact, 100);
      var rid = Date.now().toString(36)+Math.random().toString(36).slice(2,8);
      // 개인정보(IP 등)는 제보 레코드에 저장하지 않는다.
      var rrec = JSON.stringify({ id:rid, category:cat, content:content, region:region, contact:contact, ts:Date.now() });
      await pipeline([ ['LPUSH','kb_reports', rrec], ['LTRIM','kb_reports',0,499] ]);
      res.status(200).json({ ok:true });
    } catch(e){ res.status(200).json({ ok:false, error:String(e&&e.message||e) }); }
    return;
  }
  // ===== 서명운동 (공개) =====
  if (action === 'signcount') {
    try {
      var scn = await redis(['LLEN','kb_signs']);
      res.status(200).json({ ok:true, count: parseInt((scn&&scn.result)||0,10)||0 });
    } catch(e){ res.status(200).json({ ok:false, count:0 }); }
    return;
  }
  if (action === 'signsubmit' && req.method === 'POST') {
    try {
      var sip = ((req.headers['x-forwarded-for']||'').split(',')[0]||'').trim();
      var srk = 'rl:sign:'+sip;
      var srr = await redis(['INCR', srk]); var srn = parseInt((srr&&srr.result)||0,10)||0;
      if (srn === 1) { await redis(['EXPIRE', srk, 600]); }
      if (srn > 8) { res.status(200).json({ ok:false, error:'잠시 후 다시 시도해 주세요.' }); return; }
      var sraw = await readBody(req); var sb = sraw;
      if (typeof sraw === 'string') { try { sb = JSON.parse(sraw||'{}'); } catch(e){ sb={}; } }
      var sclean = function(v,max){ var x=String(v==null?'':v); var o=''; for(var i=0;i<x.length;i++){ var cc=x.charCodeAt(i); if(cc===9||cc>=32) o+=x[i]; } o=o.replace(/\s+/g,' ').trim(); if(o.length>max) o=o.slice(0,max); return o; };
      var sname = sclean(sb.name, 30);
      var sregion = sclean(sb.region, 30);
      var semail = sclean(sb.email, 100).toLowerCase();
      if (!sname || !sregion || !semail) { res.status(200).json({ ok:false, error:'이름·지역·이메일을 모두 입력해 주세요.' }); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(semail)) { res.status(200).json({ ok:false, error:'이메일 형식을 확인해 주세요.' }); return; }
      if (sb.agree !== true) { res.status(200).json({ ok:false, error:'서명 동의에 체크해 주세요.' }); return; }
      var sadd = await redis(['SADD','kb_signs_emails', semail]);
      if ((parseInt((sadd&&sadd.result)||0,10)||0) === 0) {
        var c0 = await redis(['LLEN','kb_signs']);
        res.status(200).json({ ok:true, dup:true, count: parseInt((c0&&c0.result)||0,10)||0 });
        return;
      }
      // 개인정보 최소 수집: IP 등은 저장하지 않는다.
      var srec = JSON.stringify({ name:sname, region:sregion, email:semail, news: sb.news===true, injunction: sb.injunction===true, ts: Date.now() });
      await redis(['LPUSH','kb_signs', srec]);
      var c1 = await redis(['LLEN','kb_signs']);
      res.status(200).json({ ok:true, count: parseInt((c1&&c1.result)||0,10)||0 });
    } catch(e){ res.status(200).json({ ok:false, error:String(e&&e.message||e) }); }
    return;
  }

  // ===== 후원 약정 (공개) — 실제 후원 아님, 결제·계좌 없음. 의사+연락처만 접수 =====
  if (action === 'donorcount') {
    try {
      var dcp = await pipeline([['GET','kb_donor_count'],['GET','kb_donor_amount']]);
      var dcCount = parseInt((dcp[0]&&dcp[0].result)||0,10)||0;
      var dcAmount = parseInt((dcp[1]&&dcp[1].result)||0,10)||0;
      res.status(200).json({ ok:true, count: dcCount, amount: dcAmount });
    } catch(e){ res.status(200).json({ ok:false, count:0, amount:0 }); }
    return;
  }
  if (action === 'pledgecount') {
    try {
      var pcn = await redis(['LLEN','kb_pledges']);
      res.status(200).json({ ok:true, count: parseInt((pcn&&pcn.result)||0,10)||0 });
    } catch(e){ res.status(200).json({ ok:false, count:0 }); }
    return;
  }
  if (action === 'pledgesubmit' && req.method === 'POST') {
    try {
      var pip = ((req.headers['x-forwarded-for']||'').split(',')[0]||'').trim();
      var prk = 'rl:pledge:'+pip;
      var prr = await redis(['INCR', prk]); var prn = parseInt((prr&&prr.result)||0,10)||0;
      if (prn === 1) { await redis(['EXPIRE', prk, 600]); }
      if (prn > 8) { res.status(200).json({ ok:false, error:'잠시 후 다시 시도해 주세요.' }); return; }
      var praw = await readBody(req); var pb = praw;
      if (typeof praw === 'string') { try { pb = JSON.parse(praw||'{}'); } catch(e){ pb={}; } }
      var pclean = function(v,max){ var x=String(v==null?'':v); var o=''; for(var i=0;i<x.length;i++){ var cc=x.charCodeAt(i); if(cc===9||cc>=32) o+=x[i]; } o=o.replace(/\s+/g,' ').trim(); if(o.length>max) o=o.slice(0,max); return o; };
      var pname = pclean(pb.name, 30);
      var pemail = pclean(pb.email, 100).toLowerCase();
      var pinsta = pclean(pb.instagram, 30).replace(/^@+/,'');
      if (!pname || !pemail) { res.status(200).json({ ok:false, error:'이름과 이메일을 입력해 주세요.' }); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(pemail)) { res.status(200).json({ ok:false, error:'이메일 형식을 확인해 주세요.' }); return; }
      if (pb.agree !== true || pb.understand !== true) { res.status(200).json({ ok:false, error:'약정 성격 확인과 안내 수신에 동의해 주세요.' }); return; }
      var padd = await redis(['SADD','kb_pledge_emails', pemail]);
      if ((parseInt((padd&&padd.result)||0,10)||0) === 0) {
        var pc0 = await redis(['LLEN','kb_pledges']);
        res.status(200).json({ ok:true, dup:true, count: parseInt((pc0&&pc0.result)||0,10)||0 });
        return;
      }
      // 개인정보 최소 수집: IP 등은 저장하지 않는다. 금액은 저장하되 공개 카운트엔 미포함.
      var prec = JSON.stringify({ name:pname, email:pemail, instagram:pinsta, ts: Date.now() });
      await redis(['LPUSH','kb_pledges', prec]);
      var pc1 = await redis(['LLEN','kb_pledges']);
      res.status(200).json({ ok:true, count: parseInt((pc1&&pc1.result)||0,10)||0 });
    } catch(e){ res.status(200).json({ ok:false, error:String(e&&e.message||e) }); }
    return;
  }

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

    if (action === 'signlist') {
      if (!isAdmin) { res.status(401).json({ ok:false, error:'admin only' }); return; }
      var sgl = await redis(['LRANGE','kb_signs',0,9999]);
      var sgitems = (sgl.result||[]).map(function(x){ try{ var so=JSON.parse(x); so._raw=x; return so; }catch(e){ return null; } }).filter(Boolean);
      res.status(200).json({ ok:true, count:sgitems.length, items:sgitems }); return;
    }

    if (action === 'signremove' && req.method === 'POST') {
      if (!isAdmin) { res.status(401).json({ ok:false, error:'admin only' }); return; }
      var sgraw = await readBody(req); var sgb = sgraw;
      if (typeof sgraw === 'string') { try { sgb = JSON.parse(sgraw||'{}'); } catch(e){ sgb={}; } }
      var sgt = sgb && sgb.raw;
      if (!sgt) { res.status(200).json({ ok:false, error:'no target' }); return; }
      var sgrem = await redis(['LREM','kb_signs',1,sgt]);
      var sgn = parseInt((sgrem&&sgrem.result)||0,10)||0;
      if (sgn > 0) { try { var sgo = JSON.parse(sgt); if (sgo && sgo.email) { await redis(['SREM','kb_signs_emails', sgo.email]); } } catch(e){} }
      res.status(200).json({ ok:true, removed:sgn }); return;
    }

    if (action === 'donorset' && req.method === 'POST') {
      if (!isAdmin) { res.status(401).json({ ok:false, error:'admin only' }); return; }
      var dsraw = await readBody(req); var dsb = dsraw;
      if (typeof dsraw === 'string') { try { dsb = JSON.parse(dsraw||'{}'); } catch(e){ dsb={}; } }
      var dcount = parseInt(dsb.count,10); if (isNaN(dcount) || dcount < 0) dcount = 0; if (dcount > 100000000) dcount = 100000000;
      var damount = parseInt(dsb.amount,10); if (isNaN(damount) || damount < 0) damount = 0; if (damount > 100000000000) damount = 100000000000;
      await pipeline([['SET','kb_donor_count', String(dcount)],['SET','kb_donor_amount', String(damount)]]);
      res.status(200).json({ ok:true, count: dcount, amount: damount }); return;
    }

    if (action === 'pledgelist') {
      if (!isAdmin) { res.status(401).json({ ok:false, error:'admin only' }); return; }
      var pgl = await redis(['LRANGE','kb_pledges',0,9999]);
      var pgitems = (pgl.result||[]).map(function(x){ try{ var po=JSON.parse(x); po._raw=x; return po; }catch(e){ return null; } }).filter(Boolean);
      res.status(200).json({ ok:true, count:pgitems.length, items:pgitems }); return;
    }

    if (action === 'pledgeremove' && req.method === 'POST') {
      if (!isAdmin) { res.status(401).json({ ok:false, error:'admin only' }); return; }
      var pgraw = await readBody(req); var pgb = pgraw;
      if (typeof pgraw === 'string') { try { pgb = JSON.parse(pgraw||'{}'); } catch(e){ pgb={}; } }
      var pgt = pgb && pgb.raw;
      if (!pgt) { res.status(200).json({ ok:false, error:'no target' }); return; }
      var pgrem = await redis(['LREM','kb_pledges',1,pgt]);
      var pgn = parseInt((pgrem&&pgrem.result)||0,10)||0;
      if (pgn > 0) { try { var pgo = JSON.parse(pgt); if (pgo && pgo.email) { await redis(['SREM','kb_pledge_emails', pgo.email]); } } catch(e){} }
      res.status(200).json({ ok:true, removed:pgn }); return;
    }

    if (action === 'reportlist') {
      if (!isAdmin) { res.status(401).json({ ok:false, error:'admin only' }); return; }
      var rl = await redis(['LRANGE','kb_reports',0,499]);
      var ritems = (rl.result||[]).map(function(x){ try{ var o=JSON.parse(x); return o; }catch(e){ return null; } }).filter(Boolean);
      res.status(200).json({ ok:true, count:ritems.length, items:ritems }); return;
    }

    if (action === 'reportremove' && req.method === 'POST') {
      if (!isAdmin) { res.status(401).json({ ok:false, error:'admin only' }); return; }
      var rr2 = await readBody(req); var rb2 = rr2;
      if (typeof rr2 === 'string') { try { rb2 = JSON.parse(rr2||'{}'); } catch(e){ rb2={}; } }
      var rtid = rb2 && rb2.id; if(!rtid){ res.status(200).json({ ok:false, error:'no id' }); return; }
      var rall = await redis(['LRANGE','kb_reports',0,499]);
      var rtarget = (rall.result||[]).find(function(x){ try{ return JSON.parse(x).id===rtid; }catch(e){ return false; } });
      if(!rtarget){ res.status(200).json({ ok:false, error:'not found' }); return; }
      var rrem = await redis(['LREM','kb_reports',1,rtarget]);
      var rremoved = parseInt((rrem&&rrem.result)||0,10)||0;
      if(rremoved>0){ await pipeline([ ['LPUSH','kb_reports_removed', rtarget], ['LTRIM','kb_reports_removed',0,199] ]); }
      res.status(200).json({ ok:true, removed:rremoved }); return;
    }

    if (action === 'thoughts') {
      if (!isAdmin) { res.status(401).json({ ok:false, error:'admin only' }); return; }
      var t = await redis(['LRANGE','kb_thoughts',0,499]);
      var items = (t.result||[]).map(function(s){ try { var o=JSON.parse(s); o._raw=s; return o; } catch(e){ return null; } }).filter(Boolean);
      res.status(200).json({ ok:true, count: items.length, items: items }); return;
    }

    if (action === 'removethought' && req.method === 'POST') {
      if (!isAdmin) { res.status(401).json({ ok:false, error:'admin only' }); return; }
      var raw2 = await readBody(req); var bb = raw2;
      if (typeof raw2 === 'string') { try { bb = JSON.parse(raw2||'{}'); } catch(e){ bb={}; } }
      var target = bb && bb.raw;
      if (!target) { res.status(200).json({ ok:false, error:'no target' }); return; }
      var rem = await redis(['LREM','kb_thoughts',1,target]);
      var n = parseInt((rem&&rem.result)||0,10)||0;
      if (n > 0) { await pipeline([ ['LPUSH','kb_thoughts_removed', target], ['LTRIM','kb_thoughts_removed',0,499] ]); }
      res.status(200).json({ ok:true, removed:n }); return;
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

    if (action !== 'suggestions' && action !== 'listknowledge' && action !== 'addknowledge' && action !== 'removeknowledge') {
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
return;
}
  
  if (action === 'suggestions') {
    var sl = await redis(['LRANGE','kb_suggestions',0,499]);
    var sgItems = (sl.result||[]).map(function(x){ try{ return JSON.parse(x); }catch(e){ return null; } }).filter(Boolean);
    res.status(200).json({ ok:true, count:sgItems.length, items:sgItems }); return;
  }

  if (action === 'listknowledge') {
    var kl = await redis(['LRANGE','kb_knowledge',0,49]);
    var knItems = (kl.result||[]).map(function(x){ try{ return JSON.parse(x); }catch(e){ return null; } }).filter(Boolean);
    res.status(200).json({ ok:true, count:knItems.length, items:knItems }); return;
  }

  if (action === 'addknowledge' && req.method === 'POST') {
    if (!isAdmin) { res.status(401).json({ ok:false, error:'admin only' }); return; }
    var knRaw = await readBody(req); var knB = knRaw;
    if (typeof knRaw === 'string') { try { knB = JSON.parse(knRaw||'{}'); } catch(e){ knB={}; } }
    var knContent = String(knB.content||'').trim().slice(0,50000);
    var knFilename = String(knB.filename||'').trim().slice(0,100);
    if (!knContent) { res.status(200).json({ ok:false, error:'empty' }); return; }
    var knRec = JSON.stringify({ filename:knFilename, content:knContent, ts:Date.now() });
    await pipeline([ ['LPUSH','kb_knowledge', knRec], ['LTRIM','kb_knowledge',0,49] ]);
    res.status(200).json({ ok:true }); return;
  }

  if (action === 'removeknowledge' && req.method === 'POST') {
    if (!isAdmin) { res.status(401).json({ ok:false, error:'admin only' }); return; }
    var rkRaw = await readBody(req); var rkB = rkRaw;
    if (typeof rkRaw === 'string') { try { rkB = JSON.parse(rkRaw||'{}'); } catch(e){ rkB={}; } }
    var rkTs = rkB && rkB.ts;
    if (!rkTs) { res.status(200).json({ ok:false, error:'no ts' }); return; }
    var rkAll = await redis(['LRANGE','kb_knowledge',0,49]);
    var rkTarget = (rkAll.result||[]).find(function(x){ try{ return JSON.parse(x).ts===rkTs; }catch(e){ return false; } });
    if (!rkTarget) { res.status(200).json({ ok:false, error:'not found' }); return; }
    var rkRem = await redis(['LREM','kb_knowledge',1,rkTarget]);
    res.status(200).json({ ok:true, removed:parseInt((rkRem&&rkRem.result)||0,10)||0 }); return;
  }

} catch(e) {
    res.status(200).json({ ok:false, error:String(e && e.message || e) });
  }
};
