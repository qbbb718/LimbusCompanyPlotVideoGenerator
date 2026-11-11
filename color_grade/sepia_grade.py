# -*- coding: utf-8 -*-
"""
sepia_grade.py —— 把一张立绘（图1）调成参考图（图2）的 sepia 色调。

和你原来那份代码的区别：
  1. 曲线不是“手填两个端点再线性插值”，而是从参考图里按亮度分箱实测出来的
     N 个控制点（见 REF_LUMA / REF_RGB），所以暖色偏的强度随亮度变化能被还原；
  2. 保留 alpha：输出 BGRA，背景不会被偷偷涂成某种颜色；
  3. 颗粒是单通道的（单色颗粒），不是每通道各来一次彩色噪点；
  4. 用 256 级查找表，比逐像素浮点运算快得多，也便于逐帧处理视频。

用法：
    python sepia_grade.py fig1.png out.png
    python sepia_grade.py fig1.png out.png --ref fig2.png     # 用别的参考图重新拟合
"""
import numpy as np
import cv2

# ---------------------------------------------------------------- 实测控制点
# 由 fig2（参考图）按亮度分箱取 RGB 中位数得到，端点取最暗/最亮 2% 的中位数。
# 输入：亮度 Y ∈ [0,1]；输出：RGB ∈ [0,255]
REF_LUMA = [0.000, 0.015, 0.045, 0.080, 0.125, 0.185, 0.260, 0.350,
            0.450, 0.560, 0.670, 0.760, 0.835, 0.900, 0.965, 1.000]
REF_RGB = [(7, 3, 0), (10, 5, 0), (17, 11, 4), (25, 18, 11),
           (38, 28, 20), (65, 41, 26), (85, 60, 42), (106, 83, 66),
           (132, 108, 91), (164, 136, 116), (194, 165, 143), (218, 189, 166),
           (235, 206, 183), (251, 225, 202), (250, 233, 210), (250, 233, 210)]

# 参考图边框背景的中位色，用作合成底色（想要透明就传 bg=None）
REF_BG = np.array([29, 21, 15], dtype=np.float32)


def fit_curve(ref_bgr, bins=16):
    """从任意参考图估一条“亮度 -> RGB”曲线，返回 (luma_ctrl, rgb_ctrl)。"""
    rgb = cv2.cvtColor(ref_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    y = (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]).ravel()
    px = rgb.reshape(-1, 3)
    edges = np.linspace(0.0, 1.0, bins + 1)
    xs, ys = [0.0], [np.median(px[y < 0.02], axis=0) * 255 if (y < 0.02).sum() > 100 else None]
    for i in range(len(edges) - 1):
        m = (y >= edges[i]) & (y < edges[i + 1])
        if m.sum() > 200:
            xs.append((edges[i] + edges[i + 1]) / 2)
            ys.append(np.median(px[m], axis=0) * 255)
    xs.append(1.0)
    ys.append(np.median(px[y > 0.95], axis=0) * 255 if (y > 0.95).sum() > 100 else ys[-1])
    ys = np.vstack(ys)
    ys = np.maximum.accumulate(ys, axis=0)      # 强制单调，避免暗部反相
    return np.array(xs), ys


def _build_lut(luma_ctrl, rgb_ctrl):
    """256 级查找表：输入亮度 0..255 -> 输出 BGR 0..255"""
    y8 = np.arange(256, dtype=np.float32) / 255.0
    lut = np.zeros((256, 3), dtype=np.uint8)
    for c in range(3):
        lut[:, c] = np.clip(np.interp(y8, luma_ctrl, rgb_ctrl[:, c]), 0, 255)
    return lut                                      # [..., 0]=R, [...,1]=G, [...,2]=B


def grade(img, luma_ctrl=None, rgb_ctrl=None, gamma=1.0, grain=2.0,
          seed=None, bg=REF_BG, bg_scale=1.0):
    """
    img      : cv2.imread(path, cv2.IMREAD_UNCHANGED) 的结果，BGR 或 BGRA
    gamma    : >1 压暗中间调（想更贴近“低调”的画面就调大）
    grain    : 单色颗粒强度（8bit 单位为 sigma），0 可关闭
    bg       : 合成底色 RGB；None 表示输出保留透明
    bg_scale : 底色明度系数
    返回     : 与 img 同通道数的 uint8 图
    """
    luma_ctrl = REF_LUMA if luma_ctrl is None else luma_ctrl
    rgb_ctrl = np.array(REF_RGB if rgb_ctrl is None else rgb_ctrl, dtype=np.float32)

    has_alpha = img.ndim == 3 and img.shape[2] == 4
    bgr = img[:, :, :3].astype(np.float32) / 255.0
    b, g, r = bgr[:, :, 0], bgr[:, :, 1], bgr[:, :, 2]

    # 1) 亮度（Rec.601，和你的公式一致）
    y = 0.299 * r + 0.587 * g + 0.114 * b
    if gamma != 1.0:
        y = np.power(np.clip(y, 0.0, 1.0), gamma)

    # 2) 查表把亮度映射成 sepia 颜色（等价于逐点插值，只是更快）
    lut = _build_lut(np.asarray(luma_ctrl, np.float32), rgb_ctrl)
    y8 = np.clip(y * 255.0 + 0.5, 0, 255).astype(np.uint8)
    out = lut[y8].astype(np.float32)                  # HxWx3，R,G,B
    out = out[:, :, ::-1]                             # -> BGR

    # 3) 单色颗粒：三个通道共用同一张噪声
    if grain > 0:
        rng = np.random.default_rng(seed)
        n = rng.normal(0.0, grain, y.shape)[..., None]
        out = out + n

    out = np.clip(out, 0, 255)

    if has_alpha:
        alpha = img[:, :, 3:4].astype(np.float32) / 255.0
        if bg is not None:
            bg_bgr = np.array(bg, np.float32)[::-1] * bg_scale
            out = out * alpha + bg_bgr[None, None, :] * (1.0 - alpha)
            return out.clip(0, 255).astype(np.uint8)
        rgba = np.dstack([out, img[:, :, 3:4]])
        return rgba.clip(0, 255).astype(np.uint8)

    return out.astype(np.uint8)                        # 无 alpha：直接出 BGR


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("dst")
    ap.add_argument("--ref", default=None, help="参考图，给了就现场重新拟合曲线")
    ap.add_argument("--gamma", type=float, default=1.0)
    ap.add_argument("--grain", type=float, default=2.0)
    ap.add_argument("--transparent", action="store_true", help="不合成底色，输出带 alpha")
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()

    img = cv2.imread(a.src, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise SystemExit(f"读不到图: {a.src}")
    kw = dict(gamma=a.gamma, grain=a.grain, seed=a.seed,
              bg=None if a.transparent else REF_BG)
    if a.ref:
        ref = cv2.imread(a.ref, cv2.IMREAD_COLOR)
        kw["luma_ctrl"], kw["rgb_ctrl"] = fit_curve(ref)
    out = grade(img, **kw)
    cv2.imwrite(a.dst, out)
    print(f"已保存 {a.dst}  shape={out.shape}")


if __name__ == "__main__":
    main()
