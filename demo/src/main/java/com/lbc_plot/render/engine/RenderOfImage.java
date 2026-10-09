package com.lbc_plot.render.engine;

import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.List;
import javax.imageio.ImageIO;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.render.engine.manager.FontLoader;
import com.lbc_plot.common.util.ImageCropper;
import com.lbc_plot.common.util.ImageDarkener;
import com.lbc_plot.common.util.RenderQualityUtils;
import com.lbc_plot.common.util.RuntimePaths;
import com.lbc_plot.common.util.TextureColorizer;
import com.lbc_plot.common.util.io.ImageReader;
import com.lbc_plot.config.ProjectConfig;
import net.coobird.thumbnailator.Thumbnails;

import com.lbc_plot.render.service.impl.CharacterServiceImpl;
import com.lbc_plot.render.video.BackgroundVisual;
import com.lbc_plot.render.video.CharacterRef;
import com.lbc_plot.render.video.CharacterVisual;
import com.lbc_plot.render.video.TempImageVisual;
import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.resource.dao.CharacterDAO;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.service.CharacterService;

/**
 * 渲染图片
 */

public class RenderOfImage {
    private static final Logger logger = LoggerFactory.getLogger(RenderOfImage.class);

    static BufferedImage border, dialogBox, speaker_camp, speaker_name, location;

    /** 临时名片缓存：key = "name|faction" */
    private static final java.util.concurrent.ConcurrentHashMap<String, BufferedImage> tempCardCache = new java.util.concurrent.ConcurrentHashMap<>();

    /** 临时名片缓存目录（锚定到数据根目录，不随 JVM 工作目录变化） */
    private static final String TEMP_CARD_DIR = RuntimePaths.toPortableString(
            RuntimePaths.getTempDir().resolve("cards")) + "/";
    // 静态代码块 - 类加载时自动执行
    // 读入图片文件
    static {
        try {
            border = ImageReader.readUI("border_1080p.png");
            dialogBox = ImageReader.readUI("dialogBox.png");
            speaker_camp = ImageReader.readUI("speaker-camp.png");
            speaker_name = ImageReader.readUI("speaker-name.png");
            location = ImageReader.readUI("location.png");

            logger.info("静态资源加载完成");
        } catch (IOException e) {
            logger.error("加载静态资源失败", e);
            // 可以设置默认图像或抛出异常
        }
    }

    /**
     * 渲染record预览图-完整
     */
    public static BufferedImage renderPre(Record record, boolean plot, int width, int height) throws IOException {
        logger.info("========== 开始渲染预览图 ==========");
        logger.info("参数: plot={}, 请求尺寸={}x{}", plot, width, height);
        logger.info("记录: uuid={}, speaker={}, text={}",
                record.getUuid(),
                record.getDialogue() != null ? record.getDialogue().getSpeakerName() : "null",
                record.getDialogue() != null ? abbreviateText(record.getDialogue().getText()) : "null");

        FrameComposerService composer = new FrameComposerService();

        try {
            // 分层渲染
            renderBackground(composer, record, plot, width, height);
            if (plot) {
                renderCharacters(composer, record);
                renderTempImages(composer, record);
                composer.addImageLayer(border, 0, 0);
                // 缩放0.8：先把背景+角色+border合成一张，再缩小到 0.8 居中
                BufferedImage coImage = composer.compose();
                logger.info("中间合成: coImage 尺寸={}x{}, 目标缩放={}, 目标位置=({},{})",
                        coImage.getWidth(), coImage.getHeight(),
                        0.8f, width / 10, height / 10);
                composer.addFullScreenMask(255);
                composer.addImageLayerScaled(coImage, width / 10, height / 10, 0.8f);
            }

            renderUIAndDialogue(composer, record, plot, width, height);

            // 合成最终图像
            return composeFinalImage(composer, width, height);

        } catch (Exception e) {
            logger.error("渲染预览图严重失败", e);
            throw new IOException("渲染预览图失败", e);
        } finally {
            logger.info("========== 预览图渲染流程结束 ==========");
        }
    }

