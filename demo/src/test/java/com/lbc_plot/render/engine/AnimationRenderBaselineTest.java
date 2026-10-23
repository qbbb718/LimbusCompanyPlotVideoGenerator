package com.lbc_plot.render.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.video.BackgroundVisual;
import com.lbc_plot.render.video.CharacterVisual;
import com.lbc_plot.render.video.TempImageVisual;
import com.lbc_plot.render.video.anim.AnimationClip;
import com.lbc_plot.render.video.anim.SpriteAnimation;
import com.lbc_plot.resource.model.Background;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;

/**
 * 立绘动画改造的**像素基线**。
 *
 * <p>为什么需要它：本次改造要往渲染管线里插一条"仿射绘制 + 逐帧重画"的新路径。
 * 新路径最危险的失败不是"动画不好看"，而是"<b>没配动画的记录画面被改了一个像素</b>"——
 * 那意味着所有历史工程重新导出的成片都会变。这条基线就是那个的哨兵。
 *
 * <h2>两类断言</h2>
 * <ol>
 *   <li><b>绝对基线</b>：渲染结果与 {@code src/test/resources/animation-render-baseline.properties}
 *       里的 SHA-256 完全一致。它属于"整幅画面"级别的回归，任何意外改动都会红。</li>
 *   <li><b>相对基线</b>：{@code anim = null} 与 {@code anim.enabled = false} 必须逐像素一致
 *       （用户把动画关掉后画面必须回到原样）。这类断言不需要基线文件，换机器也成立。</li>
 * </ol>
 *
 * <h2>重新生成基线</h2>
 * <pre>mvn test -Dtest=AnimationRenderBaselineTest -Danim.baseline.update=true</pre>
 * 生成后**必须 review 基线文件的 diff**——如果不是有意改变渲染结果，说明改坏了。
 *
 * <p>注意：绝对基线绑定当前 JDK（本仓库是 21）与仓库内的字体/UI 素材。
 * 升级 JDK 大版本或替换 UI 素材后，重建基线属于正常操作。
 */
class AnimationRenderBaselineTest {

    private static final int OUT_W = 640;
    private static final int OUT_H = 360;

    private static final Path BASELINE_FILE = Path.of("src/test/resources/animation-render-baseline.properties");

    /** 重新生成基线的开关（正常跑测试时不要加） */
    private static final String UPDATE_FLAG = "anim.baseline.update";

    /* ==================== 测试 ==================== */

    @Test
    @DisplayName("仅立绘层：没有动画时与基线逐像素一致")
    void charactersOnlyMatchesBaseline() throws Exception {
        Record record = syntheticRecord(null);
        assertBaseline("characters.only", sha256(RenderOfImage.renderCharactersOnly(record, OUT_W, OUT_H)));
    }

    @Test
    @DisplayName("场景层（背景+立绘+临时图片+暗角，不含台词）：与基线逐像素一致")
    void sceneWithoutDialogueMatchesBaseline() throws Exception {
        Record record = syntheticRecord(null);
        assertBaseline("scene.noDialogue",
                sha256(RenderOfImage.renderPreExceptDialogue(record, true, OUT_W, OUT_H)));
    }

    @Test
    @DisplayName("完整预览图（含台词）：与基线逐像素一致")
    void fullPreviewMatchesBaseline() throws Exception {
        Record record = syntheticRecord(null);
        assertBaseline("preview.full", sha256(RenderOfImage.renderPre(record, true, OUT_W, OUT_H)));
    }

    @Test
    @DisplayName("anim = null 与 anim.enabled = false 必须逐像素一致（关掉动画就是回到原样）")
    void nullAnimEqualsDisabledAnim() throws Exception {
        BufferedImage withoutField = RenderOfImage.renderPre(syntheticRecord(null), true, OUT_W, OUT_H);
        BufferedImage disabled = RenderOfImage.renderPre(syntheticRecord(disabledAnimation()), true, OUT_W, OUT_H);
        assertEquals(sha256(withoutField), sha256(disabled),
                "anim.enabled=false 时渲染结果必须与完全没有 anim 时逐像素相同");
    }

