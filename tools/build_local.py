# -*- coding: utf-8 -*-
"""지역 탐방 정적 쪽 생성 — local/<laf_cd>.html 과 local.html(허브)
자료: data/index.json(지자체 목록·예산), data/local/tour.json(한국관광공사 TourAPI, 코드별 100곳),
      data/local/visitors.json(한국관광 데이터랩 지역별 방문자 수, 2024·2025·2026년 9월 합계)
맛집 순위·낱말 검색·의회 회의록은 쪽을 열 때 /api/local 로 불러온다.
쓰기: python3 tools/build_local.py   (sitemap.xml 의 <!-- local:start -->…<!-- local:end --> 블록도 다시 쓴다)
"""
import json, os, re, sys, html, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_entry import load_verify, won, pct, ymd, short

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://www.xn--4k0b53xuva.com'
TODAY = datetime.date.today().isoformat()
MONTH = '2026년 9월'
CSSV = '20261124'
def esc(s): return html.escape(str(s if s is not None else ''), quote=True)

SIDO = {'서울특별시':('11','서울','서울'),'전남광주통합특별시':('12','전남','전남·광주'),'부산광역시':('26','부산','부산'),'대구광역시':('27','대구','대구'),'인천광역시':('28','인천','인천'),'대전광역시':('30','대전','대전'),'울산광역시':('31','울산','울산'),'세종특별자치시':('36','세종특별자치시','세종'),'경기도':('41','경기','경기'),'충청북도':('43','충북','충북'),'충청남도':('44','충남','충남'),'경상북도':('47','경북','경북'),'경상남도':('48','경남','경남'),'제주특별자치도':('50','제주특별자치도','제주'),'강원특별자치도':('51','강원특별자치도','강원'),'전북특별자치도':('52','전북특별자치도','전북')}
TYPE = {'12':'관광지','14':'문화시설','15':'축제·행사','25':'여행코스','28':'레포츠','32':'숙박','38':'쇼핑','39':'음식점'}
FOOD_CHIPS = ['한정식','국밥','횟집','고기','국수','백반','카페','빵집','치킨','해장국']

DUP = {'고성군'}

def man(v):
    """방문자 수(연인원) → '123만' / '9,870'"""
    if v is None: return '—'
    v = float(v)
    if v >= 1e8: return f"{v/1e8:.2f}억"
    if v >= 1e4: return f"{v/1e4:,.0f}만" if v >= 1e5 else f"{v/1e4:.1f}만"
    return f"{int(round(v)):,}"

def load():
    ix = json.load(open(os.path.join(ROOT, 'data/index.json'), encoding='utf-8'))
    tour = json.load(open(os.path.join(ROOT, 'data/local/tour.json'), encoding='utf-8'))
    dl = json.load(open(os.path.join(ROOT, 'data/local/visitors.json'), encoding='utf-8'))
    global RANK
    try: RANK = json.load(open(os.path.join(ROOT, 'data/local/rank.json'), encoding='utf-8'))
    except Exception: RANK = {}
    return ix, tour, dl

def codes_for(r, dl):
    """index.json 한 줄 → 데이터랩·관광공사 코드 목록(구가 있는 시는 구 코드 여러 개)"""
    sc = SIDO[r['sido_new']][0]
    if r['level'] == '광역': return [sc]
    nm = short(r['display']); sg = dl['sgg2026']
    ex = [c for c, v in sg.items() if c.startswith(sc) and v['name'] == nm]
    pre = sorted(c for c, v in sg.items() if c.startswith(sc) and v['name'].startswith(nm + ' '))
    return ex + pre

