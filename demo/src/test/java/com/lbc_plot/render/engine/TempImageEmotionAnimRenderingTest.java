package com.lbc_plot.render.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.lbc_plot.common.util.RecordDurationCalculator;
import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.video.Camera;
import com.lbc_plot.render.video.TempImageVisual;
import com.lbc_plot.render.video.anim.AnimationClipAsset;
import com.lbc_plot.render.video.anim.EmotionAnim;
import com.lbc_plot.render.video.emotion.AnimationClipStore;

/**
 * 临时图片的**情绪动画（序列帧）**在真实渲染管线里的验证：画出来看像素。
 *
 * <p>「临时图片」页签与「立绘」页签共用同一个 {@code EmotionAnimPicker}、同一份数据、同一套
 * 摆放参数，差别只有头部区域的定义：立绘是裁剪框，临时图片是
 * **边长 = 图片显示宽度 / 3、水平居中、顶部贴合图片上边缘的正方形**。
 *
 * <p>这里锁六件事：
 * <ol>
 *   <li>第 N 帧真的画的是第 N 张图；</li>
 *   <li>素材以**头部正方形中心**为基准对齐（不是图片中心、也不是左上角）；</li>
 *   <li>序列播完之后与"完全没挂动画"逐像素相同（不留残影）；</li>
 *   <li>静态预览用「代表帧」，且**人格故事模式（plot=false）也照画**——临时图片两种模式都渲染；</li>
 *   <li>摄像机 zoom / 图片 scale 都要让特效跟着放大；</li>
 *   <li>它必须被算进逐帧重渲与场景签名，但**不参与记录时长**。</li>
 * </ol>
 */
class TempImageEmotionAnimRenderingTest {

    private static final int WIDTH = 1920;
    private static final int HEIGHT = 1080;

    /** 临时图片：300×300，画在 (760,300) / (760,300) */
    private static final int IMAGE_X = 760;
    private static final int IMAGE_Y = 300;
    private static final int IMAGE_SIZE = 300;

    /** 头部正方形：边长 = 300/3 = 100，水平居中 → 左上角 (860,300)，中心 (910,350) */
    private static final int HEAD_SIZE = IMAGE_SIZE / 3;
    private static final int HEAD_LEFT = IMAGE_X + (IMAGE_SIZE - HEAD_SIZE) / 2;
    private static final int HEAD_CENTER_X = IMAGE_X + IMAGE_SIZE / 2;
    private static final int HEAD_CENTER_Y = IMAGE_Y + HEAD_SIZE / 2;

    /** 素材画布（正方形，便于算中心） */
    private static final int CANVAS = 200;

    private static final int STAY = 75;

    private static final Color TEMP_IMAGE_COLOR = Color.RED;
    private static final Color FRAME_0 = Color.BLUE;
    private static final Color FRAME_1 = Color.GREEN;
    private static final Color FRAME_2 = Color.YELLOW;

    @TempDir
    Path tempRoot;

    private String clipId;

    @BeforeEach
    void prepareAssets() throws Exception {
        AnimationClipStore.setRootForTesting(tempRoot);
        clipId = "temp_emotion_clip";
        Path framesDir = AnimationClipStore.framesDir(clipId);
        java.nio.file.Files.createDirectories(framesDir);
        // 三张纯色帧，方便用颜色反查"画的是第几张"
        writePng(framesDir.resolve("0001.png"), FRAME_0);
        writePng(framesDir.resolve("0002.png"), FRAME_1);
        writePng(framesDir.resolve("0003.png"), FRAME_2);

        AnimationClipAsset asset = new AnimationClipAsset();
        asset.setId(clipId);
        asset.setName("临时图片测试序列");
        asset.setCanvasWidth(CANVAS);
        asset.setCanvasHeight(CANVAS);
        asset.setFrameHolds(new ArrayList<>(List.of(1, 1, 1)));
        asset.setCreatedAt(1L);
        AnimationClipStore.save(asset);
    }

    @AfterEach
    void restoreRoot() {
        AnimationClipStore.setRootForTesting(null);
    }

    /* ==================== 像素用例 ==================== */

