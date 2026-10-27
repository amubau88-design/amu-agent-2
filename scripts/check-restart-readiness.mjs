import fs from 'node:fs';import {restartAssessment} from './lib/restart-readiness.mjs';
const prefix=process.argv[2];if(!/^session[0-9]+$/.test(prefix||''))throw Error('Usage: node scripts/check-restart-readiness.mjs session24');
const read=s=>JSON.parse(fs.readFileSync('scratch/'+prefix+'-'+s+'.json','utf8'));
const health=await(await fetch('http://127.0.0.1:3030/health',{signal:AbortSignal.timeout(5000)})).json();
const webEvidence=JSON.parse(fs.readFileSync('scratch/cleanup-project-checks-final.json','utf8'));
const result=restartAssessment({environment:read('environment'),services:read('services'),health,backup:read('backup-before'),verification:read('verify-before'),recovery:read('recovery-supplement'),web:{...webEvidence.web,checkedAt:webEvidence.at}});
const output='scratch/'+prefix+'-restart-readiness-'+Date.now()+'.json';fs.writeFileSync(output,JSON.stringify({at:new Date().toISOString(),...result,health},null,2),{flag:'wx'});console.log(JSON.stringify({output,...result}));if(!result.evidenceComplete)process.exitCode=1;

