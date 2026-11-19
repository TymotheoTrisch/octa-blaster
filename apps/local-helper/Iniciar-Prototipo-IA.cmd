@echo off
setlocal
title OctaBlaster - Prototipo ChatGPT local
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js antes de executar este prototipo.
  pause
  exit /b 1
)
if not exist "node_modules\jose\package.json" (
  call npm ci --ignore-scripts --no-audit --no-fund
  if errorlevel 1 (
    echo Nao foi possivel instalar a dependencia de validacao.
    pause
    exit /b 1
  )
)
echo Abra no navegador o endereco local que aparecera abaixo.
echo Mantenha esta janela aberta durante o teste.
echo.
node server.mjs
if errorlevel 1 pause
