/**
 * @module 镜头自动跟随说话人（纯运算）
 *
 * 「摄像机」页签「构图辅助」里的工程级开关（`projectSettings.cameraFollowSpeaker`）打开后，
 * 用户**移动说话人的立绘**或**切换说话人**时，这里重新算一次镜头位置，把说话人拉回画面：
 *
 * | 规则 | 实现 |
 * | --- | --- |
 * | 只在两种情况下跟随 | 背景图片比 16:9 更宽 / 镜头被推进（zoom > 1），**并且**说话人已经不在可视范围 |
 * | 水平尽量居中 | 取景中心 = 说话人立绘矩形的水平中心（拿不到原图尺寸时用头部框的中心） |
 * | 不越出背景 | 镜头框整体夹进背景图片的实际范围；角色在边缘时镜头贴着背景边（复用 {@link clampCamera}） |
 * | 垂直只做最小必要调整 | 不强制居中：只在头部已经跑出取景框时，平移"刚好够用"的那一点 |
 * | 手动优先 | 本模块只在"移动立绘 / 切换说话人"这两个动作里被调用一次；其它任何操作（含手动改镜头、切页签、拖背景）都不会调用它 |
 *
 * <p>几何全部复用 `previewLayout`（世界矩形 / 并集 / 夹取）与 `cameraView`（镜头归一化 / 取景框），
 * 这里不重写任何公式；所有函数都是纯函数，方便单测（见 `cameraFollow.test.ts`）。
 *
 * @see previewLayout.backgroundWorldRect 背景在世界里的实际绘制矩形
 * @see previewLayout.characterHeadBox  说话人头部（脸框）方框
 * @see previewLayout.clampCamera       把镜头框夹进背景范围
 * @see cameraView.cameraRectOf         取景框（镜头看到的那一块）
 * @see cameraView.normalizeCamera      镜头归一化（缺省 = 恒等镜头）
 */
import type { CharacterVisual, Record as PlotRecord } from "@types";
import {
  CANVAS_WORLD_RECT,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  backgroundWorldRect,
  characterHeadBox,
  characterLayout,
  characterWorldRect,
  clampCamera,
  sceneLayerKey,
  unionRect,
} from "./previewLayout";
import type { ImageSize, PreviewRect, RecordCamera } from "./previewLayout";
import { cameraRectOf, normalizeCamera } from "./cameraView";

/** 16:9 的宽高比：需求里的"背景图片比例大于 16:9"就是与它比 */
const ASPECT_16_9 = DESIGN_WIDTH / DESIGN_HEIGHT;

/** 判定"镜头没变"的容差（设计画布像素）：读数按整像素显示，差不到 1px 就不写回记录 */
const EPSILON = 1;

/** 判定"镜头推进"的容差：zoom 略大于 1 才算推进（1 附近的小数来自浮点误差） */
const ZOOM_EPSILON = 1e-3;

/**
 * 原图尺寸查询：key 与 {@link sceneLayerKey} 一致（`background:0` / `character:1`）。
 * 返回 undefined 表示这张图还没加载出来——调用方按"拿不到尺寸"的兜底路径处理。
 */
export type ImageSizeLookup = (key: string) => ImageSize | undefined;

/** 当前说话人在 `record.chars` 里的位置 */
export interface SpeakerCharacter {
  /** 在 `chars` 数组里的下标（= 图层 key 的 `character:i`） */
  index: number;
  character: CharacterVisual;
}

/**
 * @function 取说话人的角色 ID
 *
 * <p>说话人取自 `dialogue.speakerC[0]`（与后端"说话人名片"同源）。
 * 旁白 / 自由文本 / 手填名字的临时说话人都没有 `speakerC`，返回空串。
 *
 * @param record 记录
 * @return 角色 ID；没有说话人时为空串
 */
export function speakerCharacterIDOf(
  record: PlotRecord | null | undefined,
): string {
  const dialogue = record?.dialogue;
  if (!dialogue) return "";
  // 自由文本：说话人不上屏（见 TextProperties 的 FREE_TEXT_LABEL），没有可跟随的对象
  if (dialogue.freeText === true) return "";
  return (dialogue.speakerC ?? [])[0]?.characterID ?? "";
}

/**
 * @function 取当前说话人的立绘
 *
 * @param record 记录
 * @return 立绘在 `chars` 里的下标与元素；没有说话人或立绘列表里没有他/她时返回 null
 */
