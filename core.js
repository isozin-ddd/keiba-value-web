export const MAX_ODDS = 9999;
export function metrics(probability, odds) {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new Error('勝率が不正です');
  if (!Number.isFinite(odds) || odds < 1 || odds > MAX_ODDS) throw new Error('オッズが範囲外です');
  const ev = probability * odds;
  return { ev, returnPct: ev * 100, profitPct: (ev - 1) * 100, fairOdds: probability ? 1 / probability : Infinity };
}
function exactKeys(object, required, optional = []) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) throw new Error('データ形式が不正です');
  if (required.some(k => !Object.hasOwn(object, k)) || Object.keys(object).some(k => ![...required, ...optional].includes(k))) throw new Error('公開データに不足項目または許可されていない項目があります');
}
function text(value, max = 80) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f]/.test(value);
}
export function validateData(data) {
  exactKeys(data, ['schema_version','mode','generated_at','model_status','races']);
  if (data.schema_version !== 1 || !['demo','real'].includes(data.mode)) throw new Error('対応していないデータです');
  if (!text(data.generated_at) || !Number.isFinite(Date.parse(data.generated_at))) throw new Error('生成日時が不正です');
  if (data.model_status !== (data.mode === 'demo' ? 'untrained' : 'trained')) throw new Error('モデル状態が不正です');
  if (!Array.isArray(data.races) || !data.races.length || data.races.length > 1000) throw new Error('レースがありません');
  const ids = new Set(), identities = new Set();
  for (const r of data.races) {
    exactKeys(r, ['id','date','track','number','runners'], ['source']);
    if (!text(r.id, 60) || !/^[a-zA-Z0-9_-]+$/.test(r.id) || ids.has(r.id)) throw new Error('レースIDが不正です');
    ids.add(r.id);
    if (!text(r.date, 10) || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || new Date(r.date).toISOString().slice(0,10) !== r.date || !text(r.track, 30)) throw new Error('開催情報が不正です');
    if (!Number.isInteger(r.number) || r.number < 1 || r.number > 12) throw new Error('レース番号が不正です');
    const identity = `${r.date}/${r.track}/${r.number}`;
    if (identities.has(identity)) throw new Error('レースが重複しています');
    identities.add(identity);
    if (!Array.isArray(r.runners) || !r.runners.length || r.runners.length > 18) throw new Error('出走馬の数が不正です');
    if (r.source !== undefined) {
      exactKeys(r.source, ['url','page']);
      const url = new URL(r.source.url);
      if (url.protocol !== 'https:' || !['www.jra.go.jp','jra.go.jp'].includes(url.hostname) || url.username || url.password || url.search || url.hash || !url.pathname.toLowerCase().endsWith('.pdf') || !Number.isInteger(r.source.page) || r.source.page < 1) throw new Error('公式出典が不正です');
    }
    const numbers = new Set(); let sum = 0;
    for (const h of r.runners) {
      exactKeys(h, ['number','name','probability','final_odds']);
      if (!Number.isInteger(h.number) || h.number < 1 || h.number > 18 || numbers.has(h.number) || !text(h.name, 50)) throw new Error('馬情報が不正です');
      numbers.add(h.number);
      metrics(h.probability, h.final_odds ?? 1);
      if (h.final_odds !== null && Math.abs(h.final_odds * 10 - Math.round(h.final_odds * 10)) > 1e-7) throw new Error('最終オッズの小数桁が不正です');
      if (data.mode === 'real' && h.final_odds !== null && !r.source) throw new Error('最終オッズの公式出典がありません');
      sum += h.probability;
    }
    if (Math.abs(sum - 1) > 1e-6) throw new Error('レースの勝率合計は100%が必要です');
  }
  return data;
}
export function rank(race, odds) {
  return race.runners.map(h => ({...h, ...metrics(h.probability, odds.get(`${race.id}:${h.number}`) ?? h.final_odds ?? 1)}))
    .sort((a,b) => b.ev - a.ev || a.number - b.number);
}

