import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const projectRoot=path.resolve(fileURLToPath(new URL('..',import.meta.url)));process.chdir(projectRoot);
import {startRemoteNode} from '../src/inference/remote-node.ts';
const directory=path.resolve(process.env.AMU_REMOTE_STATE_DIR||'scratch/secrets/remote-node');
const file=path.join(directory,'node.json');
if(process.argv[2]==='init'){
 fs.mkdirSync(directory,{recursive:true});if(fs.existsSync(file)||fs.existsSync(path.join(directory,'worker-key.txt')))throw Error('Existing node configuration will not be overwritten');
 const key=crypto.randomBytes(48).toString('base64url'),nodeId=crypto.randomUUID();
 const config={nodeId,keyHash:crypto.createHash('sha256').update(key).digest('hex'),host:'127.0.0.1',port:3443,allowedCidrs:[],certFile:'scratch/secrets/tls/server-cert.pem',keyFile:'scratch/secrets/tls/server-key.pem',model:'qwen2.5:1.5b',threads:2,contextSize:4096,maxMemoryMiB:4096,journalFile:path.relative(projectRoot,path.join(directory,'jobs.json'))};
 fs.writeFileSync(file,JSON.stringify(config,null,2),{flag:'wx',mode:0o600});fs.writeFileSync(path.join(directory,'worker-key.txt'),key,{flag:'wx',mode:0o600});console.log(JSON.stringify({nodeId,configuration:file,keyFile:path.join(directory,'worker-key.txt'),started:false}));
}else if(process.argv[2]==='start'){
 const config=JSON.parse(fs.readFileSync(file,'utf8'));let node;
 const heartbeat=setInterval(()=>{if(process.connected)process.send?.({type:'heartbeat',engine:node?.engine.status()||{state:'loading'}});},5000).unref();
 node=await startRemoteNode(config).catch(error=>{clearInterval(heartbeat);if(process.connected)process.send?.({type:'startup_error',code:error.code||'STARTUP_FAILED'});throw error;});console.log(JSON.stringify({nodeId:node.nodeId,listening:node.server.address(),tls:true,certificateSha256:new crypto.X509Certificate(fs.readFileSync(config.certFile)).fingerprint256.replaceAll(':','').toLowerCase()}));
 let closing=false;const stop=()=>{if(!closing){closing=true;clearInterval(heartbeat);const force=setTimeout(()=>process.exit(1),8000).unref();void node.close().then(()=>{clearTimeout(force);process.exit(0);});}};process.on('SIGINT',stop);process.on('SIGTERM',stop);if(process.connected){process.on('disconnect',stop);process.on('message',message=>{if(message?.type==='shutdown')stop();});}
}else throw Error('Use remote-worker.mjs init | start. Starting a node is explicit.');
