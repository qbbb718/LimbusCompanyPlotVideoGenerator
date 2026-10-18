import React, { useEffect, useMemo, useRef, useState } from "react";
import { Record } from "@types";
import "./RecordEditor.css";
import {
  flattenRecordList,
  GroupDropTarget,
  groupCountText,
  MoveTarget,
  RecordGroup,
} from "./recordGroups";

interface RecordListProps {
  records: Record[];
  /** 分组定义（名称、折叠状态）；成员关系在 record.groupId 上 */
  groups: RecordGroup[];
  selectedRecordIndex: number;
  setSelectedRecordIndex: (index: number) => void;
  createNewRecord: () => void;
  /** 新建分组：返回新分组，列表拿到后立刻进入重命名状态 */
  onCreateGroup: () => RecordGroup;
  onRenameGroup: (groupId: string, name: string) => void;
  onToggleGroup: (groupId: string) => void;
  /** 解散分组（组内记录保留，变为未分组） */
  onDissolveGroup: (groupId: string) => void;
  /** 拖动记录：可一次拖多条；目标含义见 recordGroups.MoveTarget */
  onMoveRecords: (uuids: string[], target: MoveTarget) => void;
  /** 拖动整个分组（分组表头拖拽）；目标含义见 recordGroups.GroupDropTarget */
  onMoveGroup: (groupId: string, target: GroupDropTarget) => void;
  generateVideo: (layerTypes: string[], keepTempFiles: boolean) => void;
  moveRecord: (index: number, direction: "up" | "down") => void;
  duplicateRecord: (index: number) => void;
  deleteRecord: (index: number) => void;
  /** 保存工程（与 Ctrl+S 相同：已关联文件则更新，否则先选保存位置） */
  onSaveProject: () => void;
  /** 导入工程：从工程文件载入记录 */
  onImportProject: (file?: File) => void;
  /** 当前工程已关联的文件名；未保存到文件时为 null */
  projectFileName?: string | null;
  isGenerating?: boolean;
}

/** 视频分层导出选项 */
const LAYER_OPTIONS = [
  { key: "FULL", label: "导出完整视频" },
  { key: "UI_ONLY", label: "导出仅UI(含文本)视频" },
  { key: "BG_CHARACTERS", label: "导出背景与立绘视频" },
  { key: "BACKGROUND_ONLY", label: "导出仅背景视频" },
  { key: "CHARACTERS_ONLY", label: "导出仅立绘视频" },
];

/** 拖动期间加在 <body> 上的 class：让全局浮层（工程提示条等）不拦截拖放 */
const DRAG_BODY_CLASS = "record-list-dragging";

/** 列表里一个"块"的边界：未分组记录自己一块；分组表头 + 组内记录是一块 */interface RowBlockInfo {
  startRow: number;
  endRow: number;
  /** 块内第一条记录的 uuid（空分组没有） */
  firstUuid?: string;
  /** 块内最后一条记录的 uuid（空分组没有） */
  lastUuid?: string;
  groupId?: string;
  isEmptyGroup: boolean;
}

/** 分组拖动时的高亮位置：线画在块的开始/结束行 */
interface GroupDropHint {
  startRow: number;
  endRow: number;
  position: "before" | "after";
}

