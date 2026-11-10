/**
 * @module 工程工作区（临时保存 + 工程文件读写）
 * 把"当前正在编辑的工程"提升到 App 层持有，解决三个问题：
 * 1. 页面切换（剧情编辑 ↔ 资源管理 …）会卸载编辑器组件，之前记录只存在组件内部状态里，
 *    切回来就被后端数据覆盖 —— 现在记录、选中位置、属性页签都由本 Hook 保存，切换页面不丢；
 * 2. Ctrl+S：工程已关联文件时直接更新该文件并给出文字提示；尚未关联文件时先弹保存对话框，
 *    之后的 Ctrl+S 都更新同一个文件；
 * 3. "保存工程 / 导入工程 / 新建工程"按钮与菜单里的"新建项目 / 打开项目 / 保存项目"共用同一套逻辑。
 * 4. 剧情列表的分组（图层文件夹）也由本 Hook 持有：切换页面不丢分组，保存/导入工程时
 *    名称与折叠状态随记录一起往返（见 recordGroups.ts）。
 * 5. 新建工程：先问"是否保存当前工程"，再清空记录、分组与文件关联；
 *    代次 `projectGeneration` 让编辑器知道"这是一份新文档"（补一条空白记录、清掉撤销历史）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import log from "electron-log";
import { Record } from "@types";
import ApiService from "@services/ApiService";
import { askChoice } from "@features/common/components/ConfirmDialog";
import {
  defaultProjectFileName,
  downloadProjectFile,
  fileNameOf,
  isElectronRuntime,
  normalizeRecords,
  parseProjectText,
  pathOfFile,
  pickProjectFilePath,
  ProjectFileSettings,
  readTextFile,
  saveProjectFileAs,
  serializeProject,
  writeProjectFile,
} from "./projectFile";
import { readGroups, RecordGroup } from "./recordGroups";

/** 属性页签类型（编辑器右侧的属性面板） */
export type PropertyTab =
  | "text"
  | "characters"
  /** 临时图片（路人 / 道具）：原先是「立绘」页签里的一段，现在是同级页签 */
  | "tempImages"
  | "background"
  /**
   * 摄像机：镜头（起止 / 缓动 / 运镜时长 / 铺满背景…）原先浮在预览画面上，
   * 现在是同级页签；进这个页签时预览会切到"世界视图"。
   */
  | "camera"
  | "effects"
  | "audio"
  | "global";

/** 提示文字的样式：成功 / 失败 / 普通说明 */
export type ProjectToastKind = "success" | "error" | "info";

/** 一条文字提示（非弹窗），由 App 渲染在界面上并在几秒后自动消失 */
export interface ProjectToastMessage {
  id: number;
  kind: ProjectToastKind;
  text: string;
}

