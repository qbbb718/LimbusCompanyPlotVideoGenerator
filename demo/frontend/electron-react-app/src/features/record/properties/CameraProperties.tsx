/**
 * @module 摄像机属性面板（剧情编辑 → 「摄像机」页签）
 *
 * 摄像机的**全部控件**都在这里：起止镜头、缓动、运镜帧数、播放、缩放、复位、铺满背景、
 * 预设（镜头摇动等镜头层效果）、拖动工具。预览区那边的世界视图（`preview/CameraModeView.tsx`）
 * 只负责"在画布上动手"，两者共用 `useCameraEditor` 的同一份状态——页签里选「终点」，
 * 画布里拖的就是终点。
 *
 * <p>「预设」是一块独立的注册表驱动区块（`properties/CameraPresets.tsx` +
 * `preview/cameraPresets.ts`）：新增镜头层效果不需要改这个文件。
 *
 * <p>最后一块「构图辅助」是本页签唯一的**工程级**开关（镜头自动跟随说话人）：控件放在这里，
 * 但它写的是 `projectSettings`、作用于整个工程，规则见 `preview/cameraFollow.ts`。
 *
 * <h3>为什么单独成一个页签</h3>
 * 这些控件原先浮在预览画面上的工具条里（遮住画面、和「最终效果」抢位置，而且不算"属性"）。
 * 挪到与「立绘」「背景」同级的页签后：进「摄像机」页签 = 预览切到世界视图，离开 = 回到成片，
 * 面板空间也更够用（滑杆 / 读数 / 说明都能放下）。
 *
 * <h3>坐标系</h3>
 * 镜头读数是**世界坐标**（可以远大于 1920×1080），中心缺省 960,540 = 画布中心，缩放 1.00× = 取景框
 * 正好一屏。只有背景 / 立绘 / 临时图片受它影响，边框、对话框、名片、地点牌、台词都不受影响。
 *
 * @see useCameraEditor 状态唯一真源（起止帧、工具、视图缩放、播放头）
 * @see cameraView 镜头归一化 / 取景框 / 缓动曲线（纯函数）
 */
import React, { useMemo } from "react";
import { Record } from "@types";
import {
  CAMERA_EASINGS,
  DEFAULT_CAMERA_EASING,
  cameraKeyframe,
  coverScaleForBackground,
  zoomCameraAt,
} from "../preview/cameraView";
import type { CameraEasing } from "../preview/cameraView";
import {
  MAX_CAMERA_ZOOM,
  MIN_CAMERA_ZOOM,
  sceneLayerKey,
  worldBoxOf,
  worldRefOf,
} from "../preview/previewLayout";
import { useImageSizes } from "../preview/useImageSizes";
import { buildSceneImageMap } from "../preview/previewAssets";
import { FRAME_RATE } from "../preview/useCameraPlayback";
import { MAX_CAMERA_MOVE_FRAMES, MIN_CAMERA_MOVE_FRAMES } from "../preview/useCameraEditor";
import type { CameraEditor } from "../preview/useCameraEditor";
import CameraPresets from "./CameraPresets";
import "../RecordEditor.css";
import "./CameraProperties.css";

interface CameraPropertiesProps {
  selectedRecord: Record;
  selectedRecordIndex: number;
  updateRecord: (index: number, updatedRecord: Record) => void;
  /** 摄像机编辑状态（与预览里的世界视图共用同一份，由 RecordEditor 持有） */
  editor: CameraEditor;
  /**
   * 工程级开关「镜头自动跟随说话人」（`projectSettings.cameraFollowSpeaker`）。
   *
   * <p>它作用于**整个工程**（不是这条记录），只是控件放在了这个页签里；
   * 计算规则在 `preview/cameraFollow.ts`，由 RecordEditor 在写回记录时调用。
   */
  cameraFollowSpeaker: boolean;
  /** 勾选 / 取消「镜头自动跟随说话人」（写回工程设置，与其它全局选项同一份） */
  onCameraFollowSpeakerChange: (enabled: boolean) => void;
}

/** 缓动下拉的中文名（与后端 Camera.ease 的四种曲线一一对应） */
const EASING_LABELS: { [key in CameraEasing]: string } = {
  linear: "匀速",
  easeIn: "慢入",
  easeOut: "慢出",
  easeInOut: "慢入慢出",
};

/** 世界坐标取整显示（读数只到像素，够用且不跳动） */
const round = (value: number): number => Math.round(value);

