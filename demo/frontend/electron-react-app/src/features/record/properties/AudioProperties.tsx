import React, { useState, useEffect } from "react";
import { Record, Audio, AudioCommand, AudioType } from "@types";
import ApiService from "@services/ApiService";
import { askConfirm } from "@features/common/components/ConfirmDialog";
import ModalPortal from "./ModalPortal";
import {
  normalizeIndexes,
  useBatchSelection,
} from "./batchSelection";
import {
  BatchCardCheckbox,
  BatchSelectionBar,
} from "./BatchSelectionBar";
import "../RecordEditor.css";
import "./AudioProperties.css";

interface AudioPropertiesProps {
  selectedRecord: Record;
  selectedRecordIndex: number;
  updateRecord: (index: number, updatedRecord: Record) => void;
}

/**
 * 「音效」页签。
 *
 * <p>音频不参与预览画面的元素高亮（预览里没有"声音的位置"），所以这里只接
 * **批量勾选删除**：勾选框 + 顶部「全选 / 批量删除」，与其它三个素材页签同一套交互。
 */
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

  const currentAudioCommands = selectedRecord.audioCommands || [];
  // 批量删除的选中态（音频与预览不联动，只这一套状态）
  const batch = useBatchSelection(
    currentAudioCommands.length,
    selectedRecord.uuid,
  );

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

  const addAudio = (audio?: Audio) => {
    const target = audio || selectedAudio;
    if (!target) {
      alert("请选择音频");
      return;
    }
    const newAudio: AudioCommand = {
      type: audioType,
      path: target.path,
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

  // 双击直接添加音频（同时选中并关闭选择弹窗），无需再点“确认添加”
  const handleAudioDoubleClick = (audio: Audio) => {
    setSelectedAudio(audio);
    addAudio(audio);
  };

  /**
   * @function 删除音频指令（单个「删除」按钮与批量删除共用）
   *
   * <p>音频只是记录里的播放指令（素材文件仍在资源管理里），所以和单条删除一样：
   * 过滤掉这些下标后一次写回 `updateRecord`。删除后清空批量勾选。
   *
   * @param indexes 要删掉的下标（重复 / 越界会被忽略）
   */
  const removeAudios = (indexes: number[]) => {
    const removed = normalizeIndexes(indexes, currentAudioCommands.length);
    if (removed.length === 0) return;
    const removedSet = new Set(removed);
    updateRecord(selectedRecordIndex, {
      ...selectedRecord,
      audioCommands: currentAudioCommands.filter((_, i) => !removedSet.has(i)),
    });
    batch.clear();
  };

  /** @function 删除一条音频（卡片上的「删除」按钮） */
  const deleteAudio = (index: number) => {
    removeAudios([index]);
  };

  /** @function 批量删除勾选的音频（先二次确认） */
  const handleBatchDelete = async () => {
    const removed = batch.indexes;
    if (removed.length === 0) return;
    const confirmed = await askConfirm({
      title: "批量删除音效",
      message: `确定删除选中的 ${removed.length} 条音频吗？`,
      detail:
        "只删除这条记录里的播放指令，音频素材仍保留在「资源管理 → 音效」里，可随时再加回来。",
      confirmLabel: "删除",
      danger: true,
    });
    if (!confirmed) return;
    removeAudios(removed);
  };

  return (
    <>
      <div className="audio-properties">
        <h4>音效设置</h4>
        {/* 批量删除工具条：勾选后才出现「批量删除」 */}
        <BatchSelectionBar
          label="音效"
          total={currentAudioCommands.length}
          selectedCount={batch.count}
          onToggleAll={batch.toggleAll}
          onClear={batch.clear}
          onDelete={handleBatchDelete}
        />
        <div className="audio-list">
          {currentAudioCommands.map((audio, index) => (
            <div
              key={index}
              className={`audio-item${
                batch.has(index) ? " visual-card-batch-selected" : ""
              }`}
            >
              <div className="audio-header">
                <div className="audio-heading">
                  {/* 勾选框只负责批量删除 */}
                  <BatchCardCheckbox
                    checked={batch.has(index)}
                    label={`选择音效 ${index + 1}`}
                    onToggle={() => batch.toggle(index)}
                  />
                  <h5>
                    {audio.type}: {audio.path}
                  </h5>
                </div>
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
      {/* 选择音频弹窗：挂到 body（ModalPortal），否则会被停靠面板的层叠上下文盖住 */}
      {showSelector && (
        <ModalPortal
          label="选择音频"
          onClose={() => setShowSelector(false)}
          overlayClassName="audio-selector"
          dialogClassName="audio-selector-content"
        >
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
                    onDoubleClick={() => handleAudioDoubleClick(a)}
                    title="双击直接添加该音频"
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
            <span className="audio-selector-hint">双击列表项可直接添加</span>
            <button onClick={() => addAudio()} disabled={!selectedAudio}>
              确认添加
            </button>
          </div>
        </ModalPortal>
      )}
    </>
  );
};

export default AudioProperties;