    @Test
    @DisplayName("逐帧换图：第 0/1/2 帧分别是第 1/2/3 张图")
    void drawsTheRightFrame() throws Exception {
        Record record = recordWith(emotionAnim());

        assertEquals(FRAME_0.getRGB(), rgbNear(
                RenderOfImage.renderTempImagesOnly(record, WIDTH, HEIGHT, null, 0),
                HEAD_CENTER_X, HEAD_CENTER_Y), "第 0 帧应当是第 1 张图（蓝）");
        assertEquals(FRAME_1.getRGB(), rgbNear(
                RenderOfImage.renderTempImagesOnly(record, WIDTH, HEIGHT, null, 1),
                HEAD_CENTER_X, HEAD_CENTER_Y), "第 1 帧应当是第 2 张图（绿）");
        assertEquals(FRAME_2.getRGB(), rgbNear(
                RenderOfImage.renderTempImagesOnly(record, WIDTH, HEIGHT, null, 2),
                HEAD_CENTER_X, HEAD_CENTER_Y), "第 2 帧应当是第 3 张图（黄）");
    }

    @Test
    @DisplayName("位置：素材中心落在头部正方形中心（不是图片中心、也不是左上角）")
    void spriteIsCenteredOnHeadSquare() throws Exception {
        BufferedImage image = RenderOfImage.renderTempImagesOnly(
                recordWith(emotionAnim()), WIDTH, HEIGHT, null, 0);

        assertEquals(FRAME_0.getRGB(), rgbNear(image, HEAD_CENTER_X, HEAD_CENTER_Y),
                "头部正方形中心必须是素材颜色");

        // 头部中心 y = 350，素材高 200 → 素材上边在 y=250，比图片上边缘（300）还高 50px。
        // 若锚点错用"图片中心"（y=450），这一点会是透明；错用"图片顶边"（y=300）也不是素材色。
        assertEquals(FRAME_0.getRGB(), rgbNear(image, HEAD_CENTER_X, IMAGE_Y - 40),
                "头部正方形贴着图片上边缘 → 素材必须能画到图片顶边之上");

        // 素材右边界 = 910 + 100 = 1010；图片右边界 = 1060。
        // 所以 (1030,350) 应当已经回到图片本身（红），证明素材没有被画到整张图上。
        assertEquals(TEMP_IMAGE_COLOR.getRGB(), rgbNear(image, 1030, HEAD_CENTER_Y),
                "素材右侧之外应当还是临时图片本身");
        // 素材下边界 = 350 + 100 = 450；图片下边界 600 → (910,470) 也是图片本身
        assertEquals(TEMP_IMAGE_COLOR.getRGB(), rgbNear(image, HEAD_CENTER_X, 470),
                "素材下方之外应当还是临时图片本身");
    }

    @Test
    @DisplayName("头部正方形按图片显示宽度算：边长 = 100，左边缘 = 860")
    void headSquareMatchesTheRequirement() throws Exception {
        BufferedImage image = RenderOfImage.renderTempImagesOnly(
                recordWith(emotionAnim()), WIDTH, HEIGHT, null, 0);

        // 方框左边 860、中心 910；素材宽 200 → 左边 810（比方框还靠左 50）
        // 在 y = 260（图片之外、素材之内）验证水平边界：x ∈ [810,1010]
        assertEquals(FRAME_0.getRGB(), rgbNear(image, HEAD_LEFT - 40, IMAGE_Y - 40),
                "素材必须覆盖到头部正方形左边缘之外（素材比方框宽）");
        assertEquals(0, image.getRGB(HEAD_LEFT - 110, IMAGE_Y - 40) >>> 24,
                "更左侧已经在素材之外，应当是透明（图片从 y=300 才开始）");
    }

    @Test
    @DisplayName("播完之后与完全没挂动画逐像素相同（不留残影）")
    void afterSequenceEndsNothingIsDrawn() throws Exception {
        String ended = sha256(RenderOfImage.renderTempImagesOnly(
                recordWith(emotionAnim()), WIDTH, HEIGHT, null, 3));
        String none = sha256(RenderOfImage.renderTempImagesOnly(
                recordWith(null), WIDTH, HEIGHT, null, 3));
        assertEquals(none, ended, "序列播完后必须回到原路径，画面逐像素不变");
    }

    @Test
    @DisplayName("代表帧：静态预览画的是用户挑的那一帧，而不是第 0 帧")
    void posterFrameIsUsedForStaticPreview() throws Exception {
        EmotionAnim emo = emotionAnim();
        emo.setPosterFrame(1); // 挑第 2 张（绿）
        Record record = recordWith(emo);

        BufferedImage preview = RenderOfImage.renderPreviewStill(record, true, WIDTH, HEIGHT);
        // 场景在设计画布上缩到 0.8 并偏移 (192,108)
        int x = (int) Math.round(192 + HEAD_CENTER_X * 0.8);
        int y = (int) Math.round(108 + HEAD_CENTER_Y * 0.8);
        assertTrue(isGreen(rgbNear(preview, x, y)),
                "静态预览必须画代表帧（绿），而不是第 0 帧（蓝）");
    }