/** 一帧镜头的读数，例如 `960, 540 · 1.00×` */
const frameText = (frame: { centerX: number; centerY: number; zoom: number }): string =>
  `${round(frame.centerX)}, ${round(frame.centerY)} · ${frame.zoom.toFixed(2)}×`;

/**
 * 固定宽度的分段按钮（起点/终点、移镜/移元素）：用 `aria-pressed` 而不是 role=radio，
 * 这样键盘 Tab 能直接切、读屏也能念出"按下/未按下"。
 */
const SegmentedButton: React.FC<{
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}> = ({ active, onClick, title, children }) => (
  <button
    type="button"
    className={active ? "active" : ""}
    aria-pressed={active}
    title={title}
    onClick={onClick}
  >
    {children}
  </button>
);

/**
 * @component 摄像机属性面板
 *
 * <p>只经 `editor` 改镜头（内部会 `withKeyframe` 写回"正在编辑的那一帧"），
 * 只有「铺满背景」例外——它改的是背景的 scale，所以走 `updateRecord`。
 */
const CameraProperties: React.FC<CameraPropertiesProps> = ({
  selectedRecord,
  selectedRecordIndex,
  updateRecord,
  editor,
  cameraFollowSpeaker,
  onCameraFollowSpeakerChange,
}) => {
  const {
    camera,
    keyframe,
    setKeyframe,
    editing,
    shown,
    animated,
    moveFrames,
    moveDraft,
    updateMoveFrames,
    commitMoveFrames,
    playback,
    stop,
    applyEditing,
    setEasing,
    resetCamera,
    tool,
    setTool,
    resetView,
  } = editor;

  /* ===================== 「铺满背景」需要的数据 ===================== */

  /** 图层 key → 原图地址（只用来拿背景尺寸） */
  const sceneImages = useMemo(
    () => buildSceneImageMap(selectedRecord),
    [selectedRecord],
  );
  /** 只需要背景的尺寸：世界参考框与「铺满背景」都只看背景 */
  const backgroundUrls = useMemo(
    () =>
      (selectedRecord.bg ?? [])
        .map((_, index) => sceneImages[sceneLayerKey("background", index)])
        .filter((url): url is string => Boolean(url)),
    [selectedRecord.bg, sceneImages],
  );
  const { sizes } = useImageSizes(backgroundUrls);

  /**
   * 世界框（镜头可活动范围）：与预览里世界视图用的是同一套纯函数。
   *
   * <p>本面板的「推近 / 拉远」按钮要靠它把镜头夹在世界里，否则一路拉远会把取景框
   * 拉到世界外面（世界视图里看着就是"黑边越拖越大"）。
   */
  const worldBox = useMemo(
    () =>
      worldBoxOf(
        worldRefOf(selectedRecord, (key) => {
          const url = sceneImages[key];
          return url ? sizes[url] : undefined;
        }),
      ),
    [selectedRecord, sceneImages, sizes],
  );

  /**
   * 最上面那张"拿得到原图尺寸"的背景。
   *
   * <p>铺满只对最上层有意义（下层被盖住，放大了也看不见）；从后往前找，与预览里的
   * `coverTargetIndex` 同一套规则。拿不到尺寸时按钮置灰（读不到原图就无从算倍数）。
   */
  const coverTarget = useMemo(() => {
    const backgrounds = selectedRecord.bg ?? [];
    for (let index = backgrounds.length - 1; index >= 0; index--) {
      const url = sceneImages[sceneLayerKey("background", index)];
      const size = url ? sizes[url] : undefined;
      if (size) return { index, size, background: backgrounds[index] };
    }
    return null;
  }, [selectedRecord.bg, sceneImages, sizes]);

  /**
   * @function 铺满背景
   *
   * <p>后端背景是 contain（完整放进目标框），横长条背景在 scale=1 时只画中间一条、上下留黑，
   * 世界也只有画布那么大，镜头根本没地方摇。这里把最上层背景放大到刚好盖住当前取景框：
   * **只放大、不缩小、不拉伸、不改 X/Y**（倍数公式见 cameraView.coverScaleForBackground）。
   */
  const coverBackground = () => {
    const target = coverTarget;
    if (!target || !target.background) return;
    const scale = coverScaleForBackground(target.background, target.size, camera);
    const backgrounds = selectedRecord.bg ?? [];
    updateRecord(selectedRecordIndex, {
      ...selectedRecord,
      bg: backgrounds.map((background, index) =>
        index === target.index ? { ...background, scale } : background,
      ),
    });
  };

  /* ===================== 缩放：滑杆 / 数值 / 按钮 ===================== */

  /**
   * @function 以取景框中心为锚推拉镜头
   *
   * <p>滚轮推拉是"以指针为锚"（世界视图里），按钮没有指针，只能以中心为锚——
   * `zoomCameraAt` 在锚点 = 中心时就是"中心不动、放大/缩小"，额外负责夹进世界。
   */
  const zoomBy = (factor: number) => {
    applyEditing(
      zoomCameraAt(
        editing,
        editing.zoom * factor,
        { x: editing.centerX, y: editing.centerY },
        worldBox,
      ),
    );
  };

  const endFrame = cameraKeyframe(camera, "end");
  const seconds = (moveFrames / FRAME_RATE).toFixed(2);

  return (
    <div className="camera-properties">
      <h4>摄像机</h4>

      {/* 状态摘要：一眼看清现在是"静止"还是"运镜"，以及取景框停在哪 */}
      <div className={`camera-summary${animated ? " is-animated" : ""}`}>
        <span className="camera-summary-state">
          {animated ? `🎥 运镜 ${moveFrames} 帧` : "🎥 静止镜头"}
        </span>
        <span className="camera-summary-text" title="取景框此刻的中心与缩放（世界坐标）">
          {frameText(shown)}
        </span>
      </div>

      <p className="camera-hint">
        拖动移镜 · 滚轮推拉 · Ctrl+滚轮缩放视图 · 空格平移 · F 适配 · 0 复位 · Alt 切工具。
      </p>

      {/* ===== 取景：起点 / 终点 ===== */}
      <h5>取景</h5>
      <div className="camera-row">
        <span className="camera-label">编辑</span>
        <div className="camera-segmented" role="group" aria-label="编辑哪一帧">
          <SegmentedButton
            active={keyframe === "start"}
            onClick={() => setKeyframe("start")}
            title="编辑起点镜头（= 没有终点时，这条记录唯一的镜头）"
          >
            ◆ 起点
          </SegmentedButton>
          <SegmentedButton
            active={keyframe === "end"}
            onClick={() => setKeyframe("end")}
            title="编辑终点镜头；改一下就会自动生成「起止镜头」"
          >
            ◇ 终点
          </SegmentedButton>
        </div>
      </div>

      <div className="camera-row">
        <span className="camera-label">中心</span>
        <span className="camera-value" title="镜头取景中心（世界坐标；960, 540 = 画布中心）">
          {round(editing.centerX)}, {round(editing.centerY)}
        </span>
      </div>

      {/* 缩放：± 按钮 + 滑杆。改的都是"正在编辑的那一帧" */}
      <div className="camera-row">
        <span className="camera-label">缩放</span>
        <div className="camera-zoom">
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.25)}
            title="拉远（取景框中心不动）"
            aria-label="拉远"
          >
            −
          </button>
          <span className="camera-zoom-value">{editing.zoom.toFixed(2)}×</span>
          <button
            type="button"
            onClick={() => zoomBy(1.25)}
            title="推近（取景框中心不动）"
            aria-label="推近"
          >
            ＋
          </button>
        </div>
        <div className="camera-slider">
          <input
            type="range"
            min={MIN_CAMERA_ZOOM}
            max={MAX_CAMERA_ZOOM}
            step={0.01}
            value={editing.zoom}
            aria-label="镜头缩放滑块"
            title={`镜头缩放（${MIN_CAMERA_ZOOM}× ~ ${MAX_CAMERA_ZOOM}×；1 = 取景框正好一屏）`}
            onChange={(event) =>
              applyEditing({ ...editing, zoom: Number(event.target.value) })
            }
          />
        </div>
      </div>

      {/*
        操作按钮紧跟取景：属性面板默认只有 ~300px 高，把最常用的
        「播放 / 复位 / 适配 / 铺满」放在运镜参数之前，第一屏就能点到。
      */}
      <div className="camera-actions">
        <button
          type="button"
          className={playback.playing ? "active" : ""}
          onClick={() => (playback.playing ? stop() : playback.play())}
          disabled={!animated}
          title={
            animated
              ? `在世界视图里播一遍运镜（${Math.min(moveFrames, Math.max(1, selectedRecord.durationFrames ?? moveFrames))} 帧）；预览顶部那个「播放」播的是整条成片`
              : "先编辑终点镜头，才有可播的运镜"
          }
        >
          {playback.playing ? "⏹ 停止" : "▶ 播放运镜"}
        </button>
        <button
          type="button"
          onClick={resetCamera}
          title="镜头复位：起点与终点都回到画布中心、1.00×（快捷键 0）"
        >
          复位镜头
        </button>
        <button
          type="button"
          onClick={resetView}
          title="视图适配世界（快捷键 F）：只是看得更远，不改镜头"
        >
          适配视图
        </button>
        <button
          type="button"
          onClick={coverBackground}
          disabled={!coverTarget}
          title={
            coverTarget
              ? "把最上层背景放大到盖住当前取景框（只放大、不缩小、不改 X/Y），给镜头腾出可摇空间"
              : "没有拿得到原图尺寸的背景：先到「背景」页签加一张"
          }
        >
          铺满背景
        </button>
      </div>

      {/* ===== 运镜：缓动 / 时长 / 终点 ===== */}
      <h5>运镜</h5>
      {animated ? (
        <>
          <div className="camera-row">
            <span className="camera-label">缓动</span>
            <select
              className="camera-select"
              value={camera.easing ?? DEFAULT_CAMERA_EASING}
              aria-label="运镜缓动"
              title="起点 → 终点之间的缓动曲线"
              onChange={(event) => setEasing(event.target.value as CameraEasing)}
            >
              {CAMERA_EASINGS.map((easing) => (
                <option key={easing} value={easing}>
                  {EASING_LABELS[easing]}
                </option>
              ))}
            </select>
          </div>

          <div className="camera-row">
            <span className="camera-label">时长</span>
            <input
              type="number"
              className="camera-number"
              min={MIN_CAMERA_MOVE_FRAMES}
              max={MAX_CAMERA_MOVE_FRAMES}
              step={1}
              value={moveDraft ?? String(moveFrames)}
              aria-label="运镜时长（帧）"
              title={`镜头从起点走到终点用多少帧（30fps → 约 ${seconds} 秒；最小 1）`}
              onChange={(event) => updateMoveFrames(event.target.value)}
              onBlur={commitMoveFrames}
            />
            <span className="camera-unit">帧（约 {seconds} 秒）</span>
          </div>

          <div className="camera-row">
            <span className="camera-label">终点</span>
            <span className="camera-value" title="终点镜头（世界坐标）">
              {frameText(endFrame)}
            </span>
          </div>
        </>
      ) : (
        <p className="camera-section-hint">
          还没有终点镜头：选「◇ 终点」再拖一下取景框就会生成运镜（不设终点 = 静止镜头）。
        </p>
      )}

      {/* ===== 预设：镜头层的动态效果（镜头摇动等），由预览/cameraPresets 注册表驱动 ===== */}
      <CameraPresets
        selectedRecord={selectedRecord}
        selectedRecordIndex={selectedRecordIndex}
        updateRecord={updateRecord}
      />

      {/* ===== 世界视图的拖动工具 ===== */}
      <h5>拖动工具</h5>
      <div className="camera-row">
        <span className="camera-label">拖动</span>
        <div className="camera-segmented" role="group" aria-label="拖动工具">
          <SegmentedButton
            active={tool === "camera"}
            onClick={() => setTool("camera")}
            title="拖动 = 移镜（取景框四边永远可拖）；按住 Alt 临时切成移元素"
          >
            🎥 移镜
          </SegmentedButton>
          <SegmentedButton
            active={tool === "elements"}
            onClick={() => setTool("elements")}
            title="拖动 = 挪背景 / 立绘 / 临时图片；按住 Alt 临时切成移镜"
          >
            🖐 移元素
          </SegmentedButton>
        </div>
      </div>
      <p className="camera-section-hint">
        「移元素」可直接拖动背景 / 立绘 / 临时图片；数值仍在各自页签。
      </p>

      {/* ===== 构图辅助：工程级开关（勾一次就一直用，所以放在面板最后） ===== */}
      <h5>构图辅助</h5>
      <label className="camera-follow-toggle">
        <input
          type="checkbox"
          checked={cameraFollowSpeaker}
          onChange={(event) => onCameraFollowSpeakerChange(event.target.checked)}
          aria-label="镜头自动跟随说话人"
          title="工程全局：勾上后，移动说话人立绘 / 切换说话人时自动把镜头对到说话人身上"
        />
        <span>镜头自动跟随说话人</span>
      </label>
      <p className="camera-section-hint">
        工程全局选项：移动说话人立绘 / 切换说话人时自动对焦；手动调整优先。
      </p>
    </div>
  );
};

export default CameraProperties;
