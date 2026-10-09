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
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 解析器：把简单的纯文本脚本转换为 List&lt;Record&gt;
 * 支持的语法（示例）：
 * <pre>
 * [BGM名称]
 * {背景图片名称}
 * 说话人: 对话内容(情绪)%位置%
 * 旁白: 对话内容
 * </pre>
 *
 * <p>标点兼容（中英文混写都能识别）：
 * <ul>
 *   <li>说话人后的冒号：半角 {@code ":"} 与全角 {@code "："}</li>
 *   <li>情绪括号：半角 {@code "()"} 与全角 {@code "（）"}</li>
 *   <li>位置标记的百分号：半角 {@code "%"} 与全角 {@code "％"}</li>
 *   <li>行首/行尾空白：普通空白、全角空格（U+3000）、不换行空格、BOM</li>
 * </ul>
 *
 * <p>{@code %位置%} 为可选的立绘横向位置（百分比，{@code %0%} 最左 / {@code %50%} 居中 /
 * {@code %100%} 最右，缺省居中），可写在情绪之前或之后，解析后换算为 CharacterVisual 的 adjX 偏差值。
 */
public class PlainTextRecordsParser {

    private static final Logger logger = LoggerFactory.getLogger(PlainTextRecordsParser.class);

    private static final Pattern BGM_PATTERN = Pattern.compile("^\\s*\\[(.+?)\\]\\s*");
    private static final Pattern STOP_PATTERN = Pattern.compile("^\\s*\\[-.*?\\]\\s*");
    private static final Pattern BG_PATTERN = Pattern.compile("^\\s*\\{(.+?)\\}\\s*");
    /** 说话行：角色名 + 冒号（兼容半角 ":" 与全角 "："），角色名本身不允许包含冒号 */
    private static final Pattern SPEAKER_PATTERN = Pattern.compile("^\\s*([^:：]+?)\\s*[:：]\\s*(.+)$");
    /** 情绪标记：正文末尾的 "（情绪）"，兼容半角 "()" 与全角 "（）"，括号内不含括号 */
    private static final Pattern EMOTION_PATTERN = Pattern.compile("^(.*?)[（(]([^（()）]*)[）)]\\s*$");
    /** 立绘位置标记：%位置%，如 %0% / %37.5% / ％100％（兼容半角/全角百分号），可写在情绪之前或之后 */
    private static final Pattern POSITION_PATTERN = Pattern.compile("[%％]\\s*(-?\\d+(?:\\.\\d+)?)\\s*[%％]");
    /** 已废弃的旧位置写法 &lt;位置&gt;：不再生效，只用于提示用户改写为 %位置% */
    private static final Pattern LEGACY_POSITION_PATTERN = Pattern.compile("<\\s*-?\\d+(?:\\.\\d+)?\\s*%?\\s*>");
    /** 纯英文情绪标记（用于识别写错的情绪名，如 "(NOLMAL)"） */
    private static final Pattern ASCII_EMOTION_TOKEN = Pattern.compile("[A-Za-z]+");
    /** 行首/行尾需要忽略的空白：普通空白 + 全角空格 + 不换行空格 + BOM */
    private static final Pattern EDGE_BLANK_PATTERN = Pattern
            .compile("^[\\s\\u3000\\u00A0\\uFEFF]+|[\\s\\u3000\\u00A0\\uFEFF]+$");

    /** 位置百分比合法范围（与前端 X坐标滑块一致：0% 最左，100% 最右） */
    private static final int MIN_POSITION_PERCENT = 0;
    private static final int MAX_POSITION_PERCENT = 100;

