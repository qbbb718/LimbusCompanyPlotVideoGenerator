// 情绪映射工具
export enum StandardEmotion {
  NORMAL = 'normal',
  HAPPY = 'happy',
  SAD = 'sad',
  ANGRY = 'angry',
  SURPRISED = 'surprised',
  CONFUSED = 'confused',
  BLUSH = 'blush',
  HURT = 'hurt'
}

/** 情绪在界面上的固定顺序（下拉框按这个顺序排） */
const EMOTION_ORDER: StandardEmotion[] = [
  StandardEmotion.NORMAL,
  StandardEmotion.HAPPY,
  StandardEmotion.SAD,
  StandardEmotion.ANGRY,
  StandardEmotion.SURPRISED,
  StandardEmotion.CONFUSED,
  StandardEmotion.BLUSH,
  StandardEmotion.HURT
];

/**
 * 界面显示用的中文关键词。
 * 立绘编辑弹窗的情绪下拉框只显示这些中文，不再显示 normal / HAPPY 这类枚举值。
 */
const EMOTION_LABELS: { [key in StandardEmotion]: string } = {
  [StandardEmotion.NORMAL]: '正常',
  [StandardEmotion.HAPPY]: '开心',
  [StandardEmotion.SAD]: '悲伤',
  [StandardEmotion.ANGRY]: '生气',
  [StandardEmotion.SURPRISED]: '惊讶',
  [StandardEmotion.CONFUSED]: '困惑',
  [StandardEmotion.BLUSH]: '害羞',
  [StandardEmotion.HURT]: '受伤'
};

/**
 * 情绪关键词表：中文 + 英文。
 *
 * 同时用于两处：
 * 1. 用户在情绪下拉框选中中文关键词后映射回标准情绪；
 * 2. 上传立绘时读取图片文件名自动设置情绪。
 *    例如 `罗佳-face_happy_L.png` → happy，`罗佳-开心.png` → 开心。
 */
const EMOTION_KEYWORDS: { [key in StandardEmotion]: string[] } = {
  // 正常/中性情绪
  [StandardEmotion.NORMAL]: [
    '正常', '普通', '平静', '平常', '默认', '待机',
    'normal', 'neutral', 'calm', 'default', 'idle'
  ],

  // 开心情绪
  [StandardEmotion.HAPPY]: [
    '开心', '高兴', '快乐', '愉快', '微笑', '笑',
    'happy', 'joy', 'joyful', 'smile', 'smiling', 'laugh', 'cheerful'
  ],

  // 悲伤情绪
  [StandardEmotion.SAD]: [
    '悲伤', '难过', '伤心', '沮丧', '失落', '哭',
    'sad', 'sorrow', 'cry', 'crying', 'depressed', 'depression', 'gloomy', 'unhappy', 'down'
  ],

  // 生气情绪
  [StandardEmotion.ANGRY]: [
    '生气', '愤怒', '恼火', '发火', '暴怒',
    'angry', 'anger', 'mad', 'rage', 'furious'
  ],

  // 惊讶情绪
  [StandardEmotion.SURPRISED]: [
    '惊讶', '震惊', '吃惊', '意外',
    'surprised', 'surprise', 'shock', 'shocked', 'astonished'
  ],

  // 困惑情绪
  [StandardEmotion.CONFUSED]: [
    '困惑', '迷茫', '不解', '疑惑',
    'confused', 'confuse', 'puzzled', 'puzzling', 'bewildered'
  ],

  // 害羞情绪
  [StandardEmotion.BLUSH]: [
    '害羞', '脸红', '羞涩',
    'blush', 'blushing', 'shy', 'embarrassed'
  ],

  // 受伤情绪
  [StandardEmotion.HURT]: [
    '受伤', '疼痛', '痛苦', '痛',
    'hurt', 'pain', 'painful', 'injured', 'wounded'
  ]
};

interface EmotionKeywordEntry {
  keyword: string;
  emotion: StandardEmotion;
}

// 关键词统一小写后展开成一张表；同一关键词只认第一次出现的情绪
const KEYWORD_ENTRIES: EmotionKeywordEntry[] = [];
EMOTION_ORDER.forEach((emotion) => {
  EMOTION_KEYWORDS[emotion].forEach((keyword) => {
    KEYWORD_ENTRIES.push({ keyword: keyword.toLowerCase(), emotion });
  });
});

const KEYWORD_TO_EMOTION: Map<string, StandardEmotion> = new Map();
KEYWORD_ENTRIES.forEach(({ keyword, emotion }) => {
  if (!KEYWORD_TO_EMOTION.has(keyword)) {
    KEYWORD_TO_EMOTION.set(keyword, emotion);
  }
});

