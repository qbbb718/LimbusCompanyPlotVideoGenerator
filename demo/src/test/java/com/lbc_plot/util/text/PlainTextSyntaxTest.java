package com.lbc_plot.util.text;

import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.plot.parser.PlainTextRecordsParser;
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
 * 验证文字转工程脚本的标点兼容性：
 * 中英冒号（{@code :} / {@code ：}）、中英括号（{@code ()} / {@code （）}）、
 * 中英百分号（{@code %} / {@code ％}）、全角空格，以及情绪标记的识别与回退策略。
 */
public class PlainTextSyntaxTest {

    /** 只认识 Alice / 格里高尔的 CharacterService mock。 */
    private CharacterService mockService() {
        CharacterService svc = Mockito.mock(CharacterService.class);
        MyCharacter alice = MyCharacter.builder().characterID("alice-id").characterName("Alice").build();
        Portrait portrait = Portrait.builder("alice.png").portraitID("p1").characterID("alice-id").build();
        MyCharacter gregor = MyCharacter.builder().characterID("gregor-id").characterName("格里高尔").build();
        Portrait gregorPortrait = Portrait.builder("gregor.png").portraitID("p2").characterID("gregor-id").build();

        when(svc.searchCharactersByName("Alice")).thenReturn(List.of(alice));
        when(svc.searchCharactersByName("格里高尔")).thenReturn(List.of(gregor));
        when(svc.findPortraitByEmotion(anyString(), anyString())).thenReturn(null);
        when(svc.getDefaultPortrait(alice)).thenReturn(portrait);
        when(svc.getDefaultPortrait(gregor)).thenReturn(gregorPortrait);
        return svc;
    }

    private List<Record> parse(String content) throws IOException {
        Path tmp = Files.createTempFile("syntax-script", ".txt");
        Files.writeString(tmp, content);
        return PlainTextRecordsParser.parse(tmp, mockService());
    }

    // ---------------------------------------------------------------- 冒号

    @Test
    public void testChineseColon_speakerLine() throws IOException {
        List<Record> records = parse("Alice：中文冒号(happy)\n");

        assertEquals(1, records.size());
        Dialogue d = records.get(0).getDialogue();
        assertEquals("Alice", d.getSpeakerName(), "全角冒号前的说话人应被识别");
        assertEquals("中文冒号", d.getText(), "冒号后的正文不应包含说话人");
        assertEquals(Dialogue.Emotion.HAPPY, d.getEmotion());
        assertEquals(1, records.get(0).getCharacters().size(), "应能解析出立绘");
    }

    @Test
    public void testChineseColon_narrator() throws IOException {
        List<Record> records = parse("旁白：诶呀。\n");

        assertEquals(1, records.size());
        Dialogue d = records.get(0).getDialogue();
        assertTrue(d.isNarrator(), "全角冒号的“旁白：”应被判定为旁白");
        assertEquals("诶呀。", d.getText(), "正文中不应残留“旁白：”");
    }

    @Test
    public void testAsciiColon_stillWorks() throws IOException {
        // 回归：原有半角冒号写法不受影响
        List<Record> records = parse("Alice: 半角冒号\n");

        assertEquals("Alice", records.get(0).getDialogue().getSpeakerName());
        assertEquals("半角冒号", records.get(0).getDialogue().getText());
    }

    @Test
    public void testColonInsideDialogue_isKept() throws IOException {
        // 正文里出现冒号时，只按第一个冒号切分说话人
        List<Record> records = parse("Alice: 他说：你好\n");

        assertEquals("Alice", records.get(0).getDialogue().getSpeakerName());
        assertEquals("他说：你好", records.get(0).getDialogue().getText());
    }

    // ---------------------------------------------------------------- 情绪括号

    @Test
    public void testChineseParentheses_emotion() throws IOException {
        List<Record> records = parse("Alice: 中文括号情绪（HAPPY）\n");

        Dialogue d = records.get(0).getDialogue();
        assertEquals("中文括号情绪", d.getText(), "情绪标记不应残留于正文");
        assertEquals(Dialogue.Emotion.HAPPY, d.getEmotion());
    }

    @Test
    public void testAsciiParentheses_emotion() throws IOException {
        // 回归：原有半角括号写法不受影响
        List<Record> records = parse("Alice: 半角括号情绪(ANGRY)\n");

        Dialogue d = records.get(0).getDialogue();
        assertEquals("半角括号情绪", d.getText());
        assertEquals(Dialogue.Emotion.ANGRY, d.getEmotion());
    }

    @Test
    public void testChineseEmotionDisplayName() throws IOException {
        // 情绪可以用资源库里的中文显示名
        assertEquals(Dialogue.Emotion.HAPPY, parse("Alice: 开心（开心）\n").get(0).getDialogue().getEmotion());
        assertEquals(Dialogue.Emotion.SAD, parse("Alice: 悲伤（悲伤）\n").get(0).getDialogue().getEmotion());
        assertEquals(Dialogue.Emotion.BLUSH, parse("Alice: 害羞(害羞)\n").get(0).getDialogue().getEmotion());
    }

