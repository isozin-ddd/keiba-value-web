import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {validateData,metrics} from '../core.js';
const data=JSON.parse(await readFile('predictions.json','utf8'));
test('actual public JSON validates and contains no extra fields',()=>{validateData(data);assert.ok(['real','demo'].includes(data.mode));});
test('expected-value formulas',()=>{const m=metrics(.2,6);assert.ok(Math.abs(m.ev-1.2)<1e-10);assert.ok(Math.abs(m.returnPct-120)<1e-10);assert.ok(Math.abs(m.profitPct-20)<1e-10);assert.equal(m.fairOdds,5);assert.equal(metrics(0,2).fairOdds,Infinity);});
test('reject nonfinite values and private keys',()=>{assert.throws(()=>metrics(NaN,2));assert.throws(()=>metrics(.2,Infinity));const d=structuredClone(data);d.internal_log='forbidden';assert.throws(()=>validateData(d));});
test('race probabilities must sum to 100 percent',()=>{const d=structuredClone(data);d.races[0].runners[0].probability=.9999;assert.throws(()=>validateData(d));});
test('duplicate runners rejected',()=>{const d=structuredClone(data);if(d.races[0].runners.length>1){d.races[0].runners[1].number=d.races[0].runners[0].number;assert.throws(()=>validateData(d));}});
