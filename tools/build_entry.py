"""검색엔진용 정적 진입 페이지 생성.
- lg/<laf_cd>.html : 지방정부 243곳 (data/index.json)
- gov/<sg>.html    : 중앙정부 부처 62곳 (data/gov-index.json, gov27-index.json)
- sitemap.xml 에 등록 (기존 항목은 유지)
실행: python3 tools/build_entry.py   (저장소 루트에서)
원칙: 값은 자료 파일에 있는 것만 쓴다. 없는 값은 '—'로 비운다. 자동 리다이렉트 없음(검색엔진이 이 페이지를 색인하게).
"""
import json, os, re, html, datetime, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://www.xn--4k0b53xuva.com'
TODAY = datetime.date.today().isoformat()

def esc(s): return html.escape(str(s if s is not None else ''), quote=True)
def won(v):
    if v is None: return '—'
    v = float(v)
    if abs(v) >= 1e12: return f"{v/1e12:.1f}조원"
    if abs(v) >= 1e8: return f"{v/1e8:,.0f}억원"
    if abs(v) >= 1e4: return f"{v/1e4:,.0f}만원"
    return f"{v:,.0f}원"
def ymd(s):
    s = str(s or '')
    return f"{s[:4]}.{s[4:6]}.{s[6:8]}" if len(s) == 8 else s
def pct(v): return '—' if v is None else f"{float(v):.1f}%"
def num(v): return '—' if v is None else f"{int(v):,}"
def short(display):
    return re.sub(r'^(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|충청북도|충청남도|전라북도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도|전남광주통합특별시|대전충남통합특별시|대구경북통합특별시|부산경남통합특별시|광주전남통합특별시)\s+', '', display).strip()

HEAD = """<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website"><meta property="og:site_name" content="김보미.com 우리동네365">
<meta property="og:title" content="{title}"><meta property="og:description" content="{desc}"><meta property="og:url" content="{url}">
<meta property="og:image" content="{site}/og-ud365.jpg?v=20260921d"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{title}"><meta name="twitter:description" content="{desc}"><meta name="twitter:image" content="{site}/og-ud365.jpg?v=20260921d">
<link rel="icon" href="../favicon.ico" sizes="any"><link rel="icon" type="image/svg+xml" href="../assets/brand/kb-icon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@700;900&family=Noto+Sans+KR:wght@400;500;700&display=swap">
<script type="application/ld+json">{ld}</script>
<style>
:root{{--navy:#1C1B18;--gold:#C8412B;--gold-ink:#93321F;--bg:#FBF7EE;--ink:#1C1B18;--ink-2:#4A4740;--ink-3:#7A766C;--line:#E5DFD0;--card:#fff;--zone:{zone}}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#161512;--ink:#F2EEE4;--ink-2:#CFC9BB;--ink-3:#9A958A;--line:#33302A;--card:#1E1C18}}}}
:root[data-theme="dark"]{{--bg:#161512;--ink:#F2EEE4;--ink-2:#CFC9BB;--ink-3:#9A958A;--line:#33302A;--card:#1E1C18}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--bg);color:var(--ink);font-family:"Noto Sans KR",system-ui,sans-serif;line-height:1.6}}
.top{{background:var(--navy);color:#F5F0E4;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}}
.top a{{color:#F5F0E4;text-decoration:none;font-weight:700}} .top .b{{font-family:"Noto Serif KR",serif;font-weight:900;font-size:18px}} .top .b em{{font-style:normal;color:#F2A48F}}
.wrap{{max-width:860px;margin:0 auto;padding:28px 16px 48px}}
.zone{{display:inline-block;font-size:12px;font-weight:700;padding:2px 9px;border-radius:999px;background:var(--zone);color:#1C1B18}}
h1{{font-family:"Noto Serif KR",serif;font-weight:900;font-size:clamp(26px,5vw,38px);letter-spacing:-.02em;margin:10px 0 6px;line-height:1.2}}
.sub{{color:var(--ink-2);margin:0 0 18px}}
.stats{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0 20px}}
.stats div{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px}} .stats b{{display:block;font-size:22px;font-family:"Noto Serif KR",serif;font-weight:900}} .stats span{{font-size:12.5px;color:var(--ink-3)}}
.cta{{display:inline-block;background:var(--gold);color:#fff;font-weight:700;padding:13px 22px;border-radius:10px;text-decoration:none;font-size:16px}} .cta:hover{{background:var(--gold-ink)}}
.links{{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin:18px 0}}
.links a{{display:block;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:11px 13px;color:var(--ink);text-decoration:none;font-weight:600}} .links a small{{display:block;font-weight:400;font-size:12px;color:var(--ink-3)}}
.links a:hover{{border-color:var(--gold)}}
.src{{font-size:12.5px;color:var(--ink-3);margin-top:22px;border-top:1px solid var(--line);padding-top:12px}}
a:focus-visible,.cta:focus-visible{{outline:3px solid var(--gold);outline-offset:2px}}
footer{{max-width:860px;margin:0 auto;padding:0 16px 30px;font-size:12.5px;color:var(--ink-3)}} footer a{{color:inherit}}
</style>
</head>
<body>
<div class="top"><a class="b" href="../budget365.html">우리동네<em>365</em></a><span><a href="../index.html">김보미.com</a> &nbsp;·&nbsp; <a href="../budget365.html#/gov">중앙정부</a> &nbsp;·&nbsp; <a href="../budget365.html#/key">정책 아카이브</a></span></div>
<main class="wrap">
"""
FOOT = """</main>
<footer>자료는 정부가 공개한 원자료를 기계적으로 집계한 것이며, 모든 숫자에 출처와 기준일을 붙였습니다. 확인되지 않은 값은 비워 둡니다. · <a href="../privacy.html">개인정보처리방침</a> · 운영 김보미</footer>
<script>try{var t=localStorage.getItem('kb_theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}</script>
</body>
</html>
"""