    /**
     * 渲染record预览图-除了对话
     */
    public static BufferedImage renderPreExceptDialogue(Record record, boolean plot, int width, int height)
            throws IOException {
        logger.info("开始渲染预处理: plot={}, width={}, height={}", plot, width, height);

        FrameComposerService composer = new FrameComposerService();

        try {
            // 分层渲染
            renderBackground(composer, record, plot, width, height);
            if (plot) {
                renderCharacters(composer, record);
                renderTempImages(composer, record);
                composer.addImageLayer(border, 0, 0);
                // 缩放0.8
                BufferedImage coImage = composer.compose();
                composer.addFullScreenMask(255);
                composer.addImageLayerScaled(coImage, width / 10, height / 10, 0.8f);
            }
            renderUIBackground(composer, plot, record.getDialogue(), width, height);

            // 除了对话都渲染了,虽然上面是静态的

            // 合成最终图像
            return composeFinalImage(composer, width, height);

        } catch (Exception e) {
            logger.error("渲染预处理严重失败", e);
            throw new IOException("渲染预处理失败", e);
        } finally {
            logger.debug("渲染预处理完成");
        }
    }

    /**
     * 仅渲染背景
     */
    public static BufferedImage renderBackgroundOnly(Record record, boolean plot, int width, int height)
            throws IOException {
        FrameComposerService composer = new FrameComposerService();
        renderBackground(composer, record, plot, width, height);
        return composeFinalImage(composer, width, height);
    }

    /**
     * 仅渲染角色立绘
     */
    public static BufferedImage renderCharactersOnly(Record record, int width, int height) throws IOException {
        FrameComposerService composer = new FrameComposerService();
        renderCharacters(composer, record);
        return composeFinalImage(composer, width, height);
    }

    /**
     * 仅渲染UI和对话
     */
    public static BufferedImage renderUIOnly(Record record, boolean plot, int width, int height) throws IOException {
        FrameComposerService composer = new FrameComposerService();
        renderUIAndDialogue(composer, record, plot, width, height);
        return composeFinalImage(composer, width, height);
    }

    /**
     * 渲染背景层
     */
    private static void renderBackground(FrameComposerService composer, Record record, boolean plot, int width,
            int height) {
        logger.info("=== 开始渲染背景层: plot={}, 视频尺寸={}x{} ===", plot, width, height);

        List<BackgroundVisual> bgList = record.getBackgroundVisuals();
        if (bgList == null || bgList.isEmpty()) {
            logger.warn("记录中没有背景信息，使用默认黑色背景");
            composer.addFullScreenMask(255);
            return;
        }

        // 打印每个背景的原图尺寸
        for (int i = 0; i < bgList.size(); i++) {
            BackgroundVisual bg = bgList.get(i);
            if (bg != null && bg.getBgImage() != null) {
                logger.info("  背景[{}]: name={}, 原图尺寸={}x{}",
                        i, bg.getBackground().getName(),
                        bg.getBgImage().getWidth(), bg.getBgImage().getHeight());
            }
        }

        // 始终全屏拉伸背景，0.8 缩放 + 居中由 renderPre / renderPreExceptDialogue
        // 中的 addImageLayerScaled(coImage, w/10, h/10, 0.8) 统一完成
        logger.info("  → 背景全屏拉伸至 {}x{}（0.8 缩放由上层 compose+scale 统一处理）", width, height);
        renderFullScreenBackground(composer, bgList, width, height);
    }

    /**
     * 渲染剧情模式背景（带边框）
     */
    private static void renderPlotBackground(FrameComposerService composer, List<BackgroundVisual> bgList, int width,
            int height) {
        int targetWidth = (int) (0.8 * width);
        int targetHeight = (int) (0.8 * height);
        int borderWidth = (int) (0.1 * width);
        int borderHeight = (int) (0.1 * height);

        logger.info("Plot 背景渲染: 视频={}x{}, 目标区域={}x{}, 偏移量=({},{}), 即缩小至 80% 并居中",
                width, height, targetWidth, targetHeight, borderWidth, borderHeight);

        for (BackgroundVisual bg : bgList) {
            if (!validateBackgroundVisual(bg))
                continue;

            try {
                BufferedImage bgImage = bg.getBgImage();
                int rawW = bgImage.getWidth();
                int rawH = bgImage.getHeight();
                logger.info("  处理背景: name={}, 原图尺寸={}x{}", bg.getBackground().getName(), rawW, rawH);

                composer.addFullScreenMask(255);
                composer.addImageLayerResized(bgImage, borderWidth, borderHeight, targetWidth, targetHeight,
                        true);

                // addImageLayerResized 可能因 keepAspectRatio=true 而调整实际尺寸，
                // 目标位置 borderWidth,borderHeight 不变，但实际图像尺寸可能小于 targetWidth x targetHeight
                logger.info("  背景已添加: 目标位置({},{}), 目标区域{}x{} (keepAspectRatio=true，实际尺寸由 scaleImageHighQuality 决定)",
                        borderWidth, borderHeight, targetWidth, targetHeight);

                renderBorder(composer, borderWidth, borderHeight, targetWidth, targetHeight);

            } catch (Exception e) {
                logger.error("添加背景图层失败: {}", bg, e);
            }
        }
    }

