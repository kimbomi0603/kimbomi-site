#!/usr/bin/env python3
"""
2026 세부사업 집행 자료를 '오늘 기준'으로 다시 받아 저장 자료를 바꾼다 (2026-11-02 신설).

왜 있나
  지자체 화면은 열 때마다 지방재정365에서 최신 집행을 다시 받아 보여 주지만(budget365.html liveExec),
  첫 화면 목록·순위·합계(data/index.json)와 저장 자료(data/<코드>.txt)는 마지막으로 갱신한 날에 멈춰 있다.
  이 스크립트는 화면의 liveExec와 같은 규칙으로 243곳 전부를 다시 받아 저장 자료와 목록을 같은 기준일로 맞춘다.
  매주 예약 작업이 돌린다. 끝나면 반드시 tools/verify_data.py --api 로 5중 검증을 다시 돌린다.

규칙 (budget365.html liveExec 와 같다)
  - 저장 기준일보다 새 기준일 중 가장 최근 날(오늘부터 21일 전까지, 행 5개 이상)을 찾는다.
  - 그날 행을 쪽 단위로 전부 받는다. 받은 행 수가 API 전체 건수와 다르면 쓰지 않는다(쪽 누락 = 가짜 합계).
  - 이전 저장값과 교차: 집행액이 2% 넘게 줄거나, 예산현액이 0.9~1.35배 밖이거나, 행 수가 20% 넘게 변하면 쓰지 않는다.
  - 못 받거나 어긋난 곳은 손대지 않는다(저장된 이전 기준일 값이 그대로 남고, 화면에 그 기준일이 찍힌다).
  - 숫자를 만들거나 추정하지 않는다. 합계·집행률·분야/회계별 합은 받은 원본 행에서만 계산한다.

실행
  python3 tools/refresh_exec.py               # 전체
  python3 tools/refresh_exec.py --only 4681000,2914000
  python3 tools/refresh_exec.py --dry         # 파일은 그대로 두고 결과만 출력
결과
  data/<코드>.txt 의 exec['2026'], data/index.json 의 rows[].exec_2026, audit-out/refresh-exec.md
"""
import argparse, base64, concurrent.futures as cf, datetime, gzip, json, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.environ.get('KB_BASE', 'https://www.xn--4k0b53xuva.com')
KST = datetime.timezone(datetime.timedelta(hours=9))
SRC = '행정안전부 지방재정365 OpenAPI /lf/hub/QWGJK(세부사업별 세출)'


def api(params, tries=4, timeout=90):
    url = f'{BASE}/api/lofin?' + urllib.parse.urlencode(params)
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'kimbomi-refresh/1.0'})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                d = json.loads(r.read().decode('utf-8'))
            if d.get('ok'):
                return d
            last = d
        except Exception as e:  # 네트워크 오류는 잠시 뒤 다시
            last = {'ok': False, 'error': str(e)}
        time.sleep(2 + 3 * i)
    return last


def load_lg(cd):
    return json.loads(gzip.decompress(base64.b64decode(open(os.path.join(ROOT, 'data', cd + '.txt'), 'rb').read())))


