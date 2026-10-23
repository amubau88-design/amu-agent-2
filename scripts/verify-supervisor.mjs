import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
const state=fs.mkdtempSync('scratch/supervisor-verification-');
const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const supervisor=spawn(process.execPath,['scripts/supervise.mjs'],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,PORT:String(port),AMU_CENTRAL_STATE_DIR:state+'/access',AMU_CORE_STATE_DIR:state+'/core',AMU_SUPERVISOR_STATE_DIR:state,AMU_PID_FILE:state+'/server.pid'}});
const started=[];let diagnostic='';supervisor.stdout.on('data',c=>diagnostic+=c);supervisor.stderr.on('data',c=>diagnostic+=c);supervisor.on('message',m=>{if(m.type==='child_started')started.push(m.pid)});
async function until(check,timeout=30000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await check())return;await new Promise(r=>setTimeout(r,250));}throw Error('Supervisor verification deadline: '+diagnostic)}
try{
 await until(async()=>{try{return(await(await fetch(`http://127.0.0.1:${port}/health`)).json()).inferenceReady}catch{return false}});
 const first=started[0];assert.ok(first);process.kill(first,'SIGTERM');
 await until(()=>started.length===2);
 assert.notEqual(started[1],first);
 await until(async()=>{try{return(await(await fetch(`http://127.0.0.1:${port}/health`)).json()).inferenceReady}catch{return false}});
 console.log(JSON.stringify({passed:true,checks:['AMU supervisor startup','automatic API restart after controlled child termination','embedded model reload and readiness recovery'],children:started}));
}finally{
 supervisor.send({type:'stop'});
 await new Promise(r=>{if(supervisor.exitCode!==null)r();else supervisor.once('exit',r)});
 fs.writeFileSync(state+'/output.log',diagnostic);
}
