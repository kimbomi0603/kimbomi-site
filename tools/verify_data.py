#!/usr/bin/env python3
"""
김보미.com 우리동네365 — 숫자 5중 검증기 (2026-09-29 신설)

왜 있나
  화면에 나가는 숫자 하나하나를 서로 다른 다섯 경로로 확인하고, 하나라도 어긋나면
  그 값을 화면에서 비우게 하려고 만들었다. 사람이 매번 다른 방법으로 훑으면 매번
  다른 것만 걸린다. 검사를 고정하고 기계에 맡긴다.

다섯 겹
  L1 원자료 스캔     저장해 둔 원본 행(지방재정365 응답 원본)에서 합계·비율을 다시 계산해
                     저장값과 맞는지. 같은 표 안의 금액으로 비율을 다시 계산해 맞는지.
  L2 API 재조회     지금 지방재정365·선관위 API를 다시 불러 저장값과 한 자리까지 같은지.
  L3 독립 출처 교차  같은 값을 따로 공개하는 다른 표(허브)·다른 기관 자료와 맞는지.
                     예) 예산 총계 ACEXBG ↔ ARBGT, 일반회계 예산 ACEXBG ↔ EAGGD·FBHIF·HCDIB,
                         인구 BJHJB ↔ HCDIB, 재정자립도 FNCST ↔ FDOST 분자·분모
  L4 파생값 재계산   화면이 계산해 보여 주는 값(순위·1인당·비중·합계)을 여기서 따로 계산해 둔다.
  L5 운영 화면 대조  실제 사이트 화면에 찍힌 숫자가 L4 값과 같은지 (tools/verify-screen.js).

결과
  data/verify/status.json   화면이 읽는 판정표(작다). 여기서 막힌 값은 화면에서 '—'로 비운다.
  audit-out/data-verify.md  사람이 읽는 보고서(어긋난 값 전부).
  audit-out/data-ledger.json 전체 판정 장부(값·출처·기준일·층별 결과).
  audit-out/expect.json     L5가 화면과 맞춰 볼 기대값.

실행
  python3 tools/verify_data.py              # L1+L3(내부) — 오프라인, 수 초
  python3 tools/verify_data.py --api        # + L2 재정 허브 전수, 집행은 행 수 전수 + 합계 순환분
  python3 tools/verify_data.py --api --full # + 집행 원본 행을 243곳 5개 연도 전부 API와 한 줄씩 대조(수십 분)
  종료코드 1 = 막힌 값이 있다(보고서 확인).

원칙: 확인되지 않은 값은 만들지 않는다. 판정이 애매하면 막는다(보여 주지 않는다).
"""
import argparse, base64, concurrent.futures as cf, datetime, gzip, hashlib, json, math, os, re, sys, time
import urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.environ.get('KB_BASE', 'https://www.xn--4k0b53xuva.com')
OUT = os.path.join(ROOT, 'audit-out')
CACHE = os.path.join(OUT, 'cache')
STATUS = os.path.join(ROOT, 'data', 'verify', 'status.json')
KST = datetime.timezone(datetime.timedelta(hours=9))
TODAY = datetime.datetime.now(KST).strftime('%Y-%m-%d')

LAYERS = {'L1': '원자료 스캔', 'L2': 'API 재조회', 'L3': '독립 출처 교차', 'L4': '파생값 재계산', 'L5': '운영 화면 대조'}

# ─────────────────────────────── 공통 ───────────────────────────────
def load_b64gz(path):
    return json.loads(gzip.decompress(base64.b64decode(open(path, 'rb').read())))

def decs(v):
    """저장값의 소수 자릿수 — 반올림 허용 폭을 정하는 데 쓴다"""
    if isinstance(v, int): return 0
    s = repr(float(v))
    if 'e' in s: return 6
    return len(s.split('.')[1].rstrip('0')) if '.' in s else 0

def near(stored, calc, d=None):
    if stored is None or calc is None: return None
    if isinstance(calc, float) and (math.isnan(calc) or math.isinf(calc)): return None
    d = decs(stored) if d is None else d
    tol = 10 ** (-d) * 1.0001 + 1e-9      # 끝자리 1단위(반올림·버림 방식 차이)까지만 허용
    return abs(float(stored) - float(calc)) <= tol

def same(a, b):
    if a is None and b is None: return True
    if a is None or b is None: return False
    try: return abs(float(a) - float(b)) < 1e-6
    except Exception: return str(a) == str(b)

def http_json(url, tries=3, timeout=90):
    os.makedirs(CACHE, exist_ok=True)
    key = hashlib.sha1((TODAY + url).encode()).hexdigest()
    cp = os.path.join(CACHE, key + '.json')
    if os.path.exists(cp):
        try: return json.load(open(cp))
        except Exception: pass
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'kimbomi-verify/1.0'})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                d = json.loads(r.read().decode('utf-8'))
            if isinstance(d, dict) and d.get('ok') is False and i < tries - 1:
                last = d; time.sleep(2 + 3 * i); continue
            json.dump(d, open(cp, 'w'), ensure_ascii=False)
            return d
        except Exception as e:
            last = {'ok': False, 'error': str(e)}
            time.sleep(2 + 3 * i)
    return last

# ─────────────────────────────── 판정 장부 ───────────────────────────────
class Ledger:
    def __init__(self):
        self.r = {}       # cd -> key -> {L1..L5: True/False/None, why:[...]}
        self.issues = []  # 사람이 볼 목록
    def mark(self, cd, key, layer, ok, why=None, detail=None):
        e = self.r.setdefault(cd, {}).setdefault(key, {'why': []})
        if ok is None: return
        prev = e.get(layer)
        e[layer] = (prev is not False) and bool(ok)   # 한 번이라도 실패면 실패
        if not ok:
            msg = f'[{layer} {LAYERS[layer]}] {why}' if why else f'[{layer}]'
            if msg not in e['why']: e['why'].append(msg)
            self.issues.append({'cd': cd, 'key': key, 'layer': layer, 'why': why, 'detail': detail})
    def status(self, cd, key):
        e = self.r.get(cd, {}).get(key)
        if not e: return 'none'
        if any(e.get(L) is False for L in LAYERS): return 'fail'
        return 'ok'

# ─────────────────────────────── 허브 정의 ───────────────────────────────
# 같은 표 안의 금액으로 비율을 다시 계산하는 식 (지방재정365 공시 산식, 2026-09-29 실측으로 확인)
def _r(n, d, k=100.0):
    return None if (n is None or not d) else n / d * k
