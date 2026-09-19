/* ============================================================
   우리동네365 — "튼튼하게 빌드업 중" 안내 오버레이 (3D 저폴리 집짓기 애니메이션)
   - 페이지 로드 시 모달로 뜬다. [둘러보기 계속] 닫기, [오늘 하루 보지 않기] localStorage.
   - three.js(cdnjs)를 지연 로드. 로드 실패·prefers-reduced-motion 이면 CSS 정지 그림으로 대체.
   - 외부 데이터 없음. 사이트 수치와 무관한 순수 안내 장치.
   사용: <script defer src="/assets/ud365-buildup.js"></script>
   ============================================================ */
(function(){
  var KEY='ud365-buildup-hide-until';
  try{ var until=Number(localStorage.getItem(KEY)||0); if(until&&Date.now()<until) return; }catch(e){}
  var reduce=false; try{ reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
  var css='\
#ud365bu{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,32,.72);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);font-family:"IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#1B2430}\
#ud365bu .bx{position:relative;width:min(560px,100%);background:#F6F7F4;border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.45);overflow:hidden}\
#ud365bu .st{position:relative;height:280px;background:linear-gradient(180deg,#DCEBE6 0%,#F6F7F4 100%)}\
#ud365bu canvas{display:block;width:100%;height:100%}\
#ud365bu .tx{padding:18px 22px 20px}\
#ud365bu .eb{font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.14em;color:#2F7F72;text-transform:uppercase}\
#ud365bu h2{margin:4px 0 8px;font-family:"Gowun Batang","Nanum Myeongjo",serif;font-size:24px;line-height:1.3;color:#1B2430}\
#ud365bu p{margin:0 0 12px;font-size:14px;line-height:1.65;color:#4A5563;word-break:keep-all}\
#ud365bu .pb{height:8px;background:#E3E7E0;border-radius:4px;overflow:hidden;margin:6px 0 14px}\
#ud365bu .pb i{display:block;height:100%;width:38%;background:linear-gradient(90deg,#2F7F72,#3B6EA8);border-radius:4px;animation:ud365pb 2.4s ease-in-out infinite alternate}\
@keyframes ud365pb{from{width:34%}to{width:62%}}\
#ud365bu .bt{display:flex;flex-wrap:wrap;gap:8px;align-items:center}\
#ud365bu button{font-family:inherit;font-size:14px;font-weight:700;padding:10px 16px;border-radius:9px;cursor:pointer;border:1px solid #1B2430;background:#1B2430;color:#F6F7F4}\
#ud365bu button.g{background:transparent;color:#1B2430}\
#ud365bu button:focus-visible{outline:2px solid #2F7F72;outline-offset:2px}\
#ud365bu .x{position:absolute;top:10px;right:12px;border:0;background:rgba(255,255,255,.7);color:#1B2430;width:34px;height:34px;border-radius:50%;font-size:20px;line-height:1;padding:0}\
#ud365bu .stat{position:absolute;left:14px;bottom:10px;font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace;font-size:11px;color:#1E5C52;background:rgba(255,255,255,.75);padding:3px 8px;border-radius:6px}\
#ud365bu .fb{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:18px}\
#ud365bu .fb svg{width:260px;height:200px}\
@media (max-width:480px){#ud365bu .st{height:220px}#ud365bu h2{font-size:20px}}';
  var st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
  var wrap=document.createElement('div'); wrap.id='ud365bu'; wrap.setAttribute('role','dialog'); wrap.setAttribute('aria-modal','true'); wrap.setAttribute('aria-labelledby','ud365bu-h');
  wrap.innerHTML='<div class="bx"><div class="st"><canvas id="ud365c" aria-hidden="true"></canvas><div class="stat" id="ud365s">기초 다지는 중…</div><button class="x" aria-label="닫기">×</button></div>'+
    '<div class="tx"><div class="eb">우리동네365 · 새로 열린 화면</div><h2 id="ud365bu-h">이제 나라 살림도 함께 봅니다</h2>'+
    '<p>지방정부 243곳에 더해 중앙정부 62개 부처의 예산을 같은 화면에서 볼 수 있게 했습니다. 부처를 고르면 올해 어떤 사업에 얼마를 쓰는지 세부사업 9,154건이 한 줄씩 나옵니다. 지방은 지방재정365와 나라장터, 중앙은 열린재정 공식 공개자료를 원자료와 대조해 실었고, 정부가 공개하지 않은 금액은 채우지 않고 비워 둡니다.</p>'+
    '<div class="pb"><i></i></div><div class="bt"><button id="ud365go">나라 살림 보러 가기 →</button><button class="g" id="ud365hide">오늘 하루 보지 않기</button></div></div></div>';
  document.body.appendChild(wrap);
  var prevOverflow=document.body.style.overflow; document.body.style.overflow='hidden';
  function close(){ try{ if(wrap._raf) cancelAnimationFrame(wrap._raf); }catch(e){} wrap.remove(); document.body.style.overflow=prevOverflow; }
  wrap.querySelector('.x').onclick=close; document.getElementById('ud365go').onclick=function(){ close(); location.href='budget365.html#/gov'; };
  document.getElementById('ud365hide').onclick=function(){ try{ localStorage.setItem(KEY,String(Date.now()+86400000)); }catch(e){} close(); };
  wrap.addEventListener('click',function(e){ if(e.target===wrap) close(); });
  document.addEventListener('keydown',function onk(e){ if(e.key==='Escape'){ close(); document.removeEventListener('keydown',onk); } });
  setTimeout(function(){ try{ document.getElementById('ud365go').focus(); }catch(e){} },50);

  /* ── 정지 그림 대체(모션 축소·three.js 실패) ── */
  function fallback(){
    var c=document.getElementById('ud365c'); if(c) c.remove();
    var fb=document.createElement('div'); fb.className='fb';
    fb.innerHTML='<svg viewBox="0 0 260 200" aria-hidden="true"><rect x="40" y="150" width="180" height="16" fill="#8A7A5A"/><rect x="70" y="90" width="120" height="60" fill="#E8E4D8" stroke="#B5A57F"/><polygon points="60,92 130,40 200,92" fill="#2F7F72"/><rect x="118" y="115" width="24" height="35" fill="#3B6EA8"/><rect x="82" y="102" width="20" height="18" fill="#DCEBE6"/><rect x="158" y="102" width="20" height="18" fill="#DCEBE6"/><rect x="205" y="60" width="6" height="90" fill="#B8741F"/><rect x="150" y="56" width="61" height="6" fill="#B8741F"/><line x1="180" y1="62" x2="180" y2="84" stroke="#4A5563" stroke-width="2"/><rect x="170" y="84" width="20" height="12" fill="#A83E36"/></svg>';
    document.querySelector('#ud365bu .st').insertBefore(fb, document.getElementById('ud365s'));
    document.getElementById('ud365s').textContent='재정주권 쌓는 중';
  }
  if(reduce){ fallback(); return; }

  /* ── three.js 저폴리 집짓기 ── */
  var s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js';
  s.onerror=fallback;
  s.onload=function(){
    try{
      var T=window.THREE; if(!T) return fallback();
      var canvas=document.getElementById('ud365c'); var stEl=document.querySelector('#ud365bu .st');
      var W=stEl.clientWidth, H=stEl.clientHeight;
      var renderer=new T.WebGLRenderer({canvas:canvas,antialias:true,alpha:true}); renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1)); renderer.setSize(W,H,false);
      renderer.shadowMap.enabled=true;
      var scene=new T.Scene();
      var cam=new T.PerspectiveCamera(38,W/H,.1,100); cam.position.set(5.2,3.9,6.0); cam.lookAt(0,1.4,0);
      scene.add(new T.HemisphereLight(0xffffff,0xcfd8c9,1.1));
      var sun=new T.DirectionalLight(0xffffff,1.1); sun.position.set(5,8,4); sun.castShadow=true; sun.shadow.mapSize.set(1024,1024); scene.add(sun);
      var M=function(c){ return new T.MeshStandardMaterial({color:c,roughness:.75,metalness:.05}); };
      var ground=new T.Mesh(new T.CylinderGeometry(4.2,4.2,.3,40),M(0xdcebe6)); ground.position.y=-.15; ground.receiveShadow=true; scene.add(ground);
      var house=new T.Group(); scene.add(house);
      function box(w,h,d,c,x,y,z){ var m=new T.Mesh(new T.BoxGeometry(w,h,d),M(c)); m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; m.userData.y=y; return m; }
      /* 부재 목록: 순서대로 하늘에서 내려와 제자리에 놓인다 */
      var parts=[];
      parts.push(box(3.4,.3,2.8,0x8a7a5a,0,.15,0));                       // 기초
      for(var i=0;i<4;i++) parts.push(box(3.0,.5,2.4,0xe8e4d8,0,.55+i*.5,0)); // 벽 4단
      parts.push(box(.6,.9,.08,0x3b6ea8,0,.75,1.24));                     // 문
      parts.push(box(.6,.5,.08,0xbfe0ff,-.95,1.4,1.24)); parts.push(box(.6,.5,.08,0xbfe0ff,.95,1.4,1.24)); // 창
      var roof=new T.Mesh(new T.ConeGeometry(2.25,1.3,4),M(0x2f7f72)); roof.rotation.y=Math.PI/4; roof.position.y=3.2; roof.castShadow=true; roof.userData.y=3.2; parts.push(roof);
      parts.push(box(.35,.7,.35,0xa83e36,.8,3.6,-.4));                    // 굴뚝
      parts.forEach(function(p){ p.visible=false; house.add(p); });
      /* 크레인 */
      var crane=new T.Group(); crane.add(box(.18,5.2,.18,0xb8741f,3.2,2.6,-1.2)); var jib=box(4.6,.14,.14,0xb8741f,1.0,5.2,-1.2); crane.add(jib);
      var cable=new T.Mesh(new T.CylinderGeometry(.015,.015,1,6),M(0x4a5563)); crane.add(cable); var hook=box(.22,.16,.22,0x4a5563,0,0,0); crane.add(hook); scene.add(crane);
      /* 안전모 인부 2명(원통+구) */
      function worker(x,z,c){ var g=new T.Group(); var b=new T.Mesh(new T.CylinderGeometry(.16,.2,.55,10),M(c)); b.position.y=.28; var h=new T.Mesh(new T.SphereGeometry(.15,12,10),M(0xf1d1b0)); h.position.y=.68; var hat=new T.Mesh(new T.SphereGeometry(.17,12,8,0,Math.PI*2,0,Math.PI/2),M(0xf2c14e)); hat.position.y=.7; g.add(b,h,hat); g.position.set(x,0,z); return g; }
      var w1=worker(-2.3,1.6,0x3b6ea8), w2=worker(2.2,1.9,0x2f7f72); scene.add(w1,w2);
      var labels=['국민주권 기초 다지는 중…','재정주권 쌓는 중…','투명한 예산 벽 올리는 중…','집행 내역 한 층 더…','계약 내역 한 층 더…','시민 참여의 문 다는 중…','예산 들여다볼 창 내는 중…','집행 들여다볼 창 내는 중…','검증의 지붕 얹는 중…','출처·기준일 굴뚝 세우는 중…','점검 중… 곧 다시 짓습니다'];
      var idx=0, t0=performance.now(), DUR=900, PAUSE=1600, phase='drop', cur=null;
      function next(){ if(idx>=parts.length){ phase='hold'; t0=performance.now(); document.getElementById('ud365s').textContent=labels[10]; return; } cur=parts[idx]; cur.visible=true; cur.position.y=cur.userData.y+4.5; cur.position.x=cur.position.x; phase='drop'; t0=performance.now(); document.getElementById('ud365s').textContent=labels[idx]||''; }
      next();
      function ease(t){ return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2; }
      var ang=0;
      function frame(now){
        wrap._raf=requestAnimationFrame(frame);
        var el=now-t0;
        if(phase==='drop'&&cur){ var k=Math.min(1,el/DUR); cur.position.y=cur.userData.y+4.5*(1-ease(k)); if(k>=1){ phase='pause'; t0=now; } }
        else if(phase==='pause'){ if(el>PAUSE*.35){ idx++; next(); } }
        else if(phase==='hold'){ if(el>PAUSE*2){ parts.forEach(function(p){p.visible=false;}); idx=0; next(); } }
        /* 크레인 케이블·훅이 현재 부재를 따라간다 */
        var target=cur&&phase==='drop'?cur.position:new T.Vector3(0,3.6,0); cable.position.set(target.x,(5.2+target.y+.3)/2,target.z); cable.scale.y=Math.max(.1,5.2-target.y-.3); hook.position.set(target.x,target.y+.3+.1,target.z);
        ang+=.0035; house.rotation.y=Math.sin(ang)*.35; w1.position.y=Math.abs(Math.sin(now/300))*.06; w2.position.y=Math.abs(Math.sin(now/260+1))*.06;
        renderer.render(scene,cam);
      }
      wrap._raf=requestAnimationFrame(frame);
      window.addEventListener('resize',function(){ if(!document.getElementById('ud365c')) return; var W2=stEl.clientWidth,H2=stEl.clientHeight; renderer.setSize(W2,H2,false); cam.aspect=W2/H2; cam.updateProjectionMatrix(); });
    }catch(e){ fallback(); }
  };
  document.head.appendChild(s);
})();
