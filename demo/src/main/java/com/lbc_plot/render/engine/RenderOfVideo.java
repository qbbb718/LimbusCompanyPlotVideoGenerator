package com.lbc_plot.render.engine;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.Shape;
import java.awt.font.FontRenderContext;
import java.awt.font.LineBreakMeasurer;
import java.awt.font.TextAttribute;
import java.awt.font.TextLayout;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.text.AttributedCharacterIterator;
import java.text.AttributedString;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.common.util.RecordDurationCalculator;
import com.lbc_plot.common.util.RenderQualityUtils;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.render.engine.manager.FontLoader;
import com.lbc_plot.render.engine.model.TextAlignment;
import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.render.video.Camera;
import com.lbc_plot.render.video.CameraShake;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.engine.BatchVideoProcessor.RenderResult;
import com.lbc_plot.render.video.StartTransition;
import com.lbc_plot.render.video.VideoExporter;

/**
 * 视频渲染器 - 流式处理版本
 * 使用流式处理避免内存溢出，支持高质量视频导出
 */
public class RenderOfVideo {
    private static final Logger logger = LoggerFactory.getLogger(RenderOfVideo.class);

    /** 视频分层类型常量 */
    public static final String LAYER_FULL = "FULL";
    public static final String LAYER_UI_ONLY = "UI_ONLY";
    public static final String LAYER_BG_CHARACTERS = "BG_CHARACTERS";
    public static final String LAYER_BACKGROUND_ONLY = "BACKGROUND_ONLY";
    public static final String LAYER_CHARACTERS_ONLY = "CHARACTERS_ONLY";

    /**
     * 高质量流式视频导出 - 避免内存溢出且保证质量
     */
    public static RenderResult exportRecordVideoStreaming(
            Record record,
            boolean plot,
            int width,
            int height,
            String outputPath,
            int frameRate) throws Exception {
        return exportRecordVideoStreaming(record, plot, width, height, outputPath, frameRate, LAYER_FULL, null);
    }

    /**
     * 高质量流式视频导出（支持分层导出）
     *
     * @param layerType 分层类型: FULL / UI_ONLY / BG_CHARACTERS / BACKGROUND_ONLY / CHARACTERS_ONLY
     */
    public static RenderResult exportRecordVideoStreaming(
            Record record,
            boolean plot,
            int width,
            int height,
            String outputPath,
            int frameRate,
            String layerType) throws Exception {
        return exportRecordVideoStreaming(record, plot, width, height, outputPath, frameRate, layerType, null);
    }

    /**
     * 高质量流式视频导出（支持分层导出 + 记录级特效）
     *
     * <p>记录勾选了"起始转场"（{@link StartTransition}）时，开头 {@link StartTransition#FRAMES} 帧会在
     * 本条记录自己的画面<strong>之上</strong>再叠一层图像，不透明度 100% → 0%：交叉溶解叠的是上一条
     * 记录的最后一帧，黑屏/白屏转场叠的是纯黑/纯白。叠加层不改变记录时长，也不会影响后面的帧。
     *
     * @param layerType      分层类型: FULL / UI_ONLY / BG_CHARACTERS / BACKGROUND_ONLY / CHARACTERS_ONLY
     * @param previousRecord 渲染列表里的上一条记录（第一条记录传 null）。只有交叉溶解需要它：
     *                       用它的"最后一帧"生成淡出叠加层；黑屏/白屏转场不依赖上一条记录。
     */
    public static RenderResult exportRecordVideoStreaming(
            Record record,
            boolean plot,
            int width,
            int height,
            String outputPath,
            int frameRate,
            String layerType,
            Record previousRecord) throws Exception {
        return exportRecordVideoStreaming(record, plot, width, height, outputPath, frameRate, layerType,
                previousRecord, ProjectConfig.DEFAULT_STAY_FRAMES);
    }

