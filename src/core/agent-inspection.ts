import {EngineError} from '../inference/models.ts';
import {readChangeSet} from './change-sets.ts';import {developmentGit} from './development-git.ts';import {contentHash} from './tools.ts';
import type {CoreTask} from './controller.ts';
export async function inspectAgentAction(task:CoreTask,name:string,owner:string,admin=false){
 const id=task.agent?.pendingChangeSet;if(!id)throw new EngineError(409,'No current task package');const record=readChangeSet(id,owner,admin);if(record.taskId!==task.id)throw new EngineError(403,'Package task mismatch');
 if(name==='show_diff')return {changeSetId:id,digest:record.digest,status:record.status,diffs:record.changes.map(c=>({path:c.path,diff:c.diff})),executesSource:false};
 if(name==='request_approval'){if(record.status!=='review')throw new EngineError(409,'Package is not awaiting approval');return {changeSetId:id,digest:record.digest,administratorRequired:true,applied:false};}
 if(name==='prepare_commit'){
  if(record.status!=='applied'||!['completed','paused'].includes(task.state))throw new EngineError(409,'Complete safe verification before preparing a commit');
  for(const c of record.changes)if(c.afterHash!==null&&!task.agent!.tests.some(t=>t.file.endsWith('/'+c.path)&&t.sourceHash===c.afterHash&&t.changeSetId===id&&t.passed))throw new EngineError(409,'Current package lacks successful post-apply syntax verification');
  const plan=await developmentGit(task.workspaceId!,'prepare_commit',{files:record.changes.map(c=>c.path)},owner,admin);for(const file of plan.files)if(file.sha256!==record.changes.find(c=>c.path===file.path)?.afterHash)throw new EngineError(409,'Task files changed after verification; foreign edits cannot enter the task commit');const candidate={...plan,changeSetId:id,packageDigest:record.digest};return {...candidate,digest:contentHash(JSON.stringify(candidate)),administratorRequired:true};
 }
 throw new EngineError(403,'This action is not an inspection tool; administrative writes require explicit approval');
}
