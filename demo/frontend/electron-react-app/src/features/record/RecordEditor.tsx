import React, { useState, useEffect, useCallback, useRef } from "react";
import "./RecordEditor.css";
import ApiService from "@services/ApiService";
import {
  Record,
  ProjectSettings,
  Emotion,
  DialogueAlign,
  DEFAULT_FREE_TEXT_FONT_SIZE,
} from "@types";
import RecordList from "./RecordList";
import RecordPreview from "./RecordPreview";
import PropertyTabs from "./PropertyTabs";
import TextProperties from "./properties/TextProperties";
import CharactersProperties from "./properties/CharactersProperties";
import TempImagesProperties from "./properties/TempImagesProperties";
import BackgroundProperties from "./properties/BackgroundProperties";
import EffectsProperties from "./properties/EffectsProperties";
import AudioProperties from "./properties/AudioProperties";
import GlobalProperties from "./properties/GlobalProperties";
import {
  normalizeTextSpeed,
  plotOf,
  withGlobalTextSpeed,
} from "@features/common/utils/projectSettings";
import { generateUUID } from "./utils";
import {
  createRecordGroup,
  GroupDropTarget,
  MoveTarget,
  moveGroup,
  moveRecords,
  neighborMoveTarget,
  newRecordInsertIndex,
  RecordGroup,
  syncGroupAnchors,
} from "./recordGroups";
import ResizablePanel from "./ResizablePanel_updated";
import ExportSuccessDialog from "./ExportSuccessDialog";
import { ProjectWorkspace } from "./useProjectWorkspace";
import {
  EditorSnapshot,
  HistoryState,
  createHistory,
  dropLastHistory,
  historyDepth,
  popHistory,
  popRedo,
  pushHistory,
  redoDepth,
} from "./recordHistory";
import {
  focusRequestForLayer,
  PreviewSelection,
  PropertyFocusRequest,
  selectionOfLayer,
} from "./preview/previewTargets";
import type { PreviewLayer } from "./preview/previewLayout";
import { writeLayerPosition } from "./preview/previewDrag";
import type { DragPoint } from "./preview/previewDrag";

interface RecordEditorProps {
  projectSettings: ProjectSettings;
  /** 更新项目设置：全局设置 tab 与"设置"页面改的是同一份状态（App 层持有） */
  setProjectSettings: React.Dispatch<React.SetStateAction<ProjectSettings>>;
  /**
   * 当前工程的工作区（记录、选中位置、文件关联与保存/导入操作）。
   * 由 App 层持有，所以切换到资源管理等页面再回来，编辑内容不会丢。
   * 详见 useProjectWorkspace.ts。
   */
  workspace: ProjectWorkspace;
}

