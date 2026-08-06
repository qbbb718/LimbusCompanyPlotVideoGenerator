package com.lbc_plot.render.cache;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

import javax.imageio.ImageIO;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.lbc_plot.config.StorageConfig;
import com.lbc_plot.resource.model.Portrait;

@Component
public class DiskThumbnailCache implements ThumbnailCache {
    private static final Logger logger = LoggerFactory.getLogger(DiskThumbnailCache.class);

    private final Path baseDir;

    @Autowired
    public DiskThumbnailCache(StorageConfig storageConfig) {
        String thumbnailsDir = null;
        try {
            if (storageConfig != null) thumbnailsDir = storageConfig.getThumbnailsDir();
        } catch (Exception ignored) {}

        if (thumbnailsDir == null || thumbnailsDir.isEmpty()) {
            this.baseDir = Path.of("thumbnails").toAbsolutePath();
        } else {
            Path p = Path.of(thumbnailsDir);
            if (!p.isAbsolute()) {
                p = p.toAbsolutePath();
            }
            this.baseDir = p;
        }
        try { Files.createDirectories(this.baseDir); } catch (IOException e) {
            logger.warn("无法创建缩略图缓存目录: {}", this.baseDir, e);
        }
    }

    @Override
    public boolean exists(Portrait portrait) {
        File f = getFile(portrait);
        return f != null && f.exists();
    }

    @Override
    public File getFile(Portrait portrait) {
        if (portrait == null || portrait.getPortraitID() == null) return null;
        return baseDir.resolve(portrait.getPortraitID() + ".png").toFile();
    }

    @Override
    public String getRelativePath(Portrait portrait) {
        return "thumbnails/" + portrait.getPortraitID() + ".png";
    }

    @Override
    public void put(Portrait portrait, BufferedImage image) throws Exception {
        if (portrait == null || portrait.getPortraitID() == null) return;
        Path target = baseDir.resolve(portrait.getPortraitID() + ".png");
        Files.createDirectories(target.getParent());
        try {
            ImageIO.write(image, "png", target.toFile());
        } catch (IOException e) {
            throw new IOException("写入缩略图失败: " + target.toString(), e);
        }
    }

    @Override
    public boolean delete(Portrait portrait) {
        File f = getFile(portrait);
        if (f != null && f.exists()) {
            return f.delete();
        }
        return false;
    }

    @Override
    public boolean existsByPath(String thumbnailPath) {
        if (thumbnailPath == null) return false;
        return getFileByPath(thumbnailPath).exists();
    }

    @Override
    public File getFileByPath(String thumbnailPath) {
        Path p = Path.of(thumbnailPath);
        if (!p.isAbsolute()) p = baseDir.resolve(thumbnailPath).toAbsolutePath();
        return p.toFile();
    }

    @Override
    public boolean deleteByPath(String thumbnailPath) {
        File f = getFileByPath(thumbnailPath);
        if (f.exists()) return f.delete();
        return false;
    }

    @Override
    public int clear() {
        try {
            if (!Files.exists(baseDir)) return 0;
            return (int) Files.list(baseDir).map(Path::toFile).filter(File::delete).count();
        } catch (IOException e) {
            logger.warn("清理缩略图缓存失败", e);
            return 0;
        }
    }
}
