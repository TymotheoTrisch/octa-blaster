@echo off
setlocal
title OctaBlaster - Auxiliar ChatGPT local
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 22.22.2 ou superior antes de executar o auxiliar.
  pause
  exit /b 1
)
if not exist "node_modules\jose\package.json" (
  where pnpm >nul 2>nul
  if errorlevel 1 (
    echo Instale o pnpm 10 ou superior para preparar as dependencias do auxiliar.
    pause
    exit /b 1
  )
  call pnpm install --frozen-lockfile --ignore-scripts
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
