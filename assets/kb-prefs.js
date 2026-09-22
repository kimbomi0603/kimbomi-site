/* 화면 설정: 다크 모드 · 글자 크기 (2026-09-23)
   저장: localStorage kb_theme = 'light' | 'dark' (없으면 기기 설정 따름), kb_font = '0' | '1' | '2'
   적용: <html data-theme="dark"> 와 <html data-font="1|2">. 페이지 CSS가 이 속성을 보고 색·크기를 바꾼다.
   화면 오른쪽 아래에 작은 조절판을 붙인다. [위험] localStorage 가 막힌 환경(시크릿 창 등)에서는 저장만 안 되고 동작은 한다. */
(function(){
  var H=document.documentElement;
  function get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function set(k,v){ try{ v==null?localStorage.removeItem(k):localStorage.setItem(k,v); }catch(e){} }
  function sysDark(){ try{ return window.matchMedia('(prefers-color-scheme: dark)').matches; }catch(e){ return false; } }
  function apply(){
    var t=get('kb_theme'); var dark = t? t==='dark' : sysDark();
    if(dark) H.setAttribute('data-theme','dark'); else H.removeAttribute('data-theme');
    var f=get('kb_font')||'0'; if(f==='0') H.removeAttribute('data-font'); else H.setAttribute('data-font',f);
    var b=document.getElementById('kbPrefs'); if(b){ b.querySelector('[data-act=theme]').textContent=dark?'☀ 밝게':'☾ 어둡게'; b.querySelector('[data-act=theme]').setAttribute('aria-pressed',dark?'true':'false'); b.querySelector('.fsz').textContent=['보통','크게','더 크게'][+f]||'보통'; }
  }
  apply();
  function mount(){
    if(document.getElementById('kbPrefs')) return;
    var st=document.createElement('style'); st.textContent='#kbPrefs{position:fixed;right:14px;bottom:14px;z-index:9000;display:flex;gap:4px;align-items:center;background:rgba(28,27,24,.92);color:#F5F0E4;border-radius:999px;padding:5px 8px 5px 10px;font:600 12px/1 "Noto Sans KR",sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25)}#kbPrefs button{font:inherit;background:transparent;color:inherit;border:1px solid rgba(245,240,228,.35);border-radius:999px;padding:5px 9px;cursor:pointer;min-width:30px}#kbPrefs button:hover{background:rgba(245,240,228,.15)}#kbPrefs .fsz{opacity:.75;min-width:40px;text-align:center}@media print{#kbPrefs{display:none}}@media (max-width:640px){#kbPrefs{right:10px;bottom:10px;padding:4px 6px 4px 8px}}';
    document.head.appendChild(st);
    var d=document.createElement('div'); d.id='kbPrefs'; d.setAttribute('role','group'); d.setAttribute('aria-label','화면 설정');
    d.innerHTML='<button type="button" data-act="fm" aria-label="글자 작게">가−</button><span class="fsz">보통</span><button type="button" data-act="fp" aria-label="글자 크게">가＋</button><button type="button" data-act="theme" aria-pressed="false">☾ 어둡게</button>';
    d.addEventListener('click',function(e){ var b=e.target.closest('button'); if(!b) return; var a=b.getAttribute('data-act'); var f=+(get('kb_font')||0);
      if(a==='fp') set('kb_font',String(Math.min(2,f+1))); else if(a==='fm') set('kb_font',String(Math.max(0,f-1)));
      else if(a==='theme'){ var dark=H.getAttribute('data-theme')==='dark'; set('kb_theme',dark?'light':'dark'); }
      apply(); });
    document.body.appendChild(d); apply();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount); else mount();
})();