    @Test
    @DisplayName("人格故事模式（plot=false）照样画：临时图片在两种模式下都渲染")
    void rendersInPlainModeToo() throws Exception {
        Record record = recordWith(emotionAnim());

        BufferedImage preview = RenderOfImage.renderPreviewStill(record, false, WIDTH, HEIGHT);
        int x = (int) Math.round(192 + HEAD_CENTER_X * 0.8);
        int y = (int) Math.round(108 + HEAD_CENTER_Y * 0.8);
        assertTrue(isSpriteBlue(rgbNear(preview, x, y)),
                "临时图片不受 plot 影响，情绪动画在人格故事模式下也必须画出来");
    }

    @Test
    @DisplayName("摄像机 zoom：贴头特效跟着一起放大")
    void cameraZoomScalesTheSprite() throws Exception {
        Camera camera = new Camera(960, 540, 2f);
        BufferedImage scene = RenderOfImage.renderTempImagesOnly(
                recordWith(emotionAnim()), WIDTH, HEIGHT, camera, 0);

        int centerX = camera.screenX(HEAD_CENTER_X);
        int centerY = camera.screenY(HEAD_CENTER_Y);
        assertEquals(FRAME_0.getRGB(), rgbNear(scene, centerX, centerY),
                "镜头推近后素材中心仍应落在（换算后的）头部正方形中心上");

        // 素材 200×200 × zoom2 = 400×400（半宽 200）。没乘 zoom 时半宽只有 100，
        // 所以 "+150" 这个点只有"跟着镜头放大"才有素材颜色，否则露出图片的红。
        assertEquals(FRAME_0.getRGB(), rgbNear(scene, centerX + 150, centerY),
                "镜头推近时素材尺寸必须跟着放大（前端 DOM 层就是这么算的）");
    }

    @Test
    @DisplayName("图片 scale 放大 2 倍：头部正方形与素材一起变大（相对位置不变）")
    void imageScaleScalesTheBubble() throws Exception {
        // 图片 300→600 宽，画在 (760,300)：头部方框 200、中心 (1060,400)
        Record record = recordWith(emotionAnim(), 2f);
        BufferedImage image = RenderOfImage.renderTempImagesOnly(record, WIDTH, HEIGHT, null, 0);

        int centerX = IMAGE_X + (IMAGE_SIZE * 2) / 2;
        int centerY = IMAGE_Y + (IMAGE_SIZE * 2 / 3) / 2;
        assertEquals(FRAME_0.getRGB(), rgbNear(image, centerX, centerY),
                "图片放大后，素材仍锚定在头部正方形中心");

        // 素材宽 = 200 × 用户缩放 2 = 400（半宽 200）。1× 时半宽只有 100，
        // 所以 +150 处只有"跟随图片缩放"才有素材颜色。
        assertEquals(FRAME_0.getRGB(), rgbNear(image, centerX + 150, centerY),
                "图片放大时贴头特效必须一起放大");
    }

    /* ==================== 渲染接入用例 ==================== */

    @Test
    @DisplayName("必须算进「逐帧重渲」——人格故事模式也一样（临时图片照画）")
    void countsAsAnimatedSpriteInBothModes() throws Exception {
        Record record = recordWith(emotionAnim());
        assertTrue(RecordAnimation.hasAnimatedSprites(record, true),
                "挂了序列帧就必须逐帧重画，否则成片里冻在第 1 张图");
        assertTrue(RecordAnimation.hasAnimatedSprites(record, false),
                "临时图片在 plot=false 下也渲染，情绪动画同样要逐帧重画");
        assertFalse(RecordAnimation.hasAnimatedSprites(recordWith(null), true));
    }

    @Test
    @DisplayName("场景签名跟着帧号变，播完之后稳定（定格复用不被破坏）")
    void sceneSignatureFollowsTheFrames() throws Exception {
        Record record = recordWith(emotionAnim());

        String frame0 = RecordAnimation.sceneSignature(record, true, null, 0);
        String frame1 = RecordAnimation.sceneSignature(record, true, null, 1);
        assertNotEquals(frame0, frame1, "换图必须换签名，否则导出会整段复制第 0 帧");

        // 3 帧播完（frameIndex=3）之后再往后都不画，签名回到稳定值
        String ended = RecordAnimation.sceneSignature(record, true, null, 3);
        String later = RecordAnimation.sceneSignature(record, true, null, 300);
        assertEquals(ended, later, "播完之后签名必须稳定，后面几百帧才能继续复用");
    }

