/**
 * @module 背景层级（z-order）
 *
 * 一条记录里的多张背景按 `record.bg` 数组的**顺序**叠放：**首项在画面最前，末项在最底层**。
 * 这与「立绘」「临时图片」是同一套约定——后端渲染时倒序遍历（末尾先画、首项后画），
 * 见 `RenderOfImage.renderFullScreenBackground`；前端预览几何
 * （`preview/previewLayout.ts` 的 `buildPreviewGeometry`）按同一顺序产出图层，
 * 所以预览、播放、导出三处的叠放完全一致。
 *
 * 「剧情编辑 → 背景」列表**按数组顺序显示**，因此列表越靠上 = 画面越靠前：
 * - **上移** = 与前一项交换（往前挪一层），列表首项不能再上移；
 * - **下移** = 与后一项交换（往后挪一层），列表末项不能再下移；
 * - 越界的判断收在这里（按钮的禁用态与 {@link moveBackgroundLayer} 共用 {@link canMoveBackgroundLayer}），
 *   即使从别的入口调用也不会把某一项挪出列表。
 *
 * 层级**不单独存字段**：数组顺序本身就是层级（与 `chars` / `tempImages` 一致），
 * 保存 / 加载、预览、播放、导出都直接复用它，旧工程不需要迁移；
 * 删除一项后，剩下各项的相对顺序天然保持不变。
 */
import type { BackgroundVisual } from "@types";

/** 调整方向：`up` = 往前挪一层（列表上移），`down` = 往后挪一层（列表下移） */
export type BackgroundLayerDirection = "up" | "down";

/**
 * @function 这张背景能不能往指定方向挪一层
 *
 * <p>首项（列表最上 = 画面最前）不能再上移，末项（列表最下 = 画面最后）不能再下移。
 * 面板里按钮的 `disabled` 与 {@link moveBackgroundLayer} 的越界判断共用这一条规则，
 * 不会出现"按钮亮着但点了没反应"或"按钮灰着却能挪动"。
 *
 * @param index     背景在数组里的下标（0 = 列表最上 = 画面最前）
 * @param direction 调整方向
 * @param total     背景总数
 * @returns 能挪返回 true
 */
export const canMoveBackgroundLayer = (
  index: number,
  direction: BackgroundLayerDirection,
  total: number,
): boolean => {
  if (!Number.isInteger(index) || index < 0 || index >= total) return false;
  return direction === "up" ? index > 0 : index < total - 1;
};

/**
 * @function 把一张背景上移 / 下移一层
 *
 * <p>层级就是数组顺序，所以"移动一层"等价于与相邻的那一项**交换位置**：
 * 上移 → 与前一项交换（画面里往前一层），下移 → 与后一项交换（画面里往后一层）。
 * 交换只改顺序，不改背景自己的缩放 / 位置 / 压暗等任何字段。
 *
 * @param backgrounds 当前背景列表（**不会被修改**：返回的是新数组）
 * @param index       要移动的背景下标
 * @param direction   调整方向
 * @returns 交换后的新数组；下标非法或已经在首 / 末位时返回 `null`（调用方什么都不做）
 */
export const moveBackgroundLayer = (
  backgrounds: BackgroundVisual[],
  index: number,
  direction: BackgroundLayerDirection,
): BackgroundVisual[] | null => {
  const total = backgrounds.length;
  if (!canMoveBackgroundLayer(index, direction, total)) return null;

  const target = direction === "up" ? index - 1 : index + 1;
  const next = [...backgrounds];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

/**
 * @function 新背景的默认插入位置
 *
 * <p>**追加到列表末尾 = 画面最底层**（与「立绘」「临时图片」的新增行为一致）：
 * 新加的素材不会把用户已经调好的背景瞬间盖住；想让它显示在前面，点卡片上的「↑」上移即可。
 *
 * @param backgrounds 当前背景列表（不会被修改）
 * @param background  新加的背景
 * @returns 追加后的新数组
 */
export const insertBackgroundLayer = (
  backgrounds: BackgroundVisual[],
  background: BackgroundVisual,
): BackgroundVisual[] => [...backgrounds, background];
