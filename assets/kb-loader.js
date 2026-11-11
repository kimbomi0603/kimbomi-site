/* kb-loader.js — '불러오는 중' 표시 (시안 1: 봄이가 돋보기로 서류 넘기기, 분야별 맞춤) 2026-11-08
   쓰는 법
     KB_loader('budget', {who:'강진군'})     → 큰 표시 HTML 문자열 (화면 전체가 바뀔 때)
     KB_loaderMini('exec', '집행 내역 받는 중') → 한 줄짜리 작은 표시 (카드·칸 안)
   문구는 실제로 하는 일 순서대로 바뀌고, 8초가 넘으면 '평소보다 오래 걸려요' 안내가 붙는다.
   화면낭독기는 role="status"로 지금 단계를 읽는다. '움직임 줄이기' 설정이면 움직이지 않는다. */
(function(){
  var B='assets/bomi/';
  /* 분야별 소품(작은 그림) */
  var P={
    book:'<svg viewBox="0 0 36 40"><rect x="3" y="3" width="30" height="34" rx="4" fill="#fff" stroke="#16305A" stroke-width="2"/><rect x="3" y="3" width="7" height="34" rx="3" fill="#16305A"/><path d="M15 12h13M15 18h13M15 24h9" stroke="#DDE2EA" stroke-width="3" stroke-linecap="round"/></svg>',
    coin:'<svg viewBox="0 0 36 40"><ellipse cx="18" cy="30" rx="13" ry="5" fill="#C99A2E"/><rect x="5" y="20" width="26" height="10" fill="#C99A2E"/><ellipse cx="18" cy="20" rx="13" ry="5" fill="#E9C56A"/><path d="M14 20h8" stroke="#9C7520" stroke-width="2" stroke-linecap="round"/><path d="M8 12l20-6" stroke="#0F5A4A" stroke-width="3" stroke-linecap="round"/><path d="M24 4l4 2-2 4" fill="none" stroke="#0F5A4A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    deal:'<svg viewBox="0 0 36 40"><rect x="4" y="3" width="26" height="33" rx="3" fill="#fff" stroke="#16305A" stroke-width="2"/><path d="M9 11h16M9 17h16M9 23h10" stroke="#DDE2EA" stroke-width="3" stroke-linecap="round"/><circle cx="26" cy="30" r="7" fill="#C3272B" opacity=".9"/><path d="M23 30h6" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
    flag:'<svg viewBox="0 0 36 40"><rect x="3" y="3" width="30" height="34" rx="4" fill="#fff" stroke="#16305A" stroke-width="2"/><path d="M9 12h18M9 19h18M9 26h12" stroke="#DDE2EA" stroke-width="3" stroke-linecap="round"/><path d="M24 22v14" stroke="#16305A" stroke-width="2"/><path d="M24 22h9l-3 3 3 3h-9z" fill="#C3272B"/></svg>',
    vote:'<svg viewBox="0 0 36 40"><rect x="5" y="16" width="26" height="21" rx="3" fill="#fff" stroke="#16305A" stroke-width="2"/><rect x="12" y="15" width="12" height="3" rx="1.5" fill="#16305A"/><rect x="11" y="3" width="14" height="15" rx="2" fill="#F5F0E4" stroke="#C99A2E" stroke-width="2"/><path d="M14 10l3 3 5-6" fill="none" stroke="#0F5A4A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bars:'<svg viewBox="0 0 36 40"><rect x="3" y="3" width="30" height="34" rx="4" fill="#fff" stroke="#16305A" stroke-width="2"/><rect x="9" y="20" width="5" height="11" rx="1.5" fill="#0F5A4A"/><rect x="16" y="13" width="5" height="18" rx="1.5" fill="#C99A2E"/><rect x="23" y="16" width="5" height="15" rx="1.5" fill="#16305A"/></svg>',
    folder:'<svg viewBox="0 0 36 40"><path d="M3 10a3 3 0 0 1 3-3h9l3 4h12a3 3 0 0 1 3 3v19a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" fill="#F5F0E4" stroke="#C99A2E" stroke-width="2"/><path d="M9 20h18M9 26h12" stroke="#DDE2EA" stroke-width="3" stroke-linecap="round"/></svg>',
    hall:'<svg viewBox="0 0 36 40"><path d="M4 15L18 6l14 9z" fill="#16305A"/><rect x="5" y="15" width="26" height="3" fill="#16305A"/><path d="M9 19v12M15 19v12M21 19v12M27 19v12" stroke="#DDE2EA" stroke-width="3"/><rect x="4" y="31" width="28" height="4" rx="1" fill="#16305A"/></svg>',
    scroll:'<svg viewBox="0 0 36 40"><rect x="7" y="6" width="22" height="29" rx="2" fill="#F5F0E4" stroke="#C99A2E" stroke-width="2"/><rect x="4" y="4" width="28" height="5" rx="2.5" fill="#C99A2E"/><rect x="4" y="32" width="28" height="5" rx="2.5" fill="#C99A2E"/><path d="M11 15h14M11 21h14M11 27h9" stroke="#16305A" stroke-width="2" stroke-linecap="round" opacity=".5"/></svg>',
    map:'<svg viewBox="0 0 36 40"><path d="M4 9l9-4 10 4 9-4v26l-9 4-10-4-9 4z" fill="#fff" stroke="#16305A" stroke-width="2" stroke-linejoin="round"/><path d="M13 5v26M23 9v26" stroke="#DDE2EA" stroke-width="2"/><circle cx="18" cy="18" r="4" fill="#C3272B"/></svg>',
    news:'<svg viewBox="0 0 36 40"><rect x="3" y="5" width="30" height="31" rx="3" fill="#fff" stroke="#16305A" stroke-width="2"/><rect x="8" y="10" width="20" height="6" rx="1.5" fill="#16305A"/><path d="M8 21h20M8 26h20M8 31h13" stroke="#DDE2EA" stroke-width="2.6" stroke-linecap="round"/></svg>'
  };
  /* 분야별 설정: 봄이 자세, 소품, 단계 문구, 자료 출처 */
  var K={
    home:{pose:'idle',prop:'map',src:'지방재정365 원자료',steps:['전국 243개 지방정부 목록을 펼치고 있습니다','지방재정365 기준일을 확인하고 있습니다','원자료와 대조한 판정표를 여는 중입니다','첫 화면을 그리는 중입니다']},
    lg:{pose:'idle',prop:'book',src:'지방재정365 원자료',steps:['{who} 살림살이 장부를 펼치고 있습니다','올해 세출 예산을 분야별로 나누고 있습니다','집행률과 계약 건수를 맞춰 보고 있습니다','화면을 그리는 중입니다']},
    budget:{pose:'idle',prop:'book',src:'지방재정365 세출 예산',steps:['{who} 세출 예산서를 펼치고 있습니다','분야·부서별로 금액을 나누고 있습니다','세부사업 금액을 더하는 중입니다','표와 그래프를 그리는 중입니다']},
    exec:{pose:'talk',prop:'coin',src:'지방재정365 집행 내역',steps:['{who} 예산이 얼마나 쓰였는지 집행 내역을 받고 있습니다','사업마다 집행률을 계산하고 있습니다','늦게 쓰이는 사업을 찾고 있습니다','표를 그리는 중입니다']},
    contract:{pose:'idle',prop:'deal',src:'나라장터 계약 대장',steps:['{who} 계약 대장을 받고 있습니다','업체별로 묶고 금액을 더하고 있습니다','수의계약과 같은 업체 반복 수주를 표시하고 있습니다','표를 그리는 중입니다']},
    diag:{pose:'think',prop:'flag',src:'계약 대장·원자료',steps:['{who} 계약을 하나씩 살펴보고 있습니다','수의계약 비중을 계산하고 있습니다','같은 업체 반복 수주와 쪼개기 발주 의심을 찾고 있습니다','결과를 정리하는 중입니다']},
    pledge:{pose:'talk',prop:'vote',src:'중앙선관위 공약 자료',steps:['{who} 단체장 공약집을 펼치고 있습니다','공약과 세부사업을 짝짓고 있습니다','예산에 실제로 반영됐는지 맞춰 보고 있습니다','화면을 그리는 중입니다']},
    peer:{pose:'think',prop:'bars',src:'지방재정365 재정 지표',steps:['{who}와 비슷한 지자체를 고르고 있습니다','재정 지표를 나란히 놓고 있습니다','가장 좋은 값을 표시하고 있습니다','표를 그리는 중입니다']},
    search:{pose:'idle',prop:'folder',src:'전국 세부사업 색인',steps:['전국 세부사업 색인을 여는 중입니다 (처음 한 번만 약 9MB)','「{who}」가 들어간 사업을 찾고 있습니다','지자체별로 묶고 있습니다','결과를 그리는 중입니다']},
    gov:{pose:'idle',prop:'hall',src:'열린재정 중앙정부 예산',steps:['열린재정에서 {who} 예산을 받고 있습니다','프로그램·단위사업으로 나누고 있습니다','지난해와 비교하고 있습니다','표를 그리는 중입니다']},
    govsearch:{pose:'idle',prop:'hall',src:'중앙부처 세부사업',steps:['부처 세부사업 목록을 여는 중입니다','「{who}」가 들어간 사업을 찾고 있습니다','부처별로 묶고 있습니다','결과를 그리는 중입니다']},
    policy:{pose:'talk',prop:'scroll',src:'정부 발표 원문',steps:['정부 정책 원문을 펼치고 있습니다','국정과제·발표 날짜를 정리하고 있습니다','우리 동네 사업과 이어지는지 찾고 있습니다','화면을 그리는 중입니다']},
    docs:{pose:'idle',prop:'scroll',src:'재정 원자료 원문',steps:['지자체 재정 원자료 원문 목록을 여는 중입니다','원문 파일을 정리하고 있습니다','화면을 그리는 중입니다']},
    sido:{pose:'idle',prop:'map',src:'시·도 원자료',steps:['{who} 시·군·구를 모으고 있습니다','시·도 예산과 정책을 맞춰 보고 있습니다','화면을 그리는 중입니다']},
    firm:{pose:'think',prop:'deal',src:'전국 계약 대장',steps:['전국 계약 색인을 여는 중입니다 (처음 한 번만 약 9MB)','지방정부 243개 시·군·구 계약 대장에서 「{who}」를 찾고 있습니다','지자체별 계약을 묶고 금액을 더하고 있습니다','표를 그리는 중입니다']},
    live:{pose:'talk',prop:'news',src:'정부·국회 공개 API',steps:['{who} 자료를 공개 API에서 받고 있습니다 (처음엔 10초쯤 걸릴 수 있습니다)','최신 발표 순으로 정리하고 있습니다','목록을 그리는 중입니다']}
  };
  var SLOW=8000, TICK=1900, MIN=2000;   /* MIN: 큰 표시는 한 번 뜨면 최소 2초는 보이게 한다(2026-11-12) */
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]});}
  function fill(t,who){return String(t).replace(/\{who\}/g, who||'우리 동네');}
  function cfg(kind){return K[kind]||K.lg;}
  window.KB_loader=function(kind,o){
    o=o||{}; var c=cfg(kind), who=o.who||'', steps=(o.steps||c.steps).map(function(t){return fill(t,who);});
    var prop=P[c.prop]||P.book, props='';
    for(var i=0;i<4;i++) props+='<i aria-hidden="true">'+prop+'</i>';
    return '<div class="kbl" role="status" aria-live="polite" data-kind="'+esc(kind)+'" data-steps="'+esc(JSON.stringify(steps))+'" data-src="'+esc(o.src||c.src)+'" data-t0="'+Date.now()+'">'
      +'<img class="kbl-bomi" src="'+B+'pose_'+c.pose+'.webp" alt="" width="120" height="166" decoding="async">'
      +'<div class="kbl-props">'+props+'</div>'
      +'<p class="kbl-msg"><b class="kbl-t">'+esc(steps[0])+'</b><span class="kbl-src">'+esc(o.src||c.src)+'</span></p>'
      +'<div class="kbl-bar" aria-hidden="true"><i></i></div>'
      +'<p class="kbl-slow">평소보다 오래 걸려요. '+esc(o.src||c.src)+' 쪽 응답을 기다리는 중입니다. 그대로 두시면 이어서 보여 드립니다.</p>'
      +'</div>';
  };
  window.KB_loaderMini=function(kind,text){
    var c=cfg(kind);
    return '<span class="kbl-mini" role="status"><svg class="kbl-mag" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="#F5F0E4" stroke="#C99A2E" stroke-width="2.6"/><path d="M15 15l5.5 5.5" stroke="#9C7520" stroke-width="3" stroke-linecap="round"/></svg>'+esc(text||cfg(kind).steps[0].replace('{who}','우리 동네'))+'</span>';
  };
  /* 모든 큰 표시의 단계 문구를 차례로 넘기고, 오래 걸리면 안내를 붙인다 */
  setInterval(function(){
    var now=Date.now();
    document.querySelectorAll('.kbl').forEach(function(el){
      var st; try{ st=JSON.parse(el.getAttribute('data-steps')); }catch(e){ return; }
      var n=+(el.getAttribute('data-i')||0);
      if(n<st.length-1){ n++; el.setAttribute('data-i',n); var t=el.querySelector('.kbl-t'); if(t) t.textContent=st[n]; }
      var t0=+el.getAttribute('data-t0'); if(!t0){ t0=Math.round((window.performance&&performance.timeOrigin)||now); el.setAttribute('data-t0',t0); }  /* 정적 HTML로 미리 넣은 표시는 페이지를 연 때부터 잰다 */
      if(now-t0>SLOW) el.classList.add('is-slow');
    });
  },TICK);
  /* 2026-11-12 큰 표시가 너무 빨리 지나가지 않게: 자료가 2초 안에 도착해 표시가 지워지면,
     지워진 표시를 그 자리 위에 덮개로 잠깐 더 보여 주고(새 화면은 그 아래에 이미 그려져 있다) 2초가 차면 걷는다.
     다른 '불러오는 중' 표시로 바뀌는 경우와 작은 표시(.kbl-mini)는 그대로 둔다. */
  function bgOf(el){ for(var e=el;e&&e.nodeType===1;e=e.parentElement){ var c=getComputedStyle(e).backgroundColor; if(c&&c!=='transparent'&&!/rgba\([^)]*,\s*0\)$/.test(c)) return c; } return '#fff'; }
  function hold(node,host,left){
    if(!host||!host.isConnected||host.querySelector('.kbl-hold')) return;
    var cs=getComputedStyle(host), fixPos=cs.position==='static';
    if(fixPos) host.style.position='relative';
    var ov=document.createElement('div'); ov.className='kbl-hold';
    ov.style.cssText='position:absolute;left:0;right:0;top:0;min-height:100%;z-index:50;background:'+bgOf(host)+';transition:opacity .2s ease';
    node.setAttribute('data-held','1'); ov.appendChild(node); host.appendChild(ov);
    var mh=host.style.minHeight; if(host.offsetHeight<ov.offsetHeight) host.style.minHeight=ov.offsetHeight+'px';
    setTimeout(function(){ ov.style.opacity='0'; setTimeout(function(){ if(ov.parentNode) ov.parentNode.removeChild(ov); if(fixPos) host.style.position=''; host.style.minHeight=mh; },220); },left);
  }
  if(window.MutationObserver){
    new MutationObserver(function(list){
      var now=Date.now();
      for(var i=0;i<list.length;i++){ var m=list[i]; if(!m.removedNodes.length) continue;
        var addsLoader=false, j;
        for(j=0;j<m.addedNodes.length;j++){ var a=m.addedNodes[j]; if(a.nodeType===1&&(a.classList.contains('kbl-hold')||a.classList.contains('kbl')||a.querySelector('.kbl'))) addsLoader=true; }
        if(addsLoader) continue;
        for(j=0;j<m.removedNodes.length;j++){ var n=m.removedNodes[j]; if(n.nodeType!==1||n.classList.contains('kbl-hold')||n.getAttribute('data-held')) continue;
          var k=n.classList.contains('kbl')?n:n.querySelector('.kbl'); if(!k) continue;
          if(n!==k&&n.children.length!==1) continue;                       /* 표시만 담은 껍데기(.wrap)일 때만 */
          var t0=+k.getAttribute('data-t0')||Math.round((window.performance&&performance.timeOrigin)||now), left=MIN-(now-t0);
          if(left>60) hold(n,m.target,left);
          break;
        }
      }
    }).observe(document.documentElement,{childList:true,subtree:true});
  }
})();
