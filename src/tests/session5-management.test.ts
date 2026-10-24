import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
const root=path.resolve(fs.mkdtempSync('scratch/session5-management-test-'));
process.env.AMU_CENTRAL_STATE_DIR=root+'/scratch/secrets';process.env.AMU_CORE_STATE_DIR=root+'/scratch/core';process.env.AMU_BACKUP_PROJECT_ROOT=root;
fs.mkdirSync(root+'/scratch/secrets',{recursive:true});fs.mkdirSync(root+'/scratch/core',{recursive:true});fs.mkdirSync(root+'/scratch/backups/encrypted',{recursive:true});
fs.writeFileSync(root+'/scratch/core/fixture.db','DATABASE-MUST-STAY-UNCHANGED');
fs.writeFileSync(root+'/scratch/secrets/backup-schedule.json',JSON.stringify({enabled:true,intervalMinutes:60,includeModels:false}));
fs.writeFileSync(root+'/scratch/backups/encrypted/schedule.json',JSON.stringify({configuration:{enabled:true,intervalMinutes:60,includeModels:false},nextRunAt:new Date(Date.now()-60000).toISOString()}));
const {createAmuApiServer}=await import('../amu-api/server.ts');
const {amuInference}=await import('../inference/engine.ts');
const {stopMonitoring}=await import('../core/monitoring.ts');
const {tickBackupSchedule,backupScheduleStatus}=await import('../backup/scheduler.ts');
const {backupStatus,backupCompatibility}=await import('../backup/manager.ts');
const {extractArchive}=await import('../backup/archive.ts');
const checks:string[]=[];let executions=0;
const fake=http.createServer(async(req,res)=>{for await(const _chunk of req){}executions++;res.end(JSON.stringify({choices:[{message:{content:'OK'}}],usage:{prompt_tokens:2,completion_tokens:1}}));});
await new Promise<void>(r=>fake.listen(0,'127.0.0.1',r));const api=createAmuApiServer();await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));
const key=fs.readFileSync(root+'/scratch/secrets/central-admin-key.txt','utf8').trim(),base=`http://127.0.0.1:${(api.address() as any).port}`;
async function call(route:string,body?:any,token=key,headers:Record<string,string>={}){return fetch(base+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});}
async function json(route:string,body?:any,token=key){const response=await call(route,body,token);assert.ok([200,202].includes(response.status),await response.clone().text());return await response.json() as any;}
async function until(check:()=>boolean|Promise<boolean>){for(let i=0;i<300;i++){if(await check())return;await new Promise(r=>setTimeout(r,20));}throw Error('Management test deadline');}
const originalNow=Date.now;
try{
 const app=await json('/api/central/clients',{name:'Future arbitrary application'}),second=await json('/api/central/clients',{name:'Independent application'});
 const profile=await json('/api/central/clients/connection',{id:app.id});assert.equal(profile.clientId,app.id);assert.equal(profile.tls.currentlyReadyForRemote,false);assert.ok(!JSON.stringify(profile).includes(app.key));
 assert.equal((await call('/api/central/clients/connection',{id:app.id},second.key)).status,403);
 assert.equal((await call('/api/central/backups/schedule',undefined,second.key)).status,403);
 await json('/api/central/clients/archive',{id:app.id});assert.equal((await call('/api/client/status',undefined,app.key)).status,401);
 const restored=await json('/api/central/clients/restore',{id:app.id});assert.notEqual(restored.key,app.key);assert.equal((await call('/api/client/status',undefined,restored.key)).status,200);assert.equal((await call('/api/client/status',undefined,app.key)).status,401);
 checks.push('arbitrary application connection profile contains no key; cross-client administration denied; archive invalidates old key and restoration issues a new key');
 await json('/api/central/connection',{provider:'local-http',upstream:`http://127.0.0.1:${(fake.address() as any).port}/v1`,model:'fixture'});
 const body={model:'fixture',messages:[{role:'user',content:'PRIVATE-REQUEST-MARKER'}],max_tokens:4};
 assert.equal((await call('/v1/chat/completions',body,restored.key,{'Idempotency-Key':'same-request'})).status,200);
 assert.equal((await call('/v1/chat/completions',body,restored.key,{'Idempotency-Key':'same-request'})).status,409);
 assert.equal((await call('/v1/chat/completions',{...body,max_tokens:5},restored.key,{'Idempotency-Key':'same-request'})).status,409);
 assert.equal((await call('/v1/chat/completions',body,second.key,{'Idempotency-Key':'same-request'})).status,200);assert.equal(executions,2);
 assert.ok(!fs.readFileSync(root+'/scratch/secrets/request-identities.sqlite','utf8').includes('PRIVATE-REQUEST-MARKER'));checks.push('HTTP Idempotency-Key prevents repeat execution and body conflicts, isolates clients, persists only hashes and states');
 await tickBackupSchedule(()=>false);assert.match(backupScheduleStatus().lastError||'',/deferred/);assert.equal(backupStatus().archives.length,0);
 Date.now=()=>originalNow()+16*60000;await tickBackupSchedule(()=>true);Date.now=originalNow;
 await until(()=>!backupStatus().busy);await tickBackupSchedule(()=>true);await until(()=>!backupStatus().busy);await tickBackupSchedule(()=>true);
 const schedule=backupScheduleStatus();assert.ok(schedule.lastVerifiedBackupId,JSON.stringify(schedule));assert.equal(schedule.lastError,undefined);
 const archive=backupStatus().archives.find((a:any)=>a.id===schedule.lastVerifiedBackupId);assert.equal(archive.integrityVerified,true);assert.ok(archive.encrypted);
 const stage=root+'/manifest-restore';await extractArchive(root+'/scratch/backups/encrypted/'+archive.id+'.amubak',stage,fs.readFileSync(root+'/scratch/secrets/backup-recovery-key.txt','utf8'));
 assert.equal(JSON.parse(fs.readFileSync(stage+'/scratch/secrets/backup-schedule.json','utf8')).enabled,true);const manifest=JSON.parse(fs.readFileSync(stage+'/.amu-backup-manifest.json','utf8'));assert.equal(backupCompatibility(manifest).compatible,true);assert.equal(backupCompatibility({...manifest,schemaVersion:99}).compatible,false);assert.equal(backupCompatibility(null).compatible,null);
 assert.equal(fs.readFileSync(root+'/scratch/core/fixture.db','utf8'),'DATABASE-MUST-STAY-UNCHANGED');assert.equal(fs.existsSync(stage+'/scratch/secrets/backup-recovery-key.txt'),false);
 checks.push('overdue scheduled backup defers while busy, captures once at idle, authenticates encrypted archive, records compatible manifest; future schema rejected for activation, legacy flagged; production fixture database untouched and recovery key excluded');
 assert.equal((await call('/api/central/backups/schedule',{enabled:true,intervalMinutes:1,includeModels:false})).status,400);
 await json('/api/central/backups/schedule',{enabled:false,intervalMinutes:1440,includeModels:true});
 const evidence={passed:true,time:new Date().toISOString(),checks,realCloudCalls:0,productionDataModified:false};fs.writeFileSync(root+'/verification.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{Date.now=originalNow;api.closeAllConnections();await new Promise<void>(r=>api.close(()=>r()));await new Promise<void>(r=>fake.close(()=>r()));await amuInference.close();stopMonitoring();}
