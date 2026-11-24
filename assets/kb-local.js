/* 지역 탐방 쪽 공용 스크립트 — 맛집 순위·낱말 검색·지도·해시태그 복사. 인증키는 서버(/api/local)에만 있다. */
(function () {
  var root = document.getElementById('lx-main'); if (!root) return;
  var D = {}; try { D = JSON.parse(document.getElementById('lx-data').textContent); } catch (e) {}
  var REGION = D.region || '', NAME = D.name || '';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function safeUrl(u) { return /^https?:\/\//.test(String(u || '')) ? String(u) : '#'; }
  function toast(t) { var d = document.createElement('div'); d.className = 'lx-toast'; d.setAttribute('role', 'status'); d.textContent = t; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2200); }
  function api(q) { return fetch('/api/local?region=' + encodeURIComponent(REGION) + '&' + q).then(function (r) { return r.json(); }); }
  function cat(c) { var a = String(c || '').split('>'); return a[a.length - 1].trim(); }

  function rankGoogle(el, v) {
    if (!v || !v.ok || !v.items.length) { el.innerHTML = '<p class="lx-msg">' + esc(v && v.reason ? v.reason : '평점 자료를 불러오지 못했습니다') + '. 아래 「동네 맛집」 목록을 보세요.</p>'; return; }
    el.innerHTML = '<ol class="lx-rank">' + v.items.slice(0, 10).map(function (x) {
      return '<li><span><a href="' + esc(safeUrl(x.url)) + '" target="_blank" rel="noopener">' + esc(x.name) + '</a><small>' + esc(x.type || '') + (x.address ? ' · ' + esc(String(x.address).replace(/^대한민국\s*/, '')) : '') + '</small></span><span class="sc">★ ' + esc(x.rating) + ' · 리뷰 ' + Number(x.reviews || 0).toLocaleString('ko-KR') + '</span></li>';
    }).join('') + '</ol>';
  }
  function rankKakao(el, v, n) {
    if (!v || !v.ok || !v.items.length) { el.innerHTML = '<p class="lx-msg">' + esc(v && v.reason ? v.reason : '찾은 곳이 없습니다') + '</p>'; return; }
    el.innerHTML = '<ol class="lx-rank">' + v.items.slice(0, n || 10).map(function (x) {
      return '<li><span><a href="' + esc(safeUrl(x.url)) + '" target="_blank" rel="noopener">' + esc(x.name) + '</a><small>' + esc(cat(x.category)) + (x.address ? ' · ' + esc(x.address) : '') + '</small></span><span class="sc">' + (x.phone ? esc(x.phone) : '') + '</span></li>';
    }).join('') + '</ol>';
    v.items.slice(0, 15).forEach(function (x) { if (x.x && x.y) PINS.push({ t: x.name, x: x.x, y: x.y, u: x.url }); });
    if (MAP) drawPins();
  }
  var PINS = (D.pins || []).slice(), MAP = null, MARKS = [];

  /* 처음 불러오기 */
  api('type=google,food,spots,minutes').then(function (j) {
    rankGoogle($('lx-google'), j.google); rankKakao($('lx-food'), j.food, 10); rankKakao($('lx-spots'), j.spots, 10);
    var m = j.minutes, el = $('lx-min');
    if (el) {
      if (!m || !m.ok || !m.items.length) el.innerHTML = '<p class="lx-msg">' + esc(m && m.reason ? m.reason : '회의록을 찾지 못했습니다') + '</p>';
      else el.innerHTML = '<ol class="lx-rank">' + m.items.slice(0, 8).map(function (x) {
        return '<li><span><a href="https://clik.nanet.go.kr/potal/search/searchView.do?collection=minutes&DOCID=' + encodeURIComponent(x.docid || '') + '" target="_blank" rel="noopener">' + esc(x.meeting || '회의') + '</a><small>' + esc(x.council || '') + (x.session ? ' · 제' + esc(x.session) + '회' : '') + '</small></span><span class="sc">' + esc(x.date || '') + '</span></li>';
      }).join('') + '</ol>';
    }
  }).catch(function () { ['lx-google', 'lx-food', 'lx-spots', 'lx-min'].forEach(function (id) { var e = $(id); if (e) e.innerHTML = '<p class="lx-msg">지금은 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.</p>'; }); });

  /* 낱말 검색 */
  function find(word) {
    word = String(word || '').replace(/[^0-9A-Za-z가-힣 ]/g, '').trim().slice(0, 20); if (!word) return;
    var box = $('lx-res'), sec = $('lx-ressec'); sec.hidden = false;
    $('lx-resh').textContent = NAME + '에서 찾은 「' + word + '」';
    box.innerHTML = '<p class="lx-msg">찾는 중…</p>';
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.querySelectorAll('.lx-chips button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.q === word ? 'true' : 'false'); });
    try { history.replaceState(null, '', location.pathname + '?q=' + encodeURIComponent(word)); } catch (e) {}
    api('type=search&q=' + encodeURIComponent(word)).then(function (j) {
      rankKakao(box, j.search, 20);
      $('lx-resmore').href = 'https://map.kakao.com/?q=' + encodeURIComponent(REGION + ' ' + word);
    }).catch(function () { box.innerHTML = '<p class="lx-msg">지금은 찾지 못했습니다.</p>'; });
  }
  var f = $('lx-find'); if (f) f.addEventListener('submit', function (e) { e.preventDefault(); find($('lx-q').value); });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-q]'); if (b) { e.preventDefault(); var i = $('lx-q'); if (i) i.value = b.dataset.q; find(b.dataset.q); return; }
    if (e.target.closest('#lx-copy')) { var t = (D.tags || []).join(' '); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('해시태그를 복사했습니다'); }).catch(function () { toast(t); }); return; }
    if (e.target.closest('#lx-share')) { var s = { title: document.title, url: location.href.split('?')[0] }; if (navigator.share) navigator.share(s).catch(function () {}); else (navigator.clipboard ? navigator.clipboard.writeText(s.url) : Promise.reject()).then(function () { toast('주소를 복사했습니다'); }).catch(function () {}); }
  });
  var q0 = new URLSearchParams(location.search).get('q'); if (q0) { var i0 = $('lx-q'); if (i0) i0.value = q0; find(q0); }

  /* 지도 — 화면에 들어올 때만 카카오 지도 SDK를 부른다. 실패하면 지도 칸을 숨긴다. */
  function drawPins() {
    if (!MAP || !window.kakao) return; var k = window.kakao.maps, bd = new k.LatLngBounds(), n = 0;
    MARKS.forEach(function (m) { m.setMap(null); }); MARKS = [];
    var iw = new k.InfoWindow({ removable: true });
    PINS.forEach(function (p) {
      var x = Number(p.x), y = Number(p.y); if (!x || !y) return;
      var pos = new k.LatLng(y, x), mk = new k.Marker({ position: pos, map: MAP, title: p.t }); MARKS.push(mk); bd.extend(pos); n++;
      k.event.addListener(mk, 'click', function () { var d = document.createElement('div'); d.style.cssText = 'padding:8px 12px;font-size:13px;color:#1B2230;white-space:nowrap'; d.textContent = p.t; iw.setContent(d); iw.open(MAP, mk); });
    });
    if (n) MAP.setBounds(bd);
  }
  var mapEl = $('lx-map');
  if (mapEl && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return; io.disconnect();
      fetch('/api/local?config=1').then(function (r) { return r.json(); }).then(function (c) {
        if (!c.kakaoJsKey) throw 0;
        var s = document.createElement('script'); s.src = 'https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&appkey=' + encodeURIComponent(c.kakaoJsKey);
        s.onload = function () { window.kakao.maps.load(function () { MAP = new window.kakao.maps.Map(mapEl, { center: new window.kakao.maps.LatLng(36.4, 127.8), level: 9 }); drawPins(); }); };
        s.onerror = function () { $('lx-mapsec').hidden = true; };
        document.head.appendChild(s);
      }).catch(function () { $('lx-mapsec').hidden = true; });
    }, { rootMargin: '300px' });
    io.observe(mapEl);
  } else if (mapEl) { $('lx-mapsec').hidden = true; }
})();
