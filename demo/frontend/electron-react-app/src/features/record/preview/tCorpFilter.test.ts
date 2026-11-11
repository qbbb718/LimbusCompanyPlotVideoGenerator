import {
  EFFECT_TYPE_T_CORP_FILTER,
  EffectVisual,
} from "@types";
import {
  T_CORP_FILTER_ID,
  T_CORP_FILTER_LUMA,
  T_CORP_FILTER_RGB,
  T_CORP_FILTER_STEPS,
  isTCorpFilterEnabled,
  tCorpFilterUrl,
  tCorpTableValues,
  tCorpTables,
  toggleTCorpFilter,
} from "./tCorpFilter";

/**
 * T 巢滤镜（画面层调色）的数据层：
 * - 曲线表与后端 `TCorpFilter` 同一份控制点、同一套算法（期望值取后端的实测结果）；
 * - 生效判断与写回形状与其它纯开关特效一致（`{type, enabled:true}` / 删掉这一条）；
 * - SVG 滤镜的 tableValues 必须是 256 个 0~1 的数，且与后端 8bit 表只差舍入。
 */

const withEffects = (...effects: EffectVisual[]) => effects;

describe("tCorpFilter 曲线", () => {
  it("控制点成对：亮度递增、颜色 0~255", () => {
    expect(T_CORP_FILTER_LUMA).toHaveLength(T_CORP_FILTER_RGB.length);
    for (let i = 1; i < T_CORP_FILTER_LUMA.length; i++) {
      expect(T_CORP_FILTER_LUMA[i]).toBeGreaterThan(T_CORP_FILTER_LUMA[i - 1]);
    }
    T_CORP_FILTER_RGB.forEach(([r, g, b]) => {
      [r, g, b].forEach((v) => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      });
    });
  });

  it("256 级表：端点与后端一致（纯黑 → 7,3,0；纯白 → 251,233,210）", () => {
    const { r, g, b } = tCorpTables();

    expect(r).toHaveLength(T_CORP_FILTER_STEPS);
    expect(r[0]).toBe(7);
    expect(g[0]).toBe(3);
    expect(b[0]).toBe(0);

    expect(r[255]).toBe(251);
    expect(g[255]).toBe(233);
    expect(b[255]).toBe(210);
  });

  it("全程单调且始终是暖色（R ≥ G ≥ B）——与后端 TCorpFilterTest 同一组断言", () => {
    const { r, g, b } = tCorpTables();

    for (let i = 1; i < T_CORP_FILTER_STEPS; i++) {
      expect(r[i]).toBeGreaterThanOrEqual(r[i - 1]);
      expect(g[i]).toBeGreaterThanOrEqual(g[i - 1]);
      expect(b[i]).toBeGreaterThanOrEqual(b[i - 1]);
    }
    for (let i = 0; i < T_CORP_FILTER_STEPS; i++) {
      expect(r[i]).toBeGreaterThanOrEqual(g[i]);
      expect(g[i]).toBeGreaterThanOrEqual(b[i]);
    }
  });

  it("中段暖色偏接近实测的 44（两点线性只有约 25，差别肉眼可见）", () => {
    const { r, b } = tCorpTables();
    expect(r[128] - b[128]).toBeGreaterThanOrEqual(38);
  });

  it("tableValues 是 256 个归一化到 0~1 的数（SVG 只认这个格式）", () => {
    const tables = tCorpTableValues();

    ["r", "g", "b"].forEach((channel) => {
      const values = tables[channel as "r" | "g" | "b"].split(" ");
      expect(values).toHaveLength(T_CORP_FILTER_STEPS);
      values.forEach((raw) => {
        const value = Number(raw);
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      });
    });

    // 首尾与后端 8bit 表对得上（6 位小数 ≈ 0.5/255 以内的误差）
    const first = Number(tables.r.split(" ")[0]);
    expect(first).toBeCloseTo(7 / 255, 5);
  });

  it("表只算一次（返回同一个缓存对象，避免每帧重算）", () => {
    expect(tCorpTables()).toBe(tCorpTables());
  });

  it("滤镜 URL 指到约定的 id", () => {
    expect(tCorpFilterUrl()).toBe(`url(#${T_CORP_FILTER_ID})`);
    expect(T_CORP_FILTER_ID).toBe("dsh-t-corp-filter");
  });
});

describe("tCorpFilter 开关", () => {
  it("序列化标识与后端 EffectVisual.TYPE_T_CORP_FILTER 一致", () => {
    expect(EFFECT_TYPE_T_CORP_FILTER).toBe("T_CORP_FILTER");
  });

  it("没开 / 别的特效 / enabled:false → 不算开启", () => {
    expect(isTCorpFilterEnabled(undefined)).toBe(false);
    expect(isTCorpFilterEnabled(null)).toBe(false);
    expect(isTCorpFilterEnabled([])).toBe(false);
    expect(isTCorpFilterEnabled(withEffects({ type: "CROSS_DISSOLVE" }))).toBe(false);
    expect(isTCorpFilterEnabled(withEffects({ type: "CAMERA_SHAKE" }))).toBe(false);
    expect(
      isTCorpFilterEnabled(withEffects({ type: EFFECT_TYPE_T_CORP_FILTER, enabled: false })),
    ).toBe(false);
  });

  it("只写 type、或大小写不同 → 照样算开启（与后端忽略大小写一致）", () => {
    expect(isTCorpFilterEnabled(withEffects({ type: EFFECT_TYPE_T_CORP_FILTER }))).toBe(true);
    expect(isTCorpFilterEnabled(withEffects({ type: "t_corp_filter" }))).toBe(true);
    expect(
      isTCorpFilterEnabled(withEffects({ type: EFFECT_TYPE_T_CORP_FILTER, enabled: true })),
    ).toBe(true);
  });

  it("勾选 = 追加 { type, enabled: true }，其它特效原样保留", () => {
    const current = withEffects(
      { type: "CROSS_DISSOLVE", enabled: true },
      { type: "SOME_FUTURE_EFFECT" },
    );

    expect(toggleTCorpFilter(current, true)).toEqual([
      { type: "CROSS_DISSOLVE", enabled: true },
      { type: "SOME_FUTURE_EFFECT" },
      { type: EFFECT_TYPE_T_CORP_FILTER, enabled: true },
    ]);
  });

  it("取消勾选只删自己", () => {
    const current = withEffects(
      { type: EFFECT_TYPE_T_CORP_FILTER, enabled: true },
      { type: "CROSS_DISSOLVE", enabled: true },
    );

    expect(toggleTCorpFilter(current, false)).toEqual([
      { type: "CROSS_DISSOLVE", enabled: true },
    ]);
  });

  it("已经开着再勾一次 → 返回原数组（不制造空步骤 / 不触发重渲染）", () => {
    const current = withEffects({ type: EFFECT_TYPE_T_CORP_FILTER, enabled: true });
    expect(toggleTCorpFilter(current, true)).toBe(current);

    const empty: EffectVisual[] = [];
    expect(toggleTCorpFilter(empty, false)).toBe(empty);
    expect(toggleTCorpFilter(undefined, false)).toEqual([]);
  });

  it("数据里是一条停用条目时，勾选只把开关打开、不重复追加", () => {
    const current = withEffects({
      type: EFFECT_TYPE_T_CORP_FILTER,
      enabled: false,
    });

    const next = toggleTCorpFilter(current, true);
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual({ type: EFFECT_TYPE_T_CORP_FILTER, enabled: true });
  });
});