    /**
     * 高质量流式视频导出（带「结尾停留帧数」）。
     *
     * @param stayFrames 每条记录结尾的停留帧数（工程级设置）。它参与时长计算，
     *                   所以预览/时长查询必须用同一个值，否则"预览说 315 帧、成片 240 帧"
     */
    public static RenderResult exportRecordVideoStreaming(
            Record record,
            boolean plot,
            int width,
            int height,
            String outputPath,
            int frameRate,
            String layerType,
            Record previousRecord,
            int stayFrames) throws Exception {

        logger.info("开始高质量流式视频导出: {} (layerType={}, transparent={})", outputPath, layerType,
                isTransparentLayer(layerType));
        long startTime = System.currentTimeMillis();

        // 在开始时记录内存使用情况
        Runtime runtime = Runtime.getRuntime();
        long initialMemory = runtime.totalMemory() - runtime.freeMemory();

        // 确定是否需要文本动画
        boolean needsTextAnimation = usesTextAnimation(layerType);
        // 确定是否需要透明通道
        boolean transparent = isTransparentLayer(layerType);

        // 起始转场的叠加层：黑屏/白屏是纯色，交叉溶解是上一条记录的最后一帧。
        // 必须在开始编码前算好——出错要尽早抛出，不要让用户等编码完才发现渲染失败。
        StartTransition.Kind transition = StartTransition.kindOf(record);
        BufferedImage transitionOverlay = null;
        switch (transition) {
            case PREVIOUS_FRAME:
                if (previousRecord != null) {
                    transitionOverlay = renderLastFrame(previousRecord, plot, width, height, layerType, stayFrames);
                    logger.info("记录 {} 启用交叉溶解：叠加记录 {} 的最后一帧，前 {} 帧不透明度 100%→0%",
                            record.getUuid(), previousRecord.getUuid(), StartTransition.FRAMES);
                } else {
                    logger.info("记录 {} 启用交叉溶解，但它是渲染列表的第一条，没有可叠加的上一帧，跳过",
                            record.getUuid());
                }
                break;
            case BLACK:
                transitionOverlay = StartTransition.solidOverlay(Color.BLACK, width, height);
                logger.info("记录 {} 启用黑屏转场：前 {} 帧整屏黑色 100%→0%（从黑屏淡入）",
                        record.getUuid(), StartTransition.FRAMES);
                break;
            case WHITE:
                transitionOverlay = StartTransition.solidOverlay(Color.WHITE, width, height);
                logger.info("记录 {} 启用白屏转场：前 {} 帧整屏白色 100%→0%（从白屏淡入）",
                        record.getUuid(), StartTransition.FRAMES);
                break;
            case NONE:
            default:
                break;
        }

        try (VideoExporter exporter = new VideoExporter(outputPath, width, height, frameRate, transparent)) {

            logger.info("使用编码方式: {}", exporter.getEncodingMethod());

            // 1. 计算总帧数
            int requiredFrames = RecordDurationCalculator.calculateDurationFrames(record, frameRate, plot, stayFrames);
            logger.info("需要渲染 {} 帧 (约 {} 秒)",
                    requiredFrames, String.format("%.2f", requiredFrames / (double) frameRate));

            // 2. 静态层
            //
            //    场景不动（绝大多数记录）→ 整段只渲一次，后面逐帧只叠文字；
            //    镜头会动（C2 起止镜头）/ 立绘或临时图片有移动动画 → **每帧按当时的取景与变换重渲一次场景**。
            //    没有做"整段先渲成一张更大的图再裁"的优化：那需要按镜头路径的最宽取景开画布，
            //    内存和重采样误差都不划算；逐帧重渲只是慢，画面与单帧渲染逐像素一致。
            Camera camera = record.getCamera();
            boolean cameraAnimated = camera != null && camera.isAnimated();
            // 立绘 / 临时图片的移动动画：与"镜头在动"同类，都会让每帧画面不同
            boolean spriteAnimated = RecordAnimation.hasAnimatedSprites(record, plot);
            boolean sceneChanges = cameraAnimated || spriteAnimated;
            logger.debug("渲染静态背景 (layerType={}, 镜头{}, 精灵动画{})", layerType,
                    cameraAnimated ? "会动" : "静止", spriteAnimated ? "有" : "无");
            if (cameraAnimated) {
                logger.info("这条记录的镜头会动，需要逐帧重渲场景层（{} 帧，比静止镜头慢）", requiredFrames);
            }
            if (spriteAnimated) {
                logger.info("这条记录有立绘/图片移动动画，需要逐帧重渲场景层（{} 帧）", requiredFrames);
            }
            BufferedImage staticBackground = sceneChanges
                    ? null
                    : renderStaticLayer(record, plot, width, height, layerType);

            // 3. 预计算每一帧要显示的文本（仅当需要文本动画时）。
            //    逐帧数组而不是"状态列表 + 每帧线性查找"：长台词（一百多字）时每帧都要扫一遍状态表。
            String[] frameTexts = null;
            if (needsTextAnimation) {
                frameTexts = buildFrameTexts(record.getDialogue(), frameRate, requiredFrames);
            }

            int framesRendered = 0;
            int overlayFrames = 0;

            // 4. 流式渲染所有帧
            //
            //    "定格复用"：打字动画结束后（以及低速档 1 字符/多帧）连续很多帧的画面完全一样，
            //    没必要每帧都重新复制一遍静态层再重画一次文字。这里只保留最近一张"没有叠转场"的帧，
            //    文本没变就直接复用；转场帧会就地改写画面，因此每帧现画一份、且不放进复用位。
            BufferedImage reusableFrame = null;
            String reusableText = null;

            //    场景层自己的"定格复用"：动画播完（比如弹跳弹够了次数、once 的关键帧跑完了）之后，
            //    后面几百帧的变换完全一样，没必要每帧重画一遍整个场景。
            //    用"动画签名"判断：镜头 + 每个动画元素在该帧的变换都相同 → 画面必然相同。
            BufferedImage reusableScene = null;
            String reusableSceneSignature = null;

            for (int frameIndex = 0; frameIndex < requiredFrames; frameIndex++) {
                boolean hasOverlay = transitionOverlay != null && StartTransition.opacityAt(frameIndex) > 0f;
                BufferedImage frame;

                // 场景会变：这一帧的静态层要按当时的镜头与动画重新渲染
                BufferedImage base;
                if (!sceneChanges) {
                    base = staticBackground;
                } else {
                    // 运镜只占前 moveFrames 帧（默认 24），走完就停住等台词播完
                    Camera frameCamera = cameraAnimated
                            ? Camera.at(camera, Camera.progressAt(frameIndex, camera.getMoveFramesSafe()))
                            : camera;
                    // 镜头摇动（特效）：只改"看世界的那台相机"的取景中心，
                    // 所以背景/立绘/临时图片会晃，而对话框/地点牌/名片/暗角画在设计画布上、不受影响
                    frameCamera = CameraShake.apply(frameCamera, record, frameIndex);
                    String signature = RecordAnimation.sceneSignature(record, plot, frameCamera, frameIndex);
                    if (reusableScene != null && signature.equals(reusableSceneSignature)) {
                        base = reusableScene;
                    } else {
                        base = renderStaticLayer(record, plot, width, height, layerType, frameCamera, frameIndex);
                        reusableScene = base;
                        reusableSceneSignature = signature;
                    }
                }

                if (hasOverlay) {
                    // 转场帧：必须独立一份（StartTransition.apply 会就地改像素）
                    String text = frameTexts != null ? frameTexts[frameIndex] : null;
                    frame = frameTexts != null
                            ? renderSingleFrame(base, text, record.getDialogue(), width, height)
                            : copyImage(base);
                    StartTransition.apply(frame, transitionOverlay, frameIndex);
                    overlayFrames++;
                } else if (frameTexts == null) {
                    // 纯静态分层：场景不动时整段画面相同，只复制一次；场景会变时每帧都是新的
                    if (sceneChanges) {
                        frame = base;
                    } else {
                        if (reusableFrame == null) {
                            reusableFrame = copyImage(base);
                        }
                        frame = reusableFrame;
                    }
                } else {
                    String text = frameTexts[frameIndex];
                    if (sceneChanges) {
                        // 场景每帧都在变（镜头或立绘在动），底图每帧都不同，"定格复用"不再成立
                        frame = renderSingleFrame(base, text, record.getDialogue(), width, height);
                    } else {
                        if (reusableFrame == null || !text.equals(reusableText)) {
                            reusableFrame = renderSingleFrame(base, text, record.getDialogue(),
                                    width, height);
                            reusableText = text;
                        }
                        frame = reusableFrame;
                    }
                }

                // 立即写入视频文件
                exporter.writeFrame(frame);

                framesRendered++;

                // 进度和内存监控
                if (framesRendered % 100 == 0) {
                    long currentMemory = runtime.totalMemory() - runtime.freeMemory();
                    long memoryUsed = currentMemory - initialMemory;
                    logger.debug("进度: {}/{} 帧, 内存使用: {} MB",
                            framesRendered, requiredFrames,
                            String.format("%.1f", memoryUsed / (1024.0 * 1024.0)));
                }
            }

            long duration = System.currentTimeMillis() - startTime;
            long finalMemory = runtime.totalMemory() - runtime.freeMemory();
            long totalMemoryUsed = finalMemory - initialMemory;

            logger.info("高质量流式视频导出完成: layerType={}, 共渲染 {} 帧, 耗时: {}ms, 总内存使用: {} MB",
                    layerType, framesRendered, duration,
                    String.format("%.1f", totalMemoryUsed / (1024.0 * 1024.0)));
            if (overlayFrames > 0) {
                logger.info("起始转场（{}）叠加完成: 共 {} 帧（{} 帧淡出范围）",
                        transition, overlayFrames, StartTransition.FRAMES);
            }

            return new RenderResult(framesRendered, startTime, duration);

        } catch (Exception e) {
            logger.error("高质量流式视频导出失败 (layerType={})", layerType, e);
            throw e;
        }
    }

