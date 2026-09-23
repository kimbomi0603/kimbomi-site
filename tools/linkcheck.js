const {chromium}=require('playwright');
const BASE='https://www.xn--4k0b53xuva.com/';
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for(const [w,h] of [[1366,900],[390,844]]){
const ctx=await b.newContext({viewport:{width:w,height:h}}); const p=await ctx.newPage(); const log=[];
p.on('pageerror',e=>log.push('JS '+e.message.slice(0,200))); p.on('console',m=>{if(m.type()==='error')log.push('CON '+m.text().slice(0,160))});
// index play=1
await p.goto(BASE+'?play=1',{waitUntil:'networkidle'}); await p.waitForTimeout(1500); log.push('play frame: '+(await p.$$('iframe')).length);
// report.html: 허니팟 채워서 조용히 버려지는지(실제 등록 안 됨)
await p.goto(BASE+'report.html',{waitUntil:'networkidle'}); await p.waitForTimeout(800);
const hasForm=await p.$('#twHp'); log.push('report honeypot field: '+!!hasForm);
if(hasForm){ await p.evaluate(()=>{document.getElementById('twHp').value='bot';}); const nm=await p.$('#twName,#tw-name,input[placeholder*="이름"]'); if(nm) await nm.fill('테스트'); const msg=await p.$('#twMsg,textarea'); if(msg) await msg.fill('자동 점검용 메시지(허니팟)'); 
  const [resp]=await Promise.all([p.waitForResponse(r=>r.url().includes('/api/thoughts')&&r.request().method()==='POST',{timeout:8000}).catch(()=>null), p.click('button:has-text("남기기"),button:has-text("등록"),button[type=submit]').catch(e=>log.push('submit click fail'))]);
  log.push('thoughts POST: '+(resp?resp.status()+' '+(await resp.text()).slice(0,80):'none')); }
// tabs on press
await p.goto(BASE+'press.html',{waitUntil:'networkidle'}); for(const t of ['news','video']){ await p.click(`.tab[data-t="${t}"]`); await p.waitForTimeout(400); const vis=await p.evaluate(t=>{const e=document.getElementById('pane-'+t);return e&&getComputedStyle(e).display!=='none'},t); log.push('press tab '+t+': '+vis); }
// story / games
for(const u of ['story.html','games.html','gacha.html','archive.html','about.html','vision.html']){ await p.goto(BASE+u,{waitUntil:'networkidle'}); await p.waitForTimeout(800); const btns=await p.$$('button:visible'); let n=0; for(const bt of btns.slice(0,6)){ try{ await bt.click({timeout:1500}); n++; await p.waitForTimeout(250);}catch(e){} } log.push(u+' clicked '+n+' buttons'); }
console.log('== '+w); console.log(log.join('\n')); await ctx.close(); }
await b.close();})();
