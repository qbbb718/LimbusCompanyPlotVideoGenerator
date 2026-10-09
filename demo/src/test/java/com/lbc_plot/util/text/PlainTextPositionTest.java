package com.lbc_plot.util.text;

import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.plot.parser.PlainTextRecordsParser;
import com.lbc_plot.render.video.CharacterVisual;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;
import com.lbc_plot.resource.service.CharacterService;

import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * 验证 "说话人: 对话内容(情绪)%位置%" 中 %位置% 的解析：
 * 位置为画面横向百分比（%0% 最左 / %50% 居中 / %100% 最右），换算为 CharacterVisual 的 adjX。
 * 旧的 &lt;位置&gt; 写法已废弃，不再识别。
 */
public class PlainTextPositionTest {

    /**
     * 构造一个只认识 Alice / Bob 的 CharacterService mock。
     */
    private CharacterService mockService() {
        CharacterService svc = Mockito.mock(CharacterService.class);
        MyCharacter alice = MyCharacter.builder().characterID("alice-id").characterName("Alice").build();
        MyCharacter bob = MyCharacter.builder().characterID("bob-id").characterName("Bob").build();
        Portrait alicePortrait = Portrait.builder("alice.png").portraitID("p1").characterID("alice-id").build();
        Portrait bobPortrait = Portrait.builder("bob.png").portraitID("p2").characterID("bob-id").build();

        when(svc.searchCharactersByName("Alice")).thenReturn(List.of(alice));
        when(svc.searchCharactersByName("Bob")).thenReturn(List.of(bob));
        when(svc.findPortraitByEmotion(anyString(), anyString())).thenReturn(null);
        when(svc.getDefaultPortrait(alice)).thenReturn(alicePortrait);
        when(svc.getDefaultPortrait(bob)).thenReturn(bobPortrait);
        return svc;
    }

    /**
     * 取出指定说话人第 occurrence 条（从 0 开始）record 的第一个立绘。
     */
    private CharacterVisual visualOf(List<Record> records, String speakerName, int occurrence) {
        assertNotNull(records, "解析结果不应为 null");
        int seen = 0;
        for (Record r : records) {
            if (r.getDialogue() != null && speakerName.equals(r.getDialogue().getSpeakerName())) {
                if (seen == occurrence) {
                    assertNotNull(r.getCharacters(), "说话人应带有立绘");
                    assertFalse(r.getCharacters().isEmpty(), "说话人应带有立绘");
                    return r.getCharacters().get(0);
                }
                seen++;
            }
        }
        return null;
    }

    /**
     * 取出指定说话人第一条 record 的第一个立绘。
     */
    private CharacterVisual firstVisualOf(List<Record> records, String speakerName) {
        return visualOf(records, speakerName, 0);
    }

    private List<Record> parse(String content) throws IOException {
        Path tmp = Files.createTempFile("position-script", ".txt");
        Files.writeString(tmp, content);
        return PlainTextRecordsParser.parse(tmp, mockService());
    }

    @Test
    public void testParsePositionTag_mapsPercentToAdjX() throws IOException {
        String content = "Alice: 我站左边(HAPPY)%0%\n"
                + "Bob: 我在中间%50%\n"
                + "Alice: 我靠右%75%\n"
                + "Bob: 没说位置\n";

        List<Record> records = parse(content);
        assertEquals(4, records.size(), "应生成 4 条记录");

        // %0% → adjX = -VIDEO_WIDTH/2
        CharacterVisual left = firstVisualOf(records, "Alice");
        assertNotNull(left, "应能取到 Alice 的立绘");
        assertEquals(-ProjectConfig.VIDEO_WIDTH / 2, left.getAdjX(), "0% 应为最左");

        // %50% → adjX = 0（居中）
        CharacterVisual center = firstVisualOf(records, "Bob");
        assertNotNull(center, "应能取到 Bob 的立绘");
        assertEquals(0, center.getAdjX(), "50% 应居中");

        // %75% → adjX = (75-50)*1920/100 = 480
        CharacterVisual right = visualOf(records, "Alice", 1);
        assertNotNull(right, "应能取到 Alice 的第二个立绘");
        assertEquals(480, right.getAdjX(), "75% 应为 +480");
    }

