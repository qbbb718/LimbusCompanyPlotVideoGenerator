package com.lbc_plot.config;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

/**
 * 应用设置服务 — 基于 app_settings 表的 key-value 存储
 */
@Service
public class AppSettingsService {
    private static final Logger logger = LoggerFactory.getLogger(AppSettingsService.class);

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private static final RowMapper<Map.Entry<String, String>> ROW_MAPPER = (ResultSet rs, int rowNum) -> {
        try {
            return Map.entry(rs.getString("key"), rs.getString("value"));
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    };

    /** 获取单个设置 */
    public String get(String key) {
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT value FROM app_settings WHERE key = ?", String.class, key);
        } catch (Exception e) {
            logger.debug("获取设置 {} 失败，返回 null: {}", key, e.getMessage());
            return null;
        }
    }

    /** 获取单个设置，带默认值 */
    public String get(String key, String defaultValue) {
        String val = get(key);
        return val != null ? val : defaultValue;
    }

    /** 获取所有设置 */
    public Map<String, String> getAll() {
        try {
            Map<String, String> result = new HashMap<>();
            jdbcTemplate.query("SELECT key, value FROM app_settings", ROW_MAPPER)
                    .forEach(e -> result.put(e.getKey(), e.getValue()));
            return result;
        } catch (Exception e) {
            logger.warn("获取所有设置失败: {}", e.getMessage());
            return new HashMap<>();
        }
    }

    /** 设置单个键值 */
    public void set(String key, String value) {
        try {
            jdbcTemplate.update(
                    "INSERT INTO app_settings (key, value, updated_time) VALUES (?, ?, ?) "
                            + "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_time = excluded.updated_time",
                    key, value, LocalDateTime.now().toString());
            logger.debug("设置已保存: {} = {}", key, value);
        } catch (Exception e) {
            logger.error("保存设置失败: {} = {}", key, value, e);
        }
    }

    /** 批量设置 */
    public void setAll(Map<String, String> settings) {
        settings.forEach(this::set);
    }
}
