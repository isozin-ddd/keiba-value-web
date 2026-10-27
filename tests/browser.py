"""Exercise the actual published JSON and preserved dark UI on a mobile viewport."""
import argparse,functools,json,threading
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass

def run(bt,base,engine,executable=None):
 browser=bt.launch(**({'executable_path':executable} if executable else {}))
 context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2,color_scheme='dark',locale='ja-JP')
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 response=page.goto(base,wait_until='networkidle');assert response.status==200
 payload=page.request.get(base.rstrip('/')+'/predictions.json').json()
 page.locator('#cards .card').first.wait_for()
 race=next(r for r in payload['races'] if r['id']==page.locator('#race').input_value())
 h=sorted(race['runners'],key=lambda h:h['number'])[0];p=h['probability']
 first=page.locator('#cards .card').first;number=first.locator('input[type=number]')
 assert page.locator('#cards .card').count()==len(race['runners'])
 if payload['mode']=='real':
  assert '検証済みJRA実データ' in page.locator('#notice').inner_text()
  assert '事後分析' in page.locator('#notice').inner_text()
  assert '発走前に配信した予想ではありません' in page.locator('#data-description').inner_text()
 else:assert '実際のAI予測ではありません' in page.locator('#notice').inner_text()
 assert first.locator('.fair-odds').inner_text()==(f'{1/p:.2f}倍' if p else '∞')
 number.fill('10');assert first.locator('.ev-value').inner_text()==f'{p*10:.3f}倍'
 assert first.locator('.return-value').inner_text()==f'{p*10*100:.1f}%'
 number.fill('0');assert number.get_attribute('aria-invalid')=='true'
 number.fill('9999');assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),'Large-value overflow'
 number.fill('5');number.blur()
 slider=first.locator('input[type=range]');slider.focus();slider.press('ArrowRight')
 assert abs(float(number.input_value())-5.1)<1e-9
 slider.scroll_into_view_if_needed();box=slider.bounding_box();page.touchscreen.tap(box['x']+box['width']*.3,box['y']+box['height']/2)
 assert float(number.input_value())>10
 assert not errors,errors
 page.get_by_role('button',name='レースのオッズを初期値に戻す').click()
 assert abs(float(page.locator('input[type=number]').first.input_value())-(h['final_odds'] or 1))<1e-9
 selected=page.locator('#race').input_value()
 raceopts=page.locator('#race option').evaluate_all('(xs)=>xs.map(x=>x.value)')
 if len(raceopts)>1:
  page.select_option('#race',raceopts[-1]);assert page.locator('#race').input_value()==raceopts[-1]
  other=next(r for r in payload['races'] if r['id']==raceopts[-1]);assert page.locator('#cards .card').count()==len(other['runners'])
  page.select_option('#race',selected)
 assert page.locator('#date').is_visible() and page.locator('#track').is_visible()
 assert page.locator('[role=meter]').count()==len(race['runners'])
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),'Horizontal overflow'
 assert page.evaluate('getComputedStyle(document.documentElement).colorScheme')=='dark'
 out=ROOT/'output';out.mkdir(exist_ok=True);page.screenshot(path=str(out/f'{engine}-iphone-{payload["mode"]}.png'),full_page=True)
 # Reject malformed JSON, never silently call it real data or replace it with a demo.
 page.route('**/predictions.json',lambda route:route.fulfill(json={'secret':'not a public payload'}))
 page.reload(wait_until='networkidle');page.locator('#error').wait_for(state='visible');assert page.locator('#cards .card').count()==0
 page.unroute('**/predictions.json');page.get_by_role('button',name='再読み込み').click();page.locator('#cards .card').first.wait_for()
 context.close();browser.close()
 print(f'{engine}: actual {payload["mode"]} JSON, odds, EV, fair odds, ranking, reset, touch, error and dark 390x844: PASS')
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--base-url');a.add_argument('--engine',choices=['both','chromium','webkit'],default='both');a.add_argument('--executable');args=a.parse_args()
 server=None
 if not args.base_url:
  server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
  threading.Thread(target=server.serve_forever,daemon=True).start()
 base=args.base_url or f'http://127.0.0.1:{server.server_port}/'
 try:
  with sync_playwright() as pw:
   if args.engine in ['both','chromium']:run(pw.chromium,base,'chromium',args.executable)
   if args.engine in ['both','webkit']:run(pw.webkit,base,'webkit')
 finally:
  if server:server.shutdown();server.server_close()
