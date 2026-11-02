import { normalizeAssetUrl, toAssetPath } from "./assetPath";

const BASE = "http://localhost:8081";

describe("toAssetPath", () => {
  it("把前端补全的绝对 URL 收敛成站内路径", () => {
    expect(toAssetPath("http://localhost:8081/assets/backgrounds/x.png")).toBe(
      "/assets/backgrounds/x.png",
    );
    expect(toAssetPath("https://example.com/assets/backgrounds/x.png")).toBe(
      "/assets/backgrounds/x.png",
    );
    expect(toAssetPath("HTTP://LOCALHOST:8081/assets/backgrounds/x.png")).toBe(
      "/assets/backgrounds/x.png",
    );
  });

  it("补上开头的斜杠", () => {
    expect(toAssetPath("assets/backgrounds/x.png")).toBe(
      "/assets/backgrounds/x.png",
    );
    expect(toAssetPath("./assets/backgrounds/x.png")).toBe(
      "/assets/backgrounds/x.png",
    );
    expect(toAssetPath("/assets/backgrounds/x.png")).toBe(
      "/assets/backgrounds/x.png",
    );
  });

  it("识别 Windows 反斜杠", () => {
    expect(toAssetPath("\\assets\\backgrounds\\x.png")).toBe(
      "/assets/backgrounds/x.png",
    );
  });

  it("blob: / data: 原样返回", () => {
    expect(toAssetPath("blob:http://localhost:8081/abc")).toBe(
      "blob:http://localhost:8081/abc",
    );
    expect(toAssetPath("data:image/png;base64,AAAA")).toBe(
      "data:image/png;base64,AAAA",
    );
  });

  it("null / 空串安全", () => {
    expect(toAssetPath(null)).toBeNull();
    expect(toAssetPath(undefined)).toBeUndefined();
    expect(toAssetPath("")).toBe("");
    expect(toAssetPath("   ")).toBe("");
  });

  it("裸文件名不猜目录", () => {
    expect(toAssetPath("x.png")).toBe("x.png");
  });
});

describe("normalizeAssetUrl", () => {
  it("站内路径拼上基地址", () => {
    expect(normalizeAssetUrl("/assets/backgrounds/x.png", BASE)).toBe(
      "http://localhost:8081/assets/backgrounds/x.png",
    );
  });

  it("已经是绝对地址的不重复拼接", () => {
    expect(
      normalizeAssetUrl("http://localhost:8081/assets/backgrounds/x.png", BASE),
    ).toBe("http://localhost:8081/assets/backgrounds/x.png");
  });

  it("基地址末尾的斜杠不会拼出双斜杠", () => {
    expect(normalizeAssetUrl("/assets/x.png", `${BASE}/`)).toBe(
      "http://localhost:8081/assets/x.png",
    );
  });
});
