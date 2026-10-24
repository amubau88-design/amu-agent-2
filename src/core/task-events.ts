import type {ServerResponse} from 'node:http';
import type {CoreTask} from './controller.ts';
import {EngineError} from '../inference/models.ts';
const streams=new Map<string,number>();
/** Read-only snapshots; disconnect/reconnect never executes or resumes a development task. */
export async function streamTaskEvents(response:ServerResponse,clientId:string,limit:number,timeoutMs:number,authorizationStatus:()=>number,read:()=>CoreTask){
 if((streams.get(clientId)||0)>=Math.min(2,Math.max(1,limit)))throw new EngineError(429,'Client task-event stream limit reached');
 read(); // Verify ownership before sending headers.
 streams.set(clientId,(streams.get(clientId)||0)+1);
 let closed=false,wake:()=>void=()=>{};const close=()=>{closed=true;wake();};response.once('close',close);
 try{
  response.setHeader('Content-Type','text/event-stream; charset=utf-8');response.setHeader('Cache-Control','no-store');response.setHeader('X-Accel-Buffering','no');response.flushHeaders();
  let last='',lastHeartbeat=Date.now();const deadline=Date.now()+timeoutMs;
  const send=(event:string,data:object)=>{if(!response.write('event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n')){closed=true;response.destroy();return false;}return true;};
  while(!closed){
   const denied=authorizationStatus();if(denied){send('error',{status:denied,message:'Task-event access no longer authorized'});break;}
   const task=read(),snapshot={id:task.id,state:task.state,updatedAt:task.updatedAt,steps:task.steps.length,checkpoints:task.checkpoints?.length||0,proposals:task.proposals.length,lastAction:String(task.steps.at(-1)?.action||'').slice(0,100)},encoded=JSON.stringify(snapshot);
   if(encoded!==last){if(!send('task',snapshot))break;last=encoded;}
   if(!['planning','running'].includes(task.state)){send('done',{id:task.id,state:task.state});break;}
   if(Date.now()>=deadline){send('timeout',{status:504,message:'Task-event observation deadline reached; task was not replayed or cancelled'});break;}
   if(Date.now()-lastHeartbeat>=15000){if(!response.write(': heartbeat\n\n')){response.destroy();break;}lastHeartbeat=Date.now();}
   await new Promise<void>(resolve=>{const timer=setTimeout(resolve,500);wake=()=>{clearTimeout(timer);resolve();};if(closed)wake();});
  }
 }catch{if(!closed&&!response.destroyed)response.write('event: error\ndata: {"status":503,"message":"Task status unavailable; no task was replayed"}\n\n');}
 finally{response.off('close',close);streams.set(clientId,Math.max(0,(streams.get(clientId)||1)-1));if(!streams.get(clientId))streams.delete(clientId);if(!response.destroyed)response.end();}
}
