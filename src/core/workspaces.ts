import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {EngineError} from '../inference/models.ts';
import {writePrivateJson} from '../central/storage.ts';
import {controlledPath,readControlled,contentHash,coreDirectory,createProposal,applyProposal,replacementDiff} from './tools.ts';
const run=promisify(execFile),root=fs.realpathSync('.'),file=path.join(coreDirectory,'workspace-registry.json');
const processOwners=new Set<string>();let activeProcesses=0;
async function runLimited(owner:string,executable:string,args:string[],options:any){if(activeProcesses>=2||processOwners.has(owner))throw new EngineError(429,'Coding subprocess capacity reached: two globally, one per owner');activeProcesses++;processOwners.add(owner);try{return await run(executable,args,{...options,encoding:'utf8'});}finally{activeProcesses--;processOwners.delete(owner);}}
export const codingTools=['list_files','read_file','search_code','prepare_patch','show_diff','apply_patch','run_test','git_status'] as const;
type Tool=typeof codingTools[number];
export type Workspace={id:string;name:string;root:string;owner:string;clients:string[];tools:Tool[];enabled:boolean;createdAt:string};
function records():Workspace[]{const rows=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];if(!Array.isArray(rows))throw new EngineError(503,'Workspace registry is invalid; preserved');return rows;}
const workspaceRoot=(relative:string)=>path.dirname(controlledPath(relative+'/workspace-boundary.txt'));
const visible=(w:Workspace,owner:string,admin:boolean)=>admin||w.owner===owner||w.clients.includes(owner);
export const listWorkspaces=(owner:string,admin=false)=>records().filter(w=>visible(w,owner,admin));
export function workspace(id:string,owner:string,admin=false){const w=records().find(w=>w.id===id&&visible(w,owner,admin));if(!w)throw new EngineError(404,'Workspace not found');if(!w.enabled)throw new EngineError(403,'Workspace disabled');workspaceRoot(w.root);return w;}
export function authorizeWorkspaceFile(id:string,file:string,owner:string,tool:Tool,admin=false){const w=workspace(id,owner,admin);if(!w.tools.includes(tool))throw new EngineError(403,'Tool is not approved for this workspace');const relative=path.posix.relative(w.root,file.replaceAll('\\','/'));scopedPath(w,relative,tool==='prepare_patch'||tool==='apply_patch');return {workspace:w,relative};}
/** Registered roots cannot be reached through the backwards-compatible unscoped task API. */
export function assertTaskWorkspaceScope(files:any,id:any,owner:string,admin=false){
 if(!Array.isArray(files))return;
 if(id!==undefined){for(const file of files)authorizeWorkspaceFile(id,file,owner,'read_file',admin);return;}
 if(admin)return;const protectedRoots=records();for(const file of files){const relative=path.relative(root,controlledPath(file)).replaceAll('\\','/');if(protectedRoots.some(w=>relative===w.root||relative.startsWith(w.root+'/')))throw new EngineError(403,'Registered project files require an explicit workspace grant and workspaceId');}
}
export function registerWorkspace(body:any,owner:string){
 if(typeof body?.name!=='string'||!body.name.trim()||body.name.length>100||typeof body.root!=='string')throw new EngineError(400,'Workspace name and project-relative root required');
 const target=workspaceRoot(body.root),relative=path.relative(root,target).replaceAll('\\','/');if(!fs.existsSync(target))throw new EngineError(404,'Workspace directory does not exist; create it inside an approved AMU area first');if(!fs.statSync(target).isDirectory())throw new EngineError(400,'Workspace root must be an existing directory');
 const rows=records();if(rows.length>=100)throw new EngineError(409,'Workspace limit reached');if(rows.some(w=>w.root===relative||w.root.startsWith(relative+'/')||relative.startsWith(w.root+'/')))throw new EngineError(409,'Workspace already registered or overlaps another project');
 const tools=validateTools(body.tools??['list_files','read_file','search_code','show_diff','git_status']);
 const w:Workspace={id:crypto.randomUUID(),name:body.name.trim(),root:relative,owner,clients:[],tools,enabled:true,createdAt:new Date().toISOString()};writePrivateJson(file,[...rows,w],true);return w;
}
function validateTools(value:any):Tool[]{if(!Array.isArray(value)||value.some(v=>!codingTools.includes(v)))throw new EngineError(400,'Unknown coding tool');return [...new Set(value)] as Tool[];}
export function configureWorkspace(id:string,body:any){const rows=records(),w=rows.find(w=>w.id===id);if(!w)throw new EngineError(404,'Workspace not found');if(body.tools!==undefined)w.tools=validateTools(body.tools);if(body.clients!==undefined){if(!Array.isArray(body.clients)||body.clients.length>100||body.clients.some((v:any)=>typeof v!=='string'||!/^[a-f0-9-]{36}$/.test(v)))throw new EngineError(400,'Invalid client grants');w.clients=[...new Set<string>(body.clients)];}if(body.enabled!==undefined){if(typeof body.enabled!=='boolean')throw new EngineError(400,'enabled must be boolean');w.enabled=body.enabled;}writePrivateJson(file,rows,true);return w;}
function scopedPath(w:Workspace,value:any,write=false){if(typeof value!=='string'||value.includes('\\')||value.includes(':')||path.isAbsolute(value)||value.split('/').some(s=>s==='..'||s==='.'||s.startsWith('.')))throw new EngineError(403,'Only plain workspace-relative paths are allowed');const relative=path.posix.join(w.root,value);const target=controlledPath(relative,write),rel=path.relative(workspaceRoot(w.root),target);if(rel.startsWith('..')||path.isAbsolute(rel))throw new EngineError(403,'Path escapes workspace');return {relative,target};}
function listFiles(w:Workspace,sub=''){
 const base=scopedPath(w,sub),files:string[]=[],dirs=[{target:base.target,relative:sub,depth:0}];let visited=0,truncated=false;
 if(!fs.existsSync(base.target)||!fs.statSync(base.target).isDirectory())throw new EngineError(404,'Workspace subdirectory not found');
 while(dirs.length){const dir=dirs.pop()!;if(++visited>300){truncated=true;break;}for(const entry of fs.readdirSync(dir.target,{withFileTypes:true})){if(entry.name.startsWith('.')||['node_modules','secrets','backups'].includes(entry.name))continue;const relative=path.posix.join(dir.relative,entry.name);try{scopedPath(w,relative);}catch{continue;}if(entry.isSymbolicLink())continue;if(entry.isDirectory()){if(dir.depth<8)dirs.push({target:path.join(dir.target,entry.name),relative,depth:dir.depth+1});else truncated=true;}else if(entry.isFile()){files.push(relative);if(files.length>=1000){truncated=true;return {files:files.sort(),truncated};}}}}
 return {files:files.sort(),truncated};
}
const auditFile=path.join(coreDirectory,'coding-tools.ndjson');
function audit(data:object){if(fs.existsSync(auditFile)&&fs.statSync(auditFile).size>1024**2){if(fs.existsSync(auditFile+'.previous'))fs.unlinkSync(auditFile+'.previous');fs.renameSync(auditFile,auditFile+'.previous');}fs.appendFileSync(auditFile,JSON.stringify({at:new Date().toISOString(),...data})+'\n',{mode:0o600});}
export function toolAudit(){return fs.existsSync(auditFile)?fs.readFileSync(auditFile,'utf8').trim().split('\n').slice(-50).map(line=>JSON.parse(line)):[];}
/** Typed, bounded AMU tools. No shell text, npm scripts or model-supplied executables. */
export async function executeCodingTool(id:string,request:any,owner:string,admin=false,signal?:AbortSignal){
 const started=Date.now(),requestId=crypto.randomUUID();let tool:string='invalid';
 try{
  if(request?.version!==1||typeof request.name!=='string'||!codingTools.includes(request.name)||!request.arguments||typeof request.arguments!=='object'||Array.isArray(request.arguments))throw new EngineError(400,'Expected AMU tool protocol version 1, name and arguments object');
  tool=request.name;const w=workspace(id,owner,admin),args=request.arguments;if(!w.tools.includes(tool as Tool))throw new EngineError(403,'Tool is not approved for this workspace');
  if(tool==='apply_patch'&&!admin)throw new EngineError(403,'Only the administrator can approve file changes');signal?.throwIfAborted();let result:any;
  if(tool==='list_files')result=listFiles(w,args.path||'');
  else if(tool==='read_file'){const p=scopedPath(w,args.path);result=readControlled(p.relative);}
  else if(tool==='search_code'){
   if(typeof args.query!=='string'||!args.query||args.query.length>200)throw new EngineError(400,'Search requires 1–200 literal characters');const listing=listFiles(w,args.path||''),matches:any[]=[];let bytes=0,scanned=0;
   for(const name of listing.files){signal?.throwIfAborted();if(++scanned>200||bytes>2*1024**2)break;try{const p=scopedPath(w,name),source=readControlled(p.relative);bytes+=Buffer.byteLength(source.content);source.content.split(/\r?\n/).forEach((line,index)=>{if(matches.length<100&&line.includes(args.query))matches.push({path:name,line:index+1,text:line.slice(0,400)});});}catch{}if(matches.length>=100)break;}
   result={matches,scanned,truncated:listing.truncated||scanned<listing.files.length||matches.length>=100};
  }else if(tool==='prepare_patch'){
   const p=scopedPath(w,args.path,true);const original=fs.existsSync(p.target)?readControlled(p.relative):null;if(args.baseHash!==(original?.sha256??null))throw new EngineError(409,'Read the current file and supply its exact baseHash first');
   const taskId=crypto.randomUUID(),proposal=createProposal(taskId,p.relative,args.content,args.baseHash);const task={id:taskId,owner,workspaceId:w.id,goal:'Review controlled workspace replacement',files:[p.relative],state:'review',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),steps:[{action:'workspace_patch_prepared',workspaceId:w.id}],proposals:[proposal.id]};
   try{writePrivateJson(path.join(coreDirectory,taskId+'.task.json'),task,true);}catch(error){throw new EngineError(503,'Review task could not be persisted; patch was not applied');}result={taskId,proposalId:proposal.id,contentHash:contentHash(proposal.content),reviewRequired:true};
  }else if(tool==='show_diff'||tool==='apply_patch'){
   if(typeof args.proposalId!=='string'||!/^[a-f0-9-]{36}$/.test(args.proposalId))throw new EngineError(400,'Invalid proposal id');const pfile=path.join(coreDirectory,args.proposalId+'.proposal.json');if(!fs.existsSync(pfile))throw new EngineError(404,'Proposal not found');const proposal=JSON.parse(fs.readFileSync(pfile,'utf8')),task=JSON.parse(fs.readFileSync(path.join(coreDirectory,proposal.taskId+'.task.json'),'utf8'));
   if(!admin&&task.owner!==owner)throw new EngineError(404,'Proposal not found');const relative=path.posix.relative(w.root,proposal.file);scopedPath(w,relative,true);if(!task.steps.some((s:any)=>s.workspaceId===w.id))throw new EngineError(403,'Proposal belongs to another workspace');
   if(tool==='show_diff'){const original=fs.existsSync(controlledPath(proposal.file))?readControlled(proposal.file).content:'';result={proposalId:proposal.id,file:relative,before:original,after:proposal.content,diff:replacementDiff(relative,original,proposal.content,proposal.baseHash!==null),expectedContentHash:contentHash(proposal.content),risk:proposal.risk,status:proposal.status};}
   else{if(args.approve!==true||args.expectedContentHash!==contentHash(proposal.content))throw new EngineError(403,'Approve the exact displayed patch hash');result=applyProposal(proposal.id,{approveCritical:true,expectedContentHash:args.expectedContentHash});task.state='completed';task.updatedAt=new Date().toISOString();task.steps.push({action:'apply_approved',proposalId:proposal.id,at:task.updatedAt});writePrivateJson(path.join(coreDirectory,task.id+'.task.json'),task,true);}
  }else if(tool==='run_test'){
   const p=scopedPath(w,args.path);if(args.profile!=='javascript-syntax'||!/\.[cm]?js$/.test(p.target))throw new EngineError(400,'Only the fixed javascript-syntax profile for .js/.mjs/.cjs files is enabled');
   if(fs.statSync(p.target).size>128*1024)throw new EngineError(413,'Test input too large');const environment={...process.env};delete environment.NODE_OPTIONS;delete environment.NODE_PATH;
   try{const output=await runLimited(owner,process.execPath,['--check',p.target],{cwd:workspaceRoot(w.root),env:environment,windowsHide:true,timeout:10000,maxBuffer:16384,signal});result={profile:'javascript-syntax',passed:true,stdout:output.stdout,stderr:output.stderr,executesSource:false};}catch(error){if(error instanceof EngineError)throw error;const e=error as any;if(e.killed||signal?.aborted)throw new EngineError(504,'Syntax check cancelled or timed out');result={profile:'javascript-syntax',passed:false,stdout:String(e.stdout||'').slice(0,16000),stderr:String(e.stderr||'Syntax check failed').slice(0,16000),executesSource:false};}
  }else if(tool==='git_status'){
   const output=await runLimited(owner,'git',['-c','safe.directory='+root,'-c','core.fsmonitor=false','--literal-pathspecs','--no-optional-locks','status','--porcelain=v1','--untracked-files=normal','--',w.root],{cwd:root,windowsHide:true,timeout:5000,maxBuffer:32768,signal});result={status:output.stdout,workspace:w.root,readOnly:true};
  }
  signal?.throwIfAborted();audit({requestId,workspaceId:id,owner,tool,ok:true,durationMs:Date.now()-started});return {version:1,requestId,ok:true,result,durationMs:Date.now()-started};
 }catch(error){const status=error instanceof EngineError?error.status:503;audit({requestId,workspaceId:id,owner,tool,ok:false,status,durationMs:Date.now()-started});throw error;}
}
