// api/news.js — '언론이 기록한 김보미' 최신 보도 자동 수집
// Google News RSS를 서버에서 가져와 파싱. CDN 캐시 24시간(s-maxage) → 하루 1회 자동 갱신.
const FEEDS = [
  'https://news.google.com/rss/search?q=%22%EA%B9%80%EB%B3%B4%EB%AF%B8%22%20%EB%8B%B9%EB%8C%80%ED%91%9C%20OR%20%EA%B0%95%EC%A7%84%20OR%20%EB%AF%BC%EC%A3%BC%EB%8B%B9&hl=ko&gl=KR&ceid=KR:ko'
];
const MUST = ['김보미'];                       // 제목에 반드시 포함
const HINT = ['민주당','강진','당대표','의장','전남','의원','정치','경선','전당대회']; // 동명이인 필터

function unesc(s){ return String(s||'').replace(/<!\[CDATA\[|\]\]>/g,'')
  .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'"); }

function parseItems(xml){
  const out=[]; const re=/<item>([\s\S]*?)<\/item>/g; let m;
  while((m=re.exec(xml))){
    const it=m[1];
    const g=(tag)=>{ const r=new RegExp('<'+tag+'>([\\s\\S]*?)</'+tag+'>').exec(it); return r?unesc(r[1]).trim():''; };
    let title=g('title'), link=g('link'), pub=g('pubDate'), src=g('source');
    if(!src){ const sp=title.split(' - '); if(sp.length>1){ src=sp.pop(); title=sp.join(' - '); } }
    else { const sp=title.split(' - '); if(sp.length>1 && sp[sp.length-1]===src){ sp.pop(); title=sp.join(' - '); } }
    out.push({ title:title, link:link, source:src, ts:Date.parse(pub)||0 });
  }
  return out;
}

module.exports = async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  try{
    let items=[];
    for(const u of FEEDS){
      const r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0 (kimbomi.com news bot)'}});
      if(r.ok){ items=items.concat(parseItems(await r.text())); }
    }
    // 필터: 제목에 '김보미' 포함 + (제목 또는 출처에 힌트어 1개 이상)
    items=items.filter(function(it){
      if(!MUST.every(function(w){return it.title.indexOf(w)>=0;})) return false;
      return true;
    });
    var hinted=items.filter(function(it){ return HINT.some(function(w){ return (it.title+' '+(it.source||'')).indexOf(w)>=0; }); });
    if(hinted.length>=3) items=hinted;  // 동명이인 필터(결과가 너무 적으면 완화)
    // 중복 제거(제목) + 최신순 + 상위 8건
    const seen={}; items=items.filter(function(it){ if(seen[it.title])return false; seen[it.title]=1; return true; });
    items.sort(function(a,b){ return b.ts-a.ts; });
    items=items.slice(0,8);
    res.setHeader('Cache-Control','s-maxage=86400, stale-while-revalidate=43200'); // 24시간 캐시 = 하루 1회 갱신
    res.status(200).json({ ok:true, items:items, updated:Date.now() });
  }catch(e){
    res.setHeader('Cache-Control','s-maxage=3600');
    res.status(200).json({ ok:false, items:[] });
  }
};
