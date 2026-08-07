package com.lbc_plot.render.engine;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 视频生成进度跟踪器 — 线程安全的 in-memory 存储
 */
public class VideoProgressTracker {
    private static final Map<String, ProgressState> tasks = new ConcurrentHashMap<>();

    private VideoProgressTracker() {}

    /** 创建任务并返回 taskId */
    public static String createTask(int totalRecords) {
        String taskId = "task_" + System.currentTimeMillis();
        ProgressState state = new ProgressState(totalRecords);
        tasks.put(taskId, state);
        return taskId;
    }

    /** 更新进度 */
    public static void updateProgress(String taskId, int stage, int current, int total, String message) {
        ProgressState state = tasks.get(taskId);
        if (state != null) {
            state.stage = stage;
            state.current = current;
            state.total = total;
            state.message = message;
        }
    }

    /** 标记完成 */
    public static void markComplete(String taskId, String outputPath, long elapsedMs) {
        ProgressState state = tasks.get(taskId);
        if (state != null) {
            state.completed = true;
            state.outputPath = outputPath;
            state.elapsedMs = elapsedMs;
        }
    }

    /** 标记失败 */
    public static void markError(String taskId, String error) {
        ProgressState state = tasks.get(taskId);
        if (state != null) {
            state.error = true;
            state.message = error;
        }
    }

    /** 获取进度 */
    public static ProgressState getProgress(String taskId) {
        return tasks.get(taskId);
    }

    /** 清理已完成的任务（可定时调用） */
    public static void cleanup(String taskId) {
        tasks.remove(taskId);
    }

    /** 进度状态 */
    public static class ProgressState {
        public int stage;          // 1=渲染Record, 2=连接视频, 3=音频处理, 4=合并
        public int current;
        public int total;
        public String message;
        public boolean completed;
        public boolean error;
        public String outputPath;
        public long elapsedMs;

        ProgressState(int total) {
            this.stage = 1;
            this.current = 0;
            this.total = total;
            this.message = "准备中...";
        }

        /** 估算百分比 (stage-based: 阶段1占70%, 2占5%, 3占15%, 4占10%) */
        public int getPercent() {
            if (completed) return 100;
            double stageBase = switch (stage) {
                case 1 -> 0.0;
                case 2 -> 0.70;
                case 3 -> 0.75;
                case 4 -> 0.90;
                default -> 0.0;
            };
            double stageWeight = switch (stage) {
                case 1 -> 0.70;
                case 2 -> 0.05;
                case 3 -> 0.15;
                case 4 -> 0.10;
                default -> 0.0;
            };
            double inStage = total > 0 ? (double) current / total : 0;
            return (int) ((stageBase + inStage * stageWeight) * 100);
        }
    }
}
