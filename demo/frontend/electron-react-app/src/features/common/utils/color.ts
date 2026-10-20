/**
 * @module 颜色工具
 *
 * 颜色面板里"用户手输的十六进制颜色"与"渲染层 / 颜色选择器能用的 #RRGGBB"之间的转换。
 * 后端 ProjectConfig.parseColor 支持 #RGB / #RRGGBB / #AARRGGBB，
 * 这里只放行不含透明度的 #RGB / #RRGGBB：颜色面板用的 HexColorPicker 不支持透明度，
 * 8 位颜色的意义是"带透明度"，前端存了也没法正确回显。
 */

/** 只认 #RGB / #RRGGBB（# 可省略） */
const HEX_COLOR_PATTERN = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * @function 规范化十六进制颜色
 * 允许 #RGB / #RRGGBB（# 可省略、大小写不限），统一转成大写 #RRGGBB。
 * 其它写法（8 位带透明度、rgb()、"red" 等）一律返回 null，由调用方决定回退值。
 */
export function normalizeHexColor(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;

  const match = HEX_COLOR_PATTERN.exec(raw.trim());
  if (!match) return null;

  let hex = match[1];
  if (hex.length === 3) {
    // #FDB → #FFF DDBB
    hex = hex
      .split("")
      .map((char) => char + char)
      .join("");
  }
  return `#${hex.toUpperCase()}`;
}
