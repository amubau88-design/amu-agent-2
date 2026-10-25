import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {writePrivateJson} from './storage.ts';
import {EngineError} from '../inference/models.ts';
const directory=path.resolve(process.env.AMU_CENTRAL_STATE_DIR||'scratch/secrets'),root=path.resolve('.');
const ticketFile=path.join(directory,'owner-login-grant.json'),sessionsFile=path.join(directory,'admin-browser-sessions.json');
const digest=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');
const local=(address:string|undefined)=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address||'');
type Admin={id:string;hash:string;admin:boolean;enabled:boolean;revokedAt?:string};
type Session={hash:string;clientId:string;adminHash:string;root:string;stateDirectory:string;expiresAt:number};
function readSessions():Session[]{return fs.existsSync(sessionsFile)?JSON.parse(fs.readFileSync(sessionsFile,'utf8')):[];}
const token=(request:IncomingMessage)=>request.headers.cookie?.split(';').map(value=>value.trim()).find(value=>value.startsWith('AMUAdmin='))?.slice(9);
export function requireBrowserOrigin(request:IncomingMessage){
 const origin=request.headers.origin,scheme=(request.socket as any).encrypted?'https:':'http:';
 if(typeof origin!=='string'||origin!==scheme+'//'+request.headers.host||!['same-origin','none',undefined].includes(request.headers['sec-fetch-site'] as any))throw new EngineError(403,'Same-origin browser request required');
 if(scheme==='http:'&&!local(request.socket.remoteAddress))throw new EngineError(403,'Browser authentication requires TLS or loopback');
}
function cookie(response:ServerResponse,value:string,maxAge:number){response.setHeader('Set-Cookie','AMUAdmin='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+maxAge+((response.socket as any)?.encrypted?'; Secure':''));}
export function browserPrincipal<T extends Admin>(request:IncomingMessage,clients:T[]):T|undefined{
 const raw=token(request);if(!raw||raw.length>256)return undefined;
 const session=readSessions().find(value=>value.hash===digest(raw)&&value.root===root&&value.stateDirectory===directory&&value.expiresAt>Date.now());
 const client=session&&clients.find(value=>value.id===session.clientId&&value.admin&&value.enabled&&!value.revokedAt&&value.hash===session.adminHash);
 if(!client)throw new EngineError(401,'Administrator browser session expired or revoked');
 if(!['GET','HEAD'].includes(request.method||''))requireBrowserOrigin(request);
 return client;
}
export function createBrowserSession(request:IncomingMessage,response:ServerResponse,admin:Admin){
 requireBrowserOrigin(request);if(!admin.admin||!admin.enabled||admin.revokedAt)throw new EngineError(403,'An active main administrator is required');
 const secret=crypto.randomBytes(32).toString('base64url'),expiresAt=Date.now()+8*3600000;
 const sessions=readSessions().filter(value=>value.expiresAt>Date.now()).slice(-15);sessions.push({hash:digest(secret),clientId:admin.id,adminHash:admin.hash,root,stateDirectory:directory,expiresAt});writePrivateJson(sessionsFile,sessions,true);cookie(response,secret,8*3600);
 return {authenticated:true,role:'admin',expiresAt:new Date(expiresAt).toISOString(),secretStoredInBrowser:'HttpOnly cookie'};
}
let attempts:number[]=[];
export function ownerLogin<T extends Admin>(request:IncomingMessage,response:ServerResponse,code:unknown,clients:T[]){
 requireBrowserOrigin(request);if(!local(request.socket.remoteAddress))throw new EngineError(403,'Owner recovery is restricted to this computer');
 attempts=attempts.filter(time=>time>Date.now()-300000);if(attempts.length>=10)throw new EngineError(429,'Owner login attempt limit reached');attempts.push(Date.now());
 if(typeof code!=='string'||code.length>128||!fs.existsSync(ticketFile))throw new EngineError(401,'Invalid or expired one-time owner code');
 const grant=JSON.parse(fs.readFileSync(ticketFile,'utf8')),hash=digest(code);
 if(grant.root!==root||grant.directory!==directory||grant.expiresAt<=Date.now()||typeof grant.hash!=='string'||grant.hash.length!==hash.length||!crypto.timingSafeEqual(Buffer.from(hash),Buffer.from(grant.hash)))throw new EngineError(401,'Invalid or expired one-time owner code');
 const admin=clients.find(value=>value.id===grant.clientId&&value.admin&&value.enabled&&!value.revokedAt&&value.hash===grant.adminHash);if(!admin)throw new EngineError(401,'Owner grant no longer matches administrator configuration');
 // Exclusive consumption before session creation; a failed operation never reopens the grant.
 fs.renameSync(ticketFile,ticketFile+'.consumed-'+crypto.randomUUID());
 return createBrowserSession(request,response,admin);
}
export function logoutBrowser(request:IncomingMessage,response:ServerResponse){requireBrowserOrigin(request);const raw=token(request);if(raw)writePrivateJson(sessionsFile,readSessions().filter(value=>value.hash!==digest(raw)),true);cookie(response,'',0);return {authenticated:false};}
