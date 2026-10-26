#requires -Version 7.0
# Metadata only: never mounts, initializes, formats, assigns letters, enumerates files or moves data.
$ErrorActionPreference='Stop'
$errors=@();$disks=@();$partitions=@();$volumes=@();$physical=@();$logical=@();$cimDisks=@()
try {$physical=@(Get-PhysicalDisk | Select-Object DeviceId,FriendlyName,MediaType,BusType,Size,HealthStatus,OperationalStatus)}catch {$errors+='PhysicalDisk: '+$_.Exception.GetType().Name}
try {$cimDisks=@(Get-CimInstance Win32_DiskDrive | Select-Object Index,Model,InterfaceType,MediaType,Size,Status)}catch {$errors+='DiskDrive: '+$_.Exception.GetType().Name}
try {$logical=@(Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,DriveType,VolumeName,FileSystem,Size,FreeSpace)}catch {$errors+='LogicalDisk: '+$_.Exception.GetType().Name}
try {$volumes=@(Get-Volume | Select-Object DriveLetter,FileSystemLabel,FileSystem,DriveType,Size,SizeRemaining,HealthStatus,OperationalStatus,Path)}catch {$errors+='Volume: '+$_.Exception.GetType().Name}
try {
 foreach($disk in @(Get-Disk)){
  $identity=[ordered]@{uniqueId=[string]$disk.UniqueId;model=[string]$disk.FriendlyName;bus=[string]$disk.BusType;bytes=$disk.Size} | ConvertTo-Json -Compress
  $sha=[Security.Cryptography.SHA256]::Create();try{$fingerprint=[Convert]::ToHexString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($identity))).ToLowerInvariant()}finally{$sha.Dispose()}
  $row=$disk | Select-Object Number,FriendlyName,BusType,Size,PartitionStyle,NumberOfPartitions,LargestFreeExtent,IsOffline,IsReadOnly,IsBoot,IsSystem,HealthStatus,OperationalStatus,OfflineReason
  $row | Add-Member -NotePropertyName IdentitySha256 -NotePropertyValue $fingerprint;$disks+=$row
  if($disk.NumberOfPartitions -eq 0){continue}
  try {foreach($part in @(Get-Partition -DiskNumber $disk.Number)){
   $volume=$null;try{$volume=$part | Get-Volume -ErrorAction Stop}catch{}
   $partitions+=@{diskNumber=$disk.Number;partitionNumber=$part.PartitionNumber;driveLetter=if([int]$part.DriveLetter -ne 0){[string]$part.DriveLetter}else{$null};size=$part.Size;offset=$part.Offset;type=$part.Type;gptType=$part.GptType;mbrType=$part.MbrType;isHidden=$part.IsHidden;isBoot=$part.IsBoot;isSystem=$part.IsSystem;accessPaths=@($part.AccessPaths);volume=if($volume){$volume | Select-Object FileSystemLabel,FileSystem,Size,SizeRemaining,HealthStatus,OperationalStatus}else{$null}}
  }}catch {$errors+='Partitions disk '+$disk.Number+': '+$_.Exception.GetType().Name}
 }
}catch {$errors+='Disk: '+$_.Exception.GetType().Name}
[ordered]@{schemaVersion=2;at=[DateTime]::UtcNow.ToString('o');readOnly=$true;disks=$disks;partitions=$partitions;volumes=$volumes;physicalDisks=$physical;cimDisks=$cimDisks;logicalDisks=$logical;limitations=$errors;contentEnumerated=$false;writeBenchmarkPerformed=$false;systemChanged=$false} | ConvertTo-Json -Depth 9
