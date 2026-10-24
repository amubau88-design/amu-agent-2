import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));process.chdir(root);
const [action,id,confirmation]=process.argv.slice(2);
// Undo loads the preserved tool even when scripts/ was replaced by older code.
const moduleUrl=action==='undo'&&/^[a-f0-9-]{36}$/.test(id||'')?pathToFileURL(path.join(root,'scratch/rollback',id,'recovery.mjs')):new URL('./lib/manual-rollback.mjs',import.meta.url);
const tools=await import(moduleUrl.href);
try{
 await tools.assertOffline(root);
 let result;
 if(action==='prepare')result=tools.prepareRollback(root,path.resolve(id||''));
 else if(action==='apply')result=tools.applyRollback(root,id,confirmation);
 else if(action==='undo')result=tools.undoRollback(root,id,confirmation);
 else throw Error('Usage: node scripts/manual-rollback.mjs prepare <verified-restore-directory> | apply <id> <confirmationHash> | undo <id> <confirmationHash>');
 console.log(JSON.stringify(result,null,2));
}catch(error){console.error(JSON.stringify({success:false,message:error.message,automaticActivation:false}));process.exitCode=1;}
