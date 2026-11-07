#!/usr/bin/env python3
"""계약대장 요약 다시 만들기 — data/ctrt/<cd>.txt, data/index.json 의 ctrt_nat, data/vendor.json

원자료: 행정안전부 지방재정365 계약현황(WCEGCF) 계약일별 전국 전수 (YYYYMMDD.json, {"rows":[...]})
  받는 법: /api/lofin?hub=WCEGCF&smz_ctrt_ymd=YYYYMMDD&pSize=1000&pIndex=N 을 total 만큼

사용: python3 tools/build_ctrt.py <원자료 폴더> <마지막 계약일 YYYYMMDD>

규칙 (2026-11-07 정리, 예전 파일과 같은 방식)
- 같은 행 판정: 관리번호|계약일|계약명|업체|금액|계약방법 이 모두 같으면 한 건
- 계약 한 건이 그해 예산(세부사업 예산현액, 없으면 결산 세출총계)의 절반을 넘으면 원자료 금액 오기로 보고 합계에서 빼고 x 에 적는다
- 수의계약: 계약방법에 '수의'가 들어간 것
- 금액 구간 bk: 2천만·5천만·1억·2억·4억 경계, 하한 포함
- nr: 수의계약 중 1천만~1.5천만, 1.5천만~2천만, 2천만~2.5천만, 2.5천만~3천만 건수
- 업체 정규화: (주)·㈜·주식회사·(유)·유한회사·(합)·(재)·(사) 등과 띄어쓰기를 지운 이름
- c: 업체별 합계 상위 5·10·20곳 몫(%)과 HHI
- r10: 1천만원 이상 계약 금액 중 수의계약 몫(%)
- r: 연도마다 금액 상위 50건 + 최근 50건 (겹치면 한 번)
- split: 같은 업체 수의계약이 14일 이내 간격으로 이어진 묶음 중 3건 이상·합산 2천만원 초과, 합산액 상위 30
- term: 민선 기수별 합계와 업체 상위 10
- 분야·행사성: tools/ctrt_rules.py (참고용, 오분류 가능)
"""
import json, gzip, base64, glob, os, re, sys, datetime, statistics
from collections import defaultdict, Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ctrt_rules as RULES

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
RAW, LAST = sys.argv[1], sys.argv[2]
TODAY = datetime.date.today().isoformat()
FIRST = '20210101'

def L(p): return json.loads(gzip.decompress(base64.b64decode(open(p, 'rb').read())))
def S(p, o): open(p, 'wb').write(base64.b64encode(gzip.compress(json.dumps(o, separators=(',', ':'), ensure_ascii=False).encode(), compresslevel=9, mtime=0)))

def NORM(n):
    n = re.sub(r'\(주\)|㈜|주식회사|\(유\)|유한회사|\(합\)|합자회사|\(재\)|재단법인|\(사\)|사단법인', '', n or '')
    return re.sub(r'\s+', '', n)
def VNORM(s):   # 화면(budget365 vnorm)과 같은 정규화 — 업체 역색인 열쇠
    s = re.sub(r'\(주\)|주식회사|\(유\)|유한회사|\(재\)|재단법인|\(사\)|사단법인|\(합\)|합자회사|\s+', '', str(s or '')).strip()
    return s or '—'
def VHASH(v):   # budget365 vhash 와 같은 값
    h = 0
    for ch in v.encode('utf-16-le').decode('utf-16-le'):
        for cu in ([ord(ch)] if ord(ch) < 0x10000 else [0xD800 + ((ord(ch) - 0x10000) >> 10), 0xDC00 + ((ord(ch) - 0x10000) & 0x3FF)]):
            i32 = h - (1 << 32) if h >= (1 << 31) else h
            s5 = (i32 << 5) & 0xFFFFFFFF
            s5 = s5 - (1 << 32) if s5 >= (1 << 31) else s5
            h = (s5 - h + cu * 2654435761) % (1 << 32)
    return h

BK = [2e7, 5e7, 1e8, 2e8, 4e8]
NR = [(1e7, 1.5e7), (1.5e7, 2e7), (2e7, 2.5e7), (2.5e7, 3e7)]
TERMS = [('민선7기', '20180701', '20220630'), ('민선8기', '20220701', '20260630'), ('민선9기', '20260701', '20301231')]
D = lambda s: datetime.date(int(s[:4]), int(s[4:6]), int(s[6:8]))
pct = lambda a, b: round(a / b * 100, 1) if b else None