FORM = {
    'FISCAL':  [('rate1', lambda h: _r(h.get('pfa_amt1'), h.get('pfa_amt2'))),
                ('rate2', lambda h: _r(h.get('pfa_amt3'), h.get('pfa_amt2')))],
    'SR':      [('rate1', lambda h: _r(h.get('pfa_amt1'), h.get('pfa_amt2'))),
                ('rate2', lambda h: _r(h.get('pfa_amt3'), h.get('pfa_amt2')))],
    'AU':      [('rate1', lambda h: _r((h.get('pfa_amt1') or 0) + (h.get('pfa_amt2') or 0), h.get('pfa_amt3'))),
                ('rate2', lambda h: _r((h.get('pfa_amt4') or 0) + (h.get('pfa_amt2') or 0), h.get('pfa_amt3')))],
    'M_FDOST': [('rate1', lambda h: _r((h.get('pfa_amt1') or 0) + (h.get('pfa_amt2') or 0), h.get('pfa_amt3'))),
                ('rate2', lambda h: _r((h.get('pfa_amt4') or 0) + (h.get('pfa_amt2') or 0), h.get('pfa_amt3')))],
    'ACC':     [('ane_tott_amt', lambda h: sum(h.get(k) or 0 for k in ('gen_acnt_amt', 'pbco_spc_acnt_amt', 'etc_spc_acnt_amt', 'fnd_amt')))],
    'EXEC':    [('tot_pfa_amt', lambda h: sum(h.get(k) or 0 for k in ('pfa_amt1', 'pfa_amt2', 'pfa_amt3', 'pfa_amt4')))],
    'M_BJHJB': [('one_llx_smam', lambda h: _r(h.get('ltax_efir_tott_amt'), h.get('pptn_num'), 1))],
    'M_HCDIB': [('rate', lambda h: _r(h.get('bfae_totl_amt'), h.get('pptn_num'), 1))],
    'M_EAGGD': [('rate', lambda h: _r(h.get('sum_social_bfae_totl_amt'), h.get('sum_bfae_totl_amt')))],
    'M_FBHIF': [('rate', lambda h: _r(h.get('self_biz_bdg_tott_amt'), h.get('bfae_totl_amt')))],
    'M_GAECF': [('rate', lambda h: _r(h.get('total'), h.get('pfa_amt1')))],
    'M_DDJAB': [('boe_rt', lambda h: _r(h.get('boe'), h.get('ane_stl_amt')))],
    'M_DADBC': [('lcl_asmb_exps_rt', lambda h: _r(h.get('lcl_asmb_exps'), h.get('ane_stl_amt')))],
    'M_GJFHC': [('goem_lbst_rt', lambda h: _r(h.get('goem_lbst'), h.get('ane_stl_amt')))],
    'M_HEDFC': [('rate', lambda h: _r(h.get('pfa_amt1'), h.get('pfa_amt2')))],
    'M_UNIST': [('rate', lambda h: _r((h.get('pfa_amt1') or 0) - (h.get('pfa_amt4') or 0), h.get('pfa_amt4')))],
    'M_ELYET': [('rate1', lambda h: _r(h.get('exe_amt'), h.get('erex_trgt_amt'))),
                ('rate2', lambda h: _r(h.get('exe_amt'), h.get('erex_gls_amt')))],
    'M_GAEJG': [('rate', lambda h: _r(h.get('pfa_amt1'), h.get('pfa_amt2')))],
}
# 같은 지자체·같은 연도에서 서로 다른 허브가 같은 금액을 따로 공개하는 짝 (L3)
CROSS = [
    ('FISCAL', 'pfa_amt1', 'M_FDOST', 'pfa_amt1', 1), ('FISCAL', 'pfa_amt2', 'M_FDOST', 'pfa_amt3', 1), ('FISCAL', 'pfa_amt3', 'M_FDOST', 'pfa_amt4', 1),
    ('SR', 'pfa_amt1', 'AU', 'pfa_amt1', 1), ('SR', 'pfa_amt2', 'AU', 'pfa_amt3', 1), ('SR', 'pfa_amt3', 'AU', 'pfa_amt4', 1),
    ('ACC', 'gen_acnt_amt', 'M_EAGGD', 'sum_bfae_totl_amt', 1), ('ACC', 'gen_acnt_amt', 'M_FBHIF', 'bfae_totl_amt', 1),
    ('ACC', 'gen_acnt_amt', 'M_HCDIB', 'bfae_totl_amt', 1000),
    ('EXEC', 'pfa_amt1', 'M_GAECF', 'pfa_amt1', 1), ('EXEC', 'pfa_amt1', 'M_DDJAB', 'ane_stl_amt', 1),
    ('EXEC', 'pfa_amt1', 'M_DADBC', 'ane_stl_amt', 1), ('EXEC', 'pfa_amt1', 'M_GJFHC', 'ane_stl_amt', 1),
    ('M_BJHJB', 'pptn_num', 'M_HCDIB', 'pptn_num', 1),
]
# ARBGT(예산총계, 별도 허브) ↔ ACEXBG
ARBGT_MAP = [('ane_tott_amt', 'pfa_amt1'), ('gen_acnt_amt', 'pfa_amt2'), ('pbco_spc_acnt_amt', 'pfa_amt3'), ('etc_spc_acnt_amt', 'pfa_amt4'), ('fnd_amt', 'pfa_amt5')]

EXEC_YMD = lambda y, e: e.get('exe_ymd') or f'{y}1231'

# ─────────────────────────────── L1 ───────────────────────────────
def decode_rows(lg, y):
    e = lg['exec'][y]; D = lg.get('dict') or []
    g = lambda i: None if i is None else D[i]
    out = []
    for a in e.get('rows') or []:
        if lg.get('rows_v') == 2:
            out.append({'c': a[0], 'n': g(a[1]), 'f': g(a[2]), 'p': g(a[3]), 'a': g(a[4]), 'b': a[5], 'e': a[6],
                        'nt': a[7] if len(a) > 7 else None, 'cp': a[8] if len(a) > 8 else None,
                        'sg': a[9] if len(a) > 9 else None, 'x': 1 if len(a) > 10 and a[10] else 0})
        else:
            out.append(a)
    return out

def l1_exec(L, cd, lg, y):
    key = f'exec:{y}'; e = lg['exec'][y]; rows = decode_rows(lg, y)
    S = e.get('sum') or {}
    if not rows:
        L.mark(cd, key, 'L1', False, '원본 행이 없는데 합계가 있음' if S else '원본 행 없음'); return
    b = sum(r['b'] or 0 for r in rows); ex = sum(r['e'] or 0 for r in rows)
    chk = [('예산현액 합계', S.get('budget'), b), ('집행액 합계', S.get('exec'), ex)]
    # 재원(국비·시도비·시군구비)은 2026 원본 행에만 저장돼 있다. 행에 없는 해는 여기서 판정하지 않고 L2(API 원본 합)로 확인한다.
    if any(r.get('nt') is not None or r.get('cp') is not None for r in rows):
        nt = sum(r.get('nt') or 0 for r in rows); cp = sum(r.get('cp') or 0 for r in rows); sg = sum(r.get('sg') or 0 for r in rows)
        chk += [('국비 합계', S.get('ntep'), nt), ('시도비 합계', S.get('capep'), cp), ('시군구비 합계', S.get('sggep'), sg)]  # 기타 재원(etc)은 API etc_amt 합이라 행에서 다시 만들 수 없음 → L2에서 확인
    for nm, st, calc in chk:
        if not same(st, calc): L.mark(cd, key, 'L1', False, f'{nm} 저장 {st} ≠ 원본 행 합 {calc}')
    rate = round(ex / b * 100, 1) if b else None
    if not near(S.get('rate'), rate, 1): L.mark(cd, key, 'L1', False, f'집행률 저장 {S.get("rate")} ≠ 재계산 {rate}')
    if e.get('rows_total') != len(rows): L.mark(cd, key, 'L1', False, f'행 수 저장 {e.get("rows_total")} ≠ 원본 {len(rows)}')
    nd = len({r['c'] for r in rows})
    if e.get('dbiz_count') not in (nd, len(rows)): L.mark(cd, key, 'L1', False, f'세부사업 수 저장 {e.get("dbiz_count")} ≠ 원본 {nd}')
    for grp, fld in (('by_fld', 'f'), ('by_acnt', 'a')):
        agg = {}
        for r in rows:
            o = agg.setdefault(r[fld] or '기타', {'b': 0, 'e': 0, 'k': 0}); o['b'] += r['b'] or 0; o['e'] += r['e'] or 0; o['k'] += 1
        st = e.get(grp) or {}
        if set(st) != set(agg): L.mark(cd, key, 'L1', False, f'{grp} 항목 불일치 {sorted(set(st) ^ set(agg))[:4]}')
        for k, v in st.items():
            a = agg.get(k)
            if not a or not same(v.get('b'), a['b']) or not same(v.get('e'), a['e']):
                L.mark(cd, key, 'L1', False, f'{grp}[{k}] 저장 {v} ≠ 원본 {a}'); break
    if e.get('exe_ymd') is None or not e.get('src'): L.mark(cd, key, 'L1', False, '출처·기준일 표시 없음')
    L.mark(cd, key, 'L1', True)

