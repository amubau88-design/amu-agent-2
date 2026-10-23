import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const state=path.resolve(fs.mkdtempSync('scratch/session5-failure-test-'));process.env.AMU_CENTRAL_STATE_DIR=state;
const {startRemoteNode}=await import('../inference/remote-node.ts');
const {RemoteInferenceWorker,storeRemoteCredentials,remoteRequest}=await import('../inference/remote.ts');
const {hardware}=await import('../inference/models.ts');
const certFile=path.resolve('scratch/secrets/tls/server-cert.pem'),keyFile=path.resolve('scratch/secrets/tls/server-key.pem'),ca=fs.readFileSync('scratch/tls-public/amu-ca.pem','utf8');
let executions=0,active=0,ready=false;
const engine={status:()=>({backend:'fault-fixture',state:ready?'ready':'unloaded',paused:false,switching:false,ready,model:'qwen2.5:1.5b',active,queued:0,restarts:0,cancelled:0,completed:0,loadTimeMs:0,lastGeneration:null,requests:[],lastError:null,nativeProcess:null,hardware:{...hardware,contextSize:1024}}),async start(){ready=true;},async pause(){ready=false;},async selectModel(){},async enforceMemoryPressure(){return false;},async close(){ready=false;},async generate(input:any):Promise<any>{executions++;active=1;try{return await new Promise((_resolve,reject)=>{const timer=setTimeout(()=>input.onChunk?.('partial'),20);input.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('Injected disconnect'));},{once:true});});}finally{active=0;}}};
const key=crypto.randomBytes(48).toString('base64url'),nodeId=crypto.randomUUID(),config={nodeId,keyHash:crypto.createHash('sha256').update(key).digest('hex'),host:'127.0.0.1',port:0,allowedCidrs:[],certFile,keyFile,model:'qwen2.5:1.5b',threads:1,contextSize:1024,journalFile:state+'/jobs.json'};
let node=await startRemoteNode(config,engine);const port=(node.server.address() as any).port;
const connection={endpoint:`https://127.0.0.1:${port}`,nodeId,certificateSha256:crypto.createHash('sha256').update(new crypto.X509Certificate(fs.readFileSync(certFile)).raw).digest('hex'),credentialId:storeRemoteCredentials(key,ca)};
const remote=new RemoteInferenceWorker(connection,config.model,4096,1024),checks:string[]=[];
try{
 await remote.start();await assert.rejects(remote.generate({model:config.model,messages:[{role:'user',content:'fault test'}],maxTokens:8,onChunk:()=>node.server.closeAllConnections()}));
 await new Promise(r=>setTimeout(r,50));assert.equal(executions,1);let records=JSON.parse(fs.readFileSync(config.journalFile,'utf8'));assert.equal(records.length,1);assert.equal(records[0].state,'failed');
 checks.push('disconnect during streaming aborts native fixture, returns failure, records terminal state and does not replay');
 await node.close();await assert.rejects(remote.refresh());assert.equal(remote.status().ready,false);
 node=await startRemoteNode({...config,port},engine);await remote.refresh();assert.equal(remote.status().ready,true);assert.equal(executions,1);
 const duplicate=await remoteRequest(connection,'/worker/v1/generate',{jobId:records[0].id,model:config.model,messages:[{role:'user',content:'fault test'}],maxTokens:8});assert.equal(duplicate.statusCode,409);duplicate.resume();assert.equal(executions,1);
 checks.push('node outage removes readiness; same authenticated identity reconnects after restart; persistent duplicate remains rejected across restart');
 const evidence={passed:true,time:new Date().toISOString(),checks,fixture:true,executions};fs.writeFileSync(state+'/verification.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{await remote.close();await node.close();}
