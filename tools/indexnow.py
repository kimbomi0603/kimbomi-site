# -*- coding: utf-8 -*-
"""IndexNow — 바뀐 주소를 네이버·빙 등에 알린다. 키 파일은 사이트 루트의 <키>.txt (공개용)
쓰기: python3 tools/indexnow.py            (사이트맵의 지역 탐방·지자체 쪽 전부)
      python3 tools/indexnow.py local       (지역 탐방 쪽만)"""
import json, os, re, sys, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOST = 'www.xn--4k0b53xuva.com'
KEY = '3787dc61a26f728f7b5a96f67377a1a5'

def main():
    s = open(os.path.join(ROOT, 'sitemap.xml'), encoding='utf-8').read()
    urls = re.findall(r'<loc>([^<]+)</loc>', s)
    if len(sys.argv) > 1 and sys.argv[1] == 'local': urls = [u for u in urls if '/local' in u]
    urls = [u for u in urls if HOST in u][:10000]
    body = json.dumps({'host': HOST, 'key': KEY, 'keyLocation': f'https://{HOST}/{KEY}.txt', 'urlList': urls}).encode('utf-8')
    ok = True
    for ep in ('https://api.indexnow.org/indexnow', 'https://searchadvisor.naver.com/indexnow'):
        try:
            req = urllib.request.Request(ep, data=body, headers={'Content-Type': 'application/json; charset=utf-8'})
            with urllib.request.urlopen(req, timeout=30) as r: print(ep, r.status, len(urls), '개 주소')
        except Exception as e:
            ok = False; print(ep, '실패', getattr(e, 'code', ''), type(e).__name__)
    return 0   # 알림 실패가 갱신 작업을 막지 않게 한다

if __name__ == '__main__':
    sys.exit(main())
