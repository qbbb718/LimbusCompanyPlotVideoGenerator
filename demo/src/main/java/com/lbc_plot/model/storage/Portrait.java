package com.lbc_plot.model.storage;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.UUID;

import javax.imageio.ImageIO;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.util.TextureColorizer;
import com.lbc_plot.util.io.ImageReader;

/**
 * 角色立绘差分
 */
public class Portrait {
    private static final Logger logger = LoggerFactory.getLogger(Portrait.class);

    // 唯一ID
    String portraitID;
    String characterID; // 对应的角色的id
    // 文件相对路径, 读入
    String imagePath;
    BufferedImage image;

    // 立绘名
    String portName;
    // 情绪。做立绘自动匹配用
    Emotion emotion;
    // 面部位置左上角
    int faceX;
    int faceY;
    // 面部长宽 1:1
    int length;
    // 用户手动调整偏差
    int adjX;
    int adjY;
    // 缩略图路径
    String thumbnailPath;

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

    public String getEmotionName() {
        return emotion != null ? emotion.name() : null;
    }

    // 修改之后记得更新缩略图
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
        
        // 应用智能默认值
        applySmartDefaults();
    }
    
    /**
     * 应用智能默认值逻辑
     */
    private void applySmartDefaults() {
        // 面部位置默认值
        if (this.faceX < 0) this.faceX = DEFAULT_FACE_X;
        if (this.faceY < 0) this.faceY = DEFAULT_FACE_Y;
        
        // 面部长宽默认值
        if (this.length <= 0) this.length = DEFAULT_LENGTH;
        
        // 调整值默认值
        if (this.adjX == 0) this.adjX = DEFAULT_ADJ_X;
        if (this.adjY == 0) this.adjY = DEFAULT_ADJ_Y;
        
        // 情绪默认值
        if (this.emotion == null) this.emotion = DEFAULT_EMOTION;
        
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
        private String portraitID;
        private String characterID;
        private String imagePath;
        
        // 可选参数（有默认值）
        private BufferedImage image;
        private String portName;
        private Emotion emotion = DEFAULT_EMOTION;
        private int faceX = DEFAULT_FACE_X;
        private int faceY = DEFAULT_FACE_Y;
        private int length = DEFAULT_LENGTH;
        private int adjX = DEFAULT_ADJ_X;
        private int adjY = DEFAULT_ADJ_Y;
        private String thumbnailPath;

        /**
         * 必需参数构造函数
         */
        public Builder(String imagePath) {
            this.imagePath = imagePath;
        }
        
        // 链式设置方法
        public Builder portraitID() {
            this.portraitID = UUID.randomUUID().toString();;
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
        
        /**
         * 构建Portrait对象
         * 路径从chara开始
         */
        public Portrait build() {
            logger.debug("Building Portrait with: portraitID={}, characterID={}, imagePath={}, portName={}, emotion={}",
                 this.portraitID, this.characterID, this.imagePath, this.portName, this.emotion);
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
