@echo off
setlocal
set "BASE=E:\LimbusCompanyPlotVideoGenerator\_diagnose-webp"
set "CLASSES=%BASE%\flat\BOOT-INF\classes"
set "LIBDIR=%BASE%\flat\BOOT-INF\lib"
echo echo hello from java > "%BASE%\scratch\probe.txt"
start "probe" /min "C:\Program Files\Java\jdk-21\bin\java.exe" "-Duser.home=%BASE%\home-A-base" "-Dlbc.data.dir=%BASE%\dataroot" -cp "%CLASSES%;%LIBDIR%\*" com.lbc_plot.MainApplication > "%BASE%\probe.log" 2> "%BASE%\probe.err"
echo started, errorlevel=%errorlevel%
ping -n 8 127.0.0.1 >nul
echo ==== tasklist ====
tasklist /fi "imagename eq java.exe" /fo csv /nh
echo ==== probe.log size ====
for %%F in ("%BASE%\probe.log") do echo %%~zF
for %%F in ("%BASE%\probe.err") do echo err %%~zF
endlocal
