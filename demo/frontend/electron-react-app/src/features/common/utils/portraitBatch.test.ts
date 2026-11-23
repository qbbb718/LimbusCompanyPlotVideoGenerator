import {
  areAllPortraitsSelected,
  buildImportedPortrait,
  collectCropUpdateTargets,
  collectSelectedCropTargets,
  collectSelectedPortraits,
  describeCropBatchResult,
  describeDeleteBatchResult,
  hasPortraitName,
  isSameCrop,
  portraitCropOf,
  pruneSelectedIds,
  stripFileExtension,
  toggleSelectedAll,
  toggleSelectedId,
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

      const targets = collectCropUpdateTargets(portraits, "default");

      expect(targets.map((p) => p.portraitID)).toEqual(["b"]);
    });

    test("裁剪像素值相同也照样返回（改成按比例换算后，像素相同不代表一致）", () => {
      // 默认立绘 1600×2432 上 192px 的框，和 640×983 立绘上的 192px 框完全不是同一个头框，
      // 所以这里不能按像素把后者排除掉
      const portraits = [
        createPortrait({ portraitID: "default", defaultPortrait: true }),
        createPortrait({ portraitID: "same", portName: "same" }),
      ];

      expect(
        collectCropUpdateTargets(portraits, "default").map(
          (p) => p.portraitID,
        ),
      ).toEqual(["same"]);
    });

    test("没有默认立绘 ID 时所有立绘都算目标", () => {
      const portraits = [
        createPortrait({ portraitID: "a", faceX: 0, faceY: 0, length: 100 }),
        createPortrait({ portraitID: "b" }),
      ];

      const targets = collectCropUpdateTargets(portraits, null);

      expect(targets.map((p) => p.portraitID)).toEqual(["a", "b"]);
    });

    test("空列表返回空数组", () => {
      expect(collectCropUpdateTargets([], "default")).toEqual([]);
      expect(collectCropUpdateTargets(undefined, "default")).toEqual([]);
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

// ============================================================
// 多选 + 批量操作结果
// ============================================================

/** 三张立绘：默认立绘 + 两张普通立绘，顺序固定 */
const createPortraitList = (): Portrait[] => [
  createPortrait({ portraitID: "default", portName: "默认", defaultPortrait: true }),
  createPortrait({ portraitID: "b", portName: "立绘B" }),
  createPortrait({ portraitID: "c", portName: "立绘C" }),
];

describe("立绘多选", () => {
  describe("toggleSelectedId", () => {
    test("未选中就加上，已选中就摘掉", () => {
      const empty = new Set<string>();
      const one = toggleSelectedId(empty, "b");
      expect(Array.from(one)).toEqual(["b"]);
      expect(Array.from(toggleSelectedId(one, "b"))).toEqual([]);
    });

    test("返回新集合，不改动入参（否则 setState 同一个引用不会重渲染）", () => {
      const original = new Set(["a"]);
      const next = toggleSelectedId(original, "b");

      expect(Array.from(original)).toEqual(["a"]);
      expect(Array.from(next)).toEqual(["a", "b"]);
      expect(next).not.toBe(original);
    });
  });

  describe("areAllPortraitsSelected / toggleSelectedAll", () => {
    test("全部选中才算全选，空列表不算", () => {
      const portraits = createPortraitList();
      expect(
        areAllPortraitsSelected(
          portraits,
          new Set(["default", "b", "c"]),
        ),
      ).toBe(true);
      expect(
        areAllPortraitsSelected(portraits, new Set(["default", "b"])),
      ).toBe(false);
      expect(areAllPortraitsSelected([], new Set())).toBe(false);
      expect(areAllPortraitsSelected(undefined, new Set(["a"]))).toBe(false);
    });

    test("没全选时选中整个列表，已全选时清空", () => {
      const portraits = createPortraitList();

      expect(
        Array.from(toggleSelectedAll(portraits, new Set(["b"]))),
      ).toEqual(["default", "b", "c"]);
      expect(
        Array.from(
          toggleSelectedAll(portraits, new Set(["default", "b", "c"])),
        ),
      ).toEqual([]);
    });
  });

  describe("pruneSelectedIds", () => {
    test("丢掉已经不在列表里的勾选（删除成功后不能留着已删的 ID）", () => {
      const selected = new Set(["b", "已删除的一张"]);
      expect(Array.from(pruneSelectedIds(selected, createPortraitList()))).toEqual([
        "b",
      ]);
    });

    test("列表为空时清空勾选", () => {
      expect(
        Array.from(pruneSelectedIds(new Set(["a"]), [])),
      ).toEqual([]);
    });
  });

  describe("collectSelectedPortraits", () => {
    test("按列表顺序返回选中的立绘，而不是勾选顺序", () => {
      const portraits = createPortraitList();
      // 先勾 c 再勾 default：返回顺序仍然是列表里的 default → c
      const selected = new Set(["c", "default"]);

      expect(
        collectSelectedPortraits(portraits, selected).map((p) => p.portraitID),
      ).toEqual(["default", "c"]);
    });

    test("忽略已经不在列表里的 ID", () => {
      expect(
        collectSelectedPortraits(createPortraitList(), new Set(["ghost"])),
      ).toEqual([]);
    });
  });

  describe("collectSelectedCropTargets", () => {
    test("跳过默认立绘本身（它就是要套用的来源）", () => {
      const portraits = createPortraitList();
      const targets = collectSelectedCropTargets(
        portraits,
        new Set(["default", "b", "c"]),
        "default",
      );

      expect(targets.map((p) => p.portraitID)).toEqual(["b", "c"]);
    });

    test("只选中默认立绘时没有可套用的目标（按钮据此置灰）", () => {
      expect(
        collectSelectedCropTargets(
          createPortraitList(),
          new Set(["default"]),
          "default",
        ),
      ).toEqual([]);
    });

    test("没有默认立绘 ID 时选中项全部算目标", () => {
      expect(
        collectSelectedCropTargets(createPortraitList(), new Set(["b"]), null).map(
          (p) => p.portraitID,
        ),
      ).toEqual(["b"]);
    });
  });
});

describe("批量操作结果文案", () => {
  describe("describeCropBatchResult", () => {
    test("全部成功：报张数、换算方式，并提醒保存", () => {
      const result = describeCropBatchResult({
        mode: "ratio",
        updated: 3,
        unchanged: 0,
        adjusted: 1,
        imageFailed: 0,
        thumbnailFailed: 0,
        failed: [],
      });

      expect(result.kind).toBe("success");
      expect(result.text).toContain("已按比例更新 3 张立绘的裁剪");
      expect(result.text).toContain("1 张超出原图范围");
      expect(result.text).toContain("记得点右上角「保存」");
    });

    test("只改选中的时候文案里点明「选中的」", () => {
      const result = describeCropBatchResult(
        {
          mode: "ratio",
          updated: 2,
          unchanged: 1,
          adjusted: 0,
          imageFailed: 0,
          thumbnailFailed: 0,
          failed: [],
        },
        "selected",
      );

      expect(result.text).toContain("已按比例更新 选中的 2 张立绘的裁剪");
      expect(result.text).toContain("1 张算出来本来就是这个裁剪");
    });

    test("一张都没改：info，说明本来就一致（不是失败）", () => {
      const result = describeCropBatchResult({
        mode: "ratio",
        updated: 0,
        unchanged: 2,
        adjusted: 0,
        imageFailed: 0,
        thumbnailFailed: 0,
        failed: [],
      });

      expect(result.kind).toBe("info");
      expect(result.text).toContain("都已经和默认立绘一致（按比例）");
      expect(result.text).toContain("没有需要修改的");
    });

    test("缩略图/原图小问题：info，不当作失败", () => {
      const result = describeCropBatchResult({
        mode: "pixel",
        updated: 2,
        unchanged: 0,
        adjusted: 0,
        imageFailed: 1,
        thumbnailFailed: 1,
        failed: [],
      });

      expect(result.kind).toBe("info");
      expect(result.text).toContain("按像素");
      expect(result.text).toContain("1 张原图加载失败");
      expect(result.text).toContain("1 张缩略图重新生成失败");
    });

    test("有立绘完全没改成功：error，列名字并说明保留选中", () => {
      const result = describeCropBatchResult({
        mode: "ratio",
        updated: 1,
        unchanged: 0,
        adjusted: 0,
        imageFailed: 0,
        thumbnailFailed: 0,
        failed: ["立绘B"],
      });

      expect(result.kind).toBe("error");
      expect(result.text).toContain("1 张没有改成功：立绘B");
      expect(result.text).toContain("已保留选中，可以直接重试");
    });
  });

  describe("describeDeleteBatchResult", () => {
    test("全部成功：报删除张数", () => {
      const result = describeDeleteBatchResult({
        deleted: 2,
        failed: [],
        defaultDeleted: false,
        promotedDefaultName: null,
      });

      expect(result.kind).toBe("success");
      expect(result.text).toBe("已删除 2 张立绘。");
    });

    test("删掉默认立绘：说明谁被提为新的默认立绘", () => {
      const result = describeDeleteBatchResult({
        deleted: 1,
        failed: [],
        defaultDeleted: true,
        promotedDefaultName: "立绘B",
      });

      expect(result.kind).toBe("success");
      expect(result.text).toContain("默认立绘已删除");
      expect(result.text).toContain("已自动把「立绘B」设为新的默认立绘");
    });

    test("删光所有立绘：说明角色现在没有立绘", () => {
      const result = describeDeleteBatchResult({
        deleted: 1,
        failed: [],
        defaultDeleted: true,
        promotedDefaultName: null,
      });

      expect(result.text).toContain("该角色现在没有立绘了");
    });

    test("部分失败：error，列失败项与原因，并说明保留选中", () => {
      const result = describeDeleteBatchResult({
        deleted: 2,
        failed: [{ portName: "立绘C", reason: "文件被占用" }],
        defaultDeleted: false,
        promotedDefaultName: null,
      });

      expect(result.kind).toBe("error");
      expect(result.text).toContain("已删除 2 张立绘");
      expect(result.text).toContain("1 张删除失败：立绘C（文件被占用）");
      expect(result.text).toContain("已保留选中，可以直接重试");
    });

    test("一张都没删也没失败：info", () => {
      const result = describeDeleteBatchResult({
        deleted: 0,
        failed: [],
        defaultDeleted: false,
        promotedDefaultName: null,
      });

      expect(result.kind).toBe("info");
      expect(result.text).toBe("没有删除任何立绘。");
    });
  });
});
