import { AppConfig } from "@root/features/common/config/appConfig";
import { Emotion, Portrait } from "@types";
import {
  MISSING_THUMBNAIL_PLACEHOLDER,
  buildPortraitThumbnailUrl,
  getDefaultPortrait,
  isDefaultPortraitId,
  markDefaultPortrait,
  orderPortraitsDefaultFirst,
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
const portrait = (portraitID: string, defaultPortrait = false): Portrait => ({
  portraitID,
  characterID: "char_order_test",
  imagePath: `char_order_test/${portraitID}.png`,
  portName: `立绘-${portraitID}`,
  emotion: Emotion.NORMAL,
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
 * 资源管理-角色-立绘：默认立绘永远排在列表第一张。
 *
 * 后端 GET /api/characters 返回的就是"默认立绘在前、其余按名称"，
 * 但本地做过改动（设为默认 / 新增 / 批量导入 / 删掉默认立绘）之后数组顺序会漂，
 * 所以界面上要统一按标记再排一次。
 */
describe("orderPortraitsDefaultFirst", () => {
  it("默认立绘不在首位时被挪到第一位，其余保持原相对顺序", () => {
    const list = [
      portrait("a"),
      portrait("b"),
      portrait("default", true),
      portrait("c"),
    ];

    expect(ids(orderPortraitsDefaultFirst(list))).toEqual([
      "default",
      "a",
      "b",
      "c",
    ]);
    // 不改动入参
    expect(ids(list)).toEqual(["a", "b", "default", "c"]);
  });

  it("已经排好的列表原样返回同一个引用（不会触发无意义的数组重建）", () => {
    const list = [portrait("default", true), portrait("a"), portrait("b")];

    expect(orderPortraitsDefaultFirst(list)).toBe(list);
  });

  it("没有任何默认标记时退回首项约定：顺序不变", () => {
    const list = [portrait("a"), portrait("b")];

    expect(orderPortraitsDefaultFirst(list)).toBe(list);
    expect(isDefaultPortraitId(list, "a")).toBe(true);
  });

  it("空 / undefined / null 都返回空数组", () => {
    expect(orderPortraitsDefaultFirst([])).toEqual([]);
    expect(orderPortraitsDefaultFirst(undefined)).toEqual([]);
    expect(orderPortraitsDefaultFirst(null)).toEqual([]);
  });
});

describe("markDefaultPortrait", () => {
  it("只保留一个默认标记，并把新的默认立绘挪到第一位", () => {
    const list = [
      portrait("default", true),
      portrait("a"),
      portrait("b"),
    ];

    const next = markDefaultPortrait(list, "b");

    expect(ids(next)).toEqual(["b", "default", "a"]);
    expect(next.map((p) => !!p.defaultPortrait)).toEqual([true, false, false]);
    // 入参没有被改
    expect(ids(list)).toEqual(["default", "a", "b"]);
    expect(list[0].defaultPortrait).toBe(true);
  });

  it("标记一个不存在的立绘时不会把顺序搅乱", () => {
    const list = [portrait("a"), portrait("b")];

    const next = markDefaultPortrait(list, "not-exists");

    expect(ids(next)).toEqual(["a", "b"]);
    expect(next.every((p) => !p.defaultPortrait)).toBe(true);
    expect(getDefaultPortrait(next)?.portraitID).toBe("a");
  });
});
