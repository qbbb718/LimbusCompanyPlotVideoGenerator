/**
 * @module 剧情列表分组（图层面板里的"图层文件夹"）
 * 分组的数据分两处保存：
 * 1. 运行时：workspace 持有 groups 数组（名称、折叠状态、空分组的位置），记录上只有 groupId；
 * 2. 工程文件：仍是后端认识的"记录数组"，分组名称/折叠状态作为快照写在每条带分组的记录上
 *    （见 stampGroups / readGroups）。这样老版本、后端 RecordsIO 都不受影响。
 *
 * 列表顺序约定：
 * - records 数组的顺序就是播放顺序；同一分组的记录在数组里连续，分组表头出现在这段记录之前；
 * - 空分组没有记录可挂靠，用 anchorUuid 记住显示位置：
 *   null = 最前面；undefined = 末尾；uuid = 显示在这条记录所在块之后。
 *   一旦分组里有了记录，位置由记录本身决定（anchorUuid 会被清掉）。
 *
 * 这里都是纯函数，方便单独测试；UI 见 RecordList.tsx，状态入口见 RecordEditor.tsx。
 */
import { Record } from "@types";
import { generateUUID } from "./utils";

/** 一个分组（图层文件夹）：只存名称、折叠状态与空分组位置，成员关系记在记录的 groupId 上 */
export interface RecordGroup {
  id: string;
  name: string;
  collapsed: boolean;
  /**
   * 仅空分组使用：显示在哪条记录所在块之后。
   * null = 列表最前；undefined = 列表末尾；uuid = 该记录所在块之后。
   * 分组里有记录时位置由记录顺序决定，该字段会被忽略/清空。
   */
  anchorUuid?: string | null;
}

/** 列表里的一行：分组表头或一条记录 */
export interface RecordGroupRowData {
  kind: "group";
  group: RecordGroup;
  /** 组内记录条数（折叠时也显示，方便判断里面有多少条） */
  count: number;
}

export interface RecordRowData {
  kind: "record";
  record: Record;
  /** 在扁平记录数组里的下标：序号、预览定位、上下移动都用它 */
  index: number;
  /** 所属分组 id；未分组为 undefined */
  groupId?: string;
}

export type RecordListRow = RecordGroupRowData | RecordRowData;

/** 拖动记录时的放置目标 */
export type MoveTarget =
  /** 放到某条记录的前面/后面（会加入这条记录所在的分组；它未分组时一起变为未分组） */
  | { kind: "record"; uuid: string; position: "before" | "after" }
  /** 放到某个分组里（组内末尾；空分组则放到它当前显示的位置） */
  | { kind: "group"; groupId: string }
  /** 放到列表最前面，并且移出分组 */
  | { kind: "start" }
  /** 放到列表末尾，并且移出分组 */
  | { kind: "end" };

/**
 * 拖动分组表头时的放置目标。
 * record：放到目标记录所在块的 before / after（块 = 单条未分组记录 / 整个分组）；
 * empty-group：放到另一个空分组的前/后（用于空分组之间排序）；
 * start / end：放到列表最前 / 最后。
 */
export type GroupDropTarget =
  | { kind: "record"; uuid: string; position: "before" | "after" }
  | { kind: "empty-group"; groupId: string; position: "before" | "after" }
  | { kind: "start" }
  | { kind: "end" };

/** 分组拖动结果：记录顺序与分组定义都可能变化 */
export interface GroupMoveResult {
  records: Record[];
  groups: RecordGroup[];
}

/** 分组表头右侧的提示：组内条数 / 空分组 */
export const groupCountText = (count: number): string =>
  count === 0 ? "空分组" : `${count} 条`;

/**
 * @function 新建一个分组
 * @param groups 现有分组（用来生成不重复的默认名称）
 * @param id 分组 id；不传时自动生成
 * @return 新分组（默认展开，位置在列表末尾）
 */
