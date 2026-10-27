import {loadConfig,createRunnerService} from '../src/runner/service.ts';
import {DockerRuntime} from '../src/runner/docker-runtime.ts';
import {acquireRunnerLease} from '../src/runner/lease.ts';
const file=process.env.AMU_ISOLATED_RUNNER_CONFIG;if(!file)throw Error('Set AMU_ISOLATED_RUNNER_CONFIG to the explicitly provisioned configuration file');
if(process.platform!=='linux'||process.getuid()===0)throw Error('Dedicated non-root Linux runner required. Nothing was started.');
const config=loadConfig(file),lease=acquireRunnerLease(config.runtime.workRoot,'service');
let service,shutdown;
const release=()=>lease.release();process.once('exit',release);
try{
 const runtime=new DockerRuntime(config.runtime);const recovery=await runtime.recoverOwnedContainers();service=createRunnerService(config,runtime,recovery);
 shutdown=()=>service.shutdown();
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void shutdown().then(()=>process.exit(0)).catch(()=>process.exit(1));});
 await new Promise((resolve,reject)=>{service.server.once('error',reject);service.server.listen(config.port,config.host,resolve);});
 console.log(JSON.stringify({serverId:config.serverId,status:'listening',host:config.host,port:config.port,authentication:'mutual-tls-and-client-pin',centralExecutionActivated:false,recovery}));
}catch(error){if(service)await service.shutdown();process.removeListener('exit',release);lease.release();throw error;}
