import React from "react";
import { render, screen } from "@testing-library/react";
import App from "@features/app";

test("renders app main", async () => {
  render(<App />);
  // 应用初始化（后端健康检查 / 音频初始化）是异步的，先等主界面出现再断言，
  // 否则会在"正在初始化应用..."那一帧就断言不到主容器。
  await screen.findByRole(
    "button",
    { name: /剧情编辑/ },
    { timeout: 5000 },
  );
  // smoke test: ensure app renders the main container
  // （@features/app 指向 App_electron，主容器 class 是 .App，不是浏览器版的 .app-container）
  expect(screen.getByRole("main")).toBeTruthy();
});