export const createRecordGroup = (
  groups: RecordGroup[],
  id: string = generateUUID(),
): RecordGroup => ({
  id,
  name: nextGroupName(groups),
  collapsed: false,
});

/**
 * @function 生成默认分组名
 * 按"分组 1、分组 2…"顺延，跳过已被占用的名字；用户改名后也不会和旧名字撞车。
 */
export const nextGroupName = (groups: RecordGroup[]): string => {
  const used = new Set(groups.map((group) => group.name.trim()));
  let index = 1;
  while (used.has(`分组 ${index}`)) index += 1;
  return `分组 ${index}`;
};

/**
 * @function 找出一条记录所在"块"的结束下标
 * 分组内记录连续，所以从当前记录一直走到同组最后一条；未分组记录自己就是一块。
 */
export const blockEndIndex = (records: Record[], index: number): number => {
  const groupId = records[index]?.groupId;
  if (!groupId) return index;
  let end = index;
  while (end + 1 < records.length && records[end + 1].groupId === groupId) {
    end += 1;
  }
  return end;
};

/**
 * @function 算出空分组应插入到记录数组的哪个下标
 * 空分组按 anchorUuid 定位；找不到挂靠记录（比如那条记录被删了）就退回列表末尾。
 */
export const emptyGroupInsertIndex = (
  records: Record[],
  group?: RecordGroup | null,
): number => {
  if (!group || group.anchorUuid === undefined) return records.length;
  if (group.anchorUuid === null) return 0;
  const anchorIndex = records.findIndex(
    (record) => record.uuid === group.anchorUuid,
  );
  if (anchorIndex < 0) return records.length;
  return blockEndIndex(records, anchorIndex) + 1;
};

/**
 * @function 把记录展开成列表行
 * 分组表头出现在组内记录之前；空分组按 anchorUuid 插到对应块之后
 * （null = 最前，undefined/挂靠记录不存在 = 末尾）。
 * 折叠的分组只保留表头，组内的记录行不返回（记录仍在 records 数组里，播放顺序不变）。
 * @param records 扁平记录数组（分组成员是连续的一段）
 * @param groups 分组定义（空分组之间的先后顺序即数组顺序）
 * @return 按显示顺序排列的列表行
 */
export const flattenRecordList = (
  records: Record[],
  groups: RecordGroup[],
): RecordListRow[] => {
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const counts = new Map<string, number>();

  records.forEach((record) => {
    if (record.groupId && groupsById.has(record.groupId)) {
      counts.set(record.groupId, (counts.get(record.groupId) ?? 0) + 1);
    }
  });

  const rows: RecordListRow[] = [];
  // 记录 uuid → 它在 rows 里的行号（折叠分组里的记录不在 rows 中）
  const recordRowIndex = new Map<string, number>();
  let openGroupId: string | undefined;

  records.forEach((record, index) => {
    const group = record.groupId ? groupsById.get(record.groupId) : undefined;
    if (!group) {
      // 未分组记录：结束上一个分组的显示块
      openGroupId = undefined;
      recordRowIndex.set(record.uuid, rows.length);
      rows.push({ kind: "record", record, index });
      return;
    }

    if (openGroupId !== group.id) {
      rows.push({
        kind: "group",
        group,
        count: counts.get(group.id) ?? 0,
      });
      openGroupId = group.id;
    }

    if (!group.collapsed) {
      recordRowIndex.set(record.uuid, rows.length);
      rows.push({ kind: "record", record, index, groupId: group.id });
    }
  });

  // 每个分组块在 rows 里的结束位置（= 最后一条可见记录行之后）；
  // 折叠的分组没有子行，结束位置就是表头之后。
  const groupEndRow = new Map<string, number>();
  rows.forEach((row, rowIndex) => {
    if (row.kind !== "group") return;
    const groupId = row.group.id;
    let end = rowIndex + 1;
    while (
      end < rows.length &&
      rows[end].kind === "record" &&
      (rows[end] as RecordRowData).groupId === groupId
    ) {
      end += 1;
    }
    groupEndRow.set(groupId, end);
  });

  // 记录 uuid → 它所在块结束后的行号（空分组的 anchor 用）
  const blockEndRowByUuid = new Map<string, number>();
  records.forEach((record) => {
    if (record.groupId && groupsById.has(record.groupId)) {
      const end = groupEndRow.get(record.groupId);
      if (end !== undefined) blockEndRowByUuid.set(record.uuid, end);
    } else {
      const rowIndex = recordRowIndex.get(record.uuid);
      if (rowIndex !== undefined) {
        blockEndRowByUuid.set(record.uuid, rowIndex + 1);
      }
    }
  });

  // 空分组按位置分组，再按行号插回去（同一位置保持 groups 数组顺序）
  const emptyGroupInsertions = new Map<number, RecordGroup[]>();
  groups.forEach((group) => {
    if (counts.has(group.id)) return;
    let at = rows.length;
    if (group.anchorUuid === null) {
      at = 0;
    } else if (typeof group.anchorUuid === "string") {
      at = blockEndRowByUuid.get(group.anchorUuid) ?? rows.length;
    }
    const list = emptyGroupInsertions.get(at);
    if (list) {
      list.push(group);
    } else {
      emptyGroupInsertions.set(at, [group]);
    }
  });

  if (emptyGroupInsertions.size === 0) return rows;

  const result: RecordListRow[] = [];
  for (let rowIndex = 0; rowIndex <= rows.length; rowIndex += 1) {
    const emptyGroups = emptyGroupInsertions.get(rowIndex);
    if (emptyGroups) {
      emptyGroups.forEach((group) => {
        result.push({ kind: "group", group, count: 0 });
      });
    }
    if (rowIndex < rows.length) {
      result.push(rows[rowIndex]);
    }
  }
  return result;
};

