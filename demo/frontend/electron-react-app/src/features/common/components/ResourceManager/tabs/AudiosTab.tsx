import React, { useState, useRef, useEffect } from "react";
import { Audio, AudioType } from "@types";
import ApiService from "@services/ApiService";
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
    // 创建一个新的音频对象（暂不加入 audios 列表，等保存成功后再添加）
    const newAudio: Audio = {
      uuid: `audio_${Date.now()}`,
      name: "新音频",
      path: "",
      type: AudioType.BGM,
      tags: [],
    };

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
      const audioToSave = { ...editingAudio };

      // 1) 若用户选了新文件 → 先上传到后端（后端保存到 {数据目录}/assets/audios）
      //    以前这里直接用浏览器拿到的本地路径或自己拼的 /assets/... 当文件路径入库，
      //    文件从未落盘，播放与导出都取不到音频。
      if (audioFile) {
        log("检测到新选择的音频文件，开始上传", audioFile.name);
        const uploadResp = await ApiService.uploadAudioFile(
          audioFile,
          audioToSave.name,
        );
        log("音频上传完成", uploadResp);
        audioToSave.path = uploadResp.path;
      }

      // 音频必须有真实文件才能用于渲染/播放
      if (!audioToSave.path || audioToSave.path.trim() === "") {
        alert("请先选择音频文件再保存");
        return;
      }

      if (
        editingAudio.uuid &&
        audios.find((a) => a.uuid === editingAudio.uuid)
      ) {
        // 更新现有音频
        updatedAudio = await ApiService.updateAudio(
          editingAudio.uuid,
          audioToSave,
        );
        setAudios(
          audios.map((a) => (a.uuid === editingAudio.uuid ? updatedAudio : a)),
        );
        log("音频更新成功", editingAudio.name);
      } else {
        // 添加新音频
        updatedAudio = await ApiService.addAudio(audioToSave);
        setAudios([...audios, updatedAudio]);
        log("音频添加成功", editingAudio.name);
      }

      setSelectedAudio(updatedAudio);
      setEditingAudio(null);
      setIsEditing(false);
      setShowAudioModal(false);
      setAudioFile(null);
    } catch (error) {
      console.error("保存音频失败:", error);
      log("音频保存失败", error);
      alert("保存音频失败，请重试");
    }
  };

  const handleDeleteAudio = async (audioId: string) => {
    const audio = audios.find((a) => a.uuid === audioId);
    const name = audio?.name || "该音频";

    // 整个删除流程只有这一个弹窗：确认后连磁盘上的音频文件一起删除。
    if (
      !window.confirm(
        `确定删除音频「${name}」吗？\n\n将同时删除数据库记录和磁盘中的音频文件。`,
      )
    ) {
      return;
    }

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

    // 只记住 File 对象，真正落盘交给后端 /api/audios/upload。
    // 注意：不要在这里拼 path。渲染进程拿不到真实磁盘路径（file.path 在新版 Electron 中
    // 可能为空），而 AppConfig.resources.audiosBasePath 是 URL 前缀（/assets/audios），
    // 把它当文件路径用会被后端解析成盘符根目录 C:\assets\audios\...，文件根本不存在。
    setAudioFile(file);

    if (editingAudio) {
      setEditingAudio({
        ...editingAudio,
        name: editingAudio.name && editingAudio.name !== "新音频"
          ? editingAudio.name
          : file.name.replace(/\.[^/.]+$/, ""),
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
      // 播放音频 - 直接用静态资源 URL（path 形如 /assets/audios/xxx.mp3）
      // 不再走 /api/audios/{uuid}/file：静态映射始终指向真实的素材目录，
      // 而历史数据里存的本地绝对路径在渲染进程里根本取不到文件。
      const audioUrl = ApiService.getAudioPlaybackUrl(audio.path);
      if (!audioUrl) {
        alert("该音频没有可用的文件，请重新选择音频文件并保存");
        return;
      }
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
            {/* 悬浮在条目右上角的操作按钮，与「背景」页面的卡片保持一致 */}
            <div className="card-hover-actions">
              <button
                className="card-action-btn card-delete-btn"
                title="删除音频"
                onClick={(e) => {
                  // 阻止冒泡，避免同时触发条目的「选中」与「双击编辑」
                  e.stopPropagation();
                  handleDeleteAudio(audio.uuid);
                }}
              >
                🗑 删除
              </button>
            </div>
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
