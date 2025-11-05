@echo off
echo 正在初始化数据库...

REM 确保data目录存在
if not exist "data" mkdir data

REM 使用sqlite3执行初始化脚本
sqlite3 data/project.db < init_database.sql

if %ERRORLEVEL% EQU 0 (
    echo 数据库初始化成功！
) else (
    echo 数据库初始化失败！错误代码: %ERRORLEVEL%
)

pause