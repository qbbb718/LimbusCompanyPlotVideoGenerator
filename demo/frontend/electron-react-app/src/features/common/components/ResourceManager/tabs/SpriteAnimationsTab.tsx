/**
 * @component 资源管理 → 序列帧动画
 *
 * 序列帧动画的**制作与配置入口**：导入帧序列、调每帧持续时间与播放参数、摆放代表帧。
 *
 * 剧情编辑页只负责"选哪一段"（见 `EmotionAnimPicker`），所有编排都在这里，
 * 这样同一段动画能被多条记录、多个角色复用。
 *
 * <h3>编辑器为什么用本地草稿 + 防抖保存</h3>
 * 代表帧是在预览里**拖动**摆出来的，那会产生几十上百次坐标变化；每次变化都打一次
 * `PUT /api/animation-clips/{id}` 会明显卡顿。所以本地先改（预览实时跟随），
 * 停手 700ms 后再落库；顶部有"保存中/已保存"状态，另留一个手动保存按钮兜底。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import log from "electron-log";

import ApiService from "@services/ApiService";
import type { Background, MyCharacter } from "@types";
import {
  ANIMATION_CLIP_MAX_TOTAL_FRAMES,
  LOOP_MODE_LABELS,
  normalizeFrameHolds,
  totalFramesOf,
} from "@features/record/animation/animationClipAsset";
import type { AnimationClipDto, AnimationClipPoster } from "@features/record/animation/animationClipAsset";
import { useAnimationClipLibrary } from "@features/record/animation/useAnimationClipLibrary";
import { preloadClipFrames } from "@features/record/animation/framePreloader";
import type { LoopMode } from "@features/record/animation/animationTypes";
import SpriteAnimationPreview from "./SpriteAnimationPreview";
import "./SpriteAnimationsTab.css";

interface SpriteAnimationsTabProps {
  characters: MyCharacter[];
  backgrounds: Background[];
  searchTerm: string;
  setSearchTerm: (value: string) => void;
}

/** 可编辑的动画草稿（= 素材的可改字段） */
interface ClipDraft {
  name: string;
  frameHolds: number[];
  loop: LoopMode;
  iterations: number | null;
  startFrame: number;
  fadeInFrames: number;
  fadeOutFrames: number;
  opacity: number;
  poster: AnimationClipPoster;
}

const draftOf = (clip: AnimationClipDto): ClipDraft => ({
  name: clip.name ?? "",
  frameHolds: [...(clip.frameHolds ?? [])],
  loop: (clip.loop ?? "once") as LoopMode,
  iterations: clip.iterations ?? null,
  startFrame: clip.startFrame ?? 0,
  fadeInFrames: clip.fadeInFrames ?? 0,
  fadeOutFrames: clip.fadeOutFrames ?? 0,
  opacity: clip.opacity ?? 1,
  poster: {
    frame: clip.poster?.frame ?? 0,
    offsetX: clip.poster?.offsetX ?? 0,
    offsetY: clip.poster?.offsetY ?? 0,
    scale: clip.poster?.scale ?? 1,
  },
});

/** 保存状态：给用户一个"到底存了没"的确定感 */
type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

/** 「按文件名编号推算时长」开关的持久化 key（默认开，记住用户的选择） */
const AUTO_HOLDS_STORAGE_KEY = "lbc.animation.autoHolds";

