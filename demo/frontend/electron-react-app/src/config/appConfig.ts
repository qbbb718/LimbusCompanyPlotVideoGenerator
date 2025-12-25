
// 应用配置文件
export const AppConfig = {
  // 资源文件路径配置
  resources: {
    // 缩略图基础路径
    thumbnailsBasePath: 'E:/LimbusCompanyPlotVideoGenerator/demo/src/main/resources/assets/thumbnails',
  },

  // API配置
  api: {
    baseUrl: 'http://localhost:8080',
  },

  // 其他配置可以在这里添加
};

// 默认配置，用于初始化或重置
export const DefaultAppConfig = {
  ...AppConfig,
};
