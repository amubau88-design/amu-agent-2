// Read-only Linux prerequisite probe. Does not start a container or activate execution.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {loadConfig} from '../src/runner/service.ts';import {hash} from '../src/runner/protocol.ts';import {safeDirectory} from '../src/runner/docker-runtime.ts';
const checks=[];const check=(name,passed)=>{checks.push({name,passed:passed===true});if(passed!==true)throw Error(name);};
try{
 check('dedicated non-root Linux process',process.platform==='linux'&&typeof process.getuid==='function'&&process.getuid()>0);
 check('Node 24 or newer',Number(process.versions.node.split('.')[0])>=24);
 check('explicit configuration path',process.argv.length===3&&path.isAbsolute(process.argv[2]));
 const config=loadConfig(process.argv[2]),uid=process.getuid();
 const groupIds=new Set(process.getgroups());const dangerous=fs.readFileSync('/etc/group','utf8').split('\n').filter(line=>['sudo','wheel','docker'].includes(line.split(':')[0])).some(line=>groupIds.has(Number(line.split(':')[2])));
 check('runner has no sudo, wheel or rootful-docker group',!dangerous);
 const wsl=/microsoft/i.test(fs.readFileSync('/proc/version','utf8'));
 if(wsl){
  const settings=fs.readFileSync('/etc/wsl.conf','utf8');let section='';const values={};for(const raw of settings.split('\n')){const line=raw.split('#')[0].trim().toLowerCase();if(/^\[.+\]$/.test(line)){section=line.slice(1,-1);continue;}const separator=line.indexOf('=');if(separator>0)values[section+'.'+line.slice(0,separator).trim()]=line.slice(separator+1).trim();}
  check('WSL disables Windows automount, fstab and interoperability',values['automount.enabled']==='false'&&values['automount.mountfstab']==='false'&&values['interop.enabled']==='false'&&values['interop.appendwindowspath']==='false');
  check('no mounted Windows drive shares',! /\s(?:9p|drvfs)\s/.test(fs.readFileSync('/proc/mounts','utf8')));
  check('Windows binary execution is not registered',!fs.existsSync('/proc/sys/fs/binfmt_misc/WSLInterop'));
 }
 check('systemd is PID 1',fs.readFileSync('/proc/1/comm','utf8').trim()==='systemd');
 check('cgroup v2 controllers available',fs.existsSync('/sys/fs/cgroup/cgroup.controllers'));
 safeDirectory(config.runtime.workRoot);const state=fs.statSync(config.runtime.workRoot);check('private state owned by runner',state.uid===uid&&(state.mode&0o077)===0);
 const socket=config.runtime.socket;check('dedicated rootless socket',socket==='unix:///run/user/'+uid+'/docker.sock'&&fs.statSync(socket.slice(7)).isSocket()&&fs.statSync(socket.slice(7)).uid===uid);
 check('Docker binary hash matches explicit configuration',path.isAbsolute(config.runtime.dockerExecutable)&&!fs.lstatSync(config.runtime.dockerExecutable).isSymbolicLink()&&hash(fs.readFileSync(config.runtime.dockerExecutable))===config.runtime.dockerSha256);
 const dockerConfig=path.join(config.runtime.workRoot,'docker-config');safeDirectory(dockerConfig);check('empty private Docker client configuration',fs.readdirSync(dockerConfig).length===0&&fs.statSync(dockerConfig).uid===uid&&(fs.statSync(dockerConfig).mode&0o077)===0);
 const readDocker=args=>JSON.parse(execFileSync(config.runtime.dockerExecutable,['--host',socket,...args],{shell:false,timeout:5000,maxBuffer:65536,encoding:'utf8',env:{PATH:'/usr/local/bin:/usr/bin:/bin',DOCKER_CONFIG:dockerConfig},stdio:['ignore','pipe','pipe']}));
 const info=readDocker(['info','--format','{{json .}}']);check('rootless Linux with systemd cgroup v2 and seccomp',info.OSType==='linux'&&info.CgroupVersion==='2'&&info.CgroupDriver==='systemd'&&info.SecurityOptions?.some(v=>v.includes('rootless'))&&info.SecurityOptions?.some(v=>v.includes('seccomp')));
 check('no resource-enforcement warnings',!info.Warnings?.some(v=>/cpu|memory|pids|cgroup|swap/i.test(v)));
 check('immutable image configured',/^sha256:[a-f0-9]{64}$/.test(config.runtime.imageId));const image=readDocker(['image','inspect',config.runtime.imageId])[0];check('local trusted runner image without implicit volumes',image?.Id===config.runtime.imageId&&image.Os==='linux'&&image.Config?.Labels?.['amu.runner.schema']==='1'&&!Object.keys(image.Config?.Volumes||{}).length);
 check('one small job fits current resources',os.availableParallelism()>=1&&os.freemem()>=1024**3);
 console.log(JSON.stringify({prerequisitesPassed:true,checks,realContainerExecuted:false,isolationAccepted:false,centralExecutionActivated:false}));
}catch{
 console.log(JSON.stringify({prerequisitesPassed:false,checks,realContainerExecuted:false,isolationAccepted:false,centralExecutionActivated:false,nextStep:'Resolve the failed prerequisite; do not enable host execution or bypass acceptance.'}));process.exitCode=1;
}
