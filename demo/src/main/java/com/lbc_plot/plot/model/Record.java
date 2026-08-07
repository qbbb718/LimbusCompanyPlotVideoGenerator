package com.lbc_plot.plot.model;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.annotation.*;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.lbc_plot.render.audio.model.AudioCommand;
import com.lbc_plot.render.video.BackgroundVisual;
import com.lbc_plot.render.video.Camera;
import com.lbc_plot.render.video.CharacterVisual;
import com.lbc_plot.render.video.EffectVisual;
import com.lbc_plot.render.video.TempImageVisual;
import com.lbc_plot.resource.model.MyCharacter;

import java.awt.image.BufferedImage;
import java.util.List;

public class Record {
    private String uuid; // 避免修改顺序破坏dirty
    private int durationFrames; // 持续时间（帧数）
    private Dialogue dialogue; // 文本对话内容
    @JsonIgnore
    private Camera camera; // 摄像机信息
    private List<BackgroundVisual> bg; // 背景视觉元素
    private List<CharacterVisual> chars; // 角色立绘列表
    private List<TempImageVisual> tempImages; // 临时图片（NPC、道具等）
    @JsonIgnore
    private List<EffectVisual> effects; // 特效列表
    private List<AudioCommand> audioCommands; // 音频操作列表
    private boolean isDirty; // 在上次导出后是否进行过修改
    @JsonIgnore
    private BufferedImage preImage; // 预览图, 无UI的

    /**
     * 全参数构造函数
     */
    public Record(String uuid, Dialogue dialogue, Camera camera,
            List<BackgroundVisual> bg, List<CharacterVisual> chars,
            List<TempImageVisual> tempImages,
            List<EffectVisual> effects, List<AudioCommand> audioCommands,
            boolean isDirty, BufferedImage preImage) {
        this.uuid = (uuid != null) ? uuid : UUID.randomUUID().toString();
        this.dialogue = dialogue;
        this.camera = (camera != null) ? camera : new Camera();
        this.bg = (bg != null) ? new ArrayList<>(bg) : new ArrayList<>();
        this.chars = (chars != null) ? new ArrayList<>(chars) : new ArrayList<>();
        this.tempImages = (tempImages != null) ? new ArrayList<>(tempImages) : new ArrayList<>();
        this.effects = (effects != null) ? new ArrayList<>(effects) : new ArrayList<>();
        this.audioCommands = (audioCommands != null) ? new ArrayList<>(audioCommands) : new ArrayList<>();
        this.isDirty = isDirty;
        this.preImage = preImage;

        calculateDuration();
    }

    // 必须添加无参构造器（Jackson反射需要）
    protected Record() {
    }

    void calculateDuration() {
        durationFrames = 0;
        // if(有音频)
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

    @JsonProperty("bg")
    public List<BackgroundVisual> getBackgroundVisuals() {
        return bg;
    }

    public void setBackgroundVisuals(List<BackgroundVisual> bg) {
        this.bg = bg;
        this.isDirty = true;
    }

    @JsonIgnore
    public BackgroundVisual getFirstBackgroundVisual() {
        return bg.get(0);
    }

    @JsonProperty("chars")
    public List<CharacterVisual> getCharacters() {
        return chars;
    }

    public void setCharacters(List<CharacterVisual> chars) {
        this.chars = chars;
        this.isDirty = true;
    }

    public List<TempImageVisual> getTempImages() {
        return tempImages;
    }

    public void setTempImages(List<TempImageVisual> tempImages) {
        this.tempImages = tempImages;
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
        if (this.bg == null)
            this.bg = new ArrayList<>();
        this.bg.add(background);
        this.isDirty = true;

        // 如果对话尚未指定 location，优先使用背景的 name 作为 location
        try {
            if (this.dialogue != null) {
                String currentLoc = this.dialogue.getLocation();
                if (currentLoc == null || Dialogue.DEFAULT_LOCATION.equals(currentLoc)) {
                    if (background != null && background.getBackground() != null
                            && background.getBackground().getName() != null
                            && !background.getBackground().getName().isBlank()) {
                        this.dialogue.setLocation(background.getBackground().getName());
                    }
                }
            }
        } catch (Exception ex) {
            // 忽略任何异常以保证 API 稳定性
        }
    }

    public void addCharacterVisual(CharacterVisual character) {
        if (this.chars != null) {
            this.chars.add(character);
            this.isDirty = true;
        }
    }

    public void addTempImageVisual(TempImageVisual tempImage) {
        if (this.tempImages != null) {
            this.tempImages.add(tempImage);
            this.isDirty = true;
        }
    }

    public void removeTempImageVisual(TempImageVisual tempImage) {
        if (this.tempImages != null) {
            this.tempImages.remove(tempImage);
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
    @JsonDeserialize(builder = Record.Builder.class)
    public static class Builder {
        @JsonProperty
        private String uuid;
        @JsonProperty
        private int durationFrames;
        @JsonProperty
        private Dialogue dialogue;
        @JsonProperty
        private Camera camera = new Camera();
        @JsonProperty
        private List<BackgroundVisual> bg = new ArrayList<>();
        @JsonProperty
        private List<CharacterVisual> chars = new ArrayList<>();
        @JsonProperty
        private List<TempImageVisual> tempImages = new ArrayList<>();
        @JsonProperty
        private List<EffectVisual> effects = new ArrayList<>();
        @JsonProperty
        private List<AudioCommand> audioCommands = new ArrayList<>();
        @JsonProperty
        private boolean isDirty = true;
        @JsonIgnore
        private BufferedImage preImage; // 图片不序列化

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
            // If dialogue is present and location is default, apply background name
            try {
                if (this.dialogue != null) {
                    String loc = this.dialogue.getLocation();
                    if (loc == null || Dialogue.DEFAULT_LOCATION.equals(loc)) {
                        if (background != null && background.getBackground() != null
                                && background.getBackground().getName() != null
                                && !background.getBackground().getName().isBlank()) {
                            this.dialogue.setLocation(background.getBackground().getName());
                        }
                    }
                }
            } catch (Exception ex) {
                // ignore
            }
            return this;
        }

        public Builder addCharacter(CharacterVisual character) {
            this.chars.add(character);
            return this;
        }

        public Builder addTempImage(TempImageVisual tempImage) {
            this.tempImages.add(tempImage);
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
                    bg, chars, tempImages, effects, audioCommands,
                    isDirty, preImage);
        }
    }
}