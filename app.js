import {validateData, validateFuture, validateAnalysis, metrics, MAX_ODDS} from './core.js';
const $=id=>document.getElementById(id), memory=new Map();
let data,current=[],raceId='',past,future,analysis,futureError='',activeMode='past';
const initialOdds=h=>activeMode==='future'?h.prestart_odds:h.final_odds;
const key=h=>`${activeMode}:${raceId}:${h.number}`;
const when=s=>new Date(s).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'});
function switchMode(){
 activeMode=$('mode').value;
 data=activeMode==='future'?future:past;
 if(activeMode==='future'&&data)data={...data,races:data.races.filter(r=>Date.parse(r.start_at)>Date.now())};
 const empty=!data||!data.races.length;
 $('filters').hidden=empty;$('ranking-section').hidden=empty;$('reset-all').hidden=empty;$('cards').replaceChildren();$('ranking').replaceChildren();$('source').replaceChildren();
 if(activeMode==='future'){
  $('notice').textContent=empty?(futureError||future?.message||'未来レースの予測データはありません。正式な出馬表の取得後に表示します。'):'未来レースの発走前予測です。オッズは取得時点の値で、最終確定オッズではありません。';
  if(empty&&future?.status==='ready')$('notice').textContent='掲載したレースは発走時刻を過ぎました。現在利用できる未来レースの予測はありません。';
  $('data-description').textContent='未来モードは正式な出馬表と予測時点までの検証済み履歴を使用します。履歴不足と試作モデルの精度に注意してください。'+(future?` データ生成：${when(future.generated_at)}／モデル：${future.model_version}`:'');
 }else{
  $('notice').textContent=past.mode==='real'?'検証済みJRA実データ・時系列テストの推定勝率です。最終単勝オッズによる期待値は事後分析です。':'現在はデモ表示です。実際のAI予測ではありません。馬名・日程・勝率・オッズは架空です。';
  $('data-description').textContent=past.mode==='real'?'試作モデルで、収益性は確認できていません。過去レースを使った未使用期間の評価結果です。発走前に配信した予想ではありません。最終単勝オッズと実際に購入できたオッズは区別してください。':'AIモデルは未学習です。実測成績はありません。';
 }
 if(empty)return;options('date',[...new Set(data.races.map(r=>r.date))].sort());tracks();
}

