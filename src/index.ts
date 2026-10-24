import { startServer } from './amu-api/server.ts';
import { initializeCentral,stopAdmissionMonitoring } from './central/service.ts';
import { amuInference } from './inference/engine.ts';
import { recordSystemEvent, monitoringStatus, stopMonitoring } from './core/monitoring.ts';
import fs from 'node:fs';
import { recoverInterruptedTasks } from './core/controller.ts';
import {closeIdentityJournal} from './central/idempotency.ts';
import {amuCore} from './core/controller.ts';
import {startBackupScheduler,stopBackupScheduler} from './backup/scheduler.ts';

const port = Number(process.env.PORT) || 3030;
const server = await startServer(port).catch(error => { if(process.connected)process.send?.({type:'startup_error',code:error.code||'STARTUP_FAILED'});throw error; });
recoverInterruptedTasks();
startBackupScheduler(()=>!amuCore.isBusy()&&!amuInference.status().active&&!amuInference.status().queued);
const pidFile = process.env.AMU_PID_FILE || 'scratch/central-server.pid';
fs.writeFileSync(pidFile, String(process.pid));
recordSystemEvent('server_started', { port, pid: process.pid });
void initializeCentral().then(() => recordSystemEvent('engine_ready', { backend: 'embedded' })).catch(error => recordSystemEvent('engine_load_error', { category: error.name }));
const heartbeat = setInterval(() => {
  if (process.connected) process.send?.({ type: 'heartbeat', engine: amuInference.status(), process: monitoringStatus() });
}, 5000); heartbeat.unref();
let stopping = false;
async function shutdown(code: number) {
  if (stopping) return; stopping = true;
  clearInterval(heartbeat); recordSystemEvent('server_stopping', { code });
  stopBackupScheduler();stopAdmissionMonitoring();
  const force = setTimeout(() => process.exit(code), 8000); force.unref();
  server.close(); server.closeAllConnections();
  await amuInference.close(); closeIdentityJournal(); stopMonitoring();
  try { if (fs.readFileSync(pidFile, 'utf8').trim() === String(process.pid)) fs.unlinkSync(pidFile); } catch {}
  process.exit(code);
}
process.on('SIGINT', () => { void shutdown(0); });
process.on('SIGTERM', () => { void shutdown(0); });
if (process.env.AMU_SUPERVISED === 'true') process.on('disconnect', () => { void shutdown(0); });
if (process.env.AMU_SUPERVISED === 'true') process.on('message', (message:any) => { if(message?.type==='shutdown')void shutdown(0); });
process.on('uncaughtException', error => { recordSystemEvent('uncaught_error', { category: error.name }); void shutdown(1); });
process.on('unhandledRejection', error => { recordSystemEvent('unhandled_error', { category: error instanceof Error ? error.name : 'unknown' }); void shutdown(1); });