    /**
     * 渲染全屏背景
     */
    private static void renderFullScreenBackground(FrameComposerService composer, List<BackgroundVisual> bgList,
            int width, int height) {
        logger.debug("全屏渲染模式");

        for (BackgroundVisual bg : bgList) {
            if (!validateBackgroundVisual(bg))
                continue;

            try {
                composer.addImageLayerResized(bg.getBgImage(), 0, 0, width, height, true);
                logger.debug("添加全屏背景图层: 尺寸{}x{}", width, height);
            } catch (Exception e) {
                logger.error("添加全屏背景图层失败: {}", bg, e);
            }
        }
    }

    /**
     * 渲染边框
     */
    private static void renderBorder(FrameComposerService composer, int x, int y, int width, int height) {
        if (border != null) {
            composer.addImageLayerResized(border, x, y, width, height, true);
            logger.debug("添加边框图层");
        } else {
            logger.error("边框图像未加载，跳过边框渲染");
        }
    }

    /**
     * 验证背景可视化对象
     */
    private static boolean validateBackgroundVisual(BackgroundVisual bg) {
        if (bg == null) {
            logger.warn("遇到空的BackgroundVisual，跳过");
            return false;
        }

        if (bg.getBgImage() == null) {
            logger.error("背景图像为空: {}", bg);
            return false;
        }

        return true;
    }

    /**
     * 渲染角色立绘层
     */
    private static void renderCharacters(FrameComposerService composer, Record record) {
        logger.info("开始渲染角色立绘层");

        List<CharacterVisual> chars = record.getCharacters();
        if (chars == null || chars.isEmpty()) {
            logger.info("记录中没有角色立绘信息");
            return;
        }

        logger.debug("开始渲染{}个角色立绘", chars.size());

        // 逆序渲染：数组末尾先绘制（底层），数组开头后绘制（顶层），与前端列表顺序一致
        for (int i = chars.size() - 1; i >= 0; i--) {
            CharacterVisual chara = chars.get(i);
            if (!validateCharacterVisual(chara, i))
                continue;

            try {
                renderSingleCharacter(composer, chara);
            } catch (Exception e) {
                logger.error("添加角色图层失败: {}", chara.getChara().getCharacterName(), e);
            }
        }
    }

    /**
     * 验证角色可视化对象
     */
    private static boolean validateCharacterVisual(CharacterVisual chara, int index) {
        if (chara == null) {
            logger.warn("第{}个角色立绘为空，跳过", index + 1);
            return false;
        }

        if (chara.getImage() == null) {
            logger.error("角色图像为空: {}", chara.getChara().getCharacterName());
            return false;
        }

        return true;
    }

    /**
     * 安全地计算缩放比例
     */
    public static float calculateScaleSafely(int numerator, int denominator) {
        if (denominator == 0) {
            logger.warn("除数为0，返回默认缩放比例1.0f");
            return 1.0f;
        }
        return (float) numerator / denominator;
    }

    /**
     * 渲染单个角色
     */
    private static void renderSingleCharacter(FrameComposerService composer, CharacterVisual chara) {
        BufferedImage charImage = chara.getImage();
        float scaled = calculateScaleSafely(
                ProjectConfig.DEFAULT_CHARACTER_HEAD_LENGTH,
                chara.getPortrait().getLength());
        logger.debug("{}立绘渲染比例为{}", chara.getChara().getCharacterName(), scaled);

        if (chara.isDim()) {
            // 不是说话人要压暗
            BufferedImage darkenedImage = ImageDarkener.darkenImage(charImage, 0.5f);
            if (darkenedImage == null) {
                logger.error("图像压暗失败，使用原图: {}", chara.getChara().getCharacterName());
                composer.addImageLayerScaled(charImage, chara.getPosX(), chara.getPosY(), scaled);
            } else {
                composer.addImageLayerScaled(darkenedImage, chara.getPosX(), chara.getPosY(), scaled);
                logger.debug("添加压暗角色图层: {} at ({},{})",
                        chara.getChara().getCharacterName(), chara.getPosX(), chara.getPosY());
            }
        } else {
            composer.addImageLayerScaled(charImage, chara.getPosX(), chara.getPosY(), scaled);
            logger.debug("添加角色图层: {} at ({},{})",
                    chara.getChara().getCharacterName(), chara.getPosX(), chara.getPosY());
        }
    }

