import { Portrait } from "@types";
import {
  StandardEmotion,
  detectEmotionFromFileName,
} from "./emotionMapper";
import { PortraitCropState } from "./portraitCrop";

/**
 * 立绘「批量」操作里可以做成纯函数的部分。
 *
 * 真正的批量动作（读原图、生成缩略图、调后端接口）在
 * `CharacterDetailModal.tsx` 里，通过 ApiService 完成；
 * 这里只负责"改哪几张 / 新立绘长什么样"这类可单测的判断。
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
