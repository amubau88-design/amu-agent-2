import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import type http from 'node:http';

const directory = path.resolve(process.env.AMU_CENTRAL_STATE_DIR || 'scratch/secrets');
fs.mkdirSync(directory, { recursive: true });
const file = path.join(directory, 'central-access.json');
type Client = { id: string; name: string; hash: string; admin: boolean; enabled: boolean; models: string[]; rpm: number };
type Config = { upstream: string; model: string; clients: Client[] };
const hash = (key: string) => crypto.createHash('sha256').update(key).digest('hex');
let config: Config;
if (fs.existsSync(file)) config = JSON.parse(fs.readFileSync(file, 'utf8'));
else {
  const key = crypto.randomBytes(32).toString('base64url');
  config = { upstream: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:1.5b', clients: [{ id: crypto.randomUUID(), name: 'Administrator', hash: hash(key), admin: true, enabled: true, models: [], rpm: 120 }] };
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
export async function health() {
  try { const r = await upstream('/models'); return { status: r.ok ? 'ready' : 'degraded', inferenceReady: r.ok, active, queued: queue.length }; }
  catch { return { status: 'degraded', inferenceReady: false, active, queued: queue.length }; }
}
export async function centralRoute(req: http.IncomingMessage, res: http.ServerResponse, pathname: string, body: any, client: Client): Promise<boolean> {
  if (pathname.startsWith('/api/central/')) {
    requireAdmin(client);
    if (pathname === '/api/central/status' && req.method === 'GET') {
      res.end(JSON.stringify({ ...await health(), connection: { upstream: config.upstream, model: config.model }, clients: config.clients.map(({ hash: _, ...c }) => c), resources: { memory: process.memoryUsage(), freeMemory: os.freemem(), totalMemory: os.totalmem(), cpus: os.cpus().length, cpuUsage: process.cpuUsage(), uptime: process.uptime() }, events }));
    } else if (pathname === '/api/central/clients' && req.method === 'POST') {
      if (typeof body?.name !== 'string' || !body.name.trim() || body.name.length > 100 || (body.models !== undefined && (!Array.isArray(body.models) || body.models.some((m: unknown) => typeof m !== 'string')))) throw new ApiError(400, 'Invalid client');
      if (config.clients.length >= 1000) throw new ApiError(409, 'Client limit reached');
      const key = crypto.randomBytes(32).toString('base64url');
      const entry: Client = { id: crypto.randomUUID(), name: body.name, hash: hash(key), admin: false, enabled: true, models: body.models || [], rpm: 60 };
      config.clients.push(entry); save(); record({ action: 'client_created', id: entry.id });
      res.end(JSON.stringify({ id: entry.id, key }));
    } else if (pathname === '/api/central/revoke' && req.method === 'POST') {
      const entry = config.clients.find(c => c.id === body?.id && !c.admin);
      if (!entry) throw new ApiError(404, 'Client not found');
      entry.enabled = false; save(); record({ action: 'client_revoked', id: entry.id }); res.end('{"ok":true}');
    } else if (pathname === '/api/central/connection' && req.method === 'POST') {
      let u: URL; try { u = new URL(body?.upstream); } catch { throw new ApiError(400, 'Invalid upstream URL'); }
      if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || u.username || u.password || u.search || u.hash || !u.pathname.endsWith('/v1')) throw new ApiError(400, 'Only a local HTTP /v1 inference endpoint is permitted');
      if (typeof body.model !== 'string' || body.model.length > 200) throw new ApiError(400, 'Invalid default model');
      config.upstream = u.href.replace(/\/$/, ''); config.model = body.model; save(); record({ action: 'connection_updated' }); res.end('{"ok":true}');
    } else throw new ApiError(404, 'Unknown management endpoint');
    return true;
  }
  if (pathname === '/v1/models' && req.method === 'GET') {
    const response = await upstream('/models');
    if (!response.ok) throw new ApiError(503, 'Local inference unavailable');
    const data = await response.json() as any;
    if (client.models.length) data.data = data.data.filter((m: any) => client.models.includes(m.id));
    res.end(JSON.stringify(data)); return true;
  }
  if (pathname !== '/v1/chat/completions' || req.method !== 'POST') return false;
  if (!body || !Array.isArray(body.messages) || !body.messages.length || body.messages.some((m: any) => !m || !['system','user','assistant'].includes(m.role) || typeof m.content !== 'string')) throw new ApiError(400, 'messages must contain role/content strings');
  const model = body.model || config.model;
  if (typeof model !== 'string' || !model) throw new ApiError(400, 'Specify an installed model');
  if (client.models.length && !client.models.includes(model)) throw new ApiError(403, 'Model access denied');
  if (body.stream !== undefined && typeof body.stream !== 'boolean') throw new ApiError(400, 'stream must be boolean');
  if (body.temperature !== undefined && (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 2)) throw new ApiError(400, 'Invalid temperature');
  if (body.max_tokens !== undefined && (!Number.isInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > 32768)) throw new ApiError(400, 'Invalid max_tokens');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Inference deadline exceeded', 'TimeoutError')), 120000);
  const disconnect = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', disconnect);
  let acquired = false;
  try {
    await acquire(controller.signal); acquired = true;
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
  } catch (error) { record({ action: 'completion_failed', client: client.id, model }); throw error; } finally { clearTimeout(timer); res.off('close', disconnect); if (acquired) release(); }
  return true;
}


