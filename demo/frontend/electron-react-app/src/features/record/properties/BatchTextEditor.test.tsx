/**
 * 「文本」页签的批量编辑面板（选中 2 条以上记录时替换单条表单）：
 * - 输入框初值取选中记录的**共同值**，不一致时留空并提示"多条记录不同"；
 * - 每项都是「填值 → 点应用」，整批一次写完；点完要有结果反馈（改了几条 / 没变化）；
 * - 自由文本没有说话人名片：说话人 / 阵营会跳过它们，面板要说明跳过了几条；
 * - 对话内容两种改法：统一设置（整段替换）与查找替换（先显示影响范围）；
 * - 「只编辑当前记录」= 退出批量（交给上层的 exit）。
 *
 * 这里用真实的改写器 + 一个把改动应用到记录数组的 apply 桩，
 * 所以断言到的是"最终写下去的值"，而不只是"apply 被调用过"。
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { DialogueAlign, Emotion, Record as PlotRecord } from "@types";
import BatchTextEditor from "./BatchTextEditor";
import type { BatchEditContext, RecordMutator } from "./batchEdit";

const makeRecord = (
  uuid: string,
  overrides: {
    text?: string;
    speakerName?: string;
    faction?: string;
    location?: string;
    speed?: number;
    freeText?: boolean;
  } = {},
): PlotRecord => ({
  uuid,
  durationFrames: 30,
  dialogue: {
    text: overrides.text ?? `${uuid} 的台词`,
    location: overrides.location ?? "default",
    speakerC: [],
    speakerName: overrides.speakerName ?? "浮士德",
    faction: overrides.faction ?? "N公司",
    align: DialogueAlign.LEFT,
    speed: overrides.speed ?? 3,
    emotion: Emotion.NORMAL,
    freeText: overrides.freeText === true,
  },
  bg: [],
  chars: [],
  tempImages: [],
  effects: [],
  audioCommands: [],
});

/**
 * 渲染批量面板。
 *
 * <p>`apply` 桩做真实的事：把改写器逐条套到记录上、数出真正变化的条数
 * （与 RecordEditor.applyBatchEdit 的口径一致），这样断言可以直接看记录内容。
 */
const renderPanel = (
  records: PlotRecord[],
  onOpenGlobalSpeed?: () => void,
) => {
  let current = records;
  const apply = jest.fn((mutate: RecordMutator) => {
    let changed = 0;
    current = current.map((record) => {
      const next = mutate(record);
      if (next !== record) changed += 1;
      return next;
    });
    return changed;
  });
  const exit = jest.fn();
  const batch: BatchEditContext = {
    records,
    indexes: records.map((_, index) => index),
    apply,
    exit,
  };

  render(<BatchTextEditor batch={batch} onOpenGlobalSpeed={onOpenGlobalSpeed} />);

  return {
    apply,
    exit,
    /** 面板写回之后的记录 */
    records: () => current,
  };
};

