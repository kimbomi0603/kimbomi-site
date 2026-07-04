/* 김보미.com — first-party analytics collector (privacy-safe, no cookies/PII) */
(function(){
  try{
    var EP = '/api/track';
    var host = location.host;
    /* 내 방문 제외: ?notrack=1 로 한 번 접속하면 이 브라우저는 이후 집계 제외 (?notrack=0 으로 해제) */
    try{
      var _nt = new URLSearchParams(location.search);
      if (_nt.has('notrack')) { if (_nt.get('notrack') === '0') localStorage.removeItem('kb_notrack'); else localStorage.setItem('kb_notrack','1'); }
    }catch(e){}
    try{ if (localStorage.getItem('kb_notrack') === '1') return; }catch(e){}
    function send(ev){
      try{
        var payload = JSON.stringify({ e:[ev] });
        if (navigator.sendBeacon){
          navigator.sendBeacon(EP, new Blob([payload], {type:'application/json'}));
        } else {
          fetch(EP, {method:'POST', headers:{'Content-Type':'application/json'}, body:payload, keepalive:true});
        }
      }catch(e){}
    }
    // device class
    var dev = (window.matchMedia && window.matchMedia('(max-width:820px)').matches) ? 'm' : 'd';
    // utm
    var q = new URLSearchParams(location.search);
    var utm = q.get('utm_source') || '';
    if (utm && q.get('utm_medium')) utm += '/' + q.get('utm_medium');
    // session entry flag (first page of a session)
    var entry = '0';
    try { if (!sessionStorage.getItem('kb_sess')) { sessionStorage.setItem('kb_sess','1'); entry = '1'; } } catch(e){}
    // pageview
    send({ ty:'pv', p:location.pathname, r:document.referrer || '', u:utm, d:dev, en:entry });
    // click tracking: menu clicks + outbound links
    document.addEventListener('click', function(e){
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      var isOut = false, oh = '';
      if (/^https?:\/\//i.test(href)) {
        try { var u = new URL(href); if (u.host && u.host !== host) { isOut = true; oh = u.host.replace(/^www\./,''); } } catch(_){}
      }
      if (isOut) {
        send({ ty:'out', p:location.pathname, m:oh, d:dev });
      } else {
        var inMenu = a.closest && a.closest('#menu, .menu, footer, .g365-nav, .g365-drawer');
        if (inMenu) {
          var lbl = (a.textContent || '').trim().replace(/\s+/g,' ').slice(0,40);
          if (lbl) send({ ty:'menu', p:location.pathname, m:lbl, d:dev });
        }
      }
    }, true);
  }catch(e){}
})();
