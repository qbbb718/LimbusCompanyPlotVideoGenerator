import { Portrait } from "@types";
import { AppConfig } from "@root/features/common/config/appConfig";
import { ImageSize } from "./portraitCrop";
import { loadImageElement } from "./imageUtils";

/**
 * 立绘工具函数
 *
 * 默认立绘的唯一真实来源是后端 Portrait.defaultPortrait
 * （对应数据库 character_portraits.is_default）。
 *
 * 历史实现用 portraits[0] 的位置约定表示默认立绘，导致：
 * - 后端按 port_name 排序返回时，默认立绘会被改名影响；
 * - 每次保存角色都会把默认立绘重置回列表首项。
 * 因此统一改为读取标记，并在标记缺失时回退到首项以兼容旧数据。
 *
 * <p>列表顺序是**用户显式排出来的**（拖拽 / display_order），默认立绘可以在任意位置；
 * 这里不再提供"把默认立绘排到第一张"的函数，任何排序都必须原样保留。
 */

/**
 * 判断某个立绘是否为默认立绘
 */
export const isDefaultPortraitId = (
  portraits: Portrait[] | undefined | null,
  portraitId: string | undefined | null,
): boolean => {
  if (!portraits || portraits.length === 0 || !portraitId) {
    return false;
  }
  const marked = portraits.find((p) => p.defaultPortrait);
  if (marked) {
    return marked.portraitID === portraitId;
  }
  // 后端未返回标记（旧数据/旧接口）时回退到首项约定
  return portraits[0]?.portraitID === portraitId;
};

/**
 * 取得默认立绘。没有立绘时返回 null。
 */
export const getDefaultPortrait = (
  portraits: Portrait[] | undefined | null,
): Portrait | null => {
  if (!portraits || portraits.length === 0) {
    return null;
  }
  return portraits.find((p) => p.defaultPortrait) ?? portraits[0] ?? null;
};

/**
 * 保证立绘列表里**有且仅有一个**默认标记，且不改变数组顺序。
 *
 * <p>默认立绘的角标按 `defaultPortrait` 标记渲染，不按位置。如果数据里一个标记都没有
 * （老库 / 旧接口），角标只能靠"首项兜底"显示；一旦拖拽换了位置，角标就会跟错卡片。
 * 所以进入编辑状态时先归一化一次：
 * <ol>
 *   <li>已有多个标记：保留第一个（与 {@link getDefaultPortrait} 的取法一致），其余取消；</li>
 *   <li>一个标记都没有：把第一张标为默认（与后端"没有依据时取列表第一个"的兜底一致）；</li>
 *   <li>恰好一个：原样返回同一个引用，避免无意义的数组重建。</li>
 * </ol>
 *
 * <p>只改本地状态，不写数据库；用户点「保存」或「设为默认」时才会落库。
 *
 * @param portraits 立绘列表（可空）
 * @returns 顺序不变、默认标记唯一的列表；入参为空时返回空数组
 */
export const normalizePortraitDefaults = (
  portraits: Portrait[] | undefined | null,
): Portrait[] => {
  if (!portraits || portraits.length === 0) {
    return [];
  }

  const marked = portraits.filter((portrait) => portrait.defaultPortrait);
  if (marked.length === 1) {
    return portraits;
  }

  // 多个标记时认第一个（与 getDefaultPortrait / isDefaultPortraitId 的兜底一致）；
  // 一个都没有时把第一张标成默认。
  const defaultPortraitId = marked[0]?.portraitID ?? portraits[0].portraitID;
  return portraits.map((portrait) => ({
    ...portrait,
    defaultPortrait: portrait.portraitID === defaultPortraitId,
  }));
};

/**
 * 情绪标识归一化：只做"大小写 + 首尾空格"的整理，**不做**中英文关键词猜测。
 *
 * <p>立绘的名称（`罗佳-开心.png`、`face_happy_L`）是人写的、会改名，也不是唯一来源；
 * 情绪的真实来源只有 {@link Portrait.emotion} 这个从立绘编辑里存下来的字段。
 * 后端 JSON 里是 `@JsonValue` 的小写 code（normal / happy …），而数据库存的是大写枚举名
 * （`EmotionMapper` 用 `Emotion.valueOf`），旧工程文件两种写法都可能出现，所以按小写比。
 *
 * @returns 归一化后的标识；缺失 / 不是字符串时为空串（= 没有情绪，按"无匹配"处理）
 */
