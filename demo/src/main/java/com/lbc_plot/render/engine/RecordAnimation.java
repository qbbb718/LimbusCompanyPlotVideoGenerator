package com.lbc_plot.render.engine;

import java.util.List;

import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.video.Camera;
import com.lbc_plot.render.video.CharacterVisual;
import com.lbc_plot.render.video.TempImageVisual;
import com.lbc_plot.render.video.anim.AnimationClip;
import com.lbc_plot.render.video.anim.LoopMode;
import com.lbc_plot.render.video.anim.SequenceTiming;
import com.lbc_plot.render.video.anim.SpriteAnimation;
import com.lbc_plot.render.video.anim.SpriteAnimator;
import com.lbc_plot.render.video.anim.TransformState;

/**
 * @module 立绘动画渲染接入
 * 把「记录里挂着的动画」翻译成渲染层需要的东西：某个元素在某帧的变换、整条记录是否有人会动、
 * 以及一帧场景的"动画签名"（用于判断能不能复用上一帧）。
 *
 * <h2>为什么它不在 anim 包里</h2>
 * {@code com.lbc_plot.render.video.anim} 是纯数学内核，只认 {@link SpriteAnimation}，
 * **不认识 Record / CharacterVisual**——这样它才能被两端对拍、被随意单测。
 * "记录 → 动画"这层翻译属于渲染管线，放在这里。
 *
 * <h2>锚点默认值</h2>
 * 立绘缺省锚点在**脚底**（0.5, 1）：弹跳从地面起、摇摆绕重心，观感才对；
 * 临时图片（道具/路人）缺省在**中心**（0.5, 0.5）：它们通常是被"整体拎起来晃"。
 */
public final class RecordAnimation {

    /** 立绘缺省锚点：底部中心（脚底） */
    public static final double CHARACTER_ANCHOR_X = 0.5d;
    public static final double CHARACTER_ANCHOR_Y = 1.0d;

    /** 临时图片缺省锚点：中心 */
    public static final double TEMP_IMAGE_ANCHOR_X = 0.5d;
    public static final double TEMP_IMAGE_ANCHOR_Y = 0.5d;

    private RecordAnimation() {
    }

    /** 取某立绘在某帧的变换（无动画/不会动 → 恒等） */
    public static TransformState transformOf(CharacterVisual character, int frameIndex) {
        if (character == null) {
            return TransformState.identity();
        }
        return SpriteAnimator.evaluate(character.getAnim(), frameIndex);
    }

    /** 取某临时图片在某帧的变换（无动画/不会动 → 恒等） */
    public static TransformState transformOf(TempImageVisual tempImage, int frameIndex) {
        if (tempImage == null) {
            return TransformState.identity();
        }
        return SpriteAnimator.evaluate(tempImage.getAnim(), frameIndex);
    }

