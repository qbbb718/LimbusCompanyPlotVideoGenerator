import {
  isInitializedState,
  transformImage as transformCropperState,
} from "react-advanced-cropper";
import type { TransformImageAlgorithm } from "react-advanced-cropper";

/**
 * 缩放 / 平移立绘时，让裁剪框跟着立绘一起走。
 *
 * <p>裁剪器默认把裁剪框"钉"在画面上：滚轮放大只是把立绘往框里塞，拖动画面也只是立绘在框下移动，
 * 框的位置和大小都不变 —— 滚轮一放大，框就从脸上滑走了；拖一下画面，框里的内容也换了。
 *
 * <p>这里在库算完之后，把裁剪框还原成操作前的**原图像素矩形**：立绘放大/缩小、平移时，
 * 框跟着一起放大/缩小、一起移动，始终套着同一块立绘区域，和立绘的相对位置不变。这样缩放/平移
 * 只负责看画面，不会顺手改掉保存的裁剪值（faceX / faceY / length），缩略图和成片里的头部比例
 * 也就不会变。
 *
 * <p>还有一个必须一起修的点：框被缩放到可见区域外时，库会把 `coordinates` 夹回可见区域
 * （`moveToPositionRestrictions`），表现为"一拖画面，框自己跳回来了"，相对位置又变了。
 * 还原整个 `coordinates` 就同时避免了这次夹取 —— 框允许待在区域外，位置只由用户拖框决定。
 *
 * <p>只接管"看画面"的缩放 / 平移：拖框改位置、改大小仍走库的默认规则（那才是改裁剪区域）。
 */
export const keepStencilImageRect: TransformImageAlgorithm = (
  state,
  settings,
  transform,
) => {
  const next = transformCropperState(state, settings, transform);

  // 旋转 / 翻转没有裁剪框跟随的语义，仍按库的默认规则调框
  const isViewTransform = Boolean(transform.scale || transform.move);
  if (!next || !isViewTransform) return next;
  if (!isInitializedState(state) || !isInitializedState(next)) return next;

  return { ...next, coordinates: { ...state.coordinates } };
};
