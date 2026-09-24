/* 김보미.com — 봄이 🌱 : 어려운 예산 용어를 물어보는 AI 도우미 (Gemini + Groq 교차검증, /api/chat mode=bomi) */
(function(){
  if (window.__bomi) return; window.__bomi = 1;
  var CSS = [
  '#bomi-fab{position:fixed;right:16px;bottom:64px;z-index:9990;display:flex;align-items:center;gap:8px;border:0;cursor:pointer;background:#0F5A4A;color:#fff;border-radius:999px;padding:8px 14px 8px 8px;box-shadow:0 10px 26px rgba(15,90,74,.35);font:700 14px/1 "Noto Sans KR",system-ui,sans-serif;letter-spacing:-.01em;transition:transform .16s}',
  '#bomi-fab:hover{transform:translateY(-2px)}#bomi-fab:focus-visible{outline:3px solid #C99A2E;outline-offset:3px}',
  '#bomi-fab .av{width:34px;height:34px;border-radius:50%;background:#EAF3EC;display:grid;place-items:center;flex:0 0 auto}',
  '#bomi-fab .av svg{width:24px;height:24px}',
  '#bomi-fab small{display:block;font-size:11px;font-weight:500;opacity:.85;margin-top:3px}',
  '#bomi{position:fixed;right:16px;bottom:64px;z-index:9991;width:min(380px,calc(100vw - 32px));max-height:min(620px,calc(100vh - 90px));display:none;flex-direction:column;background:#fff;color:#17181A;border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.28);overflow:hidden;font:15px/1.6 "Noto Sans KR",system-ui,sans-serif;word-break:keep-all}',
  '#bomi.on{display:flex}',
  '#bomi .hd{display:flex;align-items:center;gap:10px;padding:12px 14px;background:#0F5A4A;color:#fff}',
  '#bomi .hd .av{width:38px;height:38px;border-radius:50%;background:#EAF3EC;display:grid;place-items:center;flex:0 0 auto}#bomi .hd .av svg{width:27px;height:27px}',
  '#bomi .hd b{display:block;font-size:15px}#bomi .hd small{display:block;font-size:11.5px;opacity:.85;margin-top:1px}',
  '#bomi .hd button{margin-left:auto;border:0;background:rgba(255,255,255,.14);color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;line-height:1}',
  '#bomi .log{flex:1 1 auto;overflow:auto;padding:14px;background:#F5F2EA;display:flex;flex-direction:column;gap:10px}',
  '#bomi .m{max-width:88%;padding:10px 13px;border-radius:14px;font-size:14.5px;white-space:pre-wrap}',
  '#bomi .m.b{align-self:flex-start;background:#fff;border:1px solid #E4DFD3;border-bottom-left-radius:4px}',
  '#bomi .m.u{align-self:flex-end;background:#16305A;color:#fff;border-bottom-right-radius:4px}',
  '#bomi .m .x{display:block;margin-top:6px;font-size:11px;color:#55565A}',
  '#bomi .m.w{color:#55565A;font-style:italic}',
  '#bomi .chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 10px;background:#F5F2EA}',
  '#bomi .chips button{border:1px solid #C9DCCF;background:#fff;color:#0F5A4A;border-radius:999px;padding:5px 11px;font:600 12.5px "Noto Sans KR",system-ui,sans-serif;cursor:pointer}',
  '#bomi .chips button:hover{background:#EAF3EC}',
  '#bomi form{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #E4DFD3;background:#fff}',
  '#bomi input{flex:1;border:1.5px solid #D6CFBE;border-radius:12px;padding:10px 12px;font:14.5px "Noto Sans KR",system-ui,sans-serif;min-width:0}',
  '#bomi input:focus{outline:none;border-color:#0F5A4A}',
  '#bomi form button{border:0;background:#0F5A4A;color:#fff;border-radius:12px;padding:0 16px;font:700 14px "Noto Sans KR",system-ui,sans-serif;cursor:pointer}',
  '#bomi form button:disabled{opacity:.5;cursor:default}',
  '#bomi .ft{font-size:10.5px;color:#55565A;text-align:center;padding:0 12px 8px;background:#fff}',
  '@media(max-width:640px){#bomi-fab{bottom:60px;right:12px}#bomi{right:8px;left:8px;width:auto;bottom:60px}}',
  'html[data-theme="dark"] #bomi{background:#1E1F1B;color:#ECE8DF}html[data-theme="dark"] #bomi .log{background:#141412}html[data-theme="dark"] #bomi .m.b{background:#26271F;border-color:#3A3B33;color:#ECE8DF}html[data-theme="dark"] #bomi form,html[data-theme="dark"] #bomi .ft{background:#1E1F1B}html[data-theme="dark"] #bomi input{background:#141412;color:#ECE8DF;border-color:#3A3B33}html[data-theme="dark"] #bomi .chips{background:#141412}html[data-theme="dark"] #bomi .chips button{background:#26271F;border-color:#3A3B33;color:#CFE3D6}html[data-theme="dark"] #bomi .m .x{color:#A8A99F}'
  ].join('');
  var AV = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="26" r="14" fill="#FFE9B8"/><path d="M24 12c-1-6 2-9 6-10-1 4 0 7-6 10z" fill="#3E9D63"/><path d="M24 12c-3-5-8-6-11-4 3 1 6 3 11 4z" fill="#6DBF7A"/><circle cx="19" cy="26" r="1.9" fill="#17181A"/><circle cx="29" cy="26" r="1.9" fill="#17181A"/><path d="M19.5 31.5q4.5 3.5 9 0" stroke="#17181A" stroke-width="1.8" fill="none" stroke-linecap="round"/><circle cx="15.5" cy="30" r="2.2" fill="#F5B5A6" opacity=".8"/><circle cx="32.5" cy="30" r="2.2" fill="#F5B5A6" opacity=".8"/></svg>';
  var CHIPS = ['재정자립도가 뭐예요?','수의계약이 뭔가요?','본예산과 추경의 차이','국고보조금이란?','집행률은 어떻게 보나요?'];
  var hist = [];
  function el(h){ var d=document.createElement('div'); d.innerHTML=h; return d.firstElementChild; }
  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function ctx(){
    var t = document.title || '';
    var h = location.pathname + location.hash;
    var hd = document.querySelector('h1'); var hh = hd ? hd.textContent.trim().slice(0,120) : '';
    return '현재 화면: ' + t + ' (' + h + ')' + (hh ? ' · 제목: ' + hh : '');
  }
  function init(){
    var st=document.createElement('style'); st.textContent=CSS; document.head.appendChild(st);
    var fab = el('<button type="button" id="bomi-fab" aria-haspopup="dialog" aria-controls="bomi"><span class="av">'+AV+'</span><span>봄이에게 물어보기<small>어려운 예산 용어, 우리 동네 살림</small></span></button>');
    var box = el('<section id="bomi" role="dialog" aria-label="봄이 — 예산 도우미" aria-modal="false">'+
      '<div class="hd"><span class="av">'+AV+'</span><div><b>봄이 🌱</b><small>예산 용어 도우미 · Gemini + Groq 교차검증</small></div><button type="button" aria-label="닫기">×</button></div>'+
      '<div class="log" aria-live="polite"></div>'+
      '<div class="chips"></div>'+
      '<form><input type="text" placeholder="예: 재정자주도가 뭐예요?" maxlength="500" autocomplete="off" aria-label="질문"><button type="submit">보내기</button></form>'+
      '<div class="ft">봄이는 AI라 틀릴 수 있어요. 숫자는 우리동네365 화면과 지방재정365 원자료로 확인해 주세요.</div></section>');
    document.body.appendChild(fab); document.body.appendChild(box);
    var log=box.querySelector('.log'), chips=box.querySelector('.chips'), form=box.querySelector('form'), inp=box.querySelector('input'), btn=form.querySelector('button');
    function add(cls,text,extra){ var m=el('<div class="m '+cls+'"></div>'); m.textContent=text; if(extra){ var x=el('<span class="x"></span>'); x.textContent=extra; m.appendChild(x);} log.appendChild(m); log.scrollTop=log.scrollHeight; return m; }
    add('b','안녕하세요, 봄이예요 🌱 재정자립도, 수의계약, 추경처럼 어렵게 들리는 예산 용어나 우리 동네 살림이 궁금하면 편하게 물어보세요. 두 AI(Gemini·Groq)의 답을 대조해서 알려 드려요.');
    CHIPS.forEach(function(c){ var b=el('<button type="button"></button>'); b.textContent=c; b.addEventListener('click',function(){ ask(c); }); chips.appendChild(b); });
    function open(){ box.classList.add('on'); fab.style.display='none'; setTimeout(function(){ inp.focus(); },50); }
    function close(){ box.classList.remove('on'); fab.style.display=''; fab.focus(); }
    fab.addEventListener('click',open); box.querySelector('.hd button').addEventListener('click',close);
    document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&box.classList.contains('on')) close(); });
    var busy=false;
    async function ask(q){
      q=String(q||'').trim(); if(!q||busy) return; busy=true; btn.disabled=true; inp.value='';
      add('u',q); var w=add('b w','봄이가 두 AI에게 물어보고 대조하는 중이에요…');
      try{
        var r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'bomi',message:q,context:ctx(),history:hist.slice(-8)})});
        var j=await r.json();
        w.remove();
        if(!j.ok||!j.text){ add('b','앗, 지금은 답을 만들지 못했어요. 잠시 후 다시 물어봐 주세요. '+(j.error?'('+j.error+')':'')); }
        else { add('b',j.text,(j.cross?'✔ Gemini·Groq 교차검증 완료':'AI 1개 응답(교차검증 생략)')); hist.push({role:'user',text:q},{role:'model',text:j.text}); }
      }catch(e){ w.remove(); add('b','연결이 잠깐 끊겼어요. 다시 시도해 주세요.'); }
      busy=false; btn.disabled=false; inp.focus();
    }
    form.addEventListener('submit',function(e){ e.preventDefault(); ask(inp.value); });
    if(location.hash==='#bomi') open();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
