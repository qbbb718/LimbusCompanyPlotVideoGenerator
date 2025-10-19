package com.lbc_plot.util.text;

import com.lbc_plot.core.audio.model.AudioCommand;
import com.lbc_plot.core.audio.model.AudioCommandType;
import com.lbc_plot.core.service.CharacterService;
import com.lbc_plot.model.Record;
import com.lbc_plot.model.video.BackgroundVisual;
import com.lbc_plot.model.video.CharacterVisual;
import com.lbc_plot.model.video.CharacterRef;
import com.lbc_plot.model.video.Dialogue;
import com.lbc_plot.model.storage.Background;
import com.lbc_plot.model.storage.MyCharacter;
import com.lbc_plot.model.storage.Portrait;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 解析器：把简单的纯文本脚本转换为 List<Record>
 * 支持的语法（示例）：
 * [BGM文件]
 * {背景图片文件}
 * 角色名: 文本(情绪)
 * 旁白: 文本
 */
public class PlainTextRecordsParser {

    private static final Logger logger = LoggerFactory.getLogger(PlainTextRecordsParser.class);

    private static final Pattern BGM_PATTERN = Pattern.compile("^\\s*\\[(.+?)\\]\\s*");
    private static final Pattern BG_PATTERN = Pattern.compile("^\\s*\\{(.+?)\\}\\s*");
    private static final Pattern SPEAKER_PATTERN = Pattern.compile("^\\s*([^:]+)\\s*:\\s*(.+)$");
    private static final Pattern EMOTION_PATTERN = Pattern.compile("(.+?)\\((.+?)\\)\\s*$");

    /**
     * 解析文本文件为 Record 列表
     */
    public static List<Record> parse(Path file) throws IOException {
        return parse(file, null);
    }

