# Test-only certificates. No certificate store, ACL, firewall, installation or host configuration changes.
param([Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$target=[IO.Path]::GetFullPath($Directory)
$prefix=Join-Path $projectRoot 'scratch/session13-runner-test-'
if(-not $target.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Only a session13-runner-test fixture directory is allowed'}
if([IO.Directory]::Exists($target)){throw 'TLS fixture target already exists; preserved'}
[IO.Directory]::CreateDirectory($target)|Out-Null
$now=[DateTimeOffset]::UtcNow
$caKey=[Security.Cryptography.RSA]::Create(2048)
$request=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=AMU Runner Fixture CA',$caKey,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
$request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($true,$false,0,$true))
$request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new([Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyCertSign,$true))
$ca=$request.CreateSelfSigned($now.AddMinutes(-5),$now.AddDays(2))
[IO.File]::WriteAllText((Join-Path $target 'ca.pem'),$ca.ExportCertificatePem())
foreach($name in @('server','client')){
 $rsa=[Security.Cryptography.RSA]::Create(2048)
 $r=[Security.Cryptography.X509Certificates.CertificateRequest]::new(('CN=AMU Runner Fixture '+$name),$rsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
 $r.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false,$false,0,$true))
 $r.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new([Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment,$true))
 $usage=[Security.Cryptography.OidCollection]::new();$oid=if($name -eq 'server'){'1.3.6.1.5.5.7.3.1'}else{'1.3.6.1.5.5.7.3.2'}
 [void]$usage.Add([Security.Cryptography.Oid]::new($oid));$r.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($usage,$true))
 if($name -eq 'server'){$san=[Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new();$san.AddIpAddress([Net.IPAddress]::Loopback);$r.CertificateExtensions.Add($san.Build())}
 $serial=[byte[]]::new(16);[Security.Cryptography.RandomNumberGenerator]::Fill($serial)
 $cert=$r.Create($ca,$now.AddMinutes(-5),$now.AddDays(1),$serial)
 [IO.File]::WriteAllText((Join-Path $target ($name+'.pem')),$cert.ExportCertificatePem())
 [IO.File]::WriteAllText((Join-Path $target ($name+'-key.pem')),$rsa.ExportPkcs8PrivateKeyPem())
 $cert.Dispose();$rsa.Dispose()
}
$ca.Dispose();$caKey.Dispose()
Write-Output 'Fixture-only CA/server/client certificates created; no host trust changes.'
