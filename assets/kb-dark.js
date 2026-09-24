/* 김보미.com — 다크 모드 전용 색 입히기 (2026-09-24)
   예전 방식(kb-dark.css의 화면 반전)은 남색 표지가 하늘색이 되는 등 브랜드 색이 뒤집혔다.
   이 스크립트는 반전 대신 요소마다 실제 색을 읽어 바꾼다.
     · 밝고 채도 낮은 바탕(흰색·크림·옅은 틴트)  → 어두운 바탕 (흰 카드가 페이지보다 한 단계 밝게)
     · 이미 어두운 바탕(남색 표지·초록 버튼)과 채도 높은 바탕(노란 버튼) → 그대로
     · 글자: 바뀐 바탕 위에서 대비가 4.5 미만이면 같은 색조로 밝기만 뒤집음
     · 옅은 테두리 → 어두운 테두리 / 그라데이션 안의 밝은 색도 같은 규칙
   사진·영상·아이콘 그림은 건드리지 않는다. 밝게 모드로 돌아가면 바꾼 값을 모두 원래대로 되돌린다.
   [한계] 바뀐 요소는 마우스를 올렸을 때의 바탕색 변화(hover)가 약해질 수 있다. */
(function(){
  var H=document.documentElement, ON=false, busy=false, MO=null;
  var SKIP='script,style,svg,svg *,img,video,iframe,canvas,picture,#kbPrefs,#kbPrefs *,#bomi,#bomi *,#bomi-fab,#bomi-fab *';
  function parse(c){ var m=/rgba?\(([^)]+)\)/.exec(c||''); if(!m) return null; var p=m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}; }
  function hsl(c){ var r=c.r/255,g=c.g/255,b=c.b/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,h=0,s=0; if(mx!==mn){ var d=mx-mn; s=l>.5?d/(2-mx-mn):d/(mx+mn); h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4; h/=6; } return {h:h,s:s,l:l}; }
  function rgbOf(h,s,l,a){ function f(p,q,t){ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6) return p+(q-p)*6*t; if(t<1/2) return q; if(t<2/3) return p+(q-p)*(2/3-t)*6; return p; }
    var r,g,b; if(!s){ r=g=b=l; } else { var q=l<.5?l*(1+s):l+s-l*s, p=2*l-q; r=f(p,q,h+1/3); g=f(p,q,h); b=f(p,q,h-1/3); }
    return 'rgba('+Math.round(r*255)+','+Math.round(g*255)+','+Math.round(b*255)+','+(a==null?1:a)+')'; }
  function lum(c){ function ch(v){ v/=255; return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4); } return .2126*ch(c.r)+.7152*ch(c.g)+.0722*ch(c.b); }
  function contrast(a,b){ var x=lum(a),y=lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
  /* 밝고 채도 낮은 바탕 → 어둡게. 흰색(l=1)이 가장 밝은 어두운 면(카드), 크림·틴트는 조금 더 어둡게. */
  function darkBg(c){ var k=hsl(c); if(k.l<.62) return null; if(k.s>.55&&k.l<.9) return null; var L=Math.max(.075,.135-(1-k.l)*.55); return rgbOf(k.h,Math.min(k.s,.22),L,c.a); }
  function darkLine(c){ var k=hsl(c); if(k.l<.6) return null; return rgbOf(k.h,Math.min(k.s,.18),.24,c.a); }
  function fixText(c,bg){ var c0=contrast(c,bg); if(c0>=4.5) return null; var k=hsl(c), dark=lum(bg)<.2;
    var L=dark?Math.max(.8,1-k.l*.55):Math.min(.25,k.l*.4); var out=rgbOf(k.h,Math.min(k.s,.6),L,c.a);
    return contrast(parse(out),bg)>c0+.5?out:null; }   /* 바꿔서 더 나빠지거나 거의 같으면 원래 색 유지 */
  function setP(el,prop,val){ if(!el.__kbd){ el.__kbd=el.getAttribute('style'); el.setAttribute('data-kbd',''); } el.style.setProperty(prop,val,'important'); }
  function effBg(el){ while(el&&el!==document.documentElement){ var c=parse(getComputedStyle(el).backgroundColor); if(c&&c.a>.5) return c; el=el.parentElement; } return {r:20,g:21,b:18,a:1}; }
  var NOTR=null;
  function paint(root){
    /* 전환 효과(transition)가 있으면 바꾼 직후 색이 중간값으로 읽혀 글자 판단이 틀어진다 → 칠하는 동안만 끈다 */
    if(!NOTR){ NOTR=document.createElement('style'); NOTR.textContent='*,*::before,*::after{transition:none!important}'; }
    document.head.appendChild(NOTR);
    try{ paint0(root); } finally { setTimeout(function(){ if(NOTR.parentNode) NOTR.parentNode.removeChild(NOTR); },0); }
  }
  function paint0(root){
    var all=[root].concat([].slice.call(root.querySelectorAll('*')));
    /* 1단계: 바탕·테두리·그라데이션 */
    all.forEach(function(el){ if(el.nodeType!==1||el.matches(SKIP)) return; var s=getComputedStyle(el);
      var bg=parse(s.backgroundColor); if(bg&&bg.a>.05){ var nb=darkBg(bg); if(nb) setP(el,'background-color',nb); }
      var bi=s.backgroundImage; if(bi&&bi!=='none'&&/gradient/.test(bi)&&!/url\(/.test(bi)){ var ch=false; var out=bi.replace(/rgba?\([^)]+\)/g,function(m){ var c=parse(m), n=c&&darkBg(c); if(n){ ch=true; return n; } return m; }); if(ch) setP(el,'background-image',out); }
      ['Top','Right','Bottom','Left'].forEach(function(sd){ if(parseFloat(s['border'+sd+'Width'])>0){ var bc=parse(s['border'+sd+'Color']); var nl=bc&&darkLine(bc); if(nl) setP(el,'border-'+sd.toLowerCase()+'-color',nl); } });
    });
    /* 2단계: 글자 — 바뀐 바탕 위에서 대비가 모자라면 밝기 뒤집기 */
    all.forEach(function(el){ if(el.nodeType!==1||el.matches(SKIP)) return; var has=false; for(var n=el.firstChild;n;n=n.nextSibling){ if(n.nodeType===3&&n.textContent.trim()){ has=true; break; } } if(!has&&!/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName)) return;
      var s=getComputedStyle(el), c=parse(s.color); if(!c) return; var nc=fixText(c,effBg(el)); if(nc) setP(el,'color',nc); });
  }
  function clear(){ [].slice.call(document.querySelectorAll('[data-kbd]')).forEach(function(el){ var o=el.__kbd; if(o==null) el.removeAttribute('style'); else el.setAttribute('style',o); el.removeAttribute('data-kbd'); el.__kbd=undefined; }); }
  function run(){ var dark=H.getAttribute('data-theme')==='dark';
    if(dark&&!ON){ ON=true; H.classList.add('kb-smart'); busy=true; try{ paint(document.body); }catch(e){} busy=false;
      if(window.MutationObserver&&!MO){ var t=null, q=[]; MO=new MutationObserver(function(ms){ if(busy||!ON) return; ms.forEach(function(m){ [].forEach.call(m.addedNodes,function(n){ if(n.nodeType===1) q.push(n); }); }); if(!q.length) return; clearTimeout(t); t=setTimeout(function(){ busy=true; var list=q.splice(0); try{ list.forEach(function(n){ if(document.body.contains(n)) paint(n); }); }catch(e){} busy=false; },120); }); MO.observe(document.body,{childList:true,subtree:true}); } }
    else if(!dark&&ON){ ON=false; clear(); H.classList.remove('kb-smart'); } }
  function start(){ run(); new MutationObserver(run).observe(H,{attributes:true,attributeFilter:['data-theme']}); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
