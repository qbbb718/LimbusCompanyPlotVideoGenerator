import {
  buildImportedPortrait,
  collectCropUpdateTargets,
  hasPortraitName,
  isSameCrop,
  portraitCropOf,
  stripFileExtension,
} from "./portraitBatch";
import { Portrait } from "@types";

const createPortrait = (overrides: Partial<Portrait> = {}): Portrait => ({
  portraitID: "p1",
  characterID: "char_1",
  imagePath: "char_1/p1.png",
  portName: "Gregor-default",
  emotion: "normal" as Portrait["emotion"],
  faceX: 243,
  faceY: 0,
  length: 192,
  adjX: 0,
  adjY: 0,
  thumbnailPath: "",
  ...overrides,
});

/**
 * 立绘列表上的两个批量动作（「与默认立绘裁剪一致」/「批量导入立绘」）
 * 里可以脱离界面单测的判断逻辑。
 */
describe("立绘批量操作", () => {
  describe("stripFileExtension", () => {
    test("去掉扩展名，保留中文和分隔符", () => {
      expect(stripFileExtension("罗佳-face_happy_L.png")).toBe(
        "罗佳-face_happy_L",
      );
      expect(stripFileExtension("Gregor-default.webp")).toBe("Gregor-default");
    });

    test("没有扩展名时原样返回", () => {
      expect(stripFileExtension("Gregor-default")).toBe("Gregor-default");
      expect(stripFileExtension("")).toBe("");
    });

    test("目录里的点不影响扩展名提取", () => {
      expect(stripFileExtension("v1.2/Gregor-default.png")).toBe(
        "v1.2/Gregor-default",
      );
    });
  });

  describe("isSameCrop", () => {
    test("三项都相同才算一致", () => {
      expect(
        isSameCrop(
          { faceX: 243, faceY: 0, length: 192 },
          { faceX: 243, faceY: 0, length: 192 },
        ),
      ).toBe(true);
      expect(
        isSameCrop(
          { faceX: 243, faceY: 0, length: 192 },
          { faceX: 244, faceY: 0, length: 192 },
        ),
      ).toBe(false);
      expect(
        isSameCrop(
          { faceX: 243, faceY: 1, length: 192 },
          { faceX: 243, faceY: 0, length: 192 },
        ),
      ).toBe(false);
      expect(
        isSameCrop(
          { faceX: 243, faceY: 0, length: 191 },
          { faceX: 243, faceY: 0, length: 192 },
        ),
      ).toBe(false);
    });

    test("小数四舍五入后比较（存下来的是整数）", () => {
      expect(
        isSameCrop(
          { faceX: 243.2, faceY: 0.4, length: 192.1 },
          { faceX: 243, faceY: 0, length: 192 },
        ),
      ).toBe(true);
    });
  });

  describe("collectCropUpdateTargets", () => {
    const defaultCrop = { faceX: 243, faceY: 0, length: 192 };

    test("跳过默认立绘本身，返回其它立绘", () => {
      const portraits = [
        createPortrait({ portraitID: "default", defaultPortrait: true }),
        createPortrait({
          portraitID: "b",
          portName: "B",
          faceX: 100,
          faceY: 400,
          length: 200,
        }),
      ];

      const targets = collectCropUpdateTargets(portraits, "default", defaultCrop);

      expect(targets.map((p) => p.portraitID)).toEqual(["b"]);
    });

    test("已经和默认立绘一致的立绘不再处理", () => {
      const portraits = [
        createPortrait({ portraitID: "default", defaultPortrait: true }),
        createPortrait({ portraitID: "same", portName: "same" }),
      ];

      expect(collectCropUpdateTargets(portraits, "default", defaultCrop)).toEqual(
        [],
      );
    });

    test("没有默认立绘 ID 时只按裁剪是否一致来挑", () => {
      const portraits = [
        createPortrait({ portraitID: "a", faceX: 0, faceY: 0, length: 100 }),
        createPortrait({ portraitID: "b" }),
      ];

      const targets = collectCropUpdateTargets(portraits, null, defaultCrop);

      expect(targets.map((p) => p.portraitID)).toEqual(["a"]);
    });

    test("空列表返回空数组", () => {
      expect(collectCropUpdateTargets([], "default", defaultCrop)).toEqual([]);
      expect(
        collectCropUpdateTargets(undefined, "default", defaultCrop),
      ).toEqual([]);
    });
  });

  describe("hasPortraitName", () => {
    test("同名（去掉扩展名的文件名）算已存在", () => {
      const portraits = [createPortrait({ portName: "罗佳-face_happy_L" })];
      expect(hasPortraitName(portraits, "罗佳-face_happy_L")).toBe(true);
      expect(hasPortraitName(portraits, "罗佳-face_happy_R")).toBe(false);
      expect(hasPortraitName([], "罗佳-face_happy_L")).toBe(false);
    });
  });

  describe("portraitCropOf", () => {
    test("缺字段时按 0 处理，不返回 undefined", () => {
      const portrait = createPortrait({
        faceX: undefined as unknown as number,
        faceY: undefined as unknown as number,
        length: undefined as unknown as number,
      });
      expect(portraitCropOf(portrait)).toEqual({
        faceX: 0,
        faceY: 0,
        length: 0,
      });
    });
  });

  describe("buildImportedPortrait", () => {
    test("按文件名识别情绪并带上裁剪参数", () => {
      const portrait = buildImportedPortrait({
        characterID: "char_1",
        portraitID: "portrait_new",
        fileName: "格里高尔-face_smile2_L.png",
        imagePath: "char_1/portrait_new.png",
        thumbnailPath: "/assets/characters/char_1/thumbnails/thumbnail_portrait_new.png",
        crop: { faceX: 243, faceY: 0, length: 192 },
      });

      expect(portrait).toMatchObject({
        portraitID: "portrait_new",
        characterID: "char_1",
        imagePath: "char_1/portrait_new.png",
        portName: "格里高尔-face_smile2_L",
        faceX: 243,
        faceY: 0,
        length: 192,
        adjX: 0,
        adjY: 0,
      });
      expect(portrait.emotion).toBe("happy");
    });

    test("文件名里没有情绪关键词时退回「正常」", () => {
      const portrait = buildImportedPortrait({
        characterID: "char_1",
        portraitID: "portrait_new",
        fileName: "格里高尔-2.png",
        imagePath: "char_1/portrait_new.png",
        thumbnailPath: "",
        crop: { faceX: 10, faceY: 20, length: 30 },
      });

      expect(portrait.emotion).toBe("normal");
      expect(portrait.portName).toBe("格里高尔-2");
    });

    test("裁剪参数取整（后端保存的是整数）", () => {
      const portrait = buildImportedPortrait({
        characterID: "char_1",
        portraitID: "portrait_new",
        fileName: "a.png",
        imagePath: "",
        thumbnailPath: "",
        crop: { faceX: 243.6, faceY: 0.4, length: 191.5 },
      });

      expect(portrait.faceX).toBe(244);
      expect(portrait.faceY).toBe(0);
      expect(portrait.length).toBe(192);
    });
  });
});
