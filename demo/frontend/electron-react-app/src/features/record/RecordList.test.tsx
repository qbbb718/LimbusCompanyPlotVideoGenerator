/* eslint-disable testing-library/no-node-access --
   jsdom 里没有真实布局，拖动测试必须拿到 <tr> 本身派发 drag 事件，
   分组行也没有可直接查询的 role（表头由 div 拼成），这里直接用 DOM 查询。 */
/**
 * 剧情列表分组：UI 交互测试（新建 / 重命名 / 折叠 / 解散 / 拖动记录进分组）。
 * jsdom 没有真实布局，拖动位置用 fireEvent 的 clientY + 默认 0 高度的矩形来覆盖
 *（0 高度时指针默认在"上半" → 插到目标记录前面）。
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import RecordList from "./RecordList";
import { RecordGroup } from "./recordGroups";
import { useRecordMultiSelect } from "./useRecordMultiSelect";
import { DialogueAlign, Emotion, Record } from "@types";

const makeRecord = (uuid: string, text: string, groupId?: string): Record => ({
  uuid,
  durationFrames: 30,
  groupId,
  dialogue: {
    text,
    location: "default",
    speakerC: [],
    speakerName: "",
    faction: "",
    align: DialogueAlign.LEFT,
    speed: 3,
    emotion: Emotion.NORMAL,
    freeText: true,
    hideUI: true,
  },
  bg: [],
  chars: [],
  tempImages: [],
  effects: [],
  audioCommands: [],
});

const makeGroup = (
  id: string,
  name: string,
  collapsed = false,
): RecordGroup => ({ id, name, collapsed });

const records: Record[] = [
  makeRecord("a", "a 的内容"),
  makeRecord("b", "b 的内容", "g1"),
  makeRecord("c", "c 的内容", "g1"),
  makeRecord("d", "d 的内容"),
];

const groups = [makeGroup("g1", "开头")];

/** 构造一份带 jest mock 的完整 props */
const makeProps = (overrides: { [key: string]: unknown } = {}) => ({
  records,
  groups,
  selectedRecordIndex: 0,
  setSelectedRecordIndex: jest.fn(),
  createNewRecord: jest.fn(),
  onCreateGroup: jest.fn(() => makeGroup("g-new", "分组 2")),
  onRenameGroup: jest.fn(),
  onToggleGroup: jest.fn(),
  onDissolveGroup: jest.fn(),
  onMoveRecords: jest.fn(),
  onMoveGroup: jest.fn(),
  generateVideo: jest.fn(),
  moveRecord: jest.fn(),
  duplicateRecord: jest.fn(),
  deleteRecord: jest.fn(),
  onNewProject: jest.fn(),
  onSaveProject: jest.fn(),
  onImportProject: jest.fn(),
  projectFileName: null,
  isGenerating: false,
  ...overrides,
});

/**
 * 多选状态不在列表组件里，由编辑器层（RecordEditor）持有：
 * 测试里用一个壳组件提供它，这样点行 → 选中态更新 → 列表重渲染的链路与真实一致。
 */
const Harness: React.FC<{ base: ReturnType<typeof makeProps> }> = ({
  base,
}) => {
  const multiSelection = useRecordMultiSelect(
    base.records,
    base.selectedRecordIndex,
    base.setSelectedRecordIndex,
  );
  return <RecordList {...base} multiSelection={multiSelection} />;
};

/** 渲染剧情列表（带上真实的多选 hook） */
const renderList = (base: ReturnType<typeof makeProps>) =>
  render(<Harness base={base} />);

/** 拖动事件用到的 dataTransfer 桩 */
const makeDataTransfer = () => ({
  effectAllowed: "",
  dropEffect: "",
  setData: jest.fn(),
  getData: jest.fn(),
});

const rowOf = (text: string): HTMLElement =>
  screen.getByText(text).closest("tr") as HTMLElement;

const groupRow = (id: string): HTMLElement =>
  document.querySelector(`[data-group-id="${id}"]`) as HTMLElement;

