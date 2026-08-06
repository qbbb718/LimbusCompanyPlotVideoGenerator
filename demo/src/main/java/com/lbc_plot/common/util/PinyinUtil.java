package com.lbc_plot.common.util;

import net.sourceforge.pinyin4j.PinyinHelper;
import net.sourceforge.pinyin4j.format.HanyuPinyinCaseType;
import net.sourceforge.pinyin4j.format.HanyuPinyinOutputFormat;
import net.sourceforge.pinyin4j.format.HanyuPinyinToneType;
import net.sourceforge.pinyin4j.format.exception.BadHanyuPinyinOutputFormatCombination;

/**
 * 中文转拼音工具类
 * 将中文字符转换为纯小写无音标的拼音串，用于生成安全的文件目录名
 */
public class PinyinUtil {

    private static final HanyuPinyinOutputFormat FORMAT = new HanyuPinyinOutputFormat();

    static {
        FORMAT.setCaseType(HanyuPinyinCaseType.LOWERCASE);
        FORMAT.setToneType(HanyuPinyinToneType.WITHOUT_TONE);
    }

    /**
     * 将中文字符串转换为拼音
     * 规则：
     * - 中文字符 → 拼音（小写、无音调），多音字取第一个读音
     * - 英文字母/数字 → 原样保留并转小写
     * - 空格、标点、特殊符号 → 移除
     *
     * @param chinese 中文输入字符串
     * @return 纯小写拼音串，如 "格里高尔" → "geligaoer"
     */
    public static String toPinyin(String chinese) {
        if (chinese == null || chinese.isEmpty()) {
            return "";
        }

        StringBuilder result = new StringBuilder();
        for (char c : chinese.toCharArray()) {
            // 中文字符范围
            if (c >= '\u4e00' && c <= '\u9fa5') {
                try {
                    String[] pinyinArray = PinyinHelper.toHanyuPinyinStringArray(c, FORMAT);
                    if (pinyinArray != null && pinyinArray.length > 0) {
                        result.append(pinyinArray[0]);
                    }
                } catch (BadHanyuPinyinOutputFormatCombination e) {
                    // 转换失败则跳过该字符
                }
            } else if (Character.isLetterOrDigit(c)) {
                // 英文字母和数字保留，转小写
                result.append(Character.toLowerCase(c));
            }
            // 空格、标点、特殊符号被移除
        }

        return result.toString();
    }
}
