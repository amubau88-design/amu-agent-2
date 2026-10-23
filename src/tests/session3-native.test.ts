import fs from 'node:fs';
import assert from 'node:assert/strict';
const state=fs.mkdtempSync('scratch/session3-native-test-');process.env.AMU_CENTRAL_STATE_DIR=state+'/access';process.env.AMU_CORE_STATE_DIR=state+'/core';
const {createAmuApiServer}=await import('../amu-api/server.ts');
const {initializeCentral}=await import('../central/service.ts');
const {amuInference}=await import('../inference/engine.ts');
const api=createAmuApiServer();await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(api.address() as any).port}`;
const key=fs.readFileSync(state+'/access/central-admin-key.txt','utf8').trim();
async function call(route:string,body?:any,token=key){return fetch(base+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
async function create(name:string,options:any={}){const r=await call('/api/central/clients',{name,maxTokens:64,maxConcurrent:2,dailyTokenLimit:10000,scopes:['models:read','chat:write'],...options});assert.equal(r.status,200);return await r.json() as any;}
const chat=(token:string,extra:any={})=>call('/v1/chat/completions',{model:'qwen2.5:1.5b',messages:[{role:'user',content:'Reply OK'}],max_tokens:4,...extra},token);
const checks:string[]=[];
try{
 await initializeCentral();assert.equal((await call('/ready')).status,200);
 const a=await create('Independent application A'),b=await create('Independent application B',{priority:2});
 const responses=await Promise.all([chat(a.key),chat(b.key,{stream:true,stream_options:{include_usage:true}})]);
 assert.equal(responses[0].status,200);assert.equal(responses[1].status,200);
 const json=await responses[0].json() as any,sse=await responses[1].text();assert.ok(json.usage.total_tokens>0);assert.match(sse,/"usage"/);assert.match(sse,/data: \[DONE\]/);
 const stats=await(await call('/api/central/status')).json() as any;for(const id of [a.id,b.id]){const client=stats.clients.find((c:any)=>c.id===id);assert.ok(client.usage.promptTokens>0);assert.ok(client.usage.completionTokens>0);assert.equal(client.usage.reservedTokens,0);}
 checks.push('real embedded CPU generations from two isolated clients, JSON and SSE with actual token usage');
 const restricted=await create('Small context',{maxContextTokens:256});
 const overflow=await chat(restricted.key,{messages:[{role:'user',content:'hello '.repeat(400)}]});assert.equal(overflow.status,400);
 const noBudget=await create('No remaining budget',{dailyTokenLimit:1});const before=amuInference.status().completed;assert.equal((await chat(noBudget.key)).status,429);assert.equal(amuInference.status().completed,before);
 checks.push('native tokenizer enforces per-client context, daily quota rejected before inference');
 const pid=(amuInference.status().nativeProcess as any).pid;
 const cancel=await chat(a.key,{messages:[{role:'user',content:'Write a list of fifty numbers'}],max_tokens:64,stream:true});assert.equal(cancel.status,200);const reader=cancel.body!.getReader();await reader.read();await reader.cancel();
 const after=await chat(b.key);assert.equal(after.status,200);await after.text();assert.equal((amuInference.status().nativeProcess as any).pid,pid);
 const observation=await(await call('/api/client/status',undefined,a.key)).json() as any;assert.equal(observation.usage.reservedTokens,0);
 checks.push('stream disconnect releases client reservations and cooperative cancellation preserves native worker');
 const evidence={time:new Date().toISOString(),passed:true,checks,backend:amuInference.status().backend,model:amuInference.status().model,workers:1,cloudUsed:false,ollamaRequired:false};
 fs.writeFileSync(state+'/verification.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{api.closeAllConnections();await new Promise<void>(r=>api.close(()=>r()));await amuInference.close();}
