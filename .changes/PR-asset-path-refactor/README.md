此目录包含为“资源路径配置化”更改准备的 PR 风格说明。

已修改文件（示例）：
- demo/src/main/java/com/lbc_plot/resource/model/Background.java
- demo/src/test/java/FrameComposerServiceTest.java
- demo/frontend/electron-react-app/public/electron.js

说明：
- 将硬编码的 `assets/backgrounds` 检查替换为 `ProjectConfig.BACKGROUNDS_PATH`。
- 测试用例中使用 `ProjectConfig.BACKGROUNDS_PATH` 构造背景路径。
- 在 Electron 主进程中将缩略图相对路径抽成常量，便于后续替换。

建议本地操作（在工作区执行）：

```bash
# 创建分支并提交当前更改
git checkout -b feat/configure-asset-paths
git add -A
git commit -m "Refactor: centralize asset paths (use ProjectConfig / constants)"
# 推送并创建 PR
git push -u origin feat/configure-asset-paths
```

注意：此仓库修改已直接应用到工作区文件。上面的脚本在你的本地环境中运行以创建分支和提交变更（本场景中我无法直接对仓库进行 git push）。