/** 两条记录数组的顺序（按引用与长度）是否完全一致 */
const sameOrder = (left: Record[], right: Record[]): boolean =>
  left.length === right.length &&
  left.every((record, index) => record === right[index]);

/**
 * @function 移动记录（拖动、分组内排序、↑↓ 按钮共用）
 * 先按原顺序取出被拖动的记录，再从剩下的记录里算出插入位置，
 * 插入时统一改成目标位置所在分组的 groupId —— 因此拖动可以同时完成
 * "换分组"和"组内排序"，并且不会出现同一分组被拆成两段的情况。
 *
 * 目标位置是记录时：加入那条记录所在的分组（它未分组 → 一起移出分组）；
 * 目标是分组时：放到组内末尾（空分组则放到它当前显示的位置）；
 * 目标是 end 时：放到列表末尾并移出分组。
 *
 * @param records 当前记录数组
 * @param uuids 被拖动的记录 uuid（可以多条，顺序按它们在数组里的先后）
 * @param target 放置目标
 * @param groups 分组定义（空分组定位需要；可省略）
 * @return 新数组；没有任何变化时返回原数组（避免无意义的重渲染）
 */
export const moveRecords = (
  records: Record[],
  uuids: string[],
  target: MoveTarget,
  groups: RecordGroup[] = [],
): Record[] => {
  const movingIds = new Set(uuids);
  const moving = records.filter((record) => movingIds.has(record.uuid));
  if (moving.length === 0) return records;

  // 拖到自己身上没有意义（落到自己前面/后面都是原地不动）
  if (target.kind === "record" && movingIds.has(target.uuid)) return records;

  const rest = records.filter((record) => !movingIds.has(record.uuid));
  let insertIndex = rest.length;
  let groupId: string | undefined;

  if (target.kind === "start") {
    // 放到列表最前：移出分组，成为第一条未分组记录
    insertIndex = 0;
    groupId = undefined;
  } else if (target.kind === "record") {
    const targetIndex = rest.findIndex((record) => record.uuid === target.uuid);
    if (targetIndex < 0) return records;
    insertIndex = target.position === "before" ? targetIndex : targetIndex + 1;
    groupId = rest[targetIndex].groupId;
  } else if (target.kind === "group") {
    groupId = target.groupId;
    let lastIndex = -1;
    rest.forEach((record, index) => {
      if (record.groupId === groupId) lastIndex = index;
    });
    if (lastIndex >= 0) {
      insertIndex = lastIndex + 1;
    } else {
      // 空分组：插到它当前显示的位置（anchor 指向的记录可能在本次拖动里被移走，
      // 所以先在原数组里算好插入点，再扣掉排在前面的被拖动记录）
      const group = groups.find((item) => item.id === groupId);
      const originalIndex = emptyGroupInsertIndex(records, group);
      const removedBefore = moving.reduce(
        (count, record) =>
          count + (records.indexOf(record) < originalIndex ? 1 : 0),
        0,
      );
      insertIndex = Math.max(0, originalIndex - removedBefore);
    }
  }

  const moved = moving.map((record) =>
    record.groupId === groupId ? record : { ...record, groupId },
  );
  const next = [
    ...rest.slice(0, insertIndex),
    ...moved,
    ...rest.slice(insertIndex),
  ];

  return sameOrder(records, next) ? records : next;
};