    /**
     * 该分层是否包含随帧变化的对话文本。
     *
     * <p>只有完整视频（FULL）与仅 UI（UI_ONLY）需要逐帧画文字；背景/角色/背景+角色这些分层
     * 是纯静态贴图，直接复用静态层即可。
     */
    private static boolean usesTextAnimation(String layerType) {
        return LAYER_FULL.equals(layerType) || LAYER_UI_ONLY.equals(layerType);
    }

    /**
     * @function 渲染记录在视频里"最后一帧"的样子（交叉溶解的叠加层）
     *
     *           <p>视频里每一帧 = 静态层 + 当前文本，文本动画结束后显示整段文字，所以最后一帧就是
     *           "静态层 + 完整文本"。这里刻意复用逐帧渲染用的 {@link #renderStaticLayer} 与
     *           {@link #renderSingleFrame}，而不是另走 {@code RenderOfImage.renderPre}：
     *           两条渲染路径的字体度量/换行细节并不完全一致，混用会让淡出结束的瞬间文字轻微跳一下。
     *
     * @param record    要渲染的记录
     * @param plot      是否剧情模式
     * @param width     输出宽度
     * @param height    输出高度
     * @param layerType 分层类型（与导出视频时的分层一致，保证叠加的是同一层的最后一帧）
     * @return 该记录在这个分层下的最后一帧画面
     */
    public static BufferedImage renderLastFrame(Record record, boolean plot, int width, int height, String layerType)
            throws IOException {
        return renderLastFrame(record, plot, width, height, layerType, ProjectConfig.DEFAULT_STAY_FRAMES);
    }

