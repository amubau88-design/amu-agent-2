// Operator-only recovery. Never called automatically by the runner or supervisor.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {loadConfig} from '../src/runner/service.ts';import {DockerRuntime} from '../src/runner/docker-runtime.ts';
export function validateRecoveryLock(record,root,alive){if(record?.schemaVersion!==1||record.root!==root||!Number.isSafeInteger(record.pid)||record.pid<1||!['service','acceptance'].includes(record.purpose)||!/^[a-f0-9-]{36}$/.test(record.token||''))throw Error('Unknown lock identity retained');if(alive(record.pid))throw Error('Lock process still exists or PID has been reused; recovery refused');}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.platform!=='linux'||process.getuid()===0||process.argv[2]!=='--approve-stopped-recovery')throw Error('Explicit non-root Linux stopped-service recovery approval required');
 const config=loadConfig(process.argv[3]),root=config.runtime.workRoot,file=path.join(root,'lifecycle.lock'),stat=fs.lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.uid!==process.getuid()||(stat.mode&0o077)||stat.size>4096)throw Error('Foreign lifecycle lock retained');
 const bytes=fs.readFileSync(file),record=JSON.parse(bytes),alive=pid=>{try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}};validateRecoveryLock(record,root,alive);
 const result=await new DockerRuntime(config.runtime).recoverOwnedContainers();validateRecoveryLock(record,root,alive);if(!fs.readFileSync(file).equals(bytes))throw Error('Lock changed during independent recovery');
 const archived=path.join(root,'lifecycle-archived-'+crypto.randomUUID()+'.json');fs.renameSync(file,archived);console.log(JSON.stringify({oldProcessAbsent:true,...result,lockArchived:true,automaticTakeover:false,jobOutcome:'unknown-until-authenticated-reconciliation'}));
}
