package com.lbc_plot.common.util.io;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * @module 导出提示文件模块
 *         视频导出成功后，在导出目录写入"美术素材来源"提示文件（UTF-8 纯文本），
 *         方便用户发布视频时直接复制说明文字。
 *
 *         提示文字与前端"视频生成成功"弹窗中的加粗大字使用同一份文案：
 *         前端的常量 ART_NOTICE_TEXT（RecordEditor.tsx）与本类的 NOTICE_TEXT 必须保持一致，
 *         修改文案时两处需同步（后端负责写文件，前端负责展示）。
 */
public final class ExportNoticeWriter {

    /**
     * 提示文字：发布视频时需要注明的素材来源。
     * 该字符串同时决定 txt 文件名与文件正文首行。
     */
    public static final String NOTICE_TEXT = "发布视频时请注明-所用游戏素材来自月海伦娜与边狱巴士中文wiki";

    /** 提示文件名（与提示文字同名，扩展名 .txt） */
    public static final String NOTICE_FILE_NAME = NOTICE_TEXT + ".txt";

    /** txt 文件正文：首行为提示文字，其后是使用说明 */
    private static final String NOTICE_FILE_CONTENT = NOTICE_TEXT + System.lineSeparator()
            + "（复制以上文字到视频简介或置顶评论即可。本文件由 LimbusCompany 剧情视频生成器自动生成，可随视频一起发布。）";

    private static final Logger logger = LoggerFactory.getLogger(ExportNoticeWriter.class);

    private ExportNoticeWriter() {
        // 工具类，禁止实例化
    }

    /**
     * @function 在导出目录写入提示文件
     *           文件已存在时直接覆盖，保证每次导出后内容都是最新的。
     *           写入失败只记录日志、不抛异常：提示文件属于附加产物，不应让整个视频导出流程失败。
     *
     * @param exportDir 导出目录（视频文件所在目录），为 null 时使用当前工作目录
     * @return 写入成功返回目标文件，失败返回 null
     */
    public static File writeNoticeFile(File exportDir) {
        File dir = exportDir != null ? exportDir : new File(".");
        try {
            if (!dir.exists()) {
                dir.mkdirs();
            }
            File target = new File(dir, NOTICE_FILE_NAME);
            Files.write(target.toPath(), NOTICE_FILE_CONTENT.getBytes(StandardCharsets.UTF_8));
            logger.info("已生成游戏素材来源提示文件: {}", target.getAbsolutePath());
            return target;
        } catch (Exception e) {
            logger.warn("生成游戏素材来源提示文件失败: dir={}, 错误={}", dir.getAbsolutePath(), e.getMessage());
            return null;
        }
    }
}
