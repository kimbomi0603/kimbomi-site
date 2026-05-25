// 클라이언트 LLM 흐름 테스트 (성공/실패 폴백)
const GLOSSARY=[{t:'재정자립도',d:'스스로 번 돈 비율'}];
const RISKFLAG_DEF={low_competition:['저경쟁']};
const STATE={region:{key:'전라남도 강진군',display:'전라남도 강진군',name:'강진군',selfReliance:16.3,autonomy:50,debtRatio:2,execRate:89.5,bankRate:1.9,bankName:'농협',perCapitaBudget:803,grade:'C',score:55},national:{key:'전국',display:'전국'}};
function genRiskFlags(R){return R.bankRate<2.2?[{type:'low_competition'}]:[];}
function botReply(t){return '[내장답변] '+t;}
const MSGS=[]; function botAdd(role,html){MSGS.push(role+': '+html);}
function botTyping(){const o={removed:false,remove(){o.removed=true;}};MSGS.push('typing');return o;}
let BOT_HISTORY=[];
function botContext(){const R=STATE.region||STATE.national;let c=`지역=${R.display}`;if(R.key!=='전국')c+=` 자립도 ${R.selfReliance}%`;c+=' 용어:'+GLOSSARY.map(g=>g.t+'='+g.d).join('/');return c.slice(0,3000);}
let FAIL=false;
global.fetch=async(u,o)=>{ if(FAIL) throw new Error('CORS'); return {ok:true,json:async()=>({reply:'AI: 재정자립도는 자체수입 비율이에요('+JSON.parse(o.body).context.slice(0,20)+'...)'})}; };
global.AbortController=class{constructor(){this.signal={}}abort(){}};
let BOT_API='https://x/api/chat';
function botEsc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
async function botAskLLM(text){const ctrl=new AbortController(),t=setTimeout(()=>ctrl.abort(),20000);const res=await fetch(BOT_API,{method:'POST',headers:{},signal:ctrl.signal,body:JSON.stringify({messages:BOT_HISTORY.slice(-8),context:botContext()})});clearTimeout(t);if(!res.ok)throw new Error('HTTP');const j=await res.json();const reply=(j.reply||'').toString().trim();if(!reply)throw new Error('empty');return reply;}
async function botSendMsg(text){const t=text.trim();if(!t)return;botAdd('me',t);BOT_HISTORY.push({role:'user',content:t});const typing=botTyping();
  try{const ans=await botAskLLM(t);typing.remove();botAdd('bot',botEsc(ans)+' ·AI');BOT_HISTORY.push({role:'assistant',content:ans});}
  catch(e){typing.remove();const rb=botReply(t);botAdd('bot',rb+' ·내장');BOT_HISTORY.push({role:'assistant',content:rb});}}

(async()=>{
  console.log("== 시나리오1: LLM 서버 정상 ==");
  FAIL=false; await botSendMsg('재정자립도가 뭐야?');
  console.log(MSGS.join('\n')); console.log("history len:",BOT_HISTORY.length);
  MSGS.length=0; BOT_HISTORY.length=0;
  console.log("\n== 시나리오2: 서버 실패 → 내장봇 폴백 ==");
  FAIL=true; await botSendMsg('PDF 어떻게 받아?');
  console.log(MSGS.join('\n'));
  const ok = MSGS.some(m=>m.includes('·내장')) ;
  console.log("\n"+(ok?"✅ LLM 우선 + 폴백 동작 정상":"❌ 문제"));
})();
