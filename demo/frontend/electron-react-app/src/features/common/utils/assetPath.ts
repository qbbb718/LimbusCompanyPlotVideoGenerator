/**
 * 资源路径规范化（前端侧）。
 *
 * <p><b>为什么需要</b>：后端返回的路径是站内路径 {@code /assets/backgrounds/x.png}，
 * 前端为了让 {@code <img src>} 能直接显示，会把它补成
 * {@code http://localhost:8081/assets/backgrounds/x.png}。问题出在"编辑 → 保存"：
 * 编辑弹窗里拿到的对象是补全过的，保存时又原样提交回后端，于是数据库里
 * {@code backgrounds.path} 变成了绝对 URL。
 *
 * <p>后果（运行日志可复现）：后端 {@code pathExistsOnDisk} 解析不了这种路径，
 * 报"背景资源不存在（磁盘找不到）"；预览渲染找不到背景退回默认黑底；删除时甚至拼出
 * {@code ...\assets\http:\localhost:8081\assets\backgrounds\x.png}。
 *
 * <p>所以"要写回后端的路径"必须先过一遍 {@link toAssetPath}，
 * 让数据库里始终只有站内路径。显示用的绝对地址由 {@code normalizeAssetUrl} 现拼。
 */

/** 站内资源路径前缀（与后端 AssetPathNormalizer 保持一致） */
export const ASSETS_PREFIX = "/assets/";

/**
 * 把各种写法的资源路径收敛成 `/assets/...`。
 *
 * 能处理：绝对 URL、`assets/...`、`./assets/...`、Windows 反斜杠、已经是 `/assets/...`。
 * `blob:` / `data:` 与裸文件名原样返回（后者不猜目录）。
 *
 * @param path 原始路径
 * @returns 规范化后的站内路径；null/undefined/空串返回原值
 */
export const toAssetPath = (
  path: string | null | undefined,
): string | null | undefined => {
  if (path === null || path === undefined) return path;

  const value = path.trim();
  if (value === "") return value;

  const lower = value.toLowerCase();
  // 浏览器临时地址：不属于站内资源，保持原样（调用方通常会把它清掉）
  if (lower.startsWith("blob:") || lower.startsWith("data:")) {
    return value;
  }

  let result = value;

  // 绝对 URL：去掉 scheme + host + port，只留 path
  const schemeEnd = result.indexOf("://");
  if (schemeEnd >= 0) {
    const pathStart = result.indexOf("/", schemeEnd + 3);
    result = pathStart >= 0 ? result.substring(pathStart) : "";
    if (result === "") return result;
  }

  result = result.replace(/\\/g, "/");

  let stripped = result;
  while (stripped.startsWith("./")) stripped = stripped.substring(2);
  while (stripped.startsWith("/")) stripped = stripped.substring(1);

  if (stripped === "assets" || stripped.startsWith("assets/")) {
    return "/" + stripped;
  }

  // 不是站内资源路径（例如裸文件名）：保持原样，只统一斜杠
  return result;
};

/**
 * 把站内路径拼成可直接放进 `<img src>` 的绝对地址。
 *
 * @param path    站内路径（`/assets/...`）或已经是绝对地址的 URL
 * @param baseUrl API 基地址，例如 `http://localhost:8081`
 */
export const normalizeAssetUrl = (
  path: string | null | undefined,
  baseUrl: string,
): string | null | undefined => {
  if (path === null || path === undefined) return path;
  const value = path.trim();
  if (value === "") return value;
  // 已经是完整 URL / data: / blob:，无需处理
  if (/^(https?:|data:|blob:|file:)/i.test(value)) return value;

  const base = baseUrl.replace(/\/$/, "");
  const normalized = toAssetPath(value) ?? value;
  return normalized.startsWith("/") ? `${base}${normalized}` : `${base}/${normalized}`;
};
