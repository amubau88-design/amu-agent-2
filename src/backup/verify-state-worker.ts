import {parentPort,workerData} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
try{
 const databases:Array<{path:string;integrity:string}>=[];
 for(const entry of workerData as Array<{file:string;relative:string}>){const database=new DatabaseSync(entry.file,{readOnly:true});try{database.exec('PRAGMA cache_size=-8192');if(database.prepare('PRAGMA quick_check(1)').get()?.quick_check!=='ok')throw Error('Invalid database');databases.push({path:entry.relative,integrity:'ok'});}finally{database.close();}}
 parentPort?.postMessage({ok:true,databases});
}catch{parentPort?.postMessage({ok:false});}