/**
 * jsdom 没有 DragEvent，testing-library 的 fireEvent 造出来的事件不带 clientY。
 * 这里用原生 MouseEvent 派发 dragover/drop（React 的 drag 事件同样是鼠标事件），
 * 这样才能测到"落在行的上半/下半区"。
 */
const fireDragOverAt = (element: HTMLElement, clientY: number) => {
  fireEvent(
    element,
    new MouseEvent("dragover", {
      bubbles: true,
      cancelable: true,
      clientY,
    }),
  );
};

const fireDropAt = (element: HTMLElement, clientY: number) => {
  fireEvent(
    element,
    new MouseEvent("drop", {
      bubbles: true,
      cancelable: true,
      clientY,
    }),
  );
};

describe("剧情编辑 → 剧情列表分组", () => {
  test("新建分组按钮紧挨添加记录按钮，并且都在标题旁", () => {
    renderList(makeProps());

    const title = document.querySelector(".record-list-title");
    expect(title?.querySelector(".add-record-btn")).toBeTruthy();
    expect(title?.querySelector(".add-group-btn")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "新建分组" }),
    ).toHaveTextContent("📁+");
  });

  test("点新建分组后立刻进入重命名状态（默认名已填好）", () => {
    const props = makeProps();
    const { rerender } = renderList(props);

    fireEvent.click(screen.getByRole("button", { name: "新建分组" }));
    expect(props.onCreateGroup).toHaveBeenCalledTimes(1);

    // 父组件把新分组写入 state 后重新渲染，输入框应处于编辑状态
    rerender(
      <Harness
        base={{ ...props, groups: [...groups, makeGroup("g-new", "分组 2")] }}
      />,
    );
    const input = screen.getByLabelText("分组名称");
    expect(input).toHaveValue("分组 2");
  });

  test("双击分组名 / 点 ✏️ 都能重命名，回车提交、Esc 取消", () => {
    const props = makeProps();
    renderList(props);

    fireEvent.doubleClick(screen.getByText("开头"));
    const input = screen.getByLabelText("分组名称");

    fireEvent.change(input, { target: { value: "  新的开头  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onRenameGroup).toHaveBeenCalledWith("g1", "新的开头");
    expect(screen.queryByLabelText("分组名称")).toBeNull();

    // Esc 取消：不提交改名
    fireEvent.click(
      screen.getByRole("button", { name: "重命名分组 开头" }),
    );
    fireEvent.change(screen.getByLabelText("分组名称"), {
      target: { value: "不要保存" },
    });
    fireEvent.keyDown(screen.getByLabelText("分组名称"), { key: "Escape" });
    expect(props.onRenameGroup).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("分组名称")).toBeNull();
  });

  test("折叠按钮回调；折叠后组内记录不显示，但表头显示条数", () => {
    const props = makeProps({
      groups: [makeGroup("g1", "开头", true)],
    });
    renderList(props);

    expect(screen.queryByText("b 的内容")).toBeNull();
    expect(screen.getByText("2 条")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "展开分组 开头" }),
    );
    expect(props.onToggleGroup).toHaveBeenCalledWith("g1");
  });

  test("解散分组按钮回调", () => {
    const props = makeProps();
    renderList(props);

    fireEvent.click(
      screen.getByRole("button", { name: "解散分组 开头" }),
    );
    expect(props.onDissolveGroup).toHaveBeenCalledWith("g1");
  });

  test("空分组显示为「空分组」", () => {
    renderList(makeProps({ groups: [makeGroup("empty", "空的")] }));

    expect(screen.getByText("空分组")).toBeTruthy();
  });

  test("把一条记录拖到分组表头：整体移入该分组", () => {
    const props = makeProps();
    renderList(props);
    const dataTransfer = makeDataTransfer();

    fireEvent.dragStart(rowOf("a 的内容"), { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "a");

    fireEvent.dragOver(groupRow("g1"), { dataTransfer });
    fireEvent.drop(groupRow("g1"), { dataTransfer });

    expect(props.onMoveRecords).toHaveBeenCalledWith(["a"], {
      kind: "group",
      groupId: "g1",
    });
  });

  test("把记录拖到另一条记录前面：按插入位置移动（不换分组）", () => {
    const props = makeProps();
    renderList(props);
    const dataTransfer = makeDataTransfer();

    fireEvent.dragStart(rowOf("a 的内容"), { dataTransfer });
    fireEvent.dragOver(rowOf("d 的内容"), { dataTransfer });
    fireEvent.drop(rowOf("d 的内容"), { dataTransfer });

    expect(props.onMoveRecords).toHaveBeenCalledWith(["a"], {
      kind: "record",
      uuid: "d",
      position: "before",
    });
  });

  test("Ctrl 多选后拖动：一次把所有选中记录交给上层", () => {
    const props = makeProps();
    renderList(props);
    const dataTransfer = makeDataTransfer();

    fireEvent.click(screen.getByText("a 的内容"), { ctrlKey: true });
    fireEvent.click(screen.getByText("c 的内容"), { ctrlKey: true });

    fireEvent.dragStart(rowOf("a 的内容"), { dataTransfer });
    fireEvent.dragOver(groupRow("g1"), { dataTransfer });
    fireEvent.drop(groupRow("g1"), { dataTransfer });

    expect(props.onMoveRecords).toHaveBeenCalledWith(["a", "c"], {
      kind: "group",
      groupId: "g1",
    });
  });

  test("拖动时出现末尾放置区，可把记录移出分组", async () => {
    const props = makeProps();
    renderList(props);
    const dataTransfer = makeDataTransfer();

    fireEvent.dragStart(rowOf("b 的内容"), { dataTransfer });
    const dropEnd = await screen.findByText(
      "拖到这里：移出分组 / 放到列表末尾",
    );
    fireEvent.dragOver(dropEnd, { dataTransfer });
    fireEvent.drop(dropEnd, { dataTransfer });

    expect(props.onMoveRecords).toHaveBeenCalledWith(["b"], { kind: "end" });
  });

  test("点击记录切换当前记录（预览/属性面板跟随）", () => {
    const props = makeProps();
    renderList(props);

    fireEvent.click(screen.getByText("b 的内容"));
    expect(props.setSelectedRecordIndex).toHaveBeenCalledWith(1);
  });

  test("Shift 连选：把锚点与点击位置之间的记录全部选中", () => {
    const props = makeProps({ selectedRecordIndex: 1 });
    renderList(props);
    const dataTransfer = makeDataTransfer();

    fireEvent.click(screen.getByText("d 的内容"), { shiftKey: true });
    expect(props.setSelectedRecordIndex).toHaveBeenCalledWith(3);

    // 从 b（锚点）连选到 d
    fireEvent.dragStart(rowOf("b 的内容"), { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "b,c,d");
  });

  test("当前记录有明显的选中标记，每行都有拖拽手柄", () => {
    renderList(makeProps({ selectedRecordIndex: 1 }));

    const selectedRow = rowOf("b 的内容");
    expect(selectedRow.className).toContain("selected");
    expect(selectedRow.querySelector(".selected-dot")).toBeTruthy();
    expect(rowOf("a 的内容").className).not.toContain("selected");

    expect(rowOf("a 的内容").querySelector(".row-drag-handle")).toBeTruthy();
    expect(groupRow("g1").querySelector(".group-drag-handle")).toBeTruthy();
  });

  test("多选但非当前记录的行有独立的选中标记", () => {
    renderList(makeProps({ selectedRecordIndex: 0 }));

    fireEvent.click(screen.getByText("c 的内容"), { ctrlKey: true });

    const multiRow = rowOf("c 的内容");
    expect(multiRow.className).toContain("multi-selected");
    expect(multiRow.classList.contains("selected")).toBe(false);
    expect(multiRow.querySelector(".multi-selected-dot")).toBeTruthy();
    expect(multiRow.querySelector(".selected-dot")).toBeNull();

    // 当前记录仍是实心蓝点
    expect(rowOf("a 的内容").querySelector(".selected-dot")).toBeTruthy();
  });

  test("分组在第一行时，记录可以拖到列表最上方", async () => {
    const groupFirst: Record[] = [
      makeRecord("b", "b 的内容", "g1"),
      makeRecord("c", "c 的内容", "g1"),
      makeRecord("d", "d 的内容"),
    ];
    const props = makeProps({ records: groupFirst, selectedRecordIndex: 0 });
    renderList(props);
    const dataTransfer = makeDataTransfer();

    fireEvent.dragStart(rowOf("d 的内容"), { dataTransfer });
    const dropStart = await screen.findByText(
      "拖到这里：放到列表最前面（移出分组）",
    );
    // 顶部放置区在滚动容器外面、紧贴列表上沿：
    // 长列表滚动到中间时它也不会跟着滚走（否则用户根本够不到）
    const zone = dropStart.closest(".record-list-drop-start");
    const scroller = document.querySelector(".record-list");
    expect(zone).toBeTruthy();
    expect(scroller?.contains(zone)).toBe(false);
    expect(zone).toBe(scroller?.previousElementSibling);

    fireDragOverAt(dropStart, 0);
    fireDropAt(dropStart, 0);
    expect(props.onMoveRecords).toHaveBeenCalledWith(["d"], { kind: "start" });
  });

  test("分组本身可以拖到列表最上方", async () => {
    const props = makeProps();
    renderList(props);
    const dataTransfer = makeDataTransfer();

    fireEvent.dragStart(groupRow("g1"), { dataTransfer });
    const dropStart = await screen.findByText(
      "拖到这里：把分组放到列表最前面",
    );

    fireDragOverAt(dropStart, 0);
    fireDropAt(dropStart, 0);
    expect(props.onMoveGroup).toHaveBeenCalledWith("g1", { kind: "start" });
  });

  test("拖动记录时源行淡出（拖动反馈）", () => {
    renderList(makeProps());
    const dataTransfer = makeDataTransfer();

    fireEvent.dragStart(rowOf("a 的内容"), { dataTransfer });
    expect(rowOf("a 的内容").className).toContain("drag-source");
  });

  test("dragstart 不在同一轮渲染里把放置区插到源行上方（否则浏览器会取消拖拽）", async () => {
    renderList(makeProps());
    const sourceRow = rowOf("a 的内容");

    fireEvent.dragStart(sourceRow, { dataTransfer: makeDataTransfer() });

    // dragstart 处理结束时：列表第一行仍是源行，顶部放置区还没有插进来。
    // Chromium 在 dragstart 里发现源行上方多出节点会直接取消整个拖拽（拖不动），
    // 所以这里必须延后到下一轮事件循环。
    expect(document.querySelector("tbody tr")).toBe(sourceRow);
    expect(
      screen.queryByText("拖到这里：放到列表最前面（移出分组）"),
    ).toBeNull();

    // 下一轮渲染才出现放置区，此时拖拽已经开始，不会被浏览器取消
    expect(
      await screen.findByText("拖到这里：放到列表最前面（移出分组）"),
    ).toBeTruthy();
  });

  test("拖动分组表头：按目标记录所在的块插入", () => {
    const props = makeProps();
    renderList(props);
    const dataTransfer = makeDataTransfer();

    fireEvent.dragStart(groupRow("g1"), { dataTransfer });
    expect(groupRow("g1").className).toContain("drag-source");

    // 指针落在 d 的下半区 → 放到 d 所在的块后面
    fireDragOverAt(rowOf("d 的内容"), 18);
    expect(rowOf("d 的内容").className).toContain("drop-after");
    fireDropAt(rowOf("d 的内容"), 18);

    expect(props.onMoveGroup).toHaveBeenCalledWith("g1", {
      kind: "record",
      uuid: "d",
      position: "after",
    });
  });

  test("分组可拖到列表末尾；空分组可拖到两条内容中间", async () => {
    const props = makeProps({
      groups: [...groups, makeGroup("empty", "空分组")],
    });
    renderList(props);

    // 有内容的分组拖到末尾
    const dataTransfer = makeDataTransfer();
    fireEvent.dragStart(groupRow("g1"), { dataTransfer });
    const dropEnd = await screen.findByText("拖到这里：把分组放到列表末尾");
    fireEvent.dragOver(dropEnd, { dataTransfer });
    fireEvent.drop(dropEnd, { dataTransfer });
    expect(props.onMoveGroup).toHaveBeenCalledWith("g1", { kind: "end" });

    // 空分组拖到第一条记录前面
    const dataTransfer2 = makeDataTransfer();
    fireEvent.dragStart(groupRow("empty"), { dataTransfer: dataTransfer2 });
    fireDragOverAt(rowOf("a 的内容"), 0);
    fireDropAt(rowOf("a 的内容"), 0);
    expect(props.onMoveGroup).toHaveBeenLastCalledWith("empty", {
      kind: "record",
      uuid: "a",
      position: "before",
    });
  });

  test("从分组表头的按钮/输入框起拖不会误触发分组排序", () => {
    const props = makeProps();
    renderList(props);
    const dataTransfer = makeDataTransfer();

    fireEvent.dragStart(
      screen.getByRole("button", { name: "重命名分组 开头" }),
      { dataTransfer },
    );

    expect(dataTransfer.setData).not.toHaveBeenCalled();
    expect(props.onMoveGroup).not.toHaveBeenCalled();
  });
});

