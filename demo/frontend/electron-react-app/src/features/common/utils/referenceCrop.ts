/**
 * 按截图反推立绘裁剪框（纯函数，方便单测）
 *
 * <h2>为什么这件事有唯一解</h2>
 * 用户缩放 = 1 时，立绘在成片里的位置只由 3 个数决定（见 {@code CharacterVisual.updatePos()}）：
 * <pre>
 *   baseScale = 183 / length
 *   posX = 960 + adjX − faceX · baseScale
 *   posY = anchorY + adjY − faceY · baseScale
 * </pre>
 * 也就是说"裁剪框"与"立绘贴在画面上的位置 + 缩放"是一一对应的：拿到一张同机位的 16:9 截图，
 * 反推出立绘的相似变换 (scale, x, y)，裁剪参数就是解一个二元一次方程。
 *
 * <h2>两张图的坐标必须换算到同一个空间</h2>
 * 截图是**成片帧**（1920×1080）；立绘的 faceX/faceY/length 是**原图像素**。
 * 成片帧 = 场景画布（设计画布 1920×1080）再 ×0.8 并偏移 (192,108)
 * （{@code RenderOfImage.PLOT_SCENE_SCALE}，常量与 previewLayout 同源），
 * 于是头部裁剪框在成片里恒为 {@code 183 × 0.8 = 146.4} 像素、左上角恒在
 * {@code (960, 108 + 0.8 · anchorY)} —— **与具体裁剪框无关**。这就是反推的基准点。
 *
 * <h2>推导</h2>
 * 记 S = 帧像素/立绘像素（= 0.8 · 183 / length）、TX/TY = 立绘左上角在帧里的坐标。
 * <b>只取缩放和竖直位置</b>：
 * <pre>
 *   length = 146.4 / S
 *   faceY  = (108 + 0.8 · (anchorY + adjY) − TY) / S
 *   faceX  = centerX − length / 2          ← 水平位置**不**从截图读
 *   anchorY = 221 + (171 − 身高cm) · 8.333  ← ProjectConfig.DEFAULT_CHARACTER_* / Pixels_per_centimeter
 * </pre>
 * 把结果代回 {@code CharacterVisual.updatePos()} 可以还原出同一个 (TX, TY, S)，
 * 往返与"与后端公式对拍"都写在 {@code referenceCrop.test.ts} 里。
 *
 * <h2>截图能决定什么、不能决定什么</h2>
 * <ul>
 *   <li><b>length（头的绝对大小）</b>：由截图里角色的大小唯一确定，这是校准的核心。</li>
 *   <li><b>faceY（头部方框中心的竖直位置）</b>：角色在画面里的纵向落点由**身高**决定
 *       （{@code anchorY} 那条公式），同一角色在任何场景里都一样，所以可以信。</li>
 *   <li><b>faceX（头部方框中心的水平位置）不参与计算</b>：原作里角色的左右站位是**镜头调度**
 *       定的 —— 同一个人这一镜偏左、下一镜偏右，甚至被推到画面边缘；拿它反推会把整个裁剪框
 *       带偏（缩略图里只剩半张脸、成片里人也偏）。所以水平方向沿用调用方给的"当前裁剪框中心"
 *       （{@link cropCenterX}），只按新的 length 把框重新居中到那个中心点上。</li>
 * </ul>
 *
 * <p>换句话说：校准只需要"头多大"和"头有多高"，**不需要**角色站在画面中间。
 *
 * <p>另外身高必须填对：{@code anchorY} 每差 1cm 就差 8.333 设计像素（成片里 6.67px），
 * 身高错了只会让 faceY 系统性偏移，length 不受影响。
 *
 * <p><b>锚点是「立绘最低能落到哪里」</b>：{@code faceY} 是图片内的坐标，只能是正数，
 * 而 {@code posY = anchorY − faceY · 缩放}，所以任何立绘都不会比锚点更靠下。
 * 因此身高锚点偏高一格，反推出来的 faceY 就会是负数、被夹到 0，屏幕上表现为
 * 「校准完角色还是偏高」——这正是把 Pixels_per_centimeter 从 12 改成 8.333 的原因
 * （12 是成片 9.6px/cm，比原作截帧实测陡 44%）。
 */

