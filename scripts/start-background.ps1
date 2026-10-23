param()
$ErrorActionPreference='Stop'
$projectRoot=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$node=Join-Path $env:ProgramFiles 'nodejs/node.exe'
if(-not(Test-Path -LiteralPath $node)){throw 'Node.js runtime not found'}
$state=Join-Path $projectRoot 'scratch'
New-Item -ItemType Directory -Path $state -Force | Out-Null
$stdout=Join-Path $state 'windows-start.stdout.log'
$stderr=Join-Path $state 'windows-start.stderr.log'
$process=Start-Process -FilePath $node -ArgumentList ('"{0}"' -f (Join-Path $projectRoot 'scripts/supervise.mjs')) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -Wait
exit $process.ExitCode
