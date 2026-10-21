/**
 * @module 预览几何（纯函数）
 *
 * 把「一条记录」换算成它在预览图上的**像素矩形**，供三类功能共用：
 * 1. 交互层的命中检测与选中框（点击立绘/背景/文字）；
 * 2. 拖拽时的 DOM 场景层（跟手重绘，不等后端）；
 * 3. 对位自检（把所有矩形叠在预览栅格图上，肉眼验证是否严丝合缝）。
 *
 * <h3>三层坐标系（与后端渲染管线一一对应）</h3>
 * <pre>
 *   世界空间（可以远大于 1920×1080）
 *        背景 / 立绘 / 临时图片          ← 这里的坐标由本模块算出
 *            │  worldToScene（摄像机取景，identity 时为等比恒等）
 *            ▼
 *   场景画布 1920×1080
 *            │  ×0.8 并偏移 (192, 108)     ← RenderOfImage.PLOT_SCENE_SCALE
 *            ▼
 *   设计画布 1920×1080
 *            │  边框 / 对话框 / 名片 / 地点牌 / 台词文字（**不受摄像机影响**）
 *            │  ×(W/1920, H/1080)
 *            ▼
 *   预览图 / 视频帧 W×H
 * </pre>
 *
 * <h3>为什么要在前端重算一遍</h3>
 * 预览图是后端渲染的栅格图，没有 DOM 结构，点不到任何东西。要能点中元素，
 * 就必须知道它们在图上的矩形；公式的**唯一真源**是后端
 * {@code CharacterVisual.updatePos()} 与 {@code BackgroundVisual.getDrawBounds()}，
 * 本模块是它们的逐行镜像。改动这里的常量/公式时，必须同步
 * {@code RenderOfImage}、{@code CharacterVisual}、{@code BackgroundVisual}、
 * {@code ProjectConfig}，否则热区会和画面错位（用调试叠框能立刻看出来）。
 *
 * @see com.lbc_plot.render.video.CharacterVisual#updatePos()
 * @see com.lbc_plot.render.video.BackgroundVisual#getDrawBounds(int, int)
 * @see com.lbc_plot.render.engine.RenderOfImage#renderPre(Record, boolean, int, int)
 */
import type {
  BackgroundVisual,
  CharacterVisual,
  Record as PlotRecord,
  RecordCamera,
  TempImageVisual,
} from "@types";
import {
  DESIGN_CANVAS_HEIGHT,
  DESIGN_CANVAS_WIDTH,
  normalizeBackgroundScale,
  normalizeScale,
} from "../properties/visualCoordinates";

/** 记录里的摄像机类型（定义在 @types，这里转出让预览模块不必都去 import @types） */
export type { RecordCamera } from "@types";

/* ============================ 设计常量 ============================ */

/** 设计画布尺寸（= 后端 ProjectConfig.VIDEO_WIDTH / VIDEO_HEIGHT） */
export const DESIGN_WIDTH = DESIGN_CANVAS_WIDTH;
export const DESIGN_HEIGHT = DESIGN_CANVAS_HEIGHT;

/**
 * 场景层在合成第二趟里的缩放与偏移：
 * {@code composer.addImageLayerScaled(coImage, designW / 10, designH / 10, PLOT_SCENE_SCALE)}。
 * 剧情模式与人格故事模式**都**做这一步，所以两者共用同一套换算。
 */
export const SCENE_SCALE = 0.8;
export const SCENE_OFFSET_X = DESIGN_WIDTH / 10;
export const SCENE_OFFSET_Y = DESIGN_HEIGHT / 10;

/** 立绘定位基准：与 ProjectConfig.DEFAULT_CHARACTER_* / Pixels_per_centimeter 一致 */
const CHARACTER_HEAD_LENGTH = 183; // DEFAULT_CHARACTER_HEAD_LENGTH
const CHARACTER_HEIGHT = 171; // DEFAULT_CHARACTER_HEIGHT（厘米）
const CHARACTER_HEIGHT_PIXELS = 221; // DEFAULT_CHARACTER_HEIGHT_Pixels
const PIXELS_PER_CENTIMETER = 12;

