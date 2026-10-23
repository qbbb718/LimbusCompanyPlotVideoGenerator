package com.lbc_plot.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.video.CharacterVisual;
import com.lbc_plot.render.video.TempImageVisual;
import com.lbc_plot.render.video.anim.AnimationClip;
import com.lbc_plot.render.video.anim.SpriteAnimation;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;

/**
 * 记录时长公式：{@code max(文字, 音频, 动画) + 结尾停留帧数}。
 *
 * <p>锁的是"动画能不能把记录撑长"这一组规则，其中最容易错的三个：
 * <ol>
 *   <li><b>无限循环不参与</b>——否则给角色加一个呼吸循环，每条记录都会莫名变长；</li>
 *   <li><b>plot=false 时立绘动画不参与</b>——人格故事模式根本不渲染立绘，
 *       若还计入时长就会得到"看不见的动画把片子撑长"的幽灵时长；</li>
 *   <li><b>临时图片不受 plot 影响</b>——它在两种模式下都渲染，所以照常计入。</li>
 * </ol>
 */
class RecordDurationCalculatorAnimationTest {

    private static final int FPS = 30;
    private static final int STAY = ProjectConfig.DEFAULT_STAY_FRAMES;

    /**
     * 空台词的实际文字帧数。
     *
     * <p>{@code Dialogue} 会把空文本替换成 {@code DEFAULT_TEXT = "..."}（3 个字符），
     * 所以"没写台词"的记录文字时长是 3 帧而不是 0——这也是旧行为，不是本次改动引入的。
     */
    private static final int EMPTY_DIALOGUE_FRAMES = 3;

    /** 没有任何动画时一条"空台词记录"的时长基线 */
    private static final int LEGACY_BASELINE = EMPTY_DIALOGUE_FRAMES + STAY;

    /* ==================== 动画参与时长 ==================== */

    @Test
    @DisplayName("once 动画把记录撑到 (start + duration) + 停留帧数")
    void onceAnimationExtendsDuration() {
        Record record = recordWithCharacterAnimation(clip("bounce", "once", 0, 120, null), true);
        assertEquals(120 + STAY, RecordDurationCalculator.calculateDurationFrames(record, FPS, true));
    }

    @Test
    @DisplayName("startFrame 会叠加在动画之前（延迟启动的动画也要完整播完）")
    void startFrameShiftsAnimationEnd() {
        Record record = recordWithCharacterAnimation(clip("bounce", "once", 30, 120, null), true);
        assertEquals(30 + 120 + STAY, RecordDurationCalculator.calculateDurationFrames(record, FPS, true));
    }

    @Test
    @DisplayName("有限次循环按 duration × iterations 计")
    void finiteLoopCountsIterations() {
        Record record = recordWithCharacterAnimation(clip("breathe", "loop", 0, 100, 3), true);
        assertEquals(300 + STAY, RecordDurationCalculator.calculateDurationFrames(record, FPS, true));
    }

    @Test
    @DisplayName("无限循环不参与（加一个呼吸循环不该让记录变长）")
    void infiniteLoopDoesNotExtendDuration() {
        Record record = recordWithCharacterAnimation(clip("breathe", "loop", 0, 600, null), true);
        assertEquals(LEGACY_BASELINE, RecordDurationCalculator.calculateDurationFrames(record, FPS, true));
    }

    @Test
    @DisplayName("显式 endFrame 的动画不参与（用户主动截断）")
    void explicitEndFrameDoesNotExtendDuration() {
        AnimationClip clip = clip("bounce", "once", 0, 300, null);
        clip.setEndFrame(20);
        Record record = recordWithCharacterAnimation(clip, true);
        assertEquals(LEGACY_BASELINE, RecordDurationCalculator.calculateDurationFrames(record, FPS, true));
    }

    @Test
    @DisplayName("台词更长时以台词为准（动画不会把记录缩短）")
    void longerDialogueWins() {
        String text = "一".repeat(200); // 速度 3 → 每帧 1 字符 → 200 帧
        Record record = recordWithCharacterAnimation(clip("bounce", "once", 0, 30, null), true, text);
        assertEquals(200 + STAY, RecordDurationCalculator.calculateDurationFrames(record, FPS, true));
    }

    /* ==================== plot 门禁 ==================== */

    @Test
    @DisplayName("plot=false 时立绘动画不参与时长（人格故事不渲染立绘）")
    void characterAnimationIgnoredInPersonalityMode() {
        Record record = recordWithCharacterAnimation(clip("bounce", "once", 0, 300, null), true);
        assertEquals(LEGACY_BASELINE, RecordDurationCalculator.calculateDurationFrames(record, FPS, false));
    }

    @Test
    @DisplayName("临时图片动画在两种模式下都参与（它在两种模式下都会被渲染）")
    void tempImageAnimationCountsInBothModes() {
        Record record = recordWithTempImageAnimation(clip("bounce", "once", 0, 150, null));
        assertEquals(150 + STAY, RecordDurationCalculator.calculateDurationFrames(record, FPS, false));
        assertEquals(150 + STAY, RecordDurationCalculator.calculateDurationFrames(record, FPS, true));
    }

