/**
 * 剧情列表分组：纯逻辑（展开列表、拖动重排、工程文件读写）的单元测试。
 * 这些函数不依赖 React/DOM，拖动/折叠的边界都在这里锁住，UI 测试见 RecordList.test.tsx。
 */
import { DialogueAlign, Emotion, Record } from "@types";
import {
  createRecordGroup,
  flattenRecordList,
  keepKnownGroups,
  moveGroup,
  moveRecords,
  neighborMoveTarget,
  newRecordInsertIndex,
  nextGroupName,
  readGroups,
  RecordGroup,
  stampGroups,
  syncGroupAnchors,
} from "./recordGroups";
import { parseProjectText, serializeProject } from "./projectFile";

const makeRecord = (uuid: string, groupId?: string, text = uuid): Record => ({
  uuid,
  durationFrames: 30,
  groupId,
  dialogue: {
    text,
    location: "default",
    speakerC: [],
    speakerName: "",
    faction: "",
    align: DialogueAlign.LEFT,
    speed: 3,
    emotion: Emotion.NORMAL,
    freeText: true,
    hideUI: true,
  },
  bg: [],
  chars: [],
  tempImages: [],
  effects: [],
  audioCommands: [],
});

const makeGroup = (
  id: string,
  name = id,
  collapsed = false,
): RecordGroup => ({ id, name, collapsed });

/** 把记录数组压成 "uuid:groupId" 便于断言顺序与分组归属 */
const layout = (records: Record[]): string[] =>
  records.map((record) => `${record.uuid}:${record.groupId ?? "-"}`);

/** 把列表行压成 "record:uuid" / "group:id"，便于断言分组表头的位置 */
const rowsKind = (records: Record[], groups: RecordGroup[]): string[] =>
  flattenRecordList(records, groups).map((row) =>
    row.kind === "group"
      ? `group:${row.group.id}`
      : `record:${row.record.uuid}`,
  );

describe("剧情列表分组 → 展开列表", () => {
  test("分组成员连续时只出现一个表头，序号仍是扁平记录下标", () => {
    const records = [
      makeRecord("a"),
      makeRecord("b", "g1"),
      makeRecord("c", "g1"),
      makeRecord("d"),
      makeRecord("e", "g2"),
    ];
    const rows = flattenRecordList(records, [
      makeGroup("g1", "开头"),
      makeGroup("g2", "结尾"),
    ]);

    expect(rows.map((row) => row.kind)).toEqual([
      "record",
      "group",
      "record",
      "record",
      "record",
      "group",
      "record",
    ]);

    const groupRows = rows.filter((row) => row.kind === "group");
    expect(groupRows[0]).toMatchObject({
      group: { id: "g1", name: "开头" },
      count: 2,
    });
    expect(groupRows[1]).toMatchObject({
      group: { id: "g2", name: "结尾" },
      count: 1,
    });

    const indexes = rows
      .filter((row) => row.kind === "record")
      .map((row) => (row.kind === "record" ? row.index : -1));
    expect(indexes).toEqual([0, 1, 2, 3, 4]);
  });

  test("折叠的分组只保留表头（记录仍在数组里，只是不显示）", () => {
    const records = [
      makeRecord("a"),
      makeRecord("b", "g1"),
      makeRecord("c", "g1"),
      makeRecord("d"),
    ];
    const rows = flattenRecordList(records, [
      makeGroup("g1", "折叠中", true),
    ]);

    expect(rows.map((row) => row.kind)).toEqual([
      "record",
      "group",
      "record",
    ]);
    expect(rows[1]).toMatchObject({ count: 2 });
    expect(
      rows.some((row) => row.kind === "record" && row.record.uuid === "b"),
    ).toBe(false);
  });

  test("空分组追加到末尾；找不到分组定义的 groupId 按未分组显示", () => {
    const records = [makeRecord("a", "missing"), makeRecord("b")];
    const rows = flattenRecordList(records, [
      makeGroup("g1", "空分组"),
      makeGroup("g2", "也是空的"),
    ]);

    expect(rows.map((row) => row.kind)).toEqual([
      "record",
      "record",
      "group",
      "group",
    ]);
    expect(rows[2]).toMatchObject({ count: 0, group: { id: "g1" } });
    expect(rows[3]).toMatchObject({ count: 0, group: { id: "g2" } });
  });
});