/** 旁白：后端 Dialogue.DEFAULT_NARRATOR / ProjectConfig.NARRATION_ID */
const NARRATOR_NAME = "旁白";
const NARRATOR_ID = "narrator";

/**
 * UI 素材位置与缩放：{@code RenderOfImage.addUILayers} 里写死的量。
 * 原图尺寸优先用运行时读到的真实值（素材可能被替换），读不到时回退这里实测的像素数。
 */
const DIALOG_BOX_POS = { x: 264, y: 826, scale: 1.46 };
const DIALOG_BOX_FALLBACK_SIZE: ImageSize = { width: 1007, height: 174 };
const LOCATION_POS = { x: -2, y: -117, scale: 0.41 };
const LOCATION_FALLBACK_SIZE: ImageSize = { width: 998, height: 648 };
/**
 * 角色名片：{@code addImageLayerScaled(cardImage, -26, 789, 0.28f)}。
 *
 * <p>名片图是后端按「说话人名字 + 阵营 + 两个颜色」现渲染并**按内容裁剪**的
 * （RenderOfImage.renderCharaNameUI → ImageCropper.cropTransparentAreas），尺寸只随名字宽度
 * 轻微变化。实测三个不同角色在 1920×1080 下渲染出来的名片可见区域都是 331~334×144，
 * 对应裁剪后的原图约 1275×528、绘制尺寸 357×148，所以这里用固定值兜底：
 * 相对误差 <1%，对「点名片选中」这种区域级命中完全够用。
 */
const NAME_PLATE_POS = { x: -26, y: 789, scale: 0.28 };
const NAME_PLATE_FALLBACK_SIZE: ImageSize = { width: 1275, height: 528 };

/** 摄像机推拉范围（与后端 Camera 的 clamp 保持一致） */
export const MIN_CAMERA_ZOOM = 0.5;
export const MAX_CAMERA_ZOOM = 4;

/* ============================ 类型 ============================ */

/** 像素尺寸（原图 naturalWidth / naturalHeight） */
export interface ImageSize {
  width: number;
  height: number;
}

/** 矩形（左上角 + 宽高） */
export interface PreviewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 摄像机：把世界坐标映射到场景画布。
 * identity（960, 540, 1）时输出与加摄像机之前逐像素一致。
 */

/** 默认（等同没有摄像机）：旧工程全部用它 */
export const DEFAULT_CAMERA: RecordCamera = {
  centerX: DESIGN_WIDTH / 2,
  centerY: DESIGN_HEIGHT / 2,
  zoom: 1,
};

/** 场景层（受摄像机影响、需要原图尺寸才能算矩形）的三种种类 */
export type SceneLayerKind = "background" | "character" | "tempImage";

/**
 * 场景图层 key：`background:0` / `character:1` / `tempImage:0`。
 * 几何模块与「key → 原图地址」映射（previewAssets）必须用同一个生成函数。
 */
export const sceneLayerKey = (kind: SceneLayerKind, index: number): string =>
  `${kind}:${index}`;

/** 预览图层的种类 */
export type PreviewLayerKind =
  | "background"
  | "character"
  | "tempImage"
  | "dialogBox"
  | "namePlate"
  | "locationPlate";

/** 一个可绘制 / 可命中的预览图层 */
export interface PreviewLayer {
  /** 稳定 key：`background:0` / `character:1` / `tempImage:0` / `dialogBox` … */
  key: string;
  kind: PreviewLayerKind;
  /** 在所属数组里的下标；UI 图层为 -1 */
  index: number;
  /** 悬浮标签与调试叠框上的文字（`立绘 1 · 罗佳`） */
  label: string;
  /** 绘制顺序，命中检测时从大到小找第一个包含点击点的图层 */
  z: number;
  /** `world` = 世界坐标（受摄像机影响）；`design` = 设计画布坐标（不受摄像机影响） */
  space: "world" | "design";
  /** 原始坐标（world 或 design），摄像机模式直接用 */
  baseRect: PreviewRect;
  /** 预览图像素坐标（已含摄像机 + 0.8 场景变换 + 输出分辨率缩放） */
  outRect: PreviewRect;
  /** 是否压暗（立绘 / 临时图片的 dim 字段），DOM 场景层用它还原滤镜 */
  dim?: boolean;
}