def vis(r, cs, dl):
    """3개년 방문자 — 값이 없으면 None(만들지 않는다)"""
    out = {}
    sc = SIDO[r['sido_new']][0]; nm = short(r['display'])
    for y in ('2024', '2025', '2026'):
        if r['level'] == '광역':
            S = dl['sido' + y]; keys = [sc] if sc in S else (['29', '46'] if sc == '12' else [])
            keys = [k for k in keys if k in S]
            if sc == '12' and y != '2026': keys = []   # 통합 전에는 광주↔전남 이동이 외지인으로 잡혀 견줄 수 없다
            rows = [S[k] for k in keys]
        else:
            S = dl['sgg' + y]
            if y == '2026': want = cs
            else:
                pf = [sc] if sc != '12' else (['29'] if nm.endswith('구') else ['46'])
                ex = [c for c, v in S.items() if c[:2] in pf and v['name'] == nm]
                pre = [c for c, v in S.items() if c[:2] in pf and v['name'].startswith(nm + ' ')]
                want = ex or pre
            # 정확한 이름이 있으면 그것만(구 합계와 겹치지 않게)
            exact = [c for c in want if c in S and S[c]['name'] == nm]
            want = exact or want
            rows = [S[c] for c in want if c in S]
        if not rows: out[y] = None; continue
        out[y] = {k: sum(x[k] for x in rows) for k in ('local', 'outside', 'foreign')}
    return out

def items_for(cs, tour, r):
    seen = set(); its = []
    use = cs
    if r['level'] != '광역' and len(cs) > 1:
        kids = [c for c in cs if tour.get(c, {}).get('items')]
        use = kids
    for c in use:
        for x in tour.get(c, {}).get('items', []):
            if x['id'] in seen: continue
            seen.add(x['id']); its.append(x)
    if len(use) > 1: its.sort(key=lambda x: (0 if x['i'] else 1))
    total = sum(int(tour.get(c, {}).get('total') or 0) for c in use)
    return its, total

def shell():
    s = open(os.path.join(ROOT, 'privacy.html'), encoding='utf-8').read()
    a = s.index('<header class="kbx-hdr">'); hdr = s[a:s.index('</header>', a) + 9] + '\n'
    f = s.index('<footer class="kbx-foot">'); ftr = s[f:s.index('</footer>') + 9]
    fix = lambda t: re.sub(r'(href|src)="(?!https?:|/|#|mailto:|tel:)([^"]+)"', r'\1="/\2"', t)
    return fix(hdr), fix(ftr)

def head(title, desc, url, ld, extra=''):
    return f"""<!DOCTYPE html>
<html lang="ko" class="pg-local">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{url}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="website"><meta property="og:site_name" content="김보미.com">
<meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(desc)}"><meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/og.jpg?v=20261111">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@700&display=swap" media="print" onload="this.media='all'">
<link rel="stylesheet" href="/assets/kb.css?v=20261117">
<link rel="stylesheet" href="/assets/kb-local.css?v={CSSV}">
<script src="/assets/kb-prefs.js" defer></script>
<script src="/assets/kb-dark.js" defer></script>
{''.join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>' + chr(10) for x in ld)}{extra}</head>
<body class="pg-privacy pg-local">
<a class="kb-skip" href="#lx-main">본문 바로가기</a>
"""

def card(x):
    img = f'<img src="{esc(x["i"])}" alt="{esc(x["t"])}" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="400" height="300" onerror="this.remove()">' if x['i'] else ''
    cr = '<u>ⓒ한국관광공사</u>' if x['i'] else ''
    u = 'https://map.kakao.com/?q=' + esc(re.sub(r'\s+', '+', x['t']))
    return f'<li class="lx-card"><a href="{u}" target="_blank" rel="noopener"><span class="lx-ph">{img}<i>{TYPE.get(x["k"], "")}</i>{cr}</span><span class="lx-cb"><b>{esc(x["t"])}</b><small>{esc(x["a"] or "")}</small></span></a></li>'

