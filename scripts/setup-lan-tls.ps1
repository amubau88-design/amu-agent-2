# Requires PowerShell 7 / modern .NET. Creates local files only, no certificate-store or firewall changes.
param([string]$OwnerAccount=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -lt 7){throw 'Run this script with PowerShell 7 (pwsh)'}
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$private=Join-Path $projectRoot 'scratch/secrets/tls'
$public=Join-Path $projectRoot 'scratch/tls-public'
if(Test-Path -LiteralPath $private){throw 'TLS directory already exists; existing certificates were not replaced'}
New-Item -ItemType Directory -Path $private,$public -Force | Out-Null
$now=[DateTimeOffset]::UtcNow
$caKey=[Security.Cryptography.RSA]::Create(3072)
$caRequest=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=AMU-Agent-2 Local CA',$caKey,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
$caRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($true,$false,0,$true))
$caRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new([Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyCertSign -bor [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::CrlSign,$true))
$ca=$caRequest.CreateSelfSigned($now.AddMinutes(-5),$now.AddYears(2))
$serverKey=[Security.Cryptography.RSA]::Create(3072)
$serverRequest=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=AMU-Agent-2',$serverKey,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
$serverRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false,$false,0,$true))
$serverRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new([Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment,$true))
$usage=[Security.Cryptography.OidCollection]::new();[void]$usage.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1'))
$serverRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($usage,$false))
$san=[Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new();$hostname=[Net.Dns]::GetHostName();$san.AddDnsName($hostname);$san.AddDnsName('localhost');$san.AddIpAddress([Net.IPAddress]::Loopback);$san.AddIpAddress([Net.IPAddress]::IPv6Loopback)
$addresses=@([Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() | Where-Object OperationalStatus -eq 'Up' | ForEach-Object {$_.GetIPProperties().UnicastAddresses} | Where-Object {$_.Address.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork -and $_.Address.ToString() -match '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)'} | ForEach-Object {$_.Address.ToString()} | Sort-Object -Unique)
foreach($address in $addresses){$san.AddIpAddress([Net.IPAddress]::Parse($address))}
$serverRequest.CertificateExtensions.Add($san.Build())
$serial=[byte[]]::new(16);[Security.Cryptography.RandomNumberGenerator]::Fill($serial)
$server=$serverRequest.Create($ca,$now.AddMinutes(-5),$now.AddYears(1),$serial)
[IO.File]::WriteAllText((Join-Path $private 'ca-key.pem'),$caKey.ExportPkcs8PrivateKeyPem())
[IO.File]::WriteAllText((Join-Path $private 'server-key.pem'),$serverKey.ExportPkcs8PrivateKeyPem())
[IO.File]::WriteAllText((Join-Path $private 'server-cert.pem'),$server.ExportCertificatePem())
[IO.File]::WriteAllText((Join-Path $public 'amu-ca.pem'),$ca.ExportCertificatePem())
$runner=[Security.Principal.WindowsIdentity]::GetCurrent().Name
foreach($file in 'ca-key.pem','server-key.pem'){
 & icacls (Join-Path $private $file) /inheritance:r /grant:r ('{0}:(F)' -f $OwnerAccount) ('{0}:(F)' -f $runner) 'SYSTEM:(F)' | Out-Null
 if($LASTEXITCODE -ne 0){throw 'TLS private-key ACL could not be secured'}
}
$report=@{createdAt=(Get-Date -Format o);hostname=$hostname;privateAddresses=$addresses;certificateExpires=$server.NotAfter.ToUniversalTime().ToString('o');caFile=(Join-Path $public 'amu-ca.pem');serverCertificate=(Join-Path $private 'server-cert.pem');serverKey=(Join-Path $private 'server-key.pem');certificateStoreModified=$false;firewallModified=$false;lanListenerEnabled=$false}
$report|ConvertTo-Json -Depth 4|Set-Content (Join-Path $public 'preparation.json') -Encoding utf8
$server.Dispose();$ca.Dispose();$serverKey.Dispose();$caKey.Dispose()
$report|ConvertTo-Json -Depth 4
