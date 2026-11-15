import React, { useState, useRef, useCallback, useEffect } from "react";
import { Background } from "@types";
import ApiService from "@services/ApiService";
import {
  downloadBlob,
  describeTransferError,
  zipFileName,
  runFileBatch,
  describeBundleImportResult,
  describeBatchAddResult,
  appendRefreshWarning,
  stripFileExtension,
} from "@features/common/utils/resourceTransfer";
import type {
  BatchMessage,
  BatchProgress,
} from "@features/common/utils/resourceTransfer";
import { toAssetPath } from "@features/common/utils/assetPath";
import { describeApiError, isRetryableError } from "@features/common/utils/apiError";
import { askConfirm } from "@features/common/components/ConfirmDialog";
import "../ResourceManager.css";
import "./BackgroundsTab.css";
import BackgroundCard from "./BackgroundCard";
import BackgroundModal from "./BackgroundModal";
import ResourceBatchStatus from "../ResourceBatchStatus";

// 将blob URL转换为File对象
const blobUrlToFile = async (blobUrl: string, filename: string): Promise<File> => {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type });
};

/** 读取本地图片成 data URL（弹窗预览 + 生成缩略图都用它） */
const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(String(event.target?.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });

/**
 * 当前进行中的批量操作是哪一种。
 *
 * <p>导入资源包与多选添加共用同一条进度 / 结果提示条，只有文案不同
 * （「正在导入背景 2/5」 vs 「正在添加背景 2/5」）。
 */
type BatchKind = "import" | "add";

interface BackgroundsTabProps {
  backgrounds: Background[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  openResourceFolder: (
    resourceType: "characters" | "backgrounds" | "audios",
  ) => void;
  setBackgrounds: (backgrounds: Background[]) => void;
}

const BackgroundsTab: React.FC<BackgroundsTabProps> = ({
  backgrounds,
  searchTerm,
  setSearchTerm,
  openResourceFolder,
  setBackgrounds,
}) => {
  const [selectedBackground, setSelectedBackground] =
    useState<Background | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingBackground, setEditingBackground] = useState<Background | null>(
    null,
  );
  const [showBackgroundModal, setShowBackgroundModal] = useState(false);
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(
    null,
  );
  // 编辑弹窗里的「选择文件」：单张，用来替换当前这张背景
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 「➕ 添加背景」：多选，一次可以加好几张
  const addFileRef = useRef<HTMLInputElement>(null);

  // 缩略图状态
  const [croppedImage, setCroppedImage] = useState<string | null>(null);

