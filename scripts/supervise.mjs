// AMU-owned watchdog. It manages only this project's direct API child.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const role=process.env.AMU_SUPERVISOR_ROLE||'gateway';if(!['gateway','remote-worker'].includes(role))throw Error('Invalid supervisor role');
const workerConfiguration=role==='remote-worker'?JSON.parse(fs.readFileSync(path.resolve(process.env.AMU_REMOTE_STATE_DIR||path.join(root,'scratch/secrets/remote-node'),'node.json'),'utf8')):undefined;
const state=path.resolve(process.env.AMU_SUPERVISOR_STATE_DIR||path.join(root,role==='remote-worker'?'scratch/remote-worker-supervisor':'scratch'));fs.mkdirSync(state,{recursive:true});
const pidFile=path.join(state,'central-supervisor.pid'),lockFile=path.join(state,'central-supervisor.lock'),statusFile=path.join(state,'supervisor-status.json');
function alive(pid){try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}}
if(fs.existsSync(pidFile)){const pid=Number(fs.readFileSync(pidFile,'utf8'));if(Number.isInteger(pid)&&pid>0&&alive(pid))throw Error('AMU supervisor already running; no process replaced');}
const token=crypto.randomUUID();let locked=false;
const bindHost=workerConfiguration?.host||process.env.AMU_BIND_HOST||'127.0.0.1';const probeHost=bindHost==='0.0.0.0'?'127.0.0.1':bindHost==='::'?'::1':bindHost;const port=workerConfiguration?.port||Number(process.env.PORT)||3030;
await new Promise((resolve,reject)=>{const socket=net.createConnection({host:probeHost,port});socket.setTimeout(1500);socket.once('connect',()=>{socket.destroy();reject(Error('AMU API port is already in use; no existing service stopped'));});socket.once('error',e=>{socket.destroy();if(e.code==='ECONNREFUSED')resolve();else reject(e);});socket.once('timeout',()=>{socket.destroy();reject(Error('AMU port availability could not be established'));});});
for(let attempt=0;attempt<2;attempt++){
 try{const fd=fs.openSync(lockFile,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,root,role,token,startedAt:new Date().toISOString()}));fs.closeSync(fd);locked=true;break;}
 catch(e){if(e.code!=='EEXIST')throw e;const previous=JSON.parse(fs.readFileSync(lockFile,'utf8'));if(previous.root!==root||!Number.isInteger(previous.pid)||alive(previous.pid))throw Error('AMU startup lock belongs to a running or unknown process');fs.unlinkSync(lockFile);}
}
if(!locked)throw Error('AMU startup lock could not be acquired');
fs.writeFileSync(pidFile,String(process.pid));
let child,stopping=false,heartbeat=Date.now(),failures=[],restartTimer,killTimer,plannedRestart=false,nonRestartable=false,mode='starting';
let snapshotWarning=false;
function snapshot(attempt=0){const data={supervisorPid:process.pid,role,apiPid:child?.pid||null,mode,restartsInWindow:failures.length,heartbeatAt:new Date(heartbeat).toISOString(),updatedAt:new Date().toISOString(),root};try{fs.writeFileSync(statusFile+'.tmp',JSON.stringify(data,null,2));fs.renameSync(statusFile+'.tmp',statusFile);snapshotWarning=false;}catch(error){if(attempt<3)setTimeout(()=>snapshot(attempt+1),100).unref();else if(!snapshotWarning){snapshotWarning=true;console.error('AMU operating-status snapshot unavailable:',error.code);}}}
function journal(kind,details={}){const file=path.join(state,'supervisor.ndjson');if(fs.existsSync(file)&&fs.statSync(file).size>1048576)fs.renameSync(file,file+'.previous');try{fs.appendFileSync(file,JSON.stringify({time:new Date().toISOString(),kind,...details})+'\n');}catch(error){console.error('AMU supervisor journal unavailable:',error.code);}snapshot();if(process.connected)process.send?.({type:kind,...details});}
function launch(){
 if(fs.existsSync(path.join(root,'scratch/manual-rollback.lock'))){journal('manual_rollback_requires_recovery');finish(1);return;}
 heartbeat=Date.now();mode='starting';
 const args=role==='remote-worker'?['--experimental-strip-types','scripts/remote-worker.mjs','start']:['--experimental-strip-types','src/index.ts'];
 const instance=spawn(process.execPath,args,{cwd:root,windowsHide:true,stdio:['ignore','inherit','inherit','ipc'],env:{...process.env,AMU_SUPERVISED:'true'}});child=instance;journal('child_started',{pid:instance.pid,role});
 instance.on('message',message=>{
  if(instance!==child)return;
  if(message?.type==='heartbeat'){heartbeat=Date.now();if(!plannedRestart&&!stopping)mode='running';snapshot();}
  if(message?.type==='startup_error'&&['EADDRINUSE','EACCES','EADDRNOTAVAIL'].includes(message.code)){nonRestartable=true;journal('port_or_bind_conflict',{code:message.code});}
  if(message?.type==='control'&&message.action==='restart'&&!plannedRestart){plannedRestart=true;mode='restarting';journal('restart_requested');instance.send({type:'shutdown'});killTimer=setTimeout(()=>{if(instance.exitCode===null&&instance.signalCode===null)instance.kill('SIGKILL');},8000);}
 });
 instance.once('error',error=>{journal('spawn_error',{code:error.code});if(!instance.pid)finish(1);});
 instance.once('exit',(code,signal)=>{
  clearTimeout(killTimer);journal('child_exited',{code,signal});
  if(stopping){finish();return;}
  if(nonRestartable){mode='failed';finish(1);return;}
  if(plannedRestart){plannedRestart=false;mode='restarting';restartTimer=setTimeout(launch,250);return;}
  const now=Date.now();failures=failures.filter(t=>now-t<300000);failures.push(now);
  if(failures.length>5){mode='failed';journal('restart_budget_exhausted');finish(1);return;}
  mode='recovering';const delay=Math.min(30000,1000*2**(failures.length-1));journal('restart_scheduled',{delayMs:delay});restartTimer=setTimeout(launch,delay);
 });
}
const watchdog=setInterval(()=>{if(!stopping&&child&&child.exitCode===null&&child.signalCode===null&&Date.now()-heartbeat>30000){journal('heartbeat_timeout');heartbeat=Date.now();child.kill('SIGTERM');const target=child;killTimer=setTimeout(()=>{if(target.exitCode===null&&target.signalCode===null)target.kill('SIGKILL');},5000);}},5000);watchdog.unref();
function cleanup(){try{if(JSON.parse(fs.readFileSync(lockFile,'utf8')).token===token)fs.unlinkSync(lockFile);}catch{}try{if(fs.readFileSync(pidFile,'utf8').trim()===String(process.pid))fs.unlinkSync(pidFile);}catch{}}
function finish(code=0){clearInterval(watchdog);clearTimeout(restartTimer);clearTimeout(killTimer);mode=code?'failed':'stopped';snapshot();cleanup();process.exit(code);}
function stop(){if(stopping)return;stopping=true;mode='stopping';clearTimeout(restartTimer);if(child?.exitCode===null&&child.signalCode===null){child.send({type:'shutdown'});const target=child;killTimer=setTimeout(()=>target.kill('SIGKILL'),8000);}else finish();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);process.on('message',m=>{if(m?.type==='stop')stop();});if(process.connected)process.on('disconnect',stop);process.on('exit',cleanup);
launch();
