package com.lbc_plot.resource.model;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.UUID;

import javax.imageio.ImageIO;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.lbc_plot.common.util.TextureColorizer;
import com.lbc_plot.common.util.io.ImageReader;
import com.lbc_plot.config.ProjectConfig;

/**
 * 角色立绘差分
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonDeserialize(builder = Portrait.Builder.class)
public class Portrait {
    private static final Logger logger = LoggerFactory.getLogger(Portrait.class);

    String portraitID;
    String characterID; // 对应的角色的id
    String imagePath;
    @JsonIgnore
    BufferedImage image;

    // 立绘名
    String portName;
    Emotion emotion;
    int faceX;
    int faceY;
    int length;
    int adjX;
    int adjY;
    String thumbnailPath;
    @JsonIgnore
    BufferedImage thumbnail;
    /**
     * 是否为角色默认立绘。
     *
     * 注意：该字段不在 portraits 表中，而是来自关联表 character_portraits.is_default，
     * 由 PortraitMapper 在 JOIN 查询时填充。它是"默认立绘"的唯一真实来源，
     * 前端不再依赖 portraits[0] 的位置约定。
     */
    boolean defaultPortrait;

    // 默认值
    private static final String DEFAULT_PORTRAITID = null;
    private static final int DEFAULT_FACE_X = 0;
    private static final int DEFAULT_FACE_Y = 0;
    private static final int DEFAULT_LENGTH = ProjectConfig.DEFAULT_CHARACTER_HEAD_LENGTH;
    private static final int DEFAULT_ADJ_X = 0;
    private static final int DEFAULT_ADJ_Y = 0;
    private static final Emotion DEFAULT_EMOTION = Emotion.NORMAL;

    // Getter和Setter方法

    public String getPortraitID() {
        return portraitID;
    }

    public void setPortraitID(String portraitID) {
        this.portraitID = portraitID;
    }

    /**
     * 生成新的portraitID
     */
    public void setNewPortraitID() {
        this.portraitID = UUID.randomUUID().toString();
    }

    public String getCharacterID() {
        return characterID;
    }

    public void setCharacterID(String characterID) {
        this.characterID = characterID;
    }

    public String getImagePath() {
        return imagePath;
    }

    public void setImagePath(String imagePath) throws IOException {
        this.imagePath = imagePath;
        // 更换图像后需要重新生成缩略图
        this.thumbnailPath = null;
        this.image = null;
    }

    /**
     * 带懒加载的getter方法
     * 如果image为null，会根据imagePath自动加载图像
     */
    public BufferedImage getImage() {
        if (this.image == null && this.imagePath != null && !this.imagePath.trim().isEmpty()) {
            try {
                // 使用ImageReader加载图像
                this.image = ImageReader.readCharacters(imagePath);
                if (this.image == null) {
                    logger.warn("无法加载图像: {}", imagePath);
                    // 可以返回一个默认图像或者抛出异常
                    this.image = createDefaultImage();
                }
            } catch (Exception e) {
                logger.error("加载图像失败: {}", imagePath, e);
                this.image = createDefaultImage();
            }
        }
        return this.image;
    }

    /**
     * setter方法
     * 可以直接设置BufferedImage对象
     */
    public void setImage(BufferedImage image) {
        this.image = image;
    }

    public String getPortName() {
        return portName;
    }

    public void setPortName(String portName) {
        this.portName = portName;
    }

    public Emotion getEmotion() {
        return emotion;
    }

    public void setEmotion(Emotion emotion) {
        this.emotion = emotion;
    }

    @JsonIgnore
    public String getEmotionName() {
        return emotion != null ? emotion.name() : null;
    }

    public void setEmotionName(String emotionName) {
        if (emotionName != null && !emotionName.isEmpty()) {
            try {
                this.emotion = Emotion.valueOf(emotionName);
            } catch (IllegalArgumentException e) {
                logger.warn("未知的情绪类型: " + emotionName + ", 使用默认情绪");
                this.emotion = Emotion.NORMAL;
            }
        } else {
            this.emotion = Emotion.NORMAL;
        }
    }

    // 修改之后记得更新缩略图
    // TODO 缩略图生成
    public int getFaceX() {
        return faceX;
    }

    public void setFaceX(int faceX) {
        this.faceX = faceX;
    }

    public int getFaceY() {
        return faceY;
    }

    public void setFaceY(int faceY) {
        this.faceY = faceY;
    }

    public int getLength() {
        return length;
    }

    public void setLength(int length) {
        this.length = length;
    }

    public int getAdjX() {
        return adjX;
    }

    public void setAdjX(int adjX) {
        this.adjX = adjX;
    }

    public int getAdjY() {
        return adjY;
    }

    public void setAdjY(int adjY) {
        this.adjY = adjY;
    }

    public String getThumbnailPath() {
        return thumbnailPath;
    }

    public void setThumbnailPath(String thumbnailPath) {
        this.thumbnailPath = thumbnailPath;
    }

    /**
     * 是否为该角色的默认立绘（数据来源：character_portraits.is_default）
     */
    public boolean isDefaultPortrait() {
        return defaultPortrait;
    }

    public void setDefaultPortrait(boolean defaultPortrait) {
        this.defaultPortrait = defaultPortrait;
    }

    /**
     * 带懒加载的getter方法
     * 如果image为null，会根据imagePath自动加载图像
     *
     * thumbnailPath 存的是 URL 路径，形如
     * {@code /assets/characters/{目录名}/thumbnails/xxx.png}（前端通过 /assets/** 静态映射访问）。
     * 后端要读成磁盘文件，所以统一交给 {@link ImageReader#resolveAssetFile} 解析 ——
     * 它会把 {@code /assets/} 前缀剥掉再锚定到配置的素材目录，不依赖 JVM 工作目录。
     * 这里刻意与删除逻辑（PortraitController.deletePortrait）用同一个解析入口：
     * 过去读取靠"相对工作目录存在"、删除靠 {@code new File(url)}，两边规则不一致，
     * 结果是读得到却删不掉，磁盘上留了一堆孤儿缩略图。
     */
    public BufferedImage getThumbnail() {
        if (this.thumbnail == null && this.thumbnailPath != null && !this.thumbnailPath.trim().isEmpty()) {
            try {
                File resolved = ImageReader.resolveAssetFile(this.thumbnailPath,
                        ProjectConfig.CHARACTERS_PATH, "characters");
                if (resolved.isFile()) {
                    // 走统一读图入口：WebP 缩略图 ImageIO 读不出来时由 FFmpeg 兜底
                    this.thumbnail = ImageReader.readImageFile(resolved);
                } else {
                    // 回退：按资源路径查找（兼容打进 classpath 的旧值）
                    this.thumbnail = ImageReader.readCharacters(this.thumbnailPath);
                }
                if (this.thumbnail == null) {
                    logger.warn("无法加载缩略图: {}", thumbnailPath);
                    this.thumbnail = createDefaultImage();
                }
            } catch (Exception e) {
                logger.error("加载缩略图失败: {}", thumbnailPath, e);
                this.thumbnail = createDefaultImage();
            }
        }
        return this.thumbnail;
    }

    /**
     * 创建默认图像（当加载失败时使用）
     */
    private BufferedImage createDefaultImage() {
        // 创建一个简单的默认图像
        BufferedImage defaultImage = new BufferedImage(100, 100, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g2d = defaultImage.createGraphics();
        g2d.setColor(Color.RED);
        g2d.fillRect(0, 0, 100, 100);
        g2d.setColor(Color.WHITE);
        g2d.drawString("加载失败", 10, 50);
        g2d.dispose();
        return defaultImage;
    }

    /**
     * 私有构造函数 - 只能通过Builder创建
     */
    private Portrait(Builder builder) {
        this.portraitID = builder.portraitID;
        this.characterID = builder.characterID;
        this.imagePath = builder.imagePath;
        this.image = builder.image;
        this.portName = builder.portName;
        this.emotion = builder.emotion;
        this.faceX = builder.faceX;
        this.faceY = builder.faceY;
        this.length = builder.length;
        this.adjX = builder.adjX;
        this.adjY = builder.adjY;
        this.thumbnailPath = builder.thumbnailPath;
        this.defaultPortrait = builder.defaultPortrait;

        // 应用智能默认值
        applySmartDefaults();
    }

    /**
     * 应用智能默认值逻辑
     */
    private void applySmartDefaults() {
        // 面部位置默认值
        if (this.faceX < 0)
            this.faceX = DEFAULT_FACE_X;
        if (this.faceY < 0)
            this.faceY = DEFAULT_FACE_Y;

        // 面部长宽默认值
        if (this.length <= 0)
            this.length = DEFAULT_LENGTH;

        // 调整值默认值
        if (this.adjX == 0)
            this.adjX = DEFAULT_ADJ_X;
        if (this.adjY == 0)
            this.adjY = DEFAULT_ADJ_Y;

        // 情绪默认值
        if (this.emotion == null)
            this.emotion = DEFAULT_EMOTION;

        // 如果portName为空，使用portraitID
        if (this.portName == null || this.portName.trim().isEmpty()) {
            this.portName = this.portraitID;
        }
    }

    /**
     * Builder静态内部类
     */
    public static class Builder {
        // 必需参数
        @JsonProperty
        private String portraitID;
        @JsonProperty
        private String characterID;
        @JsonProperty
        private String imagePath;

        // 可选参数（带默认值）
        @JsonIgnore
        private transient BufferedImage image; // 不序列化
        @JsonProperty
        private String portName;
        @JsonProperty
        private Emotion emotion = DEFAULT_EMOTION;
        @JsonProperty
        private int faceX = DEFAULT_FACE_X;
        @JsonProperty
        private int faceY = DEFAULT_FACE_Y;
        @JsonProperty
        private int length = DEFAULT_LENGTH;
        @JsonProperty
        private int adjX = DEFAULT_ADJ_X;
        @JsonProperty
        private int adjY = DEFAULT_ADJ_Y;
        @JsonProperty
        private String thumbnailPath;
        @JsonProperty
        private boolean defaultPortrait;

        // 无参构造器（JSON反序列化必需）
        public Builder() {
        }

        /**
         * 必需参数构造函数
         */
        public Builder(String imagePath) {
            this.imagePath = imagePath;
        }

        // 链式设置方法
        public Builder portraitID() {
            this.portraitID = UUID.randomUUID().toString();
            ;
            return this;
        }

        public Builder portraitID(String portraitID) {
            this.portraitID = portraitID;
            return this;
        }

        public Builder imagePath(String imagePath) {
            this.imagePath = imagePath;
            return this;
        }

        public Builder characterID(String characterID) {
            this.characterID = characterID;
            return this;
        }

        public Builder image(BufferedImage image) {
            this.image = image;
            return this;
        }

        public Builder portName(String portName) {
            this.portName = portName;
            return this;
        }

        public Builder emotion(Emotion emotion) {
            this.emotion = emotion;
            return this;
        }

        public Builder faceX(int faceX) {
            this.faceX = faceX;
            return this;
        }

        public Builder faceY(int faceY) {
            this.faceY = faceY;
            return this;
        }

        public Builder facePosition(int faceX, int faceY) {
            this.faceX = faceX;
            this.faceY = faceY;
            return this;
        }

        public Builder length(int length) {
            this.length = length;
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

        public Builder thumbnailPath(String thumbnailPath) {
            this.thumbnailPath = thumbnailPath;
            return this;
        }

        public Builder defaultPortrait(boolean defaultPortrait) {
            this.defaultPortrait = defaultPortrait;
            return this;
        }

        /**
         * 构建Portrait对象
         * 路径从chara开始
         */
        public Portrait build() {
            logger.debug("Building Portrait with: portraitID={}, characterID={}, imagePath={}, portName={}, emotion={}",
                    this.portraitID, this.characterID, this.imagePath, this.portName, this.emotion);
            // 尝试在构建时加载图像。图片文件不存在时不阻塞构建（如删除角色后查询、
            // 文件丢失等场景），只记录警告，image 保持 null，
            // 后续 getImage() 调用时会尝试重新加载（有 try-catch 容错）。
            if (this.imagePath != null && !this.imagePath.trim().isEmpty()) {
                try {
                    this.image = ImageReader.readCharacters(this.imagePath);
                    if (this.image == null) {
                        logger.warn("构建 Portrait 时 readCharacters 返回 null: {}", this.imagePath);
                    }
                } catch (IOException e) {
                    logger.warn("构建 Portrait 时加载图像失败，image 保持 null: {}", this.imagePath, e);
                    this.image = null;
                }
            }

            return new Portrait(this);
        }
    }

    /**
     * 静态工厂方法创建Builder
     */
    public static Builder builder(String imageName) {
        return new Builder(imageName);
    }

    @Override
    public String toString() {
        return "Portrait{" +
                "portraitID='" + portraitID + '\'' +
                ", characterID='" + characterID + '\'' +
                ", imagePath='" + imagePath + '\'' +
                ", portName='" + portName + '\'' +
                ", emotion=" + (emotion != null ? emotion.name() : "null") + // 假设 emotion 是枚举类型
                ", faceX=" + faceX +
                ", faceY=" + faceY +
                ", length=" + length +
                ", adjX=" + adjX +
                ", adjY=" + adjY +
                ", thumbnailPath='" + thumbnailPath + '\'' +
                '}';
    }
}
