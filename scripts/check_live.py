"""Verify live GitHub Pages HTTP, content and assets; no credentials."""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

def check(base):
    u=urllib.parse.urlsplit(base)
    if u.scheme!='https' or u.hostname!='isozin-ddd.github.io' or u.path.rstrip('/')!='/keiba-value-web':
        raise ValueError('Unexpected public site URL')
    base=base.rstrip('/')+'/'
    for attempt in range(12):
        try:
            with urllib.request.urlopen(base,timeout=20) as response:
                assert response.status==200
                html=response.read().decode('utf-8')
                assert '競馬AI' in html and 'app.js' in html
            break
        except (urllib.error.HTTPError,urllib.error.URLError,AssertionError):
            if attempt==11:raise
            time.sleep(5)
    for path in ['app.js','core.js','predictions.json']:
        with urllib.request.urlopen(urllib.parse.urljoin(base,path),timeout=20) as r:
            assert r.status==200 and r.read()
    with urllib.request.urlopen(urllib.parse.urljoin(base,'predictions.json'),timeout=20) as r:
        data=json.load(r)
    assert data['mode'] in ['demo','real']
    print(f'LIVE HTTP 200 and all CSS/JS/JSON assets verified: {base} ({data["mode"]})')
if __name__=='__main__':check(sys.argv[1])
