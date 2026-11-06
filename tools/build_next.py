#!/usr/bin/env python3
"""페이지 끝 '이어서 보기' 블록을 각 페이지에 넣는다(다시 돌리면 같은 자리를 바꿔 끼운다). 2026-11-07"""
import os, re, html
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = {
 'about':      ('about.html','김보미는','걸어온 길','강진 군의원에서 전국 최연소 기초의회 의장까지, 약력과 의정 기록','scene-about'),
 'vision':     ('vision.html','김보미생각','글','현안이 생길 때마다 쓴 글과 정치개혁 제안','scene-vision'),
 'gongyak':    ('gongyak.html','공약집','약속','2026 전당대회 때 낸 5대 분야 25개 공약','scene-gongyak'),
 'manifesto':  ('manifesto.html','출마선언문','원문','2026 전당대회 당대표 출마선언 전문','scene-manifesto'),
 'archive':    ('archive.html','기록관','기록','2026 당대표 예비경선을 완주하기까지','scene-archive'),
 'press':      ('press.html','언론·영상','보도','기사, 인터뷰, 방송, 유튜브 영상 모음','scene-press'),
 'report':     ('report.html','소통·제보','제보','생각을 남기거나, 예산 낭비를 이름 없이 알려 주세요','scene-report'),
 'pledge':     ('pledge.html','함께하기','참여','재정주권시민행동 회원가입과 후원 안내','scene-pledge'),
 'party-money':('party-money.html','정당 돈 공개','감시','2025년 정당 국고보조금 1,048억원, 쓴 내역은 어디에','scene-money'),
 'live':       ('live.html','정책 실시간','오늘','정부 보도자료, 관보, 국회 법률안을 공공 API로 바로','scene-live'),
 'budget365':  ('budget365.html','우리동네365','예산','243개 시·군·구와 중앙부처의 예산·집행·계약','scene-365'),
 'gyeyak':     ('gyeyak.html','계약현황','계약','243곳 나라장터 계약과 쪼개기 발주 탐지','scene-contract'),
}
NEXT = {
 'about':['vision','gongyak','archive'], 'vision':['gongyak','party-money','report'],
 'gongyak':['manifesto','vision','pledge'], 'manifesto':['gongyak','archive','about'],
 'archive':['press','manifesto','about'], 'press':['archive','about','report'],
 'report':['pledge','vision','budget365'], 'pledge':['party-money','budget365','report'],
 'party-money':['pledge','budget365','live'], 'live':['budget365','party-money','gyeyak'],
 'gyeyak':['budget365','report','party-money'],
 'games':['gongyak','about','pledge'],
}
e = html.escape
def block(cur):
    cards = []
    for k in NEXT[cur]:
        href, title, lab, line, img = P[k]
        cards.append(f'<a class="kbnx-c" href="{href}"><div class="kbnx-i"><img src="img/g3d/{img}-640.webp" width="640" height="358" alt="" loading="lazy" decoding="async"></div>'
                     f'<div class="kbnx-t"><small>{e(lab)}</small><strong>{e(title)}</strong><span>{e(line)}</span><em>보러 가기 →</em></div></a>')
    return ('<!--kbnext--><link rel="stylesheet" href="assets/kb-next.css">\n<nav class="kbnx" aria-label="이어서 보기"><div class="kbnx-h"><b>이어서 보기</b><a href="index.html">처음으로</a></div>'
            '<div class="kbnx-g">' + ''.join(cards) + '</div></nav><!--/kbnext-->\n')
for cur in NEXT:
    f = os.path.join(ROOT, cur + '.html'); s = open(f, encoding='utf-8').read()
    s = re.sub(r'<!--kbnext-->.*?<!--/kbnext-->\n?', '', s, flags=re.S)
    b = block(cur)
    for anchor in ['<footer', '<script src="assets/bomi.js"', '</body>']:
        i = s.find(anchor)
        if i >= 0:
            s = s[:i] + b + s[i:]; break
    open(f, 'w', encoding='utf-8').write(s); print(cur, anchor)
