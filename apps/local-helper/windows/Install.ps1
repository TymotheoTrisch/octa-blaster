$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path $PSScriptRoot -Parent
$destination = Join-Path $env:LOCALAPPDATA 'OctaBlaster\Auxiliar'
$nodeCommand = Get-Command node -ErrorAction Stop
$pnpmCommand = Get-Command pnpm -ErrorAction Stop
$nodeVersion = & $nodeCommand.Source --version
if ([version]$nodeVersion.TrimStart('v') -lt [version]'22.22.2') { throw 'Instale Node.js 22.22.2 ou superior.' }

# Atualiza somente o processo registrado no perfil deste auxiliar; preserva as credenciais DPAPI.
$profileLock = Join-Path $env:LOCALAPPDATA 'OctaBlaster\ChatGPT-Local\helper.lock'
if (Test-Path -LiteralPath $profileLock) {
  $helperPid = (Get-Content -LiteralPath $profileLock -Raw | ConvertFrom-Json).pid
  $helperProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$helperPid)"
  $lockWritten = (Get-Item -LiteralPath $profileLock).LastWriteTime
  if ($helperProcess -and $helperProcess.Name -eq 'node.exe' -and $helperProcess.CommandLine -match 'server\.mjs' -and $helperProcess.CreationDate -le $lockWritten) {
    Stop-Process -Id ([int]$helperPid) -ErrorAction Stop
    Start-Sleep -Milliseconds 400
  }
}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$runtimeFiles = Get-ChildItem -LiteralPath $sourceRoot -File | Where-Object { $_.Extension -in '.mjs', '.html', '.js', '.css', '.json', '.yaml' }
foreach ($file in $runtimeFiles) { Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $destination $file.Name) -Force }
& $pnpmCommand.Source --dir $destination install --frozen-lockfile --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar as dependencias do auxiliar.' }
$launcherPath = Join-Path $destination 'OctaBlasterNative-v2.exe'
if (!(Test-Path -LiteralPath $launcherPath)) {
  Add-Type -TypeDefinition (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'NativeLauncher.cs') -Raw) -OutputAssembly $launcherPath -OutputType ConsoleApplication
}
[IO.File]::WriteAllText((Join-Path $destination 'node.path'), $nodeCommand.Source)
$manifestPath = Join-Path $destination 'com.octablaster.ai.json'
$manifest = @{ name = 'com.octablaster.ai'; description = 'OctaBlaster - resumos locais'; path = $launcherPath; type = 'stdio'; allowed_extensions = @('octablaster@pulz.dev.br') }
[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 4))
$registryPath = 'HKCU:\Software\Mozilla\NativeMessagingHosts\com.octablaster.ai'
New-Item -Path $registryPath -Force | Out-Null
Set-Item -Path $registryPath -Value $manifestPath
Write-Host 'Instalacao concluida. O Firefox iniciara o auxiliar automaticamente.'
Write-Host 'Na extensao, abra Inteligencia artificial e clique em Entrar com ChatGPT uma vez.'
