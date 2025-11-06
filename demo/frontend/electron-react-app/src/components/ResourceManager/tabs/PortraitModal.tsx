import React, { useState, useRef, useEffect } from 'react';
import { Portrait, Emotion } from '../../../types';
import { mapEmotion, getStandardEmotions, StandardEmotion } from '../../../utils/emotionMapper';
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
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [cropSize, setCropSize] = useState({ width: 100, height: 100 });
  const [initialCropSize, setInitialCropSize] = useState({ width: 100, height: 100 });
  const [actualImageSize, setActualImageSize] = useState({ width: 0, height: 0 });
  const [displayImageSize, setDisplayImageSize] = useState({ width: 0, height: 0 });
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [isResizingCrop, setIsResizingCrop] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [emotionInput, setEmotionInput] = useState<string>('');
  const [showEmotionSuggestions, setShowEmotionSuggestions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // 日志函数
  const log = (message: string, data?: any) => {
    console.log(`[PortraitModal] ${message}`, data);
  };

  useEffect(() => {
    if (portrait) {
      log('加载立绘', portrait.portName);
      setEditingPortrait({ ...portrait });
      setCropPosition({ x: portrait.faceX, y: portrait.faceY });
      setCropSize({ width: portrait.length, height: portrait.length });

      // 设置情绪输入框的值为标准情绪对应的显示名称
      const emotionNames = getStandardEmotions();
      setEmotionInput(emotionNames[portrait.emotion] || portrait.emotion);
    }
  }, [portrait]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    log('选择立绘文件', file.name);

    // 读取文件并设置预览
    const reader = new FileReader();
    reader.onload = (event) => {
      const imageUrl = event.target?.result as string;
      setPortraitPreview(imageUrl);
      
      // 获取图片实际尺寸
      const img = new Image();
      img.onload = () => {
        setActualImageSize({ width: img.width, height: img.height });
        
        // 设置默认裁剪框大小为图片宽度的1/4，但最小100px
        const defaultSize = Math.max(100, Math.floor(img.width / 4));
        setCropSize({ width: defaultSize, height: defaultSize });
      };
      img.src = imageUrl;
    };
    reader.readAsDataURL(file);

    // 创建一个新的立绘对象
    const fileName = file.name.replace(/\.[^/.]+$/, "");
    const portraitId = `portrait_${Date.now()}`;

    setEditingPortrait({
      portraitID: portraitId,
      characterID: characterId,
      imagePath: file.path || '',
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
    setCropPosition({ x: 0, y: 0 });
    setCropSize({ width: 100, height: 100 });
  };
  
  // 裁剪框拖动处理
  const handleCropMouseDown = (e: React.MouseEvent) => {
    // 如果点击的是调整大小的手柄，则不处理
    if ((e.target as HTMLElement).classList.contains('resize-handle')) {
      return;
    }
    
    // 如果点击的是裁剪框本身，则开始拖动
    if ((e.target as HTMLElement).classList.contains('crop-box')) {
      setIsDraggingCrop(true);
      setDragStart({ x: e.clientX - cropPosition.x, y: e.clientY - cropPosition.y });
    }
  };
  
  // 裁剪框移动处理
  const handleCropMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingCrop && !isResizingCrop) return;
    
    // 如果正在调整大小，优先处理调整大小的逻辑
    if (isResizingCrop) {
      // 计算从开始调整大小到现在的鼠标移动距离
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      
      // 保持1:1长宽比，使用较大的变化值
      const delta = Math.max(deltaX, deltaY);
      
      // 使用记录的初始裁剪框大小
      const initialSize = initialCropSize.width;
      
      // 计算新的裁剪框大小
      const newSize = Math.max(50, initialSize + delta);
      
      // 更新裁剪框大小，保持1:1比例
      setCropSize({
        width: newSize,
        height: newSize
      });
    } else if (isDraggingCrop) {
      // 处理拖动逻辑
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      
      // 限制在容器内
      const container = cropContainerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const maxX = rect.width - cropSize.width;
        const maxY = rect.height - cropSize.height;
        
        setCropPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY))
        });
      }
    }
  };
  
  // 裁剪框释放处理
  const handleCropMouseUp = () => {
    if (isDraggingCrop) {
      // 更新立绘的面部位置
      if (editingPortrait) {
        setEditingPortrait({
          ...editingPortrait,
          faceX: cropPosition.x,
          faceY: cropPosition.y,
          length: cropSize.width
        });
      }
    }
    
    setIsDraggingCrop(false);
    setIsResizingCrop(false);
  };

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
              <label className="file-upload-label">
                选择立绘文件
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                />
              </label>
            </div>
            
            {/* 图片预览和裁剪区域 */}
            {(portraitPreview || currentPortrait.imagePath) && (
              <div 
                className="crop-container" 
                ref={cropContainerRef}
                onMouseDown={handleCropMouseDown}
                onMouseMove={handleCropMouseMove}
                onMouseUp={handleCropMouseUp}
              >
                <img 
                  ref={imageRef}
                  src={portraitPreview || currentPortrait.imagePath} 
                  alt="立绘预览" 
                  draggable={false}
                  onLoad={() => {
                    // 获取显示中的图片尺寸
                    if (imageRef.current) {
                      setDisplayImageSize({
                        width: imageRef.current.naturalWidth,
                        height: imageRef.current.naturalHeight
                      });
                    }
                  }}
                />
                
                {/* 裁剪框 */}
                <div 
                  className="crop-box"
                  style={{
                    left: `${cropPosition.x}px`,
                    top: `${cropPosition.y}px`,
                    width: `${cropSize.width}px`,
                    height: `${cropSize.height}px`
                  }}
                >
                  {/* 像素数显示 */}
                  <div className="crop-size-info">
                    {(() => {
                      // 计算实际像素值
                      if (imageRef.current && actualImageSize.width > 0) {
                        // 计算显示尺寸与实际尺寸的比例
                        const scaleX = actualImageSize.width / imageRef.current.clientWidth;
                        const scaleY = actualImageSize.height / imageRef.current.clientHeight;
                        
                        // 计算裁剪框在实际图片中的像素大小
                        const actualWidth = Math.round(cropSize.width * scaleX);
                        const actualHeight = Math.round(cropSize.height * scaleY);
                        
                        return `${actualWidth} × ${actualHeight}px`;
                      }
                      return `${cropSize.width} × ${cropSize.height}px`;
                    })()}
                  </div>
                  
                  {/* 调整大小的手柄 */}
                  <div 
                    className="resize-handle"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setIsResizingCrop(true);
                      setIsDraggingCrop(false); // 确保不是拖动状态
                      setDragStart({ x: e.clientX, y: e.clientY });
                      // 记录初始裁剪框大小
                      setInitialCropSize({ width: cropSize.width, height: cropSize.height });
                    }}
                  />
                </div>
              </div>
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
            onClick={() => {
              if (editingPortrait) {
                // 确保情绪已映射到标准情绪
                if (emotionInput) {
                  const standardEmotion = mapEmotion(emotionInput);
                  editingPortrait.emotion = standardEmotion as unknown as Emotion;
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
