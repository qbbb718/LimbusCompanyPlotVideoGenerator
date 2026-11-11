/**
 * @module T 巢滤镜的 SVG 定义（DOM 场景层用）
 *
 * 平时预览看到的是后端渲的栅格图（滤镜已经烘进像素里了）。只有在**拖拽跟手、播放、
 * 对位自检**这几秒钟里，画面才由 DOM 场景层顶上——那几帧要用 CSS 复刻同一套调色，
 * 否则"拖动时是彩色的、松手变棕的"会更难接受。
 *
 * <h2>结构</h2>
 * <pre>
 *   feColorMatrix  → 把 RGB 压成亮度（0.299 / 0.587 / 0.114），三个通道都等于 y
 *   feComponentTransfer → 对 y 分别查 R/G/B 三条 256 级表
 * </pre>
 * 与后端 `TCorpFilter.applyInPlace` 的 `y = round(.299R+.587G+.114B)` + 查表逐项对应。
 *
 * <h2>两个容易踩的坑</h2>
 * <ul>
 *   <li><b>必须写 `color-interpolation-filters="sRGB"`</b>：SVG 滤镜默认在 linearRGB 空间算，
 *       同一组数出来的画面会明显发亮、发灰，和成片对不上；</li>
 *   <li><b>不要给滤镜加 `x/y/width/height` 之外的裁剪</b>：滤镜区域默认是 -10%~120% 的盒子，
 *       够用；这里显式写清楚，避免某些版本把边缘切掉。</li>
 * </ul>
 *
 * <p>组件本身渲染一个 0×0、`aria-hidden` 的 `<svg>`：不占布局、不进无障碍树。
 * 整页只挂一份（见 `RecordPreview`），CSS 里用 `filter: url(#dsh-t-corp-filter)` 引用。
 */
import React, { useMemo } from "react";
import { T_CORP_FILTER_ID, tCorpTableValues } from "./tCorpFilter";

/**
 * @component T 巢滤镜的 `<filter>` 定义
 *
 * @param enabled 只在开启时挂载：关掉时 DOM 里不留任何节点（与不加这个功能时完全一致）
 */
const TCorpFilterDefs: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const tables = useMemo(() => (enabled ? tCorpTableValues() : null), [enabled]);

  if (!enabled || !tables) return null;

  return (
    <svg className="t-corp-filter-defs" aria-hidden="true" focusable="false" width="0" height="0">
      <defs>
        <filter
          id={T_CORP_FILTER_ID}
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          {/* Rec.601 亮度：三行相同 → 输出 (y, y, y) */}
          <feColorMatrix
            type="matrix"
            values="0.299 0.587 0.114 0 0
                    0.299 0.587 0.114 0 0
                    0.299 0.587 0.114 0 0
                    0     0     0     1 0"
          />
          {/* 亮度 → 棕褐色带：三条 256 级表（与后端同一份控制点） */}
          <feComponentTransfer>
            <feFuncR type="table" tableValues={tables.r} />
            <feFuncG type="table" tableValues={tables.g} />
            <feFuncB type="table" tableValues={tables.b} />
          </feComponentTransfer>
        </filter>
      </defs>
    </svg>
  );
};

export default TCorpFilterDefs;
