import React, { useState, useRef, useEffect } from "react";
import { Audio, AudioType } from "@types";
import ApiService, { API_BASE_URL } from "@services/ApiService";
import { AppConfig } from '@root/features/common/config/appConfig';
import "../ResourceManager.css";

interface AudiosTabProps {
  audios: Audio[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  openResourceFolder: (
    resourceType: "characters" | "backgrounds" | "audios",
  ) => void;
  setAudios: (audios: Audio[]) => void;
}

const AudiosTab: React.FC<AudiosTabProps> = ({
  audios,
  searchTerm,
  setSearchTerm,
  openResourceFolder,
  setAudios,
}) => {
  const [selectedAudio, setSelectedAudio] = useState<Audio | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingAudio, setEditingAudio] = useState<Audio | null>(null);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  const [audioPlayer, setAudioPlayer] = useState<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // 日志函数
  const log = (message: string, data?: any) => {
    console.log(`[AudiosTab] ${message}`, data);
  };

  useEffect(() => {
    // 初始化音频播放器
    if (audioRef.current && !audioPlayer) {
      const player = audioRef.current;
      player.addEventListener("ended", () => {
        setIsPlaying(null);
      });
      setAudioPlayer(player);
    }
  }, [audioRef.current, audioPlayer]);

  const handleAddAudio = () => {
    log("添加新音频");
    // 创建一个新的音频对象
    const newAudio: Audio = {
      uuid: `audio_${Date.now()}`,
      name: "新音频",
      path: "",
      type: AudioType.BGM,
      tags: [],
    };

    setAudios([...audios, newAudio]);
    setSelectedAudio(newAudio);
    setEditingAudio(newAudio);
    setIsEditing(true);
    setShowAudioModal(true);
  };

  const handleEditAudio = (audio: Audio) => {
    log("编辑音频", audio.name);
    setSelectedAudio(audio);
    setEditingAudio({ ...audio });
    setIsEditing(true);
    setShowAudioModal(true);
  };

  const handleSaveAudio = async () => {
    if (!editingAudio) return;

    try {
      log("保存音频", editingAudio.name);
      let updatedAudio: Audio;

      if (
        editingAudio.uuid &&
        audios.find((a) => a.uuid === editingAudio.uuid)
      ) {
        // 更新现有音频
        updatedAudio = await ApiService.updateAudio(
          editingAudio.uuid,
          editingAudio,
        );
        setAudios(
          audios.map((a) => (a.uuid === editingAudio.uuid ? updatedAudio : a)),
        );
        log("音频更新成功", editingAudio.name);
      } else {
        // 添加新音频
        updatedAudio = await ApiService.addAudio(editingAudio);
        setAudios([...audios, updatedAudio]);
        log("音频添加成功", editingAudio.name);
      }

      setSelectedAudio(updatedAudio);
      setEditingAudio(null);
      setIsEditing(false);
      setShowAudioModal(false);
    } catch (error) {
      console.error("保存音频失败:", error);
      log("音频保存失败", error);
      alert("保存音频失败，请重试");
    }
  };

  const handleDeleteAudio = async (audioId: string) => {
    if (!window.confirm("确定要删除这个音频吗？")) return;

    try {
      log("删除音频", audioId);
      await ApiService.deleteAudio(audioId);

      // 从本地状态中移除音频
      const updatedAudios = audios.filter((a) => a.uuid !== audioId);
      setAudios(updatedAudios);

      // 如果删除的是当前选中的音频，清除选中状态
      if (selectedAudio?.uuid === audioId) {
        setSelectedAudio(null);
      }

      // 如果正在播放被删除的音频，停止播放
      if (isPlaying === audioId && audioPlayer) {
        audioPlayer.pause();
        setIsPlaying(null);
      }

      log("音频删除成功", audioId);
      alert("音频删除成功");
    } catch (error) {
      console.error("删除音频失败:", error);
      log("音频删除失败", error);
      alert("删除音频失败，请重试");
    }
  };

