import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import type http from 'node:http';
import { amuInference } from '../inference/engine.ts';
import { listLocalModels, EngineError } from '../inference/models.ts';
import { monitoringStatus } from '../core/monitoring.ts';
import { networkStatus } from './network.ts';

const directory = path.resolve(process.env.AMU_CENTRAL_STATE_DIR || 'scratch/secrets');
fs.mkdirSync(directory, { recursive: true });
const file = path.join(directory, 'central-access.json');
export type Client = { id: string; name: string; hash: string; admin: boolean; enabled: boolean; models: string[]; rpm: number; maxTokens?: number; maxConcurrent?: number };
type Config = { provider?: 'embedded' | 'local-http'; upstream: string; model: string; clients: Client[] };
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
  fs.writeFileSync(file + '.tmp', JSON.stringify(config, null, 2), { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
}
export class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
const counters = new Map<string, { minute: number; count: number }>();
export function authenticate(req: http.IncomingMessage): Client {
  const authorization = req.headers.authorization;
  const key = authorization?.startsWith('Bearer ') ? authorization.slice(7) : req.headers['x-amu-api-key'];
  if (typeof key !== 'string' || key.length > 512) throw new ApiError(401, 'API key required');
  const digest = hash(key);
  const client = config.clients.find(c => c.enabled && c.hash.length === digest.length && crypto.timingSafeEqual(Buffer.from(c.hash), Buffer.from(digest)));
  if (!client) throw new ApiError(401, 'Invalid API key');
  const minute = Math.floor(Date.now() / 60000);
  const count = counters.get(client.id);
  if (!count || count.minute !== minute) counters.set(client.id, { minute, count: 1 });
  else if (++count.count > client.rpm) throw new ApiError(429, 'Client rate limit exceeded');
  return client;
}
export function requireAdmin(client: Client) { if (!client.admin) throw new ApiError(403, 'Administrator permission required'); }
let active = 0;
const limit = 2;
const queue: Array<() => void> = [];
async function acquire(signal: AbortSignal) {
  if (active < limit) { active++; return; }
  if (queue.length >= 16) throw new ApiError(429, 'Inference queue full');
  await new Promise<void>((resolve, reject) => {
    const grant = () => { signal.removeEventListener('abort', cancel); resolve(); };
    const cancel = () => { const i = queue.indexOf(grant); if (i >= 0) queue.splice(i, 1); reject(signal.reason); };
    queue.push(grant);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
  });
}
function release() { const next = queue.shift(); if (next) next(); else active--; }
const events: object[] = [];
const clientActive = new Map<string, number>();
const clientControllers = new Map<string, Set<AbortController>>();
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
  if ((config.provider || 'embedded') === 'embedded') { const engine = amuInference.status(); return { status: engine.ready ? 'ready' : 'degraded', inferenceReady: engine.ready, active, queued: queue.length, engine }; }
  try { const r = await upstream('/models'); return { status: r.ok ? 'ready' : 'degraded', inferenceReady: r.ok, active, queued: queue.length }; }
  catch { return { status: 'degraded', inferenceReady: false, active, queued: queue.length }; }
}
export async function centralRoute(req: http.IncomingMessage, res: http.ServerResponse, pathname: string, body: any, client: Client): Promise<boolean> {
  if (pathname.startsWith('/api/central/')) {
    requireAdmin(client);
    if (pathname === '/api/central/monitoring' && req.method === 'GET') { res.end(JSON.stringify({ process: monitoringStatus(), engine: amuInference.status(), network: networkStatus() })); return true; }
    if (pathname === '/api/central/status' && req.method === 'GET') {
      res.end(JSON.stringify({ ...await health(), connection: { provider: config.provider || 'embedded', upstream: config.upstream, model: config.model }, clients: config.clients.map(({ hash: _, ...c }) => c), resources: { memory: process.memoryUsage(), freeMemory: os.freemem(), totalMemory: os.totalmem(), cpus: os.cpus().length, cpuUsage: process.cpuUsage(), uptime: process.uptime() }, events }));
    } else if (pathname === '/api/central/clients' && req.method === 'POST') {
      if (typeof body?.name !== 'string' || !body.name.trim() || body.name.length > 100 || (body.models !== undefined && (!Array.isArray(body.models) || body.models.some((m: unknown) => typeof m !== 'string')))) throw new ApiError(400, 'Invalid client');
      if (body.rpm !== undefined && (!Number.isInteger(body.rpm) || body.rpm < 1 || body.rpm > 600)) throw new ApiError(400, 'Invalid rate limit');
      if (body.maxTokens !== undefined && (!Number.isInteger(body.maxTokens) || body.maxTokens < 1 || body.maxTokens > 2048)) throw new ApiError(400, 'Invalid token limit');
      if (body.maxConcurrent !== undefined && (!Number.isInteger(body.maxConcurrent) || body.maxConcurrent < 1 || body.maxConcurrent > 2)) throw new ApiError(400, 'Invalid concurrency limit');
      if (config.clients.length >= 1000) throw new ApiError(409, 'Client limit reached');
      const key = crypto.randomBytes(32).toString('base64url');
      const entry: Client = { id: crypto.randomUUID(), name: body.name, hash: hash(key), admin: false, enabled: true, models: body.models || [], rpm: body.rpm || 60, maxTokens: body.maxTokens || 512, maxConcurrent: body.maxConcurrent || 1 };
      config.clients.push(entry); save(); record({ action: 'client_created', id: entry.id });
      res.end(JSON.stringify({ id: entry.id, key }));
    } else if (pathname === '/api/central/revoke' && req.method === 'POST') {
      const entry = config.clients.find(c => c.id === body?.id && !c.admin);
      if (!entry) throw new ApiError(404, 'Client not found');
      entry.enabled = false; save(); record({ action: 'client_revoked', id: entry.id }); res.end('{"ok":true}');
      for (const controller of clientControllers.get(entry.id) || []) controller.abort(new ApiError(401, 'Client access revoked'));
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
      const key = crypto.randomBytes(32).toString('base64url'); entry.hash = hash(key); save(); record({ action: 'client_key_rotated', id: entry.id }); res.end(JSON.stringify({ id: entry.id, key }));
    } else if (pathname === '/api/central/clients/update' && req.method === 'POST') {
      const entry = config.clients.find(c => c.id === body?.id && !c.admin);
      if (!entry) throw new ApiError(404, 'Client not found');
      if (!Array.isArray(body.models) || body.models.some((m: unknown) => typeof m !== 'string') || !Number.isInteger(body.rpm) || body.rpm < 1 || body.rpm > 600 || !Number.isInteger(body.maxTokens) || body.maxTokens < 1 || body.maxTokens > 2048 || !Number.isInteger(body.maxConcurrent) || body.maxConcurrent < 1 || body.maxConcurrent > 2) throw new ApiError(400, 'Invalid client limits');
      entry.models = body.models; entry.rpm = body.rpm; entry.maxTokens = body.maxTokens; entry.maxConcurrent = body.maxConcurrent; save(); record({ action: 'client_limits_updated', id: entry.id }); res.end('{"ok":true}');
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
  if (body?.max_completion_tokens !== undefined) { if (body.max_tokens !== undefined) throw new ApiError(400, 'Specify only one output token limit'); body.max_tokens = body.max_completion_tokens; }
  if (!body || !Array.isArray(body.messages) || !body.messages.length || body.messages.some((m: any) => !m || !['system','user','assistant'].includes(m.role) || typeof m.content !== 'string')) throw new ApiError(400, 'messages must contain role/content strings');
  const model = !body.model || body.model === 'amu-agent-2-default' ? config.model : body.model;
  if (typeof model !== 'string' || !model) throw new ApiError(400, 'Specify an installed model');
  if (client.models.length && !client.models.includes(model)) throw new ApiError(403, 'Model access denied');
  if (body.stream !== undefined && typeof body.stream !== 'boolean') throw new ApiError(400, 'stream must be boolean');
  if (body.temperature !== undefined && (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 2)) throw new ApiError(400, 'Invalid temperature');
  if (body.max_tokens !== undefined && (!Number.isInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > 32768)) throw new ApiError(400, 'Invalid max_tokens');
  if (['tools','tool_choice','functions','response_format'].some(k => body[k] !== undefined)) throw new ApiError(400, 'This endpoint supports text only; use the AMU Core task API for tools');
  if ((body.max_tokens || 256) > (client.maxTokens || (client.admin ? 2048 : 512))) throw new ApiError(400, 'Client output token limit exceeded');
  if ((clientActive.get(client.id) || 0) >= (client.maxConcurrent || (client.admin ? 2 : 1))) throw new ApiError(429, 'Client concurrent request limit exceeded');
  clientActive.set(client.id, (clientActive.get(client.id) || 0) + 1);
  const controller = new AbortController();
  const controllers = clientControllers.get(client.id) || new Set<AbortController>(); controllers.add(controller); clientControllers.set(client.id, controllers);
  const timer = setTimeout(() => controller.abort(new DOMException('Inference deadline exceeded', 'TimeoutError')), 120000);
  const disconnect = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', disconnect);
  let acquired = false;
  try {
    await acquire(controller.signal); acquired = true;
    if (!client.enabled) throw new ApiError(401, 'Client access revoked');
    if ((config.provider || 'embedded') === 'embedded') {
      const id = 'chatcmpl-' + crypto.randomUUID(); const created = Math.floor(Date.now() / 1000);
      const chunk = (delta: object, finish_reason: string | null = null) => {
        if (!res.headersSent) { res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' }); res.flushHeaders(); }
        res.write('data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta, finish_reason }] }) + '\n\n');
        if (res.writableLength > 1048576) controller.abort(new EngineError(429, 'Streaming consumer is too slow'));
      };
      let first = true;
      const result = await amuInference.generate({ model, messages: body.messages, maxTokens: body.max_tokens || 256, temperature: body.temperature, signal: controller.signal, onChunk: body.stream ? (text) => { if (first) { chunk({ role: 'assistant', content: '' }); first = false; } chunk({ content: text }); } : undefined });
      if (body.stream) { chunk({}, result.finishReason); res.end('data: [DONE]\n\n'); }
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
    } else res.end(JSON.stringify(await response.json()));
    record({ action: 'completion', client: client.id, model, stream: !!body.stream });
  } catch (error) { record({ action: 'completion_failed', client: client.id, model }); throw error; } finally { controllers.delete(controller); if (!controllers.size) clientControllers.delete(client.id); clientActive.set(client.id, Math.max(0, (clientActive.get(client.id) || 1) - 1)); clearTimeout(timer); res.off('close', disconnect); if (acquired) release(); }
  return true;
}
