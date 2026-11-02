# Explicit owner-authorized LAN rule; never changes other rules or network categories.
$ErrorActionPreference='Stop'
$taskPrincipal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $taskPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Elevated Windows administrator required; no firewall setting changed'}
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskProfile=Get-Content -LiteralPath (Join-Path $taskRoot 'scratch/secrets/lan-listener.json') -Raw | ConvertFrom-Json
if(-not $taskProfile.enabled -or $taskProfile.port -ne 8080 -or $taskProfile.allowRemoteAdmin -or @($taskProfile.allowedCidrs).Count -ne 1 -or $taskProfile.allowedCidrs[0] -ne '192.168.2.0/24'){throw 'Reviewed LAN profile changed; no firewall change'}
$taskAddress=Get-NetIPAddress -AddressFamily IPv4 -IPAddress '192.168.2.100' -ErrorAction Stop
$taskSocket=@(Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction Stop)
if($taskSocket.Count -ne 1){throw 'Exactly one existing approved listener required'}
$taskApiPid=[int](Get-Content -LiteralPath (Join-Path $taskRoot 'scratch/central-server.pid') -Raw)
if($taskSocket[0].OwningProcess -ne $taskApiPid){throw 'Listener is not the existing AMU API process'}
$taskProcess=Get-CimInstance Win32_Process -Filter ('ProcessId='+$taskSocket[0].OwningProcess)
$taskProgram=$taskProcess.ExecutablePath
if($taskProgram -ne 'C:\Program Files\nodejs\node.exe'){throw 'Listener executable differs; no firewall change'}
$taskName='AMU-AI-8080'
$taskExisting=Get-NetFirewallRule -Name $taskName -ErrorAction SilentlyContinue
$taskCreated=$false
if($taskExisting){
 $taskPorts=$taskExisting|Get-NetFirewallPortFilter;$taskAddresses=$taskExisting|Get-NetFirewallAddressFilter;$taskApp=$taskExisting|Get-NetFirewallApplicationFilter
 if($taskExisting.Direction -ne 'Inbound' -or $taskExisting.Action -ne 'Allow' -or $taskPorts.LocalPort -ne '8080' -or @($taskAddresses.LocalAddress).Count -ne 1 -or @($taskAddresses.LocalAddress)[0] -ne '192.168.2.100' -or @($taskAddresses.RemoteAddress).Count -ne 1 -or @($taskAddresses.RemoteAddress)[0] -notin @('192.168.2.0/24','192.168.2.0/255.255.255.0') -or $taskApp.Program -ne $taskProgram){throw 'Existing rule differs; preserved without changes'}
}else{
 New-NetFirewallRule -Name $taskName -DisplayName $taskName -Description 'Owner-authorized AMU HTTPS LAN; source subnet and executable restricted; local administration only' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 -LocalAddress '192.168.2.100' -RemoteAddress '192.168.2.0/24' -Program $taskProgram -InterfaceAlias $taskAddress.InterfaceAlias -Profile Any -EdgeTraversalPolicy Block -Enabled True | Out-Null
 $taskCreated=$true
}
$taskRule=Get-NetFirewallRule -PolicyStore ActiveStore -Name $taskName
$taskResult=[ordered]@{created=$taskCreated;name=$taskName;enabled=[string]$taskRule.Enabled;localAddress='192.168.2.100';remoteSubnet='192.168.2.0/24';port=8080;protocol='TCP';program=$taskProgram;interface=$taskAddress.InterfaceAlias;otherRulesChanged=$false;networkCategoryChanged=$false;restartPerformed=$false}
$taskResult|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $taskRoot 'scratch/ecosystem-firewall-result.json')
$taskResult|ConvertTo-Json -Compress
