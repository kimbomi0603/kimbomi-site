#!/usr/bin/env python3
"""
전국 세부사업 검색 색인(data/search-a.txt, search-a2.txt)을 저장 자료(data/<코드>.txt)의 2026 집행에서 다시 만든다 (2026-11-06 신설).

왜 있나
  검색 화면은 기준일을 data/index.json(매일 갱신)에서 읽어 'YYYY.MM.DD 기준'으로 찍는데,
  금액은 2026-10-03에 한 번 만든 색인에서 읽고 있었다. 기준일 표기와 실제 금액의 날짜가 달랐다.
  집행 자료를 갱신할 때마다 이 스크립트로 색인도 같은 기준일로 다시 만든다.

형식 (기존 색인과 같다 — 화면 코드 수정 없음)
  a  = {built_at, unit:'만원', names:[사업명...], flds:[분야...], y26:{코드:[[사업코드, 이름번호, 분야번호, 예산현액(만원), 집행액(만원)], ...]}}
  a2 = {y26:{...}}   # 나머지 지자체(파일 하나가 너무 커지지 않게 나눔)
  금액은 원 단위 저장값을 1만으로 나눠 반올림(사사오입)한다. 값을 만들거나 추정하지 않는다.
실행
  python3 tools/build_search.py
"""
import base64, datetime, gzip, json, math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, 'data')


def load(p):
    return json.loads(gzip.decompress(base64.b64decode(open(p, 'rb').read())))


def save(p, obj):
    js = json.dumps(obj, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    open(p, 'wb').write(base64.b64encode(gzip.compress(js, compresslevel=9, mtime=0)))


def man(v):  # 원 → 만원, 사사오입 (화면의 Math.round 와 같다)
    return int(math.floor(float(v or 0) / 1e4 + 0.5))


def main():
    old_a = load(os.path.join(D, 'search-a.txt'))
    old_a2 = load(os.path.join(D, 'search-a2.txt'))
    part_a, part_a2 = list(old_a['y26'].keys()), list(old_a2['y26'].keys())   # 기존 나눔을 그대로 지킨다
    flds = list(old_a['flds'])
    names, nix = [], {}
    y = {}
    for cd in part_a + part_a2:
        p = os.path.join(D, cd + '.txt')
        if not os.path.exists(p):
            continue
        lg = load(p)
        ex = (lg.get('exec') or {}).get('2026')
        if not ex:
            continue
        dic = lg.get('dict') or []
        g = (lambda i: dic[i] if i is not None and i < len(dic) else None) if lg.get('rows_v') == 2 else (lambda i: i)
        out = []
        for r in ex['rows']:
            if isinstance(r, dict):
                c, n, f, b, e = r.get('c'), r.get('n'), r.get('f'), r.get('b'), r.get('e')
            else:
                c, n, f, b, e = r[0], g(r[1]), g(r[2]), r[5], r[6]
            n = n or ''
            f = f or '기타'
            if n not in nix:
                nix[n] = len(names); names.append(n)
            if f not in flds:
                flds.append(f)
            out.append([c, nix[n], flds.index(f), man(b), man(e)])
        y[cd] = out
    now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    a = {'built_at': now, 'unit': '만원', 'names': names, 'flds': flds, 'y26': {k: y[k] for k in part_a if k in y}}
    a2 = {'y26': {k: y[k] for k in part_a2 if k in y}}
    save(os.path.join(D, 'search-a.txt'), a)
    save(os.path.join(D, 'search-a2.txt'), a2)
    print('지자체', len(y), '· 사업', sum(len(v) for v in y.values()), '· 사업명', len(names))


if __name__ == '__main__':
    main()
