/* kb-more.js — 긴 목록은 10개씩 보여 주고 '더 보기'로 이어 붙인다 (2026-11-08)
   <ul data-more="10"> 에 붙는다. 처음 숨기는 일은 CSS가 하므로 화면이 밀리지 않는다. */
(function(){
  function setup(list){
    var step=+list.getAttribute('data-more')||10;
    var items=Array.prototype.filter.call(list.children,function(c){return c.tagName==='LI'});
    if(items.length<=step) return;
    var shown=step;
    var wrap=document.createElement('div'); wrap.className='kb-more-wrap';
    var btn=document.createElement('button'); btn.type='button'; btn.className='kb-more';
    function label(){ btn.innerHTML='더 보기 <span>('+shown+' / '+items.length+')</span>'; }
    label(); wrap.appendChild(btn); list.parentNode.insertBefore(wrap,list.nextSibling);
    btn.addEventListener('click',function(){
      var first=items[shown];
      for(var i=shown;i<Math.min(shown+step,items.length);i++) items[i].classList.add('kb-show');
      shown=Math.min(shown+step,items.length);
      if(shown>=items.length) wrap.remove(); else label();
      var f=first&&first.querySelector('a,button'); if(f) f.focus({preventScroll:true});
    });
  }
  function run(){ document.querySelectorAll('[data-more]').forEach(setup); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run); else run();
})();
