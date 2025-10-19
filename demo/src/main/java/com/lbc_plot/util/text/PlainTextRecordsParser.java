package com.lbc_plot.util.text;

import com.lbc_plot.core.audio.model.AudioCommand;
import com.lbc_plot.core.audio.model.AudioCommandType;
import com.lbc_plot.model.Record;
import com.lbc_plot.model.video.BackgroundVisual;
import com.lbc_plot.model.video.Dialogue;
import com.lbc_plot.model.storage.Background;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 解析器：把简单的纯文本脚本转换为 List<Record>
 * 支持的语法（示例）：
 * [BGM文件]
 * {背景图片文件}
 * 角色名: 文本(情绪)
 * 旁白: 文本
 */
public class PlainTextRecordsParser {

    private static final Pattern BGM_PATTERN = Pattern.compile("^\\s*\\[(.+?)\\]\\s*");
    private static final Pattern BG_PATTERN = Pattern.compile("^\\s*\\{(.+?)\\}\\s*");
    private static final Pattern SPEAKER_PATTERN = Pattern.compile("^\\s*([^:]+)\\s*:\\s*(.+)$");
    private static final Pattern EMOTION_PATTERN = Pattern.compile("(.+?)\\((.+?)\\)\\s*$");

    /**
     * 解析文本文件为 Record 列表
     */
    public static List<Record> parse(Path file) throws IOException {
        List<Record> records = new ArrayList<>();

        List<String> lines = Files.readAllLines(file);
        // 当前状态
        AudioCommand currentBgm = null;
        Background currentBg = null;

        for (String rawLine : lines) {
            String line = rawLine.trim();
            if (line.isEmpty()) continue;

            // BGM 行
            Matcher mBgm = BGM_PATTERN.matcher(line);
            if (mBgm.matches()) {
                String bgmFile = mBgm.group(1).trim();
                // 新BGM开始，先停止之前的BGM
                if (currentBgm != null) {
                    // 添加停止命令到最后一条记录（如果存在）
                    AudioCommand stop = new AudioCommand(AudioCommandType.BGM_STOP, currentBgm.getAudioId());
                    if (!records.isEmpty()) {
                        records.get(records.size()-1).addAudioCommand(stop);
                    }
                }
                // 创建新的record（空dialogue，只有bgm命令）
                Record rec = new Record.Builder().dialogue(new Dialogue.Builder().text("...").build()).build();
                AudioCommand start = new AudioCommand(AudioCommandType.BGM_START, bgmFile);
                rec.addAudioCommand(start);
                records.add(rec);
                currentBgm = start;
                continue;
            }

            // 背景行
            Matcher mBg = BG_PATTERN.matcher(line);
            if (mBg.matches()) {
                String bgPath = mBg.group(1).trim();
                // 创建record并设置背景
                Record rec = new Record.Builder().dialogue(new Dialogue.Builder().text("...").build()).build();
                Background background = new Background(bgPath);
                BackgroundVisual bv = new BackgroundVisual(background);
                rec.addBackgroundVisual(bv);
                // 如果当前有BGM也需要继承到这个record（方便播放连续）
                if (currentBgm != null) {
                    rec.addAudioCommand(new AudioCommand(AudioCommandType.BGM_START, currentBgm.getAudioId()));
                }
                records.add(rec);
                continue;
            }

            // 说话行
            Matcher mSpeak = SPEAKER_PATTERN.matcher(line);
            if (mSpeak.matches()) {
                String speaker = mSpeak.group(1).trim();
                String textPart = mSpeak.group(2).trim();

                // 检查情绪
                Dialogue.Emotion emotion = Dialogue.Emotion.NORMAL;
                Matcher mEmo = EMOTION_PATTERN.matcher(textPart);
                if (mEmo.matches()) {
                    textPart = mEmo.group(1).trim();
                    String emoStr = mEmo.group(2).trim().toUpperCase();
                    try {
                        emotion = Dialogue.Emotion.valueOf(emoStr);
                    } catch (Exception e) {
                        // 忽略未知情绪，使用 NLP 解析或默认
                        emotion = Dialogue.Emotion.NORMAL;
                    }
                }

                // 建立 Dialogue
                Dialogue d = Dialogue.builder().text(textPart).speakerName(speaker).emotion(emotion).build();
                Record rec = new Record.Builder().dialogue(d).build();
                // 如果当前背景存在或当前BGM存在，继承
                if (currentBg != null) {
                    rec.addBackgroundVisual(new BackgroundVisual(currentBg));
                }
                if (currentBgm != null) {
                    rec.addAudioCommand(new AudioCommand(AudioCommandType.BGM_START, currentBgm.getAudioId()));
                }
                records.add(rec);
                continue;
            }

            // 未识别行，作为旁白文本
            Dialogue d = Dialogue.builder().text(line).speakerName(Dialogue.DEFAULT_NARRATOR).build();
            Record rec = new Record.Builder().dialogue(d).build();
            if (currentBgm != null) rec.addAudioCommand(new AudioCommand(AudioCommandType.BGM_START, currentBgm.getAudioId()));
            records.add(rec);
        }

        return records;
    }
}
