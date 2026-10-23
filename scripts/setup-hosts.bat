@echo off
echo ========================================================
echo AMU-Agent-2: Lokale Testdomain agent2.amu.test einrichten
echo ========================================================
echo.
powershell -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -Command \"$h = ''C:\Windows\System32\drivers\etc\hosts''; $c = Get-Content $h -Raw; if ($c -notmatch ''agent2\.amu\.test'') { Add-Content -Path $h -Value ''`r`n127.0.0.1 agent2.amu.test'' -Force; ipconfig /flushdns; Write-Host ''Domain agent2.amu.test erfolgreich registriert!'' -ForegroundColor Green } else { Write-Host ''agent2.amu.test ist bereits in der hosts-Datei eingetragen.'' -ForegroundColor Yellow }; Start-Sleep -Seconds 2\"'"
