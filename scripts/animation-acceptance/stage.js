/**
 * 立绘动画截帧验收 - 浏览器侧装配
 *
 * 用**真实的前端模块**摆 DOM：
 * - `spriteAnimator.evaluate(anim, frame)` 算这一帧的变换（与预览同一个函数）；
 * - `domTransform.spriteDomStyle(baseRect, transform, anchor)` 算 CSS transform（同上）；
 * - 定位沿用 `PreviewSceneLayer` 的规则：一律百分比，基准是输出帧尺寸。
 *
 * 这些模块由 `run.ps1` 用 tsc 从 `src/features/record/**` 原样编译成 CommonJS，
 * 所以这里 require 到的就是编辑器里跑的那份代码，不是复刻。
 */

/* global require, window */

let mods = null;

/** 只加载一次（每次截图都重新 require 会把 100ms 的等待时间吃掉） */
function loadModules() {
  if (mods) {
    return mods;
  }
  const path = require("path");
  if (!window.__tsDir) {
    throw new Error("window.__tsDir 未注入：capture.js 应该在页面加载后先设置它");
  }
  // eslint-disable-next-line import/no-dynamic-require
  const spriteAnimator = require(path.join(window.__tsDir, "animation", "spriteAnimator.js"));
  // eslint-disable-next-line import/no-dynamic-require
  const domTransform = require(path.join(window.__tsDir, "preview", "domTransform.js"));
  mods = {
    evaluate: spriteAnimator.evaluate,
    anchorOf: spriteAnimator.anchorOf,
    spriteDomStyle: domTransform.spriteDomStyle,
  };
  return mods;
}

/** 与 PreviewSceneLayer.tsx 里的 percent() 逐字符一致 */
function percent(value, total) {
  return total > 0 ? `${(value / total) * 100}%` : "0%";
}

/**
 * 渲染一帧，返回 Promise（图片解码完成即 resolve）。
 *
 * @param {object} manifest 后端导出的清单（output / sprite / anim）
 * @param {number} frameIndex 帧号
 */
window.renderFrame = function renderFrame(manifest, frameIndex) {
  const { evaluate, anchorOf, spriteDomStyle } = loadModules();
  const stage = document.getElementById("stage");
  const frame = manifest.output;
  const sprite = manifest.sprite;

  stage.style.width = `${frame.width}px`;
  stage.style.height = `${frame.height}px`;
  stage.innerHTML = "";

  const transform = evaluate(manifest.anim, frameIndex);
  const anchor = anchorOf(manifest.anim, sprite.anchor.x, sprite.anchor.y);
  const style = spriteDomStyle({ w: sprite.base.w, h: sprite.base.h }, transform, anchor);

  const img = document.createElement("img");
  img.className = "sprite";
  img.alt = "";
  img.draggable = false;
  img.src = window.__assetUrl;
  img.style.left = percent(sprite.out.x, frame.width);
  img.style.top = percent(sprite.out.y, frame.height);
  img.style.width = percent(sprite.out.w, frame.width);
  img.style.height = percent(sprite.out.h, frame.height);
  if (style) {
    img.style.transform = style.transform;
    img.style.transformOrigin = style.transformOrigin;
    if (typeof style.opacity === "number") {
      img.style.opacity = String(style.opacity);
    }
  }
  stage.appendChild(img);

  window.__lastTransform = transform;
  window.__lastStyle = style;

  return new Promise((resolve) => {
    const done = () =>
      // 两帧 rAF：确保布局 + 合成都完成，截图不会截到上一帧
      requestAnimationFrame(() => requestAnimationFrame(() => resolve({
        transform,
        style,
      })));
    if (img.complete && img.naturalWidth > 0) {
      done();
    } else {
      img.onload = done;
      img.onerror = () => resolve({ transform, style, error: "图片加载失败" });
    }
  });
};
