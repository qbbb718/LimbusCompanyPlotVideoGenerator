/**
 * @module 摄像机编辑器状态（「摄像机」页签 + 世界视图共用）
 *
 * 摄像机的编辑分成两个界面、共用一份状态：
 * 1. **「摄像机」属性页签**（`properties/CameraProperties.tsx`）：起止帧、缓动、运镜帧数、
 *    播放、复位、铺满背景、拖动工具…全部控件都在这里；
 * 2. **预览区里的世界视图**（`CameraModeView.tsx`）：在没渲染 UI 的世界画布上直接拖动取景框。
 *
 * 两个界面必须看到同一份状态——"正在编辑哪一帧、拖动工具是移镜还是移元素、视图缩放多少、
 * 播放头走到哪"，否则会出现"页签里选的是终点、画布里拖的却是起点"这类错位。
 * 本 Hook 就是这份状态的唯一真源，由 RecordEditor 持有一份，分别下发给页签与预览。
 *
 * <p>注意这里只管**状态**：镜头数值的归一化、取景框、缓动曲线、世界夹取都在
 * `cameraView.ts` / `previewLayout.ts` 的纯函数里（各有单测），本 Hook 不重复实现。
 *
 * @see cameraView 镜头求值（cameraAt / withKeyframe / cameraRectOf …）
 * @see useCameraPlayback 播放头（按帧推进，与成片同一套进度公式）
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RecordCamera } from "./previewLayout";
import {
  IDENTITY_CAMERA,
  cameraAt,
  cameraKeyframe,
  cameraMoveFrames,
  cameraProgressOf,
  isAnimatedCamera,
  normalizeCamera,
  withKeyframe,
} from "./cameraView";
import type { CameraEasing, CameraKeyframe } from "./cameraView";
import { useCameraPlayback } from "./useCameraPlayback";
import type { CameraPlayback } from "./useCameraPlayback";

/** 正在编辑哪一帧镜头：起点（记录本身的 centerX/centerY/zoom）还是终点（`to`） */
export type CameraKeyframeSide = "start" | "end";

/**
 * 世界视图的拖动工具。
 *
 * 「移元素」是**临时**手段：为了在看着取景框构图的同时把背景/立绘挪两下，
 * 不用来回切页签。常驻工具仍是移镜。
 */
export type CameraTool = "camera" | "elements";

/** 运镜帧数的合法范围（与后端 Camera.moveFrames 的夹取一致） */
export const MIN_CAMERA_MOVE_FRAMES = 1;
export const MAX_CAMERA_MOVE_FRAMES = 9999;

/** 「摄像机」页签与世界视图共用的摄像机编辑状态 */
export interface CameraEditor {
  /** 当前记录的镜头（已归一化；没有镜头时是恒等镜头） */
  camera: RecordCamera;
  /** 正在编辑哪一帧 */
  keyframe: CameraKeyframeSide;
  setKeyframe: (which: CameraKeyframeSide) => void;
  /** 正在编辑的那一帧镜头（拖动、滚轮、缩放按钮改的都是它） */
  editing: CameraKeyframe;
  /** 取景框此刻该画在哪：播放时是插值结果，静止时等于 {@link editing} */
  shown: CameraKeyframe;
  /** 镜头会动吗（有终点且与起点不同） */
  animated: boolean;
  /** 运镜时长（帧，默认 24） */
  moveFrames: number;
  /** 运镜时长输入框的草稿：null = 不在编辑，显示真实值 */
  moveDraft: string | null;
  /** 输入运镜时长：记草稿，合法时立刻写回记录（输入过程中允许暂时为空） */
  updateMoveFrames: (raw: string) => void;
  /** 输入框失焦：丢掉草稿，显示记录里的真实值 */
  commitMoveFrames: () => void;
  /** 播放头（「▶ 播放」播一遍运镜） */
  playback: CameraPlayback;
  /** 停播：一动手就要停，否则镜头一边被动画推、一边被手推 */
  stop: () => void;
  /** 写回"正在编辑的那一帧"（拖动取景框、滚轮推拉、缩放按钮都走它） */
  applyEditing: (frame: CameraKeyframe) => void;
  /** 改缓动（只在有运镜时有意义） */
  setEasing: (easing: CameraEasing) => void;
  /** 镜头复位：起点与终点一起回到画布中心、1.00× */
  resetCamera: () => void;
  /** 世界视图的拖动工具 */
  tool: CameraTool;
  setTool: (tool: CameraTool) => void;
  /** 视图缩放（相对"刚好放下世界"的倍数）：只是编辑时看得更近，**不进记录** */
  viewZoom: number;
  /** 视图平移（CSS 像素），同样不进记录 */
  pan: { x: number; y: number };
  setViewZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  /** 视图适配世界（快捷键 F） */
  resetView: () => void;
}

