import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {clientTarget} from '../../scripts/lib/client-target.mjs';
import {exportBackup} from '../../scripts/lib/export-backup.mjs';
import {assertOffline,prepareRollback,applyRollback,undoRollback} from '../../scripts/lib/manual-rollback.mjs';
const root=path.resolve(fs.mkdtempSync('scratch/session7-operations-test-')),checks=[];
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const target=await clientTarget('https://amu.internal:3030/v1',async()=>[{address:'192.168.2.10',family:4}]);
target.lookup('amu.internal',{all:true},(_error,records)=>assert.deepEqual(records,[{address:'192.168.2.10',family:4}]));
await assert.rejects(clientTarget('https://amu.internal/v1',async()=>[{address:'192.168.2.10',family:4},{address:'8.8.8.8',family:4}]),/exclusively/);
await assert.rejects(clientTarget('http://amu.internal/v1',async()=>{throw Error('Must not resolve');}),/HTTPS/);
await assert.rejects(clientTarget('https://8.8.8.8/v1'),/exclusively/);
const certificate=fs.readFileSync('scratch/secrets/tls/server-cert.pem'),privateKey=fs.readFileSync('scratch/secrets/tls/server-key.pem'),ca=fs.readFileSync('scratch/tls-public/amu-ca.pem');
const host=new crypto.X509Certificate(certificate).subjectAltName.split(', ').find(value=>value.startsWith('DNS:')&&value!=='DNS:localhost').slice(4);
const server=https.createServer({cert:certificate,key:privateKey,minVersion:'TLSv1.2'},(_request,response)=>response.end('verified private domain'));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
async function tlsRequest(name){const pinned=await clientTarget(`https://${name}:${port}/v1`,async()=>[{address:'127.0.0.1',family:4}]);return new Promise((resolve,reject)=>{https.get(pinned.url,{lookup:pinned.lookup,ca,rejectUnauthorized:true,agent:false},response=>{let text='';response.on('data',chunk=>text+=chunk);response.on('end',()=>resolve(text));}).on('error',reject);});}
try{assert.equal(await tlsRequest(host),'verified private domain');await assert.rejects(tlsRequest('wrong.amu.internal'),{code:'ERR_TLS_CERT_ALTNAME_INVALID'});}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
checks.push('private domain resolution is pinned; mixed/public DNS and remote HTTP rejected; real local TLS validates original domain SAN and rejects wrong name');

const backupId=crypto.randomUUID(),file=path.join(root,backupId+'.amubak'),destination=path.join(root,'external-medium-fixture');fs.mkdirSync(destination);fs.writeFileSync(file,'opaque ciphertext fixture');
const metadata={id:backupId,integrityVerified:true,verifiedSha256:hash(file),encrypted:true};fs.writeFileSync(file+'.json',JSON.stringify(metadata));
const exported=await exportBackup(file,destination);assert.equal(exported.recoveryKeyIncluded,false);assert.equal(hash(path.join(exported.directory,path.basename(file))),hash(file));assert.deepEqual(fs.readdirSync(exported.directory).sort(),[backupId+'.amubak',backupId+'.amubak.json']);
const second=await exportBackup(file,destination);assert.notEqual(second.directory,exported.directory);fs.appendFileSync(file,'corrupt');await assert.rejects(exportBackup(file,destination),/corrupt/);assert.equal(hash(path.join(exported.directory,path.basename(file))),metadata.verifiedSha256);
fs.writeFileSync(file+'.json',JSON.stringify({...metadata,integrityVerified:false}));await assert.rejects(exportBackup(file,destination),/Verify/);
checks.push('ciphertext export is verified, non-overwriting, excludes recovery keys and refuses bitrot/unverified sources; separate-storage path tested only inside fixture');