    /**
     * 渲染"最后一帧"（带结尾停留帧数）。
     *
     * <p>停留帧数会改变记录总帧数，也就改变了"最后一帧"是哪一帧——立绘动画在末帧的变换
     * 与第 0 帧不同，所以交叉溶解的叠加层必须按真实末帧号渲染。
     */
    public static BufferedImage renderLastFrame(Record record, boolean plot, int width, int height, String layerType,
            int stayFrames) throws IOException {
        // 淡出用的是这一条的**最后一帧**，所以取 t=1 的镜头（镜头会动时，起点和终点画面并不一样）；
        // 立绘动画同理：最后一帧的变换与第 0 帧不同，必须按记录总帧数取真实末帧号。
        int frameCount = RecordDurationCalculator.calculateDurationFrames(record, ProjectConfig.FRAME_RATE, plot,
                stayFrames);
        int lastFrameIndex = Math.max(0, frameCount - 1);
        BufferedImage staticLayer = renderStaticLayer(record, plot, width, height, layerType,
                Camera.at(record.getCamera(), 1f), lastFrameIndex);
        if (!usesTextAnimation(layerType)) {
            return staticLayer;
        }
        Dialogue dialogue = record.getDialogue();
        String fullText = (dialogue != null && dialogue.getText() != null) ? dialogue.getText() : "";
        return renderSingleFrame(staticLayer, fullText, dialogue, width, height);
    }

    /**
     * 根据分层类型渲染静态背景层
     *
     * <p>不透明分层（FULL / BG_CHARACTERS / BACKGROUND_ONLY）在这里<b>一次性</b>转成
     * {@link BufferedImage#TYPE_3BYTE_BGR}：
     * <ul>
     *   <li>编码器要的就是 BGR24：不转的话每帧写视频前都要做一次 1080p 的 ARGB→BGR 拷贝
     *       （实测 ~1.5ms/帧，150 帧就是 200ms 以上）；静态层只转一次，于是每帧都省掉它。</li>
     *   <li>ARGB 直送编码器反而<b>更慢</b>（sws_scale 的 ARGB→YUV420P 路径比 BGR→YUV420P 慢约 10%），
     *       所以不能"干脆不转"。</li>
     *   <li>转成 BGR 会把 alpha 叠在黑底上，这不改变画面：这些分层本来就以不透明黑底打底，
     *       历史上每帧写视频前的同一次转换做的也是这件事。</li>
     * </ul>
     * 透明分层（UI_ONLY / CHARACTERS_ONLY）必须保留 alpha 通道，原样返回 ARGB。
     */
    private static BufferedImage renderStaticLayer(Record record, boolean plot, int width, int height,
            String layerType) throws IOException {
        return renderStaticLayer(record, plot, width, height, layerType, record.getCamera(), 0);
    }

    /** 指定镜头渲染静态层（动态镜头逐帧出片时，每帧调用一次） */
    private static BufferedImage renderStaticLayer(Record record, boolean plot, int width, int height,
            String layerType, Camera camera) throws IOException {
        return renderStaticLayer(record, plot, width, height, layerType, camera, 0);
    }

    /**
     * 指定镜头 + 帧号渲染静态层（立绘/临时图片有移动动画时，每帧调用一次）。
     *
     * @param frameIndex 记录内的帧号；没有动画时它不影响任何像素
     */
    private static BufferedImage renderStaticLayer(Record record, boolean plot, int width, int height,
            String layerType, Camera camera, int frameIndex) throws IOException {
        BufferedImage layer = renderStaticLayerArgb(record, plot, width, height, layerType, camera, frameIndex);
        return isTransparentLayer(layerType) ? layer : toBgr(layer);
    }

