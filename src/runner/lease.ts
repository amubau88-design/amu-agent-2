import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {safeDirectory} from './docker-runtime.ts';
/** Exclusive lifecycle ownership before recovery, acceptance or serving. Never steal an uncertain lock. */
export function acquireRunnerLease(root:string,purpose:'service'|'acceptance'){
 safeDirectory(root);
 if(process.platform==='linux'){const state=fs.statSync(root);if(state.uid!==process.getuid?.()||(state.mode&0o077)!==0)throw Error('Dedicated private runner state required');}
 const file=path.join(root,'lifecycle.lock'),token=crypto.randomUUID();
 let fd:number;
 try{fd=fs.openSync(file,'wx',0o600);}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw Error('Runner lifecycle is locked; stop the owning service before acceptance. After a crash, independently verify that its process and owned containers have stopped before archiving the lock. No automatic takeover.');throw error;}
 const record={schemaVersion:1,pid:process.pid,purpose,root,token,at:new Date().toISOString()};
 try{fs.writeFileSync(fd,JSON.stringify(record));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 let released=false;
 return {file,release(){if(released)return;safeDirectory(root);const stat=fs.lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>4096)throw Error('Foreign lifecycle lock retained');const current=JSON.parse(fs.readFileSync(file,'utf8'));if(current.token!==token||current.pid!==process.pid||current.root!==root)throw Error('Changed lifecycle lock retained');fs.unlinkSync(file);released=true;}};
}
