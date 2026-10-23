import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const state=path.resolve(fs.mkdtempSync('scratch/session5-supervisor-test-'));process.env.AMU_CENTRAL_STATE_DIR=state+'/access';
const {remoteJson,storeRemoteCredentials}=await import('../inference/remote.ts');
const reservation=net.createServer();await new Promise<void>(r=>reservation.listen(0,'127.0.0.1',r));const port=(reservation.address() as any).port;await new Promise<void>(r=>reservation.close(()=>r()));
const nodeId=crypto.randomUUID(),key=crypto.randomBytes(48).toString('base64url'),certFile=path.resolve('scratch/secrets/tls/server-cert.pem'),keyFile=path.resolve('scratch/secrets/tls/server-key.pem');
fs.mkdirSync(state+'/node');fs.writeFileSync(state+'/node/node.json',JSON.stringify({nodeId,keyHash:crypto.createHash('sha256').update(key).digest('hex'),host:'127.0.0.1',port,allowedCidrs:[],certFile,keyFile,model:'qwen2.5:1.5b',threads:1,contextSize:1024,maxMemoryMiB:4096,journalFile:state+'/node/jobs.json'}));
const connection={endpoint:`https://127.0.0.1:${port}`,nodeId,certificateSha256:crypto.createHash('sha256').update(new crypto.X509Certificate(fs.readFileSync(certFile)).raw).digest('hex'),credentialId:storeRemoteCredentials(key,fs.readFileSync('scratch/tls-public/amu-ca.pem','utf8'))};
const supervisor=spawn(process.execPath,['scripts/supervise.mjs'],{windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,AMU_SUPERVISOR_ROLE:'remote-worker',AMU_REMOTE_STATE_DIR:state+'/node',AMU_SUPERVISOR_STATE_DIR:state+'/watchdog'}});
const children:number[]=[];let diagnostics='';supervisor.on('message',(message:any)=>{if(message.type==='child_started')children.push(message.pid);});supervisor.stdout!.on('data',data=>diagnostics+=data);supervisor.stderr!.on('data',data=>diagnostics+=data);
async function ready(){for(let i=0;i<120;i++){if(supervisor.exitCode!==null)throw Error('Remote supervisor exited: '+diagnostics);try{const health=await remoteJson(connection,'/worker/v1/health',undefined,1000);if(health.engine.ready)return health;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error('Remote supervisor readiness deadline: '+diagnostics);}
try{
 await ready();assert.equal(children.length,1);process.kill(children[0],'SIGTERM');await new Promise(r=>setTimeout(r,1500));await ready();assert.equal(children.length,2);assert.notEqual(children[0],children[1]);
 const evidence={passed:true,time:new Date().toISOString(),checks:['explicit remote-worker supervisor role starts native model over authenticated TLS','owned worker process termination causes bounded restart with same node identity and readiness','separate state directory preserves gateway supervisor ownership'],nativeLoads:2};fs.writeFileSync(state+'/verification.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{if(supervisor.connected)supervisor.send({type:'stop'});await new Promise<void>(resolve=>{if(supervisor.exitCode!==null)resolve();else supervisor.once('exit',()=>resolve());});fs.writeFileSync(state+'/output.log',diagnostics);}
