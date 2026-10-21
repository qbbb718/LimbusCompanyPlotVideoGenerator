/**
 * @module 预览用图片地址
 *
 * 把「图层 key」（`background:0` / `character:1` / `tempImage:0`）映射成可以直接
 * 给 `<img>` 或 `new Image()` 用的绝对地址。几何模块只认 key、不碰 URL，
 * URL 的拼装规则（中文文件名、按角色分目录、临时图片的绝对路径截断）都留在 ApiService /
 * portraitUtils 里，避免同一个坑踩两遍。
 *
 * @see ApiService.getBackgroundUrl
 * @see buildPortraitImageUrl
 * @see ApiService.getTempImageUrl
 */
import type { Record as PlotRecord } from "@types";
import ApiService from "@services/ApiService";
import { buildPortraitImageUrl } from "@features/common/utils/portraitUtils";
import { SceneLayerKind, sceneLayerKey } from "./previewLayout";

/** UI 素材地址：对话框与地点牌（叠在场景之上、不受摄像机影响） */
export const UI_IMAGE_URLS = {
  dialogBox: ApiService.getUiAssetUrl("dialogBox.png"),
  locationPlate: ApiService.getUiAssetUrl("location.png"),
} as const;

/**
 * 收集一条记录里所有「世界场景」图层的原图地址。
 *
 * <p>注意立绘必须用**原图**（{@link buildPortraitImageUrl}）而不是缩略图：缩略图是裁剪后的
 * 图片，宽高比与渲染用的原图不同，拿它的尺寸算出来的矩形会整体偏小/偏扁。
 *
 * @param record 当前记录
 * @returns key → 绝对 URL；拿不到地址的图层不会出现在结果里（几何模块会记进 missingSizes）
 */
export function buildSceneImageMap(
  record: PlotRecord | null | undefined,
): Record<string, string> {
  const map: Record<string, string> = {};
  if (!record) return map;

  const put = (kind: SceneLayerKind, index: number, url: string) => {
    if (url) map[sceneLayerKey(kind, index)] = url;
  };

  (record.bg ?? []).forEach((background, index) => {
    put("background", index, ApiService.getBackgroundUrl(background?.background?.path ?? ""));
  });
  (record.chars ?? []).forEach((character, index) => {
    put("character", index, buildPortraitImageUrl(character?.portrait?.imagePath));
  });
  (record.tempImages ?? []).forEach((temp, index) => {
    put("tempImage", index, ApiService.getTempImageUrl(temp?.imagePath ?? ""));
  });

  return map;
}
