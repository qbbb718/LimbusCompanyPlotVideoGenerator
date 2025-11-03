import React, { useState, useRef, useEffect } from 'react';
import { MyCharacter, Portrait, Emotion } from '../../../types';
import ApiService from '../../../services/ApiService';
import '../ResourceManager.css';
import './CharacterModal.css';
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
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
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
      const newPortrait = await ApiService.addPortrait(selectedCharacter.characterID, portrait);
      const updatedCharacter = {
        ...selectedCharacter,
        portraits: [...selectedCharacter.portraits, newPortrait]
      };

      setCharacters(characters.map(c => c.characterID === selectedCharacter.characterID ? updatedCharacter : c));
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
      const updatedPortrait = await ApiService.updatePortrait(selectedCharacter.characterID, portrait.portraitID, portrait);
      const updatedCharacter = {
        ...selectedCharacter,
        portraits: selectedCharacter.portraits.map(p => p.portraitID === portrait.portraitID ? updatedPortrait : p)
      };

      setCharacters(characters.map(c => c.characterID === selectedCharacter.characterID ? updatedCharacter : c));
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
      colorBg: "#FFFFFF",
      colorText: "#000000",
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
              {/* 这里应该显示角色头像 */}
              <div className="avatar-placeholder">头像</div>
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
