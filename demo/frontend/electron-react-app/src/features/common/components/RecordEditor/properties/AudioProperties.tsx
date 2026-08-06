import React, { useState, useEffect } from "react";
import { Record, Audio, AudioCommand, AudioType } from "../../../types";
import ApiService from "@services/ApiService";
import "../RecordEditor.css";
import "./AudioProperties.css";

interface AudioPropertiesProps {
  selectedRecord: Record;
  selectedRecordIndex: number;
  updateRecord: (index: number, updatedRecord: Record) => void;
}

const AudioProperties: React.FC<AudioPropertiesProps> = ({
  selectedRecord,
  selectedRecordIndex,
  updateRecord,
}) => {
  const [audios, setAudios] = useState<Audio[]>([]);
  const [showSelector, setShowSelector] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAudio, setSelectedAudio] = useState<Audio | null>(null);
  const [filteredAudios, setFilteredAudios] = useState<Audio[]>([]);
  const [audioType, setAudioType] = useState<AudioType>(AudioType.BGM);

  useEffect(() => {
    fetchAudios();
  }, []);

  useEffect(() => {
    // 根据搜索词过滤音频
    if (searchTerm.trim() === "") {
      setFilteredAudios(audios);
    } else {
      const term = searchTerm.toLowerCase();
      const filtered = audios.filter(
        (audio: Audio) =>
          audio.name.toLowerCase().includes(term) ||
          audio.path.toLowerCase().includes(term),
      );
      setFilteredAudios(filtered);
    }
  }, [searchTerm, audios]);

  const fetchAudios = async () => {
    try {
      // 尝试从API获取数据
      const data = await ApiService.getAudios();
      setAudios(data);
      setFilteredAudios(data);
    } catch (error) {
      console.error("获取音频列表失败，使用模拟数据:", error);
      // 使用模拟数据
      const mockAudios: Audio[] = [
        {
          uuid: "audio001",
          name: "背景音乐1",
          path: "/audio/bgm1.mp3",
          type: AudioType.BGM,
          tags: ["轻松", "日常"],
        },
        {
          uuid: "audio002",
          name: "脚步声",
          path: "/audio/footsteps.mp3",
          type: AudioType.SFX,
          tags: ["动作", "环境"],
        },
        {
          uuid: "audio003",
          name: "对话语音1",
          path: "/audio/voice1.mp3",
          type: AudioType.VOICE,
          tags: ["对话", "剧情"],
        },
      ];
      setAudios(mockAudios);
      setFilteredAudios(mockAudios);
    }
  };

  const addAudio = () => {
    if (!selectedAudio) {
      alert("请选择音频");
      return;
    }

    const newAudio: AudioCommand = {
      type: audioType,
      path: selectedAudio.path,
      volume: 1.0,
      startTime: 0,
      duration: 5.0,
    };

    const updatedAudios = [...selectedRecord.audioCommands, newAudio];
    const updatedRecord = {
      ...selectedRecord,
      audioCommands: updatedAudios,
    };
    updateRecord(selectedRecordIndex, updatedRecord);

    // 重置表单
    setSelectedAudio(null);
    setShowSelector(false);
    setAudioType(AudioType.BGM);
  };
  const updateAudio = (index: number, field: string, value: any) => {
    const updatedAudios = [...selectedRecord.audioCommands];
    updatedAudios[index] = {
      ...updatedAudios[index],
      [field]: value,
    };

    const updatedRecord = {
      ...selectedRecord,
      audioCommands: updatedAudios,
    };
    updateRecord(selectedRecordIndex, updatedRecord);
  };

  const deleteAudio = (index: number) => {
    const updatedAudios = selectedRecord.audioCommands.filter(
      (_: AudioCommand, i: number) => i !== index,
    );
    const updatedRecord = {
      ...selectedRecord,
      audioCommands: updatedAudios,
    };
    updateRecord(selectedRecordIndex, updatedRecord);
  };

  return (
    <>
      <div className="audio-properties">
        <h4>音效设置</h4>
        <div className="audio-list">
          {selectedRecord.audioCommands.map(
            (audio: AudioCommand, index: number) => (
              <div key={index} className="audio-item">
                <div className="audio-header">
                  <h5>
                    {audio.type}: {audio.path}
                  </h5>
                  <button onClick={() => deleteAudio(index)}>删除</button>
                </div>

                <div className="audio-details" style={{ padding: "10px" }}>
                  <div className="form-group" style={{ marginBottom: "12px" }}>
                    <label>类型</label>
                    <select
                      value={audio.type}
                      onChange={(e) =>
                        updateAudio(index, "type", e.target.value)
                      }
                      style={{ padding: "6px 8px", width: "100%" }}
                    >
                      <option value={AudioType.BGM}>背景音乐</option>
                      <option value={AudioType.VOICE}>语音</option>
                      <option value={AudioType.SFX}>音效</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: "12px" }}>
                    <label>文件路径</label>
                    <input
                      type="text"
                      value={audio.path}
                      onChange={(e) =>
                        updateAudio(index, "path", e.target.value)
                      }
                      style={{ padding: "6px 8px", width: "100%" }}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: "12px" }}>
                    <label>音量</label>
                    <input
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={audio.volume}
                      onChange={(e) =>
                        updateAudio(index, "volume", parseFloat(e.target.value))
                      }
                      style={{ padding: "6px 8px", width: "100%" }}
                    />
                  </div>
                </div>
              </div>
            ),
          )}

          <button
            className="add-audio-btn"
            onClick={() => setShowSelector(true)}
          >
            添加音频
          </button>
        </div>
      </div>

      {/* 音频选择对话框 */}
      {showSelector && (
        <div className="audio-selector">
          <div className="audio-selector-content">
            <div className="audio-selector-header">
              <h3>选择音频</h3>
              <button
                className="cancel-btn"
                onClick={() => setShowSelector(false)}
              >
                取消
              </button>
            </div>

            <div className="audio-selector-body">
              <div className="audio-search-fixed">
                <input
                  type="text"
                  placeholder="搜索音频名称或文件路径..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="audio-list-container">
                <div className="audio-list">
                  {filteredAudios.map((audio: Audio) => (
                    <div
                      key={audio.uuid}
                      className={`audio-item ${selectedAudio?.uuid === audio.uuid ? "selected" : ""}`}
                      onClick={() => setSelectedAudio(audio)}
                    >
                      <div className="audio-icon">🎵</div>
                      <div className="audio-info">
                        <div className="audio-name">{audio.name}</div>
                        <div className="audio-path">{audio.path}</div>
                        <div className="audio-duration">时长: 3:45</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="audio-type-selector">
                <label>音频类型</label>
                <select
                  value={audioType}
                  onChange={(e) => setAudioType(e.target.value as AudioType)}
                >
                  <option value={AudioType.BGM}>背景音乐</option>
                  <option value={AudioType.VOICE}>语音</option>
                  <option value={AudioType.SFX}>音效</option>
                </select>
              </div>
            </div>

            <div className="audio-selector-footer">
              <button
                className="confirm-btn"
                onClick={addAudio}
                disabled={!selectedAudio}
              >
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AudioProperties;
