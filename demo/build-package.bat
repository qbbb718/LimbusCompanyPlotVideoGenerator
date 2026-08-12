@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

echo ============================================
echo   LimbusCompany Plot Video Generator - Build
echo ============================================
echo.

set "DEMO_DIR=%~dp0"
set "FRONTEND_DIR=%DEMO_DIR%frontend\electron-react-app"

REM --- Prerequisite checks ---
set "HAS_ERROR="

where mvn >nul 2>&1
if errorlevel 1 (
    echo [ERROR] mvn not found. Please install Maven and add it to PATH.
    set "HAS_ERROR=1"
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found. Please install Node.js and add it to PATH.
    set "HAS_ERROR=1"
)

if not defined JAVA_HOME (
    echo [WARN] JAVA_HOME is not set. jlink and Maven may not work correctly.
)

if defined HAS_ERROR (
    echo.
    echo Please install the missing tools, then re-run this script.
    pause
    exit /b 1
)

echo Environment check passed.
echo.

REM --- 0. Generate bundled JRE (skip if exists) ---
if not exist "%DEMO_DIR%jre\bin\java.exe" (
    echo [0/4] Generating bundled JRE...
    if defined JAVA_HOME (
        if exist "%JAVA_HOME%\bin\jlink.exe" (
            if exist "%DEMO_DIR%jre" rmdir /s /q "%DEMO_DIR%jre"
            "%JAVA_HOME%\bin\jlink" --add-modules java.base,java.desktop,java.instrument,java.logging,java.management,java.naming,java.sql,java.xml,jdk.unsupported,jdk.management,jdk.crypto.ec,jdk.zipfs,java.net.http,java.security.jgss,java.security.sasl --strip-debug --no-man-pages --no-header-files --compress=zip-6 --output "%DEMO_DIR%jre"
            if errorlevel 1 (
                echo [ERROR] jlink failed
                pause
                exit /b 1
            )
            echo        JRE generated successfully
        ) else (
            echo [WARN] jlink.exe not found, skipping JRE generation
        )
    ) else (
        echo [WARN] JAVA_HOME not set, skipping JRE generation (JDK 21 required)
    )
    echo.
)

REM --- 1. Build backend ---
echo [1/4] Building Spring Boot backend (Windows x64 natives only)...
cd /d "%DEMO_DIR%"
call mvn clean package -DskipTests -q
if errorlevel 1 (
    echo [ERROR] Backend build failed
    pause
    exit /b 1
)
echo        Backend build complete
echo.

REM --- 2. Build frontend ---
echo [2/4] Building React frontend...
cd /d "%FRONTEND_DIR%"
call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend build failed
    pause
    exit /b 1
)
echo        Frontend build complete
echo.

REM --- 3. Package Electron app ---
echo [3/4] Packaging Electron app...
echo        This may take a while on first run (downloading Electron binary)...
echo.

REM Kill any leftover processes that might lock build files
echo        Checking for leftover processes...
taskkill /f /im java.exe 2>nul
taskkill /f /im javaw.exe 2>nul
taskkill /f /im electron.exe 2>nul
taskkill /f /im "LimbusCompany Plot Video Generator.exe" 2>nul

REM Clean previous build output to avoid stale cache issues
if exist "%FRONTEND_DIR%release" (
    echo        Cleaning previous release directory...

    REM Pass 1: try rmdir (fast path if nothing locked)
    rmdir /s /q "%FRONTEND_DIR%release" 2>nul

    if exist "%FRONTEND_DIR%release" (
        echo        [WARN] Some files are locked - identifying...

        REM Show which files are locked
        dir /s /b "%FRONTEND_DIR%release\*" 2>nul | findstr /v "^$" >nul 2>&1
        if not errorlevel 1 (
            echo        Locked files:
            dir /s /b "%FRONTEND_DIR%release\*" 2>nul
        )

        REM Pass 2: delete everything we can, then retry rmdir
        del /f /s /q "%FRONTEND_DIR%release\*" 2>nul
        for /d %%d in ("%FRONTEND_DIR%release\*") do rmdir /s /q "%%d" 2>nul
        rmdir /s /q "%FRONTEND_DIR%release" 2>nul

        if exist "%FRONTEND_DIR%release" (
            echo        [WARN] Could not fully clean release/ - still locked by:
            powershell -NoProfile -Command "$p='%FRONTEND_DIR%release\win-unpacked\resources\app.asar'; if(Test-Path $p){Get-Process|?{$_.Modules.FileName -eq $p}|%%{Write-Host (' '*12+$_.Name+' (PID '+$_.Id+') is holding app.asar')}}" 2>nul
            echo        Attempting to proceed anyway (electron-builder will try to clean)...
        ) else (
            echo        Cleaned successfully after retry.
        )
    ) else (
        echo        Cleaned successfully.
    )
) else (
    echo        No previous release directory to clean.
)

REM Small delay to let Windows Defender finish scanning any released files
timeout /t 2 /nobreak >nul

call npx electron-builder --win --x64
if errorlevel 1 (
    echo.
    echo [ERROR] Packaging failed.
    echo        Common causes:
    echo        1. A file in release\ is locked by another process (try rebooting)
    echo        2. Electron binary download failed (check VPN/network)
    echo        3. Antivirus is blocking file operations
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Build complete!
echo   Installer: %FRONTEND_DIR%release\
echo ============================================
dir /b "%FRONTEND_DIR%\release\*.exe" 2>nul
echo.
pause
