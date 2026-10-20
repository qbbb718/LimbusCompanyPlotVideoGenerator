import React, { useMemo, useState } from "react";
import { Portrait } from "@types";
import {
  detectEmotionFromFileName,
  mapEmotion,
} from "../../../utils/emotionMapper";
import { createCroppedImage, loadImageElement } from "../../../utils/imageUtils";
import ApiService from "@features/common/ApiService";
import {
  usePortraitState,
  useImageCropper,
  useFileSelector,
  PortraitPreview,
  PortraitSettings,
  PortraitScenePreview,
  createLogger,
} from "./PortraitModal/index";
import {
  ImageSize,
  PortraitCropState,
  isValidCropState,
  resolveDefaultCropRect,
} from "@features/common/utils/portraitCrop";
import { portraitCropOf } from "@features/common/utils/portraitBatch";
import { loadPortraitImageSize } from "@features/common/utils/portraitUtils";
import "./CharacterModal.css";
import "./EmotionInput.css";

const log = createLogger("PortraitModal");

/**
 * 等"新图 + 源图"尺寸最多这么久。
 *
 * <p>图片解码 / 请求卡住时不能把编辑器锁死：超时就先用兜底的像素值，
 * 用户可以随后再点「裁剪与默认立绘一致」按比例校正。
 */
const PRESET_CROP_TIMEOUT_MS = 4000;

/**
 * 读一张待上传图片（本地文件）的像素尺寸。
 *
 * <p>objectURL 解码完就回收；读不到时返回 null，调用方退回按像素照搬。
 */
