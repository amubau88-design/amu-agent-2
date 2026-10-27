import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';

/** Copy ciphertext only to a new private directory; never replace an existing export. */
export async function exportBackup(file,destination){
 const metadata=JSON.parse(await fs.promises.readFile(file+'.json','utf8'));
 if(!metadata.integrityVerified||!/^[a-f0-9]{64}$/.test(metadata.verifiedSha256||'')||path.basename(file)!==metadata.id+'.amubak')throw Error('Verify the encrypted backup before exporting it');
 const folder=path.resolve(destination),stat=await fs.promises.lstat(folder);
 if(!stat.isDirectory()||stat.isSymbolicLink()||path.resolve(await fs.promises.realpath(folder)).toLowerCase()!==folder.toLowerCase())throw Error('Export destination must be an existing directory without symbolic links');
 const source=await fs.promises.lstat(file);if(!source.isFile()||source.isSymbolicLink())throw Error('Invalid backup source');
 const disk=await fs.promises.statfs(folder);if(source.size+1024**3>disk.bavail*disk.bsize)throw Error('Not enough space on export medium (1 GiB reserve required)');
 const output=path.join(folder,'AMU-'+metadata.id+'-'+crypto.randomUUID());await fs.promises.mkdir(output,{mode:0o700});
 const temporary=path.join(output,metadata.id+'.amubak.partial'),final=temporary.slice(0,-8),hash=crypto.createHash('sha256');
 await pipeline(fs.createReadStream(file),new Transform({transform(chunk,_encoding,callback){hash.update(chunk);callback(null,chunk);}}),fs.createWriteStream(temporary,{flags:'wx',mode:0o600}));
 if(hash.digest('hex')!==metadata.verifiedSha256)throw Error('Encrypted backup changed or is corrupt; partial export was not published');
 const handle=await fs.promises.open(temporary,'r+');try{await handle.sync();}finally{await handle.close();}
 const readBack=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(temporary))readBack.update(chunk);
 if(readBack.digest('hex')!==metadata.verifiedSha256)throw Error('Destination read-back verification failed; export remains partial');
 await fs.promises.writeFile(final+'.json',JSON.stringify(metadata,null,2),{flag:'wx',mode:0o600});
 await fs.promises.rename(temporary,final);
 return {exported:true,directory:output,bytes:source.size,sha256:metadata.verifiedSha256,encrypted:true,destinationReadBackVerified:true,recoveryKeyIncluded:false};
}
