import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import {EngineError} from '../inference/models.ts';
export type IdentityRecord={id:string;hash:string;state:'accepted'|'completed'|'failed'|'interrupted';createdAt:string;finishedAt?:string};
/** Single process ownership, indexed deduplication, FULL synchronous transactions. Legacy JSON is retained. */
export class IdentityJournal{
 private database!:DatabaseSync;private lock:string;private token=crypto.randomUUID();private closed=false;
 constructor(file:string,legacyFile?:string,convert:(entry:any)=>IdentityRecord=entry=>entry){
  if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw new EngineError(403,'Journal symlinks are refused');const canonicalFile=process.platform==='win32'?path.resolve(file).toLowerCase():path.resolve(file);fs.mkdirSync(path.dirname(file),{recursive:true});this.lock=file+'.owner';
  for(let attempt=0;;attempt++){try{fs.writeFileSync(this.lock,JSON.stringify({pid:process.pid,token:this.token,file:canonicalFile,host:os.hostname()}),{flag:'wx',mode:0o600});break;}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST'||attempt)throw error;const owner=JSON.parse(fs.readFileSync(this.lock,'utf8'));if(!Number.isInteger(owner.pid)||owner.pid<1||typeof owner.file!=='string'||typeof owner.host!=='string'||typeof owner.token!=='string')throw Error('Unknown journal owner');let alive=owner.file===canonicalFile&&owner.host===os.hostname();if(alive)try{process.kill(owner.pid,0);}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH')alive=false;else throw e;}if(alive)throw new EngineError(409,'Journal already owned by another running instance');fs.unlinkSync(this.lock);}}
  try{
   if(fs.existsSync(file)&&fs.statSync(file).size){const inspect=new DatabaseSync(file,{readOnly:true});try{const existing=inspect.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();if(existing.some(row=>!['metadata','identities'].includes(String(row.name))))throw new EngineError(409,'Existing database is not an AMU identity journal; it was not changed');if(existing.some(row=>row.name==='metadata')){const version=inspect.prepare('SELECT value FROM metadata WHERE key=?').get('schema');if(version&&version.value!=='1')throw new EngineError(409,'Unsupported journal schema; preserved without migration');}}finally{inspect.close();}}this.database=new DatabaseSync(file);fs.chmodSync(file,0o600);
   this.database.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS identities(id TEXT PRIMARY KEY,hash TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN (\'accepted\',\'completed\',\'failed\',\'interrupted\')),createdAt TEXT NOT NULL,finishedAt TEXT); CREATE INDEX IF NOT EXISTS identity_state ON identities(state);');
   const version=this.database.prepare('SELECT value FROM metadata WHERE key=?').get('schema');if(version&&version.value!=='1')throw Error('Unsupported journal schema');
   this.database.exec('BEGIN IMMEDIATE');
   try{this.database.prepare('INSERT OR IGNORE INTO metadata VALUES (?,?)').run('schema','1');
    if(!this.database.prepare('SELECT value FROM metadata WHERE key=?').get('migration-complete')){
     if(legacyFile&&fs.existsSync(legacyFile)){const entries=JSON.parse(fs.readFileSync(legacyFile,'utf8'));if(!Array.isArray(entries))throw Error('Invalid legacy identity journal');for(const raw of entries){const entry=convert(raw);this.validate(entry);const existing=this.get(entry.id);if(existing)throw Error('Duplicate legacy identity; migration stopped');this.insert(entry);}}
     this.database.prepare('INSERT INTO metadata VALUES (?,?)').run('migration-complete',new Date().toISOString());
    }
    this.database.prepare("UPDATE identities SET state='interrupted',finishedAt=? WHERE state='accepted'").run(new Date().toISOString());this.database.exec('COMMIT');
   }catch(error){this.database.exec('ROLLBACK');throw error;}
  }catch(error){this.database?.close();this.unlock();throw error;}
 }
 private validate(entry:IdentityRecord){if(!entry||typeof entry.id!=='string'||!entry.id||entry.id.length>128||!/^[a-f0-9]{64}$/.test(entry.hash)||!['accepted','completed','failed','interrupted'].includes(entry.state)||!Number.isFinite(Date.parse(entry.createdAt)))throw new EngineError(400,'Invalid identity journal record');}
 private insert(entry:IdentityRecord){this.database.prepare('INSERT INTO identities VALUES (?,?,?,?,?)').run(entry.id,entry.hash,entry.state,entry.createdAt,entry.finishedAt||null);}
 get(id:string){return this.database.prepare('SELECT * FROM identities WHERE id=?').get(id) as IdentityRecord|undefined;}
 accept(id:string,hash:string){const entry:IdentityRecord={id,hash,state:'accepted',createdAt:new Date().toISOString()};this.validate(entry);this.database.exec('BEGIN IMMEDIATE');try{const previous=this.get(id);if(previous)throw new EngineError(409,previous.hash===hash?'Request identity is already '+previous.state+'; execution will not be repeated':'Identity conflicts with a previous request');if(Number(this.database.prepare('SELECT COUNT(*) AS count FROM identities').get()!.count)>=1000000)throw new EngineError(507,'Identity journal capacity reached; no IDs were discarded');this.insert(entry);this.database.exec('COMMIT');return entry;}catch(error){this.database.exec('ROLLBACK');throw error;}}
 finish(id:string,state:'completed'|'failed'){const result=this.database.prepare("UPDATE identities SET state=?,finishedAt=? WHERE id=? AND state='accepted'").run(state,new Date().toISOString(),id);if(result.changes!==1)throw new EngineError(409,'Identity has no active execution');}
 summary(){const rows=this.database.prepare('SELECT state,COUNT(*) AS count FROM identities GROUP BY state').all();const states:Record<string,number>=Object.fromEntries(rows.map(row=>[row.state,Number(row.count)]));return {storage:'sqlite',schemaVersion:1,records:Object.values(states).reduce((n,v)=>n+v,0),capacity:1000000,states};}
 private unlock(){try{if(JSON.parse(fs.readFileSync(this.lock,'utf8')).token===this.token)fs.unlinkSync(this.lock);}catch{}}
 close(){if(this.closed)return;this.closed=true;try{this.database.close();}finally{this.unlock();}}
}
