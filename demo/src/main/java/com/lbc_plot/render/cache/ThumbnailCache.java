package com.lbc_plot.render.cache;

import java.awt.image.BufferedImage;
import java.io.File;

import com.lbc_plot.resource.model.Portrait;

public interface ThumbnailCache {
    boolean exists(Portrait portrait);
    File getFile(Portrait portrait);
    String getRelativePath(Portrait portrait);
    void put(Portrait portrait, BufferedImage image) throws Exception;
    boolean delete(Portrait portrait);
    boolean existsByPath(String thumbnailPath);
    File getFileByPath(String thumbnailPath);
    boolean deleteByPath(String thumbnailPath);
    int clear();
}