    /**
     * 这条记录里是否有元素会动。
     *
     * <p>判定必须与 {@link #transformOf} 的实际效果一致，否则会出现两种反向事故：
     * 判重了 → 每帧都白重画（导出变慢）；判漏了 → 动画根本不动（用户以为功能坏了）。
     *
     * @param plot 人格故事模式（plot=false）**不渲染立绘**，所以立绘动画一律不算
     */
    public static boolean hasAnimatedSprites(Record record, boolean plot) {
        if (record == null) {
            return false;
        }
        if (plot) {
            List<CharacterVisual> characters = record.getCharacters();
            if (characters != null) {
                for (CharacterVisual character : characters) {
                    if (character == null) {
                        continue;
                    }
                    // 情绪动画（序列帧）也会让每帧画面不同，必须一起判进"逐帧重渲"。
                    // 漏了这一条 → 场景层整段只渲一次 → 动画在成片里**永远停在第 1 张图**
                    // （而编辑器预览里却在动，是最难查的一类不一致）。
                    if (character.isAnimated() || character.hasEmotionAnim()) {
                        return true;
                    }
                }
            }
        }
        List<TempImageVisual> tempImages = record.getTempImages();
        if (tempImages != null) {
            for (TempImageVisual tempImage : tempImages) {
                if (tempImage != null && tempImage.isAnimated()) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * 一帧场景的「动画签名」：同一条记录、同一个镜头、所有动画元素在同一帧的变换都相同时，
     * 签名相同，渲染结果必然相同。
     *
     * <p>导出时用它保住"定格复用"：弹跳播完（iterations 用完）之后的几百帧、`once` 动画结束后的
     * 尾巴，都不必重画。否则"有动画的记录每帧都重画"会让导出时间随记录长度线性膨胀。
     *
     * <p>精度取 3 位小数（0.001 世界像素）：远低于肉眼阈值，又能吃掉浮点噪声。
     *
     * @param camera 该帧实际使用的镜头（镜头也在动时，签名必须跟着变）
     */
    public static String sceneSignature(Record record, boolean plot, Camera camera, int frameIndex) {
        StringBuilder signature = new StringBuilder(128);
        if (camera != null) {
            signature.append(String.format("C:%.3f,%.3f,%.3f;",
                    camera.getCenterX(), camera.getCenterY(), camera.getZoom()));
        }
        if (plot) {
            List<CharacterVisual> characters = record.getCharacters();
            if (characters != null) {
                for (int i = 0; i < characters.size(); i++) {
                    CharacterVisual character = characters.get(i);
                    if (character == null) {
                        continue;
                    }
                    if (character.isAnimated()) {
                        appendTransform(signature, 'c', i, transformOf(character, frameIndex));
                    }
                    // 情绪动画：**帧号与透明度都要进签名**。
                    // 只按"有没有挂动画"判断会让复用逻辑把上一帧整段复制过去（动画冻住）；
                    // 只算帧号不算 alpha，淡入淡出那几帧的签名不变，也会被误复用。
                    if (character.hasEmotionAnim()) {
                        appendEmotionAnim(signature, i, character, frameIndex);
                    }
                }
            }
        }
        List<TempImageVisual> tempImages = record.getTempImages();
        if (tempImages != null) {
            for (int i = 0; i < tempImages.size(); i++) {
                TempImageVisual tempImage = tempImages.get(i);
                if (tempImage == null || !tempImage.isAnimated()) {
                    continue;
                }
                appendTransform(signature, 't', i, transformOf(tempImage, frameIndex));
            }
        }
        return signature.toString();
    }

    private static void appendTransform(StringBuilder signature, char kind, int index, TransformState state) {
        signature.append(kind).append(index).append(':')
                .append(String.format("%.3f,%.3f,%.4f,%.3f,%.3f;",
                        state.getX(), state.getY(), state.getScale(), state.getRotate(), state.getAlpha()));
    }

    /**
     * 情绪动画的签名分量：帧号 + 最终透明度。
     *
     * <p>精度与 {@link #appendTransform} 一致（alpha 取 4 位）：远低于肉眼阈值，又能吃掉浮点噪声。
     * 动画播完（{@code imageIndex == NO_FRAME}）之后签名会稳定下来，后面几百帧就能继续复用
     * ——这正是"加了序列帧以后导出没有变慢太多"的原因。
     */
    private static void appendEmotionAnim(StringBuilder signature, int index, CharacterVisual character,
            int frameIndex) {
        SequenceTiming.Sample sample = character.getEmotionAnim().sampleAt(frameIndex);
        signature.append('e').append(index).append(':')
                .append(sample.imageIndex()).append(',')
                .append(String.format("%.4f", sample.alpha())).append(';');
    }

    /**
     * 动画把记录"撑"到第几帧（0 = 没有动画参与时长计算）。
     *
     * <p>参与规则（与前端 {@code durationEndFrameOf} 一致，见 docs/立绘动画设计.md §2.1）：
     * <ul>
     *   <li>{@code once} / {@code hold} → {@code startFrame + durationFrames}；</li>
     *   <li>{@code loop} / {@code pingpong} 且 iterations 有限 → {@code start + duration × iterations}；</li>
     *   <li><b>无限循环不参与</b>：它的语义是"跟着记录一直播"，不该反过来定义记录长度
     *       （否则"加一个呼吸循环"会让每条记录都莫名变长）；</li>
     *   <li><b>显式 endFrame 不参与</b>：用户主动截断，意图明确。</li>
     * </ul>
     *
     * <p>可见性门禁：{@code plot=false}（人格故事）时不渲染立绘，所以**立绘动画一律不算**；
     * 临时图片两种模式都渲染，照常计入。这条必须与 {@link #hasAnimatedSprites} 保持一致，
     * 否则会出现"动画看不见但记录变长了"的幽灵时长。
     *
     * <p><b>情绪动画（序列帧）一律不参与时长</b>（产品决策）：素材可能长达几十秒，
     * 一旦让它撑长记录，用户导入一个循环背景动画就会把每条记录都拉长到几十秒。
     * 所以它播到记录结束就截断，绝不会反过来定义记录长度。改这条之前先想清楚：
     * 一旦参与，{@code hasAnimatedSprites} 也必须同步，否则"看不见却变长"会立刻复现。
     */
    public static int animationEndFrame(Record record, boolean plot) {
        if (record == null) {
            return 0;
        }
        int end = 0;
        if (plot) {
            List<CharacterVisual> characters = record.getCharacters();
            if (characters != null) {
                for (CharacterVisual character : characters) {
                    if (character != null) {
                        end = Math.max(end, animationEndFrameOf(character.getAnim()));
                    }
                }
            }
        }
        List<TempImageVisual> tempImages = record.getTempImages();
        if (tempImages != null) {
            for (TempImageVisual tempImage : tempImages) {
                if (tempImage != null) {
                    end = Math.max(end, animationEndFrameOf(tempImage.getAnim()));
                }
            }
        }
        return end;
    }

    /** 单个元素身上所有 clip 里"结束得最晚"的那一帧 */
    private static int animationEndFrameOf(SpriteAnimation anim) {
        if (anim == null || !anim.isEffectivelyEnabled() || anim.getClips() == null) {
            return 0;
        }
        int end = 0;
        for (AnimationClip clip : anim.getClips()) {
            if (clip == null || !clip.isEffectivelyEnabled()) {
                continue;
            }
            if (clip.getEndFrame() != null) {
                continue; // 用户主动截断：不参与
            }
            int duration = clip.getDurationFrames();
            if (duration <= 0) {
                continue;
            }
            int iterations = clip.getIterations() == null ? 0 : clip.getIterations();
            LoopMode mode = clip.loopMode();
            int length;
            if (mode == LoopMode.LOOP || mode == LoopMode.PINGPONG) {
                if (iterations <= 0) {
                    continue; // 无限循环：不参与
                }
                length = duration * iterations;
            } else {
                length = duration;
            }
            end = Math.max(end, Math.max(0, clip.getStartFrame()) + length);
        }
        return end;
    }
}
