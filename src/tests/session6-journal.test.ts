import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {IdentityJournal} from '../central/journal.ts';
const root=path.resolve(fs.mkdtempSync('scratch/session6-journal-test-')),file=root+'/identities.sqlite',legacy=root+'/legacy.json';
const foreignFile=root+'/foreign.sqlite',foreign=new DatabaseSync(foreignFile);foreign.exec("CREATE TABLE preserved(value TEXT);INSERT INTO preserved VALUES ('keep')");foreign.close();const foreignHash=crypto.createHash('sha256').update(fs.readFileSync(foreignFile)).digest('hex');assert.throws(()=>new IdentityJournal(foreignFile),(e:any)=>e.status===409);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(foreignFile)).digest('hex'),foreignHash);
const id=crypto.randomUUID(),hash=crypto.createHash('sha256').update('private-marker').digest('hex');const records=[{id,hash,state:'accepted',createdAt:new Date().toISOString()}];fs.writeFileSync(legacy,JSON.stringify(records));
let journal=new IdentityJournal(file,legacy);
try{
 assert.equal(journal.get(id)?.state,'interrupted');assert.equal(journal.summary().records,1);assert.deepEqual(JSON.parse(fs.readFileSync(legacy,'utf8')),records);
 assert.throws(()=>journal.accept(id,hash),(e:any)=>e.status===409);assert.throws(()=>new IdentityJournal(file,legacy),(e:any)=>e.status===409);
 const second=crypto.randomUUID();journal.accept(second,hash);journal.finish(second,'completed');assert.equal(journal.get(second)?.state,'completed');journal.close();journal=new IdentityJournal(file,legacy);assert.equal(journal.summary().records,2);assert.throws(()=>journal.accept(second,hash),(e:any)=>e.status===409);
 journal.close();
 const crash=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',`import {IdentityJournal} from './src/central/journal.ts';const j=new IdentityJournal(${JSON.stringify(file)});j.accept('crash-id',${JSON.stringify(hash)});process.exit(7);`],{cwd:process.cwd(),encoding:'utf8',windowsHide:true});assert.equal(crash.status,7,crash.stderr);
 journal=new IdentityJournal(file,legacy);assert.equal(journal.get('crash-id')?.state,'interrupted');assert.throws(()=>journal.accept('crash-id',hash),(e:any)=>e.status===409);
 assert.ok(!fs.readFileSync(file).includes(Buffer.from('private-marker')));const liveExport=spawnSync(process.execPath,['scripts/export-identity-journal.mjs','worker',file],{encoding:'utf8',windowsHide:true});assert.equal(liveExport.status,1);journal.close();const beforeExport=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');const exported=spawnSync(process.execPath,['scripts/export-identity-journal.mjs','worker',file],{encoding:'utf8',windowsHide:true});assert.equal(exported.status,0,exported.stderr);const report=JSON.parse(exported.stdout);assert.equal(report.records,3);assert.equal(report.activated,false);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),beforeExport);journal=new IdentityJournal(file,legacy);
 const evidence={passed:true,time:new Date().toISOString(),checks:['foreign SQLite database refused without modification','legacy JSON preserved and imported once in a transaction','indexed duplicate rejection persists after reopen','second live owner rejected','abrupt process exit preserves accepted identity; restart marks interrupted without replay','journal stores hashes and states, not prompts','offline rollback export refuses a live owner, writes a separate compatible file and leaves source unchanged'],summary:journal.summary()};fs.writeFileSync(root+'/verification.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{journal.close();}
