/**
 * 工程文件的 `settings` 段落（S2c-2）。
 *
 * <p>要锁住的是**格式兼容性**，不是序列化细节：
 * 1. 给了 settings 才写 `{version, settings, records}`；不给仍是裸数组
 *    （后端 RecordsIO 的导入格式就是裸数组，测试里直接读它的那条断言不能破）；
 * 2. 往返后 `stayFrames` 原样回来，越界值按 [0,300] 收敛（与后端归一化同口径）；
 * 3. 旧工程（裸数组 / 只有 records 包装）没有 settings → 不覆盖用户当前设置。
 */
import { parseProjectText, serializeProject } from "./projectFile";

const record = (uuid: string): any => ({
  uuid,
  durationFrames: 30,
  dialogue: { text: `记录 ${uuid}` },
});

describe("工程文件 settings 段落", () => {
  test("给了 settings 就写成 {version, settings, records}", () => {
    const text = serializeProject([record("a")], [], { stayFrames: 120 });
    const parsed = JSON.parse(text);

    expect(Array.isArray(parsed)).toBe(false);
    expect(parsed.version).toBe(1);
    expect(parsed.settings).toEqual({ stayFrames: 120 });
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].uuid).toBe("a");
  });

  test("不给 settings 仍是裸数组（后端 RecordsIO 导入格式不变）", () => {
    const parsed = JSON.parse(serializeProject([record("a")], []));
    expect(Array.isArray(parsed)).toBe(true);
  });

  test("保存 → 导入往返：stayFrames 不丢", () => {
    const parsed = parseProjectText(serializeProject([record("a")], [], { stayFrames: 42 }));
    expect(parsed.settings).toEqual({ stayFrames: 42 });
    expect(parsed.records).toHaveLength(1);
  });

  test("越界 / 非法值按 [0,300] 收敛（负数、超上限、非数字）", () => {
    expect(parseProjectText(serializeProject([record("a")], [], { stayFrames: 999 })).settings)
      .toEqual({ stayFrames: 300 });
    expect(parseProjectText(serializeProject([record("a")], [], { stayFrames: -5 })).settings)
      .toEqual({ stayFrames: 0 });
    expect(
      parseProjectText(
        JSON.stringify({ version: 1, settings: { stayFrames: "abc" }, records: [record("a")] }),
      ).settings,
    ).toEqual({ stayFrames: 75 });
  });

  test("旧工程没有 settings 段：parsed.settings 为 undefined（不覆盖当前设置）", () => {
    expect(
      parseProjectText(JSON.stringify([record("a")])).settings,
    ).toBeUndefined();
    expect(
      parseProjectText(JSON.stringify({ records: [record("a")] })).settings,
    ).toBeUndefined();
  });

  test("带 settings 但记录为空也照常解析（settings 与记录数无关）", () => {
    const parsed = parseProjectText(
      JSON.stringify({ version: 1, settings: { stayFrames: 30 }, records: [] }),
    );
    expect(parsed.records).toEqual([]);
    expect(parsed.settings).toEqual({ stayFrames: 30 });
  });
});
