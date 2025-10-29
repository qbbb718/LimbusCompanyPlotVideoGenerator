import React, { useState, useEffect } from 'react';
import './RecordEditor.css';
import ApiService from '../services/ApiService';
import { Record, ProjectSettings, CharacterVisual, BackgroundVisual, Dialogue, Emotion, DialogueAlign } from '../types';

interface RecordEditorProps {
  projectSettings: ProjectSettings;
}

const RecordEditor: React.FC<RecordEditorProps> = ({ projectSettings }) => {
  const [records, setRecords] = useState<Record[]>([]);
  const [selectedRecordIndex, setSelectedRecordIndex] = useState<number>(0);
  const [activePropertyTab, setActivePropertyTab] = useState<'text' | 'characters' | 'background' | 'effects' | 'audio' | 'global'>('text');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    try {
      setIsLoading(true);
      const data = await ApiService.getRecords();
      setRecords(data);
      if (data.length === 0) {
        // 如果没有记录，创建一个默认记录
        createNewRecord();
      }
    } catch (error) {
      console.error('获取记录失败，使用默认记录:', error);
      // 即使获取失败也创建一个默认记录
      createNewRecord();
    } finally {
      setIsLoading(false);
    }
  };

  const createNewRecord = () => {
    const newRecord: Record = {
      uuid: generateUUID(),
      durationFrames: 60, // 默认1秒，假设60fps
      dialogue: {
        text: '',
        location: 'default',
        speakerC: [],
        speakerName: '',
        faction: '',
        align: DialogueAlign.LEFT,
        speed: 1,
        emotion: Emotion.NORMAL
      },
      bg: [],
      chars: [],
      effects: [],
      audioCommands: [],
      isDirty: true
    };

    const newRecords = records.length > 0 ? [...records, newRecord] : [newRecord];
    setRecords(newRecords);
    setSelectedRecordIndex(newRecords.length - 1);
  };

  const updateRecord = (index: number, updatedRecord: Record) => {
    const newRecords = [...records];
    newRecords[index] = { ...updatedRecord, isDirty: true };
    setRecords(newRecords);

    // 可以在这里添加自动保存逻辑
    // saveRecordToBackend(updatedRecord);
  };

  const deleteRecord = (index: number) => {
    if (records.length <= 1) {
      alert('至少需要保留一条记录');
      return;
    }

    const newRecords = records.filter((_, i) => i !== index);
    setRecords(newRecords);

    if (selectedRecordIndex >= newRecords.length) {
      setSelectedRecordIndex(newRecords.length - 1);
    }
  };

  const moveRecord = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || 
        (direction === 'down' && index === records.length - 1)) {
      return;
    }

    const newRecords = [...records];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    // 交换位置
    [newRecords[index], newRecords[targetIndex]] = [newRecords[targetIndex], newRecords[index]];
    setRecords(newRecords);

    if (selectedRecordIndex === index) {
      setSelectedRecordIndex(targetIndex);
    } else if (selectedRecordIndex === targetIndex) {
      setSelectedRecordIndex(index);
    }
  };

  const duplicateRecord = (index: number) => {
    const recordToDuplicate = records[index];
    const newRecord = {
      ...recordToDuplicate,
      uuid: generateUUID(),
      isDirty: true
    };

    const newRecords = [...records];
    newRecords.splice(index + 1, 0, newRecord);
    setRecords(newRecords);
    setSelectedRecordIndex(index + 1);
  };

  const generateVideo = async () => {
    try {
      setIsLoading(true);
      const result = await ApiService.generateVideo(records);
      alert(`视频生成成功！保存路径: ${result.outputPath}`);
    } catch (error) {
      console.error('生成视频失败:', error);
      alert('视频生成失败，请检查控制台日志');
    } finally {
      setIsLoading(false);
    }
  };

  // 简单的UUID生成函数
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  if (isLoading) {
    return <div className="loading">加载中...</div>;
  }

  // 确保有选中的记录，如果没有则创建一个默认的
  const selectedRecord = records[selectedRecordIndex] || (records.length > 0 ? records[0] : null);
  
  // 如果仍然没有记录，则显示一个空状态
  if (!selectedRecord) {
    return (
      <div className="record-editor">
        <div className="editor-top">
          <div className="record-list-container">
            <div className="record-list-header">
              <h3>剧情记录</h3>
              <div className="record-list-actions">
                <button onClick={createNewRecord}>添加记录</button>
              </div>
            </div>
            <div className="empty-state">
              <p>暂无剧情记录，请点击"添加记录"按钮创建新记录</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="record-editor">
      <div className="editor-top">
        <div className="record-list-container">
          <div className="record-list-header">
            <h3>剧情记录</h3>
            <div className="record-list-actions">
              <button onClick={createNewRecord}>添加记录</button>
              <button onClick={generateVideo}>生成视频</button>
            </div>
          </div>

          <div className="record-list">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>说话人</th>
                  <th>对话内容</th>
                  <th>情绪</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record, index) => (
                  <tr 
                    key={record.uuid}
                    className={index === selectedRecordIndex ? 'selected' : ''}
                    onClick={() => setSelectedRecordIndex(index)}
                  >
                    <td>{index + 1}</td>
                    <td>{record.dialogue.speakerName || '旁白'}</td>
                    <td>{record.dialogue.text.substring(0, 30) + (record.dialogue.text.length > 30 ? '...' : '')}</td>
                    <td>{record.dialogue.emotion}</td>
                    <td>
                      <button onClick={(e) => { e.stopPropagation(); moveRecord(index, 'up'); }} disabled={index === 0}>↑</button>
                      <button onClick={(e) => { e.stopPropagation(); moveRecord(index, 'down'); }} disabled={index === records.length - 1}>↓</button>
                      <button onClick={(e) => { e.stopPropagation(); duplicateRecord(index); }}>复制</button>
                      <button onClick={(e) => { e.stopPropagation(); deleteRecord(index); }}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="editor-bottom">
        <div className="preview-container">
          <h3>预览</h3>
          <div className="preview-image">
            {/* 这里应该显示当前记录的预览图 */}
            <div className="preview-placeholder">预览图区域</div>
          </div>
          <div className="preview-timeline">
            {/* 这里应该显示类似视频进度条的东西 */}
            <div className="timeline-placeholder">时间轴</div>
          </div>
        </div>

        <div className="properties-container">
          <div className="property-tabs">
            <button 
              className={activePropertyTab === 'text' ? 'active' : ''}
              onClick={() => setActivePropertyTab('text')}
            >
              文本
            </button>
            <button 
              className={activePropertyTab === 'characters' ? 'active' : ''}
              onClick={() => setActivePropertyTab('characters')}
            >
              立绘
            </button>
            <button 
              className={activePropertyTab === 'background' ? 'active' : ''}
              onClick={() => setActivePropertyTab('background')}
            >
              背景
            </button>
            <button 
              className={activePropertyTab === 'effects' ? 'active' : ''}
              onClick={() => setActivePropertyTab('effects')}
            >
              特效
            </button>
            <button 
              className={activePropertyTab === 'audio' ? 'active' : ''}
              onClick={() => setActivePropertyTab('audio')}
            >
              音效
            </button>
            <button 
              className={activePropertyTab === 'global' ? 'active' : ''}
              onClick={() => setActivePropertyTab('global')}
            >
              全局设置
            </button>
          </div>

          <div className="property-content">
            {activePropertyTab === 'text' && (
              <div className="text-properties">
                <div className="form-group">
                  <label>说话人</label>
                  <input 
                    type="text" 
                    value={selectedRecord.dialogue.speakerName}
                    onChange={(e) => {
                      const updatedRecord = {
                        ...selectedRecord,
                        dialogue: {
                          ...selectedRecord.dialogue,
                          speakerName: e.target.value
                        }
                      };
                      updateRecord(selectedRecordIndex, updatedRecord);
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>对话内容</label>
                  <textarea 
                    value={selectedRecord.dialogue.text}
                    onChange={(e) => {
                      const updatedRecord = {
                        ...selectedRecord,
                        dialogue: {
                          ...selectedRecord.dialogue,
                          text: e.target.value
                        }
                      };
                      updateRecord(selectedRecordIndex, updatedRecord);
                    }}
                    rows={5}
                  />
                </div>

                <div className="form-group">
                  <label>位置</label>
                  <input 
                    type="text" 
                    value={selectedRecord.dialogue.location}
                    onChange={(e) => {
                      const updatedRecord = {
                        ...selectedRecord,
                        dialogue: {
                          ...selectedRecord.dialogue,
                          location: e.target.value
                        }
                      };
                      updateRecord(selectedRecordIndex, updatedRecord);
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>阵营</label>
                  <input 
                    type="text" 
                    value={selectedRecord.dialogue.faction}
                    onChange={(e) => {
                      const updatedRecord = {
                        ...selectedRecord,
                        dialogue: {
                          ...selectedRecord.dialogue,
                          faction: e.target.value
                        }
                      };
                      updateRecord(selectedRecordIndex, updatedRecord);
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>对齐方式</label>
                  <select 
                    value={selectedRecord.dialogue.align}
                    onChange={(e) => {
                      const updatedRecord = {
                        ...selectedRecord,
                        dialogue: {
                          ...selectedRecord.dialogue,
                          align: e.target.value as DialogueAlign
                        }
                      };
                      updateRecord(selectedRecordIndex, updatedRecord);
                    }}
                  >
                    <option value={DialogueAlign.LEFT}>左对齐</option>
                    <option value={DialogueAlign.CENTER}>居中</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>显示速度</label>
                  <input 
                    type="number" 
                    min="0.1" 
                    max="3" 
                    step="0.1"
                    value={selectedRecord.dialogue.speed}
                    onChange={(e) => {
                      const updatedRecord = {
                        ...selectedRecord,
                        dialogue: {
                          ...selectedRecord.dialogue,
                          speed: parseFloat(e.target.value)
                        }
                      };
                      updateRecord(selectedRecordIndex, updatedRecord);
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>情绪</label>
                  <select 
                    value={selectedRecord.dialogue.emotion}
                    onChange={(e) => {
                      const updatedRecord = {
                        ...selectedRecord,
                        dialogue: {
                          ...selectedRecord.dialogue,
                          emotion: e.target.value as Emotion
                        }
                      };
                      updateRecord(selectedRecordIndex, updatedRecord);
                    }}
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
              </div>
            )}

            {activePropertyTab === 'characters' && (
              <div className="characters-properties">
                <h4>角色立绘</h4>
                <div className="characters-list">
                  {selectedRecord.chars.map((char, index) => (
                    <div key={index} className="character-item">
                      <div className="character-header">
                        <h5>{char.chara.characterName}</h5>
                        <button 
                          onClick={() => {
                            const updatedChars = selectedRecord.chars.filter((_, i) => i !== index);
                            const updatedRecord = {
                              ...selectedRecord,
                              chars: updatedChars
                            };
                            updateRecord(selectedRecordIndex, updatedRecord);
                          }}
                        >
                          删除
                        </button>
                      </div>

                      <div className="character-details">
                        <div className="form-group">
                          <label>立绘</label>
                          <select>
                            {/* 这里应该从后端获取该角色的所有立绘 */}
                            <option value={char.portrait.portraitID}>{char.portrait.portName}</option>
                          </select>
                        </div>

                        <div className="form-group">
                          <label>X坐标</label>
                          <input 
                            type="number" 
                            value={char.posX}
                            onChange={(e) => {
                              const updatedChars = [...selectedRecord.chars];
                              updatedChars[index] = {
                                ...char,
                                posX: parseInt(e.target.value)
                              };
                              const updatedRecord = {
                                ...selectedRecord,
                                chars: updatedChars
                              };
                              updateRecord(selectedRecordIndex, updatedRecord);
                            }}
                          />
                        </div>

                        <div className="form-group">
                          <label>Y坐标</label>
                          <input 
                            type="number" 
                            value={char.posY}
                            onChange={(e) => {
                              const updatedChars = [...selectedRecord.chars];
                              updatedChars[index] = {
                                ...char,
                                posY: parseInt(e.target.value)
                              };
                              const updatedRecord = {
                                ...selectedRecord,
                                chars: updatedChars
                              };
                              updateRecord(selectedRecordIndex, updatedRecord);
                            }}
                          />
                        </div>

                        <div className="form-group">
                          <label>X偏移</label>
                          <input 
                            type="number" 
                            value={char.adjX}
                            onChange={(e) => {
                              const updatedChars = [...selectedRecord.chars];
                              updatedChars[index] = {
                                ...char,
                                adjX: parseInt(e.target.value)
                              };
                              const updatedRecord = {
                                ...selectedRecord,
                                chars: updatedChars
                              };
                              updateRecord(selectedRecordIndex, updatedRecord);
                            }}
                          />
                        </div>

                        <div className="form-group">
                          <label>Y偏移</label>
                          <input 
                            type="number" 
                            value={char.adjY}
                            onChange={(e) => {
                              const updatedChars = [...selectedRecord.chars];
                              updatedChars[index] = {
                                ...char,
                                adjY: parseInt(e.target.value)
                              };
                              const updatedRecord = {
                                ...selectedRecord,
                                chars: updatedChars
                              };
                              updateRecord(selectedRecordIndex, updatedRecord);
                            }}
                          />
                        </div>

                        <div className="form-group">
                          <label>
                            <input 
                              type="checkbox" 
                              checked={char.dim}
                              onChange={(e) => {
                                const updatedChars = [...selectedRecord.chars];
                                updatedChars[index] = {
                                  ...char,
                                  dim: e.target.checked
                                };
                                const updatedRecord = {
                                  ...selectedRecord,
                                  chars: updatedChars
                                };
                                updateRecord(selectedRecordIndex, updatedRecord);
                              }}
                            />
                            压暗
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button 
                    className="add-character-btn"
                    onClick={() => {
                      // 这里应该打开一个对话框，让用户选择角色和立绘
                      alert('添加角色功能待实现');
                    }}
                  >
                    添加角色
                  </button>
                </div>
              </div>
            )}

            {activePropertyTab === 'background' && (
              <div className="background-properties">
                <h4>背景设置</h4>
                <div className="backgrounds-list">
                  {selectedRecord.bg.map((bg, index) => (
                    <div key={index} className="background-item">
                      <div className="background-header">
                        <h5>{bg.background.name}</h5>
                        <button 
                          onClick={() => {
                            const updatedBgs = selectedRecord.bg.filter((_, i) => i !== index);
                            const updatedRecord = {
                              ...selectedRecord,
                              bg: updatedBgs
                            };
                            updateRecord(selectedRecordIndex, updatedRecord);
                          }}
                        >
                          删除
                        </button>
                      </div>

                      <div className="background-details">
                        <div className="form-group">
                          <label>背景</label>
                          <select>
                            {/* 这里应该从后端获取所有背景 */}
                            <option value={bg.background.uuid}>{bg.background.name}</option>
                          </select>
                        </div>

                        <div className="form-group">
                          <label>X坐标</label>
                          <input 
                            type="number" 
                            value={bg.posX}
                            onChange={(e) => {
                              const updatedBgs = [...selectedRecord.bg];
                              updatedBgs[index] = {
                                ...bg,
                                posX: parseInt(e.target.value)
                              };
                              const updatedRecord = {
                                ...selectedRecord,
                                bg: updatedBgs
                              };
                              updateRecord(selectedRecordIndex, updatedRecord);
                            }}
                          />
                        </div>

                        <div className="form-group">
                          <label>Y坐标</label>
                          <input 
                            type="number" 
                            value={bg.posY}
                            onChange={(e) => {
                              const updatedBgs = [...selectedRecord.bg];
                              updatedBgs[index] = {
                                ...bg,
                                posY: parseInt(e.target.value)
                              };
                              const updatedRecord = {
                                ...selectedRecord,
                                bg: updatedBgs
                              };
                              updateRecord(selectedRecordIndex, updatedRecord);
                            }}
                          />
                        </div>

                        <div className="form-group">
                          <label>缩放</label>
                          <input 
                            type="number" 
                            min="0.1" 
                            max="3" 
                            step="0.1"
                            value={bg.scale}
                            onChange={(e) => {
                              const updatedBgs = [...selectedRecord.bg];
                              updatedBgs[index] = {
                                ...bg,
                                scale: parseFloat(e.target.value)
                              };
                              const updatedRecord = {
                                ...selectedRecord,
                                bg: updatedBgs
                              };
                              updateRecord(selectedRecordIndex, updatedRecord);
                            }}
                          />
                        </div>

                        <div className="form-group">
                          <label>
                            <input 
                              type="checkbox" 
                              checked={bg.visible}
                              onChange={(e) => {
                                const updatedBgs = [...selectedRecord.bg];
                                updatedBgs[index] = {
                                  ...bg,
                                  visible: e.target.checked
                                };
                                const updatedRecord = {
                                  ...selectedRecord,
                                  bg: updatedBgs
                                };
                                updateRecord(selectedRecordIndex, updatedRecord);
                              }}
                            />
                            可见
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button 
                    className="add-background-btn"
                    onClick={() => {
                      // 这里应该打开一个对话框，让用户选择背景
                      alert('添加背景功能待实现');
                    }}
                  >
                    添加背景
                  </button>
                </div>
              </div>
            )}

            {activePropertyTab === 'effects' && (
              <div className="effects-properties">
                <h4>特效设置</h4>
                <p>特效功能待实现</p>
              </div>
            )}

            {activePropertyTab === 'audio' && (
              <div className="audio-properties">
                <h4>音效设置</h4>
                <div className="audio-list">
                  {selectedRecord.audioCommands.map((audio, index) => (
                    <div key={index} className="audio-item">
                      <div className="audio-header">
                        <h5>{audio.type}: {audio.path}</h5>
                        <button 
                          onClick={() => {
                            const updatedAudios = selectedRecord.audioCommands.filter((_, i) => i !== index);
                            const updatedRecord = {
                              ...selectedRecord,
                              audioCommands: updatedAudios
                            };
                            updateRecord(selectedRecordIndex, updatedRecord);
                          }}
                        >
                          删除
                        </button>
                      </div>

                      <div className="audio-details">
                        <div className="form-group">
                          <label>类型</label>
                          <select 
                            value={audio.type}
                            onChange={(e) => {
                              const updatedAudios = [...selectedRecord.audioCommands];
                              updatedAudios[index] = {
                                ...audio,
                                type: e.target.value
                              };
                              const updatedRecord = {
                                ...selectedRecord,
                                audioCommands: updatedAudios
                              };
                              updateRecord(selectedRecordIndex, updatedRecord);
                            }}
                          >
                            <option value="BGM">背景音乐</option>
                            <option value="VOICE">语音</option>
                            <option value="SFX">音效</option>
                          </select>
                        </div>

                        <div className="form-group">
                          <label>文件路径</label>
                          <input 
                            type="text" 
                            value={audio.path}
                            onChange={(e) => {
                              const updatedAudios = [...selectedRecord.audioCommands];
                              updatedAudios[index] = {
                                ...audio,
                                path: e.target.value
                              };
                              const updatedRecord = {
                                ...selectedRecord,
                                audioCommands: updatedAudios
                              };
                              updateRecord(selectedRecordIndex, updatedRecord);
                            }}
                          />
                        </div>

                        <div className="form-group">
                          <label>音量</label>
                          <input 
                            type="number" 
                            min="0" 
                            max="2" 
                            step="0.1"
                            value={audio.volume}
                            onChange={(e) => {
                              const updatedAudios = [...selectedRecord.audioCommands];
                              updatedAudios[index] = {
                                ...audio,
                                volume: parseFloat(e.target.value)
                              };
                              const updatedRecord = {
                                ...selectedRecord,
                                audioCommands: updatedAudios
                              };
                              updateRecord(selectedRecordIndex, updatedRecord);
                            }}
                          />
                        </div>

                        <div className="form-group">
                          <label>开始时间(秒)</label>
                          <input 
                            type="number" 
                            min="0" 
                            step="0.1"
                            value={audio.startTime}
                            onChange={(e) => {
                              const updatedAudios = [...selectedRecord.audioCommands];
                              updatedAudios[index] = {
                                ...audio,
                                startTime: parseFloat(e.target.value)
                              };
                              const updatedRecord = {
                                ...selectedRecord,
                                audioCommands: updatedAudios
                              };
                              updateRecord(selectedRecordIndex, updatedRecord);
                            }}
                          />
                        </div>

                        <div className="form-group">
                          <label>持续时间(秒)</label>
                          <input 
                            type="number" 
                            min="0" 
                            step="0.1"
                            value={audio.duration}
                            onChange={(e) => {
                              const updatedAudios = [...selectedRecord.audioCommands];
                              updatedAudios[index] = {
                                ...audio,
                                duration: parseFloat(e.target.value)
                              };
                              const updatedRecord = {
                                ...selectedRecord,
                                audioCommands: updatedAudios
                              };
                              updateRecord(selectedRecordIndex, updatedRecord);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  <button 
                    className="add-audio-btn"
                    onClick={() => {
                      // 这里应该打开一个对话框，让用户选择音频
                      alert('添加音频功能待实现');
                    }}
                  >
                    添加音频
                  </button>
                </div>
              </div>
            )}

            {activePropertyTab === 'global' && (
              <div className="global-properties">
                <h4>全局设置</h4>

                <div className="form-group">
                  <label>项目名称</label>
                  <input 
                    type="text" 
                    value={projectSettings.name}
                    onChange={(e) => {
                      // 这里应该更新项目设置
                      alert('更新项目设置功能待实现');
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>剧情类型</label>
                  <select 
                    value={projectSettings.storyType}
                    onChange={(e) => {
                      // 这里应该更新项目设置
                      alert('更新项目设置功能待实现');
                    }}
                  >
                    <option value="STORY">剧情</option>
                    <option value="PERSONALITY">人格故事</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>BGM音量</label>
                  <input 
                    type="number" 
                    min="0" 
                    max="1" 
                    step="0.1"
                    value={projectSettings.bgmVolume}
                    onChange={(e) => {
                      // 这里应该更新项目设置
                      alert('更新项目设置功能待实现');
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>语音音量</label>
                  <input 
                    type="number" 
                    min="0" 
                    max="1" 
                    step="0.1"
                    value={projectSettings.voiceVolume}
                    onChange={(e) => {
                      // 这里应该更新项目设置
                      alert('更新项目设置功能待实现');
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>音效音量</label>
                  <input 
                    type="number" 
                    min="0" 
                    max="1" 
                    step="0.1"
                    value={projectSettings.sfxVolume}
                    onChange={(e) => {
                      // 这里应该更新项目设置
                      alert('更新项目设置功能待实现');
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>输出路径</label>
                  <input 
                    type="text" 
                    value={projectSettings.outputPath}
                    onChange={(e) => {
                      // 这里应该更新项目设置
                      alert('更新项目设置功能待实现');
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecordEditor;
