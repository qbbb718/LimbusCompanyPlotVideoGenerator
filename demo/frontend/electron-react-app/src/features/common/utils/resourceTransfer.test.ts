/**
 * 素材**批量处理**的公共逻辑：背景 / 音效两个页签的「📥 导入」（多个资源包）与
 * 「➕ 添加」（多个素材文件）都走这里，用例锁住四条规则：
 * 1. **逐个**处理，顺序 = 用户选择的顺序，每个文件开始前上报一次进度；
 * 2. 某个文件失败**不打断整批**，失败原因优先用后端返回的 message；
 * 3. 资源条数按"产出"统计：一个资源包里可能有好几条，一个图片文件就是一条；
 * 4. 两种入口的结果文案要分清"全成功 / 部分成功 / 全失败"，并点名是哪个文件、为什么。
 */
import {
  appendRefreshWarning,
  describeBatchAddResult,
  describeBundleImportResult,
  runFileBatch,
  stripFileExtension,
} from "./resourceTransfer";
import type { BatchProgress } from "./resourceTransfer";

/** 一个假的文件（只用到文件名；内容后端不会真读） */
const zip = (name: string) =>
  new File(["zip"], name, { type: "application/zip" });

const png = (name: string) => new File(["png"], name, { type: "image/png" });

const BACKGROUND_LABELS = { unit: "张背景", bundle: "背景资源包" };
const ADD_LABELS = { unit: "张背景", hint: "名称取自文件名" };

describe("runFileBatch：逐个处理多个文件", () => {
  test("按选择顺序逐个处理，每个文件开始前上报「第几个 / 共几个」", async () => {
    const order: string[] = [];
    const progress: BatchProgress[] = [];
    const handler = jest.fn(async (file: File) => {
      order.push(file.name);
      return [{ uuid: "1" }, { uuid: "2" }];
    });

    const result = await runFileBatch([zip("a.zip"), zip("b.zip")], handler, {
      onProgress: (snapshot) => progress.push(snapshot),
    });

    // 逐个、按顺序（并发会让几十 MB 的文件一起吃掉内存和带宽）
    expect(order).toEqual(["a.zip", "b.zip"]);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(progress).toEqual([
      { done: 0, total: 2, fileName: "a.zip" },
      { done: 1, total: 2, fileName: "b.zip" },
    ]);
    // 两个包各导入 2 条，按"资源条数"汇总（不是按文件数）
    expect(result).toEqual({
      itemCount: 4,
      succeededFiles: 2,
      failures: [],
    });
  });

  test("单个文件产出一条素材（多选添加）：数组按条数、对象按 1 条", async () => {
    const asArray = await runFileBatch([png("a.png")], async () => [
      { uuid: "bg_1" },
    ]);
    const asObject = await runFileBatch([png("a.png")], async () => ({
      uuid: "bg_1",
    }));

    expect(asArray.itemCount).toBe(1);
    expect(asObject).toEqual({ itemCount: 1, succeededFiles: 1, failures: [] });
  });

  test("某个文件坏了不影响其它文件，失败原因优先用后端 message", async () => {
    const handler = jest
      .fn()
      .mockRejectedValueOnce({
        response: { data: { message: "压缩包里没有 background.json" } },
      })
      .mockResolvedValueOnce([{ uuid: "b1" }]);

    const result = await runFileBatch(
      [zip("坏包.zip"), zip("好包.zip")],
      handler,
      { fallbackError: "导入失败" },
    );

    expect(result.itemCount).toBe(1);
    expect(result.succeededFiles).toBe(1);
    expect(result.failures).toEqual([
      { fileName: "坏包.zip", reason: "压缩包里没有 background.json" },
    ]);
  });

  test("后端没给 message 时退回兜底文案（带上原始错误，便于排查）", async () => {
    const handler = jest.fn().mockRejectedValue(new Error("Network Error"));

    const result = await runFileBatch([zip("a.zip")], handler, {
      fallbackError: "添加失败",
    });

    expect(result).toEqual({
      itemCount: 0,
      succeededFiles: 0,
      failures: [{ fileName: "a.zip", reason: "添加失败（Network Error）" }],
    });
  });

  test("没选文件：不发请求，结果全为 0（调用方据此提前返回）", async () => {
    const handler = jest.fn();

    const result = await runFileBatch([], handler);

    expect(handler).not.toHaveBeenCalled();
    expect(result).toEqual({
      itemCount: 0,
      succeededFiles: 0,
      failures: [],
    });
  });
});