def build():
    ix, tour, dl = load(); vok = load_verify(); HDR, FTR = shell()
    rows = [r for r in ix['rows'] if r['sido_new'] in SIDO and '(2024 공시)' not in r['display']]
    pages = []
    for r in rows:
        cs = codes_for(r, dl)
        if not cs: continue   # 2026년 행정구역에 없는 옛 자치구(인천 중구·동구)
        nm = short(r['display']) if r['level'] != '광역' else SIDO[r['sido_new']][2]
        if r['level'] != '광역':
            sn = SIDO[r['sido_new']][2]
            if r['sido_new'] == '전남광주통합특별시': sn = '광주' if nm.endswith('구') else '전남'
            if (nm.endswith('구') and ' ' not in nm) or nm in DUP: nm = sn + ' ' + nm
        full = r['display'].replace(' 본청', '')
        if r['level'] == '광역': region = SIDO[r['sido_new']][1]
        else:
            sq = SIDO[r['sido_new']][1]
            if r['sido_new'] == '전남광주통합특별시' and short(r['display']).endswith('구'): sq = '광주'
            region = sq + ' ' + short(r['display'])
        pages.append(dict(r=r, cs=cs, nm=nm, full=full, region=region, v=vis(r, cs, dl)))
    by_sido = {}
    for p in pages: by_sido.setdefault(p['r']['sido_new'], []).append(p)
    urls = []
    for p in pages:
        r = p['r']; cd = r['laf_cd']; nm = p['nm']; full = p['full']; v = p['v']
        its, total = items_for(p['cs'], tour, r)
        sights = [x for x in its if x['k'] in ('12', '14', '28')]
        rk = [re.sub(r'\s+', '', n) for n in RANK.get(cd, [])]
        cl = lambda x: re.sub(r'\s+', '', re.sub(r'\(.*?\)|\[.*?\]', '', x['t']))
        got = {}
        for i, n in enumerate(rk):   # 순위 이름 하나에 관광지 하나만 짝짓는다(같은 이름이 줄줄이 앞에 오지 않게)
            c = [x for x in sights if x['id'] not in got and (cl(x) == n or (len(n) >= 3 and (n in cl(x) or cl(x) in n) and len(cl(x)) >= 3))]
            if c:
                c.sort(key=lambda x: (0 if cl(x) == n else 1, 0 if x['i'] else 1, len(cl(x))))
                got[c[0]['id']] = i
        pop = lambda x: got.get(x['id'], 999)
        sights.sort(key=lambda x: (pop(x), 0 if x['i'] else 1, 0 if x['k'] == '12' else 1))
        fest = [x for x in its if x['k'] == '15']; eats = [x for x in its if x['k'] == '39']; stay = [x for x in its if x['k'] == '32']
        top = sights[:12]
        # 해시태그 — (글자, 종류, 값): q=이 동네 안 검색, a=쪽 안 이동, l=다른 쪽
        raw = short(r['display']) if r['level'] != '광역' else nm.replace('·', '')
        base = re.sub(r'(시|군|구)$', '', raw) if len(raw) > 2 else raw
        if nm != raw and r['level'] != '광역': base = nm.replace(' ', '') if len(raw) <= 2 else (nm.split(' ')[0] + base if raw in DUP else base)
        if r['level'] == '광역' and r['sido_new'] == '전남광주통합특별시': base = '전남'
        T = [(f'#{base}가볼만한곳', 'a', '#sights'), (f'#{base}맛집', 'q', '맛집'), (f'#{base}카페', 'q', '카페'), (f'#{base}여행', 'a', '#visitors'), (f'#{base}축제', 'a', '#fest')]
        if not fest: T.pop()
        for x in sights[:4]:
            t = re.sub(r'[^0-9A-Za-z가-힣]', '', re.sub(r'\(.*?\)|\[.*?\]', '', x['t']))
            if 2 <= len(t) <= 12 and all(t != y[0][1:] for y in T): T.append(('#' + t, 'q', t))
        if r['level'] != '광역':
            sp = [q for q in by_sido[r['sido_new']] if q['r']['level'] == '광역']
            sn2 = '광주' if (r['sido_new'] == '전남광주통합특별시' and raw.endswith('구')) else SIDO[r['sido_new']][2].split('·')[0]
            if sp: T.append((f'#{sn2}여행', 'l', f'/local/{sp[0]["r"]["laf_cd"]}.html'))
        tags = [t[0] for t in T]
        tag_html = ''.join((f'<li><button type="button" data-q="{esc(v_)}">{esc(t)}</button></li>' if k == 'q' else f'<li><a href="{esc(v_)}">{esc(t)}</a></li>') for t, k, v_ in T)
        # 방문자
        cur, prev = v.get('2026'), v.get('2025')
        yoy = None
        if cur and prev and prev['outside']: yoy = (cur['outside'] - prev['outside']) / prev['outside'] * 100
        ex = (r.get('exec_2026') or {}) if vok(cd, 'exec:2026') else {}
        live = bool(r.get('live_2026')) and bool(ex)
        url = f'{SITE}/local/{cd}.html'
        title = f'{nm} 가볼 만한 곳·맛집 순위 — 관광지 {len(sights)}곳과 방문자 통계 | 김보미.com'
        d1 = '·'.join(x['t'] for x in top[:3])
        desc = f'{full} 가볼 만한 곳{("(" + d1 + " 등)") if d1 else ""}과 맛집 순위를 한 화면에. ' + (f'{MONTH} 외지인 방문 {man(cur["outside"])} 명. ' if cur else '') + '한국관광공사·카카오·구글 자료와 이 동네 예산을 함께 봅니다.'
        ld = [{"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "김보미.com", "item": SITE + "/"},
                {"@type": "ListItem", "position": 2, "name": "지역 탐방", "item": SITE + "/local.html"},
                {"@type": "ListItem", "position": 3, "name": nm, "item": url}]}]
        if top:
            ld.append({"@context": "https://schema.org", "@type": "ItemList", "name": f"{nm} 가볼 만한 곳", "numberOfItems": len(top), "itemListElement": [
                {"@type": "ListItem", "position": i + 1, "item": dict({"@type": "TouristAttraction", "name": x['t'], "address": x['a'] or full}, **({"image": x['i']} if x['i'] else {}), **({"geo": {"@type": "GeoCoordinates", "latitude": float(x['y']), "longitude": float(x['x'])}} if x.get('x') and x.get('y') else {}))} for i, x in enumerate(top)]})
        pins = [{"t": x['t'], "x": x['x'], "y": x['y']} for x in top if x.get('x')]
        data = json.dumps({"region": p['region'], "name": nm, "code": p['cs'][0], "tags": tags, "pins": pins}, ensure_ascii=False).replace('</', '<\\/')
        lead = f'{full}에서 사람들이 찾는 곳과 먹는 곳을 공공 자료로 모았습니다.'
        if cur: lead += f' {MONTH} 한 달 외지인 방문은 {man(cur["outside"])} 명' + (f', 한 해 전 같은 달보다 {abs(yoy):.1f}% {"늘었습니다" if yoy >= 0 else "줄었습니다"}.' if yoy is not None else '입니다.')
        b = head(title, desc, url, ld) + HDR
        b += f"""<main id="lx-main" tabindex="-1" class="lx">
<script type="application/json" id="lx-data">{data}</script>
<section class="lx-hero"><div class="lx-w">
  <nav class="lx-bc" aria-label="현재 위치"><a href="/index.html">김보미.com</a><span>›</span><a href="/local.html">지역 탐방</a><span>›</span><span>{esc(full)}</span></nav>
  <span class="lx-eye">지역 탐방 · {esc(SIDO[r['sido_new']][2])}</span>
  <h1>{esc(nm)} <em>가볼 만한 곳</em>·맛집</h1>
  <p class="lx-lead">{esc(lead)}</p>
  <form class="lx-find" id="lx-find" role="search"><input id="lx-q" type="search" placeholder="{esc(nm)}에서 찾기 — 한정식, 카페, 횟집" aria-label="{esc(nm)}에서 맛집·장소 찾기" autocomplete="off" enterkeyhint="search" maxlength="20"><button type="submit">찾기</button></form>
  <ul class="lx-tags" aria-label="해시태그">{tag_html}</ul>
  <div class="lx-acts"><a class="lx-btn pri" href="/lg/{cd}.html">{esc(nm)} 예산 보기 →</a><button class="lx-btn" type="button" id="lx-copy">해시태그 복사</button><button class="lx-btn" type="button" id="lx-share">공유</button></div>
</div></section>
<div class="lx-w">
<div class="lx-stats">
  <div class="lx-stat"><b>{man(cur['outside']) if cur else '—'}</b><span>외지인 방문 · {MONTH}</span></div>
  <div class="lx-stat"><b class="{'up' if (yoy or 0) >= 0 else 'dn'}">{(('+' if yoy >= 0 else '−') + f'{abs(yoy):.1f}%') if yoy is not None else '—'}</b><span>한 해 전 같은 달 대비</span></div>
  <div class="lx-stat"><b>{man(cur['foreign']) if cur else '—'}</b><span>외국인 방문 · {MONTH}</span></div>
  <div class="lx-stat"><b>{total:,}<small>곳</small></b><span>관광공사 등록 관광 정보</span></div>
</div>
"""
        if top:
            b += f"""<section class="lx-sec" id="sights"><h2>{esc(nm)} 가볼 만한 곳</h2>
<p class="lx-src">한국관광공사 등록 관광지·문화시설·레포츠 {len(sights)}곳 가운데 사진이 있는 곳부터 {len(top)}곳. 누르면 지도에서 엽니다.</p>
<ul class="lx-grid">{''.join(card(x) for x in top)}</ul></section>
"""
        if fest:
            b += f"""<section class="lx-sec" id="fest"><h2>축제·행사</h2><p class="lx-src">한국관광공사 등록 축제·행사 {len(fest)}건. 일정은 해마다 달라지니 가기 전에 확인하세요.</p>
<ul class="lx-grid">{''.join(card(x) for x in fest[:4])}</ul></section>
"""
        b += f"""<section class="lx-sec" id="food"><h2>{esc(nm)} 맛집 순위</h2>
<p class="lx-src">먹고 싶은 것을 누르면 {esc(nm)} 안에서만 찾습니다.</p>
<div class="lx-chips">{''.join(f'<button type="button" data-q="{c}" aria-pressed="false">{c}</button>' for c in FOOD_CHIPS)}</div>
<div class="lx-box" id="lx-ressec" hidden style="margin-bottom:16px"><h3 id="lx-resh">검색 결과</h3><p class="lx-src">카카오 로컬 검색(정확도순)</p><div id="lx-res"></div><a class="lx-more" id="lx-resmore" href="https://map.kakao.com/" target="_blank" rel="noopener">카카오맵에서 더 보기 ↗</a></div>
<div class="lx-two">
  <div class="lx-box"><h3>평점·리뷰로 본 순위</h3><p class="lx-src">구글 지도 · 점수 = 평점 × log10(리뷰 수+1) · 하루 한 번 갱신</p><div id="lx-google"><p class="lx-msg">불러오는 중…</p></div></div>
  <div class="lx-box"><h3>동네 맛집</h3><p class="lx-src">카카오 로컬 검색 「{esc(p['region'])} 맛집」 정확도순</p><div id="lx-food"><p class="lx-msg">불러오는 중…</p></div></div>
</div></section>
"""
        if eats:
            b += f"""<section class="lx-sec" id="eats"><h2>관광공사에 등록된 음식점</h2><p class="lx-src">한국관광공사 TourAPI 음식점 {len(eats)}곳(사진 있는 순). 순위가 아니라 등록 목록입니다.</p>
<ol class="lx-list">{''.join(f'<li><a href="https://map.kakao.com/?q={esc(re.sub(chr(92) + "s+", "+", x["t"]))}" target="_blank" rel="noopener">{esc(x["t"])}</a><small>{esc(x["a"] or "")}</small></li>' for x in eats[:20])}</ol></section>
"""
        b += f"""<section class="lx-sec" id="spots"><div class="lx-two">
  <div class="lx-box"><h3>사람들이 많이 찾는 곳</h3><p class="lx-src">카카오 로컬 검색 관광명소 · 정확도순</p><div id="lx-spots"><p class="lx-msg">불러오는 중…</p></div></div>
  <div class="lx-box" id="lx-mapsec"><h3>지도에서 보기</h3><p class="lx-src">위 관광지와 맛집 위치 · 카카오 지도</p><div class="lx-map" id="lx-map" role="img" aria-label="{esc(nm)} 관광지·맛집 지도"></div></div>
</div></section>
"""
        if any(v.values()):
            mx = max((x['outside'] + x['local'] + x['foreign']) for x in v.values() if x) or 1
            tr = ''
            for y in ('2024', '2025', '2026'):
                x = v[y]
                if not x: tr += f'<tr><td>{y}년 9월</td><td>—</td><td>—</td><td>—</td></tr>'; continue
                tr += f'<tr><td>{y}년 9월<span class="lx-bar" style="width:{(x["outside"] + x["local"] + x["foreign"]) / mx * 100:.0f}%"></span></td><td>{int(round(x["outside"])):,}</td><td>{int(round(x["local"])):,}</td><td>{int(round(x["foreign"])):,}</td></tr>'
            b += f"""<section class="lx-sec" id="visitors"><h2>방문자는 늘었나</h2><p class="lx-src">한국관광 데이터랩 지역별 방문자 수(이동통신 자료 기반 추정, 한 달 동안 날마다 센 수의 합) · 9월끼리 비교</p>
<table class="lx-tbl"><thead><tr><th scope="col">기간</th><th scope="col">외지인</th><th scope="col">현지인</th><th scope="col">외국인</th></tr></thead><tbody>{tr}</tbody></table></section>
"""
        asof = ymd(ex.get('exe_ymd')) if live else ''
        b += f"""<section class="lx-sec" id="budget"><div class="lx-bud">
  <div><h2>{esc(nm)}은 이 방문자를 위해 얼마를 쓰나</h2><p>관광지를 꾸미고 축제를 여는 돈은 모두 예산입니다. {esc(full)}의 2026년 세부사업과 집행, 계약 상대까지 우리동네365에서 한 건씩 볼 수 있습니다.</p><a class="lx-cta" href="/budget365.html#/lg/{cd}/budget">{esc(nm)} 예산 세부사업 열기 →</a></div>
  <dl><div><dt>2026 예산현액</dt><dd>{won(ex.get('budget')) if live else '—'}</dd></div><div><dt>집행률{(' · ' + asof) if asof else ''}</dt><dd>{pct(ex.get('rate')) if live else '—'}</dd></div></dl>
</div></section>
<section class="lx-sec" id="council"><h2>의회는 예산을 어떻게 다뤘나</h2><p class="lx-src">국회도서관 지방의회 의정정보(CLIK) 회의록에서 「예산」으로 찾은 최근 회의</p><div class="lx-box"><div id="lx-min"><p class="lx-msg">불러오는 중…</p></div></div></section>
<section class="lx-sec" id="near"><h2>{esc(SIDO[r['sido_new']][2])}의 다른 동네</h2><p class="lx-src">같은 시·도 안의 지역 탐방</p>
<ul class="lx-near">{''.join(f'<li><a href="/local/{q["r"]["laf_cd"]}.html">{esc(q["nm"])}</a></li>' for q in by_sido[r['sido_new']] if q is not p)}</ul></section>
<p class="lx-note"><b>출처와 기준</b> — 관광지·축제·음식점 목록과 사진: 한국관광공사 TourAPI 국문 관광정보(공공누리, {TODAY} 수집). 방문자 수: 한국관광 데이터랩 지역별 방문자 수. 맛집 순위: 구글 지도 평점·리뷰 수와 카카오 로컬 검색을 쪽을 열 때 불러옵니다. 예산: 행정안전부 지방재정365. 의회 회의록: 국회도서관 CLIK. 순위는 자동 계산이며 광고나 협찬이 없습니다. 틀린 곳은 <a href="/report.html">소통·제보</a>로 알려 주세요.</p>
</div>
</main>
<script src="/assets/kb-local.js?v={CSSV}" defer></script>
<script src="/a.js" defer></script>
{FTR}
<script src="/assets/kb-a11y.js" defer></script>
<script src="/assets/kb-join.js" defer></script>
</body>
</html>
"""
        os.makedirs(os.path.join(ROOT, 'local'), exist_ok=True)
        open(os.path.join(ROOT, 'local', cd + '.html'), 'w', encoding='utf-8').write(b)
        urls.append(url); p['tags'] = tags; p['yoy'] = yoy; p['top'] = top
    hub(pages, by_sido, HDR, FTR)
    sm = os.path.join(ROOT, 'sitemap.xml'); s = open(sm, encoding='utf-8').read()
    s = re.sub(r'\n?<!-- local:start -->.*?<!-- local:end -->', '', s, flags=re.S)
    s = re.sub(r'\n?<url><loc>[^<]*/local\.html</loc>.*?</url>', '', s, flags=re.S)
    blk = '\n<!-- local:start -->\n' + f'<url><loc>{SITE}/local.html</loc><lastmod>{TODAY}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>\n' + '\n'.join(f'<url><loc>{u}</loc><lastmod>{TODAY}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>' for u in urls) + '\n<!-- local:end -->'
    s = s.replace('</urlset>', blk.lstrip('\n') + '\n</urlset>') if '</urlset>' in s else s
    open(sm, 'w', encoding='utf-8').write(s)
    print('local pages', len(urls))

