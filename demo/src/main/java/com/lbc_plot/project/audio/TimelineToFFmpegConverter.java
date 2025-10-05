package com.lbc_plot.project.audio;

import java.util.ArrayList;
import java.util.List;

import com.lbc_plot.project.audio.model.AudioSegment;
import com.lbc_plot.project.audio.model.AudioTimeline;

/**
 * 将AudioTimeline转化为FFmpeg命令
 */
public class TimelineToFFmpegConverter {
    
    public static String convertToFFmpegCommand(AudioTimeline timeline, double frameRate, String outputPath) {
        StringBuilder cmd = new StringBuilder("ffmpeg");
        
        // 1. 添加输入文件
        for (AudioSegment segment : timeline.getSegments()) {
            cmd.append(" -i \"").append(segment.getAudioId()).append(".wav\"");
        }
        
        // 2. 构建复杂滤镜
        cmd.append(" -filter_complex \"");
        
        List<String> filterParts = new ArrayList<>();
        for (int i = 0; i < timeline.getSegments().size(); i++) {
            AudioSegment segment = timeline.getSegments().get(i);
            double startTime = segment.getStartFrame() / frameRate;
            
            // 格式: [0]adelay=5000|5000,volume=0.8[a0]
            String filter = String.format(
                "[%d]adelay=%.0f|%.0f,volume=%.2f[a%d]",
                i, startTime * 1000, startTime * 1000, segment.getVolume(), i
            );
            filterParts.add(filter);
        }
        
        cmd.append(String.join(";", filterParts));
        cmd.append(";");
        
        // 3. 混合所有轨道
        cmd.append(" ");
        for (int i = 0; i < timeline.getSegments().size(); i++) {
            cmd.append("[a").append(i).append("]");
        }
        cmd.append("amix=inputs=").append(timeline.getSegments().size()).append(":duration=longest");
        
        cmd.append("\"");
        
        // 4. 输出文件
        cmd.append(" \"").append(outputPath).append("\"");
        
        return cmd.toString();
    }
}