export function speakerCharacterOf(
  record: PlotRecord | null | undefined,
): SpeakerCharacter | null {
  const characterID = speakerCharacterIDOf(record);
  if (!characterID) return null;

  const chars = record?.chars ?? [];
  for (let index = 0; index < chars.length; index += 1) {
    if (chars[index]?.chara?.characterID === characterID) {
      return { index, character: chars[index] };
    }
  }
  return null;
}

/**
 * @function 说话人身份（"切换说话人"的判定依据）
 *
 * <p>角色 ID、手填名字、旁白 / 自由文本的切换都算一次"换人"，所以签名里三者都带上。
 * 只比 `speakerC` 不够：手动输入说话人名字时 `speakerC` 会被清空，但说话人确实变了。
 *
 * @param record 记录
 * @return 稳定的签名字符串（没有说话人时为空串）
 */
export function speakerSignature(record: PlotRecord | null | undefined): string {
  const dialogue = record?.dialogue;
  if (!dialogue) return "";
  if (dialogue.freeText === true) return "freeText";

  const characterID = speakerCharacterIDOf(record);
  if (characterID) return `id:${characterID}`;
  return `name:${(dialogue.speakerName ?? "").trim()}`;
}

/**
 * @function 立绘几何签名（"移动说话人的立绘"的判定依据）
 *
 * <p>只关心**摆位**：位置、用户缩放、头部裁剪框。压暗、动画装备、情绪动画这些
 * 都不改变立绘在画面里的位置，所以不算"移动"，不会触发自动跟随。
 *
 * @param character 立绘视觉元素
 * @return 签名字符串（无立绘时为空串）
 */
export function characterGeometrySignature(
  character: CharacterVisual | null | undefined,
): string {
  if (!character) return "";
  const layout = characterLayout(character);
  return [
    Math.round(layout.x),
    Math.round(layout.y),
    layout.renderScale.toFixed(4),
  ].join("|");
}

/** 自动跟随的触发原因：切换了说话人 / 挪动了说话人的立绘 */
export type FollowTrigger = "speaker" | "portrait";

/**
 * @function 本次改动是否属于"自动跟随"的触发时机
 *
 * <p>需求只列了两个动作：**移动说话人的立绘**、**切换说话人**。其余操作（改台词、拖背景、
 * 改压暗、调镜头…）一律不触发。判定用"改动前后的记录"做差，所以无论是预览里拖、
 * 「立绘」页签里推滑杆，还是别的地方写回同一条记录，效果都一样。
 *
 * <p>新增 / 删除说话人的立绘**不算**"移动"（需求未列），此时返回 null。
 *
 * @param previous 改动前的记录
 * @param next     改动后的记录
 * @return 触发原因；不是触发时机时返回 null
 */
export function followTriggerOf(
  previous: PlotRecord | null | undefined,
  next: PlotRecord | null | undefined,
): FollowTrigger | null {
  if (!previous || !next) return null;
  if (speakerSignature(previous) !== speakerSignature(next)) return "speaker";

  const before = speakerCharacterOf(previous);
  const after = speakerCharacterOf(next);
  // 同一位说话人、同一张立绘（按下标认）：只有几何真的变了才算"移动"
  if (!before || !after || before.index !== after.index) return null;
  return characterGeometrySignature(before.character) ===
    characterGeometrySignature(after.character)
    ? null
    : "portrait";
}

/**
 * @function 背景图片在世界里的实际范围
 *
 * <p>= 所有背景绘制矩形的并集（含 `posX/posY` 偏移与 `scale`，与后端
 * {@code BackgroundVisual.getDrawBounds} 同一套换算）。自动跟随要求"镜头框完全落在
 * 背景图片范围内"，夹取范围就是它。
 *
 * <p>拿不到任何背景尺寸时退回画布矩形（1920×1080）：没有背景就按"整块画布就是背景"处理，
 * 这样镜头至少不会跑到画布外太远。
 *
 * @param record 记录
 * @param sizeOf 背景原图尺寸查询（key = `background:i`）
 * @return 背景范围（世界坐标）
 */
export function backgroundBoundsOf(
  record: PlotRecord | null | undefined,
  sizeOf: ImageSizeLookup = () => undefined,
): PreviewRect {
  let bounds: PreviewRect | null = null;
  (record?.bg ?? []).forEach((background, index) => {
    const size = sizeOf(sceneLayerKey("background", index));
    if (!size) return;
    const rect = backgroundWorldRect(background, size);
    bounds = bounds === null ? rect : unionRect(bounds, rect);
  });
  return bounds ?? CANVAS_WORLD_RECT;
}

