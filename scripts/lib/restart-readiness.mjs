/** Evidence assessment only: never authorizes a reboot or installation. */
export function restartAssessment({environment,services,health,backup,verification,recovery,web,now=Date.now()}){
 const blockers=[],warnings=[];
 const fresh=(at)=>Number.isFinite(Date.parse(at))&&now-Date.parse(at)>=0&&now-Date.parse(at)<=10*60*1000;
 if(!environment?.readOnly||!fresh(environment.at)||environment.limitations?.length)blockers.push('Fresh complete read-only environment inventory required');
 if(!fresh(services?.at)||!services?.lastBoot)blockers.push('Fresh boot and service inventory required');
 if(health?.status!=='ready'||health?.inferenceReady!==true||health?.maintenance!==false||health?.active!==0||health?.queued!==0)blockers.push('API must be ready and idle; recheck immediately before restart');
 if(!fresh(backup?.createdAt)||!backup?.id||verification?.backupId!==backup.id||verification?.verified!==true||verification?.authenticated!==true)blockers.push('Matching authenticated backup verification required');
 if(!fresh(recovery?.at)||!recovery?.authenticatedExtraction||recovery?.webRestoredIntegrity!=='ok'||!(recovery?.sqlDumpBytes>0))blockers.push('Verified WEB/configuration and database recovery supplement required');
 if(!fresh(web?.checkedAt)||!web?.sourceHashesUnchanged||web?.databaseIntegrity!=='ok'||web?.cardsCount!==2||!web?.countsUnchanged)blockers.push('WEB source, database and two-card checks required');
 const task=services?.tasks?.find(t=>t.name==='AMU-Agent-2 Central AI');
 if(!task||task.state!=='Running'||task.actions?.length!==1||!task.actions[0].Arguments?.includes('start-background.ps1'))blockers.push('Existing AMU AI logon task must be verified');
 if(!environment?.features?.some(f=>f.name==='VirtualMachinePlatform'&&f.enabled))blockers.push('VirtualMachinePlatform is not enabled');
 warnings.push('Owner must save work, stop new writes and approve an ordinary Windows restart separately; never force-close applications');
 warnings.push('AMU AI logon task loads current source, not the previously running version; verify version, authentication and streaming after logon');
 warnings.push('WEB uses its existing manual launcher; no new autostart installed');
 warnings.push('XAMPP dump extracted and hashed only; a live SQL restore has not been tested');
 return {evidenceComplete:blockers.length===0,blockers,warnings,rebootAuthorized:false,rebootPerformed:false,installationAuthorized:false,realRunnerAccepted:false,requiresImmediateRecheck:true};
}
export function compareRestart(before,after){
 const a=Date.parse(before?.lastBoot),b=Date.parse(after?.lastBoot);
 return {bootChanged:Number.isFinite(a)&&Number.isFinite(b)&&b>a,hypervisorPresent:after?.hypervisorPresent===true,runnerAccepted:false};
}