/** 一次几何计算的完整结果 */
export interface PreviewGeometry {
  layers: PreviewLayer[];
  /** 世界参考框：各背景「归位框」∪ 画布矩形。稳定，不随背景拖动变化 */
  worldRef: PreviewRect;
  /** 世界（含一帧余地）：摄像机可活动范围 */
  worldBox: PreviewRect;
  camera: RecordCamera;
  /** 预览图尺寸（= 设置里的视频尺寸） */
  output: ImageSize;
  /** 缺少原图尺寸、因而算不出矩形的图层 key */
  missingSizes: string[];
}

/** {@link buildPreviewGeometry} 的入参 */
export interface PreviewGeometryOptions {
  /** 是否剧情模式：false（人格故事）时后端不渲染立绘 */
  plot: boolean;
  /** 设置页选的输出宽高（= 预览图尺寸） */
  videoWidth: number;
  videoHeight: number;
  /** 摄像机；缺省 = identity */
  camera?: RecordCamera;
  /**
   * 取某个场景图层原图的像素尺寸（key 同 {@link PreviewLayer.key}）。
   * 返回 undefined 表示还没加载到——该图层会被跳过，并记进 `missingSizes`。
   */
  sizeOf?: (key: string) => ImageSize | undefined;
  /** 对话框原图尺寸；缺省用内置实测值 */
  dialogBoxSize?: ImageSize;
  /** 角色名片原图尺寸；缺省用内置实测值（名片由后端现渲染，尺寸只随名字轻微变化） */
  namePlateSize?: ImageSize;
  /** 地点牌原图尺寸；缺省用内置实测值 */
  locationSize?: ImageSize;
}

/* ============================ 基础工具 ============================ */

const finite = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const safeInt = (value: unknown, fallback: number): number =>
  Math.round(finite(value, fallback));

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** 世界/设计坐标矩形 → 预览图像素坐标（只按输出分辨率缩放，不加场景变换） */
const scaleRect = (rect: PreviewRect, kx: number, ky: number): PreviewRect => ({
  x: rect.x * kx,
  y: rect.y * ky,
  w: rect.w * kx,
  h: rect.h * ky,
});

/* ============================ 各图层的世界矩形 ============================ */

/**
 * 立绘的世界矩形（左上角 + 缩放后的绘制尺寸）。
 *
 * <p>与 {@code CharacterVisual.updatePos()} 逐行对应：
 * 裁剪框（faceX, faceY, length）决定缩放与锚点，posX/posY 是缩放后立绘的**左上角**。
 * 用户缩放 {@code scale} 以裁剪框中心为基准，所以 scale=1 时结果与旧公式完全一致。
 *
 * @param character 记录里的立绘视觉元素（chara / portrait / adjX / adjY / scale）
 * @param imageSize 立绘原图像素尺寸（缺了就画不出来，调用方负责跳过）
 */
export function characterWorldRect(
  character: CharacterVisual,
  imageSize: ImageSize,
): PreviewRect {
  const portrait = character.portrait;
  const length = finite(portrait?.length, 0) > 0
    ? finite(portrait.length, CHARACTER_HEAD_LENGTH)
    : CHARACTER_HEAD_LENGTH;
  const faceX = Math.max(0, finite(portrait?.faceX, 0));
  const faceY = Math.max(0, finite(portrait?.faceY, 0));
  const height = finite(character?.chara?.height, CHARACTER_HEIGHT);

  const baseScale = CHARACTER_HEAD_LENGTH / length; // portraitScale()
  const renderScale = baseScale * normalizeScale(character.scale); // getRenderScale()
  const halfLength = length / 2;

  const anchorX =
    DESIGN_WIDTH / 2 + finite(portrait?.adjX, 0) + finite(character.adjX, 0);
  // Java: (int)((DEFAULT_CHARACTER_HEIGHT - height) * Pixels_per_centimeter) —— 向零截断
  const anchorY =
    CHARACTER_HEIGHT_PIXELS +
    Math.trunc((CHARACTER_HEIGHT - height) * PIXELS_PER_CENTIMETER) +
    finite(portrait?.adjY, 0) +
    finite(character.adjY, 0);

  const x = Math.round(
    anchorX + halfLength * baseScale - (faceX + halfLength) * renderScale,
  );
  const y = Math.round(
    anchorY + halfLength * baseScale - (faceY + halfLength) * renderScale,
  );

  return {
    x,
    y,
    // 后端用 RenderQualityUtils.scaleImageHighQuality(image, scale)：尺寸取四舍五入
    w: Math.max(1, Math.round(imageSize.width * renderScale)),
    h: Math.max(1, Math.round(imageSize.height * renderScale)),
  };
}