    /**
     * Parse with optional CharacterService to map speaker names to MyCharacter/Portrait.
     */
    public static List<Record> parse(Path file, CharacterService characterService) throws IOException {
        List<Record> records = new ArrayList<>();

        List<String> lines = Files.readAllLines(file);
    // 当前状态
    AudioCommand currentBgm = null;
    Background currentBg = null;
    // 当解析到 [BGM] 行时，标记下一条 record 需要添加 BGM_START（避免为每个 record 重复添加）
    boolean bgmPendingStart = false;

        for (String rawLine : lines) {
            String line = rawLine.trim();
            if (line.isEmpty()) continue;

            // BGM 行：不单独创建 record，只改变当前 BGM 状态
            Matcher mBgm = BGM_PATTERN.matcher(line);
            if (mBgm.matches()) {
                String bgmFile = mBgm.group(1).trim();
                // 新BGM开始，先停止之前的BGM（在最后一个已存在的对话 record 上添加停止命令）
                if (currentBgm != null) {
                    AudioCommand stop = new AudioCommand(AudioCommandType.BGM_STOP, currentBgm.getAudioId());
                    if (!records.isEmpty()) {
                        records.get(records.size()-1).addAudioCommand(stop);
                    }
                }
                // 设置新的当前 BGM（但不创建单独的 record）
                currentBgm = new AudioCommand(AudioCommandType.BGM_START, bgmFile);
                // 标记下一条 record 应当包含 BGM_START
                bgmPendingStart = true;
                continue;
            }

            // 背景行：不单独创建 record，只改变当前背景状态
            Matcher mBg = BG_PATTERN.matcher(line);
            if (mBg.matches()) {
                String bgPath = mBg.group(1).trim();
                // derive a display name for the background from filename (strip extension)
                String name = bgPath;
                int slash = Math.max(bgPath.lastIndexOf('/'), bgPath.lastIndexOf('\\'));
                if (slash >= 0) name = bgPath.substring(slash + 1);
                int dot = name.lastIndexOf('.');
                if (dot > 0) name = name.substring(0, dot);
                currentBg = new Background(bgPath, name);
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
                // 如果当前背景存在或当前BGM存在，作为该 record 的一部分继承
                if (currentBg != null) {
                    rec.addBackgroundVisual(new BackgroundVisual(currentBg));
                    // 如果 dialogue 中没有 location（使用默认），则使用 background 的 name 作为 location
                    try {
                        if (d.getLocation() == null || Dialogue.DEFAULT_LOCATION.equals(d.getLocation())) {
                            if (currentBg.getName() != null && !currentBg.getName().isBlank()) {
                                d.setLocation(currentBg.getName());
                            }
                        }
                    } catch (Exception ex) {
                        logger.debug("Failed to apply background name to dialogue location: {}", ex.getMessage());
                    }
                }
                if (bgmPendingStart && currentBgm != null) {
                    // 只有当存在 pending 标记时才为本 record 添加 BGM_START，然后清除标记
                    rec.addAudioCommand(new AudioCommand(AudioCommandType.BGM_START, currentBgm.getAudioId()));
                    bgmPendingStart = false;
                }

                // Try to resolve speaker -> MyCharacter and Portrait via CharacterService
                if (characterService != null) {
                    try {
                        List<MyCharacter> matches = characterService.searchCharactersByName(speaker);
                        if (matches == null || matches.isEmpty()) {
                            // Fallback: try searching with whitespace removed (some sources may include invisible spaces)
                            String compact = speaker.replaceAll("\\s+", "");
                            if (!compact.equals(speaker)) {
                                logger.debug("No matches for '{}', trying compacted name '{}'", speaker, compact);
                                matches = characterService.searchCharactersByName(compact);
                            }
                        }

                        if (matches == null || matches.isEmpty()) {
                            logger.info("No character matches found for speaker '{}', treating as narrator or unknown", speaker);
                        } else {
                            logger.info("Found {} character match(es) for speaker '{}', using first result: {}",
                                matches.size(), speaker, matches.get(0).getCharacterName());
                        }

                        MyCharacter chosen = null;
                        if (matches != null && !matches.isEmpty()) {
                            chosen = matches.get(0);
                        }
                        if (chosen == null) {
                            chosen = MyCharacter.getDefaultNarrator();
                        }

                        Portrait portrait = null;
                        try {
                            portrait = characterService.findPortraitByEmotion(chosen.getCharacterID(), emotion.name());
                            if (portrait != null) {
                                logger.info("Found portrait '{}' for character '{}' (emotion={})", portrait.getPortraitID(), chosen.getCharacterName(), emotion.name());
                            } else {
                                logger.debug("No portrait by emotion for character '{}', trying default", chosen.getCharacterName());
                            }
                        } catch (Exception ex) {
                            logger.debug("findPortraitByEmotion failed for {}: {}", chosen.getCharacterID(), ex.getMessage());
                        }
                        if (portrait == null) {
                            try {
                                portrait = characterService.getDefaultPortrait(chosen);
                                if (portrait != null) {
                                    logger.info("Using default portrait '{}' for character '{}'", portrait.getPortraitID(), chosen.getCharacterName());
                                } else {
                                    logger.debug("No default portrait available for character '{}'", chosen.getCharacterName());
                                }
                            } catch (Exception ex) {
                                logger.debug("getDefaultPortrait failed for {}: {}", chosen.getCharacterID(), ex.getMessage());
                            }
                        }

                        if (chosen != null && portrait != null) {
                            try {
                                CharacterVisual cv = CharacterVisual.builder(chosen, portrait).bright().build();
                                rec.addCharacterVisual(cv);
                                // Also attach a CharacterRef to the Dialogue so UI can render the name/faction
                                try {
                                    CharacterRef cref = CharacterRef.from(chosen);
                                    d.addSpeaker(cref);
                                } catch (IOException ioe) {
                                    logger.debug("Failed to build CharacterRef for UI name image: {}", ioe.getMessage());
                                }
                            } catch (IOException ioe) {
                                logger.warn("Failed to build CharacterVisual for {}: {}", speaker, ioe.getMessage());
                            }
                        }
                    } catch (Exception e) {
                        logger.debug("CharacterService lookup failed for '{}': {}", speaker, e.getMessage());
                    }
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
