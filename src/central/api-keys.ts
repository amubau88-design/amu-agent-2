import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {writePrivateJson} from './storage.ts';
import {EngineError} from '../inference/models.ts';
import {usage} from './usage.ts';
export type ManagedKey={id:string;clientId:string;name:string;hash:string;enabled:boolean;createdAt:string;rotatedAt?:string;revokedAt?:string;expiresAt:string|null;scopes:string[];models:string[];rpm:number;maxTokens:number;maxConcurrent:number;maxContextTokens:number;dailyTokenLimit:number;priority:number};
const file=path.resolve(process.env.AMU_CENTRAL_STATE_DIR||'scratch/secrets','api-keys.json');
let keys:ManagedKey[]=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
if(!Array.isArray(keys))throw Error('Invalid API key registry; existing file preserved');
const hash=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');
function save(){writePrivateJson(file,keys,true);}
export function expiration(value:unknown):string|null{if(value===undefined||value===null||value==='')return null;if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||Date.parse(value)<=Date.now())throw new EngineError(400,'Expiry must be a future date or empty');return new Date(value).toISOString();}
export const keyActive=(key:ManagedKey)=>key.enabled&&!key.revokedAt&&(!key.expiresAt||Date.parse(key.expiresAt)>Date.now());
export const managedKey=(id:string)=>keys.find(key=>key.id===id);
export function keyMetadata(key:ManagedKey){const {hash:_,...metadata}=key;return {...metadata,keyId:key.id,maskedKey:'••••••••',secretRetrievable:false,expired:!!key.expiresAt&&Date.parse(key.expiresAt)<=Date.now(),usage:usage('key:'+key.id)};}
export const listKeys=()=>keys.map(keyMetadata);
export function matchKey(digest:string){return keys.find(key=>key.hash.length===digest.length&&crypto.timingSafeEqual(Buffer.from(key.hash),Buffer.from(digest)));}
function keySettings(body:any){
 const number=(name:string,fallback:number,min:number,max:number)=>{const value=body[name]??fallback;if(!Number.isSafeInteger(value)||value<min||value>max)throw new EngineError(400,'Invalid key limit: '+name);return value;};
 const scopes=body.scopes??['models:read','chat:write'];if(!Array.isArray(scopes)||scopes.some(value=>!['models:read','chat:write'].includes(value)))throw new EngineError(400,'Managed application keys support model listing and chat only');
 const models=body.models??[];if(!Array.isArray(models)||models.length>100||models.some(value=>typeof value!=='string'||!value||value.length>200))throw new EngineError(400,'Invalid key models');
 return {scopes:[...new Set(scopes)] as string[],models:[...new Set(models)] as string[],rpm:number('rpm',60,1,600),maxTokens:number('maxTokens',512,1,2048),maxConcurrent:number('maxConcurrent',1,1,16),maxContextTokens:number('maxContextTokens',4096,256,32768),dailyTokenLimit:number('dailyTokenLimit',0,0,1000000000),priority:number('priority',0,0,2)};
}
export function createKey(body:any,client:{id:string;admin:boolean}){
 if(client.admin)throw new EngineError(403,'Application keys cannot create administrator access');if(keys.length>=10000||keys.filter(key=>key.clientId===client.id&&!key.revokedAt).length>=64)throw new EngineError(409,'Managed key limit reached (10000 total / 64 active definitions per application)');
 const name=body?.name;if(typeof name!=='string'||!name.trim()||name.length>100)throw new EngineError(400,'A key name is required');
 if(keys.some(key=>key.clientId===client.id&&key.name===name.trim()&&!key.revokedAt))throw new EngineError(409,'Key name already exists for this application');
 const settings=keySettings(body);
 const secret=crypto.randomBytes(32).toString('base64url'),key:ManagedKey={id:crypto.randomUUID(),clientId:client.id,name:name.trim(),hash:hash(secret),createdAt:new Date().toISOString(),enabled:true,expiresAt:expiration(body.expiresAt),...settings};
 keys.push(key);try{save();}catch(error){keys.pop();throw error;}return{...keyMetadata(key),key:secret};
}
export function changeKey(id:string,action:string,body:any={}){
 const key=managedKey(id);if(!key)throw new EngineError(404,'API key not found');if(key.revokedAt)throw new EngineError(409,'Revoked API key cannot be reactivated or rotated');
 const previous={...key};let secret:string|undefined;
 if(action==='rotate'){secret=crypto.randomBytes(32).toString('base64url');key.hash=hash(secret);key.rotatedAt=new Date().toISOString();}
 else if(action==='disable')key.enabled=false;
 else if(action==='enable'){if(key.expiresAt&&Date.parse(key.expiresAt)<=Date.now())throw new EngineError(409,'Update expired date before enabling key');key.enabled=true;}
 else if(action==='revoke'){if(body.confirmName!==key.name)throw new EngineError(409,'Confirm the exact key name');key.revokedAt=new Date().toISOString();key.enabled=false;key.hash=hash(crypto.randomBytes(32).toString('base64url'));}
 else if(action==='configure'){const name=body.name??key.name;if(typeof name!=='string'||!name.trim()||name.length>100)throw new EngineError(400,'Invalid key name');if(keys.some(other=>other.id!==id&&other.clientId===key.clientId&&!other.revokedAt&&other.name===name.trim()))throw new EngineError(409,'Key name already exists');const settings=keySettings({...key,...body});Object.assign(key,settings,{name:name.trim()});}
 else if(action==='expiry')key.expiresAt=expiration(body.expiresAt);
 else throw new EngineError(400,'Unknown API key action');
 try{save();}catch(error){Object.assign(key,previous);throw error;}return{...keyMetadata(key),...(secret?{key:secret}:{})};
}