/** 读开关：读不到 / localStorage 不可用时按"开启"处理 */
const loadAutoHolds = (): boolean => {
  try {
    return window.localStorage.getItem(AUTO_HOLDS_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
};

const saveAutoHolds = (value: boolean): void => {
  try {
    window.localStorage.setItem(AUTO_HOLDS_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // 隐私模式/存储被禁：开关只在本次会话生效，不影响功能
  }
};

const SpriteAnimationsTab: React.FC<SpriteAnimationsTabProps> = ({
  characters,
  backgrounds,
  searchTerm,
  setSearchTerm,
}) => {
  const library = useAnimationClipLibrary();
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState<ClipDraft | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [bulkHold, setBulkHold] = useState(1);
  /** 是否按文件名编号自动推算每帧时长（默认开；导入时作为参数发给后端） */
  const [autoHolds, setAutoHolds] = useState<boolean>(() => loadAutoHolds());
  /** 预览正在播放：此时锁住代表帧的偏移/缩放输入（拖拽在预览里也已锁） */
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleAutoHolds = (next: boolean) => {
    setAutoHolds(next);
    saveAutoHolds(next);
  };

  const clips = library.clips;
  const selected = clips.find((clip) => clip.id === selectedId);

  /* 选中项变化（或列表刷新后首次拿到数据）时同步草稿 */
  useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }
    // 只有"换了素材"或"还没草稿"时才覆盖草稿，避免每次列表刷新把正在编辑的内容冲掉
    if (!draft || selectedId !== selected.id || saveState === "saved") {
      setDraft(draftOf(selected));
      setSaveState("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selected?.id, selected?.frameHolds?.length]);

  // 列表加载完后默认选第一套
  useEffect(() => {
    if (!selectedId && clips.length > 0) setSelectedId(clips[0].id);
  }, [clips, selectedId]);

  const filtered = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return clips;
    return clips.filter((clip) => (clip.name ?? "").toLowerCase().includes(keyword));
  }, [clips, searchTerm]);

  /* ==================== 保存 ==================== */

  const persist = useCallback(
    async (clipId: string, next: ClipDraft) => {
      setSaveState("saving");
      try {
        await ApiService.updateAnimationClip(clipId, {
          name: next.name,
          frameHolds: next.frameHolds,
          loop: next.loop,
          iterations: next.iterations ?? 0,
          startFrame: next.startFrame,
          fadeInFrames: next.fadeInFrames,
          fadeOutFrames: next.fadeOutFrames,
          opacity: next.opacity,
          poster: next.poster,
        } as any);
        setSaveState("saved");
        // 拉新列表，顺带让剧情编辑页的选择器看到最新名字
        library.reload();
      } catch (error: any) {
        setSaveState("error");
        setMessage({
          kind: "error",
          text: error?.response?.data?.message || error?.message || "保存失败",
        });
      }
    },
    [library],
  );

  /** 改草稿：本地立刻生效（预览实时跟），停手后再落库 */
  const updateDraft = useCallback(
    (patch: Partial<ClipDraft>) => {
      setDraft((previous) => {
        if (!previous || !selectedId) return previous;
        const next = { ...previous, ...patch };
        if (saveTimer.current) clearTimeout(saveTimer.current);
        setSaveState("pending");
        saveTimer.current = setTimeout(() => {
          void persist(selectedId, next);
        }, 700);
        return next;
      });
    },
    [selectedId, persist],
  );

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const saveNow = () => {
    if (!draft || !selectedId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    void persist(selectedId, draft);
  };

  /* ==================== 导入 / 删除 ==================== */

  const fileOfPath = async (filePath: string): Promise<File> => {
    const api: any = (window as any).electronAPI;
    const buffer = await api.readFile(filePath);
    const name = filePath.split(/[\\/]/).pop() || "frame.png";
    return new File([new Uint8Array(buffer)], name, { type: "application/octet-stream" });
  };

  const importFromPaths = async (filePaths: string[]) => {
    const files = await Promise.all(filePaths.map(fileOfPath));
    const result = await ApiService.importAnimationClips(files, undefined, {
      inferHolds: autoHolds,
    });
    library.reload();
    setSelectedId(result.asset.id);
    setDraft(draftOf(result.asset));
    setSaveState("idle");
    setMessage({
      kind: "info",
      text: `已创建「${result.asset.name}」（${result.asset.frameCount} 张图，共 ${result.asset.totalFrames} 帧）${
        result.warnings?.length ? "；" + result.warnings.join("；") : ""
      }`,
    });
  };

  const handleImportImages = async () => {
    const api: any = (window as any).electronAPI;
    if (!api?.openImageFiles) {
      setMessage({ kind: "error", text: "当前环境不支持选择本地图片" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const picked = await api.openImageFiles();
      if (picked?.canceled || !picked?.filePaths?.length) return;
      await importFromPaths(picked.filePaths);
    } catch (error: any) {
      setMessage({ kind: "error", text: error?.response?.data?.message || error?.message || "导入失败" });
      log.error("[序列帧动画] 导入图片失败:", error);
    } finally {
      setBusy(false);
    }
  };

  const handleImportFolder = async () => {
    const api: any = (window as any).electronAPI;
    if (!api?.openImageFolder) {
      setMessage({ kind: "error", text: "当前环境不支持选择文件夹" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const picked = await api.openImageFolder();
      if (picked?.canceled) return;
      if (picked?.error) {
        setMessage({ kind: "error", text: picked.error });
        return;
      }
      if (!picked?.filePaths?.length) return;
      await importFromPaths(picked.filePaths);
    } catch (error: any) {
      setMessage({ kind: "error", text: error?.response?.data?.message || error?.message || "导入失败" });
      log.error("[序列帧动画] 导入文件夹失败:", error);
    } finally {
      setBusy(false);
    }
  };

  const handleImportFile = async () => {
    const api: any = (window as any).electronAPI;
    if (!api?.openAnimationClip) {
      setMessage({ kind: "error", text: "当前环境不支持导入动画文件" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const picked = await api.openAnimationClip();
      if (picked?.canceled || !picked?.filePath) return;
      const file = await fileOfPath(picked.filePath);
      const result = await ApiService.importAnimationClipZip(file, undefined, { inferHolds: autoHolds });
      library.reload();
      setSelectedId(result.asset.id);
      setDraft(draftOf(result.asset));
      setMessage({
        kind: "info",
        text: `已导入「${result.asset.name}」（${result.asset.frameCount} 张图，共 ${result.asset.totalFrames} 帧）${
          result.warnings?.length ? "；" + result.warnings.join("；") : ""
        }`,
      });
    } catch (error: any) {
      setMessage({ kind: "error", text: error?.response?.data?.message || error?.message || "导入失败" });
      log.error("[序列帧动画] 导入动画文件失败:", error);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (clip: AnimationClipDto) => {
    if (!window.confirm(`删除动画「${clip.name}」？引用它的记录将不再显示这段动画（记录本身不会损坏）。`)) {
      return;
    }
    setBusy(true);
    try {
      await ApiService.deleteAnimationClip(clip.id);
      library.reload();
      if (selectedId === clip.id) {
        setSelectedId("");
        setDraft(null);
      }
      setMessage({ kind: "info", text: `已删除「${clip.name}」` });
    } catch (error: any) {
      setMessage({ kind: "error", text: error?.response?.data?.message || error?.message || "删除失败" });
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async (clip: AnimationClipDto) => {
    const api: any = (window as any).electronAPI;
    if (!api?.chooseSavePath) {
      setMessage({ kind: "error", text: "当前环境不支持导出到文件" });
      return;
    }
    try {
      const picked = await api.chooseSavePath({
        title: "导出动画文件",
        defaultPath: `${clip.name || clip.id}.lcaf`,
        filters: [{ name: "动画文件 (lcaf)", extensions: ["lcaf"] }],
      });
      if (picked?.canceled || !picked?.filePath) return;
      const result = await ApiService.exportAnimationClip(clip.id, picked.filePath);
      setMessage({ kind: "info", text: `已导出 ${result.frameCount} 帧到 ${result.filePath}` });
    } catch (error: any) {
      setMessage({ kind: "error", text: error?.response?.data?.message || error?.message || "导出失败" });
    }
  };

  /* 帧图预热：编辑器里会循环试播，不预热会闪白 */
  useEffect(() => {
    if (selected) preloadClipFrames(selected.id, selected.frameHolds.length);
  }, [selected?.id, selected?.frameHolds?.length]);

  /* ==================== 渲染 ==================== */

  const frames = draft?.frameHolds ?? [];
  const totals = totalFramesOf(frames);
  const frameCount = frames.length;

  return (
    <div className="sprite-anim-tab">
      <div className="sprite-anim-list">
        <div className="sprite-anim-list-head">
          <input
            type="search"
            placeholder="搜索动画名称"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="搜索序列帧动画"
          />
        </div>
        <div className="sprite-anim-list-actions">
          <button type="button" className="btn-primary" disabled={busy} onClick={handleImportImages}>
            新建（选图片）
          </button>
          <button type="button" disabled={busy} onClick={handleImportFolder}>
            从文件夹
          </button>
          <button type="button" disabled={busy} onClick={handleImportFile}>
            导入 .lcaf
          </button>
        </div>
        <label
          className="sprite-anim-auto-holds"
          title="按文件名里的编号推算每张图停多少帧：xxx_1/2/3/7/9 → 1/1/4/2 帧（最后一张用默认 1 帧）"
        >
          <input
            type="checkbox"
            checked={autoHolds}
            onChange={(e) => toggleAutoHolds(e.target.checked)}
            aria-label="按文件名编号自动推算时长"
          />
          按文件名编号推算时长
        </label>

        <div className="sprite-anim-list-body">
          {library.loading && <div className="global-hint">加载中…</div>}
          {!library.loading && filtered.length === 0 && (
            <div className="global-hint">
              {clips.length > 0
                ? `没有匹配「${searchTerm.trim()}」的动画。`
                : "还没有动画。点「新建（选图片）」选一批 PNG/JPG 序列帧即可创建。"}
            </div>
          )}
          {filtered.map((clip) => (
            <div
              key={clip.id}
              className={`sprite-anim-card${clip.id === selectedId ? " is-selected" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedId(clip.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setSelectedId(clip.id);
              }}
              title={clip.missingFrames ? "有缺帧，成片里缺的部分不会显示" : clip.name}
            >
              <img src={ApiService.getAnimationClipFrameUrl(clip.id, 0)} alt="" />
              <div className="sprite-anim-card-meta">
                <strong>{clip.name}</strong>
                <span>
                  {clip.frameCount} 张 · {clip.totalFrames} 帧
                  {clip.missingFrames ? " · ⚠ 缺帧" : ""}
                </span>
              </div>
            </div>
          ))}
        </div>

        {message && (
          <div
            className={`sprite-anim-message${message.kind === "error" ? " is-error" : ""}`}
            role={message.kind === "error" ? "alert" : "status"}
          >
            {message.text}
          </div>
        )}
      </div>

      <div className="sprite-anim-editor">
        {!draft || !selected ? (
          <div className="global-hint">
            左侧选一套动画来编辑；或点「新建（选图片）」导入一批序列帧。
          </div>
        ) : (
          <>
            <div className="sprite-anim-editor-head">
              <input
                className="sprite-anim-name"
                value={draft.name}
                aria-label="动画名称"
                onChange={(e) => updateDraft({ name: e.target.value })}
              />
              <span className={`sprite-anim-save is-${saveState}`}>
                {saveState === "pending" && "未保存…"}
                {saveState === "saving" && "保存中…"}
                {saveState === "saved" && "已保存"}
                {saveState === "error" && "保存失败"}
                {saveState === "idle" && ""}
              </span>
              <button type="button" onClick={saveNow} disabled={saveState === "saving"}>
                保存
              </button>
              <button type="button" onClick={() => handleExport(selected)}>
                导出 .lcaf
              </button>
              <button type="button" onClick={() => handleDelete(selected)}>
                删除
              </button>
            </div>

            <div className="sprite-anim-columns">
              <div className="sprite-anim-settings">
                {/* 播放参数 */}
                <section>
                  <h4>播放参数</h4>
                  <div className="char-row">
                    <span className="char-label-fixed">播放</span>
                    <select
                      value={draft.loop}
                      aria-label="播放模式"
                      onChange={(e) => updateDraft({ loop: e.target.value as LoopMode })}
                    >
                      {LOOP_MODE_LABELS.map((item) => (
                        <option key={item.value} value={item.value} title={item.hint}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    {(draft.loop === "loop" || draft.loop === "pingpong") && (
                      <>
                        <span className="char-label-fixed">次数</span>
                        <input
                          type="number"
                          min={0}
                          placeholder="0=无限"
                          value={draft.iterations ?? 0}
                          aria-label="循环次数"
                          onChange={(e) => {
                            const value = Math.max(0, Math.round(Number(e.target.value) || 0));
                            updateDraft({ iterations: value > 0 ? value : null });
                          }}
                        />
                      </>
                    )}
                    <span className="char-label-fixed">帧率</span>
                    <span className="sprite-anim-readonly">{selected.fps} fps（固定）</span>
                  </div>
                  <div className="char-row">
                    <span className="char-label-fixed">开始(帧)</span>
                    <input
                      type="number"
                      min={0}
                      value={draft.startFrame}
                      aria-label="开始帧"
                      onChange={(e) =>
                        updateDraft({ startFrame: Math.max(0, Math.round(Number(e.target.value) || 0)) })
                      }
                    />
                    <span className="char-label-fixed">不透明度</span>
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={draft.opacity}
                      aria-label="整体不透明度"
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (Number.isFinite(value)) {
                          updateDraft({ opacity: Math.min(1, Math.max(0, value)) });
                        }
                      }}
                    />
                  </div>
                  {/* 淡入、淡出**各自独立**：两行两套控件，互不影响 */}
                  <div className="char-row">
                    <span className="char-label-fixed">淡入(帧)</span>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(1, Math.min(120, frameCount > 0 ? totals : 120))}
                      value={draft.fadeInFrames}
                      aria-label="淡入帧数滑块"
                      onChange={(e) => updateDraft({ fadeInFrames: Number(e.target.value) })}
                      className="char-slider-auto"
                    />
                    <input
                      type="number"
                      min={0}
                      value={draft.fadeInFrames}
                      aria-label="淡入帧数"
                      onChange={(e) =>
                        updateDraft({ fadeInFrames: Math.max(0, Math.round(Number(e.target.value) || 0)) })
                      }
                    />
                    <span className="sprite-anim-readonly">开头几帧从透明淡到不透明</span>
                  </div>
                  <div className="char-row">
                    <span className="char-label-fixed">淡出(帧)</span>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(1, Math.min(120, frameCount > 0 ? totals : 120))}
                      value={draft.fadeOutFrames}
                      disabled={draft.loop === "loop" || draft.loop === "pingpong"}
                      aria-label="淡出帧数滑块"
                      onChange={(e) => updateDraft({ fadeOutFrames: Number(e.target.value) })}
                      className="char-slider-auto"
                    />
                    <input
                      type="number"
                      min={0}
                      value={draft.fadeOutFrames}
                      disabled={draft.loop === "loop" || draft.loop === "pingpong"}
                      aria-label="淡出帧数"
                      onChange={(e) =>
                        updateDraft({ fadeOutFrames: Math.max(0, Math.round(Number(e.target.value) || 0)) })
                      }
                    />
                    <span className="sprite-anim-readonly">
                      {draft.loop === "loop" || draft.loop === "pingpong"
                        ? "循环/往返模式下强制为 0（否则每轮接缝一淡一显）"
                        : "最后几帧从当前不透明度淡到全透明"}
                    </span>
                  </div>
                  {(draft.loop === "loop" || draft.loop === "pingpong") && (
                    <div className="global-hint">
                      循环/往返模式下淡出被强制为 0（否则每轮接缝会一淡一显）。
                    </div>
                  )}
                </section>

                {/* 代表帧 */}
                <section>
                  <h4>代表帧</h4>
                  <div className="global-hint">
                    静止预览（剧情编辑里那张不动的图）显示这一张。位置与大小在右侧预览里拖动/滚轮调整。
                  </div>
                  <div className="char-row">
                    <span className="char-label-fixed">第几张</span>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, frameCount - 1)}
                      value={Math.min(draft.poster.frame, Math.max(0, frameCount - 1))}
                      aria-label="代表帧序号"
                      onChange={(e) =>
                        updateDraft({ poster: { ...draft.poster, frame: Number(e.target.value) } })
                      }
                      className="char-slider-auto"
                    />
                    <input
                      type="number"
                      min={0}
                      max={Math.max(0, frameCount - 1)}
                      value={Math.min(draft.poster.frame, Math.max(0, frameCount - 1))}
                      aria-label="代表帧编号"
                      onChange={(e) =>
                        updateDraft({
                          poster: {
                            ...draft.poster,
                            frame: Math.min(
                              Math.max(0, frameCount - 1),
                              Math.max(0, Math.round(Number(e.target.value) || 0)),
                            ),
                          },
                        })
                      }
                    />
                  </div>
                  <div className="char-row">
                    <span
                      className="char-label-fixed"
                      title="单位是头部长度：1.0 = 一个头宽；播放中锁定，暂停/停止后可改"
                    >
                      偏移 X/Y（头宽）
                    </span>
                    <input
                      type="number"
                      step={0.01}
                      disabled={previewPlaying}
                      value={Number((draft.poster.offsetX ?? 0).toFixed(3))}
                      aria-label="代表帧水平偏移"
                      onChange={(e) =>
                        updateDraft({
                          poster: { ...draft.poster, offsetX: Number(e.target.value) || 0 },
                        })
                      }
                    />
                    <input
                      type="number"
                      step={0.01}
                      disabled={previewPlaying}
                      value={Number((draft.poster.offsetY ?? 0).toFixed(3))}
                      aria-label="代表帧垂直偏移"
                      onChange={(e) =>
                        updateDraft({
                          poster: { ...draft.poster, offsetY: Number(e.target.value) || 0 },
                        })
                      }
                    />
                    <span className="char-label-fixed">缩放</span>
                    <input
                      type="number"
                      min={0.01}
                      max={20}
                      step={0.05}
                      disabled={previewPlaying}
                      value={Number((draft.poster.scale ?? 1).toFixed(3))}
                      aria-label="代表帧缩放"
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (Number.isFinite(value) && value > 0) {
                          updateDraft({ poster: { ...draft.poster, scale: value } });
                        }
                      }}
                    />
                    {previewPlaying && (
                      <span className="sprite-anim-readonly">播放中已锁定，暂停/停止后可调</span>
                    )}
                  </div>
                </section>

                {/* 每帧持续帧数 */}
                <section>
                  <h4>
                    帧序列（{frameCount} 张 · 共 {totals} 帧 · {(totals / 30).toFixed(2)} 秒）
                  </h4>
                  <div className="char-row">
                    <span className="char-label-fixed">全部设为</span>
                    <input
                      type="number"
                      min={1}
                      max={300}
                      value={bulkHold}
                      aria-label="批量帧数"
                      onChange={(e) => setBulkHold(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateDraft({ frameHolds: normalizeFrameHolds(new Array(frameCount).fill(bulkHold)) })
                      }
                    >
                      应用
                    </button>
                    {totals >= ANIMATION_CLIP_MAX_TOTAL_FRAMES && (
                      <span className="sprite-anim-warn">已达总时长上限</span>
                    )}
                  </div>
                  <div className="sprite-anim-holds">
                    {frames.map((hold, index) => (
                      <label key={index} className="sprite-anim-hold" title={`第 ${index + 1} 张`}>
                        <img src={ApiService.getAnimationClipFrameUrl(selected.id, index)} alt="" />
                        <input
                          type="number"
                          min={1}
                          max={300}
                          value={hold}
                          aria-label={`第 ${index + 1} 张持续帧数`}
                          onChange={(e) => {
                            const value = Math.max(1, Math.round(Number(e.target.value) || 1));
                            const next = [...frames];
                            next[index] = value;
                            updateDraft({ frameHolds: normalizeFrameHolds(next) });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </section>
              </div>

              <div className="sprite-anim-preview">
                <SpriteAnimationPreview
                  clip={selected}
                  poster={draft.poster}
                  playback={{
                    loop: draft.loop,
                    iterations: draft.iterations,
                    startFrame: draft.startFrame,
                    fadeInFrames: draft.fadeInFrames,
                    fadeOutFrames: draft.fadeOutFrames,
                    opacity: draft.opacity,
                  }}
                  onPosterChange={(poster) => updateDraft({ poster })}
                  onPlayingChange={setPreviewPlaying}
                  characters={characters}
                  backgrounds={backgrounds}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SpriteAnimationsTab;
