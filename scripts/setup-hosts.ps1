# setup-hosts.ps1
$hostsPath = "C:\Windows\System32\drivers\etc\hosts"
$entry = "127.0.0.1 agent2.amu.test"

try {
    $content = Get-Content $hostsPath -Raw
    if ($content -notmatch "agent2\.amu\.test") {
        Add-Content -Path $hostsPath -Value "`r`n$entry" -Force
        ipconfig /flushdns
        Write-Host "Domain agent2.amu.test erfolgreich registriert!" -ForegroundColor Green
    } else {
        Write-Host "Domain agent2.amu.test ist bereits in der hosts-Datei eingetragen." -ForegroundColor Yellow
    }
} catch {
    Write-Warning "Administrator-Rechte erforderlich zum Schreiben in $hostsPath."
    Write-Host "Bitte führen Sie das Skript 'scripts\setup-hosts.bat' oder PowerShell als Administrator aus:" -ForegroundColor Cyan
    Write-Host "Start-Process powershell -Verb RunAs -ArgumentList '-File scripts\setup-hosts.ps1'" -ForegroundColor Cyan
}
