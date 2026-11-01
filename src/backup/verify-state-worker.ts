import {parentPort,workerData} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
let failure:'open'|'query'|'integrity'='open';
try{
 const databases:Array<{path:string;integrity:string}>=[];
 for(const entry of workerData as Array<{file:string;relative:string}>){failure='open';const database=new DatabaseSync(path.toNamespacedPath(entry.file),{readOnly:true});try{failure='query';database.exec('PRAGMA cache_size=-8192');const check=database.prepare('PRAGMA quick_check(1)').get()?.quick_check;if(check!=='ok'){failure='integrity';throw Error('Invalid database');}databases.push({path:entry.relative,integrity:'ok'});}finally{database.close();}}
 parentPort?.postMessage({ok:true,databases});
}catch{parentPort?.postMessage({ok:false,failure});}
