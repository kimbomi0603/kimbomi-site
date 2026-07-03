// api/cron-report.js — builds a daily analytics report and saves it to the admin archive.
// Server-side only; reads Redis directly (no secret needed). Idempotent per date.
const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL;
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET || '';

function kstDateFrom(ms){ return new Date(ms + 9*3600*1000).toISOString().slice(0,10); }
function kstDate(off){ return kstDateFrom(Date.now() - (off||0)*86400000); }
var DOW = ['일','월','화','수','목','금','토'];
function dow(dstr){ try { return DOW[new Date(dstr+'T00:00:00+09:00').getDay()]; } catch(e){ return ''; } }

async function redis(cmd){
  const r = await fetch(RURL, { method:'POST', headers:{ Authorization:'Bearer '+RTOK, 'Content-Type':'application/json' }, body: JSON.stringify(cmd) });
  return r.json();
}
async function pipeline(cmds){
  const r = await fetch(RURL + '/pipeline', { method:'POST', headers:{ Authorization:'Bearer '+RTOK, 'Content-Type':'application/json' }, body: JSON.stringify(cmds) });
  return r.json();
}
function hobj(result){ var o={}; if (Array.isArray(result)) { for (var i=0;i<result.length;i+=2) o[result[i]]=result[i+1]; } else if (result && typeof result==='object') o=result; return o; }
function groupDims(result){
  var o=hobj(result), g={src:{},rg:{},path:{},hr:{},dev:{},menu:{},out:{},enter:{}};
  Object.keys(o).forEach(function(f){ var i=f.indexOf(':'); if(i<0) return; var p=f.slice(0,i),k=f.slice(i+1),v=parseInt(o[f],10)||0; if(g[p]) g[p][k]=v; });
  return g;
}
function topN(obj, n){ return Object.keys(obj||{}).map(function(k){return [k,obj[k]];}).sort(function(a,b){return b[1]-a[1];}).slice(0,n); }
function sum(obj){ var s=0; for (var k in obj) s+=obj[k]; return s; }
function pct(a,b){ if(!b) return a>0?'신규':'0%'; var d=Math.round((a-b)/b*100); return (d>=0?'+':'')+d+'%'; }
function listLines(entries, unit){ if(!entries.length) return '  · (없음)'; return entries.map(function(e,i){ return '  '+(i+1)+'. '+e[0]+' — '+e[1].toLocaleString()+(unit||''); }).join('\n'); }

