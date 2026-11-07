#!/usr/bin/env python3
"""모든 일반 페이지의 머리(메뉴)와 꼬리(바닥글)를 한 벌로 맞춘다 (2026-11-07 재설계 1단계).

왜 있나
  페이지마다 머리·꼬리가 따로 적혀 있어 메뉴 이름·순서·직함이 페이지마다 달랐다
  (공약집·출마선언문·기록관은 옛 머리, 미니게임 메뉴, '전 당대표 예비후보' 꼬리표 등).
  이 스크립트가 머리는 아래 HEADER, 꼬리는 tools/shell_footer.html 하나로 덮어쓴다.
  다시 돌려도 결과가 같다. 앱 화면(budget365·gyeyak)은 자체 머리를 쓰므로 건드리지 않는다.
"""
import os, re, html
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ['index','about','vision','gongyak','manifesto','archive','press','report','pledge','party-money','live','games','privacy']
NAV = [('https://taxwatch.kr/','재정주권시민행동',None),('about.html','김보미는','about'),('vision.html','김보미생각','vision'),
       ('gongyak.html','공약집','gongyak'),('press.html','언론·영상','press'),('archive.html','기록관','archive')]
ACTIVE = {'about':'about','vision':'vision','gongyak':'gongyak','manifesto':'gongyak','press':'press','archive':'archive'}
def header(page):
    cur = ACTIVE.get(page)
    links = []
    for href,label,key in NAV:
        ext = ' target="_blank" rel="noopener" class="kbx-ext"' if href.startswith('http') else ''
        on = ' class="on" aria-current="page"' if key and key == cur else ''
        links.append(f'      <a href="{href}"{ext}{on}>{label}</a>')
    return ('<header class="kbx-hdr">\n  <div class="kbx-w">\n'
            '    <a class="kbx-brand" href="index.html"><img src="assets/brand/kb-wordmark.svg" alt="김보미.com" width="103" height="30"></a>\n'
            '    <nav aria-label="주 메뉴">\n' + '\n'.join(links) + '\n    </nav>\n'
            '    <a class="kbx-365" href="budget365.html" aria-label="우리동네365 · 지방정부와 중앙정부 예산 보기"><img src="assets/brand/ud365-icon-light.svg" alt=""><span><b>우리동네365</b><em>지방정부와 중앙정부</em></span></a>\n'
            '    <a class="kbx-join" href="pledge.html">함께하기</a>\n  </div>\n</header>')
FOOT = open(os.path.join(ROOT,'tools','shell_footer.html'),encoding='utf-8').read().strip()
CSS = '<link rel="stylesheet" href="assets/kb-common.css">'
for p in PAGES:
    f = os.path.join(ROOT, p + '.html'); s = open(f, encoding='utf-8').read(); o = s
    s = re.sub(r'<header\b[^>]*>.*?</header>', lambda m: header(p), s, count=1, flags=re.S)
    if re.search(r'<footer\b', s):
        s = re.sub(r'<footer\b[^>]*>.*?</footer>', lambda m: FOOT, s, count=1, flags=re.S)
    else:
        m = re.search(r'<!--/kbnext-->\n?', s)
        i = m.end() if m else s.find('</body>')
        s = s[:i] + FOOT + '\n' + s[i:]
    # 머리가 페이지 폭 상자(.wrap) 안에 들어가 있으면 상자 밖으로 꺼낸다(게임 화면)
    m = re.search(r'(<div class="wrap">\s*)(<header class="kbx-hdr">.*?</header>)', s, re.S)
    if m: s = s[:m.start()] + m.group(2) + '\n' + m.group(1) + s[m.end():]
    if 'assets/kb-common.css' not in s:
        s = s.replace('</head>', CSS + '\n</head>', 1)
    if 'assets/kb-theme.css' not in s:   # 공통 테마(색·글자·움직임)는 페이지 스타일 뒤에
        s = s.replace('</head>', '<link rel="stylesheet" href="assets/kb-theme.css">\n</head>', 1)
    if s != o: open(f, 'w', encoding='utf-8').write(s)
    print(p, 'changed' if s != o else 'same')
