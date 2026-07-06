@echo off
REM ============================================================
REM  PodPlay CS Unified Dashboard - one-click local setup
REM  Double-click this file to connect the folder to your fork,
REM  create a working branch, and install everything.
REM ============================================================

cd /d "%~dp0"
echo.
echo === Step 1: checking tools ===
where git >nul 2>nul || (echo ERROR: Git is not installed or not on PATH. Install Git, reopen, and rerun. & pause & exit /b 1)
where npm >nul 2>nul || (echo ERROR: Node.js/npm is not installed or not on PATH. Install Node LTS, reopen, and rerun. & pause & exit /b 1)
git --version
node --version

echo.
echo === Step 2: clearing broken git data ===
rmdir /s /q ".git" 2>nul
rmdir /s /q "_gittest" 2>nul

echo.
echo === Step 3: connecting this folder to your fork ===
git init
git remote add origin https://github.com/johnlester-byte/podplay-cs-unified-dashboard.git
git fetch origin
if errorlevel 1 (echo ERROR: could not reach GitHub. Check your internet connection. & pause & exit /b 1)
git reset --hard origin/main

echo.
echo === Step 4: creating your working branch ===
git checkout -b my-first-change

echo.
echo === Step 5: creating your secrets file ===
if not exist ".env.local" (
  copy ".env.example" ".env.local" >nul
  echo Created .env.local  -  NOTE: open it and paste the real Supabase/HubSpot/Google values from Rhen or Vercel.
) else (
  echo .env.local already exists - leaving it alone.
)

echo.
echo === Step 6: installing dependencies (this can take a couple minutes) ===
call npm install
if errorlevel 1 (echo ERROR: npm install failed. Copy the message above and send it to Claude. & pause & exit /b 1)

echo.
echo ============================================================
echo  DONE. Almost ready.
echo  1) Open .env.local and paste in the real keys.
echo  2) To start the dashboard, run:  npm run dev
echo  3) Then open http://localhost:3000 in your browser.
echo ============================================================
echo.
pause
