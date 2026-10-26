import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {EngineError} from '../inference/models.ts';import {writePrivateJson} from '../central/storage.ts';
import {coreDirectory,contentHash} from './tools.ts';import {readChangeSet} from './change-sets.ts';
import {workspace,runLimited} from './workspaces.ts';import {checkSource} from './validation.ts';
const directory=path.join(coreDirectory,'candidate-checks');fs.mkdirSync(directory,{recursive:true});const active=new Set<string>();
const file=(id:string)=>{if(!/^[a-f0-9-]{36}$/.test(id))throw new EngineError(400,'Invalid package id');return path.join(directory,id+'.json');};
export function candidateCheck(id:string,owner:string,admin=false){readChangeSet(id,owner,admin);if(!fs.existsSync(file(id)))return null;const report=JSON.parse(fs.readFileSync(file(id),'utf8'));return report.status==='running'&&!active.has(id)?{...report,status:'interrupted'}:report;}
export function requireCandidateCheck(id:string,digest:string,owner:string,admin=false){const report=candidateCheck(id,owner,admin);if(!report||report.digest!==digest||report.status!=='passed')throw new EngineError(409,'Aktuelle sichere Paket-Vorprüfung fehlt oder ist fehlgeschlagen');return report;}
/** Parse proposed contents in private temporary files. Never changes workspace sources or executes project code. */
export async function checkCandidate(id:string,owner:string,admin=false,signal?:AbortSignal){
 const record=readChangeSet(id,owner,admin),w=workspace(record.workspaceId,owner,admin);if(!w.tools.includes('run_test'))throw new EngineError(403,'Workspace syntax-check permission required');if(record.status!=='review')throw new EngineError(409,'Only pending packages can be prechecked');if(active.has(id))throw new EngineError(429,'Package check already running');active.add(id);
 const report:any={id:crypto.randomUUID(),changeSetId:id,owner:record.owner,workspaceId:w.id,digest:record.digest,status:'running',createdAt:new Date().toISOString(),executesSource:false,results:[]};writePrivateJson(file(id),report,true);
 try{for(const change of record.changes){signal?.throwIfAborted();if(change.after===null){report.results.push({path:change.path,status:'skipped_deleted',passed:true,executesSource:false});continue;}
   let result:any={path:change.path,sha256:change.afterHash,profile:'static-source-syntax',...checkSource(change.path,change.after),executesSource:false};
   if(/\.[cm]?js$/.test(change.path)){
    const temporary=path.join(directory,crypto.randomUUID()+path.extname(change.path)),env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|SystemRoot|WINDIR|TEMP|TMP)$/i.test(key)));fs.writeFileSync(temporary,change.after,{flag:'wx',mode:0o600});
    try{const output=await runLimited(owner,process.execPath,['--max-old-space-size=128','--check',temporary],{cwd:directory,env,windowsHide:true,timeout:10000,maxBuffer:16384,signal});result={...result,profile:'javascript-syntax',passed:true,exitCode:0,stdout:output.stdout,stderr:output.stderr};}
    catch(error){if(error instanceof EngineError||signal?.aborted)throw error;const e=error as any;result={...result,profile:'javascript-syntax',passed:false,exitCode:Number.isInteger(e.code)?e.code:null,stderr:String(e.stderr||'Syntax check failed').slice(0,16000),classification:e.killed?'timeout':'syntax'};}
    finally{if(fs.existsSync(temporary)&&contentHash(fs.readFileSync(temporary,'utf8'))===change.afterHash)fs.unlinkSync(temporary);}
   }report.results.push(result);writePrivateJson(file(id),report,true);
  }report.status=report.results.every((r:any)=>r.passed)?'passed':'failed';
 }catch(error){report.status=signal?.aborted?'cancelled':'failed';report.error=error instanceof EngineError?error.message:'Candidate syntax check stopped';}
 finally{active.delete(id);report.completedAt=new Date().toISOString();writePrivateJson(file(id),report,true);}return report;
}