def l1_fis(L, cd, lg, y, hub, h):
    key = f'fis:{hub}:{y}'
    for f, fn in FORM.get(hub, []):
        st = h.get(f)
        if st is None: continue
        try: calc = fn(h)
        except Exception: calc = None
        if calc is None: continue
        ok = near(st, calc) if hub not in ('ACC', 'EXEC') else same(st, calc)
        if ok is False: L.mark(cd, key, 'L1', False, f'{f} 저장 {st} ≠ 같은 표 금액으로 재계산 {round(calc, 4)}')
    L.mark(cd, key, 'L1', True)

def l3_crosshub(L, cd, y, F):
    for h1, f1, h2, f2, mult in CROSS:
        a = (F.get(h1) or {}).get(f1); b = (F.get(h2) or {}).get(f2)
        if a is None or b is None: continue
        ok = abs(a - b * mult) <= max(1, mult / 2) * 1.0001
        why = f'{h1}.{f1} {a:,} ↔ {h2}.{f2}×{mult} {b * mult:,}'
        L.mark(cd, f'fis:{h1}:{y}', 'L3', ok, None if ok else '다른 허브와 금액 불일치 ' + why)
        L.mark(cd, f'fis:{h2}:{y}', 'L3', ok, None if ok else '다른 허브와 금액 불일치 ' + why)

def l1_index(L, cd, row, lg):
    """index.json(목록·순위·홈 합계용)이 원자료 파일과 같은지"""
    F = lg.get('fiscal') or {}; fx = row.get('fiscal') or {}
    sy = row.get('settle_fyr') or '2024'; by = row.get('budget_fyr') or '2026'
    pairs = [
        (f'fis:FISCAL:{sy}', fx.get('sr_rate2'), (F.get(sy, {}).get('FISCAL') or {}).get('rate2')),
        (f'fis:EXEC:{sy}', fx.get('stl_total'), (F.get(sy, {}).get('EXEC') or {}).get('tot_pfa_amt')),
        (f'fis:M_HEDFC:{sy}', fx.get('debt_rate'), (F.get(sy, {}).get('M_HEDFC') or {}).get('rate')),
        (f'fis:ACC:{by}', fx.get('acc_total'), (F.get(by, {}).get('ACC') or {}).get('ane_tott_amt')),
        (f'fis:M_BJHJB:{sy}', row.get('pop_2024'), (F.get(sy, {}).get('M_BJHJB') or {}).get('pptn_num')),
        ('x:integrity_2025', row.get('integrity_2025'), (lg.get('extra') or {}).get('integrity_2025')),
        ('x:bank_rate_2026', row.get('bank_rate_2026'), (lg.get('extra') or {}).get('bank_rate_2026')),
    ]
    for key, a, b in pairs:
        if a is None and b is None: continue
        if not same(a, b): L.mark(cd, key, 'L1', False, f'목록(index.json) {a} ≠ 원자료 파일 {b}')
    e26 = (lg.get('exec') or {}).get('2026'); ie = row.get('exec_2026')
    if e26 or ie:
        S = (e26 or {}).get('sum') or {}
        pr = [('exe_ymd', (ie or {}).get('exe_ymd'), (e26 or {}).get('exe_ymd')), ('budget', (ie or {}).get('budget'), S.get('budget')),
              ('exec', (ie or {}).get('exec'), S.get('exec')), ('rate', (ie or {}).get('rate'), S.get('rate')), ('dbiz', (ie or {}).get('dbiz'), (e26 or {}).get('dbiz_count'))]
        for nm, a, b in pr:
            if not same(a, b): L.mark(cd, 'exec:2026', 'L1', False, f'목록 exec_2026.{nm} {a} ≠ 원자료 파일 {b}')

def l1_extra(L, cd, row, lg):
    X = lg.get('extra') or {}
    v = X.get('integrity_2025')
    if v is not None: L.mark(cd, 'x:integrity_2025', 'L1', isinstance(v, int) and 1 <= v <= 5, f'청렴도 등급 범위 밖 {v}')
    v = X.get('bank_rate_2026')
    if v is not None: L.mark(cd, 'x:bank_rate_2026', 'L1', 0 < float(v) < 10, f'금고 이자율 범위 밖 {v}')
    s = row.get('safety_2025')
    if s is not None: L.mark(cd, 'ix:safety_2025', 'L1', isinstance(s, list) and len(s) == 6 and all(isinstance(t, int) and 1 <= t <= 5 for t in s), f'안전지수 형식 {s}')
    c = row.get('civil_2025')
    if c is not None: L.mark(cd, 'ix:civil_2025', 'L1', c in ('가', '나', '다', '라', '마'), f'민원평가 등급 {c}')

# ─────────────────────────────── L2 ───────────────────────────────
def api_hub(code, fyr):
    rows, pi = [], 1
    while True:
        d = http_json(f'{BASE}/api/lofin?' + urllib.parse.urlencode({'hub': code, 'fyr': fyr, 'pSize': 400, 'pIndex': pi}))
        if not d or not d.get('ok'): return None
        rs = d.get('rows') or []
        rows += rs
        if len(rs) < 400 or len(rows) >= (d.get('total') or 0): break
        pi += 1
    return rows

def l2_fiscal(L, lgs, years, workers=6):
    hubs = {}
    for cd, lg in lgs.items():
        for k, v in (lg.get('hubs') or {}).items(): hubs[k] = v['hub']
    jobs = [(k, code, y) for k, code in hubs.items() for y in years] + [('ARBGT', 'ARBGT', y) for y in years]
    got = {}
    with cf.ThreadPoolExecutor(workers) as ex:
        fut = {ex.submit(api_hub, code, y): (k, y) for k, code, y in jobs}
        for f in cf.as_completed(fut): got[fut[f]] = f.result()
    miss = [f'{k}/{y}' for (k, y), v in got.items() if v is None]
    for cd, lg in lgs.items():
        codes = [cd] + list((lg['master'].get('prev_codes') or []))
        for y, F in (lg.get('fiscal') or {}).items():
            if y not in years: continue
            for hub, h in F.items():
                rows = got.get((hub, y))
                if rows is None: continue   # API 장애 — 판정 보류(통과 아님)
                api = next((r for r in rows if str(r.get('laf_cd')) in codes), None)
                key = f'fis:{hub}:{y}'
                if not api:
                    L.mark(cd, key, 'L2', False, f'API {lg["hubs"][hub]["hub"]} {y}에 이 지자체 행이 없음(저장값 출처 불명)'); continue
                bad = [f'{f} 저장 {v} ≠ API {api.get(f)}' for f, v in h.items() if not same(v, api.get(f))]
                L.mark(cd, key, 'L2', not bad, '; '.join(bad[:3]))
            # L3: ACEXBG ↔ ARBGT
            acc = F.get('ACC'); ar = got.get(('ARBGT', y))
            if acc and ar:
                a2 = next((r for r in ar if str(r.get('laf_cd')) in codes), None)
                if a2:
                    bad = [f'{f1} {acc.get(f1)} ↔ ARBGT.{f2} {a2.get(f2)}' for f1, f2 in ARBGT_MAP if acc.get(f1) is not None and not same(acc.get(f1), a2.get(f2))]
                    L.mark(cd, f'fis:ACC:{y}', 'L3', not bad, '예산총계 별도 허브(ARBGT)와 불일치 ' + '; '.join(bad[:2]))
    return miss

def api_exec_rows(cd, y, ymd):
    rows, pi, total = [], 1, None
    while True:
        d = http_json(f'{BASE}/api/lofin?' + urllib.parse.urlencode({'hub': 'QWGJK', 'fyr': y, 'laf_cd': cd, 'exe_ymd': ymd, 'pSize': 1000, 'pIndex': pi}))
        if not d or not d.get('ok'): return None, None
        total = d.get('total'); rs = d.get('rows') or []; rows += rs
        if len(rs) < 1000 or len(rows) >= (total or 0): break
        pi += 1
    return rows, total

