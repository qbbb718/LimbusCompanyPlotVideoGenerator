package com.lbc_plot.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.FileCopyUtils;

import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

/**
 * 数据库初始化器
 * 在应用启动时自动执行SQL脚本，创建必要的数据库表
 */
@Component
public class DatabaseInitializer implements CommandLineRunner {

    private static final Logger logger = LoggerFactory.getLogger(DatabaseInitializer.class);

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // helper to log which database file is being used
    private void logDatabaseUrl() {
        // 注意：这里必须自己关连接。以前是 jdbcTemplate.getDataSource().getConnection() 直接取
        // 元数据、从不 close —— 换成连接池之后，每启动一次就会永久占掉池里的一个连接。
        try (java.sql.Connection connection = jdbcTemplate.getDataSource().getConnection()) {
            String url = connection.getMetaData().getURL();
            logger.info("使用的数据库 URL: {}", url);
        } catch (Exception e) {
            logger.warn("无法获取数据库 URL", e);
        }
    }

    /**
     * 把数据库切到 WAL 模式，并把连接级参数打到日志里。
     *
     * <h2>为什么用 WAL</h2>
     * 默认的 rollback journal 模式下一个写事务会阻塞所有读：本项目里
     * "保存角色/背景" 与 "预览渲染顺手读资源、前端每秒好几次拉角色列表" 是同时发生的，
     * 阻塞表现出来就是界面突然卡一下、请求偶尔慢一大截。WAL 模式下读写互不阻塞，
     * 这也是 SQLite 官方推荐的并发配置。
     *
     * <h2>为什么放在启动时做、而不是每个连接都做</h2>
     * {@code journal_mode} 是<b>跟着数据库文件走</b>的持久属性：设置一次一直生效，
     * 之后每个连接都自动是 WAL。如果把它塞进 Hikari 的 {@code connection-init-sql}，
     * 每个新连接都会尝试改一次模式，反而可能在并发建连时拿到 {@code SQLITE_BUSY}。
     *
     * <h2>失败怎么办</h2>
     * 失败只记 warning，程序继续跑（比如数据库放在不支持共享内存的网络盘上时，
     * WAL 会返回 {@code delete}）。这种情况下行为与改动前完全一致，不会因为
     * "开不了 WAL" 就起不来。
     *
     * <p>注意：{@code synchronous} 保持默认的 {@code FULL}——WAL + FULL 只是每次提交多一次
     * 刷盘，本项目写操作很小（一次保存几十行），拿这点代价换"掉电不丢最近一次保存"值得。
     */
    private void configureSqlitePragmas() {
        try {
            String currentMode = jdbcTemplate.queryForObject("PRAGMA journal_mode", String.class);
            if ("wal".equalsIgnoreCase(currentMode)) {
                logger.info("SQLite journal_mode 已是 WAL（读写互不阻塞）");
            } else {
                String switched = jdbcTemplate.queryForObject("PRAGMA journal_mode=WAL", String.class);
                if ("wal".equalsIgnoreCase(switched)) {
                    logger.info("SQLite 已切换到 WAL 模式（原模式: {}），读写互不阻塞", currentMode);
                } else {
                    // 常见原因：数据库在只读/网络盘上，或另一个进程正独占着它
                    logger.warn("SQLite 无法切换到 WAL（当前: {}，尝试结果: {}），继续使用原模式——"
                            + "功能不受影响，只是并发读写会互相等待", currentMode, switched);
                }
            }

            // busy_timeout 是连接级参数，正常应由连接池的 datasource 属性带上；
            // 这里再查一次是为了把"实际生效值"记进日志，排查锁等待时用得上。
            Integer busyTimeout = jdbcTemplate.queryForObject("PRAGMA busy_timeout", Integer.class);
            logger.info("SQLite busy_timeout={} ms（并发写时的等锁上限）",
                    busyTimeout == null ? -1 : busyTimeout);
        } catch (Exception e) {
            logger.warn("配置 SQLite pragma 失败（不影响使用，继续用默认 journal 模式）: {}", e.getMessage());
        }
    }

