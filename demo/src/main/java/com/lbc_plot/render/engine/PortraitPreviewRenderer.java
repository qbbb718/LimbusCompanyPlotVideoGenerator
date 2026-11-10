package com.lbc_plot.render.engine;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.video.BackgroundVisual;
import com.lbc_plot.render.video.CharacterVisual;
import com.lbc_plot.resource.model.Background;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;

/**
 * 立绘场景预览渲染器。
 *
 * <p>用于"资源管理 → 角色 → 编辑立绘"里的「预览」按钮：把当前裁剪参数下的立绘放进
 * 真实画面里，返回一张 <strong>背景 + 立绘 + 边框 + 界面 UI</strong> 的 PNG。
 *
 * <p>这里刻意复用 {@link RenderOfImage#renderPreExceptDialogue(Record, boolean, int, int)}：
 * 它渲染的正是视频静态帧（不含台词逐字动画），其中 UI 层只有对话框、说话人名片、地点牌。
 * 我们用一个<strong>旁白</strong>对话来构造 Record，于是：
 * <ul>
 *   <li>不说话人 → 不生成角色名片；</li>
 *   <li>不渲染对话文字（renderPreExceptDialogue 本来就不画文字）；</li>
 *   <li>地点牌仍然渲染，文字取背景名，方便确认当前预览的是哪张背景。</li>
 * </ul>
 * 立绘的缩放/位置完全沿用 {@link CharacterVisual#updatePos()}（按角色身高 + 裁剪框），
 * 与最终视频里的构图一致，不在前端另写一套坐标换算。
 *
 * <h2>对比角色</h2>
 * 裁剪得对不对，单看一张立绘很难判断。调用方可以通过 {@link ComparePortrait} 再塞几个
 * "参考角色"进来，它们走<b>同一套</b>身高 + 裁剪框规则，按各自的水平偏移站在当前立绘两侧。
 * 于是头部方框（恒为 {@code 183 × 用户缩放}）在画面里对齐，头大了 / 小了、站位高了 / 低了
 * 一眼就能看出来。对比角色画在当前立绘<b>下层</b>，不会把正在调整的那张盖住。
 */
public final class PortraitPreviewRenderer {

    private static final Logger logger = LoggerFactory.getLogger(PortraitPreviewRenderer.class);

    /**
     * 对比角色的上限。
     *
     * <p>前端目前只发"左 / 右各一个"（2 个），这里留一点余量给以后的布局，
     * 同时挡住异常请求把几十个角色一起塞进一张预览图。
     */
    public static final int MAX_COMPARE_PORTRAITS = 4;

    /**
     * 一个对比角色：要在预览里额外画出的另一张立绘。
     *
     * @param character 角色（提供身高，决定纵向落点）
     * @param portrait  立绘（提供裁剪框与已解码的图像）
     * @param offsetX   水平偏移（1080p 设计画布像素，正数向右）。
     *                  它叠加在 {@code portrait.adjX} 之上，与 {@link CharacterVisual#setAdjX(int)} 同义。
     */
    public record ComparePortrait(MyCharacter character, Portrait portrait, int offsetX) {
    }

    /**
     * 不可见的占位文本。
     *
     * <p>{@link Dialogue} 会把空 location 归一成 {@code "default"}，而 UI 渲染只判断
     * "是否为空串"就画地点文字，所以没有背景名时用零宽空格占位，避免地点牌上出现
     * "default" 这种内部占位值。
     */
    private static final String INVISIBLE_TEXT = "\u200B";

    private PortraitPreviewRenderer() {
    }

    /**
     * 渲染立绘场景预览图。
     *
     * @param portraitImage    立绘画布（调用方负责解码，已包含透明通道）
     * @param faceX            裁剪框左上角 X（原图像素）
     * @param faceY            裁剪框左上角 Y（原图像素）
     * @param length           裁剪框边长（原图像素）；≤0 时使用默认头长
     * @param adjX             立绘手动偏移 X（设计画布像素）
     * @param adjY             立绘手动偏移 Y（设计画布像素）
     * @param characterHeight  角色身高（cm），决定立绘的纵向落点
     * @param background       背景资源（需已能加载出图像）
     * @param locationText     地点牌文字，通常传背景名；为空时地点牌不显示文字
     * @param width            输出宽度
     * @param height           输出高度
     * @return 渲染好的预览图
     * @throws IOException 图像读取/渲染失败
     */
    public static BufferedImage render(
            BufferedImage portraitImage,
            int faceX,
            int faceY,
            int length,
            int adjX,
            int adjY,
            int characterHeight,
            Background background,
            String locationText,
            int width,
            int height) throws IOException {
        return render(portraitImage, faceX, faceY, length, adjX, adjY, characterHeight,
                background, locationText, width, height, List.of());
    }