# ── 원자료 읽기: 날짜 파일을 하나씩 읽어 지자체별 줄 파일로 나눈 뒤(메모리 절약) 지자체마다 따로 처리
FIELDS = ('laf_cd', 'laf_hg_nm', 'wa_laf_hg_nm', 'ctrt_ldgr_mng_no', 'smz_ctrt_ymd', 'ctrt_trgt_nm', 'clt_nm', 'ctrt_tot_tott_amt', 'ctrt_mth_nm', 'ctrt_knd_nm')
SPLIT = os.path.join(RAW, '_by_cd_' + LAST)
if not os.path.isdir(SPLIT):
    tmp = SPLIT + '.tmp'; os.makedirs(tmp, exist_ok=True); fh = {}; days = 0
    for f in sorted(glob.glob(os.path.join(RAW, '*.json'))):
        d = os.path.basename(f)[:8]
        if not (FIRST <= d <= LAST): continue
        days += 1
        for x in json.load(open(f))['rows']:
            cd = str(x.get('laf_cd'))
            if cd not in fh: fh[cd] = open(os.path.join(tmp, cd + '.jsonl'), 'a')
            fh[cd].write(json.dumps([x.get(k) for k in FIELDS], ensure_ascii=False) + '\n')
    for h in fh.values(): h.close()
    os.rename(tmp, SPLIT); print('원자료 날짜', days, '지자체', len(fh), flush=True)
def load_cd(cd):
    p = os.path.join(SPLIT, cd + '.jsonl'); out = []; seen = set()
    if not os.path.exists(p): return out
    for line in open(p):
        x = dict(zip(FIELDS, json.loads(line)))
        key = '|'.join(str(x.get(t)) for t in ('ctrt_ldgr_mng_no', 'smz_ctrt_ymd', 'ctrt_trgt_nm', 'clt_nm', 'ctrt_tot_tott_amt', 'ctrt_mth_nm'))
        if key in seen: continue
        seen.add(key); out.append(x)
    return out
raw_codes = {os.path.basename(f)[:-6] for f in glob.glob(os.path.join(SPLIT, '*.jsonl'))}

def budget_of(cd):
    try: lg = L(os.path.join(DATA, cd + '.txt'))
    except Exception: return lambda y: None
    E = lg.get('exec') or {}; F = lg.get('fiscal') or {}
    def b(y):
        v = ((E.get(y) or {}).get('sum') or {}).get('budget')
        if v: return v
        acc = (F.get(y) or {}).get('ACC')
        return acc.get('ane_tott_amt') if acc else None
    return b

def new_acc():
    return {'n': 0, 'a': 0, 'sn': 0, 'sa': 0, 't10': 0, 's10': 0, 'm': defaultdict(lambda: [0, 0]), 'k': defaultdict(lambda: [0, 0]),
            'bk': [[0, 0] for _ in range(6)], 'nr': [0, 0, 0, 0], 'fl': defaultdict(lambda: [0, 0, 0, 0]), 'ev': [0, 0, 0, 0], 'V': Counter()}
def add(o, x, a, s):
    o['n'] += 1; o['a'] += a; o['sn'] += s; o['sa'] += a * s
    if a >= 1e7: o['t10'] += a; o['s10'] += a * s
    m = x.get('ctrt_mth_nm') or '기타'; o['m'][m][0] += 1; o['m'][m][1] += a
    k = x.get('ctrt_knd_nm') or '기타'; o['k'][k][0] += 1; o['k'][k][1] += a
    i = sum(1 for b in BK if a >= b); o['bk'][i][0] += 1; o['bk'][i][1] += a
    if s:
        for j, (lo, hi) in enumerate(NR):
            if lo <= a < hi: o['nr'][j] += 1
    nm = x.get('ctrt_trgt_nm') or ''
    f = o['fl'][RULES.field(nm)]; f[0] += 1; f[1] += a; f[2] += s; f[3] += a * s
    if RULES.is_event(nm): e = o['ev']; e[0] += 1; e[1] += a; e[2] += s; e[3] += a * s
    o['V'][NORM(str(x.get('clt_nm') or ''))] += a
def conc(V):
    tot = sum(V.values()); sh = sorted(V.values(), reverse=True)
    if not tot: return {'cr5': None, 'cr10': None, 'cr20': None, 'hhi': None}
    return {'cr5': round(sum(sh[:5]) / tot * 100, 1), 'cr10': round(sum(sh[:10]) / tot * 100, 1), 'cr20': round(sum(sh[:20]) / tot * 100, 1),
            'hhi': round(sum((v / tot * 100) ** 2 for v in sh))}
