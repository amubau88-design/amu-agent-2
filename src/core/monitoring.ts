import fs from 'node:fs';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
const directory = path.resolve(process.env.AMU_CORE_STATE_DIR || 'scratch/core');
fs.mkdirSync(directory, { recursive: true });
const delay = monitorEventLoopDelay({ resolution: 20 }); delay.enable();
let errors = 0;
let rejectedRequests = 0;
let lastCpu = process.cpuUsage(); let lastTime = process.hrtime.bigint();
export function recordSystemEvent(kind: string, details: Record<string, unknown> = {}) {
  if (kind === 'request_error' && typeof details.status === 'number' && details.status < 500) rejectedRequests++;
  else if (kind.includes('error') || kind.includes('failure')) errors++;
  try {
    const file = path.join(directory, 'system.ndjson');
    if (fs.existsSync(file) && fs.statSync(file).size > 1024 * 1024) fs.renameSync(file, file + '.previous');
    fs.appendFileSync(file, JSON.stringify({ timestamp: new Date().toISOString(), kind, ...details }) + '\n');
  } catch { console.error('AMU system journal unavailable'); }
}
export function monitoringStatus() {
  const cpu = process.cpuUsage(lastCpu); const now = process.hrtime.bigint();
  const cpuPercent = ((cpu.user + cpu.system) / (Number(now - lastTime) / 1000)) * 100;
  lastCpu = process.cpuUsage(); lastTime = now;
  return { pid: process.pid, uptimeSeconds: process.uptime(), memory: process.memoryUsage(), cpuPercent: Math.round(cpuPercent * 10) / 10, eventLoopDelayMs: { mean: Number.isFinite(delay.mean) ? delay.mean / 1e6 : 0, max: delay.max / 1e6 }, errorCount: errors, rejectedRequests };
}
export function stopMonitoring() { delay.disable(); }
export function readSystemEvents() { const file=path.join(directory,'system.ndjson');if(!fs.existsSync(file))return[];return fs.readFileSync(file,'utf8').trim().split('\n').slice(-100).flatMap(line=>{try{return[JSON.parse(line)];}catch{return[];}}); }
