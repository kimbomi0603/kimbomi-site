"""지자체 화면이 첫 진입 때 받던 큰 파일 두 개를 지자체별로 쪼갠다 (2026-09-24).
  data/ctrt-a.json · ctrt-b.json (합 9MB, 지자체별 계약 요약) → data/ctrt/<코드>.txt (내용은 원본의 그 지자체 값 그대로)
  data/pledge.json (2MB, 당선인·공약)                        → data/pledge/<코드>.json ({built_at, src, terms_src, lg:{코드: 원본값}})
원본 파일은 그대로 둔다(쪼갠 파일을 못 받으면 화면이 원본으로 되돌아간다). 원본이 바뀌면 이 스크립트를 다시 돌린다."""
import json, os
D = os.path.join(os.path.dirname(__file__), '..', 'data')
os.makedirs(os.path.join(D, 'ctrt'), exist_ok=True); os.makedirs(os.path.join(D, 'pledge'), exist_ok=True)
n = 0
for sh in 'ab':
    for cd, b64 in json.load(open(os.path.join(D, f'ctrt-{sh}.json'))).items():
        open(os.path.join(D, 'ctrt', cd + '.txt'), 'w').write(b64); n += 1
P = json.load(open(os.path.join(D, 'pledge.json'), encoding='utf-8'))
meta = {k: P[k] for k in P if k != 'lg'}
for cd, v in P['lg'].items():
    json.dump(dict(meta, lg={cd: v}), open(os.path.join(D, 'pledge', cd + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ctrt', n, 'pledge', len(P['lg']))
