import React, { useState, useRef, useEffect, useCallback } from "react";
import { Audio, AudioType } from "@types";
import ApiService from "@services/ApiService";
import {
  downloadBlob,
  describeTransferError,
  zipFileName,
  runFileBatch,
  describeBundleImportResult,
  describeBatchAddResult,
  appendRefreshWarning,
  stripFileExtension,
} from "@features/common/utils/resourceTransfer";
import type {
  BatchMessage,
  BatchProgress,
} from "@features/common/utils/resourceTransfer";
import { askConfirm } from "@features/common/components/ConfirmDialog";
import "../ResourceManager.css";
import ResourceBatchStatus from "../ResourceBatchStatus";

/**
 * 当前进行中的批量操作是哪一种。
 *
 * <p>导入资源包与多选添加共用同一条进度 / 结果提示条，只有文案不同
 * （「正在导入音频 2/5」 vs 「正在添加音频 2/5」）。
 */
type BatchKind = "import" | "add";

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
  // 编辑弹窗里的「选择文件」：单个，用来替换当前这条音频
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 「➕ 添加音频」：多选，一次可以加好几个
  const addFileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // ===== 资源包导入 / 多选导出（与「角色」页面保持一致） =====
  const importFileRef = useRef<HTMLInputElement>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedExportIds, setSelectedExportIds] = useState<Set<string>>(
    new Set(),
  );
  const selectAllRef = useRef<HTMLInputElement>(null);
  // 导入/导出/批量添加进行中：按钮置灰，避免重复点击打出多个包 / 重复添加
  const [transferring, setTransferring] = useState(false);

  // 批量操作（导入资源包 / 多选添加）：共用一条进度条与结果提示
  const [batchKind, setBatchKind] = useState<BatchKind>("import");
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [batchMessage, setBatchMessage] = useState<BatchMessage | null>(null);

  // 当前可见的音频（搜索过滤后的结果）：多选与"没勾选就导出全部"都以它为准
  const filteredAudios = audios.filter((audio) =>
    audio.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // 全选复选框的 indeterminate（半选）状态
  useEffect(() => {
    if (selectAllRef.current) {
      const count = selectedExportIds.size;
      selectAllRef.current.indeterminate =
        count > 0 && count < filteredAudios.length;
    }
  }, [selectedExportIds, filteredAudios.length]);

  // 音频列表或搜索词变化时清空勾选，避免把已经看不见的项一起导出
  useEffect(() => {
    setSelectedExportIds(new Set());
  }, [audios.length, searchTerm]);

  // 日志函数
  const log = (message: string, data?: any) => {
    console.log(`[AudiosTab] ${message}`, data);
  };

  /**
   * 从后端重新拉一次音频列表（导入 / 多选添加 / 保存之后都走它）。
   *
   * <p>为什么不用本地列表拼：`audios` 是父组件**按搜索词过滤后**传下来的，
   * 拿它拼新列表会把没显示出来的音频一起丢掉。
   *
   * @returns true 表示刷新失败（本地列表保持原样，调用方自己决定怎么兜底）
   */
  const refreshAudios = useCallback(async (): Promise<boolean> => {
    try {
      setAudios(await ApiService.getAudios());
      return false;
    } catch (error) {
      console.error("刷新音频列表失败:", error);
      return true;
    }
  }, [setAudios]);

  /** 退出多选模式时清空勾选 */
  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedExportIds(new Set());
  };

  /** 切换单个音频的导出勾选状态 */
  const toggleExportSelect = (audioId: string) => {
    setSelectedExportIds((prev) => {
      const next = new Set(prev);
      if (next.has(audioId)) {
        next.delete(audioId);
      } else {
        next.add(audioId);
      }
      return next;
    });
  };

  /** 全选/取消全选（仅作用于当前可见音频） */
  const toggleSelectAll = () => {
    const allSelected =
      filteredAudios.length > 0 &&
      filteredAudios.every((audio) => selectedExportIds.has(audio.uuid));
    if (allSelected) {
      setSelectedExportIds(new Set());
    } else {
      setSelectedExportIds(new Set(filteredAudios.map((audio) => audio.uuid)));
    }
  };

  /** 导出音频 — 优先导出勾选的音频，没有勾选时导出当前列表全部 */
  const handleExportAudios = async () => {
    const ids =
      selectedExportIds.size > 0
        ? Array.from(selectedExportIds)
        : filteredAudios.map((audio) => audio.uuid);
    if (ids.length === 0) {
      alert("没有可导出的音频");
      return;
    }

    setTransferring(true);
    try {
      log("导出音频", ids);
      const blob = await ApiService.exportAudios(ids);
      downloadBlob(blob, zipFileName("audios"));
      alert(`成功导出 ${ids.length} 个音频`);
      exitSelectionMode();
    } catch (error) {
      console.error("导出音频失败:", error);
      alert(describeTransferError(error, "导出音频失败，请重试"));
    } finally {
      setTransferring(false);
    }
  };

  /**
   * 导入音频 — **支持一次选多个资源包**，逐个上传。
   *
   * <p>三个约定（与「序列帧动画」的批量导入一致）：
   * 1. 某个包坏了只记一条失败原因，不影响其它包；
   * 2. 进度显示"第几个 / 共几个 + 正在传哪个包"；
   * 3. 结果放在本页提示条里，不再 alert —— 失败清单可能有好几条，
   *    而且 Electron 里 alert 一关掉就会抢走键盘焦点。
   */
  const handleImportAudios = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // 立刻清空 input：等异步走完再清的话，用户重选同一个文件不会触发 change
    e.target.value = "";
    if (files.length === 0) return;

    setTransferring(true);
    setBatchKind("import");
    setBatchMessage(null);
    try {
      log("导入音频", files.map((file) => file.name));
      const result = await runFileBatch(
        files,
        (file) => ApiService.importAudios(file),
        {
          onProgress: setBatchProgress,
          // 后端返回的 message 优先（"不是 ZIP / 缺清单 / 包为空"都由它说清楚）；
          // 连 message 都没有时（网络断了）至少要有这句兜底。
          fallbackError: "导入失败",
        },
      );
      log("导入音频完成", result);

      // 导入一律按"新增"处理（ID 冲突时后端分配新 ID），本地列表里没有这些新音频，
      // 有包成功就重新拉一次列表；拉列表失败不影响"导入已成功"这个事实。
      let refreshFailed = false;
      if (result.succeededFiles > 0) {
        refreshFailed = await refreshAudios();
      }

      const summary = describeBundleImportResult(result, {
        unit: "个音频",
        bundle: "音频资源包",
      });
      setBatchMessage(appendRefreshWarning(summary, refreshFailed));
    } finally {
      setBatchProgress(null);
      setTransferring(false);
    }
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

  /** 用一首音频打开「添加音频」窗口（名称先取文件名，类型 / 标签还能改） */
  const openNewAudioModal = (file: File) => {
    const draft: Audio = {
      uuid: `audio_${Date.now()}`,
      name: stripFileExtension(file.name) || "新音频",
      // 真正的站内路径要等保存时上传完才有，这里留空
      path: "",
      // 类型没有可靠线索（文件名不一定带 sfx），默认背景音乐，保存后可改
      type: AudioType.BGM,
      tags: [],
    };

    setSelectedAudio(null);
    setAudioFile(file);
    setEditingAudio(draft);
    // 新音频：弹窗标题显示「添加音频」（改已有音频才是「编辑音频」）
    setIsEditing(false);
    setShowAudioModal(true);
    log("打开添加音频窗口", { file: file.name, uuid: draft.uuid });
  };

  /**
   * 「➕ 添加音频」：打开**多选**文件框。
   *
   * <p>选 1 个 → 打开编辑窗口（可以改名称 / 类型 / 标签，和以前一样）；
   * 选多个 → 直接批量添加（名称取文件名、类型默认背景音乐），进度与结果见本页提示条。
   */
  const handleAddAudio = () => {
    log("添加音频（可一次选多个文件）");
    addFileRef.current?.click();
  };

  /**
   * 多个音频文件批量添加：每个单独上传后建一条音频记录。
   *
   * <p>名称取文件名、类型默认「背景音乐」、标签留空；某个坏了只记一条原因，
   * 不影响其它个。
   */
  const addAudiosFromFiles = async (files: File[]) => {
    setTransferring(true);
    setBatchKind("add");
    setBatchMessage(null);
    try {
      log("批量添加音频", files.map((file) => file.name));
      const result = await runFileBatch(
        files,
        async (file, index) => {
          const name = stripFileExtension(file.name) || `音频${index + 1}`;
          const upload = await ApiService.uploadAudioFile(file, name);
          return ApiService.addAudio({
            // 一次加多个时 Date.now() 可能相同，序号兜底保证 uuid 唯一
            uuid: `audio_${Date.now()}_${index}`,
            name,
            path: upload.path,
            type: AudioType.BGM,
            tags: [],
          });
        },
        {
          onProgress: setBatchProgress,
          fallbackError: "添加失败",
        },
      );
      log("批量添加音频完成", result);

      let refreshFailed = false;
      if (result.succeededFiles > 0) {
        refreshFailed = await refreshAudios();
      }

      setBatchMessage(
        appendRefreshWarning(
          describeBatchAddResult(result, {
            unit: "个音频",
            hint: "名称取自文件名、类型默认「背景音乐」，双击条目可改",
          }),
          refreshFailed,
        ),
      );
    } finally {
      setBatchProgress(null);
      setTransferring(false);
    }
  };

  const handleAddAudioFiles = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(e.target.files ?? []);
    // 立刻清空 input：等异步走完再清的话，用户重选同一个文件不会触发 change
    e.target.value = "";
    if (files.length === 0) return;

    if (files.length === 1) {
      openNewAudioModal(files[0]);
      return;
    }

    await addAudiosFromFiles(files);
  };

  const handleEditAudio = (audio: Audio) => {
    log("编辑音频", audio.name);
    setSelectedAudio(audio);
    setEditingAudio({ ...audio });
    // 清掉上一次「添加」残留的文件：换文件只认弹窗里重新点「选择文件」
    setAudioFile(null);
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
        log("音频更新成功", editingAudio.name);
      } else {
        // 添加新音频
        updatedAudio = await ApiService.addAudio(audioToSave);
        log("音频添加成功", editingAudio.name);
      }

      // 刷新列表（不能用本地列表拼：它是父组件按搜索词过滤后的）
      if (await refreshAudios()) {
        const others = audios.filter((a) => a.uuid !== updatedAudio.uuid);
        setAudios([...others, updatedAudio]);
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
    // 用应用内确认框而不是 window.confirm：Electron 的原生对话框关掉后会抢走键盘焦点。
    const confirmed = await askConfirm({
      title: "删除音频",
      message: `确定删除音频「${name}」吗？`,
      detail: "将同时删除数据库记录和磁盘中的音频文件。",
      confirmLabel: "删除",
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      log("删除音频", audioId);
      await ApiService.deleteAudio(audioId);

      // 删完重新拉列表（本地列表是过滤后的，直接 filter 会把没显示出来的一起丢掉）
      if (await refreshAudios()) {
        setAudios(audios.filter((a) => a.uuid !== audioId));
      }

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
    // 取消后不能留着选中的文件：否则下次编辑别的音频会把它上传上去
    setAudioFile(null);
  };

  /**
   * 编辑弹窗里的「选择文件」：给**当前打开的那条音频**换一个文件。
   *
   * <p>真正的站内路径要等点「保存」上传后才有，所以这里只记住 File 对象。
   * 不要在这里拼 path：渲染进程拿不到真实磁盘路径（file.path 在新版 Electron 中可能为空），
   * 而 `AppConfig.resources.audiosBasePath` 是 URL 前缀（/assets/audios），
   * 把它当文件路径用会被后端解析成盘符根目录 C:\assets\audios\...，文件根本不存在。
   */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 立刻清空 input：否则重选同一个文件不会触发 change
    e.target.value = "";
    if (!file) return;

    log("选择音频文件", file.name);
    setAudioFile(file);

    if (editingAudio) {
      // 名称还是默认值（空 / "新音频"）时跟着文件名走；用户改过就尊重用户的
      const name = editingAudio.name;
      setEditingAudio({
        ...editingAudio,
        name: name && name.trim() && name !== "新音频"
          ? name
          : stripFileExtension(file.name),
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

  return (
    <div className="resource-tab">
      <div className="resource-actions">
        <input
          type="text"
          placeholder="搜索音频..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {selectionMode && (
          <label className="select-all-checkbox">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={
                filteredAudios.length > 0 &&
                filteredAudios.every((audio) => selectedExportIds.has(audio.uuid))
              }
              onChange={toggleSelectAll}
            />
            全选
          </label>
        )}

        <button
          className="btn-primary"
          onClick={handleAddAudio}
          disabled={transferring}
          title="可一次选多个音频文件：选 1 个打开编辑窗口（能改名称 / 类型 / 标签），选多个直接批量添加（名称取自文件名、类型默认背景音乐）"
        >
          {batchKind === "add" && batchProgress
            ? `⏳ 添加中 ${Math.min(batchProgress.done + 1, batchProgress.total)}/${batchProgress.total}…`
            : "➕ 添加音频"}
        </button>
        <button
          onClick={() => importFileRef.current?.click()}
          disabled={transferring}
          title="可一次选多个音频资源包（ZIP）：逐个导入并显示进度，某个包坏了不影响其它包"
        >
          {batchKind === "import" && batchProgress
            ? `⏳ 导入中 ${Math.min(batchProgress.done + 1, batchProgress.total)}/${batchProgress.total}…`
            : transferring
              ? "⏳ 处理中…"
              : "📥 导入音频"}
        </button>

        {selectionMode ? (
          <>
            <button onClick={handleExportAudios} disabled={transferring}>
              ✅ 确认导出 ({selectedExportIds.size})
            </button>
            <button onClick={exitSelectionMode} disabled={transferring}>
              ❌ 取消
            </button>
          </>
        ) : (
          <button onClick={() => setSelectionMode(true)} disabled={transferring}>
            📤 选择导出
          </button>
        )}
        <input
          type="file"
          ref={importFileRef}
          style={{ display: "none" }}
          accept=".zip"
          multiple
          aria-label="导入音频资源包（可多选）"
          onChange={handleImportAudios}
        />

        <button onClick={() => openResourceFolder("audios")}>
          📂 打开音频文件夹
        </button>
      </div>

      {/* 批量操作（导入资源包 / 多选添加）的进度与结果 */}
      <ResourceBatchStatus
        progress={batchProgress}
        message={batchMessage}
        label={batchKind === "add" ? "正在添加音频" : "正在导入音频"}
        onDismiss={() => setBatchMessage(null)}
      />

      <div className="audios-list">
        {filteredAudios.map((audio) => (
          <div
            key={audio.uuid}
            className={`audio-item ${selectedAudio?.uuid === audio.uuid ? "selected" : ""}`}
            onClick={() => setSelectedAudio(audio)}
            onDoubleClick={() => handleEditAudio(audio)}
          >
            {selectionMode && (
              // 勾选框单独阻止冒泡，避免点勾选时顺带把条目选中/打开编辑
              <div
                className="audio-item-checkbox"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selectedExportIds.has(audio.uuid)}
                  onChange={() => toggleExportSelect(audio.uuid)}
                />
              </div>
            )}
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

      {/* 「➕ 添加音频」的多选文件框（与导入资源包、弹窗里换文件的 input 都分开） */}
      <input
        type="file"
        ref={addFileRef}
        style={{ display: "none" }}
        accept="audio/*"
        multiple
        aria-label="添加音频：选择文件（可多选）"
        onChange={handleAddAudioFiles}
      />

      {/* 隐藏的文件输入：编辑弹窗里「选择文件」，单个替换当前音频 */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept="audio/*"
        aria-label="编辑音频时选择文件"
        onChange={handleFileSelect}
      />

      {/* 隐藏的音频播放器 */}
      <audio ref={audioRef} style={{ display: "none" }} />
    </div>
  );
};

export default AudiosTab;
