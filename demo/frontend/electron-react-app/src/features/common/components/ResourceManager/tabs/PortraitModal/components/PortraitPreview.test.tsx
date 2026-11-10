import React from "react";
import { render } from "@testing-library/react";
import { Portrait } from "@types";
import PortraitPreview from "./PortraitPreview";
import type { PortraitPreviewHandle } from "./PortraitPreview";

/**
 * 裁剪器的命令式接口。
 *
 * <p>「按截图校准」算出来的裁剪框必须经 {@link PortraitPreviewHandle} 交给裁剪器，
 * 所以这里钉住"ref 真的透传进来了"——`memo(forwardRef(...))` 少包一层就会静默失效：
 * 界面上点「写回裁剪框」毫无反应，只有保存时才发现裁剪值还是旧的。
 */
describe("立绘裁剪器 ref 接口", () => {
  const portrait: Portrait = {
    portraitID: "p1",
    characterID: "c1",
    imagePath: "c1/p1.png",
    portName: "罗佳-常服",
    emotion: "NORMAL" as Portrait["emotion"],
    faceX: 100,
    faceY: 20,
    length: 300,
    adjX: 0,
    adjY: 0,
    thumbnailPath: "",
  };

  test("ref 拿得到 applyCropRect", () => {
    const ref = React.createRef<PortraitPreviewHandle>();
    render(
      <PortraitPreview
        ref={ref}
        portraitPreview={null}
        currentPortrait={portrait}
        onCropComplete={jest.fn()}
        handleImageLoad={jest.fn()}
      />,
    );

    expect(ref.current).not.toBeNull();
    expect(typeof ref.current?.applyCropRect).toBe("function");
  });
});
