// Offline code rollback only. Runtime data, credentials, models and dependencies never move.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
const targets=['src','scripts','docs','README.md'];
const digest=data=>crypto.createHash('sha256').update(data).digest('hex');
const environmentHash=root=>digest(Buffer.concat(['package.json','package-lock.json','tsconfig.json'].map(name=>fs.readFileSync(path.join(root,name)))));
function save(file,data){const temporary=file+'.tmp';const fd=fs.openSync(temporary,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(data,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temporary,file);}
function hashTree(folder,locations={}){
 const entries=[];
 function walk(file,relative){const stat=fs.lstatSync(file);if(stat.isSymbolicLink())throw Error('Rollback refuses symbolic links');if(stat.isDirectory()){entries.push([relative,'directory']);for(const name of fs.readdirSync(file).sort())walk(path.join(file,name),relative+'/'+name);}else if(stat.isFile())entries.push([relative,digest(fs.readFileSync(file))]);else throw Error('Unsupported rollback entry');}
 for(const name of targets)walk(path.join(locations[name]||folder,name),name);
 return digest(JSON.stringify(entries));
}
function assertRoot(root){if(JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).name!=='amu-agent-2')throw Error('Rollback is restricted to AMU-Agent-2');}
export async function assertOffline(root){
 assertRoot(root);
 for(const name of ['central-server.pid','central-supervisor.pid','remote-worker-supervisor/central-supervisor.pid']){
  const file=path.join(root,'scratch',name);if(!fs.existsSync(file))continue;
  const pid=Number(fs.readFileSync(file,'utf8').trim());if(!Number.isInteger(pid)||pid<=0)throw Error('Cannot establish stopped process state');
  try{process.kill(pid,0);}catch(error){if(error.code==='ESRCH')continue;throw Error('Cannot establish stopped process state');}
  throw Error('Stop the AMU API and its supervisors before manual rollback');
 }
 await new Promise((resolve,reject)=>{const socket=net.connect({host:'127.0.0.1',port:Number(process.env.PORT)||3030});socket.setTimeout(1500);socket.once('connect',()=>{socket.destroy();reject(Error('AMU API port is occupied; rollback refused'));});socket.once('error',error=>{socket.destroy();if(error.code==='ECONNREFUSED')resolve();else reject(error);});socket.once('timeout',()=>{socket.destroy();reject(Error('Cannot establish offline state'));});});
}
export function prepareRollback(root,verifiedRestore){
 assertRoot(root);
 const candidate=path.resolve(verifiedRestore),restores=path.join(root,'scratch/restores');
 if(path.dirname(candidate)!==restores||!/^[-a-f0-9]{36}$/.test(path.basename(candidate))||fs.lstatSync(candidate).isSymbolicLink())throw Error('Select an isolated restore created by the verified backup operation');
 const manifest=JSON.parse(fs.readFileSync(path.join(candidate,'.amu-backup-manifest.json'),'utf8'));
 if(![1,2].includes(manifest.schemaVersion)||manifest.scope!=='full')throw Error('A full verified restore with a supported manifest is required');
 const jobs=JSON.parse(fs.readFileSync(path.join(root,'scratch/backups/encrypted/operations.json'),'utf8'));
 if(!jobs.some(job=>job.kind==='restore'&&job.state==='completed'&&job.result?.authenticated===true&&job.result?.compatibility?.compatible===true&&path.resolve(root,job.result.directory)===candidate))throw Error('Restore has no completed authenticated recovery receipt');
 // Patch-level code recovery only; schema/dependency migrations require separate review.
 const currentPackage=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),oldPackage=JSON.parse(fs.readFileSync(path.join(candidate,'package.json'),'utf8'));
 const contract=p=>[p.name,p.type,p.main,p.dependencies,p.devDependencies,p.engines,p.allowScripts];
 if(currentPackage.version.split('.').slice(0,2).join('.')!==oldPackage.version.split('.').slice(0,2).join('.')||JSON.stringify(contract(currentPackage))!==JSON.stringify(contract(oldPackage))||manifest.identityJournalSchema!==1)throw Error('Package or data-schema contract differs; manual migration required');
 const lockContract=folder=>{const lock=JSON.parse(fs.readFileSync(path.join(folder,'package-lock.json'),'utf8'));delete lock.version;if(lock.packages?.[''])delete lock.packages[''].version;return JSON.stringify(lock);};
 if(lockContract(root)!==lockContract(candidate)||!fs.readFileSync(path.join(root,'tsconfig.json')).equals(fs.readFileSync(path.join(candidate,'tsconfig.json'))))throw Error('Dependency or compiler contract differs; manual migration required');
 const before=hashTree(root),after=hashTree(candidate),id=crypto.randomUUID(),directory=path.join(root,'scratch/rollback',id);
 fs.mkdirSync(directory,{recursive:true,mode:0o700});fs.mkdirSync(path.join(directory,'candidate'));fs.mkdirSync(path.join(directory,'previous'));
 for(const name of targets)fs.cpSync(path.join(candidate,name),path.join(directory,'candidate',name),{recursive:true,errorOnExist:true,force:false});
 if(hashTree(path.join(directory,'candidate'))!==after)throw Error('Restore changed while preparing rollback');
 // Keep a recovery tool outside any directory being replaced.
 fs.copyFileSync(new URL(import.meta.url),path.join(directory,'recovery.mjs'),fs.constants.COPYFILE_EXCL);
 fs.writeFileSync(path.join(directory,'undo.mjs'),"import fs from 'node:fs';import {assertOffline,undoRollback} from './recovery.mjs';const plan=JSON.parse(fs.readFileSync(new URL('./plan.json',import.meta.url),'utf8'));await assertOffline(plan.root);console.log(JSON.stringify(undoRollback(plan.root,plan.id,process.argv[2])));\n",{flag:'wx',mode:0o600});
 const plan={schema:1,id,root,before,after,environment:environmentHash(root),sourceRestore:path.basename(candidate),createdAt:new Date().toISOString(),state:'prepared',targets,steps:[]};
 plan.confirmationHash=digest(JSON.stringify(plan));save(path.join(directory,'plan.json'),plan);
 return {id,confirmationHash:plan.confirmationHash,scope:'program-code-only',runtimeStatePreserved:true,sourceRestore:plan.sourceRestore};
}
function readPlan(root,id){
 if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Invalid rollback id');
 const directory=path.join(root,'scratch/rollback',id),plan=JSON.parse(fs.readFileSync(path.join(directory,'plan.json'),'utf8'));
 if(plan.root!==root||plan.id!==id||plan.schema!==1||JSON.stringify(plan.targets)!==JSON.stringify(targets))throw Error('Invalid rollback plan');
 const reviewed={...plan,state:'prepared',steps:[]};delete reviewed.confirmationHash;if(digest(JSON.stringify(reviewed))!==plan.confirmationHash)throw Error('Rollback plan integrity mismatch');
 return {directory,plan,file:path.join(directory,'plan.json')};
}
function exclusive(root,run){
 const file=path.join(root,'scratch/manual-rollback.execution.lock');
 for(let attempt=0;attempt<2;attempt++){
  try{fs.writeFileSync(file,JSON.stringify({pid:process.pid,root}),{flag:'wx',mode:0o600});break;}
  catch(error){if(error.code!=='EEXIST'||attempt)throw error;const owner=JSON.parse(fs.readFileSync(file,'utf8'));if(owner.root!==root||!Number.isInteger(owner.pid)||owner.pid<=0)throw Error('Unknown rollback execution lock');try{process.kill(owner.pid,0);}catch(check){if(check.code==='ESRCH'){fs.unlinkSync(file);continue;}throw check;}throw Error('Another rollback command is running');}
 }
 try{return run();}finally{fs.unlinkSync(file);}
}
export function applyRollback(root,id,confirmationHash){return exclusive(root,()=>apply(root,id,confirmationHash));}
function apply(root,id,confirmationHash){
 const {directory,plan,file}=readPlan(root,id);
 if(plan.state!=='prepared'||plan.confirmationHash!==confirmationHash)throw Error('Review the prepared plan and supply its exact confirmation hash');
 if(environmentHash(root)!==plan.environment||hashTree(root)!==plan.before||hashTree(path.join(directory,'candidate'))!==plan.after)throw Error('Code changed after preview; prepare a new rollback');
 const marker=path.join(root,'scratch/manual-rollback.lock');fs.writeFileSync(marker,JSON.stringify({id,root}),{flag:'wx',mode:0o600});
 plan.state='applying';save(file,plan);
 try{
  for(const name of targets){
   plan.steps.push({name,state:'moving'});save(file,plan);
   fs.renameSync(path.join(root,name),path.join(directory,'previous',name));
   fs.renameSync(path.join(directory,'candidate',name),path.join(root,name));
   plan.steps.at(-1).state='installed';save(file,plan);
  }
  if(hashTree(root)!==plan.after)throw Error('Installed code integrity mismatch');
  plan.state='applied';save(file,plan);fs.unlinkSync(marker);
  return {id,state:plan.state,runtimeStatePreserved:true,restartRequired:true};
 }catch(error){plan.state='interrupted';save(file,plan);throw Error('Rollback interrupted; keep the service stopped and use undo with the preserved recovery tool. '+error.message);}
}
export function undoRollback(root,id,confirmationHash){return exclusive(root,()=>undo(root,id,confirmationHash));}
function undo(root,id,confirmationHash){
 const {directory,plan,file}=readPlan(root,id),marker=path.join(root,'scratch/manual-rollback.lock');
 if(!['applied','applying','interrupted','undoing'].includes(plan.state)||plan.confirmationHash!==confirmationHash)throw Error('No applicable rollback or incorrect confirmation');
 if(environmentHash(root)!==plan.environment)throw Error('Dependency contract changed; manual inspection required');
 if(plan.state==='applied'&&hashTree(root)!==plan.after)throw Error('Code changed after rollback; manual inspection required before undo');
 const originals=Object.fromEntries(targets.map(name=>[name,fs.existsSync(path.join(directory,'previous',name))?path.join(directory,'previous'):root]));
 if(hashTree(root,originals)!==plan.before)throw Error('Preserved code integrity mismatch; manual inspection required before undo');
 if(fs.existsSync(marker)){const owner=JSON.parse(fs.readFileSync(marker,'utf8'));if(owner.id!==id||owner.root!==root)throw Error('Another rollback owns the startup barrier');}else fs.writeFileSync(marker,JSON.stringify({id,root}),{flag:'wx',mode:0o600});
 plan.state='undoing';save(file,plan);fs.mkdirSync(path.join(directory,'replaced'),{recursive:true});
 for(const name of [...targets].reverse()){
  const previous=path.join(directory,'previous',name),current=path.join(root,name),replaced=path.join(directory,'replaced',name);
  if(!fs.existsSync(previous))continue;
  if(fs.existsSync(current)){if(fs.existsSync(replaced))throw Error('Undo needs manual inspection; preserved replacement already exists');fs.renameSync(current,replaced);}
  fs.renameSync(previous,current);
 }
 if(hashTree(root)!==plan.before)throw Error('Undo integrity mismatch; service remains blocked');
 plan.state='undone';save(file,plan);fs.unlinkSync(marker);return {id,state:'undone',runtimeStatePreserved:true};
}
