import {
  StandardEmotion,
  detectEmotionFromFileName,
  getEmotionLabel,
  getEmotionOptions,
  getStandardEmotions,
  mapEmotion,
} from "./emotionMapper";

/**
 * 立绘情绪：
 * - 下拉框/卡片只显示中文关键词；
 * - 上传立绘时按文件名里的中文、英文关键词自动设置情绪。
 */
describe("emotionMapper", () => {
  describe("detectEmotionFromFileName", () => {
    test.each([
      ["罗佳-face_happy_L.png", StandardEmotion.HAPPY],
      ["罗佳-face_HAPPY_L.png", StandardEmotion.HAPPY],
      ["Rodion-face_happy_L.png", StandardEmotion.HAPPY],
      ["罗佳-开心.png", StandardEmotion.HAPPY],
      ["罗佳-高兴.png", StandardEmotion.HAPPY],
      ["格里高尔-face_smile2_L.png", StandardEmotion.HAPPY],
      ["罗佳-悲伤.png", StandardEmotion.SAD],
      ["格里高尔-face_depressed_L.png", StandardEmotion.SAD],
      ["罗佳-face_angry_L.png", StandardEmotion.ANGRY],
      ["罗佳-愤怒.png", StandardEmotion.ANGRY],
      ["罗佳-face_surprised_L.png", StandardEmotion.SURPRISED],
      ["罗佳-震惊.png", StandardEmotion.SURPRISED],
      ["罗佳-face_confused_L.png", StandardEmotion.CONFUSED],
      ["罗佳-困惑.png", StandardEmotion.CONFUSED],
      ["罗佳-face_blush_L.png", StandardEmotion.BLUSH],
      ["罗佳-害羞.png", StandardEmotion.BLUSH],
      ["罗佳-face_hurt_L.png", StandardEmotion.HURT],
      ["罗佳-受伤.png", StandardEmotion.HURT],
      ["罗佳-face_neutral_L.png", StandardEmotion.NORMAL],
      ["格里高尔-face_idle_R.png", StandardEmotion.NORMAL],
      ["Gregor-default.png", StandardEmotion.NORMAL],
      ["Ryoshu-default.png", StandardEmotion.NORMAL],
      // 没有扩展名、用分隔符而不是下划线也能识别
      ["罗佳-face_happy_L", StandardEmotion.HAPPY],
      ["My-Happy-Portrait.png", StandardEmotion.HAPPY],
    ])("文件名 %s 识别为 %s", (fileName, expected) => {
      expect(detectEmotionFromFileName(fileName)).toBe(expected);
    });

    test.each([
      ["罗佳-face_L.png"],
      ["portrait_1785997946856.png"],
      ["thumbnail_portrait_1785997946856.png"],
      // 没有收录的关键词不猜，保留用户自己选的情绪
      ["Gregor-face_serious_R.png"],
      [""],
    ])("文件名 %s 不含关键词时返回 null", (fileName) => {
      expect(detectEmotionFromFileName(fileName)).toBeNull();
    });

    test("中英文关键词混在同一个文件名里时按字段匹配", () => {
      expect(detectEmotionFromFileName("罗佳_face_happy_立绘.png")).toBe(
        StandardEmotion.HAPPY,
      );
      expect(detectEmotionFromFileName("罗佳-悲伤-face.png")).toBe(
        StandardEmotion.SAD,
      );
    });

    test("空值不报错", () => {
      expect(detectEmotionFromFileName(null)).toBeNull();
      expect(detectEmotionFromFileName(undefined)).toBeNull();
    });
  });

  describe("getEmotionLabel", () => {
    test("后端小写 code 显示为中文关键词", () => {
      expect(getEmotionLabel(StandardEmotion.HAPPY)).toBe("开心");
      expect(getEmotionLabel("sad")).toBe("悲伤");
    });

    test("历史数据里的大写枚举名也显示为中文关键词", () => {
      expect(getEmotionLabel("HAPPY")).toBe("开心");
      expect(getEmotionLabel("NORMAL")).toBe("正常");
    });

    test("中文关键词与无法识别的值", () => {
      expect(getEmotionLabel("开心")).toBe("开心");
      expect(getEmotionLabel("nervous")).toBe("正常");
      expect(getEmotionLabel(undefined)).toBe("正常");
    });
  });

  describe("getEmotionOptions", () => {
    test("下拉框选项全部是中文关键词，且没有英文 code", () => {
      const options = getEmotionOptions();

      expect(options.map((option) => option.value)).toEqual([
        StandardEmotion.NORMAL,
        StandardEmotion.HAPPY,
        StandardEmotion.SAD,
        StandardEmotion.ANGRY,
        StandardEmotion.SURPRISED,
        StandardEmotion.CONFUSED,
        StandardEmotion.BLUSH,
        StandardEmotion.HURT,
      ]);
      expect(options.map((option) => option.label)).toEqual([
        "正常",
        "开心",
        "悲伤",
        "生气",
        "惊讶",
        "困惑",
        "害羞",
        "受伤",
      ]);
      options.forEach((option) => {
        expect(option.label).toMatch(/^[\u4e00-\u9fff]+$/);
      });
    });

    test("每个情绪都带有中英文关键词", () => {
      getEmotionOptions().forEach((option) => {
        expect(option.keywords.length).toBeGreaterThan(1);
        expect(option.keywords).toContain(option.label);
      });
    });
  });

  describe("mapEmotion", () => {
    test.each([
      ["开心", StandardEmotion.HAPPY],
      ["高兴", StandardEmotion.HAPPY],
      ["happy", StandardEmotion.HAPPY],
      ["HAPPY", StandardEmotion.HAPPY],
      ["非常生气", StandardEmotion.ANGRY],
      ["有点悲伤", StandardEmotion.SAD],
      ["blush", StandardEmotion.BLUSH],
      ["", StandardEmotion.NORMAL],
    ])("输入 %s 映射为 %s", (input, expected) => {
      expect(mapEmotion(input)).toBe(expected);
    });
  });

  test("getStandardEmotions 保持 key=标准情绪、value=中文关键词", () => {
    const emotions = getStandardEmotions();

    expect(emotions[StandardEmotion.NORMAL]).toBe("正常");
    expect(emotions[StandardEmotion.HURT]).toBe("受伤");
    expect(Object.keys(emotions)).toHaveLength(8);
  });
});