    /**
     * 渲染临时图片层（NPC、道具等）
     */
    private static void renderTempImages(FrameComposerService composer, Record record) {
        List<TempImageVisual> tempImages = record.getTempImages();
        if (tempImages == null || tempImages.isEmpty()) {
            return;
        }
        logger.info("开始渲染临时图片层，共 {} 张", tempImages.size());
        // 逆序渲染：数组末尾先绘制（底层），数组开头后绘制（顶层），与前端列表顺序一致
        for (int i = tempImages.size() - 1; i >= 0; i--) {
            TempImageVisual temp = tempImages.get(i);
            try {
                BufferedImage img = temp.getImage();
                if (img == null) {
                    logger.warn("临时图片为空，跳过: uuid={}, path={}", temp.getUuid(), temp.getImagePath());
                    continue;
                }
                if (temp.isDim()) {
                    img = ImageDarkener.darkenImage(img, 0.5f);
                    if (img == null) {
                        logger.warn("临时图片压暗失败，使用原图: uuid={}", temp.getUuid());
                        img = temp.getImage();
                    }
                }
                composer.addImageLayerScaled(img, temp.getPosX(), temp.getPosY(), temp.getScale());
                logger.debug("添加临时图片图层: uuid={} at ({},{}), scale={}, dim={}",
                        temp.getUuid(), temp.getPosX(), temp.getPosY(), temp.getScale(), temp.isDim());
            } catch (Exception e) {
                logger.error("渲染临时图片失败: uuid={}", temp.getUuid(), e);
            }
        }
    }

