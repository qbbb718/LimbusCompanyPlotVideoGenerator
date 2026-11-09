/**
 * @component 弹窗外壳：把内容通过 React Portal 挂到 `document.body`
 *
 * <h3>为什么属性面板里的弹窗必须挂到 body</h3>
 * 这些弹窗以前直接写在属性面板的组件树里，靠 `position: fixed` 铺满窗口。剧情编辑页
 * 改成可停靠面板（`DockLayout`）之后，这条路走不通了：
 *
 * 1. `.dock-layout` 为了容器查询设了 `container-type: inline-size`，它带 layout containment，
 *    于是 `position: fixed` 的**包含块从视口变成了这块面板区域**；
 * 2. 面板内容挂在 `.dock-panel-host` 上，而它是 `position: absolute` + `z-index`，
 *    自己就是一个层叠上下文 —— 弹窗的 `z-index: 1000` 只能在这块面板内部比大小；
 * 3. 三块面板的 host 是 `.dock-surface` 的兄弟节点，`z-index` 都是 3，**后面的压前面的**。
 *    默认布局里「剧情记录」排在最后、又占了下半屏，于是属性面板里的弹窗下半截被白底面板
 *    直接盖住 —— 看起来就像"弹窗只有个标题、没有内容"。
 *
 * 挂到 body 之后就与面板的包含块、层叠上下文、overflow 全部无关：遮罩真正铺满整个窗口，
 * 面板被拖成浮窗/最大化也不会再影响弹窗。**新加弹窗请一律走这里，不要直接写 fixed 遮罩。**
 */
import React, { useEffect } from "react";
import { createPortal } from "react-dom";

interface ModalPortalProps {
  /** 无障碍名称（挂在 `role="dialog"` 的 aria-label 上） */
  label: string;
  /** 关闭弹窗：点遮罩、按 Esc 都会调到这里 */
  onClose: () => void;
  /** 遮罩层 class（沿用各页签原有的 `xx-selector` / `xx-modal-overlay` 命名） */
  overlayClassName: string;
  /** 对话框本身的 class（原有样式文件里的 `xx-selector-content` / `xx-modal`） */
  dialogClassName: string;
  /** 对话框内部结构由调用方决定（各自的标题栏 / 内容区 / 底栏） */
  children: React.ReactNode;
}

const ModalPortal: React.FC<ModalPortalProps> = ({
  label,
  onClose,
  overlayClassName,
  dialogClassName,
  children,
}) => {
  // Esc 关闭。用捕获阶段 + stopPropagation：弹窗开着的时候它应该是唯一响应 Esc 的东西，
  // 不要把同一次按键再漏给预览播放停止、面板拖拽取消之类的全局 Esc 处理器。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  return createPortal(
    <div className={overlayClassName} onClick={onClose}>
      <div
        className={dialogClassName}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
};

export default ModalPortal;
