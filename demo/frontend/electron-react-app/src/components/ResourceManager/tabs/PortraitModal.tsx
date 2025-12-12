import React from "react";
import { Portrait } from "../../../types";
import { mapEmotion } from "../../../utils/emotionMapper";
import { createCroppedImage } from "../../../utils/imageUtils";
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
}

const PortraitModal: React.FC<PortraitModalProps> = ({
  characterId,
  portrait,
  onClose,
  onSave,
  isNewPortrait,
}) => {
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

  const {
    fileInputRef, // 文件输入框引用
    selectImageFile, // 选择图片文件
    handleFileSelect, // 处理文件选择
  } = useFileSelector({
    characterId,
    onFileSelected: (file: File, imagePath: string, baseName: string) => {
      setEditingPortrait(createNewPortrait(imagePath, baseName));
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
                if (emotionInput) {
                  const standardEmotion = mapEmotion(emotionInput);
                  editingPortrait.emotion = standardEmotion as unknown as any;
                }

                // 生成缩略图
                if (portraitPreview && croppedAreaPixels) {
                  try {
                    // 使用createCroppedImage函数生成缩略图
                    const thumbnailBlob = await createCroppedImage(
                      portraitPreview,
                      croppedAreaPixels
                    );

                    // 创建缩略图文件名
                    const thumbnailFileName = `thumbnail_${editingPortrait.portraitID}.png`;

                    // 如果在Electron环境中，保存缩略图到本地
                    if (window.electronAPI) {
                      // 将blob转换为arrayBuffer
                      const arrayBuffer = await thumbnailBlob.arrayBuffer();

                      // 保存缩略图到本地
                      const thumbnailPath =
                        await window.electronAPI.saveThumbnail(
                          thumbnailFileName,
                          new Uint8Array(arrayBuffer)
                        );

                      // 更新立绘的缩略图路径
                      editingPortrait.thumbnailPath = thumbnailPath;
                    } else {
                      // 非Electron环境，创建临时URL
                      editingPortrait.thumbnailPath =
                        URL.createObjectURL(thumbnailBlob);
                    }
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