// 长关键词优先：smiling 要先于 smile 命中，surprised 要先于 sad 之类的短词命中
const KEYWORDS_BY_LENGTH: EmotionKeywordEntry[] = [...KEYWORD_ENTRIES].sort(
  (a, b) => b.keyword.length - a.keyword.length
);

/** 文件名分词：按一切非字母/数字/汉字的字符切开（- _ . 空格等） */
const FILE_NAME_SEPARATOR = /[^0-9a-zA-Z\u4e00-\u9fff]+/;

/**
 * 在一段文本里找情绪关键词。
 * @returns 命中的标准情绪；没有命中返回 null
 */
function matchEmotionKeyword(text: string): StandardEmotion | null {
  if (!text) return null;

  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;

  // 先看整段是否就是一个关键词
  const exact = KEYWORD_TO_EMOTION.get(normalized);
  if (exact) return exact;

  // 再按“长关键词优先”找被包含的关键词
  for (const { keyword, emotion } of KEYWORDS_BY_LENGTH) {
    if (normalized.includes(keyword)) {
      return emotion;
    }
  }

  return null;
}

/**
 * 将用户输入的情绪映射到最接近的标准情绪。
 * 支持中文关键词（开心/高兴…）、英文关键词（happy/joy…）和枚举值（HAPPY）。
 * 无法识别时回退到 normal。
 * @param userInput 用户输入的情绪文本
 * @returns 匹配的标准情绪
 */
export function mapEmotion(userInput: string | null | undefined): StandardEmotion {
  if (!userInput || typeof userInput !== 'string') return StandardEmotion.NORMAL;

  return matchEmotionKeyword(userInput) ?? StandardEmotion.NORMAL;
}

/**
 * 从上传图片的文件名里识别情绪，中英文关键词都支持。
 *
 * 只按“字段”匹配，避免角色名/分辨率之类的数字误伤：
 * - 字段与关键词完全一致优先（`罗佳-face_happy_L.png` 的 `happy`）；
 * - 没有再退一步，允许字段包含关键词（`face_smile2_L.png`、`罗佳开心.png`）。
 *
 * @param fileName 图片文件名（可带扩展名，也可以直接传不含扩展名的立绘名称）
 * @returns 识别到的标准情绪；没有关键词返回 null（调用方不要覆盖用户已选的情绪）
 */
export function detectEmotionFromFileName(
  fileName: string | null | undefined
): StandardEmotion | null {
  if (!fileName || typeof fileName !== 'string') return null;

  // 去掉扩展名，避免后缀里的字符干扰；保留其余字段用于分词
  const baseName = fileName.replace(/\.[^.]+$/, '');
  const tokens = baseName
    .split(FILE_NAME_SEPARATOR)
    .filter((token) => token.length > 0)
    .map((token) => token.toLowerCase());

  if (tokens.length === 0) return null;

  // 1. 字段与关键词完全一致
  for (const token of tokens) {
    const hit = KEYWORD_TO_EMOTION.get(token);
    if (hit) return hit;
  }

  // 2. 字段包含关键词（smile2 / 罗佳开心 这类没有分隔符的写法）
  for (const { keyword, emotion } of KEYWORDS_BY_LENGTH) {
    if (tokens.some((token) => token.includes(keyword))) {
      return emotion;
    }
  }

  return null;
}

/**
 * 获取标准情绪的中文关键词（兼容旧代码 key=枚举值、value=中文）。
 * @returns 标准情绪及其中文显示名称的映射
 */
export function getStandardEmotions(): { [key: string]: string } {
  const emotions: { [key: string]: string } = {};
  EMOTION_ORDER.forEach((emotion) => {
    emotions[emotion] = EMOTION_LABELS[emotion];
  });
  return emotions;
}

/** 下拉框选项：value 存标准情绪，label 显示中文关键词 */
export interface EmotionOption {
  value: StandardEmotion;
  label: string;
  /** 中文 + 英文关键词，供提示/调试使用 */
  keywords: string[];
}

/**
 * 情绪下拉框的选项（按固定顺序，label 全部是中文关键词）。
 */
export function getEmotionOptions(): EmotionOption[] {
  return EMOTION_ORDER.map((emotion) => ({
    value: emotion,
    label: EMOTION_LABELS[emotion],
    keywords: [...EMOTION_KEYWORDS[emotion]]
  }));
}

/**
 * 取标准情绪的中文关键词。
 * 兼容后端返回的小写 code（happy）、历史数据里的大写枚举名（HAPPY）和中文（开心）。
 * 无法识别的值回退到“正常”。
 */
export function getEmotionLabel(
  emotion: StandardEmotion | string | null | undefined
): string {
  return EMOTION_LABELS[mapEmotion(emotion)];
}
