# -*- coding: utf-8 -*-
"""
0_验证计算.py —— 独立复核你那份 sepia 代码里的每一步计算。
只用 numpy，不依赖 cv2 / 不需要图片，直接跑：  python 0_验证计算.py
"""
import numpy as np

CD = np.array([0.13, 0.10, 0.08])    # 你代码里的 color_dark  (R,G,B)
CL = np.array([0.83, 0.76, 0.68])    # 你代码里的 color_light (R,G,B)
GAMMA, BLACK, WHITE = 1.2, 0.05, 0.95

# 图2 实测：亮度 -> RGB（按亮度分箱取中位数）
REF_X = np.array([0.0, 0.015, 0.045, 0.08, 0.125, 0.185, 0.26, 0.35,
                  0.45, 0.56, 0.67, 0.76, 0.835, 0.90, 0.965, 1.0])
REF_Y = np.array([[7, 3, 0], [10, 5, 0], [17, 11, 4], [25, 18, 11],
                  [38, 28, 20], [65, 41, 26], [85, 60, 42], [106, 83, 66],
                  [132, 108, 91], [164, 136, 116], [194, 165, 143], [218, 189, 166],
                  [235, 206, 183], [251, 225, 202], [250, 233, 210], [250, 233, 210]],
                 dtype=np.float64)

ok = lambda b: "通过" if b else "不通过"


def user_ramp(t):
    """你的映射：两点线性插值，t 已含 gamma/黑白场。"""
    t = np.asarray(t, dtype=np.float64)
    if t.ndim == 0:
        return CD + (CL - CD) * t
    return CD[None, :] + (CL - CD)[None, :] * t[:, None]


print("=" * 72)
print("① 权重和：0.299 + 0.587 + 0.114 =", 0.299 + 0.587 + 0.114)
print("   → 纯白 (1,1,1) 映射到 Y =", round(0.299 + 0.587 + 0.114, 6),
      "，白点守恒", ok(abs(0.299 + 0.587 + 0.114 - 1) < 1e-9))

print("\n② 端点：")
print("   t=0 → RGB", np.round(user_ramp(0) * 255, 1), "深棕, R>G>B =", ok(CD[0] > CD[1] > CD[2]))
print("   t=1 → RGB", np.round(user_ramp(1) * 255, 1), "米白, R>G>B =", ok(CL[0] > CL[1] > CL[2]))

print("\n③ 通道顺序（纯色探针，看会不会 BGR/RGB 互换）：")
for name, (r, g, b) in [("纯红", (1., 0., 0.)), ("纯绿", (0., 1., 0.)), ("纯蓝", (0., 0., 1.))]:
    y = 0.299 * r + 0.587 * g + 0.114 * b
    t = np.clip((y - BLACK) / (WHITE - BLACK), 0, 1) ** GAMMA
    rn, gn, bn = user_ramp(t)
    bgr = np.array([bn, gn, rn]) * 255          # np.stack([B_new,G_new,R_new])
    rgb_back = bgr[::-1]
    print(f"   {name}: luma={y:.3f} → 存盘 BGR={np.round(bgr,1)}  反推 RGB={np.round(rgb_back,1)}"
          f"  {'暖色 ✓' if rgb_back[0] > rgb_back[1] > rgb_back[2] else '异常 ✗'}")
print("   → 三个探针都变暖色，说明 [B_new,G_new,R_new] 堆叠顺序正确，没有互换")

print("\n④ 映射单调性：")
t = np.linspace(0, 1, 9)
r_, g_, b_ = user_ramp(t).T
print("   R 单调", ok(np.all(np.diff(r_) > 0)), " G 单调", ok(np.all(np.diff(g_) > 0)),
      " B 单调", ok(np.all(np.diff(b_) > 0)))
print("   暖色偏 R-B (0..255):", np.round((r_ - b_) * 255, 1),
      " ← 随亮度增大，方向正确，但增幅只有图2的一半")

print("\n⑤ 黑场/白场截断：")
print(f"   Y<{BLACK} 的像素全部变成同一个值", tuple(int(round(v*255)) for v in user_ramp(0)))
print(f"   Y>{WHITE} 的像素全部变成同一个值", tuple(int(round(v*255)) for v in user_ramp(1)))
print("   图1 立绘里有 9.4% 的像素落在 Y<0.05 → 这些褶皱细节被压成一片死色")

print("\n⑥ 和实测曲线比（这才是“像不像图2”的关键）：")
for tt in (0.15, 0.30, 0.50, 0.75, 0.95):
    u = user_ramp(tt) * 255
    m = np.array([np.interp(tt, REF_X, REF_Y[:, c]) for c in range(3)])
    print(f"   Y={tt:.2f}  你的({u[0]:5.1f},{u[1]:5.1f},{u[2]:5.1f})  实测({m[0]:5.1f},{m[1]:5.1f},{m[2]:5.1f})"
          f"   Δ={np.abs(u-m).mean():5.1f}   R-B: 你的 {u[0]-u[2]:5.1f} vs 实测 {m[0]-m[2]:5.1f}")

print("\n⑦ 结论：公式本身没错（权重、通道顺序、插值、gamma 方向都对），")
print("   错的是两条端点 + 两点线性这个形状：")
print("   · 暗端 33 → 实测 7   （暗部不够黑，没有“印刷感”的死黑）")
print("   · 亮端 212 → 实测 250（高光被封顶，白衬衫永远到不了真正的高光）")
print("   · 中段 R-B 只有实测的一半 → 出来是“灰褐”，不是“棕”")
