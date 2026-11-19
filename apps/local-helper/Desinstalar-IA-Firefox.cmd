@echo off
setlocal
powershell.exe -NoProfile -Command "Remove-Item -LiteralPath 'HKCU:\Software\Mozilla\NativeMessagingHosts\com.octablaster.ai' -ErrorAction SilentlyContinue"
echo Integracao removida do Firefox. As credenciais protegidas foram preservadas; use Sair na extensao antes de desinstalar para encerrar a sessao.
pause
