/**
 * 镜头摇动（摄像机预设）的求值。
 *
 * 与后端 `CameraShakeTest` 用**同一组参数与期望值**（周期取 4 帧，让峰值落在整数帧上，
 * 断言可以写成精确值），这样"预览晃的幅度/相位/包络 == 成片晃的幅度/相位/包络"
 * 是被两侧测试共同锁住的。
 */
import {
  DEFAULT_CAMERA_SHAKE_AMPLITUDE,
  DEFAULT_CAMERA_SHAKE_PERIOD_FRAMES,
  applyCameraShake,
  cameraShakeConfigOf,
  cameraShakeEndFrame,
  cameraShakeEnvelope,
  cameraShakeOffset,
} from "./cameraShake";
import type { CameraShakeConfig } from "./cameraShake";
import type { EffectVisual, RecordCamera } from "@types";

const effects = (...items: EffectVisual[]): EffectVisual[] => items;

const camera = (patch: Partial<RecordCamera> = {}): RecordCamera =>
  ({ centerX: 960, centerY: 540, zoom: 1, ...patch } as RecordCamera);

/** 组装一份完整参数（与后端 CameraShakeTest 的 helper 对齐） */
const config = (patch: Partial<CameraShakeConfig> = {}): CameraShakeConfig => ({
  amplitude: 10,
  periodFrames: 4,
  durationFrames: 0,
  fadeInFrames: 0,
  fadeOutFrames: 0,
  ...patch,
});

const effectsWithTiming = (patch: {
  durationFrames?: number;
  fadeInFrames?: number;
  fadeOutFrames?: number;
}): EffectVisual[] =>
  effects({ type: "CAMERA_SHAKE", amplitude: 10, periodFrames: 4, ...patch });

describe("摇动参数", () => {
  test("没有这一条预设 / 被禁用时返回 null", () => {
    expect(cameraShakeConfigOf(undefined)).toBeNull();
    expect(cameraShakeConfigOf([])).toBeNull();
    expect(cameraShakeConfigOf(effects({ type: "FADE_FROM_BLACK" }))).toBeNull();
    expect(cameraShakeConfigOf(effects({ type: "CAMERA_SHAKE", enabled: false }))).toBeNull();
  });

  test("缺省幅度/周期/时长/渐入渐出与后端一致；非法值回落缺省", () => {
    expect(cameraShakeConfigOf(effects({ type: "CAMERA_SHAKE" }))).toEqual({
      amplitude: DEFAULT_CAMERA_SHAKE_AMPLITUDE,
      periodFrames: DEFAULT_CAMERA_SHAKE_PERIOD_FRAMES,
      durationFrames: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
    });
    expect(
      cameraShakeConfigOf(effects({ type: "CAMERA_SHAKE", amplitude: -3, periodFrames: 0 })),
    ).toEqual({
      amplitude: DEFAULT_CAMERA_SHAKE_AMPLITUDE,
      periodFrames: DEFAULT_CAMERA_SHAKE_PERIOD_FRAMES,
      durationFrames: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
    });
    // 时长/渐入/渐出：负数按 0（= 不分段），0 本身合法
    expect(
      cameraShakeConfigOf(
        effects({ type: "CAMERA_SHAKE", durationFrames: -5, fadeInFrames: -1, fadeOutFrames: -2 }),
      ),
    ).toMatchObject({ durationFrames: 0, fadeInFrames: 0, fadeOutFrames: 0 });
  });

  test("与转场特效共存时各取各的（摇动不抢转场的参数）", () => {
    const parsed = cameraShakeConfigOf(
      effects({ type: "FADE_FROM_BLACK" }, { type: "CAMERA_SHAKE", amplitude: 8, periodFrames: 4 }),
    );
    expect(parsed).toMatchObject({ amplitude: 8, periodFrames: 4 });
  });
});

describe("位移公式", () => {
  test("第 0 帧不动（所以静止画面的预览图与改动前逐像素一致）", () => {
    expect(cameraShakeOffset(config(), 0, 30)).toEqual({ x: 0, y: 0 });
    expect(cameraShakeOffset(null, 7, 30)).toEqual({ x: 0, y: 0 });
  });

  test("横轴一个完整周期回到 0；四分之一周期到峰值", () => {
    const cfg = config();
    const quarter = cameraShakeOffset(cfg, 1, 30);
    expect(quarter.x).toBeCloseTo(10, 6); // sin(π/2) = 1
    const full = cameraShakeOffset(cfg, 4, 30);
    expect(full.x).toBeCloseTo(0, 6);
    // 纵轴周期是 0.73 倍，整数帧上不会同时归零 —— 这正是"不像画圆"的原因
    expect(Math.abs(full.y)).toBeLessThanOrEqual(4.5 + 1e-9);
  });

  test("纵向是不同频率（不会像画圆），且幅度始终受限", () => {
    const cfg = config();
    for (let frame = 0; frame <= 12; frame++) {
      const offset = cameraShakeOffset(cfg, frame, 30);
      expect(Math.abs(offset.x)).toBeLessThanOrEqual(10 + 1e-9);
      expect(Math.abs(offset.y)).toBeLessThanOrEqual(10 * 0.45 + 1e-9);
    }
    // 第 1 帧横轴在峰值、纵轴不在峰值 → 两个轴不同频
    expect(Math.abs(cameraShakeOffset(cfg, 1, 30).y)).toBeLessThan(10 * 0.45);
  });
});

