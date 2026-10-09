package com.lbc_plot.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import com.lbc_plot.common.util.RuntimePaths;

/**
 * 应用配置属性
 *
 * <p>素材相关路径不再由 application.yml 提供相对路径，也不再默认到 {@code ./assets}，
 * 而是统一从 {@link RuntimePaths} 推导（用户数据目录下的 assets），避免解析结果随 JVM 工作目录漂移。
 * 保留 setter 仅为兼容按需覆盖（如测试用 {@code -Dlbc.data.dir} 切换数据根目录）。
 */
@Component
@ConfigurationProperties(prefix = "app")
public class AppConfig {
    private Assets assets = new Assets();

    public static class Assets {
        private String path = RuntimePaths.toPortableString(RuntimePaths.getAssetsDir());
        private String audios = RuntimePaths.toPortableString(RuntimePaths.getAudiosDir());
        private String backgrounds = RuntimePaths.toPortableString(RuntimePaths.getBackgroundsDir());
        private String characters = RuntimePaths.toPortableString(RuntimePaths.getCharactersDir());
        private String thumbnails = RuntimePaths.toPortableString(RuntimePaths.getThumbnailsDir());
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