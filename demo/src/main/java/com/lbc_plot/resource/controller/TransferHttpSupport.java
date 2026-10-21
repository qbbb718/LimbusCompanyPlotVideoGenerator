package com.lbc_plot.resource.controller;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import com.lbc_plot.resource.service.ResourceTransferService;

/**
 * @module 资源管理模块
 * @function 资源包下载响应
 *
 * <p>导出接口先把资源打成临时 ZIP，再交给本类转成下载响应。
 *
 * <p>这里刻意用 {@link StreamingResponseBody} 而不是 {@code new UrlResource(tempZip.toUri())}：
 * "全部资源"包动辄几百 MB 到上 GB，直接返回文件资源时容器读完就把临时文件留在系统临时目录里，
 * 反复导出会把磁盘占满。改成流式响应后可以在传输结束（或客户端断开）时立即删掉临时文件。
 *
 * <p>临时文件在响应真正开始写之前出错时不会有人删，因此调用方仍需在异常分支里调用
 * {@link ResourceTransferService#deleteQuietly(Path)}。
 */
public final class TransferHttpSupport {

    private static final Logger logger = LoggerFactory.getLogger(TransferHttpSupport.class);

    /** 资源包统一下载为 application/zip */
    private static final MediaType ZIP_MEDIA_TYPE = MediaType.parseMediaType("application/zip");

    private TransferHttpSupport() {
    }

    /**
     * @function 构造 ZIP 下载响应（响应流写完后删除临时文件）
     * @param zipFile  已生成的临时 ZIP
     * @param fileName 下载时的建议文件名（前端不读这个头，但便于浏览器/调试直接访问时识别）
     */
    public static ResponseEntity<StreamingResponseBody> zipDownload(Path zipFile, String fileName)
            throws IOException {
        long contentLength = Files.size(zipFile);

        StreamingResponseBody body = outputStream -> {
            try (InputStream in = Files.newInputStream(zipFile)) {
                in.transferTo(outputStream);
            } finally {
                // 正常传完、客户端中途断开都会走到这里；临时文件的生命周期到此为止
                ResourceTransferService.deleteQuietly(zipFile);
                logger.info("资源包下载结束，已清理临时文件: {}", zipFile);
            }
        };

        return ResponseEntity.ok()
                .contentType(ZIP_MEDIA_TYPE)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + fileName + "\"")
                .contentLength(contentLength)
                .body(body);
    }
}