    @Test
    @DisplayName("情绪动画永远不参与记录时长（临时图片也一样）")
    void emotionAnimNeverExtendsDuration() throws Exception {
        Record plain = recordWith(null);
        Record withEmotion = recordWith(emotionAnim());

        int baseline = RecordDurationCalculator.calculateDurationFrames(plain, 30, true, STAY);
        assertEquals(baseline,
                RecordDurationCalculator.calculateDurationFrames(withEmotion, 30, true, STAY),
                "序列帧播到记录结束就截断，绝不能反过来定义记录长度");
    }

    /* ==================== 数据构造 ==================== */

    private EmotionAnim emotionAnim() {
        EmotionAnim emo = new EmotionAnim();
        emo.setClipId(clipId);
        emo.setName("临时图片测试序列");
        emo.setCanvasWidth(CANVAS);
        emo.setCanvasHeight(CANVAS);
        emo.setFrameHolds(new ArrayList<>(List.of(1, 1, 1)));
        emo.setLoop("once");
        emo.setStartFrame(0);
        emo.setScale(1f);
        emo.setOpacity(1f);
        return emo;
    }

    private Record recordWith(EmotionAnim emo) throws Exception {
        return recordWith(emo, 1f);
    }

    private Record recordWith(EmotionAnim emo, float imageScale) {
        TempImageVisual.Builder builder = new TempImageVisual.Builder()
                .uuid("temp-emotion")
                .imagePath("")
                .posX(IMAGE_X)
                .posY(IMAGE_Y)
                .scale(imageScale)
                .dim(false);
        if (emo != null) {
            builder.emotionAnim(emo);
        }
        TempImageVisual visual = builder.build();
        visual.setImage(solid(TEMP_IMAGE_COLOR, IMAGE_SIZE, IMAGE_SIZE));

        return new Record.Builder()
                .uuid("temp-emotion-record")
                .dialogue(Dialogue.builder()
                        .text("临时图片情绪动画")
                        .speakerName(Dialogue.DEFAULT_NARRATOR)
                        .build())
                .addTempImage(visual)
                .build();
    }

    /* ==================== 像素工具 ==================== */

    /** 这个像素是不是"素材（蓝）"而不是"临时图片（红）" */
    private static boolean isSpriteBlue(int rgb) {
        Color color = new Color(rgb, true);
        return color.getAlpha() > 200 && color.getBlue() > 120
                && color.getRed() < 80 && color.getGreen() < 80;
    }

    /** 静态预览过了 0.8 缩放与边框暗角，纯色会被压暗、边缘会被插值，所以按通道判定 */
    private static boolean isGreen(int rgb) {
        Color color = new Color(rgb);
        return color.getGreen() > 180 && color.getRed() < 80 && color.getBlue() < 80;
    }

    /** 取 (x, y) 周围 3×3 的中位颜色，避开缩放/抗锯齿带来的单点噪声 */
    private static int rgbNear(BufferedImage image, int x, int y) {
        List<Integer> samples = new ArrayList<>(9);
        for (int dy = -1; dy <= 1; dy++) {
            for (int dx = -1; dx <= 1; dx++) {
                int px = x + dx;
                int py = y + dy;
                if (px >= 0 && py >= 0 && px < image.getWidth() && py < image.getHeight()) {
                    samples.add(image.getRGB(px, py));
                }
            }
        }
        assertFalse(samples.isEmpty(), "取样点在画面之外: (" + x + "," + y + ")");
        samples.sort(Integer::compare);
        return samples.get(samples.size() / 2);
    }

    private static String sha256(BufferedImage image) throws Exception {
        java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
        java.nio.ByteBuffer row = java.nio.ByteBuffer.allocate(image.getWidth() * 4);
        for (int y = 0; y < image.getHeight(); y++) {
            row.clear();
            for (int x = 0; x < image.getWidth(); x++) {
                row.putInt(image.getRGB(x, y));
            }
            digest.update(row.array());
        }
        return java.util.HexFormat.of().formatHex(digest.digest());
    }

    private static BufferedImage solid(Color color, int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        try {
            g.setColor(color);
            g.fillRect(0, 0, width, height);
        } finally {
            g.dispose();
        }
        return image;
    }

    private static void writePng(Path target, Color color) throws Exception {
        assertNotNull(target);
        boolean written = javax.imageio.ImageIO.write(solid(color, CANVAS, CANVAS), "png", target.toFile());
        assertTrue(written, "写测试帧失败: " + target);
    }
}
