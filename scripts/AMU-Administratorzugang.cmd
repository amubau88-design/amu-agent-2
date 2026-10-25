@echo off
cd /d "%~dp0.."
node --experimental-strip-types scripts/owner-access.mjs
if errorlevel 1 goto end
start "" "http://127.0.0.1:3030/admin"
:end
pause
