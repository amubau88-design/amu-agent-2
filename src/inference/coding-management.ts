import {smallCoderQualification} from './qualification.ts';
import os from 'node:os';
import fs from 'node:fs';
import {codingAcquisitionPlan} from './acquisition.ts';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {codingProfiles,registerLocalModel} from './profiles.ts';
import {modelDirectory,listLocalModels,EngineError} from './models.ts';
import {assessModel,memoryBudget} from './resources.ts';
import {hardwareInventory} from './hardware.ts';
import {platform} from '../central/platform.ts';
import {amuInference} from './engine.ts';import {modelRoles,saveModelRoles,activateModelRole} from './model-roles.ts';
export async function codingRuntimeStatus(){
 const hardware=await hardwareInventory(),installed=listLocalModels(),active=amuInference.status();
 const profiles=await Promise.all(codingProfiles.map(async profile=>{
  const models=installed.filter(m=>(m.profileId||'local-gguf')===profile.id);
  const assessment=await Promise.all(models.map(async model=>{try{return {modelId:model.id,filename:model.filename,path:'scratch/models/'+model.filename,sha256:model.sha256,license:model.license,...await assessModel(model.id,0,Math.min(profile.defaultContext,platform.contextSize))};}catch(error){return {modelId:model.id,error:(error as Error).message,loadable:false};}}));
  const expectedRam=Math.ceil(profile.minimumWeightBytes*1.2+512*1024**2),budget=memoryBudget();
  let acquisition=null,freeDiskBytes=0;if(profile.repository){try{const disk=fs.statfsSync(modelDirectory);freeDiskBytes=disk.bavail*disk.bsize;acquisition=codingAcquisitionPlan(profile,freeDiskBytes,budget);}catch{acquisition={resourceFit:false,reasons:['Model filesystem capacity unavailable'],estimatedRamBytes:expectedRam,willDownload:false,willLoad:false};}}
  const assessedRam=acquisition?.estimatedRamBytes??expectedRam;
  return {...profile,acquisition,qualification:profile.id==='qwen25-coder15-q4_0'&&!models.length?smallCoderQualification(profile,freeDiskBytes,budget):null,largeModelAcceptance:profile.repository?'not-tested-with-large-weights':'existing-small-model',installed:assessment,available:active.ready&&models.some(m=>m.id===active.model),loadable:models.length>0&&assessment.some(m=>m.loadable),preflight:{configuredContext:Math.min(profile.defaultContext,platform.contextSize),minimumEstimatedRamBytes:assessedRam,availableRamBudgetBytes:budget,sufficientForMinimum:assessedRam<=budget,reason:profile.planningOnly?'Nur vorgemerkt; keine GGUF-/Laufzeitfreigabe.':models.length===0?'Keine passenden lokalen Gewichte installiert. Kein automatischer Download.':assessment.some(m=>m.loadable)?'Innerhalb des vorsichtigen RAM-Budgets; der Modellstart bleibt eine getrennte Aktion.':'Nicht genug freier Arbeitsspeicher nach Systemreserve oder ungültige Metadaten.'}};
 }));
 return {runtime:'AMU Embedded / node-llama-cpp 3.22.2',roles:modelRoles(),activeModel:active.model,installedModels:installed.map(m=>({...m,available:active.ready&&active.model===m.id,acceptance:active.ready&&active.model===m.id?'running-validated':'installed-not-currently-running'})),profiles,hardware,modelDirectory:'scratch/models',automaticDownloads:false,parallelism:{threads:platform.threads,maximumContext:platform.contextSize,workerLimit:platform.maxWorkers},cpuOnly:true,nativeToolCallingAvailable:false,structuredToolProtocol:'AMU coding tools v1',freeMemoryBytes:os.freemem()};
}
export async function codingManagementRoute(req:IncomingMessage,res:ServerResponse,pathname:string,body:any,admin:boolean){
 if(!pathname.startsWith('/api/central/coding/'))return false;if(!admin)throw new EngineError(403,'Administrator permission required');
 if(pathname==='/api/central/coding/runtime'&&req.method==='GET')res.end(JSON.stringify(await codingRuntimeStatus()));
 else if(pathname==='/api/central/coding/models/register'&&req.method==='POST')res.end(JSON.stringify(await registerLocalModel(body)));
 else if(pathname==='/api/central/coding/roles'&&req.method==='POST')res.end(JSON.stringify(saveModelRoles(body)));
 else if(pathname==='/api/central/coding/roles/activate'&&req.method==='POST')res.end(JSON.stringify(await activateModelRole(body)));
 else throw new EngineError(404,'Unknown coding runtime endpoint');return true;
}