const normalizeEmotionCode = (
  emotion: Portrait["emotion"] | string | null | undefined,
): string => (typeof emotion === "string" ? emotion.trim().toLowerCase() : "");

/**
 * 在立绘列表里找一张**情绪一致**的立绘。
 *
 * <p>只认 {@link Portrait.emotion}（见 {@link normalizeEmotionCode}），不按名字猜。
 *
 * @param portraits 候选立绘（一般是新角色的全部立绘）
 * @param emotion   要匹配的情绪；缺失（旧数据 / 立绘没设情绪）时一律当"无匹配"
 * @returns 第一张同情绪的立绘；没有情绪、列表为空或找不到时返回 null
 */
export const findPortraitByEmotion = (
  portraits: Portrait[] | undefined | null,
  emotion: Portrait["emotion"] | string | null | undefined,
): Portrait | null => {
  const code = normalizeEmotionCode(emotion);
  if (!portraits || portraits.length === 0 || !code) {
    return null;
  }
  return (
    portraits.find(
      (portrait) => normalizeEmotionCode(portrait.emotion) === code,
    ) ?? null
  );
};

/**
 * 换角色时的立绘匹配规则：**先找同情绪的，找不到就用默认立绘**。
 *
 * <p>用于「剧情编辑 → 立绘」里给某张立绘换角色：旧立绘的情绪是 happy，
 * 新角色也有 happy 的就换成那张；新角色没有 happy 就退回它的默认立绘
 * （默认标记见 {@link getDefaultPortrait}），而不是随手抓列表第一张。
 *
 * <p>语义与后端 `CharacterServiceImpl.findPortraitByEmotion()` / 文本解析里的
 * `(情绪)` 处理保持一致：同情绪 → 默认立绘。两者都没有（新角色一张立绘都没有）时返回
 * `null`，由调用方决定空态怎么显示。
 *
 * @param portraits 新角色的全部立绘
 * @param emotion   旧立绘的情绪标识
 * @returns 匹配到的立绘；没有可选立绘时返回 null
 */
export const resolvePortraitForEmotion = (
  portraits: Portrait[] | undefined | null,
  emotion: Portrait["emotion"] | string | null | undefined,
): Portrait | null =>
  findPortraitByEmotion(portraits, emotion) ?? getDefaultPortrait(portraits);

/** 拖拽落点相对目标卡片的位置 */
export type PortraitDropPosition = "before" | "after";

/** 立绘列表的 ID 顺序（保存 display_order / 回滚时用） */
export const portraitIdsOf = (
  portraits: Portrait[] | undefined | null,
): string[] => (portraits ?? []).map((portrait) => portrait.portraitID);

/**
 * 把 `fromPortraitId` 拖到 `toPortraitId` 的前面 / 后面（返回新数组，不改动入参）。
 *
 * <p>默认立绘没有任何特殊待遇：它既可以作为被拖动的来源，也可以作为落点，
 * 位置完全由用户决定。落点算出来和原顺序一样时返回**同一个引用**，
 * 调用方据此跳过无意义的请求 / 状态更新（只有一张立绘时拖拽就是这种情况）。
 *
 * @param portraits     原列表
 * @param fromPortraitId 被拖动的立绘ID
 * @param toPortraitId   落点立绘ID
 * @param position       `before` = 放到目标前面，`after` = 放到目标后面
 * @returns 排序后的新列表；无需移动 / 找不到 / 同一张时返回原列表
 */
