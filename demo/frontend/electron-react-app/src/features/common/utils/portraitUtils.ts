import { Portrait } from "@types";
import { AppConfig } from "@root/features/common/config/appConfig";

/**
 * 立绘工具函数
 *
 * 默认立绘的唯一真实来源是后端 Portrait.defaultPortrait
 * （对应数据库 character_portraits.is_default）。
 *
 * 历史实现用 portraits[0] 的位置约定表示默认立绘，导致：
 * - 后端按 port_name 排序返回时，默认立绘会被改名影响；
 * - 每次保存角色都会把默认立绘重置回列表首项。
 * 因此统一改为读取标记，并在标记缺失时回退到首项以兼容旧数据。
 */

/**
 * 判断某个立绘是否为默认立绘
 */
export const isDefaultPortraitId = (
  portraits: Portrait[] | undefined | null,
  portraitId: string | undefined | null,
): boolean => {
  if (!portraits || portraits.length === 0 || !portraitId) {
    return false;
  }
  const marked = portraits.find((p) => p.defaultPortrait);
  if (marked) {
    return marked.portraitID === portraitId;
  }
  // 后端未返回标记（旧数据/旧接口）时回退到首项约定
  return portraits[0]?.portraitID === portraitId;
};

/**
 * 取得默认立绘。没有立绘时返回 null。
 */
export const getDefaultPortrait = (
  portraits: Portrait[] | undefined | null,
): Portrait | null => {
  if (!portraits || portraits.length === 0) {
    return null;
  }
  return portraits.find((p) => p.defaultPortrait) ?? portraits[0] ?? null;
};

/**
 * 把某个立绘标记为默认，其余立绘取消标记（返回新数组，不改动入参）
 */
export const markDefaultPortrait = (
  portraits: Portrait[] | undefined | null,
  portraitId: string,
): Portrait[] => {
  if (!portraits) {
    return [];
  }
  return portraits.map((p) => ({
    ...p,
    defaultPortrait: p.portraitID === portraitId,
  }));
};

/**
 * 立绘原图的访问 URL。
 *
 * <p>`Portrait.imagePath` 是相对角色素材根目录的路径（例如
 * `char_1785997975135/portrait_1785997993031.png`），必须整段拼上去：
 * 只取文件名会让「按 characterId 分目录存放」的新立绘 404。
 */
export const buildPortraitImageUrl = (
  imagePath: string | null | undefined,
): string => {
  if (!imagePath) {
    return "";
  }
  if (
    /^https?:/i.test(imagePath) ||
    imagePath.startsWith("data:") ||
    imagePath.startsWith("blob:")
  ) {
    return imagePath;
  }
  const apiBase = AppConfig.api.baseUrl.replace(/\/$/, "");
  return `${apiBase}${AppConfig.resources.charactersBasePath}/${imagePath.replace(
    /^\/+/,
    "",
  )}`;
};
