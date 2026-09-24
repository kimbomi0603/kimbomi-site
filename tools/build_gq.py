"""중앙정부 사업 검색용 색인 2개를 만든다 (2026-09-24).
검색 한 번에 부처 파일 62~64개 + 사업목적 파일 53개를 따로 받던 것을 파일 1개로 합친다.
  data/gq26.json : 2026 확정예산 — [부처번호, 사업명, 프로그램, 단위사업, 세부분야, 분야, 2026예산(원), 2025예산(원)]
  data/gq26pu.json : 같은 순서의 사업목적 문장 배열
  data/gq27.json : 2027 정부안   — [부처번호, 사업명, 프로그램, 세부, 단위, 분야, 2027(백만원), 2026(백만원)]
원자료(data/gov, data/gov27, data/govpu)가 바뀌면 이 스크립트를 다시 돌린다. 값은 원자료 그대로 옮기며 새로 만들지 않는다."""
import json, gzip, base64, os
D = os.path.join(os.path.dirname(__file__), '..', 'data')
def rd(p):
    return json.loads(gzip.decompress(base64.b64decode(open(p).read().strip())))
def wr(p, obj):
    # 일반 JSON으로 둔다: Vercel이 전송할 때 brotli/gzip으로 알아서 압축하므로 base64 부풀림(약 33%)이 없다.
    raw = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode()
    open(p, 'wb').write(raw)
    return len(raw)

ix = json.load(open(os.path.join(D, 'gov-index.json')))
M, rows, pu_min, pu_n = [], [], 0, 0
for i, m in enumerate(ix['ministries']):
    M.append({'sg': m['sg'], 'nm': m['nm']})
    P = rd(os.path.join(D, 'gov', m['sg'] + '.txt'))
    pf = os.path.join(D, 'govpu', m['sg'] + '.txt')
    PU = rd(pf) if os.path.exists(pf) else None
    if PU: pu_min += 1; pu_n += PU.get('n') or 0
    for x in P:
        p = ''
        if PU and PU.get('pu'):
            p = (PU['pu'].get(x.get('cd')) or PU['pu'].get('nm:' + str(x.get('nm'))) or {}).get('p', '')
        rows.append([i, x.get('nm'), x.get('pg'), x.get('un'), x.get('sb'), x.get('fd'), x.get('b26'), x.get('b25'), p])
# 이름 색인(약 0.2MB 압축)과 사업목적 문장(약 1MB 압축)을 나눈다: 이름으로 찾은 결과를 먼저 보여 주고, 문장은 뒤따라 받는다.
n26 = wr(os.path.join(D, 'gq26.json'), {'built': ix.get('built_at'), 'M': M, 'puMin': pu_min, 'puN': pu_n, 'rows': [r[:8] for r in rows]})
wr(os.path.join(D, 'gq26pu.json'), [r[8] for r in rows])

ix27 = json.load(open(os.path.join(D, 'gov27-index.json')))
M27, r27 = [], []
for i, m in enumerate(ix27['ministries']):
    M27.append({'sg': m['sg'], 'nm': m['nm']})
    for x in rd(os.path.join(D, 'gov27', m['sg'] + '.txt')):
        r27.append([i, x.get('n'), x.get('p'), x.get('d'), x.get('u'), x.get('f'), x.get('b27'), x.get('b26')])
n27 = wr(os.path.join(D, 'gq27.json'), {'built': ix27.get('built_at'), 'M': M27, 'rows': r27})
print('gq26 rows', len(rows), 'pu', pu_min, pu_n, 'raw', n26, '| gq27 rows', len(r27), 'raw', n27)
