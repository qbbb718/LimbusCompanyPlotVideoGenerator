package com.lbc_plot.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 应用配置属性
 */
@Component
@ConfigurationProperties(prefix = "app")
public class AppConfig {
    private Assets assets = new Assets();

    public static class Assets {
        private String path = "./assets";
        private String audios = "./assets/audios";
        private String backgrounds = "./assets/backgrounds";
        private String characters = "./assets/characters";
        private String thumbnails = "./assets/thumbnails";
        /**
         * 角色目录下存放立绘缩略图与角色名片图片的子目录名。
         * 缩略图与名片图片都会保存到 {characters}/{角色拼音}/{characterThumbnailsSubdir}/ 下，
         * 这样删除角色目录时会一并清理。可通过 application.yml 自定义。
         */
        private String characterThumbnailsSubdir = "thumbnails";

        // getters and setters
        public String getPath() {
            return path;
        }

        public void setPath(String path) {
            this.path = path;
        }

        public String getAudios() {
            return audios;
        }

        public void setAudios(String audios) {
            this.audios = audios;
        }

        public String getBackgrounds() {
            return backgrounds;
        }

        public void setBackgrounds(String backgrounds) {
            this.backgrounds = backgrounds;
        }

        public String getCharacters() {
            return characters;
        }

        public void setCharacters(String characters) {
            this.characters = characters;
        }

        public String getThumbnails() {
            return thumbnails;
        }

        public void setThumbnails(String thumbnails) {
            this.thumbnails = thumbnails;
        }

        public String getCharacterThumbnailsSubdir() {
            return characterThumbnailsSubdir;
        }

        public void setCharacterThumbnailsSubdir(String characterThumbnailsSubdir) {
            this.characterThumbnailsSubdir = characterThumbnailsSubdir;
        }
    }

    public Assets getAssets() {
        return assets;
    }

    public void setAssets(Assets assets) {
        this.assets = assets;
    }
}