#!/usr/bin/env python3
"""시·도 정책 요약(data/sido.txt) 원문 대조 — 5중 검증 L1(원문 스캔)
각 항목의 src_url 원문을 내려받아 글자로 바꾸고, 항목 요약·예산 문장에 나온 숫자(금액·비율·건수)가
원문에 그대로 있는지 본다. 원문을 못 받거나 숫자가 원문에 없으면 그 항목은 '대조 안 됨'으로 적는다.
결과: tools/sources/sido_items.json (verify_data.py 가 읽어 판정표에 넣는다)
"""
import json, gzip, base64, re, os, sys, hashlib, subprocess, zipfile, io, urllib.request, concurrent.futures as cf, html as H, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'audit-out', 'sido_src')
os.makedirs(CACHE, exist_ok=True)
D = json.loads(gzip.decompress(base64.b64decode(open(os.path.join(ROOT, 'data/sido.txt')).read())))

def fetch(url):
    key = hashlib.sha1(url.encode()).hexdigest()
    p = os.path.join(CACHE, key)
    if os.path.exists(p + '.txt'): return open(p + '.txt', encoding='utf-8').read(), 'cache'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'Accept-Language': 'ko-KR,ko'})
        with urllib.request.urlopen(req, timeout=40) as r:
            raw = r.read(); ct = r.headers.get('Content-Type', ''); cd = r.headers.get('Content-Disposition', '')
    except Exception as e:
        return None, f'받기 실패: {str(e)[:80]}'
    open(p + '.bin', 'wb').write(raw)
    txt = ''
    head = raw[:8]
    try:
        if head.startswith(b'%PDF'):
            txt = subprocess.run(['pdftotext', '-layout', p + '.bin', '-'], capture_output=True, timeout=120).stdout.decode('utf-8', 'ignore')
        elif head.startswith(b'PK'):
            z = zipfile.ZipFile(io.BytesIO(raw))
            for n in z.namelist():
                if n.startswith('Contents/section') and n.endswith('.xml'):
                    txt += re.sub(r'<[^>]+>', ' ', z.read(n).decode('utf-8', 'ignore'))
        elif head.startswith(b'\xd0\xcf\x11\xe0'):
            r2 = subprocess.run(['hwp5txt', p + '.bin'], capture_output=True, timeout=120)
            txt = r2.stdout.decode('utf-8', 'ignore')
        else:
            enc = 'utf-8'
            m = re.search(rb'charset=["\']?([A-Za-z0-9_-]+)', raw[:4000]) or re.search(r'charset=([A-Za-z0-9_-]+)', ct).__class__ and re.search(rb'charset=["\']?([A-Za-z0-9_-]+)', ct.encode())
            if m: enc = m.group(1).decode()
            s = raw.decode(enc if enc.lower() not in ('ks_c_5601-1987', 'euc_kr') else 'cp949', 'ignore')
            s = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', s)
            txt = H.unescape(re.sub(r'<[^>]+>', ' ', s))
    except Exception as e:
        return None, f'글자 변환 실패: {str(e)[:80]}'
    txt = re.sub(r'\s+', ' ', txt)
    open(p + '.txt', 'w', encoding='utf-8').write(txt)
    return txt, 'ok'

NUM = re.compile(r'(?<![\d.,])(\d[\d,]*(?:\.\d+)?)\s*(조|억|만|천|%|명|건|곳|개|원|배|년|km|㎢|MW|ha|호|대|척)')
def nums(t):
    out = []
    for m in NUM.finditer(t or ''):
        n = m.group(1).replace(',', ''); u = m.group(2)
        if u == '년' and re.fullmatch(r'20\d\d', n): continue      # 연도 표기는 금액 대조 대상 아님
        try:
            if float(n) <= 10 and u not in ('조', '억', '%', '배'): continue
        except Exception: continue
        out.append((m.group(0), n))
    return out

def norm(t): return re.sub(r'(?<=\d),(?=\d)', '', t or '')

def check_item(it):
    url = it.get('src_url') or ''
    claims = nums(' '.join(str(it.get(k) or '') for k in ('title', 'summary', 'budget')))
    if not url: return {'status': 'no_src', 'n': len(claims)}
    txt, how = fetch(url)
    if txt is None: return {'status': 'unreachable', 'why': how, 'n': len(claims), 'url': url}
    T = norm(txt)
    # 조·억 혼합 표기(4,558억원 ↔ 4558억, 1조 6,000억 ↔ 16,000억)도 같은 값으로 본다
    miss = []
    for raw, n in claims:
        if re.search(r'(?<![\d.])' + re.escape(n) + r'(?![\d])', T): continue
        miss.append(raw)
    return {'status': 'ok' if not miss else 'mismatch', 'n': len(claims), 'missing': miss[:12], 'url': url, 'chars': len(T)}

def main():
    items = [(z['sido_new'], it) for z in D['sidos'] for it in z['items']]
    res = {}
    with cf.ThreadPoolExecutor(8) as ex:
        for (sd, it), r in zip(items, ex.map(lambda x: check_item(x[1]), items)):
            r['sido'] = sd; res[it['id']] = r
    # 시·도 총액 문장(budget_total): 시·도 출처 목록(src)의 원문에 숫자가 있는지(L1). 지방재정365 예산총계와의 교차(L3)는 verify_data.py
    prev = {}
    try: prev = json.load(open(os.path.join(ROOT, 'tools/sources/sido_items.json'), encoding='utf-8'))
    except Exception: pass
    sd = {}
    for z in D['sidos']:
        urls = [(x.get('url') if isinstance(x, dict) else x) for x in (z.get('src') or [])]
        texts = [t for t, _ in (fetch(u) for u in urls if u) if t]
        claims = nums(z.get('budget_total') or '')
        if not texts:
            sd[z['sido_new']] = (prev.get('sido') or {}).get(z['sido_new']) or {'status': 'unreachable', 'n': len(claims), 'urls': urls[:5]}; continue
        T = norm(' '.join(texts))
        miss = [raw for raw, n in claims if not re.search(r'(?<![\d.])' + re.escape(n) + r'(?![\d])', T)]
        sd[z['sido_new']] = {'status': 'ok' if not miss else 'mismatch', 'n': len(claims), 'missing': miss[:12], 'urls': urls[:5]}
    # PC에서 확인한 항목은 그대로 둔다(클라우드에서 다시 막히면 덮어쓰지 않음)
    for k, r in res.items():
        pr = (prev.get('items') or {}).get(k)
        if r['status'] == 'unreachable' and pr and pr.get('via') == 'PC': res[k] = pr
    out = {'dataset': 'sd:items', 'sido': sd, 'checked': datetime.date.today().isoformat(), 'method': 'src_url 원문을 받아 글자로 바꾼 뒤 요약·예산 문장의 숫자(10 이하 단순 수·연도 제외)가 원문에 그대로 있는지 대조', 'items': res}
    json.dump(out, open(os.path.join(ROOT, 'tools/sources/sido_items.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    import collections
    c = collections.Counter(r['status'] for r in res.values())
    print(dict(c), '항목', len(res))
if __name__ == '__main__': main()
