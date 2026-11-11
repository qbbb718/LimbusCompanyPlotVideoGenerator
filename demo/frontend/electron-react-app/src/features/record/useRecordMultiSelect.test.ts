/**
 * 剧情列表多选 hook（`useRecordMultiSelect`）：
 * - 单击只选一条、Ctrl 追加 / 取消、Shift 连选；
 * - "当前记录"由外部持有（workspace），点行时要通知它，且它变化时多选要跟随；
 * - 记录被删除 / 工程被替换后，选中集合里不能留下已经不存在的 uuid。
 *
 * 这些规则原先写在 RecordList 里；搬到编辑器层之后必须逐条锁住 ——
 * 它们同时决定"一次拖几条"和"批量修改改哪几条"。
 */
import { act, renderHook } from "@testing-library/react";
import { DialogueAlign, Emotion, Record as PlotRecord } from "@types";
import { useRecordMultiSelect } from "./useRecordMultiSelect";

const makeRecord = (uuid: string): PlotRecord => ({
  uuid,
  durationFrames: 30,
  dialogue: {
    text: `${uuid} 的台词`,
    location: "default",
    speakerC: [],
    speakerName: "",
    faction: "",
    align: DialogueAlign.LEFT,
    speed: 3,
    emotion: Emotion.NORMAL,
  },
  bg: [],
  chars: [],
  tempImages: [],
  effects: [],
  audioCommands: [],
});

const records = [makeRecord("a"), makeRecord("b"), makeRecord("c")];

/** 渲染 hook：setSelectedRecordIndex 用 spy（真实实现由 workspace 提供） */
const setup = (initialIndex = 0) => {
  const setSelectedRecordIndex = jest.fn();
  const view = renderHook(
    ({ list, index }: { list: PlotRecord[]; index: number }) =>
      useRecordMultiSelect(list, index, setSelectedRecordIndex),
    { initialProps: { list: records, index: initialIndex } },
  );
  return { ...view, setSelectedRecordIndex };
};

describe("useRecordMultiSelect 点选规则", () => {
  test("挂载时只选中当前记录", () => {
    const { result } = setup(1);
    expect(result.current.uuids).toEqual(["b"]);
    expect(result.current.count).toBe(1);
    expect(result.current.has("b")).toBe(true);
  });

  test("单击某一行：只留这一条，并把当前记录切过去", () => {
    const { result, setSelectedRecordIndex } = setup(0);

    act(() => result.current.clickRow({}, records[2], 2));

    expect(result.current.uuids).toEqual(["c"]);
    expect(setSelectedRecordIndex).toHaveBeenCalledWith(2);
  });

  test("Ctrl 追加：选中的记录越来越多，当前记录跟着最后点的那条", () => {
    const { result, setSelectedRecordIndex } = setup(0);

    act(() => result.current.clickRow({ ctrlKey: true }, records[1], 1));
    act(() => result.current.clickRow({ ctrlKey: true }, records[2], 2));

    expect(result.current.uuids).toEqual(["a", "b", "c"]);
    expect(result.current.count).toBe(3);
    expect(setSelectedRecordIndex).toHaveBeenLastCalledWith(2);
  });

  test("Ctrl 再点已选中的行：从批量里摘掉它", () => {
    const { result } = setup(0);

    act(() => result.current.clickRow({ ctrlKey: true }, records[1], 1));
    expect(result.current.uuids).toEqual(["a", "b"]);

    act(() => result.current.clickRow({ ctrlKey: true }, records[1], 1));
    expect(result.current.uuids).toEqual(["a"]);
  });

  test("Ctrl 点唯一选中的那条不会把选中集合清空（列表始终有一条当前记录）", () => {
    const { result } = setup(0);

    act(() => result.current.clickRow({ ctrlKey: true }, records[0], 0));
    expect(result.current.uuids).toEqual(["a"]);
  });

  test("Meta 键与 Ctrl 等价（macOS）", () => {
    const { result } = setup(0);

    act(() => result.current.clickRow({ metaKey: true }, records[2], 2));
    expect(result.current.uuids).toEqual(["a", "c"]);
  });

  test("Shift 连选：从当前记录连到点击的那一行", () => {
    const { result, setSelectedRecordIndex } = setup(0);

    act(() => result.current.clickRow({ shiftKey: true }, records[2], 2));

    expect(result.current.uuids).toEqual(["a", "b", "c"]);
    expect(setSelectedRecordIndex).toHaveBeenCalledWith(2);
  });

  test("Shift 连选以 Ctrl 点过的那条为锚点，而不是当前记录", () => {
    const { result } = setup(0);

    // 锚点 = b（当前记录此时也是 b）
    act(() => result.current.clickRow({ ctrlKey: true }, records[1], 1));
    act(() => result.current.clickRow({ shiftKey: true }, records[2], 2));

    expect(result.current.uuids).toEqual(["b", "c"]);
  });
});

describe("useRecordMultiSelect 与外部状态同步", () => {
  test("外部把当前记录换到没选中的那条 → 选中集合收成它自己", () => {
    const { result, rerender } = setup(0);

    act(() => result.current.clickRow({ ctrlKey: true }, records[1], 1));
    expect(result.current.uuids).toEqual(["a", "b"]);

    // 比如用户点了预览里的时间轴：当前记录换成 c，而 c 不在多选里
    rerender({ list: records, index: 2 });
    expect(result.current.uuids).toEqual(["c"]);
  });

  test("外部换到已经选中的那条 → 保留原来的多选", () => {
    const { result, rerender } = setup(0);

    act(() => result.current.clickRow({ ctrlKey: true }, records[1], 1));
    rerender({ list: records, index: 1 });

    expect(result.current.uuids).toEqual(["a", "b"]);
  });

  test("记录被删除后，选中集合里不留下已经不存在的 uuid", () => {
    const { result, rerender } = setup(0);

    act(() => result.current.clickRow({ ctrlKey: true }, records[2], 2));
    expect(result.current.uuids).toEqual(["a", "c"]);

    rerender({ list: [records[0], records[1]], index: 0 });
    expect(result.current.uuids).toEqual(["a"]);
  });

  test("全选 / 取消全选；已全选时 allSelected 为 true", () => {
    const { result } = setup(0);

    act(() => result.current.toggleAll());
    expect(result.current.uuids).toEqual(["a", "b", "c"]);
    expect(result.current.allSelected).toBe(true);

    act(() => result.current.toggleAll());
    expect(result.current.uuids).toEqual([]);
    expect(result.current.allSelected).toBe(false);
  });

  test("selectOnly / clear", () => {
    const { result } = setup(0);

    act(() => result.current.toggleAll());
    act(() => result.current.selectOnly("b"));
    expect(result.current.uuids).toEqual(["b"]);

    act(() => result.current.clear());
    expect(result.current.uuids).toEqual([]);
    expect(result.current.count).toBe(0);
  });
});
