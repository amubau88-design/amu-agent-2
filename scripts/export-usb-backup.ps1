#requires -Version 7.0
# Copies an already verified encrypted archive only. Never formats, deletes or moves source files.
param(
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9-]{36}$')][string]$BackupId,
 [Parameter(Mandatory=$true)][uint32]$DiskNumber,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedDiskIdentitySha256,
 [Parameter(Mandatory=$true)][ValidatePattern('^[A-Z]$')][string]$DriveLetter,
 [Parameter(Mandatory=$true)][string]$ExpectedVolumeLabel
)
$ErrorActionPreference='Stop'
$disk=Get-Disk -Number $DiskNumber
if([string]$disk.BusType -ne 'USB' -or $disk.IsBoot -or $disk.IsSystem -or $disk.IsOffline -or $disk.IsReadOnly){throw 'Only an online writable non-system USB disk may receive the export'}
$identity=[ordered]@{uniqueId=[string]$disk.UniqueId;model=[string]$disk.FriendlyName;bus=[string]$disk.BusType;bytes=$disk.Size} | ConvertTo-Json -Compress
$sha=[Security.Cryptography.SHA256]::Create();try{$fingerprint=[Convert]::ToHexString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($identity))).ToLowerInvariant()}finally{$sha.Dispose()}
if($fingerprint -ne $ExpectedDiskIdentitySha256){throw 'USB disk identity changed; export refused'}
$partitions=@(Get-Partition -DiskNumber $DiskNumber | Where-Object {[string]$_.DriveLetter -eq $DriveLetter})
if($partitions.Count -ne 1){throw 'Drive letter does not belong unambiguously to the reviewed USB disk'}
$volume=$partitions[0] | Get-Volume
if($volume.FileSystemLabel -ne $ExpectedVolumeLabel -or $volume.HealthStatus -ne 'Healthy' -or $volume.FileSystem -notin @('NTFS','exFAT')){throw 'Reviewed healthy USB filesystem/label required'}
$node=Get-Command node -CommandType Application | Select-Object -First 1
$script=Join-Path $PSScriptRoot 'encrypted-backup.mjs'
& $node.Source $script export $BackupId ($DriveLetter+':\')
if($LASTEXITCODE -ne 0){throw 'Encrypted export failed; existing files and local backup were preserved'}
