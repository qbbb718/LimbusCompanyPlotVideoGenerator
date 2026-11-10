/**
 * @component 资源管理 → 序列帧动画
 *
 * 序列帧动画的**制作与配置入口**：导入帧序列、调每帧持续时间与播放参数、摆放缩略图。
 *
 * 剧情编辑页只负责"选哪一段"（见 `EmotionAnimPicker`），所有编排都在这里，
 * 这样同一段动画能被多条记录、多个角色复用。
 *
 * <h3>编辑器为什么用本地草稿 + 防抖保存</h3>
 * 缩略图是在预览里**拖动**摆出来的，那会产生几十上百次坐标变化；每次变化都打一次
 * `PUT /api/animation-clips/{id}` 会明显卡顿。所以本地先改（预览实时跟随），
 * 停手 700ms 后再落库；顶部有"保存中/已保存"状态，另留一个手动保存按钮兜底。
 *
 * <h3>缩略图为什么用"选择状态"来挑，而不是只给一个数字框</h3>
 * 缩略图是"整段动画里挑一张最有代表性的图"，用户判断依据是**画面**，不是序号。
 * 所以「帧序列」区块提供一个「选择缩略图」按钮：按下后整个帧列表进入待选态
 * （高亮 + 提示"请点击某一帧设为缩略图"），点哪张就设哪张，选完自动退出；
 * 再按一次按钮或 Esc 可以原地取消，不改变当前缩略图。
 *
 * <h3>缩略图缩放的精度</h3>
 * 缩略图往往只有几十像素（汗滴、怒气符号），原来 0.05 的步进与"一格约 16%"的滚轮
 * 一按就过头。"对准边缘"需要的粒度是**亚像素**，所以：
 * <ul>
 *   <li>输入框自由输入（text + `inputMode=decimal`，`type=number` 会把 `0.` / `1.` 净化成空串），
 *       显示 4 位小数（0.01% 一档，微调在读数上一定看得见）；</li>
 *   <li>± 按钮与 ↑↓ 方向键默认 1%，`Shift` 5%，`Alt` 0.1%（与「按截图校准」的立绘缩放同一套手感）；</li>
 *   <li>预览里的滚轮默认约 1%/格，`Shift` 约 5%、`Alt` 约 0.1%（与按钮同一套粒度）；</li>
 *   <li>预览的**视图**还能放大到 400%（Ctrl+滚轮）：视图只影响看，摆放参数一个字都不改。</li>
 * </ul>
 *
 * <h3>左侧列表的封面为什么就是"缩略图"</h3>
 * 列表要让人一眼认出是哪套动画，所以封面直接用缩略图（`poster.frame`）那张图，
 * 而不是第 0 张——淡入起点的第 0 帧往往全透明，看上去像"素材没导入成功"。
 * 这样"挑缩略图"同时决定了编辑器里的静止预览与列表里的封面，只有一处需要挑。
 *
 * <h3>批量导入导出（.lcaf）</h3>
 * 一个 `.lcaf` 就是一套动画，所以"批量"天然是"多个文件"：
 * <ul>
 *   <li><b>批量导入</b>：多选文件后**逐个**发请求。一套坏了只影响它自己，
 *       还能顺带显示"3 / 8"的进度；</li>
 *   <li><b>批量导出</b>：列表进入多选态（勾选 / 全选），确认后只弹**一次**目录选择框，
 *       由后端把每个勾中的素材各写成一个 `.lcaf` 到那个目录（同名自动加序号）。</li>
 * </ul>
 *
 * <h3>响应式</h3>
 * 外层 `.sprite-anim-page` 是**容器查询**的参照（容器自己的样式不能用 `@container`，
 * 所以多包一层）：宽窗口三栏并排，窄了先把"设置 / 预览"上下堆叠，再窄把左侧列表也叠上去。
 * 各区块都有 min-width / min-height 兜底，实在挤不下就自己滚动，绝不把控件压扁或裁掉。
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
import { askConfirm } from "@features/common/components/ConfirmDialog";
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

/**
 * 缩略图缩放的 ± 按钮步长：默认 1%，Shift 5%，Alt 0.1%。
 *
 * <p>与「资源管理 → 角色 → 按截图校准」的立绘缩放同一套手感：1% 一档能落到一两个像素，
 * 0.1% 留给最后一两个像素的微调。滚轮（预览里）也按这三档走，见 `SpriteAnimationPreview`。
 */
const SCALE_STEP = 1.01;
const SCALE_STEP_LARGE = 1.05;
const SCALE_STEP_FINE = 1.001;

/** 缩略图缩放的上下限（与输入框 min / max、预览里的滚轮共用同一组边界） */
const SCALE_MIN = 0.01;
const SCALE_MAX = 20;

/**
 * 缩放值显示到小数点后 4 位（0.01% 一档）。
 *
 * <p>输入框用**倍率**（1 = 100%）：只显示 3 位时，0.1% 的微调在小缩放值上会被四舍五入吃掉
 * （0.5 × 1.001 = 0.5005，按一下显示不出来），按钮 / 滚轮就"按了没反应"。4 位保证每动一档都看得见。
 */
