import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
const state=fs.mkdtempSync('scratch/session3-platform-test-');
process.env.AMU_CENTRAL_STATE_DIR=state;process.env.AMU_CORE_STATE_DIR=state+'/core';
fs.writeFileSync(state+'/platform.json',JSON.stringify({gatewayConcurrency:1,queueCapacity:4,requestTimeoutMs:10000}));
const {createAmuApiServer}=await import('../amu-api/server.ts');
const {fairIndex,validatePlatform}=await import('../central/platform.ts');
const {generationLease}=await import('../inference/policy.ts');
const {usage}=await import('../central/usage.ts');
const key=fs.readFileSync(state+'/central-admin-key.txt','utf8').trim();
const api=createAmuApiServer();
let held=false;const order:string[]=[];const gates:Array<()=>void>=[];
const fake=http.createServer(async(req,res)=>{
 if(req.url==='/v1/models'){res.end(JSON.stringify({object:'list',data:[{id:'fixture-model'}]}));return;}
 let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);order.push(body.messages.at(-1).content);
 if(held)await new Promise<void>(resolve=>{gates.push(resolve);res.once('close',resolve);});
 if(res.destroyed)return;
 if(body.stream){res.setHeader('Content-Type','text/event-stream');res.end('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n');}
 else res.end(JSON.stringify({choices:[{message:{content:'OK'}}],usage:{prompt_tokens:2,completion_tokens:3}}));
});
await new Promise<void>(r=>fake.listen(0,'127.0.0.1',r));await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${(api.address() as any).port}`;
async function call(route:string,body?:any,token=key){return fetch(base+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
async function json(route:string,body?:any,token=key){const r=await call(route,body,token);assert.equal(r.status,200,await r.clone().text());return await r.json() as any;}
async function client(name:string,options:any={}){return json('/api/central/clients',{name,maxConcurrent:16,scopes:['models:read','chat:write'],...options});}
const chat=(token:string,label='Hello',extra:any={})=>call('/v1/chat/completions',{model:'fixture-model',messages:[{role:'user',content:label}],max_tokens:8,...extra},token);
async function until(check:()=>boolean|Promise<boolean>){for(let i=0;i<150;i++){if(await check())return;await new Promise(r=>setTimeout(r,10));}throw Error('Fixture deadline');}
const checks:string[]=[];
try{
 const script=fs.readFileSync('src/web-ui/public/admin.html','utf8').match(/<script>([\s\S]*)<\/script>/)![1];new vm.Script(script);
 assert.throws(()=>validatePlatform({threads:0}));assert.throws(()=>validatePlatform({reserveMiB:512,criticalFreeMiB:512}));assert.throws(()=>validatePlatform({queueCapacity:Infinity}));
 let last='',turn=0;const seen=new Set<string>();const fixture=['a','b','c'].map(id=>({id,priority:id==='a'?2:0}));
 for(let i=0;i<12;i++){const chosen=fixture[fairIndex(fixture,x=>x.id,x=>x.priority,last,turn++)];if(turn%2===1)last=chosen.id;seen.add(chosen.id);}assert.equal(seen.size,3);
 checks.push('dashboard script syntax, bounded portable settings, non-starving priority scheduling');
 assert.equal((await call('/ready')).status,503);assert.equal((await call('/health')).status,200);
 await json('/api/central/connection',{upstream:`http://127.0.0.1:${(fake.address() as any).port}/v1`,model:'fixture-model'});
 assert.equal((await call('/readyz')).status,200);
 const normal=await client('Any future application');const disabled=await client('Initially disabled',{enabled:false});assert.equal((await call('/v1/models',undefined,disabled.key)).status,401);
 const settings={id:normal.id,name:'Renamed application',models:['fixture-model'],rpm:600,maxTokens:512,maxConcurrent:16,enabled:true,scopes:['models:read'],dailyTokenLimit:1000,maxContextTokens:1024,priority:0};
 await json('/api/central/clients/update',settings);assert.equal((await chat(normal.key)).status,403);assert.equal((await call('/v1/models',undefined,normal.key)).status,200);assert.equal((await call('/api/core/tasks',undefined,normal.key)).status,403);
 await json('/api/central/clients/update',{...settings,scopes:['models:read','chat:write']});assert.equal((await chat(normal.key)).status,200);
 const own=await json('/api/client/status',undefined,normal.key);assert.equal(own.name,'Renamed application');assert.equal(own.usage.promptTokens,2);assert.equal(own.usage.completionTokens,3);assert.ok(own.usage.errors>=2);
 await json('/api/central/clients/update',{...settings,scopes:[],enabled:false});assert.equal((await call('/v1/models',undefined,normal.key)).status,401);
 await json('/api/central/clients/update',{...settings,scopes:['models:read','chat:write'],enabled:true});
 const rotated=await json('/api/central/rotate',{id:normal.id});assert.equal((await call('/v1/models',undefined,normal.key)).status,401);assert.equal((await call('/v1/models',undefined,rotated.key)).status,200);
 await json('/api/central/clients/update',{...settings,scopes:['models:read','chat:write'],dailyTokenLimit:1});assert.equal((await chat(rotated.key)).status,429);
 const limited=await client('Developer quota',{role:'developer',scopes:['core:tasks'],dailyTokenLimit:2000,maxTokens:64});
 const leaseInput:any={model:'qwen2.5:1.5b',messages:[{role:'user',content:'Hello'}],maxTokens:768,source:'core',clientId:limited.id};const lease=generationLease(leaseInput)!;assert.equal(leaseInput.maxTokens,64);assert.ok(usage(limited.id).reservedTokens>0);lease.settle({content:'OK',usage:{prompt_tokens:1,completion_tokens:2},finishReason:'stop',durationMs:1,ttftMs:1});assert.equal(usage(limited.id).dailyTokens,3);
 assert.throws(()=>generationLease({...leaseInput,source:undefined}),/scope denied/);
 checks.push('arbitrary apps, rename, API/model/role separation, disable/enable, key rotation, quota and Core policy');
 const blocker=await client('Blocker'),a=await client('A'),c=await client('C'),priority=await client('Priority',{priority:2}),overflow=await client('Overflow');
 held=true;const pending:Promise<Response>[]=[];
 pending.push(chat(blocker.key,'block'));await until(()=>gates.length===1);
 for(const [token,label] of [[a.key,'A1'],[a.key,'A2'],[c.key,'C'],[priority.key,'P']]){pending.push(chat(token,label));await until(async()=>{const status=await json('/api/central/status');return status.scheduler.queued===pending.length-1;});}
 const rejected=await chat(overflow.key,'overflow');assert.equal(rejected.status,429);assert.equal((await rejected.json() as any).error.reason,'resource_limit');
 gates.shift()!();await until(()=>gates.length===1);assert.equal(order.at(-1),'A1');gates.shift()!();await until(()=>gates.length===1);assert.equal(order.at(-1),'P');gates.shift()!();await until(()=>gates.length===1);assert.equal(order.at(-1),'C');gates.shift()!();await until(()=>gates.length===1);assert.equal(order.at(-1),'A2');gates.shift()!();
 for(const result of await Promise.all(pending)){assert.equal(result.status,200);await result.text();}
 checks.push('real HTTP global backpressure and priority plus round-robin across queued applications');
 const cancellation=chat(a.key,'cancel');await until(()=>gates.length===1);await json('/api/central/revoke',{id:a.id});assert.equal((await cancellation).status,401);gates.shift()?.();held=false;
 const audit=fs.readFileSync(state+'/requests.ndjson','utf8').trim().split('\n').map(line=>JSON.parse(line));assert.ok(audit.some(e=>e.clientId===normal.id&&e.status===403&&e.requestId));assert.ok(!JSON.stringify(audit).includes(rotated.key));
 const profile=await json('/api/central/platform');await json('/api/central/platform',{...profile.configuration,queueCapacity:8});const saved=await json('/api/central/platform');assert.equal(saved.configuration.queueCapacity,4);assert.equal(saved.savedConfiguration.queueCapacity,8);
 const persisted=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',`import {usage} from './src/central/usage.ts';console.log(JSON.stringify(usage('${limited.id}')))`],{encoding:'utf8',env:{...process.env,AMU_CENTRAL_STATE_DIR:state}});assert.equal(persisted.status,0,persisted.stderr);assert.equal(JSON.parse(persisted.stdout).dailyTokens,3);
 const config=JSON.parse(fs.readFileSync(state+'/central-access.json','utf8'));assert.equal(config.clients.find((c:any)=>c.id===normal.id).name,'Renamed application');assert.ok(!JSON.stringify(config).includes(rotated.key));
 checks.push('revocation cancels in-flight work, private request audit, saved-vs-active configuration, persisted counters and hashed keys');
 fs.writeFileSync(state+'/verification.json',JSON.stringify({passed:true,checks,time:new Date().toISOString()},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
}finally{for(const release of gates)release();api.closeAllConnections();fake.closeAllConnections();await Promise.all([new Promise<void>(r=>api.close(()=>r())),new Promise<void>(r=>fake.close(()=>r()))]);}
