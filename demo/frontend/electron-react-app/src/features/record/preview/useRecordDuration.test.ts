/**
 * 预览总帧数（S3 收尾②）。
 *
 * 这里锁的是"接口不可靠时预览还能不能活"：
 * 1. 拿到后端准数就用它（成片等长）；
 * 2. 接口挂了不抛给 React、不打断编辑，回落到调用方的近似值（frames = null）；
 * 3. 快速连续编辑时只认最后一次请求的响应（旧响应不能盖掉新值）；
 * 4. enabled = false 时一个请求都不发。
 *
 * 时长请求通过 `fetchDuration` 注入：不用 mock 整个 ApiService 单例，
 * 才能精确控制"两个请求谁先回"这种时序。
 */
import { renderHook, waitFor } from "@testing-library/react";

import { useRecordDuration } from "./useRecordDuration";

/** 稳定的记录对象：与真实调用方一致（记录来自 state，身份不会每帧变） */
const RECORD_A = {
  uuid: "a",
  dialogue: { text: "a" },
} as any;
const RECORD_B = {
  uuid: "b",
  dialogue: { text: "b" },
} as any;

const duration = (frames: number): any => ({
  frames,
  audioFrames: 0,
  textFrames: frames,
  animationFrames: 0,
  stayFrames: 75,
  frameRate: 30,
});

/** 一次请求的控制柄 */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("预览总帧数", () => {
  test("用后端算出的准数（而不是本地近似）", async () => {
    const fetchDuration = jest.fn().mockResolvedValue(duration(156));

    const { result } = renderHook(() =>
      useRecordDuration(RECORD_A, true, 75, { debounceMs: 0, fetchDuration }),
    );

    await waitFor(() => expect(result.current.frames).toBe(156));
    expect(result.current.breakdown?.stayFrames).toBe(75);
    expect(fetchDuration).toHaveBeenCalledTimes(1);
    expect(fetchDuration).toHaveBeenCalledWith(RECORD_A, true, 75);
  });

  test("接口失败不抛异常、不改行为：frames 仍是 null，调用方继续用近似值", async () => {
    const fetchDuration = jest.fn().mockRejectedValue(new Error("后端没起"));

    const { result } = renderHook(() =>
      useRecordDuration(RECORD_A, true, 75, { debounceMs: 0, fetchDuration }),
    );

    await waitFor(() => expect(result.current.fetching).toBe(false));
    expect(result.current.frames).toBeNull();
    expect(result.current.breakdown).toBeNull();
  });

  test("旧响应不能盖掉新值（连续编辑时只认最后一次请求）", async () => {
    const first = deferred<any>();
    const second = deferred<any>();
    const fetchDuration = jest
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const { result, rerender } = renderHook(
      ({ rec }) => useRecordDuration(rec, true, 75, { debounceMs: 0, fetchDuration }),
      { initialProps: { rec: RECORD_A } },
    );

    // 先让 a 的请求真的发出去（debounce 会把"还没来得及发就被换掉"的那次吞掉，这是预期行为）
    await waitFor(() => expect(fetchDuration).toHaveBeenCalledTimes(1));

    // 第二次编辑：记录换成 b，会发出第二个请求
    rerender({ rec: RECORD_B });
    await waitFor(() => expect(fetchDuration).toHaveBeenCalledTimes(2));

    // 先回 b，再回 a —— a 的响应必须被丢掉
    second.resolve(duration(200));
    await waitFor(() => expect(result.current.frames).toBe(200));
    first.resolve(duration(99));

    // 给旧响应一个"落盘"的机会：值必须还是 200
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.frames).toBe(200);
  });

  test("enabled = false 时不发请求（记录还没加载完）", async () => {
    const fetchDuration = jest.fn().mockResolvedValue(duration(120));

    const { result } = renderHook(() =>
      useRecordDuration(RECORD_A, true, 75, { debounceMs: 0, fetchDuration, enabled: false }),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchDuration).not.toHaveBeenCalled();
    expect(result.current.frames).toBeNull();
  });
});
