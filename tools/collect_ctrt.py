"""계약현황(WCEGCF) 원본을 계약일별 전국 전수로 받는다 (tools/build_ctrt.py 의 원자료)
사용: python3 tools/collect_ctrt.py <시작 YYYYMMDD> <끝 YYYYMMDD> <저장 폴더>
이미 받은 날짜는 건너뛴다. 최근 며칠은 나중에 올라오는 자료가 있으니 다시 받으려면 그 날짜 파일을 지우고 돌린다."""
import json, os, sys, time, datetime, urllib.request, urllib.parse, concurrent.futures as cf
B='https://www.xn--4k0b53xuva.com/api/lofin?'
OUT=sys.argv[3]; os.makedirs(OUT,exist_ok=True)
def api(p,tries=6):
    u=B+urllib.parse.urlencode(p); last=None
    for i in range(tries):
        try:
            d=json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'kimbomi-eyecheck'}),timeout=60))
            if d.get('ok'): return d
            last=d
            if 'INFO-200' in json.dumps(d.get('result',''),ensure_ascii=False) or '해당하는 데이터가 없' in json.dumps(d,ensure_ascii=False): return {'ok':True,'total':0,'rows':[]}
        except Exception as e: last={'ok':False,'error':str(e)}
        time.sleep(2+3*i)
    return last
def day(d):
    f=os.path.join(OUT,d+'.json')
    if os.path.exists(f): return d,'cached'
    j=api({'hub':'WCEGCF','smz_ctrt_ymd':d,'pSize':1000,'pIndex':1})
    if not j or not j.get('ok'): return d,'FAIL '+str(j)[:200]
    tot=j.get('total') or 0; rows=list(j.get('rows') or [])
    p=2
    while len(rows)<tot and p<=60:
        k=api({'hub':'WCEGCF','smz_ctrt_ymd':d,'pSize':1000,'pIndex':p})
        if not k or not k.get('ok'): return d,'FAIL page %d'%p
        rows+=k.get('rows') or []; p+=1
    if len(rows)!=tot: return d,'COUNT %d/%d'%(len(rows),tot)
    json.dump({'d':d,'total':tot,'rows':rows},open(f,'w'),ensure_ascii=False)
    return d,'ok %d'%tot
s=datetime.date(int(sys.argv[1][:4]),int(sys.argv[1][4:6]),int(sys.argv[1][6:])); e=datetime.date(int(sys.argv[2][:4]),int(sys.argv[2][4:6]),int(sys.argv[2][6:]))
days=[(s+datetime.timedelta(i)).strftime('%Y%m%d') for i in range((e-s).days+1)]
bad=[]
with cf.ThreadPoolExecutor(6) as ex:
    for i,(d,r) in enumerate(ex.map(day,days)):
        if not (r.startswith('ok') or r=='cached'): bad.append((d,r))
        if i%50==0: print(i,d,r,flush=True)
print('done', len(days), 'bad', bad, flush=True)
