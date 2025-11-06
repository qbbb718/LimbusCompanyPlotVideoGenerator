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

// 情绪映射字典，将用户输入映射到标准情绪
const emotionMap: { [key: string]: StandardEmotion } = {
  // 正常/中性情绪
  '正常': StandardEmotion.NORMAL,
  '普通': StandardEmotion.NORMAL,
  '平静': StandardEmotion.NORMAL,
  'neutral': StandardEmotion.NORMAL,
  'calm': StandardEmotion.NORMAL,

  // 开心情绪
  '开心': StandardEmotion.HAPPY,
  '高兴': StandardEmotion.HAPPY,
  '快乐': StandardEmotion.HAPPY,
  '愉快': StandardEmotion.HAPPY,
  '微笑': StandardEmotion.HAPPY,
  'happy': StandardEmotion.HAPPY,
  'joy': StandardEmotion.HAPPY,
  'smile': StandardEmotion.HAPPY,

  // 悲伤情绪
  '悲伤': StandardEmotion.SAD,
  '难过': StandardEmotion.SAD,
  '伤心': StandardEmotion.SAD,
  '沮丧': StandardEmotion.SAD,
  'sad': StandardEmotion.SAD,
  'down': StandardEmotion.SAD,

  // 生气情绪
  '生气': StandardEmotion.ANGRY,
  '愤怒': StandardEmotion.ANGRY,
  '恼火': StandardEmotion.ANGRY,
  'angry': StandardEmotion.ANGRY,
  'mad': StandardEmotion.ANGRY,

  // 惊讶情绪
  '惊讶': StandardEmotion.SURPRISED,
  '震惊': StandardEmotion.SURPRISED,
  '吃惊': StandardEmotion.SURPRISED,
  'surprised': StandardEmotion.SURPRISED,
  'shock': StandardEmotion.SURPRISED,

  // 困惑情绪
  '困惑': StandardEmotion.CONFUSED,
  '迷茫': StandardEmotion.CONFUSED,
  '不解': StandardEmotion.CONFUSED,
  'confused': StandardEmotion.CONFUSED,
  'puzzled': StandardEmotion.CONFUSED,

  // 害羞情绪
  '害羞': StandardEmotion.BLUSH,
  '脸红': StandardEmotion.BLUSH,
  'blush': StandardEmotion.BLUSH,
  'shy': StandardEmotion.BLUSH,

  // 受伤情绪
  '受伤': StandardEmotion.HURT,
  '疼痛': StandardEmotion.HURT,
  '痛苦': StandardEmotion.HURT,
  'hurt': StandardEmotion.HURT,
  'pain': StandardEmotion.HURT
};

/**
 * 将用户输入的情绪映射到最接近的标准情绪
 * @param userInput 用户输入的情绪文本
 * @returns 匹配的标准情绪
 */
export function mapEmotion(userInput: string): StandardEmotion {
  if (!userInput) return StandardEmotion.NORMAL;

  // 转换为小写并去除空格
  const normalizedInput = userInput.trim().toLowerCase();

  // 直接查找匹配
  if (emotionMap[normalizedInput]) {
    return emotionMap[normalizedInput];
  }

  // 模糊匹配 - 查找包含输入关键词的情绪
  for (const [key, value] of Object.entries(emotionMap)) {
    if (key.includes(normalizedInput) || normalizedInput.includes(key)) {
      return value;
    }
  }

  // 如果没有找到匹配，返回默认情绪
  return StandardEmotion.NORMAL;
}

/**
 * 获取所有标准情绪的显示名称
 * @returns 标准情绪及其显示名称的映射
 */
export function getStandardEmotions(): { [key: string]: string } {
  return {
    [StandardEmotion.NORMAL]: '正常',
    [StandardEmotion.HAPPY]: '开心',
    [StandardEmotion.SAD]: '悲伤',
    [StandardEmotion.ANGRY]: '生气',
    [StandardEmotion.SURPRISED]: '惊讶',
    [StandardEmotion.CONFUSED]: '困惑',
    [StandardEmotion.BLUSH]: '害羞',
    [StandardEmotion.HURT]: '受伤'
  };
}
