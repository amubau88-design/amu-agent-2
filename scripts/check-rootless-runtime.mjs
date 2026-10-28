// Read-only prerequisite check. No image pull, container, certificate, service or activation changes.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';
import {assertLinuxHostBoundary,assertRootlessDockerInfo,assertRunnerFreeSpace,safeDirectory} from '../src/runner/docker-runtime.ts';
import {hash} from '../src/runner/protocol.ts';
try{
 if(process.platform!=='linux'||!process.getuid||process.getuid()===0)throw Error('Dedicated unprivileged Linux process required');
 if(Number(process.versions.node.split('.')[0])<24)throw Error('Node 24 or newer required');
 const state=process.argv[2];if(process.argv.length!==3||!path.isAbsolute(state||''))throw Error('Explicit existing private state path required');
 assertLinuxHostBoundary(state);safeDirectory(state);const owner=fs.statSync(state),uid=process.getuid();if(owner.uid!==uid||(owner.mode&0o077)!==0)throw Error('Private state ownership/mode mismatch');
 const free=assertRunnerFreeSpace(fs.statfsSync(state)),socket='/run/user/'+uid+'/docker.sock';const s=fs.statSync(socket);if(!s.isSocket()||s.uid!==uid)throw Error('Dedicated rootless socket required');
 const docker='/usr/bin/docker';if(fs.lstatSync(docker).isSymbolicLink())throw Error('Absolute existing Docker binary required');
 const info=JSON.parse(execFileSync(docker,['--host','unix://'+socket,'info','--format','{{json .}}'],{encoding:'utf8',shell:false,timeout:10000,maxBuffer:65536,env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:os.homedir(),DOCKER_CONFIG:path.join(state,'docker-config')},stdio:['ignore','pipe','pipe']}));
 const checked=assertRootlessDockerInfo(info);console.log(JSON.stringify({runtimePrerequisitesPassed:true,...checked,nodeVersion:process.version,dockerSha256:hash(fs.readFileSync(docker)),socket,freeSpace:free,containers:info.Containers,images:info.Images,containerExecuted:false,containerIsolationAccepted:false,centralExecutionActivated:false}));
}catch(error){console.log(JSON.stringify({runtimePrerequisitesPassed:false,error:error.message,containerExecuted:false,containerIsolationAccepted:false,centralExecutionActivated:false}));process.exitCode=1;}
