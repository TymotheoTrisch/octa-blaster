@echo off
setlocal
title OctaBlaster - Instalar IA no Firefox
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\Install.ps1"
if errorlevel 1 echo Falha na instalacao. Confira se Node.js 22.22.2+ e pnpm 10+ estao instalados.
pause
