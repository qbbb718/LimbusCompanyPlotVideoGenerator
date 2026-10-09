/**
 * @component 工程提示条
 * 保存/导入工程后显示一行文字提示（非弹窗），几秒后自动消失，也可点击立即关闭。
 * 渲染在 App 层，所以无论当前在哪个页面（剧情编辑 / 资源管理 …）都能看到。
 */
import React from "react";
import "./ProjectToast.css";
import { ProjectToastMessage } from "./useProjectWorkspace";

interface ProjectToastProps {
  toast: ProjectToastMessage | null;
  onDismiss: () => void;
}

const ProjectToast: React.FC<ProjectToastProps> = ({ toast, onDismiss }) => {
  if (!toast) return null;

  return (
    <div
      className={`project-toast project-toast-${toast.kind}`}
      role="status"
      title="点击关闭"
      onClick={onDismiss}
    >
      {toast.text}
    </div>
  );
};

export default ProjectToast;