const RecordList: React.FC<RecordListProps> = ({
  records,
  groups,
  selectedRecordIndex,
  setSelectedRecordIndex,
  createNewRecord,
  onCreateGroup,
  onRenameGroup,
  onToggleGroup,
  onDissolveGroup,
  onMoveRecords,
  onMoveGroup,
  generateVideo,
  moveRecord,
  duplicateRecord,
  deleteRecord,
  onSaveProject,
  onImportProject,
  projectFileName,
  isGenerating,
}) => {
  const [showLayerPopup, setShowLayerPopup] = useState(false);
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(
    new Set(["FULL"]),
  );
  const [keepTempFiles, setKeepTempFiles] = useState(false);

  // 分组重命名（行内输入框）：同一时刻只编辑一个分组
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  // 同步记录"正在编辑的分组"：回车提交后输入框卸载时可能还会触发一次 blur，
  // 用 ref 判断，避免同一个分组被提交两次
  const editingGroupIdRef = useRef<string | null>(null);

  // 多选：按住 Ctrl 追加、Shift 连选，选中的记录可以一起拖进分组
  const [selectedUuids, setSelectedUuids] = useState<string[]>([]);
  const [anchorUuid, setAnchorUuid] = useState<string | null>(null);

  // 拖动状态：ref 供 dragstart/drop 同步读取（state 更新是异步的）
  const [dragging, setDragging] = useState(false);
  const [draggingUuids, setDraggingUuids] = useState<string[]>([]);
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<MoveTarget | null>(null);
  const [groupDrop, setGroupDrop] = useState<GroupDropHint | null>(null);
  const [groupDropEnd, setGroupDropEnd] = useState(false);
  const [groupDropStart, setGroupDropStart] = useState(false);
  const draggedUuidsRef = useRef<string[]>([]);
  const draggedGroupIdRef = useRef<string | null>(null);

  /**
   * 顶部/末尾的放置区（"拖到这里…"两行）是否可以渲染。
   * 不能在 dragstart 的同一轮渲染里插入这两行：它们位于拖动源上方，而 Chromium 发现
   * dragstart 期间拖动源上方多出节点会**直接取消整个拖拽**（dragstart 之后立刻 dragend，
   * 后续 dragover/drop 都不再触发，表现为"拖不动"）。
   * 所以等 dragstart 这一轮事件处理结束（定时器下一轮）再让它们出现。
   */
  const [dropZonesReady, setDropZonesReady] = useState(false);
  const dropZoneTimerRef = useRef<number | null>(null);

  const dragActive = dragging || draggingGroupId !== null;
  const showDropZones = dragActive && dropZonesReady;

  const rows = useMemo(
    () => flattenRecordList(records, groups),
    [records, groups],
  );

  /**
   * 行号 → 块信息：分组表头和它的记录行指向同一个块。
   * 分组拖动时按"块"插入，不会把别的分组的记录拆开；
   * 折叠的分组也能拿到 first/last uuid（从 records 里查，不依赖可见行）。
   */
  const blockByRow = useMemo(() => {
    const map = new Map<number, RowBlockInfo>();
    let rowIndex = 0;

    while (rowIndex < rows.length) {
      const row = rows[rowIndex];
      if (row.kind === "group") {
        const groupId = row.group.id;
        let end = rowIndex + 1;
        while (end < rows.length) {
          const next = rows[end];
          if (next.kind !== "record" || next.groupId !== groupId) break;
          end += 1;
        }

        const groupRecords = records.filter(
          (record) => record.groupId === groupId,
        );
        const block: RowBlockInfo = {
          startRow: rowIndex,
          endRow: end - 1,
          groupId,
          firstUuid: groupRecords[0]?.uuid,
          lastUuid: groupRecords[groupRecords.length - 1]?.uuid,
          isEmptyGroup: groupRecords.length === 0,
        };
        for (let index = rowIndex; index < end; index += 1) {
          map.set(index, block);
        }
        rowIndex = end;
        continue;
      }

      map.set(rowIndex, {
        startRow: rowIndex,
        endRow: rowIndex,
        firstUuid: row.record.uuid,
        lastUuid: row.record.uuid,
        isEmptyGroup: false,
      });
      rowIndex += 1;
    }

    return map;
  }, [rows, records]);

  // 外部切换当前记录（点时间轴、导入工程…）时，让列表的多选跟随它
  const selectedUuid = records[selectedRecordIndex]?.uuid;
  useEffect(() => {
    if (!selectedUuid) return;
    setSelectedUuids((prev) =>
      prev.includes(selectedUuid) ? prev : [selectedUuid],
    );
  }, [selectedUuid]);

  // 记录被删除/替换后，把已经不存在的 uuid 从选择里清掉
  useEffect(() => {
    const valid = new Set(records.map((record) => record.uuid));
    setSelectedUuids((prev) => {
      const next = prev.filter((uuid) => valid.has(uuid));
      return next.length === prev.length ? prev : next;
    });
  }, [records]);

  // 组件卸载（比如拖动中切换页面）时清掉"延迟显示放置区"的定时器与 body 标记
  useEffect(
    () => () => {
      if (dropZoneTimerRef.current !== null) {
        window.clearTimeout(dropZoneTimerRef.current);
        dropZoneTimerRef.current = null;
      }
      document.body.classList.remove(DRAG_BODY_CLASS);
    },
    [],
  );

  const toggleLayer = (key: string) => {
    setSelectedLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleGenerateClick = () => {
    setShowLayerPopup(true);
  };

  const handleConfirmExport = () => {
    if (selectedLayers.size === 0) {
      alert("请至少选择一个导出分层");
      return;
    }
    setShowLayerPopup(false);
    generateVideo(Array.from(selectedLayers), keepTempFiles);
  };

  const handleCancelExport = () => {
    setShowLayerPopup(false);
  };

  /**
   * @function 选择工程文件后交给上层导入
   * 取到 File 后立即清空 input 的值，这样同一个文件可以再次选择（否则 onChange 不触发）。
   */
  const handleImportChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      onImportProject(file);
    }
  };

  const saveHint = projectFileName
    ? `保存工程（Ctrl+S 更新 ${projectFileName}）`
    : "保存工程（Ctrl+S 首次保存会先让选择保存位置与名称）";

  // ===== 分组：新建 / 重命名 / 折叠 =====

  const handleCreateGroup = () => {
    const group = onCreateGroup();
    // 新建后直接进入重命名状态，默认名已选中，输入即覆盖
    editingGroupIdRef.current = group.id;
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  };

  const beginRenameGroup = (group: RecordGroup) => {
    editingGroupIdRef.current = group.id;
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  };

  const cancelRenameGroup = () => {
    editingGroupIdRef.current = null;
    setEditingGroupId(null);
  };

  const commitGroupName = (group: RecordGroup) => {
    if (editingGroupIdRef.current !== group.id) return;
    editingGroupIdRef.current = null;
    const trimmed = editingGroupName.trim();
    if (trimmed && trimmed !== group.name) {
      onRenameGroup(group.id, trimmed);
    }
    setEditingGroupId(null);
  };

  // ===== 点选：单击选中、Ctrl 追加、Shift 连选 =====

  const handleRecordClick = (
    event: React.MouseEvent,
    record: Record,
    index: number,
  ) => {
    if (event.shiftKey) {
      // 锚点不在当前选择里（比如刚点过时间轴）时，从当前记录开始连选
      const anchorIndex =
        anchorUuid && selectedUuids.includes(anchorUuid)
          ? records.findIndex((item) => item.uuid === anchorUuid)
          : selectedRecordIndex;
      if (anchorIndex >= 0) {
        const from = Math.min(anchorIndex, index);
        const to = Math.max(anchorIndex, index);
        setSelectedUuids(records.slice(from, to + 1).map((item) => item.uuid));
        setSelectedRecordIndex(index);
        return;
      }
    }

    if (event.ctrlKey || event.metaKey) {
      setSelectedUuids((prev) =>
        prev.includes(record.uuid) ? prev : [...prev, record.uuid],
      );
      setAnchorUuid(record.uuid);
      setSelectedRecordIndex(index);
      return;
    }

    setSelectedUuids([record.uuid]);
    setAnchorUuid(record.uuid);
    setSelectedRecordIndex(index);
  };

  // ===== 拖动 =====

  /**
   * @function 等 dragstart 结束后再显示放置区
   * 拖动开始的那一轮事件处理里只改 class（不改结构），避免浏览器取消拖拽；
   * 定时器下一轮再把"拖到这里…"两行插进列表。
   */
  const scheduleDropZones = () => {
    if (dropZoneTimerRef.current !== null) return;
    // 拖拽期间给 body 加标记：全局提示条（工程保存/导入提示）会浮在列表下沿，
    // 加上这个标记后它不再接收鼠标事件，避免挡住底部放置区（见 RecordEditor.css）
    document.body.classList.add(DRAG_BODY_CLASS);
    dropZoneTimerRef.current = window.setTimeout(() => {
      dropZoneTimerRef.current = null;
      setDropZonesReady(true);
    }, 0);
  };

  const resetDrag = () => {
    if (dropZoneTimerRef.current !== null) {
      window.clearTimeout(dropZoneTimerRef.current);
      dropZoneTimerRef.current = null;
    }
    // 拖拽期间给 body 加标记：让全局提示条等浮层不拦截拖放（见 RecordEditor.css）
    document.body.classList.remove(DRAG_BODY_CLASS);
    setDropZonesReady(false);
    draggedUuidsRef.current = [];
    draggedGroupIdRef.current = null;
    setDragging(false);
    setDraggingUuids([]);
    setDraggingGroupId(null);
    setDropTarget(null);
    setGroupDrop(null);
    setGroupDropEnd(false);
    setGroupDropStart(false);
  };

  /** 指针在行的上半 → 插到前面；下半 → 插到后面 */
  const dropPositionOf = (
    event: React.DragEvent<HTMLElement>,
  ): "before" | "after" => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY - rect.top > rect.height / 2 ? "after" : "before";
  };

  // --- 拖动记录 ---

  const handleRecordDragStart = (
    event: React.DragEvent<HTMLTableRowElement>,
    record: Record,
  ) => {
    // 拖的行在多选里 → 一起拖；否则只拖这一行
    const movingUuids = selectedUuids.includes(record.uuid)
      ? selectedUuids
      : [record.uuid];
    const orderedUuids = records
      .filter((item) => movingUuids.includes(item.uuid))
      .map((item) => item.uuid);

    draggedUuidsRef.current = orderedUuids;
    setDragging(true);
    setDraggingUuids(orderedUuids);
    setGroupDrop(null);
    setGroupDropEnd(false);
    setGroupDropStart(false);
    // 放置区延后一轮渲染（见 scheduleDropZones：同步插入会取消拖拽）
    scheduleDropZones();
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", orderedUuids.join(","));
    }
  };

  const handleRecordDragOver = (
    event: React.DragEvent<HTMLTableRowElement>,
    record: Record,
  ) => {
    if (draggedUuidsRef.current.length === 0) return;
    // 拖到自己身上不显示插入线，也不允许放下
    if (draggedUuidsRef.current.includes(record.uuid)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    setGroupDropStart(false);
    setDropTarget({
      kind: "record",
      uuid: record.uuid,
      position: dropPositionOf(event),
    });
  };

  const handleRecordDrop = (
    event: React.DragEvent<HTMLTableRowElement>,
    record: Record,
  ) => {
    event.preventDefault();
    const movingUuids = draggedUuidsRef.current;
    if (movingUuids.length > 0 && !movingUuids.includes(record.uuid)) {
      onMoveRecords(movingUuids, {
        kind: "record",
        uuid: record.uuid,
        position: dropPositionOf(event),
      });
    }
    resetDrag();
  };

  /** 记录拖到分组表头：加入这个分组 */
  const handleDropIntoGroup = (
    event: React.DragEvent<HTMLTableRowElement>,
    group: RecordGroup,
  ) => {
    if (draggedUuidsRef.current.length === 0) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    setDropTarget({ kind: "group", groupId: group.id });
  };

  const handleDropRecordsIntoGroup = (
    event: React.DragEvent<HTMLTableRowElement>,
    group: RecordGroup,
  ) => {
    event.preventDefault();
    const movingUuids = draggedUuidsRef.current;
    if (movingUuids.length > 0) {
      onMoveRecords(movingUuids, { kind: "group", groupId: group.id });
    }
    resetDrag();
  };

  // --- 列表上/下边缘的放置区（放到最前 / 最后，并移出分组） ---

  /** 拖过放置区：记录与分组都允许放下，并高亮对应的放置区 */
  const handleDropZoneDragOver = (
    event: React.DragEvent<HTMLDivElement>,
    kind: "start" | "end",
  ) => {
    if (draggedGroupIdRef.current) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      setDropTarget(null);
      setGroupDrop(null);
      setGroupDropStart(kind === "start");
      setGroupDropEnd(kind === "end");
      return;
    }
    if (draggedUuidsRef.current.length === 0) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    setDropTarget({ kind });
    setGroupDropStart(false);
    setGroupDropEnd(false);
  };

  /** 放到放置区：记录批量移动，分组则整组移动（两种都是移出分组 + 放到最前/最后） */
  const handleDropZoneDrop = (
    event: React.DragEvent<HTMLDivElement>,
    kind: "start" | "end",
  ) => {
    event.preventDefault();
    const movingGroupId = draggedGroupIdRef.current;
    if (movingGroupId) {
      onMoveGroup(movingGroupId, { kind });
    } else {
      const movingUuids = draggedUuidsRef.current;
      if (movingUuids.length > 0) {
        onMoveRecords(movingUuids, { kind });
      }
    }
    resetDrag();
  };

  // --- 拖动分组 ---

  const handleGroupDragStart = (
    event: React.DragEvent<HTMLTableRowElement>,
    group: RecordGroup,
  ) => {
    if (editingGroupIdRef.current === group.id) {
      event.preventDefault();
      return;
    }
    draggedGroupIdRef.current = group.id;
    setDraggingGroupId(group.id);
    setDropTarget(null);
    setGroupDropEnd(false);
    setGroupDropStart(false);
    // 与拖动记录相同：分组表头也在源行上方，放置区必须延后渲染
    scheduleDropZones();
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", `group:${group.id}`);
    }
  };

  /**
   * 分组拖动落到某一行时，换算成"块级"放置目标：
   * 目标行的上半 → 插到这个块前面；下半 → 插到这个块后面。
   * 空分组块 → 直接放到这个空分组的前/后。
   */
  const groupTargetAtRow = (
    event: React.DragEvent<HTMLElement>,
    rowIndex: number,
  ): { target: GroupDropTarget; hint: GroupDropHint } | null => {
    const sourceGroupId = draggedGroupIdRef.current;
    if (!sourceGroupId) return null;

    const block = blockByRow.get(rowIndex);
    if (!block || block.groupId === sourceGroupId) return null;

    const position = dropPositionOf(event);
    const hint: GroupDropHint = {
      startRow: block.startRow,
      endRow: block.endRow,
      position,
    };

    if (block.isEmptyGroup && block.groupId) {
      return {
        target: {
          kind: "empty-group",
          groupId: block.groupId,
          position,
        },
        hint,
      };
    }

    const uuid =
      position === "before" ? block.firstUuid : block.lastUuid;
    if (!uuid) return null;
    return { target: { kind: "record", uuid, position }, hint };
  };

  const handleGroupDragOverRow = (
    event: React.DragEvent<HTMLTableRowElement>,
    rowIndex: number,
  ) => {
    const result = groupTargetAtRow(event, rowIndex);
    if (!result) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    setGroupDrop(result.hint);
    setGroupDropEnd(false);
    setGroupDropStart(false);
  };

  const handleGroupDropRow = (
    event: React.DragEvent<HTMLTableRowElement>,
    rowIndex: number,
  ) => {
    event.preventDefault();
    const sourceGroupId = draggedGroupIdRef.current;
    const result = groupTargetAtRow(event, rowIndex);
    if (sourceGroupId && result) {
      onMoveGroup(sourceGroupId, result.target);
    }
    resetDrag();
  };

  /**
   * 拖出整个列表区域时清掉插入线/放置区高亮。
   * 监听挂在包含滚动容器和上/下放置区的 .record-list-body 上：
   * 从表格移到边缘放置区仍属于"在列表里"，不能当成离开，否则放置区高亮会被清掉。
   * 另外浏览器从行内移到绝对定位的放置区时，dragleave 的 relatedTarget 可能是 null，
   * 所以再用指针位置确认一次。
   */
  const handleListDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    const related = event.relatedTarget as Node | null;
    if (related && event.currentTarget.contains(related)) return;
    const underPointer =
      typeof document.elementFromPoint === "function"
        ? document.elementFromPoint(event.clientX, event.clientY)
        : null;
    if (underPointer && event.currentTarget.contains(underPointer)) return;
    setDropTarget(null);
    setGroupDrop(null);
    setGroupDropEnd(false);
    setGroupDropStart(false);
  };

  return (
    <div className="record-list-container">
      {/* 分层导出弹窗 */}
      {showLayerPopup && (
        <div className="layer-popup-overlay" onClick={handleCancelExport}>
          <div className="layer-popup" onClick={(e) => e.stopPropagation()}>
            <h4>选择导出视频分层</h4>
            <div className="layer-popup-options">
              {LAYER_OPTIONS.map((opt) => (
                <label key={opt.key} className="layer-popup-option">
                  <input
                    type="checkbox"
                    checked={selectedLayers.has(opt.key)}
                    onChange={() => toggleLayer(opt.key)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <div className="layer-popup-divider" />
            <div className="layer-popup-options">
              <label className="layer-popup-option">
                <input
                  type="checkbox"
                  checked={keepTempFiles}
                  onChange={(e) => setKeepTempFiles(e.target.checked)}
                />
                保留中间文件，下次导出更快
              </label>
            </div>
            <div className="layer-popup-actions">
              <button onClick={handleCancelExport}>取消</button>
              <button onClick={handleConfirmExport} className="primary-btn">
                确认导出
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="record-list-header">
        {/* 标题与"添加记录 / 添加分组"按钮放在一起：都是列表自身的操作，靠左更顺手 */}
        <div className="record-list-title">
          <h3 title="点击选中；Ctrl / Shift 多选；拖动手柄（⠿）可调整顺序或拖进分组">
            剧情列表
          </h3>
          <button
            className="add-record-btn"
            onClick={createNewRecord}
            title="添加记录"
            aria-label="添加记录"
          >
            +
          </button>
          <button
            className="add-group-btn"
            onClick={handleCreateGroup}
            title="新建分组（像图层文件夹一样，把记录拖进分组）"
            aria-label="新建分组"
          >
            📁+
          </button>
        </div>
        <div className="record-list-actions">
          <label
            className="plain-button"
            title="从工程文件载入记录（导入后 Ctrl+S 可直接更新该文件）"
          >
            导入工程
            <input
              type="file"
              accept=".json"
              onChange={handleImportChange}
              style={{ display: "none" }}
            />
          </label>

          <button
            className="plain-button"
            onClick={onSaveProject}
            title={saveHint}
          >
            保存工程
          </button>

          <button
            className="import-button"
            onClick={handleGenerateClick}
            disabled={isGenerating}
          >
            {isGenerating ? "导出中..." : "导出视频"}
          </button>
        </div>
      </div>

      <div className="record-list-body" onDragLeave={handleListDragLeave}>
        {/* 拖动时浮在列表上边缘的放置区：把记录/分组放到最前面。
            这两个放置区放在滚动容器外面（绝对定位贴在列表上/下边缘），原因有两个：
            1. 长剧情滚动到中间时，表格里的行会滚出可视区，放在表格里的放置区就"看不见也够不着"；
            2. 绝对定位不参与表格布局，拖动源不会因为它的出现而移动（移动拖动源会取消拖拽）。
            仍然用 showDropZones 延后一轮渲染，见 scheduleDropZones。 */}
        {showDropZones && (
          <div
            className={`record-list-drop-zone record-list-drop-start ${
              dropTarget?.kind === "start" || groupDropStart ? "drop-active" : ""
            }`}
            onDragOver={(e) => handleDropZoneDragOver(e, "start")}
            onDrop={(e) => handleDropZoneDrop(e, "start")}
          >
            {draggingGroupId
              ? "拖到这里：把分组放到列表最前面"
              : "拖到这里：放到列表最前面（移出分组）"}
          </div>
        )}

        <div className="record-list">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>说话人</th>
                <th>对话内容</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
              const block = blockByRow.get(rowIndex);
              const groupDropBefore =
                groupDrop !== null &&
                block !== undefined &&
                groupDrop.position === "before" &&
                groupDrop.startRow === block.startRow;
              const groupDropAfter =
                groupDrop !== null &&
                block !== undefined &&
                groupDrop.position === "after" &&
                groupDrop.endRow === block.endRow;
              const isGroupDropBlock =
                groupDrop !== null &&
                block !== undefined &&
                groupDrop.startRow === block.startRow;

              if (row.kind === "group") {
                const { group, count } = row;
                const isRecordDropInto =
                  dropTarget?.kind === "group" &&
                  dropTarget.groupId === group.id;

                return (
                  <tr
                    key={`group-${group.id}-${rowIndex}`}
                    className={[
                      "record-group-row",
                      isRecordDropInto ? "drop-into" : "",
                      isGroupDropBlock ? "group-drop-block" : "",
                      groupDropBefore ? "drop-before" : "",
                      groupDropAfter ? "drop-after" : "",
                      draggingGroupId === group.id ? "drag-source" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    data-group-id={group.id}
                    draggable
                    onDragStart={(e) => {
                      const target = e.target as HTMLElement;
                      // 按钮/重命名输入框不参与拖动，避免误触分组排序
                      if (target.closest("button, input")) {
                        e.preventDefault();
                        return;
                      }
                      handleGroupDragStart(e, group);
                    }}
                    onDragEnd={resetDrag}
                    onDragOver={(e) => {
                      if (draggedGroupIdRef.current) {
                        handleGroupDragOverRow(e, rowIndex);
                      } else {
                        handleDropIntoGroup(e, group);
                      }
                    }}
                    onDrop={(e) => {
                      if (draggedGroupIdRef.current) {
                        handleGroupDropRow(e, rowIndex);
                      } else {
                        handleDropRecordsIntoGroup(e, group);
                      }
                    }}
                  >
                    <td colSpan={4}>
                      <div className="record-group-header">
                        <span
                          className="group-drag-handle"
                          title="拖动分组表头可调整分组顺序"
                          aria-hidden="true"
                        >
                          ⠿
                        </span>
                        <button
                          className={`group-collapse-btn ${
                            group.collapsed ? "collapsed" : ""
                          }`}
                          onClick={() => onToggleGroup(group.id)}
                          aria-expanded={!group.collapsed}
                          aria-label={
                            group.collapsed
                              ? `展开分组 ${group.name}`
                              : `折叠分组 ${group.name}`
                          }
                          title={group.collapsed ? "展开分组" : "折叠分组"}
                        />
                        <span className="group-folder-icon">📁</span>
                        {editingGroupId === group.id ? (
                          <input
                            className="group-name-input"
                            aria-label="分组名称"
                            value={editingGroupName}
                            autoFocus
                            onChange={(e) =>
                              setEditingGroupName(e.target.value)
                            }
                            onFocus={(e) => e.currentTarget.select()}
                            onBlur={() => commitGroupName(group)}
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitGroupName(group);
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                cancelRenameGroup();
                              }
                            }}
                          />
                        ) : (
                          <span
                            className="group-name"
                            title="双击重命名分组；拖动表头可排序"
                            onDoubleClick={() => beginRenameGroup(group)}
                          >
                            {group.name}
                          </span>
                        )}
                        <span className="group-count">
                          {groupCountText(count)}
                        </span>
                        <div className="record-group-actions">
                          <button
                            onClick={() => beginRenameGroup(group)}
                            aria-label={`重命名分组 ${group.name}`}
                            title="重命名分组（也可以双击名称）"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => onDissolveGroup(group.id)}
                            aria-label={`解散分组 ${group.name}`}
                            title="解散分组（组内记录保留）"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              }

              const { record, index, groupId } = row;
              const isSelected = index === selectedRecordIndex;
              const isMultiSelected = selectedUuids.includes(record.uuid);
              const isDragSource =
                draggingUuids.includes(record.uuid) ||
                (draggingGroupId !== null && groupId === draggingGroupId);
              const isDropBefore =
                dropTarget?.kind === "record" &&
                dropTarget.uuid === record.uuid &&
                dropTarget.position === "before";
              const isDropAfter =
                dropTarget?.kind === "record" &&
                dropTarget.uuid === record.uuid &&
                dropTarget.position === "after";

              return (
                <tr
                  key={record.uuid}
                  className={[
                    isSelected ? "selected" : "",
                    isMultiSelected ? "multi-selected" : "",
                    groupId ? "record-in-group" : "",
                    isDragSource ? "drag-source" : "",
                    isGroupDropBlock ? "group-drop-block" : "",
                    isDropBefore ? "drop-before" : "",
                    isDropAfter ? "drop-after" : "",
                    groupDropBefore ? "drop-before" : "",
                    groupDropAfter ? "drop-after" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  draggable
                  onDragStart={(e) => {
                    // 从操作按钮起拖不当作排序，避免点按钮时误触发拖动
                    const target = e.target as HTMLElement;
                    if (target.closest("button")) {
                      e.preventDefault();
                      return;
                    }
                    handleRecordDragStart(e, record);
                  }}
                  onDragEnd={resetDrag}
                  onDragOver={(e) => {
                    if (draggedGroupIdRef.current) {
                      handleGroupDragOverRow(e, rowIndex);
                    } else {
                      handleRecordDragOver(e, record);
                    }
                  }}
                  onDrop={(e) => {
                    if (draggedGroupIdRef.current) {
                      handleGroupDropRow(e, rowIndex);
                    } else {
                      handleRecordDrop(e, record);
                    }
                  }}
                  onClick={(e) => handleRecordClick(e, record, index)}
                  title="拖动左侧 ⠿ 可调整顺序或拖进分组"
                >
                  <td>
                    <span
                      className="row-drag-handle"
                      aria-hidden="true"
                      title="拖动调整顺序"
                    >
                      ⠿
                    </span>
                    <span className="row-index">{index + 1}</span>
                    {isSelected ? (
                      <span className="selected-dot" aria-hidden="true" />
                    ) : isMultiSelected ? (
                      <span
                        className="multi-selected-dot"
                        aria-hidden="true"
                      />
                    ) : null}
                  </td>
                  <td>
                    {record.dialogue.freeText
                      ? "自由文本"
                      : record.dialogue.speakerName || "旁白"}
                  </td>
                  <td>
                    {record.dialogue.text.substring(0, 30) +
                      (record.dialogue.text.length > 30 ? "..." : "")}
                  </td>
                  <td>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveRecord(index, "up");
                      }}
                      disabled={index === 0}
                      title="上移（跨过分组边界会加入相邻记录的分组）"
                    >
                      ↑
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveRecord(index, "down");
                      }}
                      disabled={index === records.length - 1}
                      title="下移（跨过分组边界会加入相邻记录的分组）"
                    >
                      ↓
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateRecord(index);
                      }}
                    >
                      复制
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteRecord(index);
                      }}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
        </div>

        {/* 拖动时浮在列表下边缘的放置区：移出分组 / 把分组放到最后（同样延后渲染） */}
        {showDropZones && (
          <div
            className={`record-list-drop-zone record-list-drop-end ${
              dropTarget?.kind === "end" || groupDropEnd ? "drop-active" : ""
            }`}
            onDragOver={(e) => handleDropZoneDragOver(e, "end")}
            onDrop={(e) => handleDropZoneDrop(e, "end")}
          >
            {draggingGroupId
              ? "拖到这里：把分组放到列表末尾"
              : "拖到这里：移出分组 / 放到列表末尾"}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordList;
