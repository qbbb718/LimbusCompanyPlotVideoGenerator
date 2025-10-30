
import React, { useState, useRef, useEffect } from 'react';
import { MyCharacter, Portrait, Emotion } from '../../../types';
import ApiService from '../../../services/ApiService';
import './CharacterModal.css';

interface CharacterDetailModalProps {
  character: MyCharacter | null;
  onClose: () => void;
  onSave: (character: MyCharacter) => void;
  isNewCharacter: boolean;
}

const CharacterDetailModal: React.FC<CharacterDetailModalProps> = ({
  character,
  onClose,
  onSave,
  isNewCharacter
}) => {
  const [editingCharacter, setEditingCharacter] = useState<MyCharacter | null>(character);
  const [showColorPalette, setShowColorPalette] = useState<{ text: boolean, bg: boolean }>({ text: false, bg: false });
  const [newTagInput, setNewTagInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditingCharacter(character);
  }, [character]);

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
        </div>

        <div className="form-actions">
          <button className="btn-primary" onClick={handleSave}>保存</button>
          <button className="btn-secondary" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
};

export default CharacterDetailModal;
