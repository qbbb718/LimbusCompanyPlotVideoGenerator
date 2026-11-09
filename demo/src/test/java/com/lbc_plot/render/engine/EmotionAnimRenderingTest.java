package com.lbc_plot.render.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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

import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.video.Camera;
import com.lbc_plot.render.video.CharacterVisual;
import com.lbc_plot.render.video.anim.AnimationClipAsset;
import com.lbc_plot.render.video.anim.EmotionAnim;
import com.lbc_plot.render.video.emotion.AnimationClipStore;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;

/**
 * 情绪动画（序列帧）在**真实渲染管线**里的验证：画出来看像素。
 *
 * <p>锁七件事：
 * <ol>
 *   <li>第 N 帧真的画的是第 N 张图（不是永远第 0 张）；</li>
 *   <li>素材以**脸框中心**为基准对齐（位置算对）；</li>
 *   <li>序列播完之后与"完全没挂动画"逐像素相同（不能留下半透明残影）；</li>
 *   <li>淡入帧的 alpha 真的生效；</li>
 *   <li>静态预览用「代表帧」而不是第 0 帧；</li>
 *   <li>摄像机推近（zoom≠1）时贴脸特效**跟着一起放大**；</li>
 *   <li>静态预览图（编辑器里那张栅格图）同样受 zoom 影响，与 DOM 层不能两副样子。</li>
 * </ol>
 *
 * <p>用合成图（纯色方块）避免依赖素材库。
 */
class EmotionAnimRenderingTest {

    private static final int WIDTH = 1920;
    private static final int HEIGHT = 1080;

    /** 立绘裁剪框边长：与 183 相同 → renderScale = 1，posX/posY 就是 (960, 221) */
    private static final int LENGTH = 183;

    /** 素材画布（正方形，便于算中心） */
    private static final int CANVAS = 200;

    private static final Color FRAME_0 = Color.BLUE;
    private static final Color FRAME_1 = Color.GREEN;
    private static final Color FRAME_2 = Color.YELLOW;

    @TempDir
    Path tempRoot;

    private String clipId;

