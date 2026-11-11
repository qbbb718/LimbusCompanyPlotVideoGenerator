# -*- coding: utf-8 -*-
"""把 T 巢滤镜的开/关两帧拼成验收图：全景对照 + UI 局部放大（证明 UI 没被染色）。"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = r"D:\LimbusCompanyPlotVideoGenerator\filter_proof"
BG = (22, 20, 18)
FG = (238, 234, 230)
ACC = (226, 172, 96)
MUT = (158, 150, 142)

def font(sz):
    for p in (r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()

off = Image.open(os.path.join(HERE, "frame_off.png")).convert("RGB")
on = Image.open(os.path.join(HERE, "frame_on.png")).convert("RGB")

# ---- 全景：两张各 716 宽 ----
pw = 716
ph = round(pw * off.height / off.width)
pad, gap, top = 26, 20, 118
col_w = 640

panels = [
    ("③ 局部放大 · 地点牌（上=关闭 / 下=开启）", (10, 10, 770, 200)),
    ("③ 局部放大 · 台词（上=关闭 / 下=开启）", (500, 810, 1460, 1000)),
]
scaled = []
for label, box in panels:
    a = off.crop(box)
    c = on.crop(box)
    h = round(col_w * a.height / a.width)
    scaled.append((label, a.resize((col_w, h), Image.LANCZOS), c.resize((col_w, h), Image.LANCZOS)))

y_zoom = top + ph + 46
zoom_h = max(a.height * 2 + 8 for _, a, _ in scaled)
sheet_w = pad * 2 + pw * 2 + gap
sheet_h = y_zoom + zoom_h + pad
sheet = Image.new("RGB", (sheet_w, sheet_h), BG)
d = ImageDraw.Draw(sheet)

d.text((pad, 20), "T巢滤镜：开关对照", font=font(30), fill=FG)
d.text((pad, 62), "左=关闭（原色）　右=开启（只调画面层，UI 层保持原样）", font=font(19), fill=MUT)

d.text((pad, top - 30), "① 关闭", font=font(19), fill=MUT)
d.text((pad + pw + gap, top - 30), "② 开启（T巢滤镜）", font=font(19), fill=ACC)
sheet.paste(off.resize((pw, ph), Image.LANCZOS), (pad, top))
sheet.paste(on.resize((pw, ph), Image.LANCZOS), (pad + pw + gap, top))

x = pad
for label, a, c in scaled:
    d.text((x, y_zoom - 30), label, font=font(17), fill=ACC)
    sheet.paste(a, (x, y_zoom))
    sheet.paste(c, (x, y_zoom + a.height + 8))
    x += col_w + 24

out_path = os.path.join(HERE, "compare_T巢滤镜.png")
sheet.save(out_path)
print("saved", out_path, sheet.size)

# ---- 数值证据 ----
oa = np.asarray(off).astype(int)
ob = np.asarray(on).astype(int)
def rep(name, y0, y1, x0, x1):
    a = oa[y0:y1, x0:x1].reshape(-1, 3)
    b = ob[y0:y1, x0:x1].reshape(-1, 3)
    print(f"{name:12s} 像素 {len(a):7d}  开/关最大通道差 {np.abs(a - b).max():3d}")
rep("地点牌内部", 25, 115, 25, 330)
rep("纯黑边", 0, 20, 0, 1920)
rep("画面中央", 400, 700, 700, 1300)