module.exports = async (req, res) => {
  if (CRON_SECRET) {
    var auth = req.headers['authorization'] || '';
    var qt = req.query.t || '';
    if (auth !== 'Bearer ' + CRON_SECRET && qt !== CRON_SECRET) { res.status(401).json({ ok:false, error:'unauthorized' }); return; }
  }
  if (!RURL || !RTOK) { res.status(200).json({ ok:false, configured:false }); return; }

  var date = req.query.date || kstDate(1); // default: yesterday (KST)
  var prev = kstDateFrom(new Date(date+'T00:00:00+09:00').getTime() - 86400000);

  try {
    var pr = await pipeline([
      ['GET','a:pv:'+date], ['PFCOUNT','a:uv:'+date], ['HGETALL','a:h:'+date],
      ['GET','a:pv:'+prev], ['PFCOUNT','a:uv:'+prev],
      ['LRANGE','kb_thoughts',0,499]
    ]);
    var pv = parseInt((pr[0]&&pr[0].result)||0,10)||0;
    var uv = parseInt((pr[1]&&pr[1].result)||0,10)||0;
    var dims = groupDims(pr[2]&&pr[2].result);
    var pvPrev = parseInt((pr[3]&&pr[3].result)||0,10)||0;
    var uvPrev = parseInt((pr[4]&&pr[4].result)||0,10)||0;
    var allThoughts = ((pr[5]&&pr[5].result)||[]).map(function(s){ try{return JSON.parse(s);}catch(e){return null;} }).filter(Boolean);

    // thoughts on this date (KST)
    var newThoughts = allThoughts.filter(function(t){ try { return kstDateFrom(new Date(t.date).getTime()) === date; } catch(e){ return false; } });

    var devPc = (dims.dev && dims.dev['PC'])||0, devMo = (dims.dev && dims.dev['모바일'])||0;
    var devTot = devPc+devMo;
    var srcTop = topN(dims.src,1)[0];
    var pathTop = topN(dims.path,1)[0];
    var hrTop = topN(dims.hr,1)[0];

    var lines = [];
    lines.push('# 일일 분석 리포트 · '+date+' ('+dow(date)+')');
    lines.push('');
    lines.push('## 한눈에');
    lines.push('- 방문(PV): '+pv.toLocaleString()+'  (전일 '+pvPrev.toLocaleString()+' · '+pct(pv,pvPrev)+')');
    lines.push('- 순방문(UV): '+uv.toLocaleString()+'  (전일 '+uvPrev.toLocaleString()+' · '+pct(uv,uvPrev)+')');
    lines.push('- 생각 나누기: 신규 '+newThoughts.length+'건 (누적 '+allThoughts.length+'건)');
    lines.push('- 주 유입: '+(srcTop?srcTop[0]+' ('+srcTop[1]+')':'-'));
    lines.push('- 관심 페이지 1위: '+(pathTop?pathTop[0]+' ('+pathTop[1]+')':'-'));
    lines.push('- 접속 피크: '+(hrTop?hrTop[0]+'시 ('+hrTop[1]+')':'-'));
    lines.push('- 기기: '+(devTot? ('PC '+Math.round(devPc/devTot*100)+'% · 모바일 '+Math.round(devMo/devTot*100)+'%') : '-'));
    lines.push('');
    lines.push('## 유입 경로');
    lines.push(listLines(topN(dims.src,6)));
    lines.push('');
    lines.push('## 지역 (상위)');
    lines.push(listLines(topN(dims.rg,6)));
    lines.push('');
    lines.push('## 인기 페이지');
    lines.push(listLines(topN(dims.path,6)));
    lines.push('');
    lines.push('## 메뉴 클릭 · 외부 이동');
    var mt=topN(dims.menu,5), ot=topN(dims.out,5);
    lines.push('- 메뉴 클릭: '+(mt.length? mt.map(function(e){return e[0]+'('+e[1]+')';}).join(', ') : '(없음)'));
    lines.push('- 외부로 이동: '+(ot.length? ot.map(function(e){return e[0]+'('+e[1]+')';}).join(', ') : '(없음)'));
    lines.push('');
    lines.push('## 생각 나누기 신규');
    if (newThoughts.length) {
      newThoughts.slice(0,5).forEach(function(t){
        var who=[t.name,t.region].filter(Boolean).join('·')||'익명';
        var msg=String(t.msg||'').replace(/\s+/g,' ').slice(0,80);
        lines.push('- "'+msg+'" — '+who);
      });
    } else { lines.push('- (오늘 새 글 없음)'); }
    lines.push('');
    lines.push('## 인사이트');
    var ins=[];
    if (pvPrev===0 && pv>0) ins.push('데이터 수집 첫 구간입니다. 오늘 방문 '+pv+'건이 기록되었습니다.');
    else if (pv>pvPrev) ins.push('전일 대비 방문이 '+pct(pv,pvPrev)+' 늘었습니다.');
    else if (pv<pvPrev) ins.push('전일 대비 방문이 '+pct(pv,pvPrev)+' 줄었습니다.');
    if (srcTop) ins.push('유입은 '+srcTop[0]+'이(가) 가장 많았습니다('+srcTop[1]+'건).');
    if (pathTop) ins.push('가장 많이 본 페이지는 '+pathTop[0]+'입니다.');
    if (ot.length) ins.push('사이트에서 '+ot[0][0]+'(으)로 나간 이동이 가장 많았습니다.');
    if (newThoughts.length) ins.push('생각 나누기 신규 '+newThoughts.length+'건이 등록되었습니다. 내용을 확인해 공약·활동에 반영해 보세요.');
    if (!ins.length) ins.push('이 날은 특별한 변동이 없었습니다.');
    ins.forEach(function(x){ lines.push('- '+x); });

    var md = lines.join('\n');
    var rec = JSON.stringify({ date: date, title: '일일 분석 리포트 · '+date+' ('+dow(date)+')', md: md, stats:{ pv:pv, uv:uv, newThoughts:newThoughts.length }, ts: Date.now() });

    // dedup: if newest report is same date, replace it; else prepend
    var head = await redis(['LRANGE','a:reports',0,0]);
    var same = false;
    try { same = head.result && head.result[0] && JSON.parse(head.result[0]).date === date; } catch(e){}
    if (same) { await redis(['LSET','a:reports',0,rec]); }
    else { await pipeline([ ['LPUSH','a:reports', rec], ['LTRIM','a:reports',0,199] ]); }

    res.status(200).json({ ok:true, date:date, pv:pv, uv:uv, saved:true, replaced:same });
  } catch(e) {
    res.status(200).json({ ok:false, error:String(e && e.message || e) });
  }
};