/**
 * @function 是否有"比 16:9 更宽"的背景（需求触发条件 1）
 *
 * <p>背景是等比 contain 进 `1920×scale × 1080×scale` 的，所以绘制矩形的宽高比与原图一致，
 * 直接看原图比例即可。任一张背景满足就算——一条记录叠了多张背景时，
 * 只要有一张是宽图，用户就可能把人物摆到取景之外。
 *
 * @param record 记录
 * @param sizeOf 背景原图尺寸查询
 * @return 是否存在宽于 16:9 的背景
 */
export function hasWideBackground(
  record: PlotRecord | null | undefined,
  sizeOf: ImageSizeLookup = () => undefined,
): boolean {
  return (record?.bg ?? []).some((_, index) => {
    const size = sizeOf(sceneLayerKey("background", index));
    if (!size || size.width <= 0 || size.height <= 0) return false;
    return size.width / size.height > ASPECT_16_9 + 1e-6;
  });
}

/**
 * @function 说话人立绘矩形（世界坐标）
 *
 * <p>有原图尺寸就用真实绘制矩形（{@link characterWorldRect}，与后端逐像素一致），
 * 否则退回头部方框——它由裁剪框 + 身高推导，不需要原图尺寸，中心也落在人物身上。
 *
 * @param character 立绘视觉元素
 * @param size      立绘原图尺寸（拿不到时不传）
 * @return 立绘矩形（世界坐标）
 */
export function speakerBodyRect(
  character: CharacterVisual,
  size?: ImageSize,
): PreviewRect {
  return size ? characterWorldRect(character, size) : characterHeadBox(character);
}

/** 自动跟随没生效的原因（给日志、提示与单测用） */
export type AutoFollowReason =
  /** 工程级开关没勾 */
  | "disabled"
  /** 人格故事模式：立绘本来就不渲染，跟随没有意义 */
  | "not-plot"
  /** 不是"移动立绘 / 切换说话人" */
  | "no-trigger"
  /** 没有说话人（旁白 / 自由文本 / 手填名字） */
  | "no-speaker"
  /** 说话人在立绘列表里没有立绘（跳过居中逻辑） */
  | "no-portrait"
  /** 说话人本来就在可视范围内 */
  | "in-view"
  /** 说话人在画面外，但触发条件都不成立（背景不宽、镜头也没推进） */
  | "conditions-not-met"
  /** 算出来的镜头与现在一致（已经贴边 / 取景框比背景还大） */
  | "unchanged"
  /** 已重新计算并写回 */
  | "followed";

/** {@link autoFollowSpeaker} 的入参 */
export interface AutoFollowInput {
  /** 本次改动**之后**的记录 */
  record: PlotRecord;
  /** 本次改动**之前**的记录（用来判断是否属于触发时机；没有就不跟随） */
  previous?: PlotRecord | null;
  /** 工程级开关是否勾选（`projectSettings.cameraFollowSpeaker`） */
  enabled: boolean;
  /** 是否剧情模式：人格故事（plot = false）不渲染立绘，不跟随 */
  plot?: boolean;
  /** 背景 / 立绘原图尺寸查询 */
  sizeOf?: ImageSizeLookup;
}

/** {@link autoFollowSpeaker} 的结果 */
export interface AutoFollowOutcome {
  /** 要写回记录的对象：没跟随就是入参本身（引用不变） */
  record: PlotRecord;
  /** 是否真的改了镜头 */
  applied: boolean;
  /** 为什么跟随 / 为什么没跟随 */
  reason: AutoFollowReason;
  /** 触发原因（applied 时才有意义） */
  trigger?: FollowTrigger;
}

