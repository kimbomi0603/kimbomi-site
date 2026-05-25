const fmt=n=>Math.round(n).toLocaleString('ko-KR');
const won억 = a => Math.abs(a)>=10000 ? ((a/10000).toFixed(1).replace(/\.0$/,''))+"조원" : fmt(a)+"억원";
const cases=[4118000,3260000,450528,45000,10000,8800,880,-16000,-8800,120];
console.log("won억 일관성 테스트:");
cases.forEach(c=>console.log("  "+String(c).padStart(8)+" → "+won억(c)));

// closeDetail/popstate 흐름 시뮬
let STATE={detailOpen:false}, hash='', historyLen=0;
const location={get hash(){return hash;}};
const history={pushState(s,t,h){hash=h;historyLen++;},back(){hash='';historyLen--;setTimeout(()=>onpop(),0);}};
function openDetail(){STATE.detailOpen=true; if(hash!=='#detail'){history.pushState({},'','#detail');}}
function closeDetail(fromPop){ if(!STATE.detailOpen)return; STATE.detailOpen=false; if(!fromPop){ if(hash==='#detail') history.back(); } }
function onpop(){ if(STATE.detailOpen) closeDetail(true); }
// 시나리오1: 열고 X로 닫기
openDetail(); console.log("\n열기 후 detailOpen:",STATE.detailOpen,"hash:",hash);
closeDetail();  // X 클릭
setTimeout(()=>{
  console.log("X닫기 후 detailOpen:",STATE.detailOpen,"hash:",hash,"historyLen:",historyLen);
  // 시나리오2: 열고 뒤로가기(popstate)
  openDetail(); console.log("\n다시 열기 detailOpen:",STATE.detailOpen,"hash:",hash);
  history.back(); // 모바일 뒤로가기
  setTimeout(()=>{
    console.log("뒤로가기 후 detailOpen:",STATE.detailOpen,"hash:",hash);
    const ok = !STATE.detailOpen && hash===''; 
    console.log("\n"+(ok?"✅ 히스토리 닫기 흐름 정상":"❌ 문제"));
  },5);
},5);