    /** 把图像转成不透明 BGR（alpha 叠在黑底上，与旧版每帧写视频前的转换一致）。 */
    private static BufferedImage toBgr(BufferedImage source) {
        if (source == null) {
            return null;
        }
        if (source.getType() == BufferedImage.TYPE_3BYTE_BGR) {
            return source;
        }
        BufferedImage bgr = new BufferedImage(source.getWidth(), source.getHeight(),
                BufferedImage.TYPE_3BYTE_BGR);
        Graphics2D g2d = bgr.createGraphics();
        try {
            g2d.drawImage(source, 0, 0, null);
        } finally {
            g2d.dispose();
        }
        return bgr;
    }

    /** 按分层类型渲染静态层的原始（ARGB）结果。 */
    private static BufferedImage renderStaticLayerArgb(Record record, boolean plot, int width, int height,
            String layerType, Camera camera, int frameIndex) throws IOException {
        switch (layerType) {
            case LAYER_FULL:
            case LAYER_BG_CHARACTERS:
                // 完整背景: 背景 + 角色立绘 + 临时图片 + 边框 + UI背景(无对话文本)
                return RenderOfImage.renderPreExceptDialogue(record, plot, width, height, camera, frameIndex);
            case LAYER_UI_ONLY:
                // 仅UI背景: UI元素(对话框、说话人、地点) + 0.8缩放后的border位置效果
                // 镜头不影响 UI，这里不需要传；立绘动画也不在 UI 层里
                return renderUIOnlyStaticBackground(record, plot, width, height);
            case LAYER_BACKGROUND_ONLY:
                // 仅背景（背景目前不支持移动动画）
                return RenderOfImage.renderBackgroundOnly(record, plot, width, height, camera);
            case LAYER_CHARACTERS_ONLY:
                // 仅角色立绘（含立绘移动动画）
                return RenderOfImage.renderCharactersOnly(record, width, height, camera, frameIndex);
            default:
                logger.warn("未知的分层类型: {}, 回退到完整渲染", layerType);
                return RenderOfImage.renderPreExceptDialogue(record, plot, width, height, camera, frameIndex);
        }
    }

    /**
     * 渲染仅UI静态背景（不含对话文本，用于UI_ONLY视频的文本动画叠加）
     * 透明底！只绘制 UI框架(对话框/说话人/地点)，不包含对话文字、黑底和边框。
     * 边框（border）属于背景层，由 BG_CHARACTERS 层提供，不应在 UI_ONLY 层重复绘制。
     *
     * <p>UI 素材与锚点都是 1080p 设计尺寸，所以在设计画布上绘制，最后整层缩放到输出分辨率
     * ——与 {@link RenderOfImage} 保持同一套"设计画布 + 只缩放一次"的规则。
     */
    private static BufferedImage renderUIOnlyStaticBackground(Record record, boolean plot, int width, int height)
            throws IOException {
        int designW = ProjectConfig.VIDEO_WIDTH;
        int designH = ProjectConfig.VIDEO_HEIGHT;

        FrameComposerService composer = new FrameComposerService();
        composer.setOutputSize(designW, designH);

        // 叠加UI框架元素（对话框、说话人名片、地点等，不含对话文本和边框）
        BufferedImage uiFrame = RenderOfImage.renderUI(plot, record.getDialogue());
        composer.addImageLayer(uiFrame, 0, 0);

        // 合成（透明底，设计画布尺寸），再整层缩放到输出分辨率
        BufferedImage result = composer.compose();
        if (result == null) {
            result = new BufferedImage(designW, designH, BufferedImage.TYPE_INT_ARGB);
        }
        if (result.getWidth() != width || result.getHeight() != height) {
            result = RenderQualityUtils.scaleImageHighQuality(result, width, height);
        }
        composer.clearLayers();
        return result;
    }

    /**
     * 判断分层是否需要透明通道
     */
    private static boolean isTransparentLayer(String layerType) {
        return LAYER_UI_ONLY.equals(layerType) || LAYER_CHARACTERS_ONLY.equals(layerType);
    }

