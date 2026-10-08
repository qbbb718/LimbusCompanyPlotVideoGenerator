package com.lbc_plot.plot.parser;

import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.render.audio.model.AudioCommand;
import com.lbc_plot.render.audio.model.AudioCommandType;
import com.lbc_plot.render.video.BackgroundVisual;
import com.lbc_plot.render.video.CharacterRef;
import com.lbc_plot.render.video.CharacterVisual;
import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.resource.dao.AudioDAO;
import com.lbc_plot.resource.model.Audio;
import com.lbc_plot.resource.model.Background;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;
import com.lbc_plot.resource.service.BackgroundService;
import com.lbc_plot.resource.service.CharacterService;

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
 * 角色名: 文本(情绪)&lt;位置&gt;
 * 旁白: 文本
 *
 * 其中 &lt;位置&gt; 为可选的立绘横向位置（百分比，0% 最左 / 50% 居中 / 100% 最右，缺省居中），
 * 解析后换算为 CharacterVisual 的 adjX 偏差值。
 */
public class PlainTextRecordsParser {

    private static final Logger logger = LoggerFactory.getLogger(PlainTextRecordsParser.class);

    private static final Pattern BGM_PATTERN = Pattern.compile("^\\s*\\[(.+?)\\]\\s*");
    private static final Pattern STOP_PATTERN = Pattern.compile("^\\s*\\[-.*?\\]\\s*");
    private static final Pattern BG_PATTERN = Pattern.compile("^\\s*\\{(.+?)\\}\\s*");
    private static final Pattern SPEAKER_PATTERN = Pattern.compile("^\\s*([^:]+)\\s*:\\s*(.+)$");
    private static final Pattern EMOTION_PATTERN = Pattern.compile("(.+?)\\((.+?)\\)\\s*$");
    /** 立绘位置标记：&lt;位置&gt;，如 &lt;0%&gt; / &lt;37.5%&gt; / &lt;100 %&gt;，可写在情绪之前或之后 */
    private static final Pattern POSITION_PATTERN = Pattern.compile("<\\s*(-?\\d+(?:\\.\\d+)?)\\s*%?\\s*>");
    /** 位置百分比合法范围（与前端 X坐标滑块一致：0% 最左，100% 最右） */
    private static final int MIN_POSITION_PERCENT = 0;
    private static final int MAX_POSITION_PERCENT = 100;

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
     * 解析文本字符串为 Record 列表，并传入 CharacterService/BackgroundService
     */
    public static List<Record> parseText(String text, CharacterService characterService,
            BackgroundService backgroundService) throws IOException {
        Path tempFile = Files.createTempFile("records", ".txt");
        try {
            Files.writeString(tempFile, text);
            return parse(tempFile, characterService, backgroundService);
        } finally {
            try {
                Files.deleteIfExists(tempFile);
            } catch (IOException e) {
                // 忽略删除失败
            }
        }
    }

    /**
     * Parse with optional CharacterService to map speaker names to
     * MyCharacter/Portrait.
     */
    public static List<Record> parse(Path file, CharacterService characterService) throws IOException {
        return parse(file, characterService, null);
    }

