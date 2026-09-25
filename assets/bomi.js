/* 김보미.com — AI 봄이 : 어려운 예산 용어를 물어보는 도우미 (Gemini + Groq 교차검증, /api/chat mode=bomi)
   2026-09-25 개편 — 부산시 「AI 부기뉴스」처럼 캐릭터가 전면에 서는 방식.
   · 떠 있는 봄이: 온몸 3D 봄이(assets/bomi/body.webp 9KB)가 둥실 떠 있고 「안녕」 말풍선 글씨 + 「AI 봄이」 이름표.
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
  '#bomi-fab{position:fixed;right:10px;bottom:60px;z-index:9990;border:0;background:none;padding:0;cursor:pointer;display:flex;flex-direction:column;align-items:center;width:132px;-webkit-tap-highlight-color:transparent}',
  '#bomi-fab:focus-visible{outline:3px solid #C99A2E;outline-offset:4px;border-radius:16px}',
  '#bomi-fab .fig{position:relative;width:118px;height:116px;display:block}',
  '#bomi-fab .fig img{width:118px;height:auto;display:block;filter:drop-shadow(0 10px 12px rgba(15,40,60,.22));animation:bmFloat 3s ease-in-out infinite}',
  '#bomi-fab .say{position:absolute;right:-6px;top:-8px;font:400 22px/1 "Jua","Noto Sans KR",sans-serif;color:#15171A;-webkit-text-stroke:.3px #15171A;text-shadow:0 0 6px #fff,0 0 3px #fff;letter-spacing:-.02em;transform:rotate(8deg);animation:bmPop 4s ease-in-out infinite}',
  '#bomi-fab .dot{position:absolute;width:9px;height:9px;border-radius:50% 50% 50% 0;animation:bmTw 2.4s ease-in-out infinite}',
  '#bomi-fab .d1{left:4px;top:26px;background:#3FA66A}#bomi-fab .d2{left:12px;top:70px;background:#E0A43C;animation-delay:.8s}#bomi-fab .d3{right:2px;top:58px;background:#3FA66A;animation-delay:1.5s;width:7px;height:7px}',
  '#bomi-fab .tag{margin-top:-6px;display:inline-flex;align-items:center;gap:5px;background:#15213A;color:#fff;border-radius:999px;padding:6px 13px 6px 11px;font:800 13.5px/1 "Noto Sans KR",sans-serif;box-shadow:0 6px 16px rgba(10,20,40,.3);border:1.5px solid rgba(255,255,255,.18)}',
  '#bomi-fab .ai,#bomi .ai{font-weight:900;background:linear-gradient(135deg,#46C08A,#F0C24B);-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:-.03em}',
  '@keyframes bmFloat{0%,100%{transform:translateY(0) rotate(-1.5deg)}50%{transform:translateY(-7px) rotate(1.5deg)}}',
  '@keyframes bmPop{0%,70%,100%{transform:rotate(8deg) scale(1)}8%{transform:rotate(8deg) scale(1.22)}16%{transform:rotate(8deg) scale(1)}}',
  '@keyframes bmTw{0%,100%{opacity:.25;transform:scale(.7)}50%{opacity:1;transform:scale(1)}}',
  'html.has-cta #bomi-fab{bottom:88px}',
  '@media(max-width:640px){#bomi-fab{right:4px;bottom:56px;width:104px}#bomi-fab .fig{width:92px;height:92px}#bomi-fab .fig img{width:92px}#bomi-fab .say{font-size:18px;right:-2px;top:-6px}#bomi-fab .tag{font-size:12px;padding:5px 11px 5px 9px}}',
  /* 대화창 */
  '#bomi{position:fixed;z-index:9991;display:none;flex-direction:column;background:#fff;color:#17181A;font:15px/1.6 "Noto Sans KR",system-ui,sans-serif;word-break:keep-all;overflow:hidden;right:20px;bottom:20px;width:410px;height:min(780px,calc(100vh - 40px));border-radius:26px;box-shadow:0 28px 70px rgba(10,20,40,.32)}',
  '#bomi.on{display:flex}',
  '#bomi .top{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:12px 14px 10px 18px;background:#fff}',
  '#bomi .logo{font:900 22px/1 "Noto Sans KR",sans-serif;letter-spacing:-.04em;color:#15171A;display:flex;align-items:baseline;gap:4px}',
  '#bomi .logo .ai{font-size:25px}',
  '#bomi .sw{margin-left:auto;display:inline-flex;align-items:center;gap:7px;border:0;cursor:pointer;background:#6B6F76;color:#fff;border-radius:999px;padding:5px 13px 5px 5px;font:800 13px/1 "Noto Sans KR",sans-serif;min-height:36px;transition:background .2s}',
  '#bomi .sw i{width:26px;height:26px;border-radius:50%;background:#fff;display:block;transition:transform .2s}',
  '#bomi .sw[aria-checked="true"]{background:'+G+';padding:5px 5px 5px 13px;flex-direction:row-reverse}',
  '#bomi .x{border:0;background:#F1EFEA;color:#15171A;width:40px;height:40px;border-radius:50%;cursor:pointer;font-size:21px;line-height:1;flex:0 0 auto}',
  '#bomi .sw:focus-visible,#bomi .x:focus-visible,#bomi .send:focus-visible,#bomi .mic:focus-visible{outline:3px solid #C99A2E;outline-offset:2px}',
  '#bomi .stage{position:relative;flex:0 0 auto;height:clamp(190px,34vh,290px);background:radial-gradient(120% 90% at 50% 25%,#FFFFFF 0%,#EEF6EF 55%,#E3EFE6 100%);overflow:hidden}',
  '#bomi .brand{position:absolute;left:16px;top:12px;font:800 12px/1.25 "Noto Sans KR",sans-serif;color:'+N+';letter-spacing:-.02em}',
  '#bomi .brand small{display:block;font:600 9.5px/1.3 "Noto Sans KR",sans-serif;color:#5B6C63;letter-spacing:.02em}',
  '#bomi .pose{position:absolute;left:50%;bottom:26px;height:84%;transform:translateX(-50%);filter:drop-shadow(0 12px 14px rgba(15,40,60,.18));transition:opacity .18s}',
  '#bomi .pose.fl{animation:bmFloat2 3s ease-in-out infinite}',
  '@keyframes bmFloat2{0%,100%{transform:translate(-50%,0)}50%{transform:translate(-50%,-6px)}}',
  '#bomi .word{position:absolute;right:8%;top:14%;font:400 44px/1 "Jua","Noto Sans KR",sans-serif;color:#15171A;letter-spacing:-.03em;transform:rotate(-6deg);text-shadow:0 0 8px #fff}',
  '#bomi .word.pop{animation:bmWord .5s cubic-bezier(.2,1.6,.4,1)}',
  '@keyframes bmWord{0%{transform:rotate(-6deg) scale(.3);opacity:0}100%{transform:rotate(-6deg) scale(1);opacity:1}}',
  '#bomi .sheet{flex:1 1 auto;min-height:0;margin-top:-26px;position:relative;background:#fff;border-radius:28px 28px 0 0;box-shadow:0 -6px 18px rgba(10,20,40,.06);display:flex;flex-direction:column}',
  '#bomi .grab{width:64px;height:5px;border-radius:5px;background:#C9CBCF;margin:12px auto 4px;flex:0 0 auto}',
  '#bomi .log{flex:1 1 auto;min-height:0;overflow:auto;padding:10px 18px 12px;display:flex;flex-direction:column;gap:14px}',
  '#bomi .bot{display:flex;flex-direction:column;gap:6px;align-items:flex-start;max-width:94%}',
  '#bomi .av{width:46px;height:46px;border-radius:50%;padding:3px;background:linear-gradient(135deg,#46C08A,#F0C24B);flex:0 0 auto}',
  '#bomi .av img{width:40px;height:40px;border-radius:50%;background:#fff;display:block}',
  '#bomi .m{padding:12px 15px;border-radius:16px;font-size:15px;white-space:pre-wrap}',
  '#bomi .bot .m{background:#fff;border:1px solid #E1E2E6;border-top-left-radius:6px;box-shadow:0 2px 8px rgba(10,20,40,.04)}',
  '#bomi .me{align-self:flex-end;display:flex;flex-direction:column;align-items:flex-end;gap:4px;max-width:86%}',
  '#bomi .me .m{background:'+N+';color:#fff;border-top-right-radius:6px}',
  '#bomi .t{font-size:12px;color:#8A8D93}',
  '#bomi .m .v{display:block;margin-top:8px;font-size:11.5px;color:#5B6C63}',
  '#bomi .m.w{color:#6B6F76;font-style:italic}',
  '#bomi .chips{flex:0 0 auto;display:flex;gap:6px;overflow-x:auto;padding:2px 16px 8px;scrollbar-width:none}',
  '#bomi .chips::-webkit-scrollbar{display:none}',
  '#bomi .chips button{flex:0 0 auto;border:1px solid #CFE3D6;background:#F3F9F5;color:'+G+';border-radius:999px;padding:8px 13px;min-height:36px;font:700 13px "Noto Sans KR",sans-serif;cursor:pointer;white-space:nowrap}',
  '#bomi form{flex:0 0 auto;margin:0 14px 8px;display:flex;align-items:center;gap:4px;border:1.5px solid #D9DBDF;border-radius:16px;padding:4px 6px 4px 14px;background:#fff}',
  '#bomi form:focus-within{border-color:'+G+'}',
  '#bomi input{flex:1;border:0;outline:none;background:transparent;padding:12px 0;font:15px "Noto Sans KR",sans-serif;min-width:0;color:inherit}',
  '#bomi .mic,#bomi .send{border:0;background:none;width:44px;height:44px;border-radius:12px;cursor:pointer;display:grid;place-items:center;color:#15171A;flex:0 0 auto}',
  '#bomi .send{background:'+G+';color:#fff}#bomi .send:disabled{opacity:.45;cursor:default}',
  '#bomi .mic.on{background:#FCE8E6;color:#C8412B}',
  '#bomi svg.ic{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
  '#bomi .ft{flex:0 0 auto;font-size:10.5px;color:#7A7D83;text-align:center;padding:0 14px calc(10px + env(safe-area-inset-bottom,0px))}',
  '@media(max-width:640px){#bomi{inset:0;width:auto;height:auto;border-radius:0;right:0;bottom:0}#bomi .top{padding-top:calc(10px + env(safe-area-inset-top,0px))}#bomi .word{font-size:38px}}',
  'html[data-theme="dark"] #bomi,html[data-theme="dark"] #bomi .top,html[data-theme="dark"] #bomi .sheet,html[data-theme="dark"] #bomi form{background:#1B1D20;color:#ECE8DF}',
  'html[data-theme="dark"] #bomi .logo{color:#ECE8DF}html[data-theme="dark"] #bomi .x{background:#2A2D31;color:#ECE8DF}',
  'html[data-theme="dark"] #bomi .stage{background:radial-gradient(120% 90% at 50% 25%,#2B3A33 0%,#1F2A25 60%,#18201C 100%)}html[data-theme="dark"] #bomi .brand{color:#CFE3D6}html[data-theme="dark"] #bomi .brand small{color:#9DB3A6}',
  'html[data-theme="dark"] #bomi .word{color:#F4F1E8;text-shadow:0 0 8px #000}',
  'html[data-theme="dark"] #bomi .bot .m{background:#24272B;border-color:#34383D;color:#ECE8DF}html[data-theme="dark"] #bomi .chips button{background:#22302A;border-color:#34473D;color:#BFE3CE}',
  'html[data-theme="dark"] #bomi form{border-color:#3A3E43}html[data-theme="dark"] #bomi .mic{color:#ECE8DF}',
  '@media (prefers-reduced-motion:reduce){#bomi-fab *,#bomi *{animation:none!important;transition:none!important}}'
  ].join('');
  var CHIPS=['재정자립도가 뭐예요?','수의계약이 뭔가요?','본예산과 추경의 차이','국고보조금이란?','집행률은 어떻게 보나요?','우리 동네 예산 보는 법'];
  /* 대화 단계 → 무대의 자세 그림과 효과 글씨 */
  var ST={ bow:['bow','꾸벅'], hello:['hello','안녕!'], idle:['idle',''], listen:['idle','응응!'], think:['think','음…'], talk:['talk','설명할게!'], happy:['happy','짜잔!'], oops:['oops','앗!'] };
  var SAYS=['안녕','궁금해?','물어봐!'];
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
    var fab=el('<button type="button" id="bomi-fab" aria-haspopup="dialog" aria-controls="bomi" aria-label="AI 봄이에게 예산 용어 물어보기">'+
      '<span class="fig"><img src="'+IMG+'body.webp" width="118" height="116" alt=""><span class="say" aria-hidden="true">안녕</span><i class="dot d1"></i><i class="dot d2"></i><i class="dot d3"></i></span>'+
      '<span class="tag"><span class="ai">AI</span> 봄이</span></button>');
    var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    var box=el('<section id="bomi" role="dialog" aria-label="AI 봄이 — 예산 도우미" aria-modal="false">'+
      '<div class="top"><div class="logo"><span class="ai">AI</span>봄이</div>'+
      '<button type="button" class="sw" role="switch" aria-checked="false" title="켜면 아주 쉬운 말로 답해요"><i></i><span>쉬운 말</span></button>'+
      '<button type="button" class="x" aria-label="닫기">×</button></div>'+
      '<div class="stage" aria-hidden="true"><div class="brand">김보미.com<small>우리동네365 예산 도우미</small></div><img class="pose fl" alt="" src="'+IMG+'pose_bow.webp"><div class="word"></div></div>'+
      '<div class="sheet"><div class="grab"></div><div class="log" aria-live="polite"></div><div class="chips"></div>'+
      '<form><label for="bomiQ" style="position:absolute;left:-9999px">질문</label><input id="bomiQ" type="text" placeholder="메시지를 입력하고 Enter를 누르세요." maxlength="500" autocomplete="off">'+
      (SR?'<button type="button" class="mic" aria-label="말로 묻기">'+MIC+'</button>':'')+
      '<button type="submit" class="send" aria-label="보내기">'+SEND+'</button></form>'+
      '<div class="ft">봄이는 AI라 틀릴 수 있어요. 숫자는 우리동네365 화면과 지방재정365 원자료로 확인해 주세요.</div></div></section>');
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
    addBot('안녕하세요! 김보미.com 예산 도우미 봄이예요. 재정자립도, 수의계약, 추경처럼 어렵게 들리는 예산 용어와 우리 동네 살림 보는 법을 쉽게 풀어 드릴게요. 궁금한 게 있으면 편하게 물어보세요!');
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
      rec.onerror=function(){ stopMic(); }; rec.onend=function(){ if(mic) mic.classList.remove('on'); rec=null; }; rec.start(); mic.classList.add('on'); state('listen'); }catch(e){ stopMic(); } });
    var busy=false;
    function typeOut(m,text,extra,done){ if(reduce||text.length>900){ m.textContent=text; fin(); return; } var k=0; var t=setInterval(function(){ k+=4; m.textContent=text.slice(0,k); log.scrollTop=log.scrollHeight; if(k>=text.length){ clearInterval(t); fin(); } },28);
      function fin(){ if(extra){ var x=el('<span class="v"></span>'); x.textContent=extra; m.appendChild(x); } log.scrollTop=log.scrollHeight; done(); } }
    async function ask(q){
      q=String(q||'').trim(); if(!q||busy) return; busy=true; send.disabled=true; inp.value='';
      addMe(q); state('listen'); var w=el('<div class="bot"><span class="av"><img src="'+IMG+'face.webp" width="40" height="40" alt=""></span><div class="m w">두 AI에게 물어보고 답을 맞춰 보는 중이에요…</div></div>'); log.appendChild(w); log.scrollTop=log.scrollHeight;
      var tThink=setTimeout(function(){ state('think'); },700);
      function end(){ busy=false; send.disabled=false; if(innerWidth>640) inp.focus(); }
      try{
        var r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'bomi',message:q,context:ctx(),history:hist.slice(-8)})});
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
