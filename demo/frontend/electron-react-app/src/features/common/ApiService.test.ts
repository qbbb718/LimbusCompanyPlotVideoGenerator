import ApiService, { BASE_URL } from "./ApiService";

/**
 * "剧情编辑 → 立绘 → 临时图片（路人/道具）" 的缩略图地址。
 *
 * 记录里 imagePath 有两种历史格式：
 * - 相对路径 ./projects/temp/images/xxx.png
 * - 后端 RuntimePaths 解析出的绝对路径
 *   C:/Users/<用户>/AppData/Roaming/<应用目录>/projects/temp/images/xxx.png
 * 绝对路径如果直接拼在 BASE_URL 后面会变成 http://localhost:8081/C:/...，
 * 后端 /projects/** 静态映射匹配不上，缩略图就一直 404（列表里什么都看不到）。
 * 所以两种格式都必须收敛到 /projects/temp/images/xxx.png。
 */
describe("ApiService.getTempImageUrl", () => {
  const fileName = "93a9d801-b807-457e-8aca-0a021a941e4b.png";
  const expected = `${BASE_URL}/projects/temp/images/${fileName}`;

  it("相对路径（带 ./ 前缀）", () => {
    expect(ApiService.getTempImageUrl(`./projects/temp/images/${fileName}`)).toBe(
      expected,
    );
  });

  it("相对路径（不带 ./ 前缀）", () => {
    expect(ApiService.getTempImageUrl(`projects/temp/images/${fileName}`)).toBe(
      expected,
    );
  });

  it("正斜杠绝对路径（records.json 里的真实格式）", () => {
    expect(
      ApiService.getTempImageUrl(
        `C:/Users/26899/AppData/Roaming/limbus-company-plot-video-generator/projects/temp/images/${fileName}`,
      ),
    ).toBe(expected);
  });

  it("反斜杠绝对路径（Windows 原生写法）", () => {
    expect(
      ApiService.getTempImageUrl(
        `C:\\Users\\26899\\AppData\\Roaming\\limbus-company-plot-video-generator\\projects\\temp\\images\\${fileName}`,
      ),
    ).toBe(expected);
  });

  it("只有文件名时按临时图片目录拼", () => {
    expect(ApiService.getTempImageUrl(fileName)).toBe(expected);
  });

  it("中文/空格文件名会做 URL 编码", () => {
    const chinese = "路人 甲.png";
    expect(ApiService.getTempImageUrl(`./projects/temp/images/${chinese}`)).toBe(
      `${BASE_URL}/projects/temp/images/${encodeURIComponent(chinese)}`,
    );
  });

  it("已经是 http / data / blob 地址时原样返回", () => {
    expect(ApiService.getTempImageUrl("https://example.com/a.png")).toBe(
      "https://example.com/a.png",
    );
    expect(ApiService.getTempImageUrl("data:image/png;base64,AAAA")).toBe(
      "data:image/png;base64,AAAA",
    );
  });

  it("空路径返回空串（调用方据此不渲染 <img>）", () => {
    expect(ApiService.getTempImageUrl("")).toBe("");
    expect(ApiService.getTempImageUrl("   ")).toBe("");
  });
});
