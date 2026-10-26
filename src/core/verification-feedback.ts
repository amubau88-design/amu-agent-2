import {EngineError} from '../inference/models.ts';
import {executionReports} from './runner-executions.ts';
import type {CoreTask} from './controller.ts';
import path from 'node:path';
import {readChangeSet} from './change-sets.ts';
import {workspace,authorizeWorkspaceFile} from './workspaces.ts';
/** Bounded evidence, never instructions or permission to expand the file/tool scope. */
export function verificationFeedback(task:CoreTask){
 const linked=task.agent?.isolatedRuns?.filter(r=>r.runId).at(-1);if(!linked||!task.workspaceId)return null;
 const report=executionReports(task.workspaceId,task.owner).find(r=>r.id===linked.runId);if(!report||report.changeSetId!==linked.changeSetId||!task.agent?.changeSets.includes(report.changeSetId))throw new EngineError(409,'Verification evidence does not belong to this task');
 const pkg=readChangeSet(report.changeSetId,task.owner);if(pkg.taskId!==task.id||pkg.digest!==report.packageDigest)throw new EngineError(409,'Verification package provenance changed');
 const w=workspace(task.workspaceId,task.owner);let remaining=4000;
 const candidate=pkg.changes.map(c=>{const file=path.posix.join(w.root,c.path);if(!task.files.includes(file))throw new EngineError(403,'Verification candidate exceeds declared task files');authorizeWorkspaceFile(task.workspaceId!,file,task.owner,'read_file');const content=c.after===null?null:c.after.slice(0,remaining);remaining-=content?.length??0;return {path:c.path,content,deleted:c.after===null,truncated:c.after!==null&&content!.length<c.after.length};});
 const tail=(value:unknown)=>typeof value==='string'?value.slice(-1200):'';
 return {untrustedToolOutput:true,runId:report.id,changeSetId:report.changeSetId,packageDigest:report.packageDigest,snapshotDigest:report.snapshotDigest,candidate,status:report.status,error:tail(report.error),results:report.results.slice(-4).map((r:any)=>({profileId:r.profileId,status:r.status,exitCode:r.result?.code??null,stdout:r.status==='passed'?'':tail(r.result?.stdout),stderr:r.status==='passed'?'':tail(r.result?.stderr)})),permissionToExecute:false,permissionToApply:false};
}