  const handleCancelEditAudio = () => {
    log("取消编辑音频");
    setEditingAudio(null);
    setIsEditing(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    log("选择音频文件", file.name);

    // 在Electron环境中可能存在 file.path 属性
    let filePath = (file as any).path || file.webkitRelativePath || "";
    if (!filePath) {
      // fallback: 将文件放到资源文件夹下的默认位置
      const nameSansExt = file.name.replace(/\.[^/.]+$/, "");
      const extMatch = file.name.match(/\.([0-9a-zA-Z]+)$/);
      const ext = extMatch ? extMatch[1] : "";
      filePath = `${AppConfig.resources.audiosBasePath}/${nameSansExt}_${Date.now()}${ext ? `.${ext}` : ""}`;
    }

    // 更新编辑中的音频路径和名称
    if (editingAudio) {
      setEditingAudio({
        ...editingAudio,
        path: filePath,
        name: file.name.replace(/\.[^/.]+$/, ""), // 移除文件扩展名
      });
    }
  };

  const handlePlayAudio = (audio: Audio) => {
    if (!audioPlayer) return;

    if (isPlaying === audio.uuid) {
      // 如果正在播放，则暂停
      audioPlayer.pause();
      setIsPlaying(null);
      log("暂停音频", audio.name);
    } else {
      // 播放音频 - 使用API端点获取音频文件
      const audioUrl = `${API_BASE_URL}/audios/${audio.uuid}/file`;
      audioPlayer.src = audioUrl;
      audioPlayer.play().catch((error) => {
        console.error("播放音频失败:", error);
        log("音频播放失败", { audio: audio.name, error });
      });
      setIsPlaying(audio.uuid);
      log("播放音频", audio.name);
    }
  };

  const filteredAudios = audios.filter((audio) =>
    audio.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="resource-tab">
      <div className="resource-actions">
        <input
          type="text"
          placeholder="搜索音频..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button onClick={() => openResourceFolder("audios")}>
          打开音频文件夹
        </button>
        <button className="btn-primary" onClick={handleAddAudio}>
          添加音频
        </button>
      </div>

      <div className="audios-list">
        {filteredAudios.map((audio) => (
          <div
            key={audio.uuid}
            className={`audio-item ${selectedAudio?.uuid === audio.uuid ? "selected" : ""}`}
            onClick={() => setSelectedAudio(audio)}
            onDoubleClick={() => handleEditAudio(audio)}
          >
            <div className="audio-info">
              <h3>{audio.name}</h3>
              <p>类型: {audio.type === "bgm" ? "背景音乐" : "音效"}</p>
              <p>路径: {audio.path}</p>
              {audio.tags && audio.tags.length > 0 && (
                <div className="audio-tags">
                  {audio.tags.map((tag, index) => (
                    <span key={index} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="audio-controls">
              <button
                className={isPlaying === audio.uuid ? "playing" : ""}
                onClick={() => handlePlayAudio(audio)}
              >
                {isPlaying === audio.uuid ? "暂停" : "播放"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 音频编辑弹窗 */}
      {showAudioModal && editingAudio && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{isEditing ? "编辑音频" : "添加音频"}</h2>
              <button className="close-btn" onClick={handleCancelEditAudio}>
                ×
              </button>
            </div>
            <div className="modal-content">
              <div className="form-group">
                <label>音频名称</label>
                <input
                  type="text"
                  value={editingAudio.name || ""}
                  onChange={(e) =>
                    setEditingAudio({
                      ...editingAudio,
                      name: e.target.value,
                    })
                  }
                />
              </div>
              <div className="form-group">
                <label>音频路径</label>
                <div className="file-input-container">
                  <input
                    type="text"
                    value={editingAudio.path || ""}
                    onChange={(e) =>
                      setEditingAudio({
                        ...editingAudio,
                        path: e.target.value,
                      })
                    }
                    readOnly
                  />
                  <button
                    className="file-select-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    选择文件
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>音频类型</label>
                <select
                  value={editingAudio.type || "bgm"}
                  onChange={(e) =>
                    setEditingAudio({
                      ...editingAudio,
                      type: e.target.value as AudioType,
                    })
                  }
                >
                  <option value={AudioType.BGM}>背景音乐</option>
                  <option value={AudioType.SFX}>音效</option>
                </select>
              </div>
              <div className="form-group">
                <label>标签</label>
                <input
                  type="text"
                  value={editingAudio.tags ? editingAudio.tags.join(", ") : ""}
                  onChange={(e) =>
                    setEditingAudio({
                      ...editingAudio,
                      tags: e.target.value
                        .split(",")
                        .map((tag) => tag.trim())
                        .filter((tag) => tag.length > 0),
                    })
                  }
                  placeholder="用逗号分隔多个标签"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={handleCancelEditAudio}>
                取消
              </button>
              <button className="btn-primary" onClick={handleSaveAudio}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 隐藏的文件输入 */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept="audio/*"
        onChange={handleFileSelect}
      />

      {/* 隐藏的音频播放器 */}
      <audio ref={audioRef} style={{ display: "none" }} />
    </div>
  );
};

export default AudiosTab;