def api_exec_count(cd, y, ymd):
    d = http_json(f'{BASE}/api/lofin?' + urllib.parse.urlencode({'hub': 'QWGJK', 'fyr': y, 'laf_cd': cd, 'exe_ymd': ymd, 'pSize': 1, 'pIndex': 1}))
    if not d or not d.get('ok'): return None
    return d.get('total')

def l2_exec_one(lg, cd, y, full):
    e = lg['exec'][y]; ymd = EXEC_YMD(y, e)
    if not full:
        t = api_exec_count(cd, y, ymd)
        if t is None: return (cd, y, None, 'API 응답 없음(보류)')
        return (cd, y, t == e.get('rows_total'), f'행 수 저장 {e.get("rows_total")} ≠ API {t}' if t != e.get('rows_total') else 'count')
    rows, total = api_exec_rows(cd, y, ymd)
    if rows is None: return (cd, y, None, 'API 응답 없음(보류)')
    dec = decode_rows(lg, y)
    has_src = any(r.get('nt') is not None or r.get('cp') is not None for r in dec)   # 재원은 2026 행에만 저장
    norm = lambda s: re.sub(r'\s+', ' ', str(s or '')).strip()
    mine = sorted((r['c'], norm(r['n']), norm(r['f']), norm(r['a']), r['b'] or 0, r['e'] or 0) + ((r.get('nt') or 0, r.get('cp') or 0, r.get('sg') or 0) if has_src else ()) for r in dec)
    theirs = sorted((str(r.get('dbiz_cd')), norm(r.get('dbiz_nm')), norm(r.get('fld_nm')), norm(r.get('acnt_dv_nm')), r.get('bdg_cash_amt') or 0, r.get('ep_amt') or 0) + ((r.get('bdg_ntep') or 0, r.get('capep') or 0, r.get('sggep') or 0) if has_src else ()) for r in rows)
    S = e.get('sum') or {}
    api_sum = {'budget': sum(r.get('bdg_cash_amt') or 0 for r in rows), 'exec': sum(r.get('ep_amt') or 0 for r in rows),
               'ntep': sum(r.get('bdg_ntep') or 0 for r in rows), 'capep': sum(r.get('capep') or 0 for r in rows),
               'sggep': sum(r.get('sggep') or 0 for r in rows), 'etc': sum(r.get('etc_amt') or 0 for r in rows)}
    bad_sum = [f'{k} 저장 {S.get(k)} ≠ API 합 {v}' for k, v in api_sum.items() if k in S and not same(S.get(k), v)]
    if bad_sum: return (cd, y, False, '; '.join(bad_sum[:3]))
    if total is not None and total != len(rows): return (cd, y, None, f'API 쪽 받기 불완전 {len(rows)}/{total}(보류)')
    if mine == theirs: return (cd, y, True, 'rows')
    sm, st = set(mine), set(theirs)
    only_m, only_t = list(sm - st)[:2], list(st - sm)[:2]
    return (cd, y, False, f'원본 행 {len(mine)}줄 vs API {len(theirs)}줄, 저장에만 {len(sm - st)}줄 {only_m} / API에만 {len(st - sm)}줄 {only_t}')

# ─────────────────────────────── L3 (집행 ↔ 결산·예산 범위) ───────────────────────────────
def l3_exec_range(L, cd, lg):
    """세부사업 집행(QWGJK)은 결산(AJGCF)·예산(ACEXBG)과 정의가 달라 같을 수는 없지만,
    다른 지자체 자료가 섞이거나 쪽이 빠지면 몇 배씩 어긋난다. 그 큰 어긋남을 잡는다."""
    F = lg.get('fiscal') or {}; E = lg.get('exec') or {}
    for y, e in E.items():
        S = e.get('sum') or {}
        acc = (F.get(y) or {}).get('ACC')
        if acc and S.get('budget'):
            base = sum(acc.get(k) or 0 for k in ('gen_acnt_amt', 'pbco_spc_acnt_amt', 'etc_spc_acnt_amt'))
            if base:
                r = S['budget'] / base
                L.mark(cd, f'exec:{y}', 'L3', 0.95 <= r <= 2.6, f'예산현액 {S["budget"]:,} / 본예산(회계 합) {base:,} = {r:.2f}배 — 범위(0.95~2.6) 밖')
        ex = (F.get(y) or {}).get('EXEC')
        if ex and S.get('exec') and str(e.get('exe_ymd', '')).endswith('1231'):
            base = sum(ex.get(k) or 0 for k in ('pfa_amt1', 'pfa_amt2', 'pfa_amt3'))
            if base:
                r = S['exec'] / base
                L.mark(cd, f'exec:{y}', 'L3', 0.75 <= r <= 1.25, f'연말 집행 {S["exec"]:,} / 세출결산(회계 합) {base:,} = {r:.2f} — 범위(0.75~1.25) 밖')

# ─────────────────────────────── 선관위 ───────────────────────────────
def l2_pledge(L, lgs, pledge):
    W = {}
    for code, n in (('3', 16), ('4', 227)):
        pg = 1
        while True:
            d = http_json(f'{BASE}/api/contract?' + urllib.parse.urlencode({'nec': 'WinnerInfoInqireService2/getWinnerInfoInqire', 'sgId': '20260603', 'sgTypecode': code, 'pageNo': pg, 'numOfRows': 100}))
            items = (d or {}).get('items') or []
            if isinstance(items, dict): items = [items]
            for it in items: W[(it.get('sdName'), it.get('wiwName') if code == '4' else it.get('sdName'))] = it
            if len(items) < 100: break
            pg += 1
    if len(W) < 200: return f'선관위 당선인 응답 부족({len(W)})'
    for cd, p in (pledge.get('lg') or {}).items():
        w = p.get('w') or {}
        if not w: continue
        it = W.get((w.get('sd'), w.get('wiw')))
        ok = bool(it) and it.get('name') == w.get('name') and (it.get('jdName') or '') == (w.get('party') or '')
        L.mark(cd, 'pl:w', 'L2', ok, f'저장 {w.get("sd")} {w.get("wiw")} {w.get("name")}({w.get("party")}) ≠ 선관위 {it.get("name") if it else "없음"}({it.get("jdName") if it else ""})')
        m = (lgs.get(cd) or {}).get('master') or {}
        L.mark(cd, 'pl:w', 'L3', w.get('sd') in (m.get('sido_new'), m.get('sido_2024'), (m.get('display_new') or '').split(' ')[0]) or not m,
               f'당선인 시·도 {w.get("sd")} ≠ 지자체 시·도 {m.get("sido_new")}')
    return None

# ─────────────────────────────── 원문 문서에서 온 값 (API 없는 자료) ───────────────────────────────
# tools/sources/*.json 은 정부 원문(PDF·HWPX·CSV)을 사이트 저장값을 보지 않고 새로 읽어 만든 대조표다.
# 원문 파일 위치·쪽·해시와 추출 방법이 파일 안에 적혀 있다. 여기서는 저장값이 그 원문 값과 같은지 본다.
SRC = os.path.join(ROOT, 'tools', 'sources')
def load_src(name):
    p = os.path.join(SRC, name)
    try: return json.load(open(p, encoding='utf-8'))
    except Exception: return None