    @Test
    @DisplayName("基线自身仍然满足帧不变量（防止'重建基线时顺手把画面渲成空白'）")
    void baselineStillLooksLikeAFrame() throws Exception {
        BufferedImage image = RenderOfImage.renderPre(syntheticRecord(null), true, OUT_W, OUT_H);
        assertNotNull(image);
        assertEquals(0xFF000000, image.getRGB(0, 0), "四角必须是纯黑边");
        assertEquals(0xFF000000, image.getRGB(OUT_W - 1, OUT_H - 1), "四角必须是纯黑边");
        int center = image.getRGB(OUT_W / 2, OUT_H / 2);
        assertEquals(0xFF, center >>> 24, "中心必须不透明");
        assertNotEquals(0xFF000000, center, "中心不能是纯黑：说明场景没画上去");
    }

    /* ==================== 合成数据（不读盘，保证基线不受素材变更影响） ==================== */

    /**
     * 造一条会用到"背景 + 两个立绘 + 临时图片 + 台词"的记录。
     *
     * <p>刻意用合成图案而不是仓库里的真实立绘：真实素材一改（换图、换裁剪），基线就会红，
     * 而那种红是噪音。合成图案只随**代码**变化而变化。
     *
     * @param anim 给第一个立绘挂的动画；null = 完全不写 anim 字段（模拟旧工程）
     */
    private static Record syntheticRecord(SpriteAnimation anim) throws Exception {
        Record.Builder builder = new Record.Builder()
                .uuid("anim-baseline")
                .dialogue(Dialogue.builder()
                        .text("基线台词：用于验证立绘动画改造前后的渲染结果逐像素一致。")
                        .speakerName(Dialogue.DEFAULT_NARRATOR)
                        .build())
                .addBackground(backgroundVisual())
                .addCharacter(character("c-left", "左角色", 171, -320, 0, Color.RED, anim))
                .addCharacter(character("c-right", "右角色", 160, 320, 0, Color.BLUE, null))
                .addTempImage(tempImageVisual());
        return builder.build();
    }