export const movePortrait = (
  portraits: Portrait[] | undefined | null,
  fromPortraitId: string | null | undefined,
  toPortraitId: string | null | undefined,
  position: PortraitDropPosition,
): Portrait[] => {
  const list = portraits ?? [];
  if (
    list.length < 2 ||
    !fromPortraitId ||
    !toPortraitId ||
    fromPortraitId === toPortraitId
  ) {
    return list;
  }

  const fromIndex = list.findIndex(
    (portrait) => portrait.portraitID === fromPortraitId,
  );
  const targetIndex = list.findIndex(
    (portrait) => portrait.portraitID === toPortraitId,
  );
  if (fromIndex < 0 || targetIndex < 0) {
    return list;
  }

  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  // 先按"移动前"的目标下标算插入点，再把被抽走的那一项造成的偏移补回来
  let insertIndex = targetIndex + (position === "after" ? 1 : 0);
  if (fromIndex < insertIndex) {
    insertIndex -= 1;
  }
  insertIndex = Math.max(0, Math.min(insertIndex, next.length));
  next.splice(insertIndex, 0, moved);

  // 位置没变（例如把 B 拖到 A 的右半边）就返回原引用，避免触发一次无意义保存
  const unchanged = next.every(
    (portrait, index) => portrait === list[index],
  );
  return unchanged ? list : next;
};

/**
 * 按给定的 ID 顺序重排立绘（返回新数组，不改动入参）。
 *
 * <p>用于保存失败后的回滚：只按**顺序**恢复，立绘对象仍取当前列表里的那一份，
 * 所以回滚不会把期间改过的裁剪 / 默认标记 / 新加的立绘一起抹掉。
 * `orderedIds` 里没有的立绘会按原相对顺序追加到末尾，不会丢。
 *
 * @param portraits  当前立绘列表
 * @param orderedIds 期望的顺序（立绘ID）
 * @returns 重排后的新列表；顺序本来就一致时返回原列表
 */
export const applyPortraitOrder = (
  portraits: Portrait[] | undefined | null,
  orderedIds: string[] | undefined | null,
): Portrait[] => {
  const list = portraits ?? [];
  if (list.length === 0 || !orderedIds || orderedIds.length === 0) {
    return list;
  }

  const byId = new Map(list.map((portrait) => [portrait.portraitID, portrait]));
  const ordered: Portrait[] = [];
  for (const portraitId of orderedIds) {
    const portrait = byId.get(portraitId);
    if (portrait) {
      ordered.push(portrait);
      byId.delete(portraitId);
    }
  }
  // 顺序表里没提到的新立绘：保持它们原来的相对顺序接在后面
  for (const portrait of list) {
    if (byId.has(portrait.portraitID)) {
      ordered.push(portrait);
      byId.delete(portrait.portraitID);
    }
  }

  const unchanged =
    ordered.length === list.length &&
    ordered.every((portrait, index) => portrait === list[index]);
  return unchanged ? list : ordered;
};

/**
 * 把某个立绘标记为默认，其余立绘取消标记（返回新数组，不改动入参）。
 *
 * <p>**不会把新的默认立绘挪到第一位**：默认立绘可以位于列表任意位置，
 * 卡片原地不动、只有角标换到对应卡片上。用户在拖拽排序后把某张设为默认，
 * 也不会把已经排好的顺序打乱。
 *
 * <p>传入的立绘ID不在列表里时原样返回（不误清掉现有默认标记）。
 */
export const markDefaultPortrait = (
  portraits: Portrait[] | undefined | null,
  portraitId: string,
): Portrait[] => {
  if (!portraits || portraits.length === 0) {
    return [];
  }
  if (!portraits.some((portrait) => portrait.portraitID === portraitId)) {
    return portraits;
  }
  return portraits.map((portrait) => ({
    ...portrait,
    defaultPortrait: portrait.portraitID === portraitId,
  }));
};

/**
 * 立绘原图的访问 URL。
 *
 * <p>`Portrait.imagePath` 是相对角色素材根目录的路径（例如
 * `char_1785997975135/portrait_1785997993031.png`），必须整段拼上去：
 * 只取文件名会让「按 characterId 分目录存放」的新立绘 404。
 */
