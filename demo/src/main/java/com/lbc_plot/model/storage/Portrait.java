package com.lbc_plot.model.storage;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
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

  

    /**
     * 裁剪缩略图，保存到本地，删除旧缩略图
     * @param faceX 面部位置X坐标
     * @param faceY 面部位置Y坐标
     * @param length 面部区域边长
     */
    public void generateThumbnail(int faceX, int faceY, int length) {
        try {
            // 删除旧的缩略图文件
            deleteOldThumbnail();
            
            // 加载原始图像
            BufferedImage originalImage = ImageIO.read(new File(imagePath));
            if (originalImage == null) {
                System.err.println("无法加载图像: " + imagePath);
                return;
            }

            // 确保裁剪区域在图像范围内
            int cropX = Math.max(0, Math.min(faceX + adjX, originalImage.getWidth() - 1));
            int cropY = Math.max(0, Math.min(faceY + adjY, originalImage.getHeight() - 1));
            int cropSize = Math.min(length, Math.min(originalImage.getWidth() - cropX, originalImage.getHeight() - cropY));

            if (cropSize <= 0) {
                System.err.println("裁剪区域无效");
                return;
            }

            // 裁剪图像
            BufferedImage thumbnail = originalImage.getSubimage(cropX, cropY, cropSize, cropSize);

            // 生成缩略图文件名
            String thumbnailFileName = generateThumbnailFileName();
            File thumbnailFile = new File(thumbnailFileName);

            // 保存缩略图
            ImageIO.write(thumbnail, "png", thumbnailFile);

            // 更新缩略图路径
            this.thumbnailPath = thumbnailFileName;
            this.faceX = faceX;
            this.faceY = faceY;
            this.length = length;

            System.out.println("缩略图生成成功: " + thumbnailFileName);

        } catch (IOException e) {
            System.err.println("生成缩略图失败: " + e.getMessage());
            e.printStackTrace();
        }
    }

    /**
     * 删除旧的缩略图文件
     */
    private void deleteOldThumbnail() {
        if (thumbnailPath != null && !thumbnailPath.isEmpty()) {
            File oldThumbnail = new File(thumbnailPath);
            if (oldThumbnail.exists()) {
                if (oldThumbnail.delete()) {
                    System.out.println("删除旧缩略图: " + thumbnailPath);
                } else {
                    System.err.println("无法删除旧缩略图: " + thumbnailPath);
                }
            }
        }
    }

    /**
     * 生成缩略图文件名
     * @return 缩略图文件路径
     */
    private String generateThumbnailFileName() {
        // 基于原始图像路径和面部位置生成唯一的缩略图文件名
        String baseName = imagePath.substring(0, imagePath.lastIndexOf('.'));
        String extension = ".png";
        return baseName + "_thumb_" + faceX + "_" + faceY + "_" + length + extension;
    }

    /**
     * 获取面部中心点坐标（用于对话气泡定位等）
     * @return 包含x和y坐标的数组
     */
    public int[] getFaceCenter() {
        int centerX = faceX + adjX + length / 2;
        int centerY = faceY + adjY + length / 2;
        return new int[]{centerX, centerY};
    }

    /**
     * 调整用户手动偏差
     * @param deltaX X轴调整量
     * @param deltaY Y轴调整量
     */
    public void adjustPosition(int deltaX, int deltaY) {
        this.adjX += deltaX;
        this.adjY += deltaY;
        // 调整后重新生成缩略图
        generateThumbnail(faceX, faceY, length);
    }

    // Getter和Setter方法
    public String getPortraitID() {
        return portraitID;
    }

    public void setPortraitID(String portraitID) {
        this.portraitID = portraitID;
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

    public int getfaceX() {
        return faceX;
    }

    public void setfaceX(int faceX) {
        this.faceX = faceX;
        generateThumbnail(faceX, faceY, length);
    }

    public int getfaceY() {
        return faceY;
    }

    public void setfaceY(int faceY) {
        this.faceY = faceY;
        generateThumbnail(faceX, faceY, length);
    }

    public int getLength() {
        return length;
    }

    public void setLength(int length) {
        this.length = length;
        generateThumbnail(faceX, faceY, length);
    }

    public int getAdjX() {
        return adjX;
    }

    public void setAdjX(int adjX) {
        this.adjX = adjX;
        generateThumbnail(faceX, faceY, length);
    }

    public int getAdjY() {
        return adjY;
    }

    public void setAdjY(int adjY) {
        this.adjY = adjY;
        generateThumbnail(faceX, faceY, length);
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
        private String portraitID = DEFAULT_PORTRAITID;
        private final String imagePath;
        
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
        public Builder portraitID(String portraitID) {
            this.portraitID = portraitID;
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
            return new Portrait(this);
        }
    }
    
    /**
     * 静态工厂方法创建Builder
     */
    public static Builder builder(String imagePath) {
        return new Builder(imagePath);
    }
    
    @Override
    public String toString() {
        return String.format("Portrait{id='%s', name='%s', emotion=%s, face=(%d,%d), size=%d, adj=(%d,%d)}",
                portraitID, portName, emotion, faceX, faceY, length, adjX, adjY);
    }
}
