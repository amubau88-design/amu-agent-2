import crypto from 'node:crypto';
import {EngineError} from '../inference/models.ts';
import type {ApprovedExecutionProfile,IsolatedRunnerAdapter} from './isolated-runner-contract.ts';

/** Runtime validation for future adapters. This policy never launches a process or enables a backend. */
export function validateExecutionProfile(value:any):ApprovedExecutionProfile{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['id','kind','executable','arguments','approvalDigest','approvedBy','limits'].includes(k)))throw new EngineError(400,'Invalid runner profile');
 if(typeof value.id!=='string'||!/^[a-z0-9-]{1,64}$/.test(value.id)||!['unit','integration','build','typecheck'].includes(value.kind)||!['node','npm','python'].includes(value.executable))throw new EngineError(400,'Unsupported runner command profile');
 if(!Array.isArray(value.arguments)||!value.arguments.length||value.arguments.length>24||value.arguments.some((v:any)=>typeof v!=='string'||v.length>500||/[\0\r\n]/.test(v)))throw new EngineError(400,'Runner requires bounded literal arguments');
 const ranges={wallTimeMs:[1000,120000],memoryMiB:[128,4096],cpuCount:[1,4],processCount:[1,64],outputBytes:[1024,65536]};
 if(!value.limits||typeof value.limits!=='object'||Array.isArray(value.limits)||Object.keys(value.limits).length!==Object.keys(ranges).length)throw new EngineError(400,'Complete resource limits required');
 for(const [key,[min,max]] of Object.entries(ranges))if(!Number.isInteger(value.limits[key])||value.limits[key]<min||value.limits[key]>max)throw new EngineError(400,'Unsafe runner resource limit: '+key);
 if(typeof value.approvedBy!=='string'||!/^[a-f0-9-]{36}$/.test(value.approvedBy))throw new EngineError(403,'Administrator identity required');
 const digest=crypto.createHash('sha256').update(JSON.stringify({id:value.id,kind:value.kind,executable:value.executable,arguments:value.arguments,limits:Object.fromEntries(Object.keys(ranges).map(k=>[k,value.limits[k]]))})).digest('hex');
 if(value.approvalDigest!==digest)throw new EngineError(403,'Runner profile approval digest mismatch');return structuredClone(value);
}
export async function assertIsolatedRunner(adapter:IsolatedRunnerAdapter|undefined){
 if(!adapter||adapter.isolation!=='operating-system')throw new EngineError(503,'No verified OS-isolated adapter installed; project execution remains disabled');
 const evidence=await adapter.verifyInstallation();
 if(!evidence.available||!evidence.runtimeVersion||!evidence.networkDisabled||!evidence.unprivileged||!evidence.credentialsAbsent||!evidence.resourceLimitsEnforced||!evidence.processTreeCancellation)throw new EngineError(503,'Runner isolation prerequisites incomplete; fail closed');
 return evidence;
}
