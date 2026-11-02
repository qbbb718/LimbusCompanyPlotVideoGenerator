/**
 * 把后端/网络异常翻译成"能直接显示给用户的一句话"。
 *
 * <p>后端统一由 {@code GlobalExceptionHandler} 返回
 * {@code { status, error, message, exceptionType }}，所以优先取 {@code message}。
 * 以前各处失败都只弹一句"保存失败，请重试"，用户完全不知道是路径不对、
 * 还是数据库缺列（历史 bug：{@code table backgrounds has no column named thumbnail_path}）。
 * 把后端的原话显示出来，用户/开发者一眼就能判断要不要重试。
 */

/** 后端错误响应的形状（GlobalExceptionHandler 的返回体） */
interface BackendErrorBody {
  status?: number;
  error?: string;
  message?: string;
  exceptionType?: string;
}

/**
 * @param error    捕获到的异常（Axios 错误、普通 Error 或任意值）
 * @param fallback 取不到后端信息时的兜底文案
 */
export const describeApiError = (error: unknown, fallback: string): string => {
  const anyError = error as any;

  const status: number | undefined = anyError?.response?.status;
  const body: BackendErrorBody | undefined = anyError?.response?.data;

  if (body && typeof body === "object") {
    const detail = body.message || body.error;
    if (detail) {
      return status ? `${fallback}（${status}）：${detail}` : `${fallback}：${detail}`;
    }
  }

  const message = anyError?.message;
  if (typeof message === "string" && message.trim()) {
    return status ? `${fallback}（${status}）：${message}` : `${fallback}：${message}`;
  }

  return fallback;
};

/**
 * 判断异常是否值得提示用户"重试"。
 *
 * <p>4xx 是我们能说清原因的请求错误（路径不对、缺参数、缺列），重试同样的请求也不会好，
 * 文案里不应该引导用户反复点；5xx / 网络错误才可能是暂时性的。
 */
export const isRetryableError = (error: unknown): boolean => {
  const status: number | undefined = (error as any)?.response?.status;
  if (status === undefined) return true; // 网络错误 / 超时
  return status >= 500;
};
