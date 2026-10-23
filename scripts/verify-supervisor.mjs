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
 const duplicate=spawn(process.execPath,['scripts/supervise.mjs'],{windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...process.env,PORT:String(port),AMU_SUPERVISOR_STATE_DIR:state}});let duplicateError='';duplicate.stderr.on('data',c=>duplicateError+=c);const duplicateExit=await new Promise(r=>duplicate.once('exit',r));assert.equal(duplicateExit,1);assert.match(duplicateError,/already running/);
 const first=started[0];assert.ok(first);process.kill(first,'SIGTERM');
 await until(()=>started.length===2);
 assert.notEqual(started[1],first);
 await until(async()=>{try{return(await(await fetch(`http://127.0.0.1:${port}/health`)).json()).inferenceReady}catch{return false}});
 const key=fs.readFileSync(state+'/access/central-admin-key.txt','utf8').trim();
 const restart=await fetch(`http://127.0.0.1:${port}/api/central/server/restart`,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:'{}'});assert.equal(restart.status,202);
 await until(()=>started.length===3);await until(async()=>{try{return(await(await fetch(`http://127.0.0.1:${port}/health`)).json()).inferenceReady}catch{return false}});
 assert.equal(JSON.parse(fs.readFileSync(state+'/supervisor-status.json','utf8')).restartsInWindow,1);
 console.log(JSON.stringify({passed:true,checks:['AMU supervisor startup','automatic API restart after controlled child termination','embedded model reload and readiness recovery','duplicate instance denied','authorized planned restart does not consume failure budget'],children:started}));
}finally{
 supervisor.send({type:'stop'});
 await new Promise(r=>{if(supervisor.exitCode!==null)r();else supervisor.once('exit',r)});
 fs.writeFileSync(state+'/output.log',diagnostic);
}