describe("剧情列表分组 → 拖动重排", () => {
  test("拖进空分组：加入分组并放到组内（列表末尾）", () => {
    const records = [makeRecord("a"), makeRecord("b")];
    const next = moveRecords(records, ["a"], {
      kind: "group",
      groupId: "g1",
    });

    expect(layout(next)).toEqual(["b:-", "a:g1"]);
  });

  test("拖到分组内记录的前面：一起加入该分组", () => {
    const records = [makeRecord("a"), makeRecord("b", "g1")];
    const next = moveRecords(records, ["a"], {
      kind: "record",
      uuid: "b",
      position: "before",
    });

    expect(layout(next)).toEqual(["a:g1", "b:g1"]);
  });

  test("拖到未分组记录后面：移出分组，且分组块保持连续", () => {
    const records = [
      makeRecord("a", "g1"),
      makeRecord("b", "g1"),
      makeRecord("c"),
      makeRecord("d", "g2"),
    ];
    const next = moveRecords(records, ["a"], {
      kind: "record",
      uuid: "c",
      position: "after",
    });

    expect(layout(next)).toEqual(["b:g1", "c:-", "a:-", "d:g2"]);
  });

  test("多选一起拖：保持选中记录之间的相对顺序，并统一换成目标分组", () => {
    const records = [
      makeRecord("a", "g1"),
      makeRecord("b", "g1"),
      makeRecord("c"),
      makeRecord("d", "g2"),
    ];
    const next = moveRecords(records, ["a", "c"], {
      kind: "group",
      groupId: "g2",
    });

    expect(layout(next)).toEqual(["b:g1", "d:g2", "a:g2", "c:g2"]);
  });

  test("拖到列表末尾（end）：移出分组", () => {
    const records = [makeRecord("a", "g1"), makeRecord("b", "g1")];
    const next = moveRecords(records, ["a"], { kind: "end" });

    expect(layout(next)).toEqual(["b:g1", "a:-"]);
  });

  test("拖到列表最前面（start）：移出分组并成为第一条", () => {
    const records = [
      makeRecord("a"),
      makeRecord("b", "g1"),
      makeRecord("c", "g1"),
    ];
    const next = moveRecords(records, ["c"], { kind: "start" });

    expect(layout(next)).toEqual(["c:-", "a:-", "b:g1"]);
  });

  test("拖到自己身上 / 位置没变时返回原数组（避免无意义重渲染）", () => {
    const records = [makeRecord("a", "g1"), makeRecord("b", "g1")];

    expect(
      moveRecords(records, ["a"], {
        kind: "record",
        uuid: "a",
        position: "after",
      }),
    ).toBe(records);

    expect(
      moveRecords(records, ["a"], {
        kind: "record",
        uuid: "b",
        position: "before",
      }),
    ).toBe(records);
  });

  test("↑↓ 按钮换算成相邻记录的放置目标", () => {
    const records = [makeRecord("a"), makeRecord("b"), makeRecord("c")];

    expect(neighborMoveTarget(records, 0, "up")).toBeNull();
    expect(neighborMoveTarget(records, 2, "down")).toBeNull();
    expect(neighborMoveTarget(records, 2, "up")).toEqual({
      kind: "record",
      uuid: "b",
      position: "before",
    });
    expect(neighborMoveTarget(records, 0, "down")).toEqual({
      kind: "record",
      uuid: "b",
      position: "after",
    });
  });

  test("在分组内按 + 新增：插到组内末尾；未分组则追加到列表末尾", () => {
    const records = [
      makeRecord("a"),
      makeRecord("b", "g1"),
      makeRecord("c", "g1"),
      makeRecord("d"),
    ];

    expect(newRecordInsertIndex(records, "g1")).toBe(3);
    // 空分组：默认显示在末尾，新增也放到末尾
    expect(newRecordInsertIndex(records, "g2", [])).toBe(4);
    // 带锚点的空分组：新增记录放到它当前显示的位置（g1 块之后、d 之前）
    expect(
      newRecordInsertIndex(records, "g2", [
        { ...makeGroup("g2"), anchorUuid: "b" },
      ]),
    ).toBe(3);
    expect(newRecordInsertIndex(records, undefined)).toBe(4);
  });
});

