/* kb-thumbs.js — 김보미생각 글마다 제목의 요지를 담아 따로 만든 미니어처 이미지를 쓴다 (2026.11, Gemini 생성)
   글 id로 img/posts/{id}.webp 를 찾고, 아직 이미지가 없는 새 글은 제목으로 주제별 이미지를 고른다. */
(function () {
  var T = [
    { re: /돈잔치|국고보조금|보조금|깜깜이|위성정당/, tag: '정당 돈', img: 'scene-money', alt: '커튼 뒤 돈자루를 비추는 시민들 미니어처' },
    { re: /후원|기탁금|커피|확성기|511만/, tag: '후원', img: 'th-donate', alt: '응원이 모이는 후원 미니어처' },
    { re: /청년|2030|세대교체|686|취업|박지현|하우스|주거|수도관/, tag: '청년', img: 'th-youth', alt: '계단을 오르는 청년들 미니어처' },
    { re: /연설|정견|선언|토론|대담|간담회|홍대|질의|외쳤/, tag: '연설·토론', img: 'th-speech', alt: '연설대 앞에 모인 청중 미니어처' },
    { re: /컷오프|공천|경선|여론조사|선호투표|최고위원회|당원존|특혜존|공정|흥신소|규칙/, tag: '공천·경선', img: 'th-fair', alt: '투표함과 저울 앞에 줄 선 시민들 미니어처' },
    { re: /호남|추석|명절|연휴|근황|강진|고향/, tag: '호남·근황', img: 'th-home', alt: '보름달 아래 고향 마을 미니어처' },
    { re: /축하|당선|환영|선물|감사|퇴장|싱어게인|중꺾마|꺾이지/, tag: '축하·인사', img: 'th-cheer', alt: '환호하는 전당대회장 미니어처' }
  ];
  var OWN = {};
  'fb20260923 fb20260924 msg1 msg2 p20260723cutoff p20260725column p20260725roster p20260730myungbu p20260731bosu p20260805choi p20260805ggumtl p20260805vote p20260806hate p20260807gongcheon p20260808house p20260811honam p20260818congrats p20260821jeon p20260905jeongdang pmr7panre93yn pmr8pemv03536 pmrbpm1f3basw pmrbpocpi6co3 pmrbppgfuxy3k pmrbpqs35agcr pmrbwxrflw71s pmrbwyoy3dcv5 pmrev7iihexle pmrfskxvo2lrn pmrfv6kdo88wa pmrhx48j9sfat pmrhxcbpia2u3 pmriu965ls855 pmrlnapghvgve pmrlncnrzw9ww pmro53ph5payp pmrplk7wjaiqq pmrpllai76rej pmrqh15wvgxyr pmrrfrezv01bl pmrubeq3lp07y pmrubf7md1b87 pmrubfxo5zsd5 pmrubgqunfyuc pmrubhbyfremv pmrubhsuwzo1b pmrubib71aeb0 pmrubj97lyvt5 pmrx12rismzyw pmrx13ojvehdw pmrx14z218rsn pmrx16ngsknrx pmte274174vpm pmtj82na5ulu2'.split(' ').forEach(function (k) { OWN[k] = 1; });
  var DEF = { tag: '정당 개혁', img: 'scene-vision', alt: '활짝 열린 회의실 문으로 걸어 들어가는 시민들 미니어처' };
  function pick(title) {
    var t = String(title || '');
    for (var i = 0; i < T.length; i++) if (T[i].re.test(t)) return T[i];
    return DEF;
  }
  function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function src(title, id, big) {
    if (id && OWN[id]) return 'img/posts/' + id + (big ? '' : '-640') + '.webp';
    return 'img/g3d/' + pick(title).img + (big ? '' : '-640') + '.webp';
  }
  /* 카드용 <img> 태그. 640px 파일을 쓴다(썸네일은 작게 보이므로). */
  window.KB_thumb = function (title, id, cls) {
    var alt = id && OWN[id] ? esc(title) : pick(title).alt;
    return '<img class="' + (cls || 'kth') + '" src="' + src(title, id) + '" alt="' + alt +
      '" width="640" height="358" loading="lazy" decoding="async">';
  };
  /* 글 주제 이름 (김보미생각 목록의 주제 필터에 씀) */
  window.KB_topic = function (title) { return pick(title).tag; };
  window.KB_topics = function () { return T.map(function (x) { return x.tag; }).concat(DEF.tag); };
  window.KB_thumbSrc = function (title, big, id) { return src(title, id, big); };
})();
