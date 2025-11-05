@echo off
echo 正在替换SQLiteDatabaseManager类...

REM 删除旧文件
del "src\main\java\com\lbc_plot\util\db\SQLiteDatabaseManager.java"

REM 重命名新文件
rename "src\main\java\com\lbc_plot\util\db\SQLiteDatabaseManager_new.java" "SQLiteDatabaseManager.java"

echo 替换完成！
pause