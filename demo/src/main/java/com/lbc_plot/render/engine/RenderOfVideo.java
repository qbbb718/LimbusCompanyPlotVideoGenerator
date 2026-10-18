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
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.engine.BatchVideoProcessor.RenderResult;
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
        return exportRecordVideoStreaming(record, plot, width, height, outputPath, frameRate, LAYER_FULL);
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

        logger.info("开始高质量流式视频导出: {} (layerType={}, transparent={})", outputPath, layerType,
                isTransparentLayer(layerType));
        long startTime = System.currentTimeMillis();

        // 在开始时记录内存使用情况
        Runtime runtime = Runtime.getRuntime();
        long initialMemory = runtime.totalMemory() - runtime.freeMemory();

        // 确定是否需要文本动画
        boolean needsTextAnimation = LAYER_FULL.equals(layerType) || LAYER_UI_ONLY.equals(layerType);
        // 确定是否需要透明通道
        boolean transparent = isTransparentLayer(layerType);

        try (VideoExporter exporter = new VideoExporter(outputPath, width, height, frameRate, transparent)) {

            logger.info("使用编码方式: {}", exporter.getEncodingMethod());

            // 1. 计算总帧数
            int requiredFrames = RecordDurationCalculator.calculateDurationFrames(record, frameRate);
            logger.info("需要渲染 {} 帧 (约 {} 秒)",
                    requiredFrames, String.format("%.2f", requiredFrames / (double) frameRate));

            // 2. 根据分层类型渲染静态背景（只渲染一次）
            logger.debug("渲染静态背景 (layerType={})", layerType);
            BufferedImage staticBackground = renderStaticLayer(record, plot, width, height, layerType);

            // 3. 预计算文本动画状态（仅当需要文本动画时）
            List<TextAnimationState> textStates = null;
            if (needsTextAnimation) {
                textStates = generateTextAnimationStates(
                        record.getDialogue(), frameRate, requiredFrames);
            }

            int framesRendered = 0;

            // 4. 流式渲染所有帧
            for (int frameIndex = 0; frameIndex < requiredFrames; frameIndex++) {
                BufferedImage frame;

                if (needsTextAnimation) {
                    // 根据当前帧索引确定文本状态
                    String currentText = getTextForFrame(textStates, frameIndex);

                    // 动态渲染当前帧
                    frame = renderSingleFrame(staticBackground, currentText,
                            record.getDialogue(), width, height);
                } else {
                    // 无文本动画：直接使用静态背景
                    frame = copyImage(staticBackground);
                }

                // 立即写入视频文件
                exporter.writeFrame(frame);

                // 立即释放当前帧内存
                frame = null;

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

            return new RenderResult(framesRendered, startTime, duration);

        } catch (Exception e) {
            logger.error("高质量流式视频导出失败 (layerType={})", layerType, e);
            throw e;
        }
    }

    /**
     * 根据分层类型渲染静态背景层
     */
    private static BufferedImage renderStaticLayer(Record record, boolean plot, int width, int height,
            String layerType) throws IOException {
        switch (layerType) {
            case LAYER_FULL:
            case LAYER_BG_CHARACTERS:
                // 完整背景: 背景 + 角色立绘 + 临时图片 + 边框 + UI背景(无对话文本)
                return RenderOfImage.renderPreExceptDialogue(record, plot, width, height);
            case LAYER_UI_ONLY:
                // 仅UI背景: UI元素(对话框、说话人、地点) + 0.8缩放后的border位置效果
                return renderUIOnlyStaticBackground(record, plot, width, height);
            case LAYER_BACKGROUND_ONLY:
                // 仅背景
                return RenderOfImage.renderBackgroundOnly(record, plot, width, height);
            case LAYER_CHARACTERS_ONLY:
                // 仅角色立绘
                return RenderOfImage.renderCharactersOnly(record, width, height);
            default:
                logger.warn("未知的分层类型: {}, 回退到完整渲染", layerType);
                return RenderOfImage.renderPreExceptDialogue(record, plot, width, height);
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
     * 生成文本动画状态序列（修复延长问题）
     * 现在会正确计算动画帧数，并在动画结束后使用最后一帧定格延长
     */
    private static List<TextAnimationState> generateTextAnimationStates(Dialogue dialogue, int frameRate,
            int requiredFrames) {
        List<TextAnimationState> states = new ArrayList<>();

        if (dialogue == null || dialogue.getText() == null || dialogue.getText().isEmpty()) {
            // 空文本，直接使用空白文本填满所有帧
            states.add(new TextAnimationState("", 0, requiredFrames));
            return states;
        }

        String fullText = dialogue.getText();
        float unifiedSpeed = getUnifiedSpeed(dialogue.getSpeed());
        boolean isNarrator = dialogue.isNarrator();

        logger.debug("生成文本动画状态: 文本长度={}, 统一速度={}, 需要总帧数={}",
                fullText.length(), unifiedSpeed, requiredFrames);

        int currentFrame = 0;
        int animationFrames = 0;

        if (unifiedSpeed < 1.0f) {
            // 慢速模式：每个字符持续多帧
            float framesPerChar = 1.0f / unifiedSpeed;
            int actualFramesPerChar = Math.max(1, Math.round(framesPerChar));

            for (int charIndex = 1; charIndex <= fullText.length(); charIndex++) {
                String currentText = fullText.substring(0, charIndex);
                int endFrame = currentFrame + actualFramesPerChar;

                // 如果超出总帧数，调整到总帧数
                if (endFrame > requiredFrames) {
                    endFrame = requiredFrames;
                }

                states.add(new TextAnimationState(currentText, currentFrame, endFrame));
                currentFrame = endFrame;

                // 如果已经达到总帧数，提前结束
                if (currentFrame >= requiredFrames) {
                    break;
                }
            }
            animationFrames = currentFrame;

        } else {
            // 快速模式：每帧显示多个字符
            int charsPerFrame = Math.max(1, Math.round(unifiedSpeed));
            int totalAnimationFrames = (int) Math.ceil((double) fullText.length() / charsPerFrame);

            for (int frameIndex = 0; frameIndex < totalAnimationFrames; frameIndex++) {
                int endChar = Math.min((frameIndex + 1) * charsPerFrame, fullText.length());
                String currentText = fullText.substring(0, endChar);
                int endFrame = currentFrame + 1;

                // 如果超出总帧数，调整到总帧数
                if (endFrame > requiredFrames) {
                    endFrame = requiredFrames;
                }

                states.add(new TextAnimationState(currentText, currentFrame, endFrame));
                currentFrame = endFrame;

                // 如果已经达到总帧数，提前结束
                if (currentFrame >= requiredFrames) {
                    break;
                }
            }
            animationFrames = currentFrame;
        }

        // 🔥 修复：添加定格帧，但只在动画完成后开始
        if (animationFrames < requiredFrames && !states.isEmpty()) {
            TextAnimationState lastState = states.get(states.size() - 1);
            states.add(new TextAnimationState(lastState.text, animationFrames, requiredFrames));
            logger.debug("动画{}帧 + 定格{}帧 = 总{}帧", animationFrames, requiredFrames - animationFrames, requiredFrames);
        } else if (states.isEmpty()) {
            // 如果没有状态，添加空白状态
            states.add(new TextAnimationState("", 0, requiredFrames));
        }

        return states;
    }

    /**
     * 根据帧索引获取对应的文本
     */
    private static String getTextForFrame(List<TextAnimationState> textStates, int frameIndex) {
        for (TextAnimationState state : textStates) {
            if (frameIndex >= state.startFrame && frameIndex < state.endFrame) {
                return state.text;
            }
        }

        // 如果超出范围，返回最后一个状态的文本
        if (!textStates.isEmpty()) {
            return textStates.get(textStates.size() - 1).text;
        }

        return "";
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
            // 设置高质量渲染
            RenderQualityUtils.setupUltraQualityRendering(g2d);

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

    /**
     * 文本动画状态内部类
     */
    private static class TextAnimationState {
        final String text;
        final int startFrame;
        final int endFrame;

        TextAnimationState(String text, int startFrame, int endFrame) {
            this.text = text;
            this.startFrame = startFrame;
            this.endFrame = endFrame;
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