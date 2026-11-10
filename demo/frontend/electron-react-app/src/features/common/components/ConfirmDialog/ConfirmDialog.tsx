/**
 * @module 应用内确认框（替代 window.confirm）
 *
 * <h3>为什么不能用原生 window.confirm / alert</h3>
 * Electron 里 `window.confirm` 是**主进程弹出的原生 MessageBox**（Win32 类名 `#32770`），
 * 它会把主进程与渲染进程一起卡住，而且关掉之后**窗口拿不回键盘焦点**：
 * `document.hasFocus()` 一直是 false，点进输入框也没有光标、敲字没有任何反应，
 * 只有重启软件才恢复。实测复现步骤：剧情编辑 → 在「对话内容」打字（正常）→
 * 触发一次原生 confirm → 关掉后再点输入框 / 再敲字（无光标、无输入）。
 *
 * <p>这条经验以前只落在 `alert` 上（见 CharacterModal.css 里"以前这些失败都是 alert()：
 * Electron 里 alert 会抢走焦点，关掉之后输入框就'打不了字'了"），
 * `window.confirm` 一直漏着 —— 资源管理「与默认立绘裁剪一致」点完就弹它，
 * 于是回到剧情编辑页时「对话内容」怎么点都进不去。
 *
 * <h3>用法</h3>
 * 根组件挂一次 {@link ConfirmDialogHost}，任何地方：
 * ```tsx
 * if (!(await askConfirm({ message: "确定删除吗？", danger: true }))) return;
 * ```
 * 需要三个选项时用 {@link askChoice}（例如「保存并新建 / 不保存 / 取消」）：
 * ```tsx
 * const choice = await askChoice({
 *   message: "是否保存当前工程？",
 *   extraLabel: "不保存",
 *   confirmLabel: "保存并新建",
 * });
 * if (choice === "cancel") return;
 * ```
 * 没挂 Host 时（例如单独渲染某个组件的单测）退化成原生 `window.confirm`，行为不变。
 */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./ConfirmDialog.css";

/** 一次确认请求的入参 */
export interface ConfirmOptions {
  /** 标题（不传时用「请确认」） */
  title?: string;
  /** 正文，纯文本 */
  message: string;
  /** 补充说明：长文案 / 换行用，显示在正文下面 */
  detail?: string;
  /** 确定按钮文字，默认「确定」 */
  confirmLabel?: string;
  /** 取消按钮文字，默认「取消」 */
  cancelLabel?: string;
  /** 危险操作（删除类）：确定按钮用红色 */
  danger?: boolean;
}

/**
 * 三选一确认框的入参：在 {@link ConfirmOptions} 之上多一个"次要"按钮。
 *
 * <p>典型用法是「新建工程」问要不要先保存：`extraLabel: "不保存"`、
 * `confirmLabel: "保存并新建"`、`cancelLabel: "取消"`。二选一表达的"是 / 否"
 * 放不下第三种意思，而"点错了就没有退路"的破坏性操作必须留一个取消口。
 */
export interface ChoiceOptions extends ConfirmOptions {
  /** 中间那个"次要"按钮的文字（例如「不保存」）；点了它 resolve 成 "extra" */
  extraLabel: string;
}

/** 三选一的结果：确定 / 次要按钮 / 取消（按 Esc、点遮罩都算取消） */
export type ConfirmChoice = "confirm" | "extra" | "cancel";

interface PendingConfirm extends ConfirmOptions {
  id: number;
  /** 有值时才渲染三个按钮；没有时仍是"确定 / 取消"两个 */
  extraLabel?: string;
  resolve: (choice: ConfirmChoice) => void;
}

/**
 * Host 注册进来的"显示"函数。
 *
 * <p>用模块级变量而不是 Context：调用方常常写在 async 事件处理里，
 * 走 Context 的话每个用到的组件都要包 Provider、单测也要跟着套一层。
 */
let showConfirm:
  | ((options: ConfirmOptions & { extraLabel?: string }) => Promise<ConfirmChoice>)
  | null = null;

/** Host 内部记录"当前是否有确认框在显示" */
let hasOpenConfirm = false;

/**
 * @function 显示应用内确认框（二选一与三选一共用）
 * @param options 标题 / 正文 / 按钮文字 / 是否危险操作 / 次要按钮文字
 * @returns 用户点了哪个按钮
 */
