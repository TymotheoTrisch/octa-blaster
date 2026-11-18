@echo off
setlocal
title OctaBlaster - Firefox
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js precisa estar instalado para executar esta versao de teste.
  echo Instale as dependencias do projeto antes de tentar novamente.
  pause
  exit /b 1
)

if not exist "node_modules\web-ext\bin\web-ext.js" (
  echo As dependencias do projeto ainda nao foram instaladas.
  echo Execute pnpm install na pasta do projeto e tente novamente.
  pause
  exit /b 1
)

if not exist ".output\firefox-mv2\manifest.json" (
  echo O build para Firefox ainda nao foi gerado.
  echo Execute pnpm build:firefox na pasta do projeto e tente novamente.
  pause
  exit /b 1
)

set "OCTABLASTER_FIREFOX="
if exist "%ProgramFiles%\Mozilla Firefox\firefox.exe" set "OCTABLASTER_FIREFOX=%ProgramFiles%\Mozilla Firefox\firefox.exe"
if not defined OCTABLASTER_FIREFOX if exist "%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe" set "OCTABLASTER_FIREFOX=%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe"
if not defined OCTABLASTER_FIREFOX if exist "%LOCALAPPDATA%\Mozilla Firefox\firefox.exe" set "OCTABLASTER_FIREFOX=%LOCALAPPDATA%\Mozilla Firefox\firefox.exe"
if not defined OCTABLASTER_FIREFOX (
  echo Firefox nao encontrado. Instale o Firefox e tente novamente.
  pause
  exit /b 1
)

set "OCTABLASTER_PROFILE=%LOCALAPPDATA%\OctaBlaster\Firefox-Teste"
if not exist "%OCTABLASTER_PROFILE%\" (
  mkdir "%OCTABLASTER_PROFILE%"
  if errorlevel 1 (
    echo Nao foi possivel criar a pasta do perfil do Firefox.
    echo Verifique as permissoes da pasta %LOCALAPPDATA%\OctaBlaster.
    pause
    exit /b 1
  )
)

echo Abrindo o Firefox com o OctaBlaster em modo de teste.
echo Entre na sua conta do Octadesk na janela que sera aberta.
echo Perfil salvo em %OCTABLASTER_PROFILE%
echo Mantenha esta janela aberta enquanto utiliza a extensao.
echo.

node "node_modules\web-ext\bin\web-ext.js" run --source-dir ".output\firefox-mv2" --firefox "%OCTABLASTER_FIREFOX%" --firefox-profile "%OCTABLASTER_PROFILE%" --profile-create-if-missing --keep-profile-changes --no-reload --start-url "https://app.octadesk.com"
set "OCTABLASTER_EXIT=%ERRORLEVEL%"
if not "%OCTABLASTER_EXIT%"=="0" (
  echo.
  echo Nao foi possivel iniciar ou manter a sessao. Confira a mensagem acima.
  pause
)
exit /b %OCTABLASTER_EXIT%
