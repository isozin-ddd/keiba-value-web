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
 # Check the ACTUAL published future state and return without losing historical odds.
 page.select_option('#mode','future')
 future_payload=page.request.get(base.rstrip('/')+'/future.json').json()
 if future_payload['status']=='unavailable':
  assert page.locator('#cards .card').count()==0
  assert page.locator('#filters').is_hidden()
  assert '架空' not in page.locator('#notice').inner_text() or '表示しません' in page.locator('#notice').inner_text()
  assert 'ありません' in page.locator('#notice').inner_text() or '取得できません' in page.locator('#notice').inner_text()
 else:assert page.locator('#notice').inner_text()
 page.screenshot(path=str(out/f'{engine}-iphone-future-actual.png'),full_page=True)
 page.select_option('#mode','past');page.locator('#cards .card').first.wait_for()
 assert not errors,errors
 # Reject malformed JSON, never silently call it real data or replace it with a demo.
 page.route('**/predictions.json',lambda route:route.fulfill(json={'secret':'not a public payload'}))
 page.reload(wait_until='networkidle');page.locator('#error').wait_for(state='visible');assert page.locator('#cards .card').count()==0
 page.unroute('**/predictions.json');page.get_by_role('button',name='再読み込み').click();page.locator('#cards .card').first.wait_for()
 # Artificial protocol fixture ONLY; never written to the public JSON or counted as real inference.
 fixture={'schema_version':2,'mode':'future','generated_at':'2099-01-01T01:00:00Z','status':'ready','message':'人工の画面テスト専用','model_version':'fixture-only','races':[{'id':'209905010101','date':'2099-01-02','track':'東京','number':1,'start_at':'2099-01-02T01:00:00Z','prediction_at':'2099-01-01T01:00:00Z','entry_observed_at':'2099-01-01T00:00:00Z','source_url':'https://www.jra.go.jp/JRADB/accessD.html?CNAME=pw01dde1005209901010120990102/AA','runners':[{'number':1,'name':'画面テストA','probability':.6,'prestart_odds':2.5,'odds_observed_at':'2099-01-01T00:00:00Z','history_count':5},{'number':2,'name':'画面テストB','probability':.4,'prestart_odds':None,'odds_observed_at':None,'history_count':0}]}]}
 page.route('**/future.json',lambda route:route.fulfill(json=fixture))
 page.reload(wait_until='networkidle');page.select_option('#mode','future');page.locator('#cards .card').first.wait_for()
 assert '発走前' in page.locator('#notice').inner_text()
 f=page.locator('#cards .card').first;f.locator('input[type=number]').fill('10');assert f.locator('.ev-value').inner_text()=='6.000倍'
 assert '取得' in f.locator('.source-note').inner_text();assert '5/5' in f.locator('.history-note').inner_text()
 assert '履歴不足' in page.locator('.history-note').nth(1).inner_text()
 page.get_by_role('button',name='レースのオッズを初期値に戻す').click();assert page.locator('input[type=number]').first.input_value()=='2.5'
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 page.unroute('**/future.json');assert not errors,errors
 context.close();browser.close()
 print(f'{engine}: actual {payload["mode"]} JSON, odds, EV, fair odds, ranking, reset, touch, error, mode switch, actual future state and artificial future controls, dark 390x844: PASS')
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
