import {gitExecutable} from './git-runtime.ts';
import fs from 'node:fs';
import path from 'node:path';

import crypto from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {EngineError} from '../inference/models.ts';
import {writePrivateJson} from '../central/storage.ts';
import {coreDirectory,contentHash,readControlled,controlledPath} from './tools.ts';
import {workspace,scopedPath,listFiles,registerWorkspace,runLimited} from './workspaces.ts';
const caller=new AsyncLocalStorage<string>(),busy=new Set<string>();
const markers=path.join(coreDirectory,'managed-git');fs.mkdirSync(markers,{recursive:true});
const hooks=path.join(markers,'empty-hooks');fs.mkdirSync(hooks,{recursive:true});const emptyConfig=path.join(markers,'empty.config');if(!fs.existsSync(emptyConfig))fs.writeFileSync(emptyConfig,'',{flag:'wx',mode:0o600});
function environment(){const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|SystemRoot|WINDIR|TEMP|TMP)$/i.test(key)));return {...env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:emptyConfig,GIT_TERMINAL_PROMPT:'0'};}
async function git(cwd:string,args:string[],trim=true){const owner=caller.getStore();if(!owner)throw new EngineError(503,'Missing Git operation owner');const {stdout}=await runLimited(owner,gitExecutable(),['-c','safe.directory='+cwd,'-c','core.hooksPath='+hooks,'-c','core.fsmonitor=false','-c','commit.gpgSign=false','-c','core.autocrlf=false','-c','user.name=AMU Development','-c','user.email=development@amu.local','--literal-pathspecs',...args],{cwd,env:environment(),windowsHide:true,timeout:10000,maxBuffer:131072,encoding:'utf8'});return trim?String(stdout).trimEnd():String(stdout);}
function base(w:ReturnType<typeof workspace>){return path.dirname(scopedPath(w,'workspace-boundary.txt').target);}
async function lock<T>(id:string,fn:()=>Promise<T>){if(busy.size>=2||busy.has(id))throw new EngineError(429,'Git operation already running or capacity reached');busy.add(id);try{return await fn();}finally{busy.delete(id);}}
function managed(w:ReturnType<typeof workspace>){const marker=path.join(markers,w.id+'.json');if(!fs.existsSync(marker))throw new EngineError(403,'Git writes are restricted to AMU-created working copies');const record=JSON.parse(fs.readFileSync(marker,'utf8')),dir=base(w),metadata=path.join(dir,'.git');if(record.root!==w.root||!fs.existsSync(metadata)||fs.lstatSync(metadata).isSymbolicLink()||!fs.statSync(metadata).isDirectory()||fs.realpathSync(metadata)!==metadata)throw new EngineError(403,'Invalid managed Git directory');const config=path.join(metadata,'config');if(fs.lstatSync(config).isSymbolicLink()||contentHash(fs.readFileSync(config,'utf8'))!==record.configHash)throw new EngineError(409,'Git configuration changed; manual review required');return dir;}
export async function developmentGit(id:string,action:string,body:any,owner:string,admin=false){
 const w=workspace(id,owner,admin);if(!w.tools.includes('git_status'))throw new EngineError(403,'Git permission required');
 return caller.run(owner,()=>lock(id,async()=>{
  if(action==='status'){const cwd=base(w);try{const repository=await git(cwd,['rev-parse','--show-toplevel']),branch=await git(cwd,['symbolic-ref','--short','-q','HEAD']).catch(()=>'(detached)'),status=await git(cwd,['--no-optional-locks','status','--porcelain=v1','--untracked-files=normal','--','.']);return {workspaceId:id,repository,branch,status,statusHash:contentHash(status),managed:fs.existsSync(path.join(markers,w.id+'.json')),readOnly:true};}catch(error){if(error instanceof EngineError)throw error;throw new EngineError(409,'Git repository unavailable');}}
  if(!admin)throw new EngineError(403,'Administrator approval required');if(w.readOnly)throw new EngineError(403,'Workspace is read-only');
  if(action==='copy'){
   if(body?.approve!==true)throw new EngineError(403,'Explicit working-copy approval required');if(!w.tools.includes('read_file'))throw new EngineError(403,'Read permission required');const listing=listFiles(w);if(listing.truncated||listing.files.length>200)throw new EngineError(413,'Working copy limited to 200 complete source files');
   let size=0;const files=listing.files.map(file=>{const p=scopedPath(w,file),s=readControlled(p.relative);if(!fs.readFileSync(p.target).equals(Buffer.from(s.content)))throw new EngineError(422,'Working copies currently support UTF-8 source files only');size+=Buffer.byteLength(s.content);if(size>4*1024**2)throw new EngineError(413,'Working copy exceeds 4 MiB');return {path:file,content:s.content,sha256:s.sha256};});
   const relative='scratch/core/workspaces/managed-'+crypto.randomUUID(),target=path.dirname(controlledPath(relative+'/workspace-boundary.txt'));fs.mkdirSync(target,{recursive:true});
   for(const f of files){const destination=path.join(target,f.path);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,f.content,{flag:'wx',mode:0o600});}
   await git(target,['init','--initial-branch=amu/development']);await git(target,['add','--','.']);await git(target,['commit','--allow-empty','-m','AMU source snapshot']);
   const copy=registerWorkspace({name:w.name+' · Arbeitskopie',root:relative,tools:w.tools},owner),head=await git(target,['rev-parse','HEAD']);writePrivateJson(path.join(markers,copy.id+'.json'),{root:copy.root,sourceWorkspaceId:w.id,sourceFiles:files.map(({path,sha256})=>({path,sha256})),checkpoint:head,configHash:contentHash(fs.readFileSync(path.join(target,'.git/config'),'utf8'))},true);return {workspace:copy,branch:'amu/development',checkpoint:head,sourceUntouched:true};
  }
  if(action==='commit'){
   const cwd=managed(w);if(body?.approve!==true||!Array.isArray(body.files)||!body.files.length||body.files.length>12||typeof body.statusHash!=='string')throw new EngineError(400,'Approve 1–12 exact files and the displayed Git status hash');
   const status=await git(cwd,['--no-optional-locks','status','--porcelain=v1','--untracked-files=normal']);if(contentHash(status)!==body.statusHash)throw new EngineError(409,'Git status changed; reload and approve again');if(await git(cwd,['diff','--cached','--name-only']))throw new EngineError(409,'Existing staged work is protected');
   const files=body.files.map((f:any)=>{if(typeof f?.path!=='string')throw new EngineError(400,'File path and hash required');const p=scopedPath(w,f.path,true),actual=fs.existsSync(p.target)?readControlled(p.relative).sha256:null;if(actual!==f.sha256)throw new EngineError(409,'File changed before commit');return f.path;});
   // Caller approves explicit paths and current content. Other unstaged work is never staged.
   const checkpoint=await git(cwd,['rev-parse','HEAD']),journal=path.join(markers,w.id+'.checkpoint.json');writePrivateJson(journal,{workspaceId:id,checkpoint,status:'staging',files:body.files,at:new Date().toISOString()},true);
   await git(cwd,['add','--',...files]);
   const staged=(await git(cwd,['diff','--cached','--name-only','-z'])).split('\0').filter(Boolean);if(staged.some(f=>!files.includes(f)))throw new EngineError(409,'Unexpected staged files; retained for manual review');
   for(const file of body.files){if(file.sha256===null){if(await git(cwd,['ls-files','--',file.path]))throw new EngineError(409,'Deletion changed during staging');}else if(contentHash(await git(cwd,['show','--no-ext-diff','--no-textconv',':'+file.path],false))!==file.sha256)throw new EngineError(409,'Staged content differs from approved hash; retained for review');}
   if(await git(cwd,['rev-parse','HEAD'])!==checkpoint)throw new EngineError(409,'Git HEAD changed during approval');
   const commit=await git(cwd,['commit','-m','AMU approved development checkpoint']),head=await git(cwd,['rev-parse','HEAD']);writePrivateJson(journal,{workspaceId:id,checkpoint,head,status:'committed',files:body.files,at:new Date().toISOString()},true);return {checkpoint,head,output:commit,localOnly:true};
  }
  throw new EngineError(400,'Unknown development Git action');
 }));
}
