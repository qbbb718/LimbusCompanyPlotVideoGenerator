/**
 * 预览的「播放」按钮。
 *
 * 锁的是一条反馈规则：**没有动画时点 ▶ 不能静默无反应**。
 * 以前按钮是 `disabled`，用户点下去屏幕一动不动，被当成软件卡顿（真实反馈）。
 * 现在按钮可点，点了在按钮下方给出"为什么没反应"的说明。
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import RecordPreview from "./RecordPreview";
import ApiService from "@services/ApiService";

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
