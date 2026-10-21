/**
 * 预览几何单测。
 *
 * <p>这里锁的是「与后端渲染公式逐行一致」这件事：
 * 期望值都是照着 {@code CharacterVisual.updatePos()} / {@code BackgroundVisual.getDrawBounds()}
 * / {@code RenderOfImage.renderPre()} 手算出来的数字，不是把实现再抄一遍。
 * 后端一旦改公式/常量，这组用例应该跟着红，逼着人同步 {@code previewLayout.ts}。
 */
import type { Record as PlotRecord } from "@types";
import {
  CANVAS_WORLD_RECT,
  DEFAULT_CAMERA,
  buildPreviewGeometry,
  backgroundWorldRect,
  characterWorldRect,
  clampCamera,
  layerAt,
  layersAt,
  shouldRenderNamePlate,
  sceneLayerKey,
  tempImageWorldRect,
  worldBoxOf,
  worldRefOf,
  worldToScene,
  sceneToOutput,
  designToOutput,
  MAX_CAMERA_ZOOM,
  MIN_CAMERA_ZOOM,
} from "./previewLayout";

/* ============================ 夹具 ============================ */

const IMAGE_16_9 = { width: 1920, height: 1080 };
const IMAGE_ULTRA_WIDE = { width: 3600, height: 1080 }; // 10:3
const IMAGE_PORTRAIT = { width: 400, height: 800 };

/** 造一条记录（没写到的字段给空数组/旁白台词） */
const makeRecord = (overrides: Partial<PlotRecord> = {}): PlotRecord =>
  ({
    uuid: "rec-1",
    durationFrames: 30,
    dialogue: {
      text: "测试台词",
      location: "default",
      speakerC: [],
      speakerName: "旁白",
      faction: "",
      align: "LEFT",
      speed: 3,
      emotion: "normal",
    },
    bg: [],
    chars: [],
    tempImages: [],
    effects: [],
    audioCommands: [],
    ...overrides,
  }) as PlotRecord;

/** 造一个背景视觉元素 */
const makeBackground = (overrides: Record<string, unknown> = {}) => ({
  background: {
    uuid: "bg-1",
    path: "/assets/backgrounds/bg.png",
    name: "地下洞穴",
    thumbnailPath: "",
  },
  posX: 0,
  posY: 0,
  scale: 1,
  visible: true,
  ...overrides,
});

/** 造一个立绘视觉元素（默认：裁剪框 183、身高 171、无偏移、缩放 1） */
const makeCharacter = (
  character: Record<string, unknown> = {},
  portrait: Record<string, unknown> = {},
  top: Record<string, unknown> = {},
) => ({
  chara: {
    characterID: "char-1",
    characterName: "罗佳",
    height: 171,
    faction: "边狱公司",
    colorBg: "#69350B",
    colorText: "#FBDBB3",
    ...character,
  },
  portrait: {
    portraitID: "port-1",
    characterID: "char-1",
    imagePath: "char-1/portrait-1.png",
    portName: "默认",
    emotion: "normal",
    faceX: 0,
    faceY: 0,
    length: 183,
    adjX: 0,
    adjY: 0,
    thumbnailPath: "",
    ...portrait,
  },
  posX: 0,
  posY: 0,
  adjX: 0,
  adjY: 0,
  scale: 1,
  dim: false,
  ...top,
});

const makeTempImage = (overrides: Record<string, unknown> = {}) => ({
  uuid: "temp-1",
  imagePath: "./projects/temp/images/t.png",
  posX: 100,
  posY: 200,
  scale: 1,
  dim: false,
  ...overrides,
});

/* ============================ 背景几何 ============================ */

