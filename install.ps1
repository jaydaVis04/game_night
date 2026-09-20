$ErrorActionPreference = 'Stop'
$VictoryRoot = $PSScriptRoot
Set-Location -LiteralPath $VictoryRoot
if (-not (Test-Path -LiteralPath (Join-Path $VictoryRoot 'package.json'))) {
  throw 'Extract the complete Victory Club download before running this installer.'
}
$VictoryNodeHome = Join-Path $VictoryRoot '.runtime\node'
if (Test-Path -LiteralPath (Join-Path $VictoryNodeHome 'node.exe')) { $env:PATH = "$VictoryNodeHome;$env:PATH" }
$VictoryHasNode = $false
if (Get-Command node.exe -ErrorAction SilentlyContinue) {
  $VictoryHasNode = ((& node.exe -p 'process.versions.node.slice(0,2)') -eq '24') -and [bool](Get-Command npm.cmd -ErrorAction SilentlyContinue)
}
if (-not $VictoryHasNode) {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $VictoryArchitecture = $env:PROCESSOR_ARCHITECTURE
  if ($env:PROCESSOR_ARCHITEW6432) { $VictoryArchitecture = $env:PROCESSOR_ARCHITEW6432 }
  switch ($VictoryArchitecture.ToUpperInvariant()) {
    'AMD64' { $VictoryArch = 'x64' }
    'ARM64' { $VictoryArch = 'arm64' }
    default { throw 'This installer supports 64-bit Windows on Intel/AMD and ARM. Install Node.js 24 manually on this system.' }
  }
  $VictoryVersion = '24.21.0'
  $VictoryArchive = "node-v$VictoryVersion-win-$VictoryArch.zip"
  $VictoryBase = "https://nodejs.org/dist/v$VictoryVersion"
  $VictoryStage = Join-Path ([IO.Path]::GetTempPath()) ("victory-install-" + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $VictoryStage | Out-Null
  try {
    Write-Host "Downloading Node.js $VictoryVersion for Windows/$VictoryArch..."
    Invoke-WebRequest -UseBasicParsing -Uri "$VictoryBase/$VictoryArchive" -OutFile (Join-Path $VictoryStage $VictoryArchive)
    Invoke-WebRequest -UseBasicParsing -Uri "$VictoryBase/SHASUMS256.txt" -OutFile (Join-Path $VictoryStage 'SHASUMS256.txt')
    $VictoryMatch = Get-Content -LiteralPath (Join-Path $VictoryStage 'SHASUMS256.txt') | Where-Object { $_ -match ('^([a-f0-9]{64})\s+' + [regex]::Escape($VictoryArchive) + '$') }
    if (@($VictoryMatch).Count -ne 1) { throw 'The official Node.js checksum was not found. Nothing was installed.' }
    $VictoryExpected = ($VictoryMatch -split '\s+')[0]
    $VictoryActual = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $VictoryStage $VictoryArchive)).Hash
    if ($VictoryExpected -ne $VictoryActual) { throw 'Node.js checksum verification failed. Nothing was installed.' }
    Expand-Archive -LiteralPath (Join-Path $VictoryStage $VictoryArchive) -DestinationPath $VictoryStage
    New-Item -ItemType Directory -Force -Path (Join-Path $VictoryRoot '.runtime') | Out-Null
    if (Test-Path -LiteralPath $VictoryNodeHome) {
      Move-Item -LiteralPath $VictoryNodeHome -Destination (Join-Path $VictoryStage 'previous-node')
    }
    Move-Item -LiteralPath (Join-Path $VictoryStage "node-v$VictoryVersion-win-$VictoryArch") -Destination $VictoryNodeHome
    $env:PATH = "$VictoryNodeHome;$env:PATH"
  } finally {
    if ((Test-Path -LiteralPath (Join-Path $VictoryStage 'previous-node')) -and -not (Test-Path -LiteralPath $VictoryNodeHome)) {
      Move-Item -LiteralPath (Join-Path $VictoryStage 'previous-node') -Destination $VictoryNodeHome
    }
    if (Test-Path -LiteralPath $VictoryStage) { Remove-Item -LiteralPath $VictoryStage -Recurse -Force }
  }
}
Write-Host 'Installing Victory Club...'
if (Test-Path -LiteralPath 'package-lock.json') { & npm.cmd ci --no-fund --no-audit } else { & npm.cmd install --no-fund --no-audit }
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check your internet connection and run setup again.' }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'The app build failed. Review the message above.' }
& npm.cmd run setup
if ($LASTEXITCODE -ne 0) { throw 'Database setup failed. Stop the running server and try again.' }
if ($env:VICTORY_SKIP_SHORTCUTS -ne '1') {
  $VictoryDesktop = [Environment]::GetFolderPath('Desktop')
  if ($env:VICTORY_SHORTCUT_DIR) { $VictoryDesktop = $env:VICTORY_SHORTCUT_DIR }
  New-Item -ItemType Directory -Force -Path $VictoryDesktop | Out-Null
  $VictoryShortcut = Join-Path $VictoryDesktop 'Victory Club.lnk'
  $VictoryShell = New-Object -ComObject WScript.Shell
  $VictoryLink = $VictoryShell.CreateShortcut($VictoryShortcut)
  if ((Test-Path -LiteralPath $VictoryShortcut) -and $VictoryLink.Description -ne 'Victory Club game-night launcher') {
    Write-Warning 'An unrelated Victory Club desktop shortcut already exists. It was preserved. Use scripts\launch.cmd to start.'
  } else {
    $VictoryLink.TargetPath = $env:ComSpec
    $VictoryLink.Arguments = '/k ""' + (Join-Path $VictoryRoot 'scripts\launch.cmd') + '""'
    $VictoryLink.WorkingDirectory = $VictoryRoot
    $VictoryLink.Description = 'Victory Club game-night launcher'
    $VictoryLink.Save()
    Write-Host "Desktop launcher: $VictoryShortcut"
  }
}
Write-Host ''
Write-Host 'Ready! Open the Victory Club desktop launcher, or run scripts\launch.cmd.'
Write-Host 'Keep this folder in place; it contains the app and your game-night data.'
