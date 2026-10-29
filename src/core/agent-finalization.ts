/** Final facts may be recorded after the final counted check, never another model/tool action. */
export function evidenceFinalizationReady(agent:any,sources:{file:string;sha256:string|null;content:string|null}[]){return agent.evidenceReport===true&&['verify','report'].includes(agent.phase)&&sources.every(s=>s.content===null||agent.tests.some((t:any)=>t.file===s.file&&t.sourceHash===s.sha256&&t.changeSetId===agent.pendingChangeSet&&t.passed===true));}
/** Counts belong to the current package and current source hashes, never an older candidate. */
export function currentAgentTests(agent:any,sourceHashes:Record<string,string|null>){return agent.tests.filter((t:any)=>t.changeSetId===agent.pendingChangeSet&&Object.hasOwn(sourceHashes,t.file)&&sourceHashes[t.file]===t.sourceHash);}
