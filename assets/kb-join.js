/* kb-join.js — 머리 '재정주권시민행동 함께하기' 단추: 슬로건 그림을 3초 보여 주고 함께하기 쪽으로 간다 (2026-11-08) */
(function(){
  var HOLD=3000;
  function go(a){
    var ov=document.createElement('div'); ov.className='kbj'; ov.setAttribute('role','status'); ov.setAttribute('aria-live','polite');
    ov.innerHTML='<img class="kbj-img" src="img/slogan/owner-800.webp" srcset="img/slogan/owner-800.webp 800w, img/slogan/owner-1600.webp 1600w" sizes="(max-width:760px) 100vw, 900px" width="1600" height="893" alt="시민들이 커다란 금빛 열쇠를 함께 들고 금고 문 앞에 서고, 김보미 아트토이가 열쇠 구멍을 가리키는 미니어처. 세금의 주인은 국민입니다.">'
      +'<p class="kbj-t"><b>재정주권시민행동 페이지로 이동 중입니다</b><span>세금의 주인은 국민입니다 · 잠시 후 함께하기 안내로 넘어갑니다</span></p>'
      +'<div class="kbj-bar" aria-hidden="true"><i></i></div>'
      +'<button type="button" class="kbj-skip">바로 가기</button>';
    document.body.appendChild(ov); document.body.classList.add('kbj-open');
    var done=false, to=setTimeout(leave,HOLD);
    function leave(){ if(done) return; done=true; clearTimeout(to); location.href=a.href; }
    ov.querySelector('.kbj-skip').addEventListener('click',leave);
    ov.querySelector('.kbj-skip').focus();
    document.addEventListener('keydown',function k(e){ if(e.key==='Escape'||e.key==='Enter'){ document.removeEventListener('keydown',k); leave(); } });
  }
  document.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('a.kbx-join'); if(!a) return;
    if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0) return;        /* 새 탭 열기는 그대로 */
    if(/pledge\.html$/.test(location.pathname)) return;                           /* 이미 그 쪽이면 그냥 이동 */
    e.preventDefault(); go(a);
  });
})();
