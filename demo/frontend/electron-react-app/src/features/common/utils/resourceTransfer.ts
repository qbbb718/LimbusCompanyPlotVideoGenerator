/**
 * @module 资源管理模块
 * @function 资源包导入导出的前端公共逻辑
 *
 * <p>角色 / 背景 / 音频三个标签页与"全部资源"都用同一套交互：
 * 点导出 → 后端回一个 ZIP 的 Blob → 触发浏览器下载 → 弹提示。
 * 这段逻辑（以及出错时怎么读后端的错误信息）集中在这里，避免四个地方各写一份。
 */

/**
 * @function 触发浏览器下载一个 Blob
 * @param blob 后端返回的文件内容
 * @param fileName 保存到本地时的建议文件名
 */
export const downloadBlob = (blob: Blob, fileName: string): void => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 下载已由浏览器接管，及时释放对象 URL，避免占着内存
  window.URL.revokeObjectURL(url);
};

/**
 * @function 生成带日期的资源包文件名
 * @param prefix 资源类型前缀，如 characters / backgrounds / audios / resources
 * @example zipFileName("characters") → "characters_2026-10-21.zip"
 */
export const zipFileName = (prefix: string): string =>
  `${prefix}_${new Date().toISOString().slice(0, 10)}.zip`;

/**
 * @function 从接口错误里取出可读的提示
 *
 * <p>后端统一用 GlobalExceptionHandler 返回 { message: "..." }，
 * 直接弹 "导入失败" 会让用户不知道是包格式不对还是文件太大。这里优先用后端消息，
 * 拿不到再退回调用方给定的默认文案。
 */
export const describeTransferError = (error: any, fallback: string): string => {
  const backendMessage =
    error?.response?.data?.message || error?.response?.data?.error;
  if (typeof backendMessage === "string" && backendMessage.trim()) {
    return backendMessage;
  }
  if (typeof error?.message === "string" && error.message.trim()) {
    return `${fallback}（${error.message}）`;
  }
  return fallback;
};