def l1_docs(L, lgs, rows, ix):
    have = set()
    base = [cd for cd, r in rows.items() if r.get('key_2024')]
    # 종합청렴도 — 원문 결과보고서 등급표, 교차: 보도자료 붙임6 전 기관 표(235건 일치 확인)
    s = load_src('integrity_2025.json')
    if s:
        have.add('x:integrity_2025'); V = s['values']; cc = s.get('crosscheck') or {}
        for cd in rows:
            st = rows[cd].get('integrity_2025'); ex = ((lgs.get(cd) or {}).get('extra') or {}).get('integrity_2025'); src = V.get(cd)
            if st is None and ex is None and src is None: continue
            L.mark(cd, 'x:integrity_2025', 'L1', same(st, src) and same(ex, src), f'저장 {st} ≠ 원문 등급표 {src}')
            if cc.get('all_match') and src is not None: L.mark(cd, 'x:integrity_2025', 'L3', True)
    # 금고 이자율 — 원문 보도자료 붙임 표, 교차: 지방재정365 게시본(243행×4열 일치)
    s = load_src('bank_rate_2026.json')
    if s:
        have.add('x:bank_rate_2026'); V = s['values']; cc = s.get('crosscheck') or {}
        for cd in rows:
            st = rows[cd].get('bank_rate_2026'); ex = ((lgs.get(cd) or {}).get('extra') or {}).get('bank_rate_2026'); src = V.get(cd)
            if st is None and ex is None and src is None: continue
            L.mark(cd, 'x:bank_rate_2026', 'L1', same(st, src) and same(ex, src), f'저장 {st} ≠ 원문 {src}')
            if cc.get('all_match') and src is not None: L.mark(cd, 'x:bank_rate_2026', 'L3', True)
    # 지역안전지수 — 원문 산출결과 HWPX, 교차: 보도자료 1등급 명단(시·도)
    s = load_src('safety_2025.json')
    if s:
        have.add('ix:safety_2025'); V = s['values']; one = (s.get('crosscheck') or {}).get('grade1', {})
        for cd in rows:
            st = rows[cd].get('safety_2025'); src = V.get(cd)
            if st is None and src is None: continue
            L.mark(cd, 'ix:safety_2025', 'L1', st == src, f'저장 {st} ≠ 원문 {src}')
        for cd, fields in one.items():
            src = V.get(cd) or []
            for i in fields: L.mark(cd, 'ix:safety_2025', 'L3', len(src) > i and src[i] == 1, f'보도자료 1등급 명단과 다름(분야 {i})')
    # 민원·적극행정·혁신 평가, 합동평가
    s = load_src('gov_eval_2025.json')
    if s:
        D = s.get('datasets') or {}
        for key, fld in (('ix:civil_2025', 'civil_2025'), ('ix:active_2025', 'active_2025'), ('ix:innov_2025', 'innov_2025')):
            d = D.get(key)
            if not d or d.get('missing'): continue
            have.add(key); V = d.get('values') or {}
            for cd in rows:
                st = rows[cd].get(fld); src = V.get(cd)
                if st is None and src is None: continue
                L.mark(cd, key, 'L1', same(st, src), f'저장 {st} ≠ 원문 {src}')
        d = D.get('ix:joint')
        if d and not d.get('missing'):
            have.add('ix:joint'); V = d.get('values') or {}; J = ix.get('joint') or {}
            for cd in set(V) | set(J):
                a = {x['y']: x for x in J.get(cd, [])}; b = {x['y']: x for x in V.get(cd, [])}
                bad = []
                for y in sorted(set(a) | set(b)):
                    for f in ('q', 'qr', 's', 'p'):
                        va = (a.get(y) or {}).get(f); vb = (b.get(y) or {}).get(f)
                        if f == 'qr' and isinstance(va, str): va = re.sub(r'\(공동\)', '', va).strip() or None   # 화면용 '공동' 표시는 순위 값이 아님
                        if not same(va, vb): bad.append(f'{y}.{f} 저장 {va} ≠ 원문 {vb}')
                L.mark(cd, 'ix:joint', 'L1', not bad, '; '.join(bad[:3]))
    # 재정공시 확장 6종 — 원문 기준: 지방재정365 허브(BQBRB·DIJGH·GGAED·CHEDJ·DJAIH·CHFJJ), 남해군 재정공시 원문으로 뜻 확인
    s = load_src('ext_demo.json')
    if s:
        D = s.get('datasets') or {}
        d = D.get('x:ext_2024')
        if d and not d.get('missing'):
            have.add('x:ext_2024'); V = d.get('values') or {}
            for cd, lg in lgs.items():
                st = (lg.get('extra') or {}).get('ext_2024'); src = V.get(cd)
                if not st and not src: continue
                if not st or not src: L.mark(cd, 'x:ext_2024', 'L1', False, f'저장 {bool(st)} / 원문 {bool(src)} 한쪽만 있음'); continue
                bad = []
                for f in ('gender_budget_rate', 'subsidy_rate', 'reserve_rate', 'guarantee_debt_rate'):
                    if not same(st.get(f), src.get(f)): bad.append(f'{f} {st.get(f)}≠{src.get(f)}')
                for f in ('fund_balance_eok', 'public_property_eok'):
                    raw = ((d.get('raw') or {}).get(cd) or {})
                    won = (raw.get('DJAIH') or {}).get('pfa_amt5_won') if f == 'fund_balance_eok' else (raw.get('CHFJJ') or {}).get('pfa_amt2_won')
                    exp = round(won / 1e8) if won is not None else (round(src.get(f)) if src.get(f) is not None else None)
                    if not same(st.get(f), exp): bad.append(f'{f} {st.get(f)}≠{exp}')
                L.mark(cd, 'x:ext_2024', 'L1', not bad, '; '.join(bad[:3]))
        d = D.get('x:demo_202607')
        if d and not d.get('missing'):
            have.add('x:demo_202607'); V = d.get('values') or {}
            for cd, lg in lgs.items():
                st = (lg.get('extra') or {}).get('demo_202607'); src = V.get(cd)
                if not st: continue
                bad = [f'{f} {st.get(f)}≠{(src or {}).get(f)}' for f in ('households', 'youth_ratio', 'over70_ratio') if st.get(f) is not None and not same(st.get(f), (src or {}).get(f))]
                L.mark(cd, 'x:demo_202607', 'L1', bool(src) and not bad, '; '.join(bad[:3]) or '원문에 없음')
    return have

def l1_sido(L, lgs, rows):
    """시·도 정책 요약(data/sido.txt): 항목 숫자가 출처 원문에 그대로 있는지(L1, tools/verify_sido.py 결과),
    시·도 예산 총액 문장이 지방재정365 예산총계와 같은지(L3)"""
    s = load_src('sido_items.json')
    if not s: return set()
    try: D = load_b64gz(os.path.join(ROOT, 'data', 'sido.txt'))
    except Exception: return set()
    hq = {r['sido_new']: cd for cd, r in rows.items() if r.get('level') == '광역' and r.get('live_2026') is not False}
    for z in D['sidos']:
        cd = hq.get(z['sido_new'])
        if not cd: continue
        for it in z['items']:
            r = (s.get('items') or {}).get(it['id']) or {}
            st = r.get('status')
            if st == 'ok': L.mark(cd, 'sd:item:' + it['id'], 'L1', True)
            elif st == 'mismatch': L.mark(cd, 'sd:item:' + it['id'], 'L1', False, '출처 원문에 없는 숫자: ' + ', '.join(r.get('missing') or [])[:120])
            elif st == 'no_src': L.mark(cd, 'sd:item:' + it['id'], 'L1', False, '출처 URL 없음')
            else: L.mark(cd, 'sd:item:' + it['id'], 'L1', False, '출처 원문을 받지 못해 대조 못 함')
        bt = z.get('budget_total') or ''
        if not bt: continue
        r = (s.get('sido') or {}).get(z['sido_new']) or {}
        if r.get('status') == 'ok': L.mark(cd, 'sd:budget', 'L1', True)
        elif r.get('status') == 'mismatch': L.mark(cd, 'sd:budget', 'L1', False, '출처 원문에 없는 숫자: ' + ', '.join(r.get('missing') or []))
        acc = (((lgs.get(cd) or {}).get('fiscal') or {}).get('2026') or {}).get('ACC')
        m = re.search(r'(?:(\d+)조\s*)?(?:([\d,]+)억)\s*원', bt) or re.search(r'(\d+)조\s*원', bt)
        if acc and m:
            v = int(m.group(1) or 0) * 10000 + (int(m.group(2).replace(',', '')) if m.lastindex and m.lastindex >= 2 and m.group(2) else 0)
            a = round(sum(acc.get(k) or 0 for k in ('gen_acnt_amt', 'pbco_spc_acnt_amt', 'etc_spc_acnt_amt')) / 1e8); b = round((acc.get('ane_tott_amt') or 0) / 1e8)
            first = bt.split('(')[1] if '(' in bt else ''
            if v in (a, b): L.mark(cd, 'sd:budget', 'L3', True)
            elif re.search(r'예산안|제출|브리핑', first[:40]) and min(abs(v - a), abs(v - b)) <= 0.01 * b:
                L.mark(cd, 'sd:budget', 'L3', True)   # 예산안(의회 제출) 값이라 확정 본예산과 1% 안에서 다름 — 문장에 '예산안'이라고 밝혀 있음
            else: L.mark(cd, 'sd:budget', 'L3', False, f'문장 첫 금액 {v:,}억 ≠ 지방재정365 2026 본예산 {a:,}억(회계) / {b:,}억(기금 포함)')
    return {'sd:item', 'sd:budget'}

