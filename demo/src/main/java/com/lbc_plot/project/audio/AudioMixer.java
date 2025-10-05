package com.lbc_plot.project.audio;

import javax.sound.sampled.*;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
/**
 * 基于Java标准库的音频混合器
 */
public class AudioMixer {
    private static final Logger logger = LoggerFactory.getLogger(AudioMixer.class);
    
    private final double totalDuration;
    private final AudioFormat outputFormat;
    private final List<AudioSegmentData> audioSegments;
    
    public AudioMixer(double totalDuration, AudioFormat outputFormat) {
        this.totalDuration = totalDuration;
        this.outputFormat = outputFormat;
        this.audioSegments = new ArrayList<>();
    }
    
    /**
     * 添加音频片段到混合器
     */
    public void addAudioSegment(AudioInputStream audioStream, double startTime, double duration, float volume) 
            throws IOException {
        // 读取音频数据
        byte[] audioData = readAudioData(audioStream, duration);
        
        AudioSegmentData segment = new AudioSegmentData(
            audioData, startTime, duration, volume
        );
        audioSegments.add(segment);
        
        logger.debug("添加音频片段: 开始{}秒, 时长{}秒, 音量{}, 数据大小{}字节", 
            startTime, duration, volume, audioData.length);
    }
    
    /**
     * 读取音频数据
     */
    private byte[] readAudioData(AudioInputStream audioStream, double duration) throws IOException {
        // 计算需要读取的字节数
        int bytesPerSecond = (int) (outputFormat.getSampleRate() * outputFormat.getFrameSize());
        int bytesToRead = (int) (duration * bytesPerSecond);
        
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] tempBuffer = new byte[4096];
        int totalRead = 0;
        
        while (totalRead < bytesToRead) {
            int maxToRead = Math.min(tempBuffer.length, bytesToRead - totalRead);
            int bytesRead = audioStream.read(tempBuffer, 0, maxToRead);
            
            if (bytesRead == -1) break;
            
            buffer.write(tempBuffer, 0, bytesRead);
            totalRead += bytesRead;
        }
        
        return buffer.toByteArray();
    }
    
    /**
     * 导出混合后的音频文件
     */
    public void exportToFile(File outputFile) throws IOException {
        logger.info("开始混合音频: {}个片段", audioSegments.size());
        
        // 计算总音频数据大小
        int totalBytes = (int) (totalDuration * outputFormat.getSampleRate() * outputFormat.getFrameSize());
        byte[] mixedAudio = new byte[totalBytes];
        
        // 初始化静音
        for (int i = 0; i < mixedAudio.length; i++) {
            mixedAudio[i] = 0;
        }
        
        // 混合所有音频片段
        for (AudioSegmentData segment : audioSegments) {
            mixAudioSegment(mixedAudio, segment);
        }
        
        // 写入WAV文件
        writeWavFile(mixedAudio, outputFile);
        
        logger.info("音频混合完成: {}", outputFile.getAbsolutePath());
    }
    
    /**
     * 混合单个音频片段
     */
    private void mixAudioSegment(byte[] mixedAudio, AudioSegmentData segment) {
        int startByte = (int) (segment.startTime * outputFormat.getSampleRate() * outputFormat.getFrameSize());
        int segmentBytes = segment.audioData.length;
        
        // 确保不越界
        int endByte = Math.min(startByte + segmentBytes, mixedAudio.length);
        int actualBytes = endByte - startByte;
        
        if (actualBytes <= 0) return;
        
        // 根据音频格式进行混合
        if (outputFormat.getSampleSizeInBits() == 16) {
            mix16BitAudio(mixedAudio, segment, startByte, actualBytes);
        } else {
            // 8位或其他格式的混合（简化处理）
            mix8BitAudio(mixedAudio, segment, startByte, actualBytes);
        }
    }
    
    /**
     * 混合16位音频数据
     */
    private void mix16BitAudio(byte[] mixedAudio, AudioSegmentData segment, int startByte, int bytesToMix) {
        // 将字节数据转换为16位样本
        ByteBuffer mixedBuffer = ByteBuffer.wrap(mixedAudio, startByte, bytesToMix)
            .order(outputFormat.isBigEndian() ? ByteOrder.BIG_ENDIAN : ByteOrder.LITTLE_ENDIAN);
        ByteBuffer segmentBuffer = ByteBuffer.wrap(segment.audioData, 0, bytesToMix)
            .order(outputFormat.isBigEndian() ? ByteOrder.BIG_ENDIAN : ByteOrder.LITTLE_ENDIAN);
        
        for (int i = 0; i < bytesToMix / 2; i++) {
            short mixedSample = mixedBuffer.getShort();
            short segmentSample = segmentBuffer.getShort();
            
            // 应用音量并混合（简单的加法混合）
            short adjustedSample = (short) (segmentSample * segment.volume);
            short newSample = (short) Math.max(Short.MIN_VALUE, 
                Math.min(Short.MAX_VALUE, mixedSample + adjustedSample));
            
            // 回写数据
            mixedBuffer.putShort(i * 2, newSample);
        }
    }
    
    /**
     * 混合8位音频数据（简化版）
     */
    private void mix8BitAudio(byte[] mixedAudio, AudioSegmentData segment, int startByte, int bytesToMix) {
        for (int i = 0; i < bytesToMix; i++) {
            int mixedSample = mixedAudio[startByte + i] & 0xFF;
            int segmentSample = segment.audioData[i] & 0xFF;
            
            // 应用音量并混合
            int adjustedSample = (int) (segmentSample * segment.volume);
            int newSample = Math.max(0, Math.min(255, mixedSample + adjustedSample));
            
            mixedAudio[startByte + i] = (byte) newSample;
        }
    }
    
    /**
     * 写入WAV文件
     */
    private void writeWavFile(byte[] audioData, File outputFile) throws IOException {
        AudioInputStream audioStream = new AudioInputStream(
            new ByteArrayInputStream(audioData),
            outputFormat,
            audioData.length / outputFormat.getFrameSize()
        );
        
        AudioSystem.write(audioStream, AudioFileFormat.Type.WAVE, outputFile);
        audioStream.close();
    }
    
    /**
     * 音频片段数据容器
     */
    private static class AudioSegmentData {
        final byte[] audioData;
        final double startTime;
        final double duration;
        final float volume;
        
        AudioSegmentData(byte[] audioData, double startTime, double duration, float volume) {
            this.audioData = audioData;
            this.startTime = startTime;
            this.duration = duration;
            this.volume = volume;
        }
    }
}