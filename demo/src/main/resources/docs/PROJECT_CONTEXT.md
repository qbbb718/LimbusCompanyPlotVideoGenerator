# Project Context — LimbusCompanyPlotVideoGenerator

简短说明
- 项目名: LimbusCompanyPlotVideoGenerator
- 目的: 将 Limbus Company 的剧情/脚本自动合成视频（包含人物、背景、音频、配音、合成效果等）。

技术栈
- 后端: Java 21 (LTS), Maven
- 核心库: JavaCV (FFmpeg 等 via org.bytedeco:javacv-platform), Jackson, JDBI, SQLite
- 测试: JUnit 5, Mockito
- 日志: SLF4J + Logback

重要变更（2025-10-19）
- 已将 `demo/pom.xml` 的 Java 版本从 17 升级为 21，并添加了 `maven-compiler-plugin`（<release>21</release>）。
- 移除 `demo/pom.xml` 中重复的 `org.bytedeco:javacv-platform` 依赖。

快速命令
- 验证 Java/Maven 环境:
  - `java -version`
  - `mvn -v`
- 构建 demo 模块:
  - `cd demo`
  - `mvn -DskipTests=true clean package`
- 构建 backend 模块 (示例):
  - `mvn -pl demo/backend -am clean package`
- 运行测试:
  - `mvn -DskipTests=false test`

注意事项 / 已知问题
- `demo` 模块当前没有源代码会导致输出 JAR 为空（这不是错误，只是目录结构所致）。
- JNI/native 依赖（例如 JavaCV/Javacpp bindings、FFmpeg）可能需要升级或与系统平台匹配；如果构建或运行时出现 UnsatisfiedLinkError 或 native lib 相关错误，请检查本机的依赖版本和本机库（例如 OpenCV/FFmpeg）支持。
- 在升级 Java 到 21 后，如果遇到编译或运行错误，请先检查 maven-surefire/failsafe 插件和任何本机依赖的兼容性。

如何让 AI 助手记住更多
- 把关键信息写到 `PROJECT_CONTEXT.md`（已创建）或 README，下一次打开仓库时我会读取并恢复上下文。不要在该文件中写入敏感信息（密钥/密码）。

下一步建议
- 若要继续升级其他模块（例如 `demo/backend`），请让我扫描并给出每个模块的升级补丁或你可以在本地运行 `mvn -pl demo/backend -am clean package` 并把错误日志贴上来。

维护者/联系方式
- 维护者: qbbb718
