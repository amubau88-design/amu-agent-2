import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const state=fs.mkdtempSync('scratch/session2-core-test-');
process.env.AMU_CENTRAL_STATE_DIR=state+'/access';process.env.AMU_CORE_STATE_DIR=state+'/core';process.env.AMU_SUPERVISOR_STATE_DIR=state;
const {createAmuApiServer}=await import('../amu-api/server.ts');
const {amuInference}=await import('../inference/engine.ts');
const {contentHash}=await import('../core/tools.ts');
const {recoverInterruptedTasks}=await import('../core/controller.ts');
const originalGenerate=amuInference.generate.bind(amuInference);
const calls:any[]=[];
let hold=false;
amuInference.generate=async(input:any)=>{
 calls.push(input);const user=JSON.parse(input.messages.at(-1).content);
 if(hold)return new Promise((resolve,reject)=>input.signal.addEventListener('abort',()=>reject(input.signal.reason),{once:true}));
 const action=user.goal.includes('repair')?'propose_file':user.completed.length?'finish':'read_file';
 return{content:JSON.stringify({action,file:user.sources[0].file,content:'export const repaired = 2;\n',explanation:action==='finish'?'Analysis complete':'Read or propose source'}),usage:{prompt_tokens:1,completion_tokens:1},finishReason:'stop',ttftMs:0,durationMs:1};
};
const server=createAmuApiServer();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${(server.address() as any).port}`;
const admin=fs.readFileSync(state+'/access/central-admin-key.txt','utf8').trim();
async function call(endpoint:string,body?:any,key=admin){return fetch(base+endpoint,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
async function client(role:string){const response=await call('/api/central/clients',{name:'test-'+role+'-'+crypto.randomUUID(),role});assert.equal(response.status,200);return await response.json() as any;}
async function until(check:()=>Promise<boolean>){for(let i=0;i<100;i++){if(await check())return;await new Promise(r=>setTimeout(r,10));}throw Error('Test state deadline');}
const id=crypto.randomUUID(),workspace='scratch/core/workspaces/'+id,file=workspace+'/source.ts',critical='src/core/session2-review-'+id+'.ts';
fs.mkdirSync(workspace,{recursive:true});fs.writeFileSync(file,'export const source = 1;\n');fs.writeFileSync(critical,'export const source = 1;\n');
try{
 const publicHealth=await(await call('/health')).json() as any;assert.equal(publicHealth.engine.requests,undefined);assert.equal(publicHealth.engine.nativeProcess,undefined);
 const developer=await client('developer'),other=await client('developer'),operator=await client('operator'),inference=await client('inference');
 assert.equal((await call('/api/client/status',undefined,inference.key)).status,200);
 assert.equal((await call('/api/core/tasks',undefined,inference.key)).status,403);
 const restricted=await(await call('/api/central/clients',{name:'restricted-developer',role:'developer',models:['unavailable-model']})).json() as any;assert.equal((await call('/api/core/tasks',{goal:'analyze source',files:[file]},restricted.key)).status,403);
 assert.equal((await call('/api/central/monitoring',undefined,developer.key)).status,403);
 assert.equal((await call('/api/central/status',undefined,operator.key)).status,200);
 assert.equal((await call('/api/central/clients',{name:'unauthorized'},operator.key)).status,403);
 assert.equal((await call('/api/central/clients/update',{id:inference.id,role:'admin',models:[],rpm:60,maxTokens:512,maxConcurrent:1})).status,400);
 let r=await call('/api/core/tasks',{goal:'analyze source',files:[file],background:true},developer.key);assert.equal(r.status,202);const task=await r.json() as any;
 await until(async()=>((await(await call('/api/core/tasks/'+task.id,undefined,developer.key)).json()) as any).state==='completed');
 const completed=await(await call('/api/core/tasks/'+task.id,undefined,developer.key)).json() as any;assert.ok(completed.checkpoints.length>=3);assert.equal(completed.steps.length,2);
 assert.equal((await call('/api/core/tasks/'+task.id,undefined,other.key)).status,404);
 assert.equal((await call('/api/core/tasks/'+task.id)).status,200);
 // Persist a checkpoint and simulate a dead owner. Resume must use completed actions, not replay them.
 const interrupted=crypto.randomUUID();const record={...completed,id:interrupted,state:'running',ownerPid:2147483647,steps:[completed.steps[0]],maxSteps:6,sourceHashes:{[file]:contentHash(fs.readFileSync(file,'utf8'))}};
 fs.writeFileSync(state+'/core/'+interrupted+'.task.json',JSON.stringify(record));recoverInterruptedTasks();
 assert.equal((await(await call('/api/core/tasks/'+interrupted,undefined,developer.key)).json() as any).state,'interrupted');
 fs.appendFileSync(file,'// changed\n');assert.equal((await call('/api/core/tasks/'+interrupted+'/resume',{},developer.key)).status,409);
 assert.equal((await call('/api/core/tasks/'+interrupted+'/resume',{acceptSourceChanges:true},developer.key)).status,403);
 const before=calls.length;assert.equal((await call('/api/core/tasks/'+interrupted+'/resume',{acceptSourceChanges:true})).status,202);
 await until(async()=>((await(await call('/api/core/tasks/'+interrupted)).json()) as any).state==='completed');assert.equal(calls.length-before,1);
 // A developer can propose; only an administrator can approve an exact critical replacement.
 const repair=await(await call('/api/core/tasks',{goal:'repair source',files:[critical]},developer.key)).json() as any;assert.equal(repair.state,'review');
 const proposal=await(await call('/api/core/proposals/'+repair.proposals[0])).json() as any;assert.equal(proposal.risk,'critical');
 assert.equal((await call('/api/core/proposals/'+proposal.id+'/apply',{},developer.key)).status,403);
 assert.equal((await call('/api/core/proposals/'+proposal.id+'/apply',{})).status,403);
 assert.equal((await call('/api/core/proposals/'+proposal.id+'/apply',{approveCritical:true,expectedContentHash:'wrong'})).status,403);
 assert.equal((await call('/api/core/proposals/'+proposal.id+'/apply',{approveCritical:true,expectedContentHash:proposal.contentHash})).status,200);
 assert.equal(fs.readFileSync(critical,'utf8'),proposal.content);
 // Simulate an approved source replacement followed by a crash before task/proposal bookkeeping.
 const proposalFile=state+'/core/'+proposal.id+'.proposal.json';const staged=JSON.parse(fs.readFileSync(proposalFile,'utf8'));staged.status='proposed';fs.writeFileSync(proposalFile,JSON.stringify(staged));
 const taskFile=state+'/core/'+repair.id+'.task.json';const crash=JSON.parse(fs.readFileSync(taskFile,'utf8'));crash.state='review';crash.ownerPid=2147483647;crash.steps=crash.steps.filter((step:any)=>step.action!=='apply_approved');fs.writeFileSync(taskFile,JSON.stringify(crash));
 recoverInterruptedTasks();assert.equal(JSON.parse(fs.readFileSync(proposalFile,'utf8')).status,'applied');assert.equal(JSON.parse(fs.readFileSync(taskFile,'utf8')).state,'completed');assert.equal(fs.readFileSync(critical,'utf8'),proposal.content);
 hold=true;const waiting=await(await call('/api/core/tasks',{goal:'analyze source',files:[file],background:true},developer.key)).json() as any;
 assert.equal((await call('/api/core/tasks/'+waiting.id+'/cancel',{},developer.key)).status,200);
 await until(async()=>((await(await call('/api/core/tasks/'+waiting.id,undefined,developer.key)).json()) as any).state==='cancelled');
 console.log('PASS: roles, background tasks, checkpoint persistence, dead-owner recovery, hash-safe resume, no completed-step replay, cross-client isolation, admin review of developer proposals, exact critical approval, approved-write crash reconciliation without replay, cancellation');
}finally{amuInference.generate=originalGenerate;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));fs.unlinkSync(file);fs.rmdirSync(workspace);fs.unlinkSync(critical);}
