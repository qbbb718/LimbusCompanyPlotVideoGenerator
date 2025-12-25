package com.lbc_plot.util.text;

import com.lbc_plot.core.audio.model.AudioCommand;
import com.lbc_plot.core.audio.model.AudioCommandType;
import com.lbc_plot.core.service.CharacterService;
import com.lbc_plot.core.service.BackgroundService;
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
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
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
    // Stop BGM directive: a line exactly like [-STOP] (case-insensitive)
    private static final Pattern STOP_BGM_PATTERN = Pattern.compile("^\\s*\\[-STOP\\]\\s*", Pattern.CASE_INSENSITIVE);
    private static final Pattern BG_PATTERN = Pattern.compile("^\\s*\\{(.+?)\\}\\s*");
    private static final Pattern SPEAKER_PATTERN = Pattern.compile("^\\s*([^:]+)\\s*:\\s*(.+)$");
    private static final Pattern EMOTION_PATTERN = Pattern.compile("(.+?)\\((.+?)\\)\\s*$");

    /**
     * 解析文本文件为 Record 列表
     */
    public static List<Record> parse(Path file) throws IOException {
        return parse(file, null, null);
    }
    
    /**
     * 解析文本字符串为 Record 列表
     */
    public static List<Record> parseText(String text) throws IOException {
        // 将文本字符串转换为临时文件，然后使用现有的parse方法
        Path tempFile = Files.createTempFile("records", ".txt");
        try {
            Files.writeString(tempFile, text);
            return parse(tempFile, null, null);
        } finally {
            // 确保临时文件被删除
            try {
                Files.deleteIfExists(tempFile);
            } catch (IOException e) {
                // 忽略删除失败
            }
        }
    }

    /**
     * Parse with optional CharacterService to map speaker names to MyCharacter/Portrait.
     */
    public static List<Record> parse(Path file, CharacterService characterService) throws IOException {
        return parse(file, characterService, null);
    }

    /**
     * Parse with optional CharacterService and BackgroundService. If BackgroundService is provided,
     * backgrounds will be created/queried in DB and returned Background instances will be used for visuals.
     */
    public static List<Record> parse(Path file, CharacterService characterService, BackgroundService backgroundService) throws IOException {
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

            // BGM 停止指令：[-STOP]
            Matcher mStop = STOP_BGM_PATTERN.matcher(line);
            if (mStop.matches()) {
                // 如果有当前正在播放的 BGM，则在最后一条已有 record 上添加停止命令
                if (currentBgm != null) {
                    AudioCommand stop = new AudioCommand(AudioCommandType.BGM_STOP, currentBgm.getAudioId());
                    if (!records.isEmpty()) {
                        records.get(records.size()-1).addAudioCommand(stop);
                    }
                }
                // 清除当前 BGM 状态与 pending 标记
                currentBgm = null;
                bgmPendingStart = false;
                continue;
            }

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
                // If DB-backed BackgroundService is available, try to find the background entry.
                // Try exact path first, then try suffix/filename match against existing entries,
                // finally fall back to creating a new entry.
                if (backgroundService != null) {
                    try {
                        java.util.Optional<Background> byPath = backgroundService.findByPath(bgPath);
                        if (byPath.isPresent()) {
                            currentBg = byPath.get();
                        } else {
                            // try suffix/filename matching against existing backgrounds
                            String filename = bgPath;
                            int lastSlash = Math.max(bgPath.lastIndexOf('/'), bgPath.lastIndexOf('\\'));
                            if (lastSlash >= 0) filename = bgPath.substring(lastSlash + 1);
                            boolean found = false;
                            for (Background b : backgroundService.findAll()) {
                                if (b.getPath() != null) {
                                    if (b.getPath().endsWith(filename) || b.getPath().endsWith(bgPath)) {
                                        currentBg = b;
                                        found = true;
                                        break;
                                    }
                                }
                            }
                            if (!found) {
                                currentBg = backgroundService.findOrCreateByPath(bgPath, name, "parser");
                            }
                        }
                    } catch (Exception ex) {
                        logger.debug("BackgroundService lookup failed: {}", ex.getMessage());
                        currentBg = new Background(bgPath, name);
                    }
                } else {
                    currentBg = new Background(bgPath, name);
                }
                continue;
            }

            // 说话行
            Matcher mSpeak = SPEAKER_PATTERN.matcher(line);
            if (mSpeak.matches()) {
                String speaker = mSpeak.group(1).trim();
                String textPart = mSpeak.group(2).trim();

                // 检查情绪：支持更宽容的写法（英文枚举名 / 英文 code / 中文 displayName）
                Dialogue.Emotion emotion = Dialogue.Emotion.NORMAL;
                boolean emoSpecified = false;
                boolean emoParsed = false;
                Matcher mEmo = EMOTION_PATTERN.matcher(textPart);
                if (mEmo.matches()) {
                    emoSpecified = true;
                    textPart = mEmo.group(1).trim();
                    String rawEmo = mEmo.group(2).trim();
                    String emoUpper = rawEmo.toUpperCase();
                    // 1) Try Dialogue enum by name (English) first
                    try {
                        emotion = Dialogue.Emotion.valueOf(emoUpper);
                        emoParsed = true;
                    } catch (Exception ex) {
                        // 2) Try storage.Emotion parsing (supports code/name and can be extended to Chinese)
                        try {
                            com.lbc_plot.model.storage.Emotion se = com.lbc_plot.model.storage.Emotion.fromString(rawEmo);
                            // Map storage.Emotion -> Dialogue.Emotion (best-effort)
                            switch (se) {
                                case NORMAL:
                                    emotion = Dialogue.Emotion.NORMAL; break;
                                case HAPPY:
                                    emotion = Dialogue.Emotion.HAPPY; break;
                                case ANGRY:
                                    emotion = Dialogue.Emotion.ANGRY; break;
                                case SAD:
                                    emotion = Dialogue.Emotion.SAD; break;
                                case SURPRISED:
                                    emotion = Dialogue.Emotion.SURPRISED; break;
                                case CONFUSED:
                                    emotion = Dialogue.Emotion.CONFUSED; break;
                                case BLUSH:
                                    emotion = Dialogue.Emotion.HAPPY; break; // map blush -> happy
                                case HURT:
                                    emotion = Dialogue.Emotion.SAD; break; // map hurt -> sad
                                default:
                                    emotion = Dialogue.Emotion.NORMAL; break;
                            }
                            emoParsed = true;
                        } catch (Exception ex2) {
                            // ignore and leave as unparsed
                        }
                    }
                }

                // 建立 Dialogue
                Dialogue d = Dialogue.builder().text(textPart).speakerName(speaker).emotion(emotion).build();
                // 如果没有指定情绪，或指定但未解析成功，则尝试用 NLP 做后备识别
                if (!emoSpecified || !emoParsed) {
                    try {
                        Dialogue.Emotion nlp = d.emotionNLP();
                        if (nlp != null) {
                            d.setEmotion(nlp);
                            emotion = nlp;
                        }
                    } catch (Exception ex) {
                        // ignore NLP failures
                    }
                }
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
                            // Prefer portrait with matching emotion from the character's portrait list
                            // Map Dialogue.Emotion -> storage.Emotion via name matching when possible
                            com.lbc_plot.model.storage.Emotion desired = com.lbc_plot.model.storage.Emotion.fromString(emotion.name());
                            List<com.lbc_plot.model.storage.Portrait> charPortraits = null;
                            try {
                                charPortraits = chosen.getPortraits();
                            } catch (Exception ex) {
                                // fallback to DAO-based service methods
                                charPortraits = characterService.getCharacterPortraits(chosen.getCharacterID());
                            }
                            if (charPortraits != null && !charPortraits.isEmpty()) {
                                for (com.lbc_plot.model.storage.Portrait p : charPortraits) {
                                    if (p.getEmotion() != null && p.getEmotion().equals(desired)) {
                                        portrait = p;
                                        break;
                                    }
                                }
                            }
                            // fallback to service convenience method if not found in-memory
                            if (portrait == null) {
                                portrait = characterService.findPortraitByEmotion(chosen.getCharacterID(), desired.name());
                            }
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

                // 如果本条是旁白，则复制上一条 record 的角色列表以保持画面一致
                if (d.isNarrator() && !records.isEmpty()) {
                    try {
                        List<CharacterVisual> prevChars = records.get(records.size() - 1).getCharacters();
                        if (prevChars != null && !prevChars.isEmpty()) {
                                // 深拷贝 prevChars，避免修改原 record 的状态
                                ObjectMapper om = new ObjectMapper();
                                List<CharacterVisual> copy = om.convertValue(prevChars, new TypeReference<List<CharacterVisual>>(){});
                                // 根据当前 Dialogue 重置 dim 状态（旁白全部压暗；否则仅与 speaker 匹配的立绘为亮）
                                applyDimState(copy, d);
                                rec.setCharacters(copy);
                        }
                    } catch (Exception ex) {
                        logger.debug("Failed to copy character visuals for narrator: {}", ex.getMessage());
                    }
                }

                records.add(rec);
                continue;
            }

            // 未识别行，作为旁白文本
            Dialogue d = Dialogue.builder().text(line).speakerName(Dialogue.DEFAULT_NARRATOR).build();
            Record rec = new Record.Builder().dialogue(d).build();
            if (currentBgm != null) rec.addAudioCommand(new AudioCommand(AudioCommandType.BGM_START, currentBgm.getAudioId()));
            // 如果本条是旁白，复制上一条的角色立绘（如果存在）
            if (d.isNarrator() && !records.isEmpty()) {
                try {
                    List<CharacterVisual> prevChars = records.get(records.size() - 1).getCharacters();
                    if (prevChars != null && !prevChars.isEmpty()) {
                        ObjectMapper om = new ObjectMapper();
                        List<CharacterVisual> copy = om.convertValue(prevChars, new TypeReference<List<CharacterVisual>>(){});
                        applyDimState(copy, d);
                        rec.setCharacters(copy);
                    }
                } catch (Exception ex) {
                    logger.debug("Failed to copy character visuals for narrator (fallback): {}", ex.getMessage());
                }
            }
            records.add(rec);
        }

        return records;
    }

    /**
     * 根据当前 Dialogue 调整 character visuals 的亮/暗状态：
     * - 当为旁白时，所有立绘都设为暗
     * - 否则，仅与 speaker 匹配的立绘设为亮，其余设为暗
     */
    private static void applyDimState(List<CharacterVisual> chars, Dialogue d) {
        if (chars == null || chars.isEmpty() || d == null) return;
        try {
            boolean narrator = d.isNarrator();
            String speakerName = d.getSpeakerName();
            for (CharacterVisual cv : chars) {
                try {
                    if (narrator) {
                        cv.setDim(true);
                    } else {
                        // 尝试按 CharacterRef 名称匹配
                        String charName = null;
                        try {
                            if (cv.getChara() != null) charName = cv.getChara().getCharacterName();
                        } catch (Exception ex) {
                            // ignore
                        }
                        // 如果没有名字则尝试按 characterId
                        if (charName == null || charName.isBlank()) {
                            String cid = null;
                            try { cid = cv.getCharacterId(); } catch (Exception ex) {}
                            if (cid != null && cid.equals(speakerName)) {
                                cv.setDim(false);
                                continue;
                            }
                        }
                        if (charName != null && !charName.isBlank() && charName.equals(speakerName)) {
                            cv.setDim(false);
                        } else {
                            cv.setDim(true);
                        }
                    }
                } catch (Exception ex) {
                    try { cv.setDim(true); } catch (Exception ignore) {}
                }
            }
        } catch (Exception ex) {
            // 忽略所有异常以保证解析器健壮性
        }
    }
}
