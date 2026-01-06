package com.lbc_plot.common.util;

import java.io.File;

// PathUtils.java
public class PathUtils {

    /**
     * 将相对路径转换为绝对路径
     */
    public static String toAbsolutePath(String relativePath) {
        if (relativePath == null || relativePath.isEmpty()) {
            return null;
        }
        return new File(relativePath).getAbsolutePath();
    }

    /**
     * 检查路径是否为相对路径
     */
    public static boolean isRelativePath(String path) {
        if (path == null || path.isEmpty()) {
            return false;
        }
        File file = new File(path);
        return !file.isAbsolute();
    }

    /**
     * 确保路径使用统一的分隔符
     */
    public static String normalizePath(String path) {
        if (path == null)
            return null;
        return path.replace('\\', File.separatorChar)
                .replace('/', File.separatorChar);
    }

    /**
     * 获取项目根目录
     */
    public static String getProjectRoot() {
        return System.getProperty("user.dir");
    }
}