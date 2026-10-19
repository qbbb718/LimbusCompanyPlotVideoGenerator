package com.lbc_plot.render.video;

import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.IOException;

import org.bytedeco.ffmpeg.global.postproc;
import org.jdbi.v3.core.collector.ElementTypeNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.render.engine.RenderOfImage;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;
import com.lbc_plot.resource.service.CharacterService;

import java.awt.AlphaComposite;

/**
 * 角色立绘可视化类
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonDeserialize(builder = CharacterVisual.Builder.class)
public class CharacterVisual extends VisualElement {
    private static final Logger logger = LoggerFactory.getLogger(CharacterVisual.class);

    // 所属角色，读取一些信息用
    private CharacterRef chara;
    private Portrait portrait;
    @JsonIgnore
    private transient MyCharacter charaCache; // 运行时缓存
    // 图像
    @JsonIgnore
    private BufferedImage image;
    // 立绘坐标，从角色读取计算
    private int posX;
    private int posY;
    // 用户手动调整偏差
    private int adjX;
    private int adjY;
    /**
     * 用户手动缩放（1.0 = 不缩放）。
     *
     * <p>它乘在「由裁剪框推导出的立绘缩放」之上：裁剪决定立绘的基础大小，
     * 这个字段让用户在剧情编辑里再整体放大 / 缩小，互不改写对方的语义。
     */
    private float scale;
    // 是否压暗，默认true；说话人false
    private boolean dim;
    @JsonIgnore
    private BufferedImage color_Name_Image; // 人设界面预览用，然后可以直接用到剧情渲染里

    // 默认值
    private static final int DEFAULT_POS_X = 0;
    private static final int DEFAULT_POS_Y = 0;
    private static final int DEFAULT_ADJ_X = 0;
    private static final int DEFAULT_ADJ_Y = 0;
    private static final float DEFAULT_SCALE = 1.0f;
    private static final boolean DEFAULT_DIM = true;
    /** 用户缩放的取值范围：与前端滑杆（0.1 ~ 3.0）一致，同时防止异常 JSON 把内存撑爆 */
    private static final float MIN_USER_SCALE = 0.1f;
    private static final float MAX_USER_SCALE = 3.0f;

    /**
     * 计算立绘缩放比例（由裁剪框推导，与 RenderOfImage.renderSingleCharacter 保持一致）
     */
    private float portraitScale() {
        if (portrait == null || portrait.getLength() <= 0) {
            return 1.0f;
        }
        return (float) ProjectConfig.DEFAULT_CHARACTER_HEAD_LENGTH / portrait.getLength();
    }

    /**
     * 用户缩放归一化：缺省 / 非法 / 越界值都收敛到 [0.1, 3.0]。
     * 旧记录没有 scale 字段时 Jackson 用默认值 1.0，行为与加缩放功能之前完全一致。
     */
    private float userScale() {
        if (!Float.isFinite(scale) || scale <= 0) {
            return DEFAULT_SCALE;
        }
        return Math.min(MAX_USER_SCALE, Math.max(MIN_USER_SCALE, scale));
    }

    /**
     * 渲染最终使用的缩放 = 裁剪缩放 × 用户缩放。
     * 渲染器必须用这个值，不能再用 {@link #portraitScale()}，否则预览里放大、成片里没放大。
     */
    @JsonIgnore
    public float getRenderScale() {
        return portraitScale() * userScale();
    }

    /**
     * 从角色读取立绘坐标, 角色身高与单张立绘偏差值
     *
     * 定位以「缩略图裁剪方框」为基准：该方框是 (faceX, faceY, length, length) 的正方形。
     * 身高决定的是该方框「上边缘」应落的纵向位置（由 1080p 实测标定，见 ProjectConfig），
     * 而 posX / posY 是缩放后立绘的左上角，因此必须把方框上边缘在缩放后图中的偏移减掉，
     * 而不能把图片上边缘直接对齐过去：
     * 立绘中高于裁剪方框的部分（帽子、举起的武器、飘发等，即 faceY > 0）会让图片上边缘
     * 与方框上边缘不一致，直接对齐图片上边缘就会整体偏移。
     *
     * 用户缩放（{@link #scale}）以缩放前「裁剪方框的中心」为基准：
     * scale = 1 时公式退化成原来的定位（旧记录构图逐像素不变），
     * 放大 / 缩小时脸框中心停留在原处，角色围绕脸部伸缩，不会一边缩放一边往右下角跑。
     */
    public void updatePos() {
        if (chara == null || portrait == null) {
            posX = 0;
            posY = 0;
            return;
        }

        final float baseScale = portraitScale();
        final float renderScale = getRenderScale();
        final float halfLength = portrait.getLength() / 2f;

        // 方框上边缘在视频中的目标位置：X 为画面中心，Y 由角色身高决定
        final int anchorX = ProjectConfig.VIDEO_WIDTH / 2 + portrait.getAdjX() + adjX;
        final int anchorY = ProjectConfig.DEFAULT_CHARACTER_HEIGHT_Pixels
                + (int) ((ProjectConfig.DEFAULT_CHARACTER_HEIGHT - chara.getHeight())
                        * ProjectConfig.Pixels_per_centimeter)
                + portrait.getAdjY() + adjY;

        // 以「方框中心」为缩放中心：
        // 缩放前中心在 anchor + length*baseScale/2，缩放后图像左上角 = 中心 - (faceX + length/2)*renderScale。
        // 代入 renderScale = baseScale（用户缩放 = 1）即 anchor - faceX*baseScale，与旧公式一致。
        posX = Math.round(anchorX + halfLength * baseScale
                - (portrait.getFaceX() + halfLength) * renderScale);
        posY = Math.round(anchorY + halfLength * baseScale
                - (portrait.getFaceY() + halfLength) * renderScale);

        logger.debug("{}的身高为{},裁剪方框上边缘为({},{}),裁剪缩放为{},用户缩放为{},渲染位置为({},{})",
                chara.getCharacterName(), chara.getHeight(), anchorX, anchorY,
                baseScale, userScale(), posX, posY);
    }

    /**
     * 应用压暗效果
     */
    private void applyDimEffect(Graphics2D graphics) {
        // 创建半透明黑色覆盖层
        graphics.setColor(new java.awt.Color(0, 0, 0, 100)); // 半透明黑色
        // 这里需要根据实际绘制区域调整覆盖范围
        graphics.fillRect(0, 0, 1920, 1080); // 假设1080p分辨率
    }

    // Getter和Setter方法

    // 获取完整角色对象（按需加载）通过方法注入Service（非字段注入！）
    public MyCharacter getCharacter(CharacterService service) {
        if (charaCache == null && service != null) {
            try {
                charaCache = service.getCharacter(chara.getCharacterID());
            } catch (ElementTypeNotFoundException e) {
                throw new RuntimeException("角色加载失败: " + e.getMessage(), e);
            }
        }
        return charaCache;
    }

    public CharacterRef getChara() {
        return chara;
    }

    public void setChara(MyCharacter character) throws IOException {
        CharacterRef ref = CharacterRef.from(character);
        this.chara = ref;
    }

    public Portrait getPortrait() {
        return portrait;
    }

    public void setPortrait(Portrait portrait) {
        this.portrait = portrait;
        image = portrait.getImage();
    }

    @JsonIgnore
    public BufferedImage getImage() {
        if (this.image == null) {
            this.image = loadImage();
        }
        return this.image;
    }

    @JsonIgnore
    private BufferedImage loadImage() {
        // 从Portrait获取图片
        BufferedImage img = portrait.getImage();
        if (img == null) {
            throw new IllegalStateException("无法从Portrait加载图像");
        }
        return img;
    }

    public int getPosX() {
        return posX;
    }

    public void setPosX(int posX) {
        this.posX = posX;
        updatePos();
    }

    public int getPosY() {
        return posY;
    }

    public void setPosY(int posY) {
        this.posY = posY;
        updatePos();
    }

    public int getAdjX() {
        return adjX;
    }

    public void setAdjX(int adjX) {
        this.adjX = adjX;
        updatePos();
    }

    public int getAdjY() {
        return adjY;
    }

    public void setAdjY(int adjY) {
        this.adjY = adjY;
        updatePos();
    }

    /**
     * 用户手动缩放（1.0 = 不缩放）；会重新计算 posX / posY，保证脸框中心不随缩放漂移。
     */
    public float getScale() {
        return scale;
    }

    public void setScale(float scale) {
        this.scale = scale;
        updatePos();
    }

    public boolean isDim() {
        return dim;
    }

    public void setDim(boolean dim) {
        this.dim = dim;
    }

    /**
     * 获取角色ID（便捷方法）
     */
    @JsonIgnore
    public String getCharacterId() {
        return chara != null ? chara.getCharacterID() : null;
    }

    @Override
    public String toString() {
        return "CharacterVisual{" +
                "character=" + (chara != null ? chara.getCharacterName() : "null") +
                ", scale=" + userScale() +
                ", dim=" + dim +
                '}';
    }

    /**
     * 私有构造函数 - 只能通过Builder创建
     */
    private CharacterVisual(Builder builder) {
        this.chara = builder.chara;
        this.portrait = builder.portrait;
        this.posX = builder.posX;
        this.posY = builder.posY;
        this.adjX = builder.adjX;
        this.adjY = builder.adjY;
        this.scale = builder.scale;
        this.dim = builder.dim;
        this.image = builder.image;

        updatePos();
    }

    /**
     * Builder静态内部类
     */
    public static class Builder {
        // 必需参数
        @JsonProperty
        private CharacterRef chara;
        @JsonProperty
        private Portrait portrait;

        // 可选参数（带默认值）
        @JsonProperty
        private int posX = DEFAULT_POS_X;
        @JsonProperty
        private int posY = DEFAULT_POS_Y;
        @JsonProperty
        private int adjX = DEFAULT_ADJ_X;
        @JsonProperty
        private int adjY = DEFAULT_ADJ_Y;
        /** 用户手动缩放；旧工程文件没有该字段时按 1.0 处理 */
        @JsonProperty
        private float scale = DEFAULT_SCALE;
        @JsonProperty
        private boolean dim = DEFAULT_DIM;

        @JsonIgnore
        private transient BufferedImage image; // 不序列化

        // 无参构造器（JSON反序列化必需）
        public Builder() {
        }

        /**
         * 必需参数构造函数
         * 
         * @throws IOException
         */
        public Builder(MyCharacter character, Portrait portrait) throws IOException {
            this.chara = character == null ? null : CharacterRef.from(character);
            this.portrait = portrait;
            // 立绘可能缺失（如资源被删除），此时 posX/posY 由 updatePos 归零，不阻塞构建
            image = portrait == null ? null : portrait.getImage();
        }

        // 链式设置方法
        public Builder image(BufferedImage image) {
            this.image = image;
            return this;
        }

        public Builder posX(int posX) {
            this.posX = posX;
            return this;
        }

        public Builder posY(int posY) {
            this.posY = posY;
            return this;
        }

        public Builder position(int posX, int posY) {
            this.posX = posX;
            this.posY = posY;
            return this;
        }

        public Builder adjX(int adjX) {
            this.adjX = adjX;
            return this;
        }

        public Builder adjY(int adjY) {
            this.adjY = adjY;
            return this;
        }

        public Builder adjustment(int adjX, int adjY) {
            this.adjX = adjX;
            this.adjY = adjY;
            return this;
        }

        /** 用户手动缩放（1.0 = 不缩放），与 JSON 字段 scale 对应 */
        public Builder scale(float scale) {
            this.scale = scale;
            return this;
        }

        public Builder dim(boolean dim) {
            this.dim = dim;
            return this;
        }

        public Builder bright() {
            this.dim = false;
            return this;
        }

        public Builder dark() {
            this.dim = true;
            return this;
        }

        /**
         * 构建CharacterVisual对象
         * 尝试从 Portrait 加载图像（JSON 反序列化时 image 不会传入，需要主动加载）
         */
        public CharacterVisual build() {
            if (this.image == null && this.portrait != null) {
                try {
                    this.image = this.portrait.getImage();
                } catch (Exception e) {
                    logger.warn("构建 CharacterVisual 时无法加载立绘图像: {}", e.getMessage());
                }
            }
            return new CharacterVisual(this);
        }
    }

    /**
     * 静态工厂方法创建Builder
     * 
     * @throws IOException
     */
    public static Builder builder(MyCharacter chara, Portrait portrait) throws IOException {
        return new Builder(chara, portrait);
    }

}
