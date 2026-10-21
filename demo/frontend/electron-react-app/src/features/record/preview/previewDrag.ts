/**
 * @module 预览拖拽的位置语义与换算
 *
 * 拖拽只做一件事：把鼠标位移换算成**设计画布像素**，再写进记录里那个元素的位置字段。
 * 难点在于三类元素的位置语义并不一样：
 *
 * | 图层 | 记录里的字段 | 语义 |
 * | --- | --- | --- |
 * | 立绘 `character` | `adjX` / `adjY` | 相对「身高锚点」的**偏移**（`posX/posY` 由后端重算，前端不写） |
 * | 背景 `background` | `posX` / `posY` | 背景**中心**相对画面中心的偏移 |
 * | 临时图片 `tempImage` | `posX` / `posY` | 图片**左上角**的绝对坐标 |
 *
 * 三者都存设计画布像素、都不夹取上下限（与属性面板的滑杆/数值框保持一致）。
 * 把"读/写"和"换算"都做成纯函数，拖拽组件只负责指针事件。
 */
import type { Record as PlotRecord } from "@types";
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  SCENE_SCALE,
  type PreviewLayerKind,
} from "./previewLayout";

/** 可以用鼠标拖动的图层种类 */
export type DraggableKind = "character" | "background" | "tempImage";

/** 设计画布坐标上的一个点（立绘=偏移量，背景/临时图片=坐标） */
export interface DragPoint {
  x: number;
  y: number;
}

/** 该图层是否可拖动（对话框/名片/地点牌这些 UI 层不行） */
export const isDraggableLayer = (kind: PreviewLayerKind): kind is DraggableKind =>
  kind === "character" || kind === "background" || kind === "tempImage";

/** 拖动阈值（CSS 像素）：小于它按"点击"处理，避免点一下就把元素挪 1px */
export const DRAG_THRESHOLD_PX = 3;

/** 数值兜底：非数字按 0（旧工程可能缺字段） */
const num = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

/**
 * 读取某图层当前的位置。
 *
 * @param record 当前记录
 * @param kind   图层种类
 * @param index  在所属数组里的下标
 * @returns 位置；下标越界 / 该种类不可拖时返回 null
 */
export function readLayerPosition(
  record: PlotRecord | null | undefined,
  kind: PreviewLayerKind,
  index: number,
): DragPoint | null {
  if (!record || index < 0) return null;

  if (kind === "character") {
    const character = (record.chars ?? [])[index];
    if (!character) return null;
    return { x: num(character.adjX), y: num(character.adjY) };
  }

  if (kind === "background") {
    const background = (record.bg ?? [])[index];
    if (!background) return null;
    return { x: num(background.posX), y: num(background.posY) };
  }

  if (kind === "tempImage") {
    const temp = (record.tempImages ?? [])[index];
    if (!temp) return null;
    return { x: num(temp.posX), y: num(temp.posY) };
  }

  return null;
}

/**
 * 把位置写回记录（返回**新记录**，不改入参）。
 *
 * <p>立绘只写 `adjX/adjY`：`posX/posY` 是后端 `CharacterVisual.updatePos()` 的派生值，
 * 前端写了也会被覆盖，留着反而让人以为可以改。
 *
 * @param record 当前记录
 * @param kind   图层种类
 * @param index  下标
 * @param point  新位置（设计画布像素，内部四舍五入成整数）
 * @returns 新记录；下标越界 / 不可拖时返回 null
 */
export function writeLayerPosition(
  record: PlotRecord | null | undefined,
  kind: PreviewLayerKind,
  index: number,
  point: DragPoint,
): PlotRecord | null {
  if (!record || index < 0) return null;
  const x = Math.round(point.x);
  const y = Math.round(point.y);

  if (kind === "character") {
    const chars = record.chars ?? [];
    if (!chars[index]) return null;
    const nextChars = [...chars];
    nextChars[index] = { ...chars[index], adjX: x, adjY: y };
    return { ...record, chars: nextChars };
  }

  if (kind === "background") {
    const bg = record.bg ?? [];
    if (!bg[index]) return null;
    const nextBg = [...bg];
    nextBg[index] = { ...bg[index], posX: x, posY: y };
    return { ...record, bg: nextBg };
  }

  if (kind === "tempImage") {
    const tempImages = record.tempImages ?? [];
    if (!tempImages[index]) return null;
    const nextTemp = [...tempImages];
    nextTemp[index] = { ...tempImages[index], posX: x, posY: y };
    return { ...record, tempImages: nextTemp };
  }

  return null;
}

/**
 * 舞台 CSS 位移 → 设计画布位移。
 *
 * <p>换算链：世界像素 ×(0.8 × 相机 zoom) = 设计画布像素；设计画布像素 ×(舞台宽/1920) = 舞台 CSS 像素。
 * 所以反过来：`世界位移 = CSS 位移 × 1920 / 舞台宽 / (0.8 × zoom)`。
 *
 * <p>横竖分别用宽度/高度的比例：正常情况下舞台严格等比（两者等价），
 * 万一舞台被拉伸（极端 CSS 情况）也不会让位移出现轴向偏差。
 *
 * @param cssDelta 舞台上的位移（CSS 像素）
 * @param stageSize 舞台的 CSS 尺寸
 * @param cameraZoom 相机 zoom（identity = 1；C1 之后 >1 时同样的手势移动更少的世界像素）
 */
export function worldDeltaFromStage(
  cssDelta: DragPoint,
  stageSize: { width: number; height: number },
  cameraZoom = 1,
): DragPoint {
  const zoom = Number.isFinite(cameraZoom) && cameraZoom > 0 ? cameraZoom : 1;
  if (stageSize.width <= 0 || stageSize.height <= 0) return { x: 0, y: 0 };

  const worldPerCssX = DESIGN_WIDTH / stageSize.width / (SCENE_SCALE * zoom);
  const worldPerCssY = DESIGN_HEIGHT / stageSize.height / (SCENE_SCALE * zoom);
  return { x: cssDelta.x * worldPerCssX, y: cssDelta.y * worldPerCssY };
}

/**
 * 按 Shift 锁定轴向：位移大的那个轴生效，另一个轴归零。
 *
 * @param delta 设计画布位移
 */
export function lockAxis(delta: DragPoint): DragPoint {
  return Math.abs(delta.x) >= Math.abs(delta.y)
    ? { x: delta.x, y: 0 }
    : { x: 0, y: delta.y };
}
