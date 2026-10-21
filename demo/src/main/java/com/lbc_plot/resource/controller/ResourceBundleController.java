package com.lbc_plot.resource.controller;

import java.nio.file.Path;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import com.lbc_plot.resource.service.ResourceTransferService;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * @module 资源管理模块
 * @function 全部资源（角色 + 背景 + 音频）导入导出
 *
 * <p>资源管理页面顶部的一组按钮走这里：一次把三类资源打成一个 ZIP，方便换机 / 备份时
 * 一步迁移整个资源库，不必分别导出三次。
 *
 * <p>包结构（与单类型资源包的关系见 {@link ResourceTransferService}）：
 * <pre>
 * resources_xxx.zip
 * ├─ manifest.json         格式版本 + 导出时间
 * ├─ characters/           characters.json + 各角色立绘（与导出的角色包完全一致）
 * ├─ backgrounds/          backgrounds.json + 背景原图与缩略图
 * └─ audios/               audios.json + 音频文件
 * </pre>
 *
 * <p>导入同样接受单一类型的资源包：用户把"角色包"丢进"全部资源导入"也能正确识别。
 */
@RestController
@RequestMapping("/api")
public class ResourceBundleController {

    private static final Logger logger = LoggerFactory.getLogger(ResourceBundleController.class);

    @Autowired
    private ResourceTransferService resourceTransferService;

    /**
     * @api 导出全部资源
     * @endpoint POST /api/resources/export
     * @return ZIP 文件（角色 + 背景 + 音频）
     */
    @PostMapping("/resources/export")
    public ResponseEntity<StreamingResponseBody> exportAll() {
        Path tempZip = null;
        try {
            logger.info("导出全部资源请求");
            tempZip = resourceTransferService.exportAll();
            return TransferHttpSupport.zipDownload(tempZip,
                    "resources_" + System.currentTimeMillis() + ".zip");
        } catch (Exception e) {
            // 响应还没开始写时，临时包只能在这里清掉，否则会一直堆在系统临时目录里
            ResourceTransferService.deleteQuietly(tempZip);
            logger.error("导出全部资源失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("导出全部资源失败: " + e.getMessage());
        }
    }

    /**
     * @api 导入全部资源
     * @endpoint POST /api/resources/import
     * @param file 由"导出全部资源"生成的 ZIP（也兼容角色 / 背景 / 音频的单一类型资源包）
     * @return 各类型实际导入的数量，如 {@code {"characters":2,"backgrounds":5,"audios":3}}
     */
    @PostMapping("/resources/import")
    public ResourceTransferService.BundleImportResult importAll(
            @RequestParam("file") MultipartFile file) {
        Path tempZip = null;
        try {
            logger.info("导入全部资源请求，文件: " + file.getOriginalFilename());
            tempZip = ResourceTransferService.saveUploadedZip(file, "resources_import_");
            return resourceTransferService.importAll(tempZip);
        } catch (IllegalArgumentException e) {
            // 资源包本身有问题（缺清单、版本过新、包为空…）：交给 GlobalExceptionHandler 回 400，
            // 让前端能原样显示"这个包为什么不能用"
            throw e;
        } catch (Exception e) {
            logger.error("导入全部资源失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("导入全部资源失败: " + e.getMessage());
        } finally {
            ResourceTransferService.deleteQuietly(tempZip);
        }
    }
}