    @Test
    @DisplayName("没有动画时行为与改造前完全一致（旧工程不受影响）")
    void noAnimationKeepsLegacyDuration() {
        Record record = plainRecord();
        assertEquals(LEGACY_BASELINE, RecordDurationCalculator.calculateDurationFrames(record, FPS, true));
        assertEquals(LEGACY_BASELINE, RecordDurationCalculator.calculateDurationFrames(record, FPS, false));
    }

    @Test
    @DisplayName("分项构成可查询（时间轴 UI 要告诉用户'为什么是 315 帧'）")
    void breakdownExposesComponents() {
        Record animated = recordWithCharacterAnimation(clip("bounce", "once", 0, 120, null), true);
        RecordDurationCalculator.DurationBreakdown breakdown =
                RecordDurationCalculator.breakdown(animated, FPS, true, 30);

        assertEquals(0, breakdown.audioFrames(), "没有音频指令");
        assertEquals(EMPTY_DIALOGUE_FRAMES, breakdown.textFrames(), "空台词被替换成 \"...\"");
        assertEquals(120, breakdown.animationFrames(), "动画把记录撑到 120 帧");
        assertEquals(30, breakdown.stayFrames());
        assertEquals(150, breakdown.totalFrames(), "max(3, 0, 120) + 30");
        // 分项之和必须与总数口径一致：总数 = max(...) + 停留
        assertEquals(breakdown.totalFrames(),
                RecordDurationCalculator.calculateDurationFrames(animated, FPS, true, 30));
    }

    @Test
    @DisplayName("结尾停留帧数随参数生效（工程级设置，不再是写死的 75）")
    void customStayFramesApplies() {
        Record record = plainRecord();
        assertEquals(3 + 30, RecordDurationCalculator.calculateDurationFrames(record, FPS, true, 30));
        assertEquals(3, RecordDurationCalculator.calculateDurationFrames(record, FPS, true, 0),
                "0 = 说完立刻切");
        assertEquals(3, RecordDurationCalculator.calculateDurationFrames(record, FPS, true, -50),
                "负数按 0 处理，不能把记录算成负长度");
        // 停留帧数变短时，动画仍然要播完（动画项参与 max，不被停留帧数削掉）
        Record animated = recordWithCharacterAnimation(clip("bounce", "once", 0, 120, null), true);
        assertEquals(120 + 30, RecordDurationCalculator.calculateDurationFrames(animated, FPS, true, 30));
    }

    /* ==================== 数据构造 ==================== */

    private static AnimationClip clip(String preset, String loop, int startFrame, int durationFrames,
            Integer iterations) {
        AnimationClip clip = new AnimationClip();
        clip.setId("c-" + preset);
        clip.setKind("preset");
        clip.setPreset(preset);
        clip.setStartFrame(startFrame);
        clip.setDurationFrames(durationFrames);
        clip.setLoop(loop);
        clip.setIterations(iterations);
        clip.setParams(Map.of("amplitude", 20, "periodFrames", 18, "iterations", 1));
        return clip;
    }

    private static SpriteAnimation animationOf(AnimationClip clip) {
        SpriteAnimation anim = new SpriteAnimation();
        anim.setVersion(1);
        anim.setTimebase(new SpriteAnimation.Timebase("frame", FPS));
        anim.setClips(List.of(clip));
        return anim;
    }

    private static Record plainRecord() {
        return new Record.Builder()
                .uuid("duration-plain")
                .dialogue(Dialogue.builder().text("").speakerName(Dialogue.DEFAULT_NARRATOR).build())
                .build();
    }

    private static Record recordWithCharacterAnimation(AnimationClip clip, boolean animated) {
        return recordWithCharacterAnimation(clip, animated, "");
    }

    private static Record recordWithCharacterAnimation(AnimationClip clip, boolean animated, String text) {
        try {
            MyCharacter character = MyCharacter.builder()
                    .characterID("c-duration")
                    .characterName("时长角色")
                    .height(171)
                    .faction("测试")
                    .build();
            Portrait portrait = Portrait.builder("")
                    .portraitID("p-duration")
                    .characterID("c-duration")
                    .imagePath("")
                    .portName("时长立绘")
                    .facePosition(0, 0)
                    .length(183)
                    .image(new BufferedImage(64, 64, BufferedImage.TYPE_INT_ARGB))
                    .build();

            CharacterVisual.Builder builder = CharacterVisual.builder(character, portrait).bright();
            if (animated) {
                builder.anim(animationOf(clip));
            }

            return new Record.Builder()
                    .uuid("duration-char")
                    .dialogue(Dialogue.builder().text(text).speakerName(Dialogue.DEFAULT_NARRATOR).build())
                    .addCharacter(builder.build())
                    .build();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static Record recordWithTempImageAnimation(AnimationClip clip) {
        TempImageVisual visual = new TempImageVisual.Builder()
                .uuid("temp-duration")
                .imagePath("")
                .scale(1.0f)
                .dim(false)
                .anim(animationOf(clip))
                .build();
        visual.setImage(probe());

        List<TempImageVisual> list = new ArrayList<>();
        list.add(visual);
        return new Record.Builder()
                .uuid("duration-temp")
                .dialogue(Dialogue.builder().text("").speakerName(Dialogue.DEFAULT_NARRATOR).build())
                .addTempImage(visual)
                .build();
    }

    private static BufferedImage probe() {
        BufferedImage image = new BufferedImage(32, 32, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.GREEN);
        g.fillRect(0, 0, 32, 32);
        g.dispose();
        return image;
    }
}
