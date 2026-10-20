import { Portrait } from "@types";
import { AppConfig } from "@root/features/common/config/appConfig";
import { ImageSize } from "./portraitCrop";
import { loadImageElement } from "./imageUtils";

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

/**
 * 正在读取中的立绘原图尺寸（按 URL 去重）。
 *
 * <p>只去重**并发**的重复读取，读到就删：立绘图片可能被「换一张图」原地覆盖，
 * 长期缓存会让下一次套用裁剪时用的是旧尺寸。
 */
const pendingPortraitImageSizes = new Map<string, Promise<ImageSize | null>>();

/**
 * 读一张立绘原图的像素尺寸。
 *
 * <p>`{ faceX, faceY, length }` 存的是原图像素，想把默认立绘的裁剪**按比例**套到
 * 另一张立绘上，必须先知道两张图各自的尺寸（例如 1600×2432 与 640×983）。
 * 读不到（路径为空 / 图片 404 / 解码失败）时返回 null，调用方退回按像素照搬。
 */
export const loadPortraitImageSize = (
  imagePath: string | null | undefined,
): Promise<ImageSize | null> => {
  const url = buildPortraitImageUrl(imagePath);
  if (!url) {
    return Promise.resolve(null);
  }

  const pending = pendingPortraitImageSizes.get(url);
  if (pending) {
    return pending;
  }

  const loading = loadImageElement(url).then(
    (image) => {
      pendingPortraitImageSizes.delete(url);
      return { width: image.naturalWidth, height: image.naturalHeight };
    },
    (error) => {
      pendingPortraitImageSizes.delete(url);
      console.warn("[portraitUtils] 读取立绘原图尺寸失败", url, error);
      return null;
    },
  );

  pendingPortraitImageSizes.set(url, loading);
  return loading;
};
