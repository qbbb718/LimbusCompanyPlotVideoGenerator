// 简单的UUID生成函数
export const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

/**
 * 台词的一行摘要（剧情列表的「对话内容」列 / 时间轴 tooltip 用）。
 *
 * <p>对话内容支持换行（剧情编辑 → 文本 → 对话内容），而列表与 tooltip 都是单行展示：
 * 这里把换行和连续空白压成单个空格，否则单元格会被撑高、tooltip 会多出几行。
 *
 * @param text 台词原文（可为 null / undefined）
 * @param max  最多保留多少个字，超出加省略号
 */
export const dialogueTextSummary = (
  text: string | null | undefined,
  max = 30,
): string => {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.substring(0, max)}...` : flat;
};

/**
 * 台词的「行数 / 字数」（属性面板的换行提示用）。
 *
 * <p>行数按“去掉末尾空白后的文本”算：刚敲下回车那一瞬间不应该立刻多显示一行，
 * 后端保存时也会去掉首尾空白（见 Dialogue.setText），两边口径一致才不会让人以为行数在乱跳。
 * 字数只数看得见的字符（换行不算字），与用户肉眼数的结果对得上。
 */
export const dialogueTextStats = (
  text: string | null | undefined,
): { lines: number; chars: number } => {
  const trimmedEnd = (text ?? '').replace(/\s+$/, '');
  const chars = trimmedEnd.replace(/\n/g, '').trim().length;
  // 空台词不显示“1 行”，由调用方决定要不要展示统计
  const lines = chars === 0 ? 0 : trimmedEnd.split('\n').length;
  return { lines, chars };
};
