
import React, { useState, useRef, useEffect } from 'react';
import { MyCharacter, Portrait, Emotion } from '../../../types';
import ApiService from '../../../services/ApiService';
import './CharacterModal.css';

// 添加立绘功能相关
import PortraitModal from './PortraitModal';



interface CharacterDetailModalProps {
  character: MyCharacter | null;
  onClose: () => void;
  onSave: (character: MyCharacter) => void;
  onDelete?: (characterId: string, deleteFiles: boolean) => void;
  isNewCharacter: boolean;
  portraits: Portrait[];
}

const CharacterDetailModal: React.FC<CharacterDetailModalProps> = ({
  character,
  onClose,
  onSave,
  onDelete,
  isNewCharacter,
  portraits
}) => {
  const [editingCharacter, setEditingCharacter] = useState<MyCharacter | null>(
    character ? { ...character, portraits: character.portraits || [] } : null
  );
  const [showColorPalette, setShowColorPalette] = useState<{ text: boolean, bg: boolean }>({ text: false, bg: false });
  const [newTagInput, setNewTagInput] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [showPortraitModal, setShowPortraitModal] = useState(false);
  const [editingPortrait, setEditingPortrait] = useState<Portrait | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddPortrait = () => {
    if (!editingCharacter) return;
    setEditingPortrait(null);
    setShowPortraitModal(true);
  };

const handleEditPortrait = (portrait: Portrait) => {
  setEditingPortrait(portrait);
  setShowPortraitModal(true);
};

  useEffect(() => {
    if (character) {
      setEditingCharacter({
        ...character,
        portraits: character.portraits || portraits || []
      });
    }
  }, [character, portraits]);

  const handleSave = async () => {
    if (!editingCharacter) return;

    try {
      if (isNewCharacter) {
        // 如果是新角色，需要先创建角色
        const newCharacter = await ApiService.addCharacter(editingCharacter);
        onSave(newCharacter);
      } else {
        // 如果是现有角色，更新角色信息
        const updatedCharacter = await ApiService.updateCharacter(editingCharacter.characterID, editingCharacter);
        onSave(updatedCharacter);
      }
      onClose();
    } catch (error) {
      console.error('保存角色失败:', error);
      alert('保存角色失败，请重试');
    }
  };

  const handleColorChange = (type: 'text' | 'bg', color: string) => {
    if (!editingCharacter) return;

    if (type === 'text') {
      setEditingCharacter({ ...editingCharacter, colorText: color });
    } else {
      setEditingCharacter({ ...editingCharacter, colorBg: color });
    }
  };

  const handleAddTag = () => {
    if (!editingCharacter || !newTagInput.trim()) return;

    const tag = newTagInput.trim();
    if (editingCharacter.tags?.includes(tag)) {
      alert('该标签已存在');
      return;
    }

    setEditingCharacter({
      ...editingCharacter,
      tags: [...(editingCharacter.tags || []), tag]
    });
    setNewTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (!editingCharacter) return;

    setEditingCharacter({
      ...editingCharacter,
      tags: editingCharacter.tags?.filter(tag => tag !== tagToRemove) || []
    });
  };

  const predefinedColors = [
    '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00', '#FF00FF', '#00FFFF', '#800000', '#008000',
    '#000080', '#808000', '#800080', '#008080', '#C0C0C0',
    '#808080', '#FFA500', '#A52A2A', '#8B4513', '#FFD700'
  ];

  const handleDeleteCharacter = () => {
    if (!editingCharacter || !onDelete) return;
    
    onDelete(editingCharacter.characterID, deleteFiles);
    setShowDeleteConfirm(false);
    onClose();
  };

  if (!editingCharacter) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>{isNewCharacter ? '添加新角色' : `编辑角色: ${editingCharacter.characterName}`}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="character-info-section">
          <div className="info-row">
            <div className="info-item">
              <label>角色名称</label>
              <input
                type="text"
                value={editingCharacter.characterName}
                onChange={(e) => setEditingCharacter({ ...editingCharacter, characterName: e.target.value })}
              />
            </div>
          </div>

          <div className="info-row">
            <div className="info-item">
              <label>阵营</label>
              <input
                type="text"
                value={editingCharacter.faction}
                onChange={(e) => setEditingCharacter({ ...editingCharacter, faction: e.target.value })}
              />
            </div>
          </div>

          <div className="info-row">
            <div className="info-item">
              <label>身高</label>
              <input
                type="number"
                value={editingCharacter.height}
                onChange={(e) => setEditingCharacter({ ...editingCharacter, height: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="color-section">
            <div className="color-picker">
              <div className="color-input-group">
                <label>名片文字颜色</label>
                <div className="color-picker-wrapper">
                  <input
                    type="text"
                    value={editingCharacter.colorText}
                    onChange={(e) => handleColorChange('text', e.target.value)}
                  />
                  <div 
                    className="color-preview-box" 
                    style={{ backgroundColor: editingCharacter.colorText }}
                    onClick={() => setShowColorPalette({ ...showColorPalette, text: !showColorPalette.text })}
                  ></div>

                  {showColorPalette.text && (
                    <div className="color-palette visible">
                      {predefinedColors.map(color => (
                        <div
                          key={color}
                          className="color-preset"
                          style={{ backgroundColor: color }}
                          onClick={() => {
                            handleColorChange('text', color);
                            setShowColorPalette({ ...showColorPalette, text: false });
                          }}
                        ></div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="color-input-group">
                <label>名片背景颜色</label>
                <div className="color-picker-wrapper">
                  <input
                    type="text"
                    value={editingCharacter.colorBg}
                    onChange={(e) => handleColorChange('bg', e.target.value)}
                  />
                  <div 
                    className="color-preview-box" 
                    style={{ backgroundColor: editingCharacter.colorBg }}
                    onClick={() => setShowColorPalette({ ...showColorPalette, bg: !showColorPalette.bg })}
                  ></div>

                  {showColorPalette.bg && (
                    <div className="color-palette visible">
                      {predefinedColors.map(color => (
                        <div
                          key={color}
                          className="color-preset"
                          style={{ backgroundColor: color }}
                          onClick={() => {
                            handleColorChange('bg', color);
                            setShowColorPalette({ ...showColorPalette, bg: false });
                          }}
                        ></div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="color-preview">
              <label>名片预览</label>
              <div 
                className="name-preview"
                style={{
                  backgroundColor: editingCharacter.colorBg,
                  color: editingCharacter.colorText
                }}
              >
                {editingCharacter.characterName}
              </div>
            </div>
          </div>

          <div className="tags-section">
            <label>角色标签</label>
            <div className="tags-container">
              {editingCharacter.tags?.map(tag => (
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
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
              />
              <button onClick={handleAddTag}>添加</button>
            </div>
          </div>


          <div className="portraits-section">
  <div className="section-header">
    <h3>立绘列表</h3>
    <button className="btn-primary" onClick={handleAddPortrait}>添加立绘</button>
  </div>

  <div className="portraits-grid">
    {editingCharacter.portraits?.map(portrait => (
      <div key={portrait.portraitID} className="portrait-card">
        <div className="portrait-thumbnail">
          {/* 这里应该显示立绘缩略图 */}
          {portrait.thumbnailPath ? (
            <img src={portrait.thumbnailPath} alt={portrait.portName} />
          ) : (
            <div className="thumbnail-placeholder">缩略图</div>
          )}
        </div>
        <div className="portrait-info">
          <h4>{portrait.portName}</h4>
          <p>情绪: {portrait.emotion}</p>
          <button className="btn-primary" onClick={() => handleEditPortrait(portrait)}>编辑</button>
        </div>
      </div>
    ))}
  </div>
</div>

        </div>

        <div className="form-actions">
          <button className="btn-primary" onClick={handleSave}>保存</button>
          <button className="btn-secondary" onClick={onClose}>取消</button>
          {!isNewCharacter && (
            <button className="btn-danger" onClick={() => setShowDeleteConfirm(true)}>删除角色</button>
          )}
        </div>
        
        {/* 删除确认对话框 */}
        {showDeleteConfirm && (
          <div className="modal-overlay">
            <div className="confirm-dialog">
              <h3>确认删除</h3>
              <p>确定要删除角色 "{editingCharacter?.characterName}" 吗？</p>
              <div className="checkbox-container">
                <label>
                  <input
                    type="checkbox"
                    checked={deleteFiles}
                    onChange={(e) => setDeleteFiles(e.target.checked)}
                  />
                  同时删除相关文件
                </label>
              </div>
              <div className="dialog-actions">
                <button className="btn-danger" onClick={handleDeleteCharacter}>确认删除</button>
                <button className="btn-secondary" onClick={() => setShowDeleteConfirm(false)}>取消</button>
              </div>
            </div>
          </div>
        )}
        
        {/* 立绘编辑弹窗 */}
        {showPortraitModal && editingCharacter && (
          <PortraitModal
            characterId={editingCharacter.characterID}
            portrait={editingPortrait}
            isNewPortrait={!editingPortrait}
            onClose={() => {
              setShowPortraitModal(false);
              setEditingPortrait(null);
            }}
            onSave={(portrait) => {
              if (editingPortrait) {
                // 更新现有立绘
                setEditingCharacter({
                  ...editingCharacter,
                  portraits: editingCharacter.portraits.map(p => 
                    p.portraitID === portrait.portraitID ? portrait : p
                  )
                });
              } else {
                // 添加新立绘
                setEditingCharacter({
                  ...editingCharacter,
                  portraits: [...editingCharacter.portraits, portrait]
                });
              }
              setShowPortraitModal(false);
              setEditingPortrait(null);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default CharacterDetailModal;
