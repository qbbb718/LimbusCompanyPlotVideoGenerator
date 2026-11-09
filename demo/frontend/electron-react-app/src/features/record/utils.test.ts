/**
 * 台词（对话内容）摘要与行数统计：
 * 列表 / 时间轴只做单行展示，而台词支持换行（剧情编辑 → 文本 → 对话内容），
 * 所以摘要必须把换行压平，行数统计的"末尾空白"口径要与后端保存时一致。
 */
import { dialogueTextStats, dialogueTextSummary } from "./utils";

describe("dialogueTextSummary", () => {
  it("把换行与连续空白压成单个空格", () => {
    expect(dialogueTextSummary("第一行\n第二行")).toBe("第一行 第二行");
    expect(dialogueTextSummary("第一行\n\n  第二行")).toBe("第一行 第二行");
    expect(dialogueTextSummary("  前后都有空白  ")).toBe("前后都有空白");
  });

  it("超过上限时截断并加省略号（按压平后的长度算）", () => {
    expect(dialogueTextSummary("一二三四五", 3)).toBe("一二三...");
    // 换行压平成空格：空格也占长度，所以上限要按压平后的 6 个字来给
    expect(dialogueTextSummary("一二\n三四五", 6)).toBe("一二 三四五");
  });

  it("空台词返回空串", () => {
    expect(dialogueTextSummary("")).toBe("");
    expect(dialogueTextSummary(null)).toBe("");
    expect(dialogueTextSummary(undefined)).toBe("");
  });
});

describe("dialogueTextStats", () => {
  it("多行台词按行数统计，字数不含换行", () => {
    expect(dialogueTextStats("第一行\n第二行")).toEqual({ lines: 2, chars: 6 });
  });

  it("末尾换行不额外算一行（与后端去掉首尾空白后的口径一致）", () => {
    expect(dialogueTextStats("第一行\n")).toEqual({ lines: 1, chars: 3 });
  });

  it("中间空行算一行", () => {
    expect(dialogueTextStats("甲\n\n乙")).toEqual({ lines: 3, chars: 2 });
  });

  it("空台词 = 0 行 0 字", () => {
    expect(dialogueTextStats("")).toEqual({ lines: 0, chars: 0 });
    expect(dialogueTextStats("  \n ")).toEqual({ lines: 0, chars: 0 });
    expect(dialogueTextStats(null)).toEqual({ lines: 0, chars: 0 });
  });
});