describe("describeBundleImportResult：导入资源包的结果文案", () => {
  test("全部成功：一条绿色提示，报条数与包数", () => {
    expect(
      describeBundleImportResult(
        { itemCount: 4, succeededFiles: 2, failures: [] },
        BACKGROUND_LABELS,
      ),
    ).toEqual({ kind: "success", text: "已导入 4 张背景（2 个背景资源包）" });
  });

  test("部分成功：黄色提示，成功条数 + 逐个点出没导入的包与原因", () => {
    expect(
      describeBundleImportResult(
        {
          itemCount: 1,
          succeededFiles: 1,
          failures: [
            { fileName: "坏包.zip", reason: "压缩包里没有 background.json" },
          ],
        },
        BACKGROUND_LABELS,
      ),
    ).toEqual({
      kind: "info",
      text: "已导入 1 张背景（1 个背景资源包）；另有 1 个背景资源包没导入：坏包.zip（压缩包里没有 background.json）",
    });
  });

  test("全部失败：红色提示，点名每个包（不再只说一句「导入失败」）", () => {
    expect(
      describeBundleImportResult(
        {
          itemCount: 0,
          succeededFiles: 0,
          failures: [
            { fileName: "a.zip", reason: "不是 ZIP" },
            { fileName: "b.zip", reason: "包为空" },
          ],
        },
        BACKGROUND_LABELS,
      ),
    ).toEqual({
      kind: "error",
      text: "2 个背景资源包都没导入成功：a.zip（不是 ZIP）；b.zip（包为空）",
    });
  });

  test("一个包都没处理：给中性提示，不说成失败", () => {
    expect(
      describeBundleImportResult(
        { itemCount: 0, succeededFiles: 0, failures: [] },
        BACKGROUND_LABELS,
      ),
    ).toEqual({ kind: "info", text: "没有选择资源包" });
  });
});

describe("describeBatchAddResult：多选添加素材的结果文案", () => {
  test("全部成功：报新增条数，并带上「名称取自文件名」这类说明", () => {
    expect(
      describeBatchAddResult(
        { itemCount: 2, succeededFiles: 2, failures: [] },
        ADD_LABELS,
      ),
    ).toEqual({
      kind: "success",
      text: "已添加 2 张背景；名称取自文件名",
    });
  });

  test("部分成功：黄色提示，成功条数 + 哪个文件没添加、为什么", () => {
    expect(
      describeBatchAddResult(
        {
          itemCount: 1,
          succeededFiles: 1,
          failures: [{ fileName: "坏图.png", reason: "图片读不出来" }],
        },
        ADD_LABELS,
      ),
    ).toEqual({
      kind: "info",
      text: "已添加 1 张背景；另有 1 个文件没添加：坏图.png（图片读不出来）；名称取自文件名",
    });
  });

  test("全部失败：红色提示，不再说「已添加 0」", () => {
    expect(
      describeBundleImportResult(
        {
          itemCount: 0,
          succeededFiles: 0,
          failures: [{ fileName: "a.zip", reason: "不是 ZIP" }],
        },
        BACKGROUND_LABELS,
      ).kind,
    ).toBe("error");
    expect(
      describeBatchAddResult(
        {
          itemCount: 0,
          succeededFiles: 0,
          failures: [{ fileName: "坏图.png", reason: "图片读不出来" }],
        },
        ADD_LABELS,
      ),
    ).toEqual({
      kind: "error",
      text: "1 个文件都没能添加：坏图.png（图片读不出来）",
    });
  });

  test("一个文件都没处理：给中性提示", () => {
    expect(
      describeBatchAddResult(
        { itemCount: 0, succeededFiles: 0, failures: [] },
        ADD_LABELS,
      ),
    ).toEqual({ kind: "info", text: "没有选择文件" });
  });
});

describe("appendRefreshWarning：列表刷新失败时补一句", () => {
  test("刷新成功：原样返回（换一个对象也行，文案不变）", () => {
    const message = { kind: "success" as const, text: "已添加 2 张背景" };
    expect(appendRefreshWarning(message, false)).toEqual(message);
  });

  test("刷新失败：保留原来的色调，补一句「重新进入页面查看」", () => {
    expect(
      appendRefreshWarning({ kind: "success", text: "已添加 2 张背景" }, true),
    ).toEqual({
      kind: "success",
      text: "已添加 2 张背景；列表刷新失败，请重新进入本页面查看",
    });
  });
});

describe("stripFileExtension：素材名取文件名", () => {
  test("去掉扩展名；中文名、多个点、没有扩展名都稳", () => {
    expect(stripFileExtension("场景A.png")).toBe("场景A");
    expect(stripFileExtension("bg.room.01.webp")).toBe("bg.room.01");
    expect(stripFileExtension("noext")).toBe("noext");
    expect(stripFileExtension("")).toBe("");
  });
});
