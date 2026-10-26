# Read-only inventory. Does not install, enable features, start containers, scan networks or execute project code.
param()
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
  $cpus=@(Get-CimInstance Win32_Processor | Select-Object Name,VirtualizationFirmwareEnabled,VMMonitorModeExtensions,SecondLevelAddressTranslationExtensions)
  $hardware=@{hypervisorPresent=$system.HypervisorPresent;processors=$cpus}
} catch {$limitations+='Hardware query unavailable: '+$_.Exception.GetType().Name}
try {
  $features=@(Get-CimInstance Win32_OptionalFeature | Where-Object {$_.Name -in @('VirtualMachinePlatform','Microsoft-Windows-Subsystem-Linux','Microsoft-Hyper-V-All','Containers-DisposableClientVM')} | ForEach-Object {
    @{name=$_.Name;installState=$_.InstallState;enabled=($_.InstallState -eq 1)}
  })
} catch {$limitations+='Windows feature query unavailable: '+$_.Exception.GetType().Name}
$connectionFile=Join-Path $projectRoot 'scratch/core/external-runner/connection.json'
$runner=@{configured=$false;endpoint=$null;networkTested=$false;isolationAccepted=$false}
if(Test-Path -LiteralPath $connectionFile){
  try {$config=Get-Content -LiteralPath $connectionFile -Raw | ConvertFrom-Json;$url=[Uri]$config.endpoint
    $runner.configured=$true;$runner.endpoint=$url.GetLeftPart([UriPartial]::Authority)
  } catch {$limitations+='Runner configuration unreadable; credentials omitted'}
}
[ordered]@{at=[DateTime]::UtcNow.ToString('o');readOnly=$true;commands=$commands;hardware=$hardware;features=$features;runner=$runner;limitations=$limitations;note='Installed binaries and enabled features do not establish runnable containers or accepted isolation. Use the actual Linux acceptance procedure before activation.'} | ConvertTo-Json -Depth 8
