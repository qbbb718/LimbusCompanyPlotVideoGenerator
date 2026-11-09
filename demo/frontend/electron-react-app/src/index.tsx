import React from "react";
import ReactDOM from "react-dom/client";
import "@features/app/index.css";
import App from "@features/app";
import AppElectron from "@features/app/App_electron";
import { ConfirmDialogHost } from "@features/common/components/ConfirmDialog";
import reportWebVitals from "@features/common/reportWebVitals";

// 检测是否在Electron环境中运行
const isElectron =
  window.navigator.userAgent.toLowerCase().indexOf("electron") > -1;

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);
root.render(
  <React.StrictMode>
    {isElectron ? <AppElectron /> : <App />}
    {/* 全应用只挂一个应用内确认框：替代 window.confirm。
        Electron 里原生 confirm 关掉之后窗口拿不回键盘焦点（点输入框没光标、
        打字没反应，只能重启），详见 ConfirmDialog.tsx 的说明。 */}
    <ConfirmDialogHost />
  </React.StrictMode>,
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