const project=path.join(root,'project'),restoreId=crypto.randomUUID(),candidate=path.join(project,'scratch/restores',restoreId);fs.mkdirSync(candidate,{recursive:true});
const packageData={name:'amu-agent-2',version:'1.6.1',type:'module',dependencies:{}};
for(const [folder,version,content] of [[project,'1.6.1','current-code'],[candidate,'1.6.0','restored-code']]){
 fs.writeFileSync(path.join(folder,'package.json'),JSON.stringify({...packageData,version}));fs.writeFileSync(path.join(folder,'package-lock.json'),JSON.stringify({version,packages:{'':{version}}}));fs.writeFileSync(path.join(folder,'tsconfig.json'),'{}');
 for(const name of ['src','scripts','docs']){fs.mkdirSync(path.join(folder,name));fs.writeFileSync(path.join(folder,name,'fixture.txt'),content);}fs.writeFileSync(path.join(folder,'README.md'),content);
}
fs.writeFileSync(path.join(candidate,'.amu-backup-manifest.json'),JSON.stringify({schemaVersion:2,scope:'full',identityJournalSchema:1}));
const journals=path.join(project,'scratch/backups/encrypted');fs.mkdirSync(journals,{recursive:true});const receipt={kind:'restore',state:'completed',result:{authenticated:true,compatibility:{compatible:true},directory:path.relative(project,candidate)}};fs.writeFileSync(path.join(journals,'operations.json'),JSON.stringify([receipt]));
const secrets=path.join(project,'scratch/secrets');fs.mkdirSync(secrets);const stateFile=path.join(secrets,'runtime-state.db');fs.writeFileSync(stateFile,'CURRENT KEYS, DATABASES AND REVOCATIONS');const originalState=hash(stateFile);
fs.writeFileSync(path.join(project,'scratch/central-server.pid'),String(process.pid));await assert.rejects(assertOffline(project),/Stop/);fs.unlinkSync(path.join(project,'scratch/central-server.pid'));
const plan=prepareRollback(project,candidate);assert.throws(()=>applyRollback(project,plan.id,'wrong'),/exact/);
const planFile=path.join(project,'scratch/rollback',plan.id,'plan.json'),reviewed=fs.readFileSync(planFile,'utf8');fs.writeFileSync(planFile,reviewed.replace('"sourceRestore":','"unreviewed":true,"sourceRestore":'));assert.throws(()=>applyRollback(project,plan.id,plan.confirmationHash),/integrity/);fs.writeFileSync(planFile,reviewed);
fs.appendFileSync(path.join(project,'src/fixture.txt'),'new edit');assert.throws(()=>applyRollback(project,plan.id,plan.confirmationHash),/changed/);fs.writeFileSync(path.join(project,'src/fixture.txt'),'current-code');
assert.equal(applyRollback(project,plan.id,plan.confirmationHash).state,'applied');assert.equal(fs.readFileSync(path.join(project,'src/fixture.txt'),'utf8'),'restored-code');assert.equal(hash(stateFile),originalState);
const previousFile=path.join(project,'scratch/rollback',plan.id,'previous/src/fixture.txt');fs.appendFileSync(previousFile,'bitrot');assert.throws(()=>undoRollback(project,plan.id,plan.confirmationHash),/integrity/);fs.writeFileSync(previousFile,'current-code');
assert.equal(undoRollback(project,plan.id,plan.confirmationHash).state,'undone');assert.equal(fs.readFileSync(path.join(project,'src/fixture.txt'),'utf8'),'current-code');
const interrupted=prepareRollback(project,candidate),rename=fs.renameSync;
try{fs.renameSync=function(from,to){if(from===path.join(project,'scratch/rollback',interrupted.id,'candidate/docs'))throw Error('injected interruption');return rename(from,to);};assert.throws(()=>applyRollback(project,interrupted.id,interrupted.confirmationHash),/interrupted/);}finally{fs.renameSync=rename;}
assert.ok(fs.existsSync(path.join(project,'scratch/manual-rollback.lock')));
const guard=spawnSync(process.execPath,['--experimental-strip-types',path.resolve('src/backup/rollback-guard.ts')],{cwd:project,encoding:'utf8',windowsHide:true});assert.notEqual(guard.status,0);assert.match(guard.stderr,/incomplete/);
assert.equal(undoRollback(project,interrupted.id,interrupted.confirmationHash).state,'undone');assert.equal(hash(stateFile),originalState);assert.ok(!fs.existsSync(path.join(project,'scratch/manual-rollback.lock')));
const incompatible=JSON.parse(fs.readFileSync(path.join(candidate,'package.json'),'utf8'));incompatible.dependencies={changed:'1'};fs.writeFileSync(path.join(candidate,'package.json'),JSON.stringify(incompatible));assert.throws(()=>prepareRollback(project,candidate),/contract/);
checks.push('manual code rollback: live-process refusal, reviewed hash, stale preview refusal, apply/undo, interrupted rename recovery, startup barrier, incompatible dependency refusal; current runtime state unchanged');
const evidence={passed:true,time:new Date().toISOString(),checks,productiveRollbackPerformed:false,twoComputerTest:false};fs.writeFileSync(path.join(root,'verification.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
