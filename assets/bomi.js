/* 김보미.com — AI 봄이 : 어려운 예산 용어·김보미·우리 동네를 물어보는 길잡이 (Gemini + Groq 교차검증, /api/chat mode=bomi)
   2026-11-05 개편 — 캐릭터를 「돋보기 든 김보미 아트토이」(Gemini 생성, 소프트비닐 인형 느낌)로 바꿈. 김보미 본인이 아니라 AI 길잡이.
   · 떠 있는 봄이: 손 흔드는 아트토이(assets/bomi/body.webp)가 둥실 떠 있고 말풍선 + 「AI 봄이」 이름표.
   · 누르면: 휴대폰은 전체 화면, PC는 오른쪽 세로 창. 위는 무대(대화 단계마다 3D 자세 그림과 효과 글씨가 바뀜), 아래는 대화 시트.
   · 「쉬운 말」 스위치: 켜면 초등학생도 알 만한 말과 생활 비유로 답하도록 요청.
   · 음성 입력: 브라우저가 지원하면 마이크 단추를 보여 준다(한국어).
   원본(3D 모델·렌더러): tools/bomi/ */
(function(){
  if (window.__bomi) return; window.__bomi = 1;
  var BASE=((document.currentScript&&document.currentScript.src)||'').replace(/bomi\.js.*$/,'')||'assets/';
  var IMG=BASE+'bomi/';
  var reduce=false; try{ reduce=matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
  var G='#0F5A4A', N='#16305A';
  var CSS = [
  /* 떠 있는 봄이 */
  '#bomi-fab{position:fixed;right:12px;bottom:58px;z-index:9990;border:0;background:none;padding:0;cursor:pointer;display:flex;flex-direction:column;align-items:center;width:120px;-webkit-tap-highlight-color:transparent}',
  '#bomi-fab:focus-visible{outline:3px solid #C99A2E;outline-offset:4px;border-radius:18px}',
  '#bomi-fab .fig{position:relative;width:96px;height:140px;display:block}',
  '#bomi-fab .fig::after{content:"";position:absolute;left:50%;bottom:2px;width:62px;height:12px;margin-left:-31px;border-radius:50%;background:radial-gradient(closest-side,rgba(15,35,30,.28),rgba(15,35,30,0));animation:bmShadow 3.2s ease-in-out infinite}',
  '#bomi-fab .fig img{position:relative;z-index:1;width:96px;height:auto;display:block;filter:drop-shadow(0 6px 8px rgba(15,40,60,.18));animation:bmFloat 3.2s ease-in-out infinite;transform-origin:50% 100%}',
  '#bomi-fab:hover .fig img{animation-duration:1.6s}',
  '#bomi-fab .say{position:absolute;z-index:2;right:-18px;top:2px;background:#fff;color:#15171A;border:1.5px solid #15213A;border-radius:14px 14px 14px 4px;padding:5px 9px;font:400 15px/1 "Jua","Pretendard Variable",sans-serif;white-space:nowrap;box-shadow:0 4px 10px rgba(10,20,40,.12);animation:bmPop 4s ease-in-out infinite;transform-origin:0 100%}',
  '#bomi-fab .tag{position:relative;z-index:2;margin-top:-8px;display:inline-flex;align-items:center;gap:5px;background:#15213A;color:#fff;border-radius:999px;padding:6px 13px 6px 11px;font:800 13.5px/1 "Pretendard Variable",sans-serif;box-shadow:0 6px 16px rgba(10,20,40,.28)}',
  '#bomi-fab .ai,#bomi .ai{font-weight:900;color:#5FD39A;letter-spacing:-.02em}',
  '@keyframes bmFloat{0%,100%{transform:translateY(0) rotate(-1.2deg)}50%{transform:translateY(-6px) rotate(1.2deg)}}',
  '@keyframes bmShadow{0%,100%{transform:scaleX(1);opacity:1}50%{transform:scaleX(.82);opacity:.7}}',
  '@keyframes bmPop{0%,70%,100%{transform:scale(1)}8%{transform:scale(1.14)}16%{transform:scale(1)}}',
  'html.has-cta #bomi-fab{bottom:128px}',
  'html[data-theme="dark"] #bomi-fab .say{background:#24272B;color:#F4F1E8;border-color:#8ECFB2}',
  '@media(max-width:640px){#bomi-fab{right:4px;bottom:52px;width:64px}#bomi-fab .fig{width:52px;height:76px}#bomi-fab .fig img{width:52px}#bomi-fab .fig::after{width:36px;margin-left:-18px;height:8px}#bomi-fab .say{display:none}#bomi-fab .tag{font-size:11px;padding:4px 8px 4px 7px;margin-top:-6px}}',
  /* 대화창 */
  '#bomi{position:fixed;z-index:9991;display:none;flex-direction:column;background:#fff;color:#17181A;font:15px/1.6 "Pretendard Variable",system-ui,sans-serif;word-break:keep-all;overflow:hidden;right:20px;bottom:20px;width:410px;height:min(780px,calc(100vh - 40px));border-radius:26px;box-shadow:0 28px 70px rgba(10,20,40,.32)}',
  '#bomi.on{display:flex}',
  '#bomi .top{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:12px 14px 10px 14px;background:#fff;border-bottom:1px solid #EEF0EC}',
  '#bomi .tav{width:40px;height:40px;border-radius:50%;flex:0 0 auto;display:block;background:#EAF2EC;box-shadow:0 0 0 2px #fff,0 0 0 3.5px #CFE3D6}',
  '#bomi .tn{display:flex;flex-direction:column;line-height:1.15;min-width:0}',
  '#bomi .tn small{font:600 11.5px/1.3 "Pretendard Variable",sans-serif;color:#5B6C63;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '#bomi .logo{font:900 19px/1.1 "Pretendard Variable",sans-serif;letter-spacing:-.03em;color:#15171A;display:flex;align-items:baseline;gap:4px}',
  '#bomi .logo .ai{font-size:19px;color:'+G+'}',
  '#bomi .sw{margin-left:auto;display:inline-flex;align-items:center;gap:7px;border:0;cursor:pointer;background:#6B6F76;color:#fff;border-radius:999px;padding:5px 13px 5px 5px;font:800 13px/1 "Pretendard Variable",sans-serif;min-height:36px;transition:background .2s}',
  '#bomi .sw i{width:26px;height:26px;border-radius:50%;background:#fff;display:block;transition:transform .2s}',
  '#bomi .sw[aria-checked="true"]{background:'+G+';padding:5px 5px 5px 13px;flex-direction:row-reverse}',
  '#bomi .x{border:0;background:#F1EFEA;color:#15171A;width:40px;height:40px;border-radius:50%;cursor:pointer;font-size:21px;line-height:1;flex:0 0 auto}',
  '#bomi .sw:focus-visible,#bomi .x:focus-visible,#bomi .send:focus-visible,#bomi .mic:focus-visible{outline:3px solid #C99A2E;outline-offset:2px}',
  '#bomi .stage{position:relative;flex:0 0 auto;height:clamp(200px,36vh,300px);background:radial-gradient(70% 60% at 50% 38%,#FFFFFF 0%,#F6F2E8 55%,#EDE6D6 100%);overflow:hidden}',
  '#bomi .stage::before{content:"";position:absolute;left:50%;bottom:24px;width:46%;height:26px;margin-left:-23%;border-radius:50%;background:radial-gradient(closest-side,rgba(60,45,20,.22),rgba(60,45,20,0))}',
  '#bomi .stage::after{content:"";position:absolute;left:0;right:0;bottom:0;height:46px;background:linear-gradient(180deg,rgba(237,230,214,0),#E6DDC8)}',
  '#bomi .brand{position:absolute;left:16px;top:12px;font:800 12px/1.25 "Pretendard Variable",sans-serif;color:'+N+';letter-spacing:-.02em}',
  '#bomi .brand small{display:block;font:600 9.5px/1.3 "Pretendard Variable",sans-serif;color:#5B6C63;letter-spacing:.02em}',
  '#bomi .pose{position:absolute;z-index:1;left:50%;bottom:30px;height:82%;transform:translateX(-50%);filter:drop-shadow(0 10px 12px rgba(40,30,10,.16));transition:opacity .18s}',
  '#bomi .pose.fl{animation:bmFloat2 3s ease-in-out infinite}',
  '@keyframes bmFloat2{0%,100%{transform:translate(-50%,0)}50%{transform:translate(-50%,-6px)}}',
  '#bomi .word{position:absolute;z-index:2;left:calc(50% + 70px);top:16%;background:#fff;border:2px solid #15213A;border-radius:18px 18px 18px 5px;padding:8px 14px;font:400 24px/1 "Jua","Pretendard Variable",sans-serif;color:#15171A;letter-spacing:-.02em;box-shadow:0 6px 14px rgba(10,20,40,.12);white-space:nowrap;transform-origin:0 100%}',
  '#bomi .word:empty{display:none}',
  '#bomi .word.pop{animation:bmWord .5s cubic-bezier(.2,1.6,.4,1)}',
  '@keyframes bmWord{0%{transform:scale(.3);opacity:0}100%{transform:scale(1);opacity:1}}',
  '#bomi .sheet{flex:1 1 auto;min-height:0;margin-top:-26px;position:relative;background:#fff;border-radius:28px 28px 0 0;box-shadow:0 -6px 18px rgba(10,20,40,.06);display:flex;flex-direction:column}',
  '#bomi .grab{width:64px;height:5px;border-radius:5px;background:#C9CBCF;margin:12px auto 4px;flex:0 0 auto}',
  '#bomi .log{flex:1 1 auto;min-height:0;overflow:auto;padding:10px 18px 12px;display:flex;flex-direction:column;gap:14px}',
  '#bomi .bot{display:flex;flex-direction:column;gap:6px;align-items:flex-start;max-width:94%}',
  '#bomi .av{width:40px;height:40px;border-radius:50%;padding:2px;background:#CFE3D6;flex:0 0 auto}',
  '#bomi .av img{width:36px;height:36px;border-radius:50%;background:#EAF2EC;display:block}',
  '#bomi .m{padding:12px 15px;border-radius:16px;font-size:15px;white-space:pre-wrap}',
  '#bomi .bot .m{background:#fff;border:1px solid #E1E2E6;border-top-left-radius:6px;box-shadow:0 2px 8px rgba(10,20,40,.04)}',
  '#bomi .me{align-self:flex-end;display:flex;flex-direction:column;align-items:flex-end;gap:4px;max-width:86%}',
  '#bomi .me .m{background:'+N+';color:#fff;border-top-right-radius:6px}',
  '#bomi .t{font-size:12px;color:#8A8D93}',
  '#bomi .m .v{display:block;margin-top:8px;font-size:11.5px;color:#5B6C63}',
  '#bomi .m.w{color:#6B6F76;font-style:italic}',
  '#bomi .chips{flex:0 0 auto;display:flex;gap:6px;overflow-x:auto;padding:2px 16px 8px;scrollbar-width:none}',
  '#bomi .chips::-webkit-scrollbar{display:none}',
  '#bomi .chips button{flex:0 0 auto;border:1px solid #CFE3D6;background:#F3F9F5;color:'+G+';border-radius:999px;padding:8px 13px;min-height:36px;font:700 13px "Pretendard Variable",sans-serif;cursor:pointer;white-space:nowrap}',
  '#bomi form{flex:0 0 auto;margin:0 14px 8px;display:flex;align-items:center;gap:4px;border:1.5px solid #D9DBDF;border-radius:16px;padding:4px 6px 4px 14px;background:#fff}',
  '#bomi form:focus-within{border-color:'+G+'}',
  '#bomi input{flex:1;border:0;outline:none;background:transparent;padding:12px 0;font:15px "Pretendard Variable",sans-serif;min-width:0;color:inherit}',
  '#bomi .mic,#bomi .send{border:0;background:none;width:44px;height:44px;border-radius:12px;cursor:pointer;display:grid;place-items:center;color:#15171A;flex:0 0 auto}',
  '#bomi .send{background:'+G+';color:#fff}#bomi .send:disabled{opacity:.45;cursor:default}',
  '#bomi .mic.on{background:#FCE8E6;color:#C8412B}',
  '#bomi svg.ic{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
  '#bomi .nolog{flex:0 0 auto;display:flex;align-items:center;justify-content:center;gap:5px;margin:0 14px 4px;font-size:11px;color:#5F6368;cursor:pointer;user-select:none}',
  '#bomi .nolog input{flex:0 0 auto!important;width:13px!important;height:13px!important;min-width:0!important;padding:0!important;border:0!important;margin:0!important;accent-color:'+G+';cursor:pointer}',
  'html[data-theme="dark"] #bomi .nolog{color:#B9B5AC}',
  '#bomi .ft{flex:0 0 auto;font-size:10.5px;color:#7A7D83;text-align:center;padding:0 14px calc(10px + env(safe-area-inset-bottom,0px))}',
  '#bomi .ft a{color:inherit;text-decoration:underline;text-underline-offset:2px}',
  '@media(max-width:640px){#bomi{inset:0;width:auto;height:auto;border-radius:0;right:0;bottom:0}#bomi .top{padding-top:calc(10px + env(safe-area-inset-top,0px))}#bomi .word{font-size:38px}}',
  'html[data-theme="dark"] #bomi,html[data-theme="dark"] #bomi .top,html[data-theme="dark"] #bomi .sheet,html[data-theme="dark"] #bomi form{background:#1B1D20;color:#ECE8DF}',
  'html[data-theme="dark"] #bomi .logo{color:#ECE8DF}html[data-theme="dark"] #bomi .x{background:#2A2D31;color:#ECE8DF}',
  'html[data-theme="dark"] #bomi .stage{background:radial-gradient(70% 60% at 50% 38%,#3A3A34 0%,#2A2924 60%,#201F1B 100%)}html[data-theme="dark"] #bomi .stage::after{background:linear-gradient(180deg,rgba(32,31,27,0),#1B1A17)}html[data-theme="dark"] #bomi .top{border-color:#2E3135}html[data-theme="dark"] #bomi .tn small{color:#A9B8AE}html[data-theme="dark"] #bomi .brand{color:#CFE3D6}html[data-theme="dark"] #bomi .brand small{color:#9DB3A6}',
  'html[data-theme="dark"] #bomi .word{background:#24272B;color:#F4F1E8;border-color:#8ECFB2}',
  'html[data-theme="dark"] #bomi .bot .m{background:#24272B;border-color:#34383D;color:#ECE8DF}html[data-theme="dark"] #bomi .chips button{background:#22302A;border-color:#34473D;color:#BFE3CE}',
  'html[data-theme="dark"] #bomi form{border-color:#3A3E43}html[data-theme="dark"] #bomi .mic{color:#ECE8DF}',
  '@media (prefers-reduced-motion:reduce){#bomi-fab *,#bomi *{animation:none!important;transition:none!important}}'
  ].join('');
  /* 질문 예시: 지금 보는 화면에 맞는 것 2개를 앞에 두고, 나머지는 여러 갈래에서 고른다 */
  var PAGE_CHIPS={
    'budget365':['우리 동네 예산 보는 법','집행률은 어떻게 보나요?'],
    'gyeyak':['수의계약이 뭔가요?','쪼개기 계약은 왜 문제예요?'],
    'party-money':['정당 보조금은 왜 깜깜이예요?','위성정당 142억은 무슨 돈이에요?'],
    'about':['김보미는 어떤 사람이에요?','군의원 때 무슨 일을 했어요?'],
    'vision':['김보미 최근 생각 요약해 줘','정치개혁, 뭘 바꾸자는 거예요?'],
    'pledge':['재정주권시민행동은 뭐 하는 곳?','회원은 어떻게 돼요?'],
    'report':['제보하면 이름이 남나요?','생각 나누기는 누가 읽어요?'],
    'press':['요즘 김보미 소식은?','김보미는 어떤 사람이에요?']
  };
  var MIX=['김보미는 어떤 사람이에요?','재정자립도가 뭐예요?','청년이 동네 일에 목소리 내려면?','우리 동네에 100억이 생긴다면?','정당 보조금은 왜 깜깜이예요?','청년 정책은 어디서 찾아요?','제보는 어떻게 해요?','본예산과 추경의 차이','수의계약이 뭔가요?'];
  var CHIPS=(function(){ var p=(location.pathname.split('/').pop()||'index').replace('.html','')||'index'; var a=(PAGE_CHIPS[p]||[]).slice(); var rest=MIX.filter(function(x){return a.indexOf(x)<0;}); for(var i=rest.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)); var t=rest[i]; rest[i]=rest[j]; rest[j]=t;} return a.concat(rest).slice(0,7); })();
  /* 대화 단계 → 무대의 자세 그림과 효과 글씨 */
  var ST={ bow:['bow','꾸벅'], hello:['hello','안녕!'], idle:['idle',''], listen:['idle','응응!'], think:['think','음…'], talk:['talk','설명할게!'], happy:['happy','짜잔!'], oops:['oops','앗!'] };
  var SAYS=['안녕하세요!','궁금한 거 있어요?','같이 찾아봐요!'];
  var hist=[], easy=false; try{ easy=localStorage.getItem('bomiEasy')==='1'; }catch(e){}
  function el(h){ var d=document.createElement('div'); d.innerHTML=h; return d.firstElementChild; }
  function hm(){ var d=new Date(), h=d.getHours(), m=d.getMinutes(); return (h<12?'오전 ':'오후 ')+((h%12)||12)+':'+(m<10?'0':'')+m; }
  function ctx(){ var t=document.title||'', h=location.pathname+location.hash, hd=document.querySelector('h1'), hh=hd?hd.textContent.trim().slice(0,120):'';
    return '현재 화면: '+t+' ('+h+')'+(hh?' · 제목: '+hh:'')+(easy?' · 답변 방식: 초등학생도 알아듣게 아주 쉬운 말과 생활 속 비유로, 3~4문장 이내로 답해 주세요.':''); }
  var MIC='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  var SEND='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
  function init(){
    if(!document.querySelector('link[href*="family=Jua"]')){ var f=document.createElement('link'); f.rel='stylesheet'; f.href='https://fonts.googleapis.com/css2?family=Jua&display=swap'; document.head.appendChild(f); }
    var st=document.createElement('style'); st.textContent=CSS; document.head.appendChild(st);
    var fab=el('<button type="button" id="bomi-fab" aria-haspopup="dialog" aria-controls="bomi" aria-label="AI 봄이에게 물어보기 — 예산 용어, 김보미, 우리 동네">'+
      '<span class="fig"><img src="'+IMG+'body.webp" width="96" height="142" alt=""><span class="say" aria-hidden="true">안녕하세요!</span></span>'+
      '<span class="tag"><span class="ai">AI</span> 봄이</span></button>');
    var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    var box=el('<section id="bomi" role="dialog" aria-label="AI 봄이 — 김보미.com 길잡이" aria-modal="false">'+
      '<div class="top"><img class="tav" src="'+IMG+'face.webp" width="40" height="40" alt=""><div class="tn"><div class="logo"><span class="ai">AI</span>봄이</div><small>김보미를 닮은 아트토이 길잡이</small></div>'+
      '<button type="button" class="sw" role="switch" aria-checked="false" title="켜면 아주 쉬운 말로 답해요"><i></i><span>쉬운 말</span></button>'+
      '<button type="button" class="x" aria-label="닫기">×</button></div>'+
      '<div class="stage" aria-hidden="true"><div class="brand">김보미.com<small>돋보기로 같이 찾아봐요</small></div><img class="pose fl" alt="" src="'+IMG+'pose_bow.webp"><div class="word"></div></div>'+
      '<div class="sheet"><div class="grab"></div><div class="log" aria-live="polite"></div><div class="chips"></div>'+
      '<form><label for="bomiQ" style="position:absolute;left:-9999px">질문</label><input id="bomiQ" type="text" placeholder="메시지를 입력하고 Enter를 누르세요." maxlength="500" autocomplete="off">'+
      (SR?'<button type="button" class="mic" aria-label="말로 묻기">'+MIC+'</button>':'')+
      '<button type="submit" class="send" aria-label="보내기">'+SEND+'</button></form>'+
      '<label class="nolog"><input type="checkbox" id="bomiNolog"> 이 대화 저장 안 함 <span style="opacity:.75">(관리자에게 전달되지 않아요)</span></label>'+
      '<div class="ft">봄이는 김보미를 닮게 만든 AI 길잡이로, 김보미 본인이 아니에요. AI라 틀릴 수 있어요. 근거 자료에 없는 숫자는 답에서 빼지만, 오류·버그로 틀릴 수 있으니 숫자는 우리동네365 화면과 지방재정365 원자료로 확인해 주세요. 봄이의 답은 공식 입장이나 법률·재정 자문이 아니며, 운영자는 답변 이용 결과에 법적 책임을 지지 않습니다. 대화는 답변 점검을 위해 저장되며, 원치 않으면 위 칸을 체크하세요. 개인정보는 적지 마세요(<a href="/privacy.html">개인정보처리방침</a>).</div></div></section>');
    document.body.appendChild(fab); document.body.appendChild(box);
    /* 떠 있는 봄이 말풍선 글씨 바꾸기 */
    var say=fab.querySelector('.say'), si=0; if(!reduce) setInterval(function(){ si=(si+1)%SAYS.length; say.textContent=SAYS[si]; },4000);
    var pose=box.querySelector('.pose'), word=box.querySelector('.word'), stT=null, loaded={};
    function preload(){ Object.keys(ST).forEach(function(k){ var n=ST[k][0]; if(!loaded[n]){ loaded[n]=1; var i=new Image(); i.src=IMG+'pose_'+n+'.webp'; } }); }
    function state(s,ms,next){ clearTimeout(stT); var v=ST[s]||ST.idle; var src=IMG+'pose_'+v[0]+'.webp'; if(pose.getAttribute('src')!==src) pose.setAttribute('src',src);
      word.textContent=v[1]; word.classList.remove('pop'); void word.offsetWidth; if(v[1]) word.classList.add('pop'); if(ms) stT=setTimeout(function(){ state(next||'idle'); },ms); }
    var sw=box.querySelector('.sw'); function setEasy(v){ easy=v; sw.setAttribute('aria-checked',v?'true':'false'); try{ localStorage.setItem('bomiEasy',v?'1':'0'); }catch(e){} }
    setEasy(easy); sw.addEventListener('click',function(){ setEasy(!easy); addBot(easy?'이제부터 초등학생도 알아듣게 아주 쉬운 말로 설명할게요.':'이제 보통 말로 설명할게요.'); state(easy?'happy':'idle',1600); });
    var log=box.querySelector('.log'), chips=box.querySelector('.chips'), form=box.querySelector('form'), inp=box.querySelector('input'), send=form.querySelector('.send');
    function addBot(text,extra){ var r=el('<div class="bot"><span class="av"><img src="'+IMG+'face.webp" width="40" height="40" alt=""></span></div>'); var m=el('<div class="m"></div>'); m.textContent=text;
      if(extra){ var x=el('<span class="v"></span>'); x.textContent=extra; m.appendChild(x); } r.appendChild(m); var t=el('<span class="t"></span>'); t.textContent=hm(); r.appendChild(t); log.appendChild(r); log.scrollTop=log.scrollHeight; return m; }
    function addMe(text){ var r=el('<div class="me"><div class="m"></div><span class="t"></span></div>'); r.firstChild.textContent=text; r.lastChild.textContent=hm(); log.appendChild(r); log.scrollTop=log.scrollHeight; }
    addBot('안녕하세요! 돋보기 든 AI 봄이예요. 김보미를 닮게 만든 아트토이 길잡이지만, 김보미 본인은 아니에요. 어려운 예산 용어, 김보미가 어떤 사람인지, 우리 동네 살림, 청년들의 궁금증까지 편하게 물어보세요. 김보미.com 어디에 답이 있는지도 같이 찾아 드릴게요!');
    CHIPS.forEach(function(c){ var b=el('<button type="button"></button>'); b.textContent=c; b.addEventListener('click',function(){ ask(c); }); chips.appendChild(b); });
    var lastFocus=null;
    function open(){ lastFocus=document.activeElement; preload(); box.classList.add('on'); fab.style.display='none'; state('bow',1500,'hello'); setTimeout(function(){ if(!busy) state('hello',1800); },1500);
      if(innerWidth<=640){ document.documentElement.style.overflow='hidden'; } setTimeout(function(){ if(innerWidth>640) inp.focus(); else box.querySelector('.x').focus(); },60); }
    function close(){ box.classList.remove('on'); fab.style.display=''; document.documentElement.style.overflow=''; stopMic(); (lastFocus&&lastFocus.focus?lastFocus:fab).focus(); }
    fab.addEventListener('click',open); box.querySelector('.x').addEventListener('click',close);
    document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&box.classList.contains('on')) close(); });
    /* 음성 입력 */
    var mic=box.querySelector('.mic'), rec=null;
    function stopMic(){ if(rec){ try{ rec.stop(); }catch(e){} rec=null; } if(mic) mic.classList.remove('on'); }
    if(mic) mic.addEventListener('click',function(){ if(rec){ stopMic(); return; } try{ rec=new SR(); rec.lang='ko-KR'; rec.interimResults=true; rec.maxAlternatives=1;
      rec.onresult=function(e){ var t=''; for(var i=0;i<e.results.length;i++) t+=e.results[i][0].transcript; inp.value=t; if(e.results[e.results.length-1].isFinal){ stopMic(); ask(inp.value); } };
      rec.onerror=function(ev){ stopMic(); addBot('마이크를 쓸 수 없어요. 글자로 물어봐 주세요.'+(ev&&ev.error?' ('+ev.error+')':'')); }; rec.onend=function(){ if(mic) mic.classList.remove('on'); rec=null; }; rec.start(); mic.classList.add('on'); state('listen'); }catch(e){ stopMic(); } });
    var busy=false;
    /* 저장 안 함 — 본인이 고르면 서버가 이 대화를 기록하지 않는다. 고른 값은 이 브라우저에만 기억 */
    var nolog=box.querySelector('#bomiNolog'); try{ nolog.checked=localStorage.getItem('bomiNolog')==='1'; }catch(e){}
    nolog.addEventListener('change',function(){ try{ localStorage.setItem('bomiNolog',nolog.checked?'1':'0'); }catch(e){} addBot(nolog.checked?'알겠어요. 이제부터 이 창의 대화는 저장하지 않아요.':'이제부터 대화를 답변 점검용으로 저장해요.'); });
    /* 대화번호 — 한 번의 대화를 관리자 화면에서 묶어 보기 위한 임시 번호. 탭을 닫으면 사라지고, 개인을 알아볼 수 없다 */
    var SID=(function(){ var mk=function(){ return (Date.now().toString(36)+Math.random().toString(36).slice(2,10)).toLowerCase(); }; try{ var s=sessionStorage.getItem('bomiSid'); if(!s||!/^[a-z0-9]{6,32}$/.test(s)){ s=mk(); sessionStorage.setItem('bomiSid',s); } return s; }catch(e){ return mk(); } })();
    function typeOut(m,text,extra,done){ if(reduce||text.length>900){ m.textContent=text; fin(); return; } var k=0; var t=setInterval(function(){ k+=4; m.textContent=text.slice(0,k); log.scrollTop=log.scrollHeight; if(k>=text.length){ clearInterval(t); fin(); } },28);
      function fin(){ if(extra){ var x=el('<span class="v"></span>'); x.textContent=extra; m.appendChild(x); } log.scrollTop=log.scrollHeight; done(); } }
    async function ask(q){
      q=String(q||'').trim(); if(!q||busy) return; busy=true; send.disabled=true; inp.value='';
      addMe(q); state('listen'); var w=el('<div class="bot"><span class="av"><img src="'+IMG+'face.webp" width="40" height="40" alt=""></span><div class="m w">두 AI에게 물어보고 답을 맞춰 보는 중이에요…</div></div>'); log.appendChild(w); log.scrollTop=log.scrollHeight;
      var tThink=setTimeout(function(){ state('think'); },700);
      function end(){ busy=false; send.disabled=false; if(innerWidth>640) inp.focus(); }
      try{
        var r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'bomi',message:q,context:ctx(),history:hist.slice(-8),sid:SID,page:(location.pathname+location.search+location.hash).slice(0,200),nolog:!!(nolog&&nolog.checked)})});
        var j=await r.json(); clearTimeout(tThink); w.remove();
        if(!j.ok||!j.text){ state('oops',4000); addBot('앗, 지금은 답을 만들지 못했어요. 잠시 후 다시 물어봐 주세요. '+(j.error?'('+j.error+')':'')); end(); }
        else { state('talk'); var m=addBot(''); typeOut(m,j.text,(j.cross?'✔ Gemini·Groq 교차검증 완료':'AI 1개 응답(교차검증 생략)'),function(){ state('happy',2600); end(); }); hist.push({role:'user',text:q},{role:'model',text:j.text}); }
      }catch(e){ clearTimeout(tThink); w.remove(); state('oops',4000); addBot('연결이 잠깐 끊겼어요. 다시 시도해 주세요.'); end(); }
    }
    form.addEventListener('submit',function(e){ e.preventDefault(); ask(inp.value); });
    if(location.hash==='#bomi') open();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
