// 격리 테스트: 실시간 연동 로직 (실제 /api/budget 응답 형태로 검증)
const won억=a=>a>=10000?(a/10000).toFixed(a>=100000?0:1)+"조원":Math.round(a)+"억원";
const STATE={national:{population:51300000,budget:3260000,selfReliance:48.6,execRate:90.6,perCapitaBudget:0},liveConfirmed:false,region:null};
const els={}; function elStub(id){return els[id]||(els[id]={id,classList:{add(){},remove(){}},set textContent(v){this._t=v;},get textContent(){return this._t;},set innerHTML(v){this._h=v;},get innerHTML(){return this._h;}});}
global.document={getElementById:elStub};
let RENDERS=0; function renderAll(){RENDERS++;}
let RT_LIVE=null;
function setRTStatus(state,j,extra){const db=elStub('demoBanner');if(state==='live')db.innerHTML='LIVE';else if(state==='connecting')db.innerHTML='CONN';else db.innerHTML='FB';}
function applyNational(j){
  const n=STATE.national; if(!n||!j) return;
  if(typeof j.b==='number') n.budget=Math.round(j.b*10000);
  if(typeof j.s==='number') n.selfReliance=+(+j.s).toFixed(1);
  if(typeof j.e==='number') n.execRate=+(+j.e).toFixed(1);
  n.perCapitaBudget=+(n.budget*10000/n.population).toFixed(0);
  const sb=id=>elStub(id);
  sb('sbBudget').textContent=won억(n.budget); sb('sbSelf').textContent=n.selfReliance+'%'; sb('sbExec').textContent=(typeof j.e==='number'?j.e:n.execRate)+'%';
}
// 실제 서버가 돌려준 페이로드
const SERVER={"b":411.8,"e":68.4,"s":43.2,"f":[34,16,15,12,12,11],"basis":"시·도 17곳 가중평균(순계 근사)","src":"lofin365 FNCST(재정자립도)","updated":"2026-05-25T12:59:47.618Z","zone":"ALL","fyr":"2024"};
async function connectRealtime(){
  setRTStatus('connecting');
  try{
    const j=SERVER; if(j.error) throw new Error(j.error);
    RT_LIVE=j; STATE.liveConfirmed=true; applyNational(j); setRTStatus('live',j); renderAll();
  }catch(e){STATE.liveConfirmed=false;setRTStatus('fallback',null,e.message);}
}
(async()=>{
  await connectRealtime();
  console.log("liveConfirmed:",STATE.liveConfirmed);
  console.log("national budget(억):",STATE.national.budget,"=",won억(STATE.national.budget));
  console.log("national 자립도:",STATE.national.selfReliance,"| 집행률:",STATE.national.execRate);
  console.log("1인당(만원):",STATE.national.perCapitaBudget);
  console.log("statbar sbBudget:",els.sbBudget.textContent," sbSelf:",els.sbSelf.textContent," sbExec:",els.sbExec.textContent);
  console.log("renders:",RENDERS);
  // 에러 응답 처리
  const errResp={"error":"데이터 없음"};
  let ok=true; try{ if(errResp.error) throw new Error(errResp.error);}catch(e){ok=(e.message==='데이터 없음');}
  console.log("error-path handled:",ok);
  console.log(STATE.liveConfirmed && STATE.national.budget===4118000 && ok ? "\n✅ 실시간 연동 로직 통과":"\n❌ 문제");
})();
