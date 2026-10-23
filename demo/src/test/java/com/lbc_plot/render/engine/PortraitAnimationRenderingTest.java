package com.lbc_plot.render.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.video.Camera;
import com.lbc_plot.render.video.CharacterVisual;
import com.lbc_plot.render.video.TempImageVisual;
import com.lbc_plot.render.video.anim.AnimationClip;
import com.lbc_plot.render.video.anim.SpriteAnimation;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;

/**
 * 移动动画在**真实渲染管线**里的验证（不只是求值，而是画出来看像素）。
 *
 * <p>锁四件事：
 * <ol>
 *   <li>动画的第 N 帧与第 0 帧画出来确实不同（否则"接了动画但没生效"）；</li>
 *   <li>位移的**方向与幅度**对得上（弹跳该往上走多少就多少）；</li>
 *   <li>第 0 帧（恒等）与"完全没配动画"渲染结果**逐像素相同**（加动画不能让画面跳一下）；</li>
 *   <li>摄像机推近时动画位移按 zoom 等比放大（世界像素 → 场景像素的换算正确）。</li>
 * </ol>
 *
 * <p>用合成图（纯色方块）避免依赖素材库，渲染走与成片相同的
 * {@link RenderOfImage#renderCharactersOnly}。
 */
class PortraitAnimationRenderingTest {

    private static final int WIDTH = 1920;
    private static final int HEIGHT = 1080;

    /** 弹跳幅度：位移断言直接拿它比 */
    private static final double BOUNCE_AMPLITUDE = 40d;

    /* ==================== 用例 ==================== */

    @Test
    @DisplayName("弹跳：第 9 帧比第 0 帧整体上移约 40px（= 幅度）")
    void bounceMovesPortraitUp() throws Exception {
        Record animated = recordWithCharacter(bounceAnimation(), null);
        Record plain = recordWithCharacter(null, null);

        BufferedImage frame0 = RenderOfImage.renderCharactersOnly(plain, WIDTH, HEIGHT, null, 0);
        BufferedImage atPeak = RenderOfImage.renderCharactersOnly(animated, WIDTH, HEIGHT, null, 9);

        int plainTop = firstOpaqueRow(frame0);
        int peakTop = firstOpaqueRow(atPeak);
        assertTrue(plainTop >= 0 && peakTop >= 0, "两帧都应该有立绘像素");
        assertEquals(BOUNCE_AMPLITUDE, plainTop - peakTop, 1.5,
                "弹跳峰值应当把立绘整体上移约 " + BOUNCE_AMPLITUDE + "px");
    }

    @Test
    @DisplayName("第 0 帧恒等：与完全没配动画逐像素相同（加动画不能跳一下）")
    void identityFrameEqualsNoAnimation() throws Exception {
        Record animated = recordWithCharacter(bounceAnimation(), null);
        Record plain = recordWithCharacter(null, null);

        String atZero = sha256(RenderOfImage.renderCharactersOnly(animated, WIDTH, HEIGHT, null, 0));
        String without = sha256(RenderOfImage.renderCharactersOnly(plain, WIDTH, HEIGHT, null, 0));
        assertEquals(without, atZero, "第 0 帧必须是恒等变换，画面与没配动画时完全一致");
    }

    @Test
    @DisplayName("摄像机推近 2 倍：动画位移也放大 2 倍（世界像素 → 场景像素）")
    void cameraZoomScalesAnimationOffset() throws Exception {
        // 镜头对准立绘中心（960+200, 221+200），否则 zoom=2 时立绘会被画布上边缘裁掉，
        // 量到的"最高点"就变成 0 而不是真实位置（这正是第一版测试踩的坑）
        Camera zoomed = new Camera(1160f, 421f, 2f);
        Record animated = recordWithCharacter(bounceAnimation(), null);
        Record plain = recordWithCharacter(null, null);

        BufferedImage frame0 = RenderOfImage.renderCharactersOnly(plain, WIDTH, HEIGHT, zoomed, 0);
        BufferedImage atPeak = RenderOfImage.renderCharactersOnly(animated, WIDTH, HEIGHT, zoomed, 9);

        int plainTop = firstOpaqueRow(frame0);
        int peakTop = firstOpaqueRow(atPeak);
        assertEquals(BOUNCE_AMPLITUDE * 2, plainTop - peakTop, 2.5,
                "zoom=2 时位移应当同步放大到 80px");
    }