const SCALE_DIGITS = 4;

/** 缩放值保留 0.01% 一档：避免乘法累积出 1.0000000000000002 这种浮点尾巴 */
const roundScale = (value: number): number =>
  Math.round(value * 10 ** SCALE_DIGITS) / 10 ** SCALE_DIGITS;

/** 把缩放夹进模型允许的范围（输入框 / ± 按钮 / 预览滚轮共用） */
const clampScale = (value: number): number =>
  Math.min(SCALE_MAX, Math.max(SCALE_MIN, Number.isFinite(value) ? value : 1));

/**
 * @function 列表卡片上展示哪张图
 *
 * <p>用**缩略图**（`poster.frame`）而不是第 0 张：缩略图是用户在「帧序列」里专门挑出来
 * 代表这段动画的那一帧，第 0 张可能正好是全透明的淡入起点（看起来像"素材没导入成功"）。
 *
 * <p>序号要夹在"素材自己声明的帧数"与"磁盘上真的有几张"之间：素材被人删过帧时
 * 缩略图序号可能指向不存在的图，直接拼 URL 会得到一张裂图。
 */
const clipThumbIndex = (clip: AnimationClipDto): number => {
  const frameCount = Math.max(1, clip.frameCount ?? 1);
  const poster = Math.round(clip.poster?.frame ?? 0);
  const clamped = Math.min(Math.max(0, poster), frameCount - 1);
  const onDisk = typeof clip.framesOnDisk === "number" && clip.framesOnDisk > 0
    ? clip.framesOnDisk
    : clamped + 1;
  return Math.min(clamped, Math.max(0, onDisk - 1));
};

/** 取路径里的文件名（批量导入报错时用，"D:/a/花开.lcaf" → "花开.lcaf"） */
const baseNameOf = (filePath: string): string =>
  filePath.split(/[\\/]/).pop() || filePath;

