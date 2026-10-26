import {loadConfig,createRunnerService} from '../src/runner/service.ts';
import {DockerRuntime} from '../src/runner/docker-runtime.ts';
const file=process.env.AMU_ISOLATED_RUNNER_CONFIG;if(!file)throw Error('Set AMU_ISOLATED_RUNNER_CONFIG to the explicitly provisioned configuration file');
if(process.platform!=='linux'||process.getuid()===0)throw Error('Dedicated non-root Linux runner required. Nothing was started.');
const config=loadConfig(file),runtime=new DockerRuntime(config.runtime);const recovery=await runtime.recoverOwnedContainers();const service=createRunnerService(config,runtime);await new Promise((resolve,reject)=>{service.server.once('error',reject);service.server.listen(config.port,config.host,resolve);});console.log(JSON.stringify({serverId:config.serverId,status:'listening',host:config.host,port:config.port,authentication:'mutual-tls-and-client-pin',centralExecutionActivated:false,recovery}));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void service.shutdown().then(()=>process.exit(0));});