    @Test
    @DisplayName("临时图片同样能动（锚点在中心）")
    void tempImageCanAnimate() throws Exception {
        Record animated = recordWithTempImage(bounceAnimation());
        Record plain = recordWithTempImage(null);

        // 临时图片在 renderCharactersOnly 里根本不参与（那条路只画立绘），
        // 必须走"场景层"入口。plot=false 跳过立绘，只留临时图片，正好把变量隔离干净。
        String atZero = sha256(RenderOfImage.renderPreExceptDialogue(animated, false, WIDTH, HEIGHT, null, 0));
        String without = sha256(RenderOfImage.renderPreExceptDialogue(plain, false, WIDTH, HEIGHT, null, 0));
        assertEquals(without, atZero, "临时图片第 0 帧也必须是恒等");

        String atPeak = sha256(RenderOfImage.renderPreExceptDialogue(animated, false, WIDTH, HEIGHT, null, 9));
        String plainPeak = sha256(RenderOfImage.renderPreExceptDialogue(plain, false, WIDTH, HEIGHT, null, 9));
        assertNotEquals(plainPeak, atPeak, "第 9 帧临时图片应当已经移动");
    }

    @Test
    @DisplayName("静帧透明图层：动画帧与静帧都保持透明底（不引入黑底）")
    void animatedLayerKeepsTransparency() throws Exception {
        Record animated = recordWithCharacter(bounceAnimation(), null);
        BufferedImage atPeak = RenderOfImage.renderCharactersOnly(animated, WIDTH, HEIGHT, null, 9);
        assertEquals(0, atPeak.getRGB(0, 0) >>> 24, "左上角必须保持完全透明（没有背景时不铺黑底）");
    }

    /* ==================== 像素工具 ==================== */

    /** 第一行存在不透明像素的行号（画面里立绘的最高点） */
    private static int firstOpaqueRow(BufferedImage image) {
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                if ((image.getRGB(x, y) >>> 24) > 8) {
                    return y;
                }
            }
        }
        return -1;
    }

    private static String sha256(BufferedImage image) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        ByteBuffer header = ByteBuffer.allocate(8);
        header.putInt(image.getWidth());
        header.putInt(image.getHeight());
        digest.update(header.array());
        ByteBuffer row = ByteBuffer.allocate(image.getWidth() * 4);
        for (int y = 0; y < image.getHeight(); y++) {
            row.clear();
            for (int x = 0; x < image.getWidth(); x++) {
                row.putInt(image.getRGB(x, y));
            }
            digest.update(row.array());
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    /* ==================== 合成数据 ==================== */

    /** 弹跳：幅度 40px、周期 18 帧、无限循环 → 第 9 帧正好在最高点（-40px） */
    private static SpriteAnimation bounceAnimation() {
        AnimationClip clip = new AnimationClip();
        clip.setId("bounce");
        clip.setKind("preset");
        clip.setPreset("bounce");
        clip.setDurationFrames(180);
        clip.setLoop("loop");
        clip.setParams(java.util.Map.of(
                "amplitude", BOUNCE_AMPLITUDE,
                "periodFrames", 18,
                "iterations", 0));

        SpriteAnimation anim = new SpriteAnimation();
        anim.setVersion(1);
        anim.setTimebase(new SpriteAnimation.Timebase("frame", 30));
        anim.setClips(List.of(clip));
        return anim;
    }

    private static Record recordWithCharacter(SpriteAnimation anim, Camera camera) throws Exception {
        MyCharacter character = MyCharacter.builder()
                .characterID("c-anim")
                .characterName("动画角色")
                .height(171)
                .faction("测试")
                .build();
        Portrait portrait = Portrait.builder("")
                .portraitID("p-anim")
                .characterID("c-anim")
                .imagePath("")
                .portName("动画立绘")
                .facePosition(0, 0)
                .length(183)
                .image(probeImage(Color.RED, 400, 400))
                .build();

        CharacterVisual.Builder builder = CharacterVisual.builder(character, portrait)
                .adjustment(0, 0)
                .scale(1.0f)
                .bright();
        if (anim != null) {
            builder.anim(anim);
        }

        Record.Builder record = new Record.Builder()
                .uuid("anim-char")
                .dialogue(Dialogue.builder().text("动画渲染").speakerName(Dialogue.DEFAULT_NARRATOR).build())
                .addCharacter(builder.build());
        if (camera != null) {
            record.camera(camera);
        }
        return record.build();
    }

    private static Record recordWithTempImage(SpriteAnimation anim) throws Exception {
        TempImageVisual.Builder builder = new TempImageVisual.Builder()
                .uuid("temp-anim")
                .imagePath("")
                .posX(760)
                .posY(300)
                .scale(1.0f)
                .dim(false);
        if (anim != null) {
            builder.anim(anim);
        }
        TempImageVisual visual = builder.build();
        visual.setImage(probeImage(new Color(0x30, 0xC0, 0x70), 300, 300));

        return new Record.Builder()
                .uuid("anim-temp")
                .dialogue(Dialogue.builder().text("临时图片动画").speakerName(Dialogue.DEFAULT_NARRATOR).build())
                .addTempImage(visual)
                .build();
    }

    /** 透明底 + 实心方块（偏心，便于看出位移） */
    private static BufferedImage probeImage(Color color, int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        try {
            g.setColor(color);
            g.fillRect(60, 40, width - 160, height - 120);
        } finally {
            g.dispose();
        }
        return image;
    }
}
