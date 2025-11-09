import React, { useState, useRef, useEffect } from 'react';
import { MyCharacter, Portrait, Emotion } from '../../../types';
import ApiService from '../../../services/ApiService';
import { AppConfig } from '../../../config/appConfig';
import '../ResourceManager.css';
import './CharacterModal.css';
import './EmotionInput.css';
import CharacterDetailModal from './CharacterDetailModal';
import PortraitModal from './PortraitModal';

interface CharactersTabProps {
  characters: MyCharacter[];
  selectedCharacter: MyCharacter | null;
  setSelectedCharacter: (character: MyCharacter | null) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  openResourceFolder: (resourceType: 'characters' | 'backgrounds' | 'audios') => void;
  setCharacters: (characters: MyCharacter[]) => void;
}

const CharactersTab: React.FC<CharactersTabProps> = ({
  characters,
  selectedCharacter,
  setSelectedCharacter,
  searchTerm,
  setSearchTerm,
  openResourceFolder,
  setCharacters
}) => {
  const [isEditingCharacter, setIsEditingCharacter] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<MyCharacter | null>(null);
  const [isAddingPortrait, setIsAddingPortrait] = useState(false);
  const [editingPortrait, setEditingPortrait] = useState<Portrait | null>(null);
  const [portraitFile, setPortraitFile] = useState<File | null>(null);
  const [portraitPreview, setPortraitPreview] = useState<string | null>(null);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [cropSize, setCropSize] = useState({ width: 100, height: 100 });
  const [showCharacterModal, setShowCharacterModal] = useState(false);
  const [showPortraitModal, setShowPortraitModal] = useState(false);
  const [newTagInput, setNewTagInput] = useState<{ [key: string]: string }>({});
  const [showColorPalette, setShowColorPalette] = useState<{ text: boolean, bg: boolean }>({ text: false, bg: false });
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [isResizingCrop, setIsResizingCrop] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);

  // 日志函数
  const log = (message: string, data?: any) => {
    console.log(`[CharactersTab] ${message}`, data);
  };

  const handleEditCharacter = () => {
    if (!selectedCharacter) return;
    log('编辑角色', selectedCharacter.characterName);
    setEditingCharacter({ ...selectedCharacter });
    setIsEditingCharacter(true);
  };

  const handleSaveCharacter = async () => {
    if (!editingCharacter) return;

    try {
      log('保存角色', editingCharacter.characterName);
      const updatedCharacter = await ApiService.updateCharacter(editingCharacter.characterID, editingCharacter);
      setCharacters(characters.map(c => c.characterID === editingCharacter.characterID ? updatedCharacter : c));
      setSelectedCharacter(updatedCharacter);
      setEditingCharacter(null);
      setIsEditingCharacter(false);
      log('角色保存成功', updatedCharacter.characterName);
    } catch (error) {
      console.error('更新角色失败:', error);
      log('角色保存失败', error);
      alert('更新角色失败，请重试');
    }
  };

  const handleCancelEditCharacter = () => {
    log('取消编辑角色');
    setEditingCharacter(null);
    setIsEditingCharacter(false);
  };

  const handleAddPortrait = () => {
    if (!selectedCharacter) return;
    log('添加立绘', selectedCharacter.characterName);
    setEditingPortrait(null);
    setIsAddingPortrait(true);
    setShowPortraitModal(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    log('选择立绘文件', file.name);
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
      characterID: selectedCharacter?.characterID || '',
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

  const handleSavePortrait = async (portrait: Portrait) => {
    if (!selectedCharacter) return;

    try {
      log('保存立绘', portrait.portName);
      
      // 计算基于原始图片尺寸的裁剪参数
      if (portraitPreview && portraitPreview.startsWith('data:')) {
        // 从预览中获取图片尺寸
        const img = new Image();
        img.onload = () => {
          // 计算显示尺寸与实际尺寸的比例
          const scaleX = img.naturalWidth / img.width;
          const scaleY = img.naturalHeight / img.height;
          
          // 计算裁剪框在实际图片中的位置和大小
          const actualFaceX = Math.round(cropPosition.x * scaleX);
          const actualFaceY = Math.round(cropPosition.y * scaleY);
          const actualLength = Math.round(cropSize.width * scaleX);
          
          // 更新立绘对象
          portrait.faceX = actualFaceX;
          portrait.faceY = actualFaceY;
          portrait.length = actualLength;
          
          log('计算后的裁剪参数', {
            faceX: actualFaceX,
            faceY: actualFaceY,
            length: actualLength,
            scaleX,
            scaleY
          });
          
          // 保存立绘
          savePortraitWithCorrectedParams(portrait);
        };
        img.src = portraitPreview;
      } else {
        // 如果没有预览，直接保存
        savePortraitWithCorrectedParams(portrait);
      }
    } catch (error) {
      console.error('添加立绘失败:', error);
      log('立绘保存失败', error);
      alert('添加立绘失败，请重试');
    }
  };
  
  // 辅助函数：使用修正后的参数保存立绘
  const savePortraitWithCorrectedParams = async (portrait: Portrait) => {
    try {
      const newPortrait = await ApiService.addPortrait(selectedCharacter!.characterID, portrait);
      const updatedCharacter = {
        ...selectedCharacter!,
        portraits: [...selectedCharacter!.portraits, newPortrait]
      };

      setCharacters(characters.map(c => c.characterID === selectedCharacter!.characterID ? updatedCharacter : c));
      setSelectedCharacter(updatedCharacter);

      setShowPortraitModal(false);
      setEditingPortrait(null);
      log('立绘保存成功', portrait.portName);
    } catch (error) {
      console.error('添加立绘失败:', error);
      log('立绘保存失败', error);
      alert('添加立绘失败，请重试');
    }
  };

  const handleEditPortrait = (portrait: Portrait) => {
    log('编辑立绘', portrait.portName);
    setEditingPortrait({ ...portrait });
    setShowPortraitModal(true);
  };

  const handleUpdatePortrait = async (portrait: Portrait) => {
    if (!selectedCharacter) return;

    try {
      log('更新立绘', portrait.portName);
      
      // 计算基于原始图片尺寸的裁剪参数
      if (portraitPreview && portraitPreview.startsWith('data:')) {
        // 从预览中获取图片尺寸
        const img = new Image();
        img.onload = () => {
          // 计算显示尺寸与实际尺寸的比例
          const scaleX = img.naturalWidth / img.width;
          const scaleY = img.naturalHeight / img.height;
          
          // 计算裁剪框在实际图片中的位置和大小
          const actualFaceX = Math.round(cropPosition.x * scaleX);
          const actualFaceY = Math.round(cropPosition.y * scaleY);
          const actualLength = Math.round(cropSize.width * scaleX);
          
          // 更新立绘对象
          portrait.faceX = actualFaceX;
          portrait.faceY = actualFaceY;
          portrait.length = actualLength;
          
          log('计算后的裁剪参数', {
            faceX: actualFaceX,
            faceY: actualFaceY,
            length: actualLength,
            scaleX,
            scaleY
          });
          
          // 更新立绘
          updatePortraitWithCorrectedParams(portrait);
        };
        img.src = portraitPreview;
      } else {
        // 如果没有预览，直接更新
        updatePortraitWithCorrectedParams(portrait);
      }
    } catch (error) {
      console.error('更新立绘失败:', error);
      log('立绘更新失败', error);
      alert('更新立绘失败，请重试');
    }
  };
  
  // 辅助函数：使用修正后的参数更新立绘
  const updatePortraitWithCorrectedParams = async (portrait: Portrait) => {
    try {
      const updatedPortrait = await ApiService.updatePortrait(selectedCharacter!.characterID, portrait.portraitID, portrait);
      const updatedCharacter = {
        ...selectedCharacter!,
        portraits: selectedCharacter!.portraits.map(p => p.portraitID === portrait.portraitID ? updatedPortrait : p)
      };

      setCharacters(characters.map(c => c.characterID === selectedCharacter!.characterID ? updatedCharacter : c));
      setSelectedCharacter(updatedCharacter);

      setShowPortraitModal(false);
      setEditingPortrait(null);
      log('立绘更新成功', portrait.portName);
    } catch (error) {
      console.error('更新立绘失败:', error);
      log('立绘更新失败', error);
      alert('更新立绘失败，请重试');
    }
  };

  const handleDeletePortrait = async (portraitId: string) => {
    if (!selectedCharacter) return;
    if (!window.confirm('确定要删除这个立绘吗？')) return;

    try {
      log('删除立绘', portraitId);
      await ApiService.deletePortrait(selectedCharacter.characterID, portraitId);
      const updatedCharacter = {
        ...selectedCharacter,
        portraits: selectedCharacter.portraits.filter(p => p.portraitID !== portraitId)
      };

      setCharacters(characters.map(c => c.characterID === selectedCharacter.characterID ? updatedCharacter : c));
      setSelectedCharacter(updatedCharacter);
      log('立绘删除成功', portraitId);
    } catch (error) {
      console.error('删除立绘失败:', error);
      log('立绘删除失败', error);
      alert('删除立绘失败，请重试');
    }
  };

  const handleCancelEditPortrait = () => {
    log('取消编辑立绘');
    setEditingPortrait(null);
    setIsAddingPortrait(false);
    setPortraitFile(null);
    setPortraitPreview(null);
  };

  const handleAddCharacter = () => {
    log('添加新角色');
    // 创建一个新的角色对象
    const newCharacter: MyCharacter = {
      characterID: `char_${Date.now()}`,
      characterName: "新角色",
      height: 170,
      faction: "未设定",
      portraits: [],
      colorBg: "#4C361F",
      colorText: "#FBDB3",
      tags: []
    };

    setCharacters([...characters, newCharacter]);
    setSelectedCharacter(newCharacter);
    setEditingCharacter(newCharacter);
    setIsEditingCharacter(true);
    setShowCharacterModal(true);
  };

  const handleDeleteCharacter = async (characterId: string, deleteFiles: boolean) => {
    try {
      log('删除角色', { characterId, deleteFiles });
      // 调用API删除角色
      await ApiService.deleteCharacter(characterId, deleteFiles);

      // 从本地状态中移除角色
      const updatedCharacters = characters.filter(c => c.characterID !== characterId);
      setCharacters(updatedCharacters);

      // 如果删除的是当前选中的角色，清除选中状态
      if (selectedCharacter?.characterID === characterId) {
        setSelectedCharacter(null);
      }

      log('角色删除成功', characterId);
      alert('角色删除成功');
    } catch (error) {
      console.error('删除角色失败:', error);
      log('角色删除失败', error);
      alert('删除角色失败，请重试');
    }
  };

  return (
    <div className="resource-tab">
      <div className="resource-actions">
        <input
          type="text"
          placeholder="搜索角色..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button onClick={() => openResourceFolder('characters')}>打开角色文件夹</button>
        <button className="btn-primary" onClick={handleAddCharacter}>添加角色</button>
      </div>

      <div className="characters-grid">
        {characters.map(character => (
          <div
            key={character.characterID}
            className={`character-card ${selectedCharacter?.characterID === character.characterID ? 'selected' : ''}`}
            onClick={() => setSelectedCharacter(character)}
            onDoubleClick={() => {
              log('双击角色', character.characterName);
              setEditingCharacter({ ...character });
              setShowCharacterModal(true);
            }}
          >
            <div className="character-avatar">
              {/* 显示角色默认立绘的缩略图 */}
              {character.portraits && character.portraits.length > 0 && character.portraits[0].thumbnailPath ? (
                (() => {
                  // 优先使用Electron API直接读取本地文件
                  if (character.portraits[0].thumbnailPath.startsWith('/') && window.electronAPI) {
                    // 使用配置文件中的路径设置
                    const fileName = character.portraits[0].thumbnailPath.substring(character.portraits[0].thumbnailPath.lastIndexOf('/') + 1);
                    const filePath = `${AppConfig.api.baseUrl}${character.portraits[0].thumbnailPath}?t=${Date.now()}`;
                    
                    return React.createElement('img', {
                      src: filePath,
                      alt: character.portraits[0].portName,
                      className: "character-thumbnail",
                      style: {
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '4px'
                      },
                      onError: (e) => {
                        // 如果加载失败，尝试使用Electron API
                        if (character.portraits[0].thumbnailPath.startsWith('/') && window.electronAPI) {
                          window.electronAPI.readFile(character.portraits[0].thumbnailPath.substring(1))
                            .then((buffer) => {
                              const blob = new Blob([new Uint8Array(buffer)]);
                              const url = URL.createObjectURL(blob);
                              (e.currentTarget as HTMLImageElement).src = url;
                            })
                            .catch((err) => {
                              console.error('[CharactersTab] 加载缩略图失败', err);
                            });
                        }
                      }
                    });
                  } else {
                    // 如果没有Electron API或路径不是以/开头，使用HTTP请求
                    const httpUrl = character.portraits[0].thumbnailPath.startsWith('/')
                      ? AppConfig.api.baseUrl + character.portraits[0].thumbnailPath + "?t=" + Date.now()
                      : character.portraits[0].thumbnailPath + "?t=" + Date.now();
                      
                    return React.createElement('img', {
                      src: httpUrl,
                      alt: character.portraits[0].portName,
                      className: "character-thumbnail",
                      style: {
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '4px'
                      }
                    });
                  }
                })()
              ) : (
                <div className="avatar-placeholder">头像</div>
              )}
            </div>
            <div className="character-info">
              <h3>{character.characterName}</h3>
              <p>阵营: {character.faction}</p>
              <p>立绘数量: {character.portraits.length}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 角色详情弹窗 */}
      {showCharacterModal && editingCharacter && (
        <CharacterDetailModal
          character={editingCharacter}
          portraits={editingCharacter.portraits}
          onDelete={handleDeleteCharacter}
          onClose={() => setShowCharacterModal(false)}
          onSave={(character) => {
            log('保存角色详情', character.characterName);
            if (editingCharacter?.characterID && characters.find(c => c.characterID === editingCharacter.characterID)) {
              // 更新现有角色
              setCharacters(characters.map(c => c.characterID === editingCharacter.characterID ? character : c));
              setSelectedCharacter(character);
            } else {
              // 添加新角色
              setCharacters([...characters, character]);
              setSelectedCharacter(character);
            }
            setShowCharacterModal(false)
          }}
          isNewCharacter={!characters.find(c => c.characterID === editingCharacter.characterID)}
        />
      )}

      {/* 立绘编辑弹窗 */}
      {showPortraitModal && selectedCharacter && (
        <PortraitModal
          characterId={selectedCharacter.characterID}
          portrait={editingPortrait}
          onClose={() => setShowPortraitModal(false)}
          onSave={editingPortrait?.portraitID && selectedCharacter.portraits.find(p => p.portraitID === editingPortrait.portraitID)
            ? handleUpdatePortrait
            : handleSavePortrait}
          isNewPortrait={!editingPortrait?.portraitID || !selectedCharacter.portraits.find(p => p.portraitID === editingPortrait.portraitID)}
        />
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

export default CharactersTab;
