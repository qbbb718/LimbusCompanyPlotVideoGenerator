import { AppConfig } from "@root/features/common/config/appConfig";
import { Emotion, Portrait } from "@types";
import {
  MISSING_THUMBNAIL_PLACEHOLDER,
  applyPortraitOrder,
  buildPortraitThumbnailUrl,
  findPortraitByEmotion,
  getDefaultPortrait,
  isDefaultPortraitId,
  markDefaultPortrait,
  movePortrait,
  normalizePortraitDefaults,
  portraitIdsOf,
  resolvePortraitForEmotion,
} from "./portraitUtils";

/**
 * 立绘缩略图地址的三种历史形态都要能显示出来（资源管理、剧情编辑的立绘 tab、
 * 「更换立绘」弹窗、说话人下拉框的角色小头像都走这个函数）。
 */
describe("buildPortraitThumbnailUrl", () => {
  const apiBase = AppConfig.api.baseUrl.replace(/\/$/, "");

  it("后端当前的 /assets/... 形态：补上主机名，路径整段保留", () => {
    expect(
      buildPortraitThumbnailUrl(
        "/assets/characters/char_1/thumbnails/thumbnail_portrait_1.png",
      ),
    ).toBe(
      `${apiBase}/assets/characters/char_1/thumbnails/thumbnail_portrait_1.png`,
    );
  });

  it("已经是绝对 URL 的（老工程/资源包）：原样返回，不重复拼接", () => {
    const absolute =
      "http://localhost:8081/assets/characters/char_1/thumbnails/thumb.png";
    expect(buildPortraitThumbnailUrl(absolute)).toBe(absolute);
  });

  it("data: / blob: 直接返回", () => {
    expect(buildPortraitThumbnailUrl("data:image/png;base64,AAAA")).toBe(
      "data:image/png;base64,AAAA",
    );
    expect(buildPortraitThumbnailUrl("blob:http://localhost/abc")).toBe(
      "blob:http://localhost/abc",
    );
  });

  it("只有文件名（更老的库）：兜底拼到角色素材根目录", () => {
    expect(buildPortraitThumbnailUrl("格雷 高尔.png")).toBe(
      `${apiBase}/assets/characters/${encodeURIComponent("格雷 高尔.png")}`,
    );
  });

  it("空路径返回空串（调用方据此画占位块，而不是发一个 404 请求）", () => {
    expect(buildPortraitThumbnailUrl("")).toBe("");
    expect(buildPortraitThumbnailUrl(undefined)).toBe("");
    expect(buildPortraitThumbnailUrl(null)).toBe("");
  });
});

describe("MISSING_THUMBNAIL_PLACEHOLDER", () => {
  it("是被编码过的 SVG data URI（不会被 # 或尖括号截断）", () => {
    expect(MISSING_THUMBNAIL_PLACEHOLDER.startsWith("data:image/svg+xml")).toBe(
      true,
    );
    expect(MISSING_THUMBNAIL_PLACEHOLDER).not.toContain("<svg");
    expect(decodeURIComponent(MISSING_THUMBNAIL_PLACEHOLDER)).toContain(
      "无缩略图",
    );
  });
});

/** 造一个只带立绘判定会用到的字段的立绘 */
const portrait = (
  portraitID: string,
  defaultPortrait = false,
  emotion: Emotion = Emotion.NORMAL,
): Portrait => ({
  portraitID,
  characterID: "char_order_test",
  imagePath: `char_order_test/${portraitID}.png`,
  portName: `立绘-${portraitID}`,
  emotion,
  faceX: 0,
  faceY: 0,
  length: 100,
  adjX: 0,
  adjY: 0,
  thumbnailPath: "",
  defaultPortrait,
});

const ids = (portraits: Portrait[]): string[] =>
  portraits.map((p) => p.portraitID);

/**
 * 默认立绘标记归一化：顺序不变，只保证"有且仅有一个默认标记"。
 *
 * <p>默认立绘允许在列表任意位置，渲染角标按标记走；如果数据里没有标记，
 * 只能靠"首项兜底"显示，拖拽后角标就会跟错卡片，所以进入编辑态先归一化一次。
 */
