import {platform} from '../central/platform.ts';
import {enterRequest,maintenanceStatus} from '../central/maintenance.ts';
import {setBackupIdleCheck} from '../backup/manager.ts';
import { observeRequest } from '../central/usage.ts';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { handleApiRequest } from './routes.ts';
import { ApiError, authenticate, requireAdmin, centralRoute, health, requireScope } from '../central/service.ts';
import { EngineError } from '../inference/models.ts';
import { amuCore } from '../core/controller.ts';
import {streamTaskEvents} from '../core/task-events.ts';
import { recordSystemEvent } from '../core/monitoring.ts';
import { bindHost, tlsOptions, validateNetworkConfiguration, checkNetworkAccess } from '../central/network.ts';
import { requireRole } from '../central/permissions.ts';
import { amuInference } from '../inference/engine.ts';

export function createAmuApiServer(): http.Server {
  validateNetworkConfiguration();
  setBackupIdleCheck(()=>!amuCore.isBusy()&&!amuInference.status().active&&!amuInference.status().queued);
  const handler: http.RequestListener = async (req, res) => {
    const requestId = crypto.randomUUID();
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    try {
      checkNetworkAccess(req.socket.remoteAddress || '');
      const pathname = new URL(req.url || '/', 'http://localhost').pathname;
      if (req.method === 'GET' && ['/', '/index.html', '/admin'].includes(pathname)) {
        const filename = pathname === '/admin' ? 'admin.html' : 'index.html';
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(await fs.readFile(path.resolve('src/web-ui/public', filename), 'utf8')); return;
      }
      if(req.method==='GET'&&['/ready','/readyz','/v1/ready'].includes(pathname)){const state=await health();res.statusCode=state.inferenceReady?200:503;res.end(JSON.stringify(state));return;}
      if (req.method === 'GET' && pathname === '/health') { res.end(JSON.stringify(await health())); return; }
      const client = authenticate(req);
      const started=Date.now();let observed=false;const observe=()=>{if(observed)return;observed=true;if(!maintenanceStatus().operation&&!pathname.startsWith('/api/central/backups'))observeRequest(client.id,res.writableEnded?res.statusCode:499,Date.now()-started,requestId,req.method,pathname);};res.once('finish',observe);res.once('close',observe);
      checkNetworkAccess(req.socket.remoteAddress || '', client.admin);
      const maintenanceRead=!!maintenanceStatus().operation&&req.method==='GET'&&['/api/client/status','/api/central/dashboard'].includes(pathname);
      if(!pathname.startsWith('/api/central/backups')&&!maintenanceRead){const leave=enterRequest();res.once('finish',leave);res.once('close',leave);}
      if (!pathname.startsWith('/v1/') && !pathname.startsWith('/api/central/') && !pathname.startsWith('/api/core/') && pathname !== '/api/client/status') requireAdmin(client);
      let body: any = null;
      if (pathname!=='/api/central/backups/import'&&['POST', 'PUT', 'PATCH'].includes(req.method || '')) {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 1024 * 1024) throw new ApiError(413, 'Request body exceeds 1 MiB');
          chunks.push(chunk);
        }
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError(400, 'Invalid JSON'); }
      }
      if (pathname.startsWith('/api/core/')) {
        requireScope(client,'core:tasks');requireRole(client,['admin','developer']);
        if(req.method==='GET'&&/^\/api\/core\/tasks\/[a-f0-9-]+\/events$/.test(pathname)){
          const id=pathname.split('/').at(-2)!,initialHash=client.hash;
          await streamTaskEvents(res,client.id,client.maxConcurrent||1,platform.requestTimeoutMs,()=>!client.enabled||client.revokedAt||client.hash!==initialHash?401:client.admin||(client.role==='developer'&&(!client.scopes||client.scopes.includes('core:tasks')))?0:403,()=>amuCore.get(id,client.id,client.admin));return;
        }
        if(req.method==='POST'&&(pathname==='/api/core/tasks'||pathname.endsWith('/resume'))&&client.models.length&&!client.models.includes(amuInference.status().model))throw new ApiError(403,'Active model is outside this client model grant');
        const controller = new AbortController();
        const disconnect = () => { if (!res.writableEnded) controller.abort(); };
        res.on('close', disconnect);
        try {
          let result;
          if (pathname === '/api/core/tasks' && req.method === 'POST') { if(body?.background===true){result=amuCore.submit(body,client.id);res.statusCode=202;}else result = await amuCore.create(body, client.id, controller.signal); }
          else if (pathname === '/api/core/tasks' && req.method === 'GET') result = amuCore.list(client.id,client.admin);
          else if (/^\/api\/core\/tasks\/[a-f0-9-]+$/.test(pathname) && req.method === 'GET') result = amuCore.get(pathname.split('/').at(-1)!, client.id,client.admin);
          else if (/^\/api\/core\/proposals\/[a-f0-9-]+$/.test(pathname) && req.method === 'GET') result = amuCore.proposal(pathname.split('/').at(-1)!, client.id,client.admin);
          else if (/^\/api\/core\/tasks\/[a-f0-9-]+\/resume$/.test(pathname) && req.method === 'POST') { if(body?.acceptSourceChanges)requireAdmin(client);result=amuCore.resume(pathname.split('/').at(-2)!,client.id,body,client.admin);res.statusCode=202; }
          else if (/^\/api\/core\/tasks\/[a-f0-9-]+\/cancel$/.test(pathname) && req.method === 'POST') result=amuCore.cancel(pathname.split('/').at(-2)!,client.id,client.admin);
          else if (/^\/api\/core\/proposals\/[a-f0-9-]+\/apply$/.test(pathname) && req.method === 'POST') { requireAdmin(client);result = amuCore.apply(pathname.split('/').at(-2)!, client.id,body||{},client.admin); recordSystemEvent('core_change_applied', { proposalId: result.id, clientId: client.id }); }
          else throw new ApiError(404, 'Unknown AMU Core endpoint');
          res.end(JSON.stringify(result)); return;
        } finally { res.off('close', disconnect); }
      }
      if (await centralRoute(req, res, pathname, body, client)) return;
      if (pathname.startsWith('/v1/')) throw new ApiError(404, 'Unknown OpenAI endpoint');
      const result = await handleApiRequest(req.method || 'GET', pathname, body, { requestId, correlationId: requestId, apiKey: client.id });
      res.writeHead(result.statusCode); res.end(JSON.stringify(result.response));
    } catch (error) {
      if (res.destroyed) return;
      if(res.headersSent&&String(res.getHeader('Content-Type')).split(';')[0]!=='text/event-stream'){res.destroy();return;}
      if (res.headersSent) { res.end('data: {"error":{"message":"Inference stream interrupted","type":"server_error"}}\n\ndata: [DONE]\n\n'); return; }
      const status = error instanceof ApiError || error instanceof EngineError ? error.status : (error as Error).name === 'TimeoutError' ? 504 : 503;
      if(!maintenanceStatus().operation)recordSystemEvent('request_error', { requestId, status, category: (error as Error).name });
      if(status===429||status===503)res.setHeader('Retry-After',status===429?'1':'5');
      res.writeHead(status);
      res.end(JSON.stringify({ error: { message: error instanceof ApiError || (error instanceof EngineError && error.status < 500) ? error.message : 'Local inference or service unavailable', type: status < 500 ? 'invalid_request_error' : 'server_error', code: String(status), reason: ({400:'invalid_request',401:'authentication_failed',403:'permission_denied',404:'not_found',409:'state_conflict',429:'resource_limit',499:'cancelled',503:'service_unavailable',504:'deadline_exceeded',507:'insufficient_memory'} as Record<number,string>)[status]||'request_failed' }, requestId }));
    }
  };
  const tls = tlsOptions();
  const server = tls ? https.createServer(tls, handler) : http.createServer(handler);
  server.maxConnections=platform.maxHttpRequests*4;
  server.requestTimeout = 120000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  return server;
}
export function startServer(port = Number(process.env.PORT) || 3030): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = createAmuApiServer();
    server.once('error', reject);
    server.listen(port, bindHost, () => { console.log(`AMU API listening on ${JSON.stringify(server.address())}`); resolve(server); });
  });
}
