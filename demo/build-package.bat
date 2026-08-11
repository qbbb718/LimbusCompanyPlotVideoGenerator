@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

echo ============================================
echo   LimbusCompany Plot Video Generator - Build
echo ============================================
echo.

set "DEMO_DIR=%~dp0"
set "FRONTEND_DIR=%DEMO_DIR%frontend\electron-react-app"

REM --- 0. Generate bundled JRE (skip if exists) ---
if not exist "%DEMO_DIR%jre\bin\java.exe" (
    echo [0/4] Generating bundled JRE...
    if defined JAVA_HOME (
        if exist "%JAVA_HOME%\bin\jlink.exe" (
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
npx electron-builder --win --x64
if errorlevel 1 (
    echo [ERROR] Packaging failed
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
