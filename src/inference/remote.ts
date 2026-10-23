import https from 'node:https';
import tls from 'node:tls';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {EngineError,hardware} from './models.ts';
import type {InferenceWorker,WorkerStatus} from './contracts.ts';
import type {Generation,GenerationResult} from './slot.ts';

export type RemoteConnection={endpoint:string;nodeId:string;certificateSha256:string;credentialId:string;modelSha256?:string};
export const remoteSecrets=path.resolve(process.env.AMU_CENTRAL_STATE_DIR||'scratch/secrets','remote-workers');
const privateNetworks=new net.BlockList();
for(const [ip,bits] of [['127.0.0.0',8],['10.0.0.0',8],['172.16.0.0',12],['192.168.0.0',16]] as const)privateNetworks.addSubnet(ip,bits);
privateNetworks.addAddress('::1','ipv6');privateNetworks.addSubnet('fc00::',7,'ipv6');
export function validateRemote(value:RemoteConnection){
 let url:URL;try{url=new URL(value.endpoint);}catch{throw new EngineError(400,'Invalid remote endpoint');}
 const host=url.hostname.replace(/^\[|\]$/g,'');
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!net.isIP(host)||!privateNetworks.check(host,net.isIP(host)===6?'ipv6':'ipv4'))throw new EngineError(400,'Remote workers require an HTTPS private IP address, without a path');
 if(!/^[a-f0-9-]{36}$/.test(value.nodeId)||!/^[a-f0-9]{64}$/i.test(value.certificateSha256)||!/^[a-f0-9-]{36}$/.test(value.credentialId))throw new EngineError(400,'Invalid remote identity, certificate pin or credential reference');
 if(value.modelSha256!==undefined&&!/^[a-f0-9]{64}$/.test(value.modelSha256))throw new EngineError(400,'Invalid model fingerprint');
 return url;
}
export function storeRemoteCredentials(key:unknown,ca:unknown){
 if(typeof key!=='string'||key.length<32||key.length>512||/[\r\n]/.test(key)||typeof ca!=='string'||ca.length>65536)throw new EngineError(400,'Worker key and trusted CA PEM required');
 try{new crypto.X509Certificate(ca);}catch{throw new EngineError(400,'Invalid trusted worker CA');}
 fs.mkdirSync(remoteSecrets,{recursive:true});const id=crypto.randomUUID();
 fs.writeFileSync(path.join(remoteSecrets,id+'.json'),JSON.stringify({key,ca}),{flag:'wx',mode:0o600});return id;
}
export function remoteRequest(connection:RemoteConnection,route:string,body?:unknown,signal?:AbortSignal):Promise<import('node:http').IncomingMessage>{
 const url=validateRemote(connection),credentials=JSON.parse(fs.readFileSync(path.join(remoteSecrets,connection.credentialId+'.json'),'utf8'));
 return new Promise((resolve,reject)=>{
  const request=https.request(new URL(route,url),{agent:false,method:body===undefined?'GET':'POST',ca:credentials.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',signal,headers:{Authorization:'Bearer '+credentials.key,'Content-Type':'application/json'},checkServerIdentity:(host,cert)=>{
   const invalid=tls.checkServerIdentity(host,cert);if(invalid)return invalid;
   if(crypto.createHash('sha256').update(cert.raw).digest('hex')!==connection.certificateSha256.toLowerCase())return new Error('Worker certificate pin mismatch');
  }},response=>resolve(response));
  request.setTimeout(150000,()=>request.destroy(new Error('Remote worker request timeout')));request.on('error',()=>reject(new EngineError(503,'Secure remote worker connection failed; job was not replayed')));request.end(body===undefined?undefined:JSON.stringify(body));
 });
}
export async function remoteJson(connection:RemoteConnection,route:string,body?:unknown,timeout=10000){
 const response=await remoteRequest(connection,route,body,AbortSignal.timeout(timeout));let text='';for await(const chunk of response){text+=chunk;if(text.length>1048576){response.destroy();throw new EngineError(502,'Worker response too large');}}
 let value:any;try{value=JSON.parse(text);}catch{throw new EngineError(502,'Invalid worker response');}
 if(response.statusCode!==200)throw new EngineError(response.statusCode===401?502:response.statusCode||502,value.error||'Remote worker rejected request');
 if(value.nodeId!==connection.nodeId)throw new EngineError(502,'Remote worker identity mismatch');return value;
}
export class RemoteInferenceWorker implements InferenceWorker{
 private connection:RemoteConnection;private model:string;private snapshot:WorkerStatus;private active=false;private enabled=false;private closed=false;private failures=0;private lastSeen=0;private latencyMs=0;private checking=false;private uncertain=false;private maxMemoryMiB:number;private contextSize:number;
 private remoteProcess:object|null=null;private nextCheck=0;
 private timer=setInterval(()=>{if(this.enabled&&!this.closed&&!this.checking&&Date.now()>=this.nextCheck)void this.refresh().catch(()=>{});},1000).unref();
 constructor(connection:RemoteConnection,model:string,maxMemoryMiB=1048576,contextSize=512){this.connection=connection;this.model=model;this.maxMemoryMiB=maxMemoryMiB;this.contextSize=contextSize;validateRemote(connection);this.snapshot={backend:'amu-remote-tls',state:'unloaded',paused:true,switching:false,ready:false,model,active:0,queued:0,restarts:0,cancelled:0,completed:0,loadTimeMs:0,lastGeneration:null,requests:[],lastError:null,nativeProcess:null,hardware};}
 status(){return {...this.snapshot,nativeProcess:null,active:this.active?1:this.snapshot.active,ready:this.enabled&&this.snapshot.ready&&!this.uncertain&&Date.now()-this.lastSeen<15000,remote:{nodeId:this.connection.nodeId,lastSeen:this.lastSeen?new Date(this.lastSeen).toISOString():null,latencyMs:this.latencyMs,failures:this.failures,uncertain:this.uncertain,process:this.remoteProcess}};}
 async refresh(){if(this.checking)return;this.checking=true;const started=Date.now();try{
  const health=await remoteJson(this.connection,'/worker/v1/health');if(health.protocolVersion!==1)throw new EngineError(502,'Unsupported remote worker protocol');if(health.engine.model!==this.model)throw new EngineError(409,'Remote worker model differs from registered model');
  if(this.connection.modelSha256&&health.modelSha256!==this.connection.modelSha256)throw new EngineError(409,'Remote model fingerprint changed; re-register after reviewing the new weights');
  if(health.engine.hardware.contextSize<this.contextSize)throw new EngineError(409,'Registered context exceeds the remote node context');
  if((health.engine.nativeProcess?.memory?.rss||0)>this.maxMemoryMiB*1048576)throw new EngineError(507,'Remote node exceeds the approved RAM limit');
  this.remoteProcess=health.engine.nativeProcess;this.snapshot={...health.engine,nativeProcess:null};this.lastSeen=Date.now();this.latencyMs=Date.now()-started;this.failures=0;if(!health.engine.active)this.uncertain=false;
 }catch(error){this.failures++;this.snapshot={...this.snapshot,ready:false,state:'failed',lastError:(error as Error).message};throw error;}finally{this.checking=false;this.nextCheck=Date.now()+(this.failures?Math.min(30000,1000*2**Math.min(5,this.failures)):5000);}}
 async start(){this.enabled=true;await this.refresh();if(!this.snapshot.ready)throw new EngineError(503,'Start the model on the remote node before enabling this connection');}
 async pause(){if(this.active)throw new EngineError(409,'Remote request is still active');this.enabled=false;this.snapshot={...this.snapshot,ready:false,state:'paused',paused:true};}
 async selectModel(model:string){if(model!==this.model)throw new EngineError(409,'Configure model locally on the remote node');}
 async generate(input:Generation):Promise<GenerationResult>{
  if(!this.status().ready||this.active)throw new EngineError(503,'Remote worker is unavailable or busy');if((input.maxContextTokens||this.contextSize)>this.snapshot.hardware.contextSize)throw new EngineError(400,'Remote context limit exceeded');this.active=true;
  const jobId=input.executionId||crypto.randomUUID();let result:GenerationResult|undefined;let failure:string|undefined;
  const controller=new AbortController(),abort=()=>{controller.abort();void remoteJson(this.connection,'/worker/v1/cancel',{jobId}).catch(()=>{});};input.signal?.addEventListener('abort',abort,{once:true});if(input.signal?.aborted)abort();
  try{
   const response=await remoteRequest(this.connection,'/worker/v1/generate',{jobId,model:input.model,messages:input.messages,maxTokens:input.maxTokens??256,temperature:input.temperature,maxContextTokens:input.maxContextTokens??this.contextSize,responseSchema:input.responseSchema},controller.signal);
   if(response.statusCode!==200){response.resume();throw new EngineError(response.statusCode===409?409:503,'Remote job rejected; it was not replayed');}
   let buffer='';const decoder=new TextDecoder();for await(const chunk of response){buffer+=decoder.decode(chunk,{stream:true});if(buffer.length>2097152){response.destroy();throw new EngineError(502,'Remote stream exceeds frame limit');}let index:number;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);if(!line.startsWith('data: '))continue;const message=JSON.parse(line.slice(6));if(message.nodeId!==this.connection.nodeId)throw new EngineError(502,'Stream worker identity mismatch');if(message.type==='chunk')input.onChunk?.(message.text);else if(message.type==='result')result=message.result;else if(message.type==='error')failure=message.error;}}
   if(failure)throw new EngineError(503,failure);if(!result)throw new EngineError(502,'Remote stream ended before completion; job was not replayed');
   if(typeof result.content!=='string'||result.content.length>1048576||!result.usage||!Number.isSafeInteger(result.usage.prompt_tokens)||result.usage.prompt_tokens<0||!Number.isSafeInteger(result.usage.completion_tokens)||result.usage.completion_tokens<0||result.usage.completion_tokens>(input.maxTokens??256)||!['stop','length'].includes(result.finishReason)||!Number.isFinite(result.ttftMs)||result.ttftMs<0||!Number.isFinite(result.durationMs)||result.durationMs<0)throw new EngineError(502,'Remote worker returned invalid generation metadata');return result;
  }catch(error){this.uncertain=true;this.snapshot.ready=false;throw error;}finally{this.active=false;input.signal?.removeEventListener('abort',abort);await this.refresh().catch(()=>{});}
 }
 async enforceMemoryPressure(){return false;}
 async close(){this.closed=true;clearInterval(this.timer);this.enabled=false;}
}
