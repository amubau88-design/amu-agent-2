// Explicit, bounded test session only. Installs nothing and creates no autostart entry.
import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import path from 'node:path';
/** Poll authenticated health only. Never submits or replays a job. */
export async function waitForRunnerHealth(probe,{timeoutMs=15000,intervalMs=500,signal}={}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000||!Number.isInteger(intervalMs)||intervalMs<1||intervalMs>timeoutMs)throw Error('Invalid bounded runner readiness policy');
 const controller=new AbortController(),combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal,timer=setTimeout(()=>controller.abort(Error('Authenticated runner readiness deadline exceeded; no job submitted')),timeoutMs);let onAbort;
 const aborted=new Promise((_,reject)=>{onAbort=()=>reject(combined.reason);combined.addEventListener('abort',onAbort,{once:true});});
 try{while(true){combined.throwIfAborted();try{return await Promise.race([probe(combined),aborted]);}catch(error){combined.throwIfAborted();}await Promise.race([new Promise(resolve=>setTimeout(resolve,intervalMs)),aborted]);}}
 finally{clearTimeout(timer);combined.removeEventListener('abort',onAbort);}
}
export function runnerSessionScript(minutes){if(!Number.isInteger(minutes)||minutes<1||minutes>60)throw Error('Runner session must be bounded to 1–60 minutes');return `set -eu
export XDG_RUNTIME_DIR=/run/user/1000
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus
unit=amu-runner27.service
if systemctl --user is-active --quiet "$unit"; then printf 'Existing runner service retained; refuse competing session\\n'; exit 1; fi
cleanup(){ systemctl --user stop "$unit"; }
trap cleanup EXIT
systemctl --user start "$unit"
systemctl --user is-active --quiet "$unit"
printf 'AMU bounded runner session active; no central execution approval granted here\\n'
read -r -t ${minutes*60} stop_request || true
`;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.platform!=='win32'||process.argv[2]!=='--approved-test')throw Error('Explicit --approved-test required on the existing Windows/WSL installation');
 const minutes=Number(process.argv[3]||30),script=runnerSessionScript(minutes),child=spawn('C:/Windows/System32/wsl.exe',['-d','AMU-Runner','-u','amu-runner','--exec','/bin/bash','-c',script],{windowsHide:true,stdio:['pipe','inherit','inherit']});
 let closing=false,checking=false,failures=0,ready=false;const lifecycle=new AbortController();const stop=()=>{closing=true;if(!child.stdin.destroyed)child.stdin.end('stop\n');};child.stdin.on('error',()=>{closing=true;});process.on('SIGINT',stop);process.on('SIGTERM',stop);const timer=setTimeout(stop,(minutes*60+10)*1000);
 waitForRunnerHealth(async()=>{const {probeRemoteRunner}=await import('../src/core/remote-runner.ts');return probeRemoteRunner();},{signal:lifecycle.signal}).then(()=>{if(!closing){ready=true;console.log('Authenticated runner ready; execution approval remains separate');}}).catch(()=>{if(!closing){console.error('Runner readiness failed; no job submitted');stop();}});
 const health=setInterval(async()=>{if(closing||checking||!ready)return;checking=true;try{const {probeRemoteRunner}=await import('../src/core/remote-runner.ts');await probeRemoteRunner();if(failures)console.log('Authenticated runner connection recovered; no job replay');failures=0;}catch{failures++;console.error('Authenticated runner health check unavailable ('+failures+'/3)');if(failures>=3)stop();}finally{checking=false;}},10000);
 child.once('error',()=>{clearTimeout(timer);clearInterval(health);console.error('Bounded WSL session failed; central execution must remain blocked');process.exitCode=1;});child.once('exit',code=>{closing=true;lifecycle.abort();clearTimeout(timer);clearInterval(health);process.exitCode=code||0;});
}
