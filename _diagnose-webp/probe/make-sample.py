"""生成一张最小的无损 WebP 样本（左上透明 / 右下纯色），用于安装包自检。

之所以自己生成而不是打包一张 118KB 的立绘：自检必须能在任意用户机器上直接跑，
样本越小越容易内联进 Java 常量（自检对象是解码器，不是素材）。

约定（Java 侧 WebpSelfCheck 依赖同样的约定）：
  8x4 RGBA，左上 4x2 透明，右下 4x2 为 #3366CC 且 alpha=255。
"""
from PIL import Image
import base64
import textwrap

W, H = 8, 4
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for y in range(2, H):
    for x in range(4, W):
        img.putpixel((x, y), (0x33, 0x66, 0xCC, 255))

path = "pil-sample.webp"
img.save(path, format="WEBP", lossless=True, quality=100, method=6)
data = open(path, "rb").read()
print("bytes:", len(data))
print("head:", data[:24].hex())
b64 = base64.b64encode(data).decode("ascii")
print("base64 chars:", len(b64))
print("---- java literal ----")
for line in textwrap.wrap(b64, 100):
    print('            + "%s"' % line)
print("---- raw ----")
print(b64)