const one=n=>Number(n).toFixed(1),pct=n=>(100*n).toFixed(1)+'%';
function element(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function options(id,values,label=x=>x){const select=$(id),old=select.value;select.replaceChildren(...values.map(v=>{const o=element('option','',label(v));o.value=v;return o;}));if(values.includes(old))select.value=old;}
function tracks(){options('track',[...new Set(data.races.filter(r=>r.date===$('date').value).map(r=>r.track))]);races();}
function races(){const list=data.races.filter(r=>r.date===$('date').value&&r.track===$('track').value).sort((a,b)=>a.number-b.number);options('race',list.map(r=>r.id),id=>`${list.find(r=>r.id===id).number}R`);raceId=$('race').value;draw();}
function draw(){
 const race=data.races.find(r=>r.id===raceId);current=race.runners.slice().sort((a,b)=>a.number-b.number).map(h=>({...h,odds:memory.get(key(h))??initialOdds(h)??1}));
 $('race-meta').textContent=activeMode==='future'?`予測：${when(race.prediction_at)}／出馬表取得：${when(race.entry_observed_at)}／モデル：${future.model_version}`:analysis?`モデル：${analysis.model_version}／予測実行時刻：${analysis.prediction_created_at?when(analysis.prediction_created_at):'旧成果物に記録なし'}／公開データ生成：${when(analysis.generated_at)}（事後検証）`:'モデル・着順・払戻の補足データは未取得です。';
 const area=$('cards');area.replaceChildren();$('source').replaceChildren();
 if(activeMode==='future'){const a=element('a','','出典：JRA公式出馬表');a.href=race.source_url;a.target='_blank';a.rel='noopener noreferrer';$('source').append(a);}
 if(race.source){const a=element('a','',`出典：JRA公式成績PDF ${race.source.page}ページ`);a.href=race.source.url;a.target='_blank';a.rel='noopener noreferrer';$('source').append(a);}
 current.forEach(h=>{
  const card=element('article','card'),head=element('div','head');card.dataset.number=h.number;
  head.append(element('h2','',`${h.number}番 ${h.name}`));
  const reset=element('button','','リセット');reset.type='button';head.append(reset);card.append(head);
  const stats=element('div','numbers');
  const stat=(label,value,cls)=>{const outer=element('div','number'+(cls==='ev-value'?' ev-stat':''));outer.append(element('span','muted',label),element('strong',cls,value));stats.append(outer);};
  stat(data.mode==='real'||activeMode==='future'?'AI推定勝率':'デモ勝率',pct(h.probability),'probability');
  stat('フェアオッズ',h.probability?(1/h.probability).toFixed(2)+'倍':'∞','fair-odds');
  stat('期待回収率','','return-value');stat('期待利益率','','profit-value');stat('期待値倍率','','ev-value');card.append(stats);
  const initial=initialOdds(h)??1;
  const note=activeMode==='future'?(h.prestart_odds===null?'発走前オッズ：未取得（比較開始値1.0倍）':`発走前オッズ：${one(h.prestart_odds)}倍／取得：${when(h.odds_observed_at)}`):data.mode==='demo'?`架空の初期オッズ：${one(initial)}倍`:h.final_odds===null?'最終単勝オッズ：未取得（比較開始値1.0倍）':`収集済み最終単勝オッズ：${one(h.final_odds)}倍（事後分析）`;
  card.append(element('p','muted source-note',note));
  if(activeMode==='future')card.append(element('p','muted history-note',`確認済み過去走：${h.history_count}/5${h.history_count<5?'（履歴不足。推定の信頼性に注意）':''}`));
  else{const actual=analysis?.races.find(r=>r.id===raceId)?.runners.find(r=>r.number===h.number);card.append(element('p','muted result-note',actual?`実際の着順：${actual.finish}着／単勝払戻：${actual.win_payout_yen}円（100円当たり・事後）`:'実際の着順・払戻：補足データ未取得'));}
  const label=element('label','','比較オッズ（仮定値）');label.htmlFor=`odds-${h.number}`;card.append(label);
  const controls=element('div','controls');const range=element('input');range.type='range';range.min=1;range.max=Math.min(MAX_ODDS,Math.max(100,Math.ceil(h.odds+50)));range.step=.1;range.setAttribute('aria-label',`${h.name} 比較オッズスライダー`);
  const num=element('input');num.type='number';num.id=label.htmlFor;num.min=1;num.max=MAX_ODDS;num.step=.1;num.inputMode='decimal';num.setAttribute('aria-label',`${h.name} 比較オッズ数値入力`);
  const error=element('p','input-error');error.hidden=true;error.id=`error-${h.number}`;num.setAttribute('aria-describedby',error.id);
  controls.append(range,num);card.append(controls,error);
  const bar=element('div','bar'),fill=element('div','fill');bar.setAttribute('role','meter');bar.setAttribute('aria-label',`${h.name} 期待値倍率`);bar.setAttribute('aria-valuemin',0);bar.setAttribute('aria-valuemax',2);bar.append(fill);card.append(bar,element('div','muted','白い線が期待値1.0の基準です（表示上限2.0）'));
  const verdict=element('p','muted judgment');card.append(verdict);
  function set(v,origin){
   if(!Number.isFinite(v)||v<1||v>MAX_ODDS){error.textContent='1.0〜9999.0倍で入力してください';error.hidden=false;num.setAttribute('aria-invalid','true');return;}
   v=Math.round(v*10)/10;h.odds=v;memory.set(key(h),v);range.max=Math.min(MAX_ODDS,Math.max(Number(range.max),v));range.value=v;if(origin!==num)num.value=one(v);error.hidden=true;num.removeAttribute('aria-invalid');
   const m=metrics(h.probability,v);card.querySelector('.return-value').textContent=pct(m.ev);card.querySelector('.profit-value').textContent=(m.profitPct>=0?'+':'')+m.profitPct.toFixed(1)+'%';card.querySelector('.ev-value').textContent=m.ev.toFixed(3)+'倍';
   card.classList.toggle('value-pick',m.ev>1);fill.style.width=Math.min(100,m.ev*50)+'%';fill.style.background=m.ev>1?'#40c99e':'#d67b83';bar.setAttribute('aria-valuenow',Math.min(2,m.ev));bar.setAttribute('aria-valuetext',`期待値倍率${m.ev.toFixed(3)}`);
   verdict.textContent=m.ev>1?'モデル上の妙味：期待値1.0超':Math.abs(m.ev-1)<1e-9?'損益分岐点：期待値1.0':'期待値1.0未満';updateRanking();
  }
  reset.addEventListener('click',()=>set(initial));range.addEventListener('input',()=>set(Number(range.value),range));num.addEventListener('input',()=>set(num.value===''?NaN:Number(num.value),num));num.addEventListener('change',()=>{if(!num.hasAttribute('aria-invalid'))num.value=one(h.odds);});area.append(card);set(h.odds);
 });updateRanking();
}
function updateRanking(){const table=element('table'),thead=element('thead'),head=element('tr');for(const x of ['順位','馬名','オッズ','期待値'])head.append(element('th','',x));thead.append(head);table.append(thead);const body=element('tbody');[...current].sort((a,b)=>b.odds*b.probability-a.odds*a.probability||a.number-b.number).forEach((r,i)=>{const tr=element('tr');for(const x of [i+1,r.name,one(r.odds)+'倍',(r.odds*r.probability).toFixed(3)])tr.append(element('td','',x));body.append(tr);});table.append(body);$('ranking').replaceChildren(table);}
async function start(){
 $('error').hidden=true;try{
  async function get(name){const r=await fetch('./'+name,{cache:'no-store'});if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();}
  past=validateData(await get('predictions.json'));
  const extra=await Promise.allSettled([get('future.json').then(validateFuture),get('analysis.json').then(validateAnalysis)]);
  future=extra[0].status==='fulfilled'?extra[0].value:null;futureError=future?'':'未来予測データの読み込み・検証に失敗しました。架空の予測は表示しません。';
  analysis=extra[1].status==='fulfilled'?extra[1].value:null;switchMode();
 }catch(e){$('notice').textContent='予測データの読み込みエラー';$('error').hidden=false;$('error').replaceChildren(element('p','','通信または公開データの検証に失敗しました。未検証の値は表示していません。'));const retry=element('button','','再読み込み');retry.addEventListener('click',start);$('error').append(retry);$('cards').replaceChildren();$('ranking').replaceChildren();$('reset-all').hidden=true;}
}
$('mode').addEventListener('change',switchMode);$('date').addEventListener('change',tracks);$('track').addEventListener('change',races);$('race').addEventListener('change',()=>{raceId=$('race').value;draw();});$('reset-all').addEventListener('click',()=>{for(const h of current)memory.delete(key(h));draw();});start();