EXT_HUBS = [('gender_budget_rate', 'BQBRB', 'smy_cntt_amt_rt', None), ('subsidy_rate', 'DIJGH', 'lsa_rt', None), ('reserve_rate', 'GGAED', 'rate', None),
            ('guarantee_debt_rate', 'CHEDJ', 'rate', None), ('fund_balance_eok', 'DJAIH', 'pfa_amt5', 1e8), ('public_property_eok', 'CHFJJ', 'pfa_amt2', 1e8)]
def l2_ext(L, lgs):
    got = {h: api_hub(h, 2024) for _, h, _, _ in EXT_HUBS}
    if any(v is None for v in got.values()): return 'ext_2024 API 일부 무응답(보류)'
    for cd, lg in lgs.items():
        st = (lg.get('extra') or {}).get('ext_2024')
        if not st: continue
        bad = []
        for f, h, af, div in EXT_HUBS:
            r = next((x for x in got[h] if str(x.get('laf_cd')) == cd), None)
            if r is None: bad.append(f'{h}에 행 없음'); continue
            v = r.get(af); exp = round(v / div) if (div and v is not None) else v
            if not same(st.get(f), exp): bad.append(f'{f} 저장 {st.get(f)} ≠ API {h}.{af} {exp}')
        L.mark(cd, 'x:ext_2024', 'L2', not bad, '; '.join(bad[:3]))
    return None

# ─────────────────────────────── 계약대장 ───────────────────────────────
def l1_ctrt(L, cd, K, nat):
    """계약 요약(data/ctrt/<cd>.txt): 연도 합 = 전체, 분야 합 = 전체, 목록(index.json ctrt_nat) = 파일"""
    bad = []
    Y = {y: v for y, v in (K.get('y') or {}).items() if re.fullmatch(r'\d{4}', y)}
    T = K.get('t') or {}
    if Y and T:
        if sum(v.get('n') or 0 for v in Y.values()) != T.get('n'): bad.append(f'연도별 건수 합 ≠ 전체 {T.get("n")}')
        if sum(v.get('a') or 0 for v in Y.values()) != T.get('a'): bad.append(f'연도별 금액 합 ≠ 전체 {T.get("a")}')
    fl = K.get('fl') or {}
    if fl and T:
        if sum(v[0] for v in fl.values()) != T.get('n') or sum(v[1] for v in fl.values()) != T.get('a'): bad.append('분야별 합 ≠ 전체')
    for y, v in Y.items():
        f2 = v.get('fl') or {}
        if f2 and (sum(x[0] for x in f2.values()) != v.get('n') or sum(x[1] for x in f2.values()) != v.get('a')): bad.append(f'{y} 분야별 합 ≠ 연도 합계')
    me = ((nat or {}).get('lg') or {}).get(cd)
    if me:
        for y, v in (me.get('y') or {}).items():
            k = Y.get(y) or {}
            for f in ('r10', 'n'):
                if f in v and not same(v.get(f), k.get(f)): bad.append(f'목록 {y}.{f} {v.get(f)} ≠ 파일 {k.get(f)}')
            if 'a' in v and k.get('a') is not None and v.get('a') != round(k['a'] / 1e4):   # 목록은 만원 단위
                bad.append(f'목록 {y}.a {v.get("a")}만원 ≠ 파일 {k.get("a")}원')
            for f in ('cr5', 'hhi'):
                if f in v and not same(v.get(f), (k.get('c') or {}).get(f)): bad.append(f'목록 {y}.{f} ≠ 파일')
    L.mark(cd, 'ct', 'L1', not bad, '; '.join(bad[:3]))

def l3_ctrt(L, cd, K, lg):
    """계약금액을 같은 해 예산(세부사업 예산현액·본예산)과 교차: 한 해 계약 합계나 계약 한 건이 그해 예산 전체를
    넘어서면 원자료 금액 칸 오기(날짜·관리번호가 금액으로 들어간 행)다. 2026-09-18에 6건 확인(구미 1경원 등)."""
    E = (lg or {}).get('exec') or {}; F = (lg or {}).get('fiscal') or {}
    def budget(y):
        b = ((E.get(y) or {}).get('sum') or {}).get('budget')
        if b: return b
        acc = (F.get(y) or {}).get('ACC')
        return acc.get('ane_tott_amt') if acc else None
    bad = []
    for y, v in (K.get('y') or {}).items():
        if not re.fullmatch(r'\d{4}', y): continue
        b = budget(y)
        if b and (v.get('a') or 0) > 1.5 * b: bad.append(f'{y}년 계약 합계 {v.get("a"):,}원이 그해 예산 {b:,}원의 {v["a"] / b:.0f}배')
    for r in K.get('r') or []:
        b = budget(str(r[0])[:4])
        if b and r[5] > 0.5 * b: bad.append(f'계약 1건 {r[5]:,}원({r[0]} {str(r[1])[:18]})이 그해 예산의 절반을 넘음')
    ok = not bad
    L.mark(cd, 'ct', 'L3', ok, ('원자료 금액 오기 의심: ' + '; '.join(bad[:2])) if bad else None)

