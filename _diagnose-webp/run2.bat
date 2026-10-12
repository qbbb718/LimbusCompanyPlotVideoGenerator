@echo off
setlocal enabledelayedexpansion

REM Diagnostic harness v2. Usage: run2.bat TAG STAGEDIR
REM Runs app-nonatives.jar (natives stripped from BOOT-INF/lib) and supplies the
REM platform native jars separately through -Dloader.path, so the native-loading
REM behaviour can be toggled without rebuilding anything.

set "TAG=%~1"
set "STAGE=%~2"
if "%TAG%"=="" set "TAG=run"
if "%STAGE%"=="" set "STAGE=E:\LimbusCompanyPlotVideoGenerator\_diagnose-webp\stage-full"

set "BASE=E:\LimbusCompanyPlotVideoGenerator\_diagnose-webp"
set "JAR=%BASE%\app-nonatives.jar"
set "DATA=%BASE%\dataroot"
set "HOMEDIR=%BASE%\home-%TAG%"
set "LOG=%BASE%\%TAG%.log"
set "TMPD=%BASE%\scratch"
if not exist "%TMPD%" mkdir "%TMPD%"
if not exist "%HOMEDIR%" mkdir "%HOMEDIR%"
if exist "%LOG%" del /q "%LOG%"
if exist "%LOG%.err" del /q "%LOG%.err"

echo [%TAG%] stage   : %STAGE%
echo [%TAG%] log     : %LOG%

start "lbc-%TAG%" /min "C:\Program Files\Java\jdk-21\bin\java.exe" "-Duser.home=%HOMEDIR%" "-Dlbc.data.dir=%DATA%" "-Dloader.path=%STAGE%" -jar "%JAR%" > "%LOG%" 2> "%LOG%.err"

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
