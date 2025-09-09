package com.lbc_plot.util;
import org.bytedeco.ffmpeg.global.avcodec;
import org.bytedeco.ffmpeg.global.avutil;
import org.bytedeco.javacv.FFmpegFrameRecorder;
import org.bytedeco.javacv.Java2DFrameConverter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.service.RenderOfVideo;

import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.util.List;

/**
 * 简化版视频导出工具
 * 基于你提供的代码模式，专门用于将BufferedImage列表导出为视频
 */
public class VideoExporter {
    private static final Logger logger = LoggerFactory.getLogger(VideoExporter.class);

    public static void exportRecord(Record record, String outputPath, int frameRate) throws Exception {
        
    }


    /**
     * 高质量视频导出（修复颜色问题版本）
     */
    public static void exportFramesHighQuality(List<BufferedImage> frames, String outputPath, int frameRate) throws Exception {
        if (frames.isEmpty()) return;
        
        BufferedImage firstFrame = frames.get(0);
        int width = firstFrame.getWidth();
        int height = firstFrame.getHeight();
        
        FFmpegFrameRecorder recorder = null;
        Java2DFrameConverter converter = new Java2DFrameConverter();
        
        try {
            recorder = new FFmpegFrameRecorder(outputPath, width, height);
            
            // 视频编码设置
            recorder.setVideoCodec(avcodec.AV_CODEC_ID_H264);
            recorder.setFormat("mp4");
            recorder.setFrameRate(frameRate);
            
            // 🔥 修复：使用更合理的质量参数
            recorder.setVideoQuality(10); // 0-51，10是高质量，0可能过度压缩
            recorder.setVideoBitrate(12000000); // 12Mbps，1080p推荐
            
            // 🔥 修复：简化编码选项，避免冲突
            recorder.setVideoOption("preset", "medium"); // 改用medium，slow可能太慢
            // 移除可能冲突的选项：recorder.setVideoOption("crf", "18");
            // 移除可能冲突的选项：recorder.setVideoOption("tune", "film");
            
            // 🔥 关键修复：不强制设置像素格式，让FFmpeg自动处理
            // 移除：recorder.setPixelFormat(avutil.AV_PIX_FMT_YUV420P);
            
            recorder.start();
            
            for (BufferedImage frame : frames) {
                // 🔥 修复：使用兼容的图像格式，而不是强制转换
                BufferedImage compatibleFrame = ensureCompatibleType(frame);
                recorder.record(converter.convert(compatibleFrame));
            }
            
        } finally {
            if (recorder != null) {
                recorder.stop();
                recorder.release();
            }
            converter.close();
        }
    }

    /**
     * 确保图像类型兼容（修复版）
     */
    private static BufferedImage ensureCompatibleType(BufferedImage frame) {
        // JavaCV 的 Java2DFrameConverter 最适合 TYPE_3BYTE_BGR
        if (frame.getType() == BufferedImage.TYPE_3BYTE_BGR) {
            return frame;
        }
        
        // 转换为兼容格式
        BufferedImage compatibleImage = new BufferedImage(
            frame.getWidth(), 
            frame.getHeight(), 
            BufferedImage.TYPE_3BYTE_BGR
        );
        
        Graphics2D g2d = compatibleImage.createGraphics();
        
        // 🔥 重要：这里使用高质量渲染设置
        RenderQualityUtils.setupUltraQualityRendering(g2d);
        
        g2d.drawImage(frame, 0, 0, null);
        g2d.dispose();
        
        return compatibleImage;
    }

    /**
     * 确保帧质量
     */
    private static BufferedImage ensureHighQualityFrame(BufferedImage frame) {
        // 如果已经是ARGB格式，直接返回
        if (frame.getType() == BufferedImage.TYPE_INT_ARGB) {
            return frame;
        }
        
        // 转换为高质量格式
        BufferedImage highQualityFrame = new BufferedImage(
            frame.getWidth(), 
            frame.getHeight(), 
            BufferedImage.TYPE_INT_ARGB
        );
        
        Graphics2D g2d = highQualityFrame.createGraphics();
        RenderQualityUtils.setupUltraQualityRendering(g2d);
        g2d.drawImage(frame, 0, 0, null);
        g2d.dispose();
        
        return highQualityFrame;
    }


    /**
     * 将BufferedImage列表导出为MP4视频
     * @param frames 已渲染的图像帧列表
     * @param outputPath 输出视频路径
     * @param frameRate 帧率
     * @throws Exception 导出失败时抛出
     */
    public static void exportFrames(List<BufferedImage> frames, String outputPath, int frameRate) throws Exception {
        if (frames == null || frames.isEmpty()) {
            throw new IllegalArgumentException("帧列表不能为空");
        }

        // 从第一帧获取视频尺寸
        BufferedImage firstFrame = frames.get(0);
        int width = firstFrame.getWidth();
        int height = firstFrame.getHeight();

        FFmpegFrameRecorder recorder = null;
        Java2DFrameConverter converter = new Java2DFrameConverter();

        try {
            // 创建视频录制器
            recorder = new FFmpegFrameRecorder(outputPath, width, height);
            recorder.setVideoCodec(avcodec.AV_CODEC_ID_H264);
            recorder.setFrameRate(frameRate);
            recorder.setFormat("mp4");
            
            // 设置合适的比特率（可根据需要调整）
            int bitrate = calculateBitrate(width, height, frameRate);
            recorder.setVideoBitrate(bitrate);

            // 开始录制
            recorder.start();

            // 逐帧处理
            for (int i = 0; i < frames.size(); i++) {
                BufferedImage frame = frames.get(i);
                
                // 确保图像类型兼容
                BufferedImage compatibleFrame = ensureCompatibleType(frame);
                
                // 转换并录制帧
                recorder.record(converter.convert(compatibleFrame));
                
                // 进度提示
                if ((i + 1) % 100 == 0 || (i + 1) == frames.size()) {
                    System.out.printf("已处理 %d/%d 帧 (%.1f%%)%n", 
                        i + 1, frames.size(), (i + 1) * 100.0 / frames.size());
                }
            }

            System.out.println("视频编码完成！");

        } finally {
            // 确保资源释放
            if (recorder != null) {
                try {
                    recorder.stop();
                    recorder.release();
                } catch (Exception e) {
                    System.err.println("关闭录制器时出错: " + e.getMessage());
                }
            }
            converter.close();
        }
    }

    /**
     * 使用默认帧率导出
     */
    public static void exportFrames(List<BufferedImage> frames, String outputPath) throws Exception {
        exportFrames(frames, outputPath, 30); // 默认30fps
    }

    

    /**
     * 计算合适的比特率
     */
    private static int calculateBitrate(int width, int height, int frameRate) {
        // 根据分辨率计算比特率（单位：kbps）
        int baseBitrate;
        
        if (width <= 640 && height <= 480) {
            baseBitrate = 1000; // 低分辨率
        } else if (width <= 1280 && height <= 720) {
            baseBitrate = 2500; // 720p
        } else if (width <= 1920 && height <= 1080) {
            baseBitrate = 5000; // 1080p
        } else if (width <= 3840 && height <= 2160) {
            baseBitrate = 15000; // 4K
        } else {
            baseBitrate = 20000; // 更高分辨率
        }
        
        return baseBitrate;
    }


}