/* kb-thumbs.js — 김보미생각 글 제목으로 주제별 미니어처 썸네일을 고른다 (2026.11, Gemini 생성 이미지)
   첫 번째로 맞는 주제를 쓴다. 맞는 주제가 없으면 '밀실 문을 여는' 기본 장면. */
(function () {
  var T = [
    { re: /돈잔치|국고보조금|보조금|깜깜이|위성정당/, img: 'scene-money', alt: '커튼 뒤 돈자루를 비추는 시민들 미니어처' },
    { re: /후원|기탁금|커피|확성기|511만/, img: 'th-donate', alt: '응원이 모이는 후원 미니어처' },
    { re: /청년|2030|세대교체|686|취업|박지현|하우스|주거|수도관/, img: 'th-youth', alt: '계단을 오르는 청년들 미니어처' },
    { re: /연설|정견|선언|토론|대담|간담회|홍대|질의|외쳤/, img: 'th-speech', alt: '연설대 앞에 모인 청중 미니어처' },
    { re: /컷오프|공천|경선|여론조사|선호투표|최고위원회|당원존|특혜존|공정|흥신소|규칙/, img: 'th-fair', alt: '투표함과 저울 앞에 줄 선 시민들 미니어처' },
    { re: /호남|추석|명절|연휴|근황|강진|고향/, img: 'th-home', alt: '보름달 아래 고향 마을 미니어처' },
    { re: /축하|당선|환영|선물|감사|퇴장|싱어게인|중꺾마|꺾이지/, img: 'th-cheer', alt: '환호하는 전당대회장 미니어처' }
  ];
  var DEF = { img: 'scene-vision', alt: '밀실 문을 열어젖히는 청년들 미니어처' };
  function pick(title) {
    var t = String(title || '');
    for (var i = 0; i < T.length; i++) if (T[i].re.test(t)) return T[i];
    return DEF;
  }
  /* 카드용 <img> 태그. 640px 이하 파일을 쓴다(썸네일은 작게 보이므로). */
  window.KB_thumb = function (title, cls) {
    var p = pick(title);
    return '<img class="' + (cls || 'kth') + '" src="img/g3d/' + p.img + '-640.webp" alt="' + p.alt +
      '" width="640" height="358" loading="lazy" decoding="async">';
  };
  window.KB_thumbSrc = function (title, big) {
    var p = pick(title); return 'img/g3d/' + p.img + (big ? '' : '-640') + '.webp';
  };
})();
