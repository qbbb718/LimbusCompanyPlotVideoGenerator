package com.lbc_plot.application.Composer.model;

import java.util.Map;

// 速度值处理：值越大显示越快（更符合直觉）
public class DialogueSpeed {
    // 速度值映射到每帧显示的字符数
    private static final Map<Integer, Double> SPEED_MAP = Map.of(
        1, 0.3,  // 很慢：每帧0.3个字符
        2, 0.5,  // 慢
        3, 0.8,  // 中等
        4, 1.2,  // 快
        5, 2.0,  // 很快：每帧2个字符
        6, 3.0   // 极快
    );
    
    public static double getCharactersPerFrame(int speed) {
        return SPEED_MAP.getOrDefault(speed, 1.0);
    }
    
    // 或者更简单：速度值直接作为除数
    public static int getFramesPerCharacter(int speed) {
        // 速度1: 每字符4帧, 速度5: 每字符1帧
        return Math.max(1, 5 - speed + 1);
    }
}