def fin(o, top=False):
    out = {'fl': dict(o['fl']), 'ev': o['ev']}
    if not top: out.update({'n': o['n'], 'a': o['a'], 'sn': o['sn'], 'sa': o['sa']})
    out['r10'] = pct(o['s10'], o['t10'])
    if not top: out.update({'t10': o['t10'], 's10': o['s10'], 'm': dict(o['m']), 'k': dict(o['k'])})
    out.update({'bk': o['bk'], 'nr': o['nr'], 'c': conc(o['V'])})
    return out

codes = sorted(os.path.basename(f)[:-4] for f in glob.glob(os.path.join(DATA, 'ctrt', '*.txt')))
missing = sorted(raw_codes - set(codes))
if missing: print('목록에 없는 원자료 지자체(건너뜀):', missing, flush=True)

NAT = {'built_at': TODAY, 'lg': {}}
VIDX = defaultdict(dict)    # vnorm -> {codeIdx: [n,a,sn,sa]}
old_n = 0; new_n = 0
for ci, cd in enumerate(codes):
    old = L(os.path.join(DATA, 'ctrt', cd + '.txt')); old_n += (old.get('t') or {}).get('n') or 0
    bud = budget_of(cd); rows = sorted(load_cd(cd), key=lambda x: (str(x.get('smz_ctrt_ymd')), str(x.get('ctrt_ldgr_mng_no'))))
    nm = old.get('nm') or (rows[0].get('laf_hg_nm') if rows else cd)
    T = new_acc(); Y = defaultdict(new_acc); X = []; keep = []
    for x in rows:
        a = int(x.get('ctrt_tot_tott_amt') or 0); d = str(x.get('smz_ctrt_ymd')); y = d[:4]; b = bud(y)
        if b and a > 0.5 * b:
            X.append([d, x.get('ctrt_trgt_nm') or '', x.get('clt_nm') or '', a]); continue
        s = 1 if '수의' in (x.get('ctrt_mth_nm') or '') else 0
        add(T, x, a, s); add(Y[y], x, a, s); keep.append((x, a, s, d))
    # 업체
    G = defaultdict(lambda: {'n': 0, 'a': 0, 'sn': 0, 'sa': 0, 'y': defaultdict(lambda: [0, 0]), 'names': Counter()})
    for x, a, s, d in keep:
        g = G[NORM(str(x.get('clt_nm') or ''))]
        g['n'] += 1; g['a'] += a; g['sn'] += s; g['sa'] += a * s; g['y'][d[:4]][0] += 1; g['y'][d[:4]][1] += a; g['names'][x.get('clt_nm') or ''] += 1
        vi = VIDX[VNORM(x.get('clt_nm'))].setdefault(ci, [0, 0, 0, 0]); vi[0] += 1; vi[1] += a; vi[2] += s; vi[3] += a * s
    V = sorted(G.values(), key=lambda g: -g['a'])[:150]
    v = [[g['names'].most_common(1)[0][0], g['n'], g['a'], g['sn'], g['sa'], {yy: g['y'][yy] for yy in sorted(g['y'])}] for g in V]
    # 기수
    term = []
    for tn, fr, to in TERMS:
        o = {'nm': tn, 'from': fr, 'to': to, 'n': 0, 'a': 0, 'sn': 0, 'sa': 0}; tv = Counter()
        for x, a, s, d in keep:
            if fr <= d <= to: o['n'] += 1; o['a'] += a; o['sn'] += s; o['sa'] += a * s; tv[NORM(str(x.get('clt_nm') or ''))] += a
        o['top'] = [[k, a] for k, a in tv.most_common(10)]
        term.append(o)
    # 쪼개기 검토
    sv = defaultdict(list)
    for x, a, s, d in keep:
        if s: sv[NORM(str(x.get('clt_nm') or ''))].append((d, a, x.get('clt_nm') or ''))
    cl = []
    for k, ds in sv.items():
        ds.sort(); cur = [ds[0]]
        for e in ds[1:]:
            if (D(e[0]) - D(cur[-1][0])).days <= 14: cur.append(e)
            else: cl.append(cur); cur = [e]
        cl.append(cur)
    split = sorted(({'v': c[0][2], 'from': c[0][0], 'to': c[-1][0], 'n': len(c), 'a': sum(e[1] for e in c)} for c in cl if len(c) >= 3 and sum(e[1] for e in c) > 2e7), key=lambda s: -s['a'])[:30]
    # 계약 목록
    rl = []
    for y in sorted(Y):
        ky = [(x, a, s, d) for x, a, s, d in keep if d[:4] == y]
        top = sorted(range(len(ky)), key=lambda i: -ky[i][1])[:50]
        late = sorted(range(len(ky)), key=lambda i: ky[i][3], reverse=True)[:50]
        for i in sorted(set(top) | set(late)):
            x, a, s, d = ky[i]
            rl.append([d, x.get('ctrt_trgt_nm') or '', x.get('ctrt_mth_nm') or '', x.get('ctrt_knd_nm') or '', x.get('clt_nm') or '', a])
    rl.sort(key=lambda r: r[0], reverse=True)
    top = fin(T, top=True)
    K = {'cd': cd, 'nm': nm, 'sido': old.get('sido') or (rows[0].get('wa_laf_hg_nm') if rows else ''), 'built_at': TODAY,
         'src': f'행정안전부 지방재정365 계약현황(WCEGCF) 일별 전수 · {int(LAST[:4])}.{int(LAST[4:6])}.{int(LAST[6:])} 전국 재수집(계약일 2021.1.1~)',
         'range': [FIRST, LAST], 'fl': top['fl'], 'ev': top['ev'], 'nr': top['nr'], 'bk': top['bk'], 'c': top['c'], 'r10': top['r10'],
         't': {'n': T['n'], 'a': T['a'], 'sn': T['sn'], 'sa': T['sa']}, 'y': {y: fin(Y[y]) for y in sorted(Y)},
         'v': v, 'vn': len(G), 'term': term, 'split': split, 'r': rl, 'rn': T['n'], 'x': X, 'rule': RULES.RULE_NOTE,
         'fl_note': f'쪼개기 검토(split)는 {int(LAST[:4])}.{int(LAST[4:6])}.{int(LAST[6:])} 수집분 기준'}
    S(os.path.join(DATA, 'ctrt', cd + '.txt'), K); new_n += T['n']
    NAT['lg'][cd] = {'nm': nm, 'y': {y: {'r10': K['y'][y]['r10'], 'cr5': K['y'][y]['c']['cr5'], 'hhi': K['y'][y]['c']['hhi'], 'n': K['y'][y]['n'], 'a': round(K['y'][y]['a'] / 1e4)} for y in K['y']},
                     'r10': K['r10'], 'n': T['n'], 'a': round(T['a'] / 1e4)}

