import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import {AMUInferenceEngine} from './slot.ts';
import type {InferenceWorker} from './contracts.ts';
import {platform} from '../central/platform.ts';
import {listLocalModels,EngineError} from './models.ts';
import {assessModel,assertMemoryBudget} from './resources.ts';
import {IdentityJournal} from '../central/journal.ts';
export type RemoteNodeConfig={nodeId:string;keyHash:string;host:string;port:number;allowedCidrs:string[];certFile:string;keyFile:string;model:string;threads:number;contextSize:number;journalFile:string;maxMemoryMiB?:number;requestTimeoutMs?:number};
/** A separate deployment role in this repository. Never started by the gateway. */
export async function startRemoteNode(config:RemoteNodeConfig,providedEngine?:InferenceWorker){
 if(!/^[a-f0-9-]{36}$/.test(config.nodeId)||!/^[a-f0-9]{64}$/.test(config.keyHash)||!net.isIP(config.host)||!Number.isInteger(config.port)||config.port<0||config.port>65535)throw Error('Invalid remote node configuration');
 if(!Number.isInteger(config.threads)||config.threads<1||config.threads>os.availableParallelism()||!Number.isInteger(config.contextSize)||config.contextSize<512||config.contextSize>32768||(config.maxMemoryMiB!==undefined&&(!Number.isInteger(config.maxMemoryMiB)||config.maxMemoryMiB<256||config.maxMemoryMiB>1048576)))throw Error('Invalid remote node resource limits');
 if(config.requestTimeoutMs!==undefined&&(!Number.isInteger(config.requestTimeoutMs)||config.requestTimeoutMs<1000||config.requestTimeoutMs>600000))throw Error('Invalid worker request deadline');
 const loopback=['127.0.0.1','::1'].includes(config.host),allowed=new net.BlockList();
 if(!loopback&&!config.allowedCidrs.length)throw Error('A LAN worker requires an explicit source CIDR allowlist');
 for(const cidr of config.allowedCidrs){const [address,bits]=cidr.split('/');if(!net.isIP(address)||!/^\d+$/.test(bits||''))throw Error('Invalid worker CIDR');allowed.addSubnet(address,Number(bits),net.isIP(address)===6?'ipv6':'ipv4');}
 const cert=fs.readFileSync(config.certFile),key=fs.readFileSync(config.keyFile),certificate=new crypto.X509Certificate(cert);
 if(!certificate.checkPrivateKey(crypto.createPrivateKey(key))||Date.parse(certificate.validTo)<=Date.now()||Date.parse(certificate.validFrom)>Date.now())throw Error('Invalid or expired worker certificate');
 fs.mkdirSync(path.dirname(config.journalFile),{recursive:true});
 const journal=new IdentityJournal(config.journalFile+'.sqlite',config.journalFile);
 const engine=providedEngine??new AMUInferenceEngine({model:config.model,threads:config.threads,contextSize:config.contextSize,managed:true});
 let current:{id:string;controller:AbortController}|undefined;let stopping=false;
 let recoveryAttempts:number[]=[],nextRecovery=0,recovering=false;
 const server=https.createServer({cert,key,minVersion:'TLSv1.2'},async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  const fail=(status:number,error:string)=>{if(res.headersSent){res.end('data: '+JSON.stringify({nodeId:config.nodeId,type:'error',error,status})+'\n\n');}else{res.statusCode=status;res.end(JSON.stringify({nodeId:config.nodeId,error}));}};
  try{
   const source=(req.socket.remoteAddress||'').replace(/^::ffff:/,'');if(!loopback&&!allowed.check(source,net.isIP(source)===6?'ipv6':'ipv4')){fail(403,'Source address denied');return;}
   const supplied=crypto.createHash('sha256').update(req.headers.authorization?.replace(/^Bearer /,'')||'').digest();
   if(!crypto.timingSafeEqual(supplied,Buffer.from(config.keyHash,'hex'))){fail(401,'Worker authentication required');return;}
   if(req.url==='/worker/v1/health'&&req.method==='GET'){res.end(JSON.stringify({nodeId:config.nodeId,protocolVersion:1,resources:{logicalCpus:os.availableParallelism(),freeMemory:os.freemem(),totalMemory:os.totalmem(),criticalFreeMiB:platform.criticalFreeMiB,maxMemoryMiB:config.maxMemoryMiB??null,requestTimeoutMs:config.requestTimeoutMs??120000},engine:engine.status(),modelSha256:listLocalModels().find(m=>m.id===config.model)?.sha256,recovery:{attempts:recoveryAttempts.length,nextRecovery},journal:{...journal.summary(),interrupted:journal.summary().states.interrupted||0}}));return;}
   let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>1048576){fail(413,'Worker body too large');return;}}
   let body:any;try{body=JSON.parse(raw);}catch{fail(400,'Invalid JSON');return;}
   if(req.url==='/worker/v1/cancel'&&req.method==='POST'){if(current&&current.id===body.jobId)current.controller.abort();res.end(JSON.stringify({nodeId:config.nodeId,ok:true}));return;}
   if(req.url!=='/worker/v1/generate'||req.method!=='POST'){fail(404,'Unknown worker endpoint');return;}
   if(typeof body.jobId!=='string'||!/^[a-f0-9-]{36}$/.test(body.jobId)||body.model!==config.model||!Array.isArray(body.messages)||!body.messages.length||body.messages.some((m:any)=>!['system','user','assistant'].includes(m?.role)||typeof m.content!=='string')||!Number.isInteger(body.maxTokens)||body.maxTokens<1||body.maxTokens>2048||(body.temperature!==undefined&&(typeof body.temperature!=='number'||!Number.isFinite(body.temperature)||body.temperature<0||body.temperature>2))||(body.maxContextTokens!==undefined&&(!Number.isInteger(body.maxContextTokens)||body.maxContextTokens<1||body.maxContextTokens>config.contextSize))){fail(400,'Invalid worker generation');return;}
   const hash=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex'),existing=journal.get(body.jobId);
   if(existing){fail(409,existing.hash===hash?'Job already recorded as '+existing.state+'; it will not execute again':'Job identity conflicts with a previous request');return;}
   if(stopping||current||!engine.status().ready){fail(503,'Worker unavailable or busy');return;}
   journal.accept(body.jobId,hash);
   const controller=new AbortController();current={id:body.jobId,controller};const timer=setTimeout(()=>controller.abort(new EngineError(504,'Remote generation deadline exceeded')),config.requestTimeoutMs??120000);
   const disconnected=()=>controller.abort();res.on('close',disconnected);
   res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-store');res.flushHeaders();
   const send=(value:object)=>{if(res.destroyed)throw Error('Remote gateway disconnected');if(!res.write('data: '+JSON.stringify({nodeId:config.nodeId,...value})+'\n\n')){controller.abort();throw Error('Remote stream consumer is too slow');}};
   try{const result=await engine.generate({...body,signal:controller.signal,onChunk:(text:string)=>send({type:'chunk',text})});journal.finish(body.jobId,'completed');send({type:'result',result});res.end();}
   catch{if(journal.get(body.jobId)?.state==='accepted')journal.finish(body.jobId,'failed');if(controller.signal.aborted)fail(controller.signal.reason?.status===504?504:499,controller.signal.reason?.status===504?'Remote generation deadline exceeded; it will not be replayed':'Remote generation cancelled; it will not be replayed');else fail(503,'Remote generation failed; it will not be replayed');}
   finally{clearTimeout(timer);res.removeListener('close',disconnected);current=undefined;}
  }catch{fail(500,'Worker operation failed; check local state before retrying');}
 });
 server.maxConnections=32;server.headersTimeout=10000;server.requestTimeout=150000;server.keepAliveTimeout=5000;
 await new Promise<void>((resolve,reject)=>{server.once('error',error=>{journal.close();reject(error);});server.listen(config.port,config.host,()=>{server.removeListener('error',reject);resolve();});});
 try{if(!providedEngine&&config.maxMemoryMiB){const assessment=await assessModel(config.model,0,config.contextSize);assertMemoryBudget(assessment.estimatedRamBytes,config.maxMemoryMiB*1048576);}await engine.start();}catch(error){server.closeAllConnections();server.close();await engine.close();journal.close();throw error;}
 const monitor=setInterval(()=>{if(stopping||recovering)return;const status=engine.status(),now=Date.now();if(config.maxMemoryMiB&&((status.nativeProcess as any)?.memory?.rss||0)>config.maxMemoryMiB*1048576){recovering=true;void engine.enforceMemoryPressure(0).finally(()=>{recovering=false;});return;}recoveryAttempts=recoveryAttempts.filter(time=>now-time<300000);if(status.state==='failed'&&!current&&recoveryAttempts.length<3&&now>=nextRecovery){recoveryAttempts.push(now);nextRecovery=now+Math.min(30000,1000*2**recoveryAttempts.length);recovering=true;void engine.start().catch(()=>{}).finally(()=>{recovering=false;});}},1000).unref();
 return {server,engine,nodeId:config.nodeId,async close(){stopping=true;clearInterval(monitor);current?.controller.abort();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await engine.close();journal.close();}};
}