    /**
     * 角色用, 渲染名字+阵营UI
     * 
     * @param composer
     * @param chara
     */
    public static BufferedImage renderCharaNameUI(CharacterRef myCharacter) {
        try {
            logger.info("开始生成名片图片，角色ID: {}, 角色名: {}",
                    myCharacter.getCharacterID(), myCharacter.getCharacterName());

            // 使用Thumbnailator优化图片处理
            logger.debug("处理背景图片");
            BufferedImage camp = Thumbnails.of(speaker_camp)
                    .size(1300, 550)
                    .keepAspectRatio(true)
                    .asBufferedImage();
            logger.debug("背景图片处理完成，尺寸: {}x{}", camp.getWidth(), camp.getHeight());

            logger.debug("处理名称图片");
            BufferedImage name = TextureColorizer.colorizeToRGB(speaker_name, myCharacter.getColorBg());
            name = Thumbnails.of(name)
                    .size(1300, 550)
                    .keepAspectRatio(true)
                    .asBufferedImage();
            logger.debug("名称图片处理完成，尺寸: {}x{}", name.getWidth(), name.getHeight());

            // 先创建临时名片图片，使用原始尺寸
            logger.debug("创建临时名片图片，尺寸: 1920x1080");
            BufferedImage temp = new BufferedImage(1920, 1080, BufferedImage.TYPE_INT_ARGB);
            Graphics2D g2d = temp.createGraphics();
            RenderQualityUtils.setupUltraQualityRendering(g2d);

            // 绘制背景和文字
            logger.debug("绘制背景和名称图片");
            g2d.drawImage(camp, 0, 0, null);
            g2d.drawImage(name, 0, 0, null);

            // 添加角色名
            logger.debug("添加角色名: {}", myCharacter.getCharacterName());
            Font nameFont = FontLoader.getChineseFont(ProjectConfig.CHARACTER_NAME_FONT_SIZE);
            g2d.setFont(nameFont);
            g2d.setColor(myCharacter.getColorText());

            // 计算文字位置以实现居中对齐
            FontMetrics nameMetrics = g2d.getFontMetrics(nameFont);
            int nameWidth = nameMetrics.stringWidth(myCharacter.getCharacterName());
            int nameHeight = nameMetrics.getHeight();
            int nameBaseline = nameMetrics.getAscent(); // 获取文字基线位置

            // 计算文字中心点，确保与旋转中心对齐
            // 文字中心 = 锚点位置
            int centerX = ProjectConfig.CHARACTER_NAME_X;
            int centerY = ProjectConfig.CHARACTER_NAME_Y;

            // 计算文字左上角位置，使文字中心与锚点对齐
            int nameX = centerX - nameWidth / 2;
            int nameY = centerY - nameHeight / 2 + nameBaseline;

            // 输出文字位置信息
            logger.info("角色名文字位置信息:");
            logger.info("  文字内容: {}", myCharacter.getCharacterName());
            logger.info("  文字尺寸: 宽度={}, 高度={}", nameWidth, nameHeight);
            logger.info("  文字基线: {}", nameBaseline);
            logger.info("  旋转中心: X={}, Y={}", centerX, centerY);
            logger.info("  文字左上角: X={}, Y={}", nameX, nameY);
            logger.info("  旋转角度: {}°", ProjectConfig.CHARACTER_NAME_ROTATION);

            // 保存当前变换状态
            AffineTransform originalTransform = g2d.getTransform();

            // 应用旋转（围绕锚点旋转）
            if (ProjectConfig.CHARACTER_NAME_ROTATION != 0) {
                AffineTransform transform = new AffineTransform();
                transform.rotate(Math.toRadians(ProjectConfig.CHARACTER_NAME_ROTATION),
                        centerX, centerY);
                g2d.setTransform(transform);
            }

            // 添加文字阴影
            if (true) { // hasShadow = true
                g2d.setColor(Color.BLACK);
                int shadowX = nameX + ProjectConfig.SHADOW_OFFSET_NAME_X;
                int shadowY = nameY + ProjectConfig.SHADOW_OFFSET_NAME_Y;
                g2d.drawString(myCharacter.getCharacterName(), shadowX, shadowY);
            }

            // 绘制主文字
            g2d.setColor(myCharacter.getColorText());
            g2d.drawString(myCharacter.getCharacterName(), nameX, nameY);

            // 恢复原始变换状态
            g2d.setTransform(originalTransform);

            // 添加阵营文字
            logger.debug("添加阵营: {}", myCharacter.getFaction());
            Font factionFont = FontLoader.getChineseFont(ProjectConfig.FACTION_FONT_SIZE);
            g2d.setFont(factionFont);
            g2d.setColor(ProjectConfig.FACTION_COLOR);

            // 计算文字位置以实现居中对齐
            FontMetrics factionMetrics = g2d.getFontMetrics(factionFont);
            int factionWidth = factionMetrics.stringWidth(myCharacter.getFaction());
            int factionHeight = factionMetrics.getHeight();
            int factionBaseline = factionMetrics.getAscent(); // 获取文字基线位置

            // 计算文字中心点，确保与旋转中心对齐
            // 文字中心 = 锚点位置
            int factionCenterX = ProjectConfig.FACTION_X;
            int factionCenterY = ProjectConfig.FACTION_Y;

            // 计算文字左上角位置，使文字中心与锚点对齐
            int factionX = factionCenterX - factionWidth / 2;
            int factionY = factionCenterY - factionHeight / 2 + factionBaseline;

            // 输出文字位置信息
            logger.info("阵营文字位置信息:");
            logger.info("  文字内容: {}", myCharacter.getFaction());
            logger.info("  文字尺寸: 宽度={}, 高度={}", factionWidth, factionHeight);
            logger.info("  文字基线: {}", factionBaseline);
            logger.info("  旋转中心: X={}, Y={}", factionCenterX, factionCenterY);
            logger.info("  文字左上角: X={}, Y={}", factionX, factionY);
            logger.info("  旋转角度: {}°", ProjectConfig.FACTION_ROTATION);

            // 保存当前变换状态
            originalTransform = g2d.getTransform();

            // 应用旋转（围绕锚点旋转）
            if (ProjectConfig.FACTION_ROTATION != 0) {
                AffineTransform transform = new AffineTransform();
                transform.rotate(Math.toRadians(ProjectConfig.FACTION_ROTATION),
                        factionCenterX, factionCenterY);
                g2d.setTransform(transform);
            }

            // 添加文字阴影
            if (true) { // hasShadow = true
                g2d.setColor(Color.BLACK);
                int shadowX = factionX + (ProjectConfig.SHADOW_OFFSET_NAME_X - 1);
                int shadowY = factionY + ProjectConfig.SHADOW_OFFSET_NAME_Y;
                g2d.drawString(myCharacter.getFaction(), shadowX, shadowY);
            }

            // 绘制主文字
            g2d.setColor(ProjectConfig.FACTION_COLOR);
            g2d.drawString(myCharacter.getFaction(), factionX, factionY);

            // 恢复原始变换状态
            g2d.setTransform(originalTransform);

            g2d.dispose();

            // 记录裁剪前的尺寸
            logger.debug("名片图片裁剪前尺寸: {}x{}", temp.getWidth(), temp.getHeight());

            // 裁剪透明区域，去除多余的空白
            logger.debug("开始裁剪透明区域");
            BufferedImage cropped = ImageCropper.cropTransparentAreas(temp);
            logger.info("名片图片裁剪完成，最终尺寸: {}x{}", cropped.getWidth(), cropped.getHeight());

            // 创建最终名片图片，保持原始比例
            int finalWidth = cropped.getWidth();
            int finalHeight = cropped.getHeight();
            BufferedImage result = new BufferedImage(finalWidth, finalHeight, BufferedImage.TYPE_INT_ARGB);
            Graphics2D finalG2d = result.createGraphics();
            RenderQualityUtils.setupUltraQualityRendering(finalG2d);

            // 绘制裁剪后的图片
            finalG2d.drawImage(cropped, 0, 0, finalWidth, finalHeight, 0, 0, finalWidth, finalHeight, null);
            finalG2d.dispose();

            return result;
        } catch (Exception e) {
            logger.error("生成名片图片失败: " + e.getMessage(), e);
            return null;
        }
    }

