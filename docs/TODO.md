# TODO（任务清单）

此文件列出当前仓库优先级任务，用于协调后续开发工作与代码审查。

优先级：High
- 将手写 Prometheus 文本导出切换为 Micrometer 集成，统一度量与 Spring Boot Actuator。（已实现）
- 提供 Redis-backed 高吞吐可见性超时队列实现，并通过 Spring profile 可选（redis/jdbc/file）。（已实现，使用 profile `redis`）

优先级：Medium
- 将 `JdbcPersistentAsyncRenderService` 打造为生产级实现（连接池、表迁移、重试事务、清理作业）。
- 在 README 中记录运行重型集成测试（FFmpeg 依赖）的要求与快速模式。

优先级：Low
- 将 demo 模块中的 docs 移入顶层 `docs/`，并添加 CI 发布步骤。
- 逐步迁移 `ProjectConfig` 到更统一的配置类，并移除冗余属性。

如果需要我来实现其中某条，请回复希望优先完成的任务编号。

如何启用（本地开发）:

1) 在运行时启用开发配置：

```powershell
mvn -Dspring.profiles.active=dev -f demo/pom.xml spring-boot:run
```

2) 在 `application-dev.yml` 中示例包括启用 Actuator Prometheus 端点和 Redis 配置（见 `demo/src/main/resources/application-dev.yml`）。

# 项目 TODO 与优先级清单

本文件由审计自动生成，列出当前建议的改进项、优先级与可执行的下一步。

高优先级（可尽快完成）
- 模块化构建：创建顶层聚合 `pom.xml`，将 `plot`、`resource`、`render`、`common` 设为子模块；验证并修复构建。
- 配置属性化：将 `ProjectConfig` / `StorageConfig` 迁移为 `@ConfigurationProperties` 并添加 `application-dev.yml`/`application-prod.yml` 示例。
- 异步队列可插拔化：把 `AsyncRenderService` 做成可插拔实现，并选择首选持久队列后端（推荐 Redis），同时保留文件队列作为回退。

- [x] 模块化构建：创建顶层聚合 `pom.xml`，将 `plot`、`resource`、`render`、`common` 设为子模块；验证并修复构建。 (已实现，见顶层 `pom.xml`，包含 `demo/`, `plot/`, `resource/`, `render/`, `common/` 模块)
- [x] 配置属性化：将 `ProjectConfig` / `StorageConfig` 迁移为 `@ConfigurationProperties` 并添加 `application-dev.yml`/`application-prod.yml` 示例。 (已实现，见 `demo/src/main/java/com/lbc_plot/config/ProjectConfig.java` 与 `StorageConfig.java`，示例位于 `demo/src/main/resources/application-dev.yml` 与 `application-prod.yml`)
- [x] 异步队列可插拔化：把 `AsyncRenderService` 做成可插拔实现，并选择首选持久队列后端（推荐 Redis），同时保留文件队列作为回退。 (已实现，文件队列 `PersistentFileAsyncRenderService`，Redis 原型 `RedisPersistentAsyncRenderService`，通过 Spring profile `redis` 切换)

中等优先级
- 统一资源服务接口：将 `StorageService` 适配为 `ResourceService<T>` 或增加 Adapter，编写兼容单元测试。
- 任务状态 API：为异步队列增加任务详情、重试历史和失败原因查询接口。
- 监控与指标：使用 Micrometer 替换手写 Prometheus 输出，导出队列/重试/失败指标。

低优先级 / 规划项
- 渲染缓存扩展：设计 Redis 缓存或哈希目录策略并实现 LRU/TTL 策略。
- Electron 重构：封装 `electronAPI`，分离 Electron 专属逻辑并持久化设置。
- CI 与测试：添加 GitHub Actions 工作流 (build → test → static-check → package)，并把重型集成测试（依赖 FFmpeg）标注为 `integration`。
- 文档与规范：更新 `CODE_INDEX.md`、`CODE_COMMENTING_GUIDE.md`，并把本清单加入仓库 `docs/`。
- 资源管理优化：统一资源目录结构，创建统一的资源服务接口。
  - 统一资源目录结构（背景、角色、音频等）
  - 创建资源服务接口（ResourceService<T>）
  - 实现资源上传、验证、缩略图生成等功能
- API设计优化：遵循RESTful API设计原则，实现API版本控制。
  - 优化现有API端点，遵循RESTful设计
  - 实现API版本控制机制
  - 添加API文档（Swagger/OpenAPI）
- 测试结构优化：按照模块结构组织测试代码，创建测试工具类。
  - 按模块组织测试目录结构
  - 创建测试工具类，简化测试代码
  - 提高测试覆盖率，特别是集成测试

下一步（建议）
1. 建议优先实施统一资源服务接口，将 `StorageService` 适配为 `ResourceService<T>`。
2. 实现任务状态 API，为异步队列增加任务详情、重试历史和失败原因查询接口。
3. 优化API设计，遵循RESTful API设计原则，实现API版本控制。

如需我继续：请选择下一项（例如：创建 top-level POM / 实现 Redis 队列 / 用 Micrometer 替换手写指标）。