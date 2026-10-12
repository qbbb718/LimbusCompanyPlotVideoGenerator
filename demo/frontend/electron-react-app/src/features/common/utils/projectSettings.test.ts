import {
  STORY_TYPE_PERSONALITY,
  STORY_TYPE_STORY,
  VIDEO_SIZE_OPTIONS,
  isPlotMode,
  parseVideoSizeKey,
  pickOutputDirectory,
  plotOf,
  videoSizeKey,
} from "./projectSettings";

/**
 * 全局设置 tab 与设置页共用的这几条逻辑，直接决定"剧情类型"能不能作用到后端
 * （plot 布尔值）以及输出路径/视频尺寸的行为是否与设置页一致，所以单独锁一遍。
 */
describe("projectSettings 共用逻辑", () => {
  afterEach(() => {
    delete (window as any).electronAPI;
    jest.restoreAllMocks();
  });

  describe("剧情类型 → plot", () => {
    test("选“剧情”时为 true", () => {
      expect(isPlotMode(STORY_TYPE_STORY)).toBe(true);
      expect(plotOf({ storyType: STORY_TYPE_STORY })).toBe(true);
    });

    test("选“人格故事”时为 false", () => {
      expect(isPlotMode(STORY_TYPE_PERSONALITY)).toBe(false);
      expect(plotOf({ storyType: STORY_TYPE_PERSONALITY })).toBe(false);
    });

    test("设置里没有剧情类型时按默认的“剧情”处理", () => {
      expect(plotOf({} as any)).toBe(true);
      expect(plotOf({ storyType: undefined } as any)).toBe(true);
    });

    test("无法识别的剧情类型按非剧情处理（只有“剧情”才是 plot）", () => {
      expect(isPlotMode("SOMETHING_ELSE")).toBe(false);
    });
  });

  describe("视频尺寸", () => {
    test("候选项覆盖 360p ~ 1080p，且与设置页共用同一份列表", () => {
      expect(VIDEO_SIZE_OPTIONS.map((opt) => `${opt.width}x${opt.height}`)).toEqual([
        "640x360",
        "854x480",
        "1280x720",
        "1920x1080",
      ]);
    });

    test("尺寸键可来回转换", () => {
      expect(videoSizeKey(1920, 1080)).toBe("1920x1080");
      expect(parseVideoSizeKey("1920x1080")).toEqual({ width: 1920, height: 1080 });
    });

    test("非法取值返回 null（调用方忽略这次改动，不会把尺寸写成 NaN）", () => {
      expect(parseVideoSizeKey("")).toBeNull();
      expect(parseVideoSizeKey("abc")).toBeNull();
      expect(parseVideoSizeKey("0x0")).toBeNull();
    });
  });

  describe("输出路径选择", () => {
    test("Electron 环境返回原生对话框选中的目录", async () => {
      (window as any).electronAPI = {
        selectDirectory: jest
          .fn()
          .mockResolvedValue({ canceled: false, path: "E:\\导出" }),
      };

      await expect(pickOutputDirectory("E:\\旧路径")).resolves.toBe("E:\\导出");
    });

    test("用户取消时返回 null，不覆盖已有路径", async () => {
      (window as any).electronAPI = {
        selectDirectory: jest.fn().mockResolvedValue({ canceled: true }),
      };

      await expect(pickOutputDirectory("E:\\旧路径")).resolves.toBeNull();
    });

    test("浏览器环境退化为手动输入，空白输入视为取消", async () => {
      const promptSpy = jest.spyOn(window, "prompt").mockReturnValue("  E:\\手填  ");
      await expect(pickOutputDirectory("E:\\旧路径")).resolves.toBe("E:\\手填");
      expect(promptSpy).toHaveBeenCalledWith("请输入视频输出路径:", "E:\\旧路径");

      promptSpy.mockReturnValue("   ");
      await expect(pickOutputDirectory("E:\\旧路径")).resolves.toBeNull();
    });
  });
});
