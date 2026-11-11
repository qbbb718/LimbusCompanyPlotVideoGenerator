import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  isInteractiveClickTarget,
  normalizeIndexes,
  useBatchSelection,
} from "./batchSelection";
import { BatchCardCheckbox, BatchSelectionBar } from "./BatchSelectionBar";

/**
 * 批量选择的公共设施（四个素材页签共用）：
 * - 勾选 / 全选 / 取消全选 / 取消选择的语义；
 * - 列表变短（删掉一条）时越界下标要自动丢掉，换记录（resetKey 变）时清空；
 * - 「点卡片 = 预览选中」只该在卡片本体上生效，不能被按钮 / 输入框抢走。
 */

/** 探针：把 hook 的状态渲染成可断言的小面板 */
const Probe: React.FC<{ total: number; resetKey?: string }> = ({
  total,
  resetKey,
}) => {
  const batch = useBatchSelection(total, resetKey);
  return (
    <div>
      <BatchSelectionBar
        label="立绘"
        total={total}
        selectedCount={batch.count}
        onToggleAll={batch.toggleAll}
        onClear={batch.clear}
        onDelete={() => undefined}
        previewHint="点卡片定位预览"
      />
      {Array.from({ length: total }, (_, index) => (
        <BatchCardCheckbox
          key={index}
          checked={batch.has(index)}
          label={`选择立绘 ${index + 1}`}
          onToggle={() => batch.toggle(index)}
        />
      ))}
      <span data-testid="indexes">{batch.indexes.join(",")}</span>
      <span data-testid="flags">
        {`${batch.allSelected ? "all" : ""}${
          batch.partiallySelected ? "part" : ""
        }`}
      </span>
    </div>
  );
};

const selectAllCheckbox = () =>
  screen.getByText(/全选|取消全选/).querySelector(
    'input[type="checkbox"]',
  ) as HTMLInputElement;

describe("useBatchSelection 勾选语义", () => {
  test("勾两项：出现「批量删除」，全选复选框是半选态", () => {
    render(<Probe total={3} />);

    // 未勾选时只有「全选」，没有「批量删除」
    expect(screen.queryByRole("button", { name: /批量删除/ })).toBeNull();

    fireEvent.click(screen.getByLabelText("选择立绘 1"));
    fireEvent.click(screen.getByLabelText("选择立绘 3"));

    expect(screen.getByTestId("indexes").textContent).toBe("0,2");
    expect(screen.getByTestId("flags").textContent).toBe("part");
    expect(screen.getByText("已选 2 / 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: /批量删除/ }).textContent).toContain(
      "2",
    );
    expect(selectAllCheckbox().indeterminate).toBe(true);
  });

  test("全选 / 取消全选来回切换，按钮文案跟着变", () => {
    render(<Probe total={3} />);

    fireEvent.click(selectAllCheckbox());
    expect(screen.getByTestId("indexes").textContent).toBe("0,1,2");
    expect(screen.getByTestId("flags").textContent).toBe("all");
    expect(screen.getByText("取消全选")).toBeTruthy();
    expect(selectAllCheckbox().indeterminate).toBe(false);

    fireEvent.click(selectAllCheckbox());
    expect(screen.getByTestId("indexes").textContent).toBe("");
    expect(screen.getByText("全选")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /批量删除/ })).toBeNull();
  });

  test("「取消选择」清空勾选，但不动素材数量", () => {
    render(<Probe total={2} />);

    fireEvent.click(screen.getByLabelText("选择立绘 1"));
    fireEvent.click(screen.getByRole("button", { name: "取消选择" }));

    expect(screen.getByTestId("indexes").textContent).toBe("");
    expect(screen.getByLabelText("选择立绘 1")).toBeTruthy();
  });

  test("列表变短（删掉一条）时越界下标自动丢掉", () => {
    const { rerender } = render(<Probe total={3} />);

    fireEvent.click(screen.getByLabelText("选择立绘 2"));
    fireEvent.click(screen.getByLabelText("选择立绘 3"));
    expect(screen.getByTestId("indexes").textContent).toBe("1,2");

    rerender(<Probe total={2} />);
    expect(screen.getByTestId("indexes").textContent).toBe("1");
  });

  test("换记录（resetKey 变）时清空勾选", () => {
    const { rerender } = render(<Probe total={2} resetKey="r1" />);

    fireEvent.click(screen.getByLabelText("选择立绘 1"));
    expect(screen.getByTestId("indexes").textContent).toBe("0");

    rerender(<Probe total={2} resetKey="r2" />);
    expect(screen.getByTestId("indexes").textContent).toBe("");
  });
});

describe("normalizeIndexes", () => {
  test("去重、升序、丢掉越界与小数", () => {
    expect(normalizeIndexes([2, 0, 2, -1, 3, 1.5], 3)).toEqual([0, 2]);
    expect(normalizeIndexes([], 3)).toEqual([]);
    expect(normalizeIndexes([1], 0)).toEqual([]);
  });
});

describe("isInteractiveClickTarget", () => {
  test("按钮 / 输入框算控件，普通容器与标题不算", () => {
    render(
      <div>
        <button id="button" />
        <input id="input" />
        <select id="select" />
        <span data-card-click-ignore="1" id="ignored" />
        <div id="plain">
          <span id="nested" />
        </div>
      </div>,
    );

    expect(
      isInteractiveClickTarget(document.getElementById("button")),
    ).toBe(true);
    expect(isInteractiveClickTarget(document.getElementById("input"))).toBe(
      true,
    );
    expect(isInteractiveClickTarget(document.getElementById("select"))).toBe(
      true,
    );
    expect(isInteractiveClickTarget(document.getElementById("ignored"))).toBe(
      true,
    );
    expect(
      isInteractiveClickTarget(document.getElementById("nested")),
    ).toBe(false);
    expect(isInteractiveClickTarget(document.getElementById("plain"))).toBe(
      false,
    );
    expect(isInteractiveClickTarget(null)).toBe(false);
  });
});
