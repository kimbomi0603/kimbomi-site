/* kb-a11y.js — 국내 웹 접근성 기준(KWCAG 2.2) 보완 (2026-11-08)
   1) 새 창으로 열리는 링크에 '(새 창)'을 화면낭독기에 알린다 (25 사용자 요구에 따른 실행)
   2) 계속 흐르는 사진 띠에 멈춤 단추를 단다 (14 정지 기능 제공) */
(function(){
  var SR='position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';
  function mark(root){
    (root.querySelectorAll ? root : document).querySelectorAll('a[target="_blank"]').forEach(function(a){
      if(a.dataset.kbNw) return; a.dataset.kbNw='1';
      var t=(a.getAttribute('aria-label')||'');
      if(t){ if(!/새 ?창/.test(t)) a.setAttribute('aria-label',t+' (새 창)'); return; }
      var s=document.createElement('span'); s.textContent=' (새 창)'; s.setAttribute('style',SR); a.appendChild(s);
    });
  }
  function pausers(){
    document.querySelectorAll('.ps').forEach(function(ps){
      if(ps.dataset.kbPause||!ps.querySelector('.ps-row')) return; ps.dataset.kbPause='1';
      var b=document.createElement('button'); b.type='button'; b.className='kb-pause'; b.setAttribute('aria-pressed','false'); b.textContent='사진 흐름 멈추기';
      b.addEventListener('click',function(){ var on=ps.classList.toggle('kb-paused'); b.setAttribute('aria-pressed',on?'true':'false'); b.textContent=on?'사진 흐름 다시 보기':'사진 흐름 멈추기'; });
      ps.parentNode.insertBefore(b,ps);
    });
  }
  /* 사진 크게 보기(#lb)는 Esc로도 닫힌다 (10 키보드 사용 보장) */
  document.addEventListener('keydown',function(e){ if(e.key!=='Escape') return; var lb=document.getElementById('lb'); if(lb&&lb.style.display&&lb.style.display!=='none'){ lb.style.display='none'; } }); /* kb-lb-esc */
  /* 옆으로 미는 표 영역은 Tab으로 들어가 화살표로 밀 수 있게 (10 키보드 사용 보장) */
  function scrollers(){
    document.querySelectorAll('.scrollx').forEach(function(el){
      if(el.hasAttribute('tabindex')||el.querySelector('a,button,input,select,textarea,[tabindex]')) return;
      el.setAttribute('tabindex','0'); el.setAttribute('role','region'); el.setAttribute('aria-label','옆으로 밀어 보는 표');
    });
  }
  function run(){
    mark(document); pausers(); scrollers();
    var pf=document.getElementById('kbPrefs'); if(pf&&!pf.getAttribute('role')){ pf.setAttribute('role','region'); pf.setAttribute('aria-label','글자 크기·화면 설정'); }
    setTimeout(function(){ var pf=document.getElementById('kbPrefs'); if(pf&&!pf.getAttribute('role')){ pf.setAttribute('role','region'); pf.setAttribute('aria-label','글자 크기·화면 설정'); } },800);
    new MutationObserver(function(ms){ ms.forEach(function(m){ m.addedNodes.forEach(function(n){ if(n.nodeType===1){ if(n.matches&&n.matches('a[target="_blank"]')) mark(n.parentNode||document); else if(n.querySelector&&n.querySelector('a[target="_blank"]')) mark(n); if(n.querySelector&&n.querySelector('.ps-row')) pausers(); if(n.querySelector&&(n.matches('.scrollx')||n.querySelector('.scrollx'))) scrollers(); } }); }); })
      .observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run); else run();
})();
