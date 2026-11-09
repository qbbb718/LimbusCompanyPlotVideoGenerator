/**
 * 预览的「播放」按钮 + 摄像机世界视图。
 *
 * 锁两条反馈规则：
 * 1. **没有动画时点 ▶ 不能静默无反应**——以前按钮是 `disabled`，用户点下去屏幕一动不动，
 *    被当成软件卡顿（真实反馈）。现在按钮可点，点了在按钮下方给出"为什么没反应"的说明；
 * 2. **摄像机是一个页签**：预览上不再有「🎥 摄像机」按钮，`viewMode` 由 RecordEditor 按页签传入；
 *    世界视图里没有 ▶ 播放（那个按钮播的是成片），也不发预览图请求。
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import RecordPreview from "./RecordPreview";
import ApiService from "@services/ApiService";
import { useCameraEditor } from "./preview/useCameraEditor";

const baseRecord = (patch: Record<string, any> = {}): any => ({
  uuid: "r1",
  durationFrames: 30,
  dialogue: { text: "台词", speakerName: "旁白" },
  bg: [],
  chars: [],
  tempImages: [],
  effects: [],
  audioCommands: [],
  ...patch,
});

/** 一条会动的记录：立绘上挂了无限循环的弹跳 */
const animatedRecord = (): any =>
  baseRecord({
    chars: [
      {
        chara: { characterID: "c1", characterName: "罗佳" },
        portrait: { portraitID: "p1", length: 183, faceX: 0, faceY: 0 },
        adjX: 0,
        adjY: 0,
        scale: 1,
        anim: {
          version: 1,
          timebase: { unit: "frame", fps: 30 },
          clips: [
            {
              id: "clip-1",
              kind: "preset",
              preset: "bounce",
              durationFrames: 60,
              loop: "loop",
              params: { amplitude: 24, periodFrames: 18 },
            },
          ],
        },
      },
    ],
  });