    @Test
    public void testEmotionIsCaseInsensitive() throws IOException {
        assertEquals(Dialogue.Emotion.SURPRISED,
                parse("Alice: 大小写(sUrPrIsEd)\n").get(0).getDialogue().getEmotion());
    }

    @Test
    public void testEmotionOnlyLine_fallsBackToDefaultText() throws IOException {
        // 整行只有情绪标记时，正文回退到默认文本而不是残留 "(HAPPY)"
        Dialogue d = parse("Alice: （HAPPY）\n").get(0).getDialogue();

        assertEquals(Dialogue.DEFAULT_TEXT, d.getText());
        assertEquals(Dialogue.Emotion.HAPPY, d.getEmotion());
    }

    // ------------------------------------------------- 非情绪括号内容不应被吞掉

    @Test
    public void testNonEmotionParenthetical_isKeptInText() throws IOException {
        // 中文括号里是舞台提示而非情绪：必须保留在台词里
        assertEquals("我累了（叹气）", parse("Alice: 我累了（叹气）\n").get(0).getDialogue().getText());
        assertEquals("我累了(叹气)", parse("Alice: 我累了(叹气)\n").get(0).getDialogue().getText());
        assertEquals("他笑了（小声）", parse("Alice: 他笑了（小声）\n").get(0).getDialogue().getText());
    }

    @Test
    public void testUnknownAsciiEmotionToken_isStripped() throws IOException {
        // 纯英文但拼错（如 NOLMAL）：视为写错的情绪标记，剥掉后走 NLP/默认情绪
        Dialogue d = parse("Alice: 嘿，老兄(NOLMAL)\n").get(0).getDialogue();

        assertEquals("嘿，老兄", d.getText(), "拼错的英文情绪标记应从正文剥离");
    }

    // ---------------------------------------------------------------- 空白

    @Test
    public void testFullWidthSpacesAreTrimmed() throws IOException {
        // 行首/行尾的全角空格（U+3000）不应影响解析
        List<Record> records = parse("\u3000旁白：诶呀。\u3000\n");

        Dialogue d = records.get(0).getDialogue();
        assertTrue(d.isNarrator(), "行首全角空格不应被当成说话人名字的一部分");
        assertEquals("诶呀。", d.getText());
    }

    @Test
    public void testFullWidthSpaceBetweenSpeakerAndColon() throws IOException {
        // 说话人与冒号之间的全角空格也不应留在说话人名字里
        List<Record> records = parse("旁白\u3000：诶呀。\n");

        assertTrue(records.get(0).getDialogue().isNarrator());
        assertEquals("诶呀。", records.get(0).getDialogue().getText());
    }

    @Test
    public void testBlankAndUnknownLines() throws IOException {
        // 空行被忽略；无法识别的行整体作为旁白文本
        List<Record> records = parse("\n   \n就是一段没有说话人的旁白。\n");

        assertEquals(1, records.size());
        Dialogue d = records.get(0).getDialogue();
        assertTrue(d.isNarrator());
        assertEquals("就是一段没有说话人的旁白。", d.getText());
    }

    // ---------------------------------------------------------------- 组合

    @Test
    public void testMixedPunctuation_fullLine() throws IOException {
        // 全角冒号 + 全角括号 + 全角百分号混写
        List<Record> records = parse("Alice：（HAPPY）％75％\n");

        Dialogue d = records.get(0).getDialogue();
        assertEquals(Dialogue.Emotion.HAPPY, d.getEmotion());
        assertEquals(480, records.get(0).getCharacters().get(0).getAdjX(), "％75％ 应为 +480");
    }

    @Test
    public void testDocumentedExample_endToEnd() throws IOException {
        // 界面“格式说明”里的示例脚本应能完整解析
        List<Record> records = parse("[巴士内部BGM]\n"
                + "{不xx就出不去的房间}\n"
                + "格里高尔: ……(ANGRY)%70%\n"
                + "[-STOP]\n"
                + "旁白: 诶呀。\n");

        // [BGM] / {背景} / [-STOP] 指令行不单独生成 record
        assertEquals(2, records.size());

        Record first = records.get(0);
        assertEquals("格里高尔", first.getDialogue().getSpeakerName());
        assertEquals("……", first.getDialogue().getText(), "情绪与位置标记都不应残留于正文");
        assertEquals(Dialogue.Emotion.ANGRY, first.getDialogue().getEmotion());
        assertEquals(384, first.getCharacters().get(0).getAdjX(), "(70-50)*1920/100 = 384");

        Record second = records.get(1);
        assertTrue(second.getDialogue().isNarrator());
        assertEquals("诶呀。", second.getDialogue().getText());
        assertEquals(1, second.getCharacters().size(), "旁白应继承上一条的立绘");
        assertTrue(second.getCharacters().get(0).isDim(), "旁白时立绘应压暗");
    }
}