describe("时间包络（持续时长 / 渐入 / 渐出）", () => {
  test("持续时长到点就停；超过记录长度时按记录长度算", () => {
    const cfg = config({ durationFrames: 10 });

    expect(cameraShakeEndFrame(cfg, 30)).toBe(10);
    // 第 9 帧还在晃（周期 4 → 第 9 帧正好是峰值）
    expect(cameraShakeOffset(cfg, 9, 30).x).toBeCloseTo(10, 6);
    expect(cameraShakeOffset(cfg, 10, 30).x).toBe(0);

    // 持续时长比记录还长：按记录长度结束
    expect(cameraShakeEndFrame(config({ durationFrames: 300 }), 30)).toBe(30);
    // 持续时长 = 0：整条记录；不知道记录长度时是无穷远
    expect(cameraShakeEndFrame(config(), 30)).toBe(30);
    expect(cameraShakeEndFrame(config(), 0)).toBe(Infinity);
  });

  test("渐入：0 → 满幅度线性升，第 fadeIn 帧起满幅", () => {
    const cfg = config({ fadeInFrames: 4 });

    expect(cameraShakeEnvelope(cfg, 0, 30)).toBe(0);
    expect(cameraShakeEnvelope(cfg, 1, 30)).toBeCloseTo(0.25, 9);
    expect(cameraShakeEnvelope(cfg, 2, 30)).toBeCloseTo(0.5, 9);
    expect(cameraShakeEnvelope(cfg, 4, 30)).toBe(1);

    expect(cameraShakeOffset(cfg, 1, 30).x).toBeCloseTo(2.5, 6);
    expect(cameraShakeOffset(cfg, 5, 30).x).toBeCloseTo(10, 6);
  });

  test("渐出：对齐记录结尾往回推，末帧归 0", () => {
    const cfg = config({ fadeOutFrames: 4 });

    expect(cameraShakeEnvelope(cfg, 5, 10)).toBe(1);
    expect(cameraShakeEnvelope(cfg, 6, 10)).toBe(1);
    expect(cameraShakeEnvelope(cfg, 8, 10)).toBeCloseTo(0.5, 9);
    expect(cameraShakeEnvelope(cfg, 9, 10)).toBeCloseTo(0.25, 9);
    expect(cameraShakeEnvelope(cfg, 10, 10)).toBe(0);
  });

  test("渐入 + 渐出 + 持续时长共存：取较小值，不会超过 1", () => {
    const cfg = config({ durationFrames: 20, fadeInFrames: 4, fadeOutFrames: 4 });

    expect(cameraShakeEnvelope(cfg, 2, 100)).toBeCloseTo(0.5, 9); // 渐入段（2/4）
    expect(cameraShakeEnvelope(cfg, 10, 100)).toBe(1); // 中间满幅
    expect(cameraShakeEnvelope(cfg, 18, 100)).toBeCloseTo(0.5, 9); // 渐出段（(20-18)/4）
    expect(cameraShakeEnvelope(cfg, 20, 100)).toBe(0); // 结束
  });

  test("没设持续时长又不知道记录总长时：不渐出（没有参照点）", () => {
    const cfg = config({ fadeOutFrames: 4 });
    expect(cameraShakeEnvelope(cfg, 5, 0)).toBe(1);
    expect(cameraShakeEnvelope(cfg, 500, 0)).toBe(1);
  });

  test("从记录数据读到的参数直接生效（持续 30 帧 + 渐入 5 + 渐出 5）", () => {
    const parsed = cameraShakeConfigOf(
      effectsWithTiming({ durationFrames: 30, fadeInFrames: 5, fadeOutFrames: 5 }),
    )!;
    expect(cameraShakeEnvelope(parsed, 0, 100)).toBe(0);
    expect(cameraShakeEnvelope(parsed, 5, 100)).toBe(1);
    expect(cameraShakeEnvelope(parsed, 27, 100)).toBeCloseTo(0.6, 9);
    expect(cameraShakeEnvelope(parsed, 30, 100)).toBe(0);
  });
});

describe("叠加到相机上", () => {
  test("屏幕位移换算成世界坐标时要除以 zoom（推近时不会晃得更凶）", () => {
    const shaken = applyCameraShake(camera({ zoom: 2 }), config(), 1, 30);
    expect(shaken.centerX).toBeCloseTo(960 - 10 / 2, 6);
    expect(shaken.zoom).toBe(2);
  });

  test("第 0 帧 / 没启用 / 摇动已结束 → 原样返回（不制造新对象，避免几何缓存白失效）", () => {
    const base = camera();
    expect(applyCameraShake(base, config(), 0, 30)).toBe(base);
    expect(applyCameraShake(base, null, 3, 30)).toBe(base);
    // 持续 10 帧：第 12 帧已经停了
    expect(applyCameraShake(base, config({ durationFrames: 10 }), 12, 30)).toBe(base);
  });
});
