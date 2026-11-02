import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
/** Durable authoritative checkpoints; existing JSON files remain readable recovery mirrors. */
export class TaskCheckpointJournal {
 private db:DatabaseSync;
 constructor(file:string){fs.mkdirSync(path.dirname(file),{recursive:true});if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('Linked checkpoint database refused');this.db=new DatabaseSync(path.toNamespacedPath(file));this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS checkpoints(id TEXT PRIMARY KEY, owner TEXT NOT NULL, payload TEXT NOT NULL, sha256 TEXT NOT NULL, revision INTEGER NOT NULL)');}
 put(task:any){if(!/^[a-f0-9-]{36}$/.test(task.id)||typeof task.owner!=='string'||!task.owner)throw Error('Invalid checkpoint identity');const payload=JSON.stringify(task),sha=crypto.createHash('sha256').update(payload).digest('hex');const result=this.db.prepare('INSERT INTO checkpoints VALUES(?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,payload=excluded.payload,sha256=excluded.sha256,revision=revision+1 WHERE owner=excluded.owner').run(task.id,task.owner,payload,sha);if(Number(result.changes)!==1)throw Error('Checkpoint owner cannot change');}
 get(id:string){const row=this.db.prepare('SELECT owner,payload,sha256,revision FROM checkpoints WHERE id=?').get(id);if(!row)return null;const text=String(row.payload);if(crypto.createHash('sha256').update(text).digest('hex')!==row.sha256)throw Error('Checkpoint digest mismatch');const task=JSON.parse(text);if(task.id!==id||task.owner!==row.owner)throw Error('Checkpoint identity mismatch');return task;}
 ids(){return this.db.prepare('SELECT id FROM checkpoints').all().map(r=>String(r.id));}
 status(){return {storage:'sqlite',journalMode:this.db.prepare('PRAGMA journal_mode').get()?.journal_mode,synchronous:this.db.prepare('PRAGMA synchronous').get()?.synchronous,records:this.ids().length,integrity:this.db.prepare('PRAGMA quick_check(1)').get()?.quick_check};}
 close(){this.db.close();}
}
