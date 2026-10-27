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