const askDialog = (
  options: ConfirmOptions & { extraLabel?: string },
): Promise<ConfirmChoice> => {
  if (!showConfirm) {
    // 没有挂 Host（单测里常见）：行为与改造前一致。
    // 原生 confirm 只能表达"是 / 否"，三选一里的"次要"按钮拿不到 → 按取消处理。
    return Promise.resolve(window.confirm(options.message) ? "confirm" : "cancel");
  }
  return showConfirm(options);
};

/**
 * @function 弹出应用内确认框（二选一）
 * @param options 标题 / 正文 / 按钮文字 / 是否危险操作
 * @returns 用户点确定 → true；点取消、按 Esc 或点遮罩 → false
 */
export const askConfirm = async (options: ConfirmOptions): Promise<boolean> =>
  (await askDialog(options)) === "confirm";

/**
 * @function 弹出应用内三选一确认框
 * @param options 在 {@link ConfirmOptions} 之外还要给 `extraLabel`（次要按钮文字）
 * @returns "confirm" 确定 / "extra" 次要按钮 / "cancel" 取消（Esc、点遮罩同取消）
 */
export const askChoice = (options: ChoiceOptions): Promise<ConfirmChoice> =>
  askDialog(options);

/** 有没有确认框正在显示（供其它监听 Esc 的地方避让） */
export const isAppConfirmOpen = (): boolean => hasOpenConfirm;

/**
 * @function 确认框宿主
 * 挂在应用根节点一次即可，全局只渲染一个确认框。
 */
export const ConfirmDialogHost: React.FC = () => {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);
  pendingRef.current = pending;
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  // 每次请求自增：同一毫秒内连续两次 askConfirm 也不会互相顶掉
  const idRef = useRef(0);

  // 向模块级 API 注册自己
  useEffect(() => {
    showConfirm = (options) =>
      new Promise<ConfirmChoice>((resolve) => {
        idRef.current += 1;
        setPending({ ...options, id: idRef.current, resolve });
      });
    return () => {
      showConfirm = null;
    };
  }, []);

  // hasOpenConfirm 跟着展示状态走
  useEffect(() => {
    hasOpenConfirm = pending !== null;
    return () => {
      hasOpenConfirm = false;
    };
  }, [pending]);

  // 打开时把焦点放到「确定」上：键盘用户直接回车即可
  useEffect(() => {
    if (!pending) return;
    confirmButtonRef.current?.focus();
  }, [pending]);

  // Esc 取消 / Enter 确认（捕获阶段，避免漏给下层的全局 Esc 处理器）
  useEffect(() => {
    if (!pending) return undefined;

    const settleFromKey = (choice: ConfirmChoice) => {
      setPending((current) => {
        if (current) current.resolve(choice);
        return null;
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        settleFromKey("cancel");
        return;
      }
      // 焦点在按钮上时 Enter 由浏览器点按钮；焦点丢了就兜底一次
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        settleFromKey("confirm");
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [pending]);

  /** 关闭并把结果交给等待方（只结算一次） */
  const settle = (choice: ConfirmChoice) => {
    setPending((current) => {
      if (current) current.resolve(choice);
      return null;
    });
  };

  if (!pending) return null;

  return createPortal(
    <div
      className="app-confirm-overlay"
      data-testid="app-confirm-overlay"
      onClick={() => settle("cancel")}
    >
      <div
        className="app-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={pending.title || "请确认"}
        onClick={(event) => event.stopPropagation()}
      >
        <h3>{pending.title || "请确认"}</h3>
        <p className="app-confirm-message">{pending.message}</p>
        {pending.detail && <p className="app-confirm-detail">{pending.detail}</p>}
        <div className="app-confirm-actions">
          <button
            type="button"
            className="app-confirm-cancel"
            onClick={() => settle("cancel")}
          >
            {pending.cancelLabel || "取消"}
          </button>
          {pending.extraLabel && (
            <button
              type="button"
              className="app-confirm-extra"
              onClick={() => settle("extra")}
            >
              {pending.extraLabel}
            </button>
          )}
          <button
            type="button"
            ref={confirmButtonRef}
            className={
              pending.danger
                ? "app-confirm-ok app-confirm-ok-danger"
                : "app-confirm-ok"
            }
            onClick={() => settle("confirm")}
          >
            {pending.confirmLabel || "确定"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ConfirmDialogHost;