def l2_ctrt_one(cd, K, n_dates=3):
    """저장해 둔 계약 행(K.r) 가운데 날짜 몇 개를 골라 지방재정365 계약현황(WCEGCF)을 그 날짜·지자체로 다시 불러 같은 계약이 있는지"""
    R = K.get('r') or []
    if not R: return (cd, None, '표본 행 없음')
    dates = sorted({r[0] for r in R})
    day = int(datetime.datetime.now(KST).strftime('%j'))
    pick = [dates[(day * 7 + i * 13) % len(dates)] for i in range(min(n_dates, len(dates)))]
    miss, changed = [], []
    built = str(K.get('built_at') or '')[:10].replace('-', '')
    for d in pick:
        j = http_json(f'{BASE}/api/lofin?' + urllib.parse.urlencode({'hub': 'WCEGCF', 'smz_ctrt_ymd': d, 'laf_cd': cd, 'pSize': 1000}))
        if not j or not j.get('ok'): return (cd, None, f'API 응답 없음 {d}(보류)')
        rows = j.get('rows') or []
        api = {(str(x.get('ctrt_trgt_nm') or '').strip(), str(x.get('clt_nm') or '').strip(), x.get('ctrt_tot_tott_amt')) for x in rows}
        for r in R:
            if r[0] != d: continue
            if (str(r[1]).strip(), str(r[4]).strip(), r[5]) in api: continue
            # 같은 계약(이름·업체)이 있는데 금액만 다르고, 원자료가 수집 뒤에 고쳐졌으면(data_crt_ymd > 수집일) 변경계약 — 저장값이 틀린 게 아니라 수집 시점 값이다
            core = lambda t: re.sub(r'\([^)]*\)|\s+', '', str(t or ''))
            def alike(a2, b2):
                a2, b2 = core(a2), core(b2)
                return a2 == b2 or (min(len(a2), len(b2)) >= 8 and (a2.startswith(b2) or b2.startswith(a2)))
            vend = [x for x in rows if str(x.get('clt_nm') or '').strip() == str(r[4]).strip()]
            same_ct = [x for x in vend if str(x.get('ctrt_trgt_nm') or '').strip() == str(r[1]).strip()] or [x for x in vend if alike(x.get('ctrt_trgt_nm'), r[1])]
            # 원자료 수정일이 수집일 이후(같은 날 포함)면 변경계약·계약해지 표시 등 사후 수정
            amt_hit = [x for x in same_ct if x.get('ctrt_tot_tott_amt') == r[5]]
            if amt_hit and all(str(x.get('data_crt_ymd') or '') >= built for x in amt_hit): changed.append(f'{d} {r[1][:16]}')   # 금액은 같고 이름만 수집 뒤 바뀜
            elif not amt_hit and same_ct and any(str(x.get('data_crt_ymd') or '') >= built for x in same_ct): changed.append(f'{d} {r[1][:16]}')   # 수집 뒤 금액이 고쳐짐
            else: miss.append(f'{d} {r[1][:20]} {r[4]} {r[5]:,}')
    if miss: return (cd, False, f'API에 없는 저장 계약 {len(miss)}건: ' + '; '.join(miss[:2]))
    return (cd, True, ('changed:' + str(len(changed))) if changed else 'ok')

# ─────────────────────────────── L4 기대값 ───────────────────────────────
def expect_for(cd, row, lg, idx_rows, L):
    F = lg.get('fiscal') or {}; y24 = F.get('2024') or {}; e26 = (lg.get('exec') or {}).get('2026')
    ex = {}
    ok = lambda k: L.status(cd, k) == 'ok'
    if e26 and ok('exec:2026'):
        S = e26['sum']; ex['e26_rate'] = S.get('rate'); ex['e26_dbiz'] = e26.get('dbiz_count'); ex['e26_ymd'] = e26.get('exe_ymd')
        ex['e26_budget'] = S.get('budget'); ex['e26_exec'] = S.get('exec')
    if y24.get('FISCAL') and ok('fis:FISCAL:2024'): ex['sr_rate2'] = y24['FISCAL'].get('rate2')
    if y24.get('M_BJHJB') and ok('fis:M_BJHJB:2024') and not lg['master'].get('bnd_2026'): ex['pop'] = y24['M_BJHJB'].get('pptn_num')
    # 순위(재정자립도) — 화면 rank()와 같은 규칙: key_2024 있는 곳 중 큰 값이 앞
    arr = [r for r in idx_rows if r.get('key_2024') and (r.get('fiscal') or {}).get('sr_rate2') is not None and L.status(r['laf_cd'], 'fis:FISCAL:2024') != 'fail']
    me = next((r for r in arr if r['laf_cd'] == cd), None)
    if me:
        v = me['fiscal']['sr_rate2']
        ex['sr_rank'] = [1 + sum(1 for r in arr if r['fiscal']['sr_rate2'] > v), len(arr)]
    return ex