/** 工程工作区对外暴露的状态与操作 */
export interface ProjectWorkspace {
  /** 当前工程记录；undefined 表示还在首次加载 */
  records: Record[] | undefined;
  setRecords: React.Dispatch<React.SetStateAction<Record[] | undefined>>;
  /** 剧情列表的分组（图层文件夹）；成员关系记在记录的 groupId 上 */
  groups: RecordGroup[];
  setGroups: React.Dispatch<React.SetStateAction<RecordGroup[]>>;
  selectedRecordIndex: number;
  setSelectedRecordIndex: (index: number) => void;
  activePropertyTab: PropertyTab;
  setActivePropertyTab: (tab: PropertyTab) => void;
  /** 当前工程关联的文件绝对路径；null 表示尚未保存到文件 */
  filePath: string | null;
  /** 当前工程文件名（按钮提示、提示文字使用） */
  fileName: string | null;
  /**
   * 新建工程的代次：每新建一次 +1，首次加载完成时为 0。
   *
   * <p>编辑器据此判断"记录的清空是新建工程造成的"：补一条空白记录、
   * 把撤销历史清空（否则 Ctrl+Z 会把旧工程的记录撤销回来，和空工程混在一起）。
   */
  projectGeneration: number;
  /** 首次从后端加载工程记录中 */
  isLoadingProject: boolean;
  toast: ProjectToastMessage | null;
  dismissToast: () => void;
  showToast: (kind: ProjectToastKind, text: string) => void;
  /**
   * 保存工程：已关联文件则就地更新，否则弹出保存对话框（Ctrl+S 与"保存工程"按钮）。
   * @returns 是否真的存到了磁盘（保存失败、或在保存对话框里点了取消 → false）。
   *          "新建工程"先问保存时靠这个返回值决定要不要清空，存不下来就绝不清。
   */
  saveProject: () => Promise<boolean>;
  /** 导入工程：传入文件选择框得到的 File，或不传（走 Electron 原生对话框） */
  importProject: (file?: File) => void;
  /**
   * 新建工程：「保存并新建 / 不保存 / 取消」三选一，确认后清空剧情列表与分组，
   * 并断开与上一个工程文件的关联（之后 Ctrl+S 会先让选新的保存位置，不会覆盖旧工程）。
   * 页面按钮与菜单「文件 → 新建项目（Ctrl+N）」共用这一套流程。
   */
  newProject: () => Promise<void>;
  /** 文本转记录解析完成后接入编辑器（新的记录尚未关联工程文件） */
  adoptParsedRecords: (records: Record[]) => void;
}

/** 提示文字自动消失时间：失败信息留久一点，方便用户看清原因 */
const TOAST_DURATION: { [key in ProjectToastKind]: number } = {
  success: 3000,
  info: 3000,
  error: 5000,
};

/** 工程级设置的读写通道（见 useProjectWorkspace 的 options） */
export interface ProjectWorkspaceOptions {
  /** 当前工程的结尾停留帧数（保存工程时写进文件） */
  stayFrames?: number;
  /** 导入的工程文件带了 settings 时回调（把文件里的值回填到设置面板） */
  onSettingsLoaded?: (settings: ProjectFileSettings) => void;
}

/** 把异常转成可展示的文本 */
const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * @function 使用工程工作区
 * @param projectName 设置里填写的项目名（用于生成默认工程文件名）
 * @param options 工程级设置的读写通道（S2c-2）：
 *                `stayFrames` 是当前值（保存时写进文件），
 *                `onSettingsLoaded` 在导入带 settings 的工程后回调（调用方据此回填设置面板）
 * @return 工程状态与"保存/导入"等操作
 */
