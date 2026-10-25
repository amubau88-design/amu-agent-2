import os from 'node:os';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {codingProfiles,registerLocalModel} from './profiles.ts';
import {listLocalModels,EngineError} from './models.ts';
import {assessModel,memoryBudget} from './resources.ts';
import {hardwareInventory} from './hardware.ts';
import {platform} from '../central/platform.ts';
export async function codingRuntimeStatus(){
 const hardware=await hardwareInventory(),installed=listLocalModels();
 const profiles=await Promise.all(codingProfiles.map(async profile=>{
  const models=installed.filter(m=>(m.profileId||'local-gguf')===profile.id);
  const assessment=await Promise.all(models.map(async model=>{try{return {modelId:model.id,filename:model.filename,path:'scratch/models/'+model.filename,sha256:model.sha256,license:model.license,...await assessModel(model.id,0,Math.min(profile.defaultContext,platform.contextSize))};}catch(error){return {modelId:model.id,error:(error as Error).message,loadable:false};}}));
  const expectedRam=Math.ceil(profile.minimumWeightBytes*1.2+512*1024**2),budget=memoryBudget();
  return {...profile,largeModelAcceptance:profile.repository?'not-tested-with-large-weights':'existing-small-model',installed:assessment,available:models.length>0,loadable:models.length>0&&assessment.some(m=>m.loadable),preflight:{configuredContext:Math.min(profile.defaultContext,platform.contextSize),minimumEstimatedRamBytes:expectedRam,availableRamBudgetBytes:budget,sufficientForMinimum:expectedRam<=budget,reason:models.length===0?'Keine passenden lokalen Gewichte installiert. Kein automatischer Download.':assessment.some(m=>m.loadable)?'Innerhalb des vorsichtigen RAM-Budgets; der Modellstart bleibt eine getrennte Aktion.':'Nicht genug freier Arbeitsspeicher nach Systemreserve oder ungültige Metadaten.'}};
 }));
 return {runtime:'AMU Embedded / node-llama-cpp 3.22.2',profiles,hardware,modelDirectory:'scratch/models',automaticDownloads:false,parallelism:{threads:platform.threads,maximumContext:platform.contextSize,workerLimit:platform.maxWorkers},cpuOnly:true,nativeToolCallingAvailable:false,structuredToolProtocol:'AMU coding tools v1',freeMemoryBytes:os.freemem()};
}
export async function codingManagementRoute(req:IncomingMessage,res:ServerResponse,pathname:string,body:any,admin:boolean){
 if(!pathname.startsWith('/api/central/coding/'))return false;if(!admin)throw new EngineError(403,'Administrator permission required');
 if(pathname==='/api/central/coding/runtime'&&req.method==='GET')res.end(JSON.stringify(await codingRuntimeStatus()));
 else if(pathname==='/api/central/coding/models/register'&&req.method==='POST')res.end(JSON.stringify(await registerLocalModel(body)));
 else throw new EngineError(404,'Unknown coding runtime endpoint');return true;
}
