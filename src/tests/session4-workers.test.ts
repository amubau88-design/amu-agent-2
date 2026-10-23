import assert from 'node:assert/strict';
import fs from 'node:fs';
const state=fs.mkdtempSync('scratch/session4-workers-test-');process.env.AMU_CENTRAL_STATE_DIR=state+'/access';process.env.AMU_CORE_STATE_DIR=state+'/core';fs.mkdirSync(state+'/access');
fs.writeFileSync(state+'/access/platform.json',JSON.stringify({threads:2,contextSize:1024}));
fs.writeFileSync(state+'/access/workers.json',JSON.stringify([{id:'primary',name:'Test primary',model:'qwen2.5:1.5b',threads:1,contextSize:1024,maxMemoryMiB:4096,enabled:true}]));
const {amuInference}=await import('../inference/engine.ts');
const {initializeCentral}=await import('../central/service.ts');
const {usage}=await import('../central/usage.ts');
const checks:string[]=[];
async function until(check:()=>boolean,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){if(check())return;await new Promise(r=>setTimeout(r,50));}throw Error('Worker test deadline');}
try{
 await initializeCentral();const primaryPid=(amuInference.status().nativeProcess as any).pid;
 const secondary=await amuInference.register({name:'Second native worker',model:'qwen2.5:1.5b',threads:1,contextSize:1024,maxMemoryMiB:4096});assert.equal(secondary.enabled,false);assert.equal(amuInference.workers().find(w=>w.id===secondary.id)!.status.nativeProcess,null);
 await assert.rejects(amuInference.workerControl(secondary.id,'start'),(e:any)=>e.status===409);
 await amuInference.workerControl(secondary.id,'start',true);const secondaryPid=(amuInference.workers().find(w=>w.id===secondary.id)!.status.nativeProcess as any).pid;assert.notEqual(secondaryPid,primaryPid);
 checks.push('dynamic registration remains unloaded, duplicate loading requires approval, two actual independent native PIDs');
 const excessive=await amuInference.register({name:'CPU overflow',model:'qwen2.5:1.5b',threads:1,contextSize:1024,maxMemoryMiB:4096});await assert.rejects(amuInference.workerControl(excessive.id,'start',true),(e:any)=>e.status===429);
 const insufficient=await amuInference.register({name:'RAM insufficient',model:'qwen2.5:1.5b',threads:1,contextSize:1024,maxMemoryMiB:256});await assert.rejects(amuInference.workerControl(insufficient.id,'start',true),(e:any)=>e.status===507);
 assert.equal((amuInference.status().nativeProcess as any).pid,primaryPid);checks.push('aggregate CPU and individual RAM admission reject extra workers before loading');
 let peak=0;const observe=setInterval(()=>{peak=Math.max(peak,amuInference.status().active);},10);
 const generate=()=>amuInference.generate({model:'qwen2.5:1.5b',messages:[{role:'user',content:'List twenty numbers'}],maxTokens:16});const results=await Promise.all([generate(),generate()]);clearInterval(observe);assert.equal(peak,2);assert.ok(results.every(r=>r.content.length>0));checks.push('two real simultaneous GGUF generations through common dispatcher');
 const unaffected=generate();process.kill(secondaryPid,'SIGKILL');await unaffected;await until(()=>{const w=amuInference.workers().find(w=>w.id===secondary.id)!;return w.status.ready&&(w.status.nativeProcess as any)?.pid!==secondaryPid;});assert.equal((amuInference.status().nativeProcess as any).pid,primaryPid);checks.push('secondary native crash recovered automatically without replacing primary');
 await amuInference.workerControl(secondary.id,'stop');const stopped=amuInference.workers().find(w=>w.id===secondary.id)!;assert.equal(stopped.enabled,false);assert.equal(stopped.status.nativeProcess,null);assert.equal(JSON.parse(fs.readFileSync(state+'/access/workers.json','utf8')).find((w:any)=>w.id===secondary.id).enabled,false);checks.push('stop releases native process and persists registry state');
 const evidence={passed:true,time:new Date().toISOString(),checks,peakParallelNativeGenerations:peak,resources:amuInference.status().capacity,clientUsageFormatAvailable:!!usage('test').day};fs.writeFileSync(state+'/verification.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{await amuInference.close();}
