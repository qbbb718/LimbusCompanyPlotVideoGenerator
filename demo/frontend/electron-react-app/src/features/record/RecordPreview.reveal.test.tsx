import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import RecordPreview from "./RecordPreview";
import ApiService from "@services/ApiService";
import { useCameraEditor } from "./preview/useCameraEditor";

/**
 * 属性面板点卡片 → 预览定位（`revealRequest`）：
 *
 * <p>成片视图只显示取景框里的内容。素材在画面里看得到 → 留在成片（选中框由热区层画）；
 * 看不到（被拖出画面 / 推镜后跑出取景框）→ **临时切到世界视图**把它显示出来，
 * 世界视图里补一层选中框（见 CameraModeView.test）。用户点「回到成片」或选中态换人即退出。
 */

// 几何计算要原图尺寸。jsdom 里 Image 不会真的加载，这里直接给每张图一个固定尺寸，
// 让立绘能被算成矩形（否则几何里根本没有这一层，定位逻辑无从验证）。
jest.mock("./preview/useImageSizes", () => ({
  useImageSizes: (urls: string[]) => ({
    sizes: Object.fromEntries(
      urls.filter(Boolean).map((url) => [url, { width: 400, height: 600 }]),
    ),
    pending: 0,
  }),
}));

/** 一条带立绘的记录；adjX 决定它落在画面里还是画面外 */
const recordWithCharacter = (adjX: number): any => ({
  uuid: "r1",
  durationFrames: 30,
  dialogue: { text: "台词", speakerName: "旁白" },
  bg: [],
  chars: [
    {
      chara: { characterID: "c1", characterName: "罗佳", height: 171 },
      portrait: {
        portraitID: "p1",
        imagePath: "characters/c1/p1.png",
        length: 183,
        faceX: 0,
        faceY: 0,
        adjX: 0,
        adjY: 0,
        thumbnailPath: "",
      },
      posX: 960,
      posY: 0,
      adjX,
      adjY: 0,
      scale: 1,
      dim: false,
    },
  ],
  tempImages: [],
  effects: [],
  audioCommands: [],
});

const VISIBLE_ADJ_X = 0;
/** 拖到画面左边很远：成片里完全看不到 */
const OFFSCREEN_ADJ_X = -6000;

interface HarnessProps {
  adjX: number;
  selectedKey: string | null;
  reveal: { key: string; nonce: number } | null;
}

/** 挂上 useCameraEditor 的预览（世界视图需要这份共享状态） */
const Harness: React.FC<HarnessProps> = ({ adjX, selectedKey, reveal }) => {
  const record = recordWithCharacter(adjX);
  const editor = useCameraEditor(
    record.camera,
    record.durationFrames,
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
      selectedElementKey={selectedKey}
      revealRequest={reveal}
      viewMode="effect"
      cameraEditor={editor}
    />
  );
};

beforeEach(() => {
  jest.spyOn(ApiService, "getRecordPreview").mockResolvedValue("blob:preview");
  // jsdom 没有实现 object URL：组件卸载时会 release 预览图
  (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL =
    jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("预览定位：素材在画面里", () => {
  test("只保留成片视图，不切世界视图（高亮交给热区层）", async () => {
    render(
      <Harness
        adjX={VISIBLE_ADJ_X}
        selectedKey="character:0"
        reveal={{ key: "character:0", nonce: 1 }}
      />,
    );

    expect(await screen.findByText(/最终效果/)).toBeTruthy();
    expect(screen.queryByText(/世界视图/)).toBeNull();
    expect(screen.queryByTestId("camera-selected-outline")).toBeNull();
  });
});

describe("预览定位：素材在取景之外", () => {
  test("自动切到世界视图，并把选中的素材画出来", async () => {
    render(
      <Harness
        adjX={OFFSCREEN_ADJ_X}
        selectedKey="character:0"
        reveal={{ key: "character:0", nonce: 1 }}
      />,
    );

    // 世界视图（CameraModeView）挂载：状态标签 + 取景框 + 选中框
    expect(await screen.findByText(/世界视图/)).toBeTruthy();
    expect(screen.getByText("🎥 1.00×")).toBeTruthy();
    expect(screen.getByTestId("camera-selected-outline")).toBeTruthy();
  });

  test("点「回到成片」退回成片视图（世界视图卸载、选中框收起）", async () => {
    render(
      <Harness
        adjX={OFFSCREEN_ADJ_X}
        selectedKey="character:0"
        reveal={{ key: "character:0", nonce: 1 }}
      />,
    );
    expect(await screen.findByText(/世界视图/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /回到成片/ }));

    expect(await screen.findByText(/最终效果/)).toBeTruthy();
    expect(screen.queryByText(/世界视图/)).toBeNull();
    expect(screen.queryByTestId("camera-selected-outline")).toBeNull();
  });

  test("选中态换成别的元素时自动退出临时世界视图", async () => {
    const { rerender } = render(
      <Harness
        adjX={OFFSCREEN_ADJ_X}
        selectedKey="character:0"
        reveal={{ key: "character:0", nonce: 1 }}
      />,
    );
    expect(await screen.findByText(/世界视图/)).toBeTruthy();

    // 用户点了别的东西（预览里点中背景 / 点空白）：选中 key 变了
    // 定位请求的 nonce 不变（= 不是新的一次定位），只验证"选中换人 → 退出临时世界视图"
    rerender(
      <Harness
        adjX={OFFSCREEN_ADJ_X}
        selectedKey="background:0"
        reveal={{ key: "character:0", nonce: 1 }}
      />,
    );

    expect(await screen.findByText(/最终效果/)).toBeTruthy();
    expect(screen.queryByText(/世界视图/)).toBeNull();
  });

  test("同一个定位请求（nonce 不变）不会被重复处理", async () => {
    const reveal = { key: "character:0", nonce: 1 };
    const { rerender } = render(
      <Harness adjX={OFFSCREEN_ADJ_X} selectedKey="character:0" reveal={reveal} />,
    );
    expect(await screen.findByText(/世界视图/)).toBeTruthy();

    // 退出之后再渲染同一个请求：不应又被切走
    fireEvent.click(screen.getByRole("button", { name: /回到成片/ }));
    expect(await screen.findByText(/最终效果/)).toBeTruthy();

    rerender(
      <Harness adjX={OFFSCREEN_ADJ_X} selectedKey="character:0" reveal={reveal} />,
    );
    expect(screen.queryByText(/世界视图/)).toBeNull();
  });
});

describe("没有定位请求时行为不变", () => {
  test("revealRequest 为空：即使素材在画面外也留在成片视图", async () => {
    render(
      <Harness adjX={OFFSCREEN_ADJ_X} selectedKey="character:0" reveal={null} />,
    );

    expect(await screen.findByText(/最终效果/)).toBeTruthy();
    expect(screen.queryByText(/世界视图/)).toBeNull();
  });
});
