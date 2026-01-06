package com.lbc_plot.resource.model;

import java.util.List;
import java.util.ArrayList;

/**
 * 音频资源模型
 */
public class Audio {
    private String uuid;
    private String name;
    private String path;
    private String type; // BGM, VOICE, SFX等
    private List<String> tags;

    /**
     * 默认构造函数
     */
    public Audio() {
        this.tags = new ArrayList<>();
    }

    /**
     * 全参数构造函数
     */
    public Audio(String uuid, String name, String path, String type, List<String> tags) {
        this.uuid = uuid;
        this.name = name;
        this.path = path;
        this.type = type;
        this.tags = tags != null ? new ArrayList<>(tags) : new ArrayList<>();
    }

    // Getter和Setter方法
    public String getUuid() {
        return uuid;
    }

    public void setUuid(String uuid) {
        this.uuid = uuid;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getPath() {
        return path;
    }

    public void setPath(String path) {
        this.path = path;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public List<String> getTags() {
        return tags;
    }

    public void setTags(List<String> tags) {
        this.tags = tags != null ? new ArrayList<>(tags) : new ArrayList<>();
    }

    @Override
    public String toString() {
        return "Audio{" +
                "uuid='" + uuid + '\'' +
                ", name='" + name + '\'' +
                ", path='" + path + '\'' +
                ", type='" + type + '\'' +
                ", tags=" + tags +
                '}';
    }
}
