package com.lbc_plot.service.Composer.contract;

import java.util.List;
import java.awt.image.BufferedImage;

public interface VedioLayerOperations {
    
    List<BufferedImage> generateDialogueFrames(
        BufferedImage staticContent,  // 预渲染的静态内容
        String fullText,              // 完整文本
        int speed,                    // 速度值（1-6）
        boolean isNarrator,           // 是否是旁白
        int width, int height         // 画面尺寸
    );

    BufferedImage composeTextOnly(int width, int height);
}
