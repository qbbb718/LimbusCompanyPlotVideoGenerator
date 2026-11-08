package com.lbc_plot.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
import com.lbc_plot.render.engine.RecordAnimation;
import com.lbc_plot.render.video.CharacterVisual;
import com.lbc_plot.render.video.anim.AnimationClip;
import com.lbc_plot.render.video.anim.EmotionAnim;
import com.lbc_plot.render.video.anim.Keyframe;
import com.lbc_plot.render.video.anim.KeyframeValue;
import com.lbc_plot.render.video.anim.SpriteAnimation;
import com.lbc_plot.render.video.emotion.AnimationClipStore;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;

/**
 * 情绪动画与**记录时长**的关系：一律不参与。
 *
 * <p>这是一条产品决策（不是技术限制），所以要用测试钉住，免得后来人"顺手把它接入时长公式"：
 * 序列帧素材可能是几十秒的循环特效，一旦让它撑长记录，用户导入一个循环动画就会把每条记录
 * 拉到几十秒，整条视频全毁。它播到记录结束就截断。
 *
 * <p>同时锁住"它必须被算进逐帧重渲"（{@link RecordAnimation#hasAnimatedSprites}）——
 * 这条与时长是**相反**的：漏了时长只是变短，漏了这条是动画在成片里根本不动。
 */
class EmotionAnimDurationTest {

    /** 空台词会被替换成 "..."（3 字符）→ 文字时长 3 帧，与既有测试的基线一致 */
    private static final int TEXT_FRAMES = 3;
    private static final int STAY = 75;
    private static final int LEGACY_BASELINE = TEXT_FRAMES + STAY;

    @TempDir
    Path tempRoot;

    @BeforeEach
    void useTempRoot() {
        AnimationClipStore.setRootForTesting(tempRoot);
    }

    @AfterEach
    void restoreRoot() {
        AnimationClipStore.setRootForTesting(null);
    }

    @Test
    @DisplayName("超长情绪动画完全不改变记录时长")
    void emotionAnimNeverExtendsDuration() throws Exception {
        Record plain = recordWith(null, null);
        Record withEmotion = recordWith(emotionAnim(300), null);

        assertEquals(LEGACY_BASELINE, frames(plain), "基线不变");
        assertEquals(frames(plain), frames(withEmotion),
                "300 帧的情绪动画不能让记录变长（否则循环特效会把整条视频拉爆）");
    }

    @Test
    @DisplayName("原有 clip 动画仍然参与时长（这条规则没有被情绪动画改坏）")
    void transformAnimationStillExtendsDuration() throws Exception {
        Record withClip = recordWith(null, longKeyframeAnimation(200));
        assertEquals(200 + STAY, frames(withClip),
                "立绘移动动画的规则必须保持原样：动画把记录撑到 200 帧 + 停留");
    }

    @Test
    @DisplayName("两者同时存在时，只有 clip 动画参与时长")
    void bothTogetherOnlyClipCounts() throws Exception {
        Record both = recordWith(emotionAnim(300), longKeyframeAnimation(120));
        assertEquals(120 + STAY, frames(both));
    }

    @Test
    @DisplayName("情绪动画必须被算进「逐帧重渲」，否则成片里它根本不会动")
    void emotionAnimCountsAsAnimatedSprite() throws Exception {
        Record withEmotion = recordWith(emotionAnim(5), null);
        assertTrue(RecordAnimation.hasAnimatedSprites(withEmotion, true),
                "挂了序列帧就必须逐帧重画场景，否则整段只渲一次、动画冻在第 1 张图");
        assertFalse(RecordAnimation.hasAnimatedSprites(recordWith(null, null), true));
    }

    @Test
    @DisplayName("人格故事模式（plot=false）不渲染立绘，情绪动画也不该让场景逐帧重画")
    void plotFalseDoesNotCountEmotionAnim() throws Exception {
        Record withEmotion = recordWith(emotionAnim(5), null);
        assertFalse(RecordAnimation.hasAnimatedSprites(withEmotion, false),
                "plot=false 时立绘不渲染，情绪动画跟着看不见，没必要逐帧重画");
    }

    /* ==================== 工具 ==================== */

    private static int frames(Record record) {
        return RecordDurationCalculator.calculateDurationFrames(record, 30, true, STAY);
    }

    private EmotionAnim emotionAnim(int totalFrames) {
        EmotionAnim emo = new EmotionAnim();
        emo.setClipId("dur_clip");
        emo.setName("时长测试");
        emo.setCanvasWidth(100);
        emo.setCanvasHeight(100);
        List<Integer> holds = new ArrayList<>();
        for (int i = 0; i < totalFrames; i++) {
            holds.add(1);
        }
        emo.setFrameHolds(holds);
        emo.setLoop("once");
        return emo;
    }

    private static SpriteAnimation longKeyframeAnimation(int durationFrames) {
        KeyframeValue value = new KeyframeValue();
        value.setY(-30d);
        AnimationClip clip = new AnimationClip();
        clip.setId("long");
        clip.setKind("keyframes");
        clip.setDurationFrames(durationFrames);
        clip.setLoop("once");
        clip.setChannels(List.of("y"));
        clip.setKeys(List.of(new Keyframe(0, value)));

        SpriteAnimation anim = new SpriteAnimation();
        anim.setVersion(1);
        anim.setClips(new ArrayList<>(List.of(clip)));
        return anim;
    }

    private static Record recordWith(EmotionAnim emo, SpriteAnimation anim) throws Exception {
        MyCharacter character = MyCharacter.builder()
                .characterID("c-dur")
                .characterName("时长角色")
                .height(171)
                .faction("测试")
                .build();
        BufferedImage image = new BufferedImage(200, 200, BufferedImage.TYPE_INT_ARGB);
        Portrait portrait = Portrait.builder("")
                .portraitID("p-dur")
                .characterID("c-dur")
                .imagePath("")
                .portName("时长立绘")
                .facePosition(0, 0)
                .length(183)
                .image(image)
                .build();

        CharacterVisual.Builder builder = CharacterVisual.builder(character, portrait).bright();
        if (anim != null) {
            builder.anim(anim);
        }
        if (emo != null) {
            builder.emotionAnim(emo);
        }

        return new Record.Builder()
                .uuid("dur-record")
                .dialogue(Dialogue.builder().text("").speakerName(Dialogue.DEFAULT_NARRATOR).build())
                .addCharacter(builder.build())
                .build();
    }
}
