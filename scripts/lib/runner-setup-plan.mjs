import {runnerStoragePlan} from './runner-storage-plan.mjs';
const GiB=1024**3;
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
/** Resource recommendations are admission thresholds, never an isolation certificate. */
export function runnerSetupPlan(inventory,storageReport,storagePolicy){
 if(inventory?.schemaVersion!==2||inventory.readOnly!==true)throw Error('A schema 2 read-only inventory is required');
 const cpu=inventory.hardware?.processors;
 const total=inventory.hardware?.totalMemoryBytes,free=inventory.operatingSystem?.freeMemoryBytes;
 const threads=Array.isArray(cpu)?cpu.reduce((n,p)=>n+(positive(p.NumberOfLogicalProcessors)?p.NumberOfLogicalProcessors:0),0):0;
 const blockers=[],warnings=[];const build=inventory.operatingSystem?.build;
 const age=Date.now()-Date.parse(inventory.at||'');if(!Number.isFinite(age)||age<0||age>=86400000)blockers.push('Inventory is missing a current timestamp; repeat the read-only probe');
 if(!Number.isSafeInteger(build)||build<19041)blockers.push('Windows build 19041+ not established; modern WSL installation cannot be assumed');
 if(!Array.isArray(cpu)||!cpu.length||!cpu.every(p=>p.VirtualizationFirmwareEnabled===true&&p.VMMonitorModeExtensions===true&&p.SecondLevelAddressTranslationExtensions===true))blockers.push('Firmware virtualization and SLAT not established');
 if(!positive(total)||!positive(free)||threads<4||total<12*GiB||free<6*GiB)blockers.push('Insufficient or unknown CPU/RAM reserve for concurrent inference and runner');
 // Keep at least 3 GiB of currently free RAM for Windows/inference; cap the starter VM at 4 GiB.
 const memoryGiB=positive(free)?Math.max(0,Math.min(4,Math.floor(free/GiB)-3)):0;
 const processors=Math.min(2,Math.max(0,threads-2));
 const volumes=Array.isArray(inventory.storage?.fixedVolumes)?inventory.storage.fixedVolumes:[];
 const storageReview=storageReport?runnerStoragePlan(storageReport,storagePolicy):null;
 const knownInternal=volume=>{const mappings=(inventory.storage?.volumeMappings||[]).filter(m=>m.volume===volume.DeviceID);if(mappings.length!==1)return false;const physical=(inventory.storage?.physicalDisks||[]).filter(d=>String(d.FriendlyName).trim().toUpperCase()===String(mappings[0].model).trim().toUpperCase());return physical.length===1&&['SATA','NVMe','SAS','ATA'].includes(physical[0].BusType)&&['SSD','HDD'].includes(physical[0].MediaType);};
 const eligibleVolumes=storageReview?storageReview.plan.eligibleVolumes.map(v=>({volume:v.volume,freeGiB:Math.floor(v.freeBytes/GiB),selectionApproved:false})):storagePolicy?.protectedDiskIdentities?.length?[]:volumes.filter(v=>/^[A-Z]:$/i.test(v.DeviceID||'')&&positive(v.FreeSpace)&&v.FreeSpace>=20*GiB&&knownInternal(v)).map(v=>({volume:v.DeviceID,freeGiB:Math.floor(v.FreeSpace/GiB),selectionApproved:false}));
 if(!storageReview&&storagePolicy?.protectedDiskIdentities?.length)blockers.push('Detailed storage inventory required to respect owner-protected disk identities');
 if(!eligibleVolumes.length)blockers.push('No inventoried volume with at least 20 GiB free; no installation target approved');
 if(storageReview?.plan.recommendation?.kind==='new_partition_requires_owner_approval')blockers.push('Internal HDD has unallocated capacity, not filesystem free space; partition/format and prior-data review require explicit owner approval');
 if(storageReview?.plan.limitations.length)blockers.push('Detailed storage inventory incomplete; no target can be selected safely');
 if(storageReview?.plan.ownerProtectedDisks.length)blockers.push('Owner explicitly protected disk(s); leave unchanged, no partition proposal for these identities');
 if(!positive(inventory.storage?.freeBytes)||inventory.storage.freeBytes<20*GiB)warnings.push('Project volume below the 20 GiB starter reserve; do not install a WSL rootfs or images there');
 if(!inventory.features?.some(f=>f.name==='VirtualMachinePlatform'&&f.enabled===true))blockers.push('VirtualMachinePlatform disabled or unknown; explicit system-change approval and reboot required');
 const version=inventory.wsl?.queries?.find(q=>Array.isArray(q.arguments)&&q.arguments.length===1&&q.arguments[0]==='--version');
 const parsed=typeof version?.stdout==='string'?version.stdout.match(/WSL[^\r\n\d]*(\d+)\.(\d+)\.(\d+)/i):null;
 const systemdVersion=!!parsed&&(Number(parsed[1])>=1||Number(parsed[1])===0&&(Number(parsed[2])>67||Number(parsed[2])===67&&Number(parsed[3])>=6));
 if(version?.exitCode!==0||!systemdVersion)blockers.push('Modern WSL version not established; systemd-capable WSL must be installed/updated after approval');
 if(inventory.hardware?.hypervisorPresent!==true)blockers.push('No running hypervisor established');
 warnings.push('WSL is a candidate only: real rootless Docker, cgroup v2/systemd delegation and acceptance remain unverified');
 if(inventory.wsl?.globalConfigurationExists)warnings.push('Existing global .wslconfig must be reviewed and merged explicitly; never overwrite');
 return {schemaVersion:1,generatedAt:new Date().toISOString(),inventoryAt:inventory.at||null,strategy:'dedicated WSL2 distro + rootless Docker, conditional on storage and owner approval',installationAuthorized:false,rebootAuthorized:false,networkChangeAuthorized:false,readyForInstallation:blockers.length===0,realRunnerRunning:false,isolationAccepted:false,blockers,warnings,resources:{memoryGiB,processors,swapGiB:1,hostFreeReserveGiB:3,minimumTargetFreeGiB:20,maxParallelJobs:1,profile:{memoryMiB:512,cpuCount:1,wallTimeMs:10000,processCount:32,outputBytes:8192}},eligibleVolumes,storageReview,requiredApprovals:['Installation location with sufficient free space','VirtualMachinePlatform activation, WSL update and dedicated Linux installation','Separate scheduled reboot with AMU API interruption','Linux packages, dedicated user and rootless Docker setup','Independent isolation acceptance and exact mTLS connection/source-transfer approval']};
}
