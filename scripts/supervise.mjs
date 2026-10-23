// AMU-owned watchdog: supervises this project's API process only.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const state = path.resolve(process.env.AMU_SUPERVISOR_STATE_DIR || path.join(root, 'scratch')); fs.mkdirSync(state, { recursive: true });
const pidFile = path.join(state, 'central-supervisor.pid');
if (fs.existsSync(pidFile)) {
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  if (Number.isInteger(pid) && pid > 0) {
    try { process.kill(pid, 0); throw new Error(`AMU supervisor already running, pid ${pid}`); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
}
fs.writeFileSync(pidFile, String(process.pid));
let child; let stopping = false; let heartbeat = Date.now(); let failures = []; let restartTimer; let killTimer;
function journal(kind, details = {}) { const file=path.join(state,'supervisor.ndjson'); if(fs.existsSync(file)&&fs.statSync(file).size>1048576)fs.renameSync(file,file+'.previous'); fs.appendFileSync(file, JSON.stringify({ time: new Date().toISOString(), kind, ...details }) + '\n'); if(process.connected)process.send?.({type:kind,...details}); }
function launch() {
  heartbeat = Date.now();
  child = spawn(process.execPath, ['--experimental-strip-types', 'src/index.ts'], { cwd: root, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], env: { ...process.env, AMU_SUPERVISED: 'true' } });
  journal('child_started', { pid: child.pid });
  child.on('message', message => { if (message?.type === 'heartbeat') heartbeat = Date.now(); });
  child.once('error', error => { journal('spawn_error', { code: error.code }); if (!child.pid) finish(1); });
  child.once('exit', (code, signal) => {
    clearTimeout(killTimer); journal('child_exited', { code, signal });
    if (stopping) { finish(); return; }
    const now = Date.now(); failures = failures.filter(t => now - t < 300000); failures.push(now);
    if (failures.length > 5) { journal('restart_budget_exhausted'); finish(1); return; }
    const delay = Math.min(30000, 1000 * 2 ** (failures.length - 1));
    restartTimer = setTimeout(launch, delay);
  });
}
const watchdog = setInterval(() => {
  if (!stopping && child && child.exitCode === null && child.signalCode === null && Date.now() - heartbeat > 30000) {
    journal('heartbeat_timeout'); heartbeat = Date.now(); child.kill('SIGTERM');
    killTimer = setTimeout(() => { if (child?.exitCode === null) child.kill('SIGKILL'); }, 5000);
  }
}, 5000); watchdog.unref();
function finish(code = 0) { clearInterval(watchdog); clearTimeout(restartTimer); clearTimeout(killTimer); try { fs.unlinkSync(pidFile); } catch {} process.exit(code); }
function stop() { if (stopping) return; stopping = true; clearTimeout(restartTimer); if (child?.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); killTimer = setTimeout(() => child.kill('SIGKILL'), 5000); } else finish(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
process.on('message', message => { if (message?.type === 'stop') stop(); });
if (process.connected) process.on('disconnect', stop);
launch();
