import React from "react";
import ReactDOM from "react-dom/client";
import "@features/app/index.css";
import App from "@features/app";
import AppElectron from "@features/app/App_electron";
import reportWebVitals from "@features/common/reportWebVitals";

// 检测是否在Electron环境中运行
const isElectron =
  window.navigator.userAgent.toLowerCase().indexOf("electron") > -1;

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);
root.render(
  <React.StrictMode>{isElectron ? <AppElectron /> : <App />}</React.StrictMode>,
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
