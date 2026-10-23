import fs from 'node:fs';
import path from 'node:path';
import {writePrivateJson} from './storage.ts';
type Usage={requests:number;errors:number;promptTokens:number;completionTokens:number;chargedTokens:number;durationMs:number;lastRequestAt?:string;lastError?:{at:string;status:number;requestId:string};day:string;dailyTokens:number};
const directory=path.resolve(process.env.AMU_CENTRAL_STATE_DIR||'scratch/secrets');
const file=path.join(directory,'client-usage.json');
let data:Record<string,Usage>=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
const reservations=new Map<string,number>();
function entry(id:string){const day=new Date().toISOString().slice(0,10);const e=data[id]??={requests:0,errors:0,promptTokens:0,completionTokens:0,chargedTokens:0,durationMs:0,day,dailyTokens:0};if(e.day!==day){e.day=day;e.dailyTokens=0;}return e;}
function persist(){fs.mkdirSync(directory,{recursive:true});writePrivateJson(file,data);}
export function usage(id:string){return {...entry(id),reservedTokens:reservations.get(id)||0};}
export function observeRequest(id:string,status:number,durationMs:number,requestId:string,method='GET',route='/'){
 const e=entry(id);e.requests++;e.durationMs+=durationMs;e.lastRequestAt=new Date().toISOString();if(status>=400){e.errors++;e.lastError={at:e.lastRequestAt,status,requestId};}
 try{persist();const log=path.join(directory,'requests.ndjson');if(fs.existsSync(log)&&fs.statSync(log).size>1048576){if(fs.existsSync(log+'.previous'))fs.unlinkSync(log+'.previous');fs.renameSync(log,log+'.previous');}fs.appendFileSync(log,JSON.stringify({at:e.lastRequestAt,clientId:id,requestId,method,route,status,durationMs})+'\n',{mode:0o600});}catch{console.error('Client usage or request audit persistence failed');}
}
export function reserveTokens(id:string,tokens:number,limit?:number){
 const e=entry(id);if(limit&&e.dailyTokens+tokens>limit)return undefined;
 const day=e.day;e.dailyTokens+=tokens;e.chargedTokens+=tokens;
 try{persist();}catch(error){e.dailyTokens-=tokens;e.chargedTokens-=tokens;throw error;}
 reservations.set(id,(reservations.get(id)||0)+tokens);let settled=false;
 return (actual?:{prompt_tokens:number;completion_tokens:number},chargeUnknown=false)=>{
 if(settled)return;settled=true;reservations.set(id,Math.max(0,(reservations.get(id)||0)-tokens));
 const current=entry(id),charged=actual?actual.prompt_tokens+actual.completion_tokens:chargeUnknown?tokens:0;
 current.promptTokens+=actual?.prompt_tokens||0;current.completionTokens+=actual?.completion_tokens||0;
 current.chargedTokens+=charged-tokens;if(current.day===day)current.dailyTokens+=charged-tokens;
 try{persist();}catch{console.error('Token settlement persistence failed; persisted reservation remains charged');}
 };
}
