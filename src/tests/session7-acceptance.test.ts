import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const root=path.resolve(fs.mkdtempSync('scratch/session7-acceptance-test-'));
process.env.AMU_BACKUP_PROJECT_ROOT=root;process.env.AMU_CENTRAL_STATE_DIR=root+'/scratch/secrets';process.env.AMU_CORE_STATE_DIR=root+'/scratch/core';
fs.mkdirSync(root+'/scratch/secrets',{recursive:true});fs.mkdirSync(root+'/scratch/core');
fs.writeFileSync(root+'/scratch/secrets/platform.json',JSON.stringify({gatewayConcurrency:1,queueCapacity:1}));
for(const name of ['src','scripts','docs']){fs.mkdirSync(root+'/'+name);fs.writeFileSync(root+'/'+name+'/fixture.txt','preserved program code');}
for(const name of ['package.json','package-lock.json','tsconfig.json','README.md'])fs.copyFileSync(name,root+'/'+name);
fs.writeFileSync(root+'/scratch/core/preserved.db','CURRENT RUNTIME DATA');
const {createAmuApiServer}=await import('../amu-api/server.ts');
const {amuInference}=await import('../inference/engine.ts');
const {closeIdentityJournal}=await import('../central/idempotency.ts');
const {stopAdmissionMonitoring}=await import('../central/service.ts');
const {stopMonitoring}=await import('../core/monitoring.ts');
const {backupStatus}=await import('../backup/manager.ts');
const api=createAmuApiServer();await new Promise<void>(resolve=>api.listen(0,'127.0.0.1',resolve));
const port=(api.address() as any).port,base='http://127.0.0.1:'+port,key=fs.readFileSync(root+'/scratch/secrets/central-admin-key.txt','utf8').trim(),checks:string[]=[];
async function request(route:string,body?:any,token=key){return fetch(base+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
async function json(route:string,body?:any,token=key):Promise<any>{const response=await request(route,body,token);assert.ok([200,202].includes(response.status),await response.clone().text());return response.json();}
async function wait(check:()=>boolean){for(let i=0;i<200;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Targeted fixture deadline');}
async function finish(job:any):Promise<any>{await wait(()=>backupStatus().jobs.find(item=>item.id===job.id)?.state!=='running');const current=backupStatus().jobs.find(item=>item.id===job.id)!;assert.equal(current.state,'completed',current.error);return current.result;}
try{
 const apps:any[]=[];for(const name of ['AMU-Agent-3 fixture','AMU WEB fixture','AMU SYSTEM fixture','AMU Preis Assistent fixture','Fifth future application fixture'])apps.push(await json('/api/central/clients',{name,role:'inference',models:['qwen2.5:1.5b'],scopes:['models:read','chat:write'],maxConcurrent:1,maxTokens:16}));
 assert.equal((await request('/v1/models',undefined,'invalid-key')).status,401);
 assert.equal((await request('/api/central/dashboard',undefined,apps[0].key)).status,403);
 assert.equal((await request('/api/central/clients/connection',{id:apps[1].id},apps[0].key)).status,403);
 const own=await json('/api/client/status',undefined,apps[0].key);assert.equal(own.id,apps[0].id);assert.ok(!JSON.stringify(own).includes(apps[1].id));
 const profile=await json('/api/central/clients/connection',{id:apps[0].id});assert.equal(profile.base_url,base+'/v1');assert.ok(!JSON.stringify(profile).includes(apps[0].key));assert.equal((await json('/api/central/integration')).configuration.base_url,base+'/v1');
 checks.push('five independent application names, invalid-key 401, client/admin and client/client isolation, safe profiles with actual listening port');
 const originalGenerate=amuInference.generate.bind(amuInference),releases:Array<()=>void>=[];
 amuInference.generate=async()=>{await new Promise<void>(resolve=>releases.push(resolve));return {content:'bounded fixture',model:'qwen2.5:1.5b',usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}} as any;};
 try{
  const body={model:'qwen2.5:1.5b',messages:[{role:'user',content:'bounded acceptance'}],max_tokens:8};
  const first=request('/v1/chat/completions',body,apps[0].key);await wait(()=>releases.length===1);
  const second=request('/v1/chat/completions',body,apps[1].key);await wait(()=>backupStatus().maintenance.activeRequests>=2);
  assert.equal((await request('/v1/chat/completions',body,apps[2].key)).status,429);
  releases[0]();assert.equal((await first).status,200);await wait(()=>releases.length===2);releases[1]();assert.equal((await second).status,200);
 }finally{amuInference.generate=originalGenerate;}
 checks.push('deterministic bounded admission: one active, one queued, third request 429, queued work proceeds after release; no load test');
 const dashboard=await json('/api/central/dashboard');assert.equal(dashboard.status.version,JSON.parse(fs.readFileSync('package.json','utf8')).version);assert.ok(dashboard.workers.workers.length>=1);assert.equal(dashboard.status.clients.length,6);
 const html=await (await fetch(base+'/admin')).text(),script=html.match(/<script>([\s\S]*)<\/script>/)![1];new vm.Script(script);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(item=>item[1]);assert.equal(new Set(ids).size,ids.length);for(const item of script.matchAll(/el\('([^']+)'\)/g))assert.ok(ids.includes(item[1]),item[1]);assert.ok(html.includes('operatingSummary'));
 const archive=await finish(await json('/api/central/backups/create',{scope:'full',includeModels:false}));const restored=await finish(await json('/api/central/backups/restore',{id:archive.id}));assert.equal(restored.activated,false);assert.equal(restored.authenticated,true);assert.ok(restored.databases.some((db:any)=>db.path.endsWith('request-identities.sqlite')&&db.integrity==='ok'));assert.equal(fs.readFileSync(root+'/scratch/core/preserved.db','utf8'),'CURRENT RUNTIME DATA');
 checks.push('dashboard payload, unique controls, executable page script; encrypted full fixture backup, authenticated isolated restore with SQLite integrity, current state unchanged');
 const evidence={passed:true,time:new Date().toISOString(),checks,fixtureOnly:true};fs.writeFileSync(root+'/verification.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{api.closeAllConnections();await new Promise<void>(resolve=>api.close(()=>resolve()));await amuInference.close();closeIdentityJournal();stopAdmissionMonitoring();stopMonitoring();}