beforeEach(() => {
  // 预览图/时长都走后端：单测里直接给出固定返回，避免真的发请求
  jest.spyOn(ApiService, "getRecordPreview").mockResolvedValue("blob:preview");
  jest.spyOn(ApiService, "getRecordDuration").mockResolvedValue({
    frames: 78,
    audioFrames: 0,
    textFrames: 3,
    animationFrames: 0,
    stayFrames: 75,
    frameRate: 30,
  });
  // jsdom 没有实现 object URL：预览图拿到的是 "blob:preview"，卸载时会 release 它
  (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL =
    jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const renderPreview = (record: any) =>
  render(
    <RecordPreview
      selectedRecord={record}
      videoWidth={640}
      videoHeight={360}
      plot
      records={[record]}
      selectedRecordIndex={0}
      setSelectedRecordIndex={() => undefined}
    />,
  );

describe("预览播放按钮", () => {
  test("没有动画时点击给出说明文字（而不是静默无反应）", () => {
    renderPreview(baseRecord());

    fireEvent.click(screen.getByRole("button", { name: /播放/ }));

    const hint = screen.getByRole("status");
    expect(hint.textContent).toContain("没有镜头动画");
    expect(hint.textContent).toContain("「立绘」");
    // 不该真的进播放态（画面没有可动的东西）
    expect(screen.queryByRole("button", { name: /停止/ })).toBeNull();
  });

  test("有立绘动画时点击真的开始播（按钮变成停止）", () => {
    renderPreview(animatedRecord());

    fireEvent.click(screen.getByRole("button", { name: /播放/ }));

    expect(screen.getByRole("button", { name: /停止/ })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

/* ===================== 摄像机：世界视图由页签驱动 ===================== */

/** 挂上 useCameraEditor 的预览：世界视图需要这份共享状态（真实链路里由 RecordEditor 持有） */
const PreviewWithCamera: React.FC<{
  record: any;
  viewMode: "effect" | "camera";
}> = ({ record, viewMode }) => {
  const editor = useCameraEditor(
    record.camera,
    record.durationFrames ?? 30,
    () => undefined,
    record.uuid,
  );
  return (
    <RecordPreview
      selectedRecord={record}
      videoWidth={640}
      videoHeight={360}
      plot
      records={[record]}
      selectedRecordIndex={0}
      setSelectedRecordIndex={() => undefined}
      viewMode={viewMode}
      cameraEditor={editor}
    />
  );
};

describe("预览 → 摄像机世界视图（页签驱动）", () => {
  test("预览上不再有「🎥 摄像机」按钮（已经整体迁到右侧页签）", () => {
    renderPreview(baseRecord());

    expect(screen.getByText(/最终效果/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /摄像机/ })).toBeNull();
  });

  test("viewMode=camera：显示世界视图与取景框，并且**也有**播放按钮", () => {
    render(<PreviewWithCamera record={baseRecord()} viewMode="camera" />);

    expect(screen.getByText(/世界视图/)).toBeTruthy();
    // 世界视图里的取景框读数（只出现在 CameraModeView 里 = 世界视图真的挂上了）
    expect(screen.getByText("🎥 1.00×")).toBeTruthy();
    // 「播放」在两种视图里都有：世界视图里点它是预览成片（见下一个用例）
    expect(screen.getByRole("button", { name: /播放/ })).toBeTruthy();
    // 也不请求后端渲成片：镜头一动记录就变，每动一下都重渲纯属浪费
    expect(ApiService.getRecordPreview).not.toHaveBeenCalled();
  });

  test("viewMode=effect：照旧是成片 + 播放按钮", () => {
    render(<PreviewWithCamera record={baseRecord()} viewMode="effect" />);

    expect(screen.getByText(/最终效果/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /播放/ })).toBeTruthy();
  });
});

describe("世界视图里的播放（预览成片）", () => {
  /** 有运镜的记录：播放按钮才是"可播"的 */
  const movingCameraRecord = (): any =>
    baseRecord({
      camera: {
        centerX: 960,
        centerY: 540,
        zoom: 1,
        to: { centerX: 480, centerY: 540, zoom: 1.5 },
        easing: "linear",
        moveFrames: 24,
      },
    });

  test("点播放 → 切到成片预览；停止后回到世界视图", async () => {
    render(<PreviewWithCamera record={movingCameraRecord()} viewMode="camera" />);

    // 世界视图：取景框读数在
    expect(screen.getByText("🎥 1.00×")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /播放/ }));

    // 播放中：临时切成片预览（世界视图让位），状态标签跟着变
    expect(await screen.findByText(/成片预览中/)).toBeTruthy();
    expect(screen.queryByText("🎥 1.00×")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /停止/ }));

    // 停止：回到世界视图，取景框读数又出现了
    expect(await screen.findByText(/世界视图/)).toBeTruthy();
    expect(screen.getByText("🎥 1.00×")).toBeTruthy();
  });

  test("没有可播的东西时点播放只给说明，不切视图", () => {
    render(<PreviewWithCamera record={baseRecord()} viewMode="camera" />);

    fireEvent.click(screen.getByRole("button", { name: /播放/ }));

    expect(screen.getByRole("status").textContent).toContain("没有镜头动画");
    // 还在世界视图
    expect(screen.getByText(/世界视图/)).toBeTruthy();
    expect(screen.getByText("🎥 1.00×")).toBeTruthy();
  });

  test("只开了镜头摇动也算可播：点了同样能进成片预览", async () => {
    const record = baseRecord({
      effects: [
        { type: "CAMERA_SHAKE", enabled: true, amplitude: 12, periodFrames: 4 },
      ],
    });
    render(<PreviewWithCamera record={record} viewMode="camera" />);

    const play = screen.getByRole("button", { name: /播放/ });
    expect(play.getAttribute("aria-disabled")).toBe("false");

    fireEvent.click(play);
    expect(await screen.findByText(/成片预览中/)).toBeTruthy();
  });
});