describe("剧情列表分组 → 空分组位置", () => {
  test("按 anchorUuid 插到对应块之后（null = 最前）", () => {
    const records = [
      makeRecord("a"),
      makeRecord("b", "g1"),
      makeRecord("c", "g1"),
      makeRecord("d"),
    ];
    const groups: RecordGroup[] = [
      makeGroup("g1", "开头"),
      { ...makeGroup("top", "顶部"), anchorUuid: null },
      { ...makeGroup("afterA", "a 之后"), anchorUuid: "a" },
      { ...makeGroup("afterC", "c 之后"), anchorUuid: "c" },
    ];

    expect(rowsKind(records, groups)).toEqual([
      "group:top",
      "record:a",
      "group:afterA",
      "group:g1",
      "record:b",
      "record:c",
      "group:afterC",
      "record:d",
    ]);
  });

  test("锚点在被折叠的分组里时，空分组跟在该分组表头之后", () => {
    const records = [
      makeRecord("a"),
      makeRecord("b", "g1"),
      makeRecord("c", "g1"),
      makeRecord("d"),
    ];
    const groups: RecordGroup[] = [
      makeGroup("g1", "折叠", true),
      { ...makeGroup("afterB", "b 之后"), anchorUuid: "b" },
    ];

    expect(rowsKind(records, groups)).toEqual([
      "record:a",
      "group:g1",
      "group:afterB",
      "record:d",
    ]);
  });

  test("锚点记录不存在时退回列表末尾", () => {
    const records = [makeRecord("a")];
    const groups: RecordGroup[] = [
      { ...makeGroup("lost", "找不到锚点"), anchorUuid: "missing" },
    ];

    expect(rowsKind(records, groups)).toEqual(["record:a", "group:lost"]);
  });
});

describe("剧情列表分组 → 记录变动后的空分组位置", () => {
  test("分组变空时留在原来的位置（锚到前一条记录）", () => {
    const previous = [
      makeRecord("a"),
      makeRecord("b", "g1"),
      makeRecord("c", "g1"),
    ];
    const next = [makeRecord("a")];

    expect(syncGroupAnchors(previous, next, [makeGroup("g1")])[0].anchorUuid).toBe(
      "a",
    );
  });

  test("分组在最前面变空时锚到最前（null）", () => {
    const previous = [makeRecord("a", "g1"), makeRecord("b")];
    const next = [makeRecord("b")];

    expect(
      syncGroupAnchors(previous, next, [makeGroup("g1")])[0].anchorUuid,
    ).toBeNull();
  });

  test("分组重新有记录后清掉空分组锚点", () => {
    const previous = [makeRecord("a")];
    const next = [makeRecord("a"), makeRecord("b", "g1")];
    const groups: RecordGroup[] = [{ ...makeGroup("g1"), anchorUuid: "a" }];

    expect(syncGroupAnchors(previous, next, groups)[0].anchorUuid).toBeUndefined();
  });

  test("拖进带锚点的空分组：记录出现在分组当前显示的位置", () => {
    const records = [makeRecord("a"), makeRecord("b"), makeRecord("c")];
    const anchored: RecordGroup[] = [{ ...makeGroup("g"), anchorUuid: "b" }];

    expect(
      layout(
        moveRecords(
          records,
          ["c"],
          { kind: "group", groupId: "g" },
          anchored,
        ),
      ),
    ).toEqual(["a:-", "b:-", "c:g"]);

    // 锚点记录本身拖进空分组：分组落在它原来的位置
    expect(
      layout(
        moveRecords(
          records,
          ["b"],
          { kind: "group", groupId: "g" },
          anchored,
        ),
      ),
    ).toEqual(["a:-", "b:g", "c:-"]);
  });
});