describe("预览几何 → 背景", () => {
  test("16:9 背景 scale=1 正好铺满设计画布", () => {
    expect(backgroundWorldRect(makeBackground() as any, IMAGE_16_9)).toEqual({
      x: 0,
      y: 0,
      w: 1920,
      h: 1080,
    });
  });

  test("10:3 横长背景 scale=1 按 contain 缩到 1920 宽、上下留黑", () => {
    // fit = min(1920/3600, 1080/1080) = 0.5333… → 1920×576，纵向居中 (1080-576)/2 = 252
    expect(
      backgroundWorldRect(makeBackground() as any, IMAGE_ULTRA_WIDE),
    ).toEqual({ x: 0, y: 252, w: 1920, h: 576 });
  });

  test("「铺满画面」用的 scale=1.875：10:3 背景撑成 3600×1080（世界正好 3.3 屏宽）", () => {
    expect(
      backgroundWorldRect(
        makeBackground({ scale: 1.875 }) as any,
        IMAGE_ULTRA_WIDE,
      ),
    ).toEqual({ x: -840, y: 0, w: 3600, h: 1080 });
  });

  test("scale 非法/缺省时按 1 处理，越界收敛到 [0.1, 3]", () => {
    expect(
      backgroundWorldRect(makeBackground({ scale: 0 }) as any, IMAGE_16_9),
    ).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
    // scale=99 被夹到 3：16:9 背景在 3 倍目标框里等比放大 → 5760×3240，仍居中
    expect(
      backgroundWorldRect(makeBackground({ scale: 99 }) as any, IMAGE_16_9),
    ).toEqual({ x: -1920, y: -1080, w: 5760, h: 3240 });
  });

  test("posX/posY 叠加在居中位置之上（背景 tab 的 X/Y 就是它）", () => {
    expect(
      backgroundWorldRect(
        makeBackground({ posX: 200, posY: -100 }) as any,
        IMAGE_16_9,
      ),
    ).toEqual({ x: 200, y: -100, w: 1920, h: 1080 });
  });
});

/* ============================ 立绘几何 ============================ */

describe("预览几何 → 立绘", () => {
  test("默认参数：裁剪框与身高都在基准值上，立绘左上角落在 (960, 221)", () => {
    expect(characterWorldRect(makeCharacter() as any, IMAGE_PORTRAIT)).toEqual({
      x: 960,
      y: 221,
      w: 400,
      h: 800,
    });
  });

  test("身高变矮 → 锚点下移（12 px/厘米）", () => {
    // 171-151 = 20cm → +240px
    expect(
      characterWorldRect(
        makeCharacter({ height: 151 }) as any,
        IMAGE_PORTRAIT,
      ).y,
    ).toBe(461);
  });

  test("用户缩放 2×：以裁剪框中心为基准放大，脸框中心不动", () => {
    // 半长 91.5，缩放 2 → 左上角 = 960 + 91.5 - 91.5*2 = 868.5 → 869
    const rect = characterWorldRect(
      makeCharacter({}, {}, { scale: 2 }) as any,
      IMAGE_PORTRAIT,
    );
    expect(rect).toEqual({ x: 869, y: 130, w: 800, h: 1600 });
  });

  test("裁剪框越小 → 缩得越大（183/length）", () => {
    // length=366 → baseScale=0.5；半长 183 → x = 960 + 91.5 - 183*0.5 = 960
    const rect = characterWorldRect(
      makeCharacter({}, { length: 366 }) as any,
      IMAGE_PORTRAIT,
    );
    expect(rect.x).toBe(960);
    expect(rect.w).toBe(200);
  });

  test("faceY>0（头上有帽子/武器）时，图片上边缘要往上让出这段高度", () => {
    // x = 960 + 91.5 - (0+91.5) = 960；y = 221 + 91.5 - (50+91.5) = 171
    const rect = characterWorldRect(
      makeCharacter({}, { faceY: 50 }) as any,
      IMAGE_PORTRAIT,
    );
    expect(rect.y).toBe(171);
  });

  test("adjX/adjY（用户在属性面板里的 X/Y 坐标）直接平移立绘", () => {
    expect(
      characterWorldRect(
        makeCharacter({}, {}, { adjX: -300, adjY: 40 }) as any,
        IMAGE_PORTRAIT,
      ),
    ).toMatchObject({ x: 660, y: 261 });
  });
});

/* ============================ 临时图片 ============================ */

describe("预览几何 → 临时图片", () => {
  test("posX/posY 是左上角，尺寸 = 原图 × scale", () => {
    expect(
      tempImageWorldRect(makeTempImage({ scale: 0.5 }) as any, {
        width: 200,
        height: 100,
      }),
    ).toEqual({ x: 100, y: 200, w: 100, h: 50 });
  });

  test("scale 非正数按 1 兜底（后端会原样使用，不夹取）", () => {
    expect(
      tempImageWorldRect(makeTempImage({ scale: 0 }) as any, {
        width: 200,
        height: 100,
      }).w,
    ).toBe(200);
  });
});

/* ============================ 投影（场景 0.8 + 摄像机） ============================ */

