/**
 * 拖拽位置语义与坐标换算的单测。
 *
 * 这里锁的是「三类元素的位置字段不一样」这个最容易搞混的点：
 * 立绘写 adjX/adjY（偏移），背景/临时图片写 posX/posY（坐标）。
 * 换算链路（CSS → 世界像素）也钉死，改 0.8/1920 这些常量时必须一起红。
 */
import {
  isDraggableLayer,
  lockAxis,
  readLayerPosition,
  worldDeltaFromStage,
  writeLayerPosition,
} from "./previewDrag";
import type { Record as PlotRecord } from "@types";

const makeRecord = (over: Partial<PlotRecord> = {}): PlotRecord =>
  ({
    uuid: "rec-1",
    durationFrames: 30,
    dialogue: {
      text: "",
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
    ...over,
  }) as PlotRecord;

const makeCharacter = (over: Record<string, unknown> = {}) => ({
  chara: {
    characterID: "c1",
    characterName: "罗佳",
    height: 171,
    faction: "",
    colorBg: "#000",
    colorText: "#fff",
  },
  portrait: {
    portraitID: "p1",
    characterID: "c1",
    imagePath: "c1/p1.png",
    portName: "默认",
    emotion: "normal",
    faceX: 0,
    faceY: 0,
    length: 183,
    adjX: 0,
    adjY: 0,
    thumbnailPath: "",
  },
  posX: 960,
  posY: 221,
  adjX: 12,
  adjY: -34,
  scale: 1,
  dim: false,
  ...over,
});

describe("拖拽 → 位置字段", () => {
  const record = makeRecord({
    chars: [makeCharacter() as any],
    bg: [{ background: { uuid: "b", path: "b.png", name: "B" }, posX: 5, posY: 6, scale: 1, visible: true } as any],
    tempImages: [{ uuid: "t", imagePath: "t.png", posX: 7, posY: 8, scale: 1, dim: false } as any],
  });

  test("可拖的只有立绘 / 背景 / 临时图片", () => {
    expect(isDraggableLayer("character")).toBe(true);
    expect(isDraggableLayer("background")).toBe(true);
    expect(isDraggableLayer("tempImage")).toBe(true);
    expect(isDraggableLayer("dialogBox")).toBe(false);
    expect(isDraggableLayer("namePlate")).toBe(false);
    expect(isDraggableLayer("locationPlate")).toBe(false);
  });

  test("读位置：立绘读 adjX/adjY，背景与临时图片读 posX/posY", () => {
    expect(readLayerPosition(record, "character", 0)).toEqual({ x: 12, y: -34 });
    expect(readLayerPosition(record, "background", 0)).toEqual({ x: 5, y: 6 });
    expect(readLayerPosition(record, "tempImage", 0)).toEqual({ x: 7, y: 8 });
  });

  test("读位置：下标越界 / 空记录 / UI 图层都返回 null", () => {
    expect(readLayerPosition(record, "character", 3)).toBeNull();
    expect(readLayerPosition(record, "dialogBox", 0)).toBeNull();
    expect(readLayerPosition(null, "character", 0)).toBeNull();
  });

  test("写立绘：只改 adjX/adjY，不动 posX/posY，也不改原记录", () => {
    const next = writeLayerPosition(record, "character", 0, { x: 100, y: 200 })!;
    expect(next.chars[0].adjX).toBe(100);
    expect(next.chars[0].adjY).toBe(200);
    // posX/posY 是后端派生值，前端不能动（动了也会被覆盖，还容易误导）
    expect(next.chars[0].posX).toBe(960);
    expect(next.chars[0].posY).toBe(221);
    // 原记录保持不变（拖拽过程中要能随时还原）
    expect(record.chars[0].adjX).toBe(12);
    expect(next).not.toBe(record);
    expect(next.chars).not.toBe(record.chars);
  });

  test("写背景 / 临时图片：写入 posX/posY", () => {
    expect(
      writeLayerPosition(record, "background", 0, { x: -50, y: 60 })!.bg[0],
    ).toMatchObject({ posX: -50, posY: 60 });
    expect(
      writeLayerPosition(record, "tempImage", 0, { x: 1, y: 2 })!.tempImages[0],
    ).toMatchObject({ posX: 1, posY: 2 });
  });

  test("写入时四舍五入成整数（记录里的坐标一直是整数）", () => {
    const next = writeLayerPosition(record, "character", 0, {
      x: 10.4,
      y: -10.6,
    })!;
    expect(next.chars[0].adjX).toBe(10);
    expect(next.chars[0].adjY).toBe(-11);
  });

  test("下标越界写不进（返回 null）", () => {
    expect(writeLayerPosition(record, "character", 5, { x: 0, y: 0 })).toBeNull();
    expect(writeLayerPosition(null, "character", 0, { x: 0, y: 0 })).toBeNull();
  });
});

describe("舞台位移 → 设计画布位移", () => {
  test("舞台 1920 宽：1 CSS 像素 = 1.25 设计像素（0.8 场景缩放）", () => {
    const delta = worldDeltaFromStage({ x: 10, y: -10 }, { width: 1920, height: 1080 });
    expect(delta.x).toBeCloseTo(12.5);
    expect(delta.y).toBeCloseTo(-12.5);
  });

  test("舞台被缩小到 578 宽时，同样的手势要换算成更大的设计位移", () => {
    const delta = worldDeltaFromStage({ x: 10, y: 0 }, { width: 578, height: 325 });
    expect(delta.x).toBeCloseTo((10 * 1920) / 578 / 0.8);
  });

  test("相机 zoom=2 时，同样手势的设计位移减半（C1 之后会用到）", () => {
    const base = worldDeltaFromStage({ x: 10, y: 0 }, { width: 1920, height: 1080 }, 1);
    const zoomed = worldDeltaFromStage({ x: 10, y: 0 }, { width: 1920, height: 1080 }, 2);
    expect(zoomed.x).toBeCloseTo(base.x / 2);
  });

  test("舞台尺寸为 0（还没量到）时位移为 0", () => {
    expect(worldDeltaFromStage({ x: 10, y: 10 }, { width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
    });
  });

  test("Shift 锁轴：位移大的轴生效", () => {
    expect(lockAxis({ x: 20, y: 5 })).toEqual({ x: 20, y: 0 });
    expect(lockAxis({ x: -5, y: 20 })).toEqual({ x: 0, y: 20 });
  });
});
