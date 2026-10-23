import fs from 'node:fs';
import crypto from 'node:crypto';
/** Same-volume replace, bounded retry for transient Windows readers. Never truncate the destination. */
export function writePrivateJson(file:string,value:unknown){
 const temporary=file+'.'+crypto.randomUUID()+'.tmp';
 try{fs.writeFileSync(temporary,JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});for(let attempt=0;;attempt++){try{fs.renameSync(temporary,file);break;}catch(error){if(attempt===2||!['EPERM','EBUSY','EACCES'].includes((error as NodeJS.ErrnoException).code||''))throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);}}}
 finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
