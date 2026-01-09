# ProjectConfig 配置参考

本文件列出 `ProjectConfig` 可配置的常用属性及其默认值（配置前缀：`project`）。

示例（`application-dev.yml` / `application-prod.yml` 已包含示例）：

```yaml
project:
  video-width: 1920
  video-height: 1080
  frame-rate: 30
  image-base-path: assets/images/
  portrait-base-path: assets/images/portraits/
  thumbnail-base-path: assets/images/thumbnails/
  default-animation-duration: 300
  default-alpha: 0.8
  default-stay-frames: 75
  # 颜色建议使用十六进制字符串
  default-text-color: "#FBDBB3"
  default-bg-color: "#4C361F"
  faction-color: "#9F6A3B"
```

注意事项：
- `ProjectConfig` 在 Spring 启动时会用实例字段覆盖类中的静态常量，以保证向后兼容旧代码中使用静态字段的点。
 - 颜色现在支持使用十六进制字符串（例如 `#RRGGBB` 或 `#AARRGGBB`）。配置绑定会将这些字符串解析为 `java.awt.Color`，并在应用启动时设置到静态字段以保持向后兼容。
