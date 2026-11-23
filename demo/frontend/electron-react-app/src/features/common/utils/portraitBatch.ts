import { Portrait } from "@types";
import {
  StandardEmotion,
  detectEmotionFromFileName,
} from "./emotionMapper";
import { CropScaleMode, PortraitCropState } from "./portraitCrop";

/**
 * 立绘「批量」操作里可以做成纯函数的部分。
 *
 * 真正的批量动作（读原图、生成缩略图、调后端接口）在
 * `CharacterDetailModal.tsx` 里，通过 ApiService 完成；
 * 这里只负责"改哪几张 / 新立绘长什么样 / 结果怎么讲"这类可单测的判断。
 *
 * <p>覆盖三个批量动作：多选（{@link toggleSelectedId} 等）、
 * 「沿用默认立绘裁剪」（{@link collectSelectedCropTargets} + {@link describeCropBatchResult}）、
 * 批量删除（{@link collectSelectedPortraits} + {@link describeDeleteBatchResult}）。
 */

/** 立绘名 = 文件名去掉扩展名（与「添加立绘」单个流程保持一致） */
export const stripFileExtension = (fileName: string): string => {
  if (!fileName) return "";
  return fileName.replace(/\.[^./\\]+$/, "");
};

/** 立绘对象上保存的裁剪参数 */
export const portraitCropOf = (portrait: Portrait): PortraitCropState => ({
  faceX: portrait.faceX ?? 0,
  faceY: portrait.faceY ?? 0,
  length: portrait.length ?? 0,
});

/** 两个裁剪参数是否完全一致（批量改裁剪用于跳过已经算好的那几张） */
export const isSameCrop = (
  a: PortraitCropState,
  b: PortraitCropState,
): boolean =>
  Math.round(a.faceX) === Math.round(b.faceX) &&
  Math.round(a.faceY) === Math.round(b.faceY) &&
  Math.round(a.length) === Math.round(b.length);

/**
 * 挑出需要把裁剪改成默认立绘裁剪的那些立绘：默认立绘本身不动，其它立绘全部纳入。
 *
 * <p>这里**不再**按像素判断"裁剪已经一致"：改成按比例换算后，同一组像素值在
 * 不同尺寸的原图上并不等价（1600×2432 和 640×983 上同样的 400px 框，占图片的
 * 比例差很多）。真正的"算出来是否和现在一样"要等拿到每张原图的尺寸才知道，
 * 放在批量执行时逐张比较（`isSameCrop`），不用为了按钮置灰先把所有原图都读一遍。
 */
export const collectCropUpdateTargets = (
  portraits: Portrait[] | undefined | null,
  defaultPortraitId: string | null | undefined,
): Portrait[] => {
  if (!portraits || portraits.length === 0) {
    return [];
  }
  return portraits.filter(
    (portrait) =>
      !(defaultPortraitId && portrait.portraitID === defaultPortraitId),
  );
};

/** 立绘名是否已存在（批量导入时同名文件跳过，避免重复导入） */
export const hasPortraitName = (
  portraits: Portrait[] | undefined | null,
  portName: string,
): boolean => {
  if (!portraits || portraits.length === 0 || !portName) {
    return false;
  }
  return portraits.some((portrait) => portrait.portName === portName);
};

/**
 * 组装一张「批量导入」的新立绘。
 *
 * 情绪按文件名识别（中文/英文关键词都支持），识别不到就是「正常」；
 * 裁剪参数由调用方按默认立绘 + 当前图片尺寸算好后传进来。
 */
export const buildImportedPortrait = (params: {
  characterID: string;
  portraitID: string;
  fileName: string;
  imagePath: string;
  thumbnailPath: string;
  crop: PortraitCropState;
}): Portrait => {
  const detectedEmotion = detectEmotionFromFileName(params.fileName);

  return {
    portraitID: params.portraitID,
    characterID: params.characterID,
    imagePath: params.imagePath,
    portName: stripFileExtension(params.fileName) || params.fileName,
    emotion: (detectedEmotion ??
      StandardEmotion.NORMAL) as unknown as Portrait["emotion"],
    faceX: Math.round(params.crop.faceX),
    faceY: Math.round(params.crop.faceY),
    length: Math.round(params.crop.length),
    adjX: 0,
    adjY: 0,
    thumbnailPath: params.thumbnailPath,
  };
};

// ============================================================
// 多选（批量选择立绘）
// ============================================================

/**
 * 切换一张立绘的勾选状态（返回新集合，不改动入参）。
 *
 * <p>`Set` 是原地可变的，直接 `delete` / `add` 再 setState 同一个引用，
 * React 认为状态没变、不会重渲染，勾选框就会"点不动"。
 */
