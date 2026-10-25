import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {EngineError} from '../inference/models.ts';
import {writePrivateJson} from '../central/storage.ts';
import {coreDirectory,readControlled} from './tools.ts';
import {workspace,scopedPath,executeCodingTool} from './workspaces.ts';
import {assertIsolatedRunner} from './runner-policy.ts';
const directory=path.join(coreDirectory,'test-reports');fs.mkdirSync(directory,{recursive:true});
const active=new Map<string,{owner:string;controller:AbortController}>();
export const runnerCapabilities=()=>({isolationAvailable:false,projectExecutionEnabled:false,reason:'Kein abgenommener isolierter Runner installiert. Projektcode, npm-Skripte, Builds und Unit-/Integrationstests bleiben gesperrt.',profiles:[{id:'javascript-syntax',executesSource:false,timeoutMs:10000,maxOutputBytes:16384,v8HeapLimitMiB:128},{id:'unit',enabled:false},{id:'integration',enabled:false},{id:'build',enabled:false}],limits:{global:2,perOwner:1},requiredAdapter:{network:'none',credentials:'none',source:'disposable snapshot',privileges:'unprivileged',limits:['memory','cpu','processes','output','wall time'],cancellation:'terminate complete sandbox'}});
export function listTestReports(workspaceId:string,owner:string,admin=false){workspace(workspaceId,owner,admin);return fs.readdirSync(directory).filter(f=>/^[a-f0-9-]{36}\.json$/.test(f)).map(f=>JSON.parse(fs.readFileSync(path.join(directory,f),'utf8'))).filter(r=>r.workspaceId===workspaceId&&(admin||r.owner===owner)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100).map(r=>r.status==='running'&&!active.has(r.id)?{...r,status:'interrupted',error:'Runner process ended; no automatic retry'}:r);}
export function cancelTest(id:string,owner:string,admin=false){const run=active.get(id);if(!run||(!admin&&run.owner!==owner))throw new EngineError(404,'Active test not found');run.controller.abort();return {id,status:'cancelling'};}
export async function runDevelopmentTest(workspaceId:string,body:any,owner:string,admin=false,signal?:AbortSignal){
 const w=workspace(workspaceId,owner,admin);if(!w.tools.includes('run_test'))throw new EngineError(403,'Workspace test permission required');
 if(active.size>=2||[...active.values()].some(r=>r.owner===owner))throw new EngineError(429,'Test capacity reached');
 const id=crypto.randomUUID(),controller=new AbortController(),report:any={id,workspaceId,owner,profile:typeof body?.profile==='string'?body.profile.slice(0,100):'unspecified',createdAt:new Date().toISOString(),status:'running',executesSource:false};
 if(body?.profile!=='javascript-syntax'){try{await assertIsolatedRunner(undefined);}catch{report.failureClassification='isolation_missing';}report.status='unavailable';report.error=runnerCapabilities().reason;writePrivateJson(path.join(directory,id+'.json'),report,true);return report;}
 const source=scopedPath(w,body.path),before=readControlled(source.relative);report.path=body.path;report.sourceHash=before.sha256;
 writePrivateJson(path.join(directory,id+'.json'),report,true);active.set(id,{owner,controller});
 try{const result=await executeCodingTool(workspaceId,{version:1,name:'run_test',arguments:{profile:'javascript-syntax',path:body.path}},owner,admin,AbortSignal.any([controller.signal,AbortSignal.timeout(12000),...(signal?[signal]:[])]));Object.assign(report,result.result);report.status=report.passed?'passed':'failed';report.exitCode=report.passed?0:1;if(readControlled(scopedPath(workspace(workspaceId,owner,admin),body.path).relative).sha256!==before.sha256){report.status='conflict';report.passed=false;report.error='Source changed while syntax check was running; recheck the reviewed version';}}
 catch(error){report.status=controller.signal.aborted||signal?.aborted?'cancelled':error instanceof EngineError&&error.status===504?'timed_out':'failed';report.exitCode=null;report.error=error instanceof EngineError?error.message:'Syntax check failed';}
 finally{active.delete(id);report.completedAt=new Date().toISOString();writePrivateJson(path.join(directory,id+'.json'),report,true);}return report;
}
