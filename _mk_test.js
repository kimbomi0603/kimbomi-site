// mkChart 재사용/파괴 로직 검증
const STATE={charts:{}};
let CREATED=0, DESTROYED=0, UPDATED=0;
class ChartStub{constructor(el,cfg){this.canvas=el;this.data=cfg.data;this.options=cfg.options;CREATED++;}destroy(){DESTROYED++;}update(){UPDATED++;}}
const els={}; function elGet(id){return els[id];}
function setCanvas(id){ els[id]={id,_attr:{},setAttribute(k,v){this._attr[k]=v;}}; return els[id]; }
function mkChart(id,cfg){
  const el=els[id]; if(!el) return;
  el.setAttribute('role','img');
  const ex=STATE.charts[id];
  if(ex && ex.canvas===el){ ex.data=cfg.data; if(cfg.options) ex.options=cfg.options; ex.update(); return; }
  if(ex) ex.destroy();
  STATE.charts[id]=new ChartStub(el,cfg);
}
// 시나리오: 메인 차트(캔버스 유지) 5번 렌더 → 1 생성 + 4 업데이트
setCanvas('chartRevenue');
for(let i=0;i<5;i++) mkChart('chartRevenue',{data:{v:i},options:{o:i}});
console.log("메인차트 5회 렌더:", "created",CREATED,"updated",UPDATED,"destroyed",DESTROYED, "→ 기대 created1/updated4");
const okMain = CREATED===1 && UPDATED===4 && DESTROYED===0;
// aria 적용 확인
console.log("role 적용:", els.chartRevenue._attr.role);
// 시나리오: 상세 차트(캔버스 매번 교체) 3번 → 매번 파괴+생성
CREATED=0;UPDATED=0;DESTROYED=0;
for(let i=0;i<3;i++){ setCanvas('dQuarter'); mkChart('dQuarter',{data:{v:i}}); }  // 새 캔버스 매번
console.log("상세차트 3회(캔버스교체):", "created",CREATED,"updated",UPDATED,"destroyed",DESTROYED,"→ 기대 created3/destroyed2");
const okDetail = CREATED===3 && DESTROYED===2 && UPDATED===0;
console.log("\n"+((okMain&&okDetail&&els.chartRevenue._attr.role==='img')?"✅ mkChart 재사용/파괴/ARIA 정상":"❌ 문제"));