describe("预览几何 → 投影", () => {
  test("identity 摄像机：场景画布铺进 0.8 黑边框内（192,108,1536,864）", () => {
    expect(
      sceneToOutput(
        worldToScene({ x: 0, y: 0, w: 1920, h: 1080 }, DEFAULT_CAMERA),
        IMAGE_16_9,
      ),
    ).toEqual({ x: 192, y: 108, w: 1536, h: 864 });
  });

  test("zoom=2：取景框缩到一半，画面元素整体放大并围绕中心展开", () => {
    // 世界 (0,0,1920,1080) → 场景 (−960,−540,3840,2160) → 输出 (−576,−324,3072,1728)
    expect(
      sceneToOutput(
        worldToScene(
          { x: 0, y: 0, w: 1920, h: 1080 },
          { centerX: 960, centerY: 540, zoom: 2 },
        ),
        IMAGE_16_9,
      ),
    ).toEqual({ x: -576, y: -324, w: 3072, h: 1728 });
  });

  test("平移摄像机：元素整体反向移动同样的距离（zoom=1）", () => {
    const shifted = sceneToOutput(
      worldToScene(
        { x: 0, y: 0, w: 1920, h: 1080 },
        { centerX: 1060, centerY: 540, zoom: 1 },
      ),
      IMAGE_16_9,
    );
    expect(shifted.x).toBe(192 - 80); // -100 世界像素 × 0.8
  });

  test("输出分辨率 1280×720：整个画面等比缩小 2/3", () => {
    expect(
      sceneToOutput(
        worldToScene({ x: 0, y: 0, w: 1920, h: 1080 }, DEFAULT_CAMERA),
        { width: 1280, height: 720 },
      ),
    ).toEqual({ x: 128, y: 72, w: 1024, h: 576 });
  });

  test("UI 层只按输出分辨率缩放（不受摄像机与 0.8 场景影响）", () => {
    expect(
      designToOutput({ x: 264, y: 826, w: 1470, h: 254 }, { width: 1920, height: 1080 }),
    ).toEqual({ x: 264, y: 826, w: 1470, h: 254 });
    expect(
      designToOutput({ x: 264, y: 826, w: 1470, h: 254 }, { width: 1280, height: 720 }),
    ).toEqual({
      x: 176,
      y: 550.6666666666666,
      w: 980,
      // 用同一个算式算期望值，避免不同浮点写法带来的末位差异
      h: 254 * (720 / 1080),
    });
  });
});

/* ============================ 世界边界 ============================ */

describe("预览几何 → 世界边界", () => {
  const ultraWide = () =>
    makeRecord({ bg: [makeBackground({ scale: 1.875 }) as any] });

  test("世界参考框 = 背景归位框 ∪ 画布（10:3 撑满时是 3600 宽）", () => {
    expect(worldRefOf(ultraWide(), () => IMAGE_ULTRA_WIDE)).toEqual({
      x: -840,
      y: 0,
      w: 3600,
      h: 1080,
    });
  });

  test("世界参考框不随背景 posX 变化（这是「拖背景不顶着镜头跑」的前提）", () => {
    const moved = makeRecord({
      bg: [makeBackground({ scale: 1.875, posX: 500, posY: -200 }) as any],
    });
    expect(worldRefOf(moved, () => IMAGE_ULTRA_WIDE)).toEqual(
      worldRefOf(ultraWide(), () => IMAGE_ULTRA_WIDE),
    );
  });

  test("没有背景时世界参考框就是画布", () => {
    expect(worldRefOf(makeRecord(), () => IMAGE_16_9)).toEqual(CANVAS_WORLD_RECT);
  });

  test("世界框 = 参考框每边各留一个取景框（1920×1080）", () => {
    expect(worldBoxOf({ x: -840, y: 0, w: 3600, h: 1080 })).toEqual({
      x: -2760,
      y: -1080,
      w: 7440,
      h: 3240,
    });
  });

  test("摄像机夹取：最多摇到「世界完全不在镜头中」", () => {
    const box = worldBoxOf({ x: -840, y: 0, w: 3600, h: 1080 });
    const left = clampCamera({ centerX: -99999, centerY: 540, zoom: 1 }, box);
    // 取景框左边缘贴住世界框左边缘 → 世界刚好完全移出画面
    expect(left.centerX).toBe(box.x + 960);

    const right = clampCamera({ centerX: 99999, centerY: 540, zoom: 1 }, box);
    expect(right.centerX).toBe(box.x + box.w - 960);
  });

  test("摄像机夹取：zoom 收敛到 [0.5, 4]", () => {
    const box = worldBoxOf(CANVAS_WORLD_RECT);
    expect(clampCamera({ centerX: 960, centerY: 540, zoom: 99 }, box).zoom).toBe(
      MAX_CAMERA_ZOOM,
    );
    expect(clampCamera({ centerX: 960, centerY: 540, zoom: 0.01 }, box).zoom).toBe(
      MIN_CAMERA_ZOOM,
    );
  });

  test("取景框比世界还大时该轴居中（不会来回抢）", () => {
    const clamped = clampCamera(
      { centerX: 0, centerY: 0, zoom: 1 },
      { x: 0, y: 0, w: 1000, h: 600 },
    );
    expect(clamped.centerX).toBe(500);
    expect(clamped.centerY).toBe(300);
  });
});

