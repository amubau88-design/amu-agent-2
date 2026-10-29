import {EngineError} from '../inference/models.ts';
import {executionReports} from './runner-executions.ts';
import type {CoreTask} from './controller.ts';
import path from 'node:path';
import {readChangeSet} from './change-sets.ts';
import {workspace,authorizeWorkspaceFile} from './workspaces.ts';
import {runnerSnapshot,snapshotContents,runnerProfile} from './runner-preflight.ts';
import {contentHash} from './tools.ts';
/** A baseline is real failed evidence for exactly this owner, source set and current profiles. */
export function validateBaselineBinding(task:CoreTask,report:any,snapshot:any,profileDigests:Record<string,string>){
 const denied=()=>{throw new EngineError(409,'Baseline evidence does not match the complete current task scope');};
 if(!report||report.owner!==task.owner||report.workspaceId!==task.workspaceId||report.status!=='failed'||report.changeSetId||report.packageDigest||snapshot.owner!==task.owner||snapshot.workspaceId!==task.workspaceId||snapshot.changeSetId||snapshot.packageDigest||report.snapshotId!==snapshot.id||report.snapshotDigest!==snapshot.digest||contentHash(JSON.stringify(snapshot.files))!==snapshot.digest)denied();
 const w=workspace(task.workspaceId!,task.owner),files=snapshot.files;if(!Array.isArray(files)||files.length!==task.files.length||new Set(files.map((f:any)=>f.path)).size!==files.length)denied();for(const f of files){const name=path.posix.join(w.root,f.path);if(!task.files.includes(name)||task.sourceHashes?.[name]!==f.sha256)denied();}
 const ids=task.agent?.verificationProfiles||[];if(!Array.isArray(report.profiles)||report.profiles.length!==ids.length||new Set(report.profiles.map((p:any)=>p.id)).size!==ids.length||report.profiles.some((p:any)=>!ids.includes(p.id)||profileDigests[p.id]!==p.digest)||!Array.isArray(report.results)||report.results.length!==ids.length||new Set(report.results.map((p:any)=>p.profileId)).size!==ids.length||report.results.some((r:any)=>!ids.includes(r.profileId)||r.profileDigest!==profileDigests[r.profileId]||!['passed','failed'].includes(r.status)||r.executed!==true||r.result?.sourceExecuted!==true||r.result?.status!==r.status||r.result?.oomKilled===true||!Number.isInteger(r.result?.code)||r.result.code<0||r.result.code>255||r.status==='passed'&&r.result.code!==0||r.status==='failed'&&r.result.code<=0))denied();
 if(!report.results.some((r:any)=>r.status==='failed'))denied();
 return {untrustedToolOutput:true,baseline:true,runId:report.id,snapshotDigest:report.snapshotDigest,candidate:[],status:'failed',results:report.results.map((r:any)=>({profileId:r.profileId,status:r.status,exitCode:r.result.code,...verificationLogSummary(r.status==='failed'?r.result.stdout:'',r.status==='failed'?r.result.stderr:'',500)})),permissionToExecute:false,permissionToApply:false};
}
export function baselineFeedback(task:CoreTask,runId:unknown){if(typeof runId!=='string'||!/^[a-f0-9-]{36}$/.test(runId))throw new EngineError(400,'Invalid baseline run identity');const report=executionReports(task.workspaceId!,task.owner).find(r=>r.id===runId);if(!report)throw new EngineError(404,'Baseline evidence not found');const snapshot=runnerSnapshot(report.snapshotId,task.owner);snapshotContents(snapshot.id,task.owner);const digests=Object.fromEntries((task.agent?.verificationProfiles||[]).map(id=>[id,runnerProfile(task.workspaceId!,id,task.owner).approvalDigest]));return validateBaselineBinding(task,report,snapshot,digests);}
/** Bounded evidence, never instructions or permission to expand the file/tool scope. */
export function verificationLogSummary(stdout:unknown,stderr:unknown,limit=1200){const out=typeof stdout==='string'?stdout:'',err=typeof stderr==='string'?stderr:'';return {stdout:out.slice(-limit),stderr:err.slice(-limit),stdoutChars:out.length,stderrChars:err.length,stdoutTruncated:out.length>limit,stderrTruncated:err.length>limit};}
export function verificationFeedback(task:CoreTask){
 const linked=task.agent?.isolatedRuns?.filter(r=>r.runId).at(-1);if(!linked||!task.workspaceId)return null;
 const report=executionReports(task.workspaceId,task.owner).find(r=>r.id===linked.runId);if(!report||report.changeSetId!==linked.changeSetId||!task.agent?.changeSets.includes(report.changeSetId))throw new EngineError(409,'Verification evidence does not belong to this task');
 const pkg=readChangeSet(report.changeSetId,task.owner);if(pkg.taskId!==task.id||pkg.digest!==report.packageDigest)throw new EngineError(409,'Verification package provenance changed');
 const w=workspace(task.workspaceId,task.owner);let remaining=4000;
 const candidate=pkg.changes.map(c=>{const file=path.posix.join(w.root,c.path);if(!task.files.includes(file))throw new EngineError(403,'Verification candidate exceeds declared task files');authorizeWorkspaceFile(task.workspaceId!,file,task.owner,'read_file');const content=c.after===null?null:c.after.slice(0,remaining);remaining-=content?.length??0;return {path:c.path,content,deleted:c.after===null,truncated:c.after!==null&&content!.length<c.after.length};});
 const tail=(value:unknown)=>typeof value==='string'?value.slice(-1200):'';
 return {untrustedToolOutput:true,runId:report.id,changeSetId:report.changeSetId,packageDigest:report.packageDigest,snapshotDigest:report.snapshotDigest,candidate,status:report.status,error:tail(report.error),results:report.results.slice(-4).map((r:any)=>({profileId:r.profileId,status:r.status,exitCode:r.result?.code??null,...verificationLogSummary(r.status==='passed'?'':r.result?.stdout,r.status==='passed'?'':r.result?.stderr)})),permissionToExecute:false,permissionToApply:false};
}
