/**
 * @module 序列帧预加载
 *
 * 预览播放器是"每帧换一次 `<img src>`"，浏览器对没缓存过的地址会先发请求再解码。
 * 30fps 下这会让开头几轮出现闪白/跳帧——用户第一眼看到的效果就是"这段动画卡"。
 *
 * 所以一旦知道"这条记录挂了某套素材"，就把它的帧图**提前 `new Image()` 拉一遍**，
 * 让浏览器 HTTP 缓存里先躺好（`/assets/**` 有 1 小时缓存，见后端 `WebMvcConfig`）。
 * 之后换 src 只是命中缓存，切帧没有延迟。
 *
 * <p>这里刻意**不保存 Image 对象**：占用浏览器内存没必要，缓存已经在 HTTP 层了。
 * 只用一个 `Set` 记住"哪些地址已经拉过"，避免重复请求。
 */
import ApiService from "@services/ApiService";

const requested = new Set<string>();

/** 仅测试用：清掉"已拉过"的记录 */
export function resetFramePreloaderForTesting(): void {
  requested.clear();
}

/**
 * 预加载一套素材的所有帧图（幂等，重复调用不会重复请求）。
 *
 * @param clipId 素材 id
 * @param count  帧数（超过 240 的部分不加载，与导入上限一致）
 */
export function preloadClipFrames(clipId: string | undefined | null, count: number): void {
  if (!clipId || !(count > 0)) return;
  const limit = Math.min(count, 240);
  for (let index = 0; index < limit; index += 1) {
    const url = ApiService.getAnimationClipFrameUrl(clipId, index);
    if (!url || requested.has(url)) continue;
    requested.add(url);
    // 失败不重试：预览里那一帧自然是空白，不影响成片（成片由后端自己解码）
    const image = new Image();
    image.src = url;
  }
}