export const toggleSelectedId = (
  selected: ReadonlySet<string>,
  portraitId: string,
): Set<string> => {
  const next = new Set(selected);
  if (next.has(portraitId)) {
    next.delete(portraitId);
  } else {
    next.add(portraitId);
  }
  return next;
};

/**
 * 列表里的立绘是否已经全部选中。
 *
 * <p>空列表算"没全选"：否则没有立绘时「全选」会显示成已勾选，点一下又清空，很奇怪。
 */
export const areAllPortraitsSelected = (
  portraits: Portrait[] | undefined | null,
  selected: ReadonlySet<string>,
): boolean =>
  !!portraits &&
  portraits.length > 0 &&
  portraits.every((portrait) => selected.has(portrait.portraitID));

/**
 * 全选 / 取消全选（只作用于当前列表里的立绘）。
 *
 * <p>已经全选就清空；否则选中整个列表 —— 与「角色 / 背景 / 音效 / 序列帧」页签的多选导出一致。
 */
export const toggleSelectedAll = (
  portraits: Portrait[] | undefined | null,
  selected: ReadonlySet<string>,
): Set<string> => {
  if (areAllPortraitsSelected(portraits, selected)) {
    return new Set();
  }
  return new Set((portraits ?? []).map((portrait) => portrait.portraitID));
};

/**
 * 丢掉已经不在列表里的勾选。
 *
 * <p>删除成功、切角色、重新拉数据之后调用：留着已删除立绘的 ID，
 * 「已选 3 张」会比列表里实际勾上的多，批量按钮也会误判成"还有得删"。
 */
export const pruneSelectedIds = (
  selected: ReadonlySet<string>,
  portraits: Portrait[] | undefined | null,
): Set<string> => {
  if (!portraits || portraits.length === 0) {
    return new Set();
  }
  const existingIds = new Set(
    portraits.map((portrait) => portrait.portraitID),
  );
  const next = new Set<string>();
  selected.forEach((portraitId) => {
    if (existingIds.has(portraitId)) {
      next.add(portraitId);
    }
  });
  return next;
};

/**
 * 选中项里仍然存在的立绘（**按列表顺序**返回，不是勾选顺序）。
 *
 * <p>批量删除按它逐张调接口：顺序稳定，结果提示里的失败清单也就稳定。
 */
export const collectSelectedPortraits = (
  portraits: Portrait[] | undefined | null,
  selected: ReadonlySet<string>,
): Portrait[] =>
  (portraits ?? []).filter((portrait) => selected.has(portrait.portraitID));

/**
 * 选中项里需要套用默认裁剪的立绘：**默认立绘本身跳过**。
 *
 * <p>默认立绘就是要套用的那个来源，改它没有意义（也容易把自己越改越偏）。
 * 只选默认立绘一张时返回空数组，按钮据此置灰并提示"默认立绘本身不需要套用"。
 */
export const collectSelectedCropTargets = (
  portraits: Portrait[] | undefined | null,
  selected: ReadonlySet<string>,
  defaultPortraitId: string | null | undefined,
): Portrait[] =>
  collectSelectedPortraits(portraits, selected).filter(
    (portrait) =>
      !(defaultPortraitId && portrait.portraitID === defaultPortraitId),
  );

// ============================================================
// 批量结果文案
// ============================================================

/** 批量操作结果提示的种类（对应列表上方提示条的三种配色） */
export type PortraitBatchResultKind = "success" | "error" | "info";

/** 批量操作结果提示（界面组件直接拿去渲染，纯函数这里只负责"怎么说"） */
export interface PortraitBatchResult {
  kind: PortraitBatchResultKind;
  text: string;
}

/** 「沿用默认立绘裁剪」一次批量执行的结果统计 */
export interface PortraitCropBatchOutcome {
  /** 换算方式：读不到默认立绘原图尺寸时是 `pixel`（按像素照搬） */
  mode: CropScaleMode;
  /** 真的改了裁剪的立绘数 */
  updated: number;
  /** 算出来的裁剪和现有值一样、直接跳过的 */
  unchanged: number;
  /** 超出原图范围、被夹进图片范围的 */
  adjusted: number;
  /** 原图加载失败（只改了数值，缩略图没更新） */
  imageFailed: number;
  /** 缩略图重新生成失败（裁剪值已写入） */
  thumbnailFailed: number;
  /** 完全没改成功的立绘名（调用方保留它们的选中状态以便重试） */
  failed: string[];
}

