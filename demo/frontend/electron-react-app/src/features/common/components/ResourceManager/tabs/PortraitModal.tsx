import React, { useState } from "react";
import { Portrait } from "@types";
import { mapEmotion } from "../../../utils/emotionMapper";
import { createCroppedImage } from "../../../utils/imageUtils";
import ApiService from "@features/common/ApiService";
import {
  usePortraitState,
  useImageCropper,
  useFileSelector,
  PortraitPreview,
  PortraitSettings,
  createLogger,
} from "./PortraitModal/index";
import "./CharacterModal.css";
import "./EmotionInput.css";

const log = createLogger("PortraitModal");

interface PortraitModalProps {
  characterId: string;
  portrait: Portrait | null;
  onClose: () => void;
  onSave: (portrait: Portrait) => void;
  isNewPortrait: boolean;
  defaultPortrait?: Portrait | null; // 角色的默认立绘
}

const PortraitModal: React.FC<PortraitModalProps> = ({
  characterId,
  portrait,
  onClose,
  onSave,
  isNewPortrait,
  defaultPortrait,
}) => {
  // 保存用户选择的文件对象，供上传到后端使用
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // 使用自定义hooks管理状态
  const {
    editingPortrait,
    setEditingPortrait,
    portraitPreview,
    setPortraitPreview,
    emotionInput,
    setEmotionInput,
    currentPortrait,
    createNewPortrait,
    updateEmotion,
  } = usePortraitState({ characterId, portrait, isNewPortrait });

  const {
    crop,
    zoom,
    croppedAreaPixels,
    onCropComplete,
    handleImageLoad,
    resetCropParameters,
  } = useImageCropper(portrait);

  // 获取角色的默认立绘裁剪状态
  const getDefaultCropState = () => {
    // 优先使用传入的默认立绘数据
    if (defaultPortrait) {
      return {
        faceX: defaultPortrait.faceX || 0,
        faceY: defaultPortrait.faceY || 0,
        length: defaultPortrait.length || 100,
      };
    }

    // 如果没有默认立绘数据，使用当前立绘的数据
    if (portrait) {
      return {
        faceX: portrait.faceX || 0,
        faceY: portrait.faceY || 0,
        length: portrait.length || 100,
      };
    }

    // 否则，使用默认值
    return {
      faceX: 0,
      faceY: 0,
      length: 100,
    };
  };

  const {
    fileInputRef, // 文件输入框引用
    selectImageFile, // 选择图片文件
    handleFileSelect, // 处理文件选择
  } = useFileSelector({
    characterId,
    onFileSelected: (file: File, imagePath: string, baseName: string) => {
      // 保存文件对象供后续上传到后端
      setPendingFile(file);
      // 获取角色的默认立绘裁剪状态
      const defaultCropState = getDefaultCropState();
      setEditingPortrait(
        createNewPortrait(imagePath, baseName, defaultCropState),
      );
    },
    onPreviewSet: setPortraitPreview,
    onCropReset: resetCropParameters,
  });

  // 在添加新立绘时，editingPortrait 可能为 null，但组件仍应显示
  if (!editingPortrait && !isNewPortrait) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>{isNewPortrait ? "添加新立绘" : "编辑立绘"}</h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="portrait-editor">
          {/* 左侧：图片预览和上传 */}
          <div className="portrait-preview">
            <div className="file-upload">
              {window.electronAPI ? (
                <button
                  className="file-upload-button"
                  onClick={selectImageFile}
                >
                  选择立绘文件
                </button>
              ) : (
                <>
                  <label className="file-upload-label">
                    选择立绘文件
                    {/* 隐藏的文件输入框，仅在非Electron环境使用 */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      style={{ display: "none" }}
                    />
                  </label>
                </>
              )}
            </div>

            {/* 使用拆分后的组件 */}
            <PortraitPreview
              portraitPreview={portraitPreview}
              crop={crop}
              zoom={zoom}
              currentPortrait={currentPortrait}
              onCropComplete={onCropComplete}
              handleImageLoad={handleImageLoad}
              defaultCropState={getDefaultCropState()}
            />
          </div>

          {/* 右侧：设置面板 */}
          <PortraitSettings
            currentPortrait={currentPortrait}
            emotionInput={emotionInput}
            setEmotionInput={setEmotionInput}
            setEditingPortrait={setEditingPortrait}
          />
        </div>

        {/* 底部按钮 */}
        <div className="modal-footer">
          <button className="cancel-button" onClick={onClose}>
            取消
          </button>
          <button
            className="save-button"
            onClick={async () => {
              if (editingPortrait) {
                // 确保情绪已映射到标准情绪
                let emotionCode = "normal";
                if (emotionInput) {
                  const standardEmotion = mapEmotion(emotionInput);
                  editingPortrait.emotion = standardEmotion as unknown as any;
                  emotionCode = String(standardEmotion).toLowerCase();
                }

                // 如果是新立绘且有待上传的文件，先上传到后端
                if (isNewPortrait && pendingFile && characterId) {
                  try {
                    // 确保 portraitID 存在（后端用 portraitId 命名文件）
                    if (!editingPortrait.portraitID) {
                      editingPortrait.portraitID = `portrait_${Date.now()}`;
                    }
                    log("开始上传立绘原图到后端...");
                    const uploadResult = await ApiService.uploadPortraitFile(
                      characterId,
                      editingPortrait.portraitID,
                      pendingFile,
                      emotionCode,
                    );
                    // 用后端返回的路径覆盖本地路径
                    editingPortrait.imagePath = uploadResult.imagePath;
                    log("立绘原图已上传", uploadResult.imagePath);
                  } catch (error) {
                    console.error("上传立绘原图失败:", error);
                    alert("上传立绘原图失败，请检查后端是否正常运行");
                    return; // 阻止保存
                  }
                }

                // 生成缩略图（通过后端 API 上传，路径由后端 config 集中管理）
                // 后端保存到 {characters}/{characterId}/{characterThumbnailsSubdir}/thumbnail_{portraitId}.png
                // 返回 URL 路径，存入 DB portrait.thumbnail_path，删除角色目录时一并清理。
                if (portraitPreview && croppedAreaPixels) {
                  try {
                    // 使用createCroppedImage函数生成缩略图
                    const thumbnailBlob = await createCroppedImage(
                      portraitPreview,
                      croppedAreaPixels,
                    );

                    // 创建缩略图文件名
                    const thumbnailFileName = `thumbnail_${editingPortrait.portraitID}.png`;

                    // 通过后端 API 上传缩略图（替代原 Electron IPC saveThumbnail）
                    const formData = new FormData();
                    formData.append("file", thumbnailBlob, thumbnailFileName);
                    const thumbnailPath =
                      await ApiService.uploadPortraitThumbnail(
                        editingPortrait.characterID,
                        editingPortrait.portraitID,
                        formData,
                      );

                    // 更新立绘的缩略图路径（URL 路径，前端 <img src> 直接拼 baseUrl 访问）
                    editingPortrait.thumbnailPath = thumbnailPath;
                  } catch (error) {
                    console.error("生成缩略图失败:", error);
                    log("生成缩略图失败", error);
                  }
                }

                // 更新裁剪相关值
                if (croppedAreaPixels) {
                  editingPortrait.faceX = Math.round(croppedAreaPixels.x);
                  editingPortrait.faceY = Math.round(croppedAreaPixels.y);
                  editingPortrait.length = Math.round(croppedAreaPixels.width);
                  // 确保保存了裁剪区域的大小，以便下次打开时能够恢复
                  log("保存裁剪区域", {
                    x: editingPortrait.faceX,
                    y: editingPortrait.faceY,
                    width: editingPortrait.length,
                  });
                }

                log("保存立绘", editingPortrait);
                onSave(editingPortrait);
              }
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default PortraitModal;
