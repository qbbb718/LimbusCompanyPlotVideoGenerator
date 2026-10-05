@echo off

REM ================================================================
REM  Self-invoke: capture all output to a timestamped log file.
REM  If BUILD_INNER is set, we are already inside the logging wrapper.
REM
REM  Keep this file pure ASCII (English comments only).
REM  The inner run executes "chcp 65001"; with multi-byte (e.g. Chinese)
REM  comment text cmd then mis-parses those lines and runs fragments of
REM  them as commands, filling the log with
REM  "'xxx' is not recognized as an internal or external command".
REM ================================================================
if defined BUILD_INNER goto :MAIN

REM --- CI detection ---
REM Only CI=true / CI=1 counts as CI. CI=false is the value CRA uses to
REM keep warnings as warnings; treating "CI is defined" as CI would make a
REM local shell (for example one that ran build-package.ps1) silently run
REM in CI mode: no pause, and packaging with --publish never.
set "IS_CI=0"
if /i "%CI%"=="true" set "IS_CI=1"
if "%CI%"=="1" set "IS_CI=1"

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

REM --- Packaging output directory ---
REM Default is <repo root>\release (see the local packaging doc under docs/).
REM Override before invoking: set PACK_OUTPUT=D:\build-out
for %%I in ("%DEMO_DIR%..") do set "REPO_ROOT=%%~fI"
if not defined PACK_OUTPUT set "PACK_OUTPUT=%REPO_ROOT%\release"
echo Output directory: %PACK_OUTPUT%
echo.

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
        echo [WARN] JAVA_HOME not set, skipping JRE generation ^(JDK 21 required^)
    )
    echo.
)

REM --- 1. Build backend ---
echo [1/4] Building Spring Boot backend ^(Windows x64 natives only^)...
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
echo        This may take a while on first run ^(downloading Electron binary^)...
echo.

REM Stop only processes that live inside this repository and can lock files
REM under the output directory: a leftover backend (java/javaw), a dev or
REM unpacked Electron, electron-builder's app-builder helper, or the
REM packaged app itself. A global "taskkill /im java.exe" would also kill
REM unrelated Java programs such as an IDE language server.
echo        Stopping leftover project processes...
powershell -NoProfile -Command "$root='%REPO_ROOT%'; Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(java|javaw|electron|app-builder|LimbusCompanyPlotVideoGenerator|LimbusCompany Plot Video Generator)\.exe$' } | Where-Object { ($_.ExecutablePath -like ($root + '*')) -or ($_.CommandLine -like ('*' + $root + '*')) } | ForEach-Object { Write-Host ('        Stopping ' + $_.Name + ' (PID ' + $_.ProcessId + ')'); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

REM Move the previous build aside instead of deleting it up front. A partial
REM "rmdir /s /q" on a folder that is locked destroys the previous installer
REM and still leaves the locked file behind, so the next run fails as well.
REM Only an output dir named "release" is touched, so a mis-set PACK_OUTPUT
REM can never rename an unrelated folder.
set "PACK_LEAF="
for %%I in ("%PACK_OUTPUT%") do set "PACK_LEAF=%%~nxI"
set "PACK_OLD=%PACK_OUTPUT%.old"
if /i not "%PACK_LEAF%"=="release" (
    echo        [WARN] Output dir is not named "release", keeping it as is: %PACK_OUTPUT%
) else if exist "%PACK_OUTPUT%" (
    if exist "%PACK_OLD%" rmdir /s /q "%PACK_OLD%" 2>nul
    echo        Moving previous output aside: %PACK_OUTPUT% -^> %PACK_OLD%
    move "%PACK_OUTPUT%" "%PACK_OLD%" >nul 2>&1
    if exist "%PACK_OUTPUT%" (
        echo.
        echo [ERROR] Cannot move %PACK_OUTPUT% aside - a file inside it is still
        echo         locked by another process. Nothing was deleted, so the
        echo         previous build is untouched.
        echo         Close whatever holds it: the unpacked app, an editor that
        echo         watches the folder, or a leftover electron / app-builder
        echo         process. Delete %PACK_OLD% if it is left over, or point
        echo         PACK_OUTPUT at another folder, then re-run.
        goto :FATAL
    )
)

REM Small delay.
REM Use ping instead of timeout: with redirected stdin (CI, called from
REM another script, "< nul") timeout prints "Input redirection is not
REM supported" and returns at once, so no delay would happen at all.
ping -n 3 127.0.0.1 >nul

REM --- electron-builder: use --publish never in CI to avoid missing GH_TOKEN ---
REM -c.directories.output overrides "output" in electron-builder.yml, so a
REM local run always lands in PACK_OUTPUT. The CI workflow keeps the yml
REM default by not calling this script.
if "%IS_CI%"=="1" (
    echo        CI mode: using --publish never
    call npx electron-builder --win --x64 --publish never -c.directories.output="%PACK_OUTPUT%"
) else (
    call npx electron-builder --win --x64 -c.directories.output="%PACK_OUTPUT%"
)

REM Deliberately not an "if errorlevel 1 ( ... )" block: a closing paren
REM inside echoed text ends such a block early, so the rest of the block
REM (including "goto :FATAL") runs unconditionally and reports BUILD FAILED
REM even when packaging succeeded. A goto avoids that class of bug.
if not errorlevel 1 goto :PACK_OK

echo.
echo [ERROR] Packaging failed.
echo.
echo        Common causes:
echo        1. A file in the output directory is locked by another process ^(try rebooting^)
echo        2. Electron binary download failed ^(check VPN/network^)
echo        3. Antivirus is blocking file operations
goto :FATAL

:PACK_OK
REM Packaging succeeded, so the previous build we moved aside can go.
if exist "%PACK_OLD%" rmdir /s /q "%PACK_OLD%" 2>nul
if exist "%PACK_OLD%" echo        [WARN] Could not remove the old output: %PACK_OLD%
echo.
echo ============================================
echo   Build complete!
echo   Installer: %PACK_OUTPUT%\
echo ============================================
dir /b "%PACK_OUTPUT%\*.exe" 2>nul
echo.
goto :DONE

REM ================================================================
REM  Centralized exit points - skip pause in CI
REM  The inner run (BUILD_INNER defined) has its output redirected to the
REM  log, so a pause there would block with its prompt hidden inside the
REM  log - it looks like a hang. Only the outer run pauses.
REM ================================================================
:FATAL
echo.
echo ============================================
echo   BUILD FAILED - see error details above
echo ============================================
if not defined BUILD_INNER (
    if "%IS_CI%"=="0" (
        pause
    )
)
exit /b 1

:DONE
if not defined BUILD_INNER (
    if "%IS_CI%"=="0" (
        echo Press any key to exit...
        pause
    )
)
exit /b 0