describe("剧情编辑 → 工程操作（新建 / 导入 / 保存）", () => {
  test("「新建工程」按钮在工具条里，点击交给上层（真正的询问在上层）", () => {
    const props = makeProps();
    renderList(props);

    const button = screen.getByRole("button", { name: "新建工程" });
    // 与导入 / 保存并排，且排在最前面（破坏性操作不挨着「导出视频」）
    const actions = document.querySelector(".record-list-actions") as HTMLElement;
    expect(actions.firstElementChild).toBe(button);
    expect(button.getAttribute("title")).toContain("是否保存当前工程");

    fireEvent.click(button);
    expect(props.onNewProject).toHaveBeenCalledTimes(1);
  });
});

describe("剧情编辑 → 剧情列表多选（批量修改的前提）", () => {
  test("标题旁有「全选」：点一下全选（徽标显示条数），再点变「取消选择」", () => {
    renderList(makeProps());

    // 未多选时没有徽标
    expect(screen.queryByText(/已选 \d+ 条/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "全选" }));
    expect(screen.getByText(`已选 ${records.length} 条`)).toBeTruthy();
    expect(screen.getByRole("button", { name: "取消选择" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "取消选择" }));
    expect(screen.queryByText(/已选 \d+ 条/)).toBeNull();
    expect(screen.getByRole("button", { name: "全选" })).toBeTruthy();
  });

  test("Ctrl 再点已选中的行 = 从批量里摘掉这一条", () => {
    renderList(makeProps());

    fireEvent.click(screen.getByText("c 的内容"), { ctrlKey: true });
    expect(screen.getByText("已选 2 条")).toBeTruthy();
    expect(rowOf("c 的内容").className).toContain("multi-selected");

    // 再 Ctrl 点一次：取消勾选
    fireEvent.click(screen.getByText("c 的内容"), { ctrlKey: true });
    expect(rowOf("c 的内容").className).not.toContain("multi-selected");
    expect(screen.queryByText(/已选 \d+ 条/)).toBeNull();
  });

  test("Shift 连选后徽标显示选中条数", () => {
    renderList(makeProps({ selectedRecordIndex: 0 }));

    fireEvent.click(screen.getByText("c 的内容"), { shiftKey: true });
    // a → b → c 连着三条
    expect(screen.getByText("已选 3 条")).toBeTruthy();
  });

  test("「全选」后拖动任意一行：一次把所有记录交给上层", () => {
    const props = makeProps();
    renderList(props);
    const dataTransfer = makeDataTransfer();

    fireEvent.click(screen.getByRole("button", { name: "全选" }));
    fireEvent.dragStart(rowOf("c 的内容"), { dataTransfer });

    expect(dataTransfer.setData).toHaveBeenCalledWith(
      "text/plain",
      "a,b,c,d",
    );
  });
});
