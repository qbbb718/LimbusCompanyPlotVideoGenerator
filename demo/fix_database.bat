@echo off
echo 正在修复数据库问题...

REM 1. 替换SQLiteDatabaseManager类
echo 步骤1: 替换SQLiteDatabaseManager类
del "src\main\java\com\lbc_plot\util\db\SQLiteDatabaseManager.java"
rename "src\main\java\com\lbc_plot\util\db\SQLiteDatabaseManager_new.java" "SQLiteDatabaseManager.java"

REM 2. 删除现有数据库文件（如果有）
echo 步骤2: 删除现有数据库文件
if exist "data\project.db" del "data\project.db"

REM 3. 创建数据库目录（如果不存在）
echo 步骤3: 确保数据库目录存在
if not exist "data" mkdir "data"

echo 修复完成！
echo 请重新启动应用程序，数据库将自动初始化。
pause