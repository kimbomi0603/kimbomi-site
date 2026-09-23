const {chromium}=require('playwright');
const BASE='https://www.xn--4k0b53xuva.com/';
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:1366,height:900},acceptDownloads:true}); const p=await ctx.newPage();
const log=[]; p.on('pageerror',e=>log.push('JS '+e.message.slice(0,200))); p.on('console',m=>{if(m.type()==='error')log.push('CON '+m.text().slice(0,200))}); p.on('response',r=>{if(r.status()>=400)log.push('HTTP '+r.status()+' '+r.url().slice(0,140))});
const dom=async(tag)=>{ const t=await p.evaluate(()=>document.body.innerText); const bad=[]; for(const w of ['undefined','NaN','[object Object]','불러오지 못했습니다','찾지 못했습니다']){ if(t.includes(w)) bad.push(w);} if(bad.length) log.push('DOM '+tag+' contains '+bad.join(',')); };
const go=async(h,tag)=>{ await p.goto(BASE+'budget365.html'+h,{waitUntil:'networkidle',timeout:60000}); await p.waitForTimeout(1500); await dom(tag||h); };
const modes=['','/budget','/exec','/contract','/diag','/pledge','/peer'];
for(const cd of ['4678000','1100000','2600000']){ for(const m of modes){ await go('#/lg/'+cd+m); } }
// 사업 상세 모달
await go('#/lg/4678000/budget'); const first=await p.$('a[onclick*="openProject"],.pjt tbody tr,[data-c]'); if(first){ await first.click().catch(()=>{}); await p.waitForTimeout(1200); await dom('project modal'); const ov=await p.$('#ov.open'); log.push('modal opened: '+!!ov); }
// 검색
await go('#/'); await p.fill('.search input','노인일자리'); await p.waitForTimeout(900); const sug=await p.$$('.sug div,.sug a,.sug li'); log.push('suggestions: '+sug.length); await p.keyboard.press('Enter'); await p.waitForTimeout(6000); await dom('search'); const res=await p.evaluate(()=>document.querySelector('#app').innerText.slice(0,120)); log.push('search head: '+res.replace(/\n/g,' '));
// 정책 필터 & CSV
await go('#/policy'); await p.click('.pchip:has-text("핵심")').catch(e=>log.push('chip click fail')); await p.waitForTimeout(800); await dom('policy tier filter');
const n=await p.evaluate(()=>document.querySelector('.pbar b')?.textContent); log.push('policy 핵심 count: '+n);
await p.fill('#pq','메가'); await p.waitForTimeout(900); await dom('policy search'); const n2=await p.evaluate(()=>document.querySelector('.pbar b')?.textContent); log.push('policy search 메가: '+n2);
const [dl]=await Promise.all([p.waitForEvent('download',{timeout:8000}).catch(()=>null), p.click('button:has-text("CSV로 내려받기")')]); log.push('csv download: '+(dl?dl.suggestedFilename():'NONE'));
await go('#/key'); const [dl2]=await Promise.all([p.waitForEvent('download',{timeout:8000}).catch(()=>null), p.click('button:has-text("핵심 정책 CSV")')]); log.push('key csv: '+(dl2?dl2.suggestedFilename():'NONE'));
await go('#/task'); await p.click('.pchip:has-text("12대 핵심과제")'); await p.waitForTimeout(600); await dom('task key12'); log.push('task key12 count: '+await p.evaluate(()=>document.querySelector('.pbar b')?.textContent));
await go('#/gov/보건복지부'); await go('#/gov27'); await go('#/gov27/보건복지부');
// 뒤로가기/맨위 버튼
await go('#/lg/4678000'); const fab=await p.$('#fabs button'); log.push('fabs present: '+!!fab);
// 지자체 존재하지 않는 코드
await go('#/lg/9999999','bad code'); 
console.log(log.join('\n')); await b.close();})();