import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  SCENE_OFFSET_X,
  SCENE_OFFSET_Y,
  SCENE_SCALE,
} from "@features/record/preview/previewLayout";
import {
  CropRect,
  ImageSize,
  PortraitCropState,
  clampCropRect,
  isValidCropState,
} from "./portraitCrop";

/* ============================ 坐标空间与常量 ============================ */

/** 成片帧尺寸（= 设计画布；输出分辨率只是最后整幅缩放一次，不改坐标系） */
export const FRAME_WIDTH = DESIGN_WIDTH;
export const FRAME_HEIGHT = DESIGN_HEIGHT;

/** 头部裁剪框的目标边长（设计画布像素）= ProjectConfig.DEFAULT_CHARACTER_HEAD_LENGTH */
export const CHARACTER_HEAD_LENGTH = 183;

/** 头框在成片帧里的边长：183 × 0.8 = 146.4 */
export const HEAD_BOX_FRAME_SIDE = CHARACTER_HEAD_LENGTH * SCENE_SCALE;

/** 与 ProjectConfig 对齐的立绘定位基准 */
const DEFAULT_CHARACTER_HEIGHT = 171;
const CHARACTER_HEIGHT_PIXELS = 221;
/** 成片实测 6.667px/cm ÷ 0.8（场景缩放）= 8.333 设计像素/cm，见 ProjectConfig 同名字段的注释 */
const PIXELS_PER_CENTIMETER = 25 / 3;

/**
 * 反推出来的头框边长（原图像素）合法区间。
 *
 * <p>下限用来识别"根本没对上"（例如截图里角色只有几十像素高的远景），
 * 上限挡住异常值把缩放算成天文数字。
 */
export const MIN_HEAD_BOX_SIDE = 24;
export const MAX_HEAD_BOX_SIDE = 8192;

/* ============================ 类型 ============================ */

/** 立绘原图像素 → 成片帧像素的相似变换（无旋转、无翻转） */
export interface PortraitAlignment {
  /** 1 个立绘原图像素在帧里占多少像素 */
  scale: number;
  /** 立绘左上角在帧里的 X */
  x: number;
  /** 立绘左上角在帧里的 Y */
  y: number;
}

/** 反推输入：对齐 + 立绘原图尺寸 + 角色身高（可选 adj / 水平基准） */
export interface ReferenceCropInput {
  alignment: PortraitAlignment;
  portraitSize: ImageSize;
  /** 角色身高（cm），缺省 171（与后端默认一致） */
  characterHeight?: number | null;
  /**
   * 头部方框**水平中心**要落在原图的哪个 X（原图像素）。
   *
   * <p>水平位置刻意不从截图读（截图里的左右站位是镜头调度，不可靠），
   * 通常传当前裁剪框的中心 {@link cropCenterX}；缺省时退化为立绘图片的水平中心。
   */
  centerX?: number | null;
  /** 立绘自身的垂直微调（设计画布像素），缺省 0；水平微调 adjX **不参与**反推 */
  adjY?: number | null;
}

/** 反推结果里需要提醒用户的事项 */
export type ReferenceWarningCode =
  | "outOfBounds"
  | "anchorBelow"
  | "tooSmall"
  | "tooLarge";

export interface ReferenceWarning {
  code: ReferenceWarningCode;
  message: string;
}

/** 反推结果 */
export interface ReferenceCropResult {
  /** 最终裁剪参数（原图像素，已取整并夹进图片范围） */
  crop: PortraitCropState;
  /** 取整前、未夹取的裁剪参数（原图像素，可能越界）；用于提示"差多少" */
  raw: PortraitCropState;
  /** 是否因为越界被夹进图片范围 */
  adjusted: boolean;
  /** 需要提示用户的问题（越界 / 角色比身高锚点更靠下 / 框太小 / 框太大） */
  warnings: ReferenceWarning[];
}

/* ============================ 小工具 ============================ */

