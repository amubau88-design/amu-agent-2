// Trusted immutable image entrypoint. Invoked only inside the isolated container.
import fs from 'node:fs';import os from 'node:os';import {spawn} from 'node:child_process';
import net from 'node:net';import {Worker} from 'node:worker_threads';
const mode=process.argv[2],profile=JSON.parse(process.argv[3]);
// Trusted PID 1 also expires the container if the host-side runner unexpectedly disappears.
setTimeout(()=>process.exit(124),profile.limits.wallTimeMs+500).unref();
if(mode==='acceptance-memory'){const buffers=[];for(let i=0;i<32;i++)buffers.push(Buffer.alloc(8*1024*1024,0x5a));process.exit(1);}
if(mode==='acceptance'){
 const assertions={nonRoot:process.getuid()===1000,networkOnlyLoopback:Object.keys(os.networkInterfaces()).every(k=>k==='lo'),noSecrets:!Object.keys(process.env).some(k=>/TOKEN|SECRET|PASSWORD|API_KEY|DOCKER_HOST/i.test(k)),inputReadOnly:false,rootReadOnly:false,noNewPrivileges:/NoNewPrivs:\s+1/.test(fs.readFileSync('/proc/self/status','utf8')),capabilitiesDropped:/CapEff:\s+0+\s/.test(fs.readFileSync('/proc/self/status','utf8'))};
 try{fs.writeFileSync('/input/write-probe','bad');}catch{assertions.inputReadOnly=true;}try{fs.writeFileSync('/etc/amu-write-probe','bad');}catch{assertions.rootReadOnly=true;}
 const cgroup={memory:fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim(),pids:fs.readFileSync('/sys/fs/cgroup/pids.max','utf8').trim(),cpu:fs.readFileSync('/sys/fs/cgroup/cpu.max','utf8').trim()};
 assertions.seccompFiltering=/Seccomp:\s+2/.test(fs.readFileSync('/proc/self/status','utf8'));
 assertions.resourceFiles=Number(cgroup.memory)===profile.limits.memoryMiB*1048576&&Number(cgroup.pids)===profile.limits.processCount&&cgroup.cpu.split(' ').map(Number)[0]/cgroup.cpu.split(' ').map(Number)[1]===profile.limits.cpuCount;
 assertions.networkBlocked=await new Promise(resolve=>{const socket=net.connect({host:'192.0.2.1',port:9});socket.setTimeout(500,()=>{socket.destroy();resolve(false);});socket.once('connect',()=>{socket.destroy();resolve(false);});socket.once('error',error=>resolve(['ENETUNREACH','EHOSTUNREACH','EPERM'].includes(error.code)));});
 const throttled=()=>Number(fs.readFileSync('/sys/fs/cgroup/cpu.stat','utf8').match(/nr_throttled (\d+)/)?.[1]||0),before=throttled();
 await Promise.all([1,2].map(()=>new Promise((resolve,reject)=>{const worker=new Worker('const until=Date.now()+1500;while(Date.now()<until){}',{eval:true});worker.once('exit',code=>code===0?resolve():reject(Error('CPU probe failed')));worker.once('error',reject);})));assertions.cpuThrottlingObserved=throttled()>before;
 console.log(JSON.stringify({assertions,cgroup,observed:true}));process.exit(Object.values(assertions).every(Boolean)?0:1);
}
if(mode!=='project'||!['node','npm'].includes(profile.executable))throw Error('Invalid container-only mode');
// The bound input is read-only; builds/tests get only a disposable in-memory copy.
fs.cpSync('/input','/work',{recursive:true,dereference:false});
const writable=(dir)=>{fs.chmodSync(dir,0o700);for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=dir+'/'+entry.name;if(entry.isDirectory())writable(file);else if(entry.isFile())fs.chmodSync(file,0o600);else throw Error('Non-regular input refused');}};writable('/work');
const child=spawn(profile.executable==='node'?'/usr/local/bin/node':'/usr/local/bin/npm',profile.arguments,{cwd:'/work',shell:false,env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp',TMPDIR:'/tmp',npm_config_offline:'true',npm_config_audit:'false',npm_config_fund:'false',npm_config_ignore_scripts:'true'},stdio:'inherit'});
child.on('error',()=>process.exit(127));child.on('exit',(code)=>process.exit(code??1));
