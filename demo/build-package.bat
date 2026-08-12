@echo off

REM ================================================================
REM  Self-invoke: capture all output to a timestamped log file.
REM  If BUILD_INNER is set, we are already inside the logging wrapper.
REM ================================================================
if defined BUILD_INNER goto :MAIN

REM --- CI detection ---
if defined CI (
    set "IS_CI=1"
) else (
    set "IS_CI=0"
)

set "LOGDIR=%~dp0logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

REM --- Timezone-safe timestamp (PowerShell, works in both local and CI) ---
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd-HHmmss'"') do set "TS=%%I"
if not defined TS set "TS=00000000-000000"

set "LOGFILE=%LOGDIR%\build-%TS%.txt"

echo ============================================
echo   LimbusCompany Plot Video Generator - Build
echo ============================================
echo.
echo Log: %LOGFILE%
echo CI mode: %IS_CI%
echo.

set "BUILD_INNER=1"
call "%~f0" > "%LOGFILE%" 2>&1
set "BUILD_EXIT=%ERRORLEVEL%"

echo.
echo ============================================
if %BUILD_EXIT% equ 0 (
    echo   BUILD SUCCEEDED
) else (
    echo   BUILD FAILED with exit code %BUILD_EXIT%
    echo.
    echo   Last 20 lines of log:
    echo   ----------------------------------------
    powershell -NoProfile -Command "Get-Content '%LOGFILE%' -Tail 20"
    echo   ----------------------------------------
)
echo   Full log: %LOGFILE%
echo ============================================

REM --- Only pause in local (non-CI) environment ---
if "%IS_CI%"=="0" (
    pause
)
exit /b %BUILD_EXIT%

:MAIN
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
    goto :FATAL
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
                goto :FATAL
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
    goto :FATAL
)
echo        Backend build complete
echo.

REM --- 2. Build frontend ---
echo [2/4] Building React frontend...
cd /d "%FRONTEND_DIR%"

REM --- CI: treat warnings as warnings, not errors ---
if "%IS_CI%"=="1" (
    echo        CI mode: skipping ESLint warnings-as-errors
    set "CI=false"
)

call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend build failed
    goto :FATAL
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

REM Clean previous build output
if exist "%FRONTEND_DIR%release" (
    echo        Cleaning previous release directory...
    rmdir /s /q "%FRONTEND_DIR%release" 2>nul
    if exist "%FRONTEND_DIR%release" (
        echo        [WARN] Failed to clean release/ - files may be locked by another process
    ) else (
        echo        Cleaned successfully
    )
)

REM Small delay
timeout /t 2 /nobreak >nul

REM --- electron-builder: use --publish never in CI to avoid missing GH_TOKEN ---
if "%IS_CI%"=="1" (
    echo        CI mode: using --publish never
    call npx electron-builder --win --x64 --publish never
) else (
    call npx electron-builder --win --x64
)

if errorlevel 1 (
    echo.
    echo [ERROR] Packaging failed.
    echo.
    echo        Common causes:
    echo        1. A file in release\ is locked by another process (try rebooting)
    echo        2. Electron binary download failed (check VPN/network)
    echo        3. Antivirus is blocking file operations
    goto :FATAL
)

echo.
echo ============================================
echo   Build complete!
echo   Installer: %FRONTEND_DIR%release\
echo ============================================
dir /b "%FRONTEND_DIR%\release\*.exe" 2>nul
echo.
goto :DONE

REM ================================================================
REM  Centralized exit points - skip pause in CI
REM ================================================================
:FATAL
echo.
echo ============================================
echo   BUILD FAILED - see error details above
echo ============================================
if "%IS_CI%"=="0" (
    pause
)
exit /b 1

:DONE
if "%IS_CI%"=="0" (
    echo Press any key to exit...
    pause
)
exit /b 0