describe("normalizePortraitDefaults", () => {
  it("一个标记都没有：把第一张标成默认，顺序不变", () => {
    const list = [portrait("a"), portrait("b"), portrait("c")];

    const next = normalizePortraitDefaults(list);

    expect(ids(next)).toEqual(["a", "b", "c"]);
    expect(next.map((p) => !!p.defaultPortrait)).toEqual([true, false, false]);
    // 不改动入参
    expect(list.every((p) => !p.defaultPortrait)).toBe(true);
  });

  it("已经有默认立绘：原样返回同一个引用，且默认立绘可以在中间", () => {
    const list = [portrait("a"), portrait("default", true), portrait("c")];

    expect(normalizePortraitDefaults(list)).toBe(list);
    expect(getDefaultPortrait(list)?.portraitID).toBe("default");
  });

  it("多个默认标记：只保留第一个（与 getDefaultPortrait 的取法一致）", () => {
    const list = [
      portrait("a"),
      portrait("b", true),
      portrait("c", true),
    ];

    const next = normalizePortraitDefaults(list);

    expect(ids(next)).toEqual(["a", "b", "c"]);
    expect(next.map((p) => !!p.defaultPortrait)).toEqual([false, true, false]);
  });

  it("空 / undefined / null 都返回空数组", () => {
    expect(normalizePortraitDefaults([])).toEqual([]);
    expect(normalizePortraitDefaults(undefined)).toEqual([]);
    expect(normalizePortraitDefaults(null)).toEqual([]);
  });
});

/**
 * 拖拽排序：默认立绘没有任何特殊待遇，可以被拖走、也可以作为落点。
 */
