import fs from 'node:fs/promises';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {EngineError} from '../inference/models.ts';
/** Validate database contents in an isolated read-only thread, after archive authentication. */
export async function verifyRestoredDatabases(root:string){
 const files:Array<{file:string;relative:string}>=[];
 async function walk(directory:string):Promise<void>{for(const entry of await fs.readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isSymbolicLink())throw new EngineError(403,'Unexpected restore symlink');if(entry.isDirectory()){await walk(file);continue;}if(!entry.isFile())continue;const handle=await fs.open(file,'r');try{const header=Buffer.alloc(16);await handle.read(header,0,16,0);if(header.equals(Buffer.from('SQLite format 3\0')))files.push({file,relative:path.relative(root,file).split(path.sep).join('/')});}finally{await handle.close();}}}
 await walk(root);if(!files.length)return [];
 const entry=new URL(import.meta.url.endsWith('.ts')?'./verify-state-worker.ts':'./verify-state-worker.js',import.meta.url);
 return new Promise<Array<{path:string;integrity:string}>>((resolve,reject)=>{
  const worker=new Worker(entry,{workerData:files,execArgv:['--experimental-strip-types'],resourceLimits:{maxOldGenerationSizeMb:128}});let settled=false;
  const finish=(error?:EngineError,value?:Array<{path:string;integrity:string}>)=>{if(settled)return;settled=true;clearTimeout(timer);void worker.terminate();if(error)reject(error);else resolve(value||[]);};
  const timer=setTimeout(()=>finish(new EngineError(504,'Database integrity check deadline exceeded; current data preserved')),60000);
  worker.once('message',value=>{if(value.ok)finish(undefined,value.databases);else finish(new EngineError(400,'Restored SQLite database failed integrity checking; current data preserved'));});worker.once('error',()=>finish(new EngineError(400,'Restored database inspection failed; current data preserved')));worker.once('exit',()=>{if(!settled)finish(new EngineError(400,'Database inspection interrupted; no restore activated'));});
 });
}
