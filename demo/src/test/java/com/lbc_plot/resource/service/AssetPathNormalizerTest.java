package com.lbc_plot.resource.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * {@link AssetPathNormalizer} 的回归测试。
 *
 * <p>背景：资源管理页面会把后端返回的 {@code /assets/backgrounds/x.png} 补成
 * {@code http://localhost:8081/assets/backgrounds/x.png} 交给 {@code <img>}，
 * 而"编辑背景 → 保存"又把这份补过的对象原样提交回后端。运行日志里可以看到
 * 数据库真的存进了绝对 URL，随后文件校验失败、预览退回黑底、删除拼出
 * {@code ...\assets\http:\localhost:8081\assets\...} 这种非法路径。
 */
class AssetPathNormalizerTest {

    @Test
    @DisplayName("前端补全的绝对 URL 收敛成站内路径")
    void stripsSchemeHostAndPort() {
        assertEquals("/assets/backgrounds/x.png",
                AssetPathNormalizer.toAssetPath("http://localhost:8081/assets/backgrounds/x.png"));
        assertEquals("/assets/backgrounds/x.png",
                AssetPathNormalizer.toAssetPath("https://example.com/assets/backgrounds/x.png"));
    }

    @Test
    @DisplayName("assets/ 与 ./assets/ 前缀统一补上开头的斜杠")
    void addsLeadingSlash() {
        assertEquals("/assets/backgrounds/x.png",
                AssetPathNormalizer.toAssetPath("assets/backgrounds/x.png"));
        assertEquals("/assets/backgrounds/x.png",
                AssetPathNormalizer.toAssetPath("./assets/backgrounds/x.png"));
        assertEquals("/assets/backgrounds/x.png",
                AssetPathNormalizer.toAssetPath("/assets/backgrounds/x.png"));
    }

    @Test
    @DisplayName("Windows 反斜杠也要能识别")
    void handlesBackslashes() {
        assertEquals("/assets/backgrounds/x.png",
                AssetPathNormalizer.toAssetPath("\\assets\\backgrounds\\x.png"));
        assertEquals("/assets/backgrounds/x.png",
                AssetPathNormalizer.toAssetPath("assets\\backgrounds\\x.png"));
    }

    @Test
    @DisplayName("带大小写的绝对 URL 同样收敛（host 大小写不影响路径）")
    void handlesMixedCaseUrl() {
        assertEquals("/assets/backgrounds/x.png",
                AssetPathNormalizer.toAssetPath("HTTP://LOCALHOST:8081/assets/backgrounds/x.png"));
    }

    @Test
    @DisplayName("浏览器临时地址保持原样，交给调用方清理")
    void keepsBlobAndDataUrls() {
        assertEquals("blob:http://localhost:8081/abc",
                AssetPathNormalizer.toAssetPath("blob:http://localhost:8081/abc"));
        assertEquals("data:image/png;base64,AAAA",
                AssetPathNormalizer.toAssetPath("data:image/png;base64,AAAA"));
    }

    @Test
    @DisplayName("null / 空串安全")
    void handlesNullAndEmpty() {
        assertNull(AssetPathNormalizer.toAssetPath(null));
        assertEquals("", AssetPathNormalizer.toAssetPath(""));
        assertEquals("", AssetPathNormalizer.toAssetPath("   "));
    }

    @Test
    @DisplayName("不是站内资源的裸文件名保持原样（不猜目录）")
    void keepsPlainFileNames() {
        assertEquals("x.png", AssetPathNormalizer.toAssetPath("x.png"));
    }
}