    private static BackgroundVisual backgroundVisual() {
        BufferedImage image = new BufferedImage(1920, 1080, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        try {
            g.setColor(new Color(0x20, 0x30, 0x40));
            g.fillRect(0, 0, 1920, 1080);
            for (int i = 0; i < 8; i++) {
                g.setColor(new Color(0x40 + i * 16, 0x50 + i * 8, 0x60 + i * 4));
                g.fillRect(i * 240, 0, 120, 1080);
            }
            g.setColor(Color.WHITE);
            g.fillRect(900, 480, 120, 120);
        } finally {
            g.dispose();
        }
        BackgroundVisual visual = new BackgroundVisual();
        visual.setBackground(new Background("baseline-bg.png", "基线背景"));
        visual.setBgImage(image);
        visual.setScale(1f);
        visual.setPosX(0);
        visual.setPosY(0);
        return visual;
    }

    /** 透明底 + 一个偏心的实心方块：任何位移/缩放/旋转都会让它落到不同的像素上 */
    private static CharacterVisual character(String id, String name, int height, int adjX, int adjY,
            Color color, SpriteAnimation anim) throws Exception {
        MyCharacter character = MyCharacter.builder()
                .characterID(id)
                .characterName(name)
                .height(height)
                .faction("基线")
                .build();
        Portrait portrait = Portrait.builder("")
                .portraitID("p-" + id)
                .characterID(id)
                .imagePath("")
                .portName(name + "立绘")
                .facePosition(0, 0)
                .length(183)
                .image(portraitProbe(color))
                .build();

        CharacterVisual.Builder builder = CharacterVisual.builder(character, portrait)
                .adjustment(adjX, adjY)
                .scale(1.0f)
                .bright();
        if (anim != null) {
            builder.anim(anim);
        }
        return builder.build();
    }

    private static BufferedImage portraitProbe(Color color) {
        BufferedImage image = new BufferedImage(400, 400, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        try {
            g.setColor(color);
            // 不居中：让"绕锚点旋转/缩放"的错误立刻反映到像素上
            g.fillRect(120, 60, 80, 120);
            g.setColor(new Color(255, 255, 255, 200));
            g.fillRect(200, 240, 24, 24);
        } finally {
            g.dispose();
        }
        return image;
    }

    private static TempImageVisual tempImageVisual() {
        BufferedImage image = new BufferedImage(200, 200, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        try {
            g.setColor(new Color(0x30, 0xC0, 0x70));
            g.fillRect(20, 20, 120, 120);
        } finally {
            g.dispose();
        }
        TempImageVisual visual = new TempImageVisual.Builder()
                .uuid("temp-baseline")
                .imagePath("")
                .posX(520)
                .posY(40)
                .scale(1.0f)
                .dim(false)
                .build();
        visual.setImage(image);
        return visual;
    }

    /** 一条"有数据但被关掉"的动画：用来验证关掉之后画面必须回到原样 */
    private static SpriteAnimation disabledAnimation() {
        AnimationClip clip = new AnimationClip();
        clip.setId("disabled-bounce");
        clip.setKind("preset");
        clip.setPreset("bounce");
        clip.setDurationFrames(60);
        clip.setLoop("loop");

        SpriteAnimation anim = new SpriteAnimation();
        anim.setVersion(1);
        anim.setTimebase(new SpriteAnimation.Timebase("frame", 30));
        anim.setEnabled(false);
        anim.setClips(List.of(clip));
        return anim;
    }

    /* ==================== 基线读写 ==================== */

    private static void assertBaseline(String key, String actualHash) throws Exception {
        Map<String, String> baseline = readBaseline();
        String expected = baseline.get(key);

        if (Boolean.getBoolean(UPDATE_FLAG) || expected == null) {
            baseline.put(key, actualHash);
            writeBaseline(baseline);
            System.out.println("[baseline] 写入 " + key + " = " + actualHash);
            return;
        }

        assertEquals(expected, actualHash,
                "渲染结果与像素基线不一致（key=" + key + "）。\n"
                        + "  若这是**有意**改变渲染结果：mvn test -Dtest=AnimationRenderBaselineTest "
                        + "-Danim.baseline.update=true 后 review 基线 diff。\n"
                        + "  否则说明这次改动把'没配动画的记录'也画变了 —— 那是必须修掉的回归。");
    }

    private static Map<String, String> readBaseline() throws Exception {
        Map<String, String> map = new LinkedHashMap<>();
        if (!Files.exists(BASELINE_FILE)) {
            return map;
        }
        Properties properties = new Properties();
        try (var reader = Files.newBufferedReader(BASELINE_FILE, StandardCharsets.UTF_8)) {
            properties.load(reader);
        }
        for (String name : properties.stringPropertyNames()) {
            map.put(name, properties.getProperty(name));
        }
        return map;
    }

    private static void writeBaseline(Map<String, String> baseline) throws Exception {
        StringBuilder text = new StringBuilder();
        text.append("# 立绘动画改造的像素基线（SHA-256），由 AnimationRenderBaselineTest 生成/校验\n");
        text.append("# 重建：mvn test -Dtest=AnimationRenderBaselineTest -Danim.baseline.update=true\n");
        for (Map.Entry<String, String> entry : baseline.entrySet()) {
            text.append(entry.getKey()).append('=').append(entry.getValue()).append('\n');
        }
        Files.writeString(BASELINE_FILE, text.toString(), StandardCharsets.UTF_8);
    }

    /** 整幅画面的 SHA-256（宽高 + 逐像素 ARGB），与平台无关的比较基准 */
    private static String sha256(BufferedImage image) throws Exception {
        assertNotNull(image);
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        ByteBuffer header = ByteBuffer.allocate(8);
        header.putInt(image.getWidth());
        header.putInt(image.getHeight());
        digest.update(header.array());

        int width = image.getWidth();
        int height = image.getHeight();
        ByteBuffer row = ByteBuffer.allocate(width * 4);
        for (int y = 0; y < height; y++) {
            row.clear();
            for (int x = 0; x < width; x++) {
                row.putInt(image.getRGB(x, y));
            }
            digest.update(row.array());
        }
        return HexFormat.of().formatHex(digest.digest());
    }
}
