import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
const state=fs.mkdtempSync('scratch/session2-runtime-test-');process.env.AMU_CENTRAL_STATE_DIR=state+'/access';process.env.AMU_CORE_STATE_DIR=state+'/core';process.env.AMU_SUPERVISOR_STATE_DIR=state;
const {amuInference}=await import('../inference/engine.ts');const {assessModel,memoryBudget,assertMemoryBudget}=await import('../inference/resources.ts');const {createAmuApiServer}=await import('../amu-api/server.ts');const {initializeCentral}=await import('../central/service.ts');
const api=createAmuApiServer();await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(api.address() as any).port}`,key=fs.readFileSync(state+'/access/central-admin-key.txt','utf8').trim();
async function call(endpoint:string,body?:any,token=key){return fetch(base+endpoint,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
const free=os.freemem;
try{
 assert.equal(memoryBudget(24*2**30,1*2**30),0);assert.throws(()=>assertMemoryBudget(10,9));
 const assessment=await assessModel('qwen2.5:1.5b');assert.ok(assessment.estimatedRamBytes>assessment.bytes);assert.equal(assessment.estimateOnly,true);
 await initializeCentral();const before=amuInference.status();assert.equal(before.ready,true);
 os.freemem=()=>0;await assert.rejects(amuInference.selectModel('qwen2.5:1.5b'),(e:any)=>e.status===507);os.freemem=free;assert.deepEqual(amuInference.status().nativeProcess,before.nativeProcess);assert.equal(amuInference.status().ready,true);
 const operator=await(await call('/api/central/clients',{name:'runtime-operator',role:'operator'})).json() as any;
 const models=await(await call('/api/central/models',undefined,operator.key)).json() as any;assert.equal(models.models[0].assessment.loadable,true);
 const stream=await call('/v1/chat/completions',{model:'qwen2.5:1.5b',messages:[{role:'user',content:'Reply OK'}],max_tokens:4,stream:true,stream_options:{include_usage:true}});assert.equal(stream.status,200);const sse=await stream.text();assert.match(sse,/"usage"/);assert.match(sse,/\[DONE\]/);
 assert.equal((await call('/api/central/engine/control',{action:'stop'},operator.key)).status,200);assert.equal(amuInference.status().nativeProcess,null);assert.equal(amuInference.status().state,'paused');
 const paused=await call('/v1/chat/completions',{messages:[{role:'user',content:'Hi'}],max_tokens:4});assert.equal(paused.status,503);
 assert.equal((await call('/api/central/engine/control',{action:'start'},operator.key)).status,200);assert.equal(amuInference.status().ready,true);
 // Queue and cancel a second native request while the first is producing tokens.
 let queued:Promise<any>|undefined;let queuedRejection:Promise<any>|undefined;
 const result=await amuInference.generate({model:'qwen2.5:1.5b',messages:[{role:'user',content:'Write a list of twenty numbers.'}],maxTokens:16,onChunk:()=>{if(queued)return;queued=amuInference.generate({model:'qwen2.5:1.5b',messages:[{role:'user',content:'Queued test'}],maxTokens:4});queuedRejection=assert.rejects(queued,(e:any)=>e.status===499);const waiting=amuInference.status().requests.find(r=>r.state==='queued');assert.ok(waiting);amuInference.cancel(waiting.id);}});
 assert.ok(result.content);assert.ok(queuedRejection);await queuedRejection;assert.equal(amuInference.status().queued,0);
 const nativePid=(amuInference.status().nativeProcess as any).pid;const stop=new AbortController();
 const active=amuInference.generate({model:'qwen2.5:1.5b',messages:[{role:'user',content:'Write a long list of numbers.'}],maxTokens:128,signal:stop.signal,onChunk:()=>stop.abort(new DOMException('Cooperative cancellation test','AbortError'))});await assert.rejects(active);
 const afterCancel=await amuInference.generate({model:'qwen2.5:1.5b',messages:[{role:'user',content:'Reply OK'}],maxTokens:4});assert.ok(afterCancel.content);assert.equal((amuInference.status().nativeProcess as any).pid,nativePid);assert.ok(amuInference.status().cancelled>=2);
 const runningBeforePressure=amuInference.status().ready;assert.equal(runningBeforePressure,true);assert.equal(await amuInference.enforceMemoryPressure(0),true);assert.equal(amuInference.status().nativeProcess,null);assert.equal(amuInference.status().state,'paused-memory-pressure');
 console.log(JSON.stringify({passed:true,checks:['GGUF RAM estimate','low-memory model switch refused before releasing current model','operator permission controls','real SSE usage and DONE','idle unload releases native process','paused inference refuses requests','engine start reloads model','queued cancellation preserves running request','cooperative active cancellation reuses loaded model','simulated critical RAM pressure releases native process'],assessment,engine:amuInference.status()},null,2));
}finally{os.freemem=free;api.closeAllConnections();await new Promise<void>(r=>api.close(()=>r()));await amuInference.close();}