    @Override
    public void run(String... args) throws Exception {
        logger.info("开始初始化数据库...");

        try {
            // log which database we're connected to
            logDatabaseUrl();

            // 先调连接级/库级参数，再动表结构：WAL 模式下建表、加列的并发行为更接近预期
            configureSqlitePragmas();

            // 检查数据库中是否已有表
            Integer tableCount = jdbcTemplate.queryForObject(
                    "SELECT count(*) FROM sqlite_master WHERE type='table'", Integer.class);

            if (tableCount == null || tableCount == 0) {
                logger.info("数据库为空，开始创建表...");

                // 从类路径加载SQL脚本
                ClassPathResource resource = new ClassPathResource("db/init_database.sql");
                String sqlScript = FileCopyUtils
                        .copyToString(new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8));

                // 记录SQL脚本内容
                logger.debug("执行SQL脚本:\n{}", sqlScript);

                // 分割SQL脚本为单独的语句
                String[] sqlStatements = sqlScript.split(";");

                // 逐个执行SQL语句并记录结果
                for (int i = 0; i < sqlStatements.length; i++) {
                    String statement = sqlStatements[i].trim();
                    if (!statement.isEmpty()) {
                        try {
                            logger.info("执行SQL语句 {}/{}: {}", i + 1, sqlStatements.length,
                                    statement.substring(0, Math.min(50, statement.length())));
                            jdbcTemplate.execute(statement);
                            logger.info("SQL语句执行成功");
                        } catch (Exception e) {
                            logger.error("SQL语句执行失败: {}", statement, e);
                            throw e;
                        }
                    }
                }
                logger.info("数据库表创建完成！");
            } else {
                logger.info("数据库已包含 {} 个表，检查是否缺少必要表...", tableCount);

                // 检查关键表是否存在
                String[] requiredTables = { "characters", "portraits", "backgrounds", "audios", "character_portraits",
                        "app_settings" };
                boolean allTablesExist = true;

                for (String tableName : requiredTables) {
                    Integer count = jdbcTemplate.queryForObject(
                            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?",
                            Integer.class, tableName);

                    if (count == null || count == 0) {
                        logger.warn("表 {} 不存在，需要创建", tableName);
                        allTablesExist = false;
                    }
                }

                if (!allTablesExist) {
                    logger.info("缺少必要的表，执行初始化脚本...");

                    // 从类路径加载SQL脚本
                    ClassPathResource resource = new ClassPathResource("db/init_database.sql");
                    String sqlScript = FileCopyUtils
                            .copyToString(new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8));

                    // 记录SQL脚本内容
                    logger.debug("执行SQL脚本:\n{}", sqlScript);

                    // 分割SQL脚本为单独的语句
                    String[] sqlStatements = sqlScript.split(";");

                    // 逐个执行SQL语句并记录结果
                    for (int i = 0; i < sqlStatements.length; i++) {
                        String statement = sqlStatements[i].trim();
                        if (!statement.isEmpty()) {
                            try {
                                logger.info("执行SQL语句 {}/{}: {}", i + 1, sqlStatements.length,
                                        statement.substring(0, Math.min(50, statement.length())));
                                jdbcTemplate.execute(statement);
                                logger.info("SQL语句执行成功");
                            } catch (Exception e) {
                                logger.error("SQL语句执行失败: {}", statement, e);
                                throw e;
                            }
                        }
                    }

                    logger.info("数据库表创建完成！");
                } else {
                    logger.info("所有必要的表都已存在，检查是否需要更新表结构...");

                    // 检查characters表是否有character_card_image_path列
                    try {
                        Integer columnCount = jdbcTemplate.queryForObject(
                                "SELECT count(*) FROM pragma_table_info('characters') WHERE name='character_card_image_path'",
                                Integer.class);

                        if (columnCount != null && columnCount == 0) {
                            logger.info("characters表缺少character_card_image_path列，正在添加...");
                            jdbcTemplate.execute("ALTER TABLE characters ADD COLUMN character_card_image_path TEXT");
                            logger.info("成功添加character_card_image_path列");
                        } else {
                            logger.info("characters表已包含character_card_image_path列");
                        }
                    } catch (Exception e) {
                        logger.error("检查或添加character_card_image_path列时出错: " + e.getMessage(), e);
                    }

                    // 检查characters表是否有folder_name列（用于角色拼音子目录）
                    try {
                        Integer columnCount = jdbcTemplate.queryForObject(
                                "SELECT count(*) FROM pragma_table_info('characters') WHERE name='folder_name'",
                                Integer.class);

                        if (columnCount != null && columnCount == 0) {
                            logger.info("characters表缺少folder_name列，正在添加...");
                            jdbcTemplate.execute("ALTER TABLE characters ADD COLUMN folder_name TEXT");
                            logger.info("成功添加folder_name列");
                        } else {
                            logger.info("characters表已包含folder_name列");
                        }
                    } catch (Exception e) {
                        logger.error("检查或添加folder_name列时出错: " + e.getMessage(), e);
                    }

                    // 检查backgrounds表是否有thumbnail_path列
                    try {
                        Integer columnCount = jdbcTemplate.queryForObject(
                                "SELECT count(*) FROM pragma_table_info('backgrounds') WHERE name='thumbnail_path'",
                                Integer.class);

                        if (columnCount != null && columnCount == 0) {
                            logger.info("backgrounds表缺少thumbnail_path列，正在添加...");
                            jdbcTemplate.execute("ALTER TABLE backgrounds ADD COLUMN thumbnail_path TEXT");
                            logger.info("成功添加thumbnail_path列");
                        } else {
                            logger.info("backgrounds表已包含thumbnail_path列");
                        }
                    } catch (Exception e) {
                        logger.error("检查或添加thumbnail_path列时出错: " + e.getMessage(), e);
                    }

                    logger.info("表结构检查完成");

                    // 额外检查 audios 表结构是否符合新 schema
                    try {
                        // migrate to new column names if necessary
                        Integer cnt;

                        cnt = jdbcTemplate.queryForObject(
                                "SELECT count(*) FROM pragma_table_info('audios') WHERE name='uuid'", Integer.class);
                        if (cnt != null && cnt == 0) {
                            logger.info("audios 表缺少 uuid 列，尝试迁移旧结构");
                            jdbcTemplate.execute("ALTER TABLE audios ADD COLUMN uuid TEXT");
                            jdbcTemplate.execute("UPDATE audios SET uuid = audio_id");
                            logger.info("已添加 uuid 列并复制旧 audio_id 值");
                        }
                        cnt = jdbcTemplate.queryForObject(
                                "SELECT count(*) FROM pragma_table_info('audios') WHERE name='name'", Integer.class);
                        if (cnt != null && cnt == 0) {
                            logger.info("audios 表缺少 name 列，复制 display_name");
                            jdbcTemplate.execute("ALTER TABLE audios ADD COLUMN name TEXT");
                            jdbcTemplate.execute("UPDATE audios SET name = display_name");
                        }
                        cnt = jdbcTemplate.queryForObject(
                                "SELECT count(*) FROM pragma_table_info('audios') WHERE name='path'", Integer.class);
                        if (cnt != null && cnt == 0) {
                            logger.info("audios 表缺少 path 列，复制 file_path");
                            jdbcTemplate.execute("ALTER TABLE audios ADD COLUMN path TEXT");
                            jdbcTemplate.execute("UPDATE audios SET path = file_path");
                        }
                        cnt = jdbcTemplate.queryForObject(
                                "SELECT count(*) FROM pragma_table_info('audios') WHERE name='type'", Integer.class);
                        if (cnt != null && cnt == 0) {
                            logger.info("audios 表缺少 type 列，添加空列");
                            jdbcTemplate.execute("ALTER TABLE audios ADD COLUMN type TEXT");
                        }
                        cnt = jdbcTemplate.queryForObject(
                                "SELECT count(*) FROM pragma_table_info('audios') WHERE name='tags'", Integer.class);
                        if (cnt != null && cnt == 0) {
                            logger.info("audios 表缺少 tags 列，添加空列");
                            jdbcTemplate.execute("ALTER TABLE audios ADD COLUMN tags TEXT");
                        }
                    } catch (Exception e) {
                        logger.warn("检查 audios 表结构时出错", e);
                    }

                    // 检查并移除 audios 表中旧 audio_id 列的 NOT NULL 约束
                    try {
                        Integer audioIdCol = jdbcTemplate.queryForObject(
                                "SELECT count(*) FROM pragma_table_info('audios') WHERE name='audio_id' AND \"notnull\"=1",
                                Integer.class);
                        if (audioIdCol != null && audioIdCol > 0) {
                            logger.info("audios 表 audio_id 列存在 NOT NULL 约束，正在迁移...");
                            // SQLite 不支持直接修改约束，通过重建表来移除 NOT NULL
                            jdbcTemplate.execute("CREATE TABLE audios_new ("
                                    + "audio_id TEXT,"
                                    + "uuid TEXT PRIMARY KEY NOT NULL,"
                                    + "name TEXT NOT NULL,"
                                    + "path TEXT NOT NULL,"
                                    + "type TEXT,"
                                    + "tags TEXT,"
                                    + "created_time DATETIME DEFAULT CURRENT_TIMESTAMP"
                                    + ")");
                            jdbcTemplate.execute("INSERT INTO audios_new "
                                    + "(audio_id, uuid, name, path, type, tags, created_time) "
                                    + "SELECT audio_id, uuid, name, path, type, tags, created_time FROM audios");
                            jdbcTemplate.execute("DROP TABLE audios");
                            jdbcTemplate.execute("ALTER TABLE audios_new RENAME TO audios");
                            logger.info("audios 表迁移完成，audio_id 列 NOT NULL 约束已移除");
                        }
                    } catch (Exception e) {
                        logger.warn("迁移 audios 表 audio_id 约束时出错（可能已迁移过）: {}", e.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            logger.error("数据库初始化失败: {}", e.getMessage(), e);
            throw e;
        }
    }
}
