package com.lbc_plot.model.video;

import java.awt.Graphics2D;
import java.awt.image.BufferedImage;

import org.bytedeco.ffmpeg.global.postproc;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.core.ProjectConfig;
import com.lbc_plot.model.repository.MyCharacter;
import com.lbc_plot.model.repository.Portrait;
import com.lbc_plot.service.Render;

import java.awt.AlphaComposite;

/**
 * 角色立绘可视化类
 */
public class CharacterVisual extends VisualElement {
    private static final Logger logger = LoggerFactory.getLogger(CharacterVisual.class);

    // 所属角色，读取一些信息用
    private MyCharacter chara;
    private Portrait portrait;
    // 图像
    private BufferedImage image;
    // 立绘坐标，从角色读取计算
    private int posX;
    private int posY;
    // 用户手动调整偏差
    private int adjX;
    private int adjY;
    // 是否压暗，默认true；说话人false
    private boolean dim;


    // 默认值
    private static final int DEFAULT_POS_X = 0;
    private static final int DEFAULT_POS_Y = 0;
    private static final int DEFAULT_ADJ_X = 0;
    private static final int DEFAULT_ADJ_Y = 0;
    private static final boolean DEFAULT_DIM = true;


    /**
     * 从角色读取立绘坐标, 角色身高与单张立绘偏差值
     * @param chara 角色对象
     * @return 包含x和y坐标的数组
     */
    public void updatePos() {
        if (chara == null) {
            posX = 0;
            posY = 0;
        }
        
        // 从角色获取身高, 从立绘获取头顶
        posX = ProjectConfig.VIDEO_WIDTH /2 - (146 * (ProjectConfig.VIDEO_WIDTH/ProjectConfig.VIDEO_WIDTH)/2) 
                - portrait.getfaceX() + portrait.getAdjX() + adjX;
        posY = (int)((ProjectConfig.DEFAULT_CHARACTER_HEIGHT - chara.getHeight()) * ProjectConfig.Pixels_per_centimeter) 
                + ProjectConfig.DEFAULT_CHARACTER_HEIGHT_Pixels + portrait.getAdjY() + adjY;

        logger.debug("{}的身高为{},渲染距离为{}", 
                    chara.getCharacterName(), chara.getHeight(), posY);
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
    public MyCharacter getChara() {
        return chara;
    }

    public void setChara(MyCharacter chara) {
        this.chara = chara;
    }

    public Portrait getPortrait() {
        return portrait;
    }

    public void setPortrait(Portrait portrait) {
        this.portrait = portrait;
        image = portrait.getImage();
    }

    public BufferedImage getImage() {
        return image;
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

    public boolean isDim() {
        return dim;
    }

    public void setDim(boolean dim) {
        this.dim = dim;
    }

    /**
     * 获取角色ID（便捷方法）
     */
    public String getCharacterId() {
        return chara != null ? chara.getCharacterID() : null;
    }

    @Override
    public String toString() {
        return "CharacterVisual{" +
                "character=" + (chara != null ? chara.getCharacterName() : "null") +
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
        this.dim = builder.dim;
        this.image = builder.image;
        
        updatePos();
    }

    /**
     * Builder静态内部类
     */
    public static class Builder {
        // 必需参数
        private final MyCharacter chara;
        private final Portrait portrait;
        
        // 可选参数（有默认值）
        private BufferedImage image;
        private int posX = DEFAULT_POS_X;
        private int posY = DEFAULT_POS_Y;
        private int adjX = DEFAULT_ADJ_X;
        private int adjY = DEFAULT_ADJ_Y;
        private boolean dim = DEFAULT_DIM;

        /**
         * 必需参数构造函数
         */
        public Builder(MyCharacter chara, Portrait portrait) {
            this.chara = chara;
            this.portrait = portrait;
            image = portrait.getImage();
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
         */
        public CharacterVisual build() {
            return new CharacterVisual(this);
        }
    }
    
    /**
     * 静态工厂方法创建Builder
     */
    public static Builder builder(MyCharacter chara, Portrait portrait) {
        return new Builder(chara, portrait);
    }

}