    /**
     * 渲染UI和对话层
     */
    private static void renderUIAndDialogue(FrameComposerService composer, Record record, boolean plot, int width,
            int height) throws IOException {
        logger.info("开始渲染UI和对话层");

        Dialogue dialogue = record.getDialogue();
        if (dialogue == null) {
            logger.error("对话信息为空，无法渲染UI");
            throw new IOException("对话信息为空");
        }

        renderUIBackground(composer, plot, dialogue, width, height);
        renderDialogueText(composer, dialogue);
    }

    /**
     * 渲染UI背景
     */
    private static void renderUIBackground(FrameComposerService composer, boolean plot, Dialogue dialogue, int width,
            int height) throws IOException {
        try {
            BufferedImage uiImage = renderUI(plot, dialogue, width, height);
            if (uiImage == null) {
                logger.error("UI渲染失败，生成空UI图像");
                uiImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
            }
            composer.addImageLayer(uiImage, 0, 0);
            logger.debug("添加UI图层: 尺寸={}x{}", uiImage.getWidth(), uiImage.getHeight());
        } catch (Exception e) {
            logger.error("渲染UI失败", e);
            throw new IOException("UI渲染失败", e);
        }
    }

    /**
     * 渲染对话文本
     */
    private static void renderDialogueText(FrameComposerService composer, Dialogue dialogue) throws IOException {
        try {
            if (dialogue.isNarrator()) {
                composer.addDialogueTextCenter(dialogue.getText());
                logger.debug("添加居中旁白文本: {}", abbreviateText(dialogue.getText()));
            } else {
                composer.addDialogueTextLeft(dialogue.getText());
                logger.debug("添加左对齐对话文本: {}", abbreviateText(dialogue.getText()));
            }
        } catch (Exception e) {
            logger.error("添加对话文本失败", e);
            throw new IOException("对话文本渲染失败", e);
        }
    }

    /**
     * 合成最终图像
     */
    private static BufferedImage composeFinalImage(FrameComposerService composer, int width, int height) {
        logger.info("=== 合成最终图像: 期望尺寸={}x{} ===", width, height);
        BufferedImage result = composer.compose();

        if (result == null) {
            logger.error("图像合成失败，返回空图像 {}x{}", width, height);
            result = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        } else {
            int actualW = result.getWidth();
            int actualH = result.getHeight();
            if (actualW != width || actualH != height) {
                logger.warn("最终图像尺寸与期望不符! 期望={}x{}, 实际={}x{}，自动缩放至期望尺寸",
                        width, height, actualW, actualH);
                result = RenderQualityUtils.scaleImageHighQuality(result, width, height);
                logger.info("缩放后图像尺寸: {}x{}", result.getWidth(), result.getHeight());
            } else {
                logger.info("最终图像尺寸匹配: {}x{}", actualW, actualH);
            }
        }

        composer.clearLayers();
        return result;
    }

    /**
     * 缩写长文本用于日志显示
     */
    private static String abbreviateText(String text) {
        if (text == null)
            return "null";
        if (text.length() <= 50)
            return text;
        return text.substring(0, 47) + "...";
    }