/**
 * @function 计算 ↑/↓ 按钮的放置目标
 * 上下移动等于是把当前记录拖到相邻记录的前面（上移）或后面（下移），
 * 跨过分组边界时会自然加入相邻记录所在的分组（或移出分组）。
 * @return 相邻记录不存在时返回 null（已经在列表头/尾）
 */
export const neighborMoveTarget = (
  records: Record[],
  index: number,
  direction: "up" | "down",
): { kind: "record"; uuid: string; position: "before" | "after" } | null => {
  const neighbor = records[direction === "up" ? index - 1 : index + 1];
  if (!neighbor) return null;
  return {
    kind: "record",
    uuid: neighbor.uuid,
    position: direction === "up" ? "before" : "after",
  };
};

/**
 * @function 新记录应插入的位置
 * 当前记录在分组里时，新记录插到组内末尾（分组成员在数组里必须连续）；
 * 未分组时追加到列表末尾（沿用原有行为）。
 * @param records 当前记录数组
 * @param groupId 新记录要加入的分组 id；未分组传 undefined
 * @param groups 分组定义（空分组定位需要；可省略）
 */
export const newRecordInsertIndex = (
  records: Record[],
  groupId?: string,
  groups: RecordGroup[] = [],
): number => {
  if (!groupId) return records.length;
  let lastGroupIndex = -1;
  records.forEach((record, index) => {
    if (record.groupId === groupId) lastGroupIndex = index;
  });
  if (lastGroupIndex >= 0) return lastGroupIndex + 1;
  // 空分组：新记录放到它当前显示的位置
  return emptyGroupInsertIndex(
    records,
    groups.find((group) => group.id === groupId),
  );
};

/**
 * @function 记录增删/移动后同步空分组位置
 * - 分组里还有记录：位置由记录决定，清掉 anchorUuid；
 * - 分组刚刚变空：把 anchorUuid 指到它原来所在块的前一条记录（最前则为 null），
 *   这样分组表头留在原地，不会突然跳到列表末尾；
 * - 一直是空分组：保留用户拖出来的位置。
 */
export const syncGroupAnchors = (
  previousRecords: Record[],
  nextRecords: Record[],
  groups: RecordGroup[],
): RecordGroup[] => {
  let changed = false;

  const nextGroups = groups.map((group) => {
    const hasRecordsNext = nextRecords.some(
      (record) => record.groupId === group.id,
    );
    if (hasRecordsNext) {
      if (group.anchorUuid === undefined) return group;
      changed = true;
      return { ...group, anchorUuid: undefined };
    }

    const firstIndexBefore = previousRecords.findIndex(
      (record) => record.groupId === group.id,
    );
    if (firstIndexBefore < 0) return group; // 一直是空分组，保留现有位置

    const predecessor =
      firstIndexBefore > 0 ? previousRecords[firstIndexBefore - 1] : null;
    changed = true;
    return { ...group, anchorUuid: predecessor ? predecessor.uuid : null };
  });

  return changed ? nextGroups : groups;
};

