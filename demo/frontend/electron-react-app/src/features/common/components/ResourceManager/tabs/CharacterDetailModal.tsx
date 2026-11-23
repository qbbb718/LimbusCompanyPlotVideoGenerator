import React, { useState, useRef, useEffect, useMemo } from "react";
import { MyCharacter, Portrait, Emotion } from "@types";
import ApiService from "@services/ApiService";
import { AppConfig } from "@root/features/common/config/appConfig";
import "./CharacterModal.css";
import CharacterInfoSection from "./CharacterDetailModal/CharacterInfoSection";
import TagsSection from "./CharacterDetailModal/TagsSection";
import PortraitsSection from "./CharacterDetailModal/PortraitsSection";
import type {
  PortraitBatchMessage,
  PortraitBatchProgress,
} from "./CharacterDetailModal/PortraitsSection";
import PortraitModal from "./PortraitModal";
import {
  applyPortraitOrder,
  buildPortraitImageUrl,
  getDefaultPortrait,
  isDefaultPortraitId,
  loadPortraitImageSize,
  markDefaultPortrait,
  movePortrait,
  normalizePortraitDefaults,
  portraitIdsOf,
} from "@features/common/utils/portraitUtils";
import type { PortraitDropPosition } from "@features/common/utils/portraitUtils";
import {
  CropRect,
  CropScaleMode,
  ImageSize,
  PortraitCropState,
  isValidCropState,
  resolveDefaultCropRect,
  toCropRatio,
} from "@features/common/utils/portraitCrop";
import {
  buildImportedPortrait,
  collectCropUpdateTargets,
  collectSelectedCropTargets,
  collectSelectedPortraits,
  areAllPortraitsSelected,
  describeCropBatchResult,
  describeDeleteBatchResult,
  hasPortraitName,
  isSameCrop,
  portraitCropOf,
  pruneSelectedIds,
  stripFileExtension,
  toggleSelectedAll,
  toggleSelectedId,
} from "@features/common/utils/portraitBatch";
import type {
  PortraitCropBatchOutcome,
  PortraitDeleteBatchOutcome,
} from "@features/common/utils/portraitBatch";
import {
  createCroppedImageFromElement,
  loadImageElement,
} from "@features/common/utils/imageUtils";
import { describeApiError } from "@features/common/utils/apiError";
import { askConfirm } from "@features/common/components/ConfirmDialog";

/** 批量导入时挑出来的一张图 */
interface PickedPortraitFile {
  file: File;
  fileName: string;
}

/**
 * 批量挑选立绘文件。
 *
 * <p>Electron 下走主进程的多选对话框（能拿到真实文件名，中文名不会被 URL 化）；
 * 浏览器开发模式下退化成 `<input type="file" multiple>`。
 */
const pickPortraitFiles = async (): Promise<PickedPortraitFile[]> => {
  const electronAPI = window.electronAPI;

  if (electronAPI?.openImageFiles) {
    const result = await electronAPI.openImageFiles();
    if (!result || result.canceled || !result.filePaths?.length) {
      return [];
    }

    const picked: PickedPortraitFile[] = [];
    for (const filePath of result.filePaths) {
      const fileName = filePath.split(/[\\/]/).pop() || "portrait.png";
      const extension = (fileName.split(".").pop() || "png").toLowerCase();
      const buffer = await electronAPI.readFile(filePath);
      const blob = new Blob([new Uint8Array(buffer)]);
      picked.push({
        file: new File([blob], fileName, { type: `image/${extension}` }),
        fileName,
      });
    }
    return picked;
  }

  return new Promise<PickedPortraitFile[]>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      resolve(files.map((file) => ({ file, fileName: file.name })));
    });
    // 用户取消（Chromium 支持 cancel 事件；不支持时只能等下一次选择）
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
};

interface CharacterDetailModalProps {
  character: MyCharacter | null;
  onClose: () => void;
  onSave: (character: MyCharacter) => void;
  onDelete?: (characterId: string, deleteFiles: boolean) => void;
  isNewCharacter: boolean;
  portraits: Portrait[];
  /**
   * 拖拽排序保存成功后，把新的立绘顺序同步回父组件的角色列表。
   *
   * <p>只影响父组件里"下次打开用"的那份数据，**不改**本弹窗的 `character` prop：
   * 否则父组件用旧的角色字段重建数据，会把用户还没保存的名称 / 标签等编辑一起冲掉。
   * 没有这个回调时（单测直接渲染本组件）只更新弹窗内部状态。
   */
  onPortraitsChange?: (portraits: Portrait[]) => void;
}

/** 把 0~1 的比例写成百分比（25% / 12.5%），确认框和结果提示里给用户看 */
const formatCropPercent = (ratio: number): string =>
  `${Math.round(ratio * 1000) / 10}%`;

/**
 * 角色详情模态框组件
 * 用于展示和编辑角色信息，包括基本信息、标签和立绘等
 */