/**
 * 背景在世界里的绘制矩形。
 *
 * <p>与 {@code BackgroundVisual.getDrawBounds(1920, 1080)} 完全一致：
 * 先按 scale 把画布放大成目标框，再让原图等比「完整放进」目标框（contain），
 * 最后以画布中心为基准加 posX/posY 偏移。
 *
 * @param background 记录里的背景视觉元素
 * @param imageSize  背景原图像素尺寸
 * @param withOffset false = 忽略 posX/posY（用于算「归位框」，见 {@link worldRefOf}）
 */
export function backgroundWorldRect(
  background: BackgroundVisual,
  imageSize: ImageSize,
  withOffset = true,
): PreviewRect {
  const scale = normalizeBackgroundScale(background.scale);
  const targetWidth = Math.max(1, Math.round(DESIGN_WIDTH * scale));
  const targetHeight = Math.max(1, Math.round(DESIGN_HEIGHT * scale));
  const fit = Math.min(
    targetWidth / Math.max(1, imageSize.width),
    targetHeight / Math.max(1, imageSize.height),
  );
  const w = Math.max(1, Math.round(imageSize.width * fit));
  const h = Math.max(1, Math.round(imageSize.height * fit));
  const offsetX = withOffset ? safeInt(background.posX, 0) : 0;
  const offsetY = withOffset ? safeInt(background.posY, 0) : 0;

  return {
    x: Math.round((DESIGN_WIDTH - w) / 2) + offsetX,
    y: Math.round((DESIGN_HEIGHT - h) / 2) + offsetY,
    w,
    h,
  };
}

/**
 * 临时图片的世界矩形：posX/posY 是左上角，尺寸 = 原图 × scale。
 *
 * <p>注意后端 {@code addImageLayerScaled} 对 scale **不做上下限**（前端的滑杆才夹到
 * 0.1~3.0），所以这里也照原值缩，保证与渲染一致。
 */
export function tempImageWorldRect(
  temp: TempImageVisual,
  imageSize: ImageSize,
): PreviewRect {
  const scale = finite(temp.scale, 1) > 0 ? finite(temp.scale, 1) : 1;
  return {
    x: safeInt(temp.posX, 0),
    y: safeInt(temp.posY, 0),
    w: Math.max(1, Math.round(imageSize.width * scale)),
    h: Math.max(1, Math.round(imageSize.height * scale)),
  };
}

/* ============================ 世界边界 ============================ */

/** 两个矩形的并集 */
export function unionRect(a: PreviewRect, b: PreviewRect): PreviewRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

/** 画布矩形（世界坐标），世界边界至少包含它 */
export const CANVAS_WORLD_RECT: PreviewRect = {
  x: 0,
  y: 0,
  w: DESIGN_WIDTH,
  h: DESIGN_HEIGHT,
};

/**
 * 世界参考框 = 各背景的「归位框」（posX/posY 清零）∪ 画布矩形。
 *
 * <p><b>为什么必须用归位框：</b>世界边界一旦跟着 posX/posY 动，用户拖背景时边界会跟着跑，
 * 摄像机的夹取范围也随之变化，手感会变成「图片黏住不动」。用归位框后，世界是**稳定**的：
 * 背景可以在世界里被挪到任意位置（背景 tab 的 X/Y 与复原按钮），镜头与热区都不受影响。
 *
 * @param record  记录
 * @param sizeOf  背景原图尺寸查询（key = `background:i`）
 */
export function worldRefOf(
  record: PlotRecord,
  sizeOf: (key: string) => ImageSize | undefined = () => undefined,
): PreviewRect {
  let ref = CANVAS_WORLD_RECT;
  (record.bg ?? []).forEach((background, index) => {
    const size = sizeOf(sceneLayerKey("background", index));
    if (!size) return;
    ref = unionRect(ref, backgroundWorldRect(background, size, false));
  });
  return ref;
}