def hub(pages, by_sido, HDR, FTR):
    basic = [p for p in pages if p['r']['level'] != '광역' and p['v'].get('2026')]
    most = sorted(basic, key=lambda p: -p['v']['2026']['outside'])[:10]
    grow = sorted([p for p in basic if p.get('yoy') is not None and p['v']['2026']['outside'] >= 300000], key=lambda p: -p['yoy'])[:10]
    idx = json.dumps([[p['r']['laf_cd'], p['full'], p['nm']] for p in pages], ensure_ascii=False).replace('</', '<\\/')
    url = SITE + '/local.html'
    title = '지역 탐방 — 전국 시·군·구 가볼 만한 곳·맛집 순위와 방문자 통계 | 김보미.com'
    desc = f'전국 {len(pages)}개 시·도와 시·군·구의 가볼 만한 곳, 맛집 순위, 방문자 통계를 공공 자료로 모았습니다. 동네 이름과 음식 이름을 함께 넣어 찾을 수 있습니다.'
    ld = [{"@context": "https://schema.org", "@type": "CollectionPage", "name": title, "description": desc, "url": url, "isPartOf": {"@type": "WebSite", "name": "김보미.com", "url": SITE + "/"}}]
    poptags = ['#강진가볼만한곳', '#제주맛집', '#강릉카페', '#경주여행', '#여수맛집', '#전주가볼만한곳', '#속초맛집', '#남해여행']
    def find(tag):
        k = tag[1:]
        for p in pages:
            for t in p['tags'][:5]:
                if t == tag: return p, ('맛집' if k.endswith('맛집') else '카페' if k.endswith('카페') else '')
        return None, ''
    th = ''
    for t in poptags:
        p, q = find(t)
        if p: th += f'<li><a href="/local/{p["r"]["laf_cd"]}.html{("?q=" + q) if q else ""}">{t}</a></li>'
    def rk(lst, f):
        return '<ol class="lx-rank">' + ''.join(f'<li><span><a href="/local/{p["r"]["laf_cd"]}.html">{esc(p["full"])}</a><small>{esc(" · ".join(x["t"] for x in p["top"][:3]))}</small></span><span class="sc">{f(p)}</span></li>' for p in lst) + '</ol>'
    b = head(title, desc, url, ld) + HDR
    b += f"""<main id="lx-main" tabindex="-1" class="lx">
<section class="lx-hero"><div class="lx-w">
  <nav class="lx-bc" aria-label="현재 위치"><a href="/index.html">김보미.com</a><span>›</span><span>지역 탐방</span></nav>
  <span class="lx-eye">지역 탐방 · 전국 {len(pages)}곳</span>
  <h1>우리 동네 <em>가볼 만한 곳</em>·맛집</h1>
  <p class="lx-lead">동네 이름을 넣으면 관광지, 맛집 순위, 방문자 통계가 나옵니다. 「강진 한정식」처럼 음식 이름을 함께 넣어도 됩니다. 그 동네 예산도 한 번에 이어 봅니다.</p>
  <form class="lx-find" id="hub-f" role="search"><input id="hub-q" type="search" list="hub-l" placeholder="강진군 · 강릉 카페 · 제주 흑돼지" aria-label="동네 이름 또는 동네와 음식 이름" autocomplete="off" enterkeyhint="search"><datalist id="hub-l">{''.join(f'<option value="{esc(p["full"])}">' for p in pages)}</datalist><button type="submit">찾기</button></form>
  <p id="hub-msg" class="lx-lead" style="font-size:14.5px;margin:-6px 0 14px" role="status"></p>
  <ul class="lx-tags" aria-label="많이 찾는 해시태그">{th}</ul>
</div></section>
<div class="lx-w">
<section class="lx-sec"><div class="lx-hub">
  <div class="lx-box"><h3>외지인이 가장 많이 찾은 곳</h3><p class="lx-src">한국관광 데이터랩 · {MONTH} 외지인 방문자 수 · 시·군·구</p>{rk(most, lambda p: man(p['v']['2026']['outside']) + ' 명')}</div>
  <div class="lx-box"><h3>한 해 사이 가장 많이 늘어난 곳</h3><p class="lx-src">같은 자료 · 2025년 9월 대비 증가율 · 외지인 방문 30만 명 이상인 곳만</p>{rk(grow, lambda p: '+' + format(p['yoy'], '.1f') + '%')}</div>
</div></section>
<section class="lx-sec" id="all"><h2>전국 지역 한눈에</h2><p class="lx-src">시·도를 누르면 시·도 전체, 이름을 누르면 그 동네 쪽이 열립니다.</p>
{''.join('<div class="lx-sido"><h3>' + esc(SIDO[s][2]) + '</h3><ul class="lx-near">' + ''.join(f'<li><a href="/local/{p["r"]["laf_cd"]}.html">{esc(p["nm"] if p["r"]["level"] != "광역" else p["nm"] + " 전체")}</a></li>' for p in ps) + '</ul></div>' for s, ps in by_sido.items())}
</section>
<p class="lx-note"><b>출처와 기준</b> — 관광지·축제·음식점: 한국관광공사 TourAPI. 방문자 수: 한국관광 데이터랩(이동통신 자료 기반 추정, {MONTH}). 맛집 순위: 구글 지도 평점·리뷰 수, 카카오 로컬 검색. 예산: 행정안전부 지방재정365. 순위는 자동 계산이며 광고나 협찬이 없습니다.</p>
</div>
</main>
<script type="application/json" id="hub-ix">{idx}</script>
<script>
(function(){{
  var IX=[];try{{IX=JSON.parse(document.getElementById('hub-ix').textContent);}}catch(e){{}}
  function norm(s){{return String(s||'').replace(/\\s+/g,'');}}
  function go(raw){{
    var q=String(raw||'').trim(); if(!q) return;
    var n=norm(q), best=null, rest='';
    IX.forEach(function(r){{ if(norm(r[1])===n) best=best||[r,'']; }});
    if(!best){{ var ws=q.split(/\\s+/);
      for(var k=ws.length;k>=1&&!best;k--){{ var head=norm(ws.slice(0,k).join('')), tail=ws.slice(k).join(' ');
        var c=IX.filter(function(r){{ var f=norm(r[1]), s=norm(r[2]); return f===head||s===head||s.replace(/(시|군|구)$/,'')===head||f.slice(-head.length)===head; }});
        if(c.length>=1&&(c.length===1||k===ws.length||true)){{ c.sort(function(a,b){{return a[1].length-b[1].length;}}); best=[c[0],tail]; if(c.length>1&&!tail) best.multi=c; }}
      }}
    }}
    var m=document.getElementById('hub-msg');
    if(!best){{ m.textContent='「'+q+'」와 맞는 동네를 찾지 못했습니다. 시·군·구 이름을 먼저 넣어 주세요.'; return; }}
    if(best.multi&&best.multi.length>1){{ m.textContent='같은 이름이 여러 곳입니다: '+best.multi.map(function(r){{return r[1];}}).join(', ')+'. 시·도 이름을 함께 넣어 주세요.'; return; }}
    location.href='/local/'+best[0][0]+'.html'+(best[1]?'?q='+encodeURIComponent(best[1]):'');
  }}
  document.getElementById('hub-f').addEventListener('submit',function(e){{e.preventDefault();go(document.getElementById('hub-q').value);}});
  var sp=new URLSearchParams(location.search), p=sp.get('q')||sp.get('region'); if(p){{document.getElementById('hub-q').value=p;go(p);}}
}})();
</script>
<script src="/a.js" defer></script>
{FTR}
<script src="/assets/kb-a11y.js" defer></script>
<script src="/assets/kb-join.js" defer></script>
</body>
</html>
"""
    open(os.path.join(ROOT, 'local.html'), 'w', encoding='utf-8').write(b)

if __name__ == '__main__':
    build()
