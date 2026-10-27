import {mkdir,rm,copyFile,readFile} from 'node:fs/promises';
import {validateData,validateFuture,validateAnalysis} from '../core.js';
validateData(JSON.parse(await readFile('predictions.json','utf8')));
validateFuture(JSON.parse(await readFile('future.json','utf8')));
validateAnalysis(JSON.parse(await readFile('analysis.json','utf8')));
await rm('dist',{recursive:true,force:true});await mkdir('dist');
for(const f of ['index.html','reliability.html','core.js','app.js','predictions.json','future.json','analysis.json','.nojekyll'])await copyFile(f,`dist/${f}`);
console.log('Built only allowlisted static files; no private source or logs included');
