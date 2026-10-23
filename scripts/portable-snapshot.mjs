import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {fileURLToPath} from 'node:url';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const hash=file=>{const digest=crypto.createHash('sha256'),buffer=Buffer.alloc(1024*1024),descriptor=fs.openSync(file,'r');try{let read;while((read=fs.readSync(descriptor,buffer,0,buffer.length,null))>0)digest.update(buffer.subarray(0,read));return digest.digest('hex');}finally{fs.closeSync(descriptor);}};
const within=(parent,target)=>{const relative=path.relative(parent,target);return relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative);};
const args=process.argv.slice(2);
if(args[0]==='verify'){
 const directory=path.resolve(args[1]||'');
 if(!within(path.join(root,'scratch'),directory))throw Error('Only project-local scratch snapshots can be verified');
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
 if(manifest.format!=='amu-portable-snapshot-v1'||!Array.isArray(manifest.files)||new Set(manifest.files.map(e=>e.path)).size!==manifest.files.length)throw Error('Invalid snapshot manifest');
 for(const entry of manifest.files){const target=path.resolve(directory,entry.path);if(!within(directory,target)||fs.lstatSync(target).isSymbolicLink()||!within(fs.realpathSync(directory),fs.realpathSync(target))||hash(target)!==entry.sha256)throw Error('Snapshot verification failed: '+entry.path);}
 function checkTree(folder){for(const item of fs.readdirSync(folder,{withFileTypes:true})){const target=path.join(folder,item.name);if(item.isSymbolicLink())throw Error('Unexpected snapshot symlink');if(item.isDirectory())checkTree(target);else {const relative=path.relative(directory,target).split(path.sep).join('/');if(relative!=='manifest.json'&&!manifest.files.some(e=>e.path===relative))throw Error('Unlisted snapshot file: '+relative);}}}
 checkTree(directory);
 console.log(JSON.stringify({verified:true,files:manifest.files.length,containsPrivateKeys:manifest.containsPrivateKeys}));
}else if(args[0]==='create'){
 // An offline snapshot avoids inconsistent client quotas, source writes and job checkpoints.
 for(const name of ['central-server.pid','central-supervisor.pid']){
  const file=path.join(root,'scratch',name);if(!fs.existsSync(file))continue;
  const pid=Number(fs.readFileSync(file,'utf8').trim());let alive=false;try{process.kill(pid,0);alive=true;}catch(e){if(e.code!=='ESRCH')throw Error('Cannot verify stopped AMU process');}if(alive)throw Error('Stop the AMU API and supervisor before creating a portable snapshot');
 }
 const port=Number(process.env.PORT)||3030;
 const occupied=await new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));socket.setTimeout(1000,()=>{socket.destroy();resolve(true);});});
 if(occupied)throw Error('API port is occupied; offline snapshot refused');
 const parent=path.join(root,'scratch','migrations');fs.mkdirSync(parent,{recursive:true});
 const directory=path.join(parent,new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(directory);
 const files=[];
 function copy(source,relative){
  const stat=fs.lstatSync(source);if(stat.isSymbolicLink())throw Error('Snapshot refuses symlinks: '+relative);
  const destination=path.join(directory,relative);
  if(stat.isDirectory()){fs.mkdirSync(destination,{recursive:true});for(const child of fs.readdirSync(source))copy(path.join(source,child),path.join(relative,child));return;}
  if(!stat.isFile())throw Error('Unsupported snapshot file: '+relative);
  fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(source,destination,fs.constants.COPYFILE_EXCL);
  // Process IDs are local runtime identities; never revive them on another host.
  if(relative.endsWith('.task.json')){const task=JSON.parse(fs.readFileSync(destination,'utf8'));delete task.ownerPid;fs.writeFileSync(destination,JSON.stringify(task,null,2));}
  const digest=hash(destination);if(!relative.endsWith('.task.json')&&digest!==hash(source))throw Error('Copy verification failed: '+relative);
  files.push({path:relative.split(path.sep).join('/'),bytes:fs.statSync(destination).size,sha256:digest});
 }
 for(const name of ['src','docs','scripts','package.json','package-lock.json','tsconfig.json','README.md','.gitignore','.gitattributes'])copy(path.join(root,name),name);
 // Include ALL existing scratch data except redundant snapshots/tests and machine runtime files.
 const excludedDirectory=/^(?:backups|migrations|backup_.*|.*-test-.*|central-test-.*|embedded-verification-.*|supervisor-verification-.*)$/;
 const runtimeFile=/^(?:central-server\.|central-supervisor\.|supervisor(?:-status)?\.|windows-(?:start\.|autostart-status\.))|\.(?:tmp|log|mjs|ts|txt)$/;
 for(const item of fs.readdirSync(path.join(root,'scratch'),{withFileTypes:true})){if(item.isDirectory()&&excludedDirectory.test(item.name)||item.isFile()&&runtimeFile.test(item.name))continue;copy(path.join(root,'scratch',item.name),path.join('scratch',item.name));}
 const manifest={format:'amu-portable-snapshot-v1',createdAt:new Date().toISOString(),containsPrivateKeys:true,files};
 fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({created:true,directory,files:files.length,containsPrivateKeys:true}));
}else throw Error('Usage: node scripts/portable-snapshot.mjs create | verify <project-local snapshot>');