/** 从异常里取出能给用户看的一句话 */
const messageOf = (error: any, fallback: string): string =>
  error?.response?.data?.message || error?.message || fallback;

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
  /** 多选导出：打开后每张卡片前出现勾选框，底部出现"确认导出" */
  const [exportMode, setExportMode] = useState(false);
  /** 多选导出勾中的素材 id */
  const [exportSelection, setExportSelection] = useState<Set<string>>(() => new Set());
  /** 预览正在播放：此时锁住缩略图的偏移/缩放输入（拖拽在预览里也已锁） */
  const [previewPlaying, setPreviewPlaying] = useState(false);
  /**
   * 缩略图缩放输入框正在编辑的文本（null = 没在编辑，显示规范化后的倍率）。
   *
   * <p>不直接用 `Number(input.value)` 当受控值：输入 `0.5` 的第一个字符是 `0`，
   * 会被"必须大于 0"的校验打回、受控值把输入框重置掉，`.` 和 `5` 就打不进去了。
   */
  const [scaleDraft, setScaleDraft] = useState<string | null>(null);
  /** 聚焦时的缩放值：Esc 放弃编辑时还原到它（输入过程中已经实时改了草稿） */
  const scaleBeforeEdit = useRef<number | null>(null);
  /** 正在"选择缩略图"：帧列表进入待选态，点任意一帧即设为缩略图 */
  const [pickingPoster, setPickingPoster] = useState(false);
  /** 递增这个值 → 预览立刻停止播放（选缩略图是静态动作，边播边选必然看不清） */
  const [stopRequest, setStopRequest] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * 还没落库的那份草稿（连同它属于哪一套素材）。
   *
   * <p>为什么要记归属：防抖窗口里换素材/离开页面时，这份改动必须存回**原来的素材**，
   * 不能跟着新选中的素材一起保存（那才是"参数互相污染"）。
   */
  const pendingSave = useRef<{ clipId: string; draft: ClipDraft } | null>(null);
  /**
   * 当前草稿属于哪一套素材。
   *
   * <p>换素材时**必须**用新素材的字段重建草稿：淡入淡出、播放参数、每帧时长都是每套自己的，
   * 一旦沿用上一套的草稿，用户就会看到"改了 A 的淡入，B 也变了"，保存时还会把 A 的值写进 B。
   */
  const draftClipId = useRef<string>("");
  /** 渲染期的草稿快照：事件回调里读它拿最新值（`setDraft` 是异步的） */
  const draftRef = useRef<ClipDraft | null>(null);
  draftRef.current = draft;
  /**
   * 本次会话里各素材的最新草稿。
   *
   * <p>换回某套素材时优先用它，而不是等列表回包：用户刚改的参数（可能还在防抖窗口里）
   * 立刻就能看到自己改的值，不会先闪一下素材库里的旧值。
   */
  const draftCache = useRef<Map<string, ClipDraft>>(new Map());
  /** 「全选」复选框：用它表达"半选"态（与角色 / 背景 / 音效页签的交互保持一致） */
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const toggleAutoHolds = (next: boolean) => {
    setAutoHolds(next);
    saveAutoHolds(next);
  };

  const clips = library.clips;
  const selected = clips.find((clip) => clip.id === selectedId);
  /**
   * 上一份选中的素材。
   *
   * <p>保存成功后会 `reload()` 一次列表，这期间 `clips` 会短暂为空——记住上一份，
   * 编辑区与预览就不会闪一下（也不会因为预览被卸载而中断播放）。
   */
  const remembered = useRef<AnimationClipDto | undefined>(undefined);
  if (selected) remembered.current = selected;
  /** 列表刷新期间也继续用同一套素材渲染（列表回包后自动换成新对象） */
  const editing =
    selected ??
    (remembered.current && remembered.current.id === selectedId && library.loading
      ? remembered.current
      : undefined);

  // 列表加载完后默认选第一套
  useEffect(() => {
    if (!selectedId && clips.length > 0) setSelectedId(clips[0].id);
  }, [clips, selectedId]);

  /* 换素材时退出"选择缩略图"：待选态是给当前这套序列的，跨素材没意义 */
  useEffect(() => {
    setPickingPoster(false);
    // 缩放输入框的草稿也跟着素材走：切过去再失焦，不能把 A 的输入提交到 B 上
    setScaleDraft(null);
  }, [selectedId]);

  /* 待选态下按 Esc 取消（不改变当前缩略图） */
  useEffect(() => {
    if (!pickingPoster) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setPickingPoster(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pickingPoster]);

  const filtered = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return clips;
    return clips.filter((clip) => (clip.name ?? "").toLowerCase().includes(keyword));
  }, [clips, searchTerm]);

  /* ==================== 保存 ==================== */

  const persist = useCallback(
    async (clipId: string, next: ClipDraft, options: { silent?: boolean } = {}) => {
      if (!options.silent) setSaveState("saving");
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
        // 静默保存（换素材前的补存）不改当前素材的"已保存"状态：那会让用户以为 B 也存过了
        if (!options.silent) setSaveState("saved");
        // 拉新列表，顺带让剧情编辑页的选择器看到最新名字
        library.reload();
      } catch (error: any) {
        if (!options.silent) setSaveState("error");
        setMessage({
          kind: "error",
          text: error?.response?.data?.message || error?.message || "保存失败",
        });
      }
    },
    [library],
  );

  /** 把待落库的那份草稿立刻存掉（存回它自己的素材，不碰当前选中项的状态） */
  const flushPendingSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const pending = pendingSave.current;
    pendingSave.current = null;
    if (pending) void persist(pending.clipId, pending.draft, { silent: true });
  }, [persist]);

  // 放进 ref：下面的 effect 只该在"换素材"时跑一次，不该因为 persist 换新而重跑
  const flushRef = useRef(flushPendingSave);
  flushRef.current = flushPendingSave;

  /**
   * 换素材（或首次拿到数据）→ **重建草稿**。
   *
   * <p>这是"不同动画的参数互相独立"的唯一保证：淡入淡出、播放参数、每帧时长、缩略图
   * 全都跟着各自素材走。换成新素材时先把上一套没落库的改动补存掉，再整份换成新素材的值。
   */
  useEffect(() => {
    flushRef.current();

    if (!selected) {
      // 列表正在刷新且选中的还是同一套（保存后 reload 的那一下）：保留草稿，编辑区不闪
      if (remembered.current?.id === selectedId && library.loading) return;
      draftClipId.current = "";
      draftRef.current = null;
      setDraft(null);
      return;
    }
    // 同一套素材：保留正在编辑的草稿（列表刷新/保存回包不该冲掉用户没存完的改动）
    if (draftClipId.current === selected.id) return;
    draftClipId.current = selected.id;
    const next = draftCache.current.get(selected.id) ?? draftOf(selected);
    draftRef.current = next;
    setDraft(next);
    setSaveState("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selected?.id, library.loading]);

  /** 改草稿：本地立刻生效（预览实时跟），停手后再落库 */
  const updateDraft = useCallback(
    (patch: Partial<ClipDraft>) => {
      const previous = draftRef.current;
      if (!previous || !selectedId) return;
      const next = { ...previous, ...patch };
      draftRef.current = next;
      setDraft(next);
      // 连同"属于哪套素材"一起记下：之后就算切了素材，这份也只会存回原来那套
      draftCache.current.set(selectedId, next);
      pendingSave.current = { clipId: selectedId, draft: next };
      setSaveState("pending");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        const pending = pendingSave.current;
        pendingSave.current = null;
        if (pending) void persist(pending.clipId, pending.draft);
      }, 700);
    },
    [selectedId, persist],
  );

  // 卸载（切页面）时把还没落库的改动补存掉，别让刚改的参数白发
  useEffect(() => () => flushRef.current(), []);

  /**
   * @function 缩略图缩放的 ± 微调
   *
   * @param direction +1 = 放大，-1 = 缩小（取倒数，保证放大与缩小对称）
   * @param modifier  默认 1%，Shift 5%，Alt 0.1%（与「按截图校准」的立绘缩放一致）
   *
   * <p>倍率是乘法量：直接 `scale × 1.01` 会在几次之后带出浮点尾巴（1.0303...），
   * 所以每次落成 0.01% 一档的圆整值，读数与再次保存的值都可预期。
   */
  const nudgePosterScale = (
    direction: 1 | -1,
    modifier: { shiftKey: boolean; altKey: boolean },
  ) => {
    const current = draftRef.current;
    if (!current || previewPlaying) return;
    const base = modifier.altKey
      ? SCALE_STEP_FINE
      : modifier.shiftKey
        ? SCALE_STEP_LARGE
        : SCALE_STEP;
    const factor = direction > 0 ? base : 1 / base;
    updateDraft({
      poster: {
        ...current.poster,
        scale: clampScale(roundScale((current.poster.scale ?? 1) * factor)),
      },
    });
  };

  const saveNow = () => {
    const current = draftRef.current;
    if (!current || !selectedId) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingSave.current = null;
    void persist(selectedId, current);
  };

  /* ==================== 缩略图选择 ==================== */

  const startPickPoster = () => {
    // 播放中每帧都在换图，"点某一帧"点到的其实是正在播的那一帧：先停下来再选
    setStopRequest((value) => value + 1);
    setPickingPoster(true);
  };

  const cancelPickPoster = () => setPickingPoster(false);

  /** 把第 index 张设为缩略图：只换"哪一张"，相对头部区域的偏移与缩放原样保留 */
  const pickPoster = (index: number) => {
    if (!draft) return;
    updateDraft({ poster: { ...draft.poster, frame: index } });
    setPickingPoster(false);
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
    // 新素材的草稿先进缓存：等列表回包期间也能立刻显示它自己的参数
    const imported = draftOf(result.asset);
    draftCache.current.set(result.asset.id, imported);
    setSelectedId(result.asset.id);
    setDraft(imported);
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
      const imported = draftOf(result.asset);
      draftCache.current.set(result.asset.id, imported);
      setSelectedId(result.asset.id);
      setDraft(imported);
      setSaveState("idle");
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

  /**
   * @function 批量导入 .lcaf（多选）
   *
   * <p>逐个发请求而不是一次传一批：一套动画坏了只影响它自己，其它照常进来，
   * 用户还能看到"3/8"的进度。成功的那几套会刷新列表并选中最后导入的一套。
   */
  const handleImportFiles = async () => {
    const api: any = (window as any).electronAPI;
    if (!api?.openAnimationClips) {
      setMessage({ kind: "error", text: "当前环境不支持批量导入动画文件" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const picked = await api.openAnimationClips();
      if (picked?.canceled || !picked?.filePaths?.length) return;

      const paths: string[] = picked.filePaths;
      const imported: AnimationClipDto[] = [];
      const failures: string[] = [];
      for (let i = 0; i < paths.length; i++) {
        setMessage({ kind: "info", text: `正在导入 ${i + 1} / ${paths.length}…` });
        try {
          const file = await fileOfPath(paths[i]);
          const result = await ApiService.importAnimationClipZip(file, undefined, {
            inferHolds: autoHolds,
          });
          imported.push(result.asset as AnimationClipDto);
        } catch (error: any) {
          failures.push(`${baseNameOf(paths[i])}：${messageOf(error, "导入失败")}`);
          log.warn("[序列帧动画] 批量导入中有一个失败:", paths[i], error);
        }
      }

      if (imported.length > 0) {
        library.reload();
        // 选最后导入的那套：列表按创建时间倒序，它就在最上面
        const latest = imported[imported.length - 1];
        const next = draftOf(latest);
        draftCache.current.set(latest.id, next);
        setSelectedId(latest.id);
        setDraft(next);
        setSaveState("idle");
      }

      const summary = `已导入 ${imported.length} 套动画`;
      setMessage(
        failures.length === 0
          ? { kind: "info", text: summary }
          : { kind: "error", text: `${summary}；${failures.length} 个失败：${failures.join("；")}` },
      );
    } catch (error: any) {
      setMessage({ kind: "error", text: messageOf(error, "批量导入失败") });
      log.error("[序列帧动画] 批量导入动画文件失败:", error);
    } finally {
      setBusy(false);
    }
  };

  /* ==================== 多选导出 ==================== */

  /**
   * 勾中且**仍然存在**的素材。
   *
   * <p>用 `clips`（全部）而不是 `filtered`（当前搜索命中的）：勾了 A 之后又搜索去勾 B，
   * 结果里必须两套都在——"勾了却被悄悄丢掉"比"数量比屏幕上的多"糟得多。
   * 唯一要剔除的是已经从素材库里消失的 id（删掉之后还留在勾选集合里）。
   */
  const selectedForExport = useMemo(
    () => clips.filter((clip) => exportSelection.has(clip.id)),
    [clips, exportSelection],
  );

  const startExportMode = () => {
    setExportSelection(new Set());
    setExportMode(true);
  };

  const cancelExportMode = () => {
    setExportMode(false);
    setExportSelection(new Set());
  };

  const toggleExportItem = (clipId: string) => {
    setExportSelection((previous) => {
      const next = new Set(previous);
      if (next.has(clipId)) {
        next.delete(clipId);
      } else {
        next.add(clipId);
      }
      return next;
    });
  };

  /** 「全选」作用于**当前列表**（搜索时就是命中的那批），与其它资源页签一致 */
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((clip) => exportSelection.has(clip.id));

  const toggleSelectAll = () => {
    setExportSelection(
      allFilteredSelected ? new Set() : new Set(filtered.map((clip) => clip.id)),
    );
  };

  /** 全选框的"半选"态：勾了一部分（当前可见的那批里） */
  useEffect(() => {
    const checkbox = selectAllRef.current;
    if (!checkbox) return;
    const visibleSelected = filtered.filter((clip) => exportSelection.has(clip.id)).length;
    checkbox.indeterminate = visibleSelected > 0 && visibleSelected < filtered.length;
  }, [filtered, exportSelection]);

  /**
   * @function 批量导出：勾中的几套各写成一个 `.lcaf` 到同一个目录
   *
   * <p>只弹**一次**目录选择框：逐套弹"保存到哪个文件"在批量场景下没法用。
   * 写盘由后端做（与单套导出同一套代码），失败的那几套会逐条回显。
   */
  const handleExportSelected = async () => {
    const ids = selectedForExport.map((clip) => clip.id);
    if (ids.length === 0) {
      setMessage({ kind: "error", text: "先在列表里勾选要导出的动画" });
      return;
    }
    const api: any = (window as any).electronAPI;
    if (!api?.chooseDirectory) {
      setMessage({ kind: "error", text: "当前环境不支持选择导出目录" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const picked = await api.chooseDirectory({
        title: "选择动画导出目录",
        buttonLabel: "导出到此处",
      });
      if (picked?.canceled || !picked?.directory) return;

      const result = await ApiService.exportAnimationClipsBatch(ids, picked.directory);
      const failures = result.failures ?? [];
      setMessage(
        failures.length === 0
          ? { kind: "info", text: `已导出 ${result.count} 套动画到 ${result.targetDir}` }
          : {
              kind: "error",
              text: `已导出 ${result.count} 套到 ${result.targetDir}；${failures.length} 套失败：${
                failures.map((item) => `${item.name}（${item.message}）`).join("；")
              }`,
            },
      );
      if (failures.length === 0) cancelExportMode();
    } catch (error: any) {
      setMessage({ kind: "error", text: messageOf(error, "批量导出失败") });
      log.error("[序列帧动画] 批量导出失败:", error);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (clip: AnimationClipDto) => {
    // 应用内确认框：Electron 的原生 confirm 关掉后会抢走键盘焦点，之后输入框点不进、打不了字
    const confirmed = await askConfirm({
      title: "删除动画",
      message: `删除动画「${clip.name}」？`,
      detail: "引用它的记录将不再显示这段动画（记录本身不会损坏）。",
      confirmLabel: "删除",
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    setBusy(true);
    // 这套素材马上要没了：别再把待落库的改动发给它（否则只会收到一个 404）
    draftCache.current.delete(clip.id);
    if (pendingSave.current?.clipId === clip.id) {
      pendingSave.current = null;
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    }
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
  /** 当前缩略图是第几张（0 起；素材上存的就是**图片序号**） */
  const posterIndex = draft
    ? Math.min(Math.max(0, Math.round(draft.poster.frame ?? 0)), Math.max(0, frameCount - 1))
    : 0;
  /** 缩放输入框的显示值：编辑中显示原始文本，平时显示 0.01% 一档的圆整值 */
  const scaleText = scaleDraft ?? String(Number((draft?.poster.scale ?? 1).toFixed(SCALE_DIGITS)));

  return (
    <div className="sprite-anim-page">
      <div className="sprite-anim-tab">
        <aside className="sprite-anim-list">
          <div className="sprite-anim-list-top">
            <input
              type="search"
              className="sprite-anim-search"
              placeholder="搜索动画名称"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="搜索序列帧动画"
            />
            <div className="sprite-anim-list-actions">
              <button type="button" className="btn-primary" disabled={busy} onClick={handleImportImages}>
                新建（选图片）
              </button>
              <button type="button" disabled={busy} onClick={handleImportFolder}>
                从文件夹
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleImportFile}
                title="导入单个动画文件（.lcaf / 图片序列 zip）"
              >
                导入 .lcaf
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleImportFiles}
                title="一次选多个 .lcaf 批量导入：坏掉的那几套不影响其它套"
              >
                批量导入 .lcaf
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
              <span>按文件名编号推算时长</span>
            </label>
          </div>

          {/* 多选导出：常态只有一个入口；进入后换成「全选 / 确认导出 / 取消」 */}
          <div className={`sprite-anim-selectbar${exportMode ? " is-active" : ""}`}>
            {exportMode ? (
              <>
                <label className="sprite-anim-check" title="把当前列表里能看到的动画全部勾上">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    aria-label="全选动画"
                  />
                  <span>全选</span>
                </label>
                <button
                  type="button"
                  className="sprite-anim-btn is-primary"
                  disabled={busy || selectedForExport.length === 0}
                  onClick={handleExportSelected}
                  title="勾中的每一套各存成一个 .lcaf，写进同一个目录"
                >
                  确认导出 ({selectedForExport.length})
                </button>
                <button type="button" className="sprite-anim-btn" onClick={cancelExportMode}>
                  取消
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="sprite-anim-btn"
                  disabled={busy || clips.length === 0}
                  onClick={startExportMode}
                  title="勾选几套动画，一次各导出一个 .lcaf 到同一个目录"
                >
                  选择导出
                </button>
                <span className="sprite-anim-selectbar-hint">多选 → 一次导出多个 .lcaf</span>
              </>
            )}
          </div>

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
                className={`sprite-anim-card${clip.id === selectedId ? " is-selected" : ""}${
                  exportSelection.has(clip.id) ? " is-checked" : ""
                }`}
                role="button"
                tabIndex={0}
                aria-pressed={exportMode ? exportSelection.has(clip.id) : undefined}
                onClick={() =>
                  exportMode ? toggleExportItem(clip.id) : setSelectedId(clip.id)
                }
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  if (exportMode) {
                    toggleExportItem(clip.id);
                  } else {
                    setSelectedId(clip.id);
                  }
                }}
                title={
                  clip.missingFrames
                    ? "有缺帧，成片里缺的部分不会显示"
                    : `${clip.name}（封面 = 缩略图：第 ${clipThumbIndex(clip) + 1} 张）`
                }
              >
                {exportMode && (
                  <span className="sprite-anim-card-check">
                    <input
                      type="checkbox"
                      checked={exportSelection.has(clip.id)}
                      onChange={() => toggleExportItem(clip.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`选择导出「${clip.name}」`}
                    />
                  </span>
                )}
                {/* 封面用**缩略图**（用户在帧序列里挑的那一张），不是第 0 张 */}
                <img src={ApiService.getAnimationClipFrameUrl(clip.id, clipThumbIndex(clip))} alt="" />
                <div className="sprite-anim-card-meta">
                  {/* 名字可能是很长的中文串：单行省略 + 悬浮看全名，避免把卡片撑破 */}
                  <strong title={clip.name}>{clip.name}</strong>
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
        </aside>

        <div className="sprite-anim-editor">
          {!draft || !editing ? (
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
                  title={draft.name}
                  onChange={(e) => updateDraft({ name: e.target.value })}
                />
                <span className={`sprite-anim-save is-${saveState}`}>
                  {saveState === "pending" && "未保存…"}
                  {saveState === "saving" && "保存中…"}
                  {saveState === "saved" && "已保存"}
                  {saveState === "error" && "保存失败"}
                  {saveState === "idle" && ""}
                </span>
                <div className="sprite-anim-editor-actions">
                  <button type="button" onClick={saveNow} disabled={saveState === "saving"}>
                    保存
                  </button>
                  <button type="button" onClick={() => handleExport(editing)}>
                    导出 .lcaf
                  </button>
                  <button type="button" onClick={() => handleDelete(editing)}>
                    删除
                  </button>
                </div>
              </div>

              <div className="sprite-anim-columns">
                <div className="sprite-anim-settings">
                  {/* 播放参数 */}
                  <section>
                    <div className="sprite-anim-section-head">
                      <h4>播放参数</h4>
                    </div>
                    {/* 一行 = 若干「标签 + 控件」组：窄了整组换行，标签不会跟输入框分家 */}
                    <div className="sprite-anim-row">
                      <span className="sprite-anim-field">
                        <span className="sprite-anim-label">播放</span>
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
                      </span>
                      {(draft.loop === "loop" || draft.loop === "pingpong") && (
                        <span className="sprite-anim-field">
                          <span className="sprite-anim-label">次数</span>
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
                        </span>
                      )}
                      <span className="sprite-anim-field">
                        <span className="sprite-anim-label">帧率</span>
                        <span className="sprite-anim-readonly">{editing.fps} fps（固定）</span>
                      </span>
                    </div>
                    <div className="sprite-anim-row">
                      <span className="sprite-anim-field">
                        <span className="sprite-anim-label">开始(帧)</span>
                        <input
                          type="number"
                          min={0}
                          value={draft.startFrame}
                          aria-label="开始帧"
                          onChange={(e) =>
                            updateDraft({ startFrame: Math.max(0, Math.round(Number(e.target.value) || 0)) })
                          }
                        />
                      </span>
                      <span className="sprite-anim-field">
                        <span className="sprite-anim-label">不透明度</span>
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
                      </span>
                    </div>
                    {/* 淡入、淡出**各自独立**：两行两套控件，互不影响 */}
                    <div className="sprite-anim-row">
                      <span className="sprite-anim-field is-grow">
                        <span className="sprite-anim-label">淡入(帧)</span>
                        <input
                          type="range"
                          min={0}
                          max={Math.max(1, Math.min(120, frameCount > 0 ? totals : 120))}
                          value={draft.fadeInFrames}
                          aria-label="淡入帧数滑块"
                          onChange={(e) => updateDraft({ fadeInFrames: Number(e.target.value) })}
                          className="sprite-anim-slider"
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
                      </span>
                      <span className="sprite-anim-note">开头几帧从透明淡到不透明</span>
                    </div>
                    <div className="sprite-anim-row">
                      <span className="sprite-anim-field is-grow">
                        <span className="sprite-anim-label">淡出(帧)</span>
                        <input
                          type="range"
                          min={0}
                          max={Math.max(1, Math.min(120, frameCount > 0 ? totals : 120))}
                          value={draft.fadeOutFrames}
                          disabled={draft.loop === "loop" || draft.loop === "pingpong"}
                          aria-label="淡出帧数滑块"
                          onChange={(e) => updateDraft({ fadeOutFrames: Number(e.target.value) })}
                          className="sprite-anim-slider"
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
                      </span>
                      <span className="sprite-anim-note">
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

                  {/* 帧序列：每帧时长 + 缩略图选择 + 缩略图摆放，全在这一个区块里 */}
                  <section className={`sprite-anim-holds-section${pickingPoster ? " is-picking" : ""}`}>
                    <div className="sprite-anim-section-head">
                      <h4>
                        帧序列（{frameCount} 张 · 共 {totals} 帧 · {(totals / 30).toFixed(2)} 秒）
                      </h4>
                      <button
                        type="button"
                        className={`sprite-anim-pick${pickingPoster ? " is-active" : ""}`}
                        onClick={() => (pickingPoster ? cancelPickPoster() : startPickPoster())}
                        aria-pressed={pickingPoster}
                        disabled={frameCount === 0}
                        title={
                          pickingPoster
                            ? "退出选择（也可以按 Esc）：当前缩略图不变"
                            : "进入选择状态：在下面的帧列表里点一张，把它设为缩略图"
                        }
                      >
                        {pickingPoster ? "取消选择" : "选择缩略图"}
                      </button>
                    </div>
                    <div className="global-hint">
                      缩略图 = 静止预览（剧情编辑里那张不动的图）显示的那一张，也是跨角色复用的参考帧。
                      点「选择缩略图」再点下面任意一帧即可挑；带「缩略图」角标的那张就是当前值。
                    </div>
                    <div className="sprite-anim-row">
                      <span className="sprite-anim-field">
                        <span className="sprite-anim-label">全部设为</span>
                        <input
                          type="number"
                          min={1}
                          max={300}
                          value={bulkHold}
                          aria-label="批量帧数"
                          onChange={(e) => setBulkHold(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                        />
                      </span>
                      <button
                        type="button"
                        className="sprite-anim-btn"
                        onClick={() =>
                          updateDraft({ frameHolds: normalizeFrameHolds(new Array(frameCount).fill(bulkHold)) })
                        }
                      >
                        应用
                      </button>
                      <span
                        className="sprite-anim-readonly sprite-anim-ellipsis"
                        title={`当前缩略图：第 ${posterIndex + 1} 张，共 ${frameCount} 张`}
                      >
                        当前缩略图：第 {posterIndex + 1} / {Math.max(1, frameCount)} 张
                      </span>
                      {totals >= ANIMATION_CLIP_MAX_TOTAL_FRAMES && (
                        <span className="sprite-anim-warn">已达总时长上限</span>
                      )}
                    </div>
                    {pickingPoster && (
                      <div className="sprite-anim-pick-hint" role="status">
                        请点击某一帧设为缩略图（点「取消选择」或按 Esc 可退出）
                      </div>
                    )}
                    <div className={`sprite-anim-holds${pickingPoster ? " is-picking" : ""}`}>
                      {frames.map((hold, index) => {
                        const isPoster = index === posterIndex;
                        return (
                          <div
                            key={index}
                            className={`sprite-anim-hold${isPoster ? " is-poster" : ""}${
                              pickingPoster ? " is-pickable" : ""
                            }`}
                            role={pickingPoster ? "button" : undefined}
                            tabIndex={pickingPoster ? 0 : undefined}
                            aria-label={pickingPoster ? `把第 ${index + 1} 张设为缩略图` : undefined}
                            aria-pressed={pickingPoster ? isPoster : undefined}
                            onClick={pickingPoster ? () => pickPoster(index) : undefined}
                            onKeyDown={
                              pickingPoster
                                ? (event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      pickPoster(index);
                                    }
                                  }
                                : undefined
                            }
                            title={
                              pickingPoster
                                ? `点击把第 ${index + 1} 张设为缩略图`
                                : `第 ${index + 1} 张${isPoster ? "（当前缩略图）" : ""}`
                            }
                          >
                            {/* 角标行：当前缩略图有字，其它留空（保证每格高度一致，网格不跳） */}
                            <span className="sprite-anim-hold-flag">{isPoster ? "缩略图" : ""}</span>
                            <img src={ApiService.getAnimationClipFrameUrl(editing.id, index)} alt="" />
                            <input
                              type="number"
                              min={1}
                              max={300}
                              value={hold}
                              disabled={pickingPoster}
                              aria-label={`第 ${index + 1} 张持续帧数`}
                              onChange={(e) => {
                                const value = Math.max(1, Math.round(Number(e.target.value) || 1));
                                const next = [...frames];
                                next[index] = value;
                                updateDraft({ frameHolds: normalizeFrameHolds(next) });
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* 缩略图摆放：相对头部区域的位置/大小（也在右侧预览里直接拖/滚轮） */}
                    <div className="sprite-anim-place">
                      <div className="sprite-anim-place-title">缩略图摆放（相对头部区域）</div>
                      <div className="sprite-anim-row">
                        <span className="sprite-anim-field">
                          <span
                            className="sprite-anim-label"
                            title="单位是头部长度：1.0 = 一个头宽；X 向右、Y 向下；播放中锁定，暂停/停止后可改"
                          >
                            偏移(头宽)
                          </span>
                          <input
                            type="number"
                            step={0.01}
                            disabled={previewPlaying}
                            value={Number((draft.poster.offsetX ?? 0).toFixed(3))}
                            aria-label="缩略图水平偏移"
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
                            aria-label="缩略图垂直偏移"
                            onChange={(e) =>
                              updateDraft({
                                poster: { ...draft.poster, offsetY: Number(e.target.value) || 0 },
                              })
                            }
                          />
                        </span>
                        <span className="sprite-anim-field">
                          <span className="sprite-anim-label">缩放</span>
                          <button
                            type="button"
                            className="sprite-anim-step"
                            disabled={previewPlaying}
                            onClick={(event) => nudgePosterScale(-1, event)}
                            aria-label="缩小缩略图"
                            title="缩小 1%（Shift 5%，Alt 0.1%）"
                          >
                            −
                          </button>
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            maxLength={12}
                            disabled={previewPlaying}
                            value={scaleText}
                            aria-label="缩略图缩放"
                            title="缩放倍率：1 = 100%。可直接输入（0.0001 = 0.01%），或用 ± 按钮（1% / Shift 5% / Alt 0.1%）、方向键、滚轮微调"
                            onFocus={() => {
                              // 记下编辑前的值：Esc 放弃时还原（输入过程中预览已经实时跟着变了）
                              scaleBeforeEdit.current = draftRef.current?.poster.scale ?? 1;
                            }}
                            onChange={(event) => {
                              const text = event.target.value;
                              setScaleDraft(text);
                              // 只把能解析的值回写；"-"、"0."、"1." 这些中间态留在草稿里，
                              // 受控值不会把它们打回去（这是 text 而不是 number 的原因，见 NumberField）
                              const value = Number(text);
                              if (text.trim() !== "" && Number.isFinite(value) && value > 0) {
                                updateDraft({
                                  poster: { ...draft.poster, scale: clampScale(value) },
                                });
                              }
                            }}
                            // 数值已经在 onChange 里实时回写过了：失焦只结束编辑态，不重新提交
                            // （否则"输入框还开着时用滚轮改过"的旧文本会把新值盖回去）
                            onBlur={() => setScaleDraft(null)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                event.currentTarget.blur();
                              } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                                // 方向键当步进器用：默认 1%，Shift 5%，Alt 0.1%
                                event.preventDefault();
                                nudgePosterScale(event.key === "ArrowUp" ? 1 : -1, event);
                                setScaleDraft(null);
                              } else if (event.key === "Escape") {
                                // 放弃这次输入：还原到聚焦前的缩放，再退出编辑态
                                const before = scaleBeforeEdit.current;
                                if (before !== null) {
                                  updateDraft({ poster: { ...draft.poster, scale: before } });
                                }
                                setScaleDraft(null);
                                event.currentTarget.blur();
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="sprite-anim-step"
                            disabled={previewPlaying}
                            onClick={(event) => nudgePosterScale(1, event)}
                            aria-label="放大缩略图"
                            title="放大 1%（Shift 5%，Alt 0.1%）"
                          >
                            ＋
                          </button>
                        </span>
                        <span className="sprite-anim-note">
                          {previewPlaying
                            ? "播放中已锁定，暂停/停止后可调"
                            : "也可以直接在预览里拖动平移；滚轮缩放与 ± 按钮同档（1% / Shift 5% / Alt 0.1%）"}
                        </span>
                      </div>
                    </div>
                  </section>
                </div>

                <div className="sprite-anim-preview">
                  <SpriteAnimationPreview
                    // 每帧时长用**草稿**里的：改完立刻能按新节奏试播，不用等保存回包
                    clip={{ ...editing, frameHolds: draft.frameHolds, totalFrames: totals }}
                    poster={draft.poster}
                    playback={{
                      loop: draft.loop,
                      iterations: draft.iterations,
                      startFrame: draft.startFrame,
                      fadeInFrames: draft.fadeInFrames,
                      fadeOutFrames: draft.fadeOutFrames,
                      opacity: draft.opacity,
                    }}
                    stopRequest={stopRequest}
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
    </div>
  );
};

export default SpriteAnimationsTab;