export const buildPortraitImageUrl = (
  imagePath: string | null | undefined,
): string => {
  if (!imagePath) {
    return "";
  }
  if (
    /^https?:/i.test(imagePath) ||
    imagePath.startsWith("data:") ||
    imagePath.startsWith("blob:")
  ) {
    return imagePath;
  }
  const apiBase = AppConfig.api.baseUrl.replace(/\/$/, "");
  return `${apiBase}${AppConfig.resources.charactersBasePath}/${imagePath.replace(
    /^\/+/,
    "",
  )}`;
};

/**
 * 立绘缩略图的访问 URL。
 *
 * <p>库里的 `Portrait.thumbnailPath` 有三种历史形态，必须都认：
 * 1. 后端当前返回的 `/assets/characters/{characterId}/thumbnails/xxx.png` —— 补上主机名即可；
 * 2. 已经拼好主机名的绝对 URL（老工程、资源包导入的数据）—— 原样使用，重复拼接会 404；
 * 3. 只有文件名（更老的库，缩略图平铺在角色素材根目录）—— 按文件名兜底拼一次。
 *
 * <p>注意第 1 种要**整段**拼上去（含 `characters/{id}/thumbnails` 子目录），
 * 只取文件名会让新立绘的缩略图全部 404。
 */
export const buildPortraitThumbnailUrl = (
  thumbnailPath: string | null | undefined,
): string => {
  if (!thumbnailPath) {
    return "";
  }
  const apiBase = AppConfig.api.baseUrl.replace(/\/$/, "");
  // 第 2 种：已经是完整地址，原样返回
  if (/^(https?:|data:|blob:)/i.test(thumbnailPath)) {
    return thumbnailPath;
  }
  // 第 1 种：后端给的资源路径，补主机名（路径整段保留）
  if (thumbnailPath.startsWith("/")) {
    return `${apiBase}${thumbnailPath}`;
  }
  // 第 3 种：只有文件名，按「角色素材根目录」兜底
  return `${apiBase}${AppConfig.resources.charactersBasePath}/${encodeURIComponent(
    thumbnailPath,
  )}`;
};

/**
 * 缩略图缺失时的占位图（内联 SVG）。
 *
 * <p>立绘的缩略图可能从来没生成过、也可能被用户在资源管理里删了，
 * 弹窗里留一个浏览器的裂图标既难看又看不出原因，统一换成一个中性的占位块。
 * 用 encodeURIComponent 拼 data URI，避免 `#`、尖括号这些字符把 URL 截断。
 */
export const MISSING_THUMBNAIL_PLACEHOLDER: string =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">' +
      '<rect fill="#eee" width="80" height="80"/>' +
      '<text x="40" y="45" text-anchor="middle" fill="#999" font-size="12">无缩略图</text>' +
      "</svg>",
  );

/**
 * 正在读取中的立绘原图尺寸（按 URL 去重）。
 *
 * <p>只去重**并发**的重复读取，读到就删：立绘图片可能被「换一张图」原地覆盖，
 * 长期缓存会让下一次套用裁剪时用的是旧尺寸。
 */
const pendingPortraitImageSizes = new Map<string, Promise<ImageSize | null>>();

/**
 * 读一张立绘原图的像素尺寸。
 *
 * <p>`{ faceX, faceY, length }` 存的是原图像素，想把默认立绘的裁剪**按比例**套到
 * 另一张立绘上，必须先知道两张图各自的尺寸（例如 1600×2432 与 640×983）。
 * 读不到（路径为空 / 图片 404 / 解码失败）时返回 null，调用方退回按像素照搬。
 */
export const loadPortraitImageSize = (
  imagePath: string | null | undefined,
): Promise<ImageSize | null> => {
  const url = buildPortraitImageUrl(imagePath);
  if (!url) {
    return Promise.resolve(null);
  }

  const pending = pendingPortraitImageSizes.get(url);
  if (pending) {
    return pending;
  }

  const loading = loadImageElement(url).then(
    (image) => {
      pendingPortraitImageSizes.delete(url);
      return { width: image.naturalWidth, height: image.naturalHeight };
    },
    (error) => {
      pendingPortraitImageSizes.delete(url);
      console.warn("[portraitUtils] 读取立绘原图尺寸失败", url, error);
      return null;
    },
  );

  pendingPortraitImageSizes.set(url, loading);
  return loading;
};
