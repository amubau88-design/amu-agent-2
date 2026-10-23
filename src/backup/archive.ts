import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {once} from 'node:events';
import {EngineError} from '../inference/models.ts';

const magic='AMU-ENCRYPTED-2\n';
type Entry={path:string;bytes:number;sha256:string};
export const inside=(root:string,target:string)=>{const relative=path.relative(root,target);return relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative);};
export async function hashFile(file:string){const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');}
function keyFor(passphrase:string,salt:Buffer){if(typeof passphrase!=='string'||passphrase.length<12||passphrase.length>1024)throw new EngineError(400,'Backup passphrase must contain 12–1024 characters');return crypto.scryptSync(passphrase,salt,32,{N:32768,r:8,p:1,maxmem:64*1024**2});}
async function write(stream:NodeJS.WritableStream,data:Buffer|string){if(!stream.write(data))await once(stream,'drain');}
async function collect(root:string,relative:string,entries:Entry[]){const file=path.join(root,relative),stat=await fsp.lstat(file);if(stat.isSymbolicLink())throw new EngineError(403,'Backup refuses symbolic links');if(stat.isDirectory()){for(const child of await fsp.readdir(file))await collect(root,path.join(relative,child),entries);return;}if(!stat.isFile())throw new EngineError(400,'Unsupported backup file');entries.push({path:relative.split(path.sep).join('/'),bytes:stat.size,sha256:await hashFile(file)});}
export async function createArchive(root:string,output:string,passphrase:string,includes:string[],exclude:string[]=[],manifest?:object){
 if(fs.existsSync(output))throw new EngineError(409,'Backup destination already exists');
 const entries:Entry[]=[];for(const relative of includes){if(!inside(root,path.resolve(root,relative)))throw new EngineError(403,'Backup path outside project');if(fs.existsSync(path.join(root,relative)))await collect(root,relative,entries);}
 const files=entries.filter(e=>!exclude.some(prefix=>e.path===prefix||e.path.startsWith(prefix+'/')));if(new Set(files.map(e=>e.path)).size!==files.length)throw new EngineError(400,'Overlapping backup paths');
 const salt=crypto.randomBytes(32),iv=crypto.randomBytes(12),key=keyFor(passphrase,salt),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const header=Buffer.from(magic+JSON.stringify({salt:salt.toString('base64'),iv:iv.toString('base64'),kdf:'scrypt-32768-8-1',cipher:'aes-256-gcm'})+'\n');cipher.setAAD(header);
 const temporary=output+'.partial';await fsp.mkdir(path.dirname(output),{recursive:true});const disk=await fsp.statfs(path.dirname(output));if(files.reduce((n,e)=>n+e.bytes+16384,0)+1024**3>disk.bavail*disk.bsize){key.fill(0);throw new EngineError(507,'Insufficient disk space for encrypted backup and system reserve');}const out=fs.createWriteStream(temporary,{flags:'wx',mode:0o600});let outError:Error|undefined;out.on('error',error=>{outError=error;cipher.destroy(error);});
 const pipe=(async()=>{await write(out,header);for await(const chunk of cipher)await write(out,chunk);await write(out,cipher.getAuthTag());out.end();await once(out,'finish');if(!out.closed)await once(out,'close');})();
 void pipe.catch(()=>{});
 const record=async(value:object)=>{const body=Buffer.from(JSON.stringify(value));const length=Buffer.alloc(4);length.writeUInt32BE(body.length);await write(cipher,length);await write(cipher,body);};
 try{
  if(manifest){const data=Buffer.from(JSON.stringify(manifest));if(files.some(e=>e.path==='.amu-backup-manifest.json'))throw new EngineError(409,'Reserved backup manifest path');await record({path:'.amu-backup-manifest.json',bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')});await write(cipher,data);}
  for(const entry of files){await record(entry);const hash=crypto.createHash('sha256');let bytes=0;for await(const chunk of fs.createReadStream(path.join(root,entry.path))){hash.update(chunk);bytes+=chunk.length;await write(cipher,chunk);}if(bytes!==entry.bytes||hash.digest('hex')!==entry.sha256)throw new EngineError(409,'Source changed while creating backup: '+entry.path);}
  await record({end:true,count:files.length+(manifest?1:0)});cipher.end();await pipe;if(outError)throw outError;const durable=await fsp.open(temporary,'r+');try{await durable.sync();}finally{await durable.close();}await fsp.rename(temporary,output);return {files:files.length+(manifest?1:0),bytes:(await fsp.stat(output)).size};
 }catch(error){cipher.destroy();out.destroy();await pipe.catch(()=>{});throw error;}finally{key.fill(0);}
}

/** Decrypt only into a new staging directory; authentication failure never publishes a restore. */
export async function extractArchive(archive:string,output:string,passphrase:string){
 if(fs.existsSync(output))throw new EngineError(409,'Restore target already exists');
 const handle=await fsp.open(archive,'r');let stagingCreated=false;
 try{
  const stat=await handle.stat(),disk=await fsp.statfs(path.dirname(output));if(stat.size+1024**3>disk.bavail*disk.bsize)throw new EngineError(507,'Insufficient disk space for isolated restore and system reserve');const first=Buffer.alloc(Math.min(1024,stat.size));await handle.read(first,0,first.length,0);
  if(!first.subarray(0,magic.length).equals(Buffer.from(magic)))throw new EngineError(400,'Unsupported encrypted backup');
  const headerEnd=first.indexOf(10,magic.length);if(headerEnd<0)throw new EngineError(400,'Invalid backup header');
  const header=first.subarray(0,headerEnd+1),options=JSON.parse(first.subarray(magic.length,headerEnd).toString());
  const salt=Buffer.from(options.salt,'base64'),iv=Buffer.from(options.iv,'base64');if(salt.length!==32||iv.length!==12||options.kdf!=='scrypt-32768-8-1'||options.cipher!=='aes-256-gcm')throw new EngineError(400,'Invalid backup encryption parameters');
  const key=keyFor(passphrase,salt),decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);key.fill(0);decipher.setAAD(header);
  const tag=Buffer.alloc(16);await handle.read(tag,0,16,stat.size-16);decipher.setAuthTag(tag);
  await fsp.mkdir(output,{recursive:false});stagingCreated=true;
  let pending=Buffer.alloc(0),entry:Entry|undefined,remaining=0,descriptor:fsp.FileHandle|undefined,digest:crypto.Hash|undefined,complete=false,count=0;
  const paths=new Set<string>();let total=0;const maximumBytes=1024**4;
  async function consume(chunk:Buffer){pending=Buffer.concat([pending,chunk]);while(pending.length){
   if(complete)throw new EngineError(400,'Unexpected data after backup end');
   if(!entry){if(pending.length<4)return;const length=pending.readUInt32BE();if(length<2||length>16384)throw new EngineError(400,'Invalid backup record');if(pending.length<length+4)return;const record=JSON.parse(pending.subarray(4,length+4).toString());pending=pending.subarray(length+4);
    if(record.end===true){if(record.count!==count)throw new EngineError(400,'Backup file count mismatch');complete=true;continue;}
    if(typeof record.path!=='string'||record.path.includes('\\')||record.path.includes(':')||record.path.split('/').some((p:string)=>!p||p==='.'||p==='..')||!Number.isSafeInteger(record.bytes)||record.bytes<0||!/^[a-f0-9]{64}$/.test(record.sha256))throw new EngineError(400,'Invalid backup file metadata');
    const target=path.resolve(output,record.path);if(!inside(output,target)||paths.has(target.toLowerCase()))throw new EngineError(403,'Unsafe or duplicate restore path');paths.add(target.toLowerCase());total+=record.bytes;if(total>maximumBytes||++count>100000)throw new EngineError(413,'Restore size limit exceeded');
    await fsp.mkdir(path.dirname(target),{recursive:true});const realParent=await fsp.realpath(path.dirname(target)),realOutput=await fsp.realpath(output);if(realParent!==realOutput&&!inside(realOutput,realParent))throw new EngineError(403,'Restore directory escapes staging');descriptor=await fsp.open(target,'wx',0o600);entry=record;remaining=record.bytes;digest=crypto.createHash('sha256');
   }
   const bytes=Math.min(pending.length,remaining);if(bytes){const data=pending.subarray(0,bytes);await descriptor!.writeFile(data);digest!.update(data);remaining-=bytes;pending=pending.subarray(bytes);}
   if(remaining===0){await descriptor!.close();descriptor=undefined;if(digest!.digest('hex')!==entry!.sha256)throw new EngineError(400,'Restored file checksum mismatch');entry=undefined;}else return;
  }}
  try{for await(const chunk of fs.createReadStream(archive,{start:header.length,end:stat.size-17}))await consume(decipher.update(chunk));await consume(decipher.final());if(!complete||entry||pending.length)throw new EngineError(400,'Incomplete backup');}
  finally{await descriptor?.close();}
  return {files:count,bytes:total,authenticated:true};
 }catch(error){
  // This directory was exclusively created by this operation; never remove an existing target.
  if(stagingCreated){const parent=path.dirname(path.resolve(output));if(inside(parent,path.resolve(output))&&fs.existsSync(output)&&!fs.lstatSync(output).isSymbolicLink())await fsp.rm(output,{recursive:true,force:true});}
  throw error instanceof EngineError?error:new EngineError(400,'Backup authentication or integrity check failed');
 }finally{await handle.close();}
}