def write(path, s):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8').write(s)

def build_lg():
    ix = json.load(open(os.path.join(ROOT, 'data/index.json'), encoding='utf-8'))
    lgpu = {}
    p = os.path.join(ROOT, 'data/lgpu/_index.json')
    if os.path.exists(p): lgpu = json.load(open(p, encoding='utf-8')).get('lgs', {})
    urls = []
    for r in ix['rows']:
        cd = r['laf_cd']; disp = r['display']; nm = short(disp)
        ex = r.get('exec_2026') or {}; fi = r.get('fiscal') or {}
        live = bool(r.get('live_2026'))
        asof = ymd(ex.get('exe_ymd'))
        title = f"{nm} 2026년 예산·집행·계약 한눈에 | 우리동네365"
        if live:
            desc = f"{disp} 2026년 예산현액 {won(ex.get('budget'))}, 집행률 {pct(ex.get('rate'))}({asof} 기준), 세부사업 {num(ex.get('dbiz'))}건. 계약대장 전수·단체장 공약 반영·계약 이상 징후까지 우리동네365에서 확인합니다."
        else:
            desc = f"{disp}의 예산·집행·계약 자료. 2026년 세부사업 집행 자료가 아직 공개되지 않아 값은 비워 두었습니다. 우리동네365에서 확인합니다."
        url = f"{SITE}/lg/{cd}.html"
        ld = json.dumps({"@context":"https://schema.org","@type":"Dataset","name":title,"description":desc,"url":url,"creator":{"@type":"Person","name":"김보미"},"isBasedOn":"https://www.lofin365.go.kr/","dateModified":TODAY,"spatialCoverage":disp}, ensure_ascii=False)
        app = f"../budget365.html#/lg/{cd}"
        body = HEAD.format(title=esc(title), desc=esc(desc), url=url, site=SITE, ld=ld, zone='#7FB2D9')
        body += f"""<span class="zone">지방정부</span>
<h1>{esc(disp)}</h1>
<p class="sub">2026년 예산현액과 오늘까지 집행, 2021년부터의 계약대장, 단체장 공약의 예산 반영 여부를 한 화면에서 봅니다.</p>
<div class="stats">
  <div><b>{won(ex.get('budget')) if live else '—'}</b><span>2026 예산현액</span></div>
  <div><b>{pct(ex.get('rate')) if live else '—'}</b><span>집행률 · {asof if live else '자료 없음'} 기준</span></div>
  <div><b>{num(ex.get('dbiz')) if live else '—'}<small>건</small></b><span>2026 세부사업</span></div>
  <div><b>{pct(fi.get('sr_rate2'))}</b><span>재정자립도 · {esc(r.get('settle_fyr') or '')} 결산</span></div>
  <div><b>{num(r.get('pop_2024'))}<small>명</small></b><span>인구 · 2024</span></div>
  {f'<div><b>{num(lgpu[cd]["n"])}<small>건</small></b><span>사업 내역 연결 · 2026 사업명세서</span></div>' if cd in lgpu else ''}
</div>
<a class="cta" href="{app}">우리동네365에서 {esc(nm)} 열기 →</a>
<div class="links">
  <a href="{app}/budget">예산 <small>세부사업 하나하나</small></a>
  <a href="{app}/exec">집행 <small>올해 어디까지 썼나</small></a>
  <a href="{app}/contract">계약 <small>누구와 얼마에</small></a>
  <a href="{app}/diag">진단 <small>규칙으로 걸러 본 곳</small></a>
  <a href="{app}/pledge">공약 <small>공약이 예산이 됐나</small></a>
  <a href="{app}/peer">비교 <small>닮은 지자체 5곳과 나란히</small></a>
</div>
<p class="src">출처: 행정안전부 지방재정365 세부사업별 세출 집행(기준일 {asof if live else '—'}), 재정공시 결산({esc(r.get('settle_fyr') or '—')}), 지방계약 계약대장(2021~). 이 페이지는 검색용 요약이며 최신 값은 우리동네365 화면이 기준입니다.</p>
"""
        body += FOOT
        write(os.path.join(ROOT, 'lg', f'{cd}.html'), body)
        urls.append(url)
    return urls

