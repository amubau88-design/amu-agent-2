import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {backupDirectory,backupStatus,withBackupLock} from './manager.ts';
import {writePrivateJson} from '../central/storage.ts';
import {hashFile} from './archive.ts';
import {EngineError} from '../inference/models.ts';
type Policy={enabled:boolean;automatic:boolean;keepLast:number;maxAgeDays:number};
const file=path.resolve(process.env.AMU_CENTRAL_STATE_DIR||'scratch/secrets','backup-retention.json');
const defaults:Policy={enabled:false,automatic:false,keepLast:7,maxAgeDays:30};
function validate(value:any):Policy{if(!value||typeof value.enabled!=='boolean'||typeof value.automatic!=='boolean'||!Number.isInteger(value.keepLast)||value.keepLast<2||value.keepLast>10000||!Number.isInteger(value.maxAgeDays)||value.maxAgeDays<1||value.maxAgeDays>36500)throw new EngineError(400,'Keep at least two backups; age must be 1–36500 days');return {enabled:value.enabled,automatic:value.automatic,keepLast:value.keepLast,maxAgeDays:value.maxAgeDays};}
let applyingId:string|null=null;
let policy=fs.existsSync(file)?validate(JSON.parse(fs.readFileSync(file,'utf8'))):defaults;
export function configureRetention(value:unknown){if(backupStatus().busy)throw new EngineError(409,'Wait for the running backup operation');const next=validate(value);fs.mkdirSync(path.dirname(file),{recursive:true});writePrivateJson(file,next,true);policy=next;return retentionPlan();}
export function retentionPlan(){
 const archives=backupStatus().archives.filter((a:any)=>/^[a-f0-9-]{36}$/.test(a.id)&&Number.isFinite(Date.parse(a.createdAt))).sort((a:any,b:any)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
 const protectedIds=new Set(archives.filter((a:any)=>a.integrityVerified===true&&a.scope==='full'&&a.includesModels).slice(0,2).map((a:any)=>a.id));
 const scheduled=archives.filter((a:any)=>a.origin==='scheduled'),candidates:Array<{id:string;bytes:number;mtimeMs:number;metadataHash:string}>=[];
 if(policy.enabled)for(const [index,archive]of scheduled.entries()){
  if(index<policy.keepLast||protectedIds.has(archive.id)||archive.pinned||archive.integrityVerified!==true||archive.encrypted!==true||!/^[a-f0-9]{64}$/.test(archive.verifiedSha256||'')||Date.now()-Date.parse(archive.createdAt)<policy.maxAgeDays*86400000)continue;
  const target=path.join(backupDirectory,archive.id+'.amubak');try{const stat=fs.lstatSync(target),meta=fs.lstatSync(target+'.json');if(!stat.isFile()||stat.isSymbolicLink()||!meta.isFile()||meta.isSymbolicLink()||stat.size!==archive.bytes)continue;candidates.push({id:archive.id,bytes:stat.size,mtimeMs:stat.mtimeMs,metadataHash:crypto.createHash('sha256').update(fs.readFileSync(target+'.json')).digest('hex')});}catch{}
 }
 const confirmationHash=crypto.createHash('sha256').update(JSON.stringify({policy,candidates,protectedIds:[...protectedIds]})).digest('hex');
 const operations=fs.readdirSync(backupDirectory).filter(name=>/^retention-[a-f0-9-]{36}\.json$/.test(name)).map(name=>({name,time:fs.statSync(path.join(backupDirectory,name)).mtimeMs})).sort((a,b)=>b.time-a.time).slice(0,10).flatMap<Record<string,unknown>>(({name})=>{try{const report=JSON.parse(fs.readFileSync(path.join(backupDirectory,name),'utf8'));return [{id:report.id,createdAt:report.createdAt,state:report.state==='running'&&report.id!==applyingId?'interrupted':report.state,deleted:report.deleted,errors:report.errors}];}catch{return [{state:'unreadable',file:name}];}});
 return {configuration:{...policy},operations,candidates,confirmationHash,reclaimableBytes:candidates.reduce((n,c)=>n+c.bytes,0),protectedFullRestorePoints:[...protectedIds],rules:'Only verified scheduled archives; manual, pinned, unknown-origin and latest two verified full model backups are preserved'};
}
export async function applyRetention(confirmationHash:unknown){
 if(backupStatus().busy)throw new EngineError(409,'Wait for backup/restore operations before retention');const plan=retentionPlan();if(typeof confirmationHash!=='string'||confirmationHash!==plan.confirmationHash)throw new EngineError(409,'Retention preview changed; inspect the new plan');
 return withBackupLock(async()=>{
 const report={id:crypto.randomUUID(),createdAt:new Date().toISOString(),state:'running',plan,deleted:[] as string[],errors:[] as Array<{id:string;reason:string}>},journal=path.join(backupDirectory,'retention-'+report.id+'.json');applyingId=report.id;writePrivateJson(journal,report,true);
 for(const candidate of plan.candidates){const target=path.resolve(backupDirectory,candidate.id+'.amubak'),metadata=target+'.json',tombstone=target+'.deleted.json';if(path.dirname(target)!==path.resolve(backupDirectory))throw new EngineError(403,'Unsafe retention target');
  try{const current=JSON.parse(fs.readFileSync(metadata,'utf8'));if(crypto.createHash('sha256').update(fs.readFileSync(metadata)).digest('hex')!==candidate.metadataHash||await hashFile(target)!==current.verifiedSha256)throw Error('Archive changed since verification; preserved');if(fs.existsSync(tombstone))throw Error('Existing retention tombstone');fs.renameSync(metadata,tombstone);try{fs.unlinkSync(target);}catch(error){fs.renameSync(tombstone,metadata);throw error;}report.deleted.push(candidate.id);writePrivateJson(journal,report,true);}catch{report.errors.push({id:candidate.id,reason:'Archive changed, is busy or cannot be removed; preserved'});}
 }
 report.state=report.errors.length?'completed-with-errors':'completed';writePrivateJson(journal,report,true);return report;
 }).finally(()=>{applyingId=null;});
}
export function pinBackup(id:unknown,pinned:unknown){if(backupStatus().busy)throw new EngineError(409,'Backup operation running');if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id)||typeof pinned!=='boolean')throw new EngineError(400,'Backup id and pin setting required');const metadata=path.join(backupDirectory,id+'.amubak.json');if(!fs.existsSync(metadata)||fs.lstatSync(metadata).isSymbolicLink())throw new EngineError(404,'Backup metadata not found');const value=JSON.parse(fs.readFileSync(metadata,'utf8'));writePrivateJson(metadata,{...value,pinned},true);return {id,pinned};}
