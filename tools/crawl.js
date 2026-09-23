// 사이트 전수 점검(페이지 로드·JS 오류·가로 넘침·깨진 링크). 실행: npm i playwright && node tools/crawl.js  (BASE 를 바꾸면 로컬 점검)
const {chromium}=require('playwright');
const BASE='https://www.xn--4k0b53xuva.com/';
const PAGES=['index.html','about.html','vision.html','press.html','archive.html','pledge.html','report.html','story.html','party-money.html','gyeyak.html','gongyak.html','manifesto.html','games.html','game.html','gacha.html','region.html','privacy.html','404.html','narasalim.html','almedalen.html',
 'budget365.html#/','budget365.html#/sido/서울특별시','budget365.html#/lg/4620000','budget365.html#/lg/4620000/budget','budget365.html#/lg/1100000','budget365.html#/lg/3611000','budget365.html#/q/노인일자리','budget365.html#/gov','budget365.html#/gov27','budget365.html#/gov/보건복지부','budget365.html#/key','budget365.html#/key/mega','budget365.html#/policy','budget365.html#/policy/2026-06-29-mega','budget365.html#/policy/2026-09-21-housing-stability-plan','budget365.html#/task','budget365.html#/task/1'];
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const out={};
for(const [w,h,tag] of [[1366,900,'d'],[390,844,'m']]){
 for(const u of PAGES){ const ctx=await b.newContext({viewport:{width:w,height:h}}); const p=await ctx.newPage();
  const rec={jserr:[],console:[],failed:[],bad:[]};
  p.on('pageerror',e=>rec.jserr.push(e.message.slice(0,200)));
  p.on('console',m=>{ if(['error','warning'].includes(m.type())) rec.console.push(m.type()+': '+m.text().slice(0,200)); });
  p.on('response',r=>{ const s=r.status(); if(s>=400) rec.bad.push(s+' '+r.url().slice(0,160)); });
  p.on('requestfailed',r=>rec.failed.push(r.failure()?.errorText+' '+r.url().slice(0,160)));
  try{ await p.goto(BASE+u,{waitUntil:'networkidle',timeout:40000}); await p.waitForTimeout(1200);
    const info=await p.evaluate(()=>{ const cw=document.documentElement.clientWidth; const ov=document.documentElement.scrollWidth>cw+1;
      const imgs=[...document.images].filter(i=>i.complete&&i.naturalWidth===0&&i.getAttribute('src')).map(i=>i.getAttribute('src'));
      const empty=document.body.innerText.trim().length; const loading=[...document.querySelectorAll('.loading')].map(e=>e.textContent.trim().slice(0,80));
      const links=[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')).filter(h=>h&&!/^(https?:|mailto:|tel:|#|javascript:)/.test(h));
      return {ov,imgs,empty,loading,links:[...new Set(links)]}; });
    Object.assign(rec,info);
  }catch(e){ rec.jserr.push('NAV:'+e.message.slice(0,120)); }
  out[tag+' '+u]=rec; await ctx.close(); }
}
require('fs').writeFileSync('./tools/out/crawl.json',JSON.stringify(out,null,1));
for(const [k,r] of Object.entries(out)){ const n=r.jserr.length+r.console.length+r.failed.length+r.bad.length+(r.ov?1:0)+(r.imgs?.length||0)+(r.loading?.length||0); if(n) console.log(k,'| js',r.jserr.length,'con',r.console.length,'fail',r.failed.length,'bad',r.bad.length,'ov',r.ov,'img',r.imgs?.length,'loading',r.loading?.length); }
await b.close();})();
