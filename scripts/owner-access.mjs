import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {writePrivateJson} from '../src/central/storage.ts';
const root=fs.realpathSync(fileURLToPath(new URL('..',import.meta.url))),directory=path.join(root,'scratch/secrets'),file=path.join(directory,'central-access.json');
export function ownerAuthorized(proof){return proof&&proof.currentSid&&proof.ownerSid&&(proof.currentSid===proof.ownerSid||proof.elevatedAdministrator===true);}
export function verifyOwner(){
 if(JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).name!=='amu-agent-2'||fs.lstatSync(file).isSymbolicLink()||fs.realpathSync(directory)!==directory)throw Error('Ungültiger oder verknüpfter AMU-Zugangspfad');
 if(process.platform==='win32'){
  const command="$i=[System.Security.Principal.WindowsIdentity]::GetCurrent();$p=New-Object System.Security.Principal.WindowsPrincipal($i);[pscustomobject]@{currentSid=$i.User.Value;ownerSid=([System.IO.File]::GetAccessControl($env:AMU_OWNER_CONFIG)).GetOwner([System.Security.Principal.SecurityIdentifier]).Value;elevatedAdministrator=$p.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)} | ConvertTo-Json -Compress";
  const proof=JSON.parse(execFileSync(path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,env:{...process.env,AMU_OWNER_CONFIG:file},timeout:10000}));
  if(!ownerAuthorized(proof))throw Error('Nur der nachgewiesene Dateieigentümer oder ein erhöhter Windows-Administrator darf einen Eigentümercode ausstellen');return {method:'Windows SID and file-owner check',authorized:true};
 }
 if(typeof process.getuid!=='function'||(process.getuid()!==0&&process.getuid()!==fs.statSync(file).uid))throw Error('Berechtigung des Dateieigentümers erforderlich');return {method:'POSIX uid/file owner',authorized:true};
}
export function issueOwnerCode(){const proof=verifyOwner(),config=JSON.parse(fs.readFileSync(file,'utf8')),admin=config.clients.filter(client=>client.admin&&client.enabled&&!client.revokedAt);if(admin.length!==1)throw Error('Hauptadministrator nicht eindeutig; bestehende Konfiguration bleibt unverändert');const code=crypto.randomBytes(32).toString('base64url'),expiresAt=Date.now()+300000;writePrivateJson(path.join(directory,'owner-login-grant.json'),{root,directory,clientId:admin[0].id,adminHash:admin[0].hash,hash:crypto.createHash('sha256').update(code).digest('hex'),expiresAt,proof:proof.method},true);return{code,expiresAt:new Date(expiresAt).toISOString(),proof};}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.includes('--verify-only'))console.log(JSON.stringify(verifyOwner()));else{const result=issueOwnerCode();console.log('AMU-Hauptadministrator: Eigentümerberechtigung bestätigt.\nDashboard öffnen: http://127.0.0.1:3030/admin\nEinmalcode (5 Minuten gültig; unter Eigentümer-Anmeldung einsetzen):\n'+result.code+'\nKeine bestehenden API-Schlüssel wurden zurückgesetzt.');}}catch(error){console.error(error.message);process.exitCode=1;}
}
