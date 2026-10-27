# Read-only inventory. Does not install, enable features, start containers, scan networks or execute project code.
param([switch]$ProbeWsl)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$commands=@{}
foreach($name in @('docker','podman','wsl','ssh','WindowsSandbox')){
  $command=Get-Command $name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  $commands[$name]=@{installed=[bool]$command;path=if($command){$command.Source}else{$null};executableChecked=$false}
}
$hardware=$null;$features=@();$limitations=@()
try {
  $system=Get-CimInstance Win32_ComputerSystem
  $cpus=@(Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors,LoadPercentage,VirtualizationFirmwareEnabled,VMMonitorModeExtensions,SecondLevelAddressTranslationExtensions)
  $hardware=@{hypervisorPresent=$system.HypervisorPresent;processors=$cpus;totalMemoryBytes=$system.TotalPhysicalMemory}
} catch {$limitations+='Hardware query unavailable: '+$_.Exception.GetType().Name}
try {
  $features=@(Get-CimInstance Win32_OptionalFeature | Where-Object {$_.Name -in @('VirtualMachinePlatform','Microsoft-Windows-Subsystem-Linux','Microsoft-Hyper-V-All','Containers-DisposableClientVM')} | ForEach-Object {
    @{name=$_.Name;installState=$_.InstallState;enabled=($_.InstallState -eq 1)}
  })
} catch {$limitations+='Windows feature query unavailable: '+$_.Exception.GetType().Name}
$operatingSystem=$null;$storage=$null
try {
  $os=Get-CimInstance Win32_OperatingSystem
  $operatingSystem=@{caption=$os.Caption;version=$os.Version;build=[int]$os.BuildNumber;architecture=$os.OSArchitecture;lastBootTime=$os.LastBootUpTime.ToUniversalTime().ToString('o');freeMemoryBytes=([long]$os.FreePhysicalMemory*1024);modernWslInstallBuildSupported=([int]$os.BuildNumber -ge 19041)}
} catch {$limitations+='Operating-system query unavailable: '+$_.Exception.GetType().Name}
try {
  $drive=[IO.Path]::GetPathRoot($projectRoot).TrimEnd('\')
  $disk=Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$drive'"
  $physical=@(Get-PhysicalDisk -ErrorAction Stop | Select-Object FriendlyName,MediaType,BusType,Size,HealthStatus)
  $volumes=@(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object DeviceID,Size,FreeSpace)
  $mapping=@(foreach($volume in $volumes){
    $partitions=@(Get-CimAssociatedInstance -InputObject (Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($volume.DeviceID)'") -Association Win32_LogicalDiskToPartition)
    foreach($partition in $partitions){foreach($device in @(Get-CimAssociatedInstance -InputObject $partition -Association Win32_DiskDriveToDiskPartition)){
      @{volume=$volume.DeviceID;model=$device.Model;device=$device.DeviceID;diskIndex=$device.Index}
    }}
  })
  $storage=@{projectVolume=$drive;freeBytes=$disk.FreeSpace;sizeBytes=$disk.Size;physicalDisks=$physical;fixedVolumes=$volumes;volumeMappings=$mapping;physicalToVolumeMappingVerified=($mapping.Count -gt 0)}
} catch {$limitations+='Complete storage query unavailable: '+$_.Exception.GetType().Name
  if($disk){$storage=@{projectVolume=$drive;freeBytes=$disk.FreeSpace;sizeBytes=$disk.Size;physicalDisks=@();physicalToVolumeMappingVerified=$false}}
}
$wslQueries=@()
if($ProbeWsl -and $commands.wsl.installed){
  $commands.wsl.executableChecked=$true
  foreach($arguments in @(@('--status'),@('--version'),@('--list','--verbose'))){
    $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$commands.wsl.path;$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
    $start.StandardOutputEncoding=[Text.Encoding]::Unicode;$start.StandardErrorEncoding=[Text.Encoding]::Unicode
    foreach($argument in $arguments){$start.ArgumentList.Add($argument)}
    $process=[Diagnostics.Process]::new();$process.StartInfo=$start
    try {
      [void]$process.Start();$stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
      $finished=$process.WaitForExit(10000);if(-not $finished){$process.Kill();$process.WaitForExit()}
      $wslQueries+=@{arguments=$arguments;timedOut=(-not $finished);exitCode=if($finished){$process.ExitCode}else{$null};stdout=$stdout.GetAwaiter().GetResult().Substring(0,[Math]::Min(4096,$stdout.Result.Length));stderr=$stderr.GetAwaiter().GetResult().Substring(0,[Math]::Min(4096,$stderr.Result.Length))}
    } catch {$wslQueries+=@{arguments=$arguments;error=$_.Exception.GetType().Name}}
    finally {$process.Dispose()}
  }
}
$wslConfig=Join-Path ([Environment]::GetFolderPath('UserProfile')) '.wslconfig'
$connectionFile=Join-Path $projectRoot 'scratch/core/external-runner/connection.json'
$runner=@{configured=$false;endpoint=$null;networkTested=$false;isolationAccepted=$false}
if(Test-Path -LiteralPath $connectionFile){
  try {$config=Get-Content -LiteralPath $connectionFile -Raw | ConvertFrom-Json;$url=[Uri]$config.endpoint
    $runner.configured=$true;$runner.endpoint=$url.GetLeftPart([UriPartial]::Authority)
  } catch {$limitations+='Runner configuration unreadable; credentials omitted'}
}
[ordered]@{schemaVersion=2;at=[DateTime]::UtcNow.ToString('o');readOnly=$true;commands=$commands;operatingSystem=$operatingSystem;hardware=$hardware;storage=$storage;wsl=@{queries=$wslQueries;globalConfigurationExists=(Test-Path -LiteralPath $wslConfig);globalConfigurationChanged=$false};features=$features;runner=$runner;limitations=$limitations;note='Installed binaries and enabled features do not establish runnable containers or accepted isolation. Use the actual Linux acceptance procedure before activation.'} | ConvertTo-Json -Depth 8