const readImageFileSize = async (file: File): Promise<ImageSize | null> => {
  if (!file || file.size === 0) return null;

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageElement(objectUrl);
    return { width: image.naturalWidth, height: image.naturalHeight };
  } catch (error) {
    log("读取待上传图片尺寸失败", error);
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

interface PortraitModalProps {
  characterId: string;
  portrait: Portrait | null;
  onClose: () => void;
  onSave: (portrait: Portrait) => void;
  isNewPortrait: boolean;
  defaultPortrait?: Portrait | null; // 角色的默认立绘
  /** 角色身高（cm）：预览时决定立绘在画面里的纵向位置，缺省 171（与后端默认一致） */
  characterHeight?: number;
}

const PortraitModal: React.FC<PortraitModalProps> = ({
  characterId,
  portrait,
  onClose,
  onSave,
  isNewPortrait,
  defaultPortrait,
  characterHeight = 171,
}) => {
  // 保存用户选择的文件对象，供上传到后端使用
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // 正在读新图的尺寸、算预置裁剪：算完之前先别把裁剪器挂出来，
  // 否则会用旧立绘的裁剪框先闪一下，再跳到按比例算好的位置
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  // 立绘场景预览弹窗是否打开
  const [showScenePreview, setShowScenePreview] = useState(false);
  // 使用自定义hooks管理状态
  const {
    editingPortrait,
    setEditingPortrait,
    portraitPreview,
    setPortraitPreview,
    currentPortrait,
    createNewPortrait,
  } = usePortraitState({ characterId, portrait, isNewPortrait });

  const {
    croppedAreaPixels,
    onCropComplete,
    handleImageLoad,
    resetCropParameters,
  } = useImageCropper(portrait);

  /**
   * 角色默认立绘的裁剪参数 —— 「裁剪与默认立绘一致」按钮的目标。
   *
   * 为 null 时按钮不显示，三种情况都不该有按钮：
   * 1. 角色还没有默认立绘（一根立绘都没有），没有可对齐的目标；
   * 2. 默认立绘还没框过头（length <= 0），裁剪参数没有意义；
   * 3. 正在编辑的就是默认立绘本身，"与自己一致"没有意义。
   */
  const defaultCropState = useMemo<PortraitCropState | null>(() => {
    if (!defaultPortrait) return null;

    const crop: PortraitCropState = {
      faceX: defaultPortrait.faceX ?? 0,
      faceY: defaultPortrait.faceY ?? 0,
      length: defaultPortrait.length ?? 0,
    };
    if (!isValidCropState(crop)) return null;

    if (portrait && portrait.portraitID === defaultPortrait.portraitID) {
      return null;
    }
    return crop;
  }, [defaultPortrait, portrait]);

  /** 新立绘打开时**兜底**用的裁剪像素值（读不到图片尺寸时才会直接用到） */
  const presetCropState = useMemo<PortraitCropState | undefined>(() => {
    if (defaultCropState) return defaultCropState;
    if (!portrait) return undefined;

    const crop: PortraitCropState = {
      faceX: portrait.faceX ?? 0,
      faceY: portrait.faceY ?? 0,
      length: portrait.length ?? 0,
    };
    return isValidCropState(crop) ? crop : undefined;
  }, [defaultCropState, portrait]);

  /**
   * 新选的图该用哪个裁剪框。
   *
   * <p>`presetCropState` 是**像素**值，只能直接用在尺寸相同的图上。同一角色的立绘
   * 可能是 1600×2432、也可能导出了 640×983 的版本，照搬像素值会让头框偏大或偏小，
   * 所以这里按源图（默认立绘 / 这张立绘自己的旧图）的比例换算到新图上；
   * 读不到任何一边的尺寸时，退回原来的像素值。
   */
  const resolveCropForNewFile = async (
    file: File,
  ): Promise<PortraitCropState | undefined> => {
    const sourcePortrait = defaultCropState ? defaultPortrait : portrait;
    const sourceCrop = defaultCropState
      ? defaultCropState
      : portrait
        ? portraitCropOf(portrait)
        : null;
    if (!sourcePortrait || !sourceCrop || !isValidCropState(sourceCrop)) {
      return presetCropState;
    }

    const [sourceImageSize, targetImageSize] = await Promise.all([
      loadPortraitImageSize(sourcePortrait.imagePath),
      readImageFileSize(file),
    ]);
    if (!targetImageSize) {
      return presetCropState;
    }

    const { rect } = resolveDefaultCropRect({
      crop: sourceCrop,
      sourceImageSize,
      imageSize: targetImageSize,
    });
    if (!rect) {
      return presetCropState;
    }
    return { faceX: rect.left, faceY: rect.top, length: rect.width };
  };

  const {
    fileInputRef, // 文件输入框引用
    selectImageFile, // 选择图片文件
    handleFileSelect, // 处理文件选择
  } = useFileSelector({
    characterId,
    onFileSelected: (file: File, imagePath: string, baseName: string) => {
      // 换图要读两边的原图尺寸才能按比例预置裁剪，所以异步建好新立绘再写状态
      setIsPreparingImage(true);
      void (async () => {
        try {
          // 保存文件对象供后续上传到后端
          setPendingFile(file);
          // 新立绘按默认立绘的裁剪**比例**预置，保证同一角色不同表情的缩放一致。
          // 读尺寸卡住时用兜底像素值，别让保存按钮一直灰着。
          const presetCrop = await Promise.race([
            resolveCropForNewFile(file),
            new Promise<PortraitCropState | undefined>((resolve) =>
              setTimeout(
                () => resolve(presetCropState),
                PRESET_CROP_TIMEOUT_MS,
              ),
            ),
          ]);
          const nextPortrait = createNewPortrait(
            imagePath,
            baseName,
            presetCrop,
          );

          // 读取上传图片的文件名自动设置情绪：中文、英文关键词都支持
          // 例：罗佳-face_happy_L.png → 开心；罗佳-悲伤.png → 悲伤
          const fileName = file.name || baseName;
          const detectedEmotion = detectEmotionFromFileName(fileName);
          // 文件名里没有情绪关键词时，保留用户当前已选的情绪，不要退回“正常”
          const emotion =
            detectedEmotion ?? mapEmotion(currentPortrait.emotion);
          nextPortrait.emotion = emotion as unknown as Portrait["emotion"];
          if (detectedEmotion) {
            log("根据文件名自动设置情绪", {
              fileName,
              emotion: detectedEmotion,
            });
          }

          setEditingPortrait(nextPortrait);
        } finally {
          setIsPreparingImage(false);
        }
      })();
    },
    onPreviewSet: setPortraitPreview,
    onCropReset: resetCropParameters,
  });

  // 在添加新立绘时，editingPortrait 可能为 null，但组件仍应显示
  if (!editingPortrait && !isNewPortrait) return null;

  /**
   * 当前裁剪参数。
   *
   * 优先用裁剪器实时回调的 croppedAreaPixels（用户刚拖动过、还没保存的裁剪框）；
   * 裁剪器尚未回调时（例如刚打开弹窗就点预览）退回立绘里已保存的裁剪值，
   * 保证「预览」永远预览的是用户眼前看到的裁剪框。
   */
  const previewCrop = croppedAreaPixels
    ? {
        faceX: Math.round(croppedAreaPixels.x),
        faceY: Math.round(croppedAreaPixels.y),
        length: Math.round(croppedAreaPixels.width),
      }
    : {
        faceX: Math.round(currentPortrait.faceX || 0),
        faceY: Math.round(currentPortrait.faceY || 0),
        length: Math.round(currentPortrait.length || 0),
      };

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
            {isPreparingImage && (
              <div
                className="portrait-preview-loading"
                role="status"
                style={{ padding: "24px 0", color: "#666", fontSize: "14px" }}
              >
                正在读取立绘尺寸并按比例套用裁剪…
              </div>
            )}
            <PortraitPreview
              portraitPreview={isPreparingImage ? null : portraitPreview}
              currentPortrait={currentPortrait}
              onCropComplete={onCropComplete}
              handleImageLoad={handleImageLoad}
              defaultCropState={defaultCropState}
              defaultPortraitImagePath={defaultPortrait?.imagePath ?? null}
            />

            {/* 裁剪区域下方右侧：预览立绘在完整画面中的效果 */}
            <div className="portrait-preview-actions">
              <button
                className="btn-secondary"
                onClick={() => setShowScenePreview(true)}
                disabled={!portraitPreview || isPreparingImage}
                title={
                  isPreparingImage
                    ? "正在读取新图的尺寸，稍等一下"
                    : portraitPreview
                      ? "按当前裁剪参数渲染立绘在画面中的效果"
                      : "请先选择立绘文件"
                }
              >
                预览
              </button>
            </div>
          </div>

          {/* 右侧：设置面板 */}
          <PortraitSettings
            currentPortrait={currentPortrait}
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
            disabled={isPreparingImage}
            title={
              isPreparingImage ? "正在读取新图的尺寸，稍等一下" : undefined
            }
            onClick={async () => {
              if (editingPortrait) {
                // 情绪由中文下拉框直接写入 editingPortrait.emotion，
                // 这里再归一化一次，兼容后端返回的 code 和历史数据里的大写枚举名
                const standardEmotion = mapEmotion(editingPortrait.emotion);
                editingPortrait.emotion = standardEmotion as unknown as any;
                const emotionCode = String(standardEmotion).toLowerCase();

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

        {showScenePreview && portraitPreview && (
          <PortraitScenePreview
            imagePath={currentPortrait.imagePath}
            imageFile={pendingFile}
            faceX={previewCrop.faceX}
            faceY={previewCrop.faceY}
            length={previewCrop.length}
            adjX={currentPortrait.adjX || 0}
            adjY={currentPortrait.adjY || 0}
            characterHeight={characterHeight}
            onClose={() => setShowScenePreview(false)}
          />
        )}
      </div>
    </div>
  );
};

export default PortraitModal;
