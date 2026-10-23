/**
 * @module 立绘动画求值内核（前端）
 * 缓动曲线：与后端 `Easing.java`、摄像机 `cameraView.easeProgress` **同一组**曲线。
 *
 * 刻意不提供 cubic-bezier：两端各写一遍 Newton 迭代会在浮点末位分叉，
 * 而"预览与成片逐帧一致"的验收容不下末位差异。要做自定义曲线请走"共享采样表 + 线性插值"。
 */
import type { EasingName, Keyframe } from "./animationTypes";

/** 全部缓动名（UI 下拉用；顺序固定） */
export const EASING_NAMES: EasingName[] = [
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut",
  "step",
];

/** 缓动显示名（关键帧表格的下拉用） */
export const EASING_LABELS: Record<EasingName, string> = {
  linear: "匀速",
  easeIn: "慢入",
  easeOut: "慢出",
  easeInOut: "慢入慢出",
  step: "阶跃（不插值）",
};

/**
 * 缓动进度：入参出参都是 0~1。
 *
 * 公式与后端 `Easing.apply` 逐行对应（三次曲线：`easeIn = t³`、`easeOut = 1−(1−t)³`）。
 */
export function ease(t: number, name?: EasingName | null): number {
  const p = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  switch (name) {
    case "easeIn":
      return p * p * p;
    case "easeOut": {
      const inv = 1 - p;
      return 1 - inv * inv * inv;
    }
    case "easeInOut":
      if (p < 0.5) return 4 * p * p * p;
      {
        const inv = 1 - p;
        return 1 - 4 * inv * inv * inv;
      }
    case "step":
      // 一直保持前一个关键帧的值，直到下一个关键帧才跳过去
      return p >= 1 ? 1 : 0;
    case "linear":
    default:
      return p;
  }
}

/** 某个关键帧"以它为起点的那一段"的缓动函数（hold 优先） */
export function easeOfKeyframe(key: Keyframe): (t: number) => number {
  const name: EasingName = key.hold ? "step" : key.ease ?? "linear";
  return (t: number) => ease(t, name);
}
