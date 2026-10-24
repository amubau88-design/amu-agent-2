import fs from 'node:fs';
import {retentionPlan,applyRetention} from './retention.ts';
import path from 'node:path';
import {backupDirectory,backupStatus,startBackup,startRestore} from './manager.ts';
import {writePrivateJson} from '../central/storage.ts';
import {EngineError} from '../inference/models.ts';
type Configuration={enabled:boolean;intervalMinutes:number;includeModels:boolean};
type State={configuration:Configuration;nextRunAt:string|null;lastRunAt?:string;lastJobId?:string;verificationJobId?:string;lastError?:string;lastVerifiedBackupId?:string};
const file=path.join(backupDirectory,'schedule.json');
const configurationFile=path.resolve(process.env.AMU_CENTRAL_STATE_DIR||'scratch/secrets','backup-schedule.json');
let state:State=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{configuration:{enabled:false,intervalMinutes:1440,includeModels:true},nextRunAt:null};
let timer:NodeJS.Timeout|undefined;let ticking=false;
function save(){writePrivateJson(file,state,true);}
function next(minutes:number){return new Date(Date.now()+minutes*60000).toISOString();}
function validate(input:any):Configuration{if(!input||typeof input.enabled!=='boolean'||typeof input.includeModels!=='boolean'||!Number.isInteger(input.intervalMinutes)||input.intervalMinutes<60||input.intervalMinutes>43200)throw new EngineError(400,'Backup interval must be 60–43200 minutes with explicit enabled/includeModels settings');return {enabled:input.enabled,intervalMinutes:input.intervalMinutes,includeModels:input.includeModels};}
validate(state.configuration);
if(fs.existsSync(configurationFile))state.configuration=validate(JSON.parse(fs.readFileSync(configurationFile,'utf8')));
if(state.configuration.enabled&&!state.nextRunAt){state.nextRunAt=next(state.configuration.intervalMinutes);save();}
export function backupScheduleStatus(){return {...state,running:!!timer,policy:'idle-only; encrypted; authenticated verification after capture; no automatic database restore; one overdue capture'};}
export function configureBackupSchedule(input:unknown){if(state.lastJobId||state.verificationJobId)throw new EngineError(409,'Wait for the scheduled operation to finish');const configuration=validate(input);fs.mkdirSync(path.dirname(configurationFile),{recursive:true});writePrivateJson(configurationFile,configuration,true);state={...state,configuration,nextRunAt:configuration.enabled?next(configuration.intervalMinutes):null,lastError:undefined};save();return backupScheduleStatus();}
/** Persist intent before launch. An uncertain capture after a crash is never replayed immediately. */
export async function tickBackupSchedule(idle:()=>boolean){if(ticking)return;ticking=true;try{
 const status=backupStatus();
 if(state.verificationJobId){const job=status.jobs.find(j=>j.id===state.verificationJobId);if(job?.state==='running')return;if(job?.state==='completed'){state.lastVerifiedBackupId=String((job.result as any)?.backupId);state.lastError=undefined;const plan=retentionPlan();if(plan.configuration.enabled&&plan.configuration.automatic&&plan.candidates.length)await applyRetention(plan.confirmationHash);}else state.lastError=job?.error||'Verification interrupted; manually verify the archive';state.verificationJobId=undefined;save();}
 if(state.lastJobId){const job=status.jobs.find(j=>j.id===state.lastJobId);if(job?.state==='running')return;
  if(job?.state==='completed'){if(status.busy||!idle())return;try{state.verificationJobId=startRestore({id:(job.result as any).id},true).id;}catch{state.lastError='Scheduled archive created; automatic verification could not start';}}
  else state.lastError=job?.error||'Scheduled capture interrupted; existing databases were preserved';
  state.lastJobId=undefined;save();return;
 }
 if(!state.configuration.enabled||!state.nextRunAt||Date.parse(state.nextRunAt)>Date.now())return;
 if(status.busy||!idle()){state.lastError='Scheduled backup deferred: inference, development task or another backup is active';state.nextRunAt=next(15);save();return;}
 state.lastRunAt=new Date().toISOString();state.nextRunAt=next(state.configuration.intervalMinutes);state.lastError='Capture intent recorded; if interrupted, inspect operation history';save();
 try{state.lastJobId=startBackup({scope:'full',includeModels:state.configuration.includeModels,scheduled:true}).id;state.lastError=undefined;}catch(error){state.lastError=(error as Error).message;state.nextRunAt=next(15);}save();
 }finally{ticking=false;}}
export function startBackupScheduler(idle:()=>boolean){if(timer)return;timer=setInterval(()=>{void tickBackupSchedule(idle).catch(()=>{state.lastError='Backup scheduler failed; check storage and operation history';});},30000).unref();void tickBackupSchedule(idle).catch(()=>{});}
export function stopBackupScheduler(){if(timer)clearInterval(timer);timer=undefined;}
