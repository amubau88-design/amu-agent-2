import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {EngineError} from '../inference/models.ts';
import {writePrivateJson} from '../central/storage.ts';
import {coreDirectory,contentHash,readControlled,replacementDiff} from './tools.ts';
import {checkSource} from './validation.ts';
import {workspace,scopedPath} from './workspaces.ts';

type Change={path:string;before:string|null;after:string|null;baseHash:string|null;afterHash:string|null};
type ChangeSet={id:string;workspaceId:string;owner:string;taskId?:string;status:'review'|'applying'|'applied'|'restoring'|'restored'|'rejected'|'interrupted';digest:string;changes:Change[];createdAt:string;updatedAt:string;history:{at:string;status:string;detail?:string}[]};
const directory=path.join(coreDirectory,'change-sets');fs.mkdirSync(directory,{recursive:true});
const location=(id:string)=>{if(!/^[a-f0-9-]{36}$/.test(id))throw new EngineError(400,'Invalid change-set id');return path.join(directory,id+'.json');};
function save(s:ChangeSet,detail?:string){s.updatedAt=new Date().toISOString();s.history.push({at:s.updatedAt,status:s.status,...(detail?{detail}: {})});writePrivateJson(location(s.id),s,true);}
function get(id:string,owner:string,admin:boolean){const file=location(id);if(!fs.existsSync(file))throw new EngineError(404,'Change set not found');const s:ChangeSet=JSON.parse(fs.readFileSync(file,'utf8'));if(!admin&&s.owner!==owner)throw new EngineError(404,'Change set not found');workspace(s.workspaceId,owner,admin);if(['applying','restoring'].includes(s.status)){s.status='interrupted';save(s,'Interrupted write: inspect and explicitly restore; no automatic replay');}return s;}
const hash=(target:string)=>fs.existsSync(target)?contentHash(fs.readFileSync(target,'utf8')):null;
function grant(w:ReturnType<typeof workspace>,tool:'prepare_patch'|'show_diff'|'apply_patch'){if(!w.tools.includes(tool))throw new EngineError(403,'Workspace permission required: '+tool);}
export function createChangeSet(workspaceId:string,body:any,owner:string,admin=false,taskId?:string){
 if(body?.taskId!==undefined)throw new EngineError(400,'Task links are internal only');const w=workspace(workspaceId,owner,admin);grant(w,'prepare_patch');if(!Array.isArray(body?.changes)||!body.changes.length||body.changes.length>12)throw new EngineError(400,'Provide 1–12 file changes');
 let bytes=0;const seen=new Set<string>();const changes:Change[]=body.changes.map((input:any)=>{
  const p=scopedPath(w,input.path,true),canonical=p.target.toLowerCase();if(seen.has(canonical))throw new EngineError(400,'Duplicate file');seen.add(canonical);
  const before=fs.existsSync(p.target)?readControlled(p.relative).content:null,baseHash=before===null?null:contentHash(before);
  if(input.baseHash!==baseHash)throw new EngineError(409,'Datei zwischenzeitlich geändert: '+input.path);
  if(input.delete!==undefined&&typeof input.delete!=='boolean')throw new EngineError(400,'delete must be boolean');
  const after=input.delete===true?null:input.content;if(input.delete!==true&&typeof after!=='string')throw new EngineError(400,'Explicit delete:true or string content required');if(after!==null&&(typeof after!=='string'||Buffer.byteLength(after)>128*1024))throw new EngineError(413,'File content limit exceeded');
  if(before===after)throw new EngineError(422,'No change: '+input.path);if(after!==null&&!checkSource(p.relative,after).passed)throw new EngineError(422,'Invalid source: '+input.path);
  bytes+=Buffer.byteLength(before??'')+Buffer.byteLength(after??'');if(bytes>512*1024)throw new EngineError(413,'Change set exceeds 512 KiB checkpoint limit');
  return {path:input.path,before,after,baseHash,afterHash:after===null?null:contentHash(after)};
 });
 const id=crypto.randomUUID(),digest=contentHash(JSON.stringify({workspaceId,changes,...(taskId?{taskId}: {})})),now=new Date().toISOString();const s:ChangeSet={id,workspaceId,owner,status:'review',digest,changes,createdAt:now,updatedAt:now,history:[]};if(taskId)s.taskId=taskId;save(s);return view(s);
}
function view(s:ChangeSet){return {...s,changes:s.changes.map(c=>({...c,operation:c.before===null?'added':c.after===null?'deleted':'modified',diff:replacementDiff(c.path,c.before??'',c.after??'',c.before!==null).replace(c.after===null?'+++ b/'+c.path+'\n':'\0','+++ /dev/null\n')}))};}
export function listChangeSets(workspaceId:string,owner:string,admin=false){workspace(workspaceId,owner,admin);return fs.readdirSync(directory).filter(f=>/^[a-f0-9-]{36}\.json$/.test(f)).map(f=>JSON.parse(fs.readFileSync(path.join(directory,f),'utf8')) as ChangeSet).filter(s=>s.workspaceId===workspaceId&&(admin||s.owner===owner)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100).map(s=>({id:s.id,taskId:s.taskId,status:['applying','restoring'].includes(s.status)?'interrupted':s.status,digest:s.digest,createdAt:s.createdAt,files:s.changes.map(c=>c.path)}));}
export function readChangeSet(id:string,owner:string,admin=false){const s=get(id,owner,admin);grant(workspace(s.workspaceId,owner,admin),'show_diff');return view(s);}
/** Per-file atomic replacement, durable write-ahead state. Deliberately not a filesystem-wide transaction. */
export function actOnChangeSet(id:string,action:string,body:any,owner:string,admin=false){
 const s=get(id,owner,admin),w=workspace(s.workspaceId,owner,admin);
 if(contentHash(JSON.stringify({workspaceId:s.workspaceId,changes:s.changes,...(s.taskId?{taskId:s.taskId}: {})}))!==s.digest)throw new EngineError(409,'Change-set digest integrity failure');
 if(action==='reject'){grant(w,'prepare_patch');if(s.status!=='review')throw new EngineError(409,'Only pending changes can be rejected');s.status='rejected';save(s);return view(s);}
 if(!admin)throw new EngineError(403,'Administrator approval required');grant(w,'apply_patch');if(body?.approve!==true||body.digest!==s.digest)throw new EngineError(403,'Approve the exact displayed change-set digest');
 const restore=action==='restore';if(action!=='apply'&&!restore)throw new EngineError(400,'Unknown change-set action');if(restore?!['applied','interrupted'].includes(s.status):s.status!=='review')throw new EngineError(409,'Invalid change-set state');
 // Validate every checkpoint and current source before touching any file.
 for(const c of s.changes){if((c.before===null?null:contentHash(c.before))!==c.baseHash||(c.after===null?null:contentHash(c.after))!==c.afterHash)throw new EngineError(409,'Checkpoint integrity failure');const p=scopedPath(w,c.path,true),current=hash(p.target);if(restore?(current!==c.afterHash&&current!==c.baseHash):current!==c.baseHash)throw new EngineError(409,'Schreibkonflikt; fremde Änderung bleibt erhalten: '+c.path);}
 s.status=restore?'restoring':'applying';save(s);
 try{for(const c of s.changes){const p=scopedPath(w,c.path,true),current=hash(p.target),desired=restore?c.before:c.after,expected=restore?c.afterHash:c.baseHash;
   if(restore&&current===c.baseHash)continue;if(current!==expected)throw new EngineError(409,'Source changed during operation: '+c.path);
   if(desired===null){fs.unlinkSync(p.target);}else{fs.mkdirSync(path.dirname(p.target),{recursive:true});const tmp=p.target+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(tmp,desired,{flag:'wx',mode:0o600});const fd=fs.openSync(tmp,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}scopedPath(w,c.path,true);if(hash(p.target)!==expected)throw new EngineError(409,'Source changed before replacement');fs.renameSync(tmp,p.target);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
   save(s,'File '+(restore?'restored: ':'applied: ')+c.path);
  }s.status=restore?'restored':'applied';save(s);return view(s);
 }catch(error){s.status='interrupted';save(s,error instanceof EngineError?error.message:'File operation failed; checkpoint retained');throw error;}
}
