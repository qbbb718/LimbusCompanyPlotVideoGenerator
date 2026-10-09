import React, { useState, useRef, useCallback } from "react";
import { Background } from "@types";
import ApiService from "@services/ApiService";
import { AppConfig } from '@root/features/common/config/appConfig';
import "../ResourceManager.css";
import "./BackgroundsTab.css";
import BackgroundCard from "./BackgroundCard";
import BackgroundModal from "./BackgroundModal";
import BackgroundActions from "./BackgroundActions";

// 将blob URL转换为File对象
const blobUrlToFile = async (blobUrl: string, filename: string): Promise<File> => {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type });
};

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 缩略图状态
  const [croppedImage, setCroppedImage] = useState<string | null>(null);

  // 日志函数
  const log = (message: string, data?: any) => {
    console.log(`[BackgroundsTab] ${message}`, data);
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

  const handleAddBackground = () => {
    log("添加新背景");
    // 重置所有状态
    setBackgroundFile(null);
    setBackgroundPreview(null);
    setCroppedImage(null);

    // 创建一个新的背景对象
    const newBackground: Background = {
      uuid: `bg_${Date.now()}`,
      name: "新背景",
      path: "",
      tags: [],
    };

    log("创建的新背景对象", newBackground);
    log("当前背景列表", backgrounds);

    setBackgrounds([...backgrounds, newBackground]);
    setSelectedBackground(newBackground);
    setEditingBackground(newBackground);
    setIsEditing(true);
    setShowBackgroundModal(true);

    log("背景编辑窗口已打开");
  };

  const handleEditBackground = (background: Background) => {
    log("编辑背景", background.name);
    log("编辑的背景对象", background);
    setSelectedBackground(background);
    const editingBg = { ...background };
    log("复制的编辑背景对象", editingBg);
    setEditingBackground(editingBg);
    setIsEditing(true);
    setShowBackgroundModal(true);
    log("背景编辑窗口已打开");
  };

  const handleSaveBackground = async () => {
    if (!editingBackground) return;

    try {
      log("保存背景", editingBackground.name);
      log("编辑中的背景对象", editingBackground);

      const backgroundToSave: Background = { ...editingBackground };

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

      const existingBackgroundIndex = backgrounds.findIndex(
        (bg) => bg.uuid === editingBackground.uuid,
      );
      const isNewBackground = existingBackgroundIndex === -1;

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
          alert("背景原图上传失败，请检查后端日志后重试");
          return;
        }
      }

      // 确保 path 不为空：如果用户没选文件，又没填 path，则无法保存
      if (!backgroundToSave.path || backgroundToSave.path.trim() === "") {
        alert("请先选择背景图片文件再保存");
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

      // 3) 更新本地列表
      if (isNewBackground) {
        setBackgrounds([...backgrounds, updatedBackground]);
        log("背景添加成功", updatedBackground.name);
      } else {
        const newBackgrounds = [...backgrounds];
        newBackgrounds[existingBackgroundIndex] = updatedBackground;
        setBackgrounds(newBackgrounds);
        log("背景更新成功", updatedBackground.name);
      }

      setSelectedBackground(updatedBackground);
      setEditingBackground(null);
      setIsEditing(false);
      setShowBackgroundModal(false);
      setBackgroundFile(null);
      setBackgroundPreview(null);
      setCroppedImage(null);
    } catch (error) {
      console.error("保存背景失败:", error);
      log("背景保存失败", error);
      alert("保存背景失败，请重试");
    }
  };

  const handleDeleteBackground = async (backgroundId: string) => {
    const bg = backgrounds.find((b) => b.uuid === backgroundId);
    const name = bg?.name || "该背景";

    // 整个删除流程只有这一个弹窗：确认后连磁盘上的原图与缩略图一起删除。
    // （卡片上的删除按钮已不再单独弹确认框，删除成功后也不再弹提示框）
    const confirmed = window.confirm(
      `确定删除背景「${name}」吗？\n\n将同时删除数据库记录和磁盘中的图片文件（原图与缩略图）。`,
    );
    if (!confirmed) return;

    const deleteFiles = true;

    try {
      log("删除背景", { backgroundId, deleteFiles });
      await ApiService.deleteBackground(backgroundId, deleteFiles);

      const updatedBackgrounds = backgrounds.filter(
        (bg2) => bg2.uuid !== backgroundId,
      );
      setBackgrounds(updatedBackgrounds);

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
    setBackgroundFile(null);
    setBackgroundPreview(null);
    setCroppedImage(null);
    setShowBackgroundModal(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    log("选择背景文件", file.name);
    // 在Electron环境中，获取文件的真实路径
    let filePath = (file as any).path || file.webkitRelativePath || "";

    // 如果没有获取到真实路径，创建一个默认路径
    if (!filePath) {
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      filePath = `${AppConfig.resources.backgroundsBasePath}/${fileNameWithoutExt}_${Date.now()}.png`;
    }

    log("文件详细信息", {
      name: file.name,
      size: file.size,
      type: file.type,
      path: filePath,
    });
    setBackgroundFile(file);

    // 读取文件预览
    const reader1 = new FileReader();
    reader1.onload = async (event) => {
      const imageSrc = event.target?.result as string;
      setBackgroundPreview(imageSrc);
      log("图片读取完成，开始生成缩略图");

      // 自动生成缩略图
      try {
        const thumbnail = await generateThumbnail(imageSrc);
        setCroppedImage(thumbnail);
        log("缩略图生成成功", thumbnail ? "成功" : "失败");

        // 更新编辑中的背景缩略图路径
        if (editingBackground) {
          const updatedBackground: Background = {
            ...editingBackground,
            thumbnailPath: thumbnail,
          };
          log("更新编辑中的背景", updatedBackground);
          setEditingBackground(updatedBackground);
        }
      } catch (error) {
        console.error("生成缩略图失败:", error);
        log("生成缩略图失败", error);
      }
    };
    reader1.readAsDataURL(file);

    // 更新编辑中的背景路径和名称
    if (editingBackground) {
      // 获取文件名（不带后缀）
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      const updatedBackground: Background = {
        ...editingBackground,
        name: fileNameWithoutExt,
        path: filePath,
      };
      log("更新背景名称和路径", updatedBackground);
      setEditingBackground(updatedBackground);

      // 读取文件预览
      const reader = new FileReader();
      reader.onload = async (event) => {
        const imageSrc = event.target?.result as string;
        setBackgroundPreview(imageSrc);
        log("图片读取完成，开始生成缩略图");

        // 自动生成缩略图
        try {
          const thumbnail = await generateThumbnail(imageSrc);
          setCroppedImage(thumbnail);
          log("缩略图生成成功", thumbnail ? "成功" : "失败");

          // 更新编辑中的背景缩略图路径，保留已有的名称和路径
          if (editingBackground) {
            const updatedBackgroundWithThumbnail = {
              ...updatedBackground, // 使用之前已经更新的对象，保留名称和路径
              thumbnailPath: thumbnail,
            };
            log("更新编辑中的背景缩略图", updatedBackgroundWithThumbnail);
            setEditingBackground(updatedBackgroundWithThumbnail);
          }
        } catch (error) {
          console.error("生成缩略图失败:", error);
          log("生成缩略图失败", error);
        }
      };
      reader.readAsDataURL(file);
      return; // 提前返回，避免再次执行下面的代码
    }

    // 如果没有editingBackground，则执行默认流程
    // 读取文件预览
    const reader = new FileReader();
    reader.onload = async (event) => {
      const imageSrc = event.target?.result as string;
      setBackgroundPreview(imageSrc);
      log("图片读取完成，开始生成缩略图");

      // 自动生成缩略图
      try {
        const thumbnail = await generateThumbnail(imageSrc);
        setCroppedImage(thumbnail);
        log("缩略图生成成功", thumbnail ? "成功" : "失败");

        // 更新编辑中的背景缩略图路径
        if (editingBackground) {
          const updatedBackground: Background = {
            ...(editingBackground as Background), // 显式类型断言
            thumbnailPath: thumbnail,
          };
          setEditingBackground(updatedBackground);
        }
      } catch (error) {
        console.error("生成缩略图失败:", error);
        log("生成缩略图失败", error);
      }
    };
    reader.readAsDataURL(file);
  };

  const filteredBackgrounds = backgrounds.filter((background) =>
    background.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="resource-tab">
      <BackgroundActions
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        openResourceFolder={openResourceFolder}
        onAddBackground={handleAddBackground}
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
          />
        ))}
      </div>

      {/* 背景编辑弹窗 */}
      {showBackgroundModal && editingBackground && (
        <BackgroundModal
          isEditing={isEditing}
          editingBackground={editingBackground}
          backgroundPreview={backgroundPreview}
          onCancel={handleCancelEditBackground}
          onSave={handleSaveBackground}
          onBackgroundChange={setEditingBackground}
          onFileSelect={() => fileInputRef.current?.click()}
        />
      )}

      {/* 隐藏的文件输入 */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept="image/*"
        onChange={handleFileSelect}
      />
    </div>
  );
};

export default BackgroundsTab;
