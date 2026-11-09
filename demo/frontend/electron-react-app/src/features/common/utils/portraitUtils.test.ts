import { AppConfig } from "@root/features/common/config/appConfig";
import {
  MISSING_THUMBNAIL_PLACEHOLDER,
  buildPortraitThumbnailUrl,
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