    /**
     * 渲染立绘场景预览图，并额外画出若干对比角色。
     *
     * @param comparePortraits 对比角色（可为 null / 空）；按列表顺序从左到右画在当前立绘<b>下层</b>，
     *                         偏移与裁剪规则见 {@link ComparePortrait}
     * @see #render(BufferedImage, int, int, int, int, int, int, Background, String, int, int)
     */
    public static BufferedImage render(
            BufferedImage portraitImage,
            int faceX,
            int faceY,
            int length,
            int adjX,
            int adjY,
            int characterHeight,
            Background background,
            String locationText,
            int width,
            int height,
            List<ComparePortrait> comparePortraits) throws IOException {

        if (portraitImage == null) {
            throw new IllegalArgumentException("立绘图片为空，无法生成预览");
        }
        if (background == null) {
            throw new IllegalArgumentException("背景为空，无法生成预览");
        }
        if (background.getImage() == null) {
            throw new IllegalArgumentException("背景图片加载失败: " + background.getName());
        }

        // 角色只用于身高/姓名等基础信息；名片在预览里不生成，所以颜色/阵营不影响结果。
        int safeHeight = characterHeight > 0 ? characterHeight : ProjectConfig.DEFAULT_CHARACTER_HEIGHT;
        MyCharacter character = MyCharacter.builder()
                .characterID("portrait-preview")
                .characterName("立绘预览")
                .height(safeHeight)
                .build();

        // 用裁剪参数构造一个临时 Portrait。imagePath 传空串：避免 Portrait.Builder
        // 在 build() 时尝试从磁盘加载一个并不存在的图片（真正图像由 image() 注入）。
        int safeLength = length > 0 ? length : ProjectConfig.DEFAULT_CHARACTER_HEAD_LENGTH;
        Portrait portrait = Portrait.builder("")
                .portraitID("portrait-preview")
                .characterID(character.getCharacterID())
                .faceX(Math.max(0, faceX))
                .faceY(Math.max(0, faceY))
                .length(safeLength)
                .adjX(adjX)
                .adjY(adjY)
                .image(portraitImage)
                .build();

        // 预览一律不压暗：用户要看的是立绘本身的颜色与效果。
        CharacterVisual characterVisual = CharacterVisual.builder(character, portrait)
                .bright()
                .build();

        BackgroundVisual backgroundVisual = new BackgroundVisual(background);

        String location = (locationText == null || locationText.isBlank())
                ? INVISIBLE_TEXT
                : locationText.trim();
        Dialogue dialogue = Dialogue.builder()
                .speakerName(Dialogue.DEFAULT_NARRATOR)
                .location(location)
                .build();

        // 列表顺序 = 绘制顺序的反序：renderCharacters 从末尾往前画，所以第一个元素在最上层。
        // 当前立绘必须排第一，才能盖住对比角色（对比角色只是参考，不能反过来挡住被调的那张）。
        List<CharacterVisual> visuals = new ArrayList<>();
        visuals.add(characterVisual);
        appendCompareVisuals(visuals, comparePortraits);

        Record.Builder recordBuilder = new Record.Builder()
                .uuid("portrait-preview")
                .dialogue(dialogue)
                .addBackground(backgroundVisual);
        visuals.forEach(recordBuilder::addCharacter);
        Record record = recordBuilder.build();

        // plot=true：立绘要参与渲染（renderPreExceptDialogue 仅在 plot 时画角色），
        // 同时保留剧情模式的黑边/地点牌，与最终视频的画面样式一致。
        return RenderOfImage.renderPreExceptDialogue(record, true, width, height);
    }

    /**
     * 把对比角色转成 {@link CharacterVisual} 追加到列表末尾（= 画在当前立绘下层）。
     *
     * <p>数据不完整的条目（没有角色 / 立绘 / 图像）只记一条警告就跳过：
     * 一张对比图坏掉不应该让用户连自己的裁剪都预览不了。
     */
    private static void appendCompareVisuals(List<CharacterVisual> visuals, List<ComparePortrait> comparePortraits)
            throws IOException {
        if (comparePortraits == null || comparePortraits.isEmpty()) {
            return;
        }

        int accepted = 0;
        for (ComparePortrait compare : comparePortraits) {
            if (accepted >= MAX_COMPARE_PORTRAITS) {
                logger.warn("对比角色超过上限 {} 个，多余的已忽略", MAX_COMPARE_PORTRAITS);
                break;
            }
            if (compare == null || compare.character() == null || compare.portrait() == null) {
                logger.warn("跳过数据不完整的对比角色: {}", compare);
                continue;
            }
            if (compare.portrait().getImage() == null) {
                logger.warn("跳过没有图像的对比立绘: 角色={}, 立绘={}",
                        compare.character().getCharacterName(), compare.portrait().getPortName());
                continue;
            }

            int offsetX = Math.max(-ProjectConfig.VIDEO_WIDTH,
                    Math.min(ProjectConfig.VIDEO_WIDTH, compare.offsetX()));
            CharacterVisual compareVisual = CharacterVisual.builder(compare.character(), compare.portrait())
                    .adjX(offsetX)
                    .bright()
                    .build();
            visuals.add(compareVisual);
            accepted++;
        }
    }
}