# ─────────────────────────────── 실행 ───────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--api', action='store_true'); ap.add_argument('--full', action='store_true')
    ap.add_argument('--rotate', type=int, default=35, help='--api일 때 원본 행 전체 대조를 하루에 몇 곳 할지')
    ap.add_argument('--only', default='')
    ap.add_argument('--workers', type=int, default=6)
    a = ap.parse_args()
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    ix = json.load(open(os.path.join(ROOT, 'data/index.json'), encoding='utf-8'))
    pledge = json.load(open(os.path.join(ROOT, 'data/pledge.json'), encoding='utf-8'))
    rows = {r['laf_cd']: r for r in ix['rows']}
    only = set(a.only.split(',')) if a.only else None
    lgs = {}
    L = Ledger()
    for cd in rows:
        if only and cd not in only: continue
        p = os.path.join(ROOT, 'data', cd + '.txt')
        if not os.path.exists(p): L.mark(cd, 'file', 'L1', False, '원자료 파일 없음'); continue
        try: lgs[cd] = load_b64gz(p)
        except Exception as e: L.mark(cd, 'file', 'L1', False, f'원자료 파일 해독 실패 {e}'); continue
    # L1 + L3(내부)
    for cd, lg in lgs.items():
        for y in (lg.get('exec') or {}): l1_exec(L, cd, lg, y)
        for y, F in (lg.get('fiscal') or {}).items():
            for hub, h in F.items(): l1_fis(L, cd, lg, y, hub, h)
            l3_crosshub(L, cd, y, F)
        l3_exec_range(L, cd, lg)
        l1_index(L, cd, rows[cd], lg)
        l1_extra(L, cd, rows[cd], lg)
    have_docs = l1_docs(L, lgs, rows, ix) | l1_sido(L, lgs, rows)
    stale_ct = {}
    ctrt = {}
    for cd in lgs:
        pc = os.path.join(ROOT, 'data', 'ctrt', cd + '.txt')
        if os.path.exists(pc):
            try: ctrt[cd] = load_b64gz(pc)
            except Exception as e: L.mark(cd, 'ct', 'L1', False, f'계약 파일 해독 실패 {e}'); continue
            l1_ctrt(L, cd, ctrt[cd], ix.get('ctrt_nat'))
            l3_ctrt(L, cd, ctrt[cd], lgs.get(cd))
    notes = []
    if a.api:
        err = l2_ext(L, lgs)
        if err: notes.append(err)
        with cf.ThreadPoolExecutor(a.workers) as ex:
            for cd, ok, why in ex.map(lambda kv: l2_ctrt_one(kv[0], kv[1]), ctrt.items()):
                if ok is None: notes.append(f'{cd} 계약: {why}'); continue
                L.mark(cd, 'ct', 'L2', ok, None if ok else why)
                if ok and str(why).startswith('changed:'): stale_ct[cd] = int(why.split(':')[1])
        years = sorted({y for lg in lgs.values() for y in (lg.get('fiscal') or {})})
        miss = l2_fiscal(L, lgs, years, a.workers)
        if miss: notes.append('API 무응답(판정 보류): ' + ', '.join(miss))
        # 집행: 행 수는 전수, 원본 행 한 줄씩 대조는 --full 이면 전부, 아니면 날짜로 순환
        tasks = []
        order = sorted(lgs)
        day = int(datetime.datetime.now(KST).strftime('%j'))
        chunk = set(order[(day * a.rotate) % len(order):][:a.rotate]) | set(order[:max(0, (day * a.rotate) % len(order) + a.rotate - len(order))])
        for cd, lg in lgs.items():
            for y in (lg.get('exec') or {}):
                tasks.append((cd, y, a.full or cd in chunk))
        done = 0
        with cf.ThreadPoolExecutor(a.workers) as ex:
            futs = [ex.submit(l2_exec_one, lgs[cd], cd, y, full) for cd, y, full in tasks]
            for f in cf.as_completed(futs):
                cd, y, ok, why = f.result(); done += 1
                if ok is None: notes.append(f'{cd} exec {y}: {why}'); continue
                L.mark(cd, f'exec:{y}', 'L2', ok, why if not ok else None)
                if ok and why == 'rows': L.r[cd][f'exec:{y}']['L2rows'] = TODAY
                if done % 200 == 0: print(f'  집행 대조 {done}/{len(tasks)} ({int(time.time() - t0)}초)', flush=True)
        err = l2_pledge(L, lgs, pledge)
        if err: notes.append(err)
    # 선관위 당선인 ↔ 지자체 시·도 (오프라인 L3)
    for cd, p in (pledge.get('lg') or {}).items():
        w = p.get('w') or {}; m = (lgs.get(cd) or {}).get('master') or {}
        if w and m: L.mark(cd, 'pl:w', 'L3', w.get('sd') in (m.get('sido_new'), m.get('sido_2024'), (m.get('display_new') or '').split(' ')[0]), f'당선인 시·도 {w.get("sd")} ≠ 지자체 {m.get("sido_new")}')
    # L4 기대값
    idx_rows = ix['rows']
    expect = {cd: expect_for(cd, rows[cd], lg, idx_rows, L) for cd, lg in lgs.items()}
    json.dump({'built_at': TODAY, 'base': BASE, 'lg': expect}, open(os.path.join(OUT, 'expect.json'), 'w'), ensure_ascii=False)
    # ── 판정표 ──
    deny = {}
    for cd, ks in L.r.items():
        bad = sorted(k for k in ks if L.status(cd, k) == 'fail')
        if bad: deny[cd] = bad
    # 종류별 적용 층(화면 허용 목록): 두 겹 이상 독립 확인이 구현된 종류만 화면에 낸다
    types = {
        'exec': ['L1', 'L2', 'L3', 'L5'],
        **{f'fis:{h}': (['L1', 'L2', 'L3', 'L5'] if any(h in (c[0], c[2]) for c in CROSS) or h == 'ACC' else ['L1', 'L2', 'L5']) for h in FORM},
        'pl:w': ['L2', 'L3', 'L5'],
        'ct': ['L1', 'L2', 'L5'],
        **{k: v for k, v in {
            'x:integrity_2025': ['L1', 'L3', 'L5'], 'x:bank_rate_2026': ['L1', 'L3', 'L5'], 'ix:safety_2025': ['L1', 'L3', 'L5'],
            'x:ext_2024': ['L1', 'L2', 'L5'], 'x:demo_202607': ['L1', 'L5'],
            'ix:civil_2025': ['L1', 'L5'], 'ix:active_2025': ['L1', 'L5'], 'ix:innov_2025': ['L1', 'L5'], 'ix:joint': ['L1', 'L5'],
            'sd:item': ['L1'], 'sd:budget': ['L1', 'L3'],
        }.items() if k in have_docs},
    }
    prev = {}
    if os.path.exists(STATUS):
        try: prev = json.load(open(STATUS, encoding='utf-8'))
        except Exception: prev = {}
    status = {
        'v': 1, 'checked_at': datetime.datetime.now(KST).strftime('%Y-%m-%d %H:%M'),
        'api': bool(a.api),
        'layers': LAYERS,
        'types': types,
        'types_note': '여기 없는 종류의 값은 두 겹 이상 확인이 끝날 때까지 화면에 내지 않는다',
        'deny': deny,
        'deny_why': {cd: {k: L.r[cd][k]['why'][:3] for k in ks} for cd, ks in deny.items()},
        'summary': {},
    }
    # API 층(L2)에서 막힌 것은 따로 적어 둔다. 오프라인 실행은 API를 부르지 않으므로 마지막 API 판정을 그대로 이어받는다.
    if a.api:
        status['deny_api'] = {cd: [k for k in ks if L.r[cd][k].get('L2') is False] for cd, ks in deny.items()}
        status['deny_api'] = {cd: ks for cd, ks in status['deny_api'].items() if ks}
        status['api_checked_at'] = status['checked_at']
    else:
        status['deny_api'] = prev.get('deny_api') or {}
        status['api'] = bool(prev.get('api_checked_at')); status['api_checked_at'] = prev.get('api_checked_at')
        for cd, ks in status['deny_api'].items():
            for k in ks:
                if k not in status['deny'].get(cd, []):
                    status['deny'].setdefault(cd, []).append(k)
                    status['deny_why'].setdefault(cd, {})[k] = (prev.get('deny_why') or {}).get(cd, {}).get(k, ['마지막 API 대조에서 막힘'])
    deny = status['deny']
    # 수집 뒤 원자료가 고쳐진 계약(변경계약) — 틀린 값은 아니지만 수집 시점 값이라는 것을 화면에 알린다
    if a.api: status['stale_ct'] = stale_ct
    else: status['stale_ct'] = prev.get('stale_ct') or {}
    n_inst = sum(len(v) for v in L.r.values()); n_fail = sum(len(v) for v in deny.values())
    layer_cnt = {Lk: sum(1 for v in L.r.values() for e in v.values() if e.get(Lk) is True) for Lk in LAYERS}
    status['summary'] = {'datasets': n_inst, 'blocked': n_fail, 'lgs': len(lgs), 'passed_by_layer': layer_cnt, 'notes': notes[:20]}
    os.makedirs(os.path.dirname(STATUS), exist_ok=True)
    # 서버가 매일 API를 다시 불러 맞춰 볼 저장값(화면에 나가는 해만): data/verify/snap.json
    snap = {'v': 1, 'built_at': status['checked_at'], 'hubs': {}, 'lg': {}}
    for cd, lg in lgs.items():
        o = {}
        for y in ('2024', '2026'):
            for hub, h in ((lg.get('fiscal') or {}).get(y) or {}).items():
                snap['hubs'][hub] = lg['hubs'][hub]['hub']
                o.setdefault('f', {}).setdefault(y, {})[hub] = h
        e = (lg.get('exec') or {}).get('2026')
        if e: o['e'] = {'y': '2026', 'ymd': e.get('exe_ymd'), 'n': e.get('rows_total'), 'b': (e.get('sum') or {}).get('budget'), 'x': (e.get('sum') or {}).get('exec')}
        o['codes'] = [cd] + list(lg['master'].get('prev_codes') or [])
        snap['lg'][cd] = o
    json.dump(snap, open(os.path.join(ROOT, 'data', 'verify', 'snap.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(status, open(STATUS, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump({'built_at': TODAY, 'r': L.r}, open(os.path.join(OUT, 'data-ledger.json'), 'w'), ensure_ascii=False)
    # 보고서
    by = {}
    for it in L.issues: by.setdefault((it['key'].split(':')[0] + ':' + it['key'].split(':')[1] if ':' in it['key'] else it['key'], it['layer']), []).append(it)
    md = [f'# 숫자 5중 검증 보고 ({status["checked_at"]} KST)', '',
          f'- 지자체 {len(lgs)}곳, 판정한 자료 묶음 {n_inst:,}개, **막힌 묶음 {n_fail}개** (화면에서 비움)',
          '- 층별 통과 묶음 수: ' + ', '.join(f'{k} {LAYERS[k]} {v:,}' for k, v in layer_cnt.items()),
          f'- API 대조: {"함" if a.api else "안 함(오프라인)"}' + (' · 집행 원본 행 전수' if a.full else ''), '']
    for n in notes[:20]: md.append(f'- 참고: {n}')
    md += ['', '## 막힌 값', '']
    for cd, ks in sorted(deny.items()):
        nm = rows.get(cd, {}).get('display', cd)
        for k in ks: md.append(f'- {nm} ({cd}) `{k}` — ' + ' / '.join(status['deny_why'].get(cd, {}).get(k) or []))
    if not deny: md.append('없음')
    open(os.path.join(OUT, 'data-verify.md'), 'w', encoding='utf-8').write('\n'.join(md) + '\n')
    print('\n'.join(md[:8]))
    print(f'막힌 묶음 {n_fail}개 — audit-out/data-verify.md ({int(time.time() - t0)}초)')
    sys.exit(1 if n_fail else 0)

if __name__ == '__main__':
    main()
