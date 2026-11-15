/**
 * @module 资源管理模块
 * @function 资源包导入导出 / 素材批量处理的前端公共逻辑
 *
 * <p>角色 / 背景 / 音频三个标签页与"全部资源"都用同一套交互：
 * 点导出 → 后端回一个 ZIP 的 Blob → 触发浏览器下载 → 弹提示。
 * 这段逻辑（以及出错时怎么读后端的错误信息）集中在这里，避免四个地方各写一份。
 *
 * <p>文件下半部分（`runFileBatch` 起的"素材的批量处理"）是背景 / 音效两个页签
 * 多选导入与多选添加共用的批处理逻辑：逐个处理、失败隔离、进度与结果文案。
 */

/**
 * @function 触发浏览器下载一个 Blob
 * @param blob 后端返回的文件内容
 * @param fileName 保存到本地时的建议文件名
 */
export const downloadBlob = (blob: Blob, fileName: string): void => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 下载已由浏览器接管，及时释放对象 URL，避免占着内存
  window.URL.revokeObjectURL(url);
};

/**
 * @function 生成带日期的资源包文件名
 * @param prefix 资源类型前缀，如 characters / backgrounds / audios / resources
 * @example zipFileName("characters") → "characters_2026-10-21.zip"
 */
export const zipFileName = (prefix: string): string =>
  `${prefix}_${new Date().toISOString().slice(0, 10)}.zip`;

/**
 * @function 从接口错误里取出可读的提示
 *
 * <p>后端统一用 GlobalExceptionHandler 返回 { message: "..." }，
 * 直接弹 "导入失败" 会让用户不知道是包格式不对还是文件太大。这里优先用后端消息，
 * 拿不到再退回调用方给定的默认文案。
 */
export const describeTransferError = (error: any, fallback: string): string => {
  const backendMessage =
    error?.response?.data?.message || error?.response?.data?.error;
  if (typeof backendMessage === "string" && backendMessage.trim()) {
    return backendMessage;
  }
  if (typeof error?.message === "string" && error.message.trim()) {
    return `${fallback}（${error.message}）`;
  }
  return fallback;
};

/* ==================== 素材的批量处理 ====================
 *
 * 背景 / 音效两个页签有两处"一次处理多个文件"的入口，共用同一套规则：
 * - 「📥 导入」：一次选多个**资源包**（ZIP），逐个导入；
 * - 「➕ 添加」：一次选多个**素材文件**（图片 / 音频），逐个建素材。
 *
 * 这两处原本都只能选一个文件：想加五张图就要点五次、看五次弹窗。改成多选之后，
 * 三个问题必须在同一处解决：
 * 1. **逐个**处理（不是并发）：几十 MB 的文件一起发只会把内存和带宽打满；
 * 2. **一个文件坏了不影响其它文件**：失败只记进清单，最后一次性回显；
 * 3. 进度与结果文案统一，两个页签、两种入口不会各写一套、说着不一样的话。
 */

/** 批量处理时某个文件失败的原因 */
export interface BatchFailure {
  /** 用户选中的文件名（ZIP 资源包，或图片 / 音频素材） */
  fileName: string;
  /** 可读的失败原因（优先用后端返回的 message） */
  reason: string;
}

/** 一次批量处理的汇总 */
export interface FileBatchResult {
  /**
   * 处理成功的**资源条数**（导入了几条 / 新建了几条）。
   *
   * <p>与 {@link FileBatchResult.succeededFiles} 分开记：一个资源包里可能装着好几条背景。
   */
  itemCount: number;
  /** 处理成功的**文件数** */
  succeededFiles: number;
  /** 失败清单，顺序与用户选择文件的顺序一致 */
  failures: BatchFailure[];
}

/** 批量处理进度：正在处理第 `done + 1` 个文件 */
export interface BatchProgress {
  done: number;
  total: number;
  /** 正在处理的文件名（"现在到哪个了"） */
  fileName: string;
}

/** 批量处理结束时显示的结果提示 */
export interface BatchMessage {
  kind: "success" | "info" | "error";
  text: string;
}

/** 导入结果文案里要用的名词（两类资源说法不同） */
export interface BundleImportLabels {
  /** 单个资源的量词 + 类型，如 "张背景" / "个音频" */
  unit: string;
  /** 资源包的说法，如 "背景资源包" / "音频资源包" */
  bundle: string;
}

/** 多选添加的结果文案里要用的名词 */
export interface BatchAddLabels {
  /** 单个资源的量词 + 类型，如 "张背景" / "个音频" */
  unit: string;
  /** 成功时补的一句说明（名称从哪来、之后怎么改），可不传 */
  hint?: string;
}

export interface FileBatchOptions {
  /** 每开始处理一个文件时上报一次，用来画"正在导入 2/5：xxx.zip" */
  onProgress?: (progress: BatchProgress) => void;
  /** 后端没给原因时的兜底文案（"导入失败" / "添加失败"这类） */
  fallbackError?: string;
}

/** 单个文件的处理函数：返回"这条文件产出了什么"（用于统计资源条数） */
export type BatchFileHandler = (file: File, index: number) => Promise<unknown>;