const RecordEditor: React.FC<RecordEditorProps> = ({
  projectSettings,
  setProjectSettings,
  workspace,
}) => {
  const {
    records,
    setRecords,
    groups,
    setGroups,
    selectedRecordIndex,
    setSelectedRecordIndex,
    activePropertyTab,
    setActivePropertyTab,
    isLoadingProject,
    saveProject,
    importProject,
    fileName: projectFileName,
  } = workspace;

  const [topPanelHeight, setTopPanelHeight] = useState(400);

  /**
   * 预览里选中的元素。
   *
   * <p>放在编辑器层而不是预览组件里：切页签 / 切记录都可能需要清掉它，
   * 且属性面板的高亮请求也由这里下发（见 handlePreviewSelect）。
   */
  const [previewSelection, setPreviewSelection] =
    useState<PreviewSelection | null>(null);
  /**
   * 「滚到属性面板哪一块并闪一下」的一次性请求。
   * `nonce` 用时间戳，保证同一个元素连点两次也会重新滚动 + 闪烁。
   */
  const [propertyFocus, setPropertyFocus] =
    useState<PropertyFocusRequest | null>(null);

  // 视频生成进度状态
  const [videoProgress, setVideoProgress] = useState<{
    taskId: string;
    stage: number;
    current: number;
    total: number;
    message: string;
    percent: number;
    completed: boolean;
    error: boolean;
    outputPath?: string;
    elapsedMs?: number;
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // 视频导出成功弹窗数据（替代原来的 alert，含"打开输出文件夹"按钮与素材来源提示）
  const [exportSuccess, setExportSuccess] = useState<{
    outputPath?: string;
    elapsedMs?: number;
  } | null>(null);

  // Refs so the stable createNewRecord callback can read current visual context
  // (chars, bg, speaker) without being recreated on every state change.
  const recordsRef = useRef<Record[]>(records || []);
  recordsRef.current = records || [];
  const selectedIndexRef = useRef(selectedRecordIndex);
  selectedIndexRef.current = selectedRecordIndex;
  // 分组定义（名称/折叠）也镜像到 ref：创建分组、解散分组等回调要保持稳定引用
  const groupsRef = useRef<RecordGroup[]>(groups);
  groupsRef.current = groups;
  // 新记录的初始"显示速度"取全局设置（不做成依赖，避免改设置就重建回调）
  const projectSettingsRef = useRef(projectSettings);
  projectSettingsRef.current = projectSettings;
  // 空工程只自动补一条记录，避免 StrictMode 下 effect 重跑出两条
  const autoCreatedRef = useRef(false);

  /* ===================== 撤销（Ctrl+Z） ===================== */

  /** 撤销栈：每项是"某次改动之前的记录 + 分组" */
  const historyRef = useRef<HistoryState>(createHistory());
  /** 拖拽期间挂起压栈：一次拖动只算一步，过程中的每帧回写不单独入栈 */
  const undoSuspendedRef = useRef(false);
  /** 撤销后要求预览跳过后端磁盘缓存重渲一张 */
  const [previewRefreshToken, setPreviewRefreshToken] = useState(0);

  /**
   * @function 压入一份"改动前"的快照
   * @param coalesce true = 允许与上一次合并（打字/拖滑杆这类连续编辑）
   */
  const pushUndo = useCallback((coalesce = false) => {
    if (undoSuspendedRef.current) return;
    historyRef.current = pushHistory(
      historyRef.current,
      { records: recordsRef.current, groups: groupsRef.current },
      Date.now(),
      coalesce,
    );
  }, []);

  /** 当前工程快照（撤销/重做时用来把"反方向"的那一步存起来） */
  const currentSnapshot = useCallback(
    (): EditorSnapshot => ({
      records: recordsRef.current,
      groups: groupsRef.current,
    }),
    [],
  );

  /**
   * @function 把一份快照写回工程（撤销与重做共用）
   *
   * <p>恢复记录与分组、清掉预览选中态，并让预览图跳过后端缓存重渲一次——
   * 撤销/重做都是把记录改成**旧内容**，后端缓存按 uuid 存，直接用缓存会停在改之前的画面。
   */
  const applySnapshot = useCallback(
    (snapshot: EditorSnapshot) => {
      setRecords(snapshot.records);
      recordsRef.current = snapshot.records;
      setGroups(snapshot.groups);
      groupsRef.current = snapshot.groups;
      setPreviewSelection(null);
      setPreviewRefreshToken((value) => value + 1);
    },
    [setRecords, setGroups],
  );

  /**
   * @function 撤销一步（Ctrl+Z）
   * 撤销前先把当前状态推进重做栈，这样 Ctrl+Y 能原样回来。
   */
  const undo = useCallback(() => {
    const { state, snapshot } = popHistory(historyRef.current, currentSnapshot());
    historyRef.current = state;
    if (!snapshot) {
      workspace.showToast("info", "没有可撤销的操作");
      return;
    }

    applySnapshot(snapshot);
    workspace.showToast(
      "info",
      historyDepth(state) > 0
        ? `已撤销（还可撤销 ${historyDepth(state)} 步）`
        : "已撤销到最早的状态",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applySnapshot, currentSnapshot]);

  /**
   * @function 重做一步（Ctrl+Y / Ctrl+Shift+Z）
   * 把最近撤销掉的那一步恢复回来，同时把当前状态放回撤销栈（之后还能再 Ctrl+Z）。
   */
  const redo = useCallback(() => {
    const { state, snapshot } = popRedo(historyRef.current, currentSnapshot());
    historyRef.current = state;
    if (!snapshot) {
      workspace.showToast("info", "没有可重做的操作");
      return;
    }

    applySnapshot(snapshot);
    workspace.showToast(
      "info",
      redoDepth(state) > 0
        ? `已重做（还可重做 ${redoDepth(state)} 步）`
        : "已重做到最新",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applySnapshot, currentSnapshot]);

  // Ctrl/⌘+Z 撤销、Ctrl+Y（或 Ctrl+Shift+Z）重做。
  // 捕获阶段注册，避免被输入框里的原生撤销/重做抢走。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key?.toLowerCase();

      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        undo();
        return;
      }
      if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        event.stopPropagation();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [undo, redo]);

  /**
   * @function 应用一次记录数组变更
   * 选中项改用 uuid 追踪：拖动记录、分组重排后下标都会变，
   * 按 uuid 找回新下标，预览图与属性面板就不会跳到别的记录上。
   * 同时同步空分组位置：分组变空时留在原地，填入记录后清掉空分组锚点。
   * @param nextRecords 新的记录数组
   * @param nextGroups 可选：分组定义也被这次操作改过时直接传入（如拖动分组）
   */
  const applyRecords = useCallback(
    (nextRecords: Record[], nextGroups?: RecordGroup[]) => {
      // 结构性改动（增删/排序/分组）各自成一步，不与打字合并
      pushUndo(false);
      const previousRecords = recordsRef.current;
      const selectedUuid = previousRecords[selectedIndexRef.current]?.uuid;

      setRecords(nextRecords);
      if (nextGroups) {
        setGroups(nextGroups);
      } else {
        setGroups((prevGroups) =>
          syncGroupAnchors(previousRecords, nextRecords, prevGroups),
        );
      }

      if (!selectedUuid) return;
      const nextIndex = nextRecords.findIndex(
        (record) => record.uuid === selectedUuid,
      );
      if (nextIndex >= 0 && nextIndex !== selectedIndexRef.current) {
        setSelectedRecordIndex(nextIndex);
      }
    },
    [pushUndo, setRecords, setSelectedRecordIndex, setGroups],
  );

  const createNewRecord = useCallback(() => {
    console.log("[RecordEditor] createNewRecord 开始执行");

    // 从当前选中的 record 继承视觉上下文（角色立绘、背景、说话人、音频指令），
    // 这样预览图立即显示角色名片与角色立绘，用户再按需修改。
    const currentRecords = recordsRef.current;
    const currentIndex = selectedIndexRef.current;
    const inherit = currentRecords.length > 0 ? currentRecords[currentIndex] : null;

    const inheritedChars = inherit?.chars ? JSON.parse(JSON.stringify(inherit.chars)) : [];
    const inheritedBg = inherit?.bg ? JSON.parse(JSON.stringify(inherit.bg)) : [];
    const inheritedAudioCommands = inherit?.audioCommands
      ? JSON.parse(JSON.stringify(inherit.audioCommands))
      : [];
    const inheritedSpeakerC = inherit?.dialogue?.speakerC
      ? JSON.parse(JSON.stringify(inherit.dialogue.speakerC))
      : [];
    const inheritedTempImages = inherit?.tempImages
      ? JSON.parse(JSON.stringify(inherit.tempImages))
      : [];

    // 在分组里按"+"新增 → 新记录留在同一分组；分组已被解散则按未分组处理
    const inheritGroupId =
      inherit?.groupId &&
      groupsRef.current.some((group) => group.id === inherit.groupId)
        ? inherit.groupId
        : undefined;

    const newRecord: Record = {
      uuid: generateUUID(),
      durationFrames: inherit?.durationFrames ?? 30,
      groupId: inheritGroupId,
      dialogue: {
        text: "",
        location: inherit?.dialogue?.location || "default",
        speakerC: inheritedSpeakerC,
        speakerName: inherit?.dialogue?.speakerName || "",
        faction: inherit?.dialogue?.faction || "",
        align: inherit?.dialogue?.align || DialogueAlign.LEFT,
        // 新记录沿用"全局设置 → 文字显示速度（全局）"，保证"全局"对新建记录同样生效
        speed: normalizeTextSpeed(projectSettingsRef.current?.textSpeed),
        emotion: Emotion.NORMAL,
        // 自由文本（说话人类型）与样式：新建记录沿用上一条的选择，避免每条都要重设
        freeText: inherit?.dialogue?.freeText === true,
        bold: inherit?.dialogue?.bold === true,
        italic: inherit?.dialogue?.italic === true,
        hideUI: inherit?.dialogue?.hideUI !== false,
        freeTextColor: inherit?.dialogue?.freeTextColor || "",
        freeTextFontSize:
          inherit?.dialogue?.freeTextFontSize || DEFAULT_FREE_TEXT_FONT_SIZE,
        freeTextX: inherit?.dialogue?.freeTextX ?? 0,
        freeTextY: inherit?.dialogue?.freeTextY ?? 0,
      },
      bg: inheritedBg,
      chars: inheritedChars,
      tempImages: inheritedTempImages,
      effects: [],
      audioCommands: inheritedAudioCommands,
      isDirty: true,
    };

    console.log("[RecordEditor] 创建新记录，UUID:", newRecord.uuid,
      "| 继承 chars:", inheritedChars.length,
      "| bg:", inheritedBg.length,
      "| audioCommands:", inheritedAudioCommands.length);

    // 分组内新增：插到组内最后一条之后（分组成员在数组里必须连续）；
    // 未分组时沿用原行为，追加到列表末尾
    const insertIndex = newRecordInsertIndex(
      currentRecords,
      inheritGroupId,
      groupsRef.current,
    );
    const newRecords = [
      ...currentRecords.slice(0, insertIndex),
      newRecord,
      ...currentRecords.slice(insertIndex),
    ];

    applyRecords(newRecords);
    setSelectedRecordIndex(insertIndex);
    // 当前记录在折叠的分组里时，展开这个分组，保证新增的记录立刻可见
    if (inheritGroupId) {
      setGroups((prev) =>
        prev.map((group) =>
          group.id === inheritGroupId && group.collapsed
            ? { ...group, collapsed: false }
            : group,
        ),
      );
    }
    console.log(`[RecordEditor] 新记录已添加，当前记录总数: ${newRecords.length}`);
  }, [applyRecords, setSelectedRecordIndex, setGroups]);

  // 工程记录由 App 层持有（useProjectWorkspace 负责首次从后端加载）。
  // 加载完成且确实没有任何记录时补一条空记录，让用户可以直接开始编辑。
  useEffect(() => {
    if (isLoadingProject) return;
    if (records && records.length === 0 && !autoCreatedRef.current) {
      autoCreatedRef.current = true;
      console.log("[RecordEditor] 工程为空，自动创建第一条记录");
      createNewRecord();
    }
  }, [isLoadingProject, records, createNewRecord]);

  /**
   * @function 更新单条记录
   * 压撤销快照用 `coalesce = true`：连续打字/拖滑杆合并成一步（见 recordHistory.ts）。
   */
  const updateRecord = (index: number, updatedRecord: Record) => {
    pushUndo(true);
    setRecords((prev) => {
      const newRecords = [...(prev || [])];
      newRecords[index] = { ...updatedRecord, isDirty: true };
      return newRecords;
    });
  };

  /**
   * @function 预览里点中一个元素
   *
   * 三件事一起做：记下选中态（画选中框）→ 切到对应页签 → 下发一次定位请求
   * （属性面板收到后会滚到该条目并闪一下，见 useFocusFlash）。
   * 页签与定位目标的映射集中在 previewTargets.ts，这里只管调用。
   */
  const handlePreviewSelect = useCallback(
    (layer: PreviewLayer) => {
      setPreviewSelection(selectionOfLayer(layer));
      const target = focusRequestForLayer(layer, Date.now());
      if (!target) return;
      setActivePropertyTab(target.tab);
      setPropertyFocus(target.focus);
    },
    [setActivePropertyTab],
  );

  /** 点空白处取消选中：保留页签与面板内容，只去掉选中框 */
  const clearPreviewSelection = useCallback(() => {
    setPreviewSelection(null);
  }, []);

  /* ===================== 预览里拖动元素 ===================== */

  /** 本次拖动的起点（Esc / 指针取消时还原）；null 表示没在拖 */
  const dragStartRef = useRef<{ layer: PreviewLayer; start: DragPoint } | null>(
    null,
  );

  /**
   * @function 开始拖动
   * 压一次撤销快照（整段拖动算一步），并挂起拖拽过程中的压栈。
   */
  const handleElementDragStart = (layer: PreviewLayer, start: DragPoint) => {
    dragStartRef.current = { layer, start };
    pushUndo(false);
    undoSuspendedRef.current = true;
  };

  /**
   * @function 拖动中：把新位置写回记录
   *
   * <p>这里已经是"设计画布像素的绝对位置"，语义差异（立绘是偏移、背景/临时图片是坐标）
   * 由 {@link writeLayerPosition} 统一处理。用 ref 读最新记录，避免闭包里的旧快照。
   */
  const handleElementDragMove = (layer: PreviewLayer, position: DragPoint) => {
    const current = recordsRef.current[selectedIndexRef.current];
    if (!current) return;
    const next = writeLayerPosition(current, layer.kind, layer.index, position);
    if (next) updateRecord(selectedIndexRef.current, next);
  };

  const handleElementDragEnd = () => {
    dragStartRef.current = null;
    undoSuspendedRef.current = false;
  };

  /** Esc / 指针取消：把元素放回拖动起点 */
  const handleElementDragCancel = (layer: PreviewLayer) => {
    const session = dragStartRef.current;
    dragStartRef.current = null;
    undoSuspendedRef.current = false;
    if (!session) return;
    const current = recordsRef.current[selectedIndexRef.current];
    if (!current) return;
    const restored = writeLayerPosition(
      current,
      layer.kind,
      layer.index,
      session.start,
    );
    if (restored) updateRecord(selectedIndexRef.current, restored);
    // 已经手动还原到起点：那次"拖动前"的快照 == 当前状态，弹掉它，
    // 否则下一次 Ctrl+Z 会变成一次空操作。
    historyRef.current = dropLastHistory(historyRef.current);
  };

  /**
   * 切换记录时清掉选中态与定位请求：
   * 否则会留着上一条记录的元素 key，选中框画到别的记录上、面板还停在旧的高亮里。
   */
  const selectedUuid = records?.[selectedRecordIndex]?.uuid;
  useEffect(() => {
    setPreviewSelection(null);
    setPropertyFocus(null);
  }, [selectedUuid]);

  /**
   * @function 更新项目设置（全局设置 tab 用）
   * 与"设置"页面写入的是同一份 projectSettings，所以两侧互相同步、
   * 也会立刻作用到预览图与导出视频上。
   */
  const handleProjectSettingsChange = useCallback(
    (field: keyof ProjectSettings, value: any) => {
      setProjectSettings((prev) => ({ ...prev, [field]: value }));
    },
    [setProjectSettings],
  );

  // "文本"tab 的"全局设置"链接点进来时，高亮一下全局速度滑块（1.6s 后自动清掉）
  const [focusGlobalTextSpeed, setFocusGlobalTextSpeed] = useState(false);
  const clearGlobalTextSpeedFocus = useCallback(
    () => setFocusGlobalTextSpeed(false),
    [],
  );
  const openGlobalTextSpeed = useCallback(() => {
    setActivePropertyTab("global");
    setFocusGlobalTextSpeed(true);
  }, [setActivePropertyTab]);

  /**
   * @function 修改"文字显示速度（全局）"
   * 除了写进 projectSettings（之后新增的记录用它），还要把这一档速度统一覆盖到
   * 所有已有记录上 —— 这就是"全局"：单条记录在"文本"tab 里调过的速度会被覆盖。
   */
  const handleGlobalTextSpeedChange = useCallback(
    (speed: number) => {
      const normalized = normalizeTextSpeed(speed);
      pushUndo(false);
      setProjectSettings((prev) => ({ ...prev, textSpeed: normalized }));
      setRecords((prev) => withGlobalTextSpeed(prev || [], normalized));
    },
    [pushUndo, setProjectSettings, setRecords],
  );

  const deleteRecord = (index: number) => {
    const currentRecords = recordsRef.current;
    if (currentRecords.length <= 1) {
      alert("至少需要保留一条记录");
      return;
    }

    // 删除后选中项可能前移：按 uuid 找回；删的就是当前记录时落到相邻的一条
    const selectedUuid = currentRecords[selectedIndexRef.current]?.uuid;
    const deletingSelected = currentRecords[index]?.uuid === selectedUuid;
    const newRecords = currentRecords.filter((_, i) => i !== index);

    applyRecords(newRecords);
    if (deletingSelected) {
      setSelectedRecordIndex(Math.min(index, newRecords.length - 1));
    }
  };

  /**
   * @function 上移 / 下移一条记录
   * 等同把它拖到相邻记录的前面/后面：跨过分组边界时会加入相邻记录所在的分组
   * （相邻记录未分组则一起移出分组），保证分组成员始终在数组里连续。
   */
  const moveRecord = (index: number, direction: "up" | "down") => {
    const currentRecords = recordsRef.current;
    const record = currentRecords[index];
    const target = neighborMoveTarget(currentRecords, index, direction);
    if (!record || !target) return;

    const nextRecords = moveRecords(
      currentRecords,
      [record.uuid],
      target,
      groupsRef.current,
    );
    if (nextRecords === currentRecords) return;
    applyRecords(nextRecords);
  };

  const duplicateRecord = (index: number) => {
    const currentRecords = recordsRef.current;
    const recordToDuplicate = currentRecords[index];
    if (!recordToDuplicate) return;
    // 复制出来的记录保留分组（插在原记录后面，仍在同一分组块内）
    const newRecord = {
      ...recordToDuplicate,
      uuid: generateUUID(),
      isDirty: true,
    };

    const newRecords = [...currentRecords];
    newRecords.splice(index + 1, 0, newRecord);
    applyRecords(newRecords);
    setSelectedRecordIndex(index + 1);
  };

  /**
   * @function 新建分组
   * 名称先按"分组 N"自动生成；返回新分组对象，列表拿到后立刻进入重命名状态。
   */
  const createGroup = useCallback((): RecordGroup => {
    const group = createRecordGroup(groupsRef.current);
    setGroups((prev) => [...prev, group]);
    return group;
  }, [setGroups]);

  const renameGroup = useCallback(
    (groupId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setGroups((prev) =>
        prev.map((group) =>
          group.id === groupId ? { ...group, name: trimmed } : group,
        ),
      );
    },
    [setGroups],
  );

  const toggleGroup = useCallback(
    (groupId: string) => {
      setGroups((prev) =>
        prev.map((group) =>
          group.id === groupId
            ? { ...group, collapsed: !group.collapsed }
            : group,
        ),
      );
    },
    [setGroups],
  );

  /**
   * @function 解散分组
   * 组内记录保留，只是变成未分组（位置不变，播放顺序也不变）。
   */
  const dissolveGroup = useCallback(
    (groupId: string) => {
      const group = groupsRef.current.find((item) => item.id === groupId);
      if (!group) return;
      const count = recordsRef.current.filter(
        (record) => record.groupId === groupId,
      ).length;

      if (
        count > 0 &&
        !window.confirm(
          `解散分组「${group.name}」？组内 ${count} 条记录会保留并变为未分组。`,
        )
      ) {
        return;
      }

      const nextGroups = groupsRef.current.filter(
        (item) => item.id !== groupId,
      );
      const nextRecords = recordsRef.current.map((record) =>
        record.groupId === groupId
          ? { ...record, groupId: undefined }
          : record,
      );
      applyRecords(nextRecords, nextGroups);
    },
    [applyRecords],
  );

  /**
   * @function 拖动记录（支持多选后一起拖）
   * 目标可以是某条记录的前/后、某个分组、或列表末尾（移出分组）；
   * 移动时一并处理分组归属，见 recordGroups.moveRecords。
   */
  const handleMoveRecords = useCallback(
    (uuids: string[], target: MoveTarget) => {
      const currentRecords = recordsRef.current;
      const nextRecords = moveRecords(
        currentRecords,
        uuids,
        target,
        groupsRef.current,
      );
      if (nextRecords === currentRecords) return;
      applyRecords(nextRecords);

      // 拖进折叠的分组时自动展开，方便确认结果
      if (target.kind === "group") {
        setGroups((prev) =>
          prev.map((group) =>
            group.id === target.groupId
              ? { ...group, collapsed: false }
              : group,
          ),
        );
      }
    },
    [applyRecords, setGroups],
  );

  /**
   * @function 拖动整个分组（含空分组）
   * 有记录的分组会连记录一起移动；空分组只改显示位置，
   * 具体规则见 recordGroups.moveGroup。
   */
  const handleMoveGroup = useCallback(
    (groupId: string, target: GroupDropTarget) => {
      const currentRecords = recordsRef.current;
      const currentGroups = groupsRef.current;
      const result = moveGroup(currentRecords, currentGroups, groupId, target);
      if (
        result.records === currentRecords &&
        result.groups === currentGroups
      ) {
        return;
      }
      // 记录顺序与分组定义可能同时变化，直接应用 mover 的结果
      applyRecords(result.records, result.groups);
    },
    [applyRecords],
  );

  const generateVideo = async (layerTypes: string[] = ["FULL"], keepTempFiles: boolean = false) => {
    const currentRecords = recordsRef.current;
    if (currentRecords.length === 0) {
      alert("没有可生成的记录");
      return;
    }

    // 传出去的是导出目录（不是文件名）：设置里选的/填的就是文件夹，
    // 目录不存在时由后端创建，视频文件名（项目名称_video_<时间戳>_<分层>.mp4）也由后端生成。
    const outputPath = projectSettings.outputPath?.trim() || "./output";

    try {
      setIsGenerating(true);
      // 异步启动视频生成，立即返回 taskId
      const result = await ApiService.generateVideo(
        currentRecords,
        outputPath,
        projectSettings.videoWidth || 1920,
        projectSettings.videoHeight || 1080,
        30,
        layerTypes,
        keepTempFiles,
        // 项目名称 → 导出视频文件名前缀；剧情类型 → 后端 plot（决定是否叠加立绘/黑边）
        projectSettings.name,
        plotOf(projectSettings),
      );

      const taskId = result.taskId || result.outputPath; // 兼容旧格式
      if (!taskId) {
        throw new Error("未获取到任务ID");
      }

      setVideoProgress({
        taskId,
        stage: 1,
        current: 0,
        total: currentRecords.length,
        message: "视频生成已启动...",
        percent: 0,
        completed: false,
        error: false,
      });

      // 轮询进度
      const pollInterval = setInterval(async () => {
        try {
          const progress = await ApiService.getVideoProgress(taskId);
          setVideoProgress({
            taskId,
            stage: progress.stage,
            current: progress.current,
            total: progress.total,
            message: progress.message,
            percent: progress.percent,
            completed: progress.completed,
            error: progress.error,
            outputPath: progress.outputPath,
            elapsedMs: progress.elapsedMs,
          });

          if (progress.completed || progress.error) {
            clearInterval(pollInterval);
            setIsGenerating(false);
            if (progress.completed) {
              // 用自定义弹窗展示成功信息：醒目提示素材来源，并提供打开输出文件夹的入口
              setExportSuccess({
                outputPath: progress.outputPath,
                elapsedMs: progress.elapsedMs,
              });
            } else {
              alert(`视频生成失败: ${progress.message}`);
            }
          }
        } catch (err) {
          console.error("查询进度失败:", err);
        }
      }, 1000); // 每秒轮询

      // 安全清理：最多轮询 30 分钟
      setTimeout(() => {
        clearInterval(pollInterval);
        if (isGenerating) {
          setIsGenerating(false);
          setVideoProgress(null);
        }
      }, 30 * 60 * 1000);
    } catch (error) {
      console.error("生成视频失败:", error);
      alert("生成视频失败，请检查控制台日志");
      setIsGenerating(false);
    }
  };

  // Resizing handled by ResizablePanel; removed unused handler to avoid lint warnings.

  const isLoading = isLoadingProject || records === undefined;
  if (isLoading) return <div className="loading">加载中...</div>;

  const currentRecords = records || [];
  const selectedRecord =
    currentRecords[selectedRecordIndex] ||
    (currentRecords.length > 0 ? currentRecords[0] : null);
  if (!selectedRecord) {
    return (
      <div className="record-editor">
        <div className="editor-top">
          <div className="record-list-container">
            <div className="record-list-header">
              <div className="record-list-title">
                <h3>剧情记录</h3>
                <button
                  className="add-record-btn"
                  onClick={createNewRecord}
                  title="添加记录"
                  aria-label="添加记录"
                >
                  +
                </button>
              </div>
            </div>
            <div className="empty-state">
              <p>暂无剧情记录，请点击"+"按钮创建新记录</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderPropertyContent = () => {
    switch (activePropertyTab) {
      case "text":
        return (
          <TextProperties
            selectedRecord={selectedRecord}
            selectedRecordIndex={selectedRecordIndex}
            updateRecord={updateRecord}
            videoWidth={projectSettings.videoWidth}
            videoHeight={projectSettings.videoHeight}
            onOpenGlobalSpeed={openGlobalTextSpeed}
            focusRequest={propertyFocus}
          />
        );
      case "characters":
        return (
          <CharactersProperties
            selectedRecord={selectedRecord}
            selectedRecordIndex={selectedRecordIndex}
            updateRecord={updateRecord}
            videoWidth={projectSettings.videoWidth}
            videoHeight={projectSettings.videoHeight}
            focusRequest={propertyFocus}
          />
        );
      case "tempImages":
        return (
          <TempImagesProperties
            selectedRecord={selectedRecord}
            selectedRecordIndex={selectedRecordIndex}
            updateRecord={updateRecord}
            videoWidth={projectSettings.videoWidth}
            videoHeight={projectSettings.videoHeight}
            focusRequest={propertyFocus}
          />
        );
      case "background":
        return (
          <BackgroundProperties
            selectedRecord={selectedRecord}
            selectedRecordIndex={selectedRecordIndex}
            updateRecord={updateRecord}
            videoWidth={projectSettings.videoWidth}
            videoHeight={projectSettings.videoHeight}
            focusRequest={propertyFocus}
          />
        );
      case "effects":
        return (
          <EffectsProperties
            selectedRecord={selectedRecord}
            selectedRecordIndex={selectedRecordIndex}
            updateRecord={updateRecord}
          />
        );
      case "audio":
        return (
          <AudioProperties
            selectedRecord={selectedRecord}
            selectedRecordIndex={selectedRecordIndex}
            updateRecord={updateRecord}
          />
        );
      case "global":
        return (
          <GlobalProperties
            projectSettings={projectSettings}
            onChange={handleProjectSettingsChange}
            onTextSpeedChange={handleGlobalTextSpeedChange}
            highlightTextSpeed={focusGlobalTextSpeed}
            onHighlightEnd={clearGlobalTextSpeedFocus}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="record-editor">
      <ResizablePanel
        direction="vertical"
        defaultSize={topPanelHeight}
        minSize={200}
        className="editor-top-panel"
        onResize={(size) => setTopPanelHeight(size)}
      >
        <div className="editor-top">
          <ResizablePanel
            direction="horizontal"
            defaultSize={600}
            minSize={200}
            className="preview-panel"
          >
            <RecordPreview
              selectedRecord={selectedRecord}
              videoWidth={projectSettings.videoWidth}
              videoHeight={projectSettings.videoHeight}
              plot={plotOf(projectSettings)}
              records={currentRecords}
              selectedRecordIndex={selectedRecordIndex}
              setSelectedRecordIndex={setSelectedRecordIndex}
              selectedElementKey={previewSelection?.key ?? null}
              onSelectElement={handlePreviewSelect}
              onClearSelection={clearPreviewSelection}
              onElementDragStart={handleElementDragStart}
              onElementDragMove={handleElementDragMove}
              onElementDragEnd={handleElementDragEnd}
              onElementDragCancel={handleElementDragCancel}
              refreshToken={previewRefreshToken}
            />
          </ResizablePanel>

          <ResizablePanel
            direction="horizontal"
            defaultSize={200}
            minSize={200}
            className="properties-panel"
          >
            <div className="properties-container">
              <PropertyTabs
                activePropertyTab={activePropertyTab}
                setActivePropertyTab={setActivePropertyTab}
              />
              <div className="property-content">{renderPropertyContent()}</div>
            </div>
          </ResizablePanel>
        </div>
      </ResizablePanel>

      {isGenerating && videoProgress && (
        <div className="video-progress-bar-container">
          <div className="video-progress-bar">
            <div className="progress-header">
              <span className="progress-stage">
                {videoProgress.stage === 1 && "渲染Record视频"}
                {videoProgress.stage === 2 && "连接无声视频"}
                {videoProgress.stage === 3 && "处理音频"}
                {videoProgress.stage === 4 && "合并音视频"}
              </span>
              <span className="progress-percent">{videoProgress.percent}%</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${videoProgress.percent}%` }}
              />
            </div>
            <div className="progress-message">{videoProgress.message}</div>
          </div>
        </div>
      )}

      {exportSuccess && (
        <ExportSuccessDialog
          outputPath={exportSuccess.outputPath}
          elapsedMs={exportSuccess.elapsedMs}
          onClose={() => setExportSuccess(null)}
        />
      )}

      <div className="editor-bottom-panel" style={{ minHeight: "150px" }}>
        <div className="editor-bottom">
          <RecordList
            records={currentRecords}
            groups={groups}
            selectedRecordIndex={selectedRecordIndex}
            setSelectedRecordIndex={setSelectedRecordIndex}
            createNewRecord={createNewRecord}
            onCreateGroup={createGroup}
            onRenameGroup={renameGroup}
            onToggleGroup={toggleGroup}
            onDissolveGroup={dissolveGroup}
            onMoveRecords={handleMoveRecords}
            onMoveGroup={handleMoveGroup}
            generateVideo={generateVideo}
            moveRecord={moveRecord}
            duplicateRecord={duplicateRecord}
            deleteRecord={deleteRecord}
            onSaveProject={saveProject}
            onImportProject={importProject}
            projectFileName={projectFileName}
            isGenerating={isGenerating}
          />
        </div>
      </div>
    </div>
  );
};

export default RecordEditor;

