import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));process.chdir(root);
const [command,id,...flags]=process.argv.slice(2);
if(!['create','verify','restore','list','export'].includes(command))throw Error('Usage: node --experimental-strip-types scripts/encrypted-backup.mjs create | list | verify <id> | restore <id> | export <id> <existing-destination>. Optional passphrase: AMU_BACKUP_PASSPHRASE environment variable.');
if(command==='export'){
 if(flags.length!==1)throw Error('Specify exactly one existing destination directory, for example an external backup medium');
 if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Invalid backup id');
 const {exportBackup}=await import('./lib/export-backup.mjs');
 console.log(JSON.stringify(await exportBackup(path.join(root,'scratch/backups/encrypted',id+'.amubak'),flags[0]),null,2));
 process.exit(0);
}
if(command==='create'){
 for(const name of ['central-server.pid','central-supervisor.pid']){const file=path.join(root,'scratch',name);if(!fs.existsSync(file))continue;let alive=false;try{process.kill(Number(fs.readFileSync(file,'utf8').trim()),0);alive=true;}catch(e){if(e.code!=='ESRCH')throw Error('Cannot verify stopped process');}if(alive)throw Error('Stop AMU API and supervisor for CLI export, or use the dashboard maintenance backup');}
 const occupied=await new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port:Number(process.env.PORT)||3030});socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));socket.setTimeout(1000,()=>{socket.destroy();resolve(true);});});if(occupied)throw Error('API port is occupied; offline export refused');
}
const {startBackup,startRestore,backupStatus}=await import('../src/backup/manager.ts');
if(command==='list'){console.log(JSON.stringify(backupStatus(),null,2));}
else{
 const passphrase=process.env.AMU_BACKUP_PASSPHRASE;const job=command==='create'?startBackup({passphrase,scope:[id,...flags].includes('--configuration')?'configuration':'full',includeModels:![id,...flags].includes('--without-models')}):startRestore({id,passphrase},command==='verify');
 for(;;){const current=backupStatus().jobs.find(j=>j.id===job.id);if(current.state==='completed'){console.log(JSON.stringify(current.result,null,2));break;}if(current.state==='failed')throw Error(current.error);await new Promise(r=>setTimeout(r,100));}
}
