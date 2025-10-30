
import React, { useState, useRef } from 'react';
import { Audio } from '../../../types';
import ApiService from '../../../services/ApiService';
import '../ResourceManager.css';

interface AudiosTabProps {
  audios: Audio[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  openResourceFolder: (resourceType: 'characters' | 'backgrounds' | 'audios') => void;
  setAudios: (audios: Audio[]) => void;
}

const AudiosTab: React.FC<AudiosTabProps> = ({
  audios,
  searchTerm,
  setSearchTerm,
  openResourceFolder,
  setAudios
}) => {
  const [editingAudio, setEditingAudio] = useState<Audio | null>(null);
  const [isAddingAudio, setIsAddingAudio] = useState(false);
  const [draggedItem, setDraggedItem] = useState<Audio | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [newTagInput, setNewTagInput] = useState<{ [key: string]: string }>({});
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleEditAudio = (audio: Audio) => {
    setEditingAudio({ ...audio });
  };

  const handleSaveAudio = async () => {
    if (!editingAudio) return;

    try {
      const updatedAudio = await ApiService.updateAudio(editingAudio.uuid, editingAudio);
      setAudios(audios.map(a => a.uuid === editingAudio.uuid ? updatedAudio : a));
      setEditingAudio(null);
    } catch (error) {
      console.error('更新音频失败:', error);
      alert('更新音频失败，请重试');
    }
  };

  const handleDeleteAudio = async (uuid: string) => {
    if (!window.confirm('确定要删除这个音频吗？')) return;

    try {
      await ApiService.deleteAudio(uuid);
      setAudios(audios.filter(a => a.uuid !== uuid));
    } catch (error) {
      console.error('删除音频失败:', error);
      alert('删除音频失败，请重试');
    }
  };

  const handleAddAudio = () => {
    setIsAddingAudio(true);
  };

  const handleSaveNewAudio = async () => {
    if (!editingAudio) return;

    try {
      const newAudio = await ApiService.addAudio(editingAudio);
      setAudios([...audios, newAudio]);
      setEditingAudio(null);
      setIsAddingAudio(false);
    } catch (error) {
      console.error('添加音频失败:', error);
      alert('添加音频失败，请重试');
    }
  };

  const handleCancelEdit = () => {
    setEditingAudio(null);
    setIsAddingAudio(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 这里应该处理文件上传并设置路径
    // 实际实现可能需要调用Electron的API将文件复制到资源目录
    const filePath = file.path || URL.createObjectURL(file);
    const fileName = file.name;
    const fileExtension = fileName.split('.').pop()?.toLowerCase();
    
    // 根据文件扩展名确定音频类型
    let audioType = 'SFX'; // 默认为音效
    if (fileExtension === 'mp3' || fileExtension === 'wav') {
      // 可以根据文件名或文件夹路径判断是BGM还是VOICE
      if (fileName.toLowerCase().includes('bgm') || fileName.toLowerCase().includes('background')) {
        audioType = 'BGM';
      } else if (fileName.toLowerCase().includes('voice') || fileName.toLowerCase().includes('dialog')) {
        audioType = 'VOICE';
      }
    }

    setEditingAudio({
      uuid: '',
      name: fileName.replace(/\.[^/.]+$/, ""), // 移除文件扩展名
      path: filePath,
      type: audioType,
      tags: []
    });
  };

  const handleAddTag = (audioUuid: string) => {
    const tagValue = newTagInput[audioUuid]?.trim();
    if (!tagValue) return;

    if (editingAudio) {
      if (editingAudio.tags.includes(tagValue)) {
        alert('该标签已存在');
        return;
      }
      setEditingAudio({
        ...editingAudio,
        tags: [...editingAudio.tags, tagValue]
      });
    }

    setNewTagInput({ ...newTagInput, [audioUuid]: '' });
  };

  const handleRemoveTag = (tag: string) => {
    if (!editingAudio) return;
    setEditingAudio({
      ...editingAudio,
      tags: editingAudio.tags.filter(t => t !== tag)
    });
  };

  const handleDragStart = (e: React.DragEvent, audio: Audio) => {
    setDraggedItem(audio);
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

    const draggedIndex = audios.findIndex(a => a.uuid === draggedItem.uuid);
    if (draggedIndex === dropIndex) return;

    const newAudios = [...audios];
    newAudios.splice(draggedIndex, 1);
    newAudios.splice(dropIndex, 0, draggedItem);

    setAudios(newAudios);
    setDraggedItem(null);
  };

  const handlePlayAudio = (audio: Audio) => {
    if (playingAudio === audio.uuid) {
      // 如果已经在播放这个音频，则停止播放
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setPlayingAudio(null);
    } else {
      // 播放选中的音频
      if (audioRef.current) {
        audioRef.current.src = audio.path;
        audioRef.current.play();
        setPlayingAudio(audio.uuid);
      }
    }
  };

  return (
    <div className="resource-tab">
      <div className="resource-actions">
        <input
          type="text"
          placeholder="搜索音频..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button onClick={() => openResourceFolder('audios')}>打开音频文件夹</button>
        <button onClick={handleAddAudio}>添加音频</button>
      </div>

      {isAddingAudio && (
        <div className="edit-form">
          <h3>添加新音频</h3>
          <div className="file-upload">
            <label className="file-upload-label">
              选择音频文件
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileSelect}
              />
            </label>
          </div>

          {editingAudio && (
            <>
              <div className="form-group">
                <label>名称</label>
                <input
                  type="text"
                  value={editingAudio.name}
                  onChange={(e) => setEditingAudio({ ...editingAudio, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>类型</label>
                <select
                  value={editingAudio.type}
                  onChange={(e) => setEditingAudio({ ...editingAudio, type: e.target.value })}
                >
                  <option value="BGM">背景音乐</option>
                  <option value="VOICE">语音</option>
                  <option value="SFX">音效</option>
                </select>
              </div>

              <div className="form-group">
                <label>标签</label>
                <div className="tags-container">
                  {editingAudio.tags.map(tag => (
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
                    value={newTagInput[editingAudio.uuid] || ''}
                    onChange={(e) => setNewTagInput({ ...newTagInput, [editingAudio.uuid]: e.target.value })}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddTag(editingAudio.uuid)}
                  />
                  <button onClick={() => handleAddTag(editingAudio.uuid)}>添加</button>
                </div>
              </div>

              <div className="form-actions">
                <button className="btn-primary" onClick={handleSaveNewAudio}>保存</button>
                <button className="btn-secondary" onClick={handleCancelEdit}>取消</button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="audios-list">
        {audios.map((audio, index) => (
          <div
            key={audio.uuid}
            className={`audio-item ${dragOverIndex === index ? 'drop-zone' : ''}`}
            draggable
            onDragStart={(e) => handleDragStart(e, audio)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
          >
            <div className="audio-info">
              <h3>{audio.name}</h3>
              <p>类型: {audio.type}</p>
              <p>路径: {audio.path}</p>
              
              <div className="tags-container">
                {audio.tags.map(tag => (
                  <div key={tag} className="tag">{tag}</div>
                ))}
              </div>
              
              <div className="form-actions">
                <button className="btn-primary" onClick={() => handleEditAudio(audio)}>编辑</button>
                <button className="btn-danger" onClick={() => handleDeleteAudio(audio.uuid)}>删除</button>
              </div>
            </div>
            <div className="audio-controls">
              <button onClick={() => handlePlayAudio(audio)}>
                {playingAudio === audio.uuid ? '停止' : '播放'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {editingAudio && !isAddingAudio && (
        <div className="edit-form">
          <h3>编辑音频</h3>
          <div className="form-group">
            <label>名称</label>
            <input
              type="text"
              value={editingAudio.name}
              onChange={(e) => setEditingAudio({ ...editingAudio, name: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>路径</label>
            <input
              type="text"
              value={editingAudio.path}
              onChange={(e) => setEditingAudio({ ...editingAudio, path: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>类型</label>
            <select
              value={editingAudio.type}
              onChange={(e) => setEditingAudio({ ...editingAudio, type: e.target.value })}
            >
              <option value="BGM">背景音乐</option>
              <option value="VOICE">语音</option>
              <option value="SFX">音效</option>
            </select>
          </div>

          <div className="form-group">
            <label>标签</label>
            <div className="tags-container">
              {editingAudio.tags.map(tag => (
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
                value={newTagInput[editingAudio.uuid] || ''}
                onChange={(e) => setNewTagInput({ ...newTagInput, [editingAudio.uuid]: e.target.value })}
                onKeyPress={(e) => e.key === 'Enter' && handleAddTag(editingAudio.uuid)}
              />
              <button onClick={() => handleAddTag(editingAudio.uuid)}>添加</button>
            </div>
          </div>

          <div className="form-actions">
            <button className="btn-primary" onClick={handleSaveAudio}>保存</button>
            <button className="btn-secondary" onClick={handleCancelEdit}>取消</button>
          </div>
        </div>
      )}

      <audio ref={audioRef} onEnded={() => setPlayingAudio(null)} />
    </div>
  );
};

export default AudiosTab;
