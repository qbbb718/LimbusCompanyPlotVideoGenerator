package com.lbc_plot.render.engine.contract;

import java.awt.Color;

public interface TextLayerOperations {
    void addLocationText(String text);

    void addCharacterNameText(String text, Color color);

    void addFactionText(String text);

    void addDialogueTextLeft(String text);

    void addDialogueTextCenter(String text);

    /**
     * 添加"自由文本"对话文字图层：字体/字号与旁白一致，文字块锚定在指定中心点。
     *
     * @param text    对话内容
     * @param bold    是否加粗
     * @param italic  是否斜体
     * @param color   文字颜色（为空/非法时由调用方传入默认文字颜色）
     * @param centerX 文字块中心 X（设计画布像素）
     * @param centerY 文字块中心 Y（设计画布像素）
     */
    void addDialogueTextFreeText(String text, boolean bold, boolean italic, Color color,
            int centerX, int centerY);
}