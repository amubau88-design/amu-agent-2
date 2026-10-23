import {platform} from './platform.ts';
import {EngineError} from '../inference/models.ts';
let operation:string|null=null;
let active=0;
export const maintenanceStatus=()=>({operation,activeRequests:active});
export function enterRequest(){if(operation)throw new EngineError(503,'Maintenance in progress; retry later');if(active>=platform.maxHttpRequests)throw new EngineError(429,'HTTP request concurrency limit exceeded');active++;let done=false;return()=>{if(!done){done=true;active--;}};}
export async function exclusiveMaintenance<T>(name:string,run:()=>Promise<T>){
 if(operation)throw new EngineError(409,'Another maintenance operation is running');operation=name;
 try{const deadline=Date.now()+15000;while(active){if(Date.now()>deadline)throw new EngineError(409,'Requests did not drain; maintenance cancelled');await new Promise(r=>setTimeout(r,50));}return await run();}finally{operation=null;}
}
