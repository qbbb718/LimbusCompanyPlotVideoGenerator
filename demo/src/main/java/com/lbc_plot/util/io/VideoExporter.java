package com.lbc_plot.util.io;
import org.bytedeco.ffmpeg.global.avcodec;
import org.bytedeco.ffmpeg.global.avutil;
import org.bytedeco.javacv.FFmpegFrameRecorder;
import org.bytedeco.javacv.Frame;
import org.bytedeco.javacv.Java2DFrameConverter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.core.Composer.RenderOfVideo;
import com.lbc_plot.util.RenderQualityUtils;
import com.lbc_plot.util.VideoQualityConfig;

import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.OutputStream;
import java.util.List;

import javax.imageio.ImageIO;

/**
 * 高质量流式视频导出器 - 结合流式处理和高质量输出
 */
public class VideoExporter implements AutoCloseable {
    private static final Logger logger = LoggerFactory.getLogger(VideoExporter.class);
    
    private String outputPath;
    private int width = ProjectConfig.VIDEO_WIDTH;
    private int height = ProjectConfig.VIDEO_HEIGHT;
    private int frameRate = ProjectConfig.FRAME_RATE;
    private Process ffmpegProcess;
    private OutputStream ffmpegInput;
    private final Java2DFrameConverter converter;
    private FFmpegFrameRecorder recorder;
    
    public VideoExporter(String outputPath, int width, int height, int frameRate) {
        this(outputPath, width, height, frameRate, VideoQualityConfig.HIGH_QUALITY);
    }

    public VideoExporter(String outputPath, int width, int height, int frameRate, VideoQualityConfig.VideoPreset preset) {
        this.outputPath = outputPath;
        this.width = width;
        this.height = height;
        this.frameRate = frameRate;
        this.converter = new Java2DFrameConverter();
        this.preset = preset;
        initialize();
    }

    private VideoQualityConfig.VideoPreset preset;
    
    /**
     * 初始化高质量FFmpeg录制器
     */
    private void initialize() {
        try {
            logger.info("初始化高质量流式视频导出器: {}x{}, {}fps, {}", width, height, frameRate, outputPath);
            
            // 方法1: 使用JavaCV FFmpegFrameRecorder（推荐，与现有高质量代码兼容）
            initializeJavaCVRecorder();
            
            // 方法2: 备选方案 - 使用FFmpeg管道（如果JavaCV有问题）
            // initializeFFmpegPipe();
            
        } catch (Exception e) {
            logger.error("初始化高质量视频导出器失败", e);
            throw new RuntimeException("视频导出器初始化失败", e);
        }
    }
    
    /**
     * 方法1: 使用JavaCV FFmpegFrameRecorder（保持与现有高质量代码一致）
     */
    private void initializeJavaCVRecorder() {
        try {
            recorder = new FFmpegFrameRecorder(outputPath, width, height);
            
            // 🔥 使用与现有高质量代码完全相同的设置
            recorder.setVideoCodec(avcodec.AV_CODEC_ID_H264);
            recorder.setFormat("mp4");
            recorder.setFrameRate(frameRate);
            
            // 使用预设参数
            recorder.setVideoQuality(preset.quality);
            recorder.setVideoBitrate(preset.bitrate);
            recorder.setVideoOption("preset", preset.preset);
            
            // 关键：设置像素格式为YUV420P（广泛兼容）
            recorder.setPixelFormat(avutil.AV_PIX_FMT_YUV420P);
            
            // 音频设置（如果需要）
            recorder.setAudioChannels(2);
            recorder.setSampleRate(44100);
            
            recorder.start();
            logger.debug("JavaCV高质量录制器初始化成功");
            
        } catch (Exception e) {
            logger.error("JavaCV录制器初始化失败，尝试备选方案", e);
            initializeFFmpegPipe(); // 降级到备选方案
        }
    }
    
