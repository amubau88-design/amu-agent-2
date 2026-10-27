import crypto from 'node:crypto';
const GiB=1024**3;
const internalBus=new Set(['SATA','NVMe','SAS','ATA']);
export const storagePlanDigest=plan=>crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex');
const bytes=n=>Number.isSafeInteger(n)&&n>=0;
/** A physical-disk-aware proposal, never permission to alter a disk or run project code. */
export function runnerStoragePlan(report,policy={protectedDiskIdentities:[],preferredPartitionBytes:100*GiB}){
 if(report?.schemaVersion!==2||report.readOnly!==true||!Array.isArray(report.disks)||!Array.isArray(report.partitions)||!Array.isArray(report.volumes))throw Error('A complete schema 2 read-only storage inventory is required');
 const age=Date.now()-Date.parse(report.at);if(!Number.isFinite(age)||age<0||age>=86400000)throw Error('Storage inventory expired or invalid; repeat read-only inventory');
 if(new Set(report.disks.map(d=>d.Number)).size!==report.disks.length)throw Error('Ambiguous physical disk numbers');
 if(!Array.isArray(policy.protectedDiskIdentities)||policy.protectedDiskIdentities.some(id=>!/^[a-f0-9]{64}$/.test(id))||policy.preferredPartitionBytes!==null&&(!Number.isSafeInteger(policy.preferredPartitionBytes)||policy.preferredPartitionBytes<20*GiB))throw Error('Invalid storage protection policy');
 const limitations=Array.isArray(report.limitations)?report.limitations:[],eligibleVolumes=[],temporaryUsb=[],unallocatedCandidates=[],ownerProtectedDisks=[];
 const seen=new Set();for(const p of report.partitions){const d=report.disks.find(d=>d.Number===p.diskNumber),id=p.diskNumber+':'+p.partitionNumber;if(!d||!Number.isInteger(p.partitionNumber)||p.partitionNumber<1||seen.has(id)||!bytes(p.offset)||!bytes(p.size)||p.offset+p.size>d.Size)throw Error('Ambiguous or invalid partition metadata');seen.add(id);}
 for(const disk of report.disks){
  if(!Number.isSafeInteger(disk.Number)||disk.Number<0||!bytes(disk.Size)||!Number.isInteger(disk.NumberOfPartitions)||disk.NumberOfPartitions<0||!bytes(disk.LargestFreeExtent)||disk.LargestFreeExtent>disk.Size||!/^[a-f0-9]{64}$/.test(disk.IdentitySha256||''))throw Error('Invalid physical disk identity/capacity');
  const partitions=report.partitions.filter(p=>p.diskNumber===disk.Number);
  const complete=partitions.length===disk.NumberOfPartitions;
  if(policy.protectedDiskIdentities.includes(disk.IdentitySha256)){ownerProtectedDisks.push({diskNumber:disk.Number,diskIdentitySha256:disk.IdentitySha256,ownerHold:true});continue;}
  for(const part of partitions){
   const volume=part.volume,letter=part.driveLetter,identity={diskNumber:disk.Number,diskIdentitySha256:disk.IdentitySha256,partitionNumber:part.partitionNumber,volume:/^[A-Z]$/i.test(letter||'')?letter.toUpperCase()+':':null};
   if(!volume||!bytes(volume.Size)||!bytes(volume.SizeRemaining)||volume.SizeRemaining>volume.Size)continue;
   if(disk.BusType==='USB'){temporaryUsb.push({...identity,label:volume.FileSystemLabel||'',fileSystem:volume.FileSystem,capacityBytes:volume.Size,freeBytes:volume.SizeRemaining,usableForTemporaryFiles:disk.IsOffline===false&&disk.IsReadOnly===false&&disk.HealthStatus==='Healthy'&&volume.HealthStatus==='Healthy'&&!!identity.volume&&['NTFS','exFAT','FAT32'].includes(volume.FileSystem),maximumSingleFileBytes:volume.FileSystem==='FAT32'?2**32-1:null,temporaryOnly:true,permanentRunnerEligible:false,brandVerified:false,capacityWriteVerified:false});continue;}
   if(internalBus.has(disk.BusType)&&disk.IsOffline===false&&disk.IsReadOnly===false&&disk.HealthStatus==='Healthy'&&complete&&volume.HealthStatus==='Healthy'&&identity.volume&&volume.FileSystem==='NTFS'&&!part.isSystem&&!part.isHidden&&volume.SizeRemaining>=20*GiB)eligibleVolumes.push({...identity,freeBytes:volume.SizeRemaining,installationRoot:identity.volume+'\\AMU-Runner',selectionApproved:false});
  }
  const proposedBytes=policy.preferredPartitionBytes===null?Math.floor(disk.LargestFreeExtent/1048576)*1048576:policy.preferredPartitionBytes;
  if(internalBus.has(disk.BusType)&&disk.IsOffline===false&&disk.IsReadOnly===false&&disk.IsBoot===false&&disk.IsSystem===false&&disk.HealthStatus==='Healthy'&&complete&&disk.NumberOfPartitions===0&&['MBR','GPT'].includes(disk.PartitionStyle)&&proposedBytes>=20*GiB&&disk.LargestFreeExtent>=proposedBytes)unallocatedCandidates.push({diskNumber:disk.Number,diskIdentitySha256:disk.IdentitySha256,model:disk.FriendlyName,partitionStyle:disk.PartitionStyle,unallocatedLargestExtentBytes:disk.LargestFreeExtent,proposedPartitionBytes:proposedBytes,dataAbsenceVerified:false,requiresPartitionAndFormatApproval:true});
 }
 // Existing volumes (including CD-ROM/removable) must never be reassigned implicitly.
 const used=new Set(report.volumes.map(v=>String(v.DriveLetter||'').toUpperCase()).filter(Boolean));
 const letter=['R','S','T','U','V'].find(l=>!used.has(l)&&!report.partitions.some(p=>String(p.driveLetter).toUpperCase()===l));
 const recommendation=limitations.length===0?(eligibleVolumes[0]?{kind:'existing_internal_ntfs',...eligibleVolumes[0]}:unallocatedCandidates[0]&&letter?{kind:'new_partition_requires_owner_approval',...unallocatedCandidates[0],proposedDriveLetter:letter,proposedInstallationRoot:letter+':\\AMU-Runner',wslPath:letter+':\\AMU-Runner\\WSL\\AMU-Runner',stagingPath:letter+':\\AMU-Runner\\Install',restOfDisk:'leave unallocated and unchanged'}:null):null;
 const plan={schemaVersion:1,inventoryAt:report.at,minimumFreeBytes:20*GiB,ownerProtectedDisks,eligibleVolumes,temporaryUsb,unallocatedCandidates,recommendation,limitations,systemChanged:false,installationAuthorized:false,partitioningAuthorized:false,dataMoveAuthorized:false,executionAuthorized:false,realIsolationVerified:false};
 return {plan,digest:storagePlanDigest(plan)};
}
/** Recheck the exact displayed metadata before considering any later owner-approved action. */
export function assertStoragePlanCurrent(plan,expectedDigest,currentReport,policy){
 if(storagePlanDigest(plan)!==expectedDigest)throw Error('Displayed storage plan was modified');
 const current=runnerStoragePlan(currentReport,policy).plan;
 // Timestamp alone is not a disk change. All bound capacities, bus/identity and target selections must match.
 if(storagePlanDigest({...current,inventoryAt:plan.inventoryAt})!==expectedDigest)throw Error('Storage layout, identity, free space or target changed; prepare a new plan');
 return {current:true,executionAuthorized:false,partitioningAuthorized:false};
}