const byLabel = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe("批量文本面板：初值与提示", () => {
  test("显示已选中条数与会写回哪几条的说明", () => {
    renderPanel([makeRecord("a"), makeRecord("b"), makeRecord("c")]);

    expect(screen.getByText("批量编辑")).toBeTruthy();
    expect(screen.getByText("已选中 3 条记录")).toBeTruthy();
    expect(screen.getByText(/下面的修改会同时写入选中的 3 条记录/)).toBeTruthy();
  });

  test("输入框初值取选中记录的共同值", () => {
    renderPanel([
      makeRecord("a", { text: "同一句台词" }),
      makeRecord("b", { text: "同一句台词" }),
    ]);

    expect(byLabel("说话人名称")).toHaveValue("浮士德");
    expect(byLabel("说话人阵营")).toHaveValue("N公司");
    expect(byLabel("场景名称")).toHaveValue("default");
    expect(
      (screen.getByLabelText("对话内容") as HTMLTextAreaElement).value,
    ).toBe("同一句台词");
  });

  test("值不一致时输入框留空，并用占位文字说明", () => {
    renderPanel([
      makeRecord("a", { speakerName: "浮士德" }),
      makeRecord("b", { speakerName: "辛克莱" }),
    ]);

    expect(byLabel("说话人名称")).toHaveValue("");
    expect(byLabel("说话人名称").placeholder).toContain("多条记录不同");
  });

  test("自由文本记录：提示会被跳过；全是自由文本时说话人输入框禁用", () => {
    renderPanel([
      makeRecord("a", { freeText: true }),
      makeRecord("b", { freeText: true }),
    ]);

    expect(screen.getByText(/其中 2 条是「自由文本」/)).toBeTruthy();
    expect(byLabel("说话人名称")).toBeDisabled();
    expect(byLabel("说话人阵营")).toBeDisabled();
    expect(screen.getByRole("button", { name: "说话人名称：应用到 0 条" })).toBeDisabled();
  });

  test("部分自由文本：说话人按钮只算可改的那些条", () => {
    renderPanel([
      makeRecord("a", { freeText: true }),
      makeRecord("b"),
      makeRecord("c"),
    ]);

    expect(screen.getByRole("button", { name: "说话人名称：应用到 2 条" })).toBeTruthy();
    // 台词 / 场景 / 速度对自由文本同样生效 → 三条都能改
    expect(screen.getAllByRole("button", { name: /：应用到 3 条$/ })).toHaveLength(3);
  });
});

