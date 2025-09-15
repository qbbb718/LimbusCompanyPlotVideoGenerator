package com.lbc_plot.model;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.lbc_plot.model.storage.MyCharacter;
import com.lbc_plot.model.video.BackgroundVisual;
import com.lbc_plot.model.video.Camera;
import com.lbc_plot.model.video.CharacterVisual;
import com.lbc_plot.model.video.Dialogue;
import com.lbc_plot.model.video.EffectVisual;
import com.lbc_plot.project.audio.AudioCommand;

import java.awt.image.BufferedImage;
import java.util.List;

public class Record {
    private String uuid;                     // 避免修改顺序破坏dirty
    private int durationFrames;         // 持续时间（帧数）
    private Dialogue dialogue;          // 文本对话内容
    private Camera camera;              // 摄像机信息
    private List<BackgroundVisual> bg;  // 背景视觉元素
    private List<CharacterVisual> chars; // 角色立绘列表
    private List<EffectVisual> effects;  // 特效列表
    private List<AudioCommand> audioCommands; // 音频操作列表
    private boolean isDirty; // 在上次导出后是否进行过修改
    private BufferedImage preImage; // 预览图, 无UI的

    /**
     * 全参数构造函数
     */
    public Record(String uuid, Dialogue dialogue, Camera camera, 
                 List<BackgroundVisual> bg, List<CharacterVisual> chars, 
                 List<EffectVisual> effects, List<AudioCommand> audioCommands, 
                 boolean isDirty, BufferedImage preImage) {
        this.uuid = (uuid != null) ? uuid : UUID.randomUUID().toString();
        this.dialogue = dialogue;
        this.camera = (camera != null) ? camera : new Camera();
        this.bg = (bg != null) ? new ArrayList<>(bg) : new ArrayList<>();
        this.chars = (chars != null) ? new ArrayList<>(chars) : new ArrayList<>();
        this.effects = (effects != null) ? new ArrayList<>(effects) : new ArrayList<>();
        this.audioCommands = (audioCommands != null) ? new ArrayList<>(audioCommands) : new ArrayList<>();
        this.isDirty = isDirty;
        this.preImage = preImage;

        
        calculateDuration();
    }


    void calculateDuration(){
        durationFrames = 0;
        //if(有音频)
    }

    // Getter 和 Setter 方法
    public String getUuid() {
        return uuid;
    }

    public void setUuid(String uuid) {
        this.uuid = uuid;
        this.isDirty = true;
    }

    public int getDurationFrames() {
        return durationFrames;
    }

    public void setDurationFrames(int durationFrames) {
        this.durationFrames = durationFrames;
        this.isDirty = true;
    }

    public Dialogue getDialogue() {
        return dialogue;
    }

    public void setDialogue(Dialogue dialogue) {
        this.dialogue = dialogue;
        this.isDirty = true;
    }

    public Camera getCamera() {
        return camera;
    }

    public void setCamera(Camera camera) {
        this.camera = camera;
        this.isDirty = true;
    }

    public List<BackgroundVisual> getBg() {
        return bg;
    }

    public void setBg(List<BackgroundVisual> bg) {
        this.bg = bg;
        this.isDirty = true;
    }

    public List<CharacterVisual> getChars() {
        return chars;
    }

    public void setChars(List<CharacterVisual> chars) {
        this.chars = chars;
        this.isDirty = true;
    }

    public List<EffectVisual> getEffects() {
        return effects;
    }

    public void setEffects(List<EffectVisual> effects) {
        this.effects = effects;
        this.isDirty = true;
    }

    public List<AudioCommand> getAudioCommands() {
        return audioCommands;
    }

    public void setAudioCommands(List<AudioCommand> audioCommands) {
        this.audioCommands = audioCommands;
        this.isDirty = true;
    }

    public boolean isDirty() {
        return isDirty;
    }

    public void setDirty(boolean dirty) {
        isDirty = dirty;
    }

    public BufferedImage getPreImage() {
        return preImage;
    }

    public void setPreImage(BufferedImage preImage) {
        this.preImage = preImage;
        // 预览图更新不标记为dirty，因为这只是缓存
    }

    // 一些便捷方法
    public void markClean() {
        this.isDirty = false;
    }

    public void addBackgroundVisual(BackgroundVisual background) {
        if (this.bg != null) {
            this.bg.add(background);
            this.isDirty = true;
        }
    }

    public void addCharacterVisual(CharacterVisual character) {
        if (this.chars != null) {
            this.chars.add(character);
            this.isDirty = true;
        }
    }

    public void addEffectVisual(EffectVisual effect) {
        if (this.effects != null) {
            this.effects.add(effect);
            this.isDirty = true;
        }
    }

    public void addAudioCommand(AudioCommand audioCommand) {
        if (this.audioCommands != null) {
            this.audioCommands.add(audioCommand);
            this.isDirty = true;
        }
    }

    public void removeBackgroundVisual(BackgroundVisual background) {
        if (this.bg != null) {
            this.bg.remove(background);
            this.isDirty = true;
        }
    }

    public void removeCharacterVisual(CharacterVisual character) {
        if (this.chars != null) {
            this.chars.remove(character);
            this.isDirty = true;
        }
    }

    @Override
    public String toString() {
        return "Record{" +
                "uuid='" + uuid + '\'' +
                ", durationFrames=" + durationFrames +
                ", dialogue=" + dialogue +
                ", isDirty=" + isDirty +
                '}';
    }



    /**
     * 建造者模式 - 用于创建复杂的 Record 对象
     */
    public static class Builder {
        private String uuid;
        private int durationFrames;
        private Dialogue dialogue;
        private Camera camera = new Camera();
        private List<BackgroundVisual> bg = new ArrayList<>();
        private List<CharacterVisual> chars = new ArrayList<>();
        private List<EffectVisual> effects = new ArrayList<>();
        private List<AudioCommand> audioCommands = new ArrayList<>();
        private boolean isDirty = true;
        private BufferedImage preImage;

        public Builder() {
        }

        public Builder uuid(String uuid) {
            this.uuid = uuid;
            return this;
        }

        public Builder dialogue(Dialogue dialogue) {
            this.dialogue = dialogue;
            return this;
        }

        public Builder camera(Camera camera) {
            this.camera = camera;
            return this;
        }

        public Builder addBackground(BackgroundVisual background) {
            this.bg.add(background);
            return this;
        }

        public Builder addCharacter(CharacterVisual character) {
            this.chars.add(character);
            return this;
        }

        public Builder addEffect(EffectVisual effect) {
            this.effects.add(effect);
            return this;
        }

        public Builder addAudioCommand(AudioCommand audioCommand) {
            this.audioCommands.add(audioCommand);
            return this;
        }

        public Builder isDirty(boolean isDirty) {
            this.isDirty = isDirty;
            return this;
        }

        public Builder preImage(BufferedImage preImage) {
            this.preImage = preImage;
            return this;
        }

        public Record build() {
            return new Record(uuid, dialogue, camera, 
                            bg, chars, effects, audioCommands, 
                            isDirty, preImage);
        }
    }
}