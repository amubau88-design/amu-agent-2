import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));process.chdir(root);
const kind=process.argv[2],file=path.resolve(process.argv[3]||'scratch/secrets/request-identities.sqlite');
if(!['gateway','worker'].includes(kind)||!path.relative(root,file)||path.relative(root,file).startsWith('..')||path.isAbsolute(path.relative(root,file))||fs.lstatSync(file).isSymbolicLink())throw Error('Use gateway | worker and a journal file inside this project');
if(fs.existsSync(file+'.owner')){const owner=JSON.parse(fs.readFileSync(file+'.owner','utf8'));if(owner.file===(process.platform==='win32'?file.toLowerCase():file)&&owner.host===os.hostname()){let alive=true;try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH')alive=false;else throw error;}if(alive)throw Error('Stop the owning gateway/worker and supervisor before rollback export');}}
const db=new DatabaseSync(file,{readOnly:true});
try{
 if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('SELECT value FROM metadata WHERE key=?').get('schema')?.value!=='1')throw Error('Unsupported or damaged identity journal');
 const id=crypto.randomUUID(),directory=path.join(root,'scratch/migrations',id);fs.mkdirSync(directory,{recursive:true,mode:0o700});const output=path.join(directory,kind==='gateway'?'request-identities.json':'worker-identities.json'),temporary=output+'.partial',descriptor=fs.openSync(temporary,'wx',0o600);let count=0;
 try{fs.writeSync(descriptor,'[\n');for(const row of db.prepare('SELECT * FROM identities ORDER BY createdAt,id').iterate()){const state=row.state==='accepted'?'interrupted':row.state;const entry=kind==='gateway'?{identity:row.id,requestHash:row.hash,state,time:row.createdAt}:{id:row.id,hash:row.hash,state,createdAt:row.createdAt,finishedAt:row.finishedAt};fs.writeSync(descriptor,(count?',\n':'')+JSON.stringify(entry));count++;}fs.writeSync(descriptor,'\n]\n');fs.fsyncSync(descriptor);}finally{fs.closeSync(descriptor);}fs.renameSync(temporary,output);
 console.log(JSON.stringify({id,kind,records:count,output:path.relative(root,output),activated:false,sourceModified:false,note:'Review this separate export with the matching application version while services remain stopped. Existing JSON/SQLite files were not overwritten.'}));
}finally{db.close();}