/** 「批量删除」一次批量执行的结果统计 */
export interface PortraitDeleteBatchOutcome {
  /** 删除成功的张数 */
  deleted: number;
  /** 删除失败的立绘与原因（调用方保留它们的选中状态以便重试） */
  failed: { portName: string; reason: string }[];
  /** 选中的里面是否包含默认立绘 */
  defaultDeleted: boolean;
  /** 删掉默认立绘后自动提上来的新默认立绘名；角色已经没有立绘时为 null */
  promotedDefaultName: string | null;
}

/** 名字清单：最多列 3 个，多了用「等」收尾，避免提示条被几十个名字撑爆 */
const listNames = (names: string[], limit = 3): string => {
  const shown = names.slice(0, limit).join("、");
  return names.length > limit ? `${shown} 等 ${names.length} 个` : shown;
};

/**
 * 把「沿用默认立绘裁剪」的执行结果拼成一条提示。
 *
 * @param outcome 逐张处理完统计出来的结果
 * @param scope   `all` = 「与默认立绘裁剪一致」（全部立绘）；
 *                `selected` = 「沿用默认立绘裁剪」（只改选中的）
 */
export const describeCropBatchResult = (
  outcome: PortraitCropBatchOutcome,
  scope: "all" | "selected" = "all",
): PortraitBatchResult => {
  const scopeText = scope === "selected" ? "选中的 " : "";
  const modeText = outcome.mode === "ratio" ? "按比例" : "按像素";
  const problemCount =
    outcome.failed.length + outcome.imageFailed + outcome.thumbnailFailed;

  // 一张都没改、也没有失败：要么本来就和默认立绘一致，要么原图都读不到但数值恰好相同
  if (outcome.updated === 0 && outcome.failed.length === 0) {
    const reason =
      outcome.imageFailed > 0
        ? `${outcome.imageFailed} 张原图加载失败，没法定比例（现有数值看起来已经一致）`
        : `所有${scopeText}立绘的裁剪都已经和默认立绘一致（${modeText}）`;
    return {
      kind: "info",
      text: `${reason}，没有需要修改的。`,
    };
  }

  const parts: string[] = [];
  if (outcome.updated > 0) {
    parts.push(`已${modeText}更新 ${scopeText}${outcome.updated} 张立绘的裁剪`);
  }
  if (outcome.unchanged > 0) {
    parts.push(`${outcome.unchanged} 张算出来本来就是这个裁剪，已跳过`);
  }
  if (outcome.adjusted > 0) {
    parts.push(`其中 ${outcome.adjusted} 张超出原图范围，已按图片边界修正`);
  }
  if (outcome.imageFailed > 0) {
    parts.push(
      `${outcome.imageFailed} 张原图加载失败（只改了数值，缩略图没更新）`,
    );
  }
  if (outcome.thumbnailFailed > 0) {
    parts.push(`${outcome.thumbnailFailed} 张缩略图重新生成失败`);
  }
  if (outcome.failed.length > 0) {
    parts.push(
      `${outcome.failed.length} 张没有改成功：${listNames(
        outcome.failed,
      )}（已保留选中，可以直接重试）`,
    );
  }
  if (outcome.updated > 0) {
    parts.push("记得点右上角「保存」写入数据库");
  }

  return {
    kind:
      outcome.failed.length > 0 ? "error" : problemCount > 0 ? "info" : "success",
    text: `${parts.join("；")}。`,
  };
};

/**
 * 把「批量删除」的执行结果拼成一条提示。
 *
 * <p>删除是**逐张**调 `DELETE /characters/{id}/portraits/{portraitId}`：
 * 某一张失败（例如文件被占用）不能影响其它张，所以成功几张就报几张，
 * 失败的列名字 + 原因，并保留它们的选中状态让用户直接重试。
 */
export const describeDeleteBatchResult = (
  outcome: PortraitDeleteBatchOutcome,
): PortraitBatchResult => {
  const parts: string[] = [];

  if (outcome.deleted > 0) {
    parts.push(`已删除 ${outcome.deleted} 张立绘`);
  }
  if (outcome.defaultDeleted) {
    parts.push(
      outcome.promotedDefaultName
        ? `默认立绘已删除，已自动把「${outcome.promotedDefaultName}」设为新的默认立绘`
        : "默认立绘已删除，该角色现在没有立绘了",
    );
  }
  if (outcome.failed.length > 0) {
    const detail = outcome.failed
      .slice(0, 3)
      .map((item) => `${item.portName}（${item.reason}）`)
      .join("、");
    parts.push(
      `${outcome.failed.length} 张删除失败：${detail}${
        outcome.failed.length > 3 ? "…" : ""
      }（已保留选中，可以直接重试）`,
    );
  }

  if (parts.length === 0) {
    return { kind: "info", text: "没有删除任何立绘。" };
  }

  return {
    kind: outcome.failed.length > 0 ? "error" : "success",
    text: `${parts.join("；")}。`,
  };
};
