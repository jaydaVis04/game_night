@echo off
setlocal
cd /d "%~dp0.."
if exist "%~dp0..\.runtime\node\node.exe" set "PATH=%~dp0..\.runtime\node;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Victory Club needs Node.js 24. Run install.cmd first.
  exit /b 1
)
node -e "if (process.versions.node.split('.')[0] !== '24') process.exit(1)"
if errorlevel 1 (
  echo Victory Club needs Node.js 24. Run install.cmd first.
  exit /b 1
)
if not exist dist\index.html (
  echo The app has not been built. Run install.cmd first.
  exit /b 1
)
node server\index.js %*