describe("movePortrait", () => {
  const list = [portrait("a"), portrait("b", true), portrait("c")];

  it("把默认立绘拖到末尾（after 最后一张）", () => {
    expect(ids(movePortrait(list, "b", "c", "after"))).toEqual([
      "a",
      "c",
      "b",
    ]);
    // 入参不变
    expect(ids(list)).toEqual(["a", "b", "c"]);
  });

  it("把普通立绘拖到默认立绘前面", () => {
    expect(ids(movePortrait(list, "c", "b", "before"))).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("把默认立绘拖到第一张前面", () => {
    expect(ids(movePortrait(list, "b", "a", "before"))).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("把后面的立绘拖到默认立绘后面", () => {
    expect(ids(movePortrait(list, "a", "b", "after"))).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("落点算出来和原来一样时返回同一个引用（不触发保存）", () => {
    // a 拖到 b 前面 = 位置没变
    expect(movePortrait(list, "a", "b", "before")).toBe(list);
    // b 拖到 a 后面 = 位置没变
    expect(movePortrait(list, "b", "a", "after")).toBe(list);
  });

  it("只有一张 / 同一张 / 不存在的ID：原样返回，不报错", () => {
    const single = [portrait("only", true)];
    expect(movePortrait(single, "only", "only", "before")).toBe(single);
    expect(movePortrait(list, "x", "a", "before")).toBe(list);
    expect(movePortrait(list, "a", "x", "after")).toBe(list);
    expect(movePortrait([], "a", "b", "before")).toEqual([]);
    expect(movePortrait(undefined, "a", "b", "before")).toEqual([]);
  });
});

describe("applyPortraitOrder", () => {
  it("按给到的 ID 顺序重排，对象引用保持不变", () => {
    const a = portrait("a");
    const b = portrait("b", true);
    const c = portrait("c");
    const list = [a, b, c];

    const next = applyPortraitOrder(list, ["c", "a", "b"]);

    expect(ids(next)).toEqual(["c", "a", "b"]);
    expect(next[0]).toBe(c);
    expect(next[1]).toBe(a);
    expect(next[2]).toBe(b);
  });

  it("顺序表里没有的新立绘追加到末尾，不丢失", () => {
    const list = [portrait("a"), portrait("b"), portrait("new")];

    const next = applyPortraitOrder(list, ["b", "a"]);

    expect(ids(next)).toEqual(["b", "a", "new"]);
  });

  it("顺序本来就一致时返回原引用", () => {
    const list = [portrait("a"), portrait("b")];
    expect(applyPortraitOrder(list, ["a", "b"])).toBe(list);
  });

  it("空列表 / 空顺序：原样返回", () => {
    expect(applyPortraitOrder([], ["a"])).toEqual([]);
    expect(applyPortraitOrder(null, ["a"])).toEqual([]);
    const list = [portrait("a")];
    expect(applyPortraitOrder(list, [])).toBe(list);
  });
});

describe("portraitIdsOf", () => {
  it("按当前顺序取出 ID 列表，空值安全", () => {
    expect(portraitIdsOf([portrait("a"), portrait("b")])).toEqual(["a", "b"]);
    expect(portraitIdsOf([])).toEqual([]);
    expect(portraitIdsOf(undefined)).toEqual([]);
    expect(portraitIdsOf(null)).toEqual([]);
  });
});

describe("markDefaultPortrait", () => {
  it("只换标记、不挪位置：默认立绘可以留在列表中间", () => {
    const list = [
      portrait("default", true),
      portrait("a"),
      portrait("b"),
    ];

    const next = markDefaultPortrait(list, "b");

    expect(ids(next)).toEqual(["default", "a", "b"]);
    expect(next.map((p) => !!p.defaultPortrait)).toEqual([false, false, true]);
    // 入参没有被改
    expect(ids(list)).toEqual(["default", "a", "b"]);
    expect(list[0].defaultPortrait).toBe(true);
  });

  it("标记一个不存在的立绘时不会把现有默认标记清掉", () => {
    const list = [portrait("a"), portrait("b", true)];

    const next = markDefaultPortrait(list, "not-exists");

    expect(next).toBe(list);
    expect(ids(next)).toEqual(["a", "b"]);
    expect(getDefaultPortrait(next)?.portraitID).toBe("b");
  });
});

/**
 * 换角色时的立绘匹配：**同情绪优先，没有就用默认立绘**。
 *
 * 剧情编辑 → 立绘 → 把某张立绘的角色换掉时用它，规则与后端
 * `CharacterServiceImpl.findPortraitByEmotion()` / 文本解析里的 `(情绪)` 一致。
 */
describe("findPortraitByEmotion", () => {
  it("按情绪标识找同一张，与名字无关", () => {
    // 名字里写着"开心"、情绪字段却是 normal 的那张**不能**被选中：只认字段，不猜名字
    const list = [
      { ...portrait("n", false, Emotion.NORMAL), portName: "罗佳-开心" },
      portrait("h", false, Emotion.HAPPY),
      portrait("a", false, Emotion.ANGRY),
    ];

    expect(findPortraitByEmotion(list, Emotion.HAPPY)?.portraitID).toBe("h");
    expect(findPortraitByEmotion(list, Emotion.ANGRY)?.portraitID).toBe("a");
  });

  it("同情绪有多张时取列表里的第一张（与默认标记无关）", () => {
    const list = [
      portrait("first", true, Emotion.HAPPY),
      portrait("second", false, Emotion.HAPPY),
    ];

    expect(findPortraitByEmotion(list, Emotion.HAPPY)?.portraitID).toBe("first");
  });

  it("没有同情绪 / 旧立绘没有情绪 / 列表为空，都返回 null", () => {
    const list = [portrait("n", false, Emotion.NORMAL)];

    expect(findPortraitByEmotion(list, Emotion.SAD)).toBeNull();
    // 旧数据没有情绪字段：按"无匹配"处理，绝不按名字猜
    expect(findPortraitByEmotion(list, undefined)).toBeNull();
    expect(findPortraitByEmotion(list, null)).toBeNull();
    expect(findPortraitByEmotion(list, "" as Emotion)).toBeNull();
    expect(findPortraitByEmotion([], Emotion.NORMAL)).toBeNull();
    expect(findPortraitByEmotion(undefined, Emotion.NORMAL)).toBeNull();
    expect(findPortraitByEmotion(null, Emotion.NORMAL)).toBeNull();
  });

  it("情绪标识大小写不敏感（后端 JSON 是小写 code，库里存的是大写枚举名）", () => {
    const list = [portrait("h", false, Emotion.HAPPY)];

    expect(findPortraitByEmotion(list, "HAPPY" as Emotion)?.portraitID).toBe("h");
    expect(findPortraitByEmotion(list, " Happy " as Emotion)?.portraitID).toBe(
      "h",
    );
  });
});

describe("resolvePortraitForEmotion", () => {
  it("新角色有同情绪的立绘：用它（即使它不是默认立绘）", () => {
    const list = [
      portrait("default", true, Emotion.NORMAL),
      portrait("happy", false, Emotion.HAPPY),
    ];

    const matched = resolvePortraitForEmotion(list, Emotion.HAPPY);

    expect(matched?.portraitID).toBe("happy");
    expect(matched?.defaultPortrait).toBe(false);
  });

  it("新角色没有同情绪的立绘：退回默认立绘（默认标记，不是列表首项）", () => {
    const list = [
      portrait("angry", false, Emotion.ANGRY),
      portrait("default", true, Emotion.NORMAL),
    ];

    expect(resolvePortraitForEmotion(list, Emotion.HAPPY)?.portraitID).toBe(
      "default",
    );
  });

  it("默认标记缺失时退回首项约定（旧数据）", () => {
    const list = [portrait("a", false, Emotion.ANGRY), portrait("b")];

    expect(resolvePortraitForEmotion(list, Emotion.SAD)?.portraitID).toBe("a");
  });

  it("旧立绘没有情绪：按无匹配处理，直接用默认立绘", () => {
    const list = [portrait("default", true, Emotion.NORMAL)];

    expect(resolvePortraitForEmotion(list, undefined)?.portraitID).toBe(
      "default",
    );
    expect(resolvePortraitForEmotion(list, null)?.portraitID).toBe("default");
  });

  it("新角色一张立绘都没有：返回 null，由调用方处理空态", () => {
    expect(resolvePortraitForEmotion([], Emotion.HAPPY)).toBeNull();
    expect(resolvePortraitForEmotion(undefined, Emotion.HAPPY)).toBeNull();
    expect(resolvePortraitForEmotion(null, undefined)).toBeNull();
  });
});