def build_gov():
    g = json.load(open(os.path.join(ROOT, 'data/gov-index.json'), encoding='utf-8'))
    g27 = {m['sg']: m for m in json.load(open(os.path.join(ROOT, 'data/gov27-index.json'), encoding='utf-8'))['ministries']}
    pu = {}
    p = os.path.join(ROOT, 'data/govpu/_index.json')
    if os.path.exists(p): pu = json.load(open(p, encoding='utf-8')).get('ministries', {})
    urls = []
    for m in g['ministries']:
        sg = m['sg']; nm = m['nm']; q = urllib.parse.quote(sg)
        exp = m.get('exp'); n = m.get('n'); m27 = g27.get(sg) or {}
        expw = f"{exp/1e6:.1f}조원" if exp else '—'
        title = f"{nm} 2026년 예산 세부사업 {num(n)}건 | 우리동네365"
        desc = (f"{nm} 2026년 확정예산 총지출 {expw}, 세부사업 {num(n)}건을 사업별로 봅니다." if exp else f"{nm} 2026년 확정예산 세부사업 {num(n)}건을 사업별로 봅니다(공식 총지출은 미공개라 비워 둠).") + (f" 2027년 정부안 {m27['b27']/1e6:.1f}조원(국회 심의 중)." if m27.get('b27') else '') + (f" 사업 목적 문장 {num(pu[sg]['n'])}건 연결." if sg in pu else '')
        url = f"{SITE}/gov/{q}.html"
        ld = json.dumps({"@context":"https://schema.org","@type":"Dataset","name":title,"description":desc,"url":url,"creator":{"@type":"Person","name":"김보미"},"isBasedOn":"https://www.openfiscaldata.go.kr/","dateModified":TODAY}, ensure_ascii=False)
        app = f"../budget365.html#/gov/{q}"
        body = HEAD.format(title=esc(title), desc=esc(desc), url=url, site=SITE, ld=ld, zone='#7FD0BF')
        body += f"""<span class="zone">중앙정부</span>
<h1>{esc(nm)}</h1>
<p class="sub">{esc(m.get('cat') or '중앙행정기관')} · 2026년 확정예산을 세부사업 단위로, 작년보다 얼마나 늘고 줄었는지까지 봅니다.</p>
<div class="stats">
  <div><b>{expw}</b><span>2026 총지출 기준</span></div>
  <div><b>{num(n)}<small>건</small></b><span>2026 세부사업{(' · 비공개 '+num(m.get('nblank'))) if m.get('nblank') else ''}</span></div>
  <div><b>{(f"{m27['b27']/1e6:.1f}조원" if m27.get('b27') else '—')}</b><span>2027 정부안 · 예산+기금 총계</span></div>
  <div><b>{num(pu[sg]['n']) if sg in pu else '—'}<small>건</small></b><span>사업 목적 문장 연결</span></div>
</div>
<a class="cta" href="{app}">우리동네365에서 {esc(nm)} 열기 →</a>
<div class="links">
  <a href="{app}">2026 확정예산 <small>세부사업·전년 대비</small></a>
  <a href="../budget365.html#/gov27/{q}">2027 정부안 <small>국회 심의 중</small></a>
  <a href="../budget365.html#/gov">부처 전체 <small>62개 부처</small></a>
</div>
<p class="src">출처: 기획예산처 열린재정 2026 확정예산(총지출·세부사업), 2027년도 예산안·기금운용계획안 국회 제출본{', 사업 목적은 '+esc(nm)+' 2026년 사업설명자료(공통요구자료 Ⅱ-1)' if sg in pu else ''}. 이 페이지는 검색용 요약이며 최신 값은 우리동네365 화면이 기준입니다.</p>
"""
        body += FOOT
        write(os.path.join(ROOT, 'gov', f'{sg}.html'), body)
        urls.append(url)
    return urls

def update_sitemap(urls):
    p = os.path.join(ROOT, 'sitemap.xml'); s = open(p, encoding='utf-8').read()
    s = re.sub(r'\n?<!-- entry:start -->.*?<!-- entry:end -->', '', s, flags=re.S)
    block = '\n<!-- entry:start -->\n' + '\n'.join(f'<url><loc>{u}</loc><lastmod>{TODAY}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>' for u in urls) + '\n<!-- entry:end -->'
    s = s.replace('</urlset>', block + '\n</urlset>')
    open(p, 'w', encoding='utf-8').write(s)

if __name__ == '__main__':
    a = build_lg(); b = build_gov(); update_sitemap(a + b)
    print('lg', len(a), 'gov', len(b))