/* ============================ 图层与命中 ============================ */

describe("预览几何 → 图层与命中", () => {
  const sizeOf = (key: string) =>
    key.startsWith("background")
      ? IMAGE_16_9
      : key.startsWith("character")
        ? IMAGE_PORTRAIT
        : undefined;

  const record = makeRecord({
    bg: [makeBackground() as any],
    chars: [makeCharacter() as any, makeCharacter({ characterName: "希斯克利夫" }) as any],
  });

  const geometry = buildPreviewGeometry(record, {
    plot: true,
    videoWidth: 1920,
    videoHeight: 1080,
    sizeOf,
  });

  test("图层 key 用统一的生成函数（几何与地址映射必须一致）", () => {
    expect(geometry.layers.map((layer) => layer.key)).toContain(
      sceneLayerKey("background", 0),
    );
    expect(geometry.layers.map((layer) => layer.key)).toContain(
      sceneLayerKey("character", 1),
    );
  });

  test("z 序：立绘首项在最上层，临时图片压过立绘，UI 压过场景", () => {
    const bg = geometry.layers.find((layer) => layer.key === "background:0")!;
    const first = geometry.layers.find((layer) => layer.key === "character:0")!;
    const second = geometry.layers.find((layer) => layer.key === "character:1")!;
    const dialog = geometry.layers.find((layer) => layer.key === "dialogBox")!;

    expect(first.z).toBeGreaterThan(second.z);
    expect(second.z).toBeGreaterThan(bg.z);
    expect(dialog.z).toBeGreaterThan(first.z);
  });

  test("命中取最上层：立绘压在背景上时点到立绘", () => {
    // 立绘矩形 (960,221,400,800) 中心点
    const hit = layerAt(geometry.layers, { x: 1000, y: 300 });
    expect(hit?.kind).toBe("character");
    expect(hit?.index).toBe(0);
  });

  test("命中在立绘之外的背景区域 → 背景", () => {
    const hit = layerAt(geometry.layers, { x: 300, y: 300 });
    expect(hit?.kind).toBe("background");
  });

  test("同一点的图层栈自下而上排好（用于重复点击循环下移）", () => {
    // (1000, 500) 落在两个立绘（矩形完全重叠）与背景里，但还在对话框（y≥826）之上
    const stack = layersAt(geometry.layers, { x: 1000, y: 500 });
    const kinds = stack.map((layer) => layer.kind);
    expect(kinds[0]).toBe("character");
    expect(kinds.filter((kind) => kind === "background")).toHaveLength(1);
  });

  test("缺少原图尺寸的图层被跳过并记进 missingSizes", () => {
    const partial = buildPreviewGeometry(record, {
      plot: true,
      videoWidth: 1920,
      videoHeight: 1080,
      sizeOf: (key) => (key === "character:0" ? IMAGE_PORTRAIT : undefined),
    });
    expect(partial.missingSizes).toEqual(
      expect.arrayContaining(["background:0", "character:1"]),
    );
    expect(partial.layers.map((layer) => layer.key)).not.toContain("background:0");
  });

  test("人格故事模式（plot=false）不生成立绘与地点牌图层", () => {
    const plain = buildPreviewGeometry(record, {
      plot: false,
      videoWidth: 1920,
      videoHeight: 1080,
      sizeOf,
    });
    expect(plain.layers.some((layer) => layer.kind === "character")).toBe(false);
    expect(plain.layers.some((layer) => layer.kind === "locationPlate")).toBe(false);
    expect(plain.layers.some((layer) => layer.kind === "dialogBox")).toBe(true);
  });

  test("自由文本 + 隐藏UI：不生成任何 UI 图层（台词已并入对话框，没对话框就没有命中区）", () => {
    const freeText = buildPreviewGeometry(
      makeRecord({
        dialogue: {
          text: "自由文本",
          location: "default",
          speakerC: [],
          speakerName: "",
          faction: "",
          align: "LEFT",
          speed: 3,
          emotion: "normal",
          freeText: true,
          hideUI: true,
        } as any,
      }),
      { plot: true, videoWidth: 1920, videoHeight: 1080, sizeOf },
    );
    expect(freeText.layers.filter((layer) => layer.space === "design")).toHaveLength(0);
  });

  test("对话框矩形：1007×174 的素材 ×1.46 = 1470×254，落在 (264,826)", () => {
    const dialog = geometry.layers.find((layer) => layer.key === "dialogBox")!;
    expect(dialog.outRect).toEqual({ x: 264, y: 826, w: 1470, h: 254 });
  });

  test("台词不再单独成框：图层里没有独立的文字热区", () => {
    const kinds = geometry.layers.map((layer) => layer.kind);
    expect(kinds).not.toContain("dialogueText");
    // 台词由对话框承载 —— 两条记录（旁白 / 角色）都只有对话框这一个文字入口
    expect(kinds.filter((kind) => kind !== "background" && kind !== "character")).toEqual([
      "dialogBox",
      "locationPlate",
    ]);
  });
});

