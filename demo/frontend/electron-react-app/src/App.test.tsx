import React from "react";
import { render, screen } from "@testing-library/react";
import App from "@features/app";

test("renders app main", () => {
  render(<App />);
  // smoke test: ensure app renders some container
  const el = document.querySelector(".app-container");
  expect(el).not.toBeNull();
});
