package com.lbc_plot.render.controller;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lbc_plot.common.util.RecordDurationCalculator;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.plot.model.Record;

/**
 * @module 视频渲染 - 时长查询
 * 回答"这条记录在成片里会有多少帧"，并把**构成**一起返回。
 *
 * <h2>为什么需要这个接口</h2>
 * 成片时长 = {@code max(文字, 音频, 动画) + stayFrames}，其中音频时长要探测文件、动画时长要读
 * clip 参数，前端**无法自己算**。没有它，编辑器的时间轴只能拿 {@code record.durationFrames}
 * （一个新建记录时写死的 30）或"max(运镜, 动画结束帧)"来近似，用户拖动动画后看到的长度是错的。
 *
 * <h2>为什么返回分项而不只是总数</h2>
 * 时间轴 UI 要能解释"这条为什么是 315 帧"（音频 240 / 文字 180 / 动画 315 / 停留 75）；
 * 排查"记录莫名变长"时，分项是唯一能看到构成的地方。
 *
 * <p>计算与导出**共用同一个入口**（{@link RecordDurationCalculator#breakdown}），
 * 所以这里答的数就是成片的帧数，不会出现"预览说 315、成片 240"。
 */
@RestController
@RequestMapping("/api/records")
public class RecordDurationController {

    /** 帧率恒为 30（与 {@code ProjectConfig.FRAME_RATE} 一致），不接受调用方覆盖 */
    private static final int FRAME_RATE = ProjectConfig.FRAME_RATE;

    /**
     * 计算一条记录成片时的帧数构成。
     *
     * @param request 记录 + 剧情类型 + 结尾停留帧数
     * @return 分项与总数（都是帧）
     */
    @PostMapping("/duration")
    public DurationResponse duration(@RequestBody DurationRequest request) {
        if (request == null || request.getRecord() == null) {
            throw new IllegalArgumentException("record 不能为空");
        }
        RecordDurationCalculator.DurationBreakdown breakdown = RecordDurationCalculator.breakdown(
                request.getRecord(),
                FRAME_RATE,
                request.isPlot(),
                request.getStayFrames());
        return new DurationResponse(breakdown);
    }

    /** 请求体：与 {@code /records/preview} 同构（多一个 stayFrames） */
    public static class DurationRequest {
        private Record record;
        /** 是否剧情模式：人格故事（false）不渲染立绘，立绘动画不参与时长 */
        private boolean plot = true;
        /** 结尾停留帧数（工程级设置）；缺省与后端默认值一致 */
        private int stayFrames = ProjectConfig.DEFAULT_STAY_FRAMES;

        public Record getRecord() {
            return record;
        }

        public void setRecord(Record record) {
            this.record = record;
        }

        public boolean isPlot() {
            return plot;
        }

        public void setPlot(boolean plot) {
            this.plot = plot;
        }

        public int getStayFrames() {
            return Math.max(0, stayFrames);
        }

        public void setStayFrames(int stayFrames) {
            this.stayFrames = stayFrames;
        }
    }

    /** 响应体：分项 + 总数（全部是帧，30fps） */
    public static class DurationResponse {
        private final int frames;
        private final int audioFrames;
        private final int textFrames;
        private final int animationFrames;
        private final int stayFrames;
        private final int frameRate;

        DurationResponse(RecordDurationCalculator.DurationBreakdown breakdown) {
            this.frames = breakdown.totalFrames();
            this.audioFrames = breakdown.audioFrames();
            this.textFrames = breakdown.textFrames();
            this.animationFrames = breakdown.animationFrames();
            this.stayFrames = breakdown.stayFrames();
            this.frameRate = FRAME_RATE;
        }

        public int getFrames() {
            return frames;
        }

        public int getAudioFrames() {
            return audioFrames;
        }

        public int getTextFrames() {
            return textFrames;
        }

        public int getAnimationFrames() {
            return animationFrames;
        }

        public int getStayFrames() {
            return stayFrames;
        }

        public int getFrameRate() {
            return frameRate;
        }
    }
}
