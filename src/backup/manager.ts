import {verifyRestoredDatabases} from './verify-state.ts';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {IncomingMessage} from 'node:http';
import {once} from 'node:events';
import {createArchive,extractArchive,inside,hashFile} from './archive.ts';
import {writePrivateJson} from '../central/storage.ts';
import {exclusiveMaintenance,maintenanceStatus} from '../central/maintenance.ts';
import {EngineError} from '../inference/models.ts';
const root=path.resolve(process.env.AMU_BACKUP_PROJECT_ROOT||'.');
export const backupDirectory=path.join(root,'scratch/backups/encrypted');
const restoreDirectory=path.join(root,'scratch/restores');
const applicationVersion=JSON.parse(fs.readFileSync(path.resolve('package.json'),'utf8')).version as string;
function versionAtLeast(required:unknown){if(required===undefined)return true;if(typeof required!=='string'||!/^\d+\.\d+\.\d+$/.test(required))return false;const current=applicationVersion.split('.').map(Number),minimum=required.split('.').map(Number);for(let i=0;i<3;i++){if(current[i]!==minimum[i])return current[i]>minimum[i];}return true;}
export function backupCompatibility(manifest:any){if(!manifest)return {compatible:null,reason:'Legacy archive without version manifest; manual review required'};const compatible=[1,2].includes(manifest.schemaVersion)&&versionAtLeast(manifest.minimumApplicationVersion)&&Number(process.versions.node.split('.')[0])>=(manifest.minimumNodeMajor||24)&&typeof manifest.applicationVersion==='string'&&manifest.applicationVersion.split('.')[0]===applicationVersion.split('.')[0];return {compatible,sourceVersion:manifest.applicationVersion,currentVersion:applicationVersion,schemaVersion:manifest.schemaVersion,reason:compatible?'Compatible archive schema; inspect restored configuration before activation':'Archive schema or application major version differs; automatic activation is forbidden'};}
fs.mkdirSync(backupDirectory,{recursive:true});fs.mkdirSync(restoreDirectory,{recursive:true});
type Job={id:string;kind:'backup'|'restore'|'verify';state:'running'|'completed'|'failed'|'interrupted';createdAt:string;finishedAt?:string;result?:unknown;error?:string};
const journal=path.join(backupDirectory,'operations.json');
let jobs:Job[]=fs.existsSync(journal)?JSON.parse(fs.readFileSync(journal,'utf8')):[];
for(const job of jobs)if(job.state==='running'){job.state='interrupted';job.error='Process ended; operation was not replayed';}
function persist(){writePrivateJson(journal,jobs.slice(-100),true);}
let busy=false;let canSnapshot=()=>true;
export async function withBackupLock<T>(run:()=>Promise<T>){if(busy)throw new EngineError(409,'Backup operation already running');busy=true;try{return await run();}finally{busy=false;}}
export function setBackupIdleCheck(check:()=>boolean){canSnapshot=check;}
function password(value?:unknown){if(value!==undefined){if(typeof value!=='string'||value.length<12||value.length>1024)throw new EngineError(400,'Use a passphrase of 12–1024 characters');return value;}
 const file=path.join(root,'scratch/secrets/backup-recovery-key.txt');fs.mkdirSync(path.dirname(file),{recursive:true});if(!fs.existsSync(file))fs.writeFileSync(file,crypto.randomBytes(48).toString('base64url'),{flag:'wx',mode:0o600});return fs.readFileSync(file,'utf8').trim();}
