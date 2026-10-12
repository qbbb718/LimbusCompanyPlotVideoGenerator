@echo off
setlocal enabledelayedexpansion

REM Diagnostic harness. Usage: run-harness.bat TAG LIBDIR [TMPDIR]
REM TAG    = label for the log file
REM LIBDIR = directory holding the dependency jars (java -cp ...\*)
REM TMPDIR = optional value for -Djava.io.tmpdir (a drive that does not exist
REM          makes the JavaCPP native extraction fail, which is the exact
REM          condition behind the reported red placeholder)

set "TAG=%~1"
set "LIBDIR=%~2"
set "TMPARG=%~3"
if "%TAG%"=="" set "TAG=run"
if "%LIBDIR%"=="" set "LIBDIR=E:\LimbusCompanyPlotVideoGenerator\_diagnose-webp\flat\BOOT-INF\lib"

set "BASE=E:\LimbusCompanyPlotVideoGenerator\_diagnose-webp"
set "CLASSES=%BASE%\flat\BOOT-INF\classes"
set "DATA=%BASE%\dataroot"
set "HOMEDIR=%BASE%\home-%TAG%"
set "LOG=%BASE%\%TAG%.log"
set "TMPD=%BASE%\scratch"
if not exist "%TMPD%" mkdir "%TMPD%"
if not exist "%HOMEDIR%" mkdir "%HOMEDIR%"
if exist "%LOG%" del /q "%LOG%"
if exist "%LOG%.err" del /q "%LOG%.err"

set "TMPOPT="
if not "%TMPARG%"=="" set "TMPOPT=-Djava.io.tmpdir=%TMPARG%"

echo [%TAG%] libdir  : %LIBDIR%
echo [%TAG%] tmpdir  : %TMPARG%
echo [%TAG%] log     : %LOG%

start "lbc-%TAG%" /min "C:\Program Files\Java\jdk-21\bin\java.exe" "%TMPOPT%" "-Duser.home=%HOMEDIR%" "-Dlbc.data.dir=%DATA%" -cp "%CLASSES%;%LIBDIR%\*" com.lbc_plot.MainApplication > "%LOG%" 2> "%LOG%.err"

set "READY=0"
for /l %%I in (1,1,30) do (
  if "!READY!"=="0" (
    ping -n 3 127.0.0.1 >nul
    curl -s -o nul -w "%%{http_code}" http://127.0.0.1:8081/api/health > "%TMPD%\health.txt" 2>nul
    set "HC="
    set /p HC=<"%TMPD%\health.txt"
    if "!HC!"=="200" set "READY=1"
  )
)
echo [%TAG%] ready   : %READY%

if "%READY%"=="1" (
  set "BODY={\"characterID\":\"char_diag\",\"characterName\":\"DIAG\",\"faction\":\"none\",\"portraits\":[{\"portraitID\":\"p_diag\",\"characterID\":\"char_diag\",\"imagePath\":\"char_diag/portrait_diag.webp\",\"portName\":\"diag\",\"emotionName\":\"NORMAL\"}]}"
  echo !BODY!> "%TMPD%\body.json"
  curl -s -o nul -w "POST /api/characters -> %%{http_code}\n" -X POST -H "Content-Type: application/json; charset=utf-8" --data-binary "@%TMPD%\body.json" http://127.0.0.1:8081/api/characters
  ping -n 4 127.0.0.1 >nul
  curl -s -o nul -w "GET /api/characters -> %%{http_code}\n" http://127.0.0.1:8081/api/characters
  ping -n 5 127.0.0.1 >nul
)

echo.
echo ================ [%TAG%] decoder evidence ================
powershell -NoProfile -Command "Get-Content '%LOG%','%LOG%.err' -ErrorAction SilentlyContinue | Select-String -Pattern 'WebpImageDecoder|bytedeco|UnsatisfiedLink|URISyntax|FFmpeg|MainApplication - Started' | Select-Object -First 18 | ForEach-Object { '  ' + $_.Line }"

for /f "tokens=2 delims=," %%P in ('tasklist /fi "imagename eq java.exe" /fo csv /nh 2^>nul') do taskkill /pid %%~P /f >nul 2>&1

endlocal
exit /b 0