    /**
     * 预计算每一帧要显示的文本。
     *
     * <p>规则与原「文本动画状态序列」完全一致：
     * <ul>
     *   <li>{@code speed < 1.0}（慢速档）：每个字符持续 {@code round(1/speed)} 帧；</li>
     *   <li>{@code speed >= 1.0}（快速档）：每帧显示 {@code round(speed)} 个字符；</li>
     *   <li>动画提前结束（台词打完）后，剩余帧全部定格在最后一段文本上。</li>
     * </ul>
     *
     * <p>返回长度恒为 {@code requiredFrames} 的数组：逐帧 O(1) 取文本，也方便上层做
     * "文本没变就复用上一帧画面"的判断。
     */
    private static String[] buildFrameTexts(Dialogue dialogue, int frameRate, int requiredFrames) {
        String[] texts = new String[Math.max(0, requiredFrames)];
        if (texts.length == 0) {
            return texts;
        }

        String fullText = (dialogue == null || dialogue.getText() == null) ? "" : dialogue.getText();
        if (fullText.isEmpty()) {
            java.util.Arrays.fill(texts, "");
            return texts;
        }

        float unifiedSpeed = getUnifiedSpeed(dialogue.getSpeed());
        logger.debug("生成逐帧文本: 文本长度={}, 统一速度={}, 需要总帧数={}",
                fullText.length(), unifiedSpeed, requiredFrames);

        int filled = 0;
        if (unifiedSpeed < 1.0f) {
            // 慢速档：每个字符持续多帧
            int framesPerChar = Math.max(1, Math.round(1.0f / unifiedSpeed));
            for (int charIndex = 1; charIndex <= fullText.length() && filled < texts.length; charIndex++) {
                String currentText = fullText.substring(0, charIndex);
                for (int repeat = 0; repeat < framesPerChar && filled < texts.length; repeat++) {
                    texts[filled++] = currentText;
                }
            }
        } else {
            // 快速档：每帧显示多个字符
            int charsPerFrame = Math.max(1, Math.round(unifiedSpeed));
            for (int start = 0; start < fullText.length() && filled < texts.length; start += charsPerFrame) {
                int endChar = Math.min(start + charsPerFrame, fullText.length());
                texts[filled++] = fullText.substring(0, endChar);
            }
        }

        // 动画结束后定格：剩余帧沿用最后一段文本
        String holdText = filled > 0 ? texts[filled - 1] : fullText;
        for (int i = filled; i < texts.length; i++) {
            texts[i] = holdText;
        }
        logger.debug("动画{}帧 + 定格{}帧 = 总{}帧", filled, texts.length - filled, texts.length);
        return texts;
    }

    /**
     * 渲染单帧图像
     *
     * <p>文字锚点、字号、换行宽度都是 1080p 设计值（{@link ProjectConfig}），而
     * {@code staticBackground} 已经按输出分辨率缩放过了，因此这里用同一个比例
     * {@code 帧宽 / 设计画布宽} 换算文字参数——否则低分辨率导出时文字会跑到画面外
     * （例如 640×360 下左对齐文字仍画在 x=376, y=912）。
     *
     * <p>"自由文本"说话人：字体/字号与旁白一致，整段文字块锚定在画面水平与垂直中心，
     * 并按 {@link Dialogue#isBold()} / {@link Dialogue#isItalic()} 应用加粗与斜体。
     */
    private static BufferedImage renderSingleFrame(BufferedImage staticBackground, String text,
            Dialogue dialogue, int width, int height) {
        // 复制静态背景
        BufferedImage frame = copyImage(staticBackground);
        Graphics2D g2d = frame.createGraphics();

        try {
            // 视频帧文字用灰度抗锯齿：LCD 子像素抗锯齿的彩边在 YUV420 + H.264 之后会变脏，
            // 也让成片文字与预览图不一致（详见 RenderQualityUtils.setupVideoFrameRendering）。
            RenderQualityUtils.setupVideoFrameRendering(g2d);

            final float designToFrame = ProjectConfig.VIDEO_WIDTH > 0
                    ? (float) frame.getWidth() / ProjectConfig.VIDEO_WIDTH
                    : 1f;

            final boolean freeText = dialogue != null && dialogue.isFreeText();
            final boolean isNarrator = dialogue != null && dialogue.isNarrator();

            // 根据模式选择配置参数（按 designToFrame 从设计坐标换算到实际帧坐标）
            int x, y, maxWidth;
            float fontSize;
            TextAlignment alignment;
            Color textColor = ProjectConfig.DEFAULT_TEXT_COLOR;

            if (freeText) {
                // 自由文本：字体与旁白一致，锚点 = 画面中心 + 用户设置的 X/Y 偏移；
                // 字号与偏移一样按设计画布→输出帧的比例换算
                x = Math.round((ProjectConfig.FREE_TEXT_CENTER_X + dialogue.getFreeTextX()) * designToFrame);
                y = Math.round((ProjectConfig.FREE_TEXT_CENTER_Y + dialogue.getFreeTextY()) * designToFrame);
                maxWidth = Math.round(ProjectConfig.DIALOGUE_MAX_WIDTH * designToFrame);
                fontSize = dialogue.getEffectiveFreeTextFontSize() * designToFrame;
                alignment = TextAlignment.CENTER;
                textColor = ProjectConfig.parseColor(
                        dialogue.getFreeTextColor(), ProjectConfig.DEFAULT_TEXT_COLOR);
            } else if (isNarrator) {
                x = Math.round(ProjectConfig.DIALOGUE_CENTER_X * designToFrame);
                y = Math.round(ProjectConfig.DIALOGUE_CENTER_Y * designToFrame);
                maxWidth = Math.round(ProjectConfig.DIALOGUE_MAX_WIDTH * designToFrame);
                fontSize = ProjectConfig.DIALOGUE_FONT_SIZE * designToFrame;
                alignment = TextAlignment.CENTER;
            } else {
                x = Math.round(ProjectConfig.DIALOGUE_LEFT_X * designToFrame);
                y = Math.round(ProjectConfig.DIALOGUE_LEFT_Y * designToFrame);
                maxWidth = Math.round(ProjectConfig.DIALOGUE_MAX_WIDTH * designToFrame);
                fontSize = ProjectConfig.DIALOGUE_FONT_SIZE * designToFrame;
                alignment = TextAlignment.LEFT;
            }

            // 自由文本的加粗/斜体（其它模式的这两个字段不参与渲染）
            int fontStyle = Font.PLAIN;
            if (freeText && dialogue.isBold()) {
                fontStyle |= Font.BOLD;
            }
            if (freeText && dialogue.isItalic()) {
                fontStyle |= Font.ITALIC;
            }

            // 绘制文字
            drawTextWithAdvancedFeatures(g2d, text, x, y, fontSize, textColor,
                    alignment, maxWidth, false, null, 0, 0, fontStyle);

        } finally {
            g2d.dispose();
        }

        return frame;
    }