vals = sorted(x['r10'] for x in NAT['lg'].values() if x.get('r10') is not None)
def q(p):   # numpy percentile(linear) 와 같은 값
    k = (len(vals) - 1) * p / 100; f = int(k); c = min(f + 1, len(vals) - 1)
    return round(vals[f] + (vals[c] - vals[f]) * (k - f), 1)
NAT['stat'] = {'n': len(vals), 'p25': q(25), 'p50': q(50), 'p75': q(75), 'p90': q(90), 'avg': round(statistics.mean(vals), 1)}
NAT = {'built_at': NAT['built_at'], 'stat': NAT['stat'], 'lg': NAT['lg']}
idx = json.load(open(os.path.join(DATA, 'index.json')))
idx['ctrt_nat'] = NAT
json.dump(idx, open(os.path.join(DATA, 'index.json'), 'w'), ensure_ascii=False, separators=(',', ':'))

# 업체 역색인: 두 곳 이상과 계약한 업체만, 금액은 만원
SH = 3; shards = [dict() for _ in range(SH)]; multi = 0
for k, per in VIDX.items():
    if len(per) < 2: continue
    multi += 1
    r = sorted(([c, v[0], round(v[1] / 1e4), v[2], round(v[3] / 1e4)] for c, v in per.items()), key=lambda r: -r[2])
    shards[VHASH(k) % SH][k] = {'t': len(per), 'r': r}
vend = {'meta': {'codes': codes, 'built_at': TODAY, 'vendors': multi, 'all': len(VIDX), 'sh': SH,
                 'src': f'행정안전부 지방재정365 계약현황(WCEGCF) 계약일 2021. 1. 1.~{int(LAST[:4])}. {int(LAST[4:6])}. {int(LAST[6:])}. 전국 전수({int(LAST[:4])}.{int(LAST[4:6])}.{int(LAST[6:])} 재수집)', 'unit': '만원'},
        'sh': {str(i): base64.b64encode(gzip.compress(json.dumps(shards[i], separators=(',', ':'), ensure_ascii=False).encode(), compresslevel=9, mtime=0)).decode() for i in range(SH)}}
json.dump(vend, open(os.path.join(DATA, 'vendor.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'지자체 {len(codes)} · 전체 건수 {old_n:,} → {new_n:,} · 업체 {len(VIDX):,}(두 곳 이상 {multi:,}) · r10 중앙값 {NAT["stat"]["p50"]}', flush=True)
