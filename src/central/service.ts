import {amuCore} from '../core/controller.ts';
import {loadNetworkProfile,saveNetworkProfile,certificates,importCertificate} from './network-profile.ts';
import {backupStatus,startBackup,startRestore,backupFile,importBackup} from '../backup/manager.ts';
import {pipeline} from 'node:stream/promises';
import {maintenanceStatus} from './maintenance.ts';
import {setGenerationPolicy} from '../inference/policy.ts';
import {writePrivateJson} from './storage.ts';
import { platform, savePlatform, savedPlatform, fairIndex } from './platform.ts';
import { usage, reserveTokens } from './usage.ts';
import {windowsTaskStatus} from './windows-status.ts';
import { lanPreparation } from './lan-preparation.ts';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import type http from 'node:http';
import { amuInference } from '../inference/engine.ts';
import { listLocalModels, EngineError } from '../inference/models.ts';
import { monitoringStatus } from '../core/monitoring.ts';
import { networkStatus } from './network.ts';
import { assessModel, modelRegistrySummary } from '../inference/resources.ts';
import { requireRole, roleOf, type ClientRole } from './permissions.ts';
import { readSystemEvents } from '../core/monitoring.ts';
import { operatingStatus } from './operations.ts';

const version=JSON.parse(fs.readFileSync(path.resolve('package.json'),'utf8')).version;
const directory = path.resolve(process.env.AMU_CENTRAL_STATE_DIR || 'scratch/secrets');
fs.mkdirSync(directory, { recursive: true });
const file = path.join(directory, 'central-access.json');
export type Client = { id: string; name: string; hash: string; admin: boolean; role?: ClientRole; enabled: boolean; models: string[]; rpm: number; maxTokens?: number; maxConcurrent?: number; scopes?: string[]; dailyTokenLimit?: number; priority?: number; maxContextTokens?:number };
type Config = { provider?: 'embedded' | 'local-http'; upstream: string; model: string; clients: Client[] };
const downloadTickets=new Map<string,{clientId:string;hash:string;path:string;expires:number}>();
const hash = (key: string) => crypto.createHash('sha256').update(key).digest('hex');
let config: Config;
if (fs.existsSync(file)) config = JSON.parse(fs.readFileSync(file, 'utf8'));
else {
  const key = crypto.randomBytes(32).toString('base64url');
  config = { provider: 'embedded', upstream: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:1.5b', clients: [{ id: crypto.randomUUID(), name: 'Administrator', hash: hash(key), admin: true, enabled: true, models: [], rpm: 120 }] };
  fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(path.join(directory, 'central-admin-key.txt'), key, { mode: 0o600, flag: 'wx' });
}
function save() {
  writePrivateJson(file,config);
}
export class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
const counters = new Map<string, { minute: number; count: number }>();
const clientObservations = new Map<string, { lastSeenAt: string; remoteAddress: string }>();
export function authenticate(req: http.IncomingMessage): Client {
  const pathname=new URL(req.url||'/','http://localhost').pathname;
  if(/^\/api\/central\/backups\/[a-f0-9-]{36}\/download$/.test(pathname)&&!req.headers.authorization){const cookie=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('AMUDownload='))?.slice(12);if(cookie){const ticket=downloadTickets.get(cookie);downloadTickets.delete(cookie);const client=ticket&&ticket.expires>Date.now()&&ticket.path===pathname?config.clients.find(c=>c.id===ticket.clientId&&c.hash===ticket.hash&&c.enabled&&c.admin):undefined;if(client)return client;}}
  const authorization = req.headers.authorization;
  const key = authorization?.startsWith('Bearer ') ? authorization.slice(7) : req.headers['x-amu-api-key'];
  if (typeof key !== 'string' || key.length > 512) throw new ApiError(401, 'API key required');
  const digest = hash(key);
  const client = config.clients.find(c => c.enabled && c.hash.length === digest.length && crypto.timingSafeEqual(Buffer.from(c.hash), Buffer.from(digest)));
  if (!client) throw new ApiError(401, 'Invalid API key');
  clientObservations.set(client.id, { lastSeenAt: new Date().toISOString(), remoteAddress: req.socket.remoteAddress || 'unknown' });
  const minute = Math.floor(Date.now() / 60000);
  const count = counters.get(client.id);
  if (!count || count.minute !== minute) counters.set(client.id, { minute, count: 1 });
  else if (++count.count > client.rpm) throw new ApiError(429, 'Client rate limit exceeded');
  return client;
}
export function requireAdmin(client: Client) { if (!client.admin) throw new ApiError(403, 'Administrator permission required'); }
let active = 0;
const limit = platform.gatewayConcurrency;
type Admission={clientId:string;priority:number;grant:()=>void};
const queue:Admission[]=[];
let lastClient='',turn=0;
async function acquire(signal:AbortSignal,client:Client){
 if(signal.aborted)throw signal.reason;
 if(active<limit){active++;return;}
 if(queue.length>=platform.queueCapacity)throw new ApiError(429,'Inference queue full');
 await new Promise<void>((resolve,reject)=>{
 const item:Admission={clientId:client.id,priority:client.priority||0,grant:()=>{signal.removeEventListener('abort',cancel);resolve();}};
 const cancel=()=>{const i=queue.indexOf(item);if(i>=0)queue.splice(i,1);reject(signal.reason);};
 queue.push(item);signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
 });
}
function release(){if(queue.length){const i=fairIndex(queue,x=>x.clientId,x=>x.priority,lastClient,turn++);const [next]=queue.splice(i,1);if(turn%2===1)lastClient=next.clientId;next.grant();}else active--;}
export const clientScopes=['models:read','chat:write','core:tasks'];
export function requireScope(client:Client,scope:string){if(!client.admin&&client.scopes!==undefined&&!client.scopes.includes(scope))throw new ApiError(403,'API scope denied: '+scope);}
function validateClientOptions(body:any){
 if(!body||typeof body!=='object')throw new ApiError(400,'Invalid client options');
 if(body.name!==undefined&&(typeof body.name!=='string'||!body.name.trim()||body.name.length>100))throw new ApiError(400,'Invalid client name');
 if(body.enabled!==undefined&&typeof body.enabled!=='boolean')throw new ApiError(400,'Invalid client state');
 if(body.scopes!==undefined&&(!Array.isArray(body.scopes)||body.scopes.some((s:unknown)=>typeof s!=='string'||!clientScopes.includes(s))))throw new ApiError(400,'Invalid API scopes');
 if(body.dailyTokenLimit!==undefined&&(!Number.isSafeInteger(body.dailyTokenLimit)||body.dailyTokenLimit<0||body.dailyTokenLimit>1000000000))throw new ApiError(400,'Invalid daily token limit');
 if(body.maxContextTokens!==undefined&&(!Number.isInteger(body.maxContextTokens)||body.maxContextTokens<256||body.maxContextTokens>platform.contextSize))throw new ApiError(400,'Invalid client context limit');
 if(body.priority!==undefined&&(!Number.isInteger(body.priority)||body.priority<0||body.priority>2))throw new ApiError(400,'Invalid priority');
}
const nativeClientActive=new Map<string,number>();
setGenerationPolicy(input=>{
 if(!input.clientId)return {settle:()=>{}};
 const client=config.clients.find(c=>c.id===input.clientId);
 if(!client||!client.enabled)throw new ApiError(401,'Client access revoked');
 requireScope(client,input.source==='core'?'core:tasks':'chat:write');
 if(client.models.length&&!client.models.includes(input.model))throw new ApiError(403,'Model access denied');
 if(input.source==='core')input.maxTokens=Math.min(input.maxTokens||768,client.maxTokens||(client.admin?2048:512));
 if((input.maxTokens||256)>(client.maxTokens||(client.admin?2048:512)))throw new ApiError(400,'Client output token limit exceeded');
 const count=nativeClientActive.get(client.id)||0;
 if(count>=(client.maxConcurrent||(client.admin?2:1)))throw new ApiError(429,'Client inference concurrency exceeded');
 const reserved=Buffer.byteLength(JSON.stringify(input.messages),'utf8')+input.messages.length*32+(input.maxTokens||256);
 const settle=reserveTokens(client.id,reserved,client.dailyTokenLimit);if(!settle)throw new ApiError(429,'Daily client token budget exceeded');
 nativeClientActive.set(client.id,count+1);input.priority=client.priority||0;input.maxContextTokens=Math.min(client.maxContextTokens||platform.contextSize,platform.contextSize);
 return {settle:result=>{nativeClientActive.set(client.id,Math.max(0,(nativeClientActive.get(client.id)||1)-1));settle(result?.usage,!result);}};
});
const events: object[] = [];
const clientActive = new Map<string, number>();
const clientControllers = new Map<string, Set<AbortController>>();
const requestControllers = new Map<string, AbortController>();
const requests = new Map<string, { id:string; clientId:string; streaming:boolean; state:string; since:string }>();
function record(event: object) {
  const entry = { time: new Date().toISOString(), ...event };
  events.push(entry); if (events.length > 200) events.shift();
  try {
    const log = path.join(directory, 'central-events.ndjson');
    if (fs.existsSync(log) && fs.statSync(log).size > 262144) fs.renameSync(log, log + '.previous');
    fs.appendFileSync(log, JSON.stringify(entry) + '\n', { mode: 0o600 });
  } catch { console.error('Central event log could not be written'); }
}
async function upstream(endpoint: string, init: RequestInit = {}) {
  const signal = init.signal ?? AbortSignal.timeout(3000);
  for (let attempt = 0; ; attempt++) {
    try { return await fetch(config.upstream + endpoint, { ...init, signal }); }
    catch (error) { if (attempt || signal.aborted || init.method === 'POST') throw error; }
  }
}
export async function initializeCentral() {
  if ((config.provider || 'embedded') === 'embedded') {
    if (config.model && config.model !== amuInference.status().model) await amuInference.selectModel(config.model);
    else await amuInference.initialize();
  }
}
export async function health() {
  if ((config.provider || 'embedded') === 'embedded') { const engine = amuInference.status(); return { server:'AMU-Agent-2',version,uptimeSeconds:process.uptime(),status: engine.ready&&!maintenanceStatus().operation ? 'ready' : 'degraded', inferenceReady: engine.ready&&!maintenanceStatus().operation, maintenance:!!maintenanceStatus().operation, active, queued: queue.length, engine:{backend:engine.backend,state:engine.state,ready:engine.ready,paused:engine.paused,model:engine.model,active:engine.active,queued:engine.queued} }; }
  try { const r = await upstream('/models'); return { status: r.ok&&!maintenanceStatus().operation ? 'ready' : 'degraded', inferenceReady: r.ok&&!maintenanceStatus().operation, active, queued: queue.length }; }
  catch { return { status: 'degraded', inferenceReady: false, active, queued: queue.length }; }
}
async function statusPayload(){return { ...await health(), engine:amuInference.status(),requests:[...requests.values()], scheduler:{active,queued:queue.length,httpRequests:maintenanceStatus().activeRequests,httpLimit:platform.maxHttpRequests,capacity:platform.queueCapacity,concurrency:limit,policy:"bounded-priority-round-robin"}, platform, connection: { provider: config.provider || 'embedded', upstream: config.upstream, model: config.model }, clients: config.clients.map(({ hash: _, ...c }) => ({...c,role:roleOf(c),active:clientActive.get(c.id)||0,usage:usage(c.id),scopes:c.scopes??clientScopes,observation:clientObservations.get(c.id)||null})), resources: { memory: process.memoryUsage(), freeMemory: os.freemem(), totalMemory: os.totalmem(), cpus: os.cpus().length, cpuUsage: process.cpuUsage(), uptime: process.uptime() }, events };}
export async function centralRoute(req: http.IncomingMessage, res: http.ServerResponse, pathname: string, body: any, client: Client): Promise<boolean> {
  if (pathname === '/api/client/status' && req.method === 'GET') { res.end(JSON.stringify({ id: client.id, name: client.name, scopes:client.scopes??clientScopes, usage:usage(client.id), server:{version,model:config.model,backend:config.provider==='local-http'?'local-http':amuInference.status().backend,uptimeSeconds:process.uptime()}, role: roleOf(client), enabled: client.enabled, models: client.models, limits: { rpm: client.rpm, maxTokens: client.maxTokens || (client.admin ? 2048 : 512), maxConcurrent: client.maxConcurrent || (client.admin ? 2 : 1), dailyTokenLimit:client.dailyTokenLimit||0,maxContextTokens:client.maxContextTokens||platform.contextSize,priority:client.priority||0 }, active: clientActive.get(client.id) || 0, requestsThisMinute: counters.get(client.id)?.minute === Math.floor(Date.now()/60000) ? counters.get(client.id)?.count : 0, observation: clientObservations.get(client.id), inferenceReady: (await health()).inferenceReady })); return true; }
  if (pathname.startsWith('/api/central/')) {
    const operational = ['/api/central/monitoring','/api/central/status','/api/central/models','/api/central/engine/control','/api/central/requests/cancel','/api/central/logs','/api/central/windows/status','/api/central/workers','/api/central/workers/control','/api/central/dashboard'];
    if (operational.includes(pathname)) requireRole(client,['admin','operator']); else requireAdmin(client);
    if(pathname==='/api/central/dashboard'&&req.method==='GET'){res.end(JSON.stringify({status:await statusPayload(),monitoring:{process:monitoringStatus(),engine:amuInference.status(),network:networkStatus(),operation:operatingStatus()},events:readSystemEvents(),workers:{workers:amuInference.workers(),capacity:amuInference.status().capacity},backups:client.admin?backupStatus():undefined}));return true;}
    if(pathname==='/api/central/workers'&&req.method==='GET'){res.end(JSON.stringify({workers:amuInference.workers(),capacity:amuInference.status().capacity}));return true;}
    if(pathname==='/api/central/workers/register'&&req.method==='POST'){res.end(JSON.stringify(await amuInference.register(body)));return true;}
    if(pathname==='/api/central/workers/configure'&&req.method==='POST'){if(typeof body?.id!=='string')throw new ApiError(400,'Worker id required');const {id,...settings}=body;const worker=await amuInference.configure(id,settings);if(id==='primary'){config.model=worker.model;save();}res.end(JSON.stringify(worker));return true;}
    if(pathname==='/api/central/workers/control'&&req.method==='POST'){if(typeof body?.id!=='string'||!['start','stop','restart'].includes(body.action))throw new ApiError(400,'Worker id and action required');res.end(JSON.stringify(await amuInference.workerControl(body.id,body.action,body.allowDuplicateModel===true)));return true;}
    if(pathname==='/api/central/network'&&req.method==='GET'){res.end(JSON.stringify({active:networkStatus(),saved:loadNetworkProfile(),certificates:certificates(),restartRequiredForChanges:true,firewallModified:false,certificateTrustModified:false}));return true;}
    if(pathname==='/api/central/network'&&req.method==='POST'){res.end(JSON.stringify(saveNetworkProfile(body)));return true;}
    if(pathname==='/api/central/network/certificates'&&req.method==='POST'){res.end(JSON.stringify(importCertificate(body)));return true;}
    if(pathname==='/api/central/backups/import'&&req.method==='POST'){res.end(JSON.stringify(await importBackup(req)));return true;}
    if(pathname==='/api/central/backups/download-ticket'&&req.method==='POST'){const archive=backupFile(body?.id);if(JSON.parse(fs.readFileSync(archive+'.json','utf8')).integrityVerified===false)throw new ApiError(409,'Verify imported backup before exporting it');for(const [key,ticket]of downloadTickets)if(ticket.expires<Date.now())downloadTickets.delete(key);if(downloadTickets.size>=1000)throw new ApiError(429,'Download ticket limit');const token=crypto.randomBytes(32).toString('base64url'),url='/api/central/backups/'+body.id+'/download';downloadTickets.set(token,{clientId:client.id,hash:client.hash,path:url,expires:Date.now()+60000});res.setHeader('Set-Cookie','AMUDownload='+token+'; HttpOnly; SameSite=Strict; Path='+url+'; Max-Age=60'+(networkStatus().tls?'; Secure':''));res.end(JSON.stringify({url,expiresIn:60}));return true;}
    if(pathname==='/api/central/backups'&&req.method==='GET'){res.end(JSON.stringify(backupStatus()));return true;}
    if(pathname==='/api/central/backups/create'&&req.method==='POST'){res.statusCode=202;res.end(JSON.stringify(startBackup(body||{})));return true;}
    if(pathname==='/api/central/backups/restore'&&req.method==='POST'){res.statusCode=202;res.end(JSON.stringify(startRestore(body)));return true;}
    if(pathname==='/api/central/backups/verify'&&req.method==='POST'){res.statusCode=202;res.end(JSON.stringify(startRestore(body,true)));return true;}
    if(/^\/api\/central\/backups\/[a-f0-9-]{36}\/download$/.test(pathname)&&req.method==='GET'){const file=backupFile(pathname.split('/').at(-2));if(JSON.parse(fs.readFileSync(file+'.json','utf8')).integrityVerified===false)throw new ApiError(409,'Verify imported backup before exporting it');res.setHeader('Set-Cookie','AMUDownload=; Max-Age=0; HttpOnly; SameSite=Strict; Path='+pathname);res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Disposition','attachment; filename="AMU-'+path.basename(file)+'"');await pipeline(fs.createReadStream(file),res);return true;}
    if(pathname==='/api/central/platform'&&req.method==='GET'){res.end(JSON.stringify({configuration:platform,savedConfiguration:savedPlatform(),hardware:{logicalCpus:os.availableParallelism(),totalMemoryMiB:Math.floor(os.totalmem()/1024**2)},workerTopology:{transport:'private IPC',workers:amuInference.workers().length,parallelGenerations:amuInference.status().capacity.readyWorkers},restartRequiredForChanges:true}));return true;}
    if(pathname==='/api/central/platform'&&req.method==='POST'){try{res.end(JSON.stringify(savePlatform(body)));}catch(e){throw new ApiError(400,(e as Error).message);}return true;}
    if(pathname==='/api/central/windows/status'&&req.method==='GET'){res.end(JSON.stringify(await windowsTaskStatus()));return true;}
    if (pathname === '/api/central/logs' && req.method === 'GET') { res.end(JSON.stringify({ events: readSystemEvents() })); return true; }
    if (pathname === '/api/central/models' && req.method === 'GET') { const reclaimable=(amuInference.status().nativeProcess as any)?.memory?.rss || 0; const models=await Promise.all(modelRegistrySummary().map(async m => { try { return {...m, assessment:await assessModel(m.id,reclaimable)}; } catch(e) { return {...m,error:(e as Error).message}; } })); res.end(JSON.stringify({ models, active: amuInference.status().model })); return true; }
    if (pathname === '/api/central/engine/control' && req.method === 'POST') { if(body?.action==='start') await amuInference.start(); else if(body?.action==='stop') await amuInference.pause(); else if(body?.action==='restart') await amuInference.restart(); else throw new ApiError(400,'Unknown engine action'); record({action:'engine_control',operation:body.action,client:client.id});res.end(JSON.stringify(amuInference.status()));return true; }
    if (pathname === '/api/central/requests/cancel' && req.method === 'POST') { if(typeof body?.id!=='string')throw new ApiError(400,'Request id required');const controller=requestControllers.get(body.id);if(controller)controller.abort(new ApiError(499,'Request cancelled by operator'));else amuInference.cancel(body.id);record({action:'request_cancelled',id:body.id,client:client.id});res.end('{"ok":true}');return true; }
    if (pathname === '/api/central/server/restart' && req.method === 'POST') { if(amuCore.isBusy()||amuInference.status().active||amuInference.status().queued||requests.size||backupStatus().busy)throw new ApiError(409,'Finish or cancel active work before restarting the API'); if (!process.connected || process.env.AMU_SUPERVISED !== 'true') throw new ApiError(409,'API restart requires the AMU supervisor');res.writeHead(202);res.end('{"accepted":true,"operation":"restart"}');setTimeout(()=>process.send?.({type:'control',action:'restart'}),200).unref();return true; }
    if (pathname === '/api/central/integration' && req.method === 'GET') {const network=networkStatus();res.end(JSON.stringify({server:'AMU-Agent-2',network,lanPreparation:lanPreparation(),twoComputerTest:'not performed',readyForLan:network.tls&&network.allowedCidrs.length>0&&!['127.0.0.1','localhost','::1'].includes(network.bindHost),configuration:{base_url:network.tls?'https://<Agent-2-host>:3030/v1':'http://127.0.0.1:3030/v1',model:config.model,api_key:'<dedicated client key>'}}));return true;}
    if (pathname === '/api/central/monitoring' && req.method === 'GET') { res.end(JSON.stringify({ process: monitoringStatus(), engine: amuInference.status(), network: networkStatus(), operation:operatingStatus() })); return true; }
    if (pathname === '/api/central/status' && req.method === 'GET') {
      res.end(JSON.stringify(await statusPayload()));
    } else if (pathname === '/api/central/clients' && req.method === 'POST') {
      validateClientOptions(body);
      if(config.clients.some(c=>c.name.trim().normalize('NFKC').toLowerCase()===String(body.name).trim().normalize('NFKC').toLowerCase()))throw new ApiError(409,'Client name already exists');
      if (typeof body?.name !== 'string' || !body.name.trim() || body.name.length > 100 || (body.models !== undefined && (!Array.isArray(body.models) || body.models.some((m: unknown) => typeof m !== 'string')))) throw new ApiError(400, 'Invalid client');
      if (body.rpm !== undefined && (!Number.isInteger(body.rpm) || body.rpm < 1 || body.rpm > 600)) throw new ApiError(400, 'Invalid rate limit');
      if (body.maxTokens !== undefined && (!Number.isInteger(body.maxTokens) || body.maxTokens < 1 || body.maxTokens > 2048)) throw new ApiError(400, 'Invalid token limit');
      if (body.maxConcurrent !== undefined && (!Number.isInteger(body.maxConcurrent) || body.maxConcurrent < 1 || body.maxConcurrent > 16)) throw new ApiError(400, 'Invalid concurrency limit');
      if (body.role !== undefined && !['inference','operator','developer'].includes(body.role)) throw new ApiError(400,'Invalid client role');
      if (config.clients.length >= platform.maxClients) throw new ApiError(409, 'Client limit reached');
      const key = crypto.randomBytes(32).toString('base64url');
      const entry: Client = { id: crypto.randomUUID(), name: body.name.trim(), hash: hash(key), admin: false, role: body.role || 'inference', enabled: body.enabled??true, models: body.models || [], rpm: body.rpm || 60, maxTokens: body.maxTokens || 512, maxConcurrent: body.maxConcurrent || 1, scopes:body.scopes??['models:read','chat:write',...(body.role==='developer'?['core:tasks']:[])], dailyTokenLimit:body.dailyTokenLimit||0, priority:body.priority||0, maxContextTokens:body.maxContextTokens||platform.contextSize };
      config.clients.push(entry); save(); record({ action: 'client_created', id: entry.id });
      res.end(JSON.stringify({ id: entry.id, key }));
    } else if (pathname === '/api/central/revoke' && req.method === 'POST') {
      const entry = config.clients.find(c => c.id === body?.id && !c.admin);
      if (!entry) throw new ApiError(404, 'Client not found');
      entry.enabled = false; save(); record({ action: 'client_revoked', id: entry.id }); res.end('{"ok":true}');
      for (const controller of clientControllers.get(entry.id) || []) controller.abort(new ApiError(401, 'Client access revoked'));
      for(const job of amuInference.status().requests.filter(j=>j.clientId===entry.id))amuInference.cancel(job.id);
    } else if (pathname === '/api/central/admin-key/rotate' && req.method === 'POST') {
      const key = crypto.randomBytes(32).toString('base64url');
      const keyFile = path.join(directory, 'central-admin-key.txt');
      const previousKey = fs.readFileSync(keyFile, 'utf8'); const previousHash = client.hash; let persisted = false;
      try { client.hash = hash(key); save(); persisted = true; fs.writeFileSync(keyFile, key, { mode: 0o600 }); }
      catch (error) { client.hash = previousHash; if (persisted) { save(); fs.writeFileSync(keyFile, previousKey, { mode: 0o600 }); } throw error; }
      record({ action: 'admin_key_rotated', id: client.id }); res.end(JSON.stringify({ id: client.id, key }));
    } else if (pathname === '/api/central/rotate' && req.method === 'POST') {
      const entry = config.clients.find(c => c.id === body?.id && !c.admin && c.enabled);
      if (!entry) throw new ApiError(404, 'Active client not found');
      const key = crypto.randomBytes(32).toString('base64url'); entry.hash = hash(key); save();for(const controller of clientControllers.get(entry.id)||[])controller.abort(new ApiError(401,'Client key rotated'));for(const job of amuInference.status().requests.filter(j=>j.clientId===entry.id))amuInference.cancel(job.id);record({ action: 'client_key_rotated', id: entry.id }); res.end(JSON.stringify({ id: entry.id, key }));
    } else if (pathname === '/api/central/clients/update' && req.method === 'POST') {
      validateClientOptions(body);
      const entry = config.clients.find(c => c.id === body?.id && !c.admin);
      if (!entry) throw new ApiError(404, 'Client not found');
      if (body.role !== undefined && !['inference','operator','developer'].includes(body.role)) throw new ApiError(400,'Invalid client role');
      if (!Array.isArray(body.models) || body.models.some((m: unknown) => typeof m !== 'string') || !Number.isInteger(body.rpm) || body.rpm < 1 || body.rpm > 600 || !Number.isInteger(body.maxTokens) || body.maxTokens < 1 || body.maxTokens > 2048 || !Number.isInteger(body.maxConcurrent) || body.maxConcurrent < 1 || body.maxConcurrent > 16) throw new ApiError(400, 'Invalid client limits');
      if(body.name!==undefined&&body.name.trim()!==entry.name&&config.clients.some(c=>c.id!==entry.id&&c.name.trim().normalize('NFKC').toLowerCase()===body.name.trim().normalize('NFKC').toLowerCase()))throw new ApiError(409,'Client name already exists');
      if(body.name!==undefined)entry.name=body.name.trim();if(body.enabled!==undefined)entry.enabled=body.enabled;if(body.scopes!==undefined)entry.scopes=[...new Set(body.scopes)] as string[];if(body.dailyTokenLimit!==undefined)entry.dailyTokenLimit=body.dailyTokenLimit;if(body.priority!==undefined)entry.priority=body.priority;if(body.maxContextTokens!==undefined)entry.maxContextTokens=body.maxContextTokens;
      entry.models = body.models; entry.rpm = body.rpm; entry.maxTokens = body.maxTokens; entry.maxConcurrent = body.maxConcurrent; if(body.role)entry.role=body.role; save(); record({ action: 'client_limits_updated', id: entry.id }); res.end('{"ok":true}');
      for(const controller of clientControllers.get(entry.id)||[])controller.abort(new ApiError(403,'Client policy changed; retry with current permissions'));
      for(const job of amuInference.status().requests.filter(j=>j.clientId===entry.id))amuInference.cancel(job.id);
    } else if (pathname === '/api/central/engine/load' && req.method === 'POST') {
      await initializeCentral(); res.end(JSON.stringify(amuInference.status()));
    } else if (pathname === '/api/central/connection' && req.method === 'POST') {
      if (body?.provider === 'embedded') {
        if (typeof body.model !== 'string' || !listLocalModels().some(m => m.id === body.model)) throw new ApiError(404, 'Model not installed in AMU');
        await amuInference.selectModel(body.model); config.model = body.model; config.provider = 'embedded'; save(); record({ action: 'embedded_model_selected', model: body.model }); res.end('{"ok":true}'); return true;
      }
      let u: URL; try { u = new URL(body?.upstream); } catch { throw new ApiError(400, 'Invalid upstream URL'); }
      if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || u.username || u.password || u.search || u.hash || !u.pathname.endsWith('/v1')) throw new ApiError(400, 'Only a local HTTP /v1 inference endpoint is permitted');
      if (typeof body.model !== 'string' || body.model.length > 200) throw new ApiError(400, 'Invalid default model');
      config.provider = 'local-http'; config.upstream = u.href.replace(/\/$/, ''); config.model = body.model; save(); record({ action: 'connection_updated' }); res.end('{"ok":true}');
    } else throw new ApiError(404, 'Unknown management endpoint');
    return true;
  }
  if (pathname === '/v1/models' && req.method === 'GET') {
    requireScope(client,'models:read');
    if ((config.provider || 'embedded') === 'embedded') {
      const models = listLocalModels().filter(m => !client.models.length || client.models.includes(m.id));
      res.end(JSON.stringify({ object: 'list', data: models.map(m => ({ id: m.id, object: 'model', created: 0, owned_by: 'amu-local' })) })); return true;
    }
    const response = await upstream('/models');
    if (!response.ok) throw new ApiError(503, 'Local inference unavailable');
    const data = await response.json() as any;
    if (client.models.length) data.data = data.data.filter((m: any) => client.models.includes(m.id));
    res.end(JSON.stringify(data)); return true;
  }
  if (pathname !== '/v1/chat/completions' || req.method !== 'POST') return false;
  requireScope(client,'chat:write');
  if (body?.max_completion_tokens !== undefined) { if (body.max_tokens !== undefined) throw new ApiError(400, 'Specify only one output token limit'); body.max_tokens = body.max_completion_tokens; }
  if (!body || !Array.isArray(body.messages) || !body.messages.length || body.messages.some((m: any) => !m || !['system','user','assistant'].includes(m.role) || typeof m.content !== 'string')) throw new ApiError(400, 'messages must contain role/content strings');
  const model = !body.model || body.model === 'amu-agent-2-default' ? config.model : body.model;
  if (typeof model !== 'string' || !model) throw new ApiError(400, 'Specify an installed model');
  if (client.models.length && !client.models.includes(model)) throw new ApiError(403, 'Model access denied');
  if (body.stream !== undefined && typeof body.stream !== 'boolean') throw new ApiError(400, 'stream must be boolean');
  if(body.stream_options!==undefined&&(!body.stream_options||typeof body.stream_options!=='object'||Array.isArray(body.stream_options)||(body.stream_options.include_usage!==undefined&&typeof body.stream_options.include_usage!=='boolean')))throw new ApiError(400,'Invalid stream_options');
  if (body.temperature !== undefined && (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 2)) throw new ApiError(400, 'Invalid temperature');
  if (body.max_tokens !== undefined && (!Number.isInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > 32768)) throw new ApiError(400, 'Invalid max_tokens');
  if (['tools','tool_choice','functions','response_format'].some(k => body[k] !== undefined)) throw new ApiError(400, 'This endpoint supports text only; use the AMU Core task API for tools');
  if ((body.max_tokens || 256) > (client.maxTokens || (client.admin ? 2048 : 512))) throw new ApiError(400, 'Client output token limit exceeded');
  if ((clientActive.get(client.id) || 0) >= (client.maxConcurrent || (client.admin ? 2 : 1))) throw new ApiError(429, 'Client concurrent request limit exceeded');
  const reserved=Buffer.byteLength(JSON.stringify(body.messages),'utf8')+body.messages.length*32+(body.max_tokens||256);
  const settleTokens=(config.provider||'embedded')==='embedded'?((_usage?:{prompt_tokens:number;completion_tokens:number},_unknown?:boolean)=>{}):reserveTokens(client.id,reserved,client.dailyTokenLimit);if(!settleTokens)throw new ApiError(429,'Daily client token budget exceeded');
  let inferenceStarted=false,settled=false;
  clientActive.set(client.id, (clientActive.get(client.id) || 0) + 1);
  const controller = new AbortController();
  const requestId=String(res.getHeader('X-Request-ID')||crypto.randomUUID());requestControllers.set(requestId,controller);requests.set(requestId,{id:requestId,clientId:client.id,streaming:!!body.stream,state:'waiting-admission',since:new Date().toISOString()});
  const controllers = clientControllers.get(client.id) || new Set<AbortController>(); controllers.add(controller); clientControllers.set(client.id, controllers);
  const timer = setTimeout(() => controller.abort(new DOMException('Inference deadline exceeded', 'TimeoutError')), platform.requestTimeoutMs);
  const disconnect = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', disconnect);
  let acquired = false;
  const heartbeat=setInterval(()=>{if(body.stream&&res.headersSent&&!res.writableEnded&&!res.destroyed)res.write(': keep-alive\n\n');},15000);heartbeat.unref();
  try {
    await acquire(controller.signal,client); acquired = true;
    const request=requests.get(requestId);if(request)request.state='inference-submitted';
    if (!client.enabled) throw new ApiError(401, 'Client access revoked');
    requireScope(client,'chat:write');inferenceStarted=true;
    if ((config.provider || 'embedded') === 'embedded') {
      const id = 'chatcmpl-' + crypto.randomUUID(); const created = Math.floor(Date.now() / 1000);
      const chunk = (delta: object, finish_reason: string | null = null) => {
        if (!res.headersSent) { res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' }); res.flushHeaders(); }
        res.write('data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta, finish_reason }] }) + '\n\n');
        if (res.writableLength > 1048576) controller.abort(new EngineError(429, 'Streaming consumer is too slow'));
      };
      let first = true;
      const result = await amuInference.generate({ model, messages: body.messages, maxTokens: body.max_tokens || 256, temperature: body.temperature, signal: controller.signal, clientId:client.id, priority:client.priority||0, stream:!!body.stream, onChunk: body.stream ? (text) => { if (first) { chunk({ role: 'assistant', content: '' }); first = false; } chunk({ content: text }); } : undefined });
      settleTokens(result.usage);settled=true;
      if (body.stream) { chunk({}, result.finishReason); if(body.stream_options?.include_usage===true)res.write('data: '+JSON.stringify({id,object:'chat.completion.chunk',created,model,choices:[],usage:{...result.usage,total_tokens:result.usage.prompt_tokens+result.usage.completion_tokens}})+'\n\n');res.end('data: [DONE]\n\n'); }
      else res.end(JSON.stringify({ id, object: 'chat.completion', created, model, choices: [{ index: 0, message: { role: 'assistant', content: result.content }, finish_reason: result.finishReason }], usage: { ...result.usage, total_tokens: result.usage.prompt_tokens + result.usage.completion_tokens } }));
      record({ action: 'completion', backend: 'embedded', client: client.id, model, stream: !!body.stream, durationMs: result.durationMs, ttftMs: result.ttftMs });
      return true;
    }
    const response = await upstream('/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: body.messages, stream: body.stream === true, temperature: body.temperature, max_tokens: body.max_tokens }), signal: controller.signal });
    if (!response.ok) throw new ApiError(response.status === 404 ? 404 : 502, 'Local model rejected request');
    if (body.stream) {
      if (!response.body) throw new ApiError(502, 'Missing upstream stream');
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      const { pipeline } = await import('node:stream/promises');
      const { Readable } = await import('node:stream');
      await pipeline(Readable.fromWeb(response.body as any), res, { signal: controller.signal });
    } else {const result=await response.json() as any;const u=result.usage;if(u&&Number.isSafeInteger(u.prompt_tokens)&&u.prompt_tokens>=0&&Number.isSafeInteger(u.completion_tokens)&&u.completion_tokens>=0){settleTokens(u);settled=true;}res.end(JSON.stringify(result));}
    if(!settled){settleTokens(undefined,true);settled=true;}
    record({ action: 'completion', client: client.id, model, stream: !!body.stream });
  } catch (error) { record({ action: 'completion_failed', client: client.id, model }); throw error; } finally { if(!settled)settleTokens(undefined,inferenceStarted);clearInterval(heartbeat);requestControllers.delete(requestId);requests.delete(requestId);controllers.delete(controller); if (!controllers.size) clientControllers.delete(client.id); clientActive.set(client.id, Math.max(0, (clientActive.get(client.id) || 1) - 1)); clearTimeout(timer); res.off('close', disconnect); if (acquired) release(); }
  return true;
}
