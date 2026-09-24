"""2026 당선 단체장의 선수(초선·재선…) 계산 → data/pledge.json 의 w.term / w.termWins 에 기록.
근거: 중앙선관위 당선인정보 API(WinnerInfoInqireService2) — 역대 지방선거·재보궐 당선인과 이름+지역 대조.
"""
import json, urllib.request, urllib.parse, time, sys
BASE='https://www.xn--4k0b53xuva.com/api/contract?nec=WinnerInfoInqireService2/getWinnerInfoInqire&'
SGS=['20220601','20180613','20140604','20100602','20060531','20020613','19980604','19950627',
     '20250603','20250402','20241016','20240410','20231011','20230405','20221000','20220309','20210407','20200415','20190403','20181000','20170509','20160413','20150429','20141000','20130424','20120411','20111026','20110427','20101000','20090429','20081000','20080409','20071219','20070425','20061026']
def get(sg,typ):
    out=[]
    for p in range(1,6):
        u=BASE+urllib.parse.urlencode({'sgId':sg,'sgTypecode':typ,'pageNo':p,'numOfRows':100})
        try:
            j=json.load(urllib.request.urlopen(u,timeout=60))
        except Exception as e:
            return out
        if not j.get('ok',True): return out
        it=j.get('items') or []
        out+=it
        if len(it)<100: break
    return out
hist={}  # (typ) -> list of winners with sg
for sg in SGS:
    for typ in ('3','4'):
        it=get(sg,typ)
        if it:
            for w in it: w['_sg']=sg
            hist.setdefault(typ,[]).extend(it)
            print(sg,typ,len(it),file=sys.stderr)
        time.sleep(0.2)
P=json.load(open('data/pledge.json',encoding='utf-8'))
def norm(s): return str(s or '').replace(' ','')
n=0
for cd,ent in P['lg'].items():
    w=ent.get('w')
    if not w: continue
    lvl='3' if norm(w.get('wiw'))==norm(w.get('sd')) or len(cd)>=7 and cd.endswith('00000') and cd[2:]=='00000' else '4'
    # 광역 판정: 지방재정365 코드 xx00000
    lvl='3' if cd.endswith('00000') else '4'
    wins=[]
    for h in hist.get(lvl,[]):
        if norm(h.get('name'))!=norm(w.get('name')): continue
        if lvl=='4':
            if norm(h.get('wiwName') or h.get('sggName'))!=norm(w.get('wiw')): continue
        wins.append(h['_sg'][:4])
    wins=sorted(set(wins))
    w['term']=1+len(wins); w['termWins']=wins; n+=1
P['terms_src']='중앙선거관리위원회 당선인정보(역대 지방선거·재보궐, 이름+선거구 대조) · 산출 '+time.strftime('%Y-%m-%d')
json.dump(P,open('data/pledge.json','w',encoding='utf-8'),ensure_ascii=False)
from collections import Counter
print('done',n,Counter(e['w'].get('term') for e in P['lg'].values() if e.get('w')))

# 지자체별로 쪼갠 파일(data/pledge/<코드>.json)도 함께 갱신: python3 tools/split_lg.py
