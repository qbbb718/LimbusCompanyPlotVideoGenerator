import React, { useState, useRef, useEffect } from 'react';
import { Background } from '../../../types';
import ApiService from '../../../services/ApiService';
import '../ResourceManager.css';

interface BackgroundsTabProps {
  backgrounds: Background[];
  setBackgrounds: (backgrounds: Background[]) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  openResourceFolder: (resourceType: 'characters' | 'backgrounds' | 'audios') => void;
}

const BackgroundsTab: React.FC<BackgroundsTabProps> = ({
  backgrounds,
  setBackgrounds,
  searchTerm,
  setSearchTerm,
  openResourceFolder
}) => {
  const [selectedBackground, setSelectedBackground] = useState<Background | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingBackground, setEditingBackground] = useState<Background | null>(null);
  const [showBackgroundModal, setShowBackgroundModal] = useState(false);
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 日志函数
  const log = (message: string, data?: any) => {
    console.log(`[BackgroundsTab] ${message}`, data);
  };

  const handleAddBackground = () => {
    log('添加新背景');
    // 创建一个新的背景对象
    const newBackground: Background = {
      uuid: `bg_${Date.now()}`,
      name: "新背景",
      path: "",
      tags: []
    };

    setBackgrounds([...backgrounds, newBackground]);
    setSelectedBackground(newBackground);
    setEditingBackground(newBackground);
    setIsEditing(true);
    setShowBackgroundModal(true);
  };

  const handleEditBackground = (background: Background) => {
    log('编辑背景', background.name);
    setSelectedBackground(background);
    setEditingBackground({ ...background });
    setIsEditing(true);
    setShowBackgroundModal(true);
  };

  const handleSaveBackground = async () => {
    if (!editingBackground) return;

    try {
      log('保存背景', editingBackground.name);
      let updatedBackground: Background;

      if (editingBackground.uuid && backgrounds.find(bg => bg.uuid === editingBackground.uuid)) {
        // 更新现有背景
        updatedBackground = await ApiService.updateBackground(editingBackground.uuid, editingBackground);
        setBackgrounds(backgrounds.map(bg => bg.uuid === editingBackground.uuid ? updatedBackground : bg));
        log('背景更新成功', editingBackground.name);
      } else {
        // 添加新背景
        updatedBackground = await ApiService.addBackground(editingBackground);
        setBackgrounds([...backgrounds, updatedBackground]);
        log('背景添加成功', editingBackground.name);
      }

      setSelectedBackground(updatedBackground);
      setEditingBackground(null);
      setIsEditing(false);
      setShowBackgroundModal(false);
    } catch (error) {
      console.error('保存背景失败:', error);
      log('背景保存失败', error);
      alert('保存背景失败，请重试');
    }
  };

  const handleDeleteBackground = async (backgroundId: string) => {
    if (!window.confirm('确定要删除这个背景吗？')) return;

    try {
      log('删除背景', backgroundId);
      await ApiService.deleteBackground(backgroundId);

      // 从本地状态中移除背景
      const updatedBackgrounds = backgrounds.filter(bg => bg.uuid !== backgroundId);
      setBackgrounds(updatedBackgrounds);

      // 如果删除的是当前选中的背景，清除选中状态
      if (selectedBackground?.uuid === backgroundId) {
        setSelectedBackground(null);
      }

      log('背景删除成功', backgroundId);
      alert('背景删除成功');
    } catch (error) {
      console.error('删除背景失败:', error);
      log('背景删除失败', error);
      alert('删除背景失败，请重试');
    }
  };

  const handleCancelEditBackground = () => {
    log('取消编辑背景');
    setEditingBackground(null);
    setIsEditing(false);
    setBackgroundFile(null);
    setBackgroundPreview(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    log('选择背景文件', file.name);
    setBackgroundFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setBackgroundPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    // 更新编辑中的背景路径
    if (editingBackground) {
      setEditingBackground({
        ...editingBackground,
        path: file.path || ''
      });
    }
  };

  const filteredBackgrounds = backgrounds.filter(background =>
    background.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="resource-tab">
      <div className="resource-actions">
        <input
          type="text"
          placeholder="搜索背景..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button onClick={() => openResourceFolder('backgrounds')}>打开背景文件夹</button>
        <button className="btn-primary" onClick={handleAddBackground}>添加背景</button>
      </div>

      <div className="backgrounds-grid">
        {filteredBackgrounds.map(background => (
          <div
            key={background.uuid}
            className={`background-card ${selectedBackground?.uuid === background.uuid ? 'selected' : ''}`}
            onClick={() => setSelectedBackground(background)}
            onDoubleClick={() => handleEditBackground(background)}
          >
            <div className="background-preview">
              {background.path ? (
                <img src={background.path} alt={background.name} />
              ) : (
                <div className="preview-placeholder">预览图</div>
              )}
            </div>
            <div className="background-info">
              <h3>{background.name}</h3>
              <p>路径: {background.path}</p>
              <p>标签: {background.tags.join(", ")}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 背景编辑弹窗 */}
      {showBackgroundModal && editingBackground && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{isEditing ? '编辑背景' : '添加背景'}</h2>
              <button className="close-btn" onClick={handleCancelEditBackground}>×</button>
            </div>
            <div className="modal-content">
              <div className="form-group">
                <label>背景名称</label>
                <input
                  type="text"
                  value={editingBackground.name || ''}
                  onChange={(e) => setEditingBackground({
                    ...editingBackground,
                    name: e.target.value
                  })}
                />
              </div>
              <div className="form-group">
                <label>背景路径</label>
                <div className="file-input-container">
                  <input
                    type="text"
                    value={editingBackground.path || ''}
                    onChange={(e) => setEditingBackground({
                      ...editingBackground,
                      path: e.target.value
                    })}
                    readOnly
                  />
                  <button
                    className="file-select-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    选择文件
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>标签</label>
                <input
                  type="text"
                  value={editingBackground.tags ? editingBackground.tags.join(', ') : ''}
                  onChange={(e) => setEditingBackground({
                    ...editingBackground,
                    tags: e.target.value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
                  })}
                  placeholder="用逗号分隔多个标签"
                />
              </div>
              {backgroundPreview && (
                <div className="form-group">
                  <label>预览</label>
                  <div className="image-preview">
                    <img src={backgroundPreview} alt="预览" />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={handleCancelEditBackground}>取消</button>
              <button className="btn-primary" onClick={handleSaveBackground}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 隐藏的文件输入 */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="image/*"
        onChange={handleFileSelect}
      />
    </div>
  );
};

export default BackgroundsTab;
