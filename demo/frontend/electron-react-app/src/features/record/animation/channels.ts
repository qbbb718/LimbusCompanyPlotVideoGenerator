/**
 * @module 立绘动画求值内核（前端）
 * 通道的默认合成方式与合成算子 —— 与后端 `AnimChannel` / `BlendMode` 一一对应。
 *
 * 为什么按通道而不是按 clip 合成：用户很自然会想"抖一下 + 跳一下 + 呼吸"同时开。
 * 如果整条 clip 互相覆盖，任何组合都得手工调解优先级；按通道做加法/乘法之后，
 * 这些组合**天然可交换**，顺序只在显式 `replace` 时才重要。
 */
import type { AnimChannel, BlendMode } from "./animationTypes";

/** 全部合成方式（UI 下拉 / 校验用） */
export const BLEND_MODES: BlendMode[] = ["add", "mul", "replace"];

/** 合成方式的显示名 */
export const BLEND_LABELS: Record<BlendMode, string> = {
  add: "相加",
  mul: "相乘",
  replace: "覆盖",
};

/** 通道的默认合成方式：位移/旋转相加，缩放/透明度相乘 */
export function defaultBlendOf(channel: AnimChannel): BlendMode {
  return channel === "scale" || channel === "alpha" ? "mul" : "add";
}

/**
 * 合成一个通道。
 *
 * @param mode   合成方式
 * @param base   已累积的值（恒等值起步）
 * @param value  本 clip 在本帧贡献的值
 * @param weight 权重包络（0~1）
 */
export function composeChannel(
  mode: BlendMode,
  base: number,
  value: number,
  weight: number,
): number {
  switch (mode) {
    case "mul":
      // 围绕 1 插值：weight=0 时完全不改变 base
      return base * (1 + (value - 1) * weight);
    case "replace":
      // 围绕当前值插值：weight=1 时完全覆盖
      return base + (value - base) * weight;
    case "add":
    default:
      return base + value * weight;
  }
}
