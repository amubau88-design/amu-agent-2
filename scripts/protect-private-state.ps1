param([string]$AdditionalAccount = '')
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$accounts = @($identity, 'NT AUTHORITY\SYSTEM')
if ($AdditionalAccount) { $accounts += $AdditionalAccount }
foreach ($relative in @('scratch\secrets', 'scratch\core', 'scratch\backups', 'scratch\migrations')) {
    $target = [IO.Path]::GetFullPath((Join-Path $projectRoot $relative))
    if (-not $target.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Private-state path outside project' }
    if (-not (Test-Path -LiteralPath $target)) { New-Item -ItemType Directory -Path $target | Out-Null }
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($account in ($accounts | Select-Object -Unique)) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($account, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $target -AclObject $acl
    Write-Output "Protected: $relative"
}
