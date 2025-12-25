import React, { useState, useRef, useCallback } from "react";
import { Background } from "../../../types";
import ApiService from "../../../services/ApiService";
import "../ResourceManager.css";
import "./BackgroundsTab.css";
import BackgroundCard from "./BackgroundCard";
import BackgroundModal from "./BackgroundModal";
import BackgroundActions from "./BackgroundActions";

interface BackgroundsTabProps {
  backgrounds: Background[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  openResourceFolder: (
    resourceType: "characters" | "backgrounds" | "audios"
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
    null
  );
  const [showBackgroundModal, setShowBackgroundModal] = useState(false);
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(
    null
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
          0.8
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

      // 确保包含缩略图
      const backgroundToSave: Background = {
        ...editingBackground,
        thumbnailPath: croppedImage || editingBackground.thumbnailPath,
      };

      log("准备保存的背景对象", backgroundToSave);

      let updatedBackground: Background;
      const existingBackgroundIndex = backgrounds.findIndex(
        (bg) => bg.uuid === editingBackground.uuid
      );

      if (existingBackgroundIndex !== -1) {
        // 更新现有背景
        log("更新现有背景", editingBackground.name);

        // 确保路径不为空，如果为空则生成一个默认路径
        if (!backgroundToSave.path || backgroundToSave.path.trim() === "") {
          // 如果有文件名，使用文件名，否则使用背景名称
          const nameForPath = backgroundFile
            ? backgroundFile.name.replace(/\.[^/.]+$/, "")
            : backgroundToSave.name || "unnamed";
          const defaultPath = `assets/backgrounds/${nameForPath}_${Date.now()}.png`;
          backgroundToSave.path = defaultPath;
          log("背景路径为空，生成默认路径", defaultPath);
        }

        log("发送到后端的背景数据", backgroundToSave);
        updatedBackground = await ApiService.updateBackground(
          editingBackground.uuid,
          backgroundToSave
        );
        log("从后端返回的更新背景", updatedBackground);
        const newBackgrounds = [...backgrounds];
        newBackgrounds[existingBackgroundIndex] = updatedBackground;
        setBackgrounds(newBackgrounds);
        log("背景更新成功", editingBackground.name);
      } else {
        // 添加新背景
        log("添加新背景", editingBackground.name);
        // 确保path和name不为空
        if (!backgroundToSave.path || backgroundToSave.path.trim() === "") {
          const defaultPath = `assets/backgrounds/${
            backgroundToSave.name || "unnamed"
          }_${Date.now()}.png`;
          backgroundToSave.path = defaultPath;
          log("背景路径为空，生成默认路径", defaultPath);
        }

        // 确保名称不为空或默认的"新背景"
        if (
          !backgroundToSave.name ||
          backgroundToSave.name.trim() === "" ||
          backgroundToSave.name === "新背景"
        ) {
          if (backgroundFile) {
            backgroundToSave.name = backgroundFile.name.replace(
              /\.[^/.]+$/,
              ""
            );
            log("从文件名更新背景名称", backgroundToSave.name);
          } else {
            log("背景名称为空，使用默认名称");
            backgroundToSave.name = "新背景" + Date.now();
          }
        }

        log("发送到后端的新背景数据", backgroundToSave);
        updatedBackground = await ApiService.addBackground(backgroundToSave);
        log("从后端返回的新背景", updatedBackground);
        setBackgrounds([...backgrounds, updatedBackground]);
        log("背景添加成功", editingBackground.name);
        log("当前背景列表", backgrounds);
      }

      setSelectedBackground(updatedBackground);
      setEditingBackground(null);
      setIsEditing(false);
      setShowBackgroundModal(false);

      // 重置缩略图状态
      setCroppedImage(null);
    } catch (error) {
      console.error("保存背景失败:", error);
      log("背景保存失败", error);
      alert("保存背景失败，请重试");
    }
  };

  const handleDeleteBackground = async (backgroundId: string) => {
    if (!window.confirm("确定要删除这个背景吗？")) return;

    try {
      log("删除背景", backgroundId);
      await ApiService.deleteBackground(backgroundId);

      // 从本地状态中移除背景
      const updatedBackgrounds = backgrounds.filter(
        (bg) => bg.uuid !== backgroundId
      );
      setBackgrounds(updatedBackgrounds);

      // 如果删除的是当前选中的背景，清除选中状态
      if (selectedBackground?.uuid === backgroundId) {
        setSelectedBackground(null);
      }

      log("背景删除成功", backgroundId);
      alert("背景删除成功");
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
      filePath = `assets/backgrounds/${fileNameWithoutExt}_${Date.now()}.png`;
      log("无法获取文件真实路径，创建默认路径", filePath);
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
    background.name.toLowerCase().includes(searchTerm.toLowerCase())
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
