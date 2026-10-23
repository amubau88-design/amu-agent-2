import {writePrivateJson} from './storage.ts';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type PlatformConfig = { gatewayConcurrency:number; queueCapacity:number; requestTimeoutMs:number; threads:number; contextSize:number; memoryFraction:number; reserveMiB:number; criticalFreeMiB:number;maxWorkers:number;maxClients:number;maxHttpRequests:number };
export const platformDefaults: PlatformConfig = { gatewayConcurrency:2, queueCapacity:16, requestTimeoutMs:120000, threads:Math.max(1,Math.min(4,Math.floor(os.availableParallelism()/2))), contextSize:4096, memoryFraction:0.65, reserveMiB:2048, criticalFreeMiB:512,maxWorkers:16,maxClients:1000,maxHttpRequests:64 };
const directory=path.resolve(process.env.AMU_CENTRAL_STATE_DIR||'scratch/secrets');
const file=path.join(directory,'platform.json');
const bounds:Record<keyof PlatformConfig,[number,number]>={gatewayConcurrency:[1,16],queueCapacity:[1,128],requestTimeoutMs:[1000,600000],threads:[1,os.availableParallelism()],contextSize:[512,32768],memoryFraction:[0.1,0.85],reserveMiB:[512,1048576],criticalFreeMiB:[128,65536],maxWorkers:[1,64],maxClients:[1,100000],maxHttpRequests:[4,1024]};
export function validatePlatform(value:unknown):PlatformConfig {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Platform configuration must be an object');
 const result={...platformDefaults};
 for(const [key,v] of Object.entries(value)){if(!(key in bounds))throw new Error('Unknown platform setting: '+key);const [min,max]=bounds[key as keyof PlatformConfig];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||(key!=='memoryFraction'&&!Number.isInteger(v)))throw new Error('Invalid platform setting: '+key);result[key as keyof PlatformConfig]=v;}
 if(result.criticalFreeMiB>=result.reserveMiB)throw new Error('Critical RAM threshold must be below the system reserve');
 return result;
}
export const platform:PlatformConfig=fs.existsSync(file)?validatePlatform(JSON.parse(fs.readFileSync(file,'utf8'))):{...platformDefaults};
export function savedPlatform(){return fs.existsSync(file)?validatePlatform(JSON.parse(fs.readFileSync(file,'utf8'))):{...platformDefaults};}
export function savePlatform(input:unknown){const next=validatePlatform(input);const workersFile=path.join(directory,'workers.json');if(fs.existsSync(workersFile)){const workers=JSON.parse(fs.readFileSync(workersFile,'utf8'));if(workers.some((w:any)=>w.contextSize>next.contextSize))throw new Error('Reduce worker context settings before lowering the global context');if(workers.filter((w:any)=>w.enabled).reduce((n:number,w:any)=>n+w.threads,0)>next.threads)throw new Error('Stop workers or reduce their threads before lowering the global CPU budget');}fs.mkdirSync(directory,{recursive:true});writePrivateJson(file,next);return {configuration:next,restartRequired:true};}

/** Bounded per-client round robin; priority gets a bounded preference, never starvation. */
export function fairIndex<T>(items:T[],client:(item:T)=>string,priority:(item:T)=>number,lastClient:string,turn:number):number {
 if(!items.length)return -1;
 const clients=[...new Set(items.map(client))];
 const start=(clients.indexOf(lastClient)+1)%clients.length;
 const ordered=[...clients.slice(start),...clients.slice(0,start)];
 // Every second dispatch is ordinary round robin, including low priority clients.
 const chosen=turn%2===0?ordered[0]:ordered.reduce((best,id)=>priority(items.find(i=>client(i)===id)!)>priority(items.find(i=>client(i)===best)!)?id:best,ordered[0]);
 return items.findIndex(i=>client(i)===chosen);
}
