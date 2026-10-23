package com.lbc_plot.render.video.anim;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.video.CharacterVisual;
import com.lbc_plot.render.video.TempImageVisual;

/**
 * {@code anim} 字段在记录 JSON 里的往返测试。
 *
 * <p>锁三件事：
 * <ol>
 *   <li>前端把动画写进 {@code chars[i].anim} / {@code tempImages[i].anim} 后，后端能原样读到；</li>
 *   <li><b>没有该字段的旧工程必须得到 null</b>——这是"旧工程导出逐像素不变"的前提，
 *       一旦某个默认值把 anim 变成"非空但恒等"，渲染端就会误以为要逐帧重画；</li>
 *   <li>回写 JSON 时字段不丢，保存工程不会把用户的动画吃掉。</li>
 * </ol>
 */
class AnimationPersistenceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 两个立绘（第一个会抖）+ 一个会呼吸的临时图片 */
    private static final String RECORD_WITH_ANIM = """
            {
              "uuid": "anim-persist",
              "durationFrames": 90,
              "chars": [
                {
                  "chara": { "characterID": "c1", "characterName": "罗佳", "height": 171, "faction": "测试" },
                  "portrait": {
                    "portraitID": "p1", "characterID": "c1", "imagePath": "",
                    "portName": "测试立绘", "faceX": 0, "faceY": 0, "length": 183
                  },
                  "posX": 100, "posY": 200, "adjX": 10, "adjY": -5, "scale": 1.2, "dim": false,
                  "anim": {
                    "version": 1,
                    "timebase": { "unit": "frame", "fps": 30 },
                    "anchor": { "x": 0.5, "y": 1.0 },
                    "clips": [
                      {
                        "id": "c1-shake", "kind": "preset", "preset": "shake",
                        "startFrame": 12, "durationFrames": 60, "loop": "loop",
                        "fadeOutFrames": 6,
                        "params": { "amplitude": 6, "periodFrames": 2, "style": "jitter", "seed": 1337 }
                      },
                      {
                        "id": "c1-move", "kind": "keyframes", "channels": ["x", "y"],
                        "durationFrames": 45, "loop": "once", "onEnd": "hold",
                        "keys": [
                          { "f": 0, "v": { "x": 0, "y": 0 }, "ease": "easeOut" },
                          { "f": 45, "v": { "x": 260, "y": -40 } }
                        ]
                      }
                    ]
                  }
                },
                {
                  "chara": { "characterID": "c2", "characterName": "辛克莱", "height": 160, "faction": "测试" },
                  "portrait": {
                    "portraitID": "p2", "characterID": "c2", "imagePath": "",
                    "portName": "测试立绘", "faceX": 0, "faceY": 0, "length": 183
                  },
                  "posX": 0, "posY": 0, "adjX": 0, "adjY": 0, "scale": 1.0, "dim": true
                }
              ],
              "tempImages": [
                {
                  "uuid": "t1", "imagePath": "projects/temp/images/t1.png",
                  "posX": 0, "posY": 0, "scale": 1.0, "dim": false,
                  "anim": {
                    "version": 1,
                    "clips": [
                      { "id": "t1-breathe", "kind": "preset", "preset": "breathe",
                        "durationFrames": 120, "loop": "loop", "params": { "amplitude": 0.02 } }
                    ]
                  }
                }
              ],
              "bg": [], "effects": [], "audioCommands": []
            }
            """;

    @Test
    @DisplayName("立绘动画：预设 + 关键帧都能原样读回")
    void characterAnimIsReadBack() throws Exception {
        Record record = MAPPER.readValue(RECORD_WITH_ANIM, Record.class);

        CharacterVisual animated = record.getCharacters().get(0);
        SpriteAnimation anim = animated.getAnim();
        assertNotNull(anim, "chars[0].anim 没有读出来");
        assertTrue(animated.isAnimated());
        assertEquals(1, anim.getVersion());
        assertEquals(30, anim.getTimebase().getFps());
        assertEquals(0.5, anim.getAnchor().getX(), 1e-9);
        assertEquals(2, anim.getClips().size());

        AnimationClip shake = anim.getClips().get(0);
        assertEquals(PresetId.SHAKE, shake.presetId());
        assertEquals(12, shake.getStartFrame());
        assertEquals(60, shake.getDurationFrames());
        assertEquals(LoopMode.LOOP, shake.loopMode());
        assertEquals(6, shake.getFadeOutFrames());
        assertEquals(6d, shake.paramDouble("amplitude", -1), 1e-9);
        assertEquals(1337d, shake.paramDouble("seed", -1), 1e-9);
        assertEquals("jitter", shake.paramString("style", ""));
        assertTrue(shake.isInfiniteLoop(), "没写 iterations 的 loop 是无限循环");

        AnimationClip move = anim.getClips().get(1);
        assertTrue(move.isKeyframeClip());
        assertEquals(LoopMode.ONCE, move.loopMode());
        assertEquals("hold", move.getOnEnd());
        assertEquals(2, move.getKeys().size());
        assertEquals(260d, move.getKeys().get(1).getV().getX(), 1e-9);
        assertEquals("easeOut", move.getKeys().get(0).getEase());
    }

    @Test
    @DisplayName("没有 anim 的元素：读回来必须是 null（旧工程逐像素不变的前提）")
    void missingAnimStaysNull() throws Exception {
        Record record = MAPPER.readValue(RECORD_WITH_ANIM, Record.class);

        CharacterVisual plain = record.getCharacters().get(1);
        assertNull(plain.getAnim(), "没写 anim 的元素不能被塞一个默认对象");
        assertFalse(plain.isAnimated());
    }

    @Test
    @DisplayName("临时图片也支持动画；缺 timebase 时不炸（手写/旧数据）")
    void tempImageAnimIsReadBack() throws Exception {
        Record record = MAPPER.readValue(RECORD_WITH_ANIM, Record.class);

        TempImageVisual temp = record.getTempImages().get(0);
        assertNotNull(temp.getAnim());
        assertTrue(temp.isAnimated());
        assertNull(temp.getAnim().getTimebase(), "夹具里没写 timebase，允许为 null");
        assertEquals(PresetId.BREATHE, temp.getAnim().getClips().get(0).presetId());
        assertEquals(0.02d, temp.getAnim().getClips().get(0).paramDouble("amplitude", -1), 1e-9);
    }

    @Test
    @DisplayName("回写 JSON 不丢动画")
    void animSurvivesSerialization() throws Exception {
        Record record = MAPPER.readValue(RECORD_WITH_ANIM, Record.class);
        String json = MAPPER.writeValueAsString(record);
        assertTrue(json.contains("\"anim\""), "序列化后 anim 字段不该消失");

        Record reparsed = MAPPER.readValue(json, Record.class);
        assertEquals(2, reparsed.getCharacters().get(0).getAnim().getClips().size());
        assertEquals(
                record.getCharacters().get(0).getAnim().getClips().get(0).paramDouble("amplitude", 0),
                reparsed.getCharacters().get(0).getAnim().getClips().get(0).paramDouble("amplitude", 0),
                1e-9);
        assertEquals(
                record.getTempImages().get(0).getAnim().getClips().get(0).getDurationFrames(),
                reparsed.getTempImages().get(0).getAnim().getClips().get(0).getDurationFrames());
    }

    @Test
    @DisplayName("整套禁用 / 单条禁用：读得回来但不算会动")
    void disabledAnimIsNotAnimated() throws Exception {
        String disabled = """
                {
                  "uuid": "disabled",
                  "chars": [{
                    "chara": { "characterID": "c1", "characterName": "罗佳", "height": 171, "faction": "测试" },
                    "portrait": { "portraitID": "p1", "characterID": "c1", "imagePath": "",
                                  "portName": "测试立绘", "faceX": 0, "faceY": 0, "length": 183 },
                    "posX": 0, "posY": 0, "adjX": 0, "adjY": 0, "scale": 1.0, "dim": false,
                    "anim": {
                      "enabled": false,
                      "clips": [{ "id": "x", "kind": "preset", "preset": "bounce", "durationFrames": 30 }]
                    }
                  }],
                  "tempImages": [], "bg": [], "effects": [], "audioCommands": []
                }
                """;
        Record record = MAPPER.readValue(disabled, Record.class);
        CharacterVisual visual = record.getCharacters().get(0);
        assertNotNull(visual.getAnim(), "数据要保留（用户可能只是临时关掉）");
        assertFalse(visual.isAnimated(), "关掉之后不该被当成会动");
    }
}
