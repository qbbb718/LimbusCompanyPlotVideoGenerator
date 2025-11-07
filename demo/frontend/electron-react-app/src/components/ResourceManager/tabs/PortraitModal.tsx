import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Portrait, Emotion } from '../../../types';
import { mapEmotion, getStandardEmotions, StandardEmotion } from '../../../utils/emotionMapper';
import { createCroppedImage, blobToBase64 } from '../../../utils/imageUtils';
import ImageCropper from '../ImageCropper';
import { Area } from 'react-easy-crop';
import './CharacterModal.css';
import './EmotionInput.css';

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
  isNewPortrait
}) => {
  const [editingPortrait, setEditingPortrait] = useState<Portrait | null>(portrait);
  const [portraitFile, setPortraitFile] = useState<File | null>(null);
  const [portraitPreview, setPortraitPreview] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [emotionInput, setEmotionInput] = useState<string>('');
  const [showEmotionSuggestions, setShowEmotionSuggestions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 日志函数
  const log = (message: string, data?: any) => {
    console.log(`[PortraitModal] ${message}`, data);
  };

  // 裁剪完成回调
  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedArea(croppedArea);
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  useEffect(() => {
    if (portrait) {
      log('加载立绘', portrait.portName);
      setEditingPortrait({ ...portrait });
      setCrop({ x: portrait.faceX, y: portrait.faceY });

      // 设置情绪输入框的值为标准情绪对应的显示名称
      const emotionNames = getStandardEmotions();
      setEmotionInput(emotionNames[portrait.emotion] || portrait.emotion);

      // 如果有图片路径，加载图片预览
      if (portrait.imagePath) {
        // 检查是否是相对路径（后端资源）
        if (!portrait.imagePath.startsWith('http') && !portrait.imagePath.startsWith('data:')) {
          // 在Electron环境中，使用file协议加载本地文件
          if (window.electronAPI) {
            // 使用Electron API读取文件并转换为data URL
            const charactersPath = '../../../src/main/resources/assets/characters';
            const fullImagePath = `${charactersPath}/${portrait.imagePath}`;

            // 创建一个异步函数来处理文件读取
            const loadImage = async () => {
              try {
                const fileBuffer = await window.electronAPI.readFile(fullImagePath);
                const uint8Array = new Uint8Array(fileBuffer);
                const blob = new Blob([uint8Array]);
                const dataUrl = await blobToBase64(blob);

                log('图片路径转换', { from: portrait.imagePath, to: 'data URL' });
                setPortraitPreview(dataUrl);
              } catch (error) {
                log('读取图片文件失败', error);
                // 如果读取失败，尝试使用HTTP URL
                const imageUrl = `http://localhost:8080/assets/characters/${portrait.imagePath}`;
                log('回退到HTTP URL', imageUrl);
                setPortraitPreview(imageUrl);
              }
            };

            // 调用异步函数
            loadImage();
          } else {
            // 非Electron环境，使用HTTP URL
            const imageUrl = `http://localhost:8080/assets/characters/${portrait.imagePath}`;
            log('图片路径转换', { from: portrait.imagePath, to: imageUrl });
            setPortraitPreview(imageUrl);
          }
        } else {
          // 如果是绝对路径或data URL，直接使用
          log('直接使用图片路径', portrait.imagePath);
          setPortraitPreview(portrait.imagePath);
        }
      }
    }
  }, [portrait]);

  // 优化后的文件选择函数，只使用一个对话框
  const selectImageFile = async () => {
    // 检查是否在Electron环境中
    if (window.electronAPI) {
      log('使用Electron文件选择对话框');

      // 使用electronAPI的openImageFile方法
      try {
        const result = await window.electronAPI.openImageFile();

        if (result && !result.canceled && result.filePaths.length > 0) {
          const selectedPath = result.filePaths[0];
          log('选择的文件路径', selectedPath);

          // 从路径中提取文件名
          const fileName = selectedPath.split(/[\\/]/).pop() || '';
          const fileExtension = fileName.split('.').pop() || '';
          const baseName = fileName.replace(`.${fileExtension}`, '');

          // 读取文件并设置预览
          try {
            // 在Electron环境中，使用electronAPI读取文件
            const fileBuffer = await window.electronAPI.readFile(selectedPath);
            const uint8Array = new Uint8Array(fileBuffer);
            const blob = new Blob([uint8Array]);
            const file = new File([blob], fileName, { type: `image/${fileExtension}` });

            // 使用FileReader读取文件
            const reader = new FileReader();
            reader.onload = (event) => {
              const imageUrl = event.target?.result as string;
              log('图片预览URL', imageUrl);
              setPortraitPreview(imageUrl);

              // 设置默认裁剪位置和缩放
              setCrop({ x: 0, y: 0 });
              setZoom(1);
            };
            reader.readAsDataURL(file);

            // 处理文件路径
            let imagePath = '';

            // 检查路径是否包含characters文件夹
            const charactersIndex = selectedPath.lastIndexOf('characters');

            if (charactersIndex !== -1) {
              // 提取从characters开始的路径，并替换所有反斜杠为正斜杠
              const relativePath = selectedPath.substring(charactersIndex).replace(/\\/g, '/');

              // 如果文件直接在characters文件夹下，只使用文件名
              if (relativePath.indexOf('/') === -1 || relativePath.substring(relativePath.indexOf('/') + 1).indexOf('/') === -1) {
                // 文件直接在characters文件夹下或只有一级子目录
                imagePath = relativePath.includes('/') ? relativePath.substring(relativePath.indexOf('/') + 1) : relativePath;
              } else {
                // 文件在更深层的子目录中，保留完整路径
                imagePath = relativePath;
              }

              log('使用文件选择对话框获取的相对路径', imagePath);
            } else {
              // 如果不在characters文件夹下，只使用文件名
              imagePath = fileName;
              log('选择的图片不在characters文件夹下，只使用文件名', imagePath);
            }

            // 创建新的立绘对象
            const portraitId = `portrait_${Date.now()}`;

            setEditingPortrait({
              portraitID: portraitId,
              characterID: characterId,
              imagePath: imagePath,
              portName: baseName,
              emotion: Emotion.NORMAL,
              faceX: 0,
              faceY: 0,
              length: 100,
              adjX: 0,
              adjY: 0,
              thumbnailPath: ''
            });

            // 重置裁剪框位置和大小
            setCrop({ x: 0, y: 0 });
            setZoom(1);

          } catch (error) {
            console.error('读取文件错误:', error);
            log('读取文件失败，只使用文件名', fileName);

            // 创建新的立绘对象，只使用文件名
            const portraitId = `portrait_${Date.now()}`;

            setEditingPortrait({
              portraitID: portraitId,
              characterID: characterId,
              imagePath: fileName,
              portName: baseName,
              emotion: Emotion.NORMAL,
              faceX: 0,
              faceY: 0,
              length: 100,
              adjX: 0,
              adjY: 0,
              thumbnailPath: ''
            });
          }
        } else {
          log('用户取消了文件选择');
        }
      } catch (error) {
        console.error('文件选择对话框错误:', error);
        log('文件选择对话框失败');
      }
    } else {
      // 非Electron环境，使用传统文件选择方式
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    }
  };

  // 传统的文件选择处理函数，仅在非Electron环境使用
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    log('选择立绘文件', file.name);

    // 读取文件并设置预览
    const reader = new FileReader();
    reader.onload = (event) => {
      const imageUrl = event.target?.result as string;
      setPortraitPreview(imageUrl);

      // 设置默认裁剪位置和缩放
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.readAsDataURL(file);

    // 创建一个新的立绘对象
    const fileName = file.name.replace(/\.[^/.]+$/, "");
    const portraitId = `portrait_${Date.now()}`;

    // 获取文件路径
    let imagePath = (file as any).path || file.name;

    setEditingPortrait({
      portraitID: portraitId,
      characterID: characterId,
      imagePath: imagePath,
      portName: fileName,
      emotion: Emotion.NORMAL,
      faceX: 0,
      faceY: 0,
      length: 100,
      adjX: 0,
      adjY: 0,
      thumbnailPath: ''
    });

    // 重置裁剪框位置和大小
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  // 使用react-easy-crop库，不再需要自定义的裁剪处理函数

  // 在添加新立绘时，editingPortrait 可能为 null，但组件仍应显示
  if (!editingPortrait && !isNewPortrait) return null;

  // 如果是添加新立绘且 editingPortrait 为 null，创建一个默认的空对象
  const currentPortrait = editingPortrait || {
    portraitID: '',
    characterID: characterId,
    imagePath: '',
    portName: '',
    emotion: Emotion.NORMAL,
    faceX: 0,
    faceY: 0,
    length: 100,
    adjX: 0,
    adjY: 0,
    thumbnailPath: ''
  };

  // 获取标准情绪列表
  const standardEmotions = getStandardEmotions();

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>{isNewPortrait ? '添加新立绘' : '编辑立绘'}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="portrait-editor">
          <div className="portrait-preview">
            <div className="file-upload">
              {window.electronAPI ? (
                <button className="file-upload-button" onClick={selectImageFile}>
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
                      style={{ display: 'none' }}
                    />
                  </label>
                </>
              )}
            </div>

            {/* 图片预览和裁剪区域 */}
            {portraitPreview && (
              <ImageCropper
                imageSrc={portraitPreview}
                onCropComplete={onCropComplete}
                initialCrop={crop}
                initialZoom={zoom}
              />
            )}
          </div>

          <div className="portrait-settings">
            <div className="form-group">
              <label>立绘名称</label>
              <input
                type="text"
                value={currentPortrait.portName}
                onChange={(e) => setEditingPortrait({ ...currentPortrait, portName: e.target.value })}
              />
            </div>

            <div className="form-group emotion-input-group">
              <label>情绪</label>
              <div className="emotion-input-container">
                <input
                  type="text"
                  value={emotionInput}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEmotionInput(value);
                    setShowEmotionSuggestions(value.length > 0);
                  }}
                  onFocus={() => setShowEmotionSuggestions(true)}
                  placeholder="输入情绪，如：开心、悲伤、惊讶等"
                />
                {showEmotionSuggestions && (
                  <div className="emotion-suggestions">
                    {Object.entries(standardEmotions).map(([value, label]) => (
                      <div
                        key={value}
                        className="emotion-suggestion"
                        onClick={() => {
                          setEmotionInput(label);
                          setShowEmotionSuggestions(false);

                          // 映射到标准情绪
                          const standardEmotion = mapEmotion(label);

                          // 更新立绘的情绪
                          if (editingPortrait) {
                            setEditingPortrait({
                              ...editingPortrait,
                              emotion: standardEmotion as unknown as Emotion
                            });
                          }
                        }}
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="emotion-info">
                系统将自动匹配最接近的标准情绪
              </div>
            </div>

            <div className="form-group">
              <label>调整位置 X</label>
              <input
                type="number"
                value={currentPortrait.adjX}
                onChange={(e) => setEditingPortrait({ ...currentPortrait, adjX: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="form-group">
              <label>调整位置 Y</label>
              <input
                type="number"
                value={currentPortrait.adjY}
                onChange={(e) => setEditingPortrait({ ...currentPortrait, adjY: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-button" onClick={onClose}>取消</button>
          <button
            className="save-button"
            onClick={async () => {
              if (editingPortrait) {
                // 确保情绪已映射到标准情绪
                if (emotionInput) {
                  const standardEmotion = mapEmotion(emotionInput);
                  editingPortrait.emotion = standardEmotion as unknown as Emotion;
                }

                // 生成缩略图
                if (portraitPreview && croppedAreaPixels) {
                  try {
                    // 使用createCroppedImage函数生成缩略图
                    const thumbnailBlob = await createCroppedImage(portraitPreview, croppedAreaPixels);

                    // 创建缩略图文件名
                    const thumbnailFileName = `thumbnail_${editingPortrait.portraitID}.png`;

                    // 如果在Electron环境中，保存缩略图到本地
                    if (window.electronAPI) {
                      // 将blob转换为arrayBuffer
                      const arrayBuffer = await thumbnailBlob.arrayBuffer();

                      // 保存缩略图到本地
                      const thumbnailPath = await window.electronAPI.saveThumbnail(
                        thumbnailFileName, 
                        new Uint8Array(arrayBuffer)
                      );

                      // 更新立绘的缩略图路径
                      editingPortrait.thumbnailPath = thumbnailPath;
                    } else {
                      // 非Electron环境，创建临时URL
                      editingPortrait.thumbnailPath = URL.createObjectURL(thumbnailBlob);
                    }
                  } catch (error) {
                    console.error('生成缩略图失败:', error);
                    log('生成缩略图失败', error);
                  }
                }

                // 更新裁剪相关值
                if (croppedAreaPixels) {
                  editingPortrait.faceX = Math.round(croppedAreaPixels.x);
                  editingPortrait.faceY = Math.round(croppedAreaPixels.y);
                  editingPortrait.length = Math.round(croppedAreaPixels.width);
                }

                log('保存立绘', editingPortrait);
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
