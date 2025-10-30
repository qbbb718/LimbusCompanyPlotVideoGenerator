
import React, { useState, useRef, useEffect } from 'react';
import { Background } from '../../../types';
import ApiService from '../../../services/ApiService';
import '../ResourceManager.css';

interface BackgroundsTabProps {
  backgrounds: Background[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  openResourceFolder: (resourceType: 'characters' | 'backgrounds' | 'audios') => void;
  setBackgrounds: (backgrounds: Background[]) => void;
}

const BackgroundsTab: React.FC<BackgroundsTabProps> = ({
  backgrounds,
  searchTerm,
  setSearchTerm,
  openResourceFolder,
  setBackgrounds
}) => {
  const [editingBackground, setEditingBackground] = useState<Background | null>(null);
  const [isAddingBackground, setIsAddingBackground] = useState(false);
  const [draggedItem, setDraggedItem] = useState<Background | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [newTagInput, setNewTagInput] = useState<{ [key: string]: string }>({});
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleEditBackground = (background: Background) => {
    setEditingBackground({ ...background });
  };

  const handleSaveBackground = async () => {
    if (!editingBackground) return;

    try {
      const updatedBackground = await ApiService.updateBackground(editingBackground.uuid, editingBackground);
      setBackgrounds(backgrounds.map(bg => bg.uuid === editingBackground.uuid ? updatedBackground : bg));
      setEditingBackground(null);
    } catch (error) {
      console.error('更新背景失败:', error);
      alert('更新背景失败，请重试');
    }
  };

  const handleDeleteBackground = async (uuid: string) => {
    if (!window.confirm('确定要删除这个背景吗？')) return;

    try {
      await ApiService.deleteBackground(uuid);
      setBackgrounds(backgrounds.filter(bg => bg.uuid !== uuid));
    } catch (error) {
      console.error('删除背景失败:', error);
      alert('删除背景失败，请重试');
    }
  };

  const handleAddBackground = () => {
    setIsAddingBackground(true);
  };

  const handleSaveNewBackground = async () => {
    if (!editingBackground) return;

    try {
      const newBackground = await ApiService.addBackground(editingBackground);
      setBackgrounds([...backgrounds, newBackground]);
      setEditingBackground(null);
      setIsAddingBackground(false);
    } catch (error) {
      console.error('添加背景失败:', error);
      alert('添加背景失败，请重试');
    }
  };

  const handleCancelEdit = () => {
    setEditingBackground(null);
    setIsAddingBackground(false);
    setBackgroundPreview(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 这里应该处理文件上传并设置路径
    // 实际实现可能需要调用Electron的API将文件复制到资源目录
    const filePath = file.path || URL.createObjectURL(file);
    const fileName = file.name;
    
    // 创建预览URL
    const reader = new FileReader();
    reader.onload = (event) => {
      setBackgroundPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    setEditingBackground({
      uuid: '',
      name: fileName.replace(/\.[^/.]+$/, ""), // 移除文件扩展名
      path: filePath,
      tags: []
    });
  };

  const handleAddTag = (backgroundUuid: string) => {
    const tagValue = newTagInput[backgroundUuid]?.trim();
    if (!tagValue) return;

    if (editingBackground) {
      if (editingBackground.tags.includes(tagValue)) {
        alert('该标签已存在');
        return;
      }
      setEditingBackground({
        ...editingBackground,
        tags: [...editingBackground.tags, tagValue]
      });
    }

    setNewTagInput({ ...newTagInput, [backgroundUuid]: '' });
  };

  const handleRemoveTag = (tag: string) => {
    if (!editingBackground) return;
    setEditingBackground({
      ...editingBackground,
      tags: editingBackground.tags.filter(t => t !== tag)
    });
  };

  const handleDragStart = (e: React.DragEvent, background: Background) => {
    setDraggedItem(background);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);

    if (!draggedItem) return;

    const draggedIndex = backgrounds.findIndex(bg => bg.uuid === draggedItem.uuid);
    if (draggedIndex === dropIndex) return;

    const newBackgrounds = [...backgrounds];
    newBackgrounds.splice(draggedIndex, 1);
    newBackgrounds.splice(dropIndex, 0, draggedItem);

    setBackgrounds(newBackgrounds);
    setDraggedItem(null);
  };

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
        <button onClick={handleAddBackground}>添加背景</button>
      </div>

      {isAddingBackground && (
        <div className="edit-form">
          <h3>添加新背景</h3>
          <div className="file-upload">
            <label className="file-upload-label">
              选择背景文件
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
              />
            </label>
          </div>

          {editingBackground && (
            <>
              {backgroundPreview && (
                <div className="background-preview-large">
                  <h4>背景预览</h4>
                  <img src={backgroundPreview} alt="背景预览" />
                </div>
              )}
              <div className="form-group">
                <label>名称</label>
                <input
                  type="text"
                  value={editingBackground.name}
                  onChange={(e) => setEditingBackground({ ...editingBackground, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>标签</label>
                <div className="tags-container">
                  {editingBackground.tags.map(tag => (
                    <div key={tag} className="tag">
                      {tag}
                      <span className="tag-remove" onClick={() => handleRemoveTag(tag)}>×</span>
                    </div>
                  ))}
                </div>
                <div className="tag-input-container">
                  <input
                    type="text"
                    className="tag-input"
                    placeholder="添加新标签"
                    value={newTagInput[editingBackground.uuid] || ''}
                    onChange={(e) => setNewTagInput({ ...newTagInput, [editingBackground.uuid]: e.target.value })}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddTag(editingBackground.uuid)}
                  />
                  <button onClick={() => handleAddTag(editingBackground.uuid)}>添加</button>
                </div>
              </div>

              <div className="form-actions">
                <button className="btn-primary" onClick={handleSaveNewBackground}>保存</button>
                <button className="btn-secondary" onClick={handleCancelEdit}>取消</button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="backgrounds-grid">
        {backgrounds.map((background, index) => (
          <div
            key={background.uuid}
            className={`background-card ${dragOverIndex === index ? 'drop-zone' : ''}`}
            draggable
            onDragStart={(e) => handleDragStart(e, background)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
          >
            <div className="background-preview">
              {/* 这里应该显示背景预览图 */}
              <div className="preview-placeholder">预览图</div>
            </div>
            <div className="background-info">
              <h3>{background.name}</h3>
              <p>路径: {background.path}</p>
              
              <div className="tags-container">
                {background.tags.map(tag => (
                  <div key={tag} className="tag">{tag}</div>
                ))}
              </div>
              
              <div className="form-actions">
                <button className="btn-primary" onClick={() => handleEditBackground(background)}>编辑</button>
                <button className="btn-danger" onClick={() => handleDeleteBackground(background.uuid)}>删除</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editingBackground && !isAddingBackground && (
        <div className="edit-form">
          <h3>编辑背景</h3>
          <div className="form-group">
            <label>名称</label>
            <input
              type="text"
              value={editingBackground.name}
              onChange={(e) => setEditingBackground({ ...editingBackground, name: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>路径</label>
            <input
              type="text"
              value={editingBackground.path}
              onChange={(e) => setEditingBackground({ ...editingBackground, path: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>标签</label>
            <div className="tags-container">
              {editingBackground.tags.map(tag => (
                <div key={tag} className="tag">
                  {tag}
                  <span className="tag-remove" onClick={() => handleRemoveTag(tag)}>×</span>
                </div>
              ))}
            </div>
            <div className="tag-input-container">
              <input
                type="text"
                className="tag-input"
                placeholder="添加新标签"
                value={newTagInput[editingBackground.uuid] || ''}
                onChange={(e) => setNewTagInput({ ...newTagInput, [editingBackground.uuid]: e.target.value })}
                onKeyPress={(e) => e.key === 'Enter' && handleAddTag(editingBackground.uuid)}
              />
              <button onClick={() => handleAddTag(editingBackground.uuid)}>添加</button>
            </div>
          </div>

          <div className="form-actions">
            <button className="btn-primary" onClick={handleSaveBackground}>保存</button>
            <button className="btn-secondary" onClick={handleCancelEdit}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BackgroundsTab;
