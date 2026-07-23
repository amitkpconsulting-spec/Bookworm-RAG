@echo off
:: TECHNOSCOPE START RUNNER
title Technoscope Runner
setlocal enabledelayedexpansion

:: Force 100% portable NPM cache directory to prevent permission failures on host systems
set "NPM_CONFIG_CACHE=%~dp0data\.npm-cache"

echo ==========================================================
echo                     TECHNOSCOPE RUNNER
echo             your data, your chat - offline RAG
echo ==========================================================
echo.

:: Ensure we are running from the script directory
cd /d "%~dp0"

:: Check if portable Node is already present and add it to the path
if exist "%~dp0bin\node" (
    set "PATH=%~dp0bin\node;%PATH%"
)

:: Initialize directory or configs if skipped
if not exist "data" mkdir "data"
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
    )
)

set HAS_NODE=0
set HAS_DOCKER=0

if exist "%~dp0bin\node\node.exe" (
    set HAS_NODE=1
) else (
    where node >nul 2>nul
    if !errorlevel! equ 0 set HAS_NODE=1
)

where docker >nul 2>nul
if %errorlevel% equ 0 set HAS_DOCKER=1

if %HAS_NODE% equ 0 if %HAS_DOCKER% equ 0 (
    echo [ERROR] Neither Node.js nor Docker were detected!
    echo Please run setup.bat first to verify dependencies.
    pause
    exit /b 1
)

:: Auto-detect run mode
echo How would you like to run Technoscope?
if %HAS_NODE% equ 1 echo  [1] Direct Node.js (High Performance, recommended for portable drives)
if %HAS_DOCKER% equ 1 echo  [2] Docker Container (Isolated context)
echo.
set /p CHOICE="Enter choice (1 or 2, default is 1): "
if "%CHOICE%"=="" set CHOICE=1

if "%CHOICE%"=="1" (
    if %HAS_NODE% equ 0 (
        echo [ERROR] Node.js is not installed on this machine! Cannot use Option 1.
        pause
        exit /b 1
    )
    if not exist "node_modules" (
        echo [INFO] Dependencies not detected. Running quick setup...
        call npm install
    )
    
    if %HAS_DOCKER% equ 1 (
        echo.
        echo [INFO] Docker detected! Starting background Chroma DB vector store...
        docker compose up -d chroma
    )

    echo.
    echo Launching Technoscope locally on http://localhost:3000 ...
    
    :: Launch browser automatically after 3 seconds
    start "" http://localhost:3000
    
    :: Determine if production bundle exists
    if exist "dist\server.cjs" (
        echo [INFO] Starting production build...
        call npm run start
    ) else (
        echo [INFO] Dist folder not found. Starting development mode...
        call npm run dev
    )
) else if "%CHOICE%"=="2" (
    if %HAS_DOCKER% equ 0 (
        echo [ERROR] Docker was not found on this machine! Cannot use Option 2.
        pause
        exit /b 1
    )
    echo.
    echo Launching Technoscope container via Docker Compose...
    docker compose up -d --build
    if !errorlevel! neq 0 (
        echo [ERROR] Failed to boot docker container.
        pause
        exit /b 1
    )
    echo.
    echo [SUCCESS] Container booted! Opening dashboard...
    start "" http://localhost:3000
    echo Press any key to stop the container...
    pause
    docker compose down
) else (
    echo Invalid choice. Exiting.
    pause
)
