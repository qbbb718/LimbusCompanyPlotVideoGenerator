
/**
 * 日志工具，用于调试和记录操作
 * @param component 组件名称
 * @returns 日志函数
 */
export const createLogger = (component: string) => {
  return (message: string, data?: any) => {
    console.log(`[${component}] ${message}`, data);
  };
};

export default createLogger;