    /**
     * 方法2: 备选方案 - 使用FFmpeg命令行管道（更稳定）
     */
    private void initializeFFmpegPipe() {
        try {
            // 构建高质量FFmpeg命令（与现有高质量设置匹配）
            String[] ffmpegCommand = {
                "ffmpeg", "-y",
                "-f", "image2pipe",
                "-vcodec", "png", // 使用PNG保持高质量，而不是PPM
                "-r", String.valueOf(frameRate),
                "-i", "-",
                "-c:v", "libx264",
                "-crf", "18",           // CRF 18 = 高质量
                "-preset", "medium",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                "-r", String.valueOf(frameRate),
                outputPath
            };
            
            ProcessBuilder pb = new ProcessBuilder(ffmpegCommand);
            ffmpegProcess = pb.start();
            ffmpegInput = ffmpegProcess.getOutputStream();
            
            logger.debug("FFmpeg管道初始化成功，使用PNG编码");
            
        } catch (IOException e) {
            throw new RuntimeException("FFmpeg管道初始化失败", e);
        }
    }
    
    /**
     * 写入高质量帧
     */
    public void writeFrame(BufferedImage frame) throws IOException {
        if (recorder != null) {
            // 使用JavaCV录制器（高质量）
            writeFrameWithJavaCV(frame);
        } else {
            // 使用FFmpeg管道（高质量备选）
            writeFrameWithFFmpegPipe(frame);
        }
    }
    
    /**
     * 使用JavaCV写入帧（保持高质量）
     */
    private void writeFrameWithJavaCV(BufferedImage frame) {
        try {
            // 🔥 使用与现有高质量代码相同的图像处理逻辑
            BufferedImage compatibleFrame = ensureHighQualityCompatible(frame);
            Frame videoFrame = converter.convert(compatibleFrame);
            recorder.record(videoFrame);
            
        } catch (Exception e) {
            logger.error("JavaCV帧写入失败", e);
            throw new RuntimeException("帧写入失败", e);
        }
    }
    
    /**
     * 使用FFmpeg管道写入帧（高质量备选）
     */
    private void writeFrameWithFFmpegPipe(BufferedImage frame) throws IOException {
        // 使用PNG格式保持高质量（而不是PPM）
        writeImageAsPNG(frame, ffmpegInput);
        ffmpegInput.flush();
    }
    
    /**
     * 确保高质量兼容的图像格式（与现有代码一致）
     */
    private BufferedImage ensureHighQualityCompatible(BufferedImage frame) {
        // 使用与现有高质量代码相同的逻辑
        if (frame.getType() == BufferedImage.TYPE_3BYTE_BGR) {
            return frame;
        }
        
        // 转换为兼容格式，同时保持高质量
        BufferedImage compatibleImage = new BufferedImage(
            frame.getWidth(), 
            frame.getHeight(), 
            BufferedImage.TYPE_3BYTE_BGR
        );
        
        Graphics2D g2d = compatibleImage.createGraphics();
        RenderQualityUtils.setupUltraQualityRendering(g2d);
        g2d.drawImage(frame, 0, 0, null);
        g2d.dispose();
        
        return compatibleImage;
    }
    
    /**
     * 将图像写入为PNG格式（高质量）
     */
    private void writeImageAsPNG(BufferedImage image, OutputStream out) throws IOException {
        // 使用PNG编码保持高质量
        ImageIO.write(image, "png", out);
    }
    
    /**
     * 获取当前使用的编码方式（用于调试）
     */
    public String getEncodingMethod() {
        if (recorder != null) {
            return "JavaCV FFmpegFrameRecorder (高质量)";
        } else {
            return "FFmpeg PNG管道 (高质量备选)";
        }
    }
    
    @Override
    public void close() throws Exception {
        logger.info("关闭高质量视频导出器");
        
        try {
            if (recorder != null) {
                recorder.stop();
                recorder.release();
                logger.debug("JavaCV录制器已关闭");
            }
            
            if (ffmpegInput != null) {
                ffmpegInput.close();
            }
            
            if (ffmpegProcess != null) {
                int exitCode = ffmpegProcess.waitFor();
                if (exitCode != 0) {
                    logger.warn("FFmpeg进程退出码: {}", exitCode);
                }
                logger.debug("FFmpeg进程已关闭");
            }
            
            if (converter != null) {
                converter.close();
            }
            
        } catch (Exception e) {
            logger.error("关闭视频导出器时发生错误", e);
            throw e;
        }
    }
}