    /**
     * 从磁盘加载临时名片缓存
     *
     * @param cacheKey 缓存键 "name|faction"
     * @return 缓存的 BufferedImage，不存在则返回 null
     */
    private static BufferedImage loadTempCardFromDisk(String cacheKey) {
        try {
            java.io.File dir = new java.io.File(TEMP_CARD_DIR);
            if (!dir.exists())
                return null;
            java.io.File file = new java.io.File(dir, cacheKey.replace("|", "_") + ".png");
            if (file.exists()) {
                logger.info("从磁盘加载临时名片: {}", file.getAbsolutePath());
                return javax.imageio.ImageIO.read(file);
            }
        } catch (Exception e) {
            logger.warn("加载临时名片磁盘缓存失败: {}", e.getMessage());
        }
        return null;
    }

    /**
     * 保存临时名片到磁盘
     *
     * @param cacheKey 缓存键 "name|faction"
     * @param image    要保存的 BufferedImage
     */
    private static void saveTempCardToDisk(String cacheKey, BufferedImage image) {
        try {
            java.io.File dir = new java.io.File(TEMP_CARD_DIR);
            if (!dir.exists()) {
                dir.mkdirs();
                logger.info("创建临时名片目录: {}", dir.getAbsolutePath());
            }
            java.io.File file = new java.io.File(dir, cacheKey.replace("|", "_") + ".png");
            javax.imageio.ImageIO.write(image, "PNG", file);
            logger.info("临时名片已保存到磁盘: {}", file.getAbsolutePath());
        } catch (Exception e) {
            logger.warn("保存临时名片到磁盘失败: {}", e.getMessage());
        }
    }