/** 一个文件算作几条资源：数组按条数、对象按 1 条、空值按 0 条 */
const countBatchItems = (processed: unknown): number => {
  if (Array.isArray(processed)) return processed.length;
  return processed === null || processed === undefined ? 0 : 1;
};

/**
 * @function 逐个处理一批文件（导入资源包 / 多选添加素材共用）
 *
 * <p>任何单个文件失败都**不会**中断整批：失败记进 `failures`，调用方拿
 * {@link describeBundleImportResult} / {@link describeBatchAddResult} 一次显示。
 * 本函数自己不抛异常（`onProgress` 抛出的除外）。
 *
 * @param files 用户一次选中的所有文件（顺序即处理顺序）
 * @param handler 单个文件的处理动作；返回值用于统计资源条数
 * @param options 进度回调与兜底错误文案
 */
export const runFileBatch = async (
  files: File[],
  handler: BatchFileHandler,
  options: FileBatchOptions = {},
): Promise<FileBatchResult> => {
  const result: FileBatchResult = {
    itemCount: 0,
    succeededFiles: 0,
    failures: [],
  };

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    options.onProgress?.({
      done: index,
      total: files.length,
      fileName: file.name,
    });

    try {
      const processed = await handler(file, index);
      result.itemCount += countBatchItems(processed);
      result.succeededFiles += 1;
    } catch (error) {
      // 单个文件的问题（不是 ZIP / 缺清单 / 图片读不出来…）只影响它自己
      const fallback = options.fallbackError ?? "处理失败";
      result.failures.push({
        fileName: file.name,
        reason: describeTransferError(error, fallback),
      });
    }
  }

  return result;
};

/** 把失败清单拼成 "a.zip（原因）；b.zip（原因）" */
const describeBatchFailures = (failures: BatchFailure[]): string =>
  failures
    .map((failure) => `${failure.fileName}（${failure.reason}）`)
    .join("；");

/**
 * @function 把批量导入资源包的结果转成提示条文案
 *
 * <p>三种情况分开说：全部成功（success）、部分成功（info，要能看出哪些包没进来）、
 * 全部失败（error）。以前一次只能导一个包，成与败各弹一个 alert 就够了；
 * 批量之后失败清单可能有好几条，必须放在**不抢焦点**的提示条里，用户才能边看边重试。
 */
export const describeBundleImportResult = (
  result: FileBatchResult,
  labels: BundleImportLabels,
): BatchMessage => {
  const { unit, bundle } = labels;

  // 一个文件都没处理（调用方正常会提前返回，这里只是兜底）
  if (result.succeededFiles === 0 && result.failures.length === 0) {
    return { kind: "info", text: "没有选择资源包" };
  }

  if (result.succeededFiles === 0) {
    return {
      kind: "error",
      text: `${result.failures.length} 个${bundle}都没导入成功：${describeBatchFailures(
        result.failures,
      )}`,
    };
  }

  const successText =
    `已导入 ${result.itemCount} ${unit}` +
    `（${result.succeededFiles} 个${bundle}）`;

  if (result.failures.length === 0) {
    return { kind: "success", text: successText };
  }

  return {
    kind: "info",
    text:
      `${successText}；另有 ${result.failures.length} 个${bundle}没导入：` +
      describeBatchFailures(result.failures),
  };
};

/**
 * @function 把"多选添加素材"的结果转成提示条文案
 *
 * <p>与导入的区别只在措辞：这里是"文件 → 素材"（一张图 = 一条背景），
 * 所以只报文件数与新增条数，不再有"资源包"这层。三种情况的处理与导入一致。
 */
export const describeBatchAddResult = (
  result: FileBatchResult,
  labels: BatchAddLabels,
): BatchMessage => {
  const { unit, hint } = labels;

  if (result.succeededFiles === 0 && result.failures.length === 0) {
    return { kind: "info", text: "没有选择文件" };
  }

  if (result.succeededFiles === 0) {
    return {
      kind: "error",
      text: `${result.failures.length} 个文件都没能添加：${describeBatchFailures(
        result.failures,
      )}`,
    };
  }

  const parts = [`已添加 ${result.itemCount} ${unit}`];
  if (result.failures.length > 0) {
    parts.push(
      `另有 ${result.failures.length} 个文件没添加：${describeBatchFailures(
        result.failures,
      )}`,
    );
  }
  if (hint) {
    parts.push(hint);
  }

  return {
    kind: result.failures.length > 0 ? "info" : "success",
    text: parts.join("；"),
  };
};

/**
 * @function 列表刷新失败时，在结果提示后面补一句
 *
 * <p>资源其实已经进库了，只是本地列表没拉回来。要是只说"失败"，用户会再操作一遍，
 * 于是库里出现重复素材。
 */
export const appendRefreshWarning = (
  message: BatchMessage,
  refreshFailed: boolean,
): BatchMessage =>
  refreshFailed
    ? {
        kind: message.kind,
        text: `${message.text}；列表刷新失败，请重新进入本页面查看`,
      }
    : message;

/** 文件名去掉扩展名（批量添加素材时用它当素材名称） */
export const stripFileExtension = (fileName: string): string =>
  fileName ? fileName.replace(/\.[^./\\]+$/, "") : "";