    @BeforeEach
    void prepareAssets() throws Exception {
        AnimationClipStore.setRootForTesting(tempRoot);
        clipId = "test_clip";
        Path framesDir = AnimationClipStore.framesDir(clipId);
        java.nio.file.Files.createDirectories(framesDir);
        // 三张纯色帧，方便用颜色反查"画的是第几张"
        writePng(framesDir.resolve("0001.png"), FRAME_0);
        writePng(framesDir.resolve("0002.png"), FRAME_1);
        writePng(framesDir.resolve("0003.png"), FRAME_2);

        AnimationClipAsset asset = new AnimationClipAsset();
        asset.setId(clipId);
        asset.setName("测试序列");
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

    /* ==================== 用例 ==================== */

    @Test
    @DisplayName("逐帧换图：第 0/1/2 帧分别是第 1/2/3 张图")
    void drawsTheRightFrame() throws Exception {
        Record record = recordWith(emotionAnim(3, 0));

        assertEquals(FRAME_0.getRGB(), rgbNear(RenderOfImage.renderCharactersOnly(record, WIDTH, HEIGHT, null, 0),
                faceCenterX(), faceCenterY()), "第 0 帧应当是第 1 张图（蓝）");
        assertEquals(FRAME_1.getRGB(), rgbNear(RenderOfImage.renderCharactersOnly(record, WIDTH, HEIGHT, null, 1),
                faceCenterX(), faceCenterY()), "第 1 帧应当是第 2 张图（绿）");
        assertEquals(FRAME_2.getRGB(), rgbNear(RenderOfImage.renderCharactersOnly(record, WIDTH, HEIGHT, null, 2),
                faceCenterX(), faceCenterY()), "第 2 帧应当是第 3 张图（黄）");
    }

    @Test
    @DisplayName("位置：素材中心落在脸框中心上（不是画面中心、也不是脚底）")
    void spriteIsCenteredOnFaceBox() throws Exception {
        BufferedImage image = RenderOfImage.renderCharactersOnly(recordWith(emotionAnim(3, 0)),
                WIDTH, HEIGHT, null, 0);

        int centerX = faceCenterX();
        int centerY = faceCenterY();
        assertEquals(FRAME_0.getRGB(), rgbNear(image, centerX, centerY), "脸框中心必须是素材颜色");

        // 素材 200×200、中心在 (1051,312) → 占据 x∈[951,1151]、y∈[212,412]
        // 立绘 400×400 画在 (960,221) → 占据 x∈[960,1360]、y∈[221,621]
        // 所以「素材右侧之外、立绘之内」= (centerX+120, centerY) 必须是立绘本身的红
        assertEquals(Color.RED.getRGB(), rgbNear(image, centerX + 120, centerY),
                "素材右侧之外应当还是立绘本身");
        // 「素材下方之外、立绘之内」同理
        assertEquals(Color.RED.getRGB(), rgbNear(image, centerX, centerY + 120),
                "素材下方之外应当还是立绘本身");
    }

    @Test
    @DisplayName("播完之后与完全没挂动画逐像素相同（不留残影）")
    void afterSequenceEndsNothingIsDrawn() throws Exception {
        Record withAnimation = recordWith(emotionAnim(3, 0));
        Record withoutAnimation = recordWith(null);

        String ended = sha256(RenderOfImage.renderCharactersOnly(withAnimation, WIDTH, HEIGHT, null, 3));
        String none = sha256(RenderOfImage.renderCharactersOnly(withoutAnimation, WIDTH, HEIGHT, null, 3));
        assertEquals(none, ended, "序列播完后必须回到原路径，画面逐像素不变");
    }

    @Test
    @DisplayName("淡入：前几帧真的更透明（alpha 阶梯）")
    void fadeInIsApplied() throws Exception {
        EmotionAnim emo = emotionAnim(3, 0);
        emo.setFadeInFrames(2); // len=3 → 有效淡入 2 帧：local 0 → 0、local 1 → 0.5、local 2 → 1
        Record record = recordWith(emo);

        // 第 0 帧 alpha=0 → 完全看不到素材，露出立绘的红
        assertEquals(Color.RED.getRGB(),
                rgbNear(RenderOfImage.renderCharactersOnly(record, WIDTH, HEIGHT, null, 0),
                        faceCenterX(), faceCenterY()),
                "淡入起点应当完全透明");

        // 第 1 帧 alpha=0.5、画的是第 2 张图（绿）→ 红绿各一半，既不是纯红也不是纯绿
        Color half = new Color(rgbNear(
                RenderOfImage.renderCharactersOnly(record, WIDTH, HEIGHT, null, 1),
                faceCenterX(), faceCenterY()));
        assertTrue(half.getRed() > 100 && half.getGreen() > 100 && half.getBlue() < 60,
                "半透明应当是红绿混合，实际 " + half);

        // 第 2 帧 alpha=1、画的是第 3 张图（黄）→ 完全不透明
        assertEquals(FRAME_2.getRGB(),
                rgbNear(RenderOfImage.renderCharactersOnly(record, WIDTH, HEIGHT, null, 2),
                        faceCenterX(), faceCenterY()),
                "淡入结束后应当完全不透明");
    }

    @Test
    @DisplayName("代表帧：静态预览画的是用户挑的那一帧，而不是第 0 帧")
    void posterFrameIsUsedForStaticPreview() throws Exception {
        EmotionAnim emo = emotionAnim(3, 0);
        emo.setPosterFrame(1); // 用户挑第 2 张（绿）
        Record record = recordWith(emo);

        BufferedImage preview = RenderOfImage.renderPreviewStill(record, true, WIDTH, HEIGHT);
        // 场景在设计画布上缩到 0.8 并偏移 (192,108)
        int x = (int) Math.round(192 + faceCenterX() * 0.8);
        int y = (int) Math.round(108 + faceCenterY() * 0.8);
        Color color = new Color(rgbNear(preview, x, y));
        // 0.8 缩放走双三次重采样，纯色块的像素值会有 ±几位抖动，所以按通道判定而不是精确相等
        assertTrue(color.getGreen() > 200 && color.getRed() < 60 && color.getBlue() < 60,
                "静态预览必须画代表帧（绿），而不是第 0 帧（蓝），实际 " + color);
    }

    @Test
    @DisplayName("摄像机 zoom：贴脸特效跟着一起放大（人物放大了、汗滴不能还是原来那么大）")
    void cameraZoomScalesTheSprite() throws Exception {
        Camera camera = new Camera(960, 540, 2f);
        BufferedImage scene = RenderOfImage.renderCharactersOnly(recordWith(emotionAnim(3, 0)),
                WIDTH, HEIGHT, camera, 0);

        int centerX = camera.screenX(faceCenterX());
        int centerY = camera.screenY(faceCenterY());
        assertEquals(FRAME_0.getRGB(), rgbNear(scene, centerX, centerY),
                "镜头推近后素材中心仍应落在（换算后的）脸框中心上");

        // 素材 200×200 × zoom2 = 400×400（半宽 200）。没乘 zoom 时半宽只有 100，
        // 所以 "+150" 这个点只有"跟着镜头放大"才有素材颜色，否则露出立绘的红。
        assertEquals(FRAME_0.getRGB(), rgbNear(scene, centerX + 150, centerY),
                "镜头推近时素材尺寸必须跟着放大（前端 DOM 层就是这么算的）");
    }

    @Test
    @DisplayName("静态预览图：摄像机 zoom 同样作用于贴脸特效（栅格图与 DOM 层不能两副样子）")
    void staticPreviewRespectsCameraZoom() throws Exception {
        Record record = recordWith(emotionAnim(3, 0));
        record.setCamera(new Camera(960, 540, 2f));
        BufferedImage preview = RenderOfImage.renderPreviewStill(record, true, WIDTH, HEIGHT);

        // 场景画布 → 设计画布：×0.8 再偏移 (192,108)
        Camera camera = record.getCamera();
        int centerX = Math.round(192 + camera.screenX(faceCenterX()) * 0.8f);
        int centerY = Math.round(108 + camera.screenY(faceCenterY()) * 0.8f);

        assertTrue(isSpriteColor(rgbNear(preview, centerX, centerY)),
                "缩略图中心应当仍是素材颜色（" + FRAME_0 + "）");
        // 素材在设计画布里的半宽 = 200 × 0.8 = 160；不乘 zoom 时只有 80，所以 +120 处
        // 只有"跟随镜头放大"才留着素材颜色。该点离上边缘较远，边框暗角的影响可忽略。
        assertTrue(isSpriteColor(rgbNear(preview, centerX + 120, centerY)),
                "静态预览里的缩略图必须随镜头放大，否则与拖动时的 DOM 层对不上");
    }

    /* ==================== 数据构造 ==================== */

    /** 脸框中心的场景坐标（与 EmotionAnimPlacement 的推导同源） */
    private static int faceCenterX() {
        return 960 + (0 + LENGTH / 2);
    }

    private static int faceCenterY() {
        return 221 + (0 + LENGTH / 2);
    }

    private EmotionAnim emotionAnim(int frames, int startFrame) {
        EmotionAnim emo = new EmotionAnim();
        emo.setClipId(clipId);
        emo.setName("测试序列");
        emo.setCanvasWidth(CANVAS);
        emo.setCanvasHeight(CANVAS);
        List<Integer> holds = new ArrayList<>();
        for (int i = 0; i < frames; i++) {
            holds.add(1);
        }
        emo.setFrameHolds(holds);
        emo.setLoop("once");
        emo.setStartFrame(startFrame);
        emo.setScale(1f);
        emo.setOpacity(1f);
        return emo;
    }

    private static Record recordWith(EmotionAnim emo) throws Exception {
        MyCharacter character = MyCharacter.builder()
                .characterID("c-emo")
                .characterName("情绪角色")
                .height(171)
                .faction("测试")
                .build();
        Portrait portrait = Portrait.builder("")
                .portraitID("p-emo")
                .characterID("c-emo")
                .imagePath("")
                .portName("情绪立绘")
                .facePosition(0, 0)
                .length(LENGTH)
                .image(solid(Color.RED, 400, 400))
                .build();

        CharacterVisual.Builder builder = CharacterVisual.builder(character, portrait)
                .adjustment(0, 0)
                .scale(1.0f)
                .bright();
        if (emo != null) {
            builder.emotionAnim(emo);
        }

        return new Record.Builder()
                .uuid("emo-record")
                .dialogue(Dialogue.builder().text("情绪动画渲染").speakerName(Dialogue.DEFAULT_NARRATOR).build())
                .addCharacter(builder.build())
                .build();
    }

    /* ==================== 像素工具 ==================== */

    /**
     * 这个像素是不是"素材（蓝）"而不是"立绘（红）"。
     *
     * <p>静态预览要过 0.8 缩放与边框暗角，纯色会被压暗、边缘会被插值，所以按通道判定而不是精确相等。
     */
    private static boolean isSpriteColor(int rgb) {
        Color color = new Color(rgb);
        return color.getBlue() > 120 && color.getRed() < 60 && color.getGreen() < 60;
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
