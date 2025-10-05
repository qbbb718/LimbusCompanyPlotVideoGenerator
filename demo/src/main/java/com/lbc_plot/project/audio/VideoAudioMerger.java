package com.lbc_plot.project.audio;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.bytedeco.ffmpeg.global.avcodec;
import org.bytedeco.ffmpeg.global.avutil;
import org.bytedeco.javacv.FFmpegFrameGrabber;
import org.bytedeco.javacv.FFmpegFrameRecorder;
import org.bytedeco.javacv.Frame;
import org.bytedeco.javacv.FrameGrabber;
import org.bytedeco.javacv.FrameRecorder;

import java.io.File;
import java.io.IOException;

/**
 * 音视频合并器 - 使用 JavaCV/FFmpeg 合并视频和音频
 */
public class VideoAudioMerger {
    private static final Logger logger = LoggerFactory.getLogger(VideoAudioMerger.class);
    
    // 默认视频编码器
    private static final int VIDEO_CODEC = avcodec.AV_CODEC_ID_H264;
    // 默认音频编码器
    private static final int AUDIO_CODEC = avcodec.AV_CODEC_ID_AAC;
    // 默认像素格式
    private static final int PIXEL_FORMAT = avutil.AV_PIX_FMT_YUV420P;
    // 默认音频采样格式
    private static final int SAMPLE_FORMAT = avutil.AV_SAMPLE_FMT_FLTP;
    
    /**
     * 合并视频和音频文件
     * @param videoFile 视频文件（无声）
     * @param audioFile 音频文件
     * @param outputPath 输出文件路径
     * @return 合并后的文件
     * @throws Exception 合并失败时抛出
     */
    public static File mergeVideoAndAudio(String videoPath, String audioPath, String outputPath) throws Exception {
        logger.info("开始合并音视频: 视频={}, 音频={}, 输出={}", 
            videoPath, audioPath, outputPath);
        
        long startTime = System.currentTimeMillis();
        
        FFmpegFrameGrabber videoGrabber = null;
        FFmpegFrameGrabber audioGrabber = null;
        FFmpegFrameRecorder recorder = null;
        
        try {
            // 1. 检查输入文件
            File videoFile = new File(videoPath);
            File audioFile = new File(audioPath);
            
            if (!videoFile.exists()) {
                throw new IOException("视频文件不存在: " + videoPath);
            }
            if (!audioFile.exists()) {
                throw new IOException("音频文件不存在: " + audioPath);
            }
            
            // 2. 创建抓取器
            videoGrabber = new FFmpegFrameGrabber(videoFile);
            audioGrabber = new FFmpegFrameGrabber(audioFile);
            
            // 3. 启动抓取器
            logger.debug("启动视频抓取器");
            videoGrabber.start();
            
            logger.debug("启动音频抓取器");
            audioGrabber.start();
            
            // 4. 创建录制器
            recorder = new FFmpegFrameRecorder(outputPath, 
                videoGrabber.getImageWidth(), videoGrabber.getImageHeight());
            
            // 配置录制器参数
            configureRecorder(recorder, videoGrabber, audioGrabber);
            
            logger.debug("启动录制器");
            recorder.start();
            
            // 5. 处理视频帧
            logger.info("开始处理视频帧");
            processVideoFrames(videoGrabber, recorder);
            
            // 6. 处理音频帧
            logger.info("开始处理音频帧");
            processAudioFrames(audioGrabber, recorder);
            
            long duration = System.currentTimeMillis() - startTime;
            logger.info("音视频合并完成: {}, 耗时: {}ms", outputPath, duration);
            
            return new File(outputPath);
            
        } catch (Exception e) {
            logger.error("音视频合并失败", e);
            throw e;
        } finally {
            // 7. 清理资源
            closeResources(videoGrabber, audioGrabber, recorder);
        }
    }
    
    /**
     * 配置录制器参数
     */
    private static void configureRecorder(FFmpegFrameRecorder recorder, 
                                        FFmpegFrameGrabber videoGrabber,
                                        FFmpegFrameGrabber audioGrabber) {
        // 视频参数
        recorder.setVideoCodec(VIDEO_CODEC);
        recorder.setFrameRate(videoGrabber.getFrameRate());
        recorder.setPixelFormat(PIXEL_FORMAT);
        recorder.setVideoBitrate(videoGrabber.getVideoBitrate());
        recorder.setVideoQuality(0); // 最高质量
        
        // 音频参数
        recorder.setAudioCodec(AUDIO_CODEC);
        recorder.setSampleRate(audioGrabber.getSampleRate());
        recorder.setAudioChannels(audioGrabber.getAudioChannels());
        recorder.setAudioBitrate(audioGrabber.getAudioBitrate());
        recorder.setSampleFormat(SAMPLE_FORMAT);
        
        logger.debug("录制器配置: 视频{}x{}@{}fps, 音频{}Hz {}声道", 
            videoGrabber.getImageWidth(), videoGrabber.getImageHeight(),
            videoGrabber.getFrameRate(), audioGrabber.getSampleRate(),
            audioGrabber.getAudioChannels());
    }
    
    /**
     * 处理视频帧
     */
    private static void processVideoFrames(FFmpegFrameGrabber videoGrabber, 
                                         FFmpegFrameRecorder recorder) throws Exception {
        Frame videoFrame;
        long videoFrameCount = 0;
        
        while ((videoFrame = videoGrabber.grabImage()) != null) {
            recorder.record(videoFrame);
            videoFrameCount++;
            
            // 每处理1000帧记录一次进度
            if (videoFrameCount % 1000 == 0) {
                logger.debug("已处理视频帧: {}", videoFrameCount);
            }
        }
        
        logger.info("视频帧处理完成: {}帧", videoFrameCount);
    }
    
    /**
     * 处理音频帧
     */
    private static void processAudioFrames(FFmpegFrameGrabber audioGrabber,
                                         FFmpegFrameRecorder recorder) throws Exception {
        Frame audioFrame;
        long audioFrameCount = 0;
        
        while ((audioFrame = audioGrabber.grabSamples()) != null) {
            recorder.record(audioFrame);
            audioFrameCount++;
            
            // 每处理1000帧记录一次进度
            if (audioFrameCount % 1000 == 0) {
                logger.debug("已处理音频帧: {}", audioFrameCount);
            }
        }
        
        logger.info("音频帧处理完成: {}帧", audioFrameCount);
    }
    
    /**
     * 关闭所有资源
     */
    private static void closeResources(FFmpegFrameGrabber videoGrabber,
                                     FFmpegFrameGrabber audioGrabber,
                                     FFmpegFrameRecorder recorder) {
        try {
            if (recorder != null) {
                recorder.stop();
                recorder.release();
            }
        } catch (Exception e) {
            logger.warn("关闭录制器失败", e);
        }
        
        try {
            if (videoGrabber != null) {
                videoGrabber.stop();
                videoGrabber.release();
            }
        } catch (Exception e) {
            logger.warn("关闭视频抓取器失败", e);
        }
        
        try {
            if (audioGrabber != null) {
                audioGrabber.stop();
                audioGrabber.release();
            }
        } catch (Exception e) {
            logger.warn("关闭音频抓取器失败", e);
        }
    }
    
    /**
     * 简化方法 - 使用文件路径
     */
    public static File mergeVideoAndAudio(File videoFile, File audioFile, String outputPath) throws Exception {
        return mergeVideoAndAudio(videoFile.getAbsolutePath(), audioFile.getAbsolutePath(), outputPath);
    }
}