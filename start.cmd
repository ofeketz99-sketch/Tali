@echo off
rem Builds and runs Tali from this folder (for development).
rem Day to day, open Tali.exe instead: it builds by itself when the code changed.
rem Note: do not add "chcp 65001" here. On Hebrew Windows it breaks the rest of the script.
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" goto missing
"node_modules\@esbuild\win32-x64\esbuild.exe" src\renderer.js --bundle --outfile=dist\renderer.js --sourcemap --log-level=warning
if errorlevel 1 goto failed
if /i "%~1"=="watch" start "esbuild watch" "node_modules\@esbuild\win32-x64\esbuild.exe" src\renderer.js --bundle --outfile=dist\renderer.js --sourcemap --watch
start "" "node_modules\electron\dist\electron.exe" "%~dp0."
exit /b 0

:missing
echo Dependencies are missing. Run "npm install" in this folder (see AGENTS.md).
pause
exit /b 1

:failed
echo Build failed, see the error above.
pause
exit /b 1
