/**
 * 镜头摇动（特效）的求值。
 *
 * 与后端 `CameraShakeTest` 用**同一组参数与期望值**（周期取 4 帧，让峰值落在整数帧上，
 * 断言可以写成精确值），这样"预览晃的幅度/相位 == 成片晃的幅度/相位"是被两侧测试共同锁住的。
 */
import {
  DEFAULT_CAMERA_SHAKE_AMPLITUDE,
  DEFAULT_CAMERA_SHAKE_PERIOD_FRAMES,
  applyCameraShake,
  cameraShakeConfigOf,
  cameraShakeOffset,
} from "./cameraShake";
import type { EffectVisual, RecordCamera } from "@types";

const effects = (...items: EffectVisual[]): EffectVisual[] => items;

const camera = (patch: Partial<RecordCamera> = {}): RecordCamera =>
  ({ centerX: 960, centerY: 540, zoom: 1, ...patch } as RecordCamera);

describe("摇动参数", () => {
  test("没有这一条特效 / 被禁用时返回 null", () => {
    expect(cameraShakeConfigOf(undefined)).toBeNull();
    expect(cameraShakeConfigOf([])).toBeNull();
    expect(cameraShakeConfigOf(effects({ type: "FADE_FROM_BLACK" }))).toBeNull();
    expect(cameraShakeConfigOf(effects({ type: "CAMERA_SHAKE", enabled: false }))).toBeNull();
  });

  test("缺省参数与后端一致；非法值回落缺省", () => {
    expect(cameraShakeConfigOf(effects({ type: "CAMERA_SHAKE" }))).toEqual({
      amplitude: DEFAULT_CAMERA_SHAKE_AMPLITUDE,
      periodFrames: DEFAULT_CAMERA_SHAKE_PERIOD_FRAMES,
    });
    expect(
      cameraShakeConfigOf(effects({ type: "CAMERA_SHAKE", amplitude: -3, periodFrames: 0 })),
    ).toEqual({
      amplitude: DEFAULT_CAMERA_SHAKE_AMPLITUDE,
      periodFrames: DEFAULT_CAMERA_SHAKE_PERIOD_FRAMES,
    });
  });

  test("与转场特效共存时各取各的（摇动不抢转场的参数）", () => {
    const config = cameraShakeConfigOf(
      effects({ type: "FADE_FROM_BLACK" }, { type: "CAMERA_SHAKE", amplitude: 8, periodFrames: 4 }),
    );
    expect(config).toEqual({ amplitude: 8, periodFrames: 4 });
  });
});

describe("位移公式", () => {
  test("第 0 帧不动（所以静止画面的预览图与改动前逐像素一致）", () => {
    expect(cameraShakeOffset({ amplitude: 10, periodFrames: 4 }, 0)).toEqual({ x: 0, y: 0 });
    expect(cameraShakeOffset(null, 7)).toEqual({ x: 0, y: 0 });
  });

  test("横轴一个完整周期回到 0；四分之一周期到峰值", () => {
    const config = { amplitude: 10, periodFrames: 4 };
    const quarter = cameraShakeOffset(config, 1);
    expect(quarter.x).toBeCloseTo(10, 6); // sin(π/2) = 1
    const full = cameraShakeOffset(config, 4);
    expect(full.x).toBeCloseTo(0, 6);
    // 纵轴周期是 0.73 倍，整数帧上不会同时归零 —— 这正是"不像画圆"的原因
    expect(Math.abs(full.y)).toBeLessThanOrEqual(4.5 + 1e-9);
  });

  test("纵向是不同频率（不会像画圆），且幅度始终受限", () => {
    const config = { amplitude: 10, periodFrames: 4 };
    for (let frame = 0; frame <= 12; frame++) {
      const offset = cameraShakeOffset(config, frame);
      expect(Math.abs(offset.x)).toBeLessThanOrEqual(10 + 1e-9);
      expect(Math.abs(offset.y)).toBeLessThanOrEqual(10 * 0.45 + 1e-9);
    }
    // 第 1 帧横轴在峰值、纵轴不在峰值 → 两个轴不同频
    expect(Math.abs(cameraShakeOffset(config, 1).y)).toBeLessThan(10 * 0.45);
  });
});

describe("叠加到相机上", () => {
  test("屏幕位移换算成世界坐标时要除以 zoom（推近时不会晃得更凶）", () => {
    const config = { amplitude: 10, periodFrames: 4 };
    const shaken = applyCameraShake(camera({ zoom: 2 }), config, 1);
    expect(shaken.centerX).toBeCloseTo(960 - 10 / 2, 6);
    expect(shaken.zoom).toBe(2);
  });

  test("第 0 帧 / 没启用时原样返回（不制造新对象，避免几何缓存白失效）", () => {
    const base = camera();
    expect(applyCameraShake(base, { amplitude: 10, periodFrames: 4 }, 0)).toBe(base);
    expect(applyCameraShake(base, null, 3)).toBe(base);
  });
});
