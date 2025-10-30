
import React, { useState, useRef, useEffect } from 'react';
import { Portrait, Emotion } from '../../../types';
import './CharacterModal.css';

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
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [isResizingCrop, setIsResizingCrop] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (portrait) {
      setEditingPortrait({ ...portrait });
      setCropPosition({ x: portrait.faceX, y: portrait.faceY });
      setCropSize({ width: portrait.length, height: portrait.length });
    }
  }, [portrait]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPortraitFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setPortraitPreview(event.target?.result as string);
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
  };

  const handleSave = () => {
    if (!editingPortrait) return;

    const updatedPortrait = {
      ...editingPortrait,
      faceX: cropPosition.x,
      faceY: cropPosition.y,
      length: cropSize.width
    };

    onSave(updatedPortrait);
    onClose();
  };

  const handleMouseDownOnCrop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingCrop(true);
    setDragStart({ x: e.clientX - cropPosition.x, y: e.clientY - cropPosition.y });
  };

  const handleMouseDownOnResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingCrop(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cropContainerRef.current) return;

    const rect = cropContainerRef.current.getBoundingClientRect();

    if (isDraggingCrop) {
      const newX = Math.max(0, Math.min(e.clientX - dragStart.x, rect.width - cropSize.width));
      const newY = Math.max(0, Math.min(e.clientY - dragStart.y, rect.height - cropSize.height));
      setCropPosition({ x: newX, y: newY });
    } else if (isResizingCrop) {
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      const delta = Math.max(deltaX, deltaY); // 保持1:1比例
      const newSize = Math.max(50, Math.min(cropSize.width + delta, Math.min(rect.width - cropPosition.x, rect.height - cropPosition.y)));
      setCropSize({ width: newSize, height: newSize });
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsDraggingCrop(false);
    setIsResizingCrop(false);
  };

  const handleCropBackgroundClick = (e: React.MouseEvent) => {
    if (!cropContainerRef.current) return;

    const rect = cropContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 设置新裁剪框的中心位置
    const newX = Math.max(0, Math.min(x - cropSize.width / 2, rect.width - cropSize.width));
    const newY = Math.max(0, Math.min(y - cropSize.height / 2, rect.height - cropSize.height));

    setCropPosition({ x: newX, y: newY });
  };

  if (!editingPortrait) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>{isNewPortrait ? '添加新立绘' : '编辑立绘'}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="portrait-editor">
          <div className="portrait-preview">
            {portraitPreview ? (
              <>
                <h4>预览与裁剪</h4>
                <div 
                  className="portrait-crop-container"
                  ref={cropContainerRef}
                  onClick={handleCropBackgroundClick}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  <img src={portraitPreview} alt="立绘预览" className="crop-image" />
                  <div className="crop-overlay"></div>
                  <div 
                    className="crop-box"
                    style={{
                      left: `${cropPosition.x}px`,
                      top: `${cropPosition.y}px`,
                      width: `${cropSize.width}px`,
                      height: `${cropSize.height}px`
                    }}
                    onMouseDown={handleMouseDownOnCrop}
                  >
                    <div className="crop-handle nw" onMouseDown={handleMouseDownOnResize}></div>
                    <div className="crop-handle ne" onMouseDown={handleMouseDownOnResize}></div>
                    <div className="crop-handle sw" onMouseDown={handleMouseDownOnResize}></div>
                    <div className="crop-handle se" onMouseDown={handleMouseDownOnResize}></div>
                    <div className="crop-size-display">
                      {cropSize.width} x {cropSize.height}
                    </div>
                  </div>
                </div>
              </>
            ) : (
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
            )}
          </div>

          <div className="portrait-settings">
            <div className="form-group">
              <label>立绘名称</label>
              <input
                type="text"
                value={editingPortrait.portName}
                onChange={(e) => setEditingPortrait({ ...editingPortrait, portName: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>情绪</label>
              <select
                value={editingPortrait.emotion}
                onChange={(e) => setEditingPortrait({ ...editingPortrait, emotion: e.target.value as Emotion })}
              >
                <option value={Emotion.NORMAL}>普通</option>
                <option value={Emotion.HAPPY}>开心</option>
                <option value={Emotion.SAD}>悲伤</option>
                <option value={Emotion.ANGRY}>愤怒</option>
                <option value={Emotion.SURPRISED}>惊讶</option>
                <option value={Emotion.FEAR}>恐惧</option>
                <option value={Emotion.DISGUST}>厌恶</option>
              </select>
            </div>

            <div className="form-group">
              <label>调整位置 X</label>
              <input
                type="number"
                value={editingPortrait.adjX}
                onChange={(e) => setEditingPortrait({ ...editingPortrait, adjX: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="form-group">
              <label>调整位置 Y</label>
              <input
                type="number"
                value={editingPortrait.adjY}
                onChange={(e) => setEditingPortrait({ ...editingPortrait, adjY: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button className="btn-primary" onClick={handleSave}>保存</button>
          <button className="btn-secondary" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
};

export default PortraitModal;