/**
 * @function 摄像机编辑状态
 * @param camera         当前记录的镜头（原始值，未归一化）
 * @param durationFrames 当前记录的时长（帧）：记录比运镜还短时，「播放」只播记录那几帧
 * @param onCameraChange 写回记录（由 RecordEditor 提供，内部会并入撤销栈）
 * @param resetKey       记录标识（uuid）：换记录时把"编辑终点 / 视图缩放 / 草稿"复位
 * @return 页签与世界视图共用的状态与操作
 */
export function useCameraEditor(
  camera: RecordCamera | undefined,
  durationFrames: number,
  onCameraChange: (camera: RecordCamera) => void,
  resetKey?: string,
): CameraEditor {
  const normalized = useMemo(() => normalizeCamera(camera), [camera]);

  const [keyframe, setKeyframe] = useState<CameraKeyframeSide>("start");
  const [tool, setTool] = useState<CameraTool>("camera");
  const [viewZoom, setViewZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [moveDraft, setMoveDraft] = useState<string | null>(null);

  const animated = isAnimatedCamera(normalized);
  const moveFrames = cameraMoveFrames(normalized);
  /** 记录比运镜还短时按记录播（与导出一样会被截断） */
  const playFrames =
    durationFrames > 0 ? Math.min(moveFrames, durationFrames) : moveFrames;
  const playback = useCameraPlayback(playFrames);
  const stop = playback.stop;

  const editing = cameraKeyframe(normalized, keyframe);
  /** 播放时取景框走插值，否则停在被编辑的那一帧 */
  const shown =
    playback.t != null
      ? cameraAt(normalized, cameraProgressOf(playback.elapsedFrames, moveFrames))
      : editing;

  /**
   * 换记录：回到"起点"、停播、丢掉草稿。
   *
   * <p>上一条记录选中的是终点，对新记录没有意义（新记录通常还没有终点）；
   * 视图缩放与拖动工具属于习惯，跨记录保留。
   */
  useEffect(() => {
    setKeyframe("start");
    setMoveDraft(null);
    stop();
  }, [resetKey, stop]);

  const applyEditing = useCallback(
    (next: CameraKeyframe) => onCameraChange(withKeyframe(camera, keyframe, next)),
    [camera, keyframe, onCameraChange],
  );

  const setEasing = useCallback(
    (easing: CameraEasing) => onCameraChange({ ...normalizeCamera(camera), easing }),
    [camera, onCameraChange],
  );

  const updateMoveFrames = useCallback(
    (raw: string) => {
      setMoveDraft(raw);
      const next = Math.round(Number(raw));
      if (!Number.isFinite(next) || next < MIN_CAMERA_MOVE_FRAMES) return;
      onCameraChange({
        ...normalizeCamera(camera),
        moveFrames: Math.min(MAX_CAMERA_MOVE_FRAMES, next),
      });
    },
    [camera, onCameraChange],
  );

  const commitMoveFrames = useCallback(() => setMoveDraft(null), []);

  const resetCamera = useCallback(() => {
    stop();
    setMoveDraft(null);
    onCameraChange(IDENTITY_CAMERA);
  }, [onCameraChange, stop]);

  const resetView = useCallback(() => {
    setViewZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  return {
    camera: normalized,
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
    viewZoom,
    pan,
    setViewZoom,
    setPan,
    resetView,
  };
}