/** 把分组定义挪到目标分组的前/后（只影响空分组之间的显示顺序） */
const moveGroupDefinition = (
  groups: RecordGroup[],
  movingId: string,
  targetId: string,
  position: "before" | "after",
): RecordGroup[] => {
  if (movingId === targetId) return groups;
  const moving = groups.find((group) => group.id === movingId);
  if (!moving) return groups;

  const withoutMoving = groups.filter((group) => group.id !== movingId);
  const targetIndex = withoutMoving.findIndex((group) => group.id === targetId);
  if (targetIndex < 0) return groups;

  const insertAt = position === "before" ? targetIndex : targetIndex + 1;
  return [
    ...withoutMoving.slice(0, insertAt),
    moving,
    ...withoutMoving.slice(insertAt),
  ];
};

/**
 * @function 拖动整个分组（分组表头拖拽）
 * 有记录的分组：把组内记录作为一整块移到目标位置（分组表头随之移动），
 * 播放顺序也一起变化；空分组：只更新 anchorUuid，让它能停在任意内容之间。
 *
 * @param records 当前记录数组
 * @param groups 分组定义
 * @param groupId 被拖动的分组 id
 * @param target 放置目标（由 UI 按"块"计算好）
 * @return 新的记录数组与分组定义
 */
export const moveGroup = (
  records: Record[],
  groups: RecordGroup[],
  groupId: string,
  target: GroupDropTarget,
): GroupMoveResult => {
  const group = groups.find((item) => item.id === groupId);
  if (!group) return { records, groups };

  // 拖到自身没有意义
  if (target.kind === "empty-group" && target.groupId === groupId) {
    return { records, groups };
  }

  const movingRecords = records.filter((record) => record.groupId === groupId);
  if (target.kind === "record") {
    const targetRecord = records.find((record) => record.uuid === target.uuid);
    // 目标就在自己的块内 → 原地不动
    if (targetRecord?.groupId === groupId) return { records, groups };
  }

  const rest = records.filter((record) => record.groupId !== groupId);
  let insertIndex = rest.length;
  let anchorUuid: string | null | undefined = undefined;

  if (target.kind === "start") {
    // 分组整体放到列表最前；空分组锚到最前
    insertIndex = 0;
    anchorUuid = null;
  } else if (target.kind === "record") {
    const targetIndex = rest.findIndex((record) => record.uuid === target.uuid);
    if (targetIndex < 0) return { records, groups };
    insertIndex = target.position === "before" ? targetIndex : targetIndex + 1;
    anchorUuid = insertIndex === 0 ? null : rest[insertIndex - 1].uuid;
  } else if (target.kind === "empty-group") {
    const targetGroup = groups.find((item) => item.id === target.groupId);
    if (!targetGroup) return { records, groups };
    // 空分组：放到它当前显示的位置（前后对记录来说同一个插入点）
    insertIndex = emptyGroupInsertIndex(rest, targetGroup);
    anchorUuid = targetGroup.anchorUuid;
  }

  const nextRecords =
    movingRecords.length > 0
      ? [
          ...rest.slice(0, insertIndex),
          ...movingRecords,
          ...rest.slice(insertIndex),
        ]
      : records;

  let nextGroups = groups.map((item) => {
    if (item.id !== groupId) return item;
    if (movingRecords.length > 0) {
      return item.anchorUuid === undefined
        ? item
        : { ...item, anchorUuid: undefined };
    }
    return item.anchorUuid === anchorUuid
      ? item
      : { ...item, anchorUuid };
  });

  // 目标是另一个空分组：调整定义顺序表达"前/后"。
  // 空分组总是渲染在记录块之后，所以"放到空分组前面"要把空分组的 anchor
  // 挪到移动块末尾，它才会显示在刚放下的分组之后（视觉上就是分组在它前面）。
  if (target.kind === "empty-group") {
    nextGroups = moveGroupDefinition(
      nextGroups,
      groupId,
      target.groupId,
      target.position,
    );
    if (movingRecords.length > 0) {
      const targetGroup = groups.find((item) => item.id === target.groupId);
      if (target.position === "before") {
        const lastMoved = nextRecords[insertIndex + movingRecords.length - 1];
        if (lastMoved) {
          nextGroups = nextGroups.map((item) =>
            item.id === target.groupId
              ? { ...item, anchorUuid: lastMoved.uuid }
              : item,
          );
        }
      } else if (targetGroup?.anchorUuid === undefined) {
        // 末尾的空分组（anchor 未设置）默认会永远跟在所有记录之后；
        // 想放到它后面时，把它的 anchor 固定到插入点之前的记录上，
        // 这样它会显示在刚放下的分组前面。
        const beforeInsert = insertIndex > 0 ? rest[insertIndex - 1] : null;
        nextGroups = nextGroups.map((item) =>
          item.id === target.groupId
            ? { ...item, anchorUuid: beforeInsert ? beforeInsert.uuid : null }
            : item,
        );
      }
    }
  }

  return { records: nextRecords, groups: nextGroups };
};

