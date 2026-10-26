import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawn} from 'node:child_process';
import os from 'node:os';
import {hash,validateProfile,validateManifest,type RunnerProfile,type ManifestFile} from './protocol.ts';

export type RuntimeConfig={dockerExecutable:string;dockerSha256:string;socket:string;imageId:string;workRoot:string};
export type ProcessResult={code:number|null;stdout:string;stderr:string;reason?:'cancelled'|'timed_out'|'output_limit'};
export type HostBoundaryObservation={platform:string;uid:number;pidOne:string;groups:string[];wsl:boolean;stateRoot:string;wslConfiguration?:string;mounts?:string;windowsInteropRegistered?:boolean};
/** This policy is mandatory in the actual adapter, not merely an optional deployment probe. */
export function assertHostBoundaryObservation(o:HostBoundaryObservation){
 if(o.platform!=='linux'||!Number.isInteger(o.uid)||o.uid<=0||o.pidOne!=='systemd'||typeof o.wsl!=='boolean'||!Array.isArray(o.groups)||o.groups.some(g=>['sudo','wheel','docker'].includes(g)))throw Error('Dedicated non-root systemd host without administrative groups required');
 if(!path.posix.isAbsolute(o.stateRoot))throw Error('Linux-native runner state required');
 if(!o.wsl)return;
 let section='';const values:Record<string,string>={};for(const raw of (o.wslConfiguration||'').split('\n')){const line=raw.split('#')[0].trim().toLowerCase();if(/^\[.+\]$/.test(line)){section=line.slice(1,-1);continue;}const separator=line.indexOf('=');if(separator>0)values[section+'.'+line.slice(0,separator).trim()]=line.slice(separator+1).trim();}
 if(values['boot.systemd']!=='true'||values['automount.enabled']!=='false'||values['automount.mountfstab']!=='false'||values['interop.enabled']!=='false'||values['interop.appendwindowspath']!=='false')throw Error('Dedicated WSL must explicitly disable Windows automount, fstab and interoperability');
 if(typeof o.mounts!=='string'||/\s(?:9p|drvfs)\s/i.test(o.mounts)||o.windowsInteropRegistered!==false||/^\/mnt\/[a-z](\/|$)/i.test(o.stateRoot))throw Error('Windows shares, interoperability or Windows-mounted runner state are forbidden');
}
export function assertLinuxHostBoundary(stateRoot:string){
 if(process.platform!=='linux'||!process.getuid||process.getuid()===0)throw Error('Dedicated non-root Linux runner required');
 const ids=new Set([process.getgid!(),...process.getgroups!()]),groups=fs.readFileSync('/etc/group','utf8').split('\n').filter(line=>ids.has(Number(line.split(':')[2]))).map(line=>line.split(':')[0]);
 const wsl=/microsoft/i.test(fs.readFileSync('/proc/version','utf8'));
 assertHostBoundaryObservation({platform:process.platform,uid:process.getuid(),pidOne:fs.readFileSync('/proc/1/comm','utf8').trim(),groups,wsl,stateRoot,...(wsl?{wslConfiguration:fs.readFileSync('/etc/wsl.conf','utf8'),mounts:fs.readFileSync('/proc/mounts','utf8'),windowsInteropRegistered:fs.existsSync('/proc/sys/fs/binfmt_misc/WSLInterop')}:{})});
}
export const runnerDiskReserveBytes=2n*1024n**3n;
export function assertRunnerFreeSpace(stats:{bsize:number|bigint;bavail:number|bigint}){
 const integer=(v:number|bigint)=>typeof v==='bigint'?v:typeof v==='number'&&Number.isSafeInteger(v)?BigInt(v):-1n;
 const block=integer(stats.bsize),available=integer(stats.bavail);if(block<=0n||available<0n||block*available<runnerDiskReserveBytes)throw Error('At least 2 GiB unprivileged free space required for runner state');
 return {availableBytes:(block*available).toString(),minimumBytes:runnerDiskReserveBytes.toString()};
}
export function safeDirectory(dir:string){if(!path.isAbsolute(dir)||dir.includes(',')||dir.includes('\0'))throw Error('Absolute plain runner directory required');for(let p=dir;;p=path.dirname(p)){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Linked runner directory');if(path.dirname(p)===p)break;}if(!fs.existsSync(dir)||!fs.statSync(dir).isDirectory())throw Error('Runner directory must already exist');}
export function cleanupInput(root:string,id:string,files:ManifestFile[]){
 if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid owned snapshot identity');validateManifest(files);safeDirectory(root);const directory=path.join(root,id);safeDirectory(directory);
 const expected=new Set(files.map(f=>path.join(directory,f.path))),allowedDirs=new Set([directory]),dirs:string[]=[];
 for(const target of expected)for(let cursor=path.dirname(target);cursor!==directory;cursor=path.dirname(cursor))allowedDirs.add(cursor);
 const walk=(dir:string)=>{safeDirectory(dir);if(!allowedDirs.has(dir))throw Error('Foreign snapshot directory retained');dirs.push(dir);for(const name of fs.readdirSync(dir)){const target=path.join(dir,name);if(fs.lstatSync(target).isSymbolicLink())throw Error('Linked snapshot retained');if(fs.statSync(target).isDirectory())walk(target);else if(!expected.has(target)||!fs.statSync(target).isFile())throw Error('Foreign snapshot data retained');}};walk(directory);
 for(const file of files){const target=path.join(directory,file.path);if(!fs.existsSync(target)||fs.statSync(target).size!==file.bytes||hash(fs.readFileSync(target))!==file.sha256)throw Error('Changed or missing snapshot retained');}
 for(const target of expected)fs.unlinkSync(target);for(const dir of dirs.reverse())fs.rmdirSync(dir);
}
export function dockerArguments(config:RuntimeConfig,name:string,source:string,profile:RunnerProfile,mode:'project'|'acceptance'|'acceptance-memory'='project'){
 validateProfile(profile);if(!/^amu-run-[a-f0-9-]{36}$/.test(name))throw Error('Invalid owned container name');if(!path.isAbsolute(source)||source.includes(',')||source.includes('\0'))throw Error('Invalid source mount');if(!/^sha256:[a-f0-9]{64}$/.test(config.imageId))throw Error('Pin a local immutable image ID');
 return ['--host',config.socket,'run','--pull=never','--name',name,'--label','amu.isolated-runner=1','--label','amu.runner.owner='+hash(config.workRoot),'--network=none','--read-only','--user=1000:1000','--cap-drop=ALL','--security-opt=no-new-privileges','--cgroupns=private','--ipc=private','--memory='+profile.limits.memoryMiB+'m','--memory-swap='+profile.limits.memoryMiB+'m','--cpus='+profile.limits.cpuCount,'--pids-limit='+profile.limits.processCount,'--ulimit','nofile=128:128','--log-driver=none','--no-healthcheck','--stop-timeout=1','--tmpfs','/work:rw,nosuid,nodev,size=268435456,uid=1000,gid=1000,mode=0700','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=16777216,uid=1000,gid=1000,mode=0700','--mount','type=bind,src='+source+',dst=/input,readonly','--workdir=/work','--entrypoint=/usr/local/bin/node',config.imageId,'/opt/amu/entry.mjs',mode,JSON.stringify(profile)];
}
/** Only this adapter can spawn Docker. Never launches a project command on the runner host. */
export class DockerRuntime {
 private busy=false;private quarantined=false;
 readonly config:RuntimeConfig;
 constructor(config:RuntimeConfig){this.config=config;}
 checkResources(profile:RunnerProfile){validateProfile(profile);if(profile.limits.cpuCount>os.availableParallelism()||profile.limits.memoryMiB*1048576+512*1048576>os.freemem())throw Error('Runner CPU/RAM budget insufficient after 512 MiB host reserve');assertRunnerFreeSpace(fs.statfsSync(this.config.workRoot));}
 private environment(){return {PATH:'/usr/local/bin:/usr/bin:/bin',DOCKER_CONFIG:path.join(this.config.workRoot,'docker-config')};}
 private async command(args:string[],timeout:number,limit=65536,signal?:AbortSignal):Promise<ProcessResult>{
  if(hash(fs.readFileSync(this.config.dockerExecutable))!==this.config.dockerSha256)throw Error('Docker executable hash changed');
  return new Promise((resolve,reject)=>{let stdout='',stderr='',bytes=0,reason:ProcessResult['reason'];const child=spawn(this.config.dockerExecutable,args,{shell:false,env:this.environment(),stdio:['ignore','pipe','pipe']});const stop=(why:ProcessResult['reason'])=>{reason??=why;child.kill('SIGKILL');};const abort=()=>stop('cancelled');const timer=setTimeout(()=>stop('timed_out'),timeout);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
   const receive=(chunk:Buffer,error:boolean)=>{bytes+=chunk.length;if(bytes>limit){stop('output_limit');return;}if(error)stderr+=chunk.toString('utf8');else stdout+=chunk.toString('utf8');};child.stdout.on('data',c=>receive(c,false));child.stderr.on('data',c=>receive(c,true));child.once('error',e=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(e);});child.once('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve({code,stdout,stderr,reason});});});
 }
 async prerequisites(){
  if(this.quarantined)throw Error('Runner quarantined after uncertain cleanup; controlled restart/recovery required');
  if(process.platform!=='linux'||!process.getuid||process.getuid()===0)throw Error('Requires a dedicated non-root Linux runner; host execution is forbidden');
  assertLinuxHostBoundary(this.config.workRoot);
  const c=this.config;safeDirectory(c.workRoot);if(fs.statSync(c.workRoot).uid!==process.getuid()||(fs.statSync(c.workRoot).mode&0o077)!==0)throw Error('Runner state must be owned by the dedicated user with mode 0700');assertRunnerFreeSpace(fs.statfsSync(c.workRoot));if(!path.isAbsolute(c.dockerExecutable)||fs.lstatSync(c.dockerExecutable).isSymbolicLink()||!/^[a-f0-9]{64}$/.test(c.dockerSha256))throw Error('Pin the existing Docker executable');
  if(c.socket!=='unix:///run/user/'+process.getuid()+'/docker.sock'||!fs.statSync(c.socket.slice(7)).isSocket()||fs.statSync(c.socket.slice(7)).uid!==process.getuid())throw Error('Only the dedicated user rootless Docker socket is allowed');
  const configDir=path.join(c.workRoot,'docker-config');if(!fs.existsSync(configDir))fs.mkdirSync(configDir,{mode:0o700});safeDirectory(configDir);if(fs.readdirSync(configDir).length)throw Error('Docker client configuration must remain empty; registry credentials are forbidden');
  const info=await this.command(['--host',c.socket,'info','--format','{{json .}}'],5000);if(info.code!==0||info.reason)throw Error('Rootless Docker is unavailable');const data=JSON.parse(info.stdout);
  if(data.OSType!=='linux'||data.CgroupVersion!=='2'||data.CgroupDriver!=='systemd'||!data.SecurityOptions?.some((v:string)=>v.includes('rootless'))||!data.SecurityOptions?.some((v:string)=>v.includes('seccomp'))||data.Warnings?.some((v:string)=>/cpu|memory|pids|cgroup|swap/i.test(v)))throw Error('Rootless, seccomp and fully delegated cgroup v2/systemd limits are required');
  if(!/^sha256:[a-f0-9]{64}$/.test(c.imageId))throw Error('Immutable local image ID required');const image=await this.command(['--host',c.socket,'image','inspect',c.imageId],5000);if(image.code!==0||image.reason)throw Error('The pinned runner image must already exist locally; no pull is allowed');const metadata=JSON.parse(image.stdout)[0];if(metadata.Id!==c.imageId||metadata.Os!=='linux'||metadata.Config?.Labels?.['amu.runner.schema']!=='1'||Object.keys(metadata.Config?.Volumes||{}).length)throw Error('Image identity, OS, trusted entrypoint schema or implicit volumes mismatch');
  return {runtimeVersion:String(data.ServerVersion),imageId:c.imageId,dockerSha256:c.dockerSha256,checkedAt:new Date().toISOString()};
 }
 async recoverOwnedContainers(){await this.prerequisites();const args=['--host',this.config.socket,'ps','--all','--filter','label=amu.isolated-runner=1','--filter','label=amu.runner.owner='+hash(this.config.workRoot),'--format','{{.Names}}'];const list=await this.command(args,5000);if(list.code!==0||list.reason)throw Error('Owned container recovery unavailable');const names=list.stdout.trim().split('\n').filter(Boolean);for(const name of names){if(!/^amu-run-[a-f0-9-]{36}$/.test(name))throw Error('Unexpected owned container identity; manual review required');const removed=await this.command(['--host',this.config.socket,'rm','--force',name],5000);if(removed.code!==0||removed.reason)throw Error('Owned container recovery incomplete');}const remaining=await this.command(args,5000);if(remaining.code!==0||remaining.reason||remaining.stdout.trim())throw Error('Owned containers remain; runner cannot start');return {recoveredContainers:names.length,sourceDirectoriesPreserved:true,verifiedNoOwnedContainers:true,ownerDigest:hash(this.config.workRoot),checkedAt:new Date().toISOString()};}
 async execute(profile:RunnerProfile,files:ManifestFile[],contents:string[],signal?:AbortSignal,mode:'project'|'acceptance'|'acceptance-memory'='project'){
  if(this.busy||this.quarantined)throw Error('Runner busy or quarantined after incomplete cleanup');validateProfile(profile);validateManifest(files);if(contents.length!==files.length)throw Error('Source list mismatch');for(let i=0;i<files.length;i++)if(typeof contents[i]!=='string'||Buffer.byteLength(contents[i])!==files[i].bytes||hash(contents[i])!==files[i].sha256)throw Error('Source hash/size mismatch');
  this.busy=true;let directory='',container='';let cleanupVerified=false;
  try{await this.prerequisites();this.checkResources(profile);signal?.throwIfAborted();const id=crypto.randomUUID();container='amu-run-'+id;directory=path.join(this.config.workRoot,id);fs.mkdirSync(directory,{mode:0o755});for(let i=0;i<files.length;i++){const target=path.join(directory,files[i].path);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o755});fs.writeFileSync(target,contents[i],{flag:'wx',mode:0o444});}
   const result=await this.command(dockerArguments(this.config,container,directory,profile,mode),profile.limits.wallTimeMs,profile.limits.outputBytes,signal);let oomKilled=false;if(!result.reason){const inspected=await this.command(['--host',this.config.socket,'inspect','--format','{{json .State}}',container],5000);if(inspected.code!==0||inspected.reason)throw Error('Container result inspection failed');oomKilled=JSON.parse(inspected.stdout).OOMKilled===true;}return {...result,status:result.reason|| (oomKilled?'oom_killed':result.code===0?'passed':'failed'),oomKilled,sourceExecuted:mode==='project',containerId:container};
  }finally{
   if(container){try{const removed=await this.command(['--host',this.config.socket,'rm','--force',container],5000);const listing=await this.command(['--host',this.config.socket,'ps','--all','--filter','name=^/'+container+'$','--format','{{.Names}}'],5000);cleanupVerified=removed.code===0&&!removed.reason&&listing.code===0&&!listing.reason&&!listing.stdout.trim();}catch{/* quarantine: do not claim cancellation or cleanup succeeded */}if(!cleanupVerified)this.quarantined=true;}
   // Only known immutable inputs are eligible for unlink. Never recursively delete a path.
   try{if(directory&&cleanupVerified)cleanupInput(this.config.workRoot,path.basename(directory),files);if(container&&!cleanupVerified)throw Error('Container cleanup could not be verified; source retained');}catch(error){this.quarantined=true;throw error;}finally{this.busy=false;}
  }
 }
}