    @Test
    public void testParsePositionTag_positionBeforeEmotion() throws IOException {
        // 位置标记在情绪之前也应能识别
        String content = "Alice: 先位置后情绪%25%(ANGRY)\n";

        List<Record> records = parse(content);
        assertEquals(1, records.size());

        Record rec = records.get(0);
        assertEquals("先位置后情绪", rec.getDialogue().getText(), "位置与情绪标记都不应残留于正文");
        assertEquals(com.lbc_plot.plot.model.Dialogue.Emotion.ANGRY, rec.getDialogue().getEmotion());
        assertNotNull(rec.getCharacters());
        assertEquals(1, rec.getCharacters().size());
        // (25-50)*1920/100 = -480
        assertEquals(-480, rec.getCharacters().get(0).getAdjX(), "25% 应为 -480");
    }

    @Test
    public void testParsePositionTag_absentKeepsCentered() throws IOException {
        // 不写位置时保持默认居中
        List<Record> records = parse("Alice: 默认居中\n");
        assertEquals(1, records.size());

        assertEquals("默认居中", records.get(0).getDialogue().getText());
        assertEquals(0, records.get(0).getCharacters().get(0).getAdjX(), "未写位置应保持 adjX=0");
    }

    @Test
    public void testParsePositionTag_fullRange() throws IOException {
        // 0% 最左，100% 最右
        List<Record> records = parse("Alice: 最左%0%\nBob: 最右%100%\n");
        assertEquals(2, records.size());

        int half = ProjectConfig.VIDEO_WIDTH / 2;
        assertEquals(-half, records.get(0).getCharacters().get(0).getAdjX(), "0% 应为最左");
        assertEquals(half, records.get(1).getCharacters().get(0).getAdjX(), "100% 应为最右");
    }

    @Test
    public void testParsePositionTag_decimalPercent() throws IOException {
        // 支持小数百分比：37.5% → (37.5-50)*1920/100 = -240
        List<Record> records = parse("Alice: 小数位置%37.5%(HAPPY)\n");
        assertEquals(1, records.size());

        Record rec = records.get(0);
        assertEquals("小数位置", rec.getDialogue().getText(), "位置与情绪标记都不应残留于正文");
        assertEquals(com.lbc_plot.plot.model.Dialogue.Emotion.HAPPY, rec.getDialogue().getEmotion());
        assertEquals(-240, rec.getCharacters().get(0).getAdjX(), "37.5% 应为 -240");
    }

    @Test
    public void testParsePositionTag_fullWidthPercent() throws IOException {
        // 全角百分号 ％100％ 与半角等价（中文输入法下很常见）
        List<Record> records = parse("Alice: 全角位置％100％\n");
        assertEquals(1, records.size());

        assertEquals("全角位置", records.get(0).getDialogue().getText(), "全角标记不应残留于正文");
        assertEquals(ProjectConfig.VIDEO_WIDTH / 2, records.get(0).getCharacters().get(0).getAdjX());
    }

    @Test
    public void testParsePositionTag_legacyAngleBracketIsPlainText() throws IOException {
        // 旧写法 <位置> 已废弃：既不做位置换算，也原样保留在正文里
        List<Record> records = parse("Alice: 旧写法<70%>已废弃\n");
        assertEquals(1, records.size());

        Record rec = records.get(0);
        assertEquals("旧写法<70%>已废弃", rec.getDialogue().getText(), "旧标记应原样保留为正文");
        assertEquals(0, rec.getCharacters().get(0).getAdjX(), "不应应用位置");
    }

    @Test
    public void testParsePositionTag_singlePercentIsPlainText() throws IOException {
        // 只出现一个 % 的正文（如 "50%"）不应被当成位置指令
        List<Record> records = parse("Alice: 进度才有50%\n");
        assertEquals(1, records.size());

        assertEquals("进度才有50%", records.get(0).getDialogue().getText(), "正文应原样保留");
        assertEquals(0, records.get(0).getCharacters().get(0).getAdjX(), "不应应用位置");
    }

    @Test
    public void testParsePositionTag_noStraySpaceAfterRemoval() throws IOException {
        // 剥离标记后，中文之间不应插入空格；英文单词之间才补空格
        List<Record> cn = parse("Alice: 他说%50%吧\n");
        assertEquals("他说吧", cn.get(0).getDialogue().getText());

        List<Record> en = PlainTextRecordsParser.parse(
                Files.writeString(Files.createTempFile("position-en", ".txt"), "Alice: Hello%50%world\n"),
                mockService());
        assertEquals("Hello world", en.get(0).getDialogue().getText());
    }
}