const validId=(id:unknown)=>{if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw new EngineError(400,'Invalid backup id');return id;};
export function backupFile(id:unknown){const file=path.join(backupDirectory,validId(id)+'.amubak');if(!fs.existsSync(file)||!fs.existsSync(file+'.json'))throw new EngineError(404,'Completed backup not found');return file;}
export function backupStatus(){const invalidMetadata:string[]=[];const archives=fs.readdirSync(backupDirectory).filter(n=>/^[a-f0-9-]{36}\.amubak\.json$/.test(n)).flatMap(n=>{try{const record=JSON.parse(fs.readFileSync(path.join(backupDirectory,n),'utf8'));if(record.id!==n.slice(0,36)){invalidMetadata.push(n);return [];}return [record];}catch{invalidMetadata.push(n);return [];}});return {busy,maintenance:maintenanceStatus(),archives,invalidMetadata,jobs:jobs.slice(-30),recoveryKeyFile:'scratch/secrets/backup-recovery-key.txt',restorePolicy:'isolated-staging-only',incompleteArchives:fs.readdirSync(backupDirectory).filter(n=>n.endsWith('.partial')),incompleteRestores:fs.readdirSync(restoreDirectory).filter(n=>n.endsWith('.partial'))};}
function launch(kind:Job['kind'],run:(id:string)=>Promise<unknown>){if(busy)throw new EngineError(409,'A backup operation is already running');busy=true;const job:Job={id:crypto.randomUUID(),kind,state:'running',createdAt:new Date().toISOString()};jobs.push(job);try{persist();}catch(error){busy=false;jobs.pop();throw error;}
 setImmediate(()=>{void run(job.id).then(result=>{job.state='completed';job.result=result;},error=>{job.state='failed';job.error=error instanceof EngineError?error.message:'Operation failed; existing data was preserved';}).finally(()=>{busy=false;job.finishedAt=new Date().toISOString();try{persist();}catch{console.error('Backup operation journal persistence failed');}});});return {...job};}
function includes(full:boolean,models:boolean){
 const result=full?['src','docs','scripts','package.json','package-lock.json','tsconfig.json','README.md','.gitignore','.gitattributes']:[];
 if(full){for(const item of fs.readdirSync(path.join(root,'scratch'),{withFileTypes:true})){if(item.isDirectory()&&/^(backups|restores|migrations|remote-worker-supervisor|backup_.*|.*-test-.*|central-test-.*|embedded-verification-.*|supervisor-verification-.*)$/.test(item.name))continue;if(item.name==='models'&&!models){result.push('scratch/models/registry.json');continue;}if(item.isFile()&&(/^(central-server\.|central-supervisor\.|supervisor[.-]|windows-)/.test(item.name)||/\.(mjs|ts|log|tmp)$/.test(item.name)))continue;result.push('scratch/'+item.name);}}
 else result.push('scratch/secrets','scratch/models/registry.json','scratch/tls-public');
 return result;
}
export function startBackup(body:any={}){if(body.scope!==undefined&&!['configuration','full'].includes(body.scope))throw new EngineError(400,'Invalid backup scope');if(body.includeModels!==undefined&&typeof body.includeModels!=='boolean')throw new EngineError(400,'Invalid model backup option');const passphrase=password(body.passphrase),full=body.scope!=='configuration',models=body.includeModels!==false&&full;
 return launch('backup',id=>exclusiveMaintenance('encrypted backup',async()=>{
  if(!canSnapshot())throw new EngineError(409,'Stop active inference and development tasks before backup');
  const file=path.join(backupDirectory,id+'.amubak');const result=await createArchive(root,file,passphrase,includes(full,models),['scratch/secrets/backup-recovery-key.txt'],{schemaVersion:2,applicationVersion,minimumApplicationVersion:'1.13.0',identityJournalSchema:1,createdAt:new Date().toISOString(),scope:full?'full':'configuration',minimumNodeMajor:24});
  const metadata={id,createdAt:new Date().toISOString(),scope:full?'full':'configuration',origin:body.scheduled===true?'scheduled':'manual',includesModels:models,encrypted:true,cipher:'AES-256-GCM',keySource:body.passphrase?'user-passphrase':'local-recovery-key',...result};writePrivateJson(file+'.json',metadata,true);return metadata;
 }));}
