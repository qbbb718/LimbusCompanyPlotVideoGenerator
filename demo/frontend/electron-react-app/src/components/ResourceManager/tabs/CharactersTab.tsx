
import React, { useState, useRef } from 'react';
import { MyCharacter, Portrait, Emotion } from '../../../types';
import ApiService from '../../../services/ApiService';
import '../ResourceManager.css';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleEditCharacter = () => {
    if (!selectedCharacter) return;
    setEditingCharacter({ ...selectedCharacter });
    setIsEditingCharacter(true);
  };

  const handleSaveCharacter = async () => {
    if (!editingCharacter) return;

    try {
      const updatedCharacter = await ApiService.updateCharacter(editingCharacter.characterID, editingCharacter);
      setCharacters(characters.map(c => c.characterID === editingCharacter.characterID ? updatedCharacter : c));
      setSelectedCharacter(updatedCharacter);
      setEditingCharacter(null);
      setIsEditingCharacter(false);
    } catch (error) {
      console.error('更新角色失败:', error);
      alert('更新角色失败，请重试');
    }
  };

  const handleCancelEditCharacter = () => {
    setEditingCharacter(null);
    setIsEditingCharacter(false);
  };

  const handleAddPortrait = () => {
    setIsAddingPortrait(true);
    setEditingPortrait(null);
    setPortraitFile(null);
    setPortraitPreview(null);
    setCropPosition({ x: 0, y: 0 });
    setCropSize({ width: 100, height: 100 });
  };

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

  const handleSavePortrait = async () => {
    if (!editingPortrait || !selectedCharacter) return;

    try {
      const newPortrait = await ApiService.addPortrait(selectedCharacter.characterID, editingPortrait);
      const updatedCharacter = {
        ...selectedCharacter,
        portraits: [...selectedCharacter.portraits, newPortrait]
      };
      
      setCharacters(characters.map(c => c.characterID === selectedCharacter.characterID ? updatedCharacter : c));
      setSelectedCharacter(updatedCharacter);
      
      setIsAddingPortrait(false);
      setEditingPortrait(null);
      setPortraitFile(null);
      setPortraitPreview(null);
    } catch (error) {
      console.error('添加立绘失败:', error);
      alert('添加立绘失败，请重试');
    }
  };

  const handleEditPortrait = (portrait: Portrait) => {
    setEditingPortrait({ ...portrait });
    setIsAddingPortrait(false);
  };

  const handleUpdatePortrait = async () => {
    if (!editingPortrait || !selectedCharacter) return;

    try {
      const updatedPortrait = await ApiService.updatePortrait(selectedCharacter.characterID, editingPortrait.portraitID, editingPortrait);
      const updatedCharacter = {
        ...selectedCharacter,
        portraits: selectedCharacter.portraits.map(p => p.portraitID === editingPortrait.portraitID ? updatedPortrait : p)
      };
      
      setCharacters(characters.map(c => c.characterID === selectedCharacter.characterID ? updatedCharacter : c));
      setSelectedCharacter(updatedCharacter);
      
      setEditingPortrait(null);
    } catch (error) {
      console.error('更新立绘失败:', error);
      alert('更新立绘失败，请重试');
    }
  };

  const handleDeletePortrait = async (portraitId: string) => {
    if (!selectedCharacter) return;
    if (!window.confirm('确定要删除这个立绘吗？')) return;

    try {
      await ApiService.deletePortrait(selectedCharacter.characterID, portraitId);
      const updatedCharacter = {
        ...selectedCharacter,
        portraits: selectedCharacter.portraits.filter(p => p.portraitID !== portraitId)
      };
      
      setCharacters(characters.map(c => c.characterID === selectedCharacter.characterID ? updatedCharacter : c));
      setSelectedCharacter(updatedCharacter);
    } catch (error) {
      console.error('删除立绘失败:', error);
      alert('删除立绘失败，请重试');
    }
  };

  const handleCancelEditPortrait = () => {
    setEditingPortrait(null);
    setIsAddingPortrait(false);
    setPortraitFile(null);
    setPortraitPreview(null);
  };

  const handleAddCharacter = () => {
    // 创建一个新的角色对象
    const newCharacter: MyCharacter = {
      characterID: `char_${Date.now()}`,
      characterName: "新角色",
      height: 170,
      faction: "未设定",
      portraits: [],
      colorBg: "#FFFFFF",
      colorText: "#000000"
    };
    
    setCharacters([...characters, newCharacter]);
    setSelectedCharacter(newCharacter);
    setEditingCharacter(newCharacter);
    setIsEditingCharacter(true);
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

      {selectedCharacter && (
        <div className="character-details">
          <div className="details-header">
            <h2>{selectedCharacter.characterName} - 详细信息</h2>
            {!isEditingCharacter && (
              <button className="btn-primary" onClick={handleEditCharacter}>编辑角色</button>
            )}
          </div>

          {isEditingCharacter && editingCharacter ? (
            <div className="character-form edit-form">
              <div className="form-group">
                <label>角色ID</label>
                <input type="text" value={editingCharacter.characterID} readOnly />
              </div>

              <div className="form-group">
                <label>角色名称</label>
                <input
                  type="text"
                  value={editingCharacter.characterName}
                  onChange={(e) => setEditingCharacter({ ...editingCharacter, characterName: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>身高</label>
                <input
                  type="number"
                  value={editingCharacter.height}
                  onChange={(e) => setEditingCharacter({ ...editingCharacter, height: parseInt(e.target.value) || 0 })}
                />
              </div>

              <div className="form-group">
                <label>阵营</label>
                <input
                  type="text"
                  value={editingCharacter.faction}
                  onChange={(e) => setEditingCharacter({ ...editingCharacter, faction: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>文字颜色</label>
                <input
                  type="text"
                  value={editingCharacter.colorText}
                  onChange={(e) => setEditingCharacter({ ...editingCharacter, colorText: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>背景颜色</label>
                <input
                  type="text"
                  value={editingCharacter.colorBg}
                  onChange={(e) => setEditingCharacter({ ...editingCharacter, colorBg: e.target.value })}
                />
              </div>

              <div className="form-actions">
                <button className="btn-primary" onClick={handleSaveCharacter}>保存</button>
                <button className="btn-secondary" onClick={handleCancelEditCharacter}>取消</button>
              </div>
            </div>
          ) : (
            <div className="character-form">
              <div className="form-group">
                <label>角色ID</label>
                <input type="text" value={selectedCharacter.characterID} readOnly />
              </div>

              <div className="form-group">
                <label>角色名称</label>
                <input type="text" value={selectedCharacter.characterName} readOnly />
              </div>

              <div className="form-group">
                <label>身高</label>
                <input type="number" value={selectedCharacter.height} readOnly />
              </div>

              <div className="form-group">
                <label>阵营</label>
                <input type="text" value={selectedCharacter.faction} readOnly />
              </div>

              <div className="form-group">
                <label>文字颜色</label>
                <input type="text" value={selectedCharacter.colorText} readOnly />
              </div>

              <div className="form-group">
                <label>背景颜色</label>
                <input type="text" value={selectedCharacter.colorBg} readOnly />
              </div>
            </div>
          )}

          <div className="portraits-section">
            <div className="section-header">
              <h3>立绘列表</h3>
              <button className="btn-primary" onClick={handleAddPortrait}>添加立绘</button>
            </div>
            
            {isAddingPortrait && (
              <div className="edit-form portrait-editor">
                <h3>添加新立绘</h3>
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

                {editingPortrait && portraitPreview && (
                  <>
                    <div className="portrait-preview">
                      <h4>预览</h4>
                      <img src={portraitPreview} alt="立绘预览" />
                      
                      <div className="crop-controls">
                        <h4>裁剪设置</h4>
                        <p>文字提醒用户裁剪位置与尺寸涉及立绘显示位置与比例的计算，在载入时先读取默认立绘设置的裁剪参数，若用户没有修改，则默认使用默认值，若用户修改了，则使用用户设置的值。</p>
                        
                        <div className="form-group">
                          <label>裁剪位置 X</label>
                          <input
                            type="number"
                            value={editingPortrait.faceX}
                            onChange={(e) => setEditingPortrait({ ...editingPortrait, faceX: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        
                        <div className="form-group">
                          <label>裁剪位置 Y</label>
                          <input
                            type="number"
                            value={editingPortrait.faceY}
                            onChange={(e) => setEditingPortrait({ ...editingPortrait, faceY: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        
                        <div className="form-group">
                          <label>裁剪尺寸</label>
                          <input
                            type="number"
                            value={editingPortrait.length}
                            onChange={(e) => setEditingPortrait({ ...editingPortrait, length: parseInt(e.target.value) || 100 })}
                          />
                        </div>
                        
                        <div className="crop-preview">
                          <h4>裁剪预览</h4>
                          <div 
                            style={{
                              width: '100px',
                              height: '100px',
                              overflow: 'hidden',
                              backgroundImage: `url(${portraitPreview})`,
                              backgroundPosition: `${-editingPortrait.faceX}px ${-editingPortrait.faceY}px`,
                              backgroundSize: `${editingPortrait.length}px`
                            }}
                          />
                        </div>
                      </div>
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
                      
                      <div className="form-actions">
                        <button className="btn-primary" onClick={handleSavePortrait}>保存</button>
                        <button className="btn-secondary" onClick={handleCancelEditPortrait}>取消</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            
            {editingPortrait && !isAddingPortrait && (
              <div className="edit-form portrait-editor">
                <h3>编辑立绘</h3>
                <div className="portrait-preview">
                  <h4>预览</h4>
                  {editingPortrait.imagePath && (
                    <img src={editingPortrait.imagePath} alt="立绘预览" />
                  )}
                  
                  <div className="crop-controls">
                    <h4>裁剪设置</h4>
                    <p>文字提醒用户裁剪位置与尺寸涉及立绘显示位置与比例的计算，在载入时先读取默认立绘设置的裁剪参数，若用户没有修改，则默认使用默认值，若用户修改了，则使用用户设置的值。</p>
                    
                    <div className="form-group">
                      <label>裁剪位置 X</label>
                      <input
                        type="number"
                        value={editingPortrait.faceX}
                        onChange={(e) => setEditingPortrait({ ...editingPortrait, faceX: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    
                    <div className="form-group">
                      <label>裁剪位置 Y</label>
                      <input
                        type="number"
                        value={editingPortrait.faceY}
                        onChange={(e) => setEditingPortrait({ ...editingPortrait, faceY: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    
                    <div className="form-group">
                      <label>裁剪尺寸</label>
                      <input
                        type="number"
                        value={editingPortrait.length}
                        onChange={(e) => setEditingPortrait({ ...editingPortrait, length: parseInt(e.target.value) || 100 })}
                      />
                    </div>
                    
                    <div className="crop-preview">
                      <h4>裁剪预览</h4>
                      <div 
                        style={{
                          width: '100px',
                          height: '100px',
                          overflow: 'hidden',
                          backgroundImage: `url(${editingPortrait.imagePath})`,
                          backgroundPosition: `${-editingPortrait.faceX}px ${-editingPortrait.faceY}px`,
                          backgroundSize: `${editingPortrait.length}px`
                        }}
                      />
                    </div>
                  </div>
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
                  
                  <div className="form-actions">
                    <button className="btn-primary" onClick={handleUpdatePortrait}>保存</button>
                    <button className="btn-secondary" onClick={handleCancelEditPortrait}>取消</button>
                    <button className="btn-danger" onClick={() => handleDeletePortrait(editingPortrait.portraitID)}>删除</button>
                  </div>
                </div>
              </div>
            )}
            
            <div className="portraits-grid">
              {selectedCharacter.portraits.map(portrait => (
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
      )}
    </div>
  );
};

export default CharactersTab;
