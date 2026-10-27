import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {validateData,metrics} from '../core.js';
const data=JSON.parse(await readFile('predictions.json','utf8'));
test('actual public JSON validates and contains no extra fields',()=>{validateData(data);assert.ok(['real','demo'].includes(data.mode));});
test('expected-value formulas',()=>{const m=metrics(.2,6);assert.ok(Math.abs(m.ev-1.2)<1e-10);assert.ok(Math.abs(m.returnPct-120)<1e-10);assert.ok(Math.abs(m.profitPct-20)<1e-10);assert.equal(m.fairOdds,5);assert.equal(metrics(0,2).fairOdds,Infinity);});
test('reject nonfinite values and private keys',()=>{assert.throws(()=>metrics(NaN,2));assert.throws(()=>metrics(.2,Infinity));const d=structuredClone(data);d.internal_log='forbidden';assert.throws(()=>validateData(d));});
test('race probabilities must sum to 100 percent',()=>{const d=structuredClone(data);d.races[0].runners[0].probability=.9999;assert.throws(()=>validateData(d));});
test('duplicate runners rejected',()=>{const d=structuredClone(data);if(d.races[0].runners.length>1){d.races[0].runners[1].number=d.races[0].runners[0].number;assert.throws(()=>validateData(d));}});

import {validateFuture,validateAnalysis} from '../core.js';
const futureFixture=()=>({schema_version:2,mode:'future',generated_at:'2099-01-01T01:00:00Z',status:'ready',message:'人工の画面テスト専用',model_version:'fixture-only',races:[{id:'209905010101',date:'2099-01-02',track:'東京',number:1,start_at:'2099-01-02T01:00:00Z',prediction_at:'2099-01-01T01:00:00Z',entry_observed_at:'2099-01-01T00:00:00Z',source_url:'https://www.jra.go.jp/JRADB/accessD.html?CNAME=pw01dde1005209901010120990102/AA',runners:[{number:1,name:'画面テストA',probability:.6,prestart_odds:2.5,odds_observed_at:'2099-01-01T00:00:00Z',history_count:5},{number:2,name:'画面テストB',probability:.4,prestart_odds:null,odds_observed_at:null,history_count:0}]}]});
test('actual future and historical-details JSON validate',async()=>{validateFuture(JSON.parse(await readFile('future.json','utf8')));validateAnalysis(JSON.parse(await readFile('analysis.json','utf8')));});
test('artificial pre-start fixture validates; empty does not invent races',()=>{validateFuture(futureFixture());const d=futureFixture();d.status='unavailable';d.races=[];validateFuture(d);});
test('future data rejects outcomes, horse IDs and post-start odds',()=>{for(const field of ['finish','horse_id','final_odds','secret']){const d=futureFixture();d.races[0].runners[0][field]='forbidden';assert.throws(()=>validateFuture(d));}const d=futureFixture();d.races[0].runners[0].odds_observed_at=d.races[0].start_at;assert.throws(()=>validateFuture(d));});
test('future predictions must precede start and sum to one',()=>{let d=futureFixture();d.races[0].prediction_at=d.races[0].start_at;assert.throws(()=>validateFuture(d));d=futureFixture();d.races[0].runners[0].probability=.7;assert.throws(()=>validateFuture(d));});
test('historical outcome details reject private extras',()=>{assert.throws(()=>validateAnalysis({schema_version:1,mode:'historical_details',generated_at:'2026-01-01T00:00Z',prediction_created_at:'2026-01-01T00:00Z',model_version:'v1',races:[],horse_id:'private'}));});

test('break-even probability and probability gap stay separate from EV',()=>{const m=metrics(.2,5);assert.equal(m.breakEvenProbability,.2);assert.equal(m.probabilityGap,0);assert.equal(m.ev,1);const x=metrics(.2,10);assert.equal(x.breakEvenProbability,.1);assert.equal(x.probabilityGap,.1);});

test('public reliability metadata rejects invented uncertainty intervals',async()=>{const d=JSON.parse(await readFile('analysis.json','utf8'));d.races[0].runners[0].history_count=2;d.races[0].runners[0].uncertainty=null;d.races[0].runners[0].odds_observed_at=null;validateAnalysis(d);d.races[0].runners[0].uncertainty=[.1,.3];assert.throws(()=>validateAnalysis(d));});