/**
 * @function 从磁盘数据里还原分组定义
 * 兼容两种写法：记录上带 group 快照（当前格式），或只有 groupId（旧/手工文件）。
 * 名称缺失时按"分组 N"补一个，保证分组始终有可显示的名字。
 * @param rawRecords 工程文件或后端返回的原始记录数组
 */
export const readGroups = (rawRecords: readonly any[]): RecordGroup[] => {
  const groups: RecordGroup[] = [];
  const byId = new Map<string, RecordGroup>();

  const ensure = (id: string, name: unknown, collapsed: unknown): void => {
    if (byId.has(id)) return;
    const trimmed = typeof name === "string" ? name.trim() : "";
    const group: RecordGroup = {
      id,
      name: trimmed || `分组 ${groups.length + 1}`,
      collapsed: collapsed === true,
    };
    groups.push(group);
    byId.set(id, group);
  };

  rawRecords.forEach((raw) => {
    if (!raw || typeof raw !== "object") return;
    const stamp =
      raw.group && typeof raw.group === "object" ? (raw.group as any) : null;
    const rawId =
      stamp && typeof stamp.id === "string" && stamp.id
        ? stamp.id
        : typeof raw.groupId === "string" && raw.groupId
          ? raw.groupId
          : "";
    if (!rawId) return;
    ensure(rawId, stamp?.name, stamp?.collapsed);
  });

  return groups;
};

/**
 * @function 丢掉找不到分组定义的 groupId
 * 工程文件被手工编辑、或分组定义缺失时，记录不应继续挂在不存在分组上
 * （否则看起来"未分组"但保存/移动时行为又不一样）。
 */
export const keepKnownGroups = (
  records: Record[],
  groups: RecordGroup[],
): Record[] => {
  const ids = new Set(groups.map((group) => group.id));
  return records.map((record) => {
    if (!record.groupId || ids.has(record.groupId)) return record;
    const rest = { ...record };
    delete rest.groupId;
    return rest;
  });
};

/**
 * @function 给记录写入分组快照（保存工程前调用）
 * 工程文件仍是"记录数组"，所以每条带分组的记录都带上 { id, name, collapsed }；
 * 未分组记录会去掉 groupId，避免文件里残留无效引用。
 */
export const stampGroups = (
  records: Record[],
  groups: RecordGroup[],
): Record[] => {
  const byId = new Map(groups.map((group) => [group.id, group]));

  return records.map((record) => {
    const group = record.groupId ? byId.get(record.groupId) : undefined;
    if (!group) {
      const rest = { ...record };
      delete rest.group;
      delete rest.groupId;
      return rest;
    }
    return {
      ...record,
      groupId: group.id,
      group: { id: group.id, name: group.name, collapsed: group.collapsed },
    };
  });
};
