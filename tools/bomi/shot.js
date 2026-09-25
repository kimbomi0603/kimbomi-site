const {chromium}=require('playwright');
const jobs=JSON.parse(process.argv[2]);
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
for(const [name,q,w,h] of jobs){ await p.setViewportSize({width:w||800,height:h||800}); await p.goto('http://localhost:8777/render.html?'+q+'&w='+(w||800)+'&h='+(h||800)); await p.waitForFunction(()=>window.DONE,{timeout:60000}).catch(e=>errs.push('timeout '+name)); await p.locator('canvas').screenshot({path:'out/'+name+'.png',omitBackground:true}); }
console.log('errs',errs.slice(0,5)); await b.close();})();
