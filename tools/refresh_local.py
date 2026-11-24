# -*- coding: utf-8 -*-
"""지역 탐방 방문자 자료 갱신 — 한국관광 데이터랩의 새 달이 '다 올라왔으면' data/local/visitors.json 에 더한다.
인증키는 서버(/api/local)에만 있다. 이 스크립트는 사이트의 /api/local?datalab=YYYYMM 을 불러 합계만 받는다.
새 달이 없거나 아직 덜 올라왔으면 아무것도 바꾸지 않는다(값을 만들지 않는다)."""
import json, os, sys, time, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://www.xn--4k0b53xuva.com'
P = os.path.join(ROOT, 'data/local/visitors.json')

def nxt(ym):
    y, m = int(ym[:4]), int(ym[4:]) + 1
    if m > 12: y, m = y + 1, 1
    return f'{y}{m:02d}'

def get(ym):
    req = urllib.request.Request(f'{SITE}/api/local?datalab={ym}', headers={'User-Agent': 'Mozilla/5.0 (compatible; kimbomi-refresh/1.0)'})
    for i in range(4):
        try:
            with urllib.request.urlopen(req, timeout=90) as r: return json.loads(r.read().decode('utf-8'))
        except Exception as e:
            print('  다시 시도', ym, type(e).__name__); time.sleep(8 * (i + 1))
    return None

def main():
    d = json.load(open(P, encoding='utf-8')); M = d['months']; added = []
    ym = nxt(max(M))
    for _ in range(4):
        v = get(ym)
        if not v or not v.get('ok'): print(ym, '받지 못함'); break
        if not v.get('complete'): print(ym, f"아직 {v.get('days')}/{v.get('daysInMonth')}일만 올라옴 — 넣지 않음"); break
        prev = M[max(M)]
        if len(v['sgg']) < len(prev['sgg']) * 0.95 or len(v['sido']) < 15: print(ym, '지역 수가 모자람 — 넣지 않음'); break
        M[ym] = {'sgg': v['sgg'], 'sido': v['sido']}; added.append(ym); print(ym, '추가', len(v['sgg']), '곳'); ym = nxt(ym)
    if added:
        json.dump(d, open(P, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('추가한 달:', ', '.join(added) or '없음')

if __name__ == '__main__':
    main()
