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
  buildPortraitImageUrl,
  getDefaultPortrait,
  markDefaultPortrait,
} from "@features/common/utils/portraitUtils";
import {
  PortraitCropState,
  isValidCropState,
  resolveDefaultCropRect,
} from "@features/common/utils/portraitCrop";
import {
  buildImportedPortrait,
  collectCropUpdateTargets,
  hasPortraitName,
  portraitCropOf,
  stripFileExtension,
} from "@features/common/utils/portraitBatch";
import {
  createCroppedImageFromElement,
  loadImageElement,
} from "@features/common/utils/imageUtils";

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
}

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
}) => {
  // 编辑中的角色状态，初始化时传入角色数据或为null
  const [editingCharacter, setEditingCharacter] = useState<MyCharacter | null>(
    character ? { ...character, portraits: character.portraits || [] } : null,
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

  // ---- 立绘批量操作（批量套用默认立绘裁剪 / 批量导入立绘）----
  const [batchProgress, setBatchProgress] =
    useState<PortraitBatchProgress | null>(null);
  const [batchMessage, setBatchMessage] =
    useState<PortraitBatchMessage | null>(null);
  // 缩略图版本号：批量重新生成缩略图后 +1，让立绘列表里的 <img> 重新取图
  const [thumbnailVersion, setThumbnailVersion] = useState(0);

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
  // 需要改裁剪的立绘（默认立绘本身、已经一致的都不算）：
  // 为空时按钮直接置灰，用户不用点进去才知道"没得改"
  const defaultCropTargets = useMemo(
    () =>
      defaultPortrait && defaultPortraitCrop
        ? collectCropUpdateTargets(
            editingCharacter?.portraits,
            defaultPortrait.portraitID,
            defaultPortraitCrop,
          )
        : [],
    [editingCharacter?.portraits, defaultPortrait, defaultPortraitCrop],
  );

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

  /**
   * 「与默认立绘裁剪一致」：把默认立绘以外的所有立绘，裁剪框都改成默认立绘的。
   *
   * <p>每张原图尺寸可能不同，所以逐张按图片尺寸把框夹进图片，并用**夹取后的实际坐标**
   * 写回立绘（否则会出现"框在图里、存下来的坐标在图外"）。改完重生成缩略图，
   * 不然列表里看到的还是旧头部的图。
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
        text: "其它立绘的裁剪已经和默认立绘一致了，不需要再改。",
      });
      return;
    }

    const confirmed = window.confirm(
      `将把 ${targets.length} 张立绘的裁剪改成默认立绘「${defaultPortrait.portName}」的裁剪` +
        `（${defaultPortraitCrop.faceX}, ${defaultPortraitCrop.faceY}, ${defaultPortraitCrop.length}），` +
        `并重新生成这些立绘的缩略图。确定吗？`,
    );
    if (!confirmed) return;

    const characterId = editingCharacter.characterID;
    const updatedPortraits = new Map<string, Portrait>();
    let adjustedCount = 0;
    let imageFailedCount = 0;
    let thumbnailFailedCount = 0;
    setBatchMessage(null);

    for (let index = 0; index < targets.length; index++) {
      const portrait = targets[index];
      setBatchProgress({ kind: "crop", done: index, total: targets.length });

      // 先按"图片尺寸未知"取一份兜底值（原图读不到时至少让数值一致）
      let rect = resolveDefaultCropRect({
        crop: defaultPortraitCrop,
        imageSize: null,
      }).rect;
      if (!rect) continue;

      let image: HTMLImageElement | null = null;
      try {
        image = await loadImageElement(
          buildPortraitImageUrl(portrait.imagePath),
        );
        const resolved = resolveDefaultCropRect({
          crop: defaultPortraitCrop,
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
        faceX: rect.left,
        faceY: rect.top,
        length: rect.width,
        thumbnailPath,
      });
    }

    setBatchProgress(null);

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
      setThumbnailVersion((version) => version + 1);
    }

    const parts = [`已更新 ${updatedPortraits.size} 张立绘的裁剪`];
    if (adjustedCount > 0) {
      parts.push(`其中 ${adjustedCount} 张超出原图范围，已按图片边界修正`);
    }
    if (imageFailedCount > 0) {
      parts.push(`${imageFailedCount} 张原图加载失败（只改了数值，缩略图没更新）`);
    }
    if (thumbnailFailedCount > 0) {
      parts.push(`${thumbnailFailedCount} 张缩略图重新生成失败`);
    }
    parts.push("记得点右上角「保存」写入数据库");

    setBatchMessage({
      kind:
        imageFailedCount > 0 || thumbnailFailedCount > 0 ? "info" : "success",
      text: `${parts.join("；")}。`,
    });
  };

  /**
   * 「批量导入立绘」：一次选多张图，逐张上传原图 + 生成缩略图后加进立绘列表。
   *
   * <p>若角色已有可用的默认立绘，导入的立绘直接套用默认立绘的裁剪
   * （按各自原图尺寸夹进图片），保证同一角色不同表情的头部比例一致。
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
      setBatchProgress({
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

    setBatchProgress(null);

    if (importedPortraits.length > 0) {
      setEditingCharacter((prev) =>
        prev
          ? {
              ...prev,
              portraits: [...(prev.portraits || []), ...importedPortraits],
            }
          : prev,
      );
      setThumbnailVersion((version) => version + 1);
    }

    const parts: string[] = [];
    if (importedPortraits.length > 0) {
      parts.push(
        `已导入 ${importedPortraits.length} 张立绘${
          hasDefaultCrop ? "（裁剪已与默认立绘一致）" : ""
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
      setEditingCharacter({
        ...editingCharacter,
        portraits: editingCharacter.portraits.filter(
          (p) => p.portraitID !== portraitId,
        ),
      });
    } catch (error) {
      console.error("删除立绘失败:", error);
      alert("删除立绘失败，请重试");
    }
  };

  const handleSetDefaultPortrait = async (portraitId: string) => {
    if (!editingCharacter) return;

    try {
      // 调用API设置默认立绘（后端会清除该角色其他立绘的默认标记）
      await ApiService.setDefaultPortrait(
        editingCharacter.characterID,
        portraitId,
      );

      // 本地同步默认标记。默认立绘由 defaultPortrait 字段表示，
      // 不再靠"把立绘挪到数组第一位"来模拟——那样刷新页面后就会被后端顺序覆盖。
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
        portraits: character.portraits || portraits || [],
      });
    }
  }, [character, portraits]);

  const handleSave = async () => {
    if (!editingCharacter) return;

    console.log("[CharacterDetailModal] 保存角色详情", {
      characterName: editingCharacter.characterName,
      characterID: editingCharacter.characterID,
      hasCardImagePath: !!editingCharacter.characterCardImagePath,
      cardImagePath: editingCharacter.characterCardImagePath,
      portraitsCount: editingCharacter.portraits?.length || 0,
      portraitIds: editingCharacter.portraits?.map((p) => p.portraitID) || [],
    });

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
      alert("保存角色失败，请重试");
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

  if (!editingCharacter) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>
            {isNewCharacter
              ? "添加新角色"
              : `编辑角色: ${editingCharacter.characterName}`}
          </h2>
          <div className="header-actions">
            <button className="btn-primary" onClick={handleSave}>
              保存
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
          onApplyDefaultCropToAll={handleApplyDefaultCropToAll}
          onBatchImportPortraits={handleBatchImportPortraits}
          canApplyDefaultCrop={defaultCropTargets.length > 0}
          batchProgress={batchProgress}
          batchMessage={batchMessage}
          onDismissBatchMessage={() => setBatchMessage(null)}
          thumbnailVersion={thumbnailVersion}
        />
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
          onSave={(portrait) => {
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
              // 添加新立绘
              setEditingCharacter((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  portraits: [...(prev.portraits || []), portrait],
                };
              });
              console.log("[CharacterDetailModal] 添加新立绘", {
                portraitId: portrait.portraitID,
                totalPortraits: (editingCharacter?.portraits?.length || 0) + 1,
              });
            }
            setShowPortraitModal(false);
            setEditingPortrait(null);
            setIsAddingNewPortrait(false);
          }}
        />
      )}
    </div>
  );
};

export default CharacterDetailModal;
