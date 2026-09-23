@echo off
rem
rem Double-click this in File Explorer to start the app on Windows.
rem
rem It checks the database, puts the demo competition back to a known state,
rem runs the app on this laptop and opens it in a browser. Nothing here needs
rem the internet. Close this window to stop it.
rem
rem PostgreSQL has to be installed first, with its password in .env.local.
rem The README says how.

cd /d "%~dp0"
title Competition App

set PORT=3000
set URL=http://localhost:%PORT%

echo.
echo   Competition scoring
echo   ===================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   Node is not installed. Install the LTS version from https://nodejs.org
  echo   and try again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo   First run, fetching what the app needs. This takes a minute...
  call npm install --silent
  if errorlevel 1 (
    echo   Could not install.
    pause
    exit /b 1
  )
)

echo   Preparing the data...
rem Only the ordinary output is hidden: if PostgreSQL cannot be reached, the
rem message saying what to do still shows.
call npm run db:local --silent >nul
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
call npm run db:seed --silent >nul

echo   Starting the app...
echo.

rem Open the browser once the app answers, so nobody sees an error page. This
rem waits on its own while the app starts below.
start "" /b powershell -NoProfile -Command "for ($i = 0; $i -lt 90; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%URL%' | Out-Null; break } catch { if ($_.Exception.Response) { break }; Start-Sleep 1 } }; Start-Process '%URL%'"

rem Runs until this window is closed, which stops it.
call npm run dev:local
pause