/**
 * @function 按"镜头自动跟随说话人"重算一条记录的镜头
 *
 * <p>完整规则（全部在这里，调用方只负责传当前设置）：
 * <ol>
 *   <li>开关没勾、人格故事、不是"移动立绘 / 切换说话人" → 原样返回；</li>
 *   <li>说话人没有立绘（旁白、自由文本、角色不在立绘列表里）→ 跳过水平居中，原样返回；</li>
 *   <li>说话人本来就在取景框里 → 不动（"两种条件均不成立时不触发"）；</li>
 *   <li>镜头框里找不到说话人，则必须再有"背景宽于 16:9"或"镜头被推进（zoom > 1）"之一；</li>
 *   <li>水平：取景中心对到立绘矩形的水平中心；垂直：只做最小必要调整（头部跑出取景框时才平移）；</li>
 *   <li>最后把镜头框整体夹进背景图片范围（见 {@link clampCamera}）：角色在边缘时镜头贴边、不越出背景。</li>
 * </ol>
 *
 * <p>镜头缩放（zoom）**不改**：自动跟随只对齐位置，推拉始终由用户决定。
 * 记录里已经有运镜终点（`camera.to`）时，终点跟着平移同样的位移（并同样夹进背景），
 * 保留用户编排的运镜幅度与时长，而不是把整条运镜丢掉。
 *
 * @param input 记录 / 改动前记录 / 开关 / 原图尺寸查询
 * @return 新记录与原因；`applied = false` 时 `record` 就是入参本身
 */
export function autoFollowSpeaker({
  record,
  previous,
  enabled,
  plot = true,
  sizeOf = () => undefined,
}: AutoFollowInput): AutoFollowOutcome {
  const skip = (reason: AutoFollowReason): AutoFollowOutcome => ({
    record,
    applied: false,
    reason,
  });

  if (!enabled) return skip("disabled");
  if (!plot) return skip("not-plot");

  const trigger = followTriggerOf(previous, record);
  if (!trigger) return skip("no-trigger");

  // 只有"角色本人站着"才有立绘可跟：旁白 / 自由文本 / 手填名字都没有 speakerC
  if (!speakerCharacterIDOf(record)) return skip("no-speaker");
  const speaker = speakerCharacterOf(record);
  if (!speaker) return skip("no-portrait");

  const camera = normalizeCamera(record.camera);
  const frame = cameraRectOf(camera);
  // 用头部（脸框）判断"看不看得见"：整张立绘通常比取景框还高，逐像素完全框住做不到也没必要
  const head = characterHeadBox(speaker.character);
  const face = { x: head.x + head.w / 2, y: head.y + head.h / 2 };
  const inView =
    face.x >= frame.x &&
    face.x <= frame.x + frame.w &&
    face.y >= frame.y &&
    face.y <= frame.y + frame.h;
  if (inView) return skip("in-view");

  // 需求的触发条件：背景比 16:9 更宽 / 镜头被推进（取景框比画布小）
  const zoomedIn = camera.zoom > 1 + ZOOM_EPSILON;
  if (!zoomedIn && !hasWideBackground(record, sizeOf)) {
    return skip("conditions-not-met");
  }

  // 水平：尽量让立绘居中；垂直：先保持现有取景，头部出框时只补最小必要的那一点
  const body = speakerBodyRect(
    speaker.character,
    sizeOf(sceneLayerKey("character", speaker.index)),
  );
  let centerX = body.x + body.w / 2;
  let centerY = camera.centerY;
  if (face.y < frame.y) {
    centerY -= frame.y - face.y;
  } else if (face.y > frame.y + frame.h) {
    centerY += face.y - (frame.y + frame.h);
  }

  // 镜头框整体夹进背景图片范围（框比背景还大时与背景中心对齐，见 clampCamera）
  const bounds = backgroundBoundsOf(record, sizeOf);
  const followed = clampCamera({ centerX, centerY, zoom: camera.zoom }, bounds);
  const shiftX = followed.centerX - camera.centerX;
  const shiftY = followed.centerY - camera.centerY;
  // 差不到 1px 就算没变：背景矩形是取整过的，算出来的中心和原来的可能差半像素
  if (Math.abs(shiftX) < EPSILON && Math.abs(shiftY) < EPSILON) {
    return skip("unchanged");
  }

  // 已编排的运镜（起点 → 终点）跟着平移同样的位移，轨迹与时长都保留
  const nextTo = camera.to
    ? clampCamera(
        {
          centerX: camera.to.centerX + shiftX,
          centerY: camera.to.centerY + shiftY,
          zoom: camera.to.zoom,
        },
        bounds,
      )
    : null;

  const nextCamera: RecordCamera = {
    ...camera,
    centerX: followed.centerX,
    centerY: followed.centerY,
    ...(nextTo ? { to: nextTo } : {}),
  };

  return {
    record: { ...record, camera: nextCamera },
    applied: true,
    reason: "followed",
    trigger,
  };
}