export function startRestore(body:any,verifyOnly=false){const file=backupFile(body?.id),passphrase=password(body?.passphrase);
 return launch(verifyOnly?'verify':'restore',async id=>{
  const temporary=path.join(restoreDirectory,id+'.partial');if(!inside(restoreDirectory,temporary))throw new EngineError(403,'Unsafe restore target');
  const extracted=await extractArchive(file,temporary,passphrase);const result={...extracted,databases:await verifyRestoredDatabases(temporary)};const metadata=JSON.parse(fs.readFileSync(file+'.json','utf8'));writePrivateJson(file+'.json',{...metadata,encrypted:true,integrityVerified:true,lastVerifiedAt:new Date().toISOString(),verifiedSha256:await hashFile(file)});
  const manifestFile=path.join(temporary,'.amu-backup-manifest.json'),compatibility=backupCompatibility(fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile,'utf8')):null);
  if(verifyOnly){await fs.promises.rm(temporary,{recursive:true});return {...result,backupId:body.id,verified:true,compatibility};}
  // Keep all current state untouched. A restored task cannot inherit a live PID on the new host.
  const core=path.join(temporary,'scratch/core');if(fs.existsSync(core))for(const name of fs.readdirSync(core).filter(n=>n.endsWith('.task.json'))){const taskFile=path.join(core,name),task=JSON.parse(fs.readFileSync(taskFile,'utf8'));delete task.ownerPid;writePrivateJson(taskFile,task);}
  const ignoreFile=path.join(temporary,'.gitignore');if(!fs.existsSync(ignoreFile))fs.writeFileSync(ignoreFile,'scratch/\nnode_modules/\n.env\n.env.*\n',{flag:'wx',mode:0o600});
  const destination=path.join(restoreDirectory,id);if(fs.existsSync(destination))throw new EngineError(409,'Restore destination exists');await fs.promises.rename(temporary,destination);
  return {...result,backupId:body.id,directory:path.relative(root,destination),activated:false,compatibility,message:'Verified recovery copy; current installation was not overwritten; incompatible archives require migration before activation'};
 });}

export async function importBackup(request:IncomingMessage){
 if(busy)throw new EngineError(409,'Another backup operation is running');busy=true;
 const id=crypto.randomUUID(),file=path.join(backupDirectory,id+'.amubak'),temporary=file+'.partial';
 const disk=await fs.promises.statfs(backupDirectory).catch(error=>{busy=false;throw error;}),limit=Math.max(0,Math.min(1024**4,disk.bavail*disk.bsize-1024**3));
 let bytes=0,prefix=Buffer.alloc(0);const hash=crypto.createHash('sha256');const out=fs.createWriteStream(temporary,{flags:'wx',mode:0o600});let failure:Error|undefined;out.on('error',error=>{failure=error;request.destroy(error);});
 try{
  for await(const chunk of request){bytes+=chunk.length;if(bytes>limit)throw new EngineError(413,'Not enough disk space for backup import');if(prefix.length<16)prefix=Buffer.concat([prefix,chunk.subarray(0,16-prefix.length)]);if(prefix.length>=16&&!prefix.subarray(0,16).equals(Buffer.from('AMU-ENCRYPTED-2\n').subarray(0,16)))throw new EngineError(400,'Only encrypted AMU backup packages can be imported');hash.update(chunk);if(!out.write(chunk))await once(out,'drain');if(failure)throw failure;}
  if(bytes<128)throw new EngineError(400,'Encrypted backup is incomplete');out.end();await once(out,'finish');await fs.promises.rename(temporary,file);
  const metadata={id,createdAt:new Date().toISOString(),scope:'imported',encrypted:null,integrityVerified:false,bytes,sha256:hash.digest('hex'),keySource:'original-passphrase-or-original-recovery-key'};writePrivateJson(file+'.json',metadata);return metadata;
 }finally{busy=false;out.destroy();}
}
