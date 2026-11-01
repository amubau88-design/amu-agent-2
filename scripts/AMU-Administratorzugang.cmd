@echo off
cd /d "%~dp0.."
node --experimental-strip-types scripts/owner-access.mjs
if errorlevel 1 goto end
if /I "%~1"=="--existing-tab" (
  echo Bitte den oben angezeigten Einmalcode im bereits vorhandenen AMU-Tab eingeben.
  echo Feld: Lokaler Eigentuemer-Einmalcode. Danach: Als Eigentuemer anmelden.
  echo Eine Anmeldung in einem anderen Browser meldet den eingebetteten Tab nicht an.
  goto end
)
start "" "http://127.0.0.1:3030/admin"
:end
pause