function timestamp(v){return text(v)&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));}
export function validateFuture(data){
 exactKeys(data,['schema_version','mode','generated_at','status','message','model_version','races']);
 if(data.schema_version!==2||data.mode!=='future'||!['ready','unavailable'].includes(data.status)||!timestamp(data.generated_at)||!text(data.message,400)||!text(data.model_version,80)||!Array.isArray(data.races)||data.races.length>100)throw Error('未来予測データの形式が不正です');
 if((data.status==='ready')!==Boolean(data.races.length))throw Error('未来予測の状態と件数が不一致です');
 const ids=new Set();
 for(const r of data.races){
  exactKeys(r,['id','date','track','number','start_at','prediction_at','entry_observed_at','source_url','runners']);
  if(!/^\d{12}$/.test(r.id)||ids.has(r.id)||!text(r.track,30)||!Number.isInteger(r.number)||r.number<1||r.number>12)throw Error('未来レース情報が不正です');ids.add(r.id);
  if(![r.start_at,r.prediction_at,r.entry_observed_at].every(timestamp)||!(Date.parse(r.entry_observed_at)<=Date.parse(r.prediction_at)&&Date.parse(r.prediction_at)<Date.parse(r.start_at))||Date.parse(r.prediction_at)>Date.parse(data.generated_at)||new Date(Date.parse(r.start_at)+9*3600000).toISOString().slice(0,10)!==r.date)throw Error('発走前の時刻検証に失敗しました');
  const u=new URL(r.source_url);if(u.protocol!=='https:'||u.hostname!=='www.jra.go.jp'||u.pathname!=='/JRADB/accessD.html'||u.username||u.password||u.hash||[...u.searchParams.keys()].join(',')!=='CNAME'||!/^pw01dde[\da-zA-Z/]+$/.test(u.searchParams.get('CNAME')))throw Error('公式出馬表の出典が不正です');
  if(!Array.isArray(r.runners)||r.runners.length<2||r.runners.length>18)throw Error('未来出走馬数が不正です');
  const numbers=new Set();let sum=0;
  for(const h of r.runners){
   exactKeys(h,['number','name','probability','prestart_odds','odds_observed_at','history_count']);
   if(!Number.isInteger(h.number)||h.number<1||h.number>18||numbers.has(h.number)||!text(h.name,50)||!Number.isInteger(h.history_count)||h.history_count<0||h.history_count>5)throw Error('未来の馬情報が不正です');numbers.add(h.number);metrics(h.probability,h.prestart_odds??1);sum+=h.probability;
   if(h.prestart_odds===null){if(h.odds_observed_at!==null)throw Error('未取得オッズの時刻が不正です');}
   else if(!timestamp(h.odds_observed_at)||Date.parse(h.odds_observed_at)>Date.parse(r.prediction_at)||Date.parse(h.odds_observed_at)>=Date.parse(r.start_at)||Date.parse(r.prediction_at)-Date.parse(h.odds_observed_at)>24*3600000)throw Error('発走前オッズの時刻が不正です');
  }
  if(Math.abs(sum-1)>1e-6)throw Error('未来勝率の合計は100%が必要です');
 }
 return data;
}
export function validateAnalysis(data){
 exactKeys(data,['schema_version','mode','generated_at','model_version','prediction_created_at','races']);
 if(data.schema_version!==1||data.mode!=='historical_details'||!timestamp(data.generated_at)||(data.prediction_created_at!==null&&!timestamp(data.prediction_created_at))||!text(data.model_version,80)||!Array.isArray(data.races)||data.races.length>1000)throw Error('事後成績データの形式が不正です');
 const ids=new Set();
 for(const r of data.races){exactKeys(r,['id','runners']);if(!/^\d{12}$/.test(r.id)||ids.has(r.id)||!Array.isArray(r.runners)||r.runners.length<2||r.runners.length>18)throw Error('事後レース情報が不正です');ids.add(r.id);const nums=new Set();for(const h of r.runners){exactKeys(h,['number','finish','win_payout_yen']);if(!Number.isInteger(h.number)||h.number<1||h.number>18||nums.has(h.number)||!Number.isInteger(h.finish)||h.finish<1||h.finish>18||!Number.isInteger(h.win_payout_yen)||h.win_payout_yen<0)throw Error('事後成績が不正です');nums.add(h.number);}}
 return data;
}
