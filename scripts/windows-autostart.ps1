param([ValidateSet('Install','Status','Start','Stop','Remove')][string]$Action='Status')
$ErrorActionPreference='Stop'
$taskName='AMU-Agent-2 Central AI'
$projectRoot=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$script=Join-Path $PSScriptRoot 'start-background.ps1'
$executable=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$arguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "{0}"' -f $script
$existing=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if($existing -and ($existing.Actions.Count -ne 1 -or $existing.Actions[0].Execute -ne $executable -or $existing.Actions[0].Arguments -ne $arguments)){throw 'An unrelated scheduled task has this name; no task overwritten'}
if($Action -eq 'Install'){
 if(-not $existing){
  $identity=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $taskAction=New-ScheduledTaskAction -Execute $executable -Argument $arguments -WorkingDirectory $projectRoot
  $trigger=New-ScheduledTaskTrigger -AtLogOn -User $identity
  $principal=New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
  $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings -Description 'Local AMU-Agent-2 AI/API supervisor; starts on this user logon, no other AMU projects.' | Out-Null
 }
}elseif($Action -eq 'Start'){if(-not $existing){throw 'AMU autostart task is not installed'};Start-ScheduledTask -TaskName $taskName}
elseif($Action -eq 'Stop'){
 if(-not $existing){throw 'AMU autostart task is not installed'}
 $pidFile=Join-Path $projectRoot 'scratch/central-supervisor.pid'
 $ownedProcess=$null
 if(Test-Path -LiteralPath $pidFile){
  $supervisorPid=[int](Get-Content -LiteralPath $pidFile -Raw)
  $candidate=Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $supervisorPid)
  if($candidate){
   $expected=Join-Path $projectRoot 'scripts/supervise.mjs'
   if(-not $candidate.CommandLine -or $candidate.CommandLine.IndexOf($expected,[StringComparison]::OrdinalIgnoreCase) -lt 0){throw 'Supervisor process identity could not be verified; no unknown process stopped'}
   $ownedProcess=$candidate
  }
 }
 Stop-ScheduledTask -TaskName $taskName
 if($ownedProcess){
  $remaining=Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $ownedProcess.ProcessId)
  if($remaining -and $remaining.CreationDate -eq $ownedProcess.CreationDate){Stop-Process -Id $ownedProcess.ProcessId -ErrorAction Stop}
 }
}
elseif($Action -eq 'Remove'){if($existing){Unregister-ScheduledTask -TaskName $taskName -Confirm:$false}}
$task=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if(-not $task){@{installed=$false;name=$taskName}|ConvertTo-Json;exit 0}
$info=Get-ScheduledTaskInfo -TaskName $taskName
$report=@{checkedAt=(Get-Date -Format o);installed=$true;name=$taskName;state=[string]$task.State;user=$task.Principal.UserId;logonType=[string]$task.Principal.LogonType;lastRunTime=[string]$info.LastRunTime;lastResult=$info.LastTaskResult;multipleInstances=[string]$task.Settings.MultipleInstances;script=$script};$report|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $projectRoot 'scratch/windows-autostart-status.json') -Encoding UTF8;$report|ConvertTo-Json