    /**
     * 统一速度配置
     * 速度范围：0.1 - 10.0
     * 小于1.0：表示每个字符持续的帧数（慢速）
     * 大于1.0：表示每帧显示的字符数（快速）
     * 等于1.0：1字符/帧（标准速度）
     */
    public static float getUnifiedSpeed(int speedLevel) {
        switch (speedLevel) {
            case 1:
                return 0.1f; // 极慢：1字符/10帧
            case 2:
                return 0.5f; // 很慢：1字符/2帧
            case 3:
                return 1.0f; // 标准：1字符/帧
            case 4:
                return 2.0f; // 快速：2字符/帧
            case 5:
                return 4.0f; // 很快：4字符/帧
            case 6:
                return 8.0f; // 极快：8字符/帧
            default:
                return 1.0f;
        }
    }

    // ==================== 文本渲染工具方法 ====================

    /**
     * 绘制带有高级功能的文字（换行、对齐、锚点等）
     *
     * @param fontSize  字号；为浮点数以便按输出分辨率等比换算设计字号
     * @param fontStyle 字体样式（{@link Font#PLAIN} / {@link Font#BOLD} / {@link Font#ITALIC} 组合）
     */
    private static void drawTextWithAdvancedFeatures(Graphics2D g2d, String text, int x, int y,
            float fontSize, Color color, TextAlignment alignment,
            int maxWidth, boolean hasShadow, Color shadowColor,
            int shadowOffsetX, int shadowOffsetY, int fontStyle) {
        if (text == null || text.isEmpty()) {
            return;
        }

        // 设置字体
        Font font = FontLoader.getChineseFont(fontStyle, fontSize);
        g2d.setFont(font);
        g2d.setColor(color);

        // 当前中文字体没有独立 Bold 字重，deriveFont(Font.BOLD) 不改变字形，
        // 因此用"填充 + 轮廓描边"模拟加粗；由于字号已按输出分辨率换算，线宽要跟着字号缩放。
        boolean bold = (fontStyle & Font.BOLD) != 0;

        // 绘制阴影（如果需要；阴影不重复加粗）
        if (hasShadow && shadowColor != null) {
            drawTextWithOffset(g2d, text, x, y, alignment, maxWidth,
                    shadowOffsetX, shadowOffsetY, shadowColor, false, fontSize);
        }

        // 绘制主文字
        drawTextWithOffset(g2d, text, x, y, alignment, maxWidth, 0, 0, color, bold, fontSize);
    }

    /**
     * 绘制带偏移的文字（支持换行和对齐）
     *
     * @param bold 是否模拟加粗
     */
    private static void drawTextWithOffset(Graphics2D g2d, String text, int x, int y,
            TextAlignment alignment, int maxWidth,
            int offsetX, int offsetY, Color drawColor, boolean bold, float fontSize) {
        if (maxWidth > 0) {
            // 需要换行的文本
            drawWrappedTextWithOffset(g2d, text, x + offsetX, y + offsetY,
                    alignment, maxWidth, drawColor, bold, fontSize);
        } else {
            // 单行文本
            drawSingleLineWithOffset(g2d, text, x + offsetX, y + offsetY,
                    alignment, drawColor, bold, fontSize);
        }
    }