    /**
     * 停止 BGM 的伪指令：附加在 record 上让 AudioTimelineBuilder 在该 record 的起始帧结束旧 BGM
     * （handleBgmStart 识别 "-" 前缀）。
     */
    private static final String BGM_STOP_COMMAND = "-STOP";

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
        return parseText(text, null, null);
    }

    /**
     * 解析文本字符串为 Record 列表，并传入 CharacterService/BackgroundService
     */
    public static List<Record> parseText(String text, CharacterService characterService,
            BackgroundService backgroundService) throws IOException {
        // 直接在内存中切行解析：不再落地临时文件，省掉每次请求的磁盘 IO 与临时文件残留
        return parseLines(splitLines(text), characterService, backgroundService);
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
        return parseLines(Files.readAllLines(file), characterService, backgroundService);
    }

    /**
     * 逐行解析剧本：把纯文本脚本转换为 List&lt;Record&gt;。
     *
     * @param lines             剧本文本按行切分后的结果（顺序即剧情顺序）
     * @param characterService  可选，用于把说话人映射到 MyCharacter/Portrait
     * @param backgroundService 可选，用于把 {背景名} 解析为 Background
     */
    public static List<Record> parseLines(List<String> lines, CharacterService characterService,
            BackgroundService backgroundService) {
        List<Record> records = new ArrayList<>();
        if (lines == null || lines.isEmpty()) {
            return records;
        }

        // 解析过程中的持续状态（当前生效 / 待附加的 BGM 与背景）
        ParseState state = new ParseState();

        for (String rawLine : lines) {
            String line = stripEdgeBlanks(rawLine);
            if (line.isEmpty()) {
                continue;
            }

            // [BGM名称] / [-STOP]：不单独创建 record，累积到 pending 状态附加到下一条对话
            if (consumeAudioDirective(line, state)) {
                continue;
            }

            // {背景图片名称}：同样累积到下一条对话
            if (consumeBackgroundDirective(line, state, backgroundService)) {
                continue;
            }

            // 说话行："说话人: 对话内容(情绪)%位置%"
            Matcher mSpeak = SPEAKER_PATTERN.matcher(line);
            if (mSpeak.matches()) {
                String speaker = stripEdgeBlanks(mSpeak.group(1));
                String textPart = stripEdgeBlanks(mSpeak.group(2));
                records.add(buildRecord(speaker, textPart, true, state, characterService, records));
                continue;
            }

            // 未识别行，作为旁白文本
            records.add(buildRecord(Dialogue.DEFAULT_NARRATOR, line, false, state, characterService, records));
        }

        return records;
    }

    /**
     * 构建一条 record：解析情绪/位置 → 建 Dialogue → 附加音频与背景指令 → 解析说话人立绘 →
     * 旁白继承上一条的立绘。
     *
     * @param speaker         说话人名字
     * @param rawText         对话正文（尚未剥离情绪/位置标记）
     * @param resolveSpeaker  是否需要按说话人名字查询 CharacterService
     *                        （未识别行直接当旁白处理时无需查询）
     * @param state           解析状态（会被就地更新）
     * @param records         已解析出的 record 列表（旁白需要参考上一条）
     */
    private static Record buildRecord(String speaker, String rawText, boolean resolveSpeaker,
            ParseState state, CharacterService characterService, List<Record> records) {

        // 1) 先剥离立绘位置标记 %位置%（如 %0% / %50% / %100%），剩下的文本再解析情绪。
        //    标记可写在情绪之前或之后（如 "…(HAPPY)%70%" 或 "…%70%(HAPPY)"）；
        //    用 double 保存以支持小数百分比（如 %37.5%）。
        String textPart = rawText;
        Double positionPercent = null;
        Matcher mPos = POSITION_PATTERN.matcher(textPart);
        if (mPos.find()) {
            try {
                positionPercent = Double.parseDouble(mPos.group(1));
                textPart = splice(textPart.substring(0, mPos.start()), textPart.substring(mPos.end()));
                logger.debug("解析立绘位置标记: {}% -> adjX 待换算", positionPercent);
            } catch (NumberFormatException nfe) {
                logger.debug("无法解析立绘位置标记 '{}'，按普通文本处理", mPos.group(0));
                positionPercent = null;
            }
        }
        // 旧写法 <位置> 已废弃：不生效，但给一条提示，方便旧脚本迁移
        if (positionPercent == null) {
            Matcher mLegacy = LEGACY_POSITION_PATTERN.matcher(textPart);
            if (mLegacy.find()) {
                logger.warn("检测到已废弃的位置写法 '{}'（已按普通文本处理），请改用 %位置%，例如 %70%",
                        mLegacy.group());
            }
        }

        // 2) 解析情绪标记（兼容中英括号、中英情绪名）
        Dialogue.Emotion emotion = Dialogue.Emotion.NORMAL;
        boolean emotionParsed = false;
        Matcher mEmo = EMOTION_PATTERN.matcher(textPart);
        if (mEmo.matches()) {
            String rawEmo = stripEdgeBlanks(mEmo.group(2));
            Dialogue.Emotion parsed = parseEmotion(rawEmo);
            if (parsed != null) {
                emotion = parsed;
                emotionParsed = true;
                textPart = mEmo.group(1).trim();
            } else if (ASCII_EMOTION_TOKEN.matcher(rawEmo).matches()) {
                // 纯英文但未识别：视为写错的情绪标记，剥掉标记后回退到 NLP（与历史行为一致）
                textPart = mEmo.group(1).trim();
                logger.warn("无法识别的情绪标记 '({})'，已从正文剥离并回退到 NLP/默认情绪", rawEmo);
            } else {
                // 括号里不是情绪（如 "（叹气）"、"（笑）"）：保留在正文中，避免吞掉台词
                logger.debug("括号内容 '({})' 不是已知情绪，保留在正文中", rawEmo);
            }
        }

        // 建立 Dialogue
        Dialogue d = Dialogue.builder().text(textPart).speakerName(speaker).emotion(emotion).build();
        // 如果没有成功解析出情绪，则尝试用 NLP 做后备识别
        if (!emotionParsed) {
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

        // 应用待处理的指令（BGM / 停止 / 背景）并继承当前正在播放的 BGM 与背景
        applyPendingInstructions(rec, state);

        // 如果当前有背景，尝试把它作为本条对话的场景地点
        if (state.currentBg != null) {
            try {
                if (d.getLocation() == null || Dialogue.DEFAULT_LOCATION.equals(d.getLocation())) {
                    if (state.currentBg.getName() != null && !state.currentBg.getName().isBlank()) {
                        d.setLocation(state.currentBg.getName());
                    }
                }
            } catch (Exception ex) {
                logger.debug("Failed to apply background name to dialogue location: {}", ex.getMessage());
            }
        }

        // 说话人 -> MyCharacter/Portrait（附带行内位置指令换算出的 adjX）
        if (resolveSpeaker && characterService != null) {
            attachCharacterVisual(rec, d, speaker, positionPercent, emotion, characterService);
        }

        // 旁白：复制上一条 record 的角色立绘以保持画面一致
        inheritCharactersFromPrevious(rec, d, records);

        return rec;
    }

    /**
     * 把累积的待处理指令（BGM / 停止 / 背景）落到本条 record 上，并让本条继承当前生效的
     * BGM 与背景。调用后 pending 状态被清空。
     */
    private static void applyPendingInstructions(Record rec, ParseState state) {
        boolean hasNewBg = false;
        boolean hasNewBgm = false;

        if (state.pendingStop) {
            state.pendingStop = false;
            state.currentBgm = null;
            // 将 STOP 作为伪指令附加到本条 record，以便 AudioTimelineBuilder
            // 在当前 record 的起始帧结束旧 BGM（handleBgmStart 识别 "-" 前缀）
            rec.addAudioCommand(new AudioCommand(AudioCommandType.BGM_ACTIVE, BGM_STOP_COMMAND));
        }
        if (state.pendingBgm != null) {
            rec.addAudioCommand(state.pendingBgm);
            hasNewBgm = true;
            state.pendingBgm = null;
        }
        if (state.pendingBg != null) {
            rec.addBackgroundVisual(new BackgroundVisual(state.pendingBg));
            hasNewBg = true;
            state.pendingBg = null;
        }

        // 如果本条没有新背景且当前背景存在，则继承当前背景
        if (!hasNewBg && state.currentBg != null) {
            rec.addBackgroundVisual(new BackgroundVisual(state.currentBg));
        }
        // 如果本条没有新 BGM 且当前有正在播放的 BGM，则继承
        if (!hasNewBgm && state.currentBgm != null) {
            rec.addAudioCommand(new AudioCommand(AudioCommandType.BGM_ACTIVE, state.currentBgm.getAudioId()));
        }
    }

    /**
     * 处理 [BGM名称] 与 [-STOP] 指令行。
     *
     * @return true 表示该行已被消费（不生成 record）
     */
    private static boolean consumeAudioDirective(String line, ParseState state) {
        // STOP 指令：停止当前 BGM（在 BGM_PATTERN 之前检测，避免误匹配为 BGM）
        if (STOP_PATTERN.matcher(line).matches()) {
            state.pendingStop = true;
            state.currentBgm = null;
            logger.debug("BGM 停止指令，将附加到下一条对话");
            return true;
        }

        // BGM 行：不单独创建 record，累积到 pending 状态，附加到下一条对话
        Matcher mBgm = BGM_PATTERN.matcher(line);
        if (mBgm.matches()) {
            String bgmFile = mBgm.group(1).trim();
            String resolvedBgm = resolveBgmName(bgmFile);
            state.pendingBgm = new AudioCommand(AudioCommandType.BGM_ACTIVE, resolvedBgm);
            state.currentBgm = state.pendingBgm;
            logger.debug("BGM 指令: {} (解析为: {}), 将附加到下一条对话", bgmFile, resolvedBgm);
            return true;
        }
        return false;
    }

    /**
     * 处理 {背景图片名称} 指令行。
     *
     * @return true 表示该行已被消费（不生成 record）
     */
    private static boolean consumeBackgroundDirective(String line, ParseState state,
            BackgroundService backgroundService) {
        Matcher mBg = BG_PATTERN.matcher(line);
        if (!mBg.matches()) {
            return false;
        }
        String bgPath = mBg.group(1).trim();
        // 从用户输入中提取显示名称（去除路径和扩展名）
        String name = bgPath;
        int slash = Math.max(bgPath.lastIndexOf('/'), bgPath.lastIndexOf('\\'));
        if (slash >= 0) name = bgPath.substring(slash + 1);
        int dot = name.lastIndexOf('.');
        if (dot > 0) name = name.substring(0, dot);

        Background resolved = resolveBackground(bgPath, name, backgroundService);
        state.currentBg = resolved;
        state.pendingBg = resolved;
        logger.debug("背景指令: {} (解析为: {}), 将附加到下一条对话", bgPath, name);
        return true;
    }

    /**
     * 按说话人名字查询角色与立绘，并给 record 添加 CharacterVisual（含行内位置指令换算的 adjX）；
     * 同时把 CharacterRef 挂到 Dialogue 上供 UI 渲染名字/阵营。
     */
    private static void attachCharacterVisual(Record rec, Dialogue d, String speaker,
            Double positionPercent, Dialogue.Emotion emotion, CharacterService characterService) {
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
                List<Portrait> charPortraits = null;
                try {
                    charPortraits = chosen.getPortraits();
                } catch (Exception ex) {
                    // fallback to DAO-based service methods
                    charPortraits = characterService.getCharacterPortraits(chosen.getCharacterID());
                }
                if (charPortraits != null && !charPortraits.isEmpty()) {
                    for (Portrait p : charPortraits) {
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
                    // 行内 %位置% 指令换算为 adjX（0% 最左 / 50% 居中 / 100% 最右）
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

    /**
     * 旁白记录继承上一条 record 的角色立绘，保持画面一致（深拷贝后按当前 Dialogue 重置亮/暗状态）。
     */
    private static void inheritCharactersFromPrevious(Record rec, Dialogue d, List<Record> records) {
        if (d == null || !d.isNarrator() || records == null || records.isEmpty()) {
            return;
        }
        try {
            List<CharacterVisual> prevChars = records.get(records.size() - 1).getCharacters();
            if (prevChars == null || prevChars.isEmpty()) {
                return;
            }
            // 深拷贝 prevChars，避免修改原 record 的状态
            ObjectMapper om = new ObjectMapper();
            List<CharacterVisual> copy = om.convertValue(prevChars,
                    new TypeReference<List<CharacterVisual>>() {
                    });
            // 根据当前 Dialogue 重置 dim 状态（旁白全部压暗；否则仅与 speaker 匹配的立绘为亮）
            applyDimState(copy, d);
            rec.setCharacters(copy);
        } catch (Exception ex) {
            logger.debug("Failed to copy character visuals for narrator: {}", ex.getMessage());
        }
    }

    /**
     * 解析情绪标记内容（不区分大小写）。支持：
     * <ul>
     *   <li>剧情侧枚举名：NORMAL / HAPPY / ... / NERVOUS</li>
     *   <li>资源库情绪 code / 枚举名：normal / happy / ...</li>
     *   <li>资源库情绪中文显示名：正常 / 开心 / 生气 / 悲伤 / 惊讶 / 困惑 / 害羞 / 受伤</li>
     * </ul>
     *
     * @param raw 括号内的原始内容（如 "HAPPY"、"安ger"、"开心"）
     * @return 识别到的情绪；无法识别时返回 null，由调用方决定回退策略
     */
    private static Dialogue.Emotion parseEmotion(String raw) {
        String token = stripEdgeBlanks(raw);
        if (token.isEmpty()) {
            return null;
        }
        // 1) 剧情侧枚举（英文枚举名 / 英文 code，含剧情侧专有的 NERVOUS）
        try {
            return Dialogue.Emotion.valueOf(token.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ignored) {
            // 继续尝试资源库情绪（主要是中文显示名）
        }
        // 2) 资源库情绪：code / 枚举名 / 中文显示名
        for (com.lbc_plot.resource.model.Emotion se : com.lbc_plot.resource.model.Emotion.values()) {
            if (se.getCode().equalsIgnoreCase(token)
                    || se.name().equalsIgnoreCase(token)
                    || se.getDisplayName().equals(token)) {
                return toDialogueEmotion(se);
            }
        }
        return null;
    }

    /**
     * 资源库情绪 -&gt; 剧情侧情绪（剧情侧多一个 NERVOUS，资源库没有对应项）
     */
    private static Dialogue.Emotion toDialogueEmotion(com.lbc_plot.resource.model.Emotion se) {
        switch (se) {
            case HAPPY:
                return Dialogue.Emotion.HAPPY;
            case ANGRY:
                return Dialogue.Emotion.ANGRY;
            case SAD:
                return Dialogue.Emotion.SAD;
            case SURPRISED:
                return Dialogue.Emotion.SURPRISED;
            case CONFUSED:
                return Dialogue.Emotion.CONFUSED;
            case BLUSH:
                return Dialogue.Emotion.BLUSH;
            case HURT:
                return Dialogue.Emotion.HURT;
            case NORMAL:
            default:
                return Dialogue.Emotion.NORMAL;
        }
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
     *       优先 PNG &gt; JPG &gt; 其他，同格式选文件更大者）</li>
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
     * 把 %位置% 的百分比换算为 CharacterVisual 的 adjX 偏差值。
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
     * 按任意换行符切分文本（兼容 {@code \n}、{@code \r\n}、{@code \r}）。
     */
    private static List<String> splitLines(String text) {
        if (text == null || text.isEmpty()) {
            return List.of();
        }
        return List.of(text.split("\\R", -1));
    }

    /**
     * 去掉行首/行尾的空白，包含全角空格（U+3000）、不换行空格与 BOM。
     * 中文输入法下很容易打出全角空格，直接 {@code trim()} 会把它留在说话人名字里导致匹配失败。
     */
    private static String stripEdgeBlanks(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        return EDGE_BLANK_PATTERN.matcher(value).replaceAll("");
    }

    /**
     * 把被标记切成的两段正文重新拼起来：仅当两侧都是 ASCII 字母/数字时才补一个空格，
     * 中文正文直接相连，避免剥离标记后在台词里留下多余空格。
     */
    private static String splice(String head, String tail) {
        boolean needSpace = !head.isEmpty() && !tail.isEmpty()
                && isAsciiWord(head.charAt(head.length() - 1))
                && isAsciiWord(tail.charAt(0));
        return (needSpace ? head + " " + tail : head + tail).trim();
    }

    private static boolean isAsciiWord(char c) {
        return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
    }

    /**
     * 解析过程中的持续状态：当前生效的 BGM/背景，以及累积到"下一条对话"的待处理指令。
     */
    private static final class ParseState {
        /** 当前正在播放的 BGM */
        private AudioCommand currentBgm;
        /** 当前生效的背景 */
        private Background currentBg;
        /** 待附加到下一条 record 的 BGM */
        private AudioCommand pendingBgm;
        /** 待附加到下一条 record 的背景 */
        private Background pendingBg;
        /** 是否待附加 BGM 停止指令 */
        private boolean pendingStop;
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