  // ===== 资源包导入 / 多选导出（与「角色」页面保持一致） =====
  const importFileRef = useRef<HTMLInputElement>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedExportIds, setSelectedExportIds] = useState<Set<string>>(
    new Set(),
  );
  const selectAllRef = useRef<HTMLInputElement>(null);
  // 导入/导出/批量添加进行中：按钮置灰，避免重复点击打出多个包 / 重复添加
  const [transferring, setTransferring] = useState(false);

  // 批量操作（导入资源包 / 多选添加）：共用一条进度条与结果提示
  const [batchKind, setBatchKind] = useState<BatchKind>("import");
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [batchMessage, setBatchMessage] = useState<BatchMessage | null>(null);

  // 背景保存中 / 上次保存失败的原因。
  // 只用来置灰「保存」按钮 + 就地显示错误：不再无条件 alert（alert 会抢焦点，
  // 关掉之后表单输入框就"打不了字"了），也不会让弹窗停在"看起来还在加载"的状态。
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 当前可见的背景（搜索过滤后的结果）：多选与"没勾选就导出全部"都以它为准
  const filteredBackgrounds = backgrounds.filter((background) =>
    background.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // 全选复选框的 indeterminate（半选）状态
  useEffect(() => {
    if (selectAllRef.current) {
      const count = selectedExportIds.size;
      selectAllRef.current.indeterminate =
        count > 0 && count < filteredBackgrounds.length;
    }
  }, [selectedExportIds, filteredBackgrounds.length]);

  // 背景列表或搜索词变化时清空勾选，避免把已经看不见的项一起导出
  useEffect(() => {
    setSelectedExportIds(new Set());
  }, [backgrounds.length, searchTerm]);

  // 日志函数
  const log = (message: string, data?: any) => {
    console.log(`[BackgroundsTab] ${message}`, data);
  };

  /**
   * 从后端重新拉一次背景列表（导入 / 多选添加 / 保存之后都走它）。
   *
   * <p>为什么不拿本地列表拼：`backgrounds` 是父组件**按搜索词过滤后**传下来的。
   * 拿它拼新列表，那些没显示出来的背景会被一起丢掉 —— 清空搜索框后就会"凭空少几张"。
   *
   * @returns true 表示刷新失败（本地列表保持原样，调用方自己决定怎么兜底）
   */
  const refreshBackgrounds = useCallback(async (): Promise<boolean> => {
    try {
      setBackgrounds(await ApiService.getBackgrounds());
      return false;
    } catch (error) {
      console.error("刷新背景列表失败:", error);
      return true;
    }
  }, [setBackgrounds]);

  /** 退出多选模式时清空勾选 */
  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedExportIds(new Set());
  };

  /** 切换单张背景的导出勾选状态 */
  const toggleExportSelect = (backgroundId: string) => {
    setSelectedExportIds((prev) => {
      const next = new Set(prev);
      if (next.has(backgroundId)) {
        next.delete(backgroundId);
      } else {
        next.add(backgroundId);
      }
      return next;
    });
  };

  /** 全选/取消全选（仅作用于当前可见背景） */
  const toggleSelectAll = () => {
    const allSelected =
      filteredBackgrounds.length > 0 &&
      filteredBackgrounds.every((bg) => selectedExportIds.has(bg.uuid));
    if (allSelected) {
      setSelectedExportIds(new Set());
    } else {
      setSelectedExportIds(new Set(filteredBackgrounds.map((bg) => bg.uuid)));
    }
  };

  /** 导出背景 — 优先导出勾选的背景，没有勾选时导出当前列表全部 */
  const handleExportBackgrounds = async () => {
    const ids =
      selectedExportIds.size > 0
        ? Array.from(selectedExportIds)
        : filteredBackgrounds.map((bg) => bg.uuid);
    if (ids.length === 0) {
      alert("没有可导出的背景");
      return;
    }

    setTransferring(true);
    try {
      log("导出背景", ids);
      const blob = await ApiService.exportBackgrounds(ids);
      downloadBlob(blob, zipFileName("backgrounds"));
      alert(`成功导出 ${ids.length} 张背景`);
      exitSelectionMode();
    } catch (error) {
      console.error("导出背景失败:", error);
      alert(describeTransferError(error, "导出背景失败，请重试"));
    } finally {
      setTransferring(false);
    }
  };

  /**
   * 导入背景 — **支持一次选多个资源包**，逐个上传。
   *
   * <p>三个约定（与「序列帧动画」的批量导入一致）：
   * 1. 某个包坏了只记一条失败原因，不影响其它包；
   * 2. 进度显示"第几个 / 共几个 + 正在传哪个包"；
   * 3. 结果放在本页提示条里，不再 alert —— 失败清单可能有好几条，
   *    而且 Electron 里 alert 一关掉就会抢走键盘焦点。
   */
  const handleImportBackgrounds = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(e.target.files ?? []);
    // 立刻清空 input：等异步走完再清的话，用户重选同一个文件不会触发 change
    e.target.value = "";
    if (files.length === 0) return;

    setTransferring(true);
    setBatchKind("import");
    setBatchMessage(null);
    try {
      log("导入背景", files.map((file) => file.name));
      const result = await runFileBatch(
        files,
        (file) => ApiService.importBackgrounds(file),
        {
          onProgress: setBatchProgress,
          // 后端返回的 message 优先（"不是 ZIP / 缺清单 / 包为空"都由它说清楚）；
          // 连 message 都没有时（网络断了）至少要有这句兜底。
          fallbackError: "导入失败",
        },
      );
      log("导入背景完成", result);

      // 导入一律按"新增"处理（ID 冲突时后端分配新 ID），本地列表里没有这些新背景，
      // 有包成功就重新拉一次列表；拉列表失败不影响"导入已成功"这个事实。
      let refreshFailed = false;
      if (result.succeededFiles > 0) {
        refreshFailed = await refreshBackgrounds();
      }

      const summary = describeBundleImportResult(result, {
        unit: "张背景",
        bundle: "背景资源包",
      });
      setBatchMessage(appendRefreshWarning(summary, refreshFailed));
    } finally {
      setBatchProgress(null);
      setTransferring(false);
    }
  };

  // 自动生成缩略图
  const generateThumbnail = useCallback((imageSrc: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        // 设置缩略图尺寸
        const maxSize = 300;
        let width = img.width;
        let height = img.height;

        // 计算缩放比例
        if (width > height) {
          if (width > maxSize) {
            height *= maxSize / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width *= maxSize / height;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // 绘制缩略图
        ctx?.drawImage(img, 0, 0, width, height);

        // 转换为blob URL
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(URL.createObjectURL(blob));
            } else {
              resolve("");
            }
          },
          "image/jpeg",
          0.8,
        );
      };

      img.src = imageSrc;
    });
  }, []);

  /**
   * 一张图选中后的"预览 + 自动缩略图"处理（新加与换图都用同一套）。
   *
   * <p>缩略图先由前端生成一份（300px JPEG）：后端保存时也会自动生成一张，
   * 用户手动裁剪过才用前端这张覆盖，这里先把预览和兜底准备好。
   *
   * @param file       用户刚选的图片
   * @param targetUuid 这次改动属于哪条背景（预览 / 缩略图只写回它，避免串到别的记录上）
   * @param options.rename 传了就顺便把名称改成它（"添加"时名称跟着文件名走）
   */
  const applyBackgroundImage = useCallback(
    async (
      file: File,
      targetUuid: string,
      options: { rename?: string } = {},
    ) => {
      const dataUrl = await readFileAsDataUrl(file);
      setBackgroundPreview(dataUrl);

      const rename = options.rename;
      if (rename !== undefined) {
        setEditingBackground((prev) =>
          !prev || prev.uuid !== targetUuid ? prev : { ...prev, name: rename },
        );
      }

      try {
        const thumbnail = await generateThumbnail(dataUrl);
        if (!thumbnail) return;
        setCroppedImage(thumbnail);
        setEditingBackground((prev) =>
          prev && prev.uuid === targetUuid
            ? { ...prev, thumbnailPath: thumbnail }
            : prev,
        );
      } catch (error) {
        // 缩略图只是预览 / 兜底，失败不影响保存（后端保存时还会自己生成一张）
        console.error("生成背景缩略图失败:", error);
      }
    },
    [generateThumbnail],
  );

  /** 用一张图片打开「添加背景」窗口（名称先取文件名，名称 / 标签还能改） */
  const openNewBackgroundModal = useCallback(
    (file: File) => {
      const autoName = stripFileExtension(file.name) || "背景";
      const draft: Background = {
        uuid: `bg_${Date.now()}`,
        name: autoName,
        // 真正的站内路径要等保存时上传完才有，这里留空
        path: "",
        tags: [],
      };

      // 上一个弹窗可能留着失败原因 / 旧预览，先把它们清掉
      setSaveError(null);
      setBackgroundPreview(null);
      setCroppedImage(null);
      setSelectedBackground(null);
      setBackgroundFile(file);
      setEditingBackground(draft);
      // 新背景：弹窗标题显示「添加背景」（改已有背景才是「编辑背景」）
      setIsEditing(false);
      setShowBackgroundModal(true);

      log("打开添加背景窗口", { file: file.name, uuid: draft.uuid });
      // 预览 / 缩略图后到，不阻塞弹窗打开
      void applyBackgroundImage(file, draft.uuid).catch((error) =>
        console.error("读取背景图片失败:", error),
      );
    },
    [applyBackgroundImage],
  );

  /**
   * 「➕ 添加背景」：打开**多选**文件框。
   *
   * <p>选 1 张 → 打开编辑窗口（可以改名称 / 标签，和以前一样）；
   * 选多张 → 直接批量添加（名称取文件名），进度与结果见本页提示条。
   */
  const handleAddBackground = () => {
    log("添加背景（可一次选多张图片）");
    addFileRef.current?.click();
  };

  /**
   * 多张图片批量添加：每张单独上传原图（后端顺带生成缩略图）后建一条背景记录。
   *
   * <p>名称取文件名、标签留空；某张坏了只记一条原因，不影响其它张。
   */
  const addBackgroundsFromFiles = async (files: File[]) => {
    setTransferring(true);
    setBatchKind("add");
    setBatchMessage(null);
    try {
      log("批量添加背景", files.map((file) => file.name));
      const result = await runFileBatch(
        files,
        async (file, index) => {
          const name = stripFileExtension(file.name) || `背景${index + 1}`;
          const upload = await ApiService.uploadBackgroundFile(file, name);
          return ApiService.addBackground({
            // 一次加多张时 Date.now() 可能相同，序号兜底保证 uuid 唯一
            uuid: `bg_${Date.now()}_${index}`,
            name,
            path: upload.imagePath,
            thumbnailPath: upload.autoThumbnailPath ?? "",
            tags: [],
          });
        },
        {
          onProgress: setBatchProgress,
          fallbackError: "添加失败",
        },
      );
      log("批量添加背景完成", result);

      let refreshFailed = false;
      if (result.succeededFiles > 0) {
        refreshFailed = await refreshBackgrounds();
      }

      setBatchMessage(
        appendRefreshWarning(
          describeBatchAddResult(result, {
            unit: "张背景",
            hint: "名称取自文件名、标签为空，双击卡片可改名称 / 标签",
          }),
          refreshFailed,
        ),
      );
    } finally {
      setBatchProgress(null);
      setTransferring(false);
    }
  };

  const handleAddBackgroundFiles = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(e.target.files ?? []);
    // 立刻清空 input：等异步走完再清的话，用户重选同一个文件不会触发 change
    e.target.value = "";
    if (files.length === 0) return;

    if (files.length === 1) {
      openNewBackgroundModal(files[0]);
      return;
    }

    await addBackgroundsFromFiles(files);
  };

  const handleEditBackground = (background: Background) => {
    log("编辑背景", background.name);
    log("编辑的背景对象", background);
    setSelectedBackground(background);
    const editingBg = { ...background };
    log("复制的编辑背景对象", editingBg);
    // 清掉上一次「添加」残留的文件 / 预览 / 缩略图：换图只认弹窗里重新点「选择文件」
    setBackgroundFile(null);
    setBackgroundPreview(null);
    setCroppedImage(null);
    setSaveError(null);
    setEditingBackground(editingBg);
    setIsEditing(true);
    setShowBackgroundModal(true);
    log("背景编辑窗口已打开");
  };

  const handleSaveBackground = async () => {
    if (!editingBackground || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      log("保存背景", editingBackground.name);
      log("编辑中的背景对象", editingBackground);

      // 关键：提交给后端的必须是站内路径（/assets/...）。
      // 列表里的 path 为了让 <img> 能显示，已经被补成 http://localhost:8081/assets/...，
      // 如果原样提交回去，数据库里就会存进绝对 URL —— 之后后端按磁盘校验一律失败、
      // 预览渲染找不到背景退回黑底、删除还会拼出 ...\assets\http:\localhost:8081\... 这种非法路径。
      const backgroundToSave: Background = {
        ...editingBackground,
        path: toAssetPath(editingBackground.path) ?? "",
        thumbnailPath: toAssetPath(editingBackground.thumbnailPath) ?? "",
      };

      // 若未填名字，尝试用文件名或时间戳兜底
      if (
        !backgroundToSave.name ||
        backgroundToSave.name.trim() === "" ||
        backgroundToSave.name === "新背景"
      ) {
        if (backgroundFile) {
          backgroundToSave.name = backgroundFile.name.replace(/\.[^/.]+$/, "");
          log("从文件名更新背景名称", backgroundToSave.name);
        } else {
          backgroundToSave.name = "背景" + Date.now();
          log("背景名称为空，使用默认名称", backgroundToSave.name);
        }
      }

      // 列表里没有这个 uuid = 新背景（多选添加的草稿本来就不在列表里）
      const isNewBackground = !backgrounds.some(
        (bg) => bg.uuid === editingBackground.uuid,
      );

      // 1) 若用户选了新文件 → 先把原图上传到后端（后端保存到 assets/backgrounds 并自动生成缩略图）
      if (backgroundFile) {
        log("检测到新的背景文件，开始上传原图", backgroundFile.name);
        try {
          const uploadResp = await ApiService.uploadBackgroundFile(
            backgroundFile,
            backgroundToSave.name,
          );
          log("原图上传完成", uploadResp);

          // 使用后端返回的标准化路径（/assets/backgrounds/xxx.png）
          backgroundToSave.path = uploadResp.imagePath;
          // 用后端自动生成的缩略图作为默认（若用户手动裁剪，则覆盖）
          if (!croppedImage && uploadResp.autoThumbnailPath) {
            backgroundToSave.thumbnailPath = uploadResp.autoThumbnailPath;
          }
        } catch (error) {
          console.error("背景原图上传失败:", error);
          log("背景原图上传失败", error);
          setSaveError(describeApiError(error, "背景原图上传失败"));
          return;
        }
      }

      // 确保 path 不为空：如果用户没选文件，又没填 path，则无法保存
      if (!backgroundToSave.path || backgroundToSave.path.trim() === "") {
        setSaveError("请先选择背景图片文件再保存");
        return;
      }

      log("准备保存的背景对象（未上传缩略图前）", backgroundToSave);

      let updatedBackground: Background;

      if (isNewBackground) {
        log("添加新背景", backgroundToSave.name);
        log("发送到后端的新背景数据", backgroundToSave);
        updatedBackground = await ApiService.addBackground(backgroundToSave);
        log("从后端返回的新背景", updatedBackground);
      } else {
        log("更新现有背景", backgroundToSave.name);
        log("发送到后端的背景数据", backgroundToSave);
        updatedBackground = await ApiService.updateBackground(
          editingBackground.uuid,
          backgroundToSave,
        );
        log("从后端返回的更新背景", updatedBackground);
      }

      // 2) 若用户手动裁剪了缩略图 → 单独上传缩略图并更新到背景记录
      if (croppedImage) {
        // 支持 blob: URL（createObjectURL）以及 data: URL（canvas.toDataURL）
        if (croppedImage.startsWith("blob:") || croppedImage.startsWith("data:")) {
          log("检测到用户裁剪的缩略图，开始上传");
          try {
            const tnFilename =
              (updatedBackground.name || "thumbnail") +
              "_thumb_" +
              Date.now() +
              ".png";
            const tnFile = await blobUrlToFile(croppedImage, tnFilename);
            const tnResp = await ApiService.uploadBackgroundThumbnail(
              updatedBackground.uuid,
              tnFile,
            );
            log("缩略图上传完成", tnResp);

            // 返回结构：{ thumbnailPath: "/assets/backgrounds/thumbnails/xxx.png" }
            const newTnPath: string =
              (tnResp as any)?.thumbnailPath || tnResp?.path || "";
            if (newTnPath) {
              updatedBackground = {
                ...updatedBackground,
                thumbnailPath: newTnPath,
              };
              // 保存回后端，让 DB 里的 thumbnailPath 是真实 URL 路径
              updatedBackground = await ApiService.updateBackground(
                updatedBackground.uuid,
                updatedBackground,
              );
              log("缩略图路径已更新到背景记录", updatedBackground);
            }
          } catch (error) {
            console.error("上传缩略图失败:", error);
            log("上传缩略图失败（非致命错误，已保存原图）", error);
          }
        } else if (
          croppedImage &&
          !croppedImage.startsWith("blob:") &&
          !croppedImage.startsWith("data:")
        ) {
          // 已经是正常路径（/assets/... 或 assets/...），直接写入
          updatedBackground = { ...updatedBackground, thumbnailPath: croppedImage };
          updatedBackground = await ApiService.updateBackground(
            updatedBackground.uuid,
            updatedBackground,
          );
        }
      }

      // 3) 刷新列表（不能用本地列表拼：它是父组件按搜索词过滤后的，
      //    拼回去会把没显示出来的背景丢掉）。刷新失败时至少把这一条并进来。
      if (await refreshBackgrounds()) {
        const others = backgrounds.filter(
          (bg) => bg.uuid !== updatedBackground.uuid,
        );
        setBackgrounds([...others, updatedBackground]);
      }
      log(isNewBackground ? "背景添加成功" : "背景更新成功", updatedBackground.name);

      setSelectedBackground(updatedBackground);
      setEditingBackground(null);
      setIsEditing(false);
      setShowBackgroundModal(false);
      setBackgroundFile(null);
      setBackgroundPreview(null);
      setCroppedImage(null);
      setSaveError(null);
    } catch (error) {
      console.error("保存背景失败:", error);
      log("背景保存失败", error);
      // 把后端原话显示出来（例如"数据库缺少 thumbnail_path 列"），并说明要不要重试；
      // 以前只是一句"保存失败，请重试"，用户反复点也修不好。
      const message = describeApiError(error, "保存背景失败");
      setSaveError(
        isRetryableError(error)
          ? message
          : `${message}（这个错误重试不会解决，请按提示处理）`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBackground = async (backgroundId: string) => {
    const bg = backgrounds.find((b) => b.uuid === backgroundId);
    const name = bg?.name || "该背景";

    // 整个删除流程只有这一个弹窗：确认后连磁盘上的原图与缩略图一起删除。
    // （卡片上的删除按钮已不再单独弹确认框，删除成功后也不再弹提示框）
    // 用应用内确认框而不是 window.confirm：Electron 的原生对话框关掉后会抢走键盘焦点，
    // 之后所有输入框都点不进、打不了字。
    const confirmed = await askConfirm({
      title: "删除背景",
      message: `确定删除背景「${name}」吗？`,
      detail: "将同时删除数据库记录和磁盘中的图片文件（原图与缩略图）。",
      confirmLabel: "删除",
      danger: true,
    });
    if (!confirmed) return;

    const deleteFiles = true;

    try {
      log("删除背景", { backgroundId, deleteFiles });
      await ApiService.deleteBackground(backgroundId, deleteFiles);

      // 删完重新拉列表（本地列表是过滤后的，直接 filter 会把没显示出来的一起丢掉）
      if (await refreshBackgrounds()) {
        setBackgrounds(
          backgrounds.filter((bg2) => bg2.uuid !== backgroundId),
        );
      }

      if (selectedBackground?.uuid === backgroundId) {
        setSelectedBackground(null);
      }

      log("背景删除成功", backgroundId);
    } catch (error) {
      console.error("删除背景失败:", error);
      log("背景删除失败", error);
      alert("删除背景失败，请重试");
    }
  };

  const handleCancelEditBackground = () => {
    log("取消编辑背景");
    setEditingBackground(null);
    setIsEditing(false);
    // 取消后不能留着选中的文件：否则下次编辑别的背景会把它上传上去
    setBackgroundFile(null);
    setBackgroundPreview(null);
    setCroppedImage(null);
    setSaveError(null);
    setShowBackgroundModal(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 立刻清空 input：否则重选同一个文件不会触发 change
    e.target.value = "";
    if (!file || !editingBackground) return;

    log("选择背景文件", {
      name: file.name,
      size: file.size,
      type: file.type,
    });
    setBackgroundFile(file);
    setCroppedImage(null);

    // 正在「添加」时名称跟着文件名走（换图=换素材）；编辑已有背景则保留它自己的名字
    await applyBackgroundImage(file, editingBackground.uuid, {
      rename: isEditing
        ? undefined
        : stripFileExtension(file.name) || "背景",
    }).catch((error) => console.error("读取背景图片失败:", error));
  };

  return (
    <div className="resource-tab">
      <div className="resource-actions">
        <input
          type="text"
          placeholder="搜索背景..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {selectionMode && (
          <label className="select-all-checkbox">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={
                filteredBackgrounds.length > 0 &&
                filteredBackgrounds.every((bg) =>
                  selectedExportIds.has(bg.uuid),
                )
              }
              onChange={toggleSelectAll}
            />
            全选
          </label>
        )}

        <button
          className="btn-primary"
          onClick={handleAddBackground}
          disabled={transferring}
          title="可一次选多张图片：选 1 张打开编辑窗口（能改名称 / 标签），选多张直接批量添加（名称取自文件名）"
        >
          {batchKind === "add" && batchProgress
            ? `⏳ 添加中 ${Math.min(batchProgress.done + 1, batchProgress.total)}/${batchProgress.total}…`
            : "➕ 添加背景"}
        </button>
        <button
          onClick={() => importFileRef.current?.click()}
          disabled={transferring}
          title="可一次选多个背景资源包（ZIP）：逐个导入并显示进度，某个包坏了不影响其它包"
        >
          {batchKind === "import" && batchProgress
            ? `⏳ 导入中 ${Math.min(batchProgress.done + 1, batchProgress.total)}/${batchProgress.total}…`
            : transferring
              ? "⏳ 处理中…"
              : "📥 导入背景"}
        </button>

        {selectionMode ? (
          <>
            <button onClick={handleExportBackgrounds} disabled={transferring}>
              ✅ 确认导出 ({selectedExportIds.size})
            </button>
            <button onClick={exitSelectionMode} disabled={transferring}>
              ❌ 取消
            </button>
          </>
        ) : (
          <button onClick={() => setSelectionMode(true)} disabled={transferring}>
            📤 选择导出
          </button>
        )}
        <input
          type="file"
          ref={importFileRef}
          style={{ display: "none" }}
          accept=".zip"
          multiple
          aria-label="导入背景资源包（可多选）"
          onChange={handleImportBackgrounds}
        />

        <button onClick={() => openResourceFolder("backgrounds")}>
          📂 打开背景文件夹
        </button>
      </div>

      {/* 批量操作（导入资源包 / 多选添加）的进度与结果 */}
      <ResourceBatchStatus
        progress={batchProgress}
        message={batchMessage}
        label={batchKind === "add" ? "正在添加背景" : "正在导入背景"}
        onDismiss={() => setBatchMessage(null)}
      />

      <div className="backgrounds-grid">
        {filteredBackgrounds.map((background) => (
          <BackgroundCard
            key={background.uuid}
            background={background}
            isSelected={selectedBackground?.uuid === background.uuid}
            onSelect={setSelectedBackground}
            onEdit={handleEditBackground}
            onDelete={handleDeleteBackground}
            selectionMode={selectionMode}
            isChecked={selectedExportIds.has(background.uuid)}
            onToggleCheck={toggleExportSelect}
          />
        ))}
      </div>

      {/* 背景编辑弹窗 */}
      {showBackgroundModal && editingBackground && (
        <BackgroundModal
          isEditing={isEditing}
          editingBackground={editingBackground}
          backgroundPreview={backgroundPreview}
          saving={saving}
          error={saveError}
          onDismissError={() => setSaveError(null)}
          onCancel={handleCancelEditBackground}
          onSave={handleSaveBackground}
          onBackgroundChange={setEditingBackground}
          onFileSelect={() => fileInputRef.current?.click()}
        />
      )}

      {/* 「➕ 添加背景」的多选文件框（与导入资源包、弹窗里换图的 input 都分开） */}
      <input
        type="file"
        ref={addFileRef}
        style={{ display: "none" }}
        accept="image/*"
        multiple
        aria-label="添加背景：选择图片（可多选）"
        onChange={handleAddBackgroundFiles}
      />

      {/* 隐藏的文件输入：编辑弹窗里「选择文件」，单张替换当前背景 */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept="image/*"
        aria-label="编辑背景时选择图片"
        onChange={handleFileSelect}
      />
    </div>
  );
};

export default BackgroundsTab;