def save_lg(cd, lg):
    js = json.dumps(lg, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    open(os.path.join(ROOT, 'data', cd + '.txt'), 'wb').write(base64.b64encode(gzip.compress(js, compresslevel=9, mtime=0)))


def days_back(n=21):
    t = datetime.datetime.now(KST)
    return [(t - datetime.timedelta(days=i)).strftime('%Y%m%d') for i in range(n)]


def latest_day(cd, cur):
    """저장 기준일(cur)보다 새 날 가운데 행이 5개 이상 있는 가장 최근 날 (오늘부터 21일 전까지)."""
    for day in days_back():
        if cur and day <= cur:
            break
        j = api({'hub': 'QWGJK', 'fyr': 2026, 'laf_cd': cd, 'exe_ymd': day, 'pSize': 5, 'pIndex': 1})
        if j and j.get('ok') and (j.get('total') or 0) >= 5:
            return day, j['total']
    return None, None


def refresh_one(cd):
    lg = load_lg(cd)
    base = (lg.get('exec') or {}).get('2026')
    if not base:
        return cd, 'skip', '2026 집행 자료 없음', None
    cur = str(base.get('exe_ymd') or '')
    day, total = latest_day(cd, cur)
    if not day:
        return cd, 'same', f'새 기준일 없음(저장 {cur})', None
    pages = -(-total // 1000)
    if pages > 20:
        return cd, 'fail', f'행 {total}개 — 너무 많음', None
    rows = []
    for p in range(1, pages + 1):
        j = api({'hub': 'QWGJK', 'fyr': 2026, 'laf_cd': cd, 'exe_ymd': day, 'pSize': 1000, 'pIndex': p})
        if not j or not j.get('ok'):
            return cd, 'fail', f'{day} {p}쪽 받기 실패', None
        rows += [r for r in (j.get('rows') or []) if str(r.get('laf_cd', cd)) == str(cd)]
    if len(rows) != total:
        return cd, 'fail', f'받은 행 {len(rows)} ≠ 전체 {total} — 쓰지 않음', None
    rows = [r for r in rows if r.get('dbiz_cd')]
    if len(rows) < 5:
        return cd, 'fail', '받은 행이 너무 적음', None
    num = lambda v: int(round(float(v))) if v not in (None, '') else 0
    b = sum(num(r.get('bdg_cash_amt')) for r in rows)
    e = sum(num(r.get('ep_amt')) for r in rows)
    B0 = base.get('sum') or {}
    bad = []
    if B0.get('exec') is not None and e < B0['exec'] * 0.98: bad.append('집행액이 2% 넘게 줄어듦')
    if B0.get('budget') is not None and (b < B0['budget'] * 0.9 or b > B0['budget'] * 1.35): bad.append('예산현액 비정상 변동')
    if base.get('rows_total') and abs(len(rows) - base['rows_total']) > base['rows_total'] * 0.2: bad.append('행 수 20% 넘게 변동')
    if bad:
        return cd, 'fail', f'{day}: 이전 저장값({cur})과 어긋나 쓰지 않음 — ' + ', '.join(bad), None
    # 원본 행 → 저장 형식(rows_v 2: [코드, 이름, 분야, 부문, 회계, 예산현액, 집행액, 국비, 시도비, 시군구비, 이상표시])
    D = lg.setdefault('dict', [])
    ix = {s: i for i, s in enumerate(D)}
    def di(s):
        s = s if s is not None else ''
        if s not in ix:
            ix[s] = len(D); D.append(s)
        return ix[s]
    if lg.get('rows_v') != 2:
        return cd, 'fail', '저장 형식이 rows_v 2가 아님', None
    enc, by_fld, by_acnt = [], {}, {}
    nt = cp = sg = et = 0
    for r in rows:
        bb, ee = num(r.get('bdg_cash_amt')), num(r.get('ep_amt'))
        n1, n2, n3 = num(r.get('bdg_ntep')), num(r.get('capep')), num(r.get('sggep'))
        x = 1 if (bb < 0 or ee < 0 or n1 < 0 or n2 < 0 or n3 < 0 or ee > bb) else 0
        enc.append([str(r['dbiz_cd']), di(r.get('dbiz_nm') or ''), di(r.get('fld_nm') or ''), di(r.get('part_nm') or ''), di(r.get('acnt_dv_nm') or ''), bb, ee, n1, n2, n3, x])
        nt += n1; cp += n2; sg += n3; et += num(r.get('etc_amt'))
        for grp, k in ((by_fld, r.get('fld_nm') or '기타'), (by_acnt, r.get('acnt_dv_nm') or '기타')):
            o = grp.setdefault(k, {'b': 0, 'e': 0, 'k': 0}); o['b'] += bb; o['e'] += ee; o['k'] += 1
    rate = round(e / b * 1000) / 10 if b else None
    new = dict(base)
    new.update({'exe_ymd': day, 'fetched_at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z'), 'src': SRC,
                'rows_total': len(enc), 'dbiz_count': len({a[0] for a in enc}),
                'sum': {'budget': b, 'exec': e, 'rate': rate, 'ntep': nt, 'capep': cp, 'sggep': sg, 'etc': et},
                'by_fld': by_fld, 'by_acnt': by_acnt, 'rows': enc})
    lg['exec']['2026'] = new
    summary = {'exe_ymd': day, 'budget': b, 'exec': e, 'rate': rate, 'dbiz': new['dbiz_count']}
    return cd, 'ok', f'{cur} → {day} · 행 {len(enc)} · 집행률 {B0.get("rate")}% → {rate}%', (lg, summary)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--workers', type=int, default=6)
    a = ap.parse_args()
    I = json.load(open(os.path.join(ROOT, 'data', 'index.json'), encoding='utf-8'))
    cds = [r['laf_cd'] for r in I['rows'] if r.get('exec_2026')]
    if a.only:
        cds = [c for c in cds if c in a.only.split(',')]
    print('대상', len(cds), '곳')
    res = {}
    with cf.ThreadPoolExecutor(a.workers) as ex:
        for i, (cd, st, msg, payload) in enumerate(ex.map(refresh_one, cds), 1):
            res[cd] = (st, msg)
            if payload and not a.dry:
                save_lg(cd, payload[0])
                for r in I['rows']:
                    if r['laf_cd'] == cd:
                        r['exec_2026'] = payload[1]
            if i % 40 == 0:
                print(f'  {i}/{len(cds)}')
    if not a.dry:
        json.dump(I, open(os.path.join(ROOT, 'data', 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    cnt = {}
    for st, _ in res.values():
        cnt[st] = cnt.get(st, 0) + 1
    now = datetime.datetime.now(KST).strftime('%Y-%m-%d %H:%M')
    md = [f'# 2026 집행 자료 갱신 ({now} KST)', '', f'- 대상 {len(cds)}곳 · 갱신 {cnt.get("ok", 0)} · 새 기준일 없음 {cnt.get("same", 0)} · 실패·보류 {cnt.get("fail", 0)}', '']
    md += [f'- {cd} [{st}] {msg}' for cd, (st, msg) in sorted(res.items()) if st != 'ok']
    os.makedirs(os.path.join(ROOT, 'audit-out'), exist_ok=True)
    open(os.path.join(ROOT, 'audit-out', 'refresh-exec.md'), 'w', encoding='utf-8').write('\n'.join(md) + '\n')
    print('\n'.join(md[:3]))
    for cd, (st, msg) in list(sorted(res.items()))[:5]:
        print(' ', cd, st, msg)


if __name__ == '__main__':
    main()
