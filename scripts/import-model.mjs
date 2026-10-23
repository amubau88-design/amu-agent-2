// Offline GGUF import. Never contacts an inference service or overwrites weights.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
const args=Object.fromEntries(process.argv.slice(2).reduce((pairs,value,i,all)=>value.startsWith('--')?[...pairs,[value.slice(2),all[i+1]]]:pairs,[]));
if(!args.file||!args.id||!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$/.test(args.id)||!/^[a-f0-9]{64}$/.test(args.sha256||''))throw Error('Usage: node scripts/import-model.mjs --file <GGUF> --id <model-id> --sha256 <checksum> --license <license-id>');
const directory=path.resolve(process.env.AMU_MODEL_DIR||'scratch/models');const relative=path.relative(process.cwd(),directory);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Model imports must remain inside this AMU project');
await fsp.mkdir(directory,{recursive:true});
const lockPath=path.join(directory,'.registry.lock'),token=crypto.randomUUID();let lock;
try{lock=fs.openSync(lockPath,'wx');}catch(error){if(error.code!=='EEXIST')throw error;const previous=JSON.parse(await fsp.readFile(lockPath,'utf8'));if(previous.root!==directory||!Number.isInteger(previous.pid)||previous.pid<1)throw Error('Unknown registry lock retained');try{process.kill(previous.pid,0);throw Error('Another model import is running');}catch(e){if(e.code!=='ESRCH')throw e;}await fsp.unlink(lockPath);lock=fs.openSync(lockPath,'wx');}
fs.writeFileSync(lock,JSON.stringify({pid:process.pid,root:directory,token}));fs.closeSync(lock);
try{
 const registryPath=path.join(directory,'registry.json');const registry=fs.existsSync(registryPath)?JSON.parse(await fsp.readFile(registryPath,'utf8')):[];
 if(!Array.isArray(registry)||registry.some(m=>m.id===args.id))throw Error('Model id already registered or registry invalid; no weights copied');
 const filename=args.id.replace(/[^a-zA-Z0-9._-]/g,'-')+'.gguf';const target=path.join(directory,filename);
 if(fs.existsSync(target))throw Error('Target already exists; no model overwritten');
 const source=await fsp.open(args.file,'r');const magic=Buffer.alloc(4);await source.read(magic,0,4,0);await source.close();if(magic.toString()!=='GGUF')throw Error('Source is not a GGUF model');
 const digest=crypto.createHash('sha256'),temporary=target+'.partial';
 try{await pipeline(fs.createReadStream(args.file),new Transform({transform(chunk,encoding,done){digest.update(chunk);done(null,chunk);}}),fs.createWriteStream(temporary,{flags:'wx'}));if(digest.digest('hex')!==args.sha256)throw Error('Source checksum mismatch; import refused');await fsp.rename(temporary,target);}catch(error){if(fs.existsSync(temporary))await fsp.unlink(temporary);throw error;}
 registry.push({id:args.id,filename,sha256:args.sha256,bytes:(await fsp.stat(target)).size,license:args.license||'unspecified'});
 const pending=registryPath+'.'+token+'.tmp';await fsp.writeFile(pending,JSON.stringify(registry,null,2),{flag:'wx'});await fsp.rename(pending,registryPath);
 console.log(JSON.stringify({imported:args.id,path:target,checksumVerified:true}));
}finally{if(fs.existsSync(lockPath)&&JSON.parse(await fsp.readFile(lockPath,'utf8')).token===token)await fsp.unlink(lockPath);}
