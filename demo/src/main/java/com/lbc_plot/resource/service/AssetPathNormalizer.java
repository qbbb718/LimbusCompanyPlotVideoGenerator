package com.lbc_plot.resource.service;

/**
 * 资源路径规范化工具。
 *
 * <p><b>背景</b>：资源管理页面前端会把后端返回的相对路径（{@code /assets/backgrounds/x.png}）
 * 补成可直接放进 {@code <img src>} 的绝对地址（{@code http://localhost:8081/assets/backgrounds/x.png}）。
 * 用户"编辑背景 → 保存"时，这份被补过的对象被原样提交回后端，于是数据库里
 * {@code backgrounds.path} 变成了 {@code http://localhost:8081/assets/backgrounds/x.png}。
 *
 * <p>运行日志里能看到后果：之后的文件存在性检查一律失败（"背景资源不存在（磁盘找不到）"），
 * 预览渲染找不到背景会退回默认黑底，删除时甚至拼出
 * {@code ...\assets\http:\localhost:8081\assets\backgrounds\x.png} 这种非法路径。
 *
 * <p>这里把外部传进来的路径统一收敛成"以 {@code /assets/} 开头的站内路径"，
 * 数据库只存站内路径，URL 前缀由前端在渲染时自己拼。
 */
public final class AssetPathNormalizer {

    /** 站内资源路径前缀。 */
    public static final String ASSETS_PREFIX = "/assets/";

    private AssetPathNormalizer() {
    }

    /**
     * 把各种写法的资源路径收敛成 {@code /assets/...} 形式。
     *
     * <p>能处理：
     * <ul>
     *   <li>{@code http://localhost:8081/assets/backgrounds/x.png}（前端补全的绝对地址）</li>
     *   <li>{@code https://host:port/assets/...}</li>
     *   <li>{@code assets/backgrounds/x.png}、{@code ./assets/backgrounds/x.png}</li>
     *   <li>{@code \assets\backgrounds\x.png}（Windows 反斜杠）</li>
     *   <li>已经是 {@code /assets/...} 的路径（原样返回，只统一斜杠）</li>
     * </ul>
     *
     * <p>不处理：{@code blob:} / {@code data:} 这类浏览器临时地址，以及既不以
     * {@code assets} 开头也不是绝对 URL 的裸文件名——这些原样返回，交给调用方决定
     * （例如清空、或按旧逻辑处理）。
     *
     * @param path 原始路径（可为 null）
     * @return 规范化的站内路径；无法识别时返回清理过斜杠的原文（null 仍为 null）
     */
    public static String toAssetPath(String path) {
        if (path == null) {
            return null;
        }
        String value = path.trim();
        if (value.isEmpty()) {
            return value;
        }

        // 浏览器临时地址：不属于站内资源，保持原样（调用方通常会把它清掉）
        String lower = value.toLowerCase();
        if (lower.startsWith("blob:") || lower.startsWith("data:")) {
            return value;
        }

        // 绝对 URL：去掉 scheme + host + port，只留 path
        int schemeEnd = value.indexOf("://");
        if (schemeEnd >= 0) {
            int pathStart = value.indexOf('/', schemeEnd + 3);
            value = pathStart >= 0 ? value.substring(pathStart) : "";
            if (value.isEmpty()) {
                return value;
            }
        }

        // 统一成正斜杠，便于后续前缀判断
        value = value.replace('\\', '/');

        // 逐个去掉开头的 "." / "/"，得到 "assets/..." 形式
        String stripped = value;
        while (stripped.startsWith("./")) {
            stripped = stripped.substring(2);
        }
        while (stripped.startsWith("/")) {
            stripped = stripped.substring(1);
        }

        if (stripped.startsWith("assets/") || stripped.equals("assets")) {
            return "/" + stripped;
        }

        // 不是站内资源路径（例如裸文件名）：保持调用方原来的写法，只统一斜杠
        return value;
    }
}