describe("预览几何 → 角色名片", () => {
  const sizeOf = (key: string) =>
    key.startsWith("background") ? IMAGE_16_9 : undefined;

  const makeDialogue = (over: Record<string, unknown> = {}) => ({
    text: "台词",
    location: "办公室",
    speakerC: [],
    speakerName: "旁白",
    faction: "",
    align: "LEFT",
    speed: 3,
    emotion: "normal",
    ...over,
  });

  const build = (dialogue: Record<string, unknown>, plot = true) =>
    buildPreviewGeometry(makeRecord({ dialogue: dialogue as any }), {
      plot,
      videoWidth: 1920,
      videoHeight: 1080,
      sizeOf,
    });

  const character = { characterID: "char-1", characterName: "罗佳", height: 171 };

  test("旁白：只有对话框，没有角色名片", () => {
    const geometry = build(makeDialogue({ speakerName: "旁白" }));
    expect(geometry.layers.some((layer) => layer.kind === "dialogBox")).toBe(true);
    expect(geometry.layers.some((layer) => layer.kind === "namePlate")).toBe(false);
    expect(shouldRenderNamePlate(makeDialogue({ speakerName: "旁白" }) as any)).toBe(false);
  });

  test("角色说话：对话框 + 角色名片，且名片层级高于对话框", () => {
    const geometry = build(
      makeDialogue({ speakerName: "罗佳", speakerC: [character] }),
    );
    const dialog = geometry.layers.find((layer) => layer.kind === "dialogBox")!;
    const plate = geometry.layers.find((layer) => layer.kind === "namePlate")!;
    expect(plate).toBeTruthy();
    expect(plate.z).toBeGreaterThan(dialog.z);
  });

  test("名片矩形：后端 (-26,789) ×0.28，取景不变时为 357×148", () => {
    const geometry = build(
      makeDialogue({ speakerName: "罗佳", speakerC: [character] }),
    );
    const plate = geometry.layers.find((layer) => layer.kind === "namePlate")!;
    expect(plate.outRect).toEqual({ x: -26, y: 789, w: 357, h: 148 });
  });

  test("重叠区域优先命中角色名片，框外区域仍命中对话框", () => {
    const geometry = build(
      makeDialogue({ speakerName: "罗佳", speakerC: [character] }),
    );
    // 名片 x −26..331 / 对话框 x 264..1734：重叠区 (300,900) 应命中名片
    expect(layerAt(geometry.layers, { x: 300, y: 900 })?.kind).toBe("namePlate");
    // 对话框右侧（名片之外）仍命中对话框
    expect(layerAt(geometry.layers, { x: 900, y: 900 })?.kind).toBe("dialogBox");
  });

  test("自由文本：说话人不上屏，不生成名片", () => {
    expect(shouldRenderNamePlate(makeDialogue({ freeText: true, hideUI: false }) as any)).toBe(
      false,
    );
  });

  test("speakerC 里是旁白占位角色时不生成名片", () => {
    expect(
      shouldRenderNamePlate(
        makeDialogue({
          speakerName: "",
          speakerC: [{ characterID: "narrator", characterName: "旁白" }],
        }) as any,
      ),
    ).toBe(false);
  });

  test("只有手填名字（临时说话人）时也生成名片", () => {
    expect(
      shouldRenderNamePlate(makeDialogue({ speakerName: "神秘人", speakerC: [] }) as any),
    ).toBe(true);
  });

  test("空说话人名字 + 空 speakerC 按旁白处理", () => {
    expect(
      shouldRenderNamePlate(makeDialogue({ speakerName: "", speakerC: [] }) as any),
    ).toBe(false);
    expect(shouldRenderNamePlate(undefined)).toBe(false);
  });
});
