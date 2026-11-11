import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import CameraModeView from "./CameraModeView";
import { useCameraEditor } from "./useCameraEditor";
import type { PreviewLayer, PreviewRect } from "./previewLayout";

/**
 * 世界视图里的「选中框」：
 *
 * <p>属性面板点卡片 → 素材在取景之外 → 预览临时切到世界视图。走进来时拖动工具仍是「移镜」，
 * 热区层（负责画 `.preview-hit.selected`）并没挂载，所以世界视图必须自己补一层
 * **不可交互**的选中框，否则用户看不到自己刚点的是哪张素材。
 */

const worldRef: PreviewRect = { x: 0, y: 0, w: 1920, h: 1080 };
const worldBox: PreviewRect = { x: -1920, y: -1080, w: 5760, h: 3240 };

const makeLayer = (): PreviewLayer => ({
  key: "character:0",
  kind: "character",
  index: 0,
  label: "立绘 1 · 罗佳",
  z: 100,
  space: "world",
  baseRect: { x: 960, y: 221, w: 400, h: 600 },
  outRect: { x: 960, y: 221, w: 400, h: 600 },
});

/** 用真实的 useCameraEditor：世界视图要的正是这份共享状态 */
const Harness: React.FC<{ selectedKey: string | null }> = ({ selectedKey }) => {
  const editor = useCameraEditor(undefined, 30, () => undefined, "r1");
  return (
    <div>
      <button type="button" onClick={() => editor.setTool("elements")}>
        切到移元素
      </button>
      <div style={{ position: "relative", width: 640, height: 360 }}>
        <CameraModeView
          layers={[makeLayer()]}
          worldRef={worldRef}
          worldBox={worldBox}
          sceneImages={{}}
          stageSize={{ width: 640, height: 360 }}
          selectedKey={selectedKey}
          editor={editor}
          onSelectLayer={() => undefined}
          getLayerPosition={() => null}
          onLayerDragStart={() => undefined}
          onLayerMove={() => undefined}
          onLayerDragEnd={() => undefined}
          onLayerDragCancel={() => undefined}
        />
      </div>
    </div>
  );
};

describe("摄像机世界视图 → 选中素材的描边", () => {
  test("selectedKey 指向的世界图层会画出选中框", () => {
    render(<Harness selectedKey="character:0" />);

    const outline = screen.getByTestId("camera-selected-outline");
    expect(outline.className).toContain("camera-selected-outline");
    expect(outline.getAttribute("title")).toContain("立绘 1 · 罗佳");
  });

  test("没有选中（或 key 不匹配）时不画", () => {
    const { rerender } = render(<Harness selectedKey={null} />);
    expect(screen.queryByTestId("camera-selected-outline")).toBeNull();

    rerender(<Harness selectedKey="character:9" />);
    expect(screen.queryByTestId("camera-selected-outline")).toBeNull();
  });

  test("「移元素」工具下不重复画：热区层自己会画选中框", () => {
    render(<Harness selectedKey="character:0" />);
    expect(screen.getByTestId("camera-selected-outline")).toBeTruthy();

    fireEvent.click(screen.getByText("切到移元素"));
    expect(screen.queryByTestId("camera-selected-outline")).toBeNull();
  });
});