describe("剧情列表分组 → 拖动分组排序", () => {
  const records = [
    makeRecord("a"),
    makeRecord("b", "g1"),
    makeRecord("c", "g1"),
    makeRecord("d"),
  ];
  const groups = [makeGroup("g1", "开头")];

  test("有内容的分组整体移到某条记录前面", () => {
    const result = moveGroup(records, groups, "g1", {
      kind: "record",
      uuid: "a",
      position: "before",
    });

    expect(layout(result.records)).toEqual([
      "b:g1",
      "c:g1",
      "a:-",
      "d:-",
    ]);
  });

  test("有内容的分组整体移到列表末尾", () => {
    const result = moveGroup(records, groups, "g1", { kind: "end" });

    expect(layout(result.records)).toEqual([
      "a:-",
      "d:-",
      "b:g1",
      "c:g1",
    ]);
  });

  test("有内容的分组整体移到列表最前面", () => {
    const result = moveGroup(records, groups, "g1", { kind: "start" });

    expect(layout(result.records)).toEqual([
      "b:g1",
      "c:g1",
      "a:-",
      "d:-",
    ]);
  });

  test("空分组拖到列表最前面", () => {
    const empty = makeGroup("empty", "空分组");
    const result = moveGroup(records, [...groups, empty], "empty", {
      kind: "start",
    });

    expect(result.records).toBe(records);
    expect(
      result.groups.find((group) => group.id === "empty")?.anchorUuid,
    ).toBeNull();
    expect(rowsKind(result.records, result.groups)[0]).toBe("group:empty");
  });

  test("两个有内容的分组之间也能前后排序", () => {
    const twoGroups = [makeGroup("g1", "开头"), makeGroup("g2", "结尾")];
    const recordsWithTwoGroups = [
      makeRecord("a", "g1"),
      makeRecord("b", "g2"),
      makeRecord("c", "g2"),
    ];

    const before = moveGroup(recordsWithTwoGroups, twoGroups, "g2", {
      kind: "record",
      uuid: "a",
      position: "before",
    });
    expect(layout(before.records)).toEqual(["b:g2", "c:g2", "a:g1"]);

    const after = moveGroup(before.records, twoGroups, "g1", {
      kind: "record",
      uuid: "c",
      position: "after",
    });
    expect(layout(after.records)).toEqual(["b:g2", "c:g2", "a:g1"]);
  });

  test("空分组可以移到两条内容之间（anchor 定位）", () => {
    const result = moveGroup(
      records,
      [...groups, makeGroup("empty", "空分组")],
      "empty",
      { kind: "record", uuid: "a", position: "after" },
    );

    expect(result.records).toBe(records); // 空分组没有记录可移动
    expect(
      result.groups.find((group) => group.id === "empty")?.anchorUuid,
    ).toBe("a");
    expect(rowsKind(result.records, result.groups)).toEqual([
      "record:a",
      "group:empty",
      "group:g1",
      "record:b",
      "record:c",
      "record:d",
    ]);
  });

  test("有内容的分组放到空分组前面/后面", () => {
    const empty: RecordGroup = {
      ...makeGroup("empty", "空分组"),
      anchorUuid: "a",
    };

    const before = moveGroup(records, [...groups, empty], "g1", {
      kind: "empty-group",
      groupId: "empty",
      position: "before",
    });
    expect(rowsKind(before.records, before.groups)).toEqual([
      "record:a",
      "group:g1",
      "record:b",
      "record:c",
      "group:empty",
      "record:d",
    ]);

    const after = moveGroup(records, [...groups, empty], "g1", {
      kind: "empty-group",
      groupId: "empty",
      position: "after",
    });
    expect(rowsKind(after.records, after.groups)).toEqual([
      "record:a",
      "group:empty",
      "group:g1",
      "record:b",
      "record:c",
      "record:d",
    ]);
  });

  test("末尾的空分组：有内容的分组放到它前/后都能正确显示", () => {
    const empty = makeGroup("empty", "末尾空分组");
    const recordsWithoutD = [
      makeRecord("a"),
      makeRecord("b", "g1"),
      makeRecord("c", "g1"),
    ];

    const before = moveGroup(recordsWithoutD, [...groups, empty], "g1", {
      kind: "empty-group",
      groupId: "empty",
      position: "before",
    });
    expect(rowsKind(before.records, before.groups)).toEqual([
      "record:a",
      "group:g1",
      "record:b",
      "record:c",
      "group:empty",
    ]);

    const after = moveGroup(recordsWithoutD, [...groups, empty], "g1", {
      kind: "empty-group",
      groupId: "empty",
      position: "after",
    });
    expect(rowsKind(after.records, after.groups)).toEqual([
      "record:a",
      "group:empty",
      "group:g1",
      "record:b",
      "record:c",
    ]);
  });

  test("拖到自己的块上没有变化", () => {
    const result = moveGroup(records, groups, "g1", {
      kind: "record",
      uuid: "b",
      position: "after",
    });

    expect(result.records).toBe(records);
    expect(result.groups).toBe(groups);
  });
});

