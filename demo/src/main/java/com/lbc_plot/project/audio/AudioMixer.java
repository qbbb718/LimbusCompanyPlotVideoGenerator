package com.lbc_plot.project.audio;

import org.bytedeco.javacv.*;
import org.bytedeco.ffmpeg.global.avutil;

import java.util.ArrayList;
import java.util.List;


public class AudioMixer {
    //用 JavaCV 混合音频并输出 MP3

    public static void mixAudioToFile(
        List<AudioCommand> commands, 
        String outputMp3Path,
        int frameRate
    ) throws Exception {
        
        // 1. 初始化音频轨道
        List<AudioTrack> tracks = new ArrayList<>();
        for (AudioCommand cmd : commands) {
            tracks.add(new AudioTrack(
                cmd.getAudioFile(), 
                cmd.getType() == AudioCommandType.LOOP,
                cmd.getStartFrame(),
                frameRate
            ));
        }

        // 2. 计算总时长（按最长的音频命令）
        int maxDurationFrames = commands.stream()
            .mapToInt(cmd -> cmd.getStartFrame() + cmd.getDurationFrames())
            .max().orElse(0);

        // 3. 创建音频录制器
        FFmpegFrameRecorder audioRecorder = new FFmpegFrameRecorder(
            outputMp3Path,
            2 // 立体声
        );
        audioRecorder.setAudioCodec(avutil.AV_CODEC_ID_MP3);
        audioRecorder.setSampleRate(44100); // 标准采样率
        audioRecorder.start();

        // 4. 逐帧混合并写入MP3
        for (int frame = 0; frame < maxDurationFrames; frame++) {
            short[] mixedSamples = mixFrame(tracks, frame);
            Frame audioFrame = new Frame();
            audioFrame.samples = new short[][]{mixedSamples};
            audioRecorder.record(audioFrame);
        }

        audioRecorder.close();
    }

    private static short[] mixFrame(List<AudioTrack> tracks, int currentFrame) {
        short[] mixed = new short[1024]; // 假设每帧1024个样本
        for (AudioTrack track : tracks) {
            short[] samples = track.getSamples(currentFrame);
            if (samples != null) {
                for (int i = 0; i < samples.length; i++) {
                    // 简单混合（需处理溢出）
                    mixed[i] = (short) Math.min(
                        Short.MAX_VALUE, 
                        Math.max(Short.MIN_VALUE, mixed[i] + samples[i])
                    );
                }
            }
        }
        return mixed;
    }
}