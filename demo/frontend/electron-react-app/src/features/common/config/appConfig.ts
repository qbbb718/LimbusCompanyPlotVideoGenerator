// 应用配置文件
const computeBaseUrl = (): string => {
  if (process.env.REACT_APP_API_BASE_URL) {
    return process.env.REACT_APP_API_BASE_URL;
  }

  // 本应用是 Electron 桌面应用，前端始终连接独立的后端服务（默认 http://localhost:8081）。
  // 不能使用 window.location 作为后端地址：
  // - 开发模式下 window.location 指向 CRA dev server (http://localhost:3000)，并非后端
  // - 打包模式下 window.location 是 file:// 协议，更不是后端地址
  // 之前此处用 window.location.host 导致开发模式下所有图片 URL 拼成
  // http://localhost:3000/assets/... 而全部 404，缩略图/名片/立绘预览均无法显示。
  return 'http://localhost:8081';
};

export const AppConfig = {
  resources: {
    basePath: '/assets',
    thumbnailsBasePath: '/assets/thumbnails',
    backgroundsBasePath: '/assets/backgrounds',
    audiosBasePath: '/assets/audios',
    charactersBasePath: '/assets/characters',
  },

  api: {
    baseUrl: computeBaseUrl(),
  },

  /**
   * 渲染「设计画布」尺寸 —— 必须与后端 ProjectConfig.VIDEO_WIDTH / VIDEO_HEIGHT 保持一致。
   *
   * 所有素材坐标都存在这个 1080p 空间里：立绘的 posX/posY/adjX/adjY、临时图片的 posX/posY、
   * 后端 ProjectConfig 的字号与锚点。设置页选的「视频尺寸」只是最终输出分辨率，
   * 渲染时整幅画面等比缩放，**不改变坐标系**，所以编辑器里任何按画布换算的逻辑
   * （例如立绘位置滑杆）都必须用这里的设计画布尺寸，而不是用户选的输出分辨率。
   */
  designCanvas: {
    width: 1920,
    height: 1080,
  },

  // 其他配置可以在这里添加
};

// 默认配置，用于初始化或重置
export const DefaultAppConfig = {
  ...AppConfig,
};