    /**
     * Parse with optional CharacterService and BackgroundService. If
     * BackgroundService is provided,
     * backgrounds will be created/queried in DB and returned Background instances
     * will be used for visuals.
     */
    public static List<Record> parse(Path file, CharacterService characterService, BackgroundService backgroundService)
            throws IOException {
        List<Record> records = new ArrayList<>();

        List<String> lines = Files.readAllLines(file);
        // 当前状态（持续跟踪）
        AudioCommand currentBgm = null;
        Background currentBg = null;

        // 待处理的指令（自上次对话以来累积，将附加到下一条对话 record）
        AudioCommand pendingBgm = null;
        Background pendingBg = null;
        boolean pendingStop = false;

        for (String rawLine : lines) {
            String line = rawLine.trim();
            if (line.isEmpty())
                continue;

            // STOP 指令：停止当前 BGM（在 BGM_PATTERN 之前检测，避免误匹配为 BGM）
            if (STOP_PATTERN.matcher(line).matches()) {
                pendingStop = true;
                currentBgm = null;
                logger.debug("BGM 停止指令，将附加到下一条对话");
                continue;
            }

            // BGM 行：不单独创建 record，累积到 pending 状态，附加到下一条对话
            Matcher mBgm = BGM_PATTERN.matcher(line);
            if (mBgm.matches()) {
                String bgmFile = mBgm.group(1).trim();
                String resolvedBgm = resolveBgmName(bgmFile);
                pendingBgm = new AudioCommand(AudioCommandType.BGM_ACTIVE, resolvedBgm);
                currentBgm = pendingBgm;
                logger.debug("BGM 指令: {} (解析为: {}), 将附加到下一条对话", bgmFile, resolvedBgm);
                continue;
            }

            // 背景行：不单独创建 record，累积到 pending 状态，附加到下一条对话
            Matcher mBg = BG_PATTERN.matcher(line);
            if (mBg.matches()) {
                String bgPath = mBg.group(1).trim();
                // 从用户输入中提取显示名称（去除路径和扩展名）
                String name = bgPath;
                int slash = Math.max(bgPath.lastIndexOf('/'), bgPath.lastIndexOf('\\'));
                if (slash >= 0) name = bgPath.substring(slash + 1);
                int dot = name.lastIndexOf('.');
                if (dot > 0) name = name.substring(0, dot);

                currentBg = resolveBackground(bgPath, name, backgroundService);
                pendingBg = currentBg;
                logger.debug("背景指令: {} (解析为: {}), 将附加到下一条对话", bgPath, name);
                continue;
            }

            // 说话行
            Matcher mSpeak = SPEAKER_PATTERN.matcher(line);
            if (mSpeak.matches()) {
                String speaker = mSpeak.group(1).trim();
                String textPart = mSpeak.group(2).trim();

                // 先剥离立绘位置标记 <位置>（如 <0%> / <50%> / <100%>），剩下的文本再解析情绪。
                // 标记可写在情绪之前或之后（如 "…(HAPPY)<70%>" 或 "…<70%>(HAPPY)"）；
                // 用 double 保存以支持小数百分比（如 37.5%）。
                Double positionPercent = null;
                Matcher mPos = POSITION_PATTERN.matcher(textPart);
                if (mPos.find() && isPositionToken(textPart.substring(mPos.start(), mPos.end()))) {
                    try {
                        positionPercent = Double.parseDouble(mPos.group(1));
                        textPart = (textPart.substring(0, mPos.start()) + " " + textPart.substring(mPos.end())).trim();
                        logger.debug("解析立绘位置标记: {}% -> adjX 待换算", positionPercent);
                    } catch (NumberFormatException nfe) {
                        logger.debug("无法解析立绘位置标记 '{}'，按普通文本处理", mPos.group(0));
                        positionPercent = null;
                    }
                }

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
                        // 2) Try storage.Emotion parsing (supports code/name and can be extended to
                        // Chinese)
                        try {
                            com.lbc_plot.resource.model.Emotion se = com.lbc_plot.resource.model.Emotion
                                    .fromString(rawEmo);
                            // Map storage.Emotion -> Dialogue.Emotion (best-effort)
                            switch (se) {
                                case NORMAL:
                                    emotion = Dialogue.Emotion.NORMAL;
                                    break;
                                case HAPPY:
                                    emotion = Dialogue.Emotion.HAPPY;
                                    break;
                                case ANGRY:
                                    emotion = Dialogue.Emotion.ANGRY;
                                    break;
                                case SAD:
                                    emotion = Dialogue.Emotion.SAD;
                                    break;
                                case SURPRISED:
                                    emotion = Dialogue.Emotion.SURPRISED;
                                    break;
                                case CONFUSED:
                                    emotion = Dialogue.Emotion.CONFUSED;
                                    break;
                                case BLUSH:
                                    emotion = Dialogue.Emotion.BLUSH;
                                    break;
                                case HURT:
                                    emotion = Dialogue.Emotion.HURT;
                                    break;
                                default:
                                    emotion = Dialogue.Emotion.NORMAL;
                                    break;
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

                // 应用待处理的指令到本条对话
                boolean hasNewBg = false;
                boolean hasNewBgm = false;

                if (pendingStop) {
                    currentBgm = null;
                    pendingStop = false;
                    // 将 STOP 作为伪指令附加到本条 record，以便 AudioTimelineBuilder
                    // 在当前 record 的起始帧结束旧 BGM（handleBgmStart 识别 "-" 前缀）
                    rec.addAudioCommand(new AudioCommand(AudioCommandType.BGM_ACTIVE, "-STOP"));
                }
                if (pendingBgm != null) {
                    rec.addAudioCommand(pendingBgm);
                    hasNewBgm = true;
                    pendingBgm = null;
                }
                if (pendingBg != null) {
                    rec.addBackgroundVisual(new BackgroundVisual(pendingBg));
                    currentBg = pendingBg;
                    hasNewBg = true;
                    pendingBg = null;
                }

                // 如果本条没有新背景且当前背景存在，则继承当前背景
                if (!hasNewBg && currentBg != null) {
                    rec.addBackgroundVisual(new BackgroundVisual(currentBg));
                }
                // 如果当前有背景，尝试设置 location
                if (currentBg != null) {
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
                // 如果本条没有新 BGM 且当前有正在播放的 BGM，则继承
                if (!hasNewBgm && currentBgm != null) {
                    rec.addAudioCommand(new AudioCommand(AudioCommandType.BGM_ACTIVE, currentBgm.getAudioId()));
                }

                // Try to resolve speaker -> MyCharacter and Portrait via CharacterService
                if (characterService != null) {
                    try {
                        List<MyCharacter> matches = characterService.searchCharactersByName(speaker);
                        if (matches == null || matches.isEmpty()) {
                            // Fallback: try searching with whitespace removed (some sources may include
                            // invisible spaces)
                            String compact = speaker.replaceAll("\\s+", "");
                            if (!compact.equals(speaker)) {
                                logger.debug("No matches for '{}', trying compacted name '{}'", speaker, compact);
                                matches = characterService.searchCharactersByName(compact);
                            }
                        }

                        if (matches == null || matches.isEmpty()) {
                            logger.info("No character matches found for speaker '{}', treating as narrator or unknown",
                                    speaker);
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
                            com.lbc_plot.resource.model.Emotion desired = com.lbc_plot.resource.model.Emotion
                                    .fromString(emotion.name());
                            List<com.lbc_plot.resource.model.Portrait> charPortraits = null;
                            try {
                                charPortraits = chosen.getPortraits();
                            } catch (Exception ex) {
                                // fallback to DAO-based service methods
                                charPortraits = characterService.getCharacterPortraits(chosen.getCharacterID());
                            }
                            if (charPortraits != null && !charPortraits.isEmpty()) {
                                for (com.lbc_plot.resource.model.Portrait p : charPortraits) {
                                    if (p.getEmotion() != null && p.getEmotion().equals(desired)) {
                                        portrait = p;
                                        break;
                                    }
                                }
                            }
                            // fallback to service convenience method if not found in-memory
                            if (portrait == null) {
                                portrait = characterService.findPortraitByEmotion(chosen.getCharacterID(),
                                        desired.name());
                            }
                            if (portrait != null) {
                                logger.info("Found portrait '{}' for character '{}' (emotion={})",
                                        portrait.getPortraitID(), chosen.getCharacterName(), emotion.name());
                            } else {
                                logger.debug("No portrait by emotion for character '{}', trying default",
                                        chosen.getCharacterName());
                            }
                        } catch (Exception ex) {
                            logger.debug("findPortraitByEmotion failed for {}: {}", chosen.getCharacterID(),
                                    ex.getMessage());
                        }
                        if (portrait == null) {
                            try {
                                portrait = characterService.getDefaultPortrait(chosen);
                                if (portrait != null) {
                                    logger.info("Using default portrait '{}' for character '{}'",
                                            portrait.getPortraitID(), chosen.getCharacterName());
                                } else {
                                    logger.debug("No default portrait available for character '{}'",
                                            chosen.getCharacterName());
                                }
                            } catch (Exception ex) {
                                logger.debug("getDefaultPortrait failed for {}: {}", chosen.getCharacterID(),
                                        ex.getMessage());
                            }
                        }

                        if (chosen != null && portrait != null) {
                            try {
                                // 行内 <位置> 指令换算为 adjX（0% 最左 / 50% 居中 / 100% 最右）
                                final Integer adjX = toAdjX(positionPercent);
                                CharacterVisual.Builder cvBuilder = CharacterVisual.builder(chosen, portrait).bright();
                                if (adjX != null) {
                                    cvBuilder.adjX(adjX);
                                }
                                CharacterVisual cv = cvBuilder.build();
                                rec.addCharacterVisual(cv);
                                if (adjX != null) {
                                    logger.info("立绘位置已应用: 角色={}, 位置={}%, adjX={}",
                                            chosen.getCharacterName(), positionPercent, adjX);
                                }
                                // Also attach a CharacterRef to the Dialogue so UI can render the name/faction
                                try {
                                    CharacterRef cref = CharacterRef.from(chosen);
                                    d.addSpeaker(cref);
                                } catch (IOException ioe) {
                                    logger.debug("Failed to build CharacterRef for UI name image: {}",
                                            ioe.getMessage());
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
                            List<CharacterVisual> copy = om.convertValue(prevChars,
                                    new TypeReference<List<CharacterVisual>>() {
                                    });
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

            // 应用待处理的指令（同对话处理逻辑）
            boolean hasNewBg2 = false;
            boolean hasNewBgm2 = false;

            if (pendingStop) {
                currentBgm = null;
                pendingStop = false;
            }
            if (pendingBgm != null) {
                rec.addAudioCommand(pendingBgm);
                hasNewBgm2 = true;
                pendingBgm = null;
            }
            if (pendingBg != null) {
                rec.addBackgroundVisual(new BackgroundVisual(pendingBg));
                currentBg = pendingBg;
                hasNewBg2 = true;
                pendingBg = null;
            }

            if (!hasNewBg2 && currentBg != null)
                rec.addBackgroundVisual(new BackgroundVisual(currentBg));
            if (!hasNewBgm2 && currentBgm != null)
                rec.addAudioCommand(new AudioCommand(AudioCommandType.BGM_ACTIVE, currentBgm.getAudioId()));
            // 如果本条是旁白，复制上一条的角色立绘（如果存在）
            if (d.isNarrator() && !records.isEmpty()) {
                try {
                    List<CharacterVisual> prevChars = records.get(records.size() - 1).getCharacters();
                    if (prevChars != null && !prevChars.isEmpty()) {
                        ObjectMapper om = new ObjectMapper();
                        List<CharacterVisual> copy = om.convertValue(prevChars,
                                new TypeReference<List<CharacterVisual>>() {
                                });
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
     * 在 Audio 库中按名称或文件名搜索匹配的 BGM 文件。
     * 优先精确匹配，再尝试包含匹配；都失败则返回原始名称作为后备。
     */
    private static String resolveBgmName(String bgmName) {
        if (bgmName == null || bgmName.isBlank()) return bgmName;

        try {
            List<Audio> allAudios = AudioDAO.getAllAudios();
            if (allAudios == null || allAudios.isEmpty()) return bgmName;

            String baseName = bgmName;
            int dot = baseName.lastIndexOf('.');
            if (dot > 0) baseName = baseName.substring(0, dot);

            // 1) 精确匹配：name 或 path 文件名完全相等（忽略扩展名）
            for (Audio audio : allAudios) {
                if (audio.getName() != null && audio.getName().equalsIgnoreCase(bgmName))
                    return audio.getName();
                if (audio.getPath() != null) {
                    String fileName = audio.getPath();
                    int slash = Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\'));
                    if (slash >= 0) fileName = fileName.substring(slash + 1);
                    int ext = fileName.lastIndexOf('.');
                    if (ext > 0) fileName = fileName.substring(0, ext);
                    if (fileName.equalsIgnoreCase(bgmName) || fileName.equalsIgnoreCase(baseName))
                        return audio.getName();
                }
            }

            // 2) 包含匹配：name 或 path 包含 bgmName（忽略大小写）
            for (Audio audio : allAudios) {
                String name = audio.getName() != null ? audio.getName().toLowerCase() : "";
                String path = audio.getPath() != null ? audio.getPath().toLowerCase() : "";
                String lower = bgmName.toLowerCase();
                if (name.contains(lower) || path.contains(lower)) {
                    return audio.getName();
                }
            }
        } catch (Exception e) {
            logger.debug("AudioDAO lookup failed for BGM '{}': {}", bgmName, e.getMessage());
        }
        return bgmName;
    }

    /**
     * 解析用户输入的背景名称，按优先级查找对应的 Background 对象。
     *
     * <p>查找顺序：
     * <ol>
     *   <li>DB 精确路径匹配（backgroundService.findByPath）</li>
     *   <li>DB 显示名称匹配（backgroundService.findByName）</li>
     *   <li>DB 文件名后缀匹配（遍历所有背景，path 以输入文件名结尾）</li>
     *   <li>文件系统搜索（assets/backgrounds/ 目录，支持无扩展名模糊匹配，
     *       优先 PNG > JPG > 其他，同格式选文件更大者）</li>
     *   <li>以上均未找到时，以原始输入创建 Background（后续渲染时会记录错误）</li>
     * </ol>
     *
     * @param bgPath 用户输入的原始背景引用（如 "sunset" 或 "sunset.png"）
     * @param name   去除路径和扩展名后的显示名称
     * @return 解析到的 Background 对象
     */
    private static Background resolveBackground(String bgPath, String name,
            BackgroundService backgroundService) {
        if (backgroundService != null) {
            try {
                // 1) 精确路径匹配
                java.util.Optional<Background> byPath = backgroundService.findByPath(bgPath);
                if (byPath.isPresent()) {
                    logger.info("背景通过精确路径匹配: {} -> {}", bgPath, byPath.get().getName());
                    return byPath.get();
                }

                // 2) 显示名称匹配（用户导入后重命名的情况）
                java.util.Optional<Background> byName = backgroundService.findByName(name);
                if (byName.isPresent()) {
                    logger.info("背景通过显示名称匹配: {} -> {}", name, byName.get().getPath());
                    return byName.get();
                }

                // 3) 文件名后缀 + 显示名称遍历匹配
                String filename = bgPath;
                int lastSlash = Math.max(bgPath.lastIndexOf('/'), bgPath.lastIndexOf('\\'));
                if (lastSlash >= 0) filename = bgPath.substring(lastSlash + 1);
                logger.info("背景精确/名称查找未命中，开始遍历 {} 条背景记录 (lookup={}, filename={})",
                        backgroundService.findAll().size(), bgPath, filename);
                for (Background b : backgroundService.findAll()) {
                    String p = b.getPath();
                    if (p != null) {
                        if (p.endsWith(filename) || p.endsWith(bgPath)) {
                            logger.info("背景通过文件名后缀匹配: {} -> {}", bgPath, p);
                            return b;
                        }
                    }
                    // 同时也检查显示名称（不区分大小写）
                    String n = b.getName();
                    if (n != null && (n.equalsIgnoreCase(name) || n.equalsIgnoreCase(bgPath))) {
                        logger.info("背景通过显示名称遍历匹配: {} -> {} ({})", bgPath, n, b.getPath());
                        return b;
                    }
                }

                // 4) 文件系统搜索
                String resolvedPath = com.lbc_plot.common.util.io.ImageReader.findBackgroundFile(bgPath);
                if (resolvedPath != null) {
                    logger.info("背景在文件系统中找到: {} -> {}", bgPath, resolvedPath);
                    // 提取文件名部分作为显示名称
                    String resolvedName = resolvedPath.replace('\\', '/');
                    int rs = resolvedName.lastIndexOf('/');
                    resolvedName = (rs >= 0) ? resolvedName.substring(rs + 1) : resolvedName;
                    int rd = resolvedName.lastIndexOf('.');
                    if (rd > 0) resolvedName = resolvedName.substring(0, rd);
                    return backgroundService.findOrCreateByPath(resolvedPath,
                            resolvedName.isEmpty() ? name : resolvedName, "parser");
                }

                // 5) 未找到，以原始输入创建（渲染时会记录错误日志）
                logger.warn("背景未在 DB 或文件系统中找到: {}，将以原始输入创建", bgPath);
                return backgroundService.findOrCreateByPath(bgPath, name, "parser");

            } catch (Exception ex) {
                logger.warn("BackgroundService 查找异常，回退到文件系统搜索: {}", ex.getMessage());
                return tryFilesystemFallback(bgPath, name);
            }
        } else {
            logger.info("BackgroundService 不可用，使用文件系统后备查找: {}", bgPath);
            return tryFilesystemFallback(bgPath, name);
        }
    }

    /**
     * 无 BackgroundService 时的文件系统后备查找
     */
    private static Background tryFilesystemFallback(String bgPath, String name) {
        String resolvedPath = com.lbc_plot.common.util.io.ImageReader.findBackgroundFile(bgPath);
        if (resolvedPath != null) {
            logger.debug("文件系统后备查找成功: {} -> {}", bgPath, resolvedPath);
            // 使用文件系统中的显示名
            String resolvedName = resolvedPath.replace('\\', '/');
            int rs = resolvedName.lastIndexOf('/');
            resolvedName = (rs >= 0) ? resolvedName.substring(rs + 1) : resolvedName;
            int rd = resolvedName.lastIndexOf('.');
            if (rd > 0) resolvedName = resolvedName.substring(0, rd);
            return new Background(resolvedPath, resolvedName.isEmpty() ? name : resolvedName);
        }
        return new Background(bgPath, name);
    }

    /**
     * 判断一个 &lt;...&gt; 片段是否真的是立绘位置标记。
     *
     * <p>正则中的百分号与空白都是可选的，因此 "&lt;2&gt;" 这类正文尖括号也会被位置正则命中。
     * 这里要求片段内至少包含一个 "%" 或小数点，只有这种明确的百分比写法才视为位置指令，
     * 避免误吞正文中的普通尖括号内容。
     *
     * @param token 匹配到的完整尖括号片段（如 "&lt;50%&gt;"、"&lt;37.5%&gt;"）
     * @return true 表示该片段是位置标记
     */
    private static boolean isPositionToken(String token) {
        return token != null && (token.indexOf('%') >= 0 || token.indexOf('.') >= 0);
    }

    /**
     * 把行内 &lt;位置&gt; 的百分比换算为 CharacterVisual 的 adjX 偏差值。
     *
     * <p>换算规则（以 1920x1080 为例，{@code VIDEO_WIDTH / 2 = 960}）：
     * <ul>
     *   <li>50%（居中）→ adjX = 0</li>
     *   <li>0%（最左）→ adjX = -960</li>
     *   <li>100%（最右）→ adjX = +960</li>
     * </ul>
     * 即 {@code adjX = (位置% - 50) * VIDEO_WIDTH / 100}。
     *
     * @param positionPercent 位置百分比，null 表示未指定（返回 null，交由调用方保持默认居中）
     * @return 换算后的 adjX，未指定时为 null
     */
    private static Integer toAdjX(Double positionPercent) {
        if (positionPercent == null) {
            return null;
        }
        if (positionPercent < MIN_POSITION_PERCENT || positionPercent > MAX_POSITION_PERCENT) {
            logger.warn("立绘位置 {}% 超出建议范围 0%-100%，仍将按比例换算", positionPercent);
        }
        // 先乘后除并做四舍五入，保留小数位置（如 37.5% -> -240），避免整数除法丢失精度
        return (int) Math.round((positionPercent - 50.0) * ProjectConfig.VIDEO_WIDTH / 100.0);
    }

    /**
     * 根据当前 Dialogue 调整 character visuals 的亮/暗状态：
     * - 当为旁白时，所有立绘都设为暗
     * - 否则，仅与 speaker 匹配的立绘设为亮，其余设为暗
     */
    private static void applyDimState(List<CharacterVisual> chars, Dialogue d) {
        if (chars == null || chars.isEmpty() || d == null)
            return;
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
                            if (cv.getChara() != null)
                                charName = cv.getChara().getCharacterName();
                        } catch (Exception ex) {
                            // ignore
                        }
                        // 如果没有名字则尝试按 characterId
                        if (charName == null || charName.isBlank()) {
                            String cid = null;
                            try {
                                cid = cv.getCharacterId();
                            } catch (Exception ex) {
                            }
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
                    try {
                        cv.setDim(true);
                    } catch (Exception ignore) {
                    }
                }
            }
        } catch (Exception ex) {
            // 忽略所有异常以保证解析器健壮性
        }
    }
}