    /**
     * 渲染整个UI
     * 
     * @param plot     是否为剧情模式
     * @param dialogue 对话信息
     * @return 渲染后的UI图像
     * @throws IOException 当渲染失败时抛出
     */
    public static BufferedImage renderUI(boolean plot, Dialogue dialogue, int targetWidth, int targetHeight)
            throws IOException {
        Logger logger = LoggerFactory.getLogger(RenderOfImage.class);
        logger.info("开始渲染UI: plot={}, dialogueSpeaker={}, 目标尺寸={}x{}", plot,
                dialogue != null ? dialogue.getSpeakerName() : "null", targetWidth, targetHeight);

        int width = ProjectConfig.VIDEO_WIDTH;
        int height = ProjectConfig.VIDEO_HEIGHT;
        logger.debug("使用画布尺寸: {}x{}", width, height);

        if (dialogue == null) {
            logger.error("对话信息为空，无法渲染UI");
            throw new IOException("对话信息为空");
        }

        FrameComposerService composer = new FrameComposerService();

        try {
            // 渲染对话框UI
            if (dialogBox != null) {
                composer.addImageLayerScaled(dialogBox, 264, 826, 1.46f);
                logger.debug("添加对话框UI: 位置(264,826), 缩放1.46x");
            } else {
                logger.error("对话框图像未加载，跳过渲染");
            }

            CharacterRef speaker = dialogue.getSpeakerCharacter();
            if (speaker == null) {
                // speakerC 为空，尝试从 Dialogue 的 speakerName/faction 构造临时 CharacterRef
                String name = dialogue.getSpeakerName();
                if (name != null && !name.trim().isEmpty() && !"旁白".equals(name.trim())) {
                    String faction = dialogue.getFaction();
                    if (faction == null || faction.trim().isEmpty()) {
                        faction = "未设定";
                    }
                    String cacheKey = name.trim() + "|" + faction.trim();
                    logger.info("speakerC 为空，使用 Dialogue 构造临时说话人: name={}, faction={}", name, faction);

                    // 先查内存缓存，避免重复渲染
                    BufferedImage cachedCard = tempCardCache.get(cacheKey);
                    if (cachedCard != null) {
                        logger.info("命中临时名片内存缓存: {}", cacheKey);
                        composer.addImageLayerScaled(cachedCard, -26, 789, 0.28f);
                        // 跳过后续 speaker 分支
                        speaker = null;
                    } else {
                        // 尝试从磁盘缓存加载
                        BufferedImage diskCard = loadTempCardFromDisk(cacheKey);
                        if (diskCard != null) {
                            logger.info("命中临时名片磁盘缓存: {}", cacheKey);
                            tempCardCache.put(cacheKey, diskCard);
                            composer.addImageLayerScaled(diskCard, -26, 789, 0.28f);
                            speaker = null;
                        } else {
                            // 构造临时 CharacterRef 用于渲染
                            speaker = new CharacterRef("temp_" + name.trim(), name.trim(), 0,
                                    faction.trim(),
                                    ProjectConfig.DEFAULT_BG_COLOR,
                                    ProjectConfig.DEFAULT_TEXT_COLOR);
                            logger.info("新建临时 CharacterRef: id=temp_{}, faction={}", name.trim(), faction);
                        }
                    }
                } else {
                    logger.info("speakerName 为空或为旁白，使用默认旁白处理");
                    speaker = CharacterRef.getDefaultNarrator();
                }
            }

            if (speaker != null && !speaker.isNarrator()) {
                logger.debug("渲染说话人UI元素: {}", speaker.getCharacterName());
                BufferedImage cardImage = speaker.getColorNameImage();
                composer.addImageLayerScaled(cardImage, -26, 789, 0.28f);

                // 若是临时名片（id 以 "temp_" 开头），缓存并保存到磁盘
                if (speaker.getCharacterID() != null && speaker.getCharacterID().startsWith("temp_")) {
                    String cacheKey = speaker.getCharacterName() + "|" + speaker.getFaction();
                    tempCardCache.put(cacheKey, cardImage);
                    saveTempCardToDisk(cacheKey, cardImage);
                }
            } else if (speaker != null) {
                logger.debug("旁白模式，跳过说话人UI元素");
            }

            if (plot) { // 如果是剧情，需要渲染地点UI
                logger.debug("剧情模式，渲染地点UI");

                if (location != null) {
                    composer.addImageLayerScaled(location, -2, -117, 0.41f);
                    logger.debug("添加地点UI: 位置(-2,-117), 缩放0.41x");
                } else {
                    logger.error("地点UI图像未加载，跳过渲染");
                }

                String locationText = dialogue.getLocation();
                if (locationText != null && !locationText.trim().isEmpty()) {
                    composer.addLocationText(locationText);
                    logger.debug("添加地点文本: {}", locationText);
                } else {
                    logger.warn("地点文本为空，跳过渲染");
                }
            } else {
                logger.debug("非剧情模式，跳过地点UI");
            }

            // 合成最终UI图像
            logger.info("开始合成UI图像");
            BufferedImage ui = composer.compose();

            if (ui == null) {
                logger.error("UI图像合成失败，返回空图像");
                ui = new BufferedImage(targetWidth, targetHeight, BufferedImage.TYPE_INT_ARGB);
            } else {
                logger.info("UI图像合成成功: 尺寸{}x{}", ui.getWidth(), ui.getHeight());

                // 若 UI 合成尺寸与目标尺寸不匹配，缩放至目标尺寸
                if (ui.getWidth() != targetWidth || ui.getHeight() != targetHeight) {
                    logger.info("UI尺寸不匹配，缩放至目标尺寸 {}x{}", targetWidth, targetHeight);
                    ui = RenderQualityUtils.scaleImageHighQuality(ui, targetWidth, targetHeight);
                }

                // 调试信息：记录UI图像的基本信息
                if (logger.isDebugEnabled()) {
                    logger.debug("UI图像信息: 类型={}, 透明度={}",
                            ui.getType(),
                            ui.getTransparency() == BufferedImage.TRANSLUCENT ? "透明" : "不透明");
                }
            }

            return ui;

        } catch (Exception e) {
            logger.error("UI渲染过程中发生异常", e);
            throw new IOException("UI渲染失败: " + e.getMessage(), e);

        } finally {
            try {
                composer.clearLayers();
                logger.debug("清理UI合成器图层");
            } catch (Exception e) {
                logger.warn("清理UI合成器时发生异常", e);
            }
            logger.info("UI渲染完成");
        }
    }

    /**
     * 高质量图像缩放
     */
    public static BufferedImage scaleImageHighQuality(BufferedImage original, int newWidth, int newHeight) {
        BufferedImage scaledImage = new BufferedImage(newWidth, newHeight, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g2d = scaledImage.createGraphics();

        RenderQualityUtils.setupUltraQualityRendering(g2d);

        // 使用双三次插值进行高质量缩放
        g2d.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
                RenderingHints.VALUE_INTERPOLATION_BICUBIC);

        g2d.drawImage(original, 0, 0, newWidth, newHeight, null);
        g2d.dispose();

        return scaledImage;
    }

}
