# 文档维护记录

本文件记录 `docs` 目录的维护操作与变更理由。目的是保持文档整洁、可发现且最新。

变更历史:

- 2026-01-09: 标记 `file_tree.txt` 为已弃用（自动生成的项目树快照）。新增 `DOCS_CHANGELOG.md` 和 `MAINTENANCE.md` 用于后续维护记录。
- 2025-10-19: 
  - 将"后端模块化重构详细方案"合并到PROJECT_CONTEXT.md中，并删除原始文档
  - 合并CODE_INDEX.md和CODE_SEARCH_GUIDE.md为CODE_NAVIGATION_GUIDE.md，并删除原始文档
  - 合并PROJECT_CONTEXT.md和PROJECT_DOCUMENTATION.md为PROJECT_COMPLETE_DOCUMENTATION.md，并删除原始文档
  - 将MAINTENANCE.md从demo/src/main/resources/docs移至docs目录，并更新文档维护记录

维护原则:
- 删除或替换被动生成、冗余或不再维护的文档（例如自动生成的文件树）。
- 合并功能相似或重合度高的文档，减少冗余，提高文档可用性
- 新增一份 `DOCS_CHANGELOG.md` 来跟踪文档编辑和移除历史。
- 把审计输出（TODO、优化建议）集中到 `docs/TODO.md`，并在顶级 `README.md` 中链接。

推荐工作流:
1. 修改或新增文档 -> 同步更新 `DOCS_CHANGELOG.md`。
2. 关联代码变更时，在 PR 描述中引用文档变更行。
3. 定期检查文档重合度，合并相似文档以提高文档可用性。

维护者: qbbb718