export function useProjectWorkspace(
  projectName?: string,
  options: ProjectWorkspaceOptions = {},
): ProjectWorkspace {
  const [records, setRecords] = useState<Record[] | undefined>(undefined);
  const [groups, setGroups] = useState<RecordGroup[]>([]);
  const [selectedRecordIndex, setSelectedRecordIndex] = useState(0);
  const [activePropertyTab, setActivePropertyTab] = useState<PropertyTab>("text");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [projectGeneration, setProjectGeneration] = useState(0);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const [toast, setToast] = useState<ProjectToastMessage | null>(null);

  // 保存/导入过程读到的都应是最新值：用 ref 镜像状态，让这些回调保持稳定引用
  // （Ctrl+S 的监听只注册一次，不会因为状态变化被反复解绑重绑）。
  const recordsRef = useRef<Record[] | undefined>(records);
  recordsRef.current = records;
  const groupsRef = useRef<RecordGroup[]>(groups);
  groupsRef.current = groups;
  const filePathRef = useRef<string | null>(filePath);
  filePathRef.current = filePath;
  const projectNameRef = useRef<string | undefined>(projectName);
  projectNameRef.current = projectName;
  // 工程级设置也用 ref 镜像：saveProject 的引用要保持稳定（Ctrl+S 的监听只注册一次）
  const stayFramesRef = useRef<number | undefined>(options.stayFrames);
  stayFramesRef.current = options.stayFrames;
  const onSettingsLoadedRef = useRef(options.onSettingsLoaded);
  onSettingsLoadedRef.current = options.onSettingsLoaded;
  const savingRef = useRef(false);
  const importingRef = useRef(false);
  /** 新建工程进行中（确认框 / 保存对话框还没落定）：防止连点两次弹两个框 */
  const creatingProjectRef = useRef(false);

  const showToast = useCallback((kind: ProjectToastKind, text: string) => {
    setToast({ id: Date.now() + Math.random(), kind, text });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  // 提示文字自动消失
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast((current) => (current && current.id === toast.id ? null : current));
    }, TOAST_DURATION[toast.kind] ?? 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  /**
   * 应用启动时加载一次工程记录（后端 data/records.json）。
   * 注意：加载是异步的，期间用户可能已经在"文本转记录"里解析了新内容或导入了工程文件，
   * 所以只有在 records 仍为空（undefined）时才写入，避免把用户刚拿到手的记录冲掉。
   */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let loaded: Record[] = [];
      let loadedGroups: RecordGroup[] = [];
      try {
        const data = await ApiService.getRecords();
        loaded = normalizeRecords(data);
        // 后端 data/records.json 一般不带分组（后端模型没有该字段）；
        // 若文件里恰好还有 group 快照（比如手工放的工程文件），仍然还原出来。
        loadedGroups = readGroups(Array.isArray(data) ? data : []);
        log.info("[工程] 从后端加载记录数:", loaded.length);
      } catch (error) {
        log.warn("[工程] 后端记录加载失败，使用空工程:", error);
      }
      if (cancelled) return;
      // 加载期间用户可能已经导入工程或采用了"文本转记录"的结果：
      // 只有在还没有任何记录时才采用后端数据，避免把用户刚拿到手的内容冲掉。
      if (recordsRef.current === undefined) {
        setRecords(loaded);
        setGroups(loadedGroups);
      }
      setIsLoadingProject(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * @function 把工程写入磁盘
   * 已关联文件时用 file:write 直接覆盖（不弹对话框）；未关联文件时弹保存对话框，
   * 选定后记住路径，之后的 Ctrl+S 都更新这个文件。
   * @return 是否真的存下来了（保存失败、用户在对话框里取消都是 false）
   */
  const saveProject = useCallback(async (): Promise<boolean> => {
    const currentRecords = recordsRef.current;

    if (currentRecords === undefined) {
      showToast("info", "工程还在加载中，请稍候再保存");
      return false;
    }
    if (currentRecords.length === 0) {
      showToast("info", "当前工程没有可保存的记录");
      return false;
    }
    if (savingRef.current) return false;

    savingRef.current = true;
    try {
      const text = serializeProject(currentRecords, groupsRef.current, {
        stayFrames: stayFramesRef.current,
      });
      const defaultName = defaultProjectFileName(projectNameRef.current);
      const api: any = (window as any).electronAPI;

      // 浏览器环境没有文件系统权限：降级为下载一份工程文件
      if (!isElectronRuntime() || !api) {
        downloadProjectFile(text, defaultName);
        showToast("success", `已下载工程文件：${defaultName}`);
        return true;
      }

      // 主进程未重启（preload 里还没有新增的保存接口）时也走下载：
      // 至少能把工程存成文件，不会出现"完全存不下来"的情况。
      if (typeof api.writeFile !== "function" && typeof api.saveProjectFile !== "function") {
        downloadProjectFile(text, defaultName);
        showToast(
          "info",
          `主进程还是旧版本，已改用下载方式保存：${defaultName}（重启应用后 Ctrl+S 可直接更新文件）`,
        );
        return true;
      }

      const target = filePathRef.current;
      if (target) {
        const result = await writeProjectFile(target, text);
        if (result.success) {
          showToast("success", `保存成功：${target}`);
          return true;
        }
        showToast("error", `保存失败：${result.error || "未知错误"}`);
        return false;
      }

      const result = await saveProjectFileAs(defaultName, text);
      if (result.canceled) {
        showToast("info", "已取消保存");
        return false;
      }
      if (!result.success || !result.filePath) {
        showToast("error", `保存失败：${result.error || "未知错误"}`);
        return false;
      }
      setFilePath(result.filePath);
      filePathRef.current = result.filePath;
      showToast("success", `保存成功：${result.filePath}`);
      return true;
    } catch (error) {
      log.error("[工程] 保存工程失败:", error);
      showToast("error", `保存失败：${errorText(error)}`);
      return false;
    } finally {
      savingRef.current = false;
    }
  }, [showToast]);

  /**
   * @function 把导入的工程同步到后端
   * 兼容旧行为：以前"导入项目"走后端 /records/import，会顺带把记录写进 data/records.json，
   * 下次启动时编辑器仍能加载到它。这里在本地解析成功后异步补一次同步，
   * 失败（比如后端没启动）不影响已经打开的工程。
   */
  const syncToBackend = useCallback((text: string, fileName: string) => {
    try {
      const file = new File([text], fileName, { type: "application/json" });
      ApiService.importRecords(file)
        .then(() => log.info("[工程] 已同步导入的工程到后端"))
        .catch((error: any) =>
          log.warn("[工程] 同步工程到后端失败（不影响本地编辑）:", error?.message || error),
        );
    } catch (error) {
      log.warn("[工程] 构造同步用的文件对象失败:", error);
    }
  }, []);

  /**
   * @function 导入工程
   * 本地解析工程文件（保证记录结构与编辑器完全一致），并记住文件路径，
   * 这样导入后直接按 Ctrl+S 就能更新这个文件。
   * @param file 文件选择框得到的文件；不传时走 Electron 原生打开对话框
   */
  const importProject = useCallback(
    async (file?: File) => {
      if (importingRef.current) return;
      importingRef.current = true;
      try {
        let text = "";
        let path: string | null = null;
        let name = "";

        if (file) {
          text = await file.text();
          path = pathOfFile(file);
          name = file.name;
        } else {
          const picked = await pickProjectFilePath();
          if (picked.canceled || !picked.filePath) return; // 用户取消，不打扰
          path = picked.filePath;
          name = fileNameOf(picked.filePath);
          text = await readTextFile(picked.filePath);
        }

        const importedProject = parseProjectText(text);
        const imported = importedProject.records;
        if (imported.length === 0) {
          showToast("error", "工程文件里没有找到有效记录");
          return;
        }

        setRecords(imported);
        setGroups(importedProject.groups);
        // 工程级设置：只有文件里带了这一段的才回填（旧工程裸数组 → 保留用户当前设置）
        if (importedProject.settings) {
          onSettingsLoadedRef.current?.(importedProject.settings);
        }
        setSelectedRecordIndex(0);
        setActivePropertyTab("text");
        setFilePath(path);
        filePathRef.current = path;

        const displayName = name || defaultProjectFileName(projectNameRef.current);
        showToast("success", `已导入工程：${displayName}（${imported.length} 条记录）`);
        syncToBackend(text, displayName);
      } catch (error) {
        log.error("[工程] 导入工程失败:", error);
        showToast("error", `导入工程失败：${errorText(error)}`);
      } finally {
        importingRef.current = false;
      }
    },
    [showToast, syncToBackend],
  );

  /**
   * @function 采用"文本转记录"解析出来的记录
   * 后端解析结果是后端字段格式（audioId 等），这里统一归一化成前端结构；
   * 另外这批记录还没有对应的工程文件，所以清空文件关联：
   * 之后按 Ctrl+S 会先让用户选择保存位置，而不会覆盖之前导入的工程文件。
   */
  const adoptParsedRecords = useCallback(
    (parsed: Record[]) => {
      const normalized = normalizeRecords(parsed);
      setRecords(normalized);
      // 文本转记录的结果没有分组信息，从零开始
      setGroups([]);
      setSelectedRecordIndex(0);
      setActivePropertyTab("text");
      setFilePath(null);
      filePathRef.current = null;
      showToast("info", `已载入 ${normalized.length} 条记录，按 Ctrl+S 可保存为工程文件`);
    },
    [showToast],
  );

  /**
   * @function 新建工程
   *
   * <p>流程：先问「保存并新建 / 不保存 / 取消」，再清空剧情列表。
   * 破坏性操作的兜底都放在这里：
   * - 点「取消」什么都不动；
   * - 选「保存并新建」但保存失败 / 用户在保存对话框里点了取消 → **不清空**（宁可不清，也不能丢内容）；
   * - 空工程没什么可保存的，直接新建，不打扰用户。
   *
   * <p>清空后把关联文件置空：新工程还没有文件名，Ctrl+S 会先让选保存位置，
   * 不会把上一个工程的文件覆盖掉。
   *
   * <p>清空后的"空列表"由编辑器补一条空白记录（见 RecordEditor 的空工程补全），
   * 所以用户点完就能直接编辑；这里只负责把工程状态归零并把代次 +1。
   */
  const newProject = useCallback(async () => {
    if (creatingProjectRef.current) return;
    const currentRecords = recordsRef.current;
    if (currentRecords === undefined) {
      showToast("info", "工程还在加载中，请稍候再新建");
      return;
    }

    creatingProjectRef.current = true;
    try {
      let savedCurrent = false;

      if (currentRecords.length > 0) {
        const target = filePathRef.current;
        const choice = await askChoice({
          title: "新建工程",
          message: "是否保存当前工程？",
          detail: `${currentRecords.length} 条剧情记录${
            target ? `（当前关联 ${fileNameOf(target)}）` : "（尚未保存到工程文件）"
          }。\n选择「不保存」后，这些内容将无法找回。`,
          extraLabel: "不保存",
          confirmLabel: "保存并新建",
          cancelLabel: "取消",
        });

        if (choice === "cancel") {
          showToast("info", "已取消新建工程");
          return;
        }
        if (choice === "confirm") {
          savedCurrent = await saveProject();
          if (!savedCurrent) return;
        }
      }

      setRecords([]);
      setGroups([]);
      setSelectedRecordIndex(0);
      setActivePropertyTab("text");
      setFilePath(null);
      filePathRef.current = null;
      setProjectGeneration((generation) => generation + 1);
      showToast("success", savedCurrent ? "已保存并新建工程" : "已新建工程");

      // 后端那份 data/records.json 也换成空工程：它只是"启动时的初始数据"，
      // 不一起清掉的话，重启软件时旧记录又会被当成初始工程加载回来。
      syncToBackend(
        serializeProject([], [], { stayFrames: stayFramesRef.current }),
        defaultProjectFileName(projectNameRef.current),
      );
    } finally {
      creatingProjectRef.current = false;
    }
  }, [saveProject, showToast, syncToBackend]);

  /**
   * Ctrl+S 快捷键：拦截浏览器"保存网页"的默认行为，转为保存工程。
   * Electron 里菜单项"保存项目"也绑定了 CmdOrCtrl+S（菜单快捷键会先于页面 keydown 生效），
   * 所以菜单事件在 App 里也接到了同一个 saveProject 上，两条路都能保存。
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const isSaveKey = event.code === "KeyS" || event.key?.toLowerCase() === "s";
      if (!isSaveKey) return;
      event.preventDefault();
      event.stopPropagation();
      saveProject();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveProject]);

  return {
    records,
    setRecords,
    groups,
    setGroups,
    selectedRecordIndex,
    setSelectedRecordIndex,
    activePropertyTab,
    setActivePropertyTab,
    filePath,
    fileName: filePath ? fileNameOf(filePath) : null,
    projectGeneration,
    isLoadingProject,
    toast,
    dismissToast,
    showToast,
    saveProject,
    importProject,
    newProject,
    adoptParsedRecords,
  };
}
