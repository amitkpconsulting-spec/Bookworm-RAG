@echo off
:: TECHNOSCOPE PORTABLE INSTALLER
:: Designed for local or portable drive installations
title Technoscope Setup & Installer
setlocal enabledelayedexpansion

:: Force 100% portable NPM cache directory to prevent permission failures on host systems
set "NPM_CONFIG_CACHE=%~dp0data\.npm-cache"

echo ==========================================================
echo           TECHNOSCOPE - PORTABLE ENVIRONMENT SETUP
echo             your data, your chat - offline RAG
echo ==========================================================
echo.

:: Ensure we are running from the script directory
cd /d "%~dp0"

:: Check if portable Node is already present and add it to the path
if exist "%~dp0bin\node" (
    set "PATH=%~dp0bin\node;%PATH%"
)

echo [1/5] Verifying directory structure...
if not exist "data" (
    echo Creating persistent local 'data' directory...
    mkdir "data"
) else (
    echo Local 'data' directory already exists.
)

echo.
echo [2/5] Initializing local environment configuration...
if not exist ".env" (
    if exist ".env.example" (
        echo Creating .env from template...
        copy ".env.example" ".env" >nul
        echo Please edit the .env file later if you want to supply custom LLM keys.
    ) else (
        echo Creating empty .env file...
        echo PORT=3000 > .env
    )
) else (
    echo .env configuration file already exists.
)

echo.
echo [3/5] Verifying System Prerequisites...
set HAS_NODE=0
set HAS_DOCKER=0

if exist "%~dp0bin\node\node.exe" (
    echo  [OK] Portable Node.js is already configured in bin\node.
    set HAS_NODE=1
) else (
    where node >nul 2>nul
    if !errorlevel! equ 0 (
        echo  [OK] Node.js is installed on your host system.
        set HAS_NODE=1
    ) else (
        echo  [WARNING] Node.js was not found on the system PATH or local bin.
    )
)

where docker >nul 2>nul
if %errorlevel% equ 0 (
    echo  [OK] Docker is installed.
    set HAS_DOCKER=1
) else (
    echo  [INFO] Docker was not found in the system PATH.
)

if %HAS_NODE% equ 0 (
    echo.
    echo -----------------------------------------------------------------
    echo PORTABILITY ENGINE: Node.js was not detected!
    echo To make this application completely portable (running from your
    echo USB/NVMe drive on any Windows computer with no installation or
    echo admin rights), we can automatically download and configure a
    echo portable version of Node.js (v20.11.1 LTS).
    echo -----------------------------------------------------------------
    echo.
    set "DOWNLOAD_NODE=Y"
    set /p DOWNLOAD_NODE="Would you like to download portable Node.js (v20.11.1) now? [Y/N, default: Y]: "
    if /i "!DOWNLOAD_NODE!"=="Y" (
        echo.
        echo Creating 'bin' directory...
        if not exist "bin" mkdir "bin"
        
        echo Downloading portable Node.js zip...
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://nodejs.org/dist/v20.11.1/node-v20.11.1-win-x64.zip', 'node.zip')"
        
        if not exist "node.zip" (
            echo.
            echo [ERROR] Download failed! Please check your internet connection and try again.
            pause
            exit /b 1
        )
        
        echo Extracting Node.js zip file...
        powershell -Command "Expand-Archive -Path 'node.zip' -DestinationPath 'bin' -Force"
        
        if exist "bin\node-v20.11.1-win-x64" (
            if exist "bin\node" rd /s /q "bin\node"
            move "bin\node-v20.11.1-win-x64" "bin\node" >nul
            echo [OK] Extracted Node.js successfully!
        ) else (
            echo [ERROR] Extraction failed or folder structure is unexpected.
            pause
            exit /b 1
        )
        
        if exist "node.zip" del "node.zip" >nul
        set "PATH=%~dp0bin\node;%PATH%"
        set HAS_NODE=1
        echo  [SUCCESS] Portable Node.js is now configured in bin\node!
    )
)

if %HAS_NODE% equ 0 if %HAS_DOCKER% equ 0 (
    echo.
    echo [ERROR] Neither Node.js nor Docker were detected!
    echo To run Technoscope locally or on a portable drive, please install either:
    echo 1. Node.js (Recommended for direct portable disk running, from https://nodejs.org)
    echo 2. Docker Desktop (from https://www.docker.com)
    echo.
    pause
    exit /b 1
)

echo.
echo [4/5] Installing Dependencies...
if %HAS_NODE% equ 1 (
    echo Found Node.js! Installing packages locally via NPM...
    call npm install
    if !errorlevel! neq 0 (
        echo [ERROR] npm install failed. Please check your internet connection or NPM settings.
        pause
        exit /b 1
    )
    echo.
    echo Compiling and bundling application for offline production mode...
    call npm run build
    if !errorlevel! neq 0 (
        echo [ERROR] App compilation failed.
        pause
        exit /b 1
    )
) else (
    echo Node.js not found. Skipping local compilation.
    echo Since Docker is available, you will be able to build and run via Docker directly.
)

if %HAS_DOCKER% equ 1 (
    echo.
    echo [4.5/5] Preparing Chroma DB Plugin...
    echo Docker detected! Pulling latest chromadb/chroma docker image to save offline startup time...
    docker pull chromadb/chroma:latest
)

echo.
echo [5/5] Setup Completed Successfully!
echo ==========================================================
echo Technoscope has been fully prepared.
echo To start your custom RAG assistant, double-click:
echo    ==^> start.bat
echo ==========================================================
echo.
set /p START_NOW="Would you like to launch Technoscope right now? (Y/N): "
if /i "%START_NOW%"=="Y" (
    call start.bat
) else (
    echo Setup done. You can close this window now.
    pause
)
