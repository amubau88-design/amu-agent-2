import type {IncomingMessage,ServerResponse} from 'node:http';
import {EngineError} from '../inference/models.ts';
import {runnerReadiness} from './runner-readiness.ts';
import {configureRemoteRunner,remoteRunnerStatus,probeRemoteRunner,runnerCertificates,previewRunnerAcceptance,reviewRunnerAcceptance,runnerReviewStatus} from './remote-runner.ts';
import {prepareExecutionPlan,executePlan,executionReports,cancelExecution,reconcileExecution} from './runner-executions.ts';
import {runnerProfiles,previewRunnerProfile,prepareRunnerProfile,createRunnerSnapshot,listRunnerSnapshots,runnerValidationHistory,validateSnapshotRemotely,cleanupRunnerSnapshot,cancelRunnerValidation} from './runner-preflight.ts';
export async function runnerManagementRoute(req:IncomingMessage,res:ServerResponse,pathname:string,body:any,owner:string,admin:boolean){
 if(!pathname.startsWith('/api/core/runner/'))return false;let result:any;const administrator=()=>{if(!admin)throw new EngineError(403,'Administrator permission required');};
 if(pathname==='/api/core/runner/readiness'&&req.method==='GET'){administrator();result=runnerReadiness();}
 else if(pathname==='/api/core/runner/certificates'&&req.method==='GET'){administrator();result=runnerCertificates();}
 else if(pathname==='/api/core/runner/acceptance'&&req.method==='GET'){administrator();result=runnerReviewStatus();}
 else if(pathname==='/api/core/runner/acceptance/preview'&&req.method==='POST'){administrator();result=await previewRunnerAcceptance();}
 else if(pathname==='/api/core/runner/acceptance'&&req.method==='POST'){administrator();result=await reviewRunnerAcceptance(body,owner);}
 else if(/^\/api\/core\/runner\/snapshots\/[a-f0-9-]{36}\/plan$/.test(pathname)&&req.method==='POST')result=prepareExecutionPlan(pathname.split('/').at(-2)!,body?.profileIds,owner,admin);
 else if(/^\/api\/core\/runner\/plans\/[a-f0-9-]{36}\/execute$/.test(pathname)&&req.method==='POST'){administrator();const controller=new AbortController();res.once('close',()=>{if(!res.writableEnded)controller.abort();});result=await executePlan(pathname.split('/').at(-2)!,body,owner,admin,controller.signal);}
 else if(/^\/api\/core\/runner\/workspaces\/[a-f0-9-]{36}\/executions$/.test(pathname)&&req.method==='GET')result=executionReports(pathname.split('/').at(-2)!,owner,admin);
 else if(/^\/api\/core\/runner\/executions\/[a-f0-9-]{36}\/cancel$/.test(pathname)&&req.method==='POST')result=cancelExecution(pathname.split('/').at(-2)!,owner,admin);
 else if(/^\/api\/core\/runner\/executions\/[a-f0-9-]{36}\/reconcile$/.test(pathname)&&req.method==='POST'){administrator();result=await reconcileExecution(pathname.split('/').at(-2)!,owner,admin);}
 else if(pathname==='/api/core/runner/remote'&&req.method==='GET'){administrator();result=remoteRunnerStatus();}
 else if(pathname==='/api/core/runner/remote'&&req.method==='POST'){administrator();result=configureRemoteRunner(body);}
 else if(pathname==='/api/core/runner/remote/probe'&&req.method==='POST'){administrator();result=await probeRemoteRunner();}
 else if(pathname==='/api/core/runner/profiles/preview'&&req.method==='POST'){administrator();result=previewRunnerProfile(body,owner);}
 else if(/^\/api\/core\/runner\/workspaces\/[a-f0-9-]{36}\/(profiles|snapshots)$/.test(pathname)){
  const id=pathname.split('/').at(-2)!,kind=pathname.split('/').at(-1)!;
  if(req.method==='GET')result=kind==='profiles'?runnerProfiles(id,owner,admin):listRunnerSnapshots(id,owner,admin);
  else if(req.method==='POST'){if(kind==='profiles'){administrator();result=prepareRunnerProfile(id,body,owner);}else result=createRunnerSnapshot(id,body,owner,admin);}
  else throw new EngineError(405,'Method not allowed');
 }else if(/^\/api\/core\/runner\/snapshots\/[a-f0-9-]{36}\/(validate|history|cleanup)$/.test(pathname)){
  const id=pathname.split('/').at(-2)!,action=pathname.split('/').at(-1)!;
  if(action==='history'&&req.method==='GET')result=runnerValidationHistory(id,owner,admin);
  else if(action==='validate'&&req.method==='POST'){administrator();if(body?.approve!==true)throw new EngineError(403,'Explicit metadata transmission approval required');result=await validateSnapshotRemotely(id,body.profileId,owner,admin);}
  else if(action==='cleanup'&&req.method==='POST'){if(body?.approve!==true)throw new EngineError(403,'Explicit snapshot cleanup approval required');result=cleanupRunnerSnapshot(id,owner,admin);}
  else throw new EngineError(405,'Method not allowed');
 }else if(/^\/api\/core\/runner\/validations\/[a-f0-9-]{36}\/cancel$/.test(pathname)&&req.method==='POST')result=cancelRunnerValidation(pathname.split('/').at(-2)!,owner,admin);
 else throw new EngineError(404,'Unknown runner management endpoint');res.end(JSON.stringify(result));return true;
}
