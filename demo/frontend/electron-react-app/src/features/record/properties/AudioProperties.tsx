import React, { useState, useEffect } from "react";
import { Record, Audio, AudioCommand, AudioType } from "@types";
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
    if (searchTerm.trim() === "") setFilteredAudios(audios);
    else
      setFilteredAudios(
        audios.filter(
          (a) =>
            a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            a.path.toLowerCase().includes(searchTerm.toLowerCase()),
        ),
      );
  }, [searchTerm, audios]);

  const fetchAudios = async () => {
    try {
      const data = await ApiService.getAudios();
      setAudios(data);
      setFilteredAudios(data);
    } catch (error) {
      console.error("获取音频列表失败", error);
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
    updateRecord(selectedRecordIndex, {
      ...selectedRecord,
      audioCommands: [...selectedRecord.audioCommands, newAudio],
    });
    setSelectedAudio(null);
    setShowSelector(false);
    setAudioType(AudioType.BGM);
  };

  const deleteAudio = (index: number) => {
    updateRecord(selectedRecordIndex, {
      ...selectedRecord,
      audioCommands: selectedRecord.audioCommands.filter((_, i) => i !== index),
    });
  };

  return (
    <>
      <div className="audio-properties">
        <h4>音效设置</h4>
        <div className="audio-list">
          {selectedRecord.audioCommands.map((audio, index) => (
            <div key={index} className="audio-item">
              <div className="audio-header">
                <h5>
                  {audio.type}: {audio.path}
                </h5>
                <button onClick={() => deleteAudio(index)}>删除</button>
              </div>
            </div>
          ))}
          <button
            className="add-audio-btn"
            onClick={() => setShowSelector(true)}
          >
            添加音频
          </button>
        </div>
      </div>
      {showSelector && (
        <div className="audio-selector">
          <div className="audio-selector-content">
            <div className="audio-selector-header">
              <h3>选择音频</h3>
              <button onClick={() => setShowSelector(false)}>取消</button>
            </div>
            <div className="audio-selector-body">
              <div className="audio-search-fixed">
                <input
                  placeholder="搜索音频名称或文件路径..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="audio-list-container">
                <div className="audio-list">
                  {filteredAudios.map((a) => (
                    <div
                      key={a.uuid}
                      className={`audio-item ${selectedAudio?.uuid === a.uuid ? "selected" : ""}`}
                      onClick={() => setSelectedAudio(a)}
                    >
                      <div className="audio-icon">🎵</div>
                      <div className="audio-info">
                        <div className="audio-name">{a.name}</div>
                        <div className="audio-path">{a.path}</div>
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
              <button onClick={addAudio} disabled={!selectedAudio}>
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