    /**
     * 绘制带偏移的单行文本（修正居中对齐）
     */
    private static void drawSingleLineWithOffset(Graphics2D g2d, String text, int x, int y,
            TextAlignment alignment, Color color, boolean bold, float fontSize) {
        FontMetrics metrics = g2d.getFontMetrics();
        int textWidth = metrics.stringWidth(text);
        int textHeight = metrics.getHeight(); // 总高度
        int drawX = x;
        int drawY;

        if (alignment == TextAlignment.CENTER) {
            // 🔥 修正：文本框中心在(x,y)
            drawX = x - textWidth / 2; // 水平居中：中心在x
            drawY = y - textHeight / 2 + metrics.getAscent(); // 垂直居中：中心在y
        } else if (alignment == TextAlignment.RIGHT) {
            // 右对齐：文本基线在y坐标，右边界在x坐标
            drawX = x - textWidth;
            drawY = y + metrics.getAscent(); // 基线在y坐标
        } else {
            // 左对齐：文本基线在y坐标，左边界在x坐标
            drawX = x; // 左边界在x坐标
            drawY = y + metrics.getAscent(); // 基线在y坐标
        }

        g2d.setColor(color);

        if (!bold) {
            g2d.drawString(text, drawX, drawY);
            return;
        }

        TextLayout layout = new TextLayout(text, g2d.getFont(), g2d.getFontRenderContext());
        Shape outline = layout.getOutline(AffineTransform.getTranslateInstance(drawX, drawY));
        g2d.setStroke(boldStroke(fontSize));
        g2d.fill(outline);
        g2d.draw(outline);
    }

    /**
     * 绘制带偏移的换行文本（修正居中对齐）
     *
     * @param bold 是否模拟加粗
     */
    private static void drawWrappedTextWithOffset(Graphics2D g2d, String text, int x, int y,
            TextAlignment alignment, int maxWidth, Color color, boolean bold, float fontSize) {
        // 创建属性字符串
        AttributedString attributedString = new AttributedString(text);
        attributedString.addAttribute(TextAttribute.FONT, g2d.getFont());
        attributedString.addAttribute(TextAttribute.FOREGROUND, color);

        AttributedCharacterIterator characterIterator = attributedString.getIterator();
        FontRenderContext frc = g2d.getFontRenderContext();
        LineBreakMeasurer measurer = new LineBreakMeasurer(characterIterator, frc);

        // 🔥 修正：先测量总高度，用于垂直居中计算
        float totalHeight = 0;
        List<TextLayout> layouts = new ArrayList<>();

        // 第一次循环：测量总高度
        while (measurer.getPosition() < characterIterator.getEndIndex()) {
            TextLayout layout = measurer.nextLayout(maxWidth);
            layouts.add(layout);
            totalHeight += layout.getAscent() + layout.getDescent() + layout.getLeading();
        }

        // 重新开始测量
        measurer.setPosition(characterIterator.getBeginIndex());

        float currentY;
        if (alignment == TextAlignment.CENTER) {
            // 🔥 修正：文本框中心在(x,y)，计算起始Y坐标
            currentY = y - totalHeight / 2;
        } else {
            // 左对齐/右对齐：文本框顶部在y坐标
            currentY = y;
        }

        // 第二次循环：实际绘制
        for (TextLayout layout : layouts) {
            float lineWidth = layout.getAdvance();
            float drawX;

            // 根据对齐方式计算X坐标
            if (alignment == TextAlignment.CENTER) {
                drawX = x - lineWidth / 2; // 水平居中：行中心在x
            } else if (alignment == TextAlignment.RIGHT) {
                drawX = x - lineWidth; // 右对齐：行右边界在x
            } else {
                drawX = x; // 左对齐：行左边界在x
            }

            // 绘制当前行
            currentY += layout.getAscent();
            if (!bold) {
                layout.draw(g2d, drawX, currentY);
            } else {
                // 与单行文字一致：填充 + 轮廓描边模拟加粗
                Shape outline = layout.getOutline(AffineTransform.getTranslateInstance(drawX, currentY));
                g2d.setStroke(boldStroke(fontSize));
                g2d.fill(outline);
                g2d.draw(outline);
            }
            currentY += layout.getDescent() + layout.getLeading();
        }
    }

    /**
     * 模拟加粗时的描边宽度：随字号线性缩放（28px 设计字号约 1.4px），
     * 与预览页保持同一套观感。
     */
    private static BasicStroke boldStroke(float fontSize) {
        float width = Math.max(0.6f, fontSize * 0.05f);
        return new BasicStroke(width, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND);
    }

    // ==================== 工具方法 ====================

    /**
     * 复制图像
     */
    private static BufferedImage copyImage(BufferedImage source) {
        logger.trace("复制图像: {}x{}, type={}",
                source.getWidth(), source.getHeight(), source.getType());

        if (source == null) {
            return null;
        }

        BufferedImage copy = new BufferedImage(
                source.getWidth(), source.getHeight(), source.getType());
        Graphics2D g2d = copy.createGraphics();
        try {
            g2d.drawImage(source, 0, 0, null);
        } finally {
            g2d.dispose();
        }

        return copy;
    }
}