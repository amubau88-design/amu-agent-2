import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {spawn} from 'node:child_process';
const root=path.resolve(fs.mkdtempSync('scratch/session10-dashboard-test-'));
process.env.AMU_BACKUP_PROJECT_ROOT=root;process.env.AMU_CENTRAL_STATE_DIR=root+'/scratch/secrets';process.env.AMU_CORE_STATE_DIR=root+'/scratch/core';
fs.mkdirSync(root+'/scratch/secrets',{recursive:true});fs.mkdirSync(root+'/scratch/core');
const {createAmuApiServer}=await import('../amu-api/server.ts'),{amuInference}=await import('../inference/engine.ts'),{closeIdentityJournal}=await import('../central/idempotency.ts'),{stopAdmissionMonitoring}=await import('../central/service.ts'),{stopMonitoring}=await import('../core/monitoring.ts'),{backupStatus}=await import('../backup/manager.ts');
const server=createAmuApiServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,key=fs.readFileSync(root+'/scratch/secrets/central-admin-key.txt','utf8').trim();
async function call(route,body,token=key){return fetch(base+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
async function json(route,body,token=key){const response=await call(route,body,token);assert.ok([200,202].includes(response.status),await response.clone().text());return response.json();}
async function finish(job){for(let i=0;i<250;i++){const current=backupStatus().jobs.find(item=>item.id===job.id);if(current.state==='completed')return current.result;if(current.state!=='running')throw Error(current.error);await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Backup fixture deadline');}
const html=fs.readFileSync('src/web-ui/public/admin.html','utf8'),script=html.match(/<script>([\s\S]*)<\/script>/)[1],elements=new Map(),downloads=[],intervals=[],checks=[];
class Element{
 constructor(){this.value='';this.textContent='';this.hidden=false;this.checked=false;this.disabled=false;this.dataset={};this.children=[];this.handlers={};this.parentElement={};this.files=[];}
 get options(){return this.children;}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=[...items];this.textContent='';}closest(){return this.parentElement;}addEventListener(name,callback){this.handlers[name]=callback;}click(){if(this.download)downloads.push({url:this.href,name:this.download});return this.onclick?.();}
}
for(const item of html.matchAll(/\bid="([^"]+)"/g)){assert.ok(!elements.has(item[1]),'Duplicate ID '+item[1]);elements.set(item[1],new Element());}
let clipboard='',transportFailure='',confirmations=0;
const context=vm.createContext({document:{getElementById:id=>{assert.ok(elements.has(id),'Missing control '+id);return elements.get(id);},createElement:()=>new Element()},navigator:{clipboard:{writeText:async text=>{clipboard=text;}}},fetch:async(route,options)=>{if(transportFailure==='network')throw Error('injected disconnect');if(route==='/api/client/status'&&transportFailure==='maintenance')return Response.json({error:{message:'maintenance'}},{status:503});return fetch(new URL(route,base),options);},crypto:crypto.webcrypto,TextEncoder,btoa,AbortController,AbortSignal,TextDecoder,Blob,URL,Date,console,setTimeout,setInterval:callback=>{intervals.push(callback);return intervals.length;},confirm:()=>{confirmations++;return true;},prompt:()=>null});
const run=code=>vm.runInContext(code,context),el=id=>elements.get(id);
async function action(id){assert.equal(typeof el(id).onclick,'function',id);await el(id).onclick();}
async function rowAction(name,label){const row=el('clients').children.find(row=>row.children.some(child=>child.textContent?.startsWith(name+' ·')));assert.ok(row,name);const button=row.children.find(child=>child.textContent===label);assert.ok(button,label);await button.onclick();}
const work='scratch/core/workspaces/session10-dashboard-test-'+crypto.randomUUID();fs.mkdirSync(work,{recursive:true});fs.writeFileSync(work+'/sample.mjs','export const count = 1;\n');
try{
 new vm.Script(script).runInContext(context);el('key').value=key;await action('refresh');assert.equal(run('connected'),true);await action('loadCodingRuntime');assert.equal(el('codingProfiles').children.length,6);assert.match(el('codingHardware').textContent,/gpuOffloadingEnabled/);
 el('workspaceName').value='Dashboard workspace fixture';el('workspaceRoot').value=work;await action('registerWorkspace');const w=(await json('/api/core/workspaces')).find(w=>w.root===work);assert.ok(w);await json('/api/core/workspaces/'+w.id+'/configure',{tools:['list_files','read_file','search_code','prepare_patch','show_diff','apply_patch','run_test','git_status']});await action('loadWorkspaces');el('workspaceSelect').value=w.id;
 await action('workspaceList');assert.match(el('workspaceResult').textContent,/sample.mjs/);el('workspacePath').value='sample.mjs';await action('workspaceRead');assert.equal(el('workspaceContent').value,'export const count = 1;\n');el('workspaceQuery').value='count';await action('workspaceSearch');assert.match(el('workspaceResult').textContent,/matches/);await action('workspaceSyntax');assert.match(el('workspaceResult').textContent,/"passed": true/);await action('workspaceGit');assert.match(el('workspaceResult').textContent,/readOnly/);
 el('workspaceContent').value='export const count = 2;\n';await action('workspacePatch');assert.equal(fs.readFileSync(work+'/sample.mjs','utf8'),'export const count = 1;\n');assert.match(el('proposal').textContent,/--- a/);assert.ok(run('proposalId'));await action('apply');assert.equal(fs.readFileSync(work+'/sample.mjs','utf8'),'export const count = 2;\n');
 await action('workspaceRead');el('workspaceContent').value='export const count = 3;\n';await action('workspacePatch');await action('rejectProposal');assert.equal(fs.readFileSync(work+'/sample.mjs','utf8'),'export const count = 2;\n');await action('toolAudit');assert.match(el('workspaceResult').textContent,/prepare_patch/);
 console.log(JSON.stringify({passed:true,checks:['actual dashboard runtime/hardware cards','workspace registration/list/read/search/syntax/Git handlers','diff review and explicit apply with backup','reject leaves source unchanged','tool audit visible'],fixtureOnly:true}));
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await amuInference.close();closeIdentityJournal();stopAdmissionMonitoring();stopMonitoring();}