/**
 * 世界（含一帧余地）= 参考框每边各留出一个取景框（identity 的 1920×1080）。
 *
 * <p>摄像机被夹在这个框里，于是最多能摇到「世界完全不在镜头中」——正好等价于
 * 「镜头可以离开世界，但只有一个取景框的余地」。
 */
export function worldBoxOf(ref: PreviewRect): PreviewRect {
  return {
    x: ref.x - DESIGN_WIDTH,
    y: ref.y - DESIGN_HEIGHT,
    w: ref.w + DESIGN_WIDTH * 2,
    h: ref.h + DESIGN_HEIGHT * 2,
  };
}

/**
 * 把摄像机夹进世界框：取景框整体保持在 `box` 内；某个方向上取景框比世界还大时居中。
 *
 * @param camera 目标摄像机
 * @param box    允许范围（通常是 {@link worldBoxOf} 的结果）
 */
export function clampCamera(camera: RecordCamera, box: PreviewRect): RecordCamera {
  const zoom = clamp(finite(camera.zoom, 1), MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
  const frameW = DESIGN_WIDTH / zoom;
  const frameH = DESIGN_HEIGHT / zoom;

  const centerOn = (center: number, min: number, size: number, frame: number) =>
    frame >= size ? min + size / 2 : clamp(center, min + frame / 2, min + size - frame / 2);

  return {
    zoom,
    centerX: centerOn(finite(camera.centerX, DESIGN_WIDTH / 2), box.x, box.w, frameW),
    centerY: centerOn(finite(camera.centerY, DESIGN_HEIGHT / 2), box.y, box.h, frameH),
  };
}

/* ============================ 投影 ============================ */

/**
 * 世界 → 场景画布（摄像机取景）。identity 时是恒等变换。
 *
 * <p>与后端 Camera 的换算一致：{@code sceneX = (worldX - centerX) * zoom + 960}。
 * 摄像机框左上角落在 {@code (centerX - 960/zoom, centerY - 540/zoom)}。
 */
export function worldToScene(
  rect: PreviewRect,
  camera: RecordCamera = DEFAULT_CAMERA,
): PreviewRect {
  const zoom = clamp(finite(camera.zoom, 1), MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
  return {
    x: (rect.x - camera.centerX) * zoom + DESIGN_WIDTH / 2,
    y: (rect.y - camera.centerY) * zoom + DESIGN_HEIGHT / 2,
    w: rect.w * zoom,
    h: rect.h * zoom,
  };
}

/** 场景画布 → 预览图像素：先 0.8 缩放并偏移 (192,108)，再按输出分辨率缩放 */
export function sceneToOutput(
  rect: PreviewRect,
  output: ImageSize,
): PreviewRect {
  const kx = output.width / DESIGN_WIDTH;
  const ky = output.height / DESIGN_HEIGHT;
  return {
    x: (SCENE_OFFSET_X + SCENE_SCALE * rect.x) * kx,
    y: (SCENE_OFFSET_Y + SCENE_SCALE * rect.y) * ky,
    w: SCENE_SCALE * rect.w * kx,
    h: SCENE_SCALE * rect.h * ky,
  };
}

/** 设计画布 → 预览图像素（边框 / UI / 台词用，不经过摄像机与 0.8 缩放） */
export function designToOutput(
  rect: PreviewRect,
  output: ImageSize,
): PreviewRect {
  return scaleRect(rect, output.width / DESIGN_WIDTH, output.height / DESIGN_HEIGHT);
}

/* ============================ 总入口 ============================ */

/** 是否渲染 UI 层（对话框 / 角色名片 / 地点牌）。与后端 RenderOfImage.shouldRenderUI 一致 */
export function shouldRenderUiLayer(
  dialogue: PlotRecord["dialogue"] | undefined,
): boolean {
  // 前端归一化里 hideUI 缺省为 true（见 projectFile.normalizeRecord），这里同样按"缺省隐藏"
  return !(dialogue?.freeText === true && dialogue?.hideUI !== false);
}

/**
 * 是否为本条记录画「角色名片」。
 *
 * <p>逐条镜像 {@code RenderOfImage.addUILayers} 的分支：
 * <ul>
 *   <li>自由文本：说话人不上屏 → **不画**；</li>
 *   <li>旁白（speakerName === "旁白"）：→ **不画**；</li>
 *   <li>speakerC 为空但有手填名字（临时说话人）：后端会现场渲染一张临时名片 → **画**；</li>
 *   <li>其余（角色说话）：→ **画**，且名片压在对话框之上。</li>
 * </ul>
 */
export function shouldRenderNamePlate(
  dialogue: PlotRecord["dialogue"] | undefined,
): boolean {
  if (!dialogue || dialogue.freeText === true) return false;

  const speakerName = (dialogue.speakerName ?? "").trim();
  if (speakerName === NARRATOR_NAME) return false;

  const speaker = (dialogue.speakerC ?? [])[0];
  if (speaker) {
    // speakerC 里的角色引用若是旁白（后端 narrator 占位），同样不画
    return speaker.characterID !== NARRATOR_ID;
  }

  // speakerC 为空：有手填名字就按"临时说话人"处理（后端会生成临时名片）
  return speakerName.length > 0;
}

/**
 * 计算一条记录在预览图上的全部图层。
 *
 * @param record  当前记录
 * @param options 输出尺寸 / 剧情模式 / 原图尺寸查询 / 摄像机
 * @returns 图层（按绘制顺序）、世界参考框、世界框与缺失尺寸清单
 */
export function buildPreviewGeometry(
  record: PlotRecord,
  options: PreviewGeometryOptions,
): PreviewGeometry {
  const output: ImageSize = {
    width: Math.max(1, safeInt(options.videoWidth, DESIGN_WIDTH)),
    height: Math.max(1, safeInt(options.videoHeight, DESIGN_HEIGHT)),
  };
  const camera = options.camera ?? DEFAULT_CAMERA;
  const sizeOf = options.sizeOf ?? (() => undefined);
  const dialogue = record?.dialogue;
  const layers: PreviewLayer[] = [];
  const missingSizes: string[] = [];

  const push = (
    layer: Omit<PreviewLayer, "outRect">,
  ): void => {
    const outRect =
      layer.space === "world"
        ? sceneToOutput(worldToScene(layer.baseRect, camera), output)
        : designToOutput(layer.baseRect, output);
    layers.push({ ...layer, outRect });
  };

  /* ---- 背景：数组顺序即绘制顺序，靠后的在上层 ---- */
  (record?.bg ?? []).forEach((background, index) => {
    const key = sceneLayerKey("background", index);
    const size = sizeOf(key);
    if (!size) {
      missingSizes.push(key);
      return;
    }
    push({
      key,
      kind: "background",
      index,
      label: `背景 ${index + 1} · ${background?.background?.name ?? "未命名"}`,
      z: 10 + index,
      space: "world",
      baseRect: backgroundWorldRect(background, size),
    });
  });

  /* ---- 立绘：后端逆序绘制（数组末尾在底层、首项在最上层）；人格故事模式不渲染 ---- */
  const characters = options.plot ? record?.chars ?? [] : [];
  characters.forEach((character, index) => {
    const key = sceneLayerKey("character", index);
    const size = sizeOf(key);
    if (!size) {
      missingSizes.push(key);
      return;
    }
    push({
      key,
      kind: "character",
      index,
      label: `立绘 ${index + 1} · ${character?.chara?.characterName ?? "未命名"}`,
      z: 100 + (characters.length - 1 - index),
      space: "world",
      baseRect: characterWorldRect(character, size),
      dim: character.dim === true,
    });
  });

  /* ---- 临时图片：同样逆序，且整体画在立绘之上 ---- */
  (record?.tempImages ?? []).forEach((temp, index) => {
    const key = sceneLayerKey("tempImage", index);
    const size = sizeOf(key);
    if (!size) {
      missingSizes.push(key);
      return;
    }
    push({
      key,
      kind: "tempImage",
      index,
      label: `临时图片 ${index + 1}`,
      z: 200 + ((record?.tempImages?.length ?? 1) - 1 - index),
      space: "world",
      baseRect: tempImageWorldRect(temp, size),
      dim: temp.dim === true,
    });
  });

  /* ---- UI 层：设计画布坐标，不受摄像机影响 ---- */
  if (shouldRenderUiLayer(dialogue)) {
    // 对话框：台词本身就画在它上面，所以「台词」不单独成框，
    // 点击对话框 == 点击台词（见 P1 的命中映射）。
    const dialogBoxSize = options.dialogBoxSize ?? DIALOG_BOX_FALLBACK_SIZE;
    push({
      key: "dialogBox",
      kind: "dialogBox",
      index: -1,
      label: "对话框（含台词）",
      z: 300,
      space: "design",
      baseRect: {
        x: DIALOG_BOX_POS.x,
        y: DIALOG_BOX_POS.y,
        w: Math.round(dialogBoxSize.width * DIALOG_BOX_POS.scale),
        h: Math.round(dialogBoxSize.height * DIALOG_BOX_POS.scale),
      },
    });

    // 角色名片：只在「角色说话」时出现，层级**高于对话框**
    //（后端绘制顺序：dialogBox → 名片 → 地点牌；重叠区域点击归名片）
    if (shouldRenderNamePlate(dialogue)) {
      const namePlateSize = options.namePlateSize ?? NAME_PLATE_FALLBACK_SIZE;
      push({
        key: "namePlate",
        kind: "namePlate",
        index: -1,
        label: `角色名片 · ${(dialogue?.speakerName ?? "").trim() || "临时说话人"}`,
        z: 305,
        space: "design",
        baseRect: {
          x: NAME_PLATE_POS.x,
          y: NAME_PLATE_POS.y,
          w: Math.round(namePlateSize.width * NAME_PLATE_POS.scale),
          h: Math.round(namePlateSize.height * NAME_PLATE_POS.scale),
        },
      });
    }

    // 地点牌只在剧情模式下渲染（addUILayers 里的 if (plot)）
    if (options.plot) {
      const locationSize = options.locationSize ?? LOCATION_FALLBACK_SIZE;
      push({
        key: "locationPlate",
        kind: "locationPlate",
        index: -1,
        label: "地点牌",
        z: 310,
        space: "design",
        baseRect: {
          x: LOCATION_POS.x,
          y: LOCATION_POS.y,
          w: Math.round(locationSize.width * LOCATION_POS.scale),
          h: Math.round(locationSize.height * LOCATION_POS.scale),
        },
      });
    }
  }

  const worldRef = worldRefOf(record, sizeOf);
  return {
    layers,
    worldRef,
    worldBox: worldBoxOf(worldRef),
    camera,
    output,
    missingSizes,
  };
}

/**
 * 命中检测：从最上层往下找第一个包含该点的图层。
 *
 * <p>预览图的点坐标要用**输出图像素**（调用方先把鼠标位置从舞台 CSS 坐标换算过来）。
 * 返回的图层可能是不参与交互的 UI 图层，调用方按 kind 决定怎么处理。
 *
 * @param layers   {@link buildPreviewGeometry} 的结果
 * @param point    输出图像素坐标
 * @param kinds    只在这些种类里找；不传表示全找
 */
export function layerAt(
  layers: PreviewLayer[],
  point: { x: number; y: number },
  kinds?: PreviewLayerKind[],
): PreviewLayer | null {
  const allow = kinds ? new Set(kinds) : null;
  const sorted = [...layers].sort((a, b) => b.z - a.z);
  for (const layer of sorted) {
    if (allow && !allow.has(layer.kind)) continue;
    const { x, y, w, h } = layer.outRect;
    if (point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h) {
      return layer;
    }
  }
  return null;
}

/** 该点命中的全部图层（自上而下），用于「同点重复点击循环下移一层」 */
export function layersAt(
  layers: PreviewLayer[],
  point: { x: number; y: number },
  kinds?: PreviewLayerKind[],
): PreviewLayer[] {
  const allow = kinds ? new Set(kinds) : null;
  return [...layers]
    .sort((a, b) => b.z - a.z)
    .filter((layer) => {
      if (allow && !allow.has(layer.kind)) return false;
      const { x, y, w, h } = layer.outRect;
      return point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h;
    });
}
