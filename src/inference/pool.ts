import type {InferenceWorker} from './contracts.ts';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {AMUInferenceEngine,type Generation,type GenerationResult} from './slot.ts';
import {hardware,EngineError,listLocalModels} from './models.ts';
import {platform,fairIndex} from '../central/platform.ts';
import {writePrivateJson} from '../central/storage.ts';
import {generationLease} from './policy.ts';
import {assessModel,memoryBudget,assertMemoryBudget} from './resources.ts';
import {recordSystemEvent} from '../core/monitoring.ts';

export type WorkerDefinition={id:string;name:string;model:string;threads:number;contextSize:number;maxMemoryMiB:number;enabled:boolean;allowDuplicateModel?:boolean};
type Slot={definition:WorkerDefinition;engine:InferenceWorker;managing:boolean;dispatches:number;failures:number[];retryAt:number;recovering:boolean;cpuPercent?:number;cpuSample?:{ticks:number;time:number};error?:string};
type Job={id:string;input:Generation;controller:AbortController;resolve:(value:GenerationResult)=>void;reject:(error:unknown)=>void;cleanup:()=>void;workerId?:string;createdAt:string;cancel:()=>void;settled:boolean};
const directory=path.resolve(process.env.AMU_CENTRAL_STATE_DIR||'scratch/secrets');
const file=path.join(directory,'workers.json');
export class AMUWorkerPool {
 private factory:(definition:WorkerDefinition)=>InferenceWorker;
 private slots=new Map<string,Slot>();private queue:Job[]=[];private running=new Map<string,Job>();
 private selected=listLocalModels()[0]?.id||'';private paused=false;private pausedReason='paused';private closing=false;private pumping=false;
 private initializing?:Promise<void>;private bootAttempted=false;private monitoring=false;private lastClient='';private turn=0;private completed=0;private cancelled=0;
 private lastGeneration:{durationMs:number;ttftMs:number;tokens:number}|null=null;
 private controls:Promise<unknown>=Promise.resolve();
 private monitor=setInterval(()=>{void this.monitorWorkers().catch(()=>recordSystemEvent('worker_pool_monitor_error'));},500).unref();
 constructor(privateFactory?:((definition:WorkerDefinition)=>InferenceWorker)){
  this.factory=privateFactory??(definition=>new AMUInferenceEngine({...definition,managed:true}));
  const definitions:WorkerDefinition[]=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[{id:'primary',name:'Lokaler Haupt-Worker',model:this.selected,threads:hardware.threads,contextSize:hardware.contextSize,maxMemoryMiB:Math.max(2048,Math.floor(os.totalmem()*platform.memoryFraction/1024**2)),enabled:true}];
  if(!Array.isArray(definitions)||!definitions.length||definitions.length>platform.maxWorkers)throw new EngineError(400,'Invalid worker registry');
  for(const d of definitions){this.validate(d);if(this.slots.has(d.id))throw new EngineError(400,'Duplicate worker id');this.slots.set(d.id,this.slot(d));}
  if(!this.slots.has('primary'))throw new EngineError(400,'Primary worker missing');this.selected=this.slots.get('primary')!.definition.model;
 }
 private slot(definition:WorkerDefinition):Slot{return {definition:{...definition},engine:this.factory(definition),managing:false,dispatches:0,failures:[],retryAt:0,recovering:false};}
 private validate(d:WorkerDefinition){if(!d||!/^[-a-zA-Z0-9]{1,64}$/.test(d.id)||typeof d.name!=='string'||!d.name.trim()||d.name.length>100||typeof d.model!=='string'||!Number.isInteger(d.threads)||d.threads<1||d.threads>os.availableParallelism()||!Number.isInteger(d.contextSize)||d.contextSize<512||d.contextSize>platform.contextSize||!Number.isInteger(d.maxMemoryMiB)||d.maxMemoryMiB<256||d.maxMemoryMiB>1048576||typeof d.enabled!=='boolean'||(d.allowDuplicateModel!==undefined&&typeof d.allowDuplicateModel!=='boolean'))throw new EngineError(400,'Invalid worker settings');}
 private save(){fs.mkdirSync(directory,{recursive:true});writePrivateJson(file,[...this.slots.values()].map(s=>s.definition));}
 private get(id:string){const slot=this.slots.get(id);if(!slot)throw new EngineError(404,'Worker not found');return slot;}
 private serialize<T>(run:()=>Promise<T>):Promise<T>{const result=this.controls.then(run,run);this.controls=result.catch(()=>{});return result;}
 workers(){return [...this.slots.values()].map(s=>({ ...s.definition,transport:'private-process-ipc',cpuPercent:s.cpuPercent||0,cpuMachinePercent:(s.cpuPercent||0)/os.availableParallelism(),status:s.engine.status(),managing:s.managing,recovery:{attempts:s.failures.length,retryAt:s.retryAt?new Date(s.retryAt).toISOString():null,exhausted:s.failures.length>=3},dispatches:s.dispatches,error:s.error||null}));}
 status(){
  const primary=this.get('primary').engine.status(),workers=this.workers(),ready=workers.some(w=>w.model===this.selected&&w.status.ready&&!w.managing);
  return {...primary,backend:'amu-embedded-llama.cpp',model:this.selected,ready:ready&&!this.paused&&!this.closing,state:this.closing?'stopped':this.paused?this.pausedReason:ready?'ready':workers.some(w=>w.status.state==='loading')?'loading':primary.state,paused:this.paused||primary.paused&&!ready,active:workers.reduce((n,w)=>n+w.status.active,0),queued:this.queue.length,completed:this.completed,cancelled:this.cancelled,lastGeneration:this.lastGeneration,restarts:workers.reduce((n,w)=>n+w.status.restarts,0),workers,requests:[...this.running.values()].map(j=>({id:j.id,clientId:j.input.clientId||'internal',state:j.controller.signal.aborted?'cancelling':'running',streaming:!!j.input.stream,workerId:j.workerId,since:j.createdAt})).concat(this.queue.map(j=>({id:j.id,clientId:j.input.clientId||'internal',state:'queued',streaming:!!j.input.stream,workerId:undefined,since:j.createdAt}))),hardware,capacity:{queue:platform.queueCapacity,threadBudget:platform.threads,registeredWorkers:workers.length,readyWorkers:workers.filter(w=>w.status.ready).length}};
 }
 async register(body:any){return this.serialize(async()=>{if(this.slots.size>=platform.maxWorkers)throw new EngineError(409,'Worker registration limit reached');const definition:WorkerDefinition={id:crypto.randomUUID(),name:body?.name,model:body?.model,threads:body?.threads??1,contextSize:body?.contextSize??platform.contextSize,maxMemoryMiB:body?.maxMemoryMiB??4096,enabled:false};this.validate(definition);if(!listLocalModels().some(m=>m.id===definition.model))throw new EngineError(404,'Model is not installed');const slot=this.slot(definition);this.slots.set(definition.id,slot);try{this.save();}catch(error){this.slots.delete(definition.id);await slot.engine.close();throw error;}return definition;});}
 async configure(id:string,body:any){return this.serialize(async()=>{const slot=this.get(id),status=slot.engine.status();if(slot.managing||status.active||status.queued||status.nativeProcess||status.state==='loading')throw new EngineError(409,'Stop this idle worker before editing its settings');const allowed=['name','model','threads','contextSize','maxMemoryMiB','allowDuplicateModel'];if(!body||Object.keys(body).some(key=>!allowed.includes(key)))throw new EngineError(400,'Unknown worker setting');const definition={...slot.definition,...body,id,enabled:false};this.validate(definition);if(!listLocalModels().some(m=>m.id===definition.model))throw new EngineError(404,'Model is not installed');const replacement=this.slot(definition);this.slots.set(id,replacement);try{this.save();}catch(e){this.slots.set(id,slot);await replacement.engine.close();throw e;}await slot.engine.close();if(id==='primary')this.selected=definition.model;return definition;});}
 private async admit(slot:Slot,model=slot.definition.model,reclaimable=0){
  const assessment=await assessModel(model,reclaimable,slot.definition.contextSize);assertMemoryBudget(assessment.estimatedRamBytes,slot.definition.maxMemoryMiB*1024**2);
  const others=[...this.slots.values()].filter(s=>s!==slot&&(s.engine.status().nativeProcess||s.engine.status().state==='loading'));
  if(others.reduce((n,s)=>n+s.definition.threads,slot.definition.threads)>platform.threads)throw new EngineError(429,'Global CPU thread budget exceeded; reduce worker threads or change the platform profile');
  if(!slot.definition.allowDuplicateModel&&others.some(s=>s.definition.model===model))throw new EngineError(409,'This model is already loaded; explicitly approve a duplicate model worker');
  let reserved=assessment.estimatedRamBytes;for(const other of others)reserved+=(await assessModel(other.definition.model,0,other.definition.contextSize)).estimatedRamBytes;
  assertMemoryBudget(reserved,os.totalmem()*platform.memoryFraction);assertMemoryBudget(assessment.estimatedRamBytes,memoryBudget(os.totalmem(),os.freemem(),reclaimable));
 }
 private async startSlot(slot:Slot){
  if(slot.engine.status().ready)return;
  slot.managing=true;try{await this.admit(slot);await slot.engine.start();slot.definition.enabled=true;slot.error=undefined;slot.retryAt=0;}catch(e){slot.error=(e as Error).message;throw e;}finally{slot.managing=false;}
 }
 async workerControl(id:string,action:string,allowDuplicateModel=false){return this.serialize(async()=>{const slot=this.get(id);if(slot.engine.status().active||slot.engine.status().queued)throw new EngineError(409,'Worker is busy; cancel its requests first');if(action==='stop'){if(this.queue.some(j=>j.input.model===slot.definition.model)&&![...this.slots.values()].some(s=>s!==slot&&s.definition.enabled&&s.definition.model===slot.definition.model))throw new EngineError(409,'Queued jobs still need this worker');await slot.engine.pause();slot.definition.enabled=false;slot.failures=[];}else if(action==='start'||action==='restart'){if(allowDuplicateModel)slot.definition.allowDuplicateModel=true;if(action==='restart')await slot.engine.pause();await this.startSlot(slot);slot.failures=[];this.paused=false;}else throw new EngineError(400,'Unknown worker action');this.save();void this.pump();return this.workers().find(w=>w.id===id);});}
 async initialize(){this.bootAttempted=true;if(this.closing)throw new EngineError(503,'Inference is closing');if(this.paused)throw new EngineError(503,'Inference is paused');if(this.initializing)return this.initializing;this.initializing=this.serialize(async()=>{for(const slot of this.slots.values())if(slot.definition.enabled&&!slot.engine.status().ready){try{await this.startSlot(slot);}catch(error){recordSystemEvent('worker_start_failed',{workerId:slot.definition.id,category:(error as Error).name});}}if(!this.status().ready)throw new EngineError(503,'No ready worker for the default model');}).finally(()=>{this.initializing=undefined;});return this.initializing;}
 generate(input:Generation):Promise<GenerationResult>{
  if(input.signal?.aborted)return Promise.reject(input.signal.reason);if(this.closing||this.paused)return Promise.reject(new EngineError(503,'Inference is paused or closing'));
  if(!Array.isArray(input.messages)||!input.messages.length||input.messages.some(m=>!['system','user','assistant'].includes(m.role)||typeof m.content!=='string')||!Number.isInteger(input.maxTokens??256)||(input.maxTokens??256)<1||(input.maxTokens??256)>2048)return Promise.reject(new EngineError(400,'Invalid generation input'));
  if(!listLocalModels().some(m=>m.id===input.model))return Promise.reject(new EngineError(404,'Local model not installed'));
  if(![...this.slots.values()].some(s=>s.definition.model===input.model&&s.definition.enabled&&(s.engine.status().ready||s.engine.status().state==='loading'||(!this.bootAttempted&&s.engine.status().state==='unloaded')||(s.engine.status().state==='failed'&&s.failures.length<3))))return Promise.reject(new EngineError(503,'No enabled worker for this model'));
  if(this.queue.length>=platform.queueCapacity)return Promise.reject(new EngineError(429,'Global inference queue full'));
  let lease:ReturnType<typeof generationLease>;try{lease=generationLease(input);}catch(e){return Promise.reject(e);}
  const promise=new Promise<GenerationResult>((resolve,reject)=>{
   const controller=new AbortController(),job:Job={id:crypto.randomUUID(),input,controller,resolve,reject,createdAt:new Date().toISOString(),cleanup:()=>{},cancel:()=>{},settled:false};
   const cancel=()=>{if(job.settled)return;this.cancelled++;controller.abort(input.signal?.reason||new EngineError(499,'Generation cancelled'));const index=this.queue.indexOf(job);if(index>=0){this.queue.splice(index,1);job.settled=true;job.cleanup();reject(controller.signal.reason);}};
   const timer=setTimeout(()=>{if(!job.settled){controller.abort(new EngineError(504,'Generation deadline exceeded'));const index=this.queue.indexOf(job);if(index>=0){this.queue.splice(index,1);job.settled=true;job.cleanup();reject(controller.signal.reason);}}},platform.requestTimeoutMs);
   job.cancel=cancel;job.cleanup=()=>{clearTimeout(timer);input.signal?.removeEventListener('abort',cancel);};input.signal?.addEventListener('abort',cancel,{once:true});this.queue.push(job);void this.pump();
  });return promise.then(result=>{lease?.settle(result);return result;},error=>{lease?.settle();throw error;});
 }
 private async pump(){if(this.pumping||this.paused||this.closing||!this.queue.length)return;this.pumping=true;
  try{
   // Only initialization of explicitly enabled definitions may load models.
   if(!this.bootAttempted&&!this.initializing){try{await this.initialize();}catch{}}
   for(;;){const available=[...this.slots.values()].filter(s=>s.definition.enabled&&!s.managing&&s.engine.status().ready&&!s.engine.status().active&&!s.engine.status().queued);const eligible=this.queue.filter(j=>available.some(s=>s.definition.model===j.input.model));if(!eligible.length)break;
    const index=fairIndex(eligible,j=>j.input.clientId||'internal',j=>j.input.priority||0,this.lastClient,this.turn++),job=eligible[index];if(this.turn%2===1)this.lastClient=job.input.clientId||'internal';this.queue.splice(this.queue.indexOf(job),1);
    const slot=available.filter(s=>s.definition.model===job.input.model).sort((a,b)=>a.dispatches-b.dispatches)[0];slot.dispatches++;job.workerId=slot.definition.id;this.running.set(job.id,job);
    void slot.engine.generate({...job.input,signal:job.controller.signal,maxContextTokens:Math.min(job.input.maxContextTokens||slot.definition.contextSize,slot.definition.contextSize)}).then(result=>{this.completed++;this.lastGeneration={durationMs:result.durationMs,ttftMs:result.ttftMs,tokens:result.usage.completion_tokens};job.resolve(result);},error=>job.reject(error)).finally(()=>{job.settled=true;job.cleanup();this.running.delete(job.id);void this.pump();});
   }
  }finally{this.pumping=false;}
 }
 cancel(id:string){const job=this.queue.find(j=>j.id===id)||this.running.get(id);if(!job)throw new EngineError(404,'Inference request not found');job.cancel();return true;}
 async selectModel(model:string){if(this.running.size||this.queue.length)throw new EngineError(409,'Inference is busy');return this.serialize(async()=>{const slot=this.get('primary');slot.managing=true;try{const reclaimable=(slot.engine.status().nativeProcess as any)?.memory?.rss||0;await this.admit(slot,model,reclaimable);await slot.engine.selectModel(model);slot.definition.model=model;slot.definition.enabled=true;this.selected=model;this.paused=false;this.save();}finally{slot.managing=false;}});}
 async pause(){if(this.running.size||this.queue.length)throw new EngineError(409,'Stop requires idle inference');this.paused=true;this.pausedReason='paused';return this.serialize(async()=>{for(const slot of this.slots.values())await slot.engine.pause();});}
 async start(){this.paused=false;return this.initialize();}
 async restart(){await this.pause();this.paused=false;return this.initialize();}
 async enforceMemoryPressure(freeBytes=os.freemem()){let stopped=false;for(const slot of this.slots.values())if(await slot.engine.enforceMemoryPressure(freeBytes))stopped=true;if(stopped){this.paused=true;this.pausedReason='paused-memory-pressure';for(const job of [...this.queue])job.cancel();}return stopped;}
 private async monitorWorkers(){if(this.closing||this.monitoring)return;this.monitoring=true;try{
  await this.enforceMemoryPressure();if(this.closing)return;
  for(const slot of this.slots.values()){
   const status=slot.engine.status(),native=status.nativeProcess as any,rss=native?.memory?.rss||0;if(!native){slot.cpuPercent=0;slot.cpuSample=undefined;}if(native?.cpuUsage&&typeof native.uptimeSeconds==='number'){const ticks=native.cpuUsage.user+native.cpuUsage.system,time=native.uptimeSeconds,previous=slot.cpuSample;if(previous&&time>previous.time&&ticks>=previous.ticks)slot.cpuPercent=Math.max(0,(ticks-previous.ticks)/1e6/(time-previous.time)*100);slot.cpuSample={ticks,time};}
   if(rss>slot.definition.maxMemoryMiB*1024**2){await slot.engine.enforceMemoryPressure(0);slot.error='Per-worker RAM limit exceeded; restart explicitly';continue;}
   if(status.state==='failed'&&slot.definition.enabled&&!slot.managing&&!slot.recovering&&!this.paused){const now=Date.now();slot.failures=slot.failures.filter(t=>now-t<300000);if(slot.failures.length>=3||slot.retryAt>now)continue;slot.recovering=true;slot.failures.push(now);slot.retryAt=now+Math.min(30000,1000*2**slot.failures.length);
    void this.serialize(()=>this.startSlot(slot)).catch(()=>{}).finally(()=>{slot.recovering=false;void this.pump();});
   }
  }void this.pump();}finally{this.monitoring=false;}
 }
 async close(){this.closing=true;clearInterval(this.monitor);for(const job of [...this.queue,...this.running.values()])job.cancel();await this.controls;await Promise.all([...this.slots.values()].map(s=>s.engine.close()));}
}
