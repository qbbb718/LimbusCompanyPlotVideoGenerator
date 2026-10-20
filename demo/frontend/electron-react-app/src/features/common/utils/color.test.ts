import { normalizeHexColor } from "./color";

describe("颜色工具", () => {
  describe("normalizeHexColor", () => {
    test.each([
      ["#FF8800", "#FF8800"],
      ["#ff8800", "#FF8800"],
      ["ff8800", "#FF8800"],
      ["  #12ab34  ", "#12AB34"],
      ["#F80", "#FF8800"],
      ["f80", "#FF8800"],
      ["#000", "#000000"],
    ])("把 %p 规范成 %p", (input, expected) => {
      expect(normalizeHexColor(input)).toBe(expected);
    });

    test.each([
      "#FF",
      "#FF88001",
      "#FF8800AA",
      "rgb(255, 136, 0)",
      "red",
      "",
      "   ",
      "#GGGGGG",
    ])("拒绝不支持的写法 %p", (input) => {
      expect(normalizeHexColor(input)).toBeNull();
    });

    test("非字符串输入返回 null", () => {
      expect(normalizeHexColor(null)).toBeNull();
      expect(normalizeHexColor(undefined)).toBeNull();
      expect(normalizeHexColor(123 as unknown as string)).toBeNull();
    });
  });
});