describe("剧情列表分组 → 分组定义", () => {
  test("默认名称按 分组 N 顺延，跳过已占用的名字", () => {
    expect(nextGroupName([])).toBe("分组 1");
    expect(nextGroupName([makeGroup("g1", "分组 1")])).toBe("分组 2");
    expect(nextGroupName([makeGroup("g1", "分组 2")])).toBe("分组 1");
    expect(nextGroupName([makeGroup("g1", "自定义")])).toBe("分组 1");
  });

  test("新建分组默认展开", () => {
    const group = createRecordGroup([makeGroup("g1", "分组 1")], "new-id");
    expect(group).toEqual({ id: "new-id", name: "分组 2", collapsed: false });
  });

  test("工程文件里的分组快照能还原（含折叠状态与缺失名称）", () => {
    const groups = readGroups([
      { group: { id: "g1", name: "开头", collapsed: true } },
      { group: { id: "g1", name: "开头", collapsed: true } },
      { group: { id: "g2" } },
      { groupId: "g3" },
      { group: null },
    ]);

    expect(groups).toEqual([
      { id: "g1", name: "开头", collapsed: true },
      { id: "g2", name: "分组 2", collapsed: false },
      { id: "g3", name: "分组 3", collapsed: false },
    ]);
  });

  test("丢掉找不到分组定义的 groupId", () => {
    const records = [
      makeRecord("a", "g1"),
      makeRecord("b", "missing"),
      makeRecord("c"),
    ];
    const kept = keepKnownGroups(records, [makeGroup("g1")]);

    expect(layout(kept)).toEqual(["a:g1", "b:-", "c:-"]);
  });
});

describe("剧情列表分组 → 工程文件读写", () => {
  test("保存时把分组名称/折叠状态写成快照，顶层仍是记录数组", () => {
    const records = [makeRecord("a", "g1"), makeRecord("b", "g1"), makeRecord("c")];
    const text = serializeProject(records, [
      makeGroup("g1", "开头", true),
    ]);
    const parsed = JSON.parse(text);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].group).toEqual({
      id: "g1",
      name: "开头",
      collapsed: true,
    });
    expect(parsed[1].group).toEqual(parsed[0].group);
    expect(parsed[2].groupId).toBeUndefined();
    expect(parsed[2].group).toBeUndefined();
  });

  test("保存 → 导入往返：分组、折叠状态、记录顺序都不丢", () => {
    const records = [
      makeRecord("a"),
      makeRecord("b", "g1"),
      makeRecord("c", "g1"),
      makeRecord("d", "g2"),
    ];
    const groups = [
      makeGroup("g1", "开头", true),
      makeGroup("g2", "高潮"),
    ];

    const parsed = parseProjectText(serializeProject(records, groups));

    expect(parsed.groups).toEqual(groups);
    expect(layout(parsed.records)).toEqual([
      "a:-",
      "b:g1",
      "c:g1",
      "d:g2",
    ]);
    // 运行时只保留 groupId，group 快照不留在记录上
    expect(parsed.records[1].group).toBeUndefined();
  });

  test("兼容旧工程（顶层数组、没有分组字段）与 { records: [...] } 包装", () => {
    const legacy = parseProjectText(
      JSON.stringify([{ uuid: "a", dialogue: { text: "旧记录" } }]),
    );
    expect(legacy.groups).toEqual([]);
    expect(legacy.records).toHaveLength(1);
    expect(legacy.records[0].groupId).toBeUndefined();

    const wrapped = parseProjectText(
      JSON.stringify({ records: [{ uuid: "b", groupId: "g1" }] }),
    );
    expect(wrapped.groups).toEqual([
      { id: "g1", name: "分组 1", collapsed: false },
    ]);
    expect(wrapped.records[0].groupId).toBe("g1");
  });

  test("没有分组时保存结果里不出现 group / groupId 字段", () => {
    const records = [makeRecord("a"), makeRecord("b")];
    const text = serializeProject(records, []);
    expect(text).not.toContain('"group"');
    expect(text).not.toContain('"groupId"');
  });

  test("stampGroups 会把已删除分组的 groupId 清掉", () => {
    const records = [makeRecord("a", "gone"), makeRecord("b", "g1")];
    const stamped = stampGroups(records, [makeGroup("g1", "保留")]);

    expect(stamped[0].groupId).toBeUndefined();
    expect(stamped[0].group).toBeUndefined();
    expect(stamped[1].group).toEqual({
      id: "g1",
      name: "保留",
      collapsed: false,
    });
  });
});
