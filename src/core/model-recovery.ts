import {EngineError} from '../inference/models.ts';
import {contentHash} from './tools.ts';
/** One target-bound rejection is feedback, never authority or a replacement implementation. */
export function rememberRejectedEdit(agent:any) {
  if(agent.pendingEditValidation!==true||!agent.editTarget||!agent.lastOutput)return;
  try {
    const edits=JSON.parse(agent.lastOutput).edits;
    if(!Array.isArray(edits)||edits.length!==1)return;
    const e=edits[0];if(e.path!==agent.editTarget||typeof e.find!=='string'||typeof e.replace!=='string')return;
    const fingerprint=contentHash(JSON.stringify([e.path,e.find,e.replace]));
    agent.rejectedEdits=[...(agent.rejectedEdits||[]).filter((r:any)=>r.fingerprint!==fingerprint),{path:e.path,fingerprint,find:e.find.slice(0,240),replace:e.replace.slice(0,240),untrustedModelOutput:true}].slice(-4);
  }catch{}
}
export function rejectRepeatedEdit(agent:any,raw:string) {
  const edits=JSON.parse(raw).edits;
  for(const e of edits||[]){const fingerprint=contentHash(JSON.stringify([e.path,e.find,e.replace]));
    if(agent.rejectedEdits?.some((r:any)=>r.path===agent.editTarget&&r.fingerprint===fingerprint))
      throw new EngineError(422,'Previously rejected edit repeated; propose a different implementation within the existing budget');
  }
}
export function inheritModelRecovery(parent:any,child:any,targets:string[]) {
  const a=parent.agent,source=a?.lastModelFailure,path=source?.path||a?.editTarget;
  if(source&&targets.includes(path))child.lastModelFailure={classification:source.classification,message:String(source.message||'').slice(0,240),path,inheritedFromParent:true,untrustedFeedback:true};
  child.rejectedEdits=(a?.rejectedEdits||[]).filter((r:any)=>targets.includes(r.path)).slice(-4);
}
export function childContinuationAllowed(child:any,ledger:any) {
  const a=child.agent,u=a?.usage,l=a?.limits;
  return !!a&&a.phase==='work'&&!a.pendingChangeSet&&u.errors<=l.maxErrors&&u.modelCalls<l.maxModelCalls&&u.steps<l.maxTotalSteps&&u.runtimeMs<l.totalRuntimeMs&&ledger.continuations<ledger.policy.maxContinuations&&ledger.reservedModels<ledger.policy.maxModelCalls&&
    (child.state==='interrupted'&&/timeout/i.test(child.error||'')||child.state==='blocked'&&/^Agent budget exhausted;/.test(child.error||''));
}
