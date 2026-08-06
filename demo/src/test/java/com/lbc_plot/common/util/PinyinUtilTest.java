package com.lbc_plot.common.util;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

/**
 * PinyinUtil 单元测试
 */
public class PinyinUtilTest {

    @Test
    public void testPureChinese() {
        assertEquals("geligaoer", PinyinUtil.toPinyin("格里高尔"));
        assertEquals("luojia", PinyinUtil.toPinyin("罗佳"));
    }

    @Test
    public void testMixedChineseEnglish() {
        assertEquals("testgeligaoer", PinyinUtil.toPinyin("Test格里高尔"));
    }

    @Test
    public void testPureEnglish() {
        assertEquals("gregor", PinyinUtil.toPinyin("Gregor"));
    }

    @Test
    public void testWithSpaces() {
        assertEquals("geligaoer", PinyinUtil.toPinyin("格里 高尔"));
    }

    @Test
    public void testWithPunctuation() {
        assertEquals("geligaoer", PinyinUtil.toPinyin("格里高尔！"));
    }

    @Test
    public void testEmpty() {
        assertEquals("", PinyinUtil.toPinyin(""));
    }

    @Test
    public void testNull() {
        assertEquals("", PinyinUtil.toPinyin(null));
    }

    @Test
    public void testWithNumbers() {
        assertEquals("geligaoer123", PinyinUtil.toPinyin("格里高尔123"));
    }
}
