@echo off
rem Double-click to watch the demo. Starts the server and opens the page, then replays a fake session.
rem Close this window (or press Ctrl+C) to stop it.
cd /d "%~dp0packages\core"
if not exist node_modules (
  echo Installing dependencies, please wait...
  call npm install
)
echo.
echo Starting the demo. The page opens at http://127.0.0.1:3737/
echo.
call npm run demo
pause