const CharacterDetailModal: React.FC<CharacterDetailModalProps> = ({
  character,
  onClose,
  onSave,
  onDelete,
  isNewCharacter,
  portraits,
  onPortraitsChange,
}) => {
  // 编辑中的角色状态，初始化时传入角色数据或为null。
  // 立绘保持数据里的顺序（后端 display_order / 用户拖拽结果），只把默认标记归一化：
  // 默认立绘可以在任意位置，角标必须跟着那张卡片走，不能靠"首项"兜底。
  const [editingCharacter, setEditingCharacter] = useState<MyCharacter | null>(
    character
      ? {
          ...character,
          portraits: normalizePortraitDefaults(character.portraits),
        }
      : null,
  );
  // 颜色选择器显示状态，控制文本和背景颜色选择器的显示
  const [showColorPicker, setShowColorPicker] = useState<{
    text: boolean;
    bg: boolean;
  }>({ text: false, bg: false });
  // 删除确认对话框显示状态
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // 是否删除相关文件的选项（默认勾选，删除角色时连同文件一并清理）
  const [deleteFiles, setDeleteFiles] = useState(true);
  // 立绘编辑模态框显示状态
  const [showPortraitModal, setShowPortraitModal] = useState(false);
  // 当前正在编辑的立绘数据
  const [editingPortrait, setEditingPortrait] = useState<Portrait | null>(null);
  // 是否正在添加新立绘
  const [isAddingNewPortrait, setIsAddingNewPortrait] = useState(false);
  // 追踪角色是否已存入后端。新角色在添加立绘前会自动保存，
  // 这样立绘上传时后端能找到对应角色，避免"角色不存在"错误。
  const [characterPersisted, setCharacterPersisted] = useState(!isNewCharacter);
  // 文件输入引用，用于触发文件选择
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- 保存状态 ----
  // 只用来置灰「保存」按钮 + 显示"保存中…"，**不**用来禁用/重建表单控件：
  // 受控输入框一旦被 disabled 或 remount 就会丢焦点，用户会以为"输入框坏了"。
  const [saving, setSaving] = useState(false);
  // 保存失败的提示（就地显示，不用 alert：alert 会抢走焦点，关掉后输入框就没法接着打字了）
  const [saveError, setSaveError] = useState<string | null>(null);

  // ---- 拖拽排序 ----
  // 正在把新顺序写回后端：期间禁止再次拖动 / 保存，避免两次请求乱序落库。
  const [reordering, setReordering] = useState(false);
  const reorderingRef = useRef(false);

  // ---- 立绘批量操作（批量套用默认立绘裁剪 / 批量导入立绘 / 多选批量操作）----
  const [batchProgress, setBatchProgress] =
    useState<PortraitBatchProgress | null>(null);
  const [batchMessage, setBatchMessage] =
    useState<PortraitBatchMessage | null>(null);
  // 多选模式：进入后立绘卡片上出现勾选框，标题行下方出现批量操作条
  const [selectionMode, setSelectionMode] = useState(false);
  // 已勾选的立绘 ID。用 Set 存（勾选状态是"有没有"，不需要顺序）
  const [selectedPortraitIds, setSelectedPortraitIds] = useState<Set<string>>(
    new Set(),
  );
  /**
   * 缩略图代次表：立绘ID → 代次。
   *
   * <p>缩略图文件名是固定的 `thumbnail_{portraitId}.png`，裁剪完再保存时后端**覆盖**同名文件，
   * 路径一个字都不变。浏览器缓存按地址认图，所以列表里还是旧头部的缩略图 ——
   * 要关掉角色弹窗重新打开（列表重新挂载、换了地址）才会变。这里给改过的那张立绘 +1，
   * `PortraitThumbnail` 据此换一个 `?t=` 时间戳重新取图，保存完当场就换。
   *
   * <p>刻意按立绘分别记，而不是全局一个版本号：一次批量导入 40 多张时，
   * 全局版本号会让每一张缩略图都重新下载一遍。
   */
  const [thumbnailVersions, setThumbnailVersions] = useState<
    Record<string, number>
  >({});

  /**
   * @function 让指定立绘的缩略图重新取图
   * @param portraitIds 缩略图文件在磁盘上被覆盖过的立绘ID
   */
  const bumpThumbnailVersions = (portraitIds: string[]) => {
    if (portraitIds.length === 0) return;
    setThumbnailVersions((prev) => {
      const next = { ...prev };
      for (const portraitId of portraitIds) {
        next[portraitId] = (next[portraitId] ?? 0) + 1;
      }
      return next;
    });
  };

  /**
   * 批量进度上报节流。
   *
   * <p>一次批量导入 42 张立绘时，如果每张都 setState，整个弹窗（含几十张卡片）就要
   * 重渲染 42 次，主线程被 React 渲染 + 图片解码占满，输入框就会表现为"打字没反应"。
   * 这里限制为最多约 10 次/秒，最后一张强制上报一次，进度条依然平滑。
   */
  const lastProgressAtRef = useRef(0);
  const reportBatchProgress = (progress: PortraitBatchProgress | null) => {
    if (progress === null) {
      lastProgressAtRef.current = 0;
      setBatchProgress(null);
      return;
    }
    const now = Date.now();
    const isLast = progress.done + 1 >= progress.total;
    if (isLast || now - lastProgressAtRef.current >= 100) {
      lastProgressAtRef.current = now;
      setBatchProgress(progress);
    }
  };

  // 默认立绘及其裁剪参数（批量动作的目标）
  const defaultPortrait = useMemo(
    () => getDefaultPortrait(editingCharacter?.portraits),
    [editingCharacter?.portraits],
  );
  const defaultPortraitCrop = useMemo<PortraitCropState | null>(() => {
    if (!defaultPortrait) return null;
    const crop = portraitCropOf(defaultPortrait);
    return isValidCropState(crop) ? crop : null;
  }, [defaultPortrait]);
  // 需要改裁剪的立绘（默认立绘本身不算）：
  // 为空时按钮直接置灰，用户不用点进去才知道"没得改"。
  // 这里不按像素判断"已经一致"——改成按比例换算后，同一组像素值在不同尺寸的
  // 原图上并不等价，是否真的需要改要等读到原图尺寸才知道（执行时逐张比较）。
  const defaultCropTargets = useMemo(
    () =>
      defaultPortrait && defaultPortraitCrop
        ? collectCropUpdateTargets(
            editingCharacter?.portraits,
            defaultPortrait.portraitID,
          )
        : [],
    [editingCharacter?.portraits, defaultPortrait, defaultPortraitCrop],
  );

  // ---- 多选相关的派生状态 ----
  // 已选中的立绘：只算**还在列表里**的那些（删掉之后 Set 里可能还留着旧 ID）
  const selectedPortraits = useMemo(
    () =>
      collectSelectedPortraits(
        editingCharacter?.portraits,
        selectedPortraitIds,
      ),
    [editingCharacter?.portraits, selectedPortraitIds],
  );
  // 已选中、且需要套用默认裁剪的立绘：默认立绘本身跳过（它就是要套用的来源）
  const selectedCropTargets = useMemo(
    () =>
      collectSelectedCropTargets(
        editingCharacter?.portraits,
        selectedPortraitIds,
        defaultPortrait?.portraitID,
      ),
    [editingCharacter?.portraits, selectedPortraitIds, defaultPortrait],
  );
  const allPortraitsSelected = useMemo(
    () =>
      areAllPortraitsSelected(
        editingCharacter?.portraits,
        selectedPortraitIds,
      ),
    [editingCharacter?.portraits, selectedPortraitIds],
  );
  /**
   * 「沿用默认立绘裁剪」为什么不能用（null = 可以用）。
   *
   * <p>按钮的 title 直接显示这句，用户不用点进去才知道是"没默认立绘"还是"只选了默认立绘"。
   */
  const selectedCropDisabledReason = useMemo(() => {
    if (!defaultPortrait) {
      return "还没有默认立绘：先编辑一张立绘并「设为默认」，才有可沿用的裁剪";
    }
    if (!defaultPortraitCrop) {
      return `默认立绘「${defaultPortrait.portName}」还没框好头部：先编辑它，把裁剪框框在脸上`;
    }
    if (selectedPortraits.length === 0) {
      return "先勾选要套用裁剪的立绘";
    }
    if (selectedCropTargets.length === 0) {
      return "选中的只有默认立绘本身，它不需要套用自己的裁剪";
    }
    return null;
  }, [
    defaultPortrait,
    defaultPortraitCrop,
    selectedPortraits,
    selectedCropTargets,
  ]);
  const batchDeleteDisabledReason =
    selectedPortraits.length === 0 ? "先勾选要删除的立绘" : null;

  /**
   * 列表里的立绘变了（批量导入 / 删除 / 切角色）就顺手清掉已经不存在于列表的勾选，
   * 避免「已选 3 张」比实际卡片多、批量按钮误判成还有得删。
   */
  useEffect(() => {
    setSelectedPortraitIds((prev) => {
      const next = pruneSelectedIds(prev, editingCharacter?.portraits);
      // 内容没变就返回原引用：否则每次立绘列表变化都会多一次无意义的重渲染
      const sameContent =
        next.size === prev.size &&
        Array.from(next).every((portraitId) => prev.has(portraitId));
      return sameContent ? prev : next;
    });
  }, [editingCharacter?.portraits]);

  // 图片缓存状态，避免重复加载
  const [loadedImages, setLoadedImages] = useState<{ [key: string]: string }>(
    {},
  );

  // 追踪正在加载的图片，防止重复加载
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());

  // 使用useRef来持久化缓存，避免组件重新渲染时丢失
  const imageCacheRef = useRef<{ [key: string]: string }>({});

  // 只在角色ID真正变化时清空缓存
  useEffect(() => {
    const currentCharacterID = editingCharacter?.characterID;
    const previousCharacterID = imageCacheRef.current._lastCharacterID;

    if (currentCharacterID !== previousCharacterID) {
      console.log("[CharacterDetailModal] 角色ID变化，清空缓存", {
        previousCharacterID,
        currentCharacterID,
        characterName: editingCharacter?.characterName,
        previousCacheSize: Object.keys(imageCacheRef.current).length,
      });

      // 保留当前角色的缓存，只清空其他角色的缓存
      const newCache: { [key: string]: string } = {};
      Object.keys(imageCacheRef.current).forEach((key) => {
        if (key.startsWith(currentCharacterID + "_")) {
          newCache[key] = imageCacheRef.current[key];
        }
      });

      imageCacheRef.current = newCache;
      if (currentCharacterID) {
        imageCacheRef.current._lastCharacterID = currentCharacterID;
      }
      setLoadedImages(newCache);
    }
  }, [editingCharacter?.characterID]);

  /**
   * 确保角色已存入后端（新角色第一次加立绘 / 批量导入前静默保存）。
   *
   * <p>不先保存的话，上传立绘时后端会报"角色不存在"。
   * 返回最新的角色数据：`setEditingCharacter` 是异步的，当前作用域里的
   * `editingCharacter` 还是旧值，所以这里显式回传。
   */
  const ensureCharacterPersisted = async (): Promise<MyCharacter | null> => {
    if (!editingCharacter) return null;
    if (characterPersisted) return editingCharacter;

    try {
      console.log("[CharacterDetailModal] 立绘操作前自动保存新角色");
      const saved = await ApiService.addCharacter(editingCharacter);
      // 保留本地已有的立绘列表（后端返回的可能不包含）
      const nextCharacter: MyCharacter = {
        ...saved,
        portraits: editingCharacter.portraits || [],
      };
      setEditingCharacter(nextCharacter);
      setCharacterPersisted(true);
      return nextCharacter;
    } catch (error) {
      console.error("[CharacterDetailModal] 自动保存角色失败:", error);
      alert("保存角色失败，请先点击「保存」按钮保存角色后再添加立绘");
      return null;
    }
  };

  const handleAddPortrait = async () => {
    // 新角色尚未存入后端时，先静默保存。
    // 否则 PortraitModal 上传立绘时后端会报"角色不存在"。
    const currentCharacter = await ensureCharacterPersisted();
    if (!currentCharacter) return;

    // 获取角色的默认立绘裁剪状态
    const defaultPortraitData = getDefaultPortrait(currentCharacter.portraits);
    const defaultCropState = defaultPortraitData
      ? {
          faceX: defaultPortraitData.faceX || 0,
          faceY: defaultPortraitData.faceY || 0,
          length: defaultPortraitData.length || 100,
        }
      : {
          faceX: 0,
          faceY: 0,
          length: 100,
        };

    // 创建一个带有默认裁剪状态的空立绘对象
    const defaultPortrait: Portrait = {
      portraitID: `portrait_${Date.now()}`,
      characterID: currentCharacter.characterID,
      imagePath: "",
      portName: "",
      emotion: Emotion.NORMAL,
      faceX: defaultCropState.faceX,
      faceY: defaultCropState.faceY,
      length: defaultCropState.length,
      adjX: 0,
      adjY: 0,
      thumbnailPath: "",
    };

    setEditingPortrait(defaultPortrait);
    setIsAddingNewPortrait(true);
    setShowPortraitModal(true);
    console.log("[CharacterDetailModal] 开始添加新立绘", {
      portraitId: defaultPortrait.portraitID,
      characterId: currentCharacter.characterID,
    });
  };

  /**
   * 生成一张立绘的缩略图并上传，返回新的 thumbnailPath。
   *
   * <p>失败不抛错：裁剪值本身仍然要写进立绘，缩略图只是显示用。
   */
  const regeneratePortraitThumbnail = async (
    characterId: string,
    portraitId: string,
    image: HTMLImageElement,
    crop: { left: number; top: number; width: number; height: number },
  ): Promise<string | null> => {
    try {
      const blob = await createCroppedImageFromElement(image, crop);
      const formData = new FormData();
      formData.append("file", blob, `thumbnail_${portraitId}.png`);
      return await ApiService.uploadPortraitThumbnail(
        characterId,
        portraitId,
        formData,
      );
    } catch (error) {
      console.warn(
        "[CharacterDetailModal] 立绘缩略图生成/上传失败",
        portraitId,
        error,
      );
      return null;
    }
  };

  // ---- 多选模式 ----

  /** 进入多选模式（每次进入都从"一张都没选"开始） */
  const enterSelectionMode = () => {
    setSelectionMode(true);
    setSelectedPortraitIds(new Set());
  };

  /** 退出多选模式并清空勾选 */
  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedPortraitIds(new Set());
  };

  /** 勾选 / 取消勾选一张立绘 */
  const handleTogglePortraitSelection = (portraitId: string) => {
    setSelectedPortraitIds((prev) => toggleSelectedId(prev, portraitId));
  };

  /** 全选 / 取消全选（只作用于当前列表里的立绘） */
  const handleToggleSelectAllPortraits = () => {
    setSelectedPortraitIds((prev) =>
      toggleSelectedAll(editingCharacter?.portraits, prev),
    );
  };

  /**
   * 拖拽排序：先**立即**更新本地顺序（界面即时响应），再把新顺序写回后端。
   *
   * <p>默认立绘不参与任何特殊处理：它可以被拖动，也可以是其它立绘的落点。
   *
   * <p>保存失败时按拖动前的 ID 顺序回滚，并给出一条错误提示。
   * 回滚只恢复**顺序**，期间改过的裁剪 / 默认标记 / 新加的立绘不会被旧快照覆盖。
   * 正在保存时忽略新的拖动，保证请求按用户操作顺序落库。
   *
   * <p>新角色还没入库（{@code characterPersisted=false}）时只改本地顺序，
   * 随后点「保存」会随角色一起写入，不会为一个还不存在的角色发请求。
   */
  const handleReorderPortrait = async (
    fromPortraitId: string,
    toPortraitId: string,
    position: PortraitDropPosition,
  ) => {
    if (!editingCharacter || reorderingRef.current || saving) {
      return;
    }

    const current = editingCharacter.portraits ?? [];
    const next = movePortrait(current, fromPortraitId, toPortraitId, position);
    // 落点算出来和原来一样（含只有一张立绘的情况）：没有可保存的变化，不报错
    if (next === current) {
      return;
    }

    const beforeOrder = portraitIdsOf(current);
    reorderingRef.current = true;
    setReordering(true);
    setBatchMessage(null);
    setEditingCharacter((prev) =>
      prev ? { ...prev, portraits: next } : prev,
    );

    try {
      if (characterPersisted) {
        await ApiService.reorderPortraits(
          editingCharacter.characterID,
          portraitIdsOf(next),
        );
      }
    } catch (error) {
      console.error("[CharacterDetailModal] 拖拽排序保存失败:", error);
      setEditingCharacter((prev) =>
        prev
          ? { ...prev, portraits: applyPortraitOrder(prev.portraits, beforeOrder) }
          : prev,
      );
      setBatchMessage({
        kind: "error",
        text: `拖拽排序未保存，已恢复原顺序。${describeApiError(
          error,
          "请重试",
        )}`,
      });
      return;
    } finally {
      reorderingRef.current = false;
      setReordering(false);
    }

    // 同步给父组件：关掉弹窗再打开时拿到的是已经排好的顺序（不用刷新页面）。
    // 放在 try 外面：父组件的回调不应影响"保存成功"的判定。
    onPortraitsChange?.(next);
  };

  /**
   * 把 `targets` 的裁剪逐张改成默认立绘的裁剪（**执行核心**：不确认、不碰选中状态）。
   *
   * <p>裁剪值存的是原图像素，所以调用方先读默认立绘自己的原图尺寸，把它的框换成
   * 「中心点 + 边长占宽度的比例」；这里逐张按各自原图尺寸落到图上，并夹进图片范围，
   * 写回的是**夹取后的实际坐标**（否则会出现"框在图里、存下来的坐标在图外"）。
   * 读不到目标原图尺寸时退回按像素照搬（老行为）。
   * 改完重生成缩略图，不然列表里看到的还是旧头部的图。
   *
   * <p>单张失败不影响整批：记下它的 ID / 名字交回调用方，由调用方决定要不要保留选中重试。
   */
  const runDefaultCropBatch = async (params: {
    characterId: string;
    targets: Portrait[];
    defaultCrop: PortraitCropState;
    defaultImageSize: ImageSize | null;
    mode: CropScaleMode;
  }) => {
    const { characterId, targets, defaultCrop, defaultImageSize, mode } =
      params;
    const updatedPortraits = new Map<string, Portrait>();
    const failedIds: string[] = [];
    const failedNames: string[] = [];
    let adjustedCount = 0;
    let unchangedCount = 0;
    let imageFailedCount = 0;
    let thumbnailFailedCount = 0;

    for (let index = 0; index < targets.length; index++) {
      const portrait = targets[index];
      reportBatchProgress({ kind: "crop", done: index, total: targets.length });

      try {
        // 先按"图片尺寸未知"取一份兜底值（原图读不到时至少让数值一致）
        let rect: CropRect | null = resolveDefaultCropRect({
          crop: defaultCrop,
          imageSize: null,
        }).rect;
        if (!rect) {
          throw new Error("默认立绘没有有效的裁剪框");
        }

        let image: HTMLImageElement | null = null;
        try {
          image = await loadImageElement(
            buildPortraitImageUrl(portrait.imagePath),
          );
          const resolved = resolveDefaultCropRect({
            crop: defaultCrop,
            sourceImageSize: defaultImageSize,
            imageSize: {
              width: image.naturalWidth,
              height: image.naturalHeight,
            },
          });
          if (resolved.rect) {
            rect = resolved.rect;
            if (resolved.adjusted) adjustedCount += 1;
          }
        } catch (error) {
          imageFailedCount += 1;
          console.warn(
            "[CharacterDetailModal] 批量改裁剪：原图加载失败，只改数值",
            portrait.portName,
            error,
          );
        }

        // 比例换算后算出来还是原来的框：不用重算缩略图（不同尺寸的图很少刚好相同）
        const nextCrop = {
          faceX: rect.left,
          faceY: rect.top,
          length: rect.width,
        };
        if (isSameCrop(portraitCropOf(portrait), nextCrop)) {
          unchangedCount += 1;
          continue;
        }

        let thumbnailPath = portrait.thumbnailPath;
        if (image) {
          const uploadedThumbnail = await regeneratePortraitThumbnail(
            characterId,
            portrait.portraitID,
            image,
            rect,
          );
          if (uploadedThumbnail) {
            thumbnailPath = uploadedThumbnail;
          } else {
            thumbnailFailedCount += 1;
          }
        }

        updatedPortraits.set(portrait.portraitID, {
          ...portrait,
          ...nextCrop,
          thumbnailPath,
        });
      } catch (error) {
        // 这张彻底没改成（算不出框 / 意外异常）：不能算进"已更新"，记为失败项
        failedIds.push(portrait.portraitID);
        failedNames.push(portrait.portName);
        console.error(
          "[CharacterDetailModal] 批量改裁剪：这张立绘没改成功",
          portrait.portName,
          error,
        );
      }
    }

    reportBatchProgress(null);

    if (updatedPortraits.size > 0) {
      setEditingCharacter((prev) =>
        prev
          ? {
              ...prev,
              portraits: (prev.portraits || []).map(
                (portrait) =>
                  updatedPortraits.get(portrait.portraitID) ?? portrait,
              ),
            }
          : prev,
      );
      // 只刷新真的重算过缩略图的那几张，其它立绘的 <img> 不动
      bumpThumbnailVersions(Array.from(updatedPortraits.keys()));
    }

    const outcome: PortraitCropBatchOutcome = {
      mode,
      updated: updatedPortraits.size,
      unchanged: unchangedCount,
      adjusted: adjustedCount,
      imageFailed: imageFailedCount,
      thumbnailFailed: thumbnailFailedCount,
      failed: failedNames,
    };
    return { outcome, failedIds };
  };

  /**
   * 「与默认立绘裁剪一致」：把默认立绘以外的**所有**立绘，裁剪框都按默认立绘的
   * **比例**套用（原图尺寸不同也能保持同样的头部比例）。
   */
  const handleApplyDefaultCropToAll = async () => {
    if (!editingCharacter) return;

    if (!defaultPortrait || !defaultPortraitCrop) {
      setBatchMessage({
        kind: "error",
        text: "还没有可用的默认立绘裁剪：先设一张默认立绘，并在「编辑立绘」里框好它的头部。",
      });
      return;
    }

    const targets = defaultCropTargets;

    if (targets.length === 0) {
      setBatchMessage({
        kind: "info",
        text: "角色只有这一张默认立绘，没有需要套用裁剪的其它立绘。",
      });
      return;
    }

    // 读尺寸期间先置忙，避免用户连点两次弹出两个确认框
    reportBatchProgress({ kind: "crop", done: 0, total: targets.length });
    // 按比例换算必须先知道默认立绘自己的原图尺寸（库里只存了像素值）
    const defaultImageSize = await loadPortraitImageSize(
      defaultPortrait.imagePath,
    );
    reportBatchProgress(null);
    const defaultRatio = toCropRatio(defaultPortraitCrop, defaultImageSize);
    const modeText = defaultRatio
      ? `按默认立绘「${defaultPortrait.portName}」的比例套用（头部框占原图宽度 ${formatCropPercent(
          defaultRatio.sideRatio,
        )}，原图 ${defaultImageSize?.width}×${defaultImageSize?.height}）`
      : `按像素照搬默认立绘「${defaultPortrait.portName}」的裁剪值（读不到它的原图尺寸）`;

    const confirmed = await askConfirm({
      title: "与默认立绘裁剪一致",
      message: `将把 ${targets.length} 张立绘的裁剪${modeText}，并重新生成这些立绘的缩略图。`,
      confirmLabel: "开始应用",
    });
    if (!confirmed) return;

    setBatchMessage(null);
    const { outcome } = await runDefaultCropBatch({
      characterId: editingCharacter.characterID,
      targets,
      defaultCrop: defaultPortraitCrop,
      defaultImageSize,
      mode: defaultRatio ? "ratio" : "pixel",
    });
    setBatchMessage(describeCropBatchResult(outcome, "all"));
  };

  /**
   * 「沿用默认立绘裁剪」（多选模式，只改**选中的**那几张）。
   *
   * <p>与「与默认立绘裁剪一致」的区别：那个动全部立绘，这个只动勾选的；
   * 默认立绘本身跳过（它就是要沿用的来源）。
   *
   * <p>这里不再二次确认：范围是用户一张张勾出来的，按钮上还写着张数，
   * 而裁剪改错可以再编辑回来（真正破坏性的「删除」才必须确认）。
   */
  const handleApplyDefaultCropToSelected = async () => {
    if (!editingCharacter) return;

    if (!defaultPortrait || !defaultPortraitCrop) {
      setBatchMessage({
        kind: "error",
        text:
          selectedCropDisabledReason ??
          "还没有可用的默认立绘裁剪：先设一张默认立绘，并在「编辑立绘」里框好它的头部。",
      });
      return;
    }

    const targets = selectedCropTargets;
    if (targets.length === 0) {
      setBatchMessage({
        kind: "info",
        text: selectedCropDisabledReason ?? "先勾选要套用裁剪的立绘。",
      });
      return;
    }

    // 读尺寸期间先置忙，避免连点两次同时跑两批
    reportBatchProgress({ kind: "crop", done: 0, total: targets.length });
    // 按比例换算必须先知道默认立绘自己的原图尺寸（库里只存了像素值）
    const defaultImageSize = await loadPortraitImageSize(
      defaultPortrait.imagePath,
    );
    const defaultRatio = toCropRatio(defaultPortraitCrop, defaultImageSize);
    setBatchMessage(null);

    const { outcome, failedIds } = await runDefaultCropBatch({
      characterId: editingCharacter.characterID,
      targets,
      defaultCrop: defaultPortraitCrop,
      defaultImageSize,
      mode: defaultRatio ? "ratio" : "pixel",
    });
    setBatchMessage(describeCropBatchResult(outcome, "selected"));

    // 全部成功 → 清空选中并退出多选；有失败 → 只保留失败项，留在多选里直接重试
    if (failedIds.length > 0) {
      setSelectedPortraitIds(new Set(failedIds));
      setSelectionMode(true);
    } else {
      exitSelectionMode();
    }
  };

  /**
   * 「批量删除」：逐张调删除接口，某一张失败不影响其它张。
   *
   * <p>删除**不可恢复**，所以一定先确认：确认框写明张数；选中默认立绘时再多一段说明
   * （与单张删除的约定一致：删掉默认立绘后，后端会把剩下的第一张提为默认，这里同步本地标记）。
   *
   * <p>部分失败时只保留失败项、留在多选模式里，用户直接再点一次「删除」就能重试。
   */
  const handleBatchDeleteSelected = async () => {
    if (!editingCharacter) return;

    const targets = selectedPortraits;
    if (targets.length === 0) {
      setBatchMessage({ kind: "info", text: "先勾选要删除的立绘。" });
      return;
    }

    const characterId = editingCharacter.characterID;
    const portraitsBeforeDelete = editingCharacter.portraits || [];
    const includesDefault = targets.some((portrait) =>
      isDefaultPortraitId(portraitsBeforeDelete, portrait.portraitID),
    );

    const confirmed = await askConfirm({
      title: "批量删除立绘",
      message: `确定要删除选中的 ${targets.length} 张立绘吗？删除后不可恢复。`,
      detail: includesDefault
        ? "选中的里面包含默认立绘：删除后会自动把剩下的第一张设为新的默认立绘；全删光时这个角色就没有立绘了。"
        : undefined,
      confirmLabel: `删除 ${targets.length} 张`,
      danger: true,
    });
    if (!confirmed) return;

    setBatchMessage(null);
    const deletedIds: string[] = [];
    const failed: { portName: string; reason: string }[] = [];
    const failedIds: string[] = [];
    let defaultDeleted = false;

    for (let index = 0; index < targets.length; index++) {
      const portrait = targets[index];
      reportBatchProgress({
        kind: "delete",
        done: index,
        total: targets.length,
      });
      try {
        await ApiService.deletePortrait(characterId, portrait.portraitID);
        deletedIds.push(portrait.portraitID);
        if (isDefaultPortraitId(portraitsBeforeDelete, portrait.portraitID)) {
          defaultDeleted = true;
        }
      } catch (error) {
        console.error(
          "[CharacterDetailModal] 批量删除：这张立绘删除失败",
          portrait.portName,
          error,
        );
        failed.push({
          portName: portrait.portName,
          reason: describeApiError(error, "删除失败"),
        });
        failedIds.push(portrait.portraitID);
      }
    }

    reportBatchProgress(null);

    // 本地同步删成功的那些。删掉的是默认立绘时，把剩下的第一张提为默认
    // （后端删除接口做同样的事，这里同步标记，保证这次「保存」传回去的 defaultPortrait 和库里一致）
    let promotedDefaultName: string | null = null;
    if (deletedIds.length > 0) {
      const deletedSet = new Set(deletedIds);
      const remaining = portraitsBeforeDelete.filter(
        (portrait) => !deletedSet.has(portrait.portraitID),
      );
      if (defaultDeleted && remaining.length > 0) {
        promotedDefaultName = remaining[0].portName;
      }
      setEditingCharacter((prev) =>
        prev
          ? {
              ...prev,
              portraits:
                defaultDeleted && remaining.length > 0
                  ? markDefaultPortrait(remaining, remaining[0].portraitID)
                  : remaining,
            }
          : prev,
      );
    }

    const deleteOutcome: PortraitDeleteBatchOutcome = {
      deleted: deletedIds.length,
      failed,
      defaultDeleted,
      promotedDefaultName,
    };
    setBatchMessage(describeDeleteBatchResult(deleteOutcome));

    // 全部成功 → 清空选中并退出多选；有失败 → 只保留失败项，留在多选里直接重试
    if (failedIds.length > 0) {
      setSelectedPortraitIds(new Set(failedIds));
      setSelectionMode(true);
    } else {
      exitSelectionMode();
    }
  };

  /**
   * 「批量导入立绘」：一次选多张图，逐张上传原图 + 生成缩略图后加进立绘列表。
   *
   * <p>若角色已有可用的默认立绘，导入的立绘按默认立绘的**比例**套用裁剪
   * （原图尺寸不同也能保持同样的头部比例），再按各自原图尺寸夹进图片。
   */
  const handleBatchImportPortraits = async () => {
    // 先选文件：用户取消就什么都不做（不必为了取消而先把新角色存进后端）
    let pickedFiles: PickedPortraitFile[] = [];
    try {
      pickedFiles = await pickPortraitFiles();
    } catch (error) {
      console.error("[CharacterDetailModal] 批量导入：选择文件失败", error);
      setBatchMessage({ kind: "error", text: "选择立绘文件失败，请重试。" });
      return;
    }
    if (pickedFiles.length === 0) return;

    // 新角色要先存进后端，否则上传立绘会报"角色不存在"
    const currentCharacter = await ensureCharacterPersisted();
    if (!currentCharacter) return;

    const characterId = currentCharacter.characterID;
    const existingPortraits = currentCharacter.portraits || [];
    const targetDefaultPortrait = getDefaultPortrait(existingPortraits);
    const targetDefaultCrop = targetDefaultPortrait
      ? portraitCropOf(targetDefaultPortrait)
      : null;
    const hasDefaultCrop =
      !!targetDefaultCrop && isValidCropState(targetDefaultCrop);
    // 没有默认立绘时用和「添加立绘」一致的兜底值，至少是个可用的小方框
    const cropSource: PortraitCropState = hasDefaultCrop
      ? (targetDefaultCrop as PortraitCropState)
      : { faceX: 0, faceY: 0, length: 100 };
    // 按比例套用裁剪要知道默认立绘自己的原图尺寸；读不到就退回像素照搬
    const defaultImageSize = hasDefaultCrop
      ? await loadPortraitImageSize(targetDefaultPortrait?.imagePath)
      : null;

    const importedPortraits: Portrait[] = [];
    const skippedNames: string[] = [];
    const failedFiles: { name: string; reason: string }[] = [];
    const knownNames = new Set(
      existingPortraits.map((portrait) => portrait.portName),
    );
    let adjustedCount = 0;
    let thumbnailFailedCount = 0;

    setBatchMessage(null);

    for (let index = 0; index < pickedFiles.length; index++) {
      reportBatchProgress({
        kind: "import",
        done: index,
        total: pickedFiles.length,
      });

      const { file, fileName } = pickedFiles[index];
      const portName = stripFileExtension(fileName) || fileName;

      if (hasPortraitName(existingPortraits, portName) || knownNames.has(portName)) {
        skippedNames.push(fileName);
        continue;
      }

      let objectUrl = "";
      try {
        objectUrl = URL.createObjectURL(file);
        const image = await loadImageElement(objectUrl);
        const resolved = resolveDefaultCropRect({
          crop: cropSource,
          sourceImageSize: defaultImageSize,
          imageSize: {
            width: image.naturalWidth,
            height: image.naturalHeight,
          },
        });
        if (!resolved.rect) {
          throw new Error("算不出裁剪框");
        }
        if (resolved.adjusted) adjustedCount += 1;

        const portraitID = `portrait_${Date.now()}_${index}`;
        const draft = buildImportedPortrait({
          characterID: characterId,
          portraitID,
          fileName,
          imagePath: "",
          thumbnailPath: "",
          crop: {
            faceX: resolved.rect.left,
            faceY: resolved.rect.top,
            length: resolved.rect.width,
          },
        });

        // 原图先落盘（后端按 characterId 目录 + portraitId 命名，返回存库用的相对路径）
        const uploadResult = await ApiService.uploadPortraitFile(
          characterId,
          portraitID,
          file,
          String(draft.emotion).toLowerCase(),
        );
        draft.imagePath = uploadResult.imagePath;

        const uploadedThumbnail = await regeneratePortraitThumbnail(
          characterId,
          portraitID,
          image,
          resolved.rect,
        );
        if (uploadedThumbnail) {
          draft.thumbnailPath = uploadedThumbnail;
        } else {
          thumbnailFailedCount += 1;
        }

        importedPortraits.push(draft);
        knownNames.add(portName);
      } catch (error) {
        console.error(
          "[CharacterDetailModal] 批量导入：这张立绘导入失败",
          fileName,
          error,
        );
        failedFiles.push({
          name: fileName,
          reason: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      }
    }

    reportBatchProgress(null);

    if (importedPortraits.length > 0) {
      setEditingCharacter((prev) =>
        prev
          ? {
              ...prev,
              // 新导入的立绘一律追加到末尾；不动已有顺序 / 默认立绘的位置。
              // 角色原本没有立绘时，归一化会把第一张标成默认（后端保存时同样兜底）。
              portraits: normalizePortraitDefaults([
                ...(prev.portraits || []),
                ...importedPortraits,
              ]),
            }
          : prev,
      );
      bumpThumbnailVersions(
        importedPortraits.map((portrait) => portrait.portraitID),
      );
    }

    const parts: string[] = [];
    if (importedPortraits.length > 0) {
      parts.push(
        `已导入 ${importedPortraits.length} 张立绘${
          hasDefaultCrop
            ? defaultImageSize
              ? "（裁剪已按比例套用默认立绘）"
              : "（裁剪已按像素套用默认立绘）"
            : ""
        }`,
      );
    }
    if (skippedNames.length > 0) {
      parts.push(`跳过 ${skippedNames.length} 张同名立绘`);
    }
    if (adjustedCount > 0) {
      parts.push(`其中 ${adjustedCount} 张超出原图范围，已按图片边界修正`);
    }
    if (thumbnailFailedCount > 0) {
      parts.push(`${thumbnailFailedCount} 张缩略图生成失败`);
    }
    if (failedFiles.length > 0) {
      const detail = failedFiles
        .slice(0, 3)
        .map((item) => `${item.name}（${item.reason}）`)
        .join("、");
      parts.push(
        `${failedFiles.length} 张导入失败：${detail}${
          failedFiles.length > 3 ? "…" : ""
        }`,
      );
    }
    if (importedPortraits.length === 0 && parts.length === 0) {
      parts.push("没有导入任何立绘");
    }
    if (importedPortraits.length > 0) {
      parts.push("记得点右上角「保存」写入数据库");
    }

    setBatchMessage({
      kind:
        failedFiles.length > 0
          ? "error"
          : importedPortraits.length > 0
            ? "success"
            : "info",
      text: `${parts.join("；")}。`,
    });
  };

  const handleEditPortrait = (portrait: Portrait) => {
    setEditingPortrait(portrait);
    setIsAddingNewPortrait(false);
    setShowPortraitModal(true);
    console.log("[CharacterDetailModal] 开始编辑立绘", {
      portraitId: portrait.portraitID,
    });
  };

  const handleDeletePortrait = async (portraitId: string) => {
    if (!editingCharacter) return;

    try {
      // 调用API删除立绘
      await ApiService.deletePortrait(editingCharacter.characterID, portraitId);

      // 从本地状态中移除立绘
      const remaining = (editingCharacter.portraits || []).filter(
        (p) => p.portraitID !== portraitId,
      );
      // 删掉的是默认立绘：把剩下的第一张（按当前显示顺序）提为默认，
      // 别让角色变成"没有默认立绘"。后端删除接口做同样的事，这里同步本地标记，
      // 保证这次「保存」传回去的 defaultPortrait 标记和库里一致。
      // 删的不是默认立绘时只移除这一张，其余顺序原样保留（用户排好的顺序不能被打乱）。
      const deletedDefault = isDefaultPortraitId(
        editingCharacter.portraits,
        portraitId,
      );
      setEditingCharacter({
        ...editingCharacter,
        portraits:
          deletedDefault && remaining.length > 0
            ? markDefaultPortrait(remaining, remaining[0].portraitID)
            : remaining,
      });
    } catch (error) {
      console.error("删除立绘失败:", error);
      alert("删除立绘失败，请重试");
    }
  };

  const handleSetDefaultPortrait = async (portraitId: string) => {
    if (!editingCharacter) return;

    try {
      // 刚添加/批量导入的立绘此时还只存在于本地状态里（portraits 表要等点「保存」才写），
      // 所以把立绘数据一起传给后端：库里查不到这条记录时后端会用它补写，
      // 否则会报"立绘不存在"（设置默认立绘失败）。
      const portrait = (editingCharacter.portraits || []).find(
        (p) => p.portraitID === portraitId,
      );

      // 调用API设置默认立绘（后端会清除该角色其他立绘的默认标记）
      await ApiService.setDefaultPortrait(
        editingCharacter.characterID,
        portraitId,
        portrait,
      );

      // 本地同步默认标记。默认立绘由 defaultPortrait 字段表示（后端 is_default 是唯一真源），
      // markDefaultPortrait **只换标记、不挪位置**：默认立绘可以位于列表任意位置，
      // 用户排好的顺序和正在拖拽的结果都不该因为"设为默认"被打乱。
      setEditingCharacter((prev) =>
        prev
          ? {
              ...prev,
              portraits: markDefaultPortrait(prev.portraits, portraitId),
            }
          : prev,
      );
    } catch (error) {
      console.error("设置默认立绘失败:", error);
      alert("设置默认立绘失败，请重试");
    }
  };

  useEffect(() => {
    if (character) {
      setEditingCharacter({
        ...character,
        // 顺序原样保留（display_order）；只保证默认标记唯一，角标才能跟对卡片
        portraits: normalizePortraitDefaults(
          character.portraits || portraits || [],
        ),
      });
    }
  }, [character, portraits]);

  const handleSave = async () => {
    if (!editingCharacter || saving || reordering || reorderingRef.current) {
      return;
    }

    console.log("[CharacterDetailModal] 保存角色详情", {
      characterName: editingCharacter.characterName,
      characterID: editingCharacter.characterID,
      hasCardImagePath: !!editingCharacter.characterCardImagePath,
      cardImagePath: editingCharacter.characterCardImagePath,
      portraitsCount: editingCharacter.portraits?.length || 0,
      portraitIds: editingCharacter.portraits?.map((p) => p.portraitID) || [],
    });

    setSaving(true);
    setSaveError(null);
    try {
      let savedCharacter;
      if (!characterPersisted) {
        // 角色尚未存入后端（首次保存）
        savedCharacter = await ApiService.addCharacter(editingCharacter);
      } else {
        // 角色已存入后端（可能是添加立绘时自动保存的），执行更新
        savedCharacter = await ApiService.updateCharacter(
          editingCharacter.characterID,
          editingCharacter,
        );
      }

      // 确保调用onSave更新父组件状态
      onSave(savedCharacter);
      onClose();
    } catch (error) {
      console.error("保存角色失败:", error);
      // 就地提示，不弹 alert：弹窗会抢焦点，用户关掉后输入框就"打不了字"了
      setSaveError(describeApiError(error, "保存角色失败"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCharacter = () => {
    if (!editingCharacter || !onDelete) return;

    onDelete(editingCharacter.characterID, deleteFiles);
    setShowDeleteConfirm(false);
    onClose();
  };

  const handleToggleColorPicker = (type: "text" | "bg") => {
    setShowColorPicker((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  // 取消/关闭弹窗时的处理。
  // 如果新角色因添加立绘已自动保存到后端，取消时也要同步父组件状态，
  // 否则角色已存入数据库但角色列表不显示，用户会以为角色丢失了。
  const handleClose = () => {
    if (characterPersisted && isNewCharacter && editingCharacter) {
      onSave(editingCharacter);
    }
    onClose();
  };

  /**
   * @function 接收立绘编辑弹窗的保存结果
   *
   * <p>裁剪 / 换图之后后端会把**同名**缩略图（`thumbnail_{portraitId}.png`）覆盖掉，
   * 路径不变，浏览器缓存里还是旧头部的图。所以除了更新立绘数据，还要把这张立绘的
   * 缩略图代次 +1 —— 列表里的缩略图当场换成新的，不用关掉弹窗重新打开。
   */
  const handlePortraitSaved = (portrait: Portrait) => {
    // 使用isAddingNewPortrait标志来判断是添加还是更新
    if (!isAddingNewPortrait) {
      // 更新现有立绘
      setEditingCharacter((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          portraits:
            prev.portraits?.map((p) =>
              p.portraitID === portrait.portraitID ? portrait : p,
            ) || [],
        };
      });
      console.log("[CharacterDetailModal] 更新立绘", {
        portraitId: portrait.portraitID,
      });
    } else {
      // 添加新立绘：追加到末尾，保留已有顺序与默认立绘的位置；
      // 角色原本没有立绘时把它标成默认（后端保存时也是同样的兜底）。
      setEditingCharacter((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          portraits: normalizePortraitDefaults([
            ...(prev.portraits || []),
            portrait,
          ]),
        };
      });
      console.log("[CharacterDetailModal] 添加新立绘", {
        portraitId: portrait.portraitID,
        totalPortraits: (editingCharacter?.portraits?.length || 0) + 1,
      });
    }

    bumpThumbnailVersions([portrait.portraitID]);

    setShowPortraitModal(false);
    setEditingPortrait(null);
    setIsAddingNewPortrait(false);
  };

  if (!editingCharacter) return null;

  return (
    <div className="modal-overlay">
      {/* character-detail-modal：标题栏固定高度不动，下面的 .modal-body 自己滚动 */}
      <div className="modal-content character-detail-modal">
        <div className="modal-header">
          <h2>
            {isNewCharacter
              ? "添加新角色"
              : `编辑角色: ${editingCharacter.characterName}`}
          </h2>
          <div className="header-actions">
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={saving || reordering}
            >
              {saving ? "保存中…" : reordering ? "保存顺序中…" : "保存"}
            </button>
            <button className="btn-secondary" onClick={handleClose}>
              取消
            </button>
            {!isNewCharacter && (
              <button
                className="btn-danger"
                onClick={() => setShowDeleteConfirm(true)}
              >
                删除角色
              </button>
            )}
            <button className="close-button" onClick={handleClose}>
              ×
            </button>
          </div>
        </div>

        {/* 保存失败提示：就地显示，不抢焦点（以前是 alert，关掉后输入框会失去焦点） */}
        {saveError && (
          <div className="inline-error" role="alert">
            <span>{saveError}</span>
            <button
              type="button"
              className="inline-error-close"
              onClick={() => setSaveError(null)}
              aria-label="关闭提示"
            >
              ×
            </button>
          </div>
        )}

        {/* 内容区：独立滚动，标题栏不跟着滚 */}
        <div className="modal-body">
          <CharacterInfoSection
            character={editingCharacter}
            onCharacterUpdate={setEditingCharacter}
            showColorPicker={showColorPicker}
            onToggleColorPicker={handleToggleColorPicker}
          />

          <TagsSection
            character={editingCharacter}
            onCharacterUpdate={setEditingCharacter}
          />

          <PortraitsSection
            character={editingCharacter}
            onAddPortrait={handleAddPortrait}
            onEditPortrait={handleEditPortrait}
            onDeletePortrait={handleDeletePortrait}
            onSetDefaultPortrait={handleSetDefaultPortrait}
            onReorderPortrait={handleReorderPortrait}
            reordering={reordering}
            saving={saving}
            onApplyDefaultCropToAll={handleApplyDefaultCropToAll}
            onBatchImportPortraits={handleBatchImportPortraits}
            canApplyDefaultCrop={defaultCropTargets.length > 0}
            batchProgress={batchProgress}
            batchMessage={batchMessage}
            onDismissBatchMessage={() => setBatchMessage(null)}
            thumbnailVersions={thumbnailVersions}
            selectionMode={selectionMode}
            selectedPortraitIds={selectedPortraitIds}
            selectionCount={selectedPortraits.length}
            selectedCropCount={selectedCropTargets.length}
            allPortraitsSelected={allPortraitsSelected}
            onEnterSelectionMode={enterSelectionMode}
            onExitSelectionMode={exitSelectionMode}
            onToggleSelectPortrait={handleTogglePortraitSelection}
            onToggleSelectAll={handleToggleSelectAllPortraits}
            onApplyDefaultCropToSelected={handleApplyDefaultCropToSelected}
            onBatchDeleteSelected={handleBatchDeleteSelected}
            canApplySelectedCrop={selectedCropDisabledReason === null}
            selectedCropDisabledReason={selectedCropDisabledReason}
            batchDeleteDisabledReason={batchDeleteDisabledReason}
          />
        </div>
      </div>

      {/* 删除确认对话框 */}
      {showDeleteConfirm && (
        <div className="modal-overlay">
          <div className="confirm-dialog">
            <h3>确认删除</h3>
            <p>确定要删除角色 "{editingCharacter.characterName}" 吗？</p>
            <div className="checkbox-container">
              <label>
                <input
                  type="checkbox"
                  checked={deleteFiles}
                  onChange={(e) => setDeleteFiles(e.target.checked)}
                />
                同时删除相关文件
              </label>
            </div>
            <div className="dialog-actions">
              <button className="btn-danger" onClick={handleDeleteCharacter}>
                确认删除
              </button>
              <button
                className="btn-secondary"
                onClick={() => setShowDeleteConfirm(false)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 立绘编辑弹窗 */}
      {showPortraitModal && editingCharacter && (
        <PortraitModal
          characterId={editingCharacter.characterID}
          portrait={editingPortrait}
          defaultPortrait={getDefaultPortrait(editingCharacter.portraits)}
          isNewPortrait={isAddingNewPortrait}
          characterHeight={editingCharacter.height}
          onClose={() => {
            setShowPortraitModal(false);
            setEditingPortrait(null);
            setIsAddingNewPortrait(false);
          }}
          onSave={handlePortraitSaved}
        />
      )}
    </div>
  );
};

export default CharacterDetailModal;