const finite = (value: number | null | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** 图片尺寸是否可用（宽高都是正数） */
const usableSize = (size?: ImageSize | null): size is ImageSize =>
  !!size &&
  Number.isFinite(size.width) &&
  Number.isFinite(size.height) &&
  size.width > 0 &&
  size.height > 0;

/** 对齐是否可用：scale 必须有限且为正 */
export const isUsableAlignment = (
  alignment?: PortraitAlignment | null,
): alignment is PortraitAlignment =>
  !!alignment &&
  Number.isFinite(alignment.scale) &&
  alignment.scale > 0 &&
  Number.isFinite(alignment.x) &&
  Number.isFinite(alignment.y);

/** 身高归一：缺省 / 非法 / 非正都落回 171 */
export const normalizeCharacterHeight = (
  height?: number | null,
): number => {
  const value = finite(height, DEFAULT_CHARACTER_HEIGHT);
  return value > 0 ? value : DEFAULT_CHARACTER_HEIGHT;
};

const minAlignmentScale = (): number => HEAD_BOX_FRAME_SIDE / MAX_HEAD_BOX_SIDE;
const maxAlignmentScale = (): number => HEAD_BOX_FRAME_SIDE / MIN_HEAD_BOX_SIDE;

/** 把对齐的缩放夹进"头框边长合法"的区间 */
export const clampAlignmentScale = (scale: number): number =>
  Math.min(
    maxAlignmentScale(),
    Math.max(minAlignmentScale(), finite(scale, 1)),
  );

/* ============================ 基准点 ============================ */

/**
 * 裁剪框上边缘在设计画布里的 Y（= {@code CharacterVisual.updatePos()} 的 anchorY，不含 adj）。
 *
 * <p>Java 侧是 {@code (int)((DEFAULT_CHARACTER_HEIGHT - height) * Pixels_per_centimeter)}，
 * 向零截断，这里用 {@code Math.trunc} 保持逐像素一致。
 */
export const characterAnchorY = (characterHeight?: number | null): number =>
  CHARACTER_HEIGHT_PIXELS +
  Math.trunc(
    (DEFAULT_CHARACTER_HEIGHT - normalizeCharacterHeight(characterHeight)) *
      PIXELS_PER_CENTIMETER,
  );

/** 设计画布 → 成片帧（×0.8 居中） */
export const designToFrame = (
  x: number,
  y: number,
): { x: number; y: number } => ({
  x: SCENE_OFFSET_X + SCENE_SCALE * x,
  y: SCENE_OFFSET_Y + SCENE_SCALE * y,
});

/**
 * 头框左上角在成片帧里的位置：**与裁剪框无关的固定基准**。
 *
 * <p>X 恒为画面中心（960），Y 只随角色身高变化 —— 这就是"所有角色的头框在画面里对齐"的原因。
 */
export const headAnchorInFrame = (
  characterHeight?: number | null,
): { x: number; y: number } =>
  designToFrame(FRAME_WIDTH / 2, characterAnchorY(characterHeight));

/**
 * 反推的"靶框"：成片帧里 146.4×146.4 的固定方框（左上角 = {@link headAnchorInFrame}）。
 *
 * <p><b>校准只用它的上下两条边和竖直中心</b>（水平位置不参与，见文件头）。界面上因此
 * 画成一条全宽的"靶带 + 中线"，而不是方框 —— 画方框会让人以为必须把角色拖到画面中间。
 */
export const headBoxInFrame = (
  characterHeight?: number | null,
): CropRect => {
  const anchor = headAnchorInFrame(characterHeight);
  return {
    left: anchor.x,
    top: anchor.y,
    width: HEAD_BOX_FRAME_SIDE,
    height: HEAD_BOX_FRAME_SIDE,
  };
};

/* ============================ 反推 / 正推 ============================ */

/**
 * 以帧里的某一点为锚点缩放立绘（校准）。
 *
 * <p>锚点下的那块立绘保持不动，所以"放大头"不会让头跑掉：`scale` 变成原来的 k 倍，
 * 左上角就按 k 向锚点收 / 放。结果比例由 {@link clampAlignmentScale} 夹住
 * （头框边长落在 `MIN_HEAD_BOX_SIDE ~ MAX_HEAD_BOX_SIDE` 之间）。
 *
 * @param alignment 当前对齐（不可用时原样返回）
 * @param nextScale 目标缩放（帧像素 / 立绘原图像素）；非有限值按当前比例处理
 * @returns 新的对齐
 */
export const zoomAlignmentAt = (
  alignment: PortraitAlignment,
  nextScale: number,
  anchorX: number,
  anchorY: number,
): PortraitAlignment => {
  if (!isUsableAlignment(alignment)) return alignment;
  const scale = clampAlignmentScale(
    Number.isFinite(nextScale) ? nextScale : alignment.scale,
  );
  const ratio = scale / alignment.scale;
  return {
    scale,
    x: anchorX - (anchorX - alignment.x) * ratio,
    y: anchorY - (anchorY - alignment.y) * ratio,
  };
};

/**
 * 当前裁剪框的**水平中心**（原图像素）。
 *
 * <p>反推时拿它当 {@link ReferenceCropInput.centerX}：重新校准只改"框多大、多高"，
 * 框在立绘上的左右位置沿用用户已经框好的那个中心，不会被截图里的镜头站位带偏。
 *
 * @returns 裁剪参数不可用（length ≤ 0）时返回 null，调用方应退化为立绘图片的水平中心
 */
export const cropCenterX = (
  crop?: PortraitCropState | null,
): number | null => (isValidCropState(crop) ? crop.faceX + crop.length / 2 : null);

/**
 * 从"立绘贴在截图上的位置"反推裁剪参数。
 *
 * <p>只读对齐里的 **scale（→ length）** 和 **y（→ faceY）**；x 不参与，
 * 水平位置由 {@link ReferenceCropInput.centerX} 决定（见文件头的推导）。
 *
 * @returns 对齐或尺寸不可用时返回 null
 */
export const deriveCropFromAlignment = (
  input: ReferenceCropInput,
): ReferenceCropResult | null => {
  const { alignment, portraitSize } = input;
  if (!isUsableAlignment(alignment) || !usableSize(portraitSize)) {
    return null;
  }

  const adjY = finite(input.adjY, 0);
  const anchor = headAnchorInFrame(input.characterHeight);

  // 尺寸与竖直位置来自截图对齐；水平方向只认调用方给的"框中心"，
  // 刻意**不用** alignment.x —— 原作里角色的左右站位是镜头调度，不可靠。
  const length = HEAD_BOX_FRAME_SIDE / alignment.scale;
  const centerX = finite(input.centerX, portraitSize.width / 2);
  const faceX = centerX - length / 2;
  const faceY =
    (anchor.y + SCENE_SCALE * adjY - alignment.y) / alignment.scale;

  const raw: PortraitCropState = { faceX, faceY, length };
  const target: CropRect = {
    left: Math.round(faceX),
    top: Math.round(faceY),
    width: Math.max(1, Math.round(length)),
    height: Math.max(1, Math.round(length)),
  };
  const clamped = clampCropRect(target, portraitSize);
  const crop: PortraitCropState = {
    faceX: clamped.left,
    faceY: clamped.top,
    length: clamped.width,
  };
  const adjusted =
    crop.faceX !== target.left ||
    crop.faceY !== target.top ||
    crop.length !== target.width;

  const warnings: ReferenceWarning[] = [];
  // faceY < 0 是最容易踩、也最难看懂的一种"越界"：说明截图里的角色比身高锚点更靠下。
  // 立绘只能比锚点更靠上（posY = anchorY − faceY·缩放，faceY 是图片内坐标、不能为负），
  // 所以这时无论怎么调都压不回截图里的位置 —— 只能是身高填错了（锚点因此偏高）。
  const belowAnchor = raw.faceY < 0;
  const clampedOther =
    crop.faceX !== target.left ||
    crop.length !== target.width ||
    (!belowAnchor && crop.faceY !== target.top);

  if (clampedOther) {
    warnings.push({
      code: "outOfBounds",
      message:
        "推导出的裁剪框超出立绘原图范围，已按图片边界修正：调整竖直对齐或缩放后重试（左右位置不参与计算）。",
    });
  }
  if (belowAnchor) {
    warnings.push({
      code: "anchorBelow",
      message:
        "截图里的角色比「身高锚点」更靠下，立绘最多只能落在锚点上（再往下没有空间），已按图片上边界修正。多半是角色身高填得偏高：核对身高后再校准。",
    });
  }
  if (length < MIN_HEAD_BOX_SIDE) {
    warnings.push({
      code: "tooSmall",
      message: `头框只有 ${Math.round(length)} 像素，多半是截图里的角色太小或没对齐，检查一下缩放。`,
    });
  }
  if (length > MAX_HEAD_BOX_SIDE) {
    warnings.push({
      code: "tooLarge",
      message: `头框边长 ${Math.round(length)} 像素已经超过立绘原图，检查一下是否缩得太小。`,
    });
  }

  return { crop, raw, adjusted, warnings };
};

/** {@link deriveCropFromAlignment} 的输入（正推方向） */
export interface CropAlignmentInput {
  crop: PortraitCropState;
  characterHeight?: number | null;
  adjX?: number | null;
  adjY?: number | null;
}

/**
 * 正推：给定裁剪参数，算出立绘会贴在成片帧的哪个位置、缩放多少。
 *
 * <p>界面上用它做两件事：打开弹窗时以"当前裁剪"为初始对齐；以及"恢复当前裁剪"按钮。
 *
 * <p>与 {@link deriveCropFromAlignment} 互为逆运算，但<b>要带上</b>
 * {@code centerX: cropCenterX(crop)}：反推不再从对齐的 x 里取水平位置，
 * 所以只给对齐、不给中心点时算回来的 faceX 会是"以画面中心为框中心"的那一份。
 *
 * @returns 裁剪参数不可用（length ≤ 0）时返回 null
 */
export const alignmentFromCrop = (
  input: CropAlignmentInput,
): PortraitAlignment | null => {
  const { crop } = input;
  if (!isValidCropState(crop)) {
    return null;
  }

  const scale = HEAD_BOX_FRAME_SIDE / crop.length;
  if (!Number.isFinite(scale) || scale <= 0) {
    return null;
  }

  const anchor = headAnchorInFrame(input.characterHeight);
  return {
    scale,
    x: anchor.x + SCENE_SCALE * finite(input.adjX, 0) - crop.faceX * scale,
    y: anchor.y + SCENE_SCALE * finite(input.adjY, 0) - crop.faceY * scale,
  };
};

/**
 * 没有可用裁剪参数时的初始对齐：假设头在立绘水平中央、贴着图片上边缘。
 *
 * <p>只影响"还没框过头"的立绘打开弹窗时的初始位置，用户拖一下就好。
 */
export const defaultAlignment = (input: {
  portraitSize: ImageSize;
  characterHeight?: number | null;
}): PortraitAlignment | null => {
  const size = input.portraitSize;
  if (!usableSize(size)) {
    return null;
  }
  const length = Math.max(
    MIN_HEAD_BOX_SIDE,
    Math.min(size.width, size.height) * 0.25,
  );
  return alignmentFromCrop({
    crop: { faceX: (size.width - length) / 2, faceY: 0, length },
    characterHeight: input.characterHeight,
  });
};

/** 立绘在帧里占的矩形（给界面摆图片用） */
export const portraitRectInFrame = (
  alignment: PortraitAlignment | null | undefined,
  portraitSize: ImageSize | null | undefined,
): CropRect | null => {
  if (!isUsableAlignment(alignment) || !usableSize(portraitSize)) {
    return null;
  }
  return {
    left: alignment.x,
    top: alignment.y,
    width: portraitSize.width * alignment.scale,
    height: portraitSize.height * alignment.scale,
  };
};

/* ============================ 截图摆放 ============================ */

/** 截图 → 帧坐标的换算：按宽度等比缩放到 1920，非 16:9 时纵向居中 */
export interface ScreenshotPlacement {
  /** 截图像素 × scale = 帧像素 */
  scale: number;
  offsetX: number;
  offsetY: number;
}

export const screenshotPlacement = (
  size?: ImageSize | null,
): ScreenshotPlacement | null => {
  if (!usableSize(size)) {
    return null;
  }
  const scale = FRAME_WIDTH / size.width;
  const frameHeight = size.height * scale;
  return {
    scale,
    offsetX: 0,
    offsetY: (FRAME_HEIGHT - frameHeight) / 2,
  };
};

/** 截图在帧里占的矩形（给界面摆图片用） */
export const screenshotRectInFrame = (
  size?: ImageSize | null,
): CropRect | null => {
  const placement = screenshotPlacement(size);
  if (!placement || !size) {
    return null;
  }
  return {
    left: placement.offsetX,
    top: placement.offsetY,
    width: FRAME_WIDTH,
    height: size.height * placement.scale,
  };
};

/** 截图是不是 16:9（容差默认 2%，挡住把 16:10 / 21:9 的图当成 16:9 用） */
export const isSixteenByNine = (
  size?: ImageSize | null,
  tolerance = 0.02,
): boolean => {
  if (!usableSize(size)) {
    return false;
  }
  const ratio = size.width / size.height;
  return Math.abs(ratio - FRAME_WIDTH / FRAME_HEIGHT) <= tolerance;
};