describe("批量文本面板：改说话人与场景", () => {
  test("改说话人名称：三条记录一起写回，并给出结果反馈", () => {
    const panel = renderPanel([
      makeRecord("a", { speakerName: "浮士德" }),
      makeRecord("b", { speakerName: "浮士德" }),
    ]);

    fireEvent.change(byLabel("说话人名称"), { target: { value: " 辛克莱 " } });
    fireEvent.click(screen.getByRole("button", { name: "说话人名称：应用到 2 条" }));

    expect(panel.records().map((record) => record.dialogue.speakerName)).toEqual([
      "辛克莱",
      "辛克莱",
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("已修改 2 条记录");
  });

  test("说话人名称留空时不能应用（不猜用户想清成什么）", () => {
    renderPanel([makeRecord("a"), makeRecord("b")]);

    fireEvent.change(byLabel("说话人名称"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "说话人名称：应用到 2 条" })).toBeDisabled();
  });

  test("改阵营：留空 = 清空阵营", () => {
    const panel = renderPanel([makeRecord("a"), makeRecord("b")]);

    fireEvent.change(byLabel("说话人阵营"), { target: { value: "" } });
    fireEvent.click(
      screen.getByRole("button", { name: "说话人阵营：应用到 2 条" }),
    );

    expect(panel.records().map((record) => record.dialogue.faction)).toEqual([
      "",
      "",
    ]);
  });

  test("改场景名称：三条记录一起写回", () => {
    const panel = renderPanel([makeRecord("a"), makeRecord("b"), makeRecord("c")]);

    fireEvent.change(byLabel("场景名称"), { target: { value: "N公司走廊" } });
    fireEvent.click(screen.getByRole("button", { name: "场景名称：应用到 3 条" }));

    expect(panel.records().map((record) => record.dialogue.location)).toEqual([
      "N公司走廊",
      "N公司走廊",
      "N公司走廊",
    ]);
  });

  test("没有变化时给出中性提示（不是错误）", () => {
    const panel = renderPanel([makeRecord("a", { text: "同一句" }), makeRecord("b", { text: "同一句" })]);

    // 统一设置成同一段已经存在的台词 → apply 数不到改动
    fireEvent.change(screen.getByLabelText("对话内容"), {
      target: { value: "同一句" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "对话内容：应用到 2 条" }),
    );

    expect(panel.apply).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("没有变化");
  });
});

describe("批量文本面板：对话内容", () => {
  test("统一设置：整段替换所有选中记录的台词", () => {
    const panel = renderPanel([makeRecord("a"), makeRecord("b")]);

    fireEvent.change(screen.getByLabelText("对话内容"), {
      target: { value: "第一行\n第二行" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "对话内容：应用到 2 条" }),
    );

    expect(panel.records().map((record) => record.dialogue.text)).toEqual([
      "第一行\n第二行",
      "第一行\n第二行",
    ]);
  });

  test("切到查找替换：先显示影响范围，再只替换命中的文字", () => {
    const panel = renderPanel([
      makeRecord("a", { text: "露比说：甲乙甲" }),
      makeRecord("b", { text: "与甲无关" }),
      makeRecord("c", { text: "没有命中" }),
    ]);

    fireEvent.click(screen.getByRole("radio", { name: "查找替换" }));
    fireEvent.change(screen.getByLabelText("查找内容"), { target: { value: "甲" } });
    fireEvent.change(screen.getByLabelText("替换为"), { target: { value: "丙" } });

    expect(screen.getByText("将在 2 条记录里替换 3 处")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "对话内容：替换" }));

    expect(panel.records().map((record) => record.dialogue.text)).toEqual([
      "露比说：丙乙丙",
      "与丙无关",
      "没有命中",
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("已修改 2 条记录");
  });

  test("查找内容为空时不能替换；没命中时提示找不到", () => {
    renderPanel([makeRecord("a"), makeRecord("b")]);

    fireEvent.click(screen.getByRole("radio", { name: "查找替换" }));
    expect(screen.getByRole("button", { name: "对话内容：替换" })).toBeDisabled();
    expect(screen.getByText(/会先算出影响范围/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("查找内容"), { target: { value: "不存在的字" } });
    expect(screen.getByText("选中的记录里没有找到这段文字")).toBeTruthy();
    expect(screen.getByRole("button", { name: "对话内容：替换" })).not.toBeDisabled();
  });

  test("区分大小写开关会影响影响范围", () => {
    renderPanel([makeRecord("a", { text: "Faust" }), makeRecord("b", { text: "faust" })]);

    fireEvent.click(screen.getByRole("radio", { name: "查找替换" }));
    fireEvent.change(screen.getByLabelText("查找内容"), { target: { value: "faust" } });
    expect(screen.getByText("将在 2 条记录里替换 2 处")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("区分大小写"));
    expect(screen.getByText("将在 1 条记录里替换 1 处")).toBeTruthy();
  });
});

describe("批量文本面板：显示速度与退出", () => {
  test("拖滑杆后应用：三条记录的速度一起改", () => {
    const panel = renderPanel([
      makeRecord("a", { speed: 2 }),
      makeRecord("b", { speed: 3 }),
    ]);

    // 速度不一致：提示用的是第一条的档位
    expect(screen.getByText(/速度不一致/)).toBeTruthy();

    fireEvent.change(byLabel("显示速度"), { target: { value: "5" } });
    expect(screen.getByText("5")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "显示速度：应用到 2 条" }),
    );

    expect(panel.records().map((record) => record.dialogue.speed)).toEqual([5, 5]);
  });

  test("速度一致时按钮禁用（点也是空操作）", () => {
    renderPanel([makeRecord("a", { speed: 3 }), makeRecord("b", { speed: 3 })]);
    expect(screen.getByText(/都是 3 档/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "显示速度：应用到 2 条" }),
    ).toBeDisabled();
  });

  test("「全局显示速度设置」入口与单条面板一致（传了才显示）", () => {
    const onOpenGlobalSpeed = jest.fn();
    const panel = renderPanel([makeRecord("a"), makeRecord("b")], onOpenGlobalSpeed);

    fireEvent.click(screen.getByRole("button", { name: /全局显示速度设置/ }));
    expect(onOpenGlobalSpeed).toHaveBeenCalledTimes(1);
  });

  test("「只编辑当前记录」交给上层（退出批量）", () => {
    const panel = renderPanel([makeRecord("a"), makeRecord("b")]);

    fireEvent.click(screen.getByRole("button", { name: "只编辑当前记录" }));
    expect(panel.exit).toHaveBeenCalledTimes(1);
  